import type { EmailCampaign, EmailStep, EmailStepDeliveryResult } from "../types";
import { apiFetch } from "./apiClient";
import { getMailboxById, mailAuthFields } from "./webmail";

// Shared by the Email Marketing screens and the on-sign-in follow-up runner
// (CRMContext), so both send exactly the same way.

export function addDaysToToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

// Rolls a yyyy-mm-dd date forward off Saturday/Sunday to the next Monday.
export function skipWeekend(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const day = d.getDay();
  if (day === 6) d.setDate(d.getDate() + 2);
  else if (day === 0) d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

export function mergeTags(template: string, vars: { firstName: string; company: string; jobTitle: string }): string {
  return (template || "")
    .replace(/\{\{\s*firstName\s*\}\}/gi, vars.firstName || "there")
    .replace(/\{\{\s*company\s*\}\}/gi, vars.company || "your company")
    .replace(/\{\{\s*jobTitle\s*\}\}/gi, vars.jobTitle || "your role");
}

export interface Recipient {
  id: string;
  email: string;
  firstName: string;
  company: string;
  jobTitle: string;
}

// Sends one email and reports back what actually happened instead of
// assuming success. /api/webmail/send-email only rejects on a genuine
// network failure -- an SMTP/auth error still comes back as a normal 2xx-or-4xx
// HTTP response, so we have to read res.ok + the JSON body's `success` flag,
// not just catch().
async function sendOnce(
  mailCfg: ReturnType<typeof getMailboxById>,
  currentUser: { email?: string; name?: string } | null | undefined,
  activeTenant: { name?: string } | null | undefined,
  recipient: Recipient,
  subject: string,
  body: string
): Promise<EmailStepDeliveryResult> {
  const sentAt = new Date().toISOString();
  try {
    const res = await apiFetch("/api/webmail/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: mailCfg?.email || currentUser?.email,
        displayName: mailCfg?.displayName || currentUser?.name || activeTenant?.name,
        ...mailAuthFields(mailCfg),
        smtpHost: mailCfg?.smtpHost || "smtp.hostinger.com",
        smtpPort: mailCfg?.smtpPort || 465,
        to: recipient.email,
        subject,
        body,
      }),
    });
    let data: any = null;
    try {
      data = await res.json();
    } catch {
      // Non-JSON body -- fall through and treat as a failure below.
    }
    if (res.ok && data?.success) {
      return { recipientId: recipient.id, email: recipient.email, success: true, messageId: data.messageId, sentAt };
    }
    return {
      recipientId: recipient.id,
      email: recipient.email,
      success: false,
      error: data?.error || `Server responded ${res.status} ${res.statusText}`.trim(),
      sentAt,
    };
  } catch (err: any) {
    return {
      recipientId: recipient.id,
      email: recipient.email,
      success: false,
      error: err?.message || "Network error -- request never reached the server",
      sentAt,
    };
  }
}

// ---- address hygiene ---------------------------------------------------------
// Scraped/imported leads carry "mailto:x@y.com", stray spaces and capitals.
export function cleanEmail(e?: string | null): string {
  return String(e || "")
    .trim()
    .replace(/^mailto:/i, "")
    .split("?")[0]
    .trim()
    .toLowerCase();
}

/** One entry per distinct address (first lead wins). */
export function dedupeByEmail<T extends { email?: string | null }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const key = cleanEmail(it.email);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

/** Leads still owed this step: unique addresses, not replied, not already delivered. */
export function pendingForStep<L extends { id: string; email?: string | null }>(
  campaign: EmailCampaign,
  step: EmailStep,
  leads: L[],
  onlyFailed = false
): L[] {
  const audience = leads.filter((l) => campaign.audienceIds.includes(l.id));
  const repliedIds = new Set(campaign.repliedAudienceIds || []);
  const repliedEmails = new Set(audience.filter((l) => repliedIds.has(l.id)).map((l) => cleanEmail(l.email)));
  const results = step.deliveryResults || [];
  const delivered = new Set(results.filter((r) => r.success).map((r) => cleanEmail(r.email)));
  const failed = new Set(results.filter((r) => !r.success).map((r) => cleanEmail(r.email)));
  const todo = audience.filter((l) => {
    const e = cleanEmail(l.email);
    if (!e || repliedEmails.has(e) || delivered.has(e)) return false;
    return onlyFailed ? failed.has(e) : true;
  });
  return dedupeByEmail(todo);
}

// ---- sending with retries and pacing ------------------------------------------
// Gmail/Workspace answers "421-4.3.0 Temporary System Problem" (and similar
// 421/450/451/452 replies) when many connections arrive at once. Those are
// temporary: wait and try again instead of reporting a failure.
const TEMPORARY_ERROR = /\b(421|450|451|452)\b|temporar|try again|too many|rate limit|throttl|timed? ?out|ETIMEDOUT|ECONNRESET/i;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function sendCampaignEmail(
  mailCfg: ReturnType<typeof getMailboxById>,
  currentUser: { email?: string; name?: string } | null | undefined,
  activeTenant: { name?: string } | null | undefined,
  recipient: Recipient,
  subject: string,
  body: string
): Promise<EmailStepDeliveryResult> {
  const to = { ...recipient, email: cleanEmail(recipient.email) || recipient.email };
  const waits = [4000, 12000, 30000];
  let result = await sendOnce(mailCfg, currentUser, activeTenant, to, subject, body);
  for (const wait of waits) {
    if (result.success || !TEMPORARY_ERROR.test(result.error || "")) break;
    await sleep(wait);
    result = await sendOnce(mailCfg, currentUser, activeTenant, to, subject, body);
  }
  return result;
}

/** Runs `worker` over items a few at a time with a short pause between groups. */
export async function sendInBatches<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  opts?: { concurrency?: number; pauseMs?: number; onProgress?: (done: number, total: number) => void }
): Promise<R[]> {
  const size = opts?.concurrency ?? 3;
  const pause = opts?.pauseMs ?? 1000;
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const group = items.slice(i, i + size);
    out.push(...(await Promise.all(group.map(worker))));
    opts?.onProgress?.(Math.min(i + size, items.length), items.length);
    if (i + size < items.length) await sleep(pause);
  }
  return out;
}
