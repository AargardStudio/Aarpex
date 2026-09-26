/**
 * Supabase persistence layer for tenant CRM data.
 *
 * Design: rather than converting every individual add/update/delete call
 * throughout CRMContext.tsx into an async Supabase call (high risk of
 * breaking the existing UI, which expects synchronous state updates), this
 * module mirrors each entity ARRAY to its Supabase table as a whole whenever
 * that array changes in React state — the same moment CRMContext already
 * writes it to localStorage. It upserts every row currently in state and
 * deletes any row that used to exist for this tenant but no longer does.
 *
 * This is intentionally a "mirror sync", not incremental replication: it's
 * simple, hard to get subtly wrong, and correct for a single-editor-at-a-time
 * usage pattern. It is NOT safe for two people editing the same tenant's
 * data at the same moment from different browsers (last write wins, and a
 * slow client can clobber a faster one) — real-time collaborative editing
 * would need a follow-up pass (Supabase Realtime + per-row upserts keyed off
 * the actual CRUD calls instead of whole-array diffing).
 *
 * localStorage is only an offline cache here — Supabase is the source of
 * truth for every tenant's CRM records once configured. There is no demo
 * dataset anymore: every workspace is real, created through sign-up.
 */
import { getSupabaseAuthClient, isSupabaseAuthConfigured } from "../config/supabaseAuthClient";
import type { Tenant, TenantMember, TenantStripeConfig, TenantWebmailConfig, TenantWhatsAppConfig } from "../types";

export type TenantTable =
  | "companies"
  | "contacts"
  | "leads"
  | "deals"
  | "pipelines"
  | "invoices"
  | "payments"
  | "activities"
  | "tasks"
  | "comments"
  | "email_campaigns"
  | "products"
  | "knowledge_base"
  | "industry_playbooks";

// camelCase -> snake_case, applied to every key of every object.
function toSnakeCase(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function toCamelCase(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

// Per-table field-name exceptions where the DB column doesn't match the
// mechanical camelCase<->snake_case conversion of the app's field name.
const FIELD_OVERRIDES: Partial<Record<TenantTable, Record<string, string>>> = {
  leads: { createdDate: "created_at" },
  deals: { createdDate: "created_at" },
  comments: { timestamp: "created_at" },
  email_campaigns: { createdDate: "created_at" },
};

// Fields that exist on the app object but are purely derived/computed and
// should never be written to or read from the database.
const OMIT_FIELDS: Partial<Record<TenantTable, string[]>> = {
  deals: ["weightedValue"],
  companies: [
    "totalRevenue",
    "totalInvoiced",
    "totalPaid",
    "outstandingBalance",
    "overdueBalance",
    "averagePaymentDays",
    "dealsCount",
    "openDealsCount",
    "wonDealsCount",
    "lostDealsCount",
    "lastActivityDate",
    "nextActivityDate",
  ],
};

function toRow(table: TenantTable, tenantId: string, obj: Record<string, any>): Record<string, any> {
  const overrides = FIELD_OVERRIDES[table] || {};
  const omit = new Set(OMIT_FIELDS[table] || []);
  const row: Record<string, any> = { tenant_id: tenantId };
  for (const [key, value] of Object.entries(obj)) {
    if (omit.has(key)) continue;
    if (value === undefined) continue;
    const column = overrides[key] || toSnakeCase(key);
    row[column] = value;
  }
  return row;
}

function fromRow(table: TenantTable, row: Record<string, any>): Record<string, any> {
  const overrides = FIELD_OVERRIDES[table] || {};
  const reverseOverrides: Record<string, string> = {};
  for (const [camel, column] of Object.entries(overrides)) {
    reverseOverrides[column] = camel;
  }
  const obj: Record<string, any> = {};
  for (const [column, value] of Object.entries(row)) {
    if (column === "tenant_id") continue;
    const key = reverseOverrides[column] || toCamelCase(column);
    obj[key] = value;
  }
  if (table === "deals" && typeof obj.dealValue === "number" && typeof obj.probability === "number") {
    obj.weightedValue = (obj.dealValue * obj.probability) / 100;
  }
  return obj;
}

// Debounce per (table, tenantId) so rapid successive state changes (e.g.
// typing in a form that updates context on every keystroke) collapse into
// one sync call instead of one network round-trip per keystroke.
//
// Each entry also keeps a `run` closure so a still-pending (not yet fired)
// write can be flushed on demand -- see flushAllPendingSyncs below. This
// matters because the 800ms debounce window is a real race against signing
// out: Supabase's auth.signOut() invalidates the client's session token
// immediately, so if the debounced write fires even slightly *after* that
// (which it will, if a user syncs something and clicks "Sign out" a moment
// later), the request goes out unauthenticated, RLS silently rejects it,
// and the just-synced data never reaches Supabase at all -- it looks fine
// in the browser (state + localStorage) but is gone the next time the user
// signs back in, since Supabase is the source of truth on load.
const pendingSyncs = new Map<string, { timeoutId: ReturnType<typeof setTimeout>; run: () => Promise<void> }>();

export function syncTenantTable(table: TenantTable, tenantId: string, rows: Array<Record<string, any>>): void {
  if (!isSupabaseAuthConfigured() || !tenantId) return;

  const debounceKey = `${table}:${tenantId}`;
  const existing = pendingSyncs.get(debounceKey);
  if (existing) clearTimeout(existing.timeoutId);

  const run = async () => {
    pendingSyncs.delete(debounceKey);
    await performSync(table, tenantId, rows);
  };

  const timeoutId = setTimeout(() => {
    void run();
  }, 800);

  pendingSyncs.set(debounceKey, { timeoutId, run });
}

/**
 * Immediately runs every debounced table sync that hasn't fired yet, in
 * parallel, and waits for all of them to finish. Call this BEFORE ending
 * the Supabase auth session (sign-out) or navigating away, so a write
 * queued moments earlier (e.g. "Sync All to Companies/Contacts" followed
 * right away by "Sign out") actually lands instead of silently racing the
 * session invalidation and getting rejected by RLS.
 */
export async function flushAllPendingSyncs(): Promise<void> {
  const pending = [...pendingSyncs.values(), ...pendingTenantRowSyncs.values()];
  for (const p of pending) clearTimeout(p.timeoutId);
  await Promise.all(pending.map((p) => p.run()));
}

// Which other tables' pending syncs must be flushed first, keyed by table.
// companies/contacts are synced on their own independent 800ms debounce
// timers, same as every other table -- so under normal network jitter a
// dependent table's write can reach Postgres before its FK target finishes
// syncing. That's a real, reproducible foreign-key violation (e.g. a
// contact's company_id, or a lead's linked_company_id/linked_contact_id,
// pointing at a row that doesn't exist in Supabase yet), rejected silently
// and never retried -- data that looked fully synced in the browser simply
// never reaches the database. Deals/invoices/payments/activities/tasks all
// carry company_id and/or contact_id too.
const SYNC_DEPENDENCIES: Partial<Record<TenantTable, TenantTable[]>> = {
  contacts: ["companies"],
  leads: ["companies", "contacts"],
  deals: ["companies", "contacts"],
  invoices: ["companies", "contacts"],
  payments: ["companies"],
  activities: ["companies", "contacts"],
  tasks: ["companies", "contacts"],
};

export interface SyncFailure {
  table: TenantTable;
  tenantId: string;
  failedCount: number;
  totalCount: number;
  sample: Array<{ id: any; error: string }>;
  // "upsert" (default if omitted): failedCount/totalCount are row counts.
  // "delete": this table's cleanup pass couldn't remove some already-stale
  // rows -- nothing new was lost, but Supabase may show extra rows for a
  // while. failedCount/totalCount there are CHUNK counts, not row counts.
  kind?: "upsert" | "delete";
}

// Every sync failure used to go to console.error only -- invisible to
// anyone without devtools open, which is exactly why "some records didn't
// save" reports kept requiring a screenshot-by-screenshot investigation.
// CRMContext subscribes to this so failures show up as a real, visible
// audit-log entry in the app instead.
const syncFailureListeners: Array<(failure: SyncFailure) => void> = [];

export function onSyncFailure(listener: (failure: SyncFailure) => void): () => void {
  syncFailureListeners.push(listener);
  return () => {
    const idx = syncFailureListeners.indexOf(listener);
    if (idx >= 0) syncFailureListeners.splice(idx, 1);
  };
}

function notifySyncFailure(failure: SyncFailure): void {
  for (const listener of syncFailureListeners) {
    try {
      listener(failure);
    } catch {
      // A listener throwing must never break the sync itself.
    }
  }
}

const UPSERT_CHUNK_SIZE = 200;

/**
 * Upserts rows in chunks rather than one giant call, so a single malformed
 * row doesn't fail the entire batch atomically. If a chunk fails, it's
 * retried one row at a time to isolate exactly which row(s) are bad --
 * everything else in that chunk still gets saved. Returns the rows that
 * genuinely could not be saved, with Postgres's own error message for each.
 */
async function upsertRowsResilient(
  supabase: ReturnType<typeof getSupabaseAuthClient>,
  table: TenantTable,
  dbRows: Array<Record<string, any>>
): Promise<Array<{ id: any; error: string }>> {
  const failures: Array<{ id: any; error: string }> = [];
  for (let i = 0; i < dbRows.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = dbRows.slice(i, i + UPSERT_CHUNK_SIZE);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict: "id" });
    if (!error) continue;

    // The whole chunk was rejected -- narrow down which row(s) actually
    // caused it rather than dropping every row in the chunk.
    for (const row of chunk) {
      const { error: rowError } = await supabase.from(table).upsert([row], { onConflict: "id" });
      if (rowError) {
        failures.push({ id: row.id, error: rowError.message });
      }
    }
  }
  return failures;
}

async function performSync(table: TenantTable, tenantId: string, rows: Array<Record<string, any>>): Promise<void> {
  try {
    // Flush this table's dependencies out of turn first, so its sync always
    // lands after the rows it references.
    const deps = SYNC_DEPENDENCIES[table];
    if (deps) {
      for (const dep of deps) {
        const depKey = `${dep}:${tenantId}`;
        const pendingDep = pendingSyncs.get(depKey);
        if (pendingDep) {
          pendingSyncs.delete(depKey);
          clearTimeout(pendingDep.timeoutId);
          await pendingDep.run();
        }
      }
    }

    const supabase = getSupabaseAuthClient();
    const dbRows = rows.filter((r) => r && r.id).map((r) => toRow(table, tenantId, r));

    if (dbRows.length > 0) {
      // A single bad row anywhere in the batch (a bulk import with one
      // malformed record, say) used to fail the ENTIRE upsert atomically --
      // e.g. syncing 576 leads because one of 450 newly-imported rows
      // violated a constraint would silently save NONE of them, including
      // ones that were otherwise perfectly fine. Upsert in chunks, and on a
      // chunk failure retry it row-by-row so only the actually-bad row(s)
      // are skipped instead of losing the whole batch.
      const failures = await upsertRowsResilient(supabase, table, dbRows);
      if (failures.length > 0) {
        const summary = `${failures.length} of ${dbRows.length} ${table} record(s) failed to save`;
        console.error(`[tenantDataSync] ${summary}:`, failures.slice(0, 5));
        notifySyncFailure({ table, tenantId, failedCount: failures.length, totalCount: dbRows.length, sample: failures.slice(0, 3) });
      }
    }

    // Remove rows that no longer exist locally for this tenant.
    //
    // CRITICAL SAFETY NET: an empty `rows` array must NEVER translate into
    // "delete every row for this tenant in this table". This used to be
    // exactly what happened -- when keepIds.length was 0, the delete filter
    // below was simply never added, leaving `delete().eq("tenant_id",
    // tenantId)` with nothing else scoping it, so it wiped the ENTIRE table
    // for that tenant. `rows` reflects whatever happens to be in React
    // state at the moment this debounced call fires -- which is legitimately
    // empty for a split second on every sign-in, tenant switch, or page
    // load, before the Supabase fetch that hydrates it has resolved. That
    // race is exactly how "sync, then sign out/in" (or even just re-opening
    // the app) could silently mass-delete companies/contacts/leads that had
    // synced fine moments earlier.
    //
    // The trade-off accepted here: if a tenant's very last remaining row in
    // a table is deleted locally, that row is NOT cleaned up from Supabase
    // by this pass (it becomes a harmless "zombie" until another row is
    // added and later removed, which re-triggers a normal non-empty diff).
    // That's a far smaller, recoverable issue than mass data loss.
    const keepIds = rows.map((r) => r.id).filter(Boolean);
    if (keepIds.length > 0) {
      // Previously this issued ONE delete with a `.not("id", "in", "(...)")`
      // filter listing every kept id as a quoted literal embedded directly
      // in the request URL's query string. That's fine for a handful of
      // rows, but for a few hundred (exactly the bulk-import batches this
      // app needs to handle -- e.g. 210+ companies from a 625-lead sync)
      // that filter value runs to several KB once each id is quoted and
      // URL-encoded, which can exceed what some proxies/CDNs will pass
      // through untouched. When that happens the request can fail, or be
      // silently mangled, in a way that isn't a clean Postgres error and
      // can misbehave rather than just no-op -- a plausible cause of rows
      // that synced fine moments earlier vanishing after a reload with
      // nothing useful in the logs.
      //
      // Instead: fetch which ids actually exist in Supabase for this
      // tenant/table right now, diff that against keepIds ourselves in JS,
      // and only ever send explicit, bounded `.in("id", chunk)` deletes for
      // the (usually few, sometimes zero) ids that are genuinely excess.
      // This never builds an unbounded filter string, and each chunk is a
      // normal, safely-encoded supabase-js call instead of a hand-built one.
      const { data: existingIdRows, error: idsError } = await supabase
        .from(table)
        .select("id")
        .eq("tenant_id", tenantId);

      if (idsError) {
        console.error(`[tenantDataSync] could not read existing ids for ${table}:`, idsError.message);
      } else {
        const keepIdSet = new Set(keepIds);
        const idsToDelete = (existingIdRows || [])
          .map((r) => r.id)
          .filter((id) => id && !keepIdSet.has(id));

        if (idsToDelete.length > 0) {
          const DELETE_CHUNK_SIZE = 200;
          const deleteFailures: Array<{ id: any; error: string }> = [];
          for (let i = 0; i < idsToDelete.length; i += DELETE_CHUNK_SIZE) {
            const chunk = idsToDelete.slice(i, i + DELETE_CHUNK_SIZE);
            const { error: deleteError } = await supabase
              .from(table)
              .delete()
              .eq("tenant_id", tenantId)
              .in("id", chunk);
            if (deleteError) {
              console.error(`[tenantDataSync] cleanup delete failed for ${table}:`, deleteError.message);
              deleteFailures.push({ id: `${chunk.length} row(s)`, error: deleteError.message });
            }
          }
          if (deleteFailures.length > 0) {
            notifySyncFailure({
              table,
              tenantId,
              failedCount: deleteFailures.length,
              totalCount: Math.ceil(idsToDelete.length / DELETE_CHUNK_SIZE),
              sample: deleteFailures.slice(0, 3),
              kind: "delete",
            });
          }
        }
      }
    }
  } catch (err) {
    console.error(`[tenantDataSync] sync failed for ${table}:`, err);
  }
}

export async function fetchTenantTable<T = any>(table: TenantTable, tenantId: string): Promise<T[] | null> {
  if (!isSupabaseAuthConfigured() || !tenantId) return null;
  try {
    const supabase = getSupabaseAuthClient();
    const { data, error } = await supabase.from(table).select("*").eq("tenant_id", tenantId);
    if (error) {
      console.error(`[tenantDataSync] fetch failed for ${table}:`, error.message);
      return null;
    }
    return (data || []).map((row) => fromRow(table, row)) as T[];
  } catch (err) {
    console.error(`[tenantDataSync] fetch failed for ${table}:`, err);
    return null;
  }
}

export interface CreateTenantWithOwnerArgs {
  id: string;
  name: string;
  industry?: string;
  currency?: string;
  companyName?: string;
  taxId?: string;
  commissionRate?: number;
  ownerName: string;
  ownerEmail: string;
}

// Row shape returned by the create_tenant_with_owner() Postgres function —
// snake_case columns from the tenants table.
export interface SupabaseTenantRow {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  industry: string | null;
  currency: string;
  owner_email: string;
  plan: string;
  company_name: string;
  tax_id: string;
  commission_rate: number;
  created_at: string;
}

/**
 * Creates a tenant + its owner membership atomically via the
 * create_tenant_with_owner() SECURITY DEFINER function (see
 * supabase/migrations/0001_aarpex_schema.sql). Returns null on failure or
 * when Supabase isn't configured, so callers can fall back to the existing
 * local-only tenant creation.
 */
export async function createTenantWithOwner(args: CreateTenantWithOwnerArgs): Promise<SupabaseTenantRow | null> {
  if (!isSupabaseAuthConfigured()) return null;
  try {
    const supabase = getSupabaseAuthClient();
    const { data, error } = await supabase.rpc("create_tenant_with_owner", {
      p_name: args.name,
      p_industry: args.industry || null,
      p_currency: args.currency || "USD",
      p_company_name: args.companyName || args.name,
      p_tax_id: args.taxId || "",
      p_commission_rate: args.commissionRate ?? 10,
      p_owner_name: args.ownerName,
      p_owner_email: args.ownerEmail,
      p_id: args.id,
    });
    if (error) {
      // A duplicate-key error here means this tenant id was already created
      // by an earlier attempt (e.g. a previous retry that actually
      // succeeded server-side but whose response was lost to a network
      // hiccup) — treat that as success rather than a failure to retry
      // forever.
      if ((error as any).code === "23505" || /duplicate key/i.test(error.message || "")) {
        return { id: args.id } as SupabaseTenantRow;
      }
      console.error("[tenantDataSync] create_tenant_with_owner failed:", error.message);
      return null;
    }
    return data as SupabaseTenantRow;
  } catch (err) {
    console.error("[tenantDataSync] create_tenant_with_owner failed:", err);
    return null;
  }
}

// ----------------------------------------------------------------------------
// Pending tenant-creation queue.
//
// createTenant() in CRMContext adds a new workspace to local state/localStorage
// immediately (so the UI never blocks on network latency), then fires the
// Supabase create_tenant_with_owner() RPC in the background. If that RPC call
// fails silently (offline, a dropped connection, a transient Supabase error)
// the workspace only ever exists locally — and since the session-bootstrap
// effect treats Supabase as the source of truth on every reload, that
// workspace would otherwise vanish forever the next time the app loads.
//
// This queue persists every not-yet-confirmed tenant creation to localStorage
// so it can be retried on the very next app load (and periodically while the
// app is open) until it actually lands in Supabase — instead of being lost
// the moment the page reloads.
// ----------------------------------------------------------------------------
const PENDING_QUEUE_KEY = "crm_pending_tenant_creations_v1";

function readPendingQueue(): CreateTenantWithOwnerArgs[] {
  try {
    const raw = localStorage.getItem(PENDING_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePendingQueue(queue: CreateTenantWithOwnerArgs[]): void {
  try {
    localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // best-effort only
  }
}

/** Records a tenant creation that hasn't been confirmed in Supabase yet. */
export function savePendingTenantCreation(args: CreateTenantWithOwnerArgs): void {
  const queue = readPendingQueue().filter((q) => q.id !== args.id);
  queue.push(args);
  writePendingQueue(queue);
}

/** Marks a tenant creation as confirmed, removing it from the retry queue. */
export function clearPendingTenantCreation(id: string): void {
  const queue = readPendingQueue().filter((q) => q.id !== id);
  writePendingQueue(queue);
}

/** Whether any tenant creations are still waiting to be confirmed in Supabase. */
export function hasPendingTenantCreations(): boolean {
  return readPendingQueue().length > 0;
}

/**
 * Retries every not-yet-confirmed tenant creation still in the queue. Safe to
 * call repeatedly (e.g. on every app load, and after any failed hydrate) —
 * successes are removed from the queue, failures stay queued for next time.
 * Returns the ids that were successfully confirmed in this pass.
 */
export async function flushPendingTenantCreations(): Promise<string[]> {
  if (!isSupabaseAuthConfigured()) return [];
  const queue = readPendingQueue();
  if (queue.length === 0) return [];

  const confirmed: string[] = [];
  for (const args of queue) {
    const result = await createTenantWithOwner(args);
    if (result) {
      confirmed.push(args.id);
      clearPendingTenantCreation(args.id);
    }
  }
  return confirmed;
}

/** Fetches the list of tenants (workspaces) the signed-in user belongs to. */
export async function fetchMyTenants(): Promise<SupabaseTenantRow[] | null> {
  if (!isSupabaseAuthConfigured()) return null;
  try {
    const supabase = getSupabaseAuthClient();
    const { data, error } = await supabase.from("tenants").select("*").order("created_at", { ascending: true });
    if (error) {
      console.error("[tenantDataSync] fetchMyTenants failed:", error.message);
      return null;
    }
    return data as SupabaseTenantRow[];
  } catch (err) {
    console.error("[tenantDataSync] fetchMyTenants failed:", err);
    return null;
  }
}

// Debounced update of the tenants row itself (name, plan, Stripe/webmail
// config, etc.) — separate from syncTenantTable above, which only handles
// the CRM record tables. Member roster changes are NOT handled here; that
// needs its own tenant_members write path (not yet built — see the
// deployment-readiness notes).
const pendingTenantRowSyncs = new Map<string, { timeoutId: ReturnType<typeof setTimeout>; run: () => Promise<void> }>();

export function syncTenantRow(tenant: Tenant): void {
  if (!isSupabaseAuthConfigured() || !tenant?.id) return;

  const existing = pendingTenantRowSyncs.get(tenant.id);
  if (existing) clearTimeout(existing.timeoutId);

  const run = async () => {
    pendingTenantRowSyncs.delete(tenant.id);
    await performTenantRowSync(tenant);
  };

  const timeoutId = setTimeout(() => {
    void run();
  }, 800);

  pendingTenantRowSyncs.set(tenant.id, { timeoutId, run });
}

async function performTenantRowSync(tenant: Tenant): Promise<void> {
  try {
    const supabase = getSupabaseAuthClient();
    const { error } = await supabase
      .from("tenants")
      .update({
        name: tenant.name,
        logo: tenant.logo || null,
        industry: tenant.industry || null,
        currency: tenant.currency,
        plan: tenant.plan,
        subscription_status: tenant.subscriptionStatus || null,
        billing_cycle: tenant.billingCycle || null,
        subscription_price: tenant.subscriptionPrice ?? null,
        next_billing_date: tenant.nextBillingDate || null,
        subscription_id: tenant.subscriptionId || null,
        card_last4: tenant.cardLast4 || null,
        card_brand: tenant.cardBrand || null,
        seats_allocated: tenant.seatsAllocated ?? null,
        company_name: tenant.companyName,
        tax_id: tenant.taxId,
        commission_rate: tenant.commissionRate,
        stripe_config: tenant.stripeConfig,
        // Stored as a JSON array (one entry per connected mailbox) now that
        // a tenant can have more than one -- see the migration note above
        // DEFAULT_WEBMAIL_CONFIG. The column itself is unchanged (still the
        // same `webmail_config jsonb` column from 0001_aarpex_schema.sql),
        // it just now holds an array instead of a single object.
        webmail_config: tenant.webmailConfigs || [],
        whatsapp_config: tenant.whatsappConfig || {},
      })
      .eq("id", tenant.id);
    if (error) {
      console.error("[tenantDataSync] tenant row update failed:", error.message);
    }
  } catch (err) {
    console.error("[tenantDataSync] tenant row update failed:", err);
  }
}

/**
 * Permanently deletes a tenant/workspace row in Supabase. RLS only allows
 * this when the caller is an admin member of that tenant (see the
 * tenants_delete policy in 0001_aarpex_schema.sql), and every CRM record
 * table has `tenant_id ... references public.tenants(id) on delete
 * cascade` -- so this one delete also removes all of that workspace's
 * companies/contacts/leads/deals/etc. and its tenant_members rows.
 *
 * Returns true when Supabase isn't configured (nothing to delete server-side,
 * local-only demo mode), so callers in that mode still proceed with a
 * local-only delete exactly as before. Returns false on any real failure --
 * callers MUST treat that as "not actually deleted" and keep the tenant in
 * local state, otherwise it silently reappears on the next hydrate/reload
 * (which is exactly the bug this function fixes).
 */
export async function deleteTenantServerSide(tenantId: string): Promise<boolean> {
  if (!isSupabaseAuthConfigured()) return true;
  try {
    const supabase = getSupabaseAuthClient();
    const { error } = await supabase.from("tenants").delete().eq("id", tenantId);
    if (error) {
      console.error("[tenantDataSync] deleteTenantServerSide failed:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[tenantDataSync] deleteTenantServerSide failed:", err);
    return false;
  }
}

const DEFAULT_STRIPE_CONFIG: TenantStripeConfig = {
  isEnabled: false,
  publishableKey: "",
  secretKey: "",
  currency: "USD",
  isLiveMode: false,
  status: "unconfigured",
};

const DEFAULT_WHATSAPP_CONFIG: TenantWhatsAppConfig = {
  isEnabled: false,
  phoneNumberId: "",
  status: "unconfigured",
};

// Field defaults used to backfill a mailbox entry read back from Supabase
// (older rows, or ones created before a field existed, may be missing some
// of these). Deliberately has no `id` -- see webmailConfigsFromRow, which
// assigns one per entry as it maps the raw jsonb array/object into
// TenantWebmailConfig[].
const DEFAULT_WEBMAIL_CONFIG: Omit<TenantWebmailConfig, "id"> = {
  isEnabled: false,
  provider: "hostinger",
  email: "",
  displayName: "",
  password: "",
  smtpHost: "smtp.hostinger.com",
  smtpPort: 465,
  smtpEncryption: "SSL",
  imapHost: "imap.hostinger.com",
  imapPort: 993,
  imapEncryption: "SSL",
  status: "unconfigured",
};

/**
 * Reconstructs a tenant's mailbox list from the raw `webmail_config` jsonb
 * column, handling three shapes it may hold:
 *  - an array (the current shape) -- each entry backfilled with defaults
 *    and given a stable id/label/isDefault if it's somehow missing one.
 *  - a single object (the pre-multi-mailbox shape, from before this
 *    feature) -- migrated in place into a one-item array so a tenant that
 *    already had a mailbox configured doesn't lose it.
 *  - empty/null -- no mailboxes connected yet.
 */
function webmailConfigsFromRow(raw: unknown): TenantWebmailConfig[] {
  if (Array.isArray(raw)) {
    const configs: TenantWebmailConfig[] = raw.map((entry: any, idx: number) => ({
      ...DEFAULT_WEBMAIL_CONFIG,
      ...(entry || {}),
      id: entry?.id || `mbx_legacy_${idx}`,
      label: entry?.label || (idx === 0 ? "Primary Mailbox" : `Mailbox ${idx + 1}`),
    }));
    if (configs.length > 0 && !configs.some((m) => m.isDefault)) {
      configs[0] = { ...configs[0], isDefault: true };
    }
    return configs;
  }
  if (raw && typeof raw === "object" && Object.keys(raw).length > 0) {
    return [
      {
        ...DEFAULT_WEBMAIL_CONFIG,
        ...(raw as object),
        id: "mbx_legacy_primary",
        label: "Primary Mailbox",
        isDefault: true,
      },
    ];
  }
  return [];
}

/**
 * Fetches every workspace the signed-in user belongs to, as full local
 * Tenant objects (RLS on the tenants/tenant_members tables already limits
 * this to workspaces they're actually a member of — nothing else to filter
 * client-side). Each tenant's member roster is fetched alongside it.
 */
export async function fetchMyTenantsFull(): Promise<Tenant[] | null> {
  const rows = await fetchMyTenants();
  if (!rows) return null;
  if (rows.length === 0) return [];

  try {
    const supabase = getSupabaseAuthClient();
    const tenantIds = rows.map((r) => r.id);
    const { data: memberRows, error } = await supabase
      .from("tenant_members")
      .select("*")
      .in("tenant_id", tenantIds);
    if (error) {
      console.error("[tenantDataSync] fetching tenant_members failed:", error.message);
    }

    const membersByTenant = new Map<string, TenantMember[]>();
    for (const m of memberRows || []) {
      const list = membersByTenant.get(m.tenant_id as string) || [];
      list.push({
        userId: m.user_id as string,
        name: m.name as string,
        email: m.email as string,
        role: m.role as TenantMember["role"],
        joinedAt: m.joined_at as string,
      });
      membersByTenant.set(m.tenant_id as string, list);
    }

    return rows.map((r: any) => {
      const stripeConfig: TenantStripeConfig = {
        ...DEFAULT_STRIPE_CONFIG,
        ...(r.stripe_config || {}),
      };
      const webmailConfigs = webmailConfigsFromRow(r.webmail_config);
      // r.whatsapp_config is undefined until migration 0011 has been run on
      // this project's Supabase instance -- defaults to "unconfigured"
      // rather than throwing, same as every other optional tenant config.
      const whatsappConfig: TenantWhatsAppConfig = {
        ...DEFAULT_WHATSAPP_CONFIG,
        ...(r.whatsapp_config || {}),
      };
      const tenant: Tenant = {
        id: r.id,
        name: r.name,
        slug: r.slug,
        logo: r.logo || undefined,
        industry: r.industry || undefined,
        currency: r.currency,
        createdAt: r.created_at,
        ownerEmail: r.owner_email,
        plan: (r.plan as Tenant["plan"]) || "Growth",
        subscriptionStatus: r.subscription_status || undefined,
        billingCycle: r.billing_cycle || undefined,
        subscriptionPrice: r.subscription_price ?? undefined,
        nextBillingDate: r.next_billing_date || undefined,
        subscriptionId: r.subscription_id || undefined,
        cardLast4: r.card_last4 || undefined,
        cardBrand: r.card_brand || undefined,
        seatsAllocated: r.seats_allocated ?? undefined,
        companyName: r.company_name || r.name,
        taxId: r.tax_id || "",
        commissionRate: r.commission_rate ?? 10,
        members: membersByTenant.get(r.id) || [],
        stripeConfig,
        webmailConfigs,
        whatsappConfig,
      };
      return tenant;
    });
  } catch (err) {
    console.error("[tenantDataSync] fetchMyTenantsFull failed:", err);
    return null;
  }
}
