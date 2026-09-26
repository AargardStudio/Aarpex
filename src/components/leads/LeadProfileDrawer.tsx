import React, { useState } from "react";
import { useCRM } from "../../context/CRMContext";
import {
  X,
  Building2,
  Mail,
  Phone,
  MessageSquare,
  MapPin,
  CalendarCheck,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Instagram,
  Facebook,
  Linkedin,
  Twitter,
  Globe2,
  ArrowRight,
  Flame,
  BookMarked,
  StickyNote,
  Wand2,
  RefreshCw,
  Plus,
  Percent,
} from "lucide-react";
import { apiFetch } from "../../lib/apiClient";

interface AnalysisResult {
  qualificationScore: number;
  temperature: "Hot" | "Warm" | "Cold";
  buyerIntentSignals: string[];
  riskFactors: string[];
  bestOutreachChannel: string;
  bestOutreachTiming: string;
  recommendedNextAction: string;
  recommendedFollowUpDate: string;
  suggestedOpeningLine: string;
  summary: string;
}

const temperatureStyles: Record<string, string> = {
  Hot: "bg-rose-50 text-rose-700 border-rose-300",
  Warm: "bg-amber-50 text-amber-700 border-amber-300",
  Cold: "bg-slate-100 text-slate-600 border-slate-300",
};

const socialIconFor = (platform: string): { Icon: typeof Instagram; className: string } => {
  const p = platform.toLowerCase();
  if (p.includes("instagram")) return { Icon: Instagram, className: "text-pink-600" };
  if (p.includes("facebook")) return { Icon: Facebook, className: "text-blue-600" };
  if (p.includes("linkedin")) return { Icon: Linkedin, className: "text-sky-700" };
  if (p.includes("twitter") || p === "x" || p.includes("x /")) return { Icon: Twitter, className: "text-slate-800" };
  return { Icon: Globe2, className: "text-slate-500" };
};

const getLeadRating = (leadScore: number): "Hot" | "Warm" | "Cold" => {
  if (leadScore >= 75) return "Hot";
  if (leadScore >= 45) return "Warm";
  return "Cold";
};

export const LeadProfileDrawer: React.FC = () => {
  const {
    selectedLeadId,
    setSelectedLeadId,
    leads,
    activities,
    addActivity,
    currentUser,
    activeTenant,
    openEmailComposer,
    openWhatsAppComposer,
    setConvertingLeadId,
    updateLead,
    knowledgeBase,
    addKnowledgeBaseEntry,
    updateKnowledgeBaseEntry,
    deleteKnowledgeBaseEntry,
    getPlaybookForIndustry,
    products,
    addAgentAction,
  } = useCRM();

  const [activeTab, setActiveTab] = useState<"overview" | "timeline" | "ai" | "knowledge">("overview");
  const [timelineChannelFilter, setTimelineChannelFilter] = useState<"all" | "Email" | "WhatsApp">("all");
  const [newActivityType, setNewActivityType] = useState<any>("Call");
  const [newActivityDesc, setNewActivityDesc] = useState("");
  const [newActivityOutcome, setNewActivityOutcome] = useState("");
  const [newActivityNext, setNewActivityNext] = useState("");

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState(false);

  const [manualNote, setManualNote] = useState("");
  const [isRefreshingSummary, setIsRefreshingSummary] = useState(false);
  const [isGeneratingEmail, setIsGeneratingEmail] = useState(false);
  const [emailGenError, setEmailGenError] = useState(false);
  const [isProposingOffer, setIsProposingOffer] = useState(false);
  const [offerQueued, setOfferQueued] = useState(false);

  if (!selectedLeadId) return null;
  const lead = leads.find((l) => l.id === selectedLeadId);
  if (!lead) return null;

  // Filtered by the real leadId relationship, not a fuzzy name-in-description
  // match -- fixes the fragile matching the old standalone AI modal used.
  const leadActivities = activities
    .filter((a) => a.leadId === lead.id)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const latestNextAction = leadActivities.find((a) => a.nextAction)?.nextAction || lead.nextFollowUp;
  const rating = getLeadRating(lead.leadScore);
  const playbook = getPlaybookForIndustry(lead.industry);
  const candidateProduct =
    products.find(
      (p) => p.status === "Active" && (p.targetCriteria.industries.length === 0 || p.targetCriteria.industries.includes(lead.industry))
    ) || products.find((p) => p.status === "Active") || null;

  // This lead's individual knowledge base -- both manually-added notes and
  // the AI-Generated auto-extracted summary (tagged so it can be found and
  // refreshed in place rather than piling up duplicates).
  const linkedKnowledge = knowledgeBase.filter((k) => (k.linkedLeadIds || []).includes(lead.id));
  const aiSummaryEntry = linkedKnowledge.find((k) => k.tags.includes("AI-Generated"));
  const manualKnowledge = linkedKnowledge.filter((k) => !k.tags.includes("AI-Generated"));

  const handleClose = () => setSelectedLeadId(null);

  const handleLogActivity = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newActivityDesc) return;
    addActivity({
      type: newActivityType,
      leadId: lead.id,
      date: new Date().toISOString().split("T")[0],
      time: "12:00",
      user: currentUser.name,
      description: newActivityDesc,
      outcome: newActivityOutcome || "Completed",
      nextAction: newActivityNext || "Follow up as planned",
    });
    if (newActivityNext) {
      updateLead(lead.id, { nextFollowUp: newActivityNext, lastContact: new Date().toISOString().split("T")[0] });
    }
    setNewActivityDesc("");
    setNewActivityOutcome("");
    setNewActivityNext("");
  };

  const handleRunAnalysis = async () => {
    setIsAnalyzing(true);
    setAnalysisError(false);
    try {
      const res = await apiFetch("/api/ai/lead-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead, activities: leadActivities, playbook }),
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error(err);
      setAnalysisError(true);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApplyScore = () => {
    if (!result) return;
    updateLead(lead.id, {
      leadScore: result.qualificationScore,
      priority: result.temperature === "Hot" ? "Urgent" : result.temperature === "Warm" ? "Medium" : "Low",
      nextFollowUp: result.recommendedFollowUpDate,
    });
  };

  const handleConvert = () => {
    setConvertingLeadId(lead.id);
    handleClose();
  };

  // Auto-extracted knowledge: summarizes the lead's own fields + activity
  // history via AI and stores it as a single AI-Generated KB entry, updated
  // in place on refresh rather than creating duplicates each time.
  const handleRefreshKnowledgeSummary = async () => {
    setIsRefreshingSummary(true);
    try {
      const res = await apiFetch("/api/ai/lead-knowledge-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: lead.name,
          company: lead.company,
          jobTitle: lead.jobTitle,
          industry: lead.industry,
          notes: lead.notes,
          tags: lead.tags,
          activities: leadActivities,
        }),
      });
      const data = await res.json();
      if (aiSummaryEntry) {
        updateKnowledgeBaseEntry(aiSummaryEntry.id, { content: data.summary });
      } else {
        addKnowledgeBaseEntry({
          category: "company",
          title: `${lead.name} — AI Summary`,
          content: data.summary,
          tags: ["AI-Generated"],
          linkedLeadIds: [lead.id],
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsRefreshingSummary(false);
    }
  };

  const handleAddManualNote = () => {
    if (!manualNote.trim()) return;
    addKnowledgeBaseEntry({
      category: "company",
      title: `Note on ${lead.name}`,
      content: manualNote.trim(),
      tags: [],
      linkedLeadIds: [lead.id],
    });
    setManualNote("");
  };

  // Single-recipient personalized email -- distinct from bulk Email
  // Marketing campaigns. Draws on this lead's individual knowledge base
  // (manual + AI-extracted), its matching Industry Playbook, and recent
  // activity, then prefills the result into the shared compose modal for
  // the rep to review before sending.
  const handleGeneratePersonalizedEmail = async () => {
    setIsGeneratingEmail(true);
    setEmailGenError(false);
    try {
      const res = await apiFetch("/api/ai/personalized-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientName: lead.name,
          recipientCompany: lead.company,
          recipientJobTitle: lead.jobTitle,
          recipientIndustry: lead.industry,
          knowledgeEntries: linkedKnowledge.map((k) => k.content),
          activities: leadActivities,
          playbook,
          senderName: currentUser?.name,
          senderCompany: activeTenant?.companyName || activeTenant?.name,
        }),
      });
      const data = await res.json();
      openEmailComposer({ to: lead.email, subject: data.subject, body: data.body, leadId: lead.id });
    } catch (err) {
      console.error(err);
      setEmailGenError(true);
    } finally {
      setIsGeneratingEmail(false);
    }
  };

  // Proposes a negotiation offer, capped by the industry playbook's
  // maxDiscountPercent -- this never sends anything itself, it only queues
  // a draft into Agent Approvals for review.
  const handleProposeOffer = async () => {
    if (!playbook || !candidateProduct) return;
    setIsProposingOffer(true);
    setOfferQueued(false);
    try {
      const res = await apiFetch("/api/ai/negotiation-offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientName: lead.name,
          recipientCompany: lead.company,
          recipientJobTitle: lead.jobTitle,
          recipientIndustry: lead.industry,
          productName: candidateProduct.name,
          productPrice: candidateProduct.price,
          productPricingModel: candidateProduct.pricingModel,
          currency: candidateProduct.currency,
          maxDiscountPercent: playbook.maxDiscountPercent,
          negotiationGuidance: playbook.negotiationGuidance,
          knowledgeEntries: linkedKnowledge.map((k) => k.content),
          activities: leadActivities,
          senderName: currentUser?.name,
          senderCompany: activeTenant?.companyName || activeTenant?.name,
        }),
      });
      const data = await res.json();
      addAgentAction({
        industry: lead.industry,
        actionType: "negotiation_offer",
        leadId: lead.id,
        recipientName: lead.name,
        recipientEmail: lead.email,
        subject: data.subject,
        body: data.body,
        reasoning: `Manually proposed by ${currentUser?.name || "you"}.`,
        proposedDiscountPercent: data.proposedDiscountPercent,
        productId: candidateProduct.id,
        triggerSource: "manual",
      });
      setOfferQueued(true);
    } catch (err) {
      console.error(err);
    } finally {
      setIsProposingOffer(false);
    }
  };

  const ratingBadge =
    rating === "Hot"
      ? "bg-rose-100 text-rose-800 border-rose-200"
      : rating === "Warm"
      ? "bg-amber-100 text-amber-800 border-amber-200"
      : "bg-slate-100 text-slate-700 border-slate-200";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-2xs animate-in fade-in duration-150">
      <div className="w-full max-w-3xl bg-white h-full shadow-2xl flex flex-col border-l border-slate-200 overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 bg-slate-50/70">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-600 text-white flex items-center justify-center font-bold text-xl shadow-md">
                {lead.name.charAt(0)}
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">{lead.name}</h2>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border flex items-center gap-1 ${ratingBadge}`}>
                    {rating === "Hot" && <Flame className="w-2.5 h-2.5 fill-rose-600" />}
                    {rating}
                  </span>
                  <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                    {lead.status}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 mt-2">
                  <span>{lead.jobTitle || "No title on file"}</span>
                  <span className="flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" />
                    {lead.company || "No company on file"}
                  </span>
                  {lead.socialLinks && lead.socialLinks.length > 0 && (
                    <span className="flex items-center gap-1.5">
                      {lead.socialLinks.map((link) => {
                        const { Icon, className } = socialIconFor(link.platform);
                        return (
                          <a key={link.id} href={link.url} target="_blank" rel="noreferrer" title={`${link.platform}: ${link.url}`} className={`${className} hover:opacity-70 transition-opacity`}>
                            <Icon className="w-3.5 h-3.5" />
                          </a>
                        );
                      })}
                    </span>
                  )}
                  <span className="text-slate-400">
                    Rep: <strong>{lead.salesperson}</strong>
                  </span>
                  <span className="font-mono font-bold text-slate-700">${(lead.estimatedValue || 0).toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Acquisition action buttons -- Email + WhatsApp only, no SMS */}
            <div className="flex items-center gap-1.5">
              {lead.email && (
                <button
                  type="button"
                  onClick={() => openEmailComposer({ to: lead.email, leadId: lead.id })}
                  className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 text-xs font-semibold shadow-sm transition-colors"
                  title={`Email ${lead.email}`}
                >
                  <Mail className="w-4 h-4" />
                  <span>Email</span>
                </button>
              )}
              {(lead.whatsapp || lead.phone) && (
                <button
                  type="button"
                  onClick={() => openWhatsAppComposer({ to: lead.whatsapp || lead.phone, leadId: lead.id })}
                  className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 text-xs font-semibold shadow-sm transition-colors"
                  title="Send WhatsApp Message"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>WhatsApp</span>
                </button>
              )}
              {lead.status !== "Converted" && (
                <button
                  type="button"
                  onClick={handleConvert}
                  className="px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white flex items-center gap-1.5 text-xs font-semibold shadow-sm transition-colors"
                  title="Convert to Company & Deal"
                >
                  <span>Convert</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 transition-colors ml-2">
              <X className="w-5 h-5" />
            </button>
          </div>

          {latestNextAction && (
            <div className="mt-4 p-2.5 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-800 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>
                <strong>Planned next:</strong> {latestNextAction}
              </span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-6 bg-white overflow-x-auto">
          {[
            { id: "overview", label: "Overview", icon: Building2 },
            { id: "timeline", label: `Activity (${leadActivities.length})`, icon: CalendarCheck },
            { id: "ai", label: "AI Analysis", icon: Sparkles, badge: "AI" },
            { id: "knowledge", label: `Knowledge (${linkedKnowledge.length})`, icon: BookMarked },
          ].map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 py-3 px-3.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
                  isSelected ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-400 hover:text-slate-700"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isSelected ? "text-indigo-600" : "text-slate-400"}`} />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className="text-[9px] font-bold px-1.5 py-0.2 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-full">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 text-xs text-slate-700 bg-slate-50/40 custom-scrollbar">
          {activeTab === "overview" && (
            <div className="space-y-5">
              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Lead Details</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Email</span>
                    <span className="font-medium text-slate-800">{lead.email || "—"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Phone</span>
                    <span className="font-medium text-slate-800">{lead.phone || "—"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Website</span>
                    <span className="font-medium text-slate-800">{lead.website || "—"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Industry</span>
                    <span className="font-medium text-slate-800">{lead.industry || "—"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Source</span>
                    <span className="font-medium text-slate-800">{lead.source || "—"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Location</span>
                    <span className="font-medium text-slate-800">{[lead.city, lead.country].filter(Boolean).join(", ") || "—"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Lead Score</span>
                    <span className="font-medium text-slate-800 font-mono">{lead.leadScore}/100</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Priority</span>
                    <span className="font-medium text-slate-800">{lead.priority}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Expected Close</span>
                    <span className="font-medium text-slate-800">{lead.expectedCloseDate || "—"}</span>
                  </div>
                </div>

                {lead.tags && lead.tags.length > 0 && (
                  <div className="pt-2">
                    <span className="text-slate-400 block text-[11px] mb-1.5">Tags</span>
                    <div className="flex flex-wrap gap-1.5">
                      {lead.tags.map((tag) => (
                        <span key={tag} className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-600 rounded-md text-[11px]">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {lead.notes && (
                  <div className="pt-2 border-t border-slate-100">
                    <div className="text-[11px] font-semibold text-slate-500 mb-1">Notes</div>
                    <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">{lead.notes}</p>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Recent Activity</h3>
                  <button onClick={() => setActiveTab("timeline")} className="text-[11px] text-indigo-600 font-semibold hover:underline">
                    View full log →
                  </button>
                </div>
                {leadActivities.slice(0, 3).map((act) => (
                  <div key={act.id} className="p-2.5 bg-slate-50/70 border border-slate-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700">{act.type}</span>
                      <span className="text-[10px] text-slate-400">{act.date}</span>
                    </div>
                    <p className="text-slate-600 mt-0.5">{act.description}</p>
                  </div>
                ))}
                {leadActivities.length === 0 && <div className="text-center text-slate-400 py-4">No activity logged yet for this lead.</div>}
              </div>
            </div>
          )}

          {activeTab === "timeline" && (
            <div className="space-y-5">
              <form onSubmit={handleLogActivity} className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">Log New Activity</div>
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
                    placeholder="Outcome"
                    value={newActivityOutcome}
                    onChange={(e) => setNewActivityOutcome(e.target.value)}
                    className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
                  />
                  <input
                    type="text"
                    placeholder="Planned next action"
                    value={newActivityNext}
                    onChange={(e) => setNewActivityNext(e.target.value)}
                    className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Describe the interaction..."
                    value={newActivityDesc}
                    onChange={(e) => setNewActivityDesc(e.target.value)}
                    className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                  />
                  <button type="submit" className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold">
                    Log
                  </button>
                </div>
              </form>

              <div className="flex items-center gap-1.5">
                {(
                  [
                    { id: "all", label: "All Activity", count: leadActivities.length },
                    { id: "Email", label: "Emails Sent", count: leadActivities.filter((a) => a.type === "Email").length },
                    { id: "WhatsApp", label: "WhatsApp Sent", count: leadActivities.filter((a) => a.type === "WhatsApp").length },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setTimelineChannelFilter(f.id)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border flex items-center gap-1.5 transition-colors ${
                      timelineChannelFilter === f.id ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                    }`}
                  >
                    {f.id === "Email" && <Mail className="w-3 h-3" />}
                    {f.id === "WhatsApp" && <MessageSquare className="w-3 h-3" />}
                    <span>{f.label}</span>
                    <span className={`px-1.5 rounded-full text-[10px] ${timelineChannelFilter === f.id ? "bg-white/20" : "bg-slate-100"}`}>
                      {f.count}
                    </span>
                  </button>
                ))}
              </div>

              <div className="relative pl-6 border-l-2 border-slate-200 space-y-6">
                {leadActivities
                  .filter((act) => timelineChannelFilter === "all" || act.type === timelineChannelFilter)
                  .map((act) => {
                    const isEmail = act.type === "Email";
                    const isWhatsApp = act.type === "WhatsApp";
                    return (
                      <div key={act.id} className="relative group">
                        <div
                          className={`absolute -left-[31px] top-0.5 w-4 h-4 rounded-full bg-white border-2 group-hover:scale-110 transition-transform ${
                            isEmail ? "border-indigo-600" : isWhatsApp ? "border-emerald-600" : "border-slate-400"
                          }`}
                        />
                        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-800 flex items-center gap-1.5">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 ${
                                  isEmail ? "bg-indigo-50 text-indigo-700" : isWhatsApp ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"
                                }`}
                              >
                                {isEmail && <Mail className="w-3 h-3" />}
                                {isWhatsApp && <MessageSquare className="w-3 h-3" />}
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
                            <div className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-1 rounded inline-block">Outcome: {act.outcome}</div>
                          )}
                          {act.nextAction && (
                            <div className="text-[11px] text-slate-500 block">
                              Next Action: <strong className="text-slate-700">{act.nextAction}</strong>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                {leadActivities.filter((act) => timelineChannelFilter === "all" || act.type === timelineChannelFilter).length === 0 && (
                  <div className="text-center text-slate-400 text-xs py-6">
                    {timelineChannelFilter === "all" ? "No activity logged yet." : `No ${timelineChannelFilter} messages sent to this lead yet.`}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "ai" && (
            <div className="space-y-4">
              <div className="p-5 bg-[#181b21] text-white rounded-2xl border border-[#2d323f] shadow-xl space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-bold text-sm text-teal-300">
                      <Sparkles className="w-4 h-4 text-teal-400" />
                      Aargard Business Intelligence Construct
                    </div>
                    <p className="text-xs text-slate-300 max-w-lg">AI-powered lead qualification for {lead.name}.</p>
                  </div>
                  <button
                    onClick={handleRunAnalysis}
                    disabled={isAnalyzing}
                    className="px-4 py-2 bg-[#252a36] hover:bg-[#2f3544] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm border border-[#3d4455] transition-all shrink-0"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                    {isAnalyzing ? "Analyzing..." : result ? "Regenerate" : "Run Analysis"}
                  </button>
                </div>

                {isAnalyzing && (
                  <div className="py-10 flex flex-col items-center justify-center gap-3 text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
                    <p className="text-[11px] font-medium">Running analysis…</p>
                  </div>
                )}

                {!isAnalyzing && analysisError && (
                  <div className="py-6 text-center text-rose-400 text-[11px]">Analysis failed to run. Please try again.</div>
                )}

                {!isAnalyzing && !analysisError && result && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/20 flex flex-col items-center justify-center">
                        <span className="text-xl font-black text-teal-300">{result.qualificationScore}</span>
                        <span className="text-[9px] text-teal-400/70 font-semibold">/ 100</span>
                      </div>
                      <div className="flex-1 space-y-1.5">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${temperatureStyles[result.temperature] || temperatureStyles.Warm}`}>
                          {result.temperature} Lead
                        </span>
                        <p className="text-[11px] text-slate-300 leading-snug">{result.summary}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-white/5 border border-white/10 rounded-xl space-y-1.5">
                        <div className="flex items-center gap-1.5 text-emerald-300 font-bold text-[11px]">
                          <TrendingUp className="w-3.5 h-3.5" /> Buyer Intent Signals
                        </div>
                        <ul className="space-y-1">
                          {(result.buyerIntentSignals || []).map((s, i) => (
                            <li key={i} className="flex items-start gap-1 text-[10.5px] text-slate-300">
                              <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0 text-emerald-400" />
                              <span>{s}</span>
                            </li>
                          ))}
                          {(result.buyerIntentSignals || []).length === 0 && <li className="text-[10.5px] text-slate-500">None identified yet</li>}
                        </ul>
                      </div>
                      <div className="p-3 bg-white/5 border border-white/10 rounded-xl space-y-1.5">
                        <div className="flex items-center gap-1.5 text-amber-300 font-bold text-[11px]">
                          <AlertTriangle className="w-3.5 h-3.5" /> Risk Factors
                        </div>
                        <ul className="space-y-1">
                          {(result.riskFactors || []).map((s, i) => (
                            <li key={i} className="flex items-start gap-1 text-[10.5px] text-slate-300">
                              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0 text-amber-400" />
                              <span>{s}</span>
                            </li>
                          ))}
                          {(result.riskFactors || []).length === 0 && <li className="text-[10.5px] text-slate-500">None identified</li>}
                        </ul>
                      </div>
                    </div>

                    <div className="p-3 bg-white/5 border border-white/10 rounded-xl space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-1.5 font-bold text-slate-200">
                          <Mail className="w-3.5 h-3.5" />
                          <span>Best Channel: {result.bestOutreachChannel}</span>
                        </div>
                        <div className="flex items-center gap-1 text-slate-400">
                          <Clock className="w-3 h-3" />
                          <span>{result.bestOutreachTiming}</span>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-200">
                        <span className="font-bold">Next Action: </span>
                        {result.recommendedNextAction}
                      </p>
                      <p className="text-[10px] text-slate-400">Recommended follow-up date: {result.recommendedFollowUpDate}</p>
                    </div>

                    <div className="p-3 bg-teal-500/10 border border-teal-500/30 rounded-xl space-y-1">
                      <div className="text-[11px] font-bold text-teal-300">Suggested Opening Line</div>
                      <p className="text-[11px] text-teal-100 italic leading-snug">"{result.suggestedOpeningLine}"</p>
                    </div>

                    <div className="flex justify-end gap-2 flex-wrap">
                      {playbook && playbook.maxDiscountPercent > 0 && candidateProduct && (
                        <button
                          onClick={handleProposeOffer}
                          disabled={isProposingOffer || !lead.email}
                          className="px-3.5 py-1.5 bg-[#252a36] hover:bg-[#2f3544] disabled:opacity-50 text-white border border-[#3d4455] font-bold rounded-lg text-xs flex items-center gap-1.5 transition-colors shadow-sm"
                        >
                          <Percent className={`w-3.5 h-3.5 text-amber-400 ${isProposingOffer ? "animate-pulse" : ""}`} />
                          <span>{isProposingOffer ? "Drafting…" : offerQueued ? "Offer Queued ✓" : "Propose Offer"}</span>
                        </button>
                      )}
                      <button
                        onClick={handleGeneratePersonalizedEmail}
                        disabled={isGeneratingEmail || !lead.email}
                        title={!lead.email ? "This lead has no email on file" : undefined}
                        className="px-3.5 py-1.5 bg-[#252a36] hover:bg-[#2f3544] disabled:opacity-50 text-white border border-[#3d4455] font-bold rounded-lg text-xs flex items-center gap-1.5 transition-colors shadow-sm"
                      >
                        <Wand2 className={`w-3.5 h-3.5 text-teal-400 ${isGeneratingEmail ? "animate-pulse" : ""}`} />
                        <span>{isGeneratingEmail ? "Drafting…" : "Generate Personalized Email"}</span>
                      </button>
                      <button
                        onClick={handleApplyScore}
                        className="px-3.5 py-1.5 bg-teal-500 hover:bg-teal-400 text-[#0c0e12] font-bold rounded-lg text-xs flex items-center gap-1.5 transition-colors shadow-sm"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Apply Score & Follow-Up</span>
                      </button>
                    </div>
                  </div>
                )}

                {!isAnalyzing && !result && !analysisError && (
                  <div className="space-y-3">
                    <p className="text-[11px] text-slate-400">
                      Run the analysis to get a qualification score, buyer-intent signals, and a recommended channel/opener for this lead.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {playbook && playbook.maxDiscountPercent > 0 && candidateProduct && (
                        <button
                          onClick={handleProposeOffer}
                          disabled={isProposingOffer || !lead.email}
                          className="px-3.5 py-1.5 bg-[#252a36] hover:bg-[#2f3544] disabled:opacity-50 text-white border border-[#3d4455] font-bold rounded-lg text-xs flex items-center gap-1.5 transition-colors shadow-sm"
                        >
                          <Percent className={`w-3.5 h-3.5 text-amber-400 ${isProposingOffer ? "animate-pulse" : ""}`} />
                          <span>{isProposingOffer ? "Drafting…" : offerQueued ? "Offer Queued ✓" : "Propose Offer"}</span>
                        </button>
                      )}
                      <button
                        onClick={handleGeneratePersonalizedEmail}
                        disabled={isGeneratingEmail || !lead.email}
                        title={!lead.email ? "This lead has no email on file" : undefined}
                        className="px-3.5 py-1.5 bg-[#252a36] hover:bg-[#2f3544] disabled:opacity-50 text-white border border-[#3d4455] font-bold rounded-lg text-xs flex items-center gap-1.5 transition-colors shadow-sm"
                      >
                        <Wand2 className={`w-3.5 h-3.5 text-teal-400 ${isGeneratingEmail ? "animate-pulse" : ""}`} />
                        <span>{isGeneratingEmail ? "Drafting…" : "Generate Personalized Email"}</span>
                      </button>
                    </div>
                  </div>
                )}
                {emailGenError && (
                  <p className="text-[11px] text-rose-400">Couldn't generate the email -- please try again.</p>
                )}
                {playbook && (
                  <p className="text-[10px] text-slate-500">
                    Using the "{playbook.industry}" industry playbook for tone, qualification, and channel guidance.
                  </p>
                )}
              </div>
            </div>
          )}

          {activeTab === "knowledge" && (
            <div className="space-y-5">
              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-500" /> AI-Extracted Summary
                  </h3>
                  <button
                    onClick={handleRefreshKnowledgeSummary}
                    disabled={isRefreshingSummary}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${isRefreshingSummary ? "animate-spin" : ""}`} />
                    {isRefreshingSummary ? "Refreshing…" : aiSummaryEntry ? "Refresh" : "Generate"}
                  </button>
                </div>
                {aiSummaryEntry ? (
                  <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">{aiSummaryEntry.content}</p>
                ) : (
                  <p className="text-xs text-slate-400">
                    No AI summary yet -- generate one from this lead's own fields and activity history.
                  </p>
                )}
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <StickyNote className="w-3.5 h-3.5 text-slate-400" /> Manual Notes
                </h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Add a note only you know -- gets fed into personalized emails"
                    value={manualNote}
                    onChange={(e) => setManualNote(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddManualNote()}
                    className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                  />
                  <button
                    onClick={handleAddManualNote}
                    disabled={!manualNote.trim()}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add
                  </button>
                </div>
                {manualKnowledge.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">No manual notes yet for this lead.</p>
                ) : (
                  <div className="space-y-2">
                    {manualKnowledge.map((entry) => (
                      <div key={entry.id} className="p-2.5 bg-slate-50/70 border border-slate-200 rounded-lg flex items-start justify-between gap-2">
                        <p className="text-slate-700 text-xs leading-relaxed whitespace-pre-wrap">{entry.content}</p>
                        <button
                          onClick={() => deleteKnowledgeBaseEntry(entry.id)}
                          className="text-slate-400 hover:text-rose-500 shrink-0"
                          title="Delete note"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
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
