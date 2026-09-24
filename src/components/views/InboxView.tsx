import React, { useState } from "react";
import { Inbox as InboxIcon, RefreshCw, Mail, CheckCircle2, Clock, Info } from "lucide-react";
import { useCRM } from "../../context/CRMContext";

// Inbox: reply-tracking for Email Marketing sequences. This isn't a full
// mail client -- it doesn't browse your inbox message by message. Instead
// it answers one focused question per campaign audience member: "has this
// person replied yet?", using an IMAP scan of the workspace's own connected
// mailbox, and feeds that back into Email Marketing so replied-to people
// stop receiving further scheduled follow-ups automatically.
export const InboxView: React.FC = () => {
  const { emailCampaigns, leads, contacts, activeTenant, checkCampaignReplies } = useCRM();
  const [checkingAll, setCheckingAll] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);

  const trackedCampaigns = emailCampaigns.filter((c) => c.status === "Active" || c.status === "Completed" || c.status === "Paused");

  const resolveRecipient = (campaign: (typeof emailCampaigns)[number], id: string) => {
    if (campaign.audienceType === "Leads") {
      const lead = leads.find((l) => l.id === id);
      return lead ? { name: lead.name, email: lead.email } : null;
    }
    const contact = contacts.find((c) => c.id === id);
    return contact ? { name: `${contact.firstName} ${contact.lastName}`.trim(), email: contact.email } : null;
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

      {!mailboxConnected && (
        <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs flex items-center gap-2">
          <Info className="w-4 h-4 shrink-0" />
          No webmail IMAP credentials configured yet -- connect a mailbox in Settings to enable real reply detection. Checks will run in simulation mode until then.
        </div>
      )}

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
    </div>
  );
};
