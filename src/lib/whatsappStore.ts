import { getSupabaseAuthClient, isSupabaseAuthConfigured } from "../config/supabaseAuthClient";
import type { WhatsAppMessage } from "../types";

// WhatsApp messages are read and appended directly (not through the generic
// mirror-sync, which deletes rows the browser doesn't hold -- that would wipe
// inbound messages the webhook wrote while the app was closed).

const COLS = "id,lead_id,phone,direction,body,template_name,status,error,source,sent_by,ai_handled_at,created_at";

const fromRow = (r: any): WhatsAppMessage => ({
  id: r.id,
  leadId: r.lead_id || undefined,
  phone: r.phone,
  direction: r.direction === "in" ? "in" : "out",
  body: r.body || undefined,
  templateName: r.template_name || undefined,
  status: r.status || undefined,
  error: r.error || undefined,
  source: r.source || undefined,
  sentBy: r.sent_by || undefined,
  aiHandledAt: r.ai_handled_at || undefined,
  createdAt: r.created_at,
});

const toRow = (tenantId: string, m: WhatsAppMessage) => ({
  id: m.id,
  tenant_id: tenantId,
  lead_id: m.leadId ?? null,
  phone: m.phone,
  direction: m.direction,
  body: m.body ?? null,
  template_name: m.templateName ?? null,
  status: m.status ?? null,
  error: m.error ?? null,
  source: m.source ?? null,
  sent_by: m.sentBy ?? null,
  ai_handled_at: m.aiHandledAt ?? null,
  created_at: m.createdAt,
});

export async function fetchWhatsAppMessages(tenantId: string): Promise<WhatsAppMessage[] | null> {
  if (!isSupabaseAuthConfigured() || !tenantId) return null;
  try {
    const { data, error } = await getSupabaseAuthClient()
      .from("whatsapp_messages")
      .select(COLS)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) {
      console.error("[whatsapp] fetch failed:", error.message);
      return null;
    }
    return (data || []).map(fromRow);
  } catch (err) {
    console.error("[whatsapp] fetch failed:", err);
    return null;
  }
}

export async function upsertWhatsAppMessages(tenantId: string, msgs: WhatsAppMessage[]): Promise<void> {
  if (!isSupabaseAuthConfigured() || !tenantId || msgs.length === 0) return;
  try {
    const { error } = await getSupabaseAuthClient()
      .from("whatsapp_messages")
      .upsert(msgs.map((m) => toRow(tenantId, m)) as any, { onConflict: "id" });
    if (error) console.error("[whatsapp] save failed:", error.message);
  } catch (err) {
    console.error("[whatsapp] save failed:", err);
  }
}

export const phoneDigits = (p?: string): string => String(p || "").replace(/[^\d]/g, "");

// Two numbers are "the same" when their last 9 digits match -- tolerant of
// country-code / leading-zero differences (0300... vs 92300...).
export const samePhone = (a?: string, b?: string): boolean => {
  const x = phoneDigits(a);
  const y = phoneDigits(b);
  if (x.length < 7 || y.length < 7) return false;
  return x.slice(-9) === y.slice(-9);
};
