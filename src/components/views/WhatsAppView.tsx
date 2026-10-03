import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  MessageCircle,
  Search,
  Send,
  Sparkles,
  Loader2,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  ArrowLeft,
  Hand,
  Bot,
  Plus,
  X,
  RefreshCw,
  FileText,
  ExternalLink,
} from "lucide-react";
import { useCRM } from "../../context/CRMContext";
import { phoneDigits, samePhone } from "../../lib/whatsappStore";
import type { Lead, WhatsAppMessage } from "../../types";

// WhatsApp window: the same leads as the email flow, conversations instead of
// threads. Inbound messages arrive through the Meta webhook; the Industry
// Agent (when switched on for WhatsApp) drafts replies into Agent Approvals
// -- nothing is sent unless you approve it or send it yourself here.

type Folder = "chats" | "unread" | "sent" | "drafts";

interface Thread {
  key: string; // last 9 digits
  phone: string;
  lead?: Lead;
  messages: WhatsAppMessage[]; // newest first
  last: WhatsAppMessage;
}

const timeLabel = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const diff = (now.getTime() - d.getTime()) / 86400000;
  if (diff < 6) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
};

const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const y = new Date(now.getTime() - 86400000);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
};

const Ticks: React.FC<{ status?: string }> = ({ status }) => {
  if (status === "failed") return <AlertCircle className="w-3 h-3 text-rose-400" />;
  if (status === "read") return <CheckCheck className="w-3 h-3 text-sky-400" />;
  if (status === "delivered") return <CheckCheck className="w-3 h-3 text-slate-400" />;
  if (status === "sent") return <Check className="w-3 h-3 text-slate-400" />;
  return <Clock className="w-3 h-3 text-slate-500" />;
};

export const WhatsAppView: React.FC = () => {
  const {
    leads,
    activeTenant,
    whatsappMessages,
    refreshWhatsApp,
    sendWhatsApp,
    whatsAppWindowOpen,
    draftWhatsAppReply,
    markWhatsAppRead,
    whatsAppUnread,
    agentActions,
    approveAndSendAgentAction,
    resolveAgentAction,
    setLeadOperatorControl,
    setSelectedLeadId,
    getAgentForIndustry,
    setActiveNav,
    setSettingsDeepLinkTab,
  } = useCRM() as any;

  const [folder, setFolder] = useState<Folder>("chats");
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatQuery, setNewChatQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const waCfg = activeTenant?.whatsappConfig;
  const connected = !!waCfg?.isEnabled;

  const leadByKey = useMemo(() => {
    const map = new Map<string, Lead>();
    (leads as Lead[]).forEach((l) => {
      for (const p of [l.whatsapp, l.phone]) {
        const d = phoneDigits(p).slice(-9);
        if (d.length >= 7 && !map.has(d)) map.set(d, l);
      }
    });
    return map;
  }, [leads]);

  const threads: Thread[] = useMemo(() => {
    const byKey = new Map<string, WhatsAppMessage[]>();
    (whatsappMessages as WhatsAppMessage[]).forEach((m) => {
      const k = phoneDigits(m.phone).slice(-9);
      if (!k) return;
      byKey.set(k, [...(byKey.get(k) || []), m]);
    });
    const out: Thread[] = [];
    byKey.forEach((msgs, key) => {
      const sorted = [...msgs].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      const lead = leadByKey.get(key) || (sorted.find((m) => m.leadId) ? (leads as Lead[]).find((l) => l.id === sorted.find((m) => m.leadId)!.leadId) : undefined);
      out.push({ key, phone: sorted[0].phone, lead, messages: sorted, last: sorted[0] });
    });
    return out.sort((a, b) => (a.last.createdAt < b.last.createdAt ? 1 : -1));
  }, [whatsappMessages, leadByKey, leads]);

  const pendingDrafts = (agentActions as any[]).filter((a) => a.status === "pending" && (a.actionType === "whatsapp_reply" || a.actionType === "whatsapp_follow_up"));
  const draftFor = (key: string) => pendingDrafts.filter((a) => phoneDigits(a.recipientPhone).slice(-9) === key);

  const sentMessages = useMemo(
    () => (whatsappMessages as WhatsAppMessage[]).filter((m) => m.direction === "out").sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [whatsappMessages]
  );

  const q = query.trim().toLowerCase();
  const matches = (t: Thread) =>
    !q ||
    (t.lead?.name || "").toLowerCase().includes(q) ||
    (t.lead?.company || "").toLowerCase().includes(q) ||
    t.phone.includes(q.replace(/[^\d]/g, "") || "~~") ||
    (t.last.body || "").toLowerCase().includes(q);

  const visibleThreads = threads.filter(matches).filter((t) => {
    if (folder === "unread") return whatsAppUnread(t.phone) > 0;
    if (folder === "drafts") return draftFor(t.key).length > 0;
    return true;
  });

  const selected = threads.find((t) => t.key === selectedKey) || (selectedKey ? undefined : undefined);
  const selectedLead: Lead | undefined = selected?.lead || (selectedKey ? leadByKey.get(selectedKey) : undefined);
  const selectedPhone = selected?.phone || (selectedLead ? phoneDigits(selectedLead.whatsapp || selectedLead.phone) : "");

  const open = (key: string) => {
    setSelectedKey(key);
    setNewChatOpen(false);
    const t = threads.find((x) => x.key === key);
    markWhatsAppRead(t?.phone || key);
  };

  const unreadTotal = threads.reduce((n, t) => n + whatsAppUnread(t.phone), 0);

  const doRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshWhatsApp();
    } finally {
      setRefreshing(false);
    }
  };

  // ---- composer state (per open conversation) ----
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useTemplate, setUseTemplate] = useState(false);
  const [tplName, setTplName] = useState("");
  const [tplLang, setTplLang] = useState("en_US");
  const [tplParams, setTplParams] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const windowOpen = whatsAppWindowOpen(selectedPhone);
  useEffect(() => {
    setText("");
    setError(null);
    setUseTemplate(false);
  }, [selectedKey]);
  useEffect(() => {
    if (selectedKey) {
      bottomRef.current?.scrollIntoView({ block: "end" });
      markWhatsAppRead(selectedPhone);
    }
  }, [selectedKey, selected?.messages.length]);

  const send = async () => {
    if (!selectedPhone) return;
    setSending(true);
    setError(null);
    try {
      const r = useTemplate
        ? await sendWhatsApp({
            leadId: selectedLead?.id,
            to: selectedPhone,
            templateName: tplName.trim(),
            templateLanguage: tplLang.trim() || "en_US",
            templateParams: tplParams.split(",").map((p) => p.trim()).filter(Boolean),
          })
        : await sendWhatsApp({ leadId: selectedLead?.id, to: selectedPhone, text: text.trim() });
      if (!r.ok) {
        setError(r.error || "Couldn't send.");
        if (r.outsideWindow) setUseTemplate(true);
      } else {
        setText("");
        setTplParams("");
      }
    } finally {
      setSending(false);
    }
  };

  const aiDraft = async () => {
    if (!selectedLead) return;
    setDrafting(true);
    setError(null);
    try {
      const body = await draftWhatsAppReply(selectedLead.id);
      if (body) setText(body);
      else setError("Couldn't draft a reply just now. Try again.");
    } finally {
      setDrafting(false);
    }
  };

  const startChat = (lead: Lead) => {
    const phone = phoneDigits(lead.whatsapp || lead.phone);
    if (!phone) return;
    const key = phone.slice(-9);
    setSelectedKey(key);
    setNewChatOpen(false);
    setNewChatQuery("");
  };

  const chatCandidates = (leads as Lead[])
    .filter((l) => phoneDigits(l.whatsapp || l.phone).length >= 7)
    .filter((l) => {
      const s = newChatQuery.trim().toLowerCase();
      return !s || l.name.toLowerCase().includes(s) || (l.company || "").toLowerCase().includes(s);
    })
    .slice(0, 30);

  const goSettings = () => {
    setSettingsDeepLinkTab?.("whatsapp");
    setActiveNav("Settings");
  };

  const agent = selectedLead ? getAgentForIndustry(selectedLead.industry) : undefined;
  const showList = !selectedKey;

  // ---------------- render ----------------
  const ListPane = (
    <div className={`flex flex-col min-h-0 bg-[#181b21] border border-[#2d323f] rounded-2xl overflow-hidden ${showList ? "flex" : "hidden"} lg:flex lg:w-[360px] lg:shrink-0 w-full`}>
      <div className="p-3 border-b border-[#2d323f] space-y-2.5">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chats"
              className="w-full pl-8 pr-2.5 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-lg text-xs focus:outline-none focus:border-emerald-400"
            />
          </div>
          <button onClick={doRefresh} title="Check for new messages" className="p-2 rounded-lg border border-[#2d323f] text-slate-400 hover:text-emerald-300">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <button onClick={() => setNewChatOpen((v) => !v)} title="New chat" className="p-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {([
            ["chats", "Chats", threads.length],
            ["unread", "Unread", unreadTotal],
            ["sent", "Sent", sentMessages.length],
            ["drafts", "AI drafts", pendingDrafts.length],
          ] as Array<[Folder, string, number]>).map(([id, label, n]) => (
            <button
              key={id}
              onClick={() => setFolder(id)}
              className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                folder === id ? "bg-emerald-600 text-white border-emerald-600" : "bg-transparent text-slate-400 border-[#2d323f] hover:text-white"
              }`}
            >
              {label}
              {n > 0 && <span className={`ml-1 ${folder === id ? "text-emerald-100" : "text-slate-500"}`}>{n}</span>}
            </button>
          ))}
        </div>
      </div>

      {newChatOpen && (
        <div className="p-3 border-b border-[#2d323f] bg-[#14171c] space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-300">
            Start a chat with a lead
            <button onClick={() => setNewChatOpen(false)} className="text-slate-500 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <input
            autoFocus
            value={newChatQuery}
            onChange={(e) => setNewChatQuery(e.target.value)}
            placeholder="Search leads with a phone number"
            className="w-full px-2.5 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-lg text-xs focus:outline-none focus:border-emerald-400"
          />
          <div className="max-h-48 overflow-y-auto divide-y divide-[#2d323f]">
            {chatCandidates.length === 0 && <div className="py-3 text-[11px] text-slate-500">No leads with a phone or WhatsApp number match.</div>}
            {chatCandidates.map((l) => (
              <button key={l.id} onClick={() => startChat(l)} className="w-full text-left py-2 px-1 hover:bg-white/5">
                <div className="text-xs font-semibold text-white">{l.name}</div>
                <div className="text-[11px] text-slate-500">{l.company || "—"} · {l.whatsapp || l.phone}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {folder === "sent" ? (
          sentMessages.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">Nothing sent over WhatsApp yet.</div>
          ) : (
            sentMessages
              .filter((m) => {
                if (!q) return true;
                const lead = leadByKey.get(phoneDigits(m.phone).slice(-9));
                return (lead?.name || "").toLowerCase().includes(q) || (m.body || "").toLowerCase().includes(q);
              })
              .slice(0, 300)
              .map((m) => {
                const key = phoneDigits(m.phone).slice(-9);
                const lead = leadByKey.get(key);
                return (
                  <button key={m.id} onClick={() => open(key)} className="w-full text-left px-3 py-2.5 border-b border-[#23262f] hover:bg-white/5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-white truncate">To {lead?.name || `+${m.phone}`}</span>
                      <span className="text-[10px] text-slate-500 shrink-0">{timeLabel(m.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Ticks status={m.status} />
                      <span className="text-[11px] text-slate-400 truncate">{m.body}</span>
                    </div>
                    {m.status === "failed" && m.error && <div className="text-[10px] text-rose-400 mt-0.5 truncate">{m.error}</div>}
                  </button>
                );
              })
          )
        ) : visibleThreads.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            {threads.length === 0 ? "No WhatsApp conversations yet. Start one with the + button, or wait for a lead to message you." : "Nothing here."}
          </div>
        ) : (
          visibleThreads.map((t) => {
            const unread = whatsAppUnread(t.phone);
            const drafts = draftFor(t.key).length;
            return (
              <button
                key={t.key}
                onClick={() => open(t.key)}
                className={`w-full text-left px-3 py-2.5 border-b border-[#23262f] hover:bg-white/5 ${selectedKey === t.key ? "bg-white/5" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-xs truncate ${unread ? "font-bold text-white" : "font-semibold text-slate-200"}`}>{t.lead?.name || `+${t.phone}`}</span>
                  <span className={`text-[10px] shrink-0 ${unread ? "text-emerald-400 font-bold" : "text-slate-500"}`}>{timeLabel(t.last.createdAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {t.last.direction === "out" && <Ticks status={t.last.status} />}
                    <span className="text-[11px] text-slate-400 truncate">{t.last.body}</span>
                  </div>
                  {unread > 0 && <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">{unread}</span>}
                </div>
                {(drafts > 0 || t.lead?.operatorInControl) && (
                  <div className="flex gap-1.5 mt-1">
                    {drafts > 0 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">AI draft waiting</span>}
                    {t.lead?.operatorInControl && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30">You're in charge</span>}
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  const threadMessages = selected ? [...selected.messages].reverse() : [];
  const drafts = selectedKey ? draftFor(selectedKey) : [];

  const ChatPane = (
    <div className={`flex-1 min-w-0 flex-col min-h-0 bg-[#181b21] border border-[#2d323f] rounded-2xl overflow-hidden ${showList ? "hidden lg:flex" : "flex"}`}>
      {!selectedKey ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-500">
          <MessageCircle className="w-10 h-10 text-emerald-500/50 mb-3" />
          <div className="text-sm font-semibold text-slate-300">Pick a conversation</div>
          <div className="text-xs mt-1 max-w-xs">Replies from your leads land here. Drafts written by your Industry Agents wait for your approval.</div>
        </div>
      ) : (
        <>
          <div className="px-3 py-2.5 border-b border-[#2d323f] flex items-center gap-2">
            <button onClick={() => setSelectedKey(null)} className="lg:hidden p-1.5 -ml-1 text-slate-400 hover:text-white">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-white truncate">{selectedLead?.name || `+${selectedPhone}`}</div>
              <div className="text-[11px] text-slate-500 truncate">
                {selectedLead ? `${selectedLead.company || "—"}${selectedLead.industry ? ` · ${selectedLead.industry}` : ""} · ` : "Not matched to a lead · "}+{selectedPhone}
              </div>
            </div>
            {selectedLead && agent?.whatsappEnabled && !selectedLead.operatorInControl && (
              <span title={`${agent.industry} agent drafts replies here`} className="hidden sm:flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                <Bot className="w-3 h-3" /> Agent on
              </span>
            )}
            {selectedLead && (
              <button
                onClick={() => setLeadOperatorControl(selectedLead.id, !selectedLead.operatorInControl)}
                title={selectedLead.operatorInControl ? "Hand back to the AI agent" : "Take charge: the AI stops drafting for this lead"}
                className={`flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-lg border ${
                  selectedLead.operatorInControl ? "bg-amber-500/15 text-amber-300 border-amber-500/30" : "border-[#2d323f] text-slate-300 hover:text-white"
                }`}
              >
                <Hand className="w-3 h-3" /> {selectedLead.operatorInControl ? "In charge" : "Take charge"}
              </button>
            )}
            {selectedLead && (
              <button onClick={() => setSelectedLeadId(selectedLead.id)} title="Open lead profile" className="p-1.5 text-slate-400 hover:text-emerald-300">
                <ExternalLink className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5 bg-[#121418]">
            {threadMessages.length === 0 && <div className="text-center text-xs text-slate-500 py-10">No messages yet. Say hello below.</div>}
            {threadMessages.map((m, i) => {
              const prev = threadMessages[i - 1];
              const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
              const mine = m.direction === "out";
              return (
                <React.Fragment key={m.id}>
                  {newDay && (
                    <div className="flex justify-center py-1.5">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1f232b] text-slate-500">{dayLabel(m.createdAt)}</span>
                    </div>
                  )}
                  <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[82%] sm:max-w-[70%] px-3 py-2 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap break-words ${mine ? "bg-emerald-700/80 text-white rounded-br-md" : "bg-[#232831] text-slate-100 rounded-bl-md"}`}>
                      {m.templateName && <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-emerald-200/80 mb-0.5"><FileText className="w-3 h-3" /> Template</div>}
                      {m.body}
                      <div className="flex items-center justify-end gap-1 mt-0.5 text-[10px] text-white/50">
                        {mine && m.source === "agent_approved" && <span title="Drafted by your agent, approved by you">AI draft ·</span>}
                        {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {mine && <Ticks status={m.status} />}
                      </div>
                      {m.status === "failed" && m.error && <div className="text-[10px] text-rose-300 mt-1">{m.error}</div>}
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {drafts.map((d) => (
            <DraftCard
              key={d.id}
              action={d}
              onApprove={(body) => approveAndSendAgentAction(d.id, { body })}
              onReject={() => resolveAgentAction(d.id, "rejected")}
            />
          ))}

          <div className="p-3 border-t border-[#2d323f] space-y-2">
            {!connected ? (
              <div className="text-xs text-amber-300 flex items-center justify-between gap-2">
                <span>WhatsApp isn't connected yet.</span>
                <button onClick={goSettings} className="underline font-semibold">Open Settings</button>
              </div>
            ) : (
              <>
                {!windowOpen && !useTemplate && (
                  <div className="text-[11px] text-amber-300/90 flex items-center justify-between gap-2">
                    <span>More than 24 hours since they last wrote, so WhatsApp only allows an approved template.</span>
                    <button onClick={() => setUseTemplate(true)} className="underline font-semibold shrink-0">Use template</button>
                  </div>
                )}
                {useTemplate ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="template_name" className="col-span-2 px-2.5 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-lg text-xs font-mono focus:outline-none focus:border-emerald-400" />
                      <input value={tplLang} onChange={(e) => setTplLang(e.target.value)} placeholder="en_US" className="px-2.5 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-lg text-xs font-mono focus:outline-none focus:border-emerald-400" />
                    </div>
                    <input value={tplParams} onChange={(e) => setTplParams(e.target.value)} placeholder="Variables in order, comma-separated (optional)" className="w-full px-2.5 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-lg text-xs focus:outline-none focus:border-emerald-400" />
                    <div className="flex items-center justify-between gap-2">
                      {windowOpen ? <button onClick={() => setUseTemplate(false)} className="text-[11px] text-slate-400 underline">Back to a normal message</button> : <span className="text-[11px] text-slate-500">Must be an Approved template on this number.</span>}
                      <button onClick={send} disabled={sending || !tplName.trim()} className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5">
                        {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Send template
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim() && !sending) send();
                      }}
                      rows={3}
                      placeholder="Type a message"
                      className="w-full px-3 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-xl text-sm resize-none focus:outline-none focus:border-emerald-400"
                    />
                    <div className="flex items-center justify-between gap-2">
                      <button onClick={aiDraft} disabled={drafting || !selectedLead} className="px-3 py-2 border border-[#2d323f] text-slate-300 hover:text-emerald-300 disabled:opacity-40 rounded-lg text-xs font-semibold flex items-center gap-1.5">
                        {drafting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Draft with AI
                      </button>
                      <button onClick={send} disabled={sending || !text.trim()} className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5">
                        {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Send
                      </button>
                    </div>
                  </div>
                )}
                {error && <div className="text-[11px] text-rose-400">{error}</div>}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-[calc(100dvh-8.5rem)] min-h-[480px] gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-emerald-400" /> WhatsApp
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">Your leads' WhatsApp conversations. Agent drafts wait for your approval before anything is sent.</p>
        </div>
      </div>
      {!connected && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs flex items-center justify-between gap-2">
          <span>WhatsApp Business isn't connected, so you can read history but not send or receive.</span>
          <button onClick={goSettings} className="underline font-semibold shrink-0">Connect</button>
        </div>
      )}
      <div className="flex-1 min-h-0 flex gap-3">
        {ListPane}
        {ChatPane}
      </div>
    </div>
  );
};

const DraftCard: React.FC<{ action: any; onApprove: (body: string) => Promise<boolean>; onReject: () => void }> = ({ action, onApprove, onReject }) => {
  const [body, setBody] = useState(action.body);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className="mx-3 mb-2 p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-300">
        <Bot className="w-3.5 h-3.5" /> AI draft, not sent yet
      </div>
      {action.reasoning && <div className="text-[11px] text-slate-500 italic truncate">{action.reasoning}</div>}
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} className="w-full px-2.5 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-lg text-xs resize-none focus:outline-none focus:border-emerald-400" />
      {failed && <div className="text-[11px] text-rose-400">Couldn't send. Check the WhatsApp connection, or the 24-hour window.</div>}
      <div className="flex justify-end gap-2">
        <button onClick={onReject} className="px-3 py-1.5 border border-[#2d323f] text-slate-300 hover:text-rose-300 rounded-lg text-xs font-semibold">Discard</button>
        <button
          disabled={busy || !body.trim()}
          onClick={async () => {
            setBusy(true);
            setFailed(false);
            const ok = await onApprove(body);
            setBusy(false);
            if (!ok) setFailed(true);
          }}
          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Approve & send
        </button>
      </div>
    </div>
  );
};
