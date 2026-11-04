import React, { useMemo, useState } from "react";
import { ListOrdered, ArrowLeft, Search, CheckCircle2, XCircle, Clock, CalendarClock, FileText, Mail, MessageSquareReply, ChevronDown, ChevronRight } from "lucide-react";
import { useCRM } from "../../context/CRMContext";
import { getMailboxById } from "../../lib/webmail";
import type { EmailCampaign, EmailStep } from "../../types";

// Campaigns overview: every campaign in the workspace in one list. Opening a
// campaign shows its sequence -- the initial email and each follow-up, with
// when it is/was due and who it actually went to.
const mergeTags = (t: string, v: { firstName: string; company: string; jobTitle: string }) =>
  (t || "")
    .replace(/\{\{\s*firstName\s*\}\}/gi, v.firstName || "there")
    .replace(/\{\{\s*company\s*\}\}/gi, v.company || "your company")
    .replace(/\{\{\s*jobTitle\s*\}\}/gi, v.jobTitle || "your role");

const fmtDate = (d?: string) => {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};
const fmtDateTime = (d?: string) => {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "—" : dt.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

type StepState = "Sent" | "Partial" | "Failed" | "Due" | "Scheduled" | "Paused" | "Draft";

const stepState = (c: EmailCampaign, st: EmailStep): StepState => {
  const res = st.deliveryResults || [];
  const ok = res.filter((r) => r.success).length;
  const bad = res.length - ok;
  if (st.status === "Sent") return bad > 0 && ok > 0 ? "Partial" : bad > 0 && ok === 0 ? "Failed" : "Sent";
  if (st.status === "Failed") return "Failed";
  if (c.status === "Paused") return "Paused";
  if (st.status === "Scheduled") {
    const due = st.scheduledDate ? new Date(st.scheduledDate).getTime() <= Date.now() : false;
    return due ? "Due" : "Scheduled";
  }
  return "Draft";
};

const STATE_STYLE: Record<StepState, string> = {
  Sent: "bg-emerald-950/60 text-emerald-300 border-emerald-500/40",
  Partial: "bg-amber-950/60 text-amber-300 border-amber-500/40",
  Failed: "bg-rose-950/60 text-rose-300 border-rose-500/40",
  Due: "bg-amber-950/60 text-amber-300 border-amber-500/40",
  Scheduled: "bg-sky-950/60 text-sky-300 border-sky-500/40",
  Paused: "bg-slate-800 text-slate-300 border-slate-600",
  Draft: "bg-slate-800 text-slate-300 border-slate-600",
};
const CAMPAIGN_STYLE: Record<string, string> = {
  Active: "bg-emerald-950/60 text-emerald-300 border-emerald-500/40",
  Completed: "bg-sky-950/60 text-sky-300 border-sky-500/40",
  Paused: "bg-amber-950/60 text-amber-300 border-amber-500/40",
  Draft: "bg-slate-800 text-slate-300 border-slate-600",
};

const stepLabel = (st: EmailStep) => (st.stepNumber === 1 ? "Initial email" : `Follow-up ${st.stepNumber - 1}`);

const counts = (c: EmailCampaign) => {
  let sent = 0, failed = 0, due = 0;
  for (const st of c.steps || []) {
    for (const r of st.deliveryResults || []) r.success ? sent++ : failed++;
    if (stepState(c, st) === "Due") due++;
  }
  return { sent, failed, due, replied: (c.repliedAudienceIds || []).length };
};

export const CampaignSequencesView: React.FC = () => {
  const { emailCampaigns, leads, activeTenant, setActiveNav } = useCRM() as any;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>("All");
  const [openId, setOpenId] = useState<string | null>(null);
  const [openStep, setOpenStep] = useState<string | null>(null);

  const campaigns: EmailCampaign[] = emailCampaigns || [];
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...campaigns]
      .filter((c) => (status === "All" || c.status === status) && (!q || c.name.toLowerCase().includes(q)))
      .sort((a, b) => (b.createdDate || "").localeCompare(a.createdDate || ""));
  }, [campaigns, query, status]);

  const campaign = openId ? campaigns.find((c) => c.id === openId) : undefined;

  if (campaign) {
    const from = getMailboxById(activeTenant, campaign.mailboxId)?.email || "";
    const steps = [...(campaign.steps || [])].sort((a, b) => a.stepNumber - b.stepNumber);
    const replied = new Set(campaign.repliedAudienceIds || []);
    const c = counts(campaign);
    const leadOf = (id: string) => (leads || []).find((l: any) => l.id === id);
    return (
      <div className="space-y-5">
        <button onClick={() => { setOpenId(null); setOpenStep(null); }} className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
          <ArrowLeft className="w-4 h-4" /> All campaigns
        </button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-white">{campaign.name}</h1>
          <span className={`text-xs px-2 py-0.5 rounded-full border ${CAMPAIGN_STYLE[campaign.status] || CAMPAIGN_STYLE.Draft}`}>{campaign.status}</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            ["Audience", campaign.audienceIds.length],
            ["Emails sent", c.sent],
            ["Failed", c.failed],
            ["Replied", c.replied],
            ["Due now", c.due],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded-xl border border-[#2f3547] bg-[#1b1f2a] p-3">
              <div className="text-xs text-slate-400">{k}</div>
              <div className="text-xl font-semibold text-white">{v}</div>
            </div>
          ))}
        </div>
        <div className="text-xs text-slate-400 flex flex-wrap gap-x-5 gap-y-1">
          <span>Started: {fmtDate(campaign.startDate || campaign.createdDate)}</span>
          <span>Cadence: every {campaign.frequencyDays} days</span>
          <span>From: {from || "default mailbox"}</span>
          <span>Owner: {campaign.salesperson || "—"}</span>
        </div>

        <div className="relative pl-6">
          <div className="absolute left-[11px] top-2 bottom-2 w-px bg-[#2f3547]" />
          {steps.map((st) => {
            const state = stepState(campaign, st);
            const res = st.deliveryResults || [];
            const ok = res.filter((r) => r.success).length;
            const expanded = openStep === st.id;
            const Icon = state === "Sent" ? CheckCircle2 : state === "Failed" ? XCircle : state === "Due" ? CalendarClock : state === "Draft" ? FileText : Clock;
            const waiting = state === "Scheduled" || state === "Due" ? audienceWaiting(campaign, st, replied) : 0;
            return (
              <div key={st.id} className="relative mb-4">
                <span className="absolute -left-6 top-3 w-[22px] h-[22px] rounded-full bg-[#11141c] border border-[#3d4455] flex items-center justify-center">
                  <Icon className="w-3.5 h-3.5 text-slate-300" />
                </span>
                <div className="rounded-xl border border-[#2f3547] bg-[#1b1f2a]">
                  <button onClick={() => setOpenStep(expanded ? null : st.id)} className="w-full flex items-start gap-3 p-4 text-left">
                    {expanded ? <ChevronDown className="w-4 h-4 mt-1 text-slate-400" /> : <ChevronRight className="w-4 h-4 mt-1 text-slate-400" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-white">{stepLabel(st)}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${STATE_STYLE[state]}`}>{state}</span>
                        {st.stepNumber > 1 && <span className="text-xs text-slate-500">+{st.delayDays} days after previous</span>}
                      </div>
                      <div className="text-sm text-slate-300 truncate mt-0.5">{st.subject || "(no subject)"}</div>
                      <div className="text-xs text-slate-500 mt-1">
                        {res.length > 0
                          ? `Sent ${fmtDateTime(st.sentDate || res[0]?.sentAt)} · ${ok}/${res.length} delivered`
                          : st.scheduledDate
                          ? `${state === "Due" ? "Was due" : "Scheduled for"} ${fmtDate(st.scheduledDate)}${waiting ? ` · ${waiting} recipient${waiting === 1 ? "" : "s"} waiting` : ""}`
                          : "Not scheduled yet"}
                      </div>
                    </div>
                  </button>
                  {expanded && (
                    <div className="border-t border-[#2f3547] p-4 space-y-4">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Email</div>
                        <div className="rounded-lg bg-[#11141c] border border-[#2f3547] p-3 text-sm text-slate-200 whitespace-pre-wrap">
                          <div className="font-medium text-white mb-2">{st.subject}</div>
                          {st.body}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1">Tags like {"{{firstName}}"} are filled in per recipient when sent.</p>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Sending log ({res.length})</div>
                        {res.length === 0 ? (
                          <div className="text-sm text-slate-500">Nothing sent for this step yet.</div>
                        ) : (
                          <div className="divide-y divide-[#2f3547] rounded-lg border border-[#2f3547] overflow-hidden">
                            {res.map((r, i) => {
                              const lead = leadOf(r.recipientId);
                              const didReply = replied.has(r.recipientId);
                              const vars = {
                                firstName: (lead?.name || "").split(" ")[0] || "there",
                                company: lead?.company || "your company",
                                jobTitle: lead?.jobTitle || "your role",
                              };
                              return (
                                <div key={i} className="flex items-start gap-3 px-3 py-2 text-sm bg-[#11141c]">
                                  {r.success ? <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-400 shrink-0" /> : <XCircle className="w-4 h-4 mt-0.5 text-rose-400 shrink-0" />}
                                  <div className="flex-1 min-w-0">
                                    <div className="text-slate-200 truncate">{lead?.name || r.email} <span className="text-slate-500">&lt;{r.email}&gt;</span></div>
                                    <div className="text-xs text-slate-500 truncate">
                                      {mergeTags(st.subject, vars)}
                                      {!r.success && r.error ? ` · ${r.error}` : ""}
                                    </div>
                                  </div>
                                  {didReply && (
                                    <span className="inline-flex items-center gap-1 text-xs text-emerald-300"><MessageSquareReply className="w-3.5 h-3.5" /> Replied</span>
                                  )}
                                  <span className="text-xs text-slate-500 whitespace-nowrap">{fmtDateTime(r.sentAt)}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {steps.length === 0 && <div className="text-sm text-slate-500">This campaign has no steps yet.</div>}
        </div>
        <p className="text-xs text-slate-500">
          Follow-ups are sent when you open the campaign in Email Marketing and send them; they are not sent automatically in the background.
          {setActiveNav && (
            <button className="ml-2 text-teal-300 hover:underline" onClick={() => setActiveNav("Email Marketing")}>Open Email Marketing</button>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2"><ListOrdered className="w-6 h-6 text-teal-300" /> Campaigns</h1>
        <p className="text-sm text-slate-400">All your email campaigns. Click one to see its follow-up sequence and what was sent.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search campaigns" className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#1b1f2a] border border-[#2f3547] text-sm text-white placeholder-slate-500" />
        </div>
        <div className="flex gap-1">
          {["All", "Active", "Paused", "Completed", "Draft"].map((s) => (
            <button key={s} onClick={() => setStatus(s)} className={`px-3 py-2 rounded-lg text-xs border ${status === s ? "bg-teal-500/20 text-teal-200 border-teal-500/40" : "bg-[#1b1f2a] text-slate-400 border-[#2f3547] hover:text-white"}`}>{s}</button>
          ))}
        </div>
      </div>
      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#2f3547] p-10 text-center text-slate-500">
          <Mail className="w-8 h-8 mx-auto mb-2 opacity-60" />
          {campaigns.length === 0 ? "No campaigns yet. Create one in Email Marketing." : "No campaigns match your filter."}
        </div>
      ) : (
        <div className="grid gap-3">
          {list.map((c) => {
            const k = counts(c);
            const steps = [...(c.steps || [])].sort((a, b) => a.stepNumber - b.stepNumber);
            return (
              <button key={c.id} onClick={() => setOpenId(c.id)} className="text-left rounded-xl border border-[#2f3547] bg-[#1b1f2a] hover:border-teal-500/40 p-4 transition-colors">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-white">{c.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${CAMPAIGN_STYLE[c.status] || CAMPAIGN_STYLE.Draft}`}>{c.status}</span>
                  {k.due > 0 && <span className="text-xs px-2 py-0.5 rounded-full border bg-amber-950/60 text-amber-300 border-amber-500/40">{k.due} follow-up{k.due === 1 ? "" : "s"} due</span>}
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  {steps.map((st) => {
                    const s = stepState(c, st);
                    const dot = s === "Sent" ? "bg-emerald-400" : s === "Failed" ? "bg-rose-400" : s === "Due" || s === "Partial" ? "bg-amber-400" : s === "Scheduled" ? "bg-sky-400" : "bg-slate-600";
                    return <span key={st.id} title={`${stepLabel(st)}: ${s}`} className={`h-1.5 flex-1 max-w-[48px] rounded-full ${dot}`} />;
                  })}
                </div>
                <div className="mt-2 text-xs text-slate-400 flex flex-wrap gap-x-5 gap-y-1">
                  <span>{c.audienceIds.length} recipients</span>
                  <span>{steps.length} step{steps.length === 1 ? "" : "s"}</span>
                  <span>{k.sent} sent</span>
                  {k.failed > 0 && <span className="text-rose-300">{k.failed} failed</span>}
                  <span>{k.replied} replied</span>
                  <span>Started {fmtDate(c.startDate || c.createdDate)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// Recipients still waiting for this step: not replied and not already sent it.
function audienceWaiting(c: EmailCampaign, st: EmailStep, replied: Set<string>): number {
  const done = new Set((st.deliveryResults || []).filter((r) => r.success).map((r) => r.recipientId));
  return c.audienceIds.filter((id) => !replied.has(id) && !done.has(id)).length;
}
