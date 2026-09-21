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
import type { Tenant, TenantMember, TenantStripeConfig, TenantWebmailConfig } from "../types";

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
  | "products";

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
const pendingSyncs = new Map<string, ReturnType<typeof setTimeout>>();

export function syncTenantTable(table: TenantTable, tenantId: string, rows: Array<Record<string, any>>): void {
  if (!isSupabaseAuthConfigured() || !tenantId) return;

  const debounceKey = `${table}:${tenantId}`;
  const existing = pendingSyncs.get(debounceKey);
  if (existing) clearTimeout(existing);

  pendingSyncs.set(
    debounceKey,
    setTimeout(() => {
      pendingSyncs.delete(debounceKey);
      void performSync(table, tenantId, rows);
    }, 800)
  );
}

async function performSync(table: TenantTable, tenantId: string, rows: Array<Record<string, any>>): Promise<void> {
  try {
    const supabase = getSupabaseAuthClient();
    const dbRows = rows.filter((r) => r && r.id).map((r) => toRow(table, tenantId, r));

    if (dbRows.length > 0) {
      const { error: upsertError } = await supabase.from(table).upsert(dbRows, { onConflict: "id" });
      if (upsertError) {
        console.error(`[tenantDataSync] upsert failed for ${table}:`, upsertError.message);
        return;
      }
    }

    // Remove rows that no longer exist locally for this tenant.
    const keepIds = rows.map((r) => r.id).filter(Boolean);
    let deleteQuery = supabase.from(table).delete().eq("tenant_id", tenantId);
    if (keepIds.length > 0) {
      deleteQuery = deleteQuery.not("id", "in", `(${keepIds.map((id) => `"${id}"`).join(",")})`);
    }
    const { error: deleteError } = await deleteQuery;
    if (deleteError) {
      console.error(`[tenantDataSync] cleanup delete failed for ${table}:`, deleteError.message);
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
const pendingTenantSyncs = new Map<string, ReturnType<typeof setTimeout>>();

export function syncTenantRow(tenant: Tenant): void {
  if (!isSupabaseAuthConfigured() || !tenant?.id) return;

  const existing = pendingTenantSyncs.get(tenant.id);
  if (existing) clearTimeout(existing);

  pendingTenantSyncs.set(
    tenant.id,
    setTimeout(() => {
      pendingTenantSyncs.delete(tenant.id);
      void performTenantRowSync(tenant);
    }, 800)
  );
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
        webmail_config: tenant.webmailConfig,
      })
      .eq("id", tenant.id);
    if (error) {
      console.error("[tenantDataSync] tenant row update failed:", error.message);
    }
  } catch (err) {
    console.error("[tenantDataSync] tenant row update failed:", err);
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

const DEFAULT_WEBMAIL_CONFIG: TenantWebmailConfig = {
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
      const webmailConfig: TenantWebmailConfig = {
        ...DEFAULT_WEBMAIL_CONFIG,
        ...(r.webmail_config || {}),
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
        webmailConfig,
      };
      return tenant;
    });
  } catch (err) {
    console.error("[tenantDataSync] fetchMyTenantsFull failed:", err);
    return null;
  }
}
