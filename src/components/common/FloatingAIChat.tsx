import React, { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Sparkles } from "lucide-react";
import { useCRM, NavView } from "../../context/CRMContext";
import { apiFetch } from "../../lib/apiClient";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

// Floating chat bubble ("Sales Intelligence Copilot") available on every
// screen. It can answer questions about the signed-in workspace's own CRM
// data and jump the user to a screen, but -- deliberately, for this first
// version -- it never creates, edits, or deletes anything itself.
export const FloatingAIChat: React.FC = () => {
  const { leads, deals, invoices, tasks, companies, contacts, emailCampaigns, setActiveNav } = useCRM();

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: "Hi! I'm your Sales Intelligence Copilot. Ask me about your leads, deals, invoices, or say \"show me overdue invoices\" and I'll take you there.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const buildContext = () => {
    const openDeals = deals.filter((d) => d.status === "Open");
    const overdueInvoices = invoices.filter(
      (i) => i.status === "Overdue" || ((i.remainingBalance || 0) > 0 && new Date(i.dueDate) < new Date())
    );
    const pendingTasks = tasks.filter((t) => t.status !== "Completed");
    const activeCampaigns = emailCampaigns.filter((c) => c.status === "Active");

    return {
      leadsCount: leads.length,
      hotLeadsCount: leads.filter((l) => l.status !== "Converted" && l.leadScore >= 75).length,
      companiesCount: companies.length,
      contactsCount: contacts.length,
      openDealsCount: openDeals.length,
      openDealsValue: openDeals.reduce((sum, d) => sum + (d.dealValue || 0), 0),
      overdueInvoicesCount: overdueInvoices.length,
      overdueInvoicesValue: overdueInvoices.reduce((sum, i) => sum + (i.remainingBalance || 0), 0),
      pendingTasksCount: pendingTasks.length,
      activeCampaignsCount: activeCampaigns.length,
    };
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isSending) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", text }];
    setMessages(nextMessages);
    setInput("");
    setIsSending(true);

    try {
      const res = await apiFetch("/api/ai/chat-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: nextMessages.slice(-8).map((m) => ({ role: m.role, text: m.text })),
          context: buildContext(),
        }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", text: data.reply || "I'm not sure how to answer that." }]);
      if (data.navigateTo) {
        setActiveNav(data.navigateTo as NavView);
      }
    } catch (err) {
      console.error("[FloatingAIChat] send failed:", err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "I couldn't reach the AI service just now -- please try again." },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-[60] flex flex-col items-end gap-3">
      {isOpen && (
        <div className="w-[340px] sm:w-[380px] h-[480px] bg-[#181b21] border border-[#2d323f] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="px-4 py-3 border-b border-[#2d323f] bg-[#121418] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-teal-500/10 border border-teal-500/30 text-teal-400 flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">Sales Intelligence Copilot</div>
                <div className="text-[10px] text-teal-400">Gemini &middot; Q&A + navigation</div>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3.5 space-y-2.5 custom-scrollbar">
            {messages.map((m, idx) => (
              <div key={idx} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-teal-600 text-white rounded-br-sm"
                      : "bg-[#252a36] text-slate-100 border border-[#3d4455] rounded-bl-sm"
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {isSending && (
              <div className="flex justify-start">
                <div className="px-3 py-2 rounded-xl text-xs bg-[#252a36] text-slate-400 border border-[#3d4455] rounded-bl-sm">
                  Thinking...
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleSend} className="p-3 border-t border-[#2d323f] flex items-center gap-2 bg-[#121418]">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your pipeline, or say 'show me deals'..."
              className="flex-1 px-3 py-2 bg-[#181b21] border border-[#2d323f] text-white rounded-lg text-xs focus:outline-none focus:border-teal-400"
            />
            <button
              type="submit"
              disabled={!input.trim() || isSending}
              className="w-9 h-9 shrink-0 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded-lg flex items-center justify-center"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-14 h-14 rounded-full bg-teal-600 hover:bg-teal-500 text-white shadow-2xl flex items-center justify-center transition-transform hover:scale-105"
        aria-label="Open AI chat"
      >
        {isOpen ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
      </button>
    </div>
  );
};
