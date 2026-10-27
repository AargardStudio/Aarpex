/**
 * Aargard Connect - AarPex adapter (v1).
 *
 *   /api/connect/v1/...      public machine API, authenticated by an API key
 *                            (Authorization: Bearer agc_live_...). Keys are
 *                            bound to ONE workspace and a list of scopes.
 *   /api/connect-admin/...   browser API (signed-in workspace admins) to create,
 *                            rotate, edit and revoke keys and read usage.
 *
 * This is AarPex's own compatible integration layer. It does not assume the
 * central Aargard Connect Core exists; GET /api/connect/v1/capabilities is the
 * registration contract Core can read when it is deployed.
 *
 * Security notes
 *  - Keys: 32 random bytes (base64url) after a recognisable prefix; only the
 *    SHA-256 hash is stored, the full key is shown once. RLS is on with no
 *    policies for every connect_* table (server-only).
 *  - Keys never grant admin or team management; scopes are per resource.
 *  - Every query is filtered by the key's tenant; foreign references in write
 *    bodies (pipeline_id, deal_id, ...) are checked to belong to that tenant.
 *  - No CORS headers: keys must stay server-side, never in a browser bundle.
 */
import crypto from "crypto";
import type express from "express";
import { ENTITIES, pub, sha256, token, newId, nowIso, type EntityDef } from "./integrationApi";

const BASE = "/api/connect/v1";
const ADMIN = "/api/connect-admin";
const API_VERSION = "1.0.0";
const KEY_PREFIX = "agc_live_";
const RATE_PER_MIN = Math.max(10, Number(process.env.CONNECT_RATE_PER_MIN) || 60);
const MAX_ACTIVE_KEYS = Math.max(1, Number(process.env.CONNECT_MAX_KEYS) || 10);

// ---------------------------------------------------------------------------
// Capability registry: only resources that have working backend code today.
// ---------------------------------------------------------------------------
interface Resource {
  key: string; // path segment and ENTITIES key
  title: string;
  description: string;
  events: string[];
  refs: Record<string, string>; // body field -> table whose rows must belong to the same tenant
}
const RESOURCES: Resource[] = [
  { key: "leads", title: "Leads", description: "People and businesses you are prospecting (AarPex's contact record).", events: ["aarpex.lead.created", "aarpex.lead.updated", "aarpex.lead.deleted"], refs: {} },
  { key: "deals", title: "Deals", description: "Sales opportunities moving through a pipeline.", events: ["aarpex.deal.created", "aarpex.deal.updated", "aarpex.deal.deleted"], refs: { pipeline_id: "pipelines" } },
  { key: "pipelines", title: "Pipelines", description: "Sales pipelines and their stages.", events: [], refs: {} },
  { key: "tasks", title: "Tasks", description: "Follow-ups and to-dos.", events: ["aarpex.task.created", "aarpex.task.updated", "aarpex.task.deleted"], refs: { deal_id: "deals" } },
  { key: "activities", title: "Activities", description: "Calls, notes, emails and meetings logged against deals and leads.", events: ["aarpex.activity.created", "aarpex.activity.updated", "aarpex.activity.deleted"], refs: { deal_id: "deals", lead_id: "leads" } },
  { key: "groups", title: "Lead groups", description: "Named groups used to organise leads.", events: [], refs: {} },
];
const RESOURCE_BY_KEY = Object.fromEntries(RESOURCES.map((r) => [r.key, r]));
export const CONNECT_SCOPES: { scope: string; label: string; description: string }[] = RESOURCES.flatMap((r) => [
  { scope: `${r.key}:read`, label: `Read ${r.title.toLowerCase()}`, description: `List and view ${r.title.toLowerCase()}.` },
  { scope: `${r.key}:write`, label: `Change ${r.title.toLowerCase()}`, description: `Create, edit and delete ${r.title.toLowerCase()}. Deleting also needs { "confirm": true }.` },
]);
const SCOPE_SET = new Set(CONNECT_SCOPES.map((s) => s.scope));
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
type Req = express.Request & { requestId?: string; key?: any; tenantId?: string; userId?: string; userEmail?: string };

function fail(req: Req, res: express.Response, status: number, code: string, message: string, extra?: any) {
  return res.status(status).json({ error: { code, message, ...(extra || {}) }, request_id: req.requestId });
}

const hits = new Map<string, number[]>(); // per server instance (best effort)
function rate(keyId: string): { limited: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const arr = (hits.get(keyId) || []).filter((t) => now - t < 60_000);
  const limited = arr.length >= RATE_PER_MIN;
  if (!limited) arr.push(now);
  hits.set(keyId, arr);
  return { limited, remaining: Math.max(0, RATE_PER_MIN - arr.length), resetIn: arr.length ? Math.ceil((60_000 - (now - arr[0])) / 1000) : 60 };
}

export function registerConnectApi(
  app: express.Express,
  getSupabase: () => any,
  emitSoon: (tenantId: string, event: string, data: any) => Promise<void>
) {
  const db = () => {
    const s = getSupabase();
    if (!s) throw Object.assign(new Error("Database not configured"), { status: 503, code: "unavailable" });
    return s;
  };

  async function audit(tenantId: string, keyId: string | null, actor: string, action: string, entity: string | null, entityId: string | null, requestId?: string, detail?: any, touchData = false) {
    try {
      await db().from("connect_audit_logs").insert({ id: newId(), tenant_id: tenantId, key_id: keyId, actor, action, entity, entity_id: entityId, request_id: requestId, detail: detail ?? null });
      // Tell open browsers to refresh their copy of workspace data.
      if (touchData) await db().from("tenants").update({ integration_changed_at: nowIso() }).eq("id", tenantId);
    } catch (err) {
      console.error("[connect] audit failed:", err);
    }
  }

  // ---- request id on every connect response --------------------------------
  app.use(BASE, (req: any, res: any, next: any) => {
    req.requestId = "req_" + token(9);
    res.setHeader("X-Request-Id", req.requestId);
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  // ---- auth + scope + rate limit -------------------------------------------
  const guard =
    (scope: string | null) =>
    async (req: Req, res: express.Response, next: express.NextFunction) => {
      try {
        const h = req.headers.authorization || "";
        const raw = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
        if (!raw) return fail(req, res, 401, "unauthorized", "Missing API key. Send Authorization: Bearer <key>.");
        if (!raw.startsWith(KEY_PREFIX)) return fail(req, res, 401, "invalid_api_key", "API key is invalid or has been revoked.");
        const { data: key } = await db().from("connect_api_keys").select("*").eq("key_hash", sha256(raw)).maybeSingle();
        if (!key || key.status !== "active") return fail(req, res, 401, "invalid_api_key", "API key is invalid or has been revoked.");
        if (key.expires_at && new Date(key.expires_at).getTime() <= Date.now()) return fail(req, res, 401, "key_expired", "This API key has expired. Create or rotate a key in AarPex.");
        const asked = String(req.headers["x-business-id"] || "");
        if (asked && asked !== key.tenant_id) return fail(req, res, 403, "forbidden", "This key is not scoped to that business.");
        const r = rate(key.id);
        res.setHeader("X-RateLimit-Limit", String(RATE_PER_MIN));
        res.setHeader("X-RateLimit-Remaining", String(r.remaining));
        res.setHeader("X-RateLimit-Reset", String(r.resetIn));
        if (r.limited) {
          res.setHeader("Retry-After", String(r.resetIn));
          return fail(req, res, 429, "rate_limited", `Rate limit is ${RATE_PER_MIN} requests/minute per key.`);
        }
        if (scope && !(key.scopes || []).includes(scope)) {
          return fail(req, res, 403, "insufficient_scope", `This key does not have the "${scope}" scope.`, { required_scope: scope });
        }
        req.key = key;
        req.tenantId = key.tenant_id;
        res.on("finish", () => {
          void db().rpc("connect_usage_bump", { p_key: key.id, p_tenant: key.tenant_id, p_error: res.statusCode >= 400 });
        });
        return next();
      } catch (err: any) {
        return fail(req, res, err?.status || 500, err?.code || "server_error", err?.message || "Server error");
      }
    };

  const wrap =
    (fn: (req: Req, res: express.Response) => Promise<any>) =>
    async (req: Req, res: express.Response) => {
      try {
        await fn(req, res);
      } catch (err: any) {
        console.error("[connect] error:", err);
        if (!res.headersSent) fail(req, res, err?.status || 500, err?.code || "server_error", err?.message || "Server error");
      }
    };

  // ---- unauthenticated discovery -------------------------------------------
  app.get(`${BASE}/health`, (req: any, res) => res.json({ status: "ok", app: "aarpex", api_version: API_VERSION, request_id: req.requestId }));

  const capabilities = () => ({
    app: { id: "aarpex", name: "AarPex", description: "CRM, sales pipeline and sales intelligence" },
    api_version: API_VERSION,
    base_path: BASE,
    authentication: { type: "bearer", header: "Authorization: Bearer <key>", key_prefix: KEY_PREFIX, keys_are_workspace_bound: true },
    rate_limit: { requests_per_minute_per_key: RATE_PER_MIN, headers: ["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset", "Retry-After"] },
    conventions: {
      pagination: "?page=1&per_page=50 (max 100); response includes pagination { page, per_page, total, has_more }",
      sorting: "?sort=created_at|updated_at&order=asc|desc (default created_at desc)",
      filtering: "per-resource equality filters, ?q= text search, ?updated_since=<ISO time>",
      idempotency: "POST accepts an Idempotency-Key header; a repeat with the same key and body returns the first response",
      deletes: 'DELETE needs { "confirm": true } (or ?confirm=true); repeating a delete is a no-op',
      errors: '{ "error": { "code", "message" }, "request_id" }',
      unknown_fields: "rejected with 400 invalid_request",
    },
    scopes: CONNECT_SCOPES,
    resources: RESOURCES.map((r) => {
      const d: EntityDef = ENTITIES[r.key];
      return {
        key: r.key,
        title: r.title,
        description: r.description,
        endpoints: [
          { method: "GET", path: `${BASE}/${r.key}`, scope: `${r.key}:read`, summary: `List ${r.title.toLowerCase()}` },
          { method: "GET", path: `${BASE}/${r.key}/{id}`, scope: `${r.key}:read`, summary: "Get one" },
          { method: "POST", path: `${BASE}/${r.key}`, scope: `${r.key}:write`, summary: "Create" },
          { method: "PATCH", path: `${BASE}/${r.key}/{id}`, scope: `${r.key}:write`, summary: "Update" },
          { method: "DELETE", path: `${BASE}/${r.key}/{id}`, scope: `${r.key}:write`, summary: "Delete (confirm required)" },
        ],
        fields: { writable: d.writable, required: d.required },
        filters: [...d.filters, ...(r.key === "leads" ? ["group_id"] : [])],
        search: d.search || [],
        webhook_events: r.events,
      };
    }),
    central_registration: { status: "not_registered", note: "Aargard Connect Core is not deployed; this document is the contract Core can read once it is." },
  });
  app.get(`${BASE}/capabilities`, (_req, res) => res.json(capabilities()));
  app.get(`${BASE}/.well-known/aargard-connect`, (_req, res) => res.json(capabilities()));

  app.get(
    `${BASE}/me`,
    guard(null) as any,
    wrap(async (req, res) => {
      const k = req.key;
      const { data: t } = await db().from("tenants").select("name, company_name").eq("id", k.tenant_id).maybeSingle();
      res.json({ data: { key_id: k.id, key_name: k.name, key_prefix: k.key_prefix, scopes: k.scopes, expires_at: k.expires_at, business_id: k.tenant_id, business_name: t?.company_name || t?.name || "" }, request_id: req.requestId });
    })
  );

  // ---- resource endpoints ---------------------------------------------------
  async function checkRefs(req: Req, res: express.Response, r: Resource, vals: Record<string, any>): Promise<boolean> {
    const bad = (msg: string) => {
      fail(req, res, 400, "invalid_reference", msg);
      return false;
    };
    for (const [field, table] of Object.entries(r.refs)) {
      const v = vals[field];
      if (v === undefined || v === null || v === "") continue;
      if (typeof v !== "string" || !ID_RE.test(v)) return bad(`${field} must be an id.`);
      const { data } = await db().from(table).select("id").eq("tenant_id", req.tenantId).eq("id", v).maybeSingle();
      if (!data) return bad(`${field} does not match a record in this workspace.`);
    }
    if (r.key === "leads" && vals.group_ids !== undefined) {
      const ids = vals.group_ids;
      if (!Array.isArray(ids) || ids.some((g: any) => typeof g !== "string" || !ID_RE.test(g))) return bad("group_ids must be an array of group ids.");
      if (ids.length) {
        const { data } = await db().from("lead_groups").select("id").eq("tenant_id", req.tenantId).in("id", ids);
        if ((data || []).length !== new Set(ids).size) return bad("group_ids contains a group that is not in this workspace.");
      }
    }
    return true;
  }

  function pickStrict(req: Req, res: express.Response, def: EntityDef, body: any, allowId: boolean): Record<string, any> | null {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      fail(req, res, 400, "invalid_request", "Request body must be a JSON object.");
      return null;
    }
    const unknown = Object.keys(body).filter((k) => !def.writable.includes(k) && !(allowId && k === "id") && k !== "confirm");
    if (unknown.length) {
      fail(req, res, 400, "invalid_request", `Unknown field(s): ${unknown.join(", ")}. Writable fields: ${def.writable.join(", ")}.`);
      return null;
    }
    const out: Record<string, any> = {};
    for (const k of def.writable) if (body[k] !== undefined) out[k] = body[k];
    return out;
  }

  for (const r of RESOURCES) {
    const def = ENTITIES[r.key];
    const read = guard(`${r.key}:read`);
    const write = guard(`${r.key}:write`);
    const actor = (req: Req) => `API key "${req.key?.name}" (${req.key?.key_prefix}...)`;

    app.get(
      `${BASE}/${r.key}`,
      read as any,
      wrap(async (req, res) => {
        const page = Math.max(1, Math.floor(Number(req.query.page)) || 1);
        const per = Math.min(100, Math.max(1, Math.floor(Number(req.query.per_page)) || 50));
        let b = db().from(def.table).select("*", { count: "exact" }).eq("tenant_id", req.tenantId);
        for (const f of def.filters) if (req.query[f] !== undefined && req.query[f] !== "") b = b.eq(f, String(req.query[f]));
        if (r.key === "leads" && req.query.group_id) b = b.contains("group_ids", [String(req.query.group_id)]);
        if (req.query.updated_since) {
          const d = new Date(String(req.query.updated_since));
          if (isNaN(d.getTime())) return fail(req, res, 400, "invalid_request", "updated_since must be an ISO 8601 time.");
          b = b.gte(def.hasUpdatedAt ? "updated_at" : "created_at", d.toISOString());
        }
        if (req.query.q && def.search?.length) {
          const term = String(req.query.q).replace(/[%,()*\\]/g, " ").trim().slice(0, 100);
          if (term) b = b.or(def.search.map((c) => `${c}.ilike.%${term}%`).join(","));
        }
        const sortReq = String(req.query.sort || "created_at");
        const sort = sortReq === "updated_at" && def.hasUpdatedAt ? "updated_at" : "created_at";
        const ascending = String(req.query.order || "desc") === "asc";
        const { data, count, error } = await b.order(sort, { ascending }).range((page - 1) * per, page * per - 1);
        if (error) return fail(req, res, 500, "server_error", "Could not load records.");
        const total = count ?? (data || []).length;
        res.json({ data: (data || []).map(pub), pagination: { page, per_page: per, total, has_more: page * per < total }, request_id: req.requestId });
      })
    );

    app.get(
      `${BASE}/${r.key}/:id`,
      read as any,
      wrap(async (req, res) => {
        const { data } = await db().from(def.table).select("*").eq("tenant_id", req.tenantId).eq("id", req.params.id).maybeSingle();
        if (!data) return fail(req, res, 404, "not_found", `${def.label} not found.`);
        res.json({ data: pub(data), request_id: req.requestId });
      })
    );

    app.post(
      `${BASE}/${r.key}`,
      write as any,
      wrap(async (req, res) => {
        const idem = String(req.headers["idempotency-key"] || "").slice(0, 120);
        const bodyHash = sha256(JSON.stringify(req.body ?? {}));
        if (idem) {
          const { data: prev } = await db().from("connect_idempotency").select("*").eq("key_id", req.key.id).eq("idem_key", idem).maybeSingle();
          if (prev) {
            if (prev.request_hash !== bodyHash) return fail(req, res, 422, "idempotency_conflict", "This Idempotency-Key was already used with a different request body.");
            res.setHeader("Idempotent-Replayed", "true");
            return res.status(prev.status).json(prev.response);
          }
        }
        const picked = pickStrict(req, res, def, req.body, true);
        if (!picked) return;
        const vals = { ...def.defaults(), ...picked };
        for (const k of def.required) if (vals[k] === undefined || vals[k] === null || String(vals[k]).trim() === "") return fail(req, res, 400, "invalid_request", `${k} is required.`);
        if (req.body?.id !== undefined && !(typeof req.body.id === "string" && ID_RE.test(req.body.id))) return fail(req, res, 400, "invalid_request", "id must be 1-64 letters, digits, - or _.");
        if (!(await checkRefs(req, res, r, vals))) return;
        const id = String(req.body?.id || newId());
        const { data, error } = await db().from(def.table).insert({ id, tenant_id: req.tenantId, ...vals }).select("*").single();
        if (error) return error.code === "23505" ? fail(req, res, 409, "conflict", `A ${def.label} with that id already exists.`) : fail(req, res, 400, "invalid_request", "Could not create the record. Check the field values.");
        await audit(req.tenantId!, req.key.id, actor(req), `${def.label}.create`, def.table, id, req.requestId, { fields: Object.keys(vals) }, true);
        if (def.eventPrefix) await emitSoon(req.tenantId!, `${def.eventPrefix}.created`, pub(data));
        const payload = { data: pub(data), request_id: req.requestId };
        if (idem) await db().from("connect_idempotency").insert({ key_id: req.key.id, idem_key: idem, request_hash: bodyHash, status: 201, response: payload });
        res.status(201).json(payload);
      })
    );

    app.patch(
      `${BASE}/${r.key}/:id`,
      write as any,
      wrap(async (req, res) => {
        const vals = pickStrict(req, res, def, req.body, false);
        if (!vals) return;
        if (Object.keys(vals).length === 0) return fail(req, res, 400, "invalid_request", `No editable fields supplied. Editable: ${def.writable.join(", ")}.`);
        for (const k of def.required) if (k in vals && String(vals[k] ?? "").trim() === "") return fail(req, res, 400, "invalid_request", `${k} cannot be empty.`);
        if (!(await checkRefs(req, res, r, vals))) return;
        if (def.hasUpdatedAt) vals.updated_at = nowIso();
        const { data, error } = await db().from(def.table).update(vals).eq("tenant_id", req.tenantId).eq("id", req.params.id).select("*").maybeSingle();
        if (error) return fail(req, res, 400, "invalid_request", "Could not update the record. Check the field values.");
        if (!data) return fail(req, res, 404, "not_found", `${def.label} not found.`);
        await audit(req.tenantId!, req.key.id, actor(req), `${def.label}.update`, def.table, req.params.id, req.requestId, { fields: Object.keys(vals) }, true);
        if (def.eventPrefix) await emitSoon(req.tenantId!, `${def.eventPrefix}.updated`, pub(data));
        res.json({ data: pub(data), request_id: req.requestId });
      })
    );

    app.delete(
      `${BASE}/${r.key}/:id`,
      write as any,
      wrap(async (req, res) => {
        const confirmed = req.body?.confirm === true || String(req.query.confirm) === "true";
        if (!confirmed) return fail(req, res, 400, "confirmation_required", 'Deleting is irreversible. Send { "confirm": true } or ?confirm=true.');
        const { data: existing } = await db().from(def.table).select("*").eq("tenant_id", req.tenantId).eq("id", req.params.id).maybeSingle();
        if (!existing) return res.json({ data: { id: req.params.id, deleted: true, already_deleted: true }, request_id: req.requestId });
        const { error } = await db().from(def.table).delete().eq("tenant_id", req.tenantId).eq("id", req.params.id);
        if (error) return fail(req, res, 400, "invalid_request", "Could not delete the record.");
        await audit(req.tenantId!, req.key.id, actor(req), `${def.label}.delete`, def.table, req.params.id, req.requestId, { snapshot: pub(existing) }, true);
        if (def.eventPrefix) await emitSoon(req.tenantId!, `${def.eventPrefix}.deleted`, { id: req.params.id });
        res.json({ data: { id: req.params.id, deleted: true }, request_id: req.requestId });
      })
    );
  }

  // Unknown /api/connect/v1 routes: consistent JSON 404.
  app.use(BASE, (req: any, res: any) => fail(req, res, 404, "not_found", "No such endpoint. See GET /api/connect/v1/capabilities."));

  // =========================================================================
  // Browser-side admin (signed-in workspace admins; session auth is applied
  // globally by server.ts for everything under /api/ except the exemptions)
  // =========================================================================
  const afail = (res: express.Response, status: number, code: string, message: string) => res.status(status).json({ error: { code, message } });
  async function requireAdmin(req: Req, res: express.Response, tenantId: any): Promise<any | null> {
    if (typeof tenantId !== "string" || !tenantId) {
      afail(res, 400, "invalid_request", "tenantId is required.");
      return null;
    }
    const { data: m } = await db().from("tenant_members").select("*").eq("tenant_id", tenantId).eq("user_id", req.userId).maybeSingle();
    if (!m) {
      afail(res, 403, "forbidden", "You are not a member of this workspace.");
      return null;
    }
    if (m.role !== "admin") {
      afail(res, 403, "forbidden", "Only workspace administrators can manage API keys.");
      return null;
    }
    return m;
  }
  const awrap =
    (fn: (req: Req, res: express.Response) => Promise<any>) =>
    async (req: Req, res: express.Response) => {
      try {
        await fn(req, res);
      } catch (err: any) {
        console.error("[connect-admin] error:", err);
        if (!res.headersSent) afail(res, err?.status || 500, err?.code || "server_error", "Something went wrong. Please try again.");
      }
    };
  const publicKey = (k: any) => {
    const { key_hash, ...rest } = k;
    return rest;
  };
  const mintKey = () => {
    const secret = token(32);
    const full = KEY_PREFIX + secret;
    return { full, prefix: KEY_PREFIX + secret.slice(0, 6), hash: sha256(full) };
  };
  const cleanScopes = (input: any): string[] | null => {
    if (!Array.isArray(input)) return null;
    const s = Array.from(new Set(input.map(String)));
    if (!s.length || s.some((x) => !SCOPE_SET.has(x))) return null;
    return s;
  };
  const expiry = (days: any): string | null | undefined => {
    if (days === null || days === "never") return null;
    const n = Number(days);
    if (!Number.isFinite(n) || n < 1 || n > 730) return undefined;
    return new Date(Date.now() + Math.floor(n) * 86400000).toISOString();
  };

  app.get(
    `${ADMIN}/overview`,
    awrap(async (req, res) => {
      const tenantId = String(req.query.tenantId || "");
      if (!(await requireAdmin(req, res, tenantId))) return;
      const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const [keys, usage, logs, legacy] = await Promise.all([
        db().from("connect_api_keys").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(100),
        db().from("connect_usage_daily").select("key_id, day, requests, errors").eq("tenant_id", tenantId).gte("day", since).order("day", { ascending: true }),
        db().from("connect_audit_logs").select("id, key_id, actor, action, entity, entity_id, request_id, created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(25),
        db().from("integration_connections").select("id, label, status, connected_at, last_used_at").eq("tenant_id", tenantId).neq("status", "revoked"),
      ]);
      const rows: any[] = usage.data || [];
      const byDay: Record<string, { requests: number; errors: number }> = {};
      for (const u of rows) {
        const d = (byDay[u.day] ||= { requests: 0, errors: 0 });
        d.requests += Number(u.requests);
        d.errors += Number(u.errors);
      }
      res.json({
        base_url: `${String(process.env.PUBLIC_APP_URL || process.env.APP_URL || "https://aarpex.aarbook.com").replace(/\/+$/, "")}${BASE}`,
        api_version: API_VERSION,
        rate_limit_per_minute: RATE_PER_MIN,
        max_active_keys: MAX_ACTIVE_KEYS,
        keys: (keys.data || []).map(publicKey),
        usage_30d: { requests: rows.reduce((s, u) => s + Number(u.requests), 0), errors: rows.reduce((s, u) => s + Number(u.errors), 0), by_day: byDay },
        activity: logs.data || [],
        legacy_connections: legacy.data || [],
        scopes: CONNECT_SCOPES,
        capabilities: capabilities().resources,
      });
    })
  );

  app.post(
    `${ADMIN}/keys`,
    awrap(async (req, res) => {
      const tenantId = req.body?.tenantId;
      const member = await requireAdmin(req, res, tenantId);
      if (!member) return;
      const name = String(req.body?.name || "").trim().slice(0, 60);
      if (!name) return afail(res, 400, "invalid_request", "Give the connection a name.");
      const scopes = cleanScopes(req.body?.scopes);
      if (!scopes) return afail(res, 400, "invalid_request", "Choose at least one valid permission.");
      const exp = expiry(req.body?.expiresInDays ?? 90);
      if (exp === undefined) return afail(res, 400, "invalid_request", "Expiry must be 1 to 730 days, or never.");
      const { count } = await db().from("connect_api_keys").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "active");
      if ((count || 0) >= MAX_ACTIVE_KEYS) return afail(res, 409, "key_limit", `This workspace already has ${MAX_ACTIVE_KEYS} active keys. Revoke one first.`);
      const k = mintKey();
      const row = { id: newId(), tenant_id: tenantId, name, environment: "live", key_prefix: k.prefix, key_hash: k.hash, scopes, status: "active", expires_at: exp, created_by_id: req.userId, created_by_name: member.name, created_by_email: member.email };
      const { data, error } = await db().from("connect_api_keys").insert(row).select("*").single();
      if (error) return afail(res, 500, "server_error", "Could not create the key.");
      await audit(tenantId, row.id, member.name || member.email, "key.create", "connect_api_keys", row.id, undefined, { name, scopes, expires_at: exp });
      res.status(201).json({ key: publicKey(data), api_key: k.full });
    })
  );

  app.patch(
    `${ADMIN}/keys/:id`,
    awrap(async (req, res) => {
      const tenantId = req.body?.tenantId;
      const member = await requireAdmin(req, res, tenantId);
      if (!member) return;
      const upd: Record<string, any> = {};
      if (req.body?.name !== undefined) {
        const n = String(req.body.name).trim().slice(0, 60);
        if (!n) return afail(res, 400, "invalid_request", "Name cannot be empty.");
        upd.name = n;
      }
      if (req.body?.scopes !== undefined) {
        const s = cleanScopes(req.body.scopes);
        if (!s) return afail(res, 400, "invalid_request", "Choose at least one valid permission.");
        upd.scopes = s;
      }
      if (req.body?.expiresInDays !== undefined) {
        const e = expiry(req.body.expiresInDays);
        if (e === undefined) return afail(res, 400, "invalid_request", "Expiry must be 1 to 730 days, or never.");
        upd.expires_at = e;
      }
      if (!Object.keys(upd).length) return afail(res, 400, "invalid_request", "Nothing to change.");
      const { data } = await db().from("connect_api_keys").update(upd).eq("tenant_id", tenantId).eq("id", req.params.id).eq("status", "active").select("*").maybeSingle();
      if (!data) return afail(res, 404, "not_found", "Active key not found.");
      await audit(tenantId, data.id, member.name || member.email, "key.update", "connect_api_keys", data.id, undefined, { fields: Object.keys(upd) });
      res.json({ key: publicKey(data) });
    })
  );

  app.post(
    `${ADMIN}/keys/:id/rotate`,
    awrap(async (req, res) => {
      const tenantId = req.body?.tenantId;
      const member = await requireAdmin(req, res, tenantId);
      if (!member) return;
      const k = mintKey();
      const { data } = await db()
        .from("connect_api_keys")
        .update({ key_hash: k.hash, key_prefix: k.prefix, rotated_at: nowIso() })
        .eq("tenant_id", tenantId)
        .eq("id", req.params.id)
        .eq("status", "active")
        .select("*")
        .maybeSingle();
      if (!data) return afail(res, 404, "not_found", "Active key not found.");
      await audit(tenantId, data.id, member.name || member.email, "key.rotate", "connect_api_keys", data.id);
      res.json({ key: publicKey(data), api_key: k.full });
    })
  );

  app.post(
    `${ADMIN}/keys/:id/revoke`,
    awrap(async (req, res) => {
      const tenantId = req.body?.tenantId;
      const member = await requireAdmin(req, res, tenantId);
      if (!member) return;
      const { data } = await db()
        .from("connect_api_keys")
        .update({ status: "revoked", revoked_at: nowIso() })
        .eq("tenant_id", tenantId)
        .eq("id", req.params.id)
        .select("*")
        .maybeSingle();
      if (!data) return afail(res, 404, "not_found", "Key not found.");
      await audit(tenantId, data.id, member.name || member.email, "key.revoke", "connect_api_keys", data.id);
      res.json({ key: publicKey(data) });
    })
  );
}
