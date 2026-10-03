import React, { useState } from "react";
import { Loader2, MessageSquareReply, Send, Copy, CheckCircle2, RefreshCw } from "lucide-react";
import { useCRM } from "../../context/CRMContext";
import { apiFetch } from "../../lib/apiClient";
import { getMailboxById } from "../../lib/webmail";
import type { Lead } from "../../types";

// Draft on demand: reads the lead's latest email reply from the connected
// mailbox (or lets you paste one), then writes a reply in the chosen style.
// The draft is editable and goes to Agent Approvals -- never sent from here.
// Works for Take Charge leads too, since you are the one asking for it.
const STYLES: { id: string; label: string; goal: string }[] = [
  { id: "natural", label: "Natural reply", goal: "Reply naturally to exactly what they wrote and keep the conversation moving." },
  { id: "short", label: "Short & direct", goal: "Reply in 3 to 4 short sentences. Answer what they asked, nothing extra, one clear next step." },
  { id: "warm", label: "Warm & personal", goal: "Reply warmly and personally. Acknowledge what they said before anything else." },
  { id: "objection", label: "Handle objection", goal: "They raised a concern or objection. Acknowledge it respectfully, address it honestly with specifics we know, never pressure them." },
  { id: "pricing", label: "Answer pricing", goal: "They are asking about price or terms. Answer using only the real pricing provided; if none is given, say you will confirm figures rather than inventing any." },
  { id: "call", label: "Book a call", goal: "Move toward a short call. Propose that they pick a time or suggest two options, keep it low pressure." },
  { id: "notnow", label: "Not now / nurture", goal: "They are not ready. Respond graciously, leave the door open and suggest a light check-in later. Do not push." },
];

export const ReplyDraftPanel: React.FC<{ lead: Lead }> = ({ lead }) => {
  const { activeTenant, currentUser, activities, knowledgeBase, products, agentActions, addAgentAction, resolveAgentAction, getAgentForIndustry } =
    useCRM() as any;
  const [style, setStyle] = useState("natural");
  const [extra, setExtra] = useState("");
  const [replyText, setReplyText] = useState("");
  const [replySubject, setReplySubject] = useState("");
  const [replyDate, setReplyDate] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState<"" | "fetch" | "draft">("");
  const [note, setNote] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);

  const mail = getMailboxById(activeTenant);
  const hasMail = !!(mail?.email && mail?.password && mail?.imapHost);

  const loadLatest = async (): Promise<{ text: string; subject: string } | null> => {
    if (!hasMail || !lead.email) {
      setNote(hasMail ? "This lead has no email address." : "No mailbox is connected, so paste their reply below.");
      return null;
    }
    const res = await apiFetch("/api/webmail/fetch-replies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: mail.email,
        password: mail.password,
        imapHost: mail.imapHost,
        imapPort: mail.imapPort,
        imapEncryption: mail.imapEncryption,
        addresses: [lead.email],
        sinceDate: new Date(Date.now() - 90 * 86400000).toISOString(),
      }),
    });
    const data = await res.json();
    const r = (data.replies || [])[0];
    if (!r || !String(r.text || "").trim()) {
      setNote(data.message || "No reply from this lead was found in the last 90 days. You can paste one below.");
      return null;
    }
    setReplyText(r.text);
    setReplySubject(r.subject || "");
    setReplyDate(String(r.date || "").slice(0, 10));
    return { text: r.text, subject: r.subject || "" };
  };

  const generate = async () => {
    setNote(null);
    setQueued(false);
    try {
      let text = replyText.trim();
      let subj = replySubject;
      if (!text) {
        setBusy("fetch");
        const got = await loadLatest();
        if (!got) {
          setBusy("");
          return;
        }
        text = got.text;
        subj = got.subject;
      }
      setBusy("draft");
      const agent = getAgentForIndustry?.(lead.industry);
      const product = agent?.productId ? products.find((p: any) => p.id === agent.productId) : undefined;
      const knowledge = (knowledgeBase || [])
        .filter((k: any) => (k.linkedLeadIds || []).includes(lead.id))
        .map((k: any) => `${k.title}: ${k.content}`);
      const s = STYLES.find((x) => x.id === style) || STYLES[0];
      const res = await apiFetch("/api/ai/personalized-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientName: lead.name,
          recipientCompany: lead.company,
          recipientJobTitle: lead.jobTitle,
          recipientIndustry: lead.industry,
          knowledgeEntries: knowledge,
          activities: (activities || []).filter((a: any) => a.leadId === lead.id),
          agent,
          productName: product?.name,
          productPitch: product?.pitch,
          productPricing:
            product && Number(product.price) > 0
              ? `${product.currency || "USD"} ${product.price}${product.pricingModel ? ` (${product.pricingModel})` : ""}`
              : undefined,
          includePricing: style === "pricing",
          senderName: currentUser?.name,
          senderCompany: activeTenant?.companyName || activeTenant?.name,
          replyText: text,
          goal: `${s.goal}${extra.trim() ? ` Extra instruction from the sender: ${extra.trim().slice(0, 400)}` : ""}`,
        }),
      });
      const data = await res.json();
      if (!data.body) throw new Error("empty");
      setSubject(data.subject || (subj ? `Re: ${subj.replace(/^re:\s*/i, "")}` : ""));
      setBody(data.body);
      if (data.source === "fallback") setNote("The AI was unavailable, so this is a generic fallback. Try again or edit it.");
    } catch {
      setNote("Couldn't draft a reply just now. Try again in a moment.");
    } finally {
      setBusy("");
    }
  };

  const queue = () => {
    if (!body.trim() || !lead.email) return;
    (agentActions || [])
      .filter((a: any) => a.status === "pending" && a.actionType === "email_reply" && a.recipientEmail?.toLowerCase() === lead.email.toLowerCase())
      .forEach((a: any) => resolveAgentAction(a.id, "rejected"));
    addAgentAction({
      industry: lead.industry || "General",
      actionType: "email_reply",
      leadId: lead.id,
      recipientName: lead.name,
      recipientEmail: lead.email,
      subject,
      body,
      reasoning: `Reply drafted on request (${(STYLES.find((x) => x.id === style) || STYLES[0]).label}).`,
      triggerSnippet: replyText.trim().slice(0, 300) || undefined,
      triggerSource: "manual",
    });
    setQueued(true);
  };

  return (
    <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/70 space-y-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
        <MessageSquareReply className="w-3.5 h-3.5 text-indigo-500" /> Draft a reply to their email
      </div>
      <p className="text-[11px] text-slate-500 leading-relaxed">
        Reads their latest reply from your mailbox and drafts an answer. Nothing is sent from here; it goes to Agent Approvals for you to review.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {STYLES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStyle(s.id)}
            className={`px-2 py-1 rounded-full text-[11px] font-semibold border ${
              style === s.id ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <input
        value={extra}
        onChange={(e) => setExtra(e.target.value)}
        placeholder="Optional instruction, e.g. offer Thursday 3pm"
        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-indigo-400"
      />

      {replyText && (
        <div className="rounded-lg border border-slate-200 bg-white p-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
            Their reply{replyDate ? ` · ${replyDate}` : ""}{replySubject ? ` · ${replySubject}` : ""}
          </div>
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            rows={4}
            className="w-full text-xs text-slate-700 outline-none resize-y bg-transparent"
          />
        </div>
      )}
      {!replyText && (!hasMail || !!note) && (
        <textarea
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          placeholder="Paste their reply here."
          rows={3}
          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-indigo-400"
        />
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={generate}
          disabled={!!busy || !lead.email}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : body ? <RefreshCw className="w-3.5 h-3.5" /> : <MessageSquareReply className="w-3.5 h-3.5" />}
          {busy === "fetch" ? "Reading their reply…" : busy === "draft" ? "Drafting…" : body ? "Redraft" : replyText ? "Draft reply" : hasMail ? "Read latest reply & draft" : "Draft reply"}
        </button>
        {replyText && !busy && (
          <button
            type="button"
            onClick={() => {
              setReplyText("");
              setReplySubject("");
              setReplyDate("");
              loadLatest();
            }}
            disabled={!hasMail}
            title="Re-check the mailbox for a newer reply"
            className="px-2.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-indigo-600 disabled:opacity-40"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {note && <p className="text-[11px] text-amber-600">{note}</p>}

      {body && (
        <div className="space-y-2">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold outline-none focus:border-indigo-400"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={9}
            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs leading-relaxed outline-none focus:border-indigo-400"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={queue}
              disabled={queued}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-100 disabled:text-emerald-700 text-white rounded-lg text-xs font-bold"
            >
              {queued ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
              {queued ? "In Agent Approvals" : "Send to Approvals"}
            </button>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(`${subject}\n\n${body}`).catch(() => {})}
              className="px-3 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-indigo-600 text-xs font-semibold flex items-center gap-1"
            >
              <Copy className="w-3.5 h-3.5" /> Copy
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
