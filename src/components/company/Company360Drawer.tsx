import React, { useState } from "react";
import { useCRM } from "../../context/CRMContext";
import {
  X,
  Building2,
  Users,
  Briefcase,
  Receipt,
  CreditCard,
  CalendarCheck,
  MessageSquare,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Phone,
  Mail,
  Globe,
  MapPin,
  Plus,
  ArrowUpRight,
  Send,
  CornerDownRight,
  ShieldCheck,
  ShieldAlert,
  IdCard,
  PhoneCall,
  Trash2,
  UserPlus,
  Link2,
  Pencil,
  Check,
} from "lucide-react";
import { CustomerStatus, CallLogEntry } from "../../types";
import { apiFetch } from "../../lib/apiClient";

const CALL_OUTCOMES: CallLogEntry["outcome"][] = [
  "Connected",
  "No Answer",
  "Voicemail",
  "Follow-Up Needed",
  "Not Interested",
  "Closed",
];

export const Company360Drawer: React.FC = () => {
  const {
    selectedCompanyId,
    setSelectedCompanyId,
    companies,
    updateCompany,
    contacts,
    deals,
    invoices,
    payments,
    activities,
    comments,
    addActivity,
    addComment,
    addCommentReply,
    markInvoicePaid,
    setQuickCreateOpen,
    setQuickCreateType,
    currentUser,
    runCompanyAIAnalysis,
    addCallLogEntry,
    deleteCallLogEntry,
    leads,
    addLead,
    updateLead,
  } = useCRM();

  const [activeTab, setActiveTab] = useState<
    "overview" | "deals" | "invoices" | "timeline" | "comments" | "ai" | "profile"
  >("overview");

  // Business Profile tab state
  const [isProfileAnalyzing, setIsProfileAnalyzing] = useState(false);
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState("");
  const [callDate, setCallDate] = useState(new Date().toISOString().split("T")[0]);
  const [callDuration, setCallDuration] = useState(5);
  const [callOutcome, setCallOutcome] = useState<CallLogEntry["outcome"]>("Connected");
  const [callContactId, setCallContactId] = useState("");
  const [callSummary, setCallSummary] = useState("");

  // Leads section (Business Profile tab) -- link an existing lead to this
  // company, or create a brand-new one directly against it.
  const [leadLinkMode, setLeadLinkMode] = useState<"existing" | "new">("existing");
  const [selectedLeadToLink, setSelectedLeadToLink] = useState("");
  const [newLeadName, setNewLeadName] = useState("");
  const [newLeadJobTitle, setNewLeadJobTitle] = useState("");
  const [newLeadEmail, setNewLeadEmail] = useState("");
  const [newLeadPhone, setNewLeadPhone] = useState("");
  const [newLeadSource, setNewLeadSource] = useState("Manual");

  // Inline activity logging state
  const [newActivityType, setNewActivityType] = useState<any>("Call");
  const [newActivityDesc, setNewActivityDesc] = useState("");
  const [newActivityOutcome, setNewActivityOutcome] = useState("");
  const [newActivityNext, setNewActivityNext] = useState("");

  // Inline comment state
  const [newCommentText, setNewCommentText] = useState("");
  const [replyingCommentId, setReplyingCommentId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  // AI Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysisResult, setAiAnalysisResult] = useState<any>(null);
  const [isGeneratingPitch, setIsGeneratingPitch] = useState(false);
  const [generatedPitch, setGeneratedPitch] = useState<string | null>(null);

  if (!selectedCompanyId) return null;

  const company = companies.find((c) => c.id === selectedCompanyId);
  if (!company) return null;

  const companyContacts = contacts.filter((c) => c.companyId === company.id);
  const companyLeads = leads.filter(
    (l) => l.company.trim().toLowerCase() === company.name.trim().toLowerCase()
  );
  const linkableLeads = leads.filter(
    (l) => l.company.trim().toLowerCase() !== company.name.trim().toLowerCase()
  );
  const companyDeals = deals.filter((d) => d.companyId === company.id);
  const companyInvoices = invoices.filter((i) => i.companyId === company.id);
  const companyPayments = payments.filter((p) => p.companyId === company.id);
  const companyActivities = activities
    .filter((a) => a.companyId === company.id)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const companyComments = comments.filter((c) => c.entityType === "company" && c.entityId === company.id);

  const handleStatusChange = (newStatus: CustomerStatus) => {
    updateCompany(company.id, { status: newStatus });
  };

  const handleStartEditPhone = () => {
    setPhoneDraft(company.phone || "");
    setIsEditingPhone(true);
  };

  const handleSavePhone = () => {
    updateCompany(company.id, { phone: phoneDraft.trim() });
    setIsEditingPhone(false);
  };

  const handleLogActivity = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newActivityDesc) return;
    addActivity({
      type: newActivityType,
      companyId: company.id,
      date: new Date().toISOString().split("T")[0],
      time: "12:00",
      user: currentUser.name,
      description: newActivityDesc,
      outcome: newActivityOutcome || "Completed",
      nextAction: newActivityNext || "Follow up as planned",
    });
    setNewActivityDesc("");
    setNewActivityOutcome("");
    setNewActivityNext("");
  };

  const handlePostComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText) return;
    addComment({
      entityType: "company",
      entityId: company.id,
      content: newCommentText,
      isInternal: false,
    });
    setNewCommentText("");
  };

  const handlePostReply = (commentId: string) => {
    if (!replyText) return;
    addCommentReply(commentId, replyText);
    setReplyingCommentId(null);
    setReplyText("");
  };

  // Trigger Gemini Customer Health & Opportunities Analysis
  const handleRunAiAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const res = await apiFetch("/api/ai/customer-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company,
          deals: companyDeals,
          invoices: companyInvoices,
          activities: companyActivities,
        }),
      });
      const data = await res.json();
      setAiAnalysisResult(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Trigger Gemini Pitch Generator
  const handleGeneratePitch = async () => {
    setIsGeneratingPitch(true);
    try {
      const res = await apiFetch("/api/ai/pitch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company,
          deal: companyDeals[0],
          targetContact: companyContacts[0],
        }),
      });
      const data = await res.json();
      setGeneratedPitch(data.pitch || data.rawText || "Pitch generated.");
    } catch (err) {
      console.error(err);
    } finally {
      setIsGeneratingPitch(false);
    }
  };

  const handleRunProfileAnalysis = async () => {
    setIsProfileAnalyzing(true);
    try {
      await runCompanyAIAnalysis(company.id);
    } finally {
      setIsProfileAnalyzing(false);
    }
  };

  const handleLogCall = (e: React.FormEvent) => {
    e.preventDefault();
    if (!callSummary.trim()) return;
    const contact = companyContacts.find((c) => c.id === callContactId);
    addCallLogEntry(company.id, {
      contactId: contact?.id,
      contactName: contact ? `${contact.firstName} ${contact.lastName}`.trim() : undefined,
      date: callDate,
      durationMinutes: callDuration,
      outcome: callOutcome,
      summary: callSummary.trim(),
    });
    setCallSummary("");
    setCallDuration(5);
    setCallOutcome("Connected");
  };

  const handleLinkExistingLead = () => {
    if (!selectedLeadToLink) return;
    updateLead(selectedLeadToLink, { company: company.name });
    setSelectedLeadToLink("");
  };

  const handleAddNewLead = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLeadName.trim()) return;
    addLead({
      name: newLeadName.trim(),
      company: company.name,
      jobTitle: newLeadJobTitle.trim(),
      email: newLeadEmail.trim(),
      phone: newLeadPhone.trim(),
      website: company.website || "",
      industry: company.industry || "General Industry",
      country: company.country || "",
      city: company.city || "",
      source: newLeadSource.trim() || "Manual",
      salesperson: currentUser.name,
      leadScore: 50,
      priority: "Medium",
      status: "New",
      estimatedValue: 0,
      expectedCloseDate: "",
      lastContact: "",
      nextFollowUp: "",
      tags: ["Manual", "From Company 360"],
      notes: `Added manually from ${company.name}'s Business Profile.`,
    });
    setNewLeadName("");
    setNewLeadJobTitle("");
    setNewLeadEmail("");
    setNewLeadPhone("");
    setNewLeadSource("Manual");
  };

  const statusColors: Record<CustomerStatus, string> = {
    "Active Customer": "bg-emerald-50 text-emerald-700 border-emerald-300",
    "Qualified Prospect": "bg-blue-50 text-blue-700 border-blue-300",
    Prospect: "bg-indigo-50 text-indigo-700 border-indigo-300",
    Lead: "bg-slate-100 text-slate-700 border-slate-300",
    "High Value Customer": "bg-purple-50 text-purple-700 border-purple-300",
    "At Risk": "bg-rose-50 text-rose-700 border-rose-300",
    Dormant: "bg-amber-50 text-amber-700 border-amber-300",
    "Former Customer": "bg-slate-100 text-slate-700 border-slate-300",
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-2xs animate-in fade-in duration-150">
      <div className="w-full max-w-4xl bg-white h-full shadow-2xl flex flex-col border-l border-slate-200 overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Header Bar */}
        <div className="p-6 border-b border-slate-200 bg-slate-50/70">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-600 text-white flex items-center justify-center font-bold text-xl shadow-md">
                {company.name.charAt(0)}
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                    {company.name}
                  </h2>
                  {/* Status Dropdown */}
                  <select
                    value={company.status}
                    onChange={(e) => handleStatusChange(e.target.value as CustomerStatus)}
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full border cursor-pointer focus:outline-none transition-colors ${
                      statusColors[company.status]
                    }`}
                  >
                    <option value="Active Customer">Active Customer</option>
                    <option value="Qualified Prospect">Qualified Prospect</option>
                    <option value="Prospect">Prospect</option>
                    <option value="At Risk">At Risk</option>
                    <option value="Former Customer">Former Customer</option>
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 mt-2">
                  <span className="flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" />
                    {company.industry}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    {company.city}, {company.country}
                  </span>
                  {company.website && (
                    <a
                      href={company.website}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-indigo-600 hover:underline"
                    >
                      <Globe className="w-3.5 h-3.5" />
                      {company.website.replace(/^https?:\/\//, "")}
                    </a>
                  )}
                  <span className="text-slate-400">
                    Assigned: <strong>{company.salesperson}</strong>
                  </span>
                </div>
              </div>
            </div>

            <button
              id="btn-close-company-360"
              onClick={() => setSelectedCompanyId(null)}
              className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Key Financial Badges / Quick Stat Row */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-5">
            <div className="p-2.5 bg-white rounded-xl border border-slate-200">
              <div className="text-[11px] text-slate-500 font-medium">Total Invoiced</div>
              <div className="text-sm font-bold text-slate-800 font-mono mt-0.5">
                ${(company.totalInvoiced || 0).toLocaleString()}
              </div>
            </div>

            <div className="p-2.5 bg-white rounded-xl border border-slate-200">
              <div className="text-[11px] text-slate-500 font-medium">Total Collected</div>
              <div className="text-sm font-bold text-emerald-600 font-mono mt-0.5">
                ${(company.totalPaid || 0).toLocaleString()}
              </div>
            </div>

            <div className="p-2.5 bg-white rounded-xl border border-slate-200">
              <div className="text-[11px] text-slate-500 font-medium">Outstanding Bal</div>
              <div
                className={`text-sm font-bold font-mono mt-0.5 ${
                  (company.outstandingBalance || 0) > 0 ? "text-amber-600" : "text-slate-700"
                }`}
              >
                ${(company.outstandingBalance || 0).toLocaleString()}
              </div>
            </div>

            <div className="p-2.5 bg-white rounded-xl border border-slate-200">
              <div className="text-[11px] text-slate-500 font-medium">Overdue Balance</div>
              <div
                className={`text-sm font-bold font-mono mt-0.5 ${
                  (company.overdueBalance || 0) > 0 ? "text-rose-600 font-extrabold" : "text-slate-400"
                }`}
              >
                ${(company.overdueBalance || 0).toLocaleString()}
              </div>
            </div>

            <div className="p-2.5 bg-white rounded-xl border border-slate-200 col-span-2 sm:col-span-1">
              <div className="text-[11px] text-slate-500 font-medium">Avg Settlement</div>
              <div className="text-sm font-bold text-slate-800 mt-0.5">
                {company.averagePaymentDays || 14} days
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 px-6 bg-white overflow-x-auto">
          {[
            { id: "overview", label: "Overview & Contacts", icon: Building2 },
            { id: "profile", label: "Business Profile", icon: IdCard },
            { id: "deals", label: `Deals (${companyDeals.length})`, icon: Briefcase },
            { id: "invoices", label: `Invoices & Ledger (${companyInvoices.length})`, icon: Receipt },
            { id: "timeline", label: `Activity (${companyActivities.length})`, icon: CalendarCheck },
            { id: "comments", label: `Notes (${companyComments.length})`, icon: MessageSquare },
            { id: "ai", label: "AI Intelligence", icon: Sparkles, badge: "AI" },
          ].map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 py-3 px-3.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
                  isSelected
                    ? "border-teal-400 text-teal-300 bg-[#181b21]"
                    : "border-transparent text-slate-400 hover:text-white"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isSelected ? "text-teal-400" : "text-slate-400"}`} />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className="text-[9px] font-bold px-1.5 py-0.2 bg-[#252a36] text-teal-300 border border-[#3d4455] rounded-full">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-6 text-xs text-slate-200 bg-[#121418] custom-scrollbar">
          {/* OVERVIEW TAB */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Account Profile Card */}
              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Account Details
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Direct Phone</span>
                    {isEditingPhone ? (
                      <div className="flex items-center gap-1 mt-0.5">
                        <input
                          type="tel"
                          autoFocus
                          value={phoneDraft}
                          onChange={(e) => setPhoneDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSavePhone();
                            if (e.key === "Escape") setIsEditingPhone(false);
                          }}
                          placeholder="+1 555 000 0000"
                          className="w-32 px-1.5 py-0.5 border border-indigo-300 rounded text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                        <button
                          onClick={handleSavePhone}
                          className="p-1 rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                          title="Save"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => setIsEditingPhone(false)}
                          className="p-1 rounded bg-slate-100 text-slate-500 hover:bg-slate-200"
                          title="Cancel"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <span className="font-medium text-slate-800 flex items-center gap-1.5 group/phone">
                        {company.phone || "—"}
                        <button
                          onClick={handleStartEditPhone}
                          className="opacity-0 group-hover/phone:opacity-100 text-slate-400 hover:text-indigo-600 transition-opacity"
                          title="Edit phone number"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Primary Email</span>
                    <span className="font-medium text-slate-800">{company.email || "—"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Customer Value Tier</span>
                    <span className="font-medium text-slate-800 font-mono">
                      ${company.customerValue.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Client Since</span>
                    <span className="font-medium text-slate-800">{company.createdAt}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Last Activity</span>
                    <span className="font-medium text-slate-800">
                      {company.lastActivityDate || "No activities logged"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Next Scheduled</span>
                    <span className="font-medium text-indigo-600 font-semibold">
                      {company.nextActivityDate || "None"}
                    </span>
                  </div>
                </div>

                {company.tags && company.tags.length > 0 && (
                  <div className="pt-2">
                    <span className="text-slate-400 block text-[11px] mb-1.5">Tags</span>
                    <div className="flex flex-wrap gap-1.5">
                      {company.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-600 rounded-md text-[11px]"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Contacts Associated */}
              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Contacts ({companyContacts.length})
                  </h3>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setActiveTab("profile")}
                      className="text-xs text-indigo-600 font-semibold hover:underline flex items-center gap-1"
                    >
                      <UserPlus className="w-3.5 h-3.5" /> Add Lead
                    </button>
                    <button
                      onClick={() => {
                        setQuickCreateType("contact");
                        setQuickCreateOpen(true);
                      }}
                      className="text-xs text-indigo-600 font-semibold hover:underline flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Contact
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {companyContacts.map((cnt) => (
                    <div
                      key={cnt.id}
                      className="p-3 bg-slate-50/70 border border-slate-200 rounded-xl space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 text-sm">
                          {cnt.firstName} {cnt.lastName}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-medium">
                          {cnt.status}
                        </span>
                      </div>
                      <div className="text-slate-500 text-xs">{cnt.position}</div>
                      <div className="text-[11px] space-y-0.5 pt-1 text-slate-600">
                        {cnt.email && (
                          <div className="flex items-center gap-1.5">
                            <Mail className="w-3 h-3 text-slate-400" />
                            <a href={`mailto:${cnt.email}`} className="hover:underline text-indigo-600">
                              {cnt.email}
                            </a>
                          </div>
                        )}
                        {cnt.phone && (
                          <div className="flex items-center gap-1.5">
                            <Phone className="w-3 h-3 text-slate-400" />
                            <span>{cnt.phone}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {companyContacts.length === 0 && (
                    <div className="col-span-2 p-4 text-center text-slate-400 text-xs">
                      No contacts added yet. Click &quot;Add Contact&quot; to link people from {company.name}.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* DEALS TAB */}
          {activeTab === "deals" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600">
                  Total Deal Value: $
                  {companyDeals
                    .reduce((sum, d) => sum + d.dealValue, 0)
                    .toLocaleString()}
                </span>
                <button
                  onClick={() => {
                    setQuickCreateType("deal");
                    setQuickCreateOpen(true);
                  }}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Create Deal
                </button>
              </div>

              <div className="space-y-2.5">
                {companyDeals.map((deal) => (
                  <div
                    key={deal.id}
                    className="p-4 bg-white border border-slate-200 rounded-xl shadow-2xs hover:border-indigo-300 transition-all space-y-2"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-bold text-slate-900 text-sm">
                          {deal.name}
                        </div>
                        <div className="text-xs text-slate-500">
                          Product: {deal.productService} • Rep: {deal.salesperson}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-base font-extrabold text-slate-900 font-mono">
                          ${deal.dealValue.toLocaleString()}
                        </div>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            deal.status === "Won"
                              ? "bg-emerald-100 text-emerald-800"
                              : deal.status === "Lost"
                              ? "bg-rose-100 text-rose-800"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {deal.status} ({deal.probability}%)
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                      <div>Expected Close: {deal.expectedCloseDate}</div>
                      <div className="text-indigo-600 font-medium">
                        Next: {deal.nextActivity}
                      </div>
                    </div>
                  </div>
                ))}

                {companyDeals.length === 0 && (
                  <div className="p-8 text-center bg-white rounded-xl border border-slate-200 text-slate-400">
                    No deals registered for this company yet.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* INVOICES & LEDGER TAB */}
          {activeTab === "invoices" && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Invoices Ledger
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setQuickCreateType("invoice");
                      setQuickCreateOpen(true);
                    }}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Issue Invoice
                  </button>
                  <button
                    onClick={() => {
                      setQuickCreateType("payment");
                      setQuickCreateOpen(true);
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1"
                  >
                    <CreditCard className="w-3.5 h-3.5" /> Record Payment
                  </button>
                </div>
              </div>

              {/* Invoices Table */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-3">Invoice #</th>
                      <th className="p-3">Due Date</th>
                      <th className="p-3 text-right">Total</th>
                      <th className="p-3 text-right">Remaining</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {companyInvoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-slate-50/60">
                        <td className="p-3 font-semibold text-slate-800">
                          {inv.invoiceNumber}
                        </td>
                        <td className="p-3 text-slate-500">{inv.dueDate}</td>
                        <td className="p-3 text-right font-mono font-medium">
                          ${inv.total.toLocaleString()}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-slate-800">
                          ${inv.remainingBalance.toLocaleString()}
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              inv.status === "Paid"
                                ? "bg-emerald-100 text-emerald-800"
                                : inv.status === "Overdue"
                                ? "bg-rose-100 text-rose-800"
                                : inv.status === "Partially Paid"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-blue-100 text-blue-800"
                            }`}
                          >
                            {inv.status}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          {inv.remainingBalance > 0 && (
                            <button
                              onClick={() => markInvoicePaid(inv.id)}
                              className="px-2 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded text-[11px] font-semibold border border-emerald-200"
                            >
                              Settle in Full
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Payment History Sub-ledger */}
              <div className="bg-white rounded-xl p-4 border border-slate-200 space-y-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Payment Settlement History ({companyPayments.length})
                </h4>
                <div className="divide-y divide-slate-100">
                  {companyPayments.map((pay) => (
                    <div
                      key={pay.id}
                      className="py-2 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-semibold text-slate-800">
                          {pay.paymentNumber}
                        </span>{" "}
                        <span className="text-slate-400">
                          via {pay.paymentMethod} (Ref: {pay.reference})
                        </span>
                        <div className="text-[10px] text-slate-400">
                          Settled on {pay.date} by {pay.recordedBy}
                        </div>
                      </div>
                      <div className="font-mono font-extrabold text-emerald-600">
                        +${pay.amount.toLocaleString()}
                      </div>
                    </div>
                  ))}
                  {companyPayments.length === 0 && (
                    <div className="py-2 text-slate-400 text-center">
                      No payments recorded yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TIMELINE TAB */}
          {activeTab === "timeline" && (
            <div className="space-y-5">
              {/* Quick inline activity log */}
              <form
                onSubmit={handleLogActivity}
                className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3"
              >
                <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Log New Sales Activity
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={newActivityType}
                    onChange={(e) => setNewActivityType(e.target.value as any)}
                    className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                  >
                    <option>Call</option>
                    <option>Meeting</option>
                    <option>Email</option>
                    <option>Proposal</option>
                    <option>Note</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Outcome (e.g. Agreement reached)"
                    value={newActivityOutcome}
                    onChange={(e) => setNewActivityOutcome(e.target.value)}
                    className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
                  />
                  <input
                    type="text"
                    placeholder="Next Action (e.g. Send terms)"
                    value={newActivityNext}
                    onChange={(e) => setNewActivityNext(e.target.value)}
                    className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Describe discussion, decisions made, or email details..."
                    value={newActivityDesc}
                    onChange={(e) => setNewActivityDesc(e.target.value)}
                    className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                  />
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold"
                  >
                    Log
                  </button>
                </div>
              </form>

              {/* Feed of Activities */}
              <div className="relative pl-6 border-l-2 border-slate-200 space-y-6">
                {companyActivities.map((act) => (
                  <div key={act.id} className="relative group">
                    <div className="absolute -left-[31px] top-0.5 w-4 h-4 rounded-full bg-white border-2 border-indigo-600 group-hover:scale-110 transition-transform" />
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-semibold">
                            {act.type}
                          </span>
                          <span>by {act.user}</span>
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {act.date} {act.time}
                        </span>
                      </div>
                      <p className="text-slate-700 text-xs leading-relaxed">{act.description}</p>
                      {act.outcome && (
                        <div className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-1 rounded inline-block">
                          Outcome: {act.outcome}
                        </div>
                      )}
                      {act.nextAction && (
                        <div className="text-[11px] text-slate-500 block">
                          Next Action: <strong className="text-slate-700">{act.nextAction}</strong>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* COMMENTS TAB */}
          {activeTab === "comments" && (
            <div className="space-y-4">
              {/* Add Comment Input */}
              <form
                onSubmit={handlePostComment}
                className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex gap-2"
              >
                <input
                  type="text"
                  required
                  placeholder="Leave an internal note for team members..."
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1"
                >
                  <Send className="w-3.5 h-3.5" /> Post
                </button>
              </form>

              {/* Threaded comments */}
              <div className="space-y-3">
                {companyComments.map((cm) => (
                  <div
                    key={cm.id}
                    className="p-4 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold">
                          {cm.userName.charAt(0)}
                        </div>
                        <span className="font-bold text-slate-800">{cm.userName}</span>
                      </div>
                      <span className="text-[10px] text-slate-400">{cm.timestamp}</span>
                    </div>

                    <p className="text-slate-700 text-xs pl-8">{cm.content}</p>

                    {/* Replies */}
                    {cm.replies && cm.replies.length > 0 && (
                      <div className="pl-8 space-y-2 pt-2 border-t border-slate-100">
                        {cm.replies.map((rep) => (
                          <div
                            key={rep.id}
                            className="bg-slate-50 p-2.5 rounded-lg text-xs border border-slate-200/60"
                          >
                            <div className="flex justify-between items-center text-[10px] text-slate-400 mb-1">
                              <span className="font-semibold text-slate-700">
                                {rep.userName}
                              </span>
                              <span>{rep.timestamp}</span>
                            </div>
                            <p className="text-slate-800">{rep.content}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Reply Input Trigger */}
                    <div className="pl-8 pt-1">
                      {replyingCommentId === cm.id ? (
                        <div className="flex gap-2 items-center">
                          <input
                            type="text"
                            placeholder="Write your reply..."
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            className="flex-1 px-2.5 py-1 border border-slate-300 rounded text-xs"
                          />
                          <button
                            onClick={() => handlePostReply(cm.id)}
                            className="px-2.5 py-1 bg-indigo-600 text-white rounded text-xs font-semibold"
                          >
                            Reply
                          </button>
                          <button
                            onClick={() => setReplyingCommentId(null)}
                            className="text-slate-400 text-xs hover:underline"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setReplyingCommentId(cm.id)}
                          className="text-xs text-indigo-600 font-semibold hover:underline flex items-center gap-1"
                        >
                          <CornerDownRight className="w-3 h-3" /> Reply
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI INTELLIGENCE & PITCH GENERATOR */}
          {activeTab === "profile" && (
            <div className="space-y-6">
              {/* Business Details */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <IdCard className="w-3.5 h-3.5 text-indigo-600" />
                  Business Details
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="flex items-center gap-2 text-slate-600">
                    <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{company.website || "No website on file"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{[company.city, company.country].filter(Boolean).join(", ") || "Location unknown"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{company.phone || "No phone on file"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{company.email || "No email on file"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <Briefcase className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{company.industry || "Industry not specified"}</span>
                  </div>
                  {company.sourceLeadId && (
                    <div className="flex items-center gap-2 text-slate-600">
                      <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>Auto-created from lead {company.sourceLeadId}</span>
                    </div>
                  )}
                </div>
                {company.notes && (
                  <div className="pt-2 border-t border-slate-100">
                    <div className="text-[11px] font-semibold text-slate-500 mb-1">Notes</div>
                    <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">{company.notes}</p>
                  </div>
                )}
              </div>

              {/* Leads */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                    <UserPlus className="w-3.5 h-3.5 text-indigo-600" />
                    Leads ({companyLeads.length})
                  </h4>
                  <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
                    <button
                      onClick={() => setLeadLinkMode("existing")}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                        leadLinkMode === "existing" ? "bg-white shadow-2xs text-slate-800" : "text-slate-500"
                      }`}
                    >
                      Link Existing
                    </button>
                    <button
                      onClick={() => setLeadLinkMode("new")}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                        leadLinkMode === "new" ? "bg-white shadow-2xs text-slate-800" : "text-slate-500"
                      }`}
                    >
                      New Lead
                    </button>
                  </div>
                </div>

                {leadLinkMode === "existing" ? (
                  <div className="flex gap-2 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                    <select
                      value={selectedLeadToLink}
                      onChange={(e) => setSelectedLeadToLink(e.target.value)}
                      className="flex-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                    >
                      <option value="">Select a lead to link to {company.name}...</option>
                      {linkableLeads.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name} — {l.company || "No company on file"}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleLinkExistingLead}
                      disabled={!selectedLeadToLink}
                      className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shrink-0"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      Link
                    </button>
                    {linkableLeads.length === 0 && (
                      <span className="sr-only">No other leads available to link.</span>
                    )}
                  </div>
                ) : (
                  <form
                    onSubmit={handleAddNewLead}
                    className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3.5 bg-slate-50 rounded-xl border border-slate-200"
                  >
                    <input
                      type="text"
                      required
                      placeholder="Lead name *"
                      value={newLeadName}
                      onChange={(e) => setNewLeadName(e.target.value)}
                      className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                    <input
                      type="text"
                      placeholder="Job title"
                      value={newLeadJobTitle}
                      onChange={(e) => setNewLeadJobTitle(e.target.value)}
                      className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                    <input
                      type="email"
                      placeholder="Email"
                      value={newLeadEmail}
                      onChange={(e) => setNewLeadEmail(e.target.value)}
                      className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                    <input
                      type="text"
                      placeholder="Phone"
                      value={newLeadPhone}
                      onChange={(e) => setNewLeadPhone(e.target.value)}
                      className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                    <input
                      type="text"
                      placeholder="Source (e.g. Referral, Website)"
                      value={newLeadSource}
                      onChange={(e) => setNewLeadSource(e.target.value)}
                      className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs sm:col-span-2"
                    />
                    <div className="sm:col-span-2 flex justify-end">
                      <button
                        type="submit"
                        disabled={!newLeadName.trim()}
                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Lead to {company.name}
                      </button>
                    </div>
                  </form>
                )}

                <div className="space-y-2">
                  {companyLeads.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-2">
                      No leads linked to this company yet.
                    </p>
                  )}
                  {companyLeads.map((l) => (
                    <div
                      key={l.id}
                      className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-3"
                    >
                      <div>
                        <div className="text-xs font-bold text-slate-800">{l.name}</div>
                        <div className="text-[11px] text-slate-500">
                          {l.jobTitle || "—"} {l.email && `· ${l.email}`}
                        </div>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0">
                        {l.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* AI Analysis */}
              <div className="p-5 bg-[#181b21] text-white rounded-2xl border border-[#2d323f] shadow-xl space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-bold text-sm text-teal-300">
                      <Sparkles className="w-4 h-4 text-teal-400" />
                      AI Business Analysis
                    </div>
                    <p className="text-xs text-slate-300 max-w-lg">
                      {company.aiAnalysis
                        ? `Last generated ${new Date(company.aiAnalysis.generatedAt).toLocaleString()}`
                        : "Runs automatically when this business is created from a lead."}
                    </p>
                  </div>
                  <button
                    onClick={handleRunProfileAnalysis}
                    disabled={isProfileAnalyzing}
                    className="px-4 py-2 bg-[#252a36] hover:bg-[#2f3544] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm border border-[#3d4455] transition-all shrink-0"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                    {isProfileAnalyzing ? "Analyzing..." : company.aiAnalysis ? "Regenerate" : "Run Analysis"}
                  </button>
                </div>

                {company.aiAnalysis && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-3 bg-[#121418] rounded-xl border border-[#2d323f]">
                        <div className="text-[11px] text-slate-400 font-semibold">Health Score</div>
                        <div className="text-2xl font-extrabold text-teal-300 font-mono mt-0.5">
                          {company.aiAnalysis.healthScore}
                          <span className="text-xs font-normal text-slate-500">/100</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{company.aiAnalysis.healthStatus}</div>
                      </div>
                      <div className="p-3 bg-[#121418] rounded-xl border border-[#2d323f]">
                        <div className="text-[11px] text-slate-400 font-semibold">Churn Risk</div>
                        <div
                          className={`text-lg font-bold mt-0.5 ${
                            company.aiAnalysis.churnRisk === "High" || company.aiAnalysis.churnRisk === "Critical"
                              ? "text-rose-400"
                              : company.aiAnalysis.churnRisk === "Medium"
                              ? "text-amber-400"
                              : "text-emerald-400"
                          }`}
                        >
                          {company.aiAnalysis.churnRisk}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">{company.aiAnalysis.churnReason}</p>
                      </div>
                    </div>

                    <p className="text-xs text-slate-200 leading-relaxed">{company.aiAnalysis.summary}</p>

                    {company.aiAnalysis.actionableRecommendations.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <span className="font-semibold text-slate-300 text-[11px] uppercase tracking-wide">
                          Recommended Actions
                        </span>
                        {company.aiAnalysis.actionableRecommendations.map((item, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-slate-300 text-xs">
                            <ArrowUpRight className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Call Log */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <PhoneCall className="w-3.5 h-3.5 text-indigo-600" />
                  Call Log ({(company.callLog || []).length})
                </h4>

                <form onSubmit={handleLogCall} className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">Contact</label>
                    <select
                      value={callContactId}
                      onChange={(e) => setCallContactId(e.target.value)}
                      className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                    >
                      <option value="">Unspecified</option>
                      {companyContacts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.firstName} {c.lastName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">Date</label>
                    <input
                      type="date"
                      value={callDate}
                      onChange={(e) => setCallDate(e.target.value)}
                      className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">Duration (min)</label>
                    <input
                      type="number"
                      min={0}
                      value={callDuration}
                      onChange={(e) => setCallDuration(Number(e.target.value) || 0)}
                      className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">Outcome</label>
                    <select
                      value={callOutcome}
                      onChange={(e) => setCallOutcome(e.target.value as CallLogEntry["outcome"])}
                      className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                    >
                      {CALL_OUTCOMES.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">Summary</label>
                    <textarea
                      value={callSummary}
                      onChange={(e) => setCallSummary(e.target.value)}
                      rows={2}
                      placeholder="What was discussed on the call..."
                      className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs resize-none"
                    />
                  </div>
                  <div className="sm:col-span-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={!callSummary.trim()}
                      className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Log Call
                    </button>
                  </div>
                </form>

                <div className="space-y-2">
                  {(company.callLog || []).length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-4">No calls logged yet.</p>
                  )}
                  {(company.callLog || []).map((entry) => (
                    <div key={entry.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-700">
                          <span>{new Date(entry.date).toLocaleDateString()}</span>
                          <span className="text-slate-300">•</span>
                          <span>{entry.durationMinutes} min</span>
                          <span className="text-slate-300">•</span>
                          <span
                            className={
                              entry.outcome === "Connected" || entry.outcome === "Closed"
                                ? "text-emerald-600"
                                : entry.outcome === "Not Interested"
                                ? "text-rose-600"
                                : "text-amber-600"
                            }
                          >
                            {entry.outcome}
                          </span>
                          {entry.contactName && (
                            <>
                              <span className="text-slate-300">•</span>
                              <span className="text-slate-500">{entry.contactName}</span>
                            </>
                          )}
                        </div>
                        <p className="text-xs text-slate-600">{entry.summary}</p>
                        <p className="text-[10px] text-slate-400">Logged by {entry.loggedBy}</p>
                      </div>
                      <button
                        onClick={() => deleteCallLogEntry(company.id, entry.id)}
                        className="text-slate-300 hover:text-rose-500 shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "ai" && (
            <div className="space-y-6">
              {/* Action Banner */}
              <div className="p-5 bg-[#181b21] text-white rounded-2xl flex items-center justify-between border border-[#2d323f] shadow-xl">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-bold text-sm text-teal-300">
                    <Sparkles className="w-4 h-4 text-teal-400 animate-pulse" />
                    AarPex AI Customer Intelligence
                  </div>
                  <p className="text-xs text-slate-300 max-w-lg">
                    Synthesize {company.name}&apos;s billing history, deals pipeline, and activity
                    timeline to uncover upsell angles and compute retention risk.
                  </p>
                </div>
                <button
                  onClick={handleRunAiAnalysis}
                  disabled={isAnalyzing}
                  className="px-4 py-2 bg-[#252a36] hover:bg-[#2f3544] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm border border-[#3d4455] transition-all"
                >
                  <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                  {isAnalyzing ? "Analyzing..." : "Run AI Health Scan"}
                </button>
              </div>

              {/* Analysis Results View */}
              {aiAnalysisResult && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                      <div className="text-xs text-slate-500 font-semibold">Account Health Score</div>
                      <div className="text-3xl font-extrabold text-indigo-600 font-mono mt-1">
                        {aiAnalysisResult.healthScore}
                        <span className="text-sm font-normal text-slate-400">/100</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Calculated from payment timeliness & pipeline velocity
                      </p>
                    </div>

                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                      <div className="text-xs text-slate-500 font-semibold">Churn Risk Level</div>
                      <div
                        className={`text-xl font-bold mt-1 ${
                          aiAnalysisResult.churnRisk === "High"
                            ? "text-rose-600"
                            : aiAnalysisResult.churnRisk === "Medium"
                            ? "text-amber-600"
                            : "text-emerald-600"
                        }`}
                      >
                        {aiAnalysisResult.churnRisk}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        {aiAnalysisResult.churnReason || "Stable relationship trajectory"}
                      </p>
                    </div>

                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                      <div className="text-xs text-slate-500 font-semibold">Projected LTV</div>
                      <div className="text-2xl font-bold text-slate-800 font-mono mt-1">
                        ${(company.customerValue * 1.5).toLocaleString()}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Expected 3-year expansion trajectory
                      </p>
                    </div>
                  </div>

                  {/* Summary & Recommendations */}
                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Strategic Analysis & Recommendations
                    </h4>
                    <p className="text-xs text-slate-700 leading-relaxed">
                      {aiAnalysisResult.summary}
                    </p>

                    {aiAnalysisResult.actionableRecommendations && (
                      <div className="space-y-1.5 pt-2">
                        <span className="font-semibold text-slate-800 text-xs">
                          Action Items for Account Executive:
                        </span>
                        {aiAnalysisResult.actionableRecommendations.map(
                          (item: string, idx: number) => (
                            <div
                              key={idx}
                              className="flex items-center gap-2 text-slate-600 text-xs"
                            >
                              <ArrowUpRight className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                              <span>{item}</span>
                            </div>
                          )
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Pitch Generator Section */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                      Personalized Sales Pitch Generator
                    </h4>
                    <p className="text-xs text-teal-400/80">
                      Create tailored outreach based on this customer&apos;s past deals and open needs
                    </p>
                  </div>
                  <button
                    onClick={handleGeneratePitch}
                    disabled={isGeneratingPitch}
                    className="px-3.5 py-1.5 bg-[#252a36] hover:bg-[#2f3544] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm border border-[#3d4455] transition-all"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                    {isGeneratingPitch ? "Drafting..." : "Generate Pitch"}
                  </button>
                </div>

                {generatedPitch && (
                  <div className="p-4 bg-[#181b21] border border-[#2d323f] rounded-xl space-y-2 animate-in fade-in duration-150">
                    <div className="flex justify-between items-center text-[11px] font-semibold text-teal-300">
                      <span>Tailored Pitch Draft</span>
                      <button
                        onClick={() => navigator.clipboard.writeText(generatedPitch)}
                        className="text-xs text-slate-400 hover:text-white"
                      >
                        Copy to Clipboard
                      </button>
                    </div>
                    <p className="text-xs text-slate-100 whitespace-pre-wrap leading-relaxed font-sans">
                      {generatedPitch}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
