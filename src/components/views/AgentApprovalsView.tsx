import React, { useState } from "react";
import { useCRM } from "../../context/CRMContext";
import {
  Bot,
  Mail,
  MessageSquareReply,
  Percent,
  Check,
  X,
  Pencil,
  Loader2,
  Clock,
} from "lucide-react";
import { AgentAction, AgentActionStatus, AgentActionType } from "../../types";

const TYPE_LABEL: Record<AgentActionType, string> = {
  follow_up: "Follow-Up",
  email_reply: "Reply",
  negotiation_offer: "Negotiation Offer",
};

const TYPE_ICON: Record<AgentActionType, typeof Mail> = {
  follow_up: Clock,
  email_reply: MessageSquareReply,
  negotiation_offer: Percent,
};

const TYPE_COLOR: Record<AgentActionType, string> = {
  follow_up: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  email_reply: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  negotiation_offer: "bg-amber-500/15 text-amber-300 border-amber-500/30",
};

const ActionCard: React.FC<{ action: AgentAction }> = ({ action }) => {
  const { approveAndSendAgentAction, resolveAgentAction, deleteAgentAction, setSelectedLeadId, setSelectedContactId } = useCRM() as any;
  const [isEditing, setIsEditing] = useState(false);
  const [subjectDraft, setSubjectDraft] = useState(action.subject);
  const [bodyDraft, setBodyDraft] = useState(action.body);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState(false);

  const Icon = TYPE_ICON[action.actionType];

  const handleApprove = async () => {
    setIsSending(true);
    setSendError(false);
    const ok = await approveAndSendAgentAction(action.id, isEditing ? { subject: subjectDraft, body: bodyDraft } : undefined);
    setIsSending(false);
    if (!ok) setSendError(true);
    else setIsEditing(false);
  };

  const handleReject = () => {
    if (!confirm("Reject this action? It won't be sent and will move to your rejected history.")) return;
    resolveAgentAction(action.id, "rejected");
  };

  return (
    <div className="bg-[#181b21] rounded-2xl border border-[#2d323f] shadow-lg p-4 sm:p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${TYPE_COLOR[action.actionType]}`}>
              <Icon className="w-3 h-3" />
              {TYPE_LABEL[action.actionType]}
            </span>
            <span className="text-[10px] px-2 py-0.5 bg-[#252a36] border border-[#3d4455] text-slate-300 rounded-full">
              {action.industry}
            </span>
            {action.status !== "pending" && (
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  action.status === "approved"
                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                    : "bg-slate-500/15 text-slate-400 border-slate-500/30"
                }`}
              >
                {action.status === "approved" ? "Sent" : "Rejected"}
              </span>
            )}
          </div>
          <button
            onClick={() => (action.leadId ? setSelectedLeadId(action.leadId) : action.contactId ? setSelectedContactId(action.contactId) : undefined)}
            className="text-sm font-bold text-white hover:text-teal-300 mt-1 text-left"
          >
            {action.recipientName}
          </button>
          <div className="text-[11px] text-slate-400">{action.recipientEmail}</div>
        </div>
        {action.actionType === "negotiation_offer" && typeof action.proposedDiscountPercent === "number" && (
          <div className="shrink-0 text-right">
            <div className="text-lg font-black text-amber-300">{action.proposedDiscountPercent}%</div>
            <div className="text-[10px] text-slate-500">proposed off</div>
          </div>
        )}
      </div>

      <p className="text-[11px] text-slate-400 italic">{action.reasoning}</p>

      {action.triggerSnippet && (
        <div className="p-2.5 bg-[#121418] border border-[#2d323f] rounded-lg text-[11px] text-slate-400">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">What they said</div>
          {action.triggerSnippet}
        </div>
      )}

      <div className="p-3 bg-[#121418] rounded-xl border border-[#2d323f] space-y-2">
        {isEditing ? (
          <>
            <input
              type="text"
              value={subjectDraft}
              onChange={(e) => setSubjectDraft(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-[#181b21] border border-[#2d323f] text-white rounded-lg text-xs font-semibold focus:outline-none focus:border-teal-400"
            />
            <textarea
              rows={6}
              value={bodyDraft}
              onChange={(e) => setBodyDraft(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-[#181b21] border border-[#2d323f] text-white rounded-lg text-xs resize-none focus:outline-none focus:border-teal-400"
            />
          </>
        ) : (
          <>
            <div className="text-xs font-bold text-white">{action.subject}</div>
            <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">{action.body}</p>
          </>
        )}
      </div>

      {sendError && <p className="text-[11px] text-rose-400">Couldn't send -- check your mailbox connection in Settings and try again.</p>}

      {action.status === "pending" && (
        <div className="flex items-center justify-end gap-2 pt-1">
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="px-3 py-1.5 bg-[#252a36] hover:bg-[#2f3544] text-slate-300 hover:text-white border border-[#3d4455] rounded-lg text-xs font-semibold flex items-center gap-1.5"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </button>
          ) : (
            <button
              onClick={() => setIsEditing(false)}
              className="px-3 py-1.5 bg-[#252a36] hover:bg-[#2f3544] text-slate-300 hover:text-white border border-[#3d4455] rounded-lg text-xs font-semibold"
            >
              Cancel Edit
            </button>
          )}
          <button
            onClick={handleReject}
            className="px-3 py-1.5 bg-[#252a36] hover:bg-rose-950/40 text-slate-300 hover:text-rose-300 border border-[#3d4455] hover:border-rose-500/40 rounded-lg text-xs font-semibold flex items-center gap-1.5"
          >
            <X className="w-3.5 h-3.5" />
            Reject
          </button>
          <button
            onClick={handleApprove}
            disabled={isSending}
            className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm"
          >
            {isSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {isSending ? "Sending..." : "Approve & Send"}
          </button>
        </div>
      )}
      {action.status !== "pending" && (
        <div className="flex justify-end">
          <button
            onClick={() => deleteAgentAction(action.id)}
            className="text-[11px] text-slate-500 hover:text-rose-400"
          >
            Remove from history
          </button>
        </div>
      )}
    </div>
  );
};

export const AgentApprovalsView: React.FC = () => {
  const { agentActions } = useCRM();
  const [tab, setTab] = useState<AgentActionStatus>("pending");

  const filtered = agentActions.filter((a) => a.status === tab);
  const pendingCount = agentActions.filter((a) => a.status === "pending").length;

  return (
    <div id="agent-approvals-view" className="space-y-5 animate-in fade-in duration-200 text-slate-100">
      <div>
        <h1 className="text-lg font-bold text-white flex items-center gap-2">
          <Bot className="w-5 h-5 text-teal-400" />
          Agent Approvals
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Every follow-up, reply, and negotiation offer your Industry Playbook agents draft lands here first --
          nothing reaches a prospect until you approve it, with the option to edit before sending.
        </p>
      </div>

      <div className="flex items-center gap-1 p-1 bg-[#121418] border border-[#2d323f] rounded-xl w-fit">
        {(["pending", "approved", "rejected"] as AgentActionStatus[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3.5 py-2 rounded-lg font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              tab === t ? "bg-teal-600 text-white shadow-sm" : "text-slate-400 hover:text-white hover:bg-[#1e232d]"
            }`}
          >
            <span className="capitalize">{t}</span>
            {t === "pending" && pendingCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-white/20 font-bold">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="p-10 text-center bg-[#181b21] rounded-2xl border border-[#2d323f] text-slate-400 text-xs space-y-2">
          <Bot className="w-8 h-8 text-slate-600 mx-auto" />
          <p>
            {tab === "pending"
              ? "No pending actions right now. Enable \"Auto-run\" on an Industry Playbook, or propose an offer from a lead/contact, to see items here."
              : `No ${tab} actions yet.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((a) => (
            <ActionCard key={a.id} action={a} />
          ))}
        </div>
      )}
    </div>
  );
};
