import React, { useState } from "react";
import { useCRM } from "../../context/CRMContext";
import {
  X,
  Building2,
  Mail,
  Phone,
  MessageSquare,
  MapPin,
  Linkedin,
  CalendarCheck,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Pencil,
  Check,
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

// Contacts don't have their own AI-qualification endpoint (only Leads and
// Companies do). Rather than build a second backend prompt, we adapt the
// contact into the same shape /api/ai/lead-analysis already expects -- it
// falls back gracefully (leadScore/priority/estimatedValue are optional).
export const ContactProfileDrawer: React.FC = () => {
  const {
    selectedContactId,
    setSelectedContactId,
    contacts,
    companies,
    activities,
    addActivity,
    currentUser,
    updateContact,
    openEmailComposer,
    openWhatsAppComposer,
    setSelectedCompanyId,
  } = useCRM();

  const [activeTab, setActiveTab] = useState<"overview" | "timeline" | "ai">("overview");
  const [timelineChannelFilter, setTimelineChannelFilter] = useState<"all" | "Email" | "WhatsApp">("all");
  const [newActivityType, setNewActivityType] = useState<any>("Call");
  const [newActivityDesc, setNewActivityDesc] = useState("");
  const [newActivityOutcome, setNewActivityOutcome] = useState("");
  const [newActivityNext, setNewActivityNext] = useState("");
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState(false);

  if (!selectedContactId) return null;
  const contact = contacts.find((c) => c.id === selectedContactId);
  if (!contact) return null;

  const company = companies.find((c) => c.id === contact.companyId);
  const contactActivities = activities
    .filter((a) => a.contactId === contact.id)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const latestNextAction = contactActivities.find((a) => a.nextAction)?.nextAction;

  const handleClose = () => setSelectedContactId(null);

  const handleLogActivity = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newActivityDesc) return;
    addActivity({
      type: newActivityType,
      companyId: contact.companyId || undefined,
      contactId: contact.id,
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

  const handleSaveNotes = () => {
    updateContact(contact.id, { notes: notesDraft });
    setIsEditingNotes(false);
  };

  const handleRunAnalysis = async () => {
    setIsAnalyzing(true);
    setAnalysisError(false);
    try {
      const res = await apiFetch("/api/ai/lead-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead: {
            name: `${contact.firstName} ${contact.lastName}`.trim(),
            company: company?.name || "",
            jobTitle: contact.position,
            email: contact.email,
            phone: contact.phone,
            status: contact.status,
            source: contact.leadSource,
            notes: contact.notes,
          },
          activities: contactActivities,
        }),
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

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-2xs animate-in fade-in duration-150">
      <div className="w-full max-w-3xl bg-white h-full shadow-2xl flex flex-col border-l border-slate-200 overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 bg-slate-50/70">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-600 text-white flex items-center justify-center font-bold text-xl shadow-md">
                {contact.firstName.charAt(0)}
                {contact.lastName.charAt(0)}
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                    {contact.firstName} {contact.lastName}
                  </h2>
                  <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {contact.status}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 mt-2">
                  <span>{contact.position || "No title on file"}</span>
                  {company && (
                    <button
                      onClick={() => setSelectedCompanyId(company.id)}
                      className="flex items-center gap-1 text-indigo-600 hover:underline font-semibold"
                    >
                      <Building2 className="w-3.5 h-3.5" />
                      {company.name}
                    </button>
                  )}
                  {(contact.city || contact.country) && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      {[contact.city, contact.country].filter(Boolean).join(", ")}
                    </span>
                  )}
                  <span className="text-slate-400">
                    Rep: <strong>{contact.salesperson}</strong>
                  </span>
                </div>
              </div>
            </div>

            {/* Acquisition action buttons -- Email + WhatsApp only, no SMS */}
            <div className="flex items-center gap-1.5">
              {contact.email && (
                <button
                  type="button"
                  onClick={() => openEmailComposer({ to: contact.email, companyId: contact.companyId, contactId: contact.id })}
                  className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 text-xs font-semibold shadow-sm transition-colors"
                  title={`Email ${contact.email}`}
                >
                  <Mail className="w-4 h-4" />
                  <span>Email</span>
                </button>
              )}
              {(contact.whatsapp || contact.phone) && (
                <button
                  type="button"
                  onClick={() =>
                    openWhatsAppComposer({ to: contact.whatsapp || contact.phone, companyId: contact.companyId, contactId: contact.id })
                  }
                  className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 text-xs font-semibold shadow-sm transition-colors"
                  title="Send WhatsApp Message"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>WhatsApp</span>
                </button>
              )}
            </div>

            <button
              onClick={handleClose}
              className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 transition-colors ml-2"
            >
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
            { id: "timeline", label: `Activity (${contactActivities.length})`, icon: CalendarCheck },
            { id: "ai", label: "AI Analysis", icon: Sparkles, badge: "AI" },
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
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Contact Details</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Email</span>
                    <span className="font-medium text-slate-800">{contact.email || "—"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Phone</span>
                    <span className="font-medium text-slate-800">{contact.phone || "—"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">WhatsApp</span>
                    <span className="font-medium text-slate-800">{contact.whatsapp || "Same as phone"}</span>
                  </div>
                  {contact.linkedin && (
                    <div>
                      <span className="text-slate-400 block text-[11px]">LinkedIn</span>
                      <a
                        href={contact.linkedin}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-indigo-600 hover:underline flex items-center gap-1"
                      >
                        <Linkedin className="w-3 h-3" /> Profile
                      </a>
                    </div>
                  )}
                  <div>
                    <span className="text-slate-400 block text-[11px]">Lead Source</span>
                    <span className="font-medium text-slate-800">{contact.leadSource || "—"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Added</span>
                    <span className="font-medium text-slate-800">{contact.createdAt}</span>
                  </div>
                </div>

                {contact.tags && contact.tags.length > 0 && (
                  <div className="pt-2">
                    <span className="text-slate-400 block text-[11px] mb-1.5">Tags</span>
                    <div className="flex flex-wrap gap-1.5">
                      {contact.tags.map((tag) => (
                        <span key={tag} className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-600 rounded-md text-[11px]">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-semibold text-slate-500">Notes</span>
                    {!isEditingNotes && (
                      <button
                        onClick={() => {
                          setNotesDraft(contact.notes || "");
                          setIsEditingNotes(true);
                        }}
                        className="text-indigo-600 hover:text-indigo-700"
                        title="Edit notes"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  {isEditingNotes ? (
                    <div className="space-y-2">
                      <textarea
                        value={notesDraft}
                        onChange={(e) => setNotesDraft(e.target.value)}
                        rows={3}
                        className="w-full px-2.5 py-1.5 border border-indigo-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                      <div className="flex gap-1.5 justify-end">
                        <button onClick={handleSaveNotes} className="px-2.5 py-1 bg-indigo-600 text-white rounded text-[11px] font-semibold flex items-center gap-1">
                          <Check className="w-3 h-3" /> Save
                        </button>
                        <button onClick={() => setIsEditingNotes(false)} className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded text-[11px] font-semibold">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">{contact.notes || "No notes yet."}</p>
                  )}
                </div>
              </div>

              {/* Recent activity preview */}
              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Recent Activity</h3>
                  <button onClick={() => setActiveTab("timeline")} className="text-[11px] text-indigo-600 font-semibold hover:underline">
                    View full log →
                  </button>
                </div>
                {contactActivities.slice(0, 3).map((act) => (
                  <div key={act.id} className="p-2.5 bg-slate-50/70 border border-slate-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700">{act.type}</span>
                      <span className="text-[10px] text-slate-400">{act.date}</span>
                    </div>
                    <p className="text-slate-600 mt-0.5">{act.description}</p>
                  </div>
                ))}
                {contactActivities.length === 0 && (
                  <div className="text-center text-slate-400 py-4">No activity logged yet for this contact.</div>
                )}
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
                    { id: "all", label: "All Activity", count: contactActivities.length },
                    { id: "Email", label: "Emails Sent", count: contactActivities.filter((a) => a.type === "Email").length },
                    { id: "WhatsApp", label: "WhatsApp Sent", count: contactActivities.filter((a) => a.type === "WhatsApp").length },
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
                {contactActivities
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
                {contactActivities.filter((act) => timelineChannelFilter === "all" || act.type === timelineChannelFilter).length === 0 && (
                  <div className="text-center text-slate-400 text-xs py-6">
                    {timelineChannelFilter === "all" ? "No activity logged yet." : `No ${timelineChannelFilter} messages sent to this contact yet.`}
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
                    <p className="text-xs text-slate-300 max-w-lg">
                      AI-powered qualification and outreach guidance for {contact.firstName} {contact.lastName}.
                    </p>
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
                    </div>

                    <div className="p-3 bg-teal-500/10 border border-teal-500/30 rounded-xl space-y-1">
                      <div className="text-[11px] font-bold text-teal-300">Suggested Opening Line</div>
                      <p className="text-[11px] text-teal-100 italic leading-snug">"{result.suggestedOpeningLine}"</p>
                    </div>
                  </div>
                )}

                {!isAnalyzing && !result && !analysisError && (
                  <p className="text-[11px] text-slate-400">
                    Run the analysis to get a qualification score, buyer-intent signals, and a recommended channel/opener for this contact.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
