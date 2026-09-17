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
  CheckSquare,
  Plus,
  Trash2,
} from "lucide-react";
import { InvoiceItem } from "../../types";

export const QuickCreateModal: React.FC = () => {
  const {
    isQuickCreateOpen,
    setQuickCreateOpen,
    quickCreateType,
    setQuickCreateType,
    companies,
    contacts,
    pipelines,
    invoices,
    currentUser,
    addLead,
    addDeal,
    addCompany,
    addContact,
    addInvoice,
    addPayment,
    addActivity,
    addTask,
  } = useCRM();

  // Lead State
  const [leadName, setLeadName] = useState("");
  const [leadCompany, setLeadCompany] = useState("");
  const [leadJobTitle, setLeadJobTitle] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadEstimatedValue, setLeadEstimatedValue] = useState(50000);
  const [leadSource, setLeadSource] = useState("Inbound Demo Request");
  const [leadPriority, setLeadPriority] = useState<"Low" | "Medium" | "High" | "Urgent">("High");
  const [leadRating, setLeadRating] = useState<"Hot" | "Warm" | "Cold">("Hot");
  const [leadNotes, setLeadNotes] = useState("");

  // Deal State
  const [dealName, setDealName] = useState("");
  const [dealCompanyId, setDealCompanyId] = useState(companies[0]?.id || "");
  const [dealValue, setDealValue] = useState(75000);
  const [dealPipelineId, setDealPipelineId] = useState(pipelines[0]?.id || "");
  const [dealStageId, setDealStageId] = useState(pipelines[0]?.stages[0]?.id || "");
  const [dealCloseDate, setDealCloseDate] = useState(
    new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0]
  );
  const [dealPriority, setDealPriority] = useState<"Low" | "Medium" | "High">("High");
  const [dealProductService, setDealProductService] = useState("Enterprise Cloud Platform");

  // Company State
  const [compName, setCompName] = useState("");
  const [compIndustry, setCompIndustry] = useState("Technology / SaaS");
  const [compWebsite, setCompWebsite] = useState("");
  const [compCity, setCompCity] = useState("San Francisco");
  const [compCountry, setCompCountry] = useState("United States");
  const [compPhone, setCompPhone] = useState("");
  const [compEmail, setCompEmail] = useState("");
  const [compStatus, setCompStatus] = useState<any>("Qualified Prospect");

  // Contact State
  const [cntFirstName, setCntFirstName] = useState("");
  const [cntLastName, setCntLastName] = useState("");
  const [cntCompanyId, setCntCompanyId] = useState(companies[0]?.id || "");
  const [cntPosition, setCntPosition] = useState("Director of Technology");
  const [cntEmail, setCntEmail] = useState("");
  const [cntPhone, setCntPhone] = useState("");

  // Invoice State
  const [invCompanyId, setInvCompanyId] = useState(companies[0]?.id || "");
  const [invDueDate, setInvDueDate] = useState(
    new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0]
  );
  const [invItems, setInvItems] = useState<Omit<InvoiceItem, "id" | "total">[]>([
    {
      description: "Enterprise Subscription - Annual",
      quantity: 1,
      unitPrice: 24000,
      taxPercent: 0,
      discountPercent: 0,
    },
  ]);

  // Payment State
  const [payCompanyId, setPayCompanyId] = useState(companies[0]?.id || "");
  const [payInvoiceId, setPayInvoiceId] = useState(
    invoices.find((i) => i.companyId === (companies[0]?.id || ""))?.id || invoices[0]?.id || ""
  );
  const [payAmount, setPayAmount] = useState(10000);
  const [payMethod, setPayMethod] = useState<any>("Bank Transfer");
  const [payReference, setPayReference] = useState("WIRE-TX-9981");

  // Activity State
  const [actType, setActType] = useState<any>("Call");
  const [actCompanyId, setActCompanyId] = useState(companies[0]?.id || "");
  const [actDescription, setActDescription] = useState("");
  const [actOutcome, setActOutcome] = useState("Connected and discussed requirements");
  const [actNextAction, setActNextAction] = useState("Follow up next Tuesday with proposal");

  // Task State
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueDate, setTaskDueDate] = useState(
    new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0]
  );
  const [taskPriority, setTaskPriority] = useState<any>("High");
  const [taskCompanyId, setTaskCompanyId] = useState(companies[0]?.id || "");
  const [taskDescription, setTaskDescription] = useState("");

  if (!isQuickCreateOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (quickCreateType === "lead") {
      if (!leadName || !leadCompany) return;
      // Lead has no standalone "rating" field — the Hot/Warm/Cold choice
      // here maps to the real leadScore field it does have (see
      // getLeadRating in LeadsView, which derives the badge back from it).
      const leadScoreByRating: Record<"Hot" | "Warm" | "Cold", number> = {
        Hot: 85,
        Warm: 60,
        Cold: 30,
      };
      addLead({
        name: leadName,
        company: leadCompany,
        jobTitle: leadJobTitle,
        email: leadEmail,
        phone: leadPhone,
        industry: "Technology / SaaS",
        country: "United States",
        city: "",
        estimatedValue: Number(leadEstimatedValue) || 0,
        source: leadSource,
        priority: leadPriority,
        leadScore: leadScoreByRating[leadRating],
        status: "New",
        salesperson: currentUser.name,
        notes: leadNotes,
        tags: [],
        lastContact: new Date().toISOString().split("T")[0],
        expectedCloseDate: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
        nextFollowUp: new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0],
      });
    } else if (quickCreateType === "deal") {
      if (!dealName || !dealCompanyId) return;
      const targetPipeline = pipelines.find((p) => p.id === dealPipelineId) || pipelines[0];
      const targetStage = targetPipeline.stages.find((s) => s.id === dealStageId) || targetPipeline.stages[0];
      addDeal({
        name: dealName,
        companyId: dealCompanyId,
        salesperson: currentUser.name,
        pipelineId: targetPipeline.id,
        stageId: targetStage.id,
        dealValue: Number(dealValue) || 0,
        currency: "USD",
        probability: targetStage.probability,
        expectedCloseDate: dealCloseDate,
        productService: dealProductService,
        priority: dealPriority,
        status: "Open",
        source: "Direct Sales",
        notes: "",
        lastActivity: new Date().toISOString().split("T")[0],
        nextActivity: "Follow up",
      });
    } else if (quickCreateType === "company") {
      if (!compName) return;
      addCompany({
        name: compName,
        industry: compIndustry,
        website: compWebsite,
        city: compCity,
        country: compCountry,
        phone: compPhone,
        email: compEmail,
        salesperson: currentUser.name,
        status: compStatus,
        customerValue: 0,
        address: "",
        notes: "",
        tags: [],
      });
    } else if (quickCreateType === "contact") {
      if (!cntFirstName || !cntLastName) return;
      addContact({
        firstName: cntFirstName,
        lastName: cntLastName,
        companyId: cntCompanyId,
        position: cntPosition,
        email: cntEmail,
        phone: cntPhone,
        salesperson: currentUser.name,
        status: "Active",
        leadSource: "Direct Contact",
        notes: "",
        country: "United States",
        city: "",
        tags: [],
      });
    } else if (quickCreateType === "invoice") {
      if (!invCompanyId || invItems.length === 0) return;
      addInvoice({
        invoiceNumber: `INV-${Date.now().toString(36).toUpperCase()}`,
        companyId: invCompanyId,
        issueDate: new Date().toISOString().split("T")[0],
        dueDate: invDueDate,
        currency: "USD",
        items: invItems as any,
        notes: "Payment due within 30 days of invoice date.",
      });
    } else if (quickCreateType === "payment") {
      if (!payCompanyId || !payInvoiceId) return;
      addPayment({
        paymentNumber: `PAY-${Date.now().toString(36).toUpperCase()}`,
        companyId: payCompanyId,
        invoiceId: payInvoiceId,
        date: new Date().toISOString().split("T")[0],
        amount: Number(payAmount) || 0,
        currency: "USD",
        paymentMethod: payMethod,
        reference: payReference,
        notes: "",
        recordedBy: currentUser.name,
      });
    } else if (quickCreateType === "activity") {
      if (!actCompanyId || !actDescription) return;
      addActivity({
        type: actType,
        companyId: actCompanyId,
        date: new Date().toISOString().split("T")[0],
        time: "14:00",
        user: currentUser.name,
        description: actDescription,
        outcome: actOutcome,
        nextAction: actNextAction,
      });
    } else if (quickCreateType === "task") {
      if (!taskTitle) return;
      addTask({
        title: taskTitle,
        companyId: taskCompanyId,
        dueDate: taskDueDate,
        priority: taskPriority,
        status: "To Do",
        assignedUser: currentUser.name,
        notes: taskDescription,
      });
    }

    setQuickCreateOpen(false);
  };

  const tabs: Array<{ id: typeof quickCreateType; label: string; icon: React.ElementType }> = [
    { id: "lead", label: "Lead", icon: Users },
    { id: "deal", label: "Deal", icon: Briefcase },
    { id: "company", label: "Company", icon: Building2 },
    { id: "contact", label: "Contact", icon: Users },
    { id: "invoice", label: "Invoice", icon: Receipt },
    { id: "payment", label: "Payment", icon: CreditCard },
    { id: "activity", label: "Activity", icon: CalendarCheck },
    { id: "task", label: "Task", icon: CheckSquare },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#181b21] rounded-2xl shadow-2xl border border-[#2d323f] w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-slate-100">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#2d323f] flex items-center justify-between bg-[#121418]">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              Create New Record
              <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded bg-[#252a36] text-teal-300 border border-[#3d4455]">
                {quickCreateType}
              </span>
            </h2>
            <p className="text-xs text-teal-400/80">
              Add new entries with instant CRM relationship mapping
            </p>
          </div>
          <button
            onClick={() => setQuickCreateOpen(false)}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#252a36] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-[#2d323f] bg-[#121418] px-6 overflow-x-auto custom-scrollbar">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isSelected = quickCreateType === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setQuickCreateType(tab.id)}
                className={`flex items-center gap-1.5 py-2.5 px-3 text-xs font-semibold border-b-2 whitespace-nowrap transition-all ${
                  isSelected
                    ? "border-teal-400 text-teal-300 bg-[#181b21]"
                    : "border-transparent text-slate-400 hover:text-white hover:bg-[#252a36]"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isSelected ? "text-teal-400" : "text-slate-500"}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
          {/* LEAD FORM */}
          {quickCreateType === "lead" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={leadName}
                    onChange={(e) => setLeadName(e.target.value)}
                    placeholder="e.g. Jordan Hayes"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Company *</label>
                  <input
                    type="text"
                    required
                    value={leadCompany}
                    onChange={(e) => setLeadCompany(e.target.value)}
                    placeholder="e.g. Acme Corp"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Job Title</label>
                  <input
                    type="text"
                    value={leadJobTitle}
                    onChange={(e) => setLeadJobTitle(e.target.value)}
                    placeholder="VP Operations"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Estimated Value ($)</label>
                  <input
                    type="number"
                    value={leadEstimatedValue}
                    onChange={(e) => setLeadEstimatedValue(Number(e.target.value))}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={leadEmail}
                    onChange={(e) => setLeadEmail(e.target.value)}
                    placeholder="lead@company.com"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Phone</label>
                  <input
                    type="text"
                    value={leadPhone}
                    onChange={(e) => setLeadPhone(e.target.value)}
                    placeholder="+1 555 0192"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Lead Source</label>
                  <select
                    value={leadSource}
                    onChange={(e) => setLeadSource(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
                  >
                    <option>Inbound Demo Request</option>
                    <option>Website Form</option>
                    <option>Referral</option>
                    <option>LinkedIn Outreach</option>
                    <option>Event / Conference</option>
                    <option>Cold Email</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Priority</label>
                  <select
                    value={leadPriority}
                    onChange={(e) => setLeadPriority(e.target.value as any)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
                  >
                    <option>Low</option>
                    <option>Medium</option>
                    <option>High</option>
                    <option>Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Temperature</label>
                  <select
                    value={leadRating}
                    onChange={(e) => setLeadRating(e.target.value as any)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
                  >
                    <option>Hot</option>
                    <option>Warm</option>
                    <option>Cold</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Notes / Qualification</label>
                <textarea
                  rows={2}
                  value={leadNotes}
                  onChange={(e) => setLeadNotes(e.target.value)}
                  placeholder="Key pain points, current software stack, timeline..."
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                />
              </div>
            </>
          )}

          {/* DEAL FORM */}
          {quickCreateType === "deal" && (
            <>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Deal Title *</label>
                <input
                  type="text"
                  required
                  value={dealName}
                  onChange={(e) => setDealName(e.target.value)}
                  placeholder="e.g. Enterprise License Expansion - 500 Seats"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Company *</label>
                  <select
                    value={dealCompanyId}
                    onChange={(e) => setDealCompanyId(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
                  >
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Deal Value ($ USD) *</label>
                  <input
                    type="number"
                    required
                    value={dealValue}
                    onChange={(e) => setDealValue(Number(e.target.value))}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Pipeline</label>
                  <select
                    value={dealPipelineId}
                    onChange={(e) => {
                      setDealPipelineId(e.target.value);
                      const pipe = pipelines.find((p) => p.id === e.target.value);
                      if (pipe?.stages[0]) setDealStageId(pipe.stages[0].id);
                    }}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
                  >
                    {pipelines.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Stage</label>
                  <select
                    value={dealStageId}
                    onChange={(e) => setDealStageId(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
                  >
                    {(
                      pipelines.find((p) => p.id === dealPipelineId)?.stages || []
                    ).map((stg) => (
                      <option key={stg.id} value={stg.id}>
                        {stg.name} ({stg.probability}%)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Expected Close Date</label>
                  <input
                    type="date"
                    value={dealCloseDate}
                    onChange={(e) => setDealCloseDate(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Priority</label>
                  <select
                    value={dealPriority}
                    onChange={(e) => setDealPriority(e.target.value as any)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
                  >
                    <option>High</option>
                    <option>Medium</option>
                    <option>Low</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {/* COMPANY FORM */}
          {quickCreateType === "company" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Company Name *</label>
                  <input
                    type="text"
                    required
                    value={compName}
                    onChange={(e) => setCompName(e.target.value)}
                    placeholder="e.g. Helix Robotics Inc"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Industry</label>
                  <input
                    type="text"
                    value={compIndustry}
                    onChange={(e) => setCompIndustry(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">City</label>
                  <input
                    type="text"
                    value={compCity}
                    onChange={(e) => setCompCity(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Country</label>
                  <input
                    type="text"
                    value={compCountry}
                    onChange={(e) => setCompCountry(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Lifecycle Status</label>
                  <select
                    value={compStatus}
                    onChange={(e) => setCompStatus(e.target.value as any)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
                  >
                    <option>Qualified Prospect</option>
                    <option>Active Customer</option>
                    <option>Prospect</option>
                    <option>At Risk</option>
                    <option>Former Customer</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Website</label>
                  <input
                    type="text"
                    value={compWebsite}
                    onChange={(e) => setCompWebsite(e.target.value)}
                    placeholder="https://company.com"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={compEmail}
                    onChange={(e) => setCompEmail(e.target.value)}
                    placeholder="contact@company.com"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            </>
          )}

          {/* CONTACT FORM */}
          {quickCreateType === "contact" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">First Name *</label>
                  <input
                    type="text"
                    required
                    value={cntFirstName}
                    onChange={(e) => setCntFirstName(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Last Name *</label>
                  <input
                    type="text"
                    required
                    value={cntLastName}
                    onChange={(e) => setCntLastName(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Company *</label>
                  <select
                    value={cntCompanyId}
                    onChange={(e) => setCntCompanyId(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
                  >
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Job Title</label>
                  <input
                    type="text"
                    value={cntPosition}
                    onChange={(e) => setCntPosition(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={cntEmail}
                    onChange={(e) => setCntEmail(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Phone</label>
                  <input
                    type="text"
                    value={cntPhone}
                    onChange={(e) => setCntPhone(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            </>
          )}

          {/* INVOICE FORM */}
          {quickCreateType === "invoice" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Company *</label>
                  <select
                    value={invCompanyId}
                    onChange={(e) => setInvCompanyId(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
                  >
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Payment Due Date</label>
                  <input
                    type="date"
                    value={invDueDate}
                    onChange={(e) => setInvDueDate(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">Line Items</span>
                  <button
                    type="button"
                    onClick={() =>
                      setInvItems([
                        ...invItems,
                        {
                          description: "Consulting / Professional Services",
                          quantity: 1,
                          unitPrice: 5000,
                          discountPercent: 0,
                          taxPercent: 0,
                        },
                      ])
                    }
                    className="text-indigo-600 font-semibold text-xs flex items-center gap-1 hover:underline"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Item
                  </button>
                </div>

                {invItems.map((itm, idx) => (
                  <div key={idx} className="flex gap-2 items-center bg-slate-50 p-2 rounded-lg border border-slate-200">
                    <input
                      type="text"
                      placeholder="Item description"
                      value={itm.description}
                      onChange={(e) => {
                        const next = [...invItems];
                        next[idx].description = e.target.value;
                        setInvItems(next);
                      }}
                      className="flex-1 px-2 py-1 border border-slate-300 rounded bg-white"
                    />
                    <input
                      type="number"
                      placeholder="Qty"
                      value={itm.quantity}
                      onChange={(e) => {
                        const next = [...invItems];
                        next[idx].quantity = Number(e.target.value);
                        setInvItems(next);
                      }}
                      className="w-16 px-2 py-1 border border-slate-300 rounded bg-white"
                    />
                    <input
                      type="number"
                      placeholder="Price"
                      value={itm.unitPrice}
                      onChange={(e) => {
                        const next = [...invItems];
                        next[idx].unitPrice = Number(e.target.value);
                        setInvItems(next);
                      }}
                      className="w-24 px-2 py-1 border border-slate-300 rounded bg-white"
                    />
                    <div className="text-right font-mono font-bold w-20 text-slate-800">
                      ${(itm.quantity * itm.unitPrice).toLocaleString()}
                    </div>
                    {invItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setInvItems(invItems.filter((_, i) => i !== idx))}
                        className="text-rose-500 hover:text-rose-700 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* PAYMENT FORM */}
          {quickCreateType === "payment" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Company *</label>
                  <select
                    value={payCompanyId}
                    onChange={(e) => {
                      setPayCompanyId(e.target.value);
                      const matchingInv = invoices.find((i) => i.companyId === e.target.value);
                      if (matchingInv) {
                        setPayInvoiceId(matchingInv.id);
                        setPayAmount(matchingInv.remainingBalance || matchingInv.total);
                      }
                    }}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
                  >
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Target Invoice *</label>
                  <select
                    value={payInvoiceId}
                    onChange={(e) => {
                      setPayInvoiceId(e.target.value);
                      const inv = invoices.find((i) => i.id === e.target.value);
                      if (inv) setPayAmount(inv.remainingBalance || inv.total);
                    }}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
                  >
                    {invoices
                      .filter((i) => !payCompanyId || i.companyId === payCompanyId)
                      .map((inv) => (
                        <option key={inv.id} value={inv.id}>
                          {inv.invoiceNumber} - Bal: ${inv.remainingBalance.toLocaleString()} ({inv.status})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Amount ($ USD) *</label>
                  <input
                    type="number"
                    required
                    value={payAmount}
                    onChange={(e) => setPayAmount(Number(e.target.value))}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Payment Method</label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value as any)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
                  >
                    <option>Bank Transfer</option>
                    <option>Wire</option>
                    <option>Credit Card</option>
                    <option>Stripe</option>
                    <option>Check</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Reference Code</label>
                  <input
                    type="text"
                    value={payReference}
                    onChange={(e) => setPayReference(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            </>
          )}

          {/* ACTIVITY FORM */}
          {quickCreateType === "activity" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Activity Type</label>
                  <select
                    value={actType}
                    onChange={(e) => setActType(e.target.value as any)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
                  >
                    <option>Call</option>
                    <option>Meeting</option>
                    <option>Email</option>
                    <option>Proposal</option>
                    <option>Note</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Company *</label>
                  <select
                    value={actCompanyId}
                    onChange={(e) => setActCompanyId(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
                  >
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Summary / Log Notes *</label>
                <textarea
                  required
                  rows={2}
                  value={actDescription}
                  onChange={(e) => setActDescription(e.target.value)}
                  placeholder="Key discussion points, objections, or contract terms discussed..."
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Outcome</label>
                  <input
                    type="text"
                    value={actOutcome}
                    onChange={(e) => setActOutcome(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Next Action Required</label>
                  <input
                    type="text"
                    value={actNextAction}
                    onChange={(e) => setActNextAction(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            </>
          )}

          {/* TASK FORM */}
          {quickCreateType === "task" && (
            <>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Task Title *</label>
                <input
                  type="text"
                  required
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="e.g. Prepare security audit compliance answers"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Related Company</label>
                  <select
                    value={taskCompanyId}
                    onChange={(e) => setTaskCompanyId(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
                  >
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={taskDueDate}
                    onChange={(e) => setTaskDueDate(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Priority</label>
                  <select
                    value={taskPriority}
                    onChange={(e) => setTaskPriority(e.target.value as any)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
                  >
                    <option>High</option>
                    <option>Medium</option>
                    <option>Low</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Description / Notes</label>
                <textarea
                  rows={2}
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  placeholder="Details for completion..."
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                />
              </div>
            </>
          )}

          {/* Modal Footer */}
          <div className="pt-4 border-t border-[#2d323f] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setQuickCreateOpen(false)}
              className="px-4 py-2 border border-[#2d323f] text-slate-300 hover:text-white hover:bg-[#252a36] rounded-lg text-xs font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#252a36] hover:bg-[#2f3544] text-white rounded-lg text-xs font-bold shadow-sm border border-[#3d4455] transition-all"
            >
              Create Record
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
