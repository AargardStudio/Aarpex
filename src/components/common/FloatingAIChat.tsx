import React, { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Sparkles, Check, Ban, Loader2, AlertTriangle } from "lucide-react";
import { useCRM, NavView } from "../../context/CRMContext";
import { apiFetch } from "../../lib/apiClient";
import { InvoiceItem } from "../../types";

type ActionEntity = "lead" | "contact" | "company" | "deal" | "task" | "activity" | "invoice";
type ActionType = "create" | "update" | "delete";

interface ProposedAction {
  id: string;
  type: ActionType;
  entity: ActionEntity;
  summary: string;
  params: any;
  error?: string;
  status?: "pending" | "confirmed" | "dismissed" | "failed";
  resultText?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  actions?: ProposedAction[];
}

const ENTITY_LABEL: Record<ActionEntity, string> = {
  lead: "Lead",
  contact: "Contact",
  company: "Company",
  deal: "Deal",
  task: "Task",
  activity: "Activity",
  invoice: "Invoice",
};

const todayISO = () => new Date().toISOString().split("T")[0];
const daysFromNow = (n: number) => new Date(Date.now() + n * 86400000).toISOString().split("T")[0];

// Floating chat bubble ("Sales Intelligence Copilot") available on every
// screen. It can answer questions about the signed-in workspace's own CRM
// data, jump the user to a screen, AND -- as of this version -- propose
// creating/editing/deleting Leads, Contacts, Companies, Deals, Tasks,
// Activities, and Invoices. Every proposed action is shown to the user as an
// explicit confirmation card; nothing is ever applied to real data until
// they click Confirm. Missing optional fields are filled with the same
// sane defaults the Quick Create form uses.
export const FloatingAIChat: React.FC = () => {
  const {
    leads,
    deals,
    invoices,
    tasks,
    companies,
    contacts,
    emailCampaigns,
    pipelines,
    currentUser,
    setActiveNav,
    addLead,
    updateLead,
    deleteLead,
    addContact,
    updateContact,
    deleteContact,
    addCompany,
    updateCompany,
    deleteCompany,
    addDeal,
    updateDeal,
    deleteDeal,
    addTask,
    updateTask,
    deleteTask,
    addActivity,
    deleteActivity,
    addInvoice,
    updateInvoice,
    deleteInvoice,
    knowledgeBase,
  } = useCRM();

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: "Hi! I'm your Sales Intelligence Copilot. Ask me about your leads, deals, invoices -- or ask me to create, update, or delete something and I'll propose it for your confirmation before touching anything.",
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

  // Compact id+name lookup lists so the server can resolve the plain-text
  // names the AI uses ("Acme Corp", "Jane Doe") back to real record IDs,
  // without ever handing the model actual IDs to hallucinate over. Capped
  // to keep the request small on very large workspaces.
  const buildLookups = () => ({
    companies: companies.slice(0, 300).map((c) => ({ id: c.id, name: c.name })),
    contacts: contacts.slice(0, 300).map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName || ""}`.trim() })),
    leads: leads.slice(0, 300).map((l) => ({ id: l.id, name: l.name })),
    deals: deals.slice(0, 300).map((d) => ({ id: d.id, name: d.name })),
    tasks: tasks.slice(0, 200).map((t) => ({ id: t.id, name: t.title })),
    invoices: invoices.slice(0, 200).map((i) => ({ id: i.id, name: i.invoiceNumber })),
    pipelines: pipelines.map((p) => ({ id: p.id, name: p.name, stages: p.stages.map((s) => ({ id: s.id, name: s.name })) })),
  });

  // Ground the assistant in the workspace's own Knowledge Base instead of
  // only live CRM records. Kept deliberately small (most-recently-updated
  // entries first, content truncated per entry, a hard cap per category) so
  // a large KB never blows up the request -- this is a prompt-stuffing
  // approach, not real retrieval, so it only ever sends a bounded slice.
  const KB_MAX_ENTRIES_PER_CATEGORY = 12;
  const KB_MAX_CONTENT_CHARS = 600;
  const buildKnowledgeBase = () => {
    // "Company" entries can be attached to specific Leads/Contacts/Companies
    // -- resolve those ids to plain names here (never send raw ids to the
    // model) so the assistant can tell "this note is about Acme Corp"
    // rather than only "this is general reference content".
    const companyNameById = new Map(companies.map((c) => [c.id, c.name]));
    const contactNameById = new Map(contacts.map((c) => [c.id, `${c.firstName} ${c.lastName || ""}`.trim()]));
    const leadNameById = new Map(leads.map((l) => [l.id, l.name]));
    const resolveLinkedNames = (e: (typeof knowledgeBase)[number]): string[] => [
      ...(e.linkedLeadIds || []).map((id) => leadNameById.get(id)).filter(Boolean),
      ...(e.linkedContactIds || []).map((id) => contactNameById.get(id)).filter(Boolean),
      ...(e.linkedCompanyIds || []).map((id) => companyNameById.get(id)).filter(Boolean),
    ] as string[];

    const byCategory = (category: "company" | "product" | "operator") =>
      knowledgeBase
        .filter((e) => e.category === category)
        .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
        .slice(0, KB_MAX_ENTRIES_PER_CATEGORY)
        .map((e) => ({
          title: e.title,
          content: e.content.length > KB_MAX_CONTENT_CHARS ? `${e.content.slice(0, KB_MAX_CONTENT_CHARS)}...` : e.content,
          ...(category === "company" ? { linkedNames: resolveLinkedNames(e) } : {}),
        }));
    return {
      company: byCategory("company"),
      product: byCategory("product"),
      operator: byCategory("operator"),
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
          lookups: buildLookups(),
          knowledgeBase: buildKnowledgeBase(),
        }),
      });
      const data = await res.json();
      const actions: ProposedAction[] = (data.actions || []).map((a: any) => ({ ...a, status: "pending" as const }));
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: data.reply || "I'm not sure how to answer that.", actions: actions.length ? actions : undefined },
      ]);
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

  // Fills in the same sane defaults the Quick Create form uses for anything
  // the AI didn't specify, then calls the matching CRM context function.
  // Returns a short human-readable result string for the chat transcript.
  const executeAction = (action: ProposedAction): string => {
    const p = action.params || {};

    if (action.entity === "lead") {
      if (action.type === "create") {
        const lead = addLead({
          name: p.name || "Unnamed Lead",
          company: p.company || "",
          jobTitle: p.jobTitle || "",
          email: p.email || "",
          phone: p.phone || "",
          industry: p.industry || "Technology / SaaS",
          country: p.country || "United States",
          city: p.city || "",
          source: p.source || "AI Assistant",
          salesperson: currentUser.name,
          leadScore: p.leadScore ?? 60,
          priority: p.priority || "Medium",
          status: p.status || "New",
          estimatedValue: Number(p.estimatedValue) || 0,
          notes: p.notes || "",
          tags: [],
          lastContact: todayISO(),
          expectedCloseDate: p.expectedCloseDate || daysFromNow(30),
          nextFollowUp: daysFromNow(3),
        });
        return `Created lead "${lead.name}"${lead.company ? ` (${lead.company})` : ""}.`;
      }
      if (action.type === "update") {
        updateLead(p.id, p.updates || {});
        return `Updated lead.`;
      }
      if (action.type === "delete") {
        const target = leads.find((l) => l.id === p.id);
        deleteLead(p.id);
        return `Deleted lead${target ? ` "${target.name}"` : ""}.`;
      }
    }

    if (action.entity === "contact") {
      if (action.type === "create") {
        const contact = addContact({
          firstName: p.firstName || "New",
          lastName: p.lastName || "Contact",
          companyId: p.companyId,
          position: p.position || "",
          email: p.email || "",
          phone: p.phone || "",
          salesperson: currentUser.name,
          status: p.status || "Active",
          leadSource: p.leadSource || "Direct Contact",
          notes: p.notes || "",
          country: p.country || "United States",
          city: p.city || "",
          tags: [],
        });
        return `Created contact "${contact.firstName} ${contact.lastName}".`;
      }
      if (action.type === "update") {
        updateContact(p.id, p.updates || {});
        return `Updated contact.`;
      }
      if (action.type === "delete") {
        const target = contacts.find((c) => c.id === p.id);
        deleteContact(p.id);
        return `Deleted contact${target ? ` "${target.firstName} ${target.lastName}"` : ""}.`;
      }
    }

    if (action.entity === "company") {
      if (action.type === "create") {
        const company = addCompany({
          name: p.name || "New Company",
          industry: p.industry || "Technology / SaaS",
          website: p.website || "",
          city: p.city || "",
          country: p.country || "United States",
          phone: p.phone || "",
          email: p.email || "",
          salesperson: currentUser.name,
          status: p.status || "Qualified Prospect",
          customerValue: 0,
          address: "",
          notes: p.notes || "",
          tags: [],
        });
        return `Created company "${company.name}".`;
      }
      if (action.type === "update") {
        updateCompany(p.id, p.updates || {});
        return `Updated company.`;
      }
      if (action.type === "delete") {
        const target = companies.find((c) => c.id === p.id);
        deleteCompany(p.id);
        return `Deleted company${target ? ` "${target.name}"` : ""}.`;
      }
    }

    if (action.entity === "deal") {
      if (action.type === "create") {
        const defaultPipeline = pipelines.find((pl) => pl.id === p.pipelineId) || pipelines.find((pl) => pl.isDefault) || pipelines[0];
        const defaultStage = defaultPipeline.stages.find((s) => s.id === p.stageId) || defaultPipeline.stages[0];
        const deal = addDeal({
          name: p.name || `${companies.find((c) => c.id === p.companyId)?.name || "New"} Deal`,
          companyId: p.companyId,
          contactId: p.contactId,
          salesperson: currentUser.name,
          pipelineId: defaultPipeline.id,
          stageId: defaultStage.id,
          dealValue: Number(p.dealValue) || 0,
          currency: p.currency || "USD",
          probability: defaultStage.probability,
          expectedCloseDate: p.expectedCloseDate || daysFromNow(30),
          productService: p.productService || "",
          priority: p.priority || "Medium",
          status: "Open",
          source: p.source || "Direct Sales",
          notes: p.notes || "",
          lastActivity: todayISO(),
          nextActivity: "Follow up",
        });
        return `Created deal "${deal.name}".`;
      }
      if (action.type === "update") {
        updateDeal(p.id, p.updates || {});
        return `Updated deal.`;
      }
      if (action.type === "delete") {
        const target = deals.find((d) => d.id === p.id);
        deleteDeal(p.id);
        return `Deleted deal${target ? ` "${target.name}"` : ""}.`;
      }
    }

    if (action.entity === "task") {
      if (action.type === "create") {
        addTask({
          title: p.title || "New Task",
          companyId: p.companyId,
          contactId: p.contactId,
          dealId: p.dealId,
          assignedUser: currentUser.name,
          priority: p.priority || "Medium",
          dueDate: p.dueDate || daysFromNow(2),
          status: p.status || "To Do",
          notes: p.notes || "",
        });
        return `Created task "${p.title || "New Task"}".`;
      }
      if (action.type === "update") {
        updateTask(p.id, p.updates || {});
        return `Updated task.`;
      }
      if (action.type === "delete") {
        const target = tasks.find((t) => t.id === p.id);
        deleteTask(p.id);
        return `Deleted task${target ? ` "${target.title}"` : ""}.`;
      }
    }

    if (action.entity === "activity") {
      if (action.type === "create") {
        addActivity({
          type: p.type || "Note",
          companyId: p.companyId,
          contactId: p.contactId,
          dealId: p.dealId,
          date: todayISO(),
          time: new Date().toTimeString().slice(0, 5),
          user: currentUser.name,
          description: p.description || "",
          outcome: p.outcome || "",
          nextAction: p.nextAction || "",
        });
        return `Logged ${p.type || "Note"} activity.`;
      }
      if (action.type === "delete") {
        deleteActivity(p.id);
        return `Deleted activity.`;
      }
    }

    if (action.entity === "invoice") {
      if (action.type === "create") {
        const items: Omit<InvoiceItem, "id" | "total">[] =
          Array.isArray(p.items) && p.items.length > 0
            ? p.items.map((it: any) => ({
                description: it.description || "Item",
                quantity: Number(it.quantity) || 1,
                unitPrice: Number(it.unitPrice) || 0,
                discountPercent: Number(it.discountPercent) || 0,
                taxPercent: Number(it.taxPercent) || 0,
              }))
            : [{ description: "Service", quantity: 1, unitPrice: 0, discountPercent: 0, taxPercent: 0 }];
        const invoice = addInvoice({
          invoiceNumber: `INV-${Date.now().toString(36).toUpperCase()}`,
          companyId: p.companyId,
          contactId: p.contactId,
          dealId: p.dealId,
          issueDate: todayISO(),
          dueDate: p.dueDate || daysFromNow(30),
          currency: p.currency || "USD",
          items: items as any,
          notes: p.notes || "Payment due within 30 days of invoice date.",
        });
        return `Created invoice ${invoice.invoiceNumber} for $${invoice.total.toLocaleString()}.`;
      }
      if (action.type === "update") {
        updateInvoice(p.id, p.updates || {});
        return `Updated invoice.`;
      }
      if (action.type === "delete") {
        const target = invoices.find((i) => i.id === p.id);
        deleteInvoice(p.id);
        return `Deleted invoice${target ? ` ${target.invoiceNumber}` : ""}.`;
      }
    }

    return "Nothing to do.";
  };

  const updateActionInMessages = (actionId: string, updates: Partial<ProposedAction>) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.actions
          ? { ...m, actions: m.actions.map((a) => (a.id === actionId ? { ...a, ...updates } : a)) }
          : m
      )
    );
  };

  const handleConfirmAction = (action: ProposedAction) => {
    try {
      const resultText = executeAction(action);
      updateActionInMessages(action.id, { status: "confirmed", resultText });
    } catch (err: any) {
      console.error("[FloatingAIChat] action failed:", err);
      updateActionInMessages(action.id, { status: "failed", resultText: err?.message || "That action failed to run." });
    }
  };

  const handleDismissAction = (action: ProposedAction) => {
    updateActionInMessages(action.id, { status: "dismissed" });
  };

  return (
    <div className="fixed bottom-5 right-5 z-[60] flex flex-col items-end gap-3">
      {isOpen && (
        <div className="w-[340px] sm:w-[400px] h-[520px] bg-[#181b21] border border-[#2d323f] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="px-4 py-3 border-b border-[#2d323f] bg-[#121418] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-teal-500/10 border border-teal-500/30 text-teal-400 flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">Sales Intelligence Copilot</div>
                <div className="text-[10px] text-teal-400">AarPex AI &middot; Q&A + actions</div>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3.5 space-y-2.5 custom-scrollbar">
            {messages.map((m, idx) => (
              <div key={idx} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"} gap-1.5`}>
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-teal-600 text-white rounded-br-sm"
                      : "bg-[#252a36] text-slate-100 border border-[#3d4455] rounded-bl-sm"
                  }`}
                >
                  {m.text}
                </div>

                {m.actions && m.actions.length > 0 && (
                  <div className="w-full max-w-[92%] space-y-1.5">
                    {m.actions.map((a) => (
                      <div
                        key={a.id}
                        className={`p-2.5 rounded-lg border text-[11px] ${
                          a.error
                            ? "bg-rose-950/30 border-rose-800/50"
                            : a.status === "confirmed"
                            ? "bg-emerald-950/30 border-emerald-800/50"
                            : a.status === "failed"
                            ? "bg-rose-950/30 border-rose-800/50"
                            : a.status === "dismissed"
                            ? "bg-[#181b21] border-[#2d323f] opacity-60"
                            : "bg-[#121418] border-teal-500/30"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-[#252a36] border border-[#3d4455] text-teal-300">
                            {a.type} {ENTITY_LABEL[a.entity]}
                          </span>
                        </div>
                        <p className="text-slate-300">{a.summary}</p>

                        {a.error && (
                          <div className="mt-1.5 flex items-start gap-1.5 text-rose-300">
                            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                            <span>{a.error}</span>
                          </div>
                        )}

                        {!a.error && (!a.status || a.status === "pending") && (
                          <div className="flex items-center gap-1.5 mt-2">
                            <button
                              onClick={() => handleConfirmAction(a)}
                              className="flex-1 px-2 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-md font-bold flex items-center justify-center gap-1"
                            >
                              <Check className="w-3 h-3" />
                              Confirm
                            </button>
                            <button
                              onClick={() => handleDismissAction(a)}
                              className="flex-1 px-2 py-1.5 bg-[#252a36] hover:bg-[#2f3544] text-slate-300 rounded-md font-semibold flex items-center justify-center gap-1"
                            >
                              <Ban className="w-3 h-3" />
                              Dismiss
                            </button>
                          </div>
                        )}

                        {a.status === "confirmed" && (
                          <div className="mt-1.5 flex items-center gap-1.5 text-emerald-300 font-semibold">
                            <Check className="w-3 h-3" />
                            <span>{a.resultText || "Done."}</span>
                          </div>
                        )}
                        {a.status === "failed" && (
                          <div className="mt-1.5 flex items-center gap-1.5 text-rose-300 font-semibold">
                            <AlertTriangle className="w-3 h-3" />
                            <span>{a.resultText}</span>
                          </div>
                        )}
                        {a.status === "dismissed" && (
                          <div className="mt-1.5 text-slate-500 italic">Dismissed.</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {isSending && (
              <div className="flex justify-start">
                <div className="px-3 py-2 rounded-xl text-xs bg-[#252a36] text-slate-400 border border-[#3d4455] rounded-bl-sm flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Thinking...
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleSend} className="p-3 border-t border-[#2d323f] flex items-center gap-2 bg-[#121418]">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask, or say 'create a lead for...'"
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
