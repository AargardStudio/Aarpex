import type { EmailStepDeliveryResult } from "../types";
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
export async function sendCampaignEmail(
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
