/**
 * Founder's Dashboard integration API ("hub and spokes").
 *
 * AarPex exposes, over HTTPS only:
 *   /api/aargard-integration/v1/...   machine API, authenticated by a per-connection
 *                                     API key (Authorization: Bearer <key>)
 *   /api/integration-admin/...        browser API for AarPex admins to create the
 *                                     setup token, see status, rotate or revoke
 *
 * Nothing here reads the Dashboard's database and the Dashboard never reads
 * AarPex's: every exchange is an HTTPS call. Keys are stored hashed
 * (sha256); the webhook secret is stored server-side only (RLS is on with no
 * policies on integration_connections, so the browser can never read it).
 *
 * Mapping notes (AarPex has no separate Contacts/Companies; people and
 * businesses are both Leads): /contacts is an alias of /leads.
 */
import crypto from "crypto";
import type express from "express";

type Req = express.Request & { conn?: any; tenantId?: string; userId?: string };

const API_BASE = "/api/aargard-integration/v1";
const APP_URL = (process.env.PUBLIC_APP_URL || "https://aarpex.aarbook.com").replace(/\/+$/, "");
const SCOPES = ["read", "write", "users"];

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const token = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
const newId = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

function fail(res: express.Response, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

// Webhook targets must be public https URLs (blocks SSRF into private ranges).
function isSafeWebhookUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return false;
    if (/^\[.*\]$/.test(h)) return false; // raw IPv6 literals
    const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (m) {
      const [a, b] = [Number(m[1]), Number(m[2])];
      if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

// 60 requests / minute / connection (best effort: per server instance).
const hits = new Map<string, number[]>();
function rateLimited(connId: string): number {
  const now = Date.now();
  const arr = (hits.get(connId) || []).filter((t) => now - t < 60_000);
  if (arr.length >= 60) {
    hits.set(connId, arr);
    return Math.ceil((60_000 - (now - arr[0])) / 1000);
  }
  arr.push(now);
  hits.set(connId, arr);
  return 0;
}
// Same idea for the unauthenticated key-exchange endpoint, per IP.
const exchangeHits = new Map<string, number[]>();
function exchangeLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (exchangeHits.get(ip) || []).filter((t) => now - t < 60_000);
  if (arr.length >= 10) return true;
  arr.push(now);
  exchangeHits.set(ip, arr);
  return false;
}

// ---------------------------------------------------------------------------
// entity definitions (only whitelisted columns are ever written)
// ---------------------------------------------------------------------------
interface EntityDef {
  table: string;
  label: string;
  writable: string[];
  required: string[];
  defaults: () => Record<string, any>;
  hasUpdatedAt: boolean;
  filters: string[]; // equality filters allowed in list queries
  search?: string[]; // columns searched by ?q=
  eventPrefix?: string;
}

const ENTITIES: Record<string, EntityDef> = {
  deals: {
    table: "deals",
    label: "deal",
    writable: ["name", "salesperson", "pipeline_id", "stage_id", "status", "deal_value", "currency", "probability", "expected_close_date", "product_service", "source", "priority", "last_activity", "next_activity", "notes"],
    required: ["name"],
    defaults: () => ({ status: "Open", deal_value: 0, currency: "USD", probability: 0, priority: "Medium", notes: "" }),
    hasUpdatedAt: true,
    filters: ["status", "pipeline_id", "stage_id", "salesperson", "priority"],
    search: ["name", "notes"],
    eventPrefix: "aarpex.deal",
  },
  leads: {
    table: "leads",
    label: "lead",
    writable: ["name", "company", "job_title", "email", "phone", "whatsapp", "website", "industry", "client_category", "country", "city", "source", "salesperson", "lead_score", "priority", "status", "estimated_value", "expected_close_date", "last_contact", "next_follow_up", "tags", "notes", "social_links", "group_ids", "operator_in_control"],
    required: ["name"],
    defaults: () => ({ status: "New", priority: "Medium", lead_score: 0, estimated_value: 0, tags: [] }),
    hasUpdatedAt: true,
    filters: ["status", "priority", "salesperson", "industry", "country", "city", "source"],
    search: ["name", "company", "email"],
    eventPrefix: "aarpex.lead",
  },
  tasks: {
    table: "tasks",
    label: "task",
    writable: ["title", "deal_id", "assigned_user", "priority", "due_date", "status", "notes"],
    required: ["title"],
    defaults: () => ({ status: "To Do", priority: "Medium", notes: "" }),
    hasUpdatedAt: true,
    filters: ["status", "priority", "assigned_user", "deal_id"],
    search: ["title", "notes"],
    eventPrefix: "aarpex.task",
  },
  activities: {
    table: "activities",
    label: "activity",
    writable: ["type", "deal_id", "lead_id", "date", "time", "user", "description", "outcome", "next_action"],
    required: ["description"],
    defaults: () => ({ type: "Note", date: nowIso().slice(0, 10), time: nowIso().slice(11, 16), outcome: "", next_action: "" }),
    hasUpdatedAt: false,
    filters: ["type", "deal_id", "lead_id", "user"],
    search: ["description"],
    eventPrefix: "aarpex.activity",
  },
  pipelines: {
    table: "pipelines",
    label: "pipeline",
    writable: ["name", "description", "stages", "is_default"],
    required: ["name"],
    defaults: () => ({ description: "", stages: [], is_default: false }),
    hasUpdatedAt: false,
    filters: [],
    search: ["name"],
  },
  groups: {
    table: "lead_groups",
    label: "group",
    writable: ["name", "description", "color"],
    required: ["name"],
    defaults: () => ({}),
    hasUpdatedAt: false,
    filters: [],
    search: ["name"],
  },
};

// Public shape: DB row without tenant_id, always with created_at + updated_at.
function pub(row: any): any {
  if (!row) return row;
  const { tenant_id, ...rest } = row;
  if (!rest.updated_at) rest.updated_at = rest.created_at ?? null;
  return rest;
}

// ---------------------------------------------------------------------------
// registration
// ---------------------------------------------------------------------------
export function registerIntegrationApi(app: express.Express, getSupabase: () => any) {
  const db = () => {
    const s = getSupabase();
    if (!s) throw Object.assign(new Error("Database not configured"), { status: 503, code: "unavailable" });
    return s;
  };

  // ---- outbound webhooks (push) -------------------------------------------
  async function emitEvent(tenantId: string, event: string, data: any): Promise<void> {
    try {
      const { data: conns } = await db()
        .from("integration_connections")
        .select("id, webhook_url, webhook_secret")
        .eq("tenant_id", tenantId)
        .eq("status", "connected")
        .not("webhook_url", "is", null);
      const payload = JSON.stringify({ event, business_id: tenantId, data, occurred_at: nowIso() });
      await Promise.allSettled(
        (conns || []).map(async (c: any) => {
          if (!c.webhook_url || !c.webhook_secret || !isSafeWebhookUrl(c.webhook_url)) return;
          const sig = "sha256=" + crypto.createHmac("sha256", c.webhook_secret).update(payload).digest("hex");
          // 3 attempts with short backoff; the Dashboard's /activity poll is the fallback.
          for (const waitMs of [0, 2000, 8000]) {
            if (waitMs) await new Promise((r) => setTimeout(r, waitMs));
            try {
              const r = await fetch(c.webhook_url, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Aargard-Signature": sig, "X-Aargard-Event": event },
                body: payload,
                signal: AbortSignal.timeout(6000),
              });
              if (r.ok) return;
            } catch {
              /* retry */
            }
          }
        })
      );
    } catch (err) {
      console.error("[integration] webhook emit failed:", err);
    }
  }

  // Waits for the first delivery attempt (max ~3.5s) so serverless doesn't
  // freeze the request before the webhook leaves; retries continue in-process.
  const emitSoon = (tenantId: string, event: string, data: any) =>
    Promise.race([emitEvent(tenantId, event, data), new Promise<void>((r) => setTimeout(r, 3500))]);

  async function audit(req: Req, action: string, entity: string, entityId: string | null, detail?: any) {
    try {
      const c = req.conn;
      await db().from("integration_audit").insert({
        id: newId(),
        tenant_id: req.tenantId,
        connection_id: c?.id,
        actor: `${c?.created_by_name || "Founder"} via Founder's Dashboard`,
        action,
        entity,
        entity_id: entityId,
        detail: detail ?? null,
      });
      // Tell open browsers to refresh their copy of the data.
      await db().from("tenants").update({ integration_changed_at: nowIso() }).eq("id", req.tenantId);
    } catch (err) {
      console.error("[integration] audit failed:", err);
    }
  }

  // ---- API-key auth --------------------------------------------------------
  async function apiAuth(req: Req, res: express.Response, next: express.NextFunction) {
    try {
      const h = req.headers.authorization || "";
      const key = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
      if (!key) return fail(res, 401, "unauthorized", "Missing API key. Send Authorization: Bearer <key>.");
      const { data: conn } = await db()
        .from("integration_connections")
        .select("*")
        .eq("api_key_hash", sha256(key))
        .eq("status", "connected")
        .maybeSingle();
      if (!conn) return fail(res, 401, "invalid_api_key", "API key is invalid or has been revoked.");
      const asked = String(req.headers["x-business-id"] || req.query.business_id || "");
      if (asked && asked !== conn.tenant_id) return fail(res, 403, "forbidden", "This key is not scoped to that business.");
      const wait = rateLimited(conn.id);
      if (wait) {
        res.setHeader("Retry-After", String(wait));
        return fail(res, 429, "rate_limited", "Rate limit is 60 requests/minute per connection.");
      }
      req.conn = conn;
      req.tenantId = conn.tenant_id;
      // throttle last_used_at writes to once a minute
      const last = conn.last_used_at ? new Date(conn.last_used_at).getTime() : 0;
      if (Date.now() - last > 60_000) {
        void db().from("integration_connections").update({ last_used_at: nowIso() }).eq("id", conn.id);
      }
      return next();
    } catch (err: any) {
      return fail(res, err?.status || 500, err?.code || "server_error", err?.message || "Server error");
    }
  }

  const wrap =
    (fn: (req: Req, res: express.Response) => Promise<any>) =>
    async (req: Req, res: express.Response) => {
      try {
        await fn(req, res);
      } catch (err: any) {
        console.error("[integration] error:", err);
        if (!res.headersSent) fail(res, err?.status || 500, err?.code || "server_error", err?.message || "Server error");
      }
    };

  // ======================= public: health + key exchange =====================
  app.get(`${API_BASE}/health`, (_req, res) => res.json({ status: "ok", version: "1.0", app: "aarpex" }));

  // Exchange the one-time setup token (created by an AarPex admin) for the API key.
  app.post(
    `${API_BASE}/connections`,
    wrap(async (req, res) => {
      if (exchangeLimited(String(req.ip))) return fail(res, 429, "rate_limited", "Too many attempts. Try again in a minute.");
      const setup = String(req.body?.setup_token || "").trim();
      if (!setup) return fail(res, 400, "invalid_request", "setup_token is required.");
      const webhookUrl = req.body?.webhook_url ? String(req.body.webhook_url).trim() : "";
      if (webhookUrl && !isSafeWebhookUrl(webhookUrl)) return fail(res, 400, "invalid_webhook_url", "webhook_url must be a public https URL.");
      const { data: conn } = await db().from("integration_connections").select("*").eq("setup_token_hash", sha256(setup)).eq("status", "pending").maybeSingle();
      if (!conn || (conn.setup_expires_at && new Date(conn.setup_expires_at).getTime() < Date.now())) {
        return fail(res, 401, "invalid_setup_token", "Setup token is invalid, expired or already used.");
      }
      const apiKey = "aarpex_" + token(32);
      const webhookSecret = "whsec_" + token(32);
      const { error } = await db()
        .from("integration_connections")
        .update({
          status: "connected",
          api_key_hash: sha256(apiKey),
          webhook_secret: webhookSecret,
          webhook_url: webhookUrl || null,
          setup_token_hash: null,
          setup_expires_at: null,
          connected_at: nowIso(),
          last_verified_at: nowIso(),
        })
        .eq("id", conn.id)
        .eq("status", "pending");
      if (error) return fail(res, 500, "server_error", "Could not save the connection.");
      return res.status(201).json({ api_key: apiKey, webhook_secret: webhookSecret, business_id: conn.tenant_id, scopes: SCOPES });
    })
  );

  // ======================= authenticated lifecycle ==========================
  app.get(
    `${API_BASE}/connections/verify`,
    apiAuth as any,
    wrap(async (req, res) => {
      await db().from("integration_connections").update({ last_verified_at: nowIso() }).eq("id", req.conn.id);
      const { data: t } = await db().from("tenants").select("name, company_name").eq("id", req.tenantId).maybeSingle();
      res.json({ connected: true, app: "aarpex", business_id: req.tenantId, business_name: t?.company_name || t?.name || "", scopes: SCOPES, version: "1.0" });
    })
  );

  app.post(
    `${API_BASE}/connections/rotate`,
    apiAuth as any,
    wrap(async (req, res) => {
      const apiKey = "aarpex_" + token(32);
      await db().from("integration_connections").update({ api_key_hash: sha256(apiKey) }).eq("id", req.conn.id);
      await audit(req, "connection.rotate", "connection", req.conn.id);
      res.json({ api_key: apiKey, business_id: req.tenantId });
    })
  );

  app.post(
    `${API_BASE}/connections/revoke`,
    apiAuth as any,
    wrap(async (req, res) => {
      await audit(req, "connection.revoke", "connection", req.conn.id);
      await db().from("integration_connections").update({ status: "revoked", api_key_hash: null, webhook_secret: null, revoked_at: nowIso() }).eq("id", req.conn.id);
      res.json({ revoked: true });
    })
  );

  // ======================= summary + activity ================================
  app.get(
    `${API_BASE}/summary`,
    apiAuth as any,
    wrap(async (req, res) => {
      const tid = req.tenantId!;
      const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
      const today = nowIso().slice(0, 10);
      const [dealsR, tasksR, leadsR, approvalsR, tenantR] = await Promise.all([
        db().from("deals").select("status, deal_value, currency, updated_at").eq("tenant_id", tid).limit(20000),
        db().from("tasks").select("status, due_date").eq("tenant_id", tid).limit(20000),
        db().from("leads").select("status, created_at, next_follow_up").eq("tenant_id", tid).limit(50000),
        db().from("agent_actions").select("id", { count: "exact", head: true }).eq("tenant_id", tid).eq("status", "pending"),
        db().from("tenants").select("name, company_name").eq("id", tid).maybeSingle(),
      ]);
      const deals: any[] = dealsR.data || [];
      const tasks: any[] = tasksR.data || [];
      const leads: any[] = leadsR.data || [];
      const currency = deals.find((d) => d.currency)?.currency || "USD";
      const open = deals.filter((d) => d.status === "Open");
      const openValue = open.reduce((s, d) => s + Number(d.deal_value || 0), 0);
      const won30 = deals.filter((d) => d.status === "Won" && d.updated_at >= since30);
      const lost30 = deals.filter((d) => d.status === "Lost" && d.updated_at >= since30);
      const winRate = won30.length + lost30.length ? Math.round((won30.length / (won30.length + lost30.length)) * 100) : 0;
      const overdueTasks = tasks.filter((t) => t.due_date && t.due_date < today && !["Completed", "Cancelled"].includes(t.status)).length;
      const overdueLeads = leads.filter((l) => l.next_follow_up && l.next_follow_up < today && !["Converted", "Lost"].includes(l.status)).length;
      const newLeads30 = leads.filter((l) => l.created_at >= since30).length;
      const pending = approvalsR.count || 0;
      const alerts: any[] = [];
      if (overdueTasks + overdueLeads > 0) alerts.push({ severity: "warning", title: `${overdueTasks + overdueLeads} overdue follow-up(s)`, detail: `${overdueTasks} task(s) and ${overdueLeads} lead(s) are past their due date.`, url: `${APP_URL}/app` });
      if (pending > 0) alerts.push({ severity: "info", title: `${pending} agent draft(s) awaiting approval`, detail: "Nothing is sent to prospects until approved.", url: `${APP_URL}/app` });
      res.json({
        app: "aarpex",
        business_id: tid,
        as_of: nowIso(),
        status: "operational",
        kpis: [
          { label: "Open pipeline value", value: openValue, format: "currency", currency },
          { label: "Deals closed (30d)", value: won30.length, format: "number" },
          { label: "Win rate (30d)", value: winRate, format: "percent" },
          { label: "Overdue follow-ups", value: overdueTasks + overdueLeads, format: "number" },
          { label: "New leads (30d)", value: newLeads30, format: "number" },
        ],
        alerts,
      });
    })
  );

  app.get(
    `${API_BASE}/activity`,
    apiAuth as any,
    wrap(async (req, res) => {
      const tid = req.tenantId!;
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
      const sinceRaw = req.query.since ? new Date(String(req.query.since)) : null;
      if (sinceRaw && isNaN(sinceRaw.getTime())) return fail(res, 400, "invalid_request", "since must be an ISO 8601 timestamp.");
      const since = sinceRaw ? sinceRaw.toISOString() : null;
      const q = (table: string, cols: string, tsCol: string) => {
        let b = db().from(table).select(cols).eq("tenant_id", tid).order(tsCol, { ascending: false }).limit(limit);
        if (since) b = b.gte(tsCol, since);
        return b;
      };
      const [acts, leads, deals, tasks] = await Promise.all([
        q("activities", "id, type, description, outcome, date, time, created_at", "created_at"),
        q("leads", "id, name, company, estimated_value, created_at", "created_at"),
        q("deals", "id, name, deal_value, currency, status, created_at", "created_at"),
        db().from("tasks").select("id, title, updated_at").eq("tenant_id", tid).eq("status", "Completed").order("updated_at", { ascending: false }).limit(limit),
      ]);
      const events: any[] = [];
      for (const a of acts.data || []) events.push({ id: `activity_${a.id}`, type: "activity.logged", title: `${a.type}: ${String(a.description || "").slice(0, 120)}`, detail: a.outcome || "", occurred_at: a.created_at, url: `${APP_URL}/app` });
      for (const l of leads.data || []) events.push({ id: `lead_${l.id}`, type: "lead.created", title: `New lead: ${l.name}`, detail: l.company || "", amount: Number(l.estimated_value || 0) || undefined, occurred_at: l.created_at, url: `${APP_URL}/app` });
      for (const d of deals.data || []) events.push({ id: `deal_${d.id}`, type: "deal.created", title: `New deal: ${d.name}`, detail: d.status, amount: Number(d.deal_value || 0), currency: d.currency, occurred_at: d.created_at, url: `${APP_URL}/app` });
      for (const t of tasks.data || []) if (!since || t.updated_at >= since) events.push({ id: `task_${t.id}`, type: "task.completed", title: `Task completed: ${t.title}`, detail: "", occurred_at: t.updated_at, url: `${APP_URL}/app` });
      events.sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)));
      res.json({ events: events.slice(0, limit) });
    })
  );

  // ======================= generic entity CRUD ===============================
  function pickWritable(def: EntityDef, body: any): Record<string, any> {
    const out: Record<string, any> = {};
    for (const k of def.writable) if (body && body[k] !== undefined) out[k] = body[k];
    return out;
  }

  function mount(paths: string[], key: string) {
    const def = ENTITIES[key];
    const base = (p: string) => `${API_BASE}/${p}`;
    for (const p of paths) {
      // list
      app.get(
        base(p),
        apiAuth as any,
        wrap(async (req, res) => {
          const page = Math.max(1, Number(req.query.page) || 1);
          const per = Math.min(100, Math.max(1, Number(req.query.per_page) || 50));
          let b = db().from(def.table).select("*", { count: "exact" }).eq("tenant_id", req.tenantId);
          for (const f of def.filters) if (req.query[f] !== undefined && req.query[f] !== "") b = b.eq(f, String(req.query[f]));
          if (key === "leads" && req.query.group_id) b = b.contains("group_ids", [String(req.query.group_id)]);
          if (req.query.updated_since && def.hasUpdatedAt) b = b.gte("updated_at", String(req.query.updated_since));
          if (req.query.q && def.search?.length) {
            const term = String(req.query.q).replace(/[%,()]/g, " ").trim();
            if (term) b = b.or(def.search.map((c) => `${c}.ilike.%${term}%`).join(","));
          }
          const ascending = String(req.query.order || "desc") === "asc";
          const { data, count, error } = await b.order("created_at", { ascending }).range((page - 1) * per, page * per - 1);
          if (error) return fail(res, 500, "server_error", error.message);
          res.json({ data: (data || []).map(pub), page, per_page: per, total: count ?? (data || []).length, has_more: page * per < (count ?? 0) });
        })
      );
      // detail
      app.get(
        base(`${p}/:id`),
        apiAuth as any,
        wrap(async (req, res) => {
          const { data } = await db().from(def.table).select("*").eq("tenant_id", req.tenantId).eq("id", req.params.id).maybeSingle();
          if (!data) return fail(res, 404, "not_found", `${def.label} not found.`);
          res.json(pub(data));
        })
      );
      // create
      app.post(
        base(p),
        apiAuth as any,
        wrap(async (req, res) => {
          const vals = { ...def.defaults(), ...pickWritable(def, req.body) };
          for (const r of def.required) if (vals[r] === undefined || vals[r] === null || String(vals[r]).trim() === "") return fail(res, 400, "invalid_request", `${r} is required.`);
          const id = String(req.body?.id || newId());
          const row: any = { id, tenant_id: req.tenantId, ...vals };
          const { data, error } = await db().from(def.table).insert(row).select("*").single();
          if (error) return fail(res, error.code === "23505" ? 409 : 400, error.code === "23505" ? "conflict" : "invalid_request", error.message);
          await audit(req, `${def.label}.create`, def.table, id, { fields: Object.keys(vals) });
          if (def.eventPrefix) await emitSoon(req.tenantId!, `${def.eventPrefix}.created`, pub(data));
          res.status(201).json(pub(data));
        })
      );
      // update
      app.patch(
        base(`${p}/:id`),
        apiAuth as any,
        wrap(async (req, res) => {
          const vals = pickWritable(def, req.body);
          if (Object.keys(vals).length === 0) return fail(res, 400, "invalid_request", `No editable fields supplied. Editable: ${def.writable.join(", ")}`);
          if (def.hasUpdatedAt) vals.updated_at = nowIso();
          const { data, error } = await db().from(def.table).update(vals).eq("tenant_id", req.tenantId).eq("id", req.params.id).select("*").maybeSingle();
          if (error) return fail(res, 400, "invalid_request", error.message);
          if (!data) return fail(res, 404, "not_found", `${def.label} not found.`);
          await audit(req, `${def.label}.update`, def.table, req.params.id, { fields: Object.keys(vals) });
          if (def.eventPrefix) await emitSoon(req.tenantId!, `${def.eventPrefix}.updated`, pub(data));
          res.json(pub(data));
        })
      );
      // delete (explicit confirmation required; repeat is a clean no-op)
      app.delete(
        base(`${p}/:id`),
        apiAuth as any,
        wrap(async (req, res) => {
          const confirmed = req.body?.confirm === true || String(req.query.confirm) === "true";
          if (!confirmed) return fail(res, 400, "confirmation_required", 'Deleting is irreversible. Send { "confirm": true }.');
          const { data: existing } = await db().from(def.table).select("*").eq("tenant_id", req.tenantId).eq("id", req.params.id).maybeSingle();
          if (!existing) return res.json({ id: req.params.id, deleted: true, already_deleted: true });
          const { error } = await db().from(def.table).delete().eq("tenant_id", req.tenantId).eq("id", req.params.id);
          if (error) return fail(res, 400, "invalid_request", error.message);
          await audit(req, `${def.label}.delete`, def.table, req.params.id, { snapshot: pub(existing) });
          if (def.eventPrefix) await emitSoon(req.tenantId!, `${def.eventPrefix}.deleted`, { id: req.params.id });
          res.json({ id: req.params.id, deleted: true, entity: pub(existing) });
        })
      );
    }
  }

  // Registered before the generic /:id routes so literal paths win.
  // ---- pipeline stages (flattened from pipelines.stages) -------------------
  app.get(
    `${API_BASE}/pipeline-stages`,
    apiAuth as any,
    wrap(async (req, res) => {
      const { data } = await db().from("pipelines").select("*").eq("tenant_id", req.tenantId);
      const stages: any[] = [];
      for (const p of data || []) {
        for (const s of Array.isArray(p.stages) ? p.stages : []) {
          stages.push({ ...s, pipeline_id: p.id, pipeline_name: p.name, created_at: p.created_at, updated_at: p.created_at });
        }
      }
      res.json({ data: stages, page: 1, per_page: stages.length, total: stages.length, has_more: false });
    })
  );

  // ---- deal actions ---------------------------------------------------------
  app.post(
    `${API_BASE}/deals/bulk-update`,
    apiAuth as any,
    wrap(async (req, res) => {
      const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
      if (ids.length === 0 || ids.length > 100) return fail(res, 400, "invalid_request", "ids must contain 1 to 100 deal ids.");
      const vals = pickWritable(ENTITIES.deals, req.body?.updates);
      if (Object.keys(vals).length === 0) return fail(res, 400, "invalid_request", "updates has no editable fields.");
      vals.updated_at = nowIso();
      const { data, error } = await db().from("deals").update(vals).eq("tenant_id", req.tenantId).in("id", ids).select("*");
      if (error) return fail(res, 400, "invalid_request", error.message);
      await audit(req, "deal.bulk_update", "deals", null, { ids, fields: Object.keys(vals) });
      await emitSoon(req.tenantId!, "aarpex.deal.updated", { ids });
      res.json({ updated: (data || []).map(pub), not_found: ids.filter((i) => !(data || []).some((d: any) => d.id === i)) });
    })
  );

  app.post(
    `${API_BASE}/deals/:id/move`,
    apiAuth as any,
    wrap(async (req, res) => {
      const stageId = String(req.body?.stage_id || "");
      if (!stageId) return fail(res, 400, "invalid_request", "stage_id is required.");
      const { data: deal } = await db().from("deals").select("*").eq("tenant_id", req.tenantId).eq("id", req.params.id).maybeSingle();
      if (!deal) return fail(res, 404, "not_found", "deal not found.");
      const pipelineId = String(req.body?.pipeline_id || deal.pipeline_id || "");
      const { data: pipe } = await db().from("pipelines").select("*").eq("tenant_id", req.tenantId).eq("id", pipelineId).maybeSingle();
      const stage = (Array.isArray(pipe?.stages) ? pipe.stages : []).find((s: any) => s.id === stageId);
      if (!stage) return fail(res, 400, "invalid_stage", "stage_id does not exist in that pipeline.");
      if (deal.stage_id === stageId && deal.pipeline_id === pipelineId) return res.json(pub(deal)); // idempotent
      const status = stage.isWon ? "Won" : stage.isLost ? "Lost" : deal.status === "Won" || deal.status === "Lost" ? "Open" : deal.status;
      const { data, error } = await db()
        .from("deals")
        .update({ pipeline_id: pipelineId, stage_id: stageId, status, probability: Number(stage.probability ?? deal.probability), updated_at: nowIso() })
        .eq("tenant_id", req.tenantId)
        .eq("id", req.params.id)
        .select("*")
        .single();
      if (error) return fail(res, 400, "invalid_request", error.message);
      await audit(req, "deal.move", "deals", req.params.id, { from: deal.stage_id, to: stageId });
      await emitSoon(req.tenantId!, status === "Won" ? "aarpex.deal.won" : status === "Lost" ? "aarpex.deal.lost" : "aarpex.deal.stage_changed", pub(data));
      res.json(pub(data));
    })
  );

  app.post(
    `${API_BASE}/deals/:id/assign`,
    apiAuth as any,
    wrap(async (req, res) => {
      const owner = String(req.body?.salesperson || "").trim();
      if (!owner) return fail(res, 400, "invalid_request", "salesperson is required.");
      const { data } = await db().from("deals").update({ salesperson: owner, updated_at: nowIso() }).eq("tenant_id", req.tenantId).eq("id", req.params.id).select("*").maybeSingle();
      if (!data) return fail(res, 404, "not_found", "deal not found.");
      await audit(req, "deal.assign", "deals", req.params.id, { salesperson: owner });
      res.json(pub(data));
    })
  );

  app.post(
    `${API_BASE}/tasks/:id/complete`,
    apiAuth as any,
    wrap(async (req, res) => {
      const { data } = await db().from("tasks").update({ status: "Completed", updated_at: nowIso() }).eq("tenant_id", req.tenantId).eq("id", req.params.id).select("*").maybeSingle();
      if (!data) return fail(res, 404, "not_found", "task not found.");
      await audit(req, "task.complete", "tasks", req.params.id);
      await emitSoon(req.tenantId!, "aarpex.task.completed", pub(data));
      res.json(pub(data));
    })
  );

  mount(["deals"], "deals");
  mount(["leads", "contacts"], "leads");
  mount(["tasks"], "tasks");
  mount(["activities"], "activities");
  mount(["pipelines"], "pipelines");
  mount(["groups"], "groups");

  // ---- read-only extras -------------------------------------------------------
  app.get(
    `${API_BASE}/industry-agents`,
    apiAuth as any,
    wrap(async (req, res) => {
      const { data } = await db().from("industry_agents").select("*").eq("tenant_id", req.tenantId).order("created_at", { ascending: false });
      res.json({ data: (data || []).map(pub), page: 1, per_page: (data || []).length, total: (data || []).length, has_more: false });
    })
  );
  app.get(
    `${API_BASE}/agent-approvals`,
    apiAuth as any,
    wrap(async (req, res) => {
      const page = Math.max(1, Number(req.query.page) || 1);
      const per = Math.min(100, Math.max(1, Number(req.query.per_page) || 50));
      let b = db().from("agent_actions").select("*", { count: "exact" }).eq("tenant_id", req.tenantId);
      if (req.query.status) b = b.eq("status", String(req.query.status));
      const { data, count } = await b.order("created_at", { ascending: false }).range((page - 1) * per, page * per - 1);
      res.json({ data: (data || []).map(pub), page, per_page: per, total: count ?? 0, has_more: page * per < (count ?? 0) });
    })
  );

  // ======================= users / access ====================================
  const ROLES = ["admin", "sales_manager", "sales_rep", "accountant", "viewer"];
  app.get(
    `${API_BASE}/users`,
    apiAuth as any,
    wrap(async (req, res) => {
      const { data } = await db().from("tenant_members").select("*").eq("tenant_id", req.tenantId);
      const rows = (data || []).map((m: any) => ({ id: m.user_id, name: m.name, email: m.email, role: m.role, created_at: m.joined_at, updated_at: m.joined_at }));
      res.json({ data: rows, page: 1, per_page: rows.length, total: rows.length, has_more: false, roles: ROLES });
    })
  );
  app.patch(
    `${API_BASE}/users/:id`,
    apiAuth as any,
    wrap(async (req, res) => {
      const role = String(req.body?.role || "");
      if (!ROLES.includes(role)) return fail(res, 400, "invalid_request", `role must be one of: ${ROLES.join(", ")}`);
      const { data: members } = await db().from("tenant_members").select("*").eq("tenant_id", req.tenantId);
      const target = (members || []).find((m: any) => m.user_id === req.params.id);
      if (!target) return fail(res, 404, "not_found", "user not found.");
      if (target.role === "admin" && role !== "admin" && (members || []).filter((m: any) => m.role === "admin").length <= 1) {
        return fail(res, 409, "last_admin", "Cannot demote the only admin.");
      }
      if (target.role === role) return res.json({ id: target.user_id, name: target.name, email: target.email, role });
      await db().from("tenant_members").update({ role }).eq("tenant_id", req.tenantId).eq("user_id", req.params.id);
      await audit(req, "user.role_change", "tenant_members", req.params.id, { from: target.role, to: role });
      res.json({ id: target.user_id, name: target.name, email: target.email, role, created_at: target.joined_at, updated_at: nowIso() });
    })
  );
  app.delete(
    `${API_BASE}/users/:id`,
    apiAuth as any,
    wrap(async (req, res) => {
      const confirmed = req.body?.confirm === true || String(req.query.confirm) === "true";
      if (!confirmed) return fail(res, 400, "confirmation_required", 'Removing access is irreversible. Send { "confirm": true }.');
      const { data: members } = await db().from("tenant_members").select("*").eq("tenant_id", req.tenantId);
      const target = (members || []).find((m: any) => m.user_id === req.params.id);
      if (!target) return res.json({ id: req.params.id, deactivated: true, already_removed: true });
      if (target.role === "admin" && (members || []).filter((m: any) => m.role === "admin").length <= 1) {
        return fail(res, 409, "last_admin", "Cannot remove the only admin.");
      }
      await db().from("tenant_members").delete().eq("tenant_id", req.tenantId).eq("user_id", req.params.id);
      await audit(req, "user.deactivate", "tenant_members", req.params.id, { email: target.email });
      res.json({ id: target.user_id, deactivated: true, email: target.email });
    })
  );
  app.post(
    `${API_BASE}/users/invite`,
    apiAuth as any,
    wrap(async (req, res) => {
      if (req.body?.confirm !== true) return fail(res, 400, "confirmation_required", 'Inviting sends an email and creates access. Send { "confirm": true }.');
      const email = String(req.body?.email || "").trim().toLowerCase();
      const name = String(req.body?.name || email.split("@")[0]).trim();
      const role = String(req.body?.role || "sales_rep");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(res, 400, "invalid_request", "A valid email is required.");
      if (!ROLES.includes(role)) return fail(res, 400, "invalid_request", `role must be one of: ${ROLES.join(", ")}`);
      const { data: existing } = await db().from("tenant_members").select("*").eq("tenant_id", req.tenantId).eq("email", email).maybeSingle();
      if (existing) return res.json({ id: existing.user_id, name: existing.name, email, role: existing.role, already_member: true });
      const invited = await db().auth.admin.inviteUserByEmail(email, { data: { full_name: name }, redirectTo: `${APP_URL}/app` });
      const userId = invited?.data?.user?.id;
      if (invited?.error || !userId) return fail(res, 400, "invite_failed", invited?.error?.message || "Could not invite that user.");
      await db().from("tenant_members").insert({ tenant_id: req.tenantId, user_id: userId, name, email, role });
      await audit(req, "user.invite", "tenant_members", userId, { email, role });
      res.status(201).json({ id: userId, name, email, role, created_at: nowIso(), updated_at: nowIso() });
    })
  );

  // ======================= browser-side admin (user session) =================
  async function requireAdmin(req: Req, res: express.Response, tenantId: string): Promise<any | null> {
    if (!tenantId) {
      fail(res, 400, "invalid_request", "tenantId is required.");
      return null;
    }
    const { data: m } = await db().from("tenant_members").select("*").eq("tenant_id", tenantId).eq("user_id", req.userId).maybeSingle();
    if (!m) {
      fail(res, 403, "forbidden", "You are not a member of this workspace.");
      return null;
    }
    if (m.role !== "admin") {
      fail(res, 403, "forbidden", "Only workspace admins can manage the Founder's Dashboard connection.");
      return null;
    }
    return m;
  }

  app.get(
    "/api/integration-admin/status",
    wrap(async (req, res) => {
      const tenantId = String(req.query.tenantId || "");
      if (!(await requireAdmin(req, res, tenantId))) return;
      const { data: conns } = await db()
        .from("integration_connections")
        .select("id, label, status, webhook_url, created_by_name, created_at, connected_at, last_verified_at, last_used_at, revoked_at, setup_expires_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(10);
      const { data: log } = await db().from("integration_audit").select("id, actor, action, entity, entity_id, created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(15);
      res.json({ connections: conns || [], audit: log || [], base_path: API_BASE });
    })
  );

  app.post(
    "/api/integration-admin/setup-token",
    wrap(async (req, res) => {
      const tenantId = String(req.body?.tenantId || "");
      const member = await requireAdmin(req, res, tenantId);
      if (!member) return;
      const setup = "aps_" + token(24);
      const id = newId();
      const expires = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      const { error } = await db().from("integration_connections").insert({
        id,
        tenant_id: tenantId,
        label: String(req.body?.label || "Founder's Dashboard").slice(0, 80),
        status: "pending",
        setup_token_hash: sha256(setup),
        setup_expires_at: expires,
        created_by_id: req.userId,
        created_by_name: member.name,
        created_by_email: member.email,
      });
      if (error) return fail(res, 500, "server_error", error.message);
      res.status(201).json({ setup_token: setup, expires_at: expires, connection_id: id, base_path: API_BASE });
    })
  );

  app.post(
    "/api/integration-admin/revoke",
    wrap(async (req, res) => {
      const tenantId = String(req.body?.tenantId || "");
      if (!(await requireAdmin(req, res, tenantId))) return;
      await db()
        .from("integration_connections")
        .update({ status: "revoked", api_key_hash: null, setup_token_hash: null, webhook_secret: null, revoked_at: nowIso() })
        .eq("tenant_id", tenantId)
        .eq("id", String(req.body?.connectionId || ""));
      res.json({ revoked: true });
    })
  );

  app.post(
    "/api/integration-admin/rotate",
    wrap(async (req, res) => {
      const tenantId = String(req.body?.tenantId || "");
      if (!(await requireAdmin(req, res, tenantId))) return;
      const apiKey = "aarpex_" + token(32);
      const { data } = await db()
        .from("integration_connections")
        .update({ api_key_hash: sha256(apiKey) })
        .eq("tenant_id", tenantId)
        .eq("id", String(req.body?.connectionId || ""))
        .eq("status", "connected")
        .select("id")
        .maybeSingle();
      if (!data) return fail(res, 404, "not_found", "No connected connection found to rotate.");
      res.json({ api_key: apiKey });
    })
  );

  // The browser reports events that happen in the app (it is the source of
  // truth for most data); the server signs and forwards them to the Dashboard.
  app.post(
    "/api/integration-admin/emit",
    wrap(async (req, res) => {
      const tenantId = String(req.body?.tenantId || "");
      const event = String(req.body?.event || "");
      if (!tenantId || !/^aarpex\.[a-z_]+\.[a-z_]+$/.test(event)) return fail(res, 400, "invalid_request", "tenantId and a valid aarpex.* event are required.");
      const { data: m } = await db().from("tenant_members").select("user_id").eq("tenant_id", tenantId).eq("user_id", req.userId).maybeSingle();
      if (!m) return fail(res, 403, "forbidden", "You are not a member of this workspace.");
      await emitEvent(tenantId, event, req.body?.data ?? {});
      res.json({ ok: true });
    })
  );
}
