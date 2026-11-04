import React, { useMemo, useState } from "react";
import { Inbox as InboxIcon, RefreshCw, Mail, CheckCircle2, Clock, Info, Send, AlertCircle, Search } from "lucide-react";
import { useCRM } from "../../context/CRMContext";
import { getMailboxById } from "../../lib/webmail";

// Inbox: reply-tracking for Email Marketing sequences. This isn't a full
// mail client -- it doesn't browse your inbox message by message. Instead
// it answers one focused question per campaign audience member: "has this
// person replied yet?", using an IMAP scan of the workspace's own connected
// mailbox, and feeds that back into Email Marketing so replied-to people
// stop receiving further scheduled follow-ups automatically.
const mergeTags = (t: string, v: { firstName: string; company: string; jobTitle: string }) =>
  (t || "")
    .replace(/\{\{\s*firstName\s*\}\}/gi, v.firstName || "there")
    .replace(/\{\{\s*company\s*\}\}/gi, v.company || "your company")
    .replace(/\{\{\s*jobTitle\s*\}\}/gi, v.jobTitle || "your role");

export const InboxView: React.FC = () => {
  const { emailCampaigns, leads, activeTenant, checkCampaignReplies } = useCRM();
  const [tab, setTab] = useState<"replies" | "sent">("replies");
  const [sentQuery, setSentQuery] = useState("");
  const [openSentId, setOpenSentId] = useState<string | null>(null);

  // Sent items: every campaign email that was actually attempted, rebuilt from
  // the per-recipient delivery results stored on each campaign step.
  const sentItems = useMemo(() => {
    const rows: {
      id: string;
      to: string;
      toName: string;
      from: string;
      subject: string;
      body: string;
      sentAt: string;
      success: boolean;
      error?: string;
      campaign: string;
      stepLabel: string;
    }[] = [];
    for (const c of emailCampaigns) {
      const from = getMailboxById(activeTenant, c.mailboxId)?.email || "";
      for (const st of c.steps || []) {
        for (const r of st.deliveryResults || []) {
          const lead = leads.find((l) => l.id === r.recipientId);
          const vars = {
            firstName: ((lead?.name || "").split(" ")[0]) || "there",
            company: lead?.company || "your company",
            jobTitle: (lead as any)?.jobTitle || "your role",
          };
          rows.push({
            id: `${c.id}_${st.id}_${r.recipientId}_${r.sentAt}`,
            to: r.email,
            toName: lead?.name || r.email,
            from,
            subject: mergeTags(st.subject, vars),
            body: mergeTags(st.body, vars),
            sentAt: r.sentAt,
            success: r.success,
            error: r.error,
            campaign: c.name,
            stepLabel: st.stepNumber === 1 ? "Initial email" : `Follow-up ${st.stepNumber - 1}`,
          });
        }
      }
    }
    return rows.sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  }, [emailCampaigns, leads, activeTenant]);
  const filteredSent = useMemo(() => {
    const q = sentQuery.trim().toLowerCase();
    return q ? sentItems.filter((r) => `${r.to} ${r.toName} ${r.subject} ${r.campaign}`.toLowerCase().includes(q)) : sentItems;
  }, [sentItems, sentQuery]);
  const [checkingAll, setCheckingAll] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);

  const trackedCampaigns = emailCampaigns.filter((c) => c.status === "Active" || c.status === "Completed" || c.status === "Paused");

  const resolveRecipient = (_campaign: (typeof emailCampaigns)[number], id: string) => {
    const lead = leads.find((l) => l.id === id);
    return lead ? { name: lead.name, email: lead.email } : null;
  };

  const handleCheckOne = async (campaignId: string) => {
    setCheckingId(campaignId);
    try {
      await checkCampaignReplies(campaignId);
    } finally {
      setCheckingId(null);
    }
  };

  const handleCheckAll = async () => {
    setCheckingAll(true);
    try {
      for (const c of trackedCampaigns) {
        await checkCampaignReplies(c.id);
      }
    } finally {
      setCheckingAll(false);
    }
  };

  const mailboxConnected = (activeTenant?.webmailConfigs || []).some((m) => !!m.password && !!m.imapHost);
  const totalReplied = trackedCampaigns.reduce((sum, c) => sum + (c.repliedAudienceIds?.length || 0), 0);
  const totalAwaiting = trackedCampaigns.reduce(
    (sum, c) => sum + c.audienceIds.filter((id) => !(c.repliedAudienceIds || []).includes(id)).length,
    0
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <InboxIcon className="w-5 h-5 text-teal-400" />
            Inbox
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Tracks replies to your Email Marketing sequences by scanning your connected mailbox.
          </p>
        </div>
        <button
          onClick={handleCheckAll}
          disabled={checkingAll || trackedCampaigns.length === 0}
          className="px-3.5 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${checkingAll ? "animate-spin" : ""}`} />
          {checkingAll ? "Checking all campaigns..." : "Check All for Replies"}
        </button>
      </div>

      <div className="flex gap-1.5">
        <button onClick={() => setTab("replies")} className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 ${tab === "replies" ? "bg-teal-600 text-white" : "bg-[#181b21] border border-[#2d323f] text-slate-400 hover:text-white"}`}>
          <InboxIcon className="w-3.5 h-3.5" /> Replies
        </button>
        <button onClick={() => setTab("sent")} className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 ${tab === "sent" ? "bg-teal-600 text-white" : "bg-[#181b21] border border-[#2d323f] text-slate-400 hover:text-white"}`}>
          <Send className="w-3.5 h-3.5" /> Sent
          {sentItems.length > 0 && <span className="px-1.5 rounded bg-black/30 text-[10px]">{sentItems.length}</span>}
        </button>
      </div>

      {tab === "sent" && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={sentQuery}
              onChange={(e) => setSentQuery(e.target.value)}
              placeholder="Search sent emails by recipient, subject or campaign"
              className="w-full pl-9 pr-3 py-2 bg-[#181b21] border border-[#2d323f] text-white text-xs rounded-lg focus:outline-none focus:border-teal-400"
            />
          </div>
          {filteredSent.length === 0 ? (
            <div className="p-10 text-center text-slate-500 text-xs bg-[#181b21] rounded-xl border border-[#2d323f]">
              {sentItems.length === 0 ? "No campaign emails have been sent yet. Deploy a campaign from Email Marketing and every email will be listed here." : "No sent emails match your search."}
            </div>
          ) : (
            <div className="bg-[#181b21] rounded-xl border border-[#2d323f] divide-y divide-[#2d323f] overflow-hidden">
              {filteredSent.map((r) => {
                const open = openSentId === r.id;
                return (
                  <div key={r.id} className="text-xs">
                    <button onClick={() => setOpenSentId(open ? null : r.id)} className="w-full text-left px-4 py-2.5 hover:bg-[#1e232d] flex items-center gap-3">
                      {r.success ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                      <span className="w-40 shrink-0 truncate font-semibold text-slate-200">To: {r.toName}</span>
                      <span className="flex-1 min-w-0 truncate text-slate-300">
                        {r.subject} <span className="text-slate-500">- {r.body.replace(/\s+/g, " ").slice(0, 80)}</span>
                      </span>
                      <span className="shrink-0 text-slate-500">{new Date(r.sentAt).toLocaleString()}</span>
                    </button>
                    {open && (
                      <div className="px-4 pb-4 pt-1 bg-[#121418] space-y-2">
                        <div className="text-[11px] text-slate-400 space-y-0.5">
                          <div>From: {r.from || "your connected mailbox"}</div>
                          <div>To: {r.toName} &lt;{r.to}&gt;</div>
                          <div>Campaign: {r.campaign} ({r.stepLabel})</div>
                          <div className={r.success ? "text-emerald-400" : "text-rose-300"}>{r.success ? "Delivered to the mail server" : `Failed: ${r.error || "unknown error"}`}</div>
                        </div>
                        <div className="font-bold text-white">{r.subject}</div>
                        <div className="whitespace-pre-wrap text-slate-300 leading-relaxed">{r.body}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "replies" && !mailboxConnected && (
        <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs flex items-center gap-2">
          <Info className="w-4 h-4 shrink-0" />
          No webmail IMAP credentials configured yet -- connect a mailbox in Settings to enable real reply detection. Checks will run in simulation mode until then.
        </div>
      )}

      {tab === "replies" && (
      <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-[#181b21] rounded-xl border border-[#2d323f]">
          <div className="text-[11px] text-slate-400 font-semibold">Tracked Campaigns</div>
          <div className="text-2xl font-bold text-white mt-0.5">{trackedCampaigns.length}</div>
        </div>
        <div className="p-4 bg-[#181b21] rounded-xl border border-[#2d323f]">
          <div className="text-[11px] text-slate-400 font-semibold">Replied</div>
          <div className="text-2xl font-bold text-emerald-400 mt-0.5">{totalReplied}</div>
        </div>
        <div className="p-4 bg-[#181b21] rounded-xl border border-[#2d323f]">
          <div className="text-[11px] text-slate-400 font-semibold">Awaiting Reply</div>
          <div className="text-2xl font-bold text-amber-400 mt-0.5">{totalAwaiting}</div>
        </div>
      </div>

      {trackedCampaigns.length === 0 && (
        <div className="p-10 text-center text-slate-500 text-xs bg-[#181b21] rounded-xl border border-[#2d323f]">
          No active or completed Email Marketing campaigns to track yet. Launch one from Email Marketing first.
        </div>
      )}

      <div className="space-y-4">
        {trackedCampaigns.map((campaign) => {
          const repliedIds = campaign.repliedAudienceIds || [];
          return (
            <div key={campaign.id} className="bg-[#181b21] rounded-xl border border-[#2d323f] overflow-hidden">
              <div className="px-4 py-3 border-b border-[#2d323f] flex items-center justify-between bg-[#121418]">
                <div>
                  <div className="text-xs font-bold text-white">{campaign.name}</div>
                  <div className="text-[10px] text-slate-400">
                    {campaign.audienceIds.length} {campaign.audienceType.toLowerCase()}
                    {campaign.lastReplyCheckAt && ` · last checked ${new Date(campaign.lastReplyCheckAt).toLocaleString()}`}
                  </div>
                </div>
                <button
                  onClick={() => handleCheckOne(campaign.id)}
                  disabled={checkingId === campaign.id}
                  className="px-2.5 py-1.5 bg-[#252a36] hover:bg-[#2f3544] text-teal-300 rounded-lg text-[11px] font-bold border border-[#3d4455] flex items-center gap-1.5 shrink-0"
                >
                  <RefreshCw className={`w-3 h-3 ${checkingId === campaign.id ? "animate-spin" : ""}`} />
                  {checkingId === campaign.id ? "Checking..." : "Check"}
                </button>
              </div>
              <div className="divide-y divide-[#2d323f]">
                {campaign.audienceIds.map((id) => {
                  const recipient = resolveRecipient(campaign, id);
                  if (!recipient) return null;
                  const hasReplied = repliedIds.includes(id);
                  return (
                    <div key={id} className="px-4 py-2.5 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="text-slate-200 truncate">{recipient.name}</span>
                        <span className="text-slate-500 truncate">{recipient.email}</span>
                      </div>
                      {hasReplied ? (
                        <span className="flex items-center gap-1 text-emerald-400 font-semibold shrink-0">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Replied
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-slate-500 font-medium shrink-0">
                          <Clock className="w-3.5 h-3.5" />
                          Awaiting
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      </>
      )}
    </div>
  );
};
