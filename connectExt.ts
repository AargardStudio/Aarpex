/**
 * Aargard Connect - extensions (v1.1): campaigns, bulk lead import/export,
 * workspace summary, and the hosted MCP server (/api/mcp).
 *
 * Everything here is manage-and-read only. Nothing in this file sends email:
 * campaigns are created as drafts, and paused / resumed / archived. Sending
 * stays in the signed-in app.
 */
import type express from "express";
import { ENTITIES, pub, sha256, newId, nowIso } from "./integrationApi";

export const EXT_SCOPES: { scope: string; label: string; description: string }[] = [
  { scope: "campaigns:read", label: "Read campaigns", description: "List campaigns, their sequences and per-step results." },
  { scope: "campaigns:write", label: "Manage campaigns", description: "Create draft campaigns, edit drafts, pause, resume and archive. Never sends email." },
  { scope: "campaigns:delete", label: "Delete campaigns", description: 'Permanently delete a campaign. Needs { "confirm": true }.' },
  { scope: "leads:import", label: "Import leads", description: "Bulk-create or update leads from JSON or CSV (dry-run supported)." },
  { scope: "leads:export", label: "Export leads", description: "Export leads as JSON or CSV with cursor paging." },
];

class ApiErr extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}
const bad = (m: string, code = "invalid_request") => new ApiErr(400, code, m);
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_IMPORT_ROWS = 1000;
const EMAIL_RE = /^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]{2,}$/;

export function cleanEmail(v: any): string {
  let s = String(v ?? "").trim();
  s = s.replace(/^mailto:/i, "").replace(/[?&].*$/, "").replace(/^<|>$/g, "").trim().toLowerCase();
  return EMAIL_RE.test(s) ? s : "";
}

// ---- tiny CSV parser (quotes, escaped quotes, CRLF) --------------------------
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  if (rows.length < 2) return [];
  const head = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()])));
}
export function toCsv(rows: Record<string, any>[], cols: string[]): string {
  const esc = (v: any) => {
    if (v === null || v === undefined) return "";
    let s = Array.isArray(v) || typeof v === "object" ? JSON.stringify(v) : String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s; // neutralise spreadsheet formula injection
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

const HEADER_ALIASES: Record<string, string> = {
  "full name": "name", "contact name": "name", "first name": "_first", firstname: "_first", "last name": "_last", lastname: "_last",
  "company name": "company", organisation: "company", organization: "company", "job title": "job_title", title: "job_title", jobtitle: "job_title", position: "job_title",
  "e-mail": "email", "email address": "email", mail: "email", mobile: "phone", telephone: "phone", "phone number": "phone",
  url: "website", site: "website", "lead source": "source", "follow up": "next_follow_up", "next follow up": "next_follow_up", "estimated value": "estimated_value", value: "estimated_value",
};
function normaliseRow(raw: Record<string, any>, writable: string[]): Record<string, any> {
  const out: Record<string, any> = {};
  let first = "";
  let last = "";
  for (const [k0, v] of Object.entries(raw || {})) {
    const k1 = k0.trim().toLowerCase().replace(/[\s-]+/g, " ");
    const k = HEADER_ALIASES[k1] || k1.replace(/ /g, "_");
    if (k === "_first") first = String(v ?? "").trim();
    else if (k === "_last") last = String(v ?? "").trim();
    else if (writable.includes(k) && v !== undefined && v !== null && String(v).trim() !== "") out[k] = v;
  }
  if (!out.name && (first || last)) out.name = `${first} ${last}`.trim();
  if (typeof out.tags === "string") out.tags = out.tags.split(/[;|,]/).map((t: string) => t.trim()).filter(Boolean);
  if (typeof out.group_ids === "string") out.group_ids = out.group_ids.split(/[;|,]/).map((t: string) => t.trim()).filter(Boolean);
  for (const n of ["lead_score", "estimated_value"]) if (out[n] !== undefined) out[n] = Number(String(out[n]).replace(/[^0-9.\-]/g, "")) || 0;
  return out;
}

interface Deps {
  app: express.Express;
  BASE: string;
  db: () => any;
  guard: (scope: string | null) => any;
  wrap: (fn: (req: any, res: express.Response) => Promise<any>) => any;
  fail: (req: any, res: express.Response, status: number, code: string, message: string, extra?: any) => any;
  audit: (tenantId: string, keyId: string | null, actor: string, action: string, entity: string | null, entityId: string | null, requestId?: string, detail?: any, touchData?: boolean) => Promise<void>;
  emitSoon: (tenantId: string, event: string, data: any) => Promise<void>;
}

export function registerConnectExt(d: Deps) {
  const { app, BASE, db, guard, wrap, fail, audit, emitSoon } = d;
  const actor = (req: any) => `API key "${req.key?.name}" (${req.key?.key_prefix}...)`;
  const hasScope = (req: any, s: string) => (req.key?.scopes || []).includes(s);

  // ======================================================================
  // core operations (shared by REST and MCP). They throw ApiErr.
  // ======================================================================
  const CAMPAIGN_STATUSES = ["Draft", "Active", "Paused", "Completed"];
  const campaignPub = (r: any, withSteps = false) => {
    const steps: any[] = Array.isArray(r.steps) ? r.steps : [];
    const o: any = {
      id: r.id, name: r.name, status: r.status, audience_size: (r.audience_ids || []).length, replied_count: (r.replied_audience_ids || []).length,
      frequency_days: r.frequency_days, follow_up_count: r.follow_up_count, technique: r.technique, start_date: r.start_date, salesperson: r.salesperson,
      mailbox_id: r.mailbox_id, notes: r.notes, created_at: r.created_at, updated_at: r.updated_at,
      steps_total: steps.length, steps_sent: steps.filter((s) => s.status === "Sent").length,
    };
    if (withSteps) {
      o.audience_ids = r.audience_ids || [];
      o.steps = steps.map((s) => ({ id: s.id, step_number: s.stepNumber, delay_days: s.delayDays, subject: s.subject, body: s.body, status: s.status, scheduled_date: s.scheduledDate ?? null, sent_date: s.sentDate ?? null }));
    }
    return o;
  };
  async function loadCampaign(t: string, id: string) {
    if (!ID_RE.test(id)) throw bad("Invalid campaign id.");
    const { data } = await db().from("email_campaigns").select("*").eq("tenant_id", t).eq("id", id).maybeSingle();
    if (!data) throw new ApiErr(404, "not_found", "Campaign not found.");
    return data;
  }
  async function leadIdsExist(t: string, ids: string[]) {
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const { data } = await db().from("leads").select("id").eq("tenant_id", t).in("id", chunk);
      if ((data || []).length !== chunk.length) throw bad("audience_ids contains a lead that is not in this workspace.", "invalid_reference");
    }
  }
  function cleanSteps(input: any): any[] {
    if (!Array.isArray(input) || input.length < 1 || input.length > 8) throw bad("steps must be an array of 1-8 emails.");
    return input.map((s: any, i: number) => {
      const subject = String(s?.subject ?? "").trim();
      const body = String(s?.body ?? "").trim();
      if (!subject || subject.length > 250) throw bad(`steps[${i}].subject is required (max 250 characters).`);
      if (!body || body.length > 20000) throw bad(`steps[${i}].body is required (max 20000 characters).`);
      const delay = i === 0 ? 0 : Math.min(60, Math.max(1, Math.floor(Number(s?.delay_days ?? 3)) || 3));
      return { id: newId(), stepNumber: i + 1, delayDays: delay, technique: "Mixed", subject, body, status: "Draft" };
    });
  }

  const ops = {
    async listCampaigns(t: string, q: any) {
      let b = db().from("email_campaigns").select("*", { count: "exact" }).eq("tenant_id", t);
      if (q.status) {
        if (!CAMPAIGN_STATUSES.includes(String(q.status))) throw bad(`status must be one of ${CAMPAIGN_STATUSES.join(", ")}.`);
        b = b.eq("status", String(q.status));
      }
      const page = Math.max(1, Math.floor(Number(q.page)) || 1);
      const per = Math.min(100, Math.max(1, Math.floor(Number(q.per_page)) || 50));
      const { data, count, error } = await b.order("created_at", { ascending: false }).range((page - 1) * per, page * per - 1);
      if (error) throw new ApiErr(500, "server_error", "Could not load campaigns.");
      return { data: (data || []).map((r: any) => campaignPub(r)), pagination: { page, per_page: per, total: count ?? 0, has_more: page * per < (count ?? 0) } };
    },
    async getCampaign(t: string, id: string) {
      return { data: campaignPub(await loadCampaign(t, id), true) };
    },
    async campaignResults(t: string, id: string, includeRecipients: boolean) {
      const c = await loadCampaign(t, id);
      const today = new Date().toISOString().slice(0, 10);
      const replied = new Set<string>(c.replied_audience_ids || []);
      const audience = (c.audience_ids || []).length;
      const steps = (Array.isArray(c.steps) ? c.steps : []).map((s: any) => {
        const res: any[] = s.deliveryResults || [];
        const sent = res.filter((r) => r.success).length;
        const failed = res.filter((r) => !r.success).length;
        const due = s.status !== "Sent" && s.scheduledDate && s.scheduledDate <= today && c.status === "Active";
        const o: any = {
          step_number: s.stepNumber, subject: s.subject, status: s.status, scheduled_date: s.scheduledDate ?? null, sent_date: s.sentDate ?? null,
          sent, failed, pending: Math.max(0, audience - sent - replied.size * 0), due, replied_overall: replied.size,
        };
        if (includeRecipients) o.recipients = res.map((r) => ({ lead_id: r.recipientId, email: r.email, success: r.success, error: r.error ?? null, sent_at: r.sentAt }));
        return o;
      });
      return { data: { campaign: campaignPub(c), steps, replied_lead_ids: includeRecipients ? [...replied] : undefined } };
    },
    async createCampaign(t: string, body: any, a: string, keyId: string, rid?: string) {
      if (!body || typeof body !== "object" || Array.isArray(body)) throw bad("Request body must be a JSON object.");
      const allowed = ["name", "audience_ids", "group_id", "steps", "mailbox_id", "frequency_days", "salesperson", "notes", "start_date"];
      const unknown = Object.keys(body).filter((k) => !allowed.includes(k));
      if (unknown.length) throw bad(`Unknown field(s): ${unknown.join(", ")}. Allowed: ${allowed.join(", ")}.`);
      const name = String(body.name ?? "").trim();
      if (!name || name.length > 120) throw bad("name is required (max 120 characters).");
      let audience: string[] = [];
      if (body.group_id) {
        if (!ID_RE.test(String(body.group_id))) throw bad("group_id must be an id.");
        const { data } = await db().from("leads").select("id").eq("tenant_id", t).contains("group_ids", [String(body.group_id)]).limit(5000);
        audience = (data || []).map((r: any) => r.id);
      }
      if (body.audience_ids !== undefined) {
        if (!Array.isArray(body.audience_ids) || body.audience_ids.some((x: any) => typeof x !== "string" || !ID_RE.test(x))) throw bad("audience_ids must be an array of lead ids.");
        audience = Array.from(new Set([...audience, ...body.audience_ids]));
        await leadIdsExist(t, body.audience_ids);
      }
      if (audience.length > 5000) throw bad("An audience can hold at most 5000 leads.");
      const steps = cleanSteps(body.steps);
      const freq = Math.min(60, Math.max(1, Math.floor(Number(body.frequency_days)) || 3));
      const id = newId();
      const row = {
        id, tenant_id: t, name, audience_type: "Leads", audience_ids: audience, frequency: "Custom", frequency_days: freq, follow_up_count: steps.length - 1,
        technique: "Mixed", status: "Draft", steps, start_date: body.start_date ? String(body.start_date).slice(0, 10) : null,
        salesperson: String(body.salesperson ?? "").slice(0, 120), notes: body.notes ? String(body.notes).slice(0, 2000) : null, mailbox_id: body.mailbox_id ? String(body.mailbox_id).slice(0, 80) : null,
      };
      const { data, error } = await db().from("email_campaigns").insert(row).select("*").single();
      if (error) throw bad("Could not create the campaign. Check the field values.");
      await audit(t, keyId, a, "campaign.create", "email_campaigns", id, rid, { name, audience: audience.length, steps: steps.length }, true);
      return { data: campaignPub(data, true) };
    },
    async updateCampaign(t: string, id: string, body: any, a: string, keyId: string, rid?: string) {
      const c = await loadCampaign(t, id);
      if (c.status !== "Draft") throw new ApiErr(409, "not_a_draft", "Only draft campaigns can be edited. Pause the campaign in AarPex first.");
      const upd: any = {};
      if (body?.name !== undefined) {
        const n = String(body.name).trim();
        if (!n || n.length > 120) throw bad("name must be 1-120 characters.");
        upd.name = n;
      }
      if (body?.notes !== undefined) upd.notes = String(body.notes).slice(0, 2000);
      if (body?.steps !== undefined) {
        upd.steps = cleanSteps(body.steps);
        upd.follow_up_count = upd.steps.length - 1;
      }
      if (body?.audience_ids !== undefined) {
        if (!Array.isArray(body.audience_ids) || body.audience_ids.length > 5000 || body.audience_ids.some((x: any) => typeof x !== "string" || !ID_RE.test(x))) throw bad("audience_ids must be an array of up to 5000 lead ids.");
        await leadIdsExist(t, body.audience_ids);
        upd.audience_ids = body.audience_ids;
      }
      if (!Object.keys(upd).length) throw bad("No editable fields supplied (name, notes, steps, audience_ids).");
      upd.updated_at = nowIso();
      const { data, error } = await db().from("email_campaigns").update(upd).eq("tenant_id", t).eq("id", id).select("*").single();
      if (error) throw bad("Could not update the campaign.");
      await audit(t, keyId, a, "campaign.update", "email_campaigns", id, rid, { fields: Object.keys(upd) }, true);
      return { data: campaignPub(data, true) };
    },
    async setCampaignStatus(t: string, id: string, action: "pause" | "resume" | "archive", a: string, keyId: string, rid?: string) {
      const c = await loadCampaign(t, id);
      let next: string;
      if (action === "pause") {
        if (c.status !== "Active") throw new ApiErr(409, "invalid_state", `Only an Active campaign can be paused (this one is ${c.status}).`);
        next = "Paused";
      } else if (action === "resume") {
        if (c.status !== "Paused") throw new ApiErr(409, "invalid_state", `Only a Paused campaign can be resumed (this one is ${c.status}). Launching a draft is done in AarPex.`);
        next = "Active";
      } else {
        if (c.status === "Completed") return { data: campaignPub(c) };
        next = "Completed";
      }
      const { data, error } = await db().from("email_campaigns").update({ status: next, updated_at: nowIso() }).eq("tenant_id", t).eq("id", id).select("*").single();
      if (error) throw bad("Could not change the campaign.");
      await audit(t, keyId, a, `campaign.${action}`, "email_campaigns", id, rid, { from: c.status, to: next }, true);
      return { data: campaignPub(data) };
    },
    async deleteCampaign(t: string, id: string, confirm: boolean, a: string, keyId: string, rid?: string) {
      if (!confirm) throw bad('Deleting is irreversible. Send { "confirm": true } or ?confirm=true.', "confirmation_required");
      const c = await loadCampaign(t, id);
      await db().from("email_campaigns").delete().eq("tenant_id", t).eq("id", id);
      await audit(t, keyId, a, "campaign.delete", "email_campaigns", id, rid, { snapshot: campaignPub(c) }, true);
      return { data: { id, deleted: true } };
    },

    // ---- leads: import ---------------------------------------------------
    async importLeads(t: string, body: any, a: string, keyId: string, rid?: string) {
      const def = ENTITIES.leads;
      let rows: Record<string, any>[];
      if (typeof body?.csv === "string") rows = parseCsv(body.csv);
      else if (Array.isArray(body?.rows)) rows = body.rows;
      else throw bad('Send { "rows": [ {...} ] } or { "csv": "<csv text with a header row>" }.');
      if (!rows.length) throw bad("No rows to import.");
      if (rows.length > MAX_IMPORT_ROWS) throw bad(`At most ${MAX_IMPORT_ROWS} rows per call. Split the file and send several requests.`, "too_many_rows");
      const dryRun = body?.dry_run === true;
      const mode = body?.on_duplicate === "update" ? "update" : "skip";
      let groupId: string | null = null;
      if (body?.group_id) {
        groupId = String(body.group_id);
        const { data: g } = await db().from("lead_groups").select("id").eq("tenant_id", t).eq("id", groupId).maybeSingle();
        if (!g) throw bad("group_id does not match a group in this workspace.", "invalid_reference");
      }
      // existing emails in this workspace
      const existing = new Map<string, any>();
      for (let from = 0; from < 100000; from += 1000) {
        const { data } = await db().from("leads").select("id, email, group_ids").eq("tenant_id", t).range(from, from + 999);
        for (const r of data || []) {
          const e = cleanEmail(r.email);
          if (e) existing.set(e, r);
        }
        if (!data || data.length < 1000) break;
      }
      const seen = new Set<string>();
      const invalid: { row: number; reason: string }[] = [];
      const toCreate: any[] = [];
      const toUpdate: { id: string; vals: any }[] = [];
      let skippedExisting = 0;
      let dupInFile = 0;
      rows.forEach((raw, idx) => {
        const n = idx + 1;
        const vals = normaliseRow(raw, def.writable);
        if (vals.email !== undefined) {
          const e = cleanEmail(vals.email);
          if (!e) {
            invalid.push({ row: n, reason: `Invalid email "${String(vals.email).slice(0, 80)}".` });
            return;
          }
          vals.email = e;
        }
        if (!vals.name && vals.email) vals.name = vals.email.split("@")[0];
        if (!vals.name) {
          invalid.push({ row: n, reason: "name or email is required." });
          return;
        }
        if (vals.email) {
          if (seen.has(vals.email)) {
            dupInFile++;
            return;
          }
          seen.add(vals.email);
          const ex = existing.get(vals.email);
          if (ex) {
            if (mode === "update") {
              const patch: any = { ...vals, updated_at: nowIso() };
              if (groupId) patch.group_ids = Array.from(new Set([...(ex.group_ids || []), groupId]));
              toUpdate.push({ id: ex.id, vals: patch });
            } else skippedExisting++;
            return;
          }
        }
        const rec: any = { ...def.defaults(), ...vals };
        if (groupId) rec.group_ids = Array.from(new Set([...(Array.isArray(rec.group_ids) ? rec.group_ids : []), groupId]));
        toCreate.push(rec);
      });
      const summary = { received: rows.length, to_create: toCreate.length, to_update: toUpdate.length, skipped_existing: skippedExisting, duplicates_in_file: dupInFile, invalid: invalid.slice(0, 100), invalid_count: invalid.length };
      if (dryRun) return { data: { dry_run: true, ...summary } };
      let created = 0;
      let updated = 0;
      for (let i = 0; i < toCreate.length; i += 200) {
        const chunk = toCreate.slice(i, i + 200).map((r) => ({ id: newId(), tenant_id: t, ...r }));
        const { error } = await db().from("leads").insert(chunk);
        if (error) throw new ApiErr(500, "partial_failure", `Import stopped after ${created} created lead(s): ${error.message.slice(0, 120)}. Re-run with on_duplicate "skip" to continue safely.`);
        created += chunk.length;
      }
      for (const u of toUpdate) {
        const { error } = await db().from("leads").update(u.vals).eq("tenant_id", t).eq("id", u.id);
        if (!error) updated++;
      }
      await audit(t, keyId, a, "lead.import", "leads", null, rid, { created, updated, skipped: skippedExisting, invalid: invalid.length }, true);
      if (created) await emitSoon(t, "aarpex.lead.created", { imported: created });
      return { data: { dry_run: false, ...summary, created, updated } };
    },

    // ---- leads: export ---------------------------------------------------
    async exportLeads(t: string, q: any) {
      const def = ENTITIES.leads;
      const limit = Math.min(1000, Math.max(1, Math.floor(Number(q.limit)) || 500));
      let b = db().from("leads").select("*").eq("tenant_id", t);
      for (const f of def.filters) if (q[f] !== undefined && q[f] !== "") b = b.eq(f, String(q[f]));
      if (q.group_id) b = b.contains("group_ids", [String(q.group_id)]);
      if (q.updated_since) {
        const dt = new Date(String(q.updated_since));
        if (isNaN(dt.getTime())) throw bad("updated_since must be an ISO 8601 time.");
        b = b.gte("updated_at", dt.toISOString());
      }
      if (q.cursor) {
        if (!ID_RE.test(String(q.cursor))) throw bad("Invalid cursor.");
        b = b.gt("id", String(q.cursor));
      }
      const { data, error } = await b.order("id", { ascending: true }).limit(limit + 1);
      if (error) throw new ApiErr(500, "server_error", "Could not export leads.");
      const rows = (data || []).slice(0, limit).map(pub);
      const more = (data || []).length > limit;
      return { rows, next_cursor: more ? rows[rows.length - 1].id : null, cols: ["id", ...def.writable, "created_at", "updated_at"] };
    },

    // ---- summary -----------------------------------------------------------
    async summary(t: string) {
      const today = new Date().toISOString().slice(0, 10);
      const [leads, deals, tasks, camps] = await Promise.all([
        db().from("leads").select("status, next_follow_up, created_at").eq("tenant_id", t).limit(50000),
        db().from("deals").select("status, deal_value, currency").eq("tenant_id", t).limit(50000),
        db().from("tasks").select("status, due_date").eq("tenant_id", t).limit(50000),
        db().from("email_campaigns").select("status").eq("tenant_id", t),
      ]);
      const count = (rows: any[], key: string) => rows.reduce((m: any, r: any) => ((m[r[key] ?? "Unknown"] = (m[r[key] ?? "Unknown"] || 0) + 1), m), {});
      const L: any[] = leads.data || [];
      const D: any[] = deals.data || [];
      const T: any[] = tasks.data || [];
      const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
      return {
        data: {
          leads: { total: L.length, by_status: count(L, "status"), new_last_30_days: L.filter((l) => l.created_at >= since30).length, follow_ups_overdue: L.filter((l) => l.next_follow_up && l.next_follow_up < today && !["Converted", "Lost"].includes(l.status)).length },
          deals: { total: D.length, by_status: count(D, "status"), open_value: D.filter((x) => x.status === "Open").reduce((s, x) => s + Number(x.deal_value || 0), 0) },
          tasks: { total: T.length, overdue: T.filter((x) => x.due_date && x.due_date < today && !["Completed", "Cancelled"].includes(x.status)).length },
          campaigns: { total: (camps.data || []).length, by_status: count(camps.data || [], "status") },
        },
      };
    },

    // ---- generic record helpers for MCP ----------------------------------
    async listRecords(t: string, resource: string, q: any) {
      const def = ENTITIES[resource];
      const page = Math.max(1, Math.floor(Number(q.page)) || 1);
      const per = Math.min(100, Math.max(1, Math.floor(Number(q.per_page)) || 25));
      let b = db().from(def.table).select("*", { count: "exact" }).eq("tenant_id", t);
      for (const f of def.filters) if (q[f] !== undefined && q[f] !== "") b = b.eq(f, String(q[f]));
      if (q.q && def.search?.length) {
        const term = String(q.q).replace(/[%,()*\\]/g, " ").trim().slice(0, 100);
        if (term) b = b.or(def.search.map((c) => `${c}.ilike.%${term}%`).join(","));
      }
      const { data, count } = await b.order("created_at", { ascending: false }).range((page - 1) * per, page * per - 1);
      return { data: (data || []).map(pub), pagination: { page, per_page: per, total: count ?? 0, has_more: page * per < (count ?? 0) } };
    },
    async getRecord(t: string, resource: string, id: string) {
      if (!ID_RE.test(id)) throw bad("Invalid id.");
      const { data } = await db().from(ENTITIES[resource].table).select("*").eq("tenant_id", t).eq("id", id).maybeSingle();
      if (!data) throw new ApiErr(404, "not_found", "Not found.");
      return { data: pub(data) };
    },
    async writeRecord(t: string, resource: string, id: string | null, body: any, a: string, keyId: string, rid?: string) {
      const def = ENTITIES[resource];
      if (!body || typeof body !== "object" || Array.isArray(body)) throw bad("Fields must be an object.");
      const unknown = Object.keys(body).filter((k) => !def.writable.includes(k));
      if (unknown.length) throw bad(`Unknown field(s): ${unknown.join(", ")}. Writable: ${def.writable.join(", ")}.`);
      const vals: any = {};
      for (const k of def.writable) if (body[k] !== undefined) vals[k] = body[k];
      if (vals.email) {
        vals.email = cleanEmail(vals.email);
        if (!vals.email) throw bad("Invalid email.");
      }
      if (resource === "tasks" && vals.deal_id) {
        const { data } = await db().from("deals").select("id").eq("tenant_id", t).eq("id", String(vals.deal_id)).maybeSingle();
        if (!data) throw bad("deal_id does not match a deal in this workspace.", "invalid_reference");
      }
      if (id) {
        if (!Object.keys(vals).length) throw bad("No editable fields supplied.");
        if (def.hasUpdatedAt) vals.updated_at = nowIso();
        const { data, error } = await db().from(def.table).update(vals).eq("tenant_id", t).eq("id", id).select("*").maybeSingle();
        if (error) throw bad("Could not update. Check the field values.");
        if (!data) throw new ApiErr(404, "not_found", "Not found.");
        await audit(t, keyId, a, `${def.label}.update`, def.table, id, rid, { fields: Object.keys(vals) }, true);
        if (def.eventPrefix) await emitSoon(t, `${def.eventPrefix}.updated`, pub(data));
        return { data: pub(data) };
      }
      const all = { ...def.defaults(), ...vals };
      for (const k of def.required) if (all[k] === undefined || String(all[k]).trim() === "") throw bad(`${k} is required.`);
      const nid = newId();
      const { data, error } = await db().from(def.table).insert({ id: nid, tenant_id: t, ...all }).select("*").single();
      if (error) throw bad("Could not create. Check the field values.");
      await audit(t, keyId, a, `${def.label}.create`, def.table, nid, rid, { fields: Object.keys(all) }, true);
      if (def.eventPrefix) await emitSoon(t, `${def.eventPrefix}.created`, pub(data));
      return { data: pub(data) };
    },
  };

  const sendErr = (req: any, res: express.Response, e: any) => {
    if (e instanceof ApiErr) return fail(req, res, e.status, e.code, e.message);
    console.error("[connect-ext] error:", e);
    return fail(req, res, 500, "server_error", "Server error");
  };
  const route = (scope: string, fn: (req: any, res: express.Response) => Promise<any>) =>
    wrap(async (req, res) => {
      try {
        await fn(req, res);
      } catch (e) {
        sendErr(req, res, e);
      }
    });
  const ok = (req: any, res: express.Response, out: any, status = 200) => res.status(status).json({ ...out, request_id: req.requestId });

  // ======================================================================
  // REST routes (registered BEFORE the generic /leads/:id routes)
  // ======================================================================
  app.get(`${BASE}/summary`, guard("leads:read"), route("leads:read", async (req, res) => ok(req, res, await ops.summary(req.tenantId))));

  app.get(`${BASE}/campaigns`, guard("campaigns:read"), route("", async (req, res) => ok(req, res, await ops.listCampaigns(req.tenantId, req.query))));
  app.get(`${BASE}/campaigns/:id`, guard("campaigns:read"), route("", async (req, res) => ok(req, res, await ops.getCampaign(req.tenantId, req.params.id))));
  app.get(`${BASE}/campaigns/:id/results`, guard("campaigns:read"), route("", async (req, res) => ok(req, res, await ops.campaignResults(req.tenantId, req.params.id, String(req.query.include) === "recipients"))));
  app.post(`${BASE}/campaigns`, guard("campaigns:write"), route("", async (req, res) => ok(req, res, await ops.createCampaign(req.tenantId, req.body, actor(req), req.key.id, req.requestId), 201)));
  app.patch(`${BASE}/campaigns/:id`, guard("campaigns:write"), route("", async (req, res) => ok(req, res, await ops.updateCampaign(req.tenantId, req.params.id, req.body, actor(req), req.key.id, req.requestId))));
  for (const action of ["pause", "resume", "archive"] as const)
    app.post(`${BASE}/campaigns/:id/${action}`, guard("campaigns:write"), route("", async (req, res) => ok(req, res, await ops.setCampaignStatus(req.tenantId, req.params.id, action, actor(req), req.key.id, req.requestId))));
  app.delete(`${BASE}/campaigns/:id`, guard("campaigns:delete"), route("", async (req, res) => ok(req, res, await ops.deleteCampaign(req.tenantId, req.params.id, req.body?.confirm === true || String(req.query.confirm) === "true", actor(req), req.key.id, req.requestId))));

  app.post(
    `${BASE}/leads/import`,
    guard("leads:import"),
    route("", async (req, res) => {
      const idem = String(req.headers["idempotency-key"] || "").slice(0, 120);
      const hash = sha256(JSON.stringify(req.body ?? {}));
      if (idem) {
        const { data: prev } = await db().from("connect_idempotency").select("*").eq("key_id", req.key.id).eq("idem_key", idem).maybeSingle();
        if (prev) {
          if (prev.request_hash !== hash) throw new ApiErr(422, "idempotency_conflict", "This Idempotency-Key was already used with a different request body.");
          res.setHeader("Idempotent-Replayed", "true");
          return res.status(prev.status).json(prev.response);
        }
      }
      const out = await ops.importLeads(req.tenantId, req.body, actor(req), req.key.id, req.requestId);
      const payload = { ...out, request_id: req.requestId };
      if (idem && !out.data.dry_run) await db().from("connect_idempotency").insert({ key_id: req.key.id, idem_key: idem, request_hash: hash, status: 200, response: payload });
      res.json(payload);
    })
  );

  app.get(
    `${BASE}/leads/export`,
    guard("leads:export"),
    route("", async (req, res) => {
      const out = await ops.exportLeads(req.tenantId, req.query);
      await audit(req.tenantId, req.key.id, actor(req), "lead.export", "leads", null, req.requestId, { rows: out.rows.length });
      if (String(req.query.format) === "csv") {
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("X-Next-Cursor", out.next_cursor || "");
        return res.send(toCsv(out.rows, out.cols));
      }
      ok(req, res, { data: out.rows, next_cursor: out.next_cursor, has_more: !!out.next_cursor });
    })
  );

  // ======================================================================
  // MCP server (Streamable HTTP, stateless, JSON responses)
  // ======================================================================
  const STR = { type: "string" };
  const tools: { name: string; scope: string; description: string; inputSchema: any; run: (req: any, a: any) => Promise<any> }[] = [
    { name: "workspace_summary", scope: "leads:read", description: "Headline numbers: leads by status, open pipeline value, overdue tasks, campaigns by status.", inputSchema: { type: "object", properties: {} }, run: (r) => ops.summary(r.tenantId) },
    { name: "search_leads", scope: "leads:read", description: "Search leads. Optional filters: q (name/company/email), status, priority, country, city, industry, source, salesperson, page, per_page.", inputSchema: { type: "object", properties: { q: STR, status: STR, priority: STR, country: STR, city: STR, industry: STR, source: STR, salesperson: STR, page: { type: "number" }, per_page: { type: "number" } } }, run: (r, a) => ops.listRecords(r.tenantId, "leads", a) },
    { name: "get_lead", scope: "leads:read", description: "Get one lead by id.", inputSchema: { type: "object", properties: { id: STR }, required: ["id"] }, run: (r, a) => ops.getRecord(r.tenantId, "leads", String(a.id)) },
    { name: "create_lead", scope: "leads:write", description: "Create a lead. Fields: " + ENTITIES.leads.writable.join(", ") + " (name required).", inputSchema: { type: "object", properties: { fields: { type: "object" } }, required: ["fields"] }, run: (r, a) => ops.writeRecord(r.tenantId, "leads", null, a.fields, actor(r), r.key.id, r.requestId) },
    { name: "update_lead", scope: "leads:write", description: "Update fields on a lead.", inputSchema: { type: "object", properties: { id: STR, fields: { type: "object" } }, required: ["id", "fields"] }, run: (r, a) => ops.writeRecord(r.tenantId, "leads", String(a.id), a.fields, actor(r), r.key.id, r.requestId) },
    { name: "import_leads", scope: "leads:import", description: `Bulk import up to ${MAX_IMPORT_ROWS} leads from rows (array of objects) or csv text. Always run once with dry_run=true first and show the preview. Dedupes by email; on_duplicate is "skip" (default) or "update". Optional group_id adds imported leads to a group.`, inputSchema: { type: "object", properties: { rows: { type: "array", items: { type: "object" } }, csv: STR, dry_run: { type: "boolean" }, on_duplicate: { type: "string", enum: ["skip", "update"] }, group_id: STR } }, run: (r, a) => ops.importLeads(r.tenantId, a, actor(r), r.key.id, r.requestId) },
    { name: "export_leads", scope: "leads:export", description: "Export leads (max 1000 per call) as JSON. Pass the returned next_cursor to continue. Filters: status, priority, country, city, industry, source, salesperson, group_id, updated_since.", inputSchema: { type: "object", properties: { limit: { type: "number" }, cursor: STR, status: STR, priority: STR, country: STR, city: STR, industry: STR, source: STR, salesperson: STR, group_id: STR, updated_since: STR } }, run: async (r, a) => { const o = await ops.exportLeads(r.tenantId, a); await audit(r.tenantId, r.key.id, actor(r), "lead.export", "leads", null, r.requestId, { rows: o.rows.length, via: "mcp" }); return { data: o.rows, next_cursor: o.next_cursor }; } },
    { name: "list_campaigns", scope: "campaigns:read", description: "List email campaigns (status filter: Draft, Active, Paused, Completed).", inputSchema: { type: "object", properties: { status: STR, page: { type: "number" }, per_page: { type: "number" } } }, run: (r, a) => ops.listCampaigns(r.tenantId, a) },
    { name: "get_campaign", scope: "campaigns:read", description: "Get a campaign with its full email sequence.", inputSchema: { type: "object", properties: { id: STR }, required: ["id"] }, run: (r, a) => ops.getCampaign(r.tenantId, String(a.id)) },
    { name: "campaign_results", scope: "campaigns:read", description: "Per-step results for a campaign: sent, failed, due, replied. include_recipients=true adds per-recipient outcomes.", inputSchema: { type: "object", properties: { id: STR, include_recipients: { type: "boolean" } }, required: ["id"] }, run: (r, a) => ops.campaignResults(r.tenantId, String(a.id), a.include_recipients === true) },
    { name: "create_campaign_draft", scope: "campaigns:write", description: "Create a DRAFT email campaign (nothing is sent). steps: [{subject, body, delay_days}] (1-8; body may use {{firstName}}, {{company}}, {{jobTitle}}). Audience via audience_ids and/or group_id. A person launches it inside AarPex.", inputSchema: { type: "object", properties: { name: STR, steps: { type: "array", items: { type: "object" } }, audience_ids: { type: "array", items: STR }, group_id: STR, mailbox_id: STR, notes: STR }, required: ["name", "steps"] }, run: (r, a) => ops.createCampaign(r.tenantId, a, actor(r), r.key.id, r.requestId) },
    { name: "update_campaign_draft", scope: "campaigns:write", description: "Edit a DRAFT campaign (name, notes, steps, audience_ids).", inputSchema: { type: "object", properties: { id: STR, name: STR, notes: STR, steps: { type: "array", items: { type: "object" } }, audience_ids: { type: "array", items: STR } }, required: ["id"] }, run: (r, a) => { const { id, ...rest } = a; return ops.updateCampaign(r.tenantId, String(id), rest, actor(r), r.key.id, r.requestId); } },
    { name: "pause_campaign", scope: "campaigns:write", description: "Pause an Active campaign.", inputSchema: { type: "object", properties: { id: STR }, required: ["id"] }, run: (r, a) => ops.setCampaignStatus(r.tenantId, String(a.id), "pause", actor(r), r.key.id, r.requestId) },
    { name: "resume_campaign", scope: "campaigns:write", description: "Resume a Paused campaign.", inputSchema: { type: "object", properties: { id: STR }, required: ["id"] }, run: (r, a) => ops.setCampaignStatus(r.tenantId, String(a.id), "resume", actor(r), r.key.id, r.requestId) },
    { name: "archive_campaign", scope: "campaigns:write", description: "Archive a campaign (marks it Completed so no further follow-ups run).", inputSchema: { type: "object", properties: { id: STR }, required: ["id"] }, run: (r, a) => ops.setCampaignStatus(r.tenantId, String(a.id), "archive", actor(r), r.key.id, r.requestId) },
    { name: "list_deals", scope: "deals:read", description: "List deals (filters: status, pipeline_id, stage_id, salesperson, q).", inputSchema: { type: "object", properties: { q: STR, status: STR, pipeline_id: STR, stage_id: STR, salesperson: STR, page: { type: "number" } } }, run: (r, a) => ops.listRecords(r.tenantId, "deals", a) },
    { name: "list_tasks", scope: "tasks:read", description: "List tasks (filters: status, priority, assigned_user, deal_id, q).", inputSchema: { type: "object", properties: { q: STR, status: STR, priority: STR, assigned_user: STR, deal_id: STR, page: { type: "number" } } }, run: (r, a) => ops.listRecords(r.tenantId, "tasks", a) },
    { name: "create_task", scope: "tasks:write", description: "Create a task. Fields: " + ENTITIES.tasks.writable.join(", ") + " (title required).", inputSchema: { type: "object", properties: { fields: { type: "object" } }, required: ["fields"] }, run: (r, a) => ops.writeRecord(r.tenantId, "tasks", null, a.fields, actor(r), r.key.id, r.requestId) },
  ];

  const rpcErr = (id: any, code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
  const mcpHandler = async (req: any, res: express.Response) => {
    req.requestId = req.requestId || "req_" + sha256(String(Math.random()) + Date.now()).slice(0, 12);
    const handle = async (m: any): Promise<any | null> => {
      if (!m || m.jsonrpc !== "2.0" || typeof m.method !== "string") return rpcErr(m?.id, -32600, "Invalid request");
      const isNote = m.id === undefined || m.id === null;
      switch (m.method) {
        case "initialize":
          return { jsonrpc: "2.0", id: m.id, result: { protocolVersion: ["2025-06-18", "2025-03-26", "2024-11-05"].includes(m.params?.protocolVersion) ? m.params.protocolVersion : "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "aarpex", version: "1.0.0" }, instructions: "AarPex CRM for one workspace. Manage and read only: campaigns are created as drafts and are never sent through this connector. Run import_leads with dry_run=true first." } };
        case "ping":
          return { jsonrpc: "2.0", id: m.id, result: {} };
        case "tools/list":
          return { jsonrpc: "2.0", id: m.id, result: { tools: tools.filter((t) => hasScope(req, t.scope)).map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) } };
        case "tools/call": {
          const tool = tools.find((t) => t.name === m.params?.name);
          if (!tool) return rpcErr(m.id, -32602, "Unknown tool");
          if (!hasScope(req, tool.scope)) return { jsonrpc: "2.0", id: m.id, result: { isError: true, content: [{ type: "text", text: `This key does not have the "${tool.scope}" scope.` }] } };
          try {
            const out = await tool.run(req, m.params?.arguments || {});
            return { jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: JSON.stringify(out, null, 1).slice(0, 200000) }] } };
          } catch (e: any) {
            return { jsonrpc: "2.0", id: m.id, result: { isError: true, content: [{ type: "text", text: e instanceof ApiErr ? `${e.code}: ${e.message}` : "Server error" }] } };
          }
        }
        default:
          return isNote ? null : rpcErr(m.id, -32601, "Method not found");
      }
    };
    const body = req.body;
    if (Array.isArray(body)) {
      const outs = (await Promise.all(body.map(handle))).filter(Boolean);
      return outs.length ? res.json(outs) : res.status(202).end();
    }
    const out = await handle(body);
    return out ? res.json(out) : res.status(202).end();
  };
  app.post("/api/mcp", guard(null), mcpHandler);
  app.get("/api/mcp", (_req, res) => res.status(405).set("Allow", "POST").json({ error: "This MCP endpoint is stateless: use POST." }));
  app.delete("/api/mcp", (_req, res) => res.status(405).set("Allow", "POST").end());
}
