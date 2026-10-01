import React, { useState } from "react";
import { useCRM } from "../../context/CRMContext";
import {
  BookMarked,
  Hand,
  Plus,
  X,
  Trash2,
  Pencil,
  Sparkles,
  Target,
  MessageSquareWarning,
  Mail,
  Phone,
  MessagesSquare,
  Clock,
  Power,
  Bot,
  Percent,
  ShieldAlert,
  Package,
  Users,
  Search,
  Info,
  ArrowRight,
  CheckCircle2,
  PauseCircle,
  Radio,
  Inbox as InboxIcon,
  AlertTriangle,
  Zap,
  Send,
  MailPlus,
  DollarSign,
  Lightbulb,
  Loader2,
  ChevronLeft,
} from "lucide-react";
import { IndustryAgent, PreferredOutreachChannel, AgentAction, AIProvider, AgentNature, MBTIType } from "../../types";
import { INDUSTRIES } from "../../data/industries";
import { normalizeIndustry, sanitizeIndustryText, summarizeIndustryUsage, findCloseIndustryMatches, IndustryUsage } from "../../lib/industryMatch";
import { AI_PROVIDER_MODELS, AI_PROVIDER_LABELS, defaultModelFor } from "../../lib/aiProviders";
import { AGENT_NATURES, AGENT_NATURE_DESCRIPTIONS, MBTI_TYPES, MBTI_INFO } from "../../lib/agentPersonality";

function csv(list: string[] | undefined): string {
  return (list || []).join(", ");
}

function fromCsv(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

// Plain-language relative time -- "3 minutes ago", not an ISO timestamp.
// Used only for the honest monitoring status readout below; this is
// display-only and never fed back into any comparison logic.
function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0 || Number.isNaN(ms)) return "just now";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

const CHANNELS: PreferredOutreachChannel[] = ["Email", "WhatsApp", "Call", "Mixed"];

const channelIcon = (channel: PreferredOutreachChannel) => {
  if (channel === "WhatsApp") return MessagesSquare;
  if (channel === "Call") return Phone;
  if (channel === "Mixed") return Target;
  return Mail;
};

const actionTypeLabel: Record<AgentAction["actionType"], string> = {
  follow_up: "Follow-up",
  email_reply: "Reply to inbound message",
  negotiation_offer: "Negotiation offer",
};

const emptyDraft = (): Omit<IndustryAgent, "id" | "createdAt" | "updatedAt" | "createdBy"> => ({
  industry: INDUSTRIES[0],
  isActive: true,
  productId: undefined,
  excludedLeadIds: [],
  tone: "",
  talkingPoints: [],
  painPoints: [],
  objectionNotes: "",
  customInstructions: "",
  agentNature: undefined,
  personalityType: undefined,
  qualificationGuidance: "",
  preferredChannel: "Email",
  followUpFrequencyDays: 7,
  followUpCount: 2,
  autoRunEnabled: false,
  frequencyMinutes: 15,
  modelProvider: "gemini",
  modelName: defaultModelFor("gemini"),
  maxDiscountPercent: 0,
  negotiationConditions: "",
});

// Frequency floor, in minutes, confirmed for this feature -- the UI never
// lets a user save anything below this, and Phase 2's server-side
// scheduler will enforce the same floor independent of the browser.
const MIN_FREQUENCY_MINUTES = 15;

// ----------------------------------------------------------------------------
// First-time explanation banner -- item 22 of the UX redesign spec: a
// lightweight, dismissible explanation of the whole model (match -> AI
// prepares -> you approve -> AarPex sends), shown once before a user has
// ever needed to open Instructions to understand what an Agent is.
// ----------------------------------------------------------------------------
const AGENTS_INTRO_KEY = "aarpex_agents_intro_dismissed";

const AgentsIntroBanner: React.FC = () => {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(AGENTS_INTRO_KEY) === "1";
    } catch {
      return false;
    }
  });
  if (dismissed) return null;
  return (
    <div className="p-4 bg-teal-500/5 border border-teal-500/25 rounded-2xl space-y-2">
      <div className="flex items-center gap-1.5 text-teal-300 font-bold">
        <Sparkles className="w-3.5 h-3.5" />
        Automate outreach by industry
      </div>
      <p className="text-slate-300">
        A Agent continuously finds businesses in a matching industry, prepares personalized outreach for them, and
        puts every proposed message in your approval queue -- nothing is ever sent without you approving it first.
      </p>
      <div className="flex items-center flex-wrap gap-1.5 text-[11px] text-slate-400 font-semibold">
        <span className="px-2 py-1 rounded-md bg-[#181b21] border border-[#2d323f]">Car Wash businesses match</span>
        <ArrowRight className="w-3 h-3 text-slate-600" />
        <span className="px-2 py-1 rounded-md bg-[#181b21] border border-[#2d323f]">AI prepares a follow-up</span>
        <ArrowRight className="w-3 h-3 text-slate-600" />
        <span className="px-2 py-1 rounded-md bg-[#181b21] border border-[#2d323f]">You approve</span>
        <ArrowRight className="w-3 h-3 text-slate-600" />
        <span className="px-2 py-1 rounded-md bg-[#181b21] border border-[#2d323f]">AarPex sends</span>
      </div>
      <button
        onClick={() => {
          try {
            localStorage.setItem(AGENTS_INTRO_KEY, "1");
          } catch {
            /* best-effort only */
          }
          setDismissed(true);
        }}
        className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg font-bold text-[11px]"
      >
        Got it
      </button>
    </div>
  );
};

// ----------------------------------------------------------------------------
// Create / Edit modal -- one agent per industry. Every field here is
// plain guidance text/lists fed straight into the AI prompts for email
// generation, lead qualification, and follow-up scheduling -- there's no
// hidden scoring formula, so what's written here is exactly what the AI
// sees.
// ----------------------------------------------------------------------------
const AgentFormModal: React.FC<{ editing: IndustryAgent | null; onClose: () => void }> = ({
  editing,
  onClose,
}) => {
  const {
    addIndustryAgent,
    updateIndustryAgent,
    industryAgents,
    products,
    leads,
    rawCompanies,
    agentActions,
    lastAgentScanAt,
    isAgentScanRunning,
    activeTenant,
    setActiveNav,
  } = useCRM() as any;
  const [draft, setDraft] = useState<Omit<IndustryAgent, "id" | "createdAt" | "updatedAt" | "createdBy">>(
    editing
      ? {
          industry: editing.industry,
          isActive: editing.isActive,
          productId: editing.productId,
          excludedLeadIds: editing.excludedLeadIds || [],
          tone: editing.tone,
          talkingPoints: editing.talkingPoints,
          painPoints: editing.painPoints,
          objectionNotes: editing.objectionNotes || "",
          customInstructions: editing.customInstructions || "",
          agentNature: editing.agentNature,
          personalityType: editing.personalityType,
          qualificationGuidance: editing.qualificationGuidance || "",
          preferredChannel: editing.preferredChannel,
          followUpFrequencyDays: editing.followUpFrequencyDays,
          followUpCount: editing.followUpCount,
          autoRunEnabled: editing.autoRunEnabled,
          frequencyMinutes: editing.frequencyMinutes || MIN_FREQUENCY_MINUTES,
          modelProvider: editing.modelProvider || "gemini",
          modelName: editing.modelName || defaultModelFor(editing.modelProvider || "gemini"),
          maxDiscountPercent: editing.maxDiscountPercent,
          negotiationConditions: editing.negotiationConditions || "",
        }
      : emptyDraft()
  );
  const [isSaving, setIsSaving] = useState(false);
  // Whether the Industry field is in "type your own" mode -- the select's
  // real option list is INDUSTRIES plus a synthetic "Other" entry, so an
  // agent whose industry is already a custom value (not on the standard
  // list) needs to open in custom-input mode too, rather than silently
  // resetting to the first INDUSTRIES option.
  const [customIndustryMode, setCustomIndustryMode] = useState<boolean>(
    () => !!draft.industry && !INDUSTRIES.includes(draft.industry)
  );
  const [matchSearch, setMatchSearch] = useState("");
  const [matchFilter, setMatchFilter] = useState<"all" | "companies" | "leads">("all");

  // Talking points / pain points are comma-separated text inputs backed by a
  // string[] in draft. Deriving the input's `value` straight from
  // csv(draft.talkingPoints) on every keystroke fights typing a comma: the
  // instant you type "Fast," it gets parsed to ["Fast", ""], the empty
  // trailing entry is filtered out, and the input snaps back to "Fast" --
  // the comma you just typed visibly disappears. Keeping the raw text in
  // its own state (only synced to draft.talkingPoints/painPoints as an
  // array on every change, never fed back into the input's value) lets the
  // user type freely, including trailing/consecutive commas.
  const [talkingPointsText, setTalkingPointsText] = useState(() => csv(draft.talkingPoints));
  const [painPointsText, setPainPointsText] = useState(() => csv(draft.painPoints));

  const duplicateIndustry =
    !editing &&
    industryAgents.some((p) => normalizeIndustry(p.industry) === normalizeIndustry(draft.industry));

  // "Matching Businesses" -- every agent already applies to every
  // Lead/Company whose Industry field matches this one, automatically and
  // invisibly. This surfaces exactly who that is right now (live, as the
  // Industry field above is edited) and lets specific businesses be opted
  // back out via a checkbox, without touching their Industry field.
  const industryLc = normalizeIndustry(draft.industry);
  const matchingLeads = industryLc ? (leads || []).filter((l: any) => normalizeIndustry(l.industry) === industryLc) : [];
  const matchingCompanies = industryLc ? (rawCompanies || []).filter((c: any) => normalizeIndustry(c.industry) === industryLc) : [];
  const excludedLeadIds = draft.excludedLeadIds || [];
  // Companies no longer exist as an entity; matchingCompanies is always
  // empty, so this stays a static empty list purely to keep the counts
  // below well-defined without reintroducing a company data model.
  const excludedCompanyIds: string[] = [];
  const includedCount =
    matchingLeads.length + matchingCompanies.length - excludedLeadIds.length - excludedCompanyIds.length;

  // Every distinct Industry value that actually exists on a real Lead or
  // Company right now, with how many records use it. Powers "pick an
  // existing industry" (guaranteed to match, since it's the same string)
  // and the "did you mean" fallback below (see industryMatch.ts).
  const existingIndustryUsages: IndustryUsage[] = summarizeIndustryUsage([
    ...(leads || []).map((l: any) => l.industry),
    ...(rawCompanies || []).map((c: any) => c.industry),
  ]);
  const closeIndustryMatches =
    matchingLeads.length === 0 && matchingCompanies.length === 0
      ? findCloseIndustryMatches(draft.industry, existingIndustryUsages)
      : [];

  // The "pick an existing value" chip list must actually be searchable by
  // what's typed -- a plain top-12-by-count list silently hides a real,
  // low-count industry (like two "Car Wash" companies) behind whatever
  // industry has the most records overall (often a bulk-import default
  // like "General"). Once something is typed, filter to values containing
  // it (a real search) instead of ranking by volume; only fall back to
  // "biggest buckets first" when the field is empty and there's nothing to
  // search against yet.
  const typedIndustry = draft.industry.trim().toLowerCase();
  const industryChipCandidates = typedIndustry
    ? existingIndustryUsages.filter((u) => u.raw.toLowerCase().includes(typedIndustry))
    : existingIndustryUsages;
  const toggleExcludedLead = (id: string) => {
    setDraft((p) => {
      const cur = p.excludedLeadIds || [];
      return { ...p, excludedLeadIds: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] };
    });
  };
  // No-op: companies no longer exist as an entity, so there is nothing to
  // toggle (matchingCompanies is always empty).
  const toggleExcludedCompany = (_id: string) => {};

  const matchSearchLc = matchSearch.trim().toLowerCase();
  const visibleLeads =
    matchFilter === "companies"
      ? []
      : matchingLeads.filter((l: any) => !matchSearchLc || (l.name || "").toLowerCase().includes(matchSearchLc) || (l.company || "").toLowerCase().includes(matchSearchLc));
  const visibleCompanies =
    matchFilter === "leads"
      ? []
      : matchingCompanies.filter((c: any) => !matchSearchLc || (c.name || "").toLowerCase().includes(matchSearchLc));

  // Editing an existing, already-saved Agent and changing the Industry
  // text changes WHO this Agent applies to -- surfaced as an explicit
  // "change audience?" warning (item 14) rather than a silent side effect
  // of editing a text field.
  const isChangingIndustry = !!editing && normalizeIndustry(editing.industry) !== industryLc && industryLc.length > 0;
  const priorMatchCount = (() => {
    if (!isChangingIndustry) return 0;
    const priorLc = normalizeIndustry(editing!.industry);
    const priorLeads = (leads || []).filter((l: any) => normalizeIndustry(l.industry) === priorLc).length;
    const priorCompanies = (rawCompanies || []).filter((c: any) => normalizeIndustry(c.industry) === priorLc).length;
    return priorLeads + priorCompanies;
  })();

  // This Agent's own slice of the shared Agent Approvals queue --
  // AgentAction has no direct agentId, but every action the scan creates
  // for an agent is stamped with that exact agent.industry string (see
  // runAgentScan in CRMContext.tsx), so an exact-string filter is reliable
  // here (not normalizeIndustry -- we want THIS agent's own actions, not
  // every agent that happens to normalize the same).
  const ownActions: AgentAction[] = editing
    ? (agentActions || []).filter((a: AgentAction) => a.industry === editing.industry)
    : [];
  const pendingActions = ownActions.filter((a) => a.status === "pending");
  const recentActivity = [...ownActions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5);

  const hasWebmail = ((activeTenant?.webmailConfigs || []) as any[]).length > 0;

  // Monitoring status -- follow-up drafting is covered two ways now: this
  // client-side scan (see runAgentScan in CRMContext.tsx), which only runs
  // while a browser tab is open but also drafts from inbound-reply
  // detection, and the server-side cron hitting /api/cron/agent-scan (see
  // server.ts) once a day independent of any tab (Vercel's free/Hobby plan
  // only allows daily cron jobs -- upgrading to Pro would allow a tighter
  // schedule). `lastScanAt` is shared by both, so "last checked" reflects
  // whichever ran more recently. The honest states are: off,
  // off-because-agent-paused, checking right now, or "monitored" with a
  // last-checked time -- never a plain green "always on", since the
  // browser side genuinely can stop (a closed tab) even though the daily
  // server side won't.
  const monitoringState: "off" | "checking" | "browser" | "not_yet" = !draft.autoRunEnabled || !draft.isActive
    ? "off"
    : isAgentScanRunning
    ? "checking"
    : lastAgentScanAt
    ? "browser"
    : "not_yet";

  const handleToggleAgentActive = () => {
    if (draft.isActive) {
      if (!confirm("Pause this Agent?\n\nPausing stops it from generating new automated actions. Anything already waiting in your approval queue stays there for you to review.")) {
        return;
      }
    }
    setDraft((p) => ({ ...p, isActive: !p.isActive }));
  };

  const handleSave = () => {
    if (!draft.industry.trim() || duplicateIndustry) return;
    setIsSaving(true);
    try {
      // Clean the Industry text at the moment it's actually stored -- not
      // just at comparison time -- so a stray invisible character picked up
      // while typing (a browser extension, an OS input method, a paste from
      // elsewhere) never makes it into the saved record at all. See
      // sanitizeIndustryText() in industryMatch.ts for why this matters
      // beyond what normalizeIndustry() already protects.
      const cleanDraft = { ...draft, industry: sanitizeIndustryText(draft.industry) };
      if (editing) {
        updateIndustryAgent(editing.id, cleanDraft);
      } else {
        addIndustryAgent(cleanDraft);
      }
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-[#181b21] border border-[#2d323f] rounded-2xl w-full max-w-2xl max-h-[90vh] shadow-2xl overflow-hidden text-xs text-slate-200 flex flex-col">
        <div className="px-6 py-4 border-b border-[#2d323f] flex items-center justify-between bg-[#121418]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/30 text-teal-400 flex items-center justify-center">
              <BookMarked className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-bold text-white">{editing ? "Edit Industry Agent" : "New Industry Agent"}</h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-[#252a36] hover:bg-[#2f3544] text-slate-400 hover:text-white flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Industry *</label>
              <select
                value={customIndustryMode ? "__custom__" : draft.industry}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "__custom__") {
                    setCustomIndustryMode(true);
                    setDraft((p) => ({ ...p, industry: "" }));
                  } else {
                    setCustomIndustryMode(false);
                    setDraft((p) => ({ ...p, industry: val }));
                  }
                }}
                className="w-full px-3 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
              >
                <option value="" disabled>
                  Select an industry…
                </option>
                {INDUSTRIES.map((ind) => (
                  <option key={ind} value={ind}>
                    {ind}
                  </option>
                ))}
                <option value="__custom__">Other (type your own)…</option>
              </select>
              {customIndustryMode && (
                <input
                  type="text"
                  autoFocus
                  value={draft.industry}
                  onChange={(e) => setDraft((p) => ({ ...p, industry: e.target.value }))}
                  placeholder="e.g. Healthcare & Wellness"
                  className="w-full mt-2 px-3 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
                />
              )}
              {duplicateIndustry && (
                <p className="text-rose-400 mt-1">A agent for this industry already exists -- edit that one instead.</p>
              )}
              <p className="text-slate-500 mt-1">
                Match this to the Industry field on your Leads/Companies exactly so it auto-applies.
              </p>
              {existingIndustryUsages.length > 0 && (
                <div className="mt-2">
                  <p className="text-slate-500 mb-1">
                    {typedIndustry
                      ? `Values already on your records matching "${draft.industry}" (guaranteed to match exactly if you pick one):`
                      : "Values already used on your records (guaranteed to match exactly if you pick one):"}
                  </p>
                  {industryChipCandidates.length === 0 ? (
                    <p className="text-slate-600">
                      Nothing on your records contains "{draft.industry}" -- clear the search above to browse everything, or check "did you mean" below once you save.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {industryChipCandidates.slice(0, 20).map((u) => {
                        const isCurrent = normalizeIndustry(u.raw) === industryLc;
                        return (
                          <button
                            key={u.raw}
                            type="button"
                            onClick={() => {
                              setCustomIndustryMode(!INDUSTRIES.includes(u.raw));
                              setDraft((p) => ({ ...p, industry: u.raw }));
                            }}
                            className={`px-2 py-1 rounded-md border text-[11px] transition-colors ${
                              isCurrent
                                ? "bg-teal-500/15 border-teal-500/40 text-teal-300"
                                : "bg-[#121418] border-[#2d323f] text-slate-400 hover:text-white hover:border-teal-500/40"
                            }`}
                          >
                            {u.raw} <span className="opacity-60">({u.count})</span>
                          </button>
                        );
                      })}
                      {industryChipCandidates.length > 20 && (
                        <span className="px-2 py-1 text-slate-600">+{industryChipCandidates.length - 20} more -- keep typing to narrow it down</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Agent</label>
              <button
                type="button"
                onClick={handleToggleAgentActive}
                className={`w-full px-3 py-2 rounded-lg border font-bold flex items-center justify-center gap-1.5 transition-colors ${
                  draft.isActive
                    ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300"
                    : "bg-[#121418] border-[#2d323f] text-slate-500"
                }`}
              >
                {draft.isActive ? <Power className="w-3.5 h-3.5" /> : <PauseCircle className="w-3.5 h-3.5" />}
                {draft.isActive ? "Active" : "Paused"}
              </button>
              {!draft.isActive && (
                <p className="text-slate-500 mt-1">This Agent is not generating new actions.</p>
              )}
            </div>

            {products.length > 0 && (
              <div className="sm:col-span-2">
                <label className="block text-slate-300 font-semibold mb-1 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-teal-400" />
                  Product / Service <span className="text-slate-500 font-normal">(optional)</span>
                </label>
                <select
                  value={draft.productId || ""}
                  onChange={(e) => setDraft((p) => ({ ...p, productId: e.target.value || undefined }))}
                  className="w-full px-3 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
                >
                  <option value="">None -- general outreach</option>
                  {products.map((prod) => (
                    <option key={prod.id} value={prod.id}>
                      {prod.name} ({prod.type})
                    </option>
                  ))}
                </select>
                <p className="text-slate-500 mt-1">
                  When set, this product's name and pitch are fed into every follow-up, reply, and offer this agent's agent drafts.
                </p>
              </div>
            )}
          </div>

          {/* "Who will this Agent reach?" -- item 4: the audience summary
              must be visible before anything is activated, not buried in a
              tooltip or the Instructions page. */}
          <div className="p-3.5 bg-[#121418] rounded-xl border border-[#2d323f] space-y-1.5">
            <div className="flex items-center gap-1.5 text-teal-300 font-bold">
              <Users className="w-3.5 h-3.5" />
              Who will this Agent reach?
            </div>
            <p className="text-slate-300">
              This Agent automatically works with every business whose industry matches{" "}
              <span className="font-semibold text-white">"{draft.industry || "..."}"</span>.
            </p>
            <p className="text-slate-400">
              <span className="font-bold text-white">{includedCount}</span> businesses currently matching
              {matchingLeads.length > 0 && ` -- ${matchingLeads.length} Lead${matchingLeads.length === 1 ? "" : "s"}`}
              {matchingCompanies.length > 0 && `${matchingLeads.length > 0 ? "," : " --"} ${matchingCompanies.length} Compan${matchingCompanies.length === 1 ? "y" : "ies"}`}
              {(excludedLeadIds.length + excludedCompanyIds.length) > 0 && ` (${excludedLeadIds.length + excludedCompanyIds.length} excluded)`}
            </p>
            <p className="text-slate-500">
              New businesses added later with this same industry automatically become eligible too -- there's no
              separate audience list to keep up to date.
            </p>
          </div>

          {isChangingIndustry && (
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2 text-amber-100">
              <div className="flex items-center gap-1.5 font-bold text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5" />
                Change which businesses this Agent applies to?
              </div>
              <p>Changing the industry changes who this Agent works with.</p>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="px-2 py-1 rounded-md bg-[#181b21] border border-[#2d323f]">
                  Current: <span className="font-bold text-white">"{editing!.industry}"</span> -- {priorMatchCount} matching
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-amber-500/60" />
                <span className="px-2 py-1 rounded-md bg-[#181b21] border border-[#2d323f]">
                  New: <span className="font-bold text-white">"{draft.industry}"</span> -- {matchingLeads.length + matchingCompanies.length} matching
                </span>
              </div>
            </div>
          )}

          {/* Automation model, made explicit -- items 7 & 10. Shown right in
              the Agent itself so this is answerable without opening
              Instructions. */}
          <div className="p-3.5 bg-[#121418] rounded-xl border border-[#2d323f] space-y-2.5">
            <div className="flex items-center gap-1.5 text-teal-300 font-bold">
              <Bot className="w-3.5 h-3.5" />
              How this Agent works
            </div>
            <div className="flex items-center flex-wrap gap-1.5 text-[11px] font-semibold">
              <span className="px-2 py-1 rounded-md bg-[#181b21] border border-[#2d323f] text-slate-300">1. Match</span>
              <ArrowRight className="w-3 h-3 text-slate-600" />
              <span className="px-2 py-1 rounded-md bg-[#181b21] border border-[#2d323f] text-slate-300">2. AI prepares an action</span>
              <ArrowRight className="w-3 h-3 text-slate-600" />
              <span className="px-2 py-1 rounded-md bg-[#181b21] border border-[#2d323f] text-slate-300">3. You approve</span>
              <ArrowRight className="w-3 h-3 text-slate-600" />
              <span className="px-2 py-1 rounded-md bg-[#181b21] border border-[#2d323f] text-slate-300">4. AarPex sends</span>
            </div>
            <ol className="space-y-1 text-slate-400 list-decimal list-inside">
              <li>Businesses with the selected industry are automatically eligible.</li>
              <li>While enabled, AarPex periodically checks for a due follow-up or an inbound reply worth acting on.</li>
              <li>The AI prepares a personalized message using this Agent's settings and linked Product.</li>
              <li>The proposed action appears in your Agent Approvals queue -- reviewable, editable, or rejectable.</li>
              <li>Only after you approve it does AarPex actually send anything.</li>
            </ol>
            <p className="text-slate-500">
              AarPex never sends AI-generated outreach on its own -- every proposed action waits for your approval.
            </p>
          </div>

          {!hasWebmail && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-2 text-amber-100">
              <Mail className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Email connection required. </span>
                This Agent can still identify matching businesses and prepare proposed actions, but AarPex can't
                send anything you approve until a mailbox is connected in Settings.
              </div>
            </div>
          )}

          {/* Real-time status for an existing Agent -- items 9, 11, 16.
              Only shown once an Agent exists to have a history at all. */}
          {editing && (
            <div className="p-3.5 bg-[#121418] rounded-xl border border-[#2d323f] space-y-3">
              <div className="flex items-center gap-1.5 text-teal-300 font-bold">
                <Radio className="w-3.5 h-3.5" />
                Monitoring status
              </div>
              {monitoringState === "off" && (
                <div className="flex items-center gap-2 text-slate-500">
                  <span className="w-2 h-2 rounded-full bg-slate-600" />
                  Not monitoring -- {!draft.isActive ? "this Agent is paused." : "automated monitoring is off below."}
                </div>
              )}
              {monitoringState === "checking" && (
                <div className="flex items-center gap-2 text-emerald-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Checking now...
                </div>
              )}
              {monitoringState === "browser" && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-emerald-300">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    Monitored -- last checked {timeAgo(lastAgentScanAt)}
                  </div>
                  <p className="text-slate-500">
                    AarPex checks this Agent while this workspace is open in a browser tab (every ~10 minutes),
                    and separately on the server once a day even when no tab is open -- so follow-ups keep
                    going out either way. Only the browser check can also read your inbox for replies, since
                    that needs a live connection to your mailbox.
                  </p>
                </div>
              )}
              {monitoringState === "not_yet" && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-amber-300">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    Hasn't checked yet this session
                  </div>
                  <p className="text-slate-500">
                    The first browser check runs shortly after this workspace loads, then every ~10 minutes
                    while a tab stays open -- and a server-side check also runs once a day regardless, so
                    this Agent is monitored even before that first browser check happens.
                  </p>
                </div>
              )}

              <div className="pt-2 border-t border-[#2d323f] flex items-center justify-between gap-2">
                <span className="text-slate-400">
                  {pendingActions.length > 0 ? (
                    <>
                      <span className="font-bold text-white">{pendingActions.length}</span> action
                      {pendingActions.length === 1 ? "" : "s"} waiting for your approval
                    </>
                  ) : (
                    "You're all caught up -- nothing waiting for approval."
                  )}
                </span>
                {pendingActions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      setActiveNav?.("Agent Approvals");
                    }}
                    className="px-2.5 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg font-bold shrink-0"
                  >
                    Review approvals
                  </button>
                )}
              </div>

              <div className="pt-2 border-t border-[#2d323f] space-y-1.5">
                <div className="text-slate-400 font-semibold">Agent activity</div>
                {recentActivity.length === 0 ? (
                  <p className="text-slate-500">No agent activity yet -- proposed actions and activity will show up here as this Agent runs.</p>
                ) : (
                  recentActivity.map((a) => (
                    <div key={a.id} className="p-2 bg-[#181b21] border border-[#2d323f] rounded-lg">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-200 truncate">
                          {a.actionType === "email_reply" ? <InboxIcon className="w-3 h-3 inline mr-1 text-teal-400" /> : <Bot className="w-3 h-3 inline mr-1 text-teal-400" />}
                          {actionTypeLabel[a.actionType]} -- {a.recipientName}
                        </span>
                        <span
                          className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
                            a.status === "pending"
                              ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                              : a.status === "approved"
                              ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                              : "bg-slate-500/15 text-slate-400 border-slate-500/30"
                          }`}
                        >
                          {a.status === "pending" ? "Pending approval" : a.status === "approved" ? "Sent" : "Rejected"}
                        </span>
                      </div>
                      <div className="text-slate-500 mt-0.5">{timeAgo(a.createdAt)} -- {a.reasoning}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Matching Businesses -- this agent's agent works EVERY
              Lead/Company whose Industry matches the field above,
              automatically. This makes that otherwise-invisible audience
              visible and lets specific ones be opted out. */}
          <div className="p-3.5 bg-[#121418] rounded-xl border border-[#2d323f] space-y-3">
            <div className="flex items-center gap-1.5 text-teal-300 font-bold">
              <Users className="w-3.5 h-3.5" />
              Matching Businesses
            </div>
            <p className="text-slate-500">
              This agent's agent automatically works every Lead and Company below, because their Industry field matches "{draft.industry || "..."}" above.
              Uncheck any you want to leave out -- this only affects this Agent and never changes the business's own Industry field or removes it from AarPex.
            </p>

            {matchingLeads.length === 0 && matchingCompanies.length === 0 ? (
              <div className="p-3 bg-[#181b21] border border-[#2d323f] rounded-lg text-slate-500 space-y-2">
                <p>
                  No leads or companies currently have this industry -- nothing for this agent to work yet. Set a
                  lead's or company's Industry field to "{draft.industry || "this industry"}" from its profile to include it.
                </p>
                {closeIndustryMatches.length > 0 && (
                  <div className="pt-2 border-t border-[#2d323f]">
                    <p className="text-amber-400/90 mb-1.5">
                      Close, but not an exact match -- these existing values are similar to what you typed (this is
                      usually a stray space, a typo, or different capitalization/wording). Click one to use it exactly
                      as stored:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {closeIndustryMatches.map((u) => (
                        <button
                          key={u.raw}
                          type="button"
                          onClick={() => setDraft((p) => ({ ...p, industry: u.raw }))}
                          className="px-2 py-1 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 text-[11px] font-mono"
                        >
                          "{u.raw}" <span className="opacity-70">({u.count})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative flex-1 min-w-[160px]">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={matchSearch}
                      onChange={(e) => setMatchSearch(e.target.value)}
                      placeholder="Search businesses..."
                      className="w-full pl-7 pr-2 py-1.5 bg-[#181b21] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    {(["all", "companies", "leads"] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setMatchFilter(f)}
                        className={`px-2 py-1 rounded-md border font-semibold capitalize ${
                          matchFilter === f
                            ? "bg-teal-500/15 border-teal-500/40 text-teal-300"
                            : "bg-[#181b21] border-[#2d323f] text-slate-500 hover:text-white"
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {visibleLeads.length > 0 && (
                    <div>
                      <div className="text-slate-400 font-semibold mb-1">
                        Leads ({(matchingLeads.length - excludedLeadIds.length)}/{matchingLeads.length} included)
                      </div>
                      <div className="max-h-40 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                        {visibleLeads.map((l: any) => {
                          const included = !excludedLeadIds.includes(l.id);
                          return (
                            <label
                              key={l.id}
                              title={`Included because this Lead's Industry ("${l.industry}") matches this Agent's Industry ("${draft.industry}").`}
                              className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-[#181b21] cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={included}
                                onChange={() => toggleExcludedLead(l.id)}
                                className="accent-teal-500"
                              />
                              <span className={included ? "text-slate-200" : "text-slate-500 line-through"}>
                                {l.name} {l.company ? `(${l.company})` : ""}
                              </span>
                              <Info className="w-3 h-3 text-slate-600 ml-auto shrink-0" />
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {visibleCompanies.length > 0 && (
                    <div>
                      <div className="text-slate-400 font-semibold mb-1">
                        Companies ({(matchingCompanies.length - excludedCompanyIds.length)}/{matchingCompanies.length} included)
                      </div>
                      <div className="max-h-40 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                        {visibleCompanies.map((c: any) => {
                          const included = !excludedCompanyIds.includes(c.id);
                          return (
                            <label
                              key={c.id}
                              title={`Included because this Company's Industry ("${c.industry}") matches this Agent's Industry ("${draft.industry}").`}
                              className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-[#181b21] cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={included}
                                onChange={() => toggleExcludedCompany(c.id)}
                                className="accent-teal-500"
                              />
                              <span className={included ? "text-slate-200" : "text-slate-500 line-through"}>
                                {c.name}
                              </span>
                              <Info className="w-3 h-3 text-slate-600 ml-auto shrink-0" />
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {visibleLeads.length === 0 && visibleCompanies.length === 0 && (
                    <p className="text-slate-500 sm:col-span-2">No businesses match "{matchSearch}" in this list.</p>
                  )}
                </div>
                {excludedLeadIds.length + excludedCompanyIds.length === 0 && (
                  <p className="text-slate-600">No businesses are excluded from this Agent.</p>
                )}
              </>
            )}
          </div>

          {/* Email tone & talking points */}
          <div className="p-3.5 bg-[#121418] rounded-xl border border-[#2d323f] space-y-3">
            <div className="flex items-center gap-1.5 text-teal-300 font-bold">
              <Sparkles className="w-3.5 h-3.5" />
              Email Tone &amp; Talking Points
            </div>
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Tone</label>
              <input
                type="text"
                value={draft.tone}
                onChange={(e) => setDraft((p) => ({ ...p, tone: e.target.value }))}
                placeholder='e.g. "Consultative and data-driven, minimal hype"'
                className="w-full px-3 py-2 bg-[#181b21] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Talking points (comma-separated)</label>
              <input
                type="text"
                value={talkingPointsText}
                onChange={(e) => {
                  setTalkingPointsText(e.target.value);
                  setDraft((p) => ({ ...p, talkingPoints: fromCsv(e.target.value) }));
                }}
                placeholder="ROI within 90 days, compliance-ready, dedicated onboarding"
                className="w-full px-3 py-2 bg-[#181b21] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Common pain points (comma-separated)</label>
              <input
                type="text"
                value={painPointsText}
                onChange={(e) => {
                  setPainPointsText(e.target.value);
                  setDraft((p) => ({ ...p, painPoints: fromCsv(e.target.value) }));
                }}
                placeholder="Staff shortages, rising costs, manual scheduling"
                className="w-full px-3 py-2 bg-[#181b21] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-semibold mb-1 flex items-center gap-1">
                <MessageSquareWarning className="w-3 h-3" /> Objection handling notes
              </label>
              <textarea
                rows={2}
                value={draft.objectionNotes}
                onChange={(e) => setDraft((p) => ({ ...p, objectionNotes: e.target.value }))}
                className="w-full px-3 py-2 bg-[#181b21] border border-[#2d323f] text-white rounded-lg resize-none focus:outline-none focus:border-teal-400"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-semibold mb-1 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Additional / custom instructions
              </label>
              <textarea
                rows={2}
                value={draft.customInstructions}
                onChange={(e) => setDraft((p) => ({ ...p, customInstructions: e.target.value }))}
                placeholder='e.g. "Always mention our 24/7 support", "never discuss pricing before qualifying budget", "keep emails under 100 words"'
                className="w-full px-3 py-2 bg-[#181b21] border border-[#2d323f] text-white rounded-lg resize-none focus:outline-none focus:border-teal-400"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 font-semibold mb-1 flex items-center gap-1">
                  <Zap className="w-3 h-3" /> Agent nature
                </label>
                <select
                  value={draft.agentNature || ""}
                  onChange={(e) => setDraft((p) => ({ ...p, agentNature: (e.target.value || undefined) as AgentNature | undefined }))}
                  className="w-full px-3 py-2 bg-[#181b21] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
                >
                  <option value="">None (rely on tone above)</option>
                  {AGENT_NATURES.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                {draft.agentNature && (
                  <p className="text-[10px] text-slate-500 mt-1">{AGENT_NATURE_DESCRIPTIONS[draft.agentNature]}</p>
                )}
              </div>
              <div>
                <label className="block text-slate-400 font-semibold mb-1 flex items-center gap-1">
                  <Bot className="w-3 h-3" /> Personality type (Myers-Briggs)
                </label>
                <select
                  value={draft.personalityType || ""}
                  onChange={(e) => setDraft((p) => ({ ...p, personalityType: (e.target.value || undefined) as MBTIType | undefined }))}
                  className="w-full px-3 py-2 bg-[#181b21] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
                >
                  <option value="">None</option>
                  {MBTI_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t} -- {MBTI_INFO[t].nickname}
                    </option>
                  ))}
                </select>
                {draft.personalityType && (
                  <p className="text-[10px] text-slate-500 mt-1">{MBTI_INFO[draft.personalityType].description}</p>
                )}
              </div>
            </div>
          </div>

          {/* Qualification guidance */}
          <div className="p-3.5 bg-[#121418] rounded-xl border border-[#2d323f] space-y-2">
            <div className="flex items-center gap-1.5 text-teal-300 font-bold">
              <Target className="w-3.5 h-3.5" />
              Lead Qualification Guidance
            </div>
            <textarea
              rows={3}
              value={draft.qualificationGuidance}
              onChange={(e) => setDraft((p) => ({ ...p, qualificationGuidance: e.target.value }))}
              placeholder="What makes a lead in this industry hot vs. cold? Any red flags or buying signals specific to this vertical?"
              className="w-full px-3 py-2 bg-[#181b21] border border-[#2d323f] text-white rounded-lg resize-none focus:outline-none focus:border-teal-400"
            />
          </div>

          {/* Follow-up cadence & channel */}
          <div className="p-3.5 bg-[#121418] rounded-xl border border-[#2d323f] space-y-3">
            <div className="flex items-center gap-1.5 text-teal-300 font-bold">
              <Clock className="w-3.5 h-3.5" />
              Follow-Up Cadence &amp; Channel
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Preferred channel</label>
                <select
                  value={draft.preferredChannel}
                  onChange={(e) => setDraft((p) => ({ ...p, preferredChannel: e.target.value as PreferredOutreachChannel }))}
                  className="w-full px-3 py-2 bg-[#181b21] border border-[#2d323f] text-white rounded-lg"
                >
                  {CHANNELS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Follow-up every (days)</label>
                <input
                  type="number"
                  min={1}
                  value={draft.followUpFrequencyDays}
                  onChange={(e) => setDraft((p) => ({ ...p, followUpFrequencyDays: Math.max(1, Number(e.target.value) || 1) }))}
                  className="w-full px-3 py-2 bg-[#181b21] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
                />
              </div>
              <div>
                <label className="block text-slate-400 font-semibold mb-1"># of follow-ups</label>
                <input
                  type="number"
                  min={0}
                  value={draft.followUpCount}
                  onChange={(e) => setDraft((p) => ({ ...p, followUpCount: Math.max(0, Number(e.target.value) || 0) }))}
                  className="w-full px-3 py-2 bg-[#181b21] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
                />
              </div>
            </div>
          </div>

          {/* Autonomous agent + negotiation */}
          <div className="p-3.5 bg-[#121418] rounded-xl border border-[#2d323f] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-teal-300 font-bold">
                <Bot className="w-3.5 h-3.5" />
                Automated Monitoring
              </div>
              <button
                type="button"
                onClick={() => setDraft((p) => ({ ...p, autoRunEnabled: !p.autoRunEnabled }))}
                className={`px-3 py-1.5 rounded-lg border font-bold flex items-center gap-1.5 transition-colors ${
                  draft.autoRunEnabled
                    ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300"
                    : "bg-[#181b21] border-[#2d323f] text-slate-500"
                }`}
              >
                <Power className="w-3.5 h-3.5" />
                {draft.autoRunEnabled ? "Monitoring: On" : "Monitoring: Off"}
              </button>
            </div>
            <p className="text-slate-500">
              When on, AarPex periodically checks this industry's businesses (while this workspace is open in a
              browser tab) for due follow-ups and inbox replies, and drafts proposed actions into Agent Approvals for
              you to review -- nothing is ever sent without your approval.
            </p>

            <div className="pt-2 border-t border-[#2d323f]/80 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">AI provider</label>
                <select
                  value={draft.modelProvider}
                  onChange={(e) => {
                    const provider = e.target.value as AIProvider;
                    setDraft((p) => ({ ...p, modelProvider: provider, modelName: defaultModelFor(provider) }));
                  }}
                  className="w-full px-3 py-2 bg-[#181b21] border border-[#2d323f] text-white rounded-lg"
                >
                  {(Object.keys(AI_PROVIDER_MODELS) as AIProvider[]).map((provider) => (
                    <option key={provider} value={provider}>{AI_PROVIDER_LABELS[provider]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Model</label>
                <select
                  value={draft.modelName}
                  onChange={(e) => setDraft((p) => ({ ...p, modelName: e.target.value }))}
                  className="w-full px-3 py-2 bg-[#181b21] border border-[#2d323f] text-white rounded-lg"
                >
                  {AI_PROVIDER_MODELS[draft.modelProvider as AIProvider].map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Check every (minutes)</label>
                <input
                  type="number"
                  min={MIN_FREQUENCY_MINUTES}
                  value={draft.frequencyMinutes}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, frequencyMinutes: Math.max(MIN_FREQUENCY_MINUTES, Number(e.target.value) || MIN_FREQUENCY_MINUTES) }))
                  }
                  className="w-full px-3 py-2 bg-[#181b21] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
                />
              </div>
            </div>
            <p className="text-slate-500">
              Powered by AarPex's shared AI infrastructure -- there's nothing to configure here beyond picking a
              provider and model above.
            </p>

            <div className="pt-2 border-t border-[#2d323f]/80 space-y-2">
              <label className="block text-slate-400 font-semibold mb-1 flex items-center gap-1">
                <Percent className="w-3 h-3" /> Max discount the agent may propose
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={draft.maxDiscountPercent}
                  onChange={(e) => setDraft((p) => ({ ...p, maxDiscountPercent: Math.max(0, Math.min(100, Number(e.target.value) || 0)) }))}
                  className="w-24 px-3 py-2 bg-[#181b21] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
                />
                <span className="text-slate-500">% off list price (0 = no negotiation authority for this industry)</span>
              </div>
              {draft.maxDiscountPercent > 0 && (
                <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-2 text-amber-200">
                  <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>This is a hard ceiling enforced by the server -- the agent can never propose more than this, but every offer still requires your approval before it's sent.</span>
                </div>
              )}
              <textarea
                rows={2}
                value={draft.negotiationConditions}
                onChange={(e) => setDraft((p) => ({ ...p, negotiationConditions: e.target.value }))}
                placeholder={`Any other negotiation guidance, e.g. "annual prepay only", "no discount below $500 deals"`}
                className="w-full px-3 py-2 bg-[#181b21] border border-[#2d323f] text-white rounded-lg resize-none focus:outline-none focus:border-teal-400"
              />
            </div>
          </div>

          {/* "Ready to activate" summary -- item 8, shown before a brand new
              Agent is created so nothing about what's about to happen is
              a surprise. */}
          {!editing && (
            <div className="p-3.5 bg-teal-500/5 border border-teal-500/25 rounded-xl space-y-1.5">
              <div className="flex items-center gap-1.5 text-teal-300 font-bold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Ready to activate
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-300">
                <span className="text-slate-500">Industry</span>
                <span className="font-semibold text-white">{draft.industry || "--"}</span>
                <span className="text-slate-500">Businesses currently matching</span>
                <span className="font-semibold text-white">{matchingLeads.length + matchingCompanies.length}</span>
                <span className="text-slate-500">Excluded</span>
                <span className="font-semibold text-white">{excludedLeadIds.length + excludedCompanyIds.length}</span>
                <span className="text-slate-500">Product</span>
                <span className="font-semibold text-white">
                  {draft.productId ? products.find((p: any) => p.id === draft.productId)?.name || "--" : "None"}
                </span>
                <span className="text-slate-500">Automated monitoring</span>
                <span className="font-semibold text-white">{draft.autoRunEnabled ? "On" : "Off"}</span>
              </div>
              <p className="text-slate-500 pt-1">
                AarPex will identify eligible businesses{draft.autoRunEnabled ? ", prepare personalized follow-ups, and place proposed actions in your approval queue" : " -- automated monitoring is off, so you'll need to propose actions manually until you turn it on"}.
              </p>
            </div>
          )}
        </div>

        <div className="px-6 py-3.5 border-t border-[#2d323f] bg-[#121418] flex justify-end gap-2">
          <button onClick={onClose} className="px-3.5 py-2 text-slate-400 hover:text-white font-semibold">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !draft.industry.trim() || duplicateIndustry}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded-lg font-bold"
          >
            {isSaving ? "Saving..." : editing ? "Save Changes" : "Activate Agent"}
          </button>
        </div>
      </div>
    </div>
  );
};

const AgentCard: React.FC<{
  agent: IndustryAgent;
  onEdit: () => void;
  selected: boolean;
  onToggleSelected: () => void;
}> = ({ agent, onEdit, selected, onToggleSelected }) => {
  const { deleteIndustryAgent, updateIndustryAgent, leads, rawCompanies, products, agentActions, lastAgentScanAt, isAgentScanRunning, runAgentScanNow, setActiveNav, draftAgentFollowUpsNow, sendAgentDraftsNow, setAgentNextEmailDirective, setAgentOperatorControl } = useCRM() as any;
  const [isRunningNow, setIsRunningNow] = useState(false);
  // Which instant-control button is mid-flight ("send" | "followup"), plus a
  // short result line shown under the buttons (cleared on the next click).
  const [instantBusy, setInstantBusy] = useState<"send" | "followup" | null>(null);
  const [instantNotice, setInstantNotice] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const linkedProduct = agent.productId ? products.find((p: any) => p.id === agent.productId) : null;
  const ChannelIcon = channelIcon(agent.preferredChannel);
  const industryLc = normalizeIndustry(agent.industry);
  const matchingLeadCount = leads.filter((l: any) => normalizeIndustry(l.industry) === industryLc).length;
  const matchingCompanyCount = (rawCompanies || []).filter((c: any) => normalizeIndustry(c.industry) === industryLc).length;
  const excludedCount = (agent.excludedLeadIds || []).length;
  const matchCount = matchingLeadCount + matchingCompanyCount - excludedCount;
  const pendingCount = ((agentActions || []) as AgentAction[]).filter(
    (a) => a.industry === agent.industry && a.status === "pending"
  ).length;
  const operatorLeadCount = leads.filter((l: any) => normalizeIndustry(l.industry) === industryLc && l.operatorInControl).length;
  const handleBulkTakeCharge = () => {
    if (operatorLeadCount === 0) {
      const ok = window.confirm(
        `Take charge of all ${matchingLeadCount} ${agent.industry} leads?\n\nThe AI will stop drafting follow-ups and replies for them and only notify you. Any unsent AI drafts for these leads are withdrawn. You can hand any lead (or all of them) back at any time.`
      );
      if (!ok) return;
      const r = setAgentOperatorControl(agent.id, true);
      setInstantNotice({
        tone: "ok",
        text: r.changed === 0 ? "No leads to take over." : `You're in charge of ${r.changed} lead${r.changed === 1 ? "" : "s"}.${r.withdrawn ? ` ${r.withdrawn} unsent draft${r.withdrawn === 1 ? "" : "s"} withdrawn.` : ""}`,
      });
    } else {
      const r = setAgentOperatorControl(agent.id, false);
      setInstantNotice({ tone: "ok", text: `Handed ${r.changed} lead${r.changed === 1 ? "" : "s"} back to the agent.` });
    }
  };

  const monitoringState: "off" | "checking" | "browser" | "not_yet" = !agent.autoRunEnabled || !agent.isActive
    ? "off"
    : isAgentScanRunning
    ? "checking"
    : lastAgentScanAt
    ? "browser"
    : "not_yet";

  const handleTogglePause = () => {
    if (agent.isActive) {
      if (!confirm("Pause this Agent?\n\nPausing stops it from generating new automated actions. Anything already waiting in your approval queue stays there for you to review.")) {
        return;
      }
    }
    updateIndustryAgent(agent.id, { isActive: !agent.isActive });
  };

  const handleSendNow = async () => {
    if (instantBusy || pendingCount === 0) return;
    if (
      !confirm(
        `Send ${pendingCount} waiting email${pendingCount === 1 ? "" : "s"} now?\n\nThese go out immediately from your connected mailbox to real recipients. Each one is logged to its lead's timeline and appears in Sent Items.`
      )
    ) {
      return;
    }
    setInstantBusy("send");
    setInstantNotice(null);
    try {
      const r = await sendAgentDraftsNow(agent.id);
      if (r.failed === 0) {
        setInstantNotice({ tone: "ok", text: `Sent ${r.sent} email${r.sent === 1 ? "" : "s"}. Find ${r.sent === 1 ? "it" : "them"} in Sent Items.` });
      } else {
        setInstantNotice({
          tone: "warn",
          text: `Sent ${r.sent} of ${r.total}. ${r.failed} did not go out and ${r.failed === 1 ? "is" : "are"} still waiting in Agent Approvals with the reason noted.`,
        });
      }
    } finally {
      setInstantBusy(null);
    }
  };

  const handleCreateFollowUps = async () => {
    if (instantBusy || !agent.isActive) return;
    setInstantBusy("followup");
    setInstantNotice(null);
    try {
      const r = await draftAgentFollowUpsNow(agent.id);
      if (r.drafted === 0) {
        setInstantNotice({ tone: "warn", text: r.reason || "Nothing was drafted." });
      } else {
        setInstantNotice({
          tone: "ok",
          text: `Drafted ${r.drafted} follow-up${r.drafted === 1 ? "" : "s"} for your review in Agent Approvals.${r.remaining > 0 ? ` ${r.remaining} more lead${r.remaining === 1 ? "" : "s"} eligible -- click again to draft the next batch.` : ""}`,
        });
      }
    } finally {
      setInstantBusy(null);
    }
  };

  const handleRunNow = async () => {
    if (!agent.isActive || isAgentScanRunning || isRunningNow) return;
    setIsRunningNow(true);
    try {
      await runAgentScanNow(agent.id);
    } finally {
      setIsRunningNow(false);
    }
  };

  return (
    <div className="bg-[#181b21] rounded-2xl border border-[#2d323f] shadow-lg p-4 sm:p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelected}
            className="mt-1 w-3.5 h-3.5 rounded border-[#3d4455] accent-teal-500 shrink-0"
            title="Select agent"
          />
          <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-white truncate">{agent.industry}</h3>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                agent.isActive
                  ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                  : "bg-slate-500/15 text-slate-400 border-slate-500/30"
              }`}
            >
              {agent.isActive ? "Active" : "Paused"}
            </span>
            {monitoringState === "browser" && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-emerald-500/15 text-emerald-300 border-emerald-500/30" title={`Server checks once a day; last browser check ${timeAgo(lastAgentScanAt)}`}>
                Monitored
              </span>
            )}
            {monitoringState === "checking" && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                Checking now
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {matchCount} matching lead/compan{matchCount === 1 ? "y" : "ies"} in your CRM
            {excludedCount > 0 && ` (${excludedCount} excluded)`}
          </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleRunNow}
            disabled={!agent.isActive || isAgentScanRunning || isRunningNow}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#252a36] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-400"
            title={!agent.isActive ? "Activate this agent first" : isAgentScanRunning || isRunningNow ? "A scan is already running" : "Run Now -- check this agent's leads immediately"}
          >
            <Zap className={`w-3.5 h-3.5 ${isRunningNow ? "animate-pulse" : ""}`} />
          </button>
          <button onClick={handleTogglePause} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#252a36]" title={agent.isActive ? "Pause Agent" : "Resume Agent"}>
            {agent.isActive ? <PauseCircle className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
          </button>
          <button onClick={onEdit} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#252a36]" title="Edit">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete the "${agent.industry}" agent? This can't be undone.`)) deleteIndustryAgent(agent.id);
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-[#252a36]"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {linkedProduct && (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-500/10 border border-teal-500/30 text-teal-300 w-fit">
          <Package className="w-3 h-3" />
          {linkedProduct.name}
        </span>
      )}

      {agent.tone && <p className="text-xs text-slate-300 leading-relaxed">{agent.tone}</p>}

      {agent.talkingPoints.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {agent.talkingPoints.map((t) => (
            <span key={t} className="text-[10px] px-2 py-0.5 bg-[#252a36] border border-[#3d4455] text-slate-300 rounded-full">
              {t}
            </span>
          ))}
        </div>
      )}

      {(agent.agentNature || agent.personalityType) && (
        <div className="flex flex-wrap gap-1.5">
          {agent.agentNature && (
            <span
              className="text-[10px] px-2 py-0.5 bg-teal-500/10 border border-teal-500/30 text-teal-300 rounded-full font-semibold"
              title={AGENT_NATURE_DESCRIPTIONS[agent.agentNature]}
            >
              {agent.agentNature}
            </span>
          )}
          {agent.personalityType && (
            <span
              className="text-[10px] px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 rounded-full font-semibold"
              title={MBTI_INFO[agent.personalityType].description}
            >
              {agent.personalityType} -- {MBTI_INFO[agent.personalityType].nickname}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2 border-t border-[#2d323f] text-[11px] text-slate-400 flex-wrap">
        <span className="flex items-center gap-1">
          <ChannelIcon className="w-3.5 h-3.5 text-teal-400" />
          {agent.preferredChannel}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-3.5 h-3.5 text-teal-400" />
          Every {agent.followUpFrequencyDays}d &bull; {agent.followUpCount} follow-ups
        </span>
        {agent.lastScanAt && (
          <span className="flex items-center gap-1" title={new Date(agent.lastScanAt).toLocaleString()}>
            <Zap className="w-3.5 h-3.5 text-teal-400" />
            Last checked {timeAgo(agent.lastScanAt)}
          </span>
        )}
        {agent.autoRunEnabled && (
          <span className="flex items-center gap-1 text-emerald-300">
            <Bot className="w-3.5 h-3.5" />
            Monitoring on
          </span>
        )}
        {agent.maxDiscountPercent > 0 && (
          <span className="flex items-center gap-1 text-amber-300">
            <Percent className="w-3.5 h-3.5" />
            Up to {agent.maxDiscountPercent}% off
          </span>
        )}
      </div>

      <div className="pt-3 border-t border-[#2d323f] space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Instant controls</span>
          {(agent.nextEmailIncludePricing || agent.nextEmailExtraProblems) && (
            <span className="text-[10px] text-teal-300">Applies to the next emails this agent drafts</span>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleSendNow}
            disabled={!!instantBusy || pendingCount === 0}
            title={pendingCount === 0 ? "No drafts waiting for this agent -- use \"Create a follow-up email now\" first" : `Send the ${pendingCount} waiting draft${pendingCount === 1 ? "" : "s"} right now`}
            className="px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 bg-teal-600 hover:bg-teal-500 text-white disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-teal-600"
          >
            {instantBusy === "send" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {instantBusy === "send" ? "Sending..." : `Send email now${pendingCount > 0 ? ` (${pendingCount})` : ""}`}
          </button>
          <button
            type="button"
            onClick={handleCreateFollowUps}
            disabled={!!instantBusy || !agent.isActive}
            title={!agent.isActive ? "Activate this agent first" : "Draft a follow-up for this agent's leads right now, ignoring its normal schedule"}
            className="px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 bg-[#252a36] hover:bg-[#2f3544] text-slate-100 border border-[#3d4455] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#252a36]"
          >
            {instantBusy === "followup" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MailPlus className="w-3.5 h-3.5 text-teal-400" />}
            {instantBusy === "followup" ? "Drafting..." : "Create a follow-up email now"}
          </button>
          <button
            type="button"
            onClick={() => setAgentNextEmailDirective(agent.id, { includePricing: !agent.nextEmailIncludePricing })}
            aria-pressed={!!agent.nextEmailIncludePricing}
            title={
              agent.nextEmailIncludePricing
                ? "Armed -- click to cancel"
                : linkedProduct && Number(linkedProduct.price) > 0
                ? `Include ${linkedProduct.name}'s pricing in the next emails this agent drafts`
                : "No priced product is linked to this agent, so the email will offer a tailored quote instead of quoting figures"
            }
            className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 border transition-colors ${
              agent.nextEmailIncludePricing
                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-200"
                : "bg-[#252a36] hover:bg-[#2f3544] border-[#3d4455] text-slate-100"
            }`}
          >
            {agent.nextEmailIncludePricing ? <CheckCircle2 className="w-3.5 h-3.5" /> : <DollarSign className="w-3.5 h-3.5 text-teal-400" />}
            {agent.nextEmailIncludePricing ? "Pricing added to next email" : "Add pricing in the next email"}
          </button>
          <button
            type="button"
            onClick={() => setAgentNextEmailDirective(agent.id, { extraProblems: !agent.nextEmailExtraProblems })}
            aria-pressed={!!agent.nextEmailExtraProblems}
            title={agent.nextEmailExtraProblems ? "Armed -- click to cancel" : "Have the next emails raise extra problems businesses like this commonly face, and discuss them"}
            className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 border transition-colors text-left ${
              agent.nextEmailExtraProblems
                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-200"
                : "bg-[#252a36] hover:bg-[#2f3544] border-[#3d4455] text-slate-100"
            }`}
          >
            {agent.nextEmailExtraProblems ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <Lightbulb className="w-3.5 h-3.5 text-teal-400 shrink-0" />}
            <span className="leading-tight">
              {agent.nextEmailExtraProblems ? "More problems added to next email" : "Add more relevant problems and discuss them in the next email"}
            </span>
          </button>
        </div>
        <button
          type="button"
          onClick={handleBulkTakeCharge}
          disabled={matchingLeadCount === 0}
          title={operatorLeadCount > 0 ? "Hand every lead under this agent back to the AI" : "Stop the AI replying to every lead under this agent -- you'll only be notified"}
          className={`w-full px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            operatorLeadCount > 0
              ? "bg-amber-500/15 border-amber-500/40 text-amber-200 hover:bg-amber-500/25"
              : "bg-[#252a36] hover:bg-[#2f3544] border-[#3d4455] text-slate-100"
          }`}
        >
          <Hand className="w-3.5 h-3.5 text-amber-400" />
          {operatorLeadCount > 0
            ? `You're in charge of ${operatorLeadCount} lead${operatorLeadCount === 1 ? "" : "s"} -- hand back to AI`
            : "Take Charge of all leads (AI only notifies)"}
        </button>
        {instantNotice && (
          <div
            className={`px-3 py-2 rounded-lg text-[11px] border ${
              instantNotice.tone === "ok"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-200"
                : "bg-amber-500/10 border-amber-500/30 text-amber-200"
            }`}
          >
            {instantNotice.text}
          </div>
        )}
      </div>

      {pendingCount > 0 && (
        <button
          type="button"
          onClick={() => setActiveNav?.("Agent Approvals")}
          className="w-full flex items-center justify-between px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-200 hover:bg-amber-500/15"
        >
          <span className="font-semibold">{pendingCount} action{pendingCount === 1 ? "" : "s"} waiting for your approval</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};

// ----------------------------------------------------------------------------
// Sent Items -- every outbound email an Industry Agent has actually sent,
// browsable by Industry and by the specific Agent that sent it, laid out like
// a mail client: message list on the left, the full email on the right.
//
// Source of truth: AgentAction rows with status "approved". That status is
// deliberately load-bearing here (see approveAndSendAgentAction in
// CRMContext.tsx) -- it is only ever set after the live SMTP send actually
// succeeded, never on a simulated send or a failed one, so "approved" here
// means "this genuinely went out", not merely "a human clicked approve".
//
// An action's `industry` field is a free-text snapshot taken at draft time
// (matches whatever the lead's industry was then), so the agent that "owns"
// a historical sent item is looked up by normalized industry-name match
// against the CURRENT agent list, ignoring isActive/deleted state -- a
// paused or since-edited agent should still get credit for mail it sent
// while it was live. If no agent matches at all (deleted since, or the
// industry was renamed), the item is grouped under "Unmatched / Deleted Agent"
// rather than silently dropped.
// ----------------------------------------------------------------------------
// Small helpers for the inbox-style Sent Items view below.
const AVATAR_COLORS = [
  "bg-teal-500/20 text-teal-300 border-teal-500/30",
  "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  "bg-amber-500/20 text-amber-300 border-amber-500/30",
  "bg-rose-500/20 text-rose-300 border-rose-500/30",
  "bg-sky-500/20 text-sky-300 border-sky-500/30",
  "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30",
];

function avatarFor(seed: string): { initials: string; color: string } {
  const clean = (seed || "?").trim();
  const words = clean.replace(/<.*>/, "").split(/\s+/).filter(Boolean);
  const initials =
    words.length >= 2 ? (words[0][0] + words[1][0]).toUpperCase() : clean.slice(0, 2).toUpperCase() || "?";
  let hash = 0;
  for (let i = 0; i < clean.length; i++) hash = (hash * 31 + clean.charCodeAt(i)) >>> 0;
  return { initials, color: AVATAR_COLORS[hash % AVATAR_COLORS.length] };
}

// Mail-client style timestamp: time for today, "Yesterday", weekday within
// the last week, otherwise a short date (with the year once it's not this year).
function mailTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayDiff = Math.floor((startOfToday - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000);
  if (dayDiff <= 0) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], d.getFullYear() === now.getFullYear() ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}

function mailGroupLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Older";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayDiff = Math.floor((startOfToday - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000);
  if (dayDiff <= 0) return "Today";
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff < 7) return "Earlier this week";
  if (dayDiff < 31) return "Earlier this month";
  return "Older";
}

const SentItemsPanel: React.FC = () => {
  const { agentActions, industryAgents, setSelectedLeadId } = useCRM() as any;

  const [industryFilter, setIndustryFilter] = useState<string>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Below the lg breakpoint the list and the reading pane can't sit side by
  // side, so this decides which one is showing (like a phone mail app).
  const [mobileReading, setMobileReading] = useState(false);

  const agentForIndustry = React.useCallback(
    (industry: string): IndustryAgent | undefined => {
      const normalized = normalizeIndustry(industry);
      if (!normalized) return undefined;
      return (industryAgents as IndustryAgent[]).find((p) => normalizeIndustry(p.industry) === normalized);
    },
    [industryAgents]
  );

  const sent = React.useMemo(
    () =>
      ((agentActions || []) as AgentAction[])
        .filter((a) => a.status === "approved")
        .sort((a, b) => new Date(b.resolvedAt || b.createdAt).getTime() - new Date(a.resolvedAt || a.createdAt).getTime()),
    [agentActions]
  );

  const industries = React.useMemo(() => {
    const set = new Set<string>();
    sent.forEach((a) => a.industry && set.add(a.industry));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [sent]);

  const agentOptions = React.useMemo(() => {
    const byId = new Map<string, { id: string; label: string }>();
    let hasUnmatched = false;
    sent.forEach((a) => {
      const agent = agentForIndustry(a.industry);
      if (agent) byId.set(agent.id, { id: agent.id, label: `${agent.industry} Agent` });
      else hasUnmatched = true;
    });
    const list = Array.from(byId.values()).sort((a, b) => a.label.localeCompare(b.label));
    if (hasUnmatched) list.push({ id: "__unmatched__", label: "Unmatched / deleted agent" });
    return list;
  }, [sent, agentForIndustry]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return sent.filter((a) => {
      if (industryFilter !== "all" && normalizeIndustry(a.industry) !== normalizeIndustry(industryFilter)) return false;
      if (agentFilter !== "all") {
        const agent = agentForIndustry(a.industry);
        if (agentFilter === "__unmatched__") {
          if (agent) return false;
        } else if (!agent || agent.id !== agentFilter) {
          return false;
        }
      }
      if (q) {
        const haystack = `${a.subject} ${a.body} ${a.recipientEmail} ${a.recipientName} ${a.industry}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [sent, industryFilter, agentFilter, search, agentForIndustry]);

  // Per-agent counts double as one-click filters. Computed off the full sent
  // list (not `filtered`) so the strip stays a stable overview.
  const perAgentCounts = React.useMemo(() => {
    const counts = new Map<string, { id: string; label: string; count: number }>();
    sent.forEach((a) => {
      const agent = agentForIndustry(a.industry);
      const key = agent ? agent.id : "__unmatched__";
      const label = agent ? agent.industry : "Unmatched / deleted agent";
      const existing = counts.get(key);
      if (existing) existing.count += 1;
      else counts.set(key, { id: key, label, count: 1 });
    });
    return Array.from(counts.values()).sort((a, b) => b.count - a.count);
  }, [sent, agentForIndustry]);

  // Keep a valid message open on desktop: the first one until the user picks
  // another, and never one that has been filtered out.
  const selected = React.useMemo(
    () => filtered.find((a) => a.id === selectedId) || filtered[0] || null,
    [filtered, selectedId]
  );

  const grouped = React.useMemo(() => {
    const groups: { label: string; items: AgentAction[] }[] = [];
    filtered.forEach((a) => {
      const label = mailGroupLabel(a.resolvedAt || a.createdAt);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(a);
      else groups.push({ label, items: [a] });
    });
    return groups;
  }, [filtered]);

  if (sent.length === 0) {
    return (
      <div className="p-10 text-center bg-[#181b21] rounded-2xl border border-[#2d323f] text-slate-400 text-xs space-y-2">
        <InboxIcon className="w-8 h-8 text-slate-600 mx-auto" />
        <p className="text-slate-300 font-semibold text-sm">Nothing sent yet</p>
        <p>Approved follow-ups, replies, and negotiation offers show up here once they have actually gone out.</p>
      </div>
    );
  }

  const openMessage = (id: string) => {
    setSelectedId(id);
    setMobileReading(true);
  };

  const selectedAgent = selected ? agentForIndustry(selected.industry) : undefined;
  const selectedSentAt = selected ? selected.resolvedAt || selected.createdAt : "";
  const selectedAvatar = selected ? avatarFor(selected.recipientName || selected.recipientEmail) : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setAgentFilter("all")}
          className={`px-3 py-1.5 rounded-full border text-[11px] font-semibold flex items-center gap-1.5 transition-colors ${
            agentFilter === "all" ? "bg-teal-500/15 border-teal-500/40 text-teal-200" : "bg-[#181b21] border-[#2d323f] text-slate-400 hover:text-slate-200"
          }`}
        >
          All sent
          <span className="font-bold">{sent.length}</span>
        </button>
        {perAgentCounts.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setAgentFilter(agentFilter === c.id ? "all" : c.id)}
            className={`px-3 py-1.5 rounded-full border text-[11px] font-semibold flex items-center gap-1.5 transition-colors ${
              agentFilter === c.id ? "bg-teal-500/15 border-teal-500/40 text-teal-200" : "bg-[#181b21] border-[#2d323f] text-slate-400 hover:text-slate-200"
            }`}
          >
            {c.label}
            <span className="font-bold">{c.count}</span>
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-[#2d323f] bg-[#181b21] overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(300px,390px)_1fr] lg:h-[calc(100vh-330px)] lg:min-h-[480px]">
          {/* ---- Message list ---- */}
          <div className={`flex flex-col min-h-0 border-b lg:border-b-0 lg:border-r border-[#2d323f] ${mobileReading ? "hidden lg:flex" : "flex"}`}>
            <div className="p-2.5 border-b border-[#2d323f] space-y-2 bg-[#121418]">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search sent mail"
                  className="w-full pl-8 pr-3 py-2 bg-[#0f1115] border border-[#2d323f] rounded-lg text-xs text-slate-200 placeholder:text-slate-500"
                />
              </div>
              <select
                value={industryFilter}
                onChange={(e) => setIndustryFilter(e.target.value)}
                className="w-full px-3 py-1.5 bg-[#0f1115] border border-[#2d323f] rounded-lg text-xs text-slate-200"
              >
                <option value="all">All industries</option>
                {industries.map((ind) => (
                  <option key={ind} value={ind}>
                    {ind}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1 overflow-y-auto max-h-[70vh] lg:max-h-none">
              {filtered.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs space-y-2">
                  <Search className="w-7 h-7 text-slate-600 mx-auto" />
                  <p>No sent emails match this filter.</p>
                </div>
              ) : (
                grouped.map((group) => (
                  <div key={group.label}>
                    <div className="sticky top-0 z-10 px-3.5 py-1.5 bg-[#121418]/95 backdrop-blur text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-[#2d323f]">
                      {group.label}
                    </div>
                    {group.items.map((a) => {
                      const isSelected = selected?.id === a.id;
                      const av = avatarFor(a.recipientName || a.recipientEmail);
                      const snippet = (a.body || "").replace(/\s+/g, " ").trim().slice(0, 110);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => openMessage(a.id)}
                          className={`w-full text-left flex items-start gap-3 px-3.5 py-3 border-b border-[#2d323f]/70 border-l-2 transition-colors ${
                            isSelected ? "bg-[#252a36] border-l-teal-400" : "border-l-transparent hover:bg-[#1e222b]"
                          }`}
                        >
                          <div className={`w-9 h-9 rounded-full border flex items-center justify-center text-[11px] font-bold shrink-0 ${av.color}`}>
                            {av.initials}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-[13px] font-bold text-white truncate">{a.recipientName || a.recipientEmail}</span>
                              <span className="text-[10px] text-slate-500 shrink-0">{mailTime(a.resolvedAt || a.createdAt)}</span>
                            </div>
                            <div className="text-xs text-slate-200 truncate">{a.subject}</div>
                            <div className="text-[11px] text-slate-500 truncate">{snippet}</div>
                            <div className="flex items-center gap-1.5 mt-1.5">
                              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-teal-500/10 border border-teal-500/25 text-teal-300 truncate max-w-[140px]">
                                {a.industry || "Unknown industry"}
                              </span>
                              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-[#252a36] border border-[#3d4455] text-slate-400">
                                {actionTypeLabel[a.actionType]}
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ---- Reading pane ---- */}
          <div className={`flex flex-col min-h-0 ${mobileReading ? "flex" : "hidden lg:flex"}`}>
            {selected && selectedAvatar ? (
              <>
                <div className="p-4 sm:p-5 border-b border-[#2d323f] space-y-3">
                  <button
                    type="button"
                    onClick={() => setMobileReading(false)}
                    className="lg:hidden flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-white"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Back to sent mail
                  </button>
                  <h2 className="text-base sm:text-lg font-bold text-white leading-snug">{selected.subject}</h2>
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-full border flex items-center justify-center text-xs font-bold shrink-0 ${selectedAvatar.color}`}>
                      {selectedAvatar.initials}
                    </div>
                    <div className="min-w-0 flex-1 text-xs space-y-0.5">
                      <div className="text-slate-300">
                        <span className="text-slate-500">From </span>
                        <span className="font-semibold text-white">{selectedAgent ? `${selectedAgent.industry} Agent` : "Industry Agent"}</span>
                        {selected.resolvedBy && <span className="text-slate-500"> · approved by {selected.resolvedBy}</span>}
                      </div>
                      <div className="text-slate-300 break-words">
                        <span className="text-slate-500">To </span>
                        <span className="font-semibold text-white">{selected.recipientName || selected.recipientEmail}</span>
                        {selected.recipientName && <span className="text-slate-500">{` <${selected.recipientEmail}>`}</span>}
                      </div>
                      <div className="text-slate-500">{new Date(selectedSentAt).toLocaleString([], { dateStyle: "full", timeStyle: "short" })}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Delivered
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-teal-500/10 border border-teal-500/30 text-teal-300">
                      {selected.industry || "Unknown industry"}
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-[#252a36] border border-[#3d4455] text-slate-300 flex items-center gap-1">
                      {selected.actionType === "email_reply" ? <InboxIcon className="w-3 h-3" /> : <Mail className="w-3 h-3" />}
                      {actionTypeLabel[selected.actionType]}
                    </span>
                    {selected.actionType === "negotiation_offer" && selected.proposedDiscountPercent ? (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300">
                        {selected.proposedDiscountPercent}% offered
                      </span>
                    ) : null}
                    {selected.leadId && (
                      <button
                        onClick={() => setSelectedLeadId(selected.leadId)}
                        className="ml-auto text-indigo-300 hover:text-indigo-200 font-semibold text-xs flex items-center gap-1"
                      >
                        View Lead
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 max-h-[70vh] lg:max-h-none">
                  <div className="text-[13px] leading-relaxed text-slate-200 whitespace-pre-wrap break-words">{selected.body}</div>
                  {selected.reasoning && (
                    <div className="px-3.5 py-3 rounded-xl bg-[#121418] border border-[#2d323f] text-[11px] text-slate-400 leading-relaxed">
                      <span className="font-bold text-slate-300">Why the agent sent this: </span>
                      {selected.reasoning}
                    </div>
                  )}
                  {selected.triggerSnippet && (
                    <div className="px-3.5 py-3 rounded-xl bg-[#121418] border border-[#2d323f] text-[11px] text-slate-400 leading-relaxed">
                      <span className="font-bold text-slate-300">They had written: </span>
                      {selected.triggerSnippet}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center p-10 text-center text-slate-500 text-xs">
                <div className="space-y-2">
                  <Mail className="w-8 h-8 text-slate-600 mx-auto" />
                  <p>Select a message to read it.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const IndustryAgentsView: React.FC = () => {
  const { industryAgents, bulkSetIndustryAgentActive, bulkDeleteIndustryAgents, runAgentScanNow, isAgentScanRunning } = useCRM() as any;
  const [isFormOpen, setFormOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<IndustryAgent | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isCheckingAll, setIsCheckingAll] = useState(false);
  const [activeSection, setActiveSection] = useState<"agents" | "sent">("agents");

  const activeAgentCount = industryAgents.filter((a: IndustryAgent) => a.isActive).length;
  const handleCheckAllNow = async () => {
    if (isAgentScanRunning || isCheckingAll || activeAgentCount === 0) return;
    setIsCheckingAll(true);
    try {
      await runAgentScanNow();
    } finally {
      setIsCheckingAll(false);
    }
  };

  // No search/filter in this view -- industryAgents itself is "the list
  // currently visible", so that's what select-all/staleness track.
  const visibleIds = React.useMemo(() => new Set(industryAgents.map((a: IndustryAgent) => a.id)), [industryAgents]);

  React.useEffect(() => {
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (visibleIds.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [visibleIds]);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = industryAgents.length > 0 && industryAgents.every((a: IndustryAgent) => selectedIds.has(a.id));
  const toggleSelectAll = () => setSelectedIds(allSelected ? new Set() : new Set(industryAgents.map((a: IndustryAgent) => a.id)));
  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkActivate = (isActive: boolean) => {
    if (selectedIds.size === 0) return;
    if (!isActive) {
      // Same confirm wording as the single-item pause action, pluralized.
      if (
        !confirm(
          `Pause ${selectedIds.size} selected Agent${selectedIds.size === 1 ? "" : "s"}?\n\nPausing stops them from generating new automated actions. Anything already waiting in your approval queue stays there for you to review.`
        )
      ) {
        return;
      }
    }
    bulkSetIndustryAgentActive(Array.from(selectedIds), isActive);
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} selected agent${selectedIds.size === 1 ? "" : "s"}? This can't be undone.`)) return;
    bulkDeleteIndustryAgents(Array.from(selectedIds));
    clearSelection();
  };

  return (
    <div id="industry-agents-view" className="space-y-5 animate-in fade-in duration-200 text-slate-100">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <BookMarked className="w-5 h-5 text-teal-400" />
            Industry Agents
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure how AI manages leads and contacts per industry -- email tone &amp; talking points, qualification
            guidance, and follow-up cadence &amp; channel. Applies automatically wherever a lead/contact/company's
            Industry field matches.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {activeSection === "agents" && industryAgents.length > 0 && (
            <button
              onClick={handleCheckAllNow}
              disabled={isAgentScanRunning || isCheckingAll || activeAgentCount === 0}
              title={activeAgentCount === 0 ? "No active agents to check" : "Run every active agent's scan right now"}
              className="px-3.5 py-2 bg-[#181b21] border border-[#2d323f] hover:bg-[#252a36] disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 rounded-lg text-xs font-bold flex items-center gap-1.5"
            >
              <Zap className={`w-3.5 h-3.5 ${isCheckingAll ? "animate-pulse" : ""}`} />
              Check All Agents Now
            </button>
          )}
          {activeSection === "agents" && (
            <button
              onClick={() => {
                setEditingAgent(null);
                setFormOpen(true);
              }}
              className="px-3.5 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              New Agent
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-[#2d323f]">
        <button
          onClick={() => setActiveSection("agents")}
          className={`px-3.5 py-2 text-xs font-bold flex items-center gap-1.5 border-b-2 -mb-px transition-colors ${
            activeSection === "agents"
              ? "border-teal-400 text-white"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <BookMarked className="w-3.5 h-3.5" />
          Agents
        </button>
        <button
          onClick={() => setActiveSection("sent")}
          className={`px-3.5 py-2 text-xs font-bold flex items-center gap-1.5 border-b-2 -mb-px transition-colors ${
            activeSection === "sent"
              ? "border-teal-400 text-white"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <InboxIcon className="w-3.5 h-3.5" />
          Sent Items
        </button>
      </div>

      {activeSection === "sent" ? (
        <SentItemsPanel />
      ) : (
        <>
          <AgentsIntroBanner />

          {industryAgents.length > 0 && (
            <label className="flex items-center gap-1.5 text-[11px] text-slate-400 px-1 cursor-pointer w-fit">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                className="w-3.5 h-3.5 rounded border-[#3d4455] accent-teal-500"
              />
              Select all {industryAgents.length}
            </label>
          )}

          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 bg-[#181b21] border border-[#2d323f] rounded-xl px-4 py-2.5">
              <span className="text-xs font-bold text-white">{selectedIds.size} selected</span>
              <button
                onClick={() => handleBulkActivate(true)}
                className="px-3 py-1.5 bg-[#252a36] hover:bg-[#2f3544] text-slate-300 hover:text-emerald-300 border border-[#3d4455] rounded-lg text-xs font-semibold flex items-center gap-1.5"
              >
                <Power className="w-3.5 h-3.5" />
                Activate
              </button>
              <button
                onClick={() => handleBulkActivate(false)}
                className="px-3 py-1.5 bg-[#252a36] hover:bg-[#2f3544] text-slate-300 hover:text-white border border-[#3d4455] rounded-lg text-xs font-semibold flex items-center gap-1.5"
              >
                <PauseCircle className="w-3.5 h-3.5" />
                Pause
              </button>
              <button
                onClick={handleBulkDelete}
                className="px-3 py-1.5 bg-[#252a36] hover:bg-rose-950/40 text-slate-300 hover:text-rose-300 border border-[#3d4455] hover:border-rose-500/40 rounded-lg text-xs font-semibold flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
              <button
                onClick={clearSelection}
                className="ml-auto px-3 py-1.5 bg-[#252a36] hover:bg-[#2f3544] text-slate-300 hover:text-white border border-[#3d4455] rounded-lg text-xs font-semibold flex items-center gap-1.5"
              >
                <X className="w-3.5 h-3.5" />
                Clear
              </button>
            </div>
          )}

          {industryAgents.length === 0 ? (
            <div className="p-10 text-center bg-[#181b21] rounded-2xl border border-[#2d323f] text-slate-400 text-xs space-y-2">
              <BookMarked className="w-8 h-8 text-slate-600 mx-auto" />
              <p>
                No industry agents yet. Create one for any industry you sell into -- AarPex will use it to tailor email
                copy, qualification, and follow-up automatically.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {industryAgents.map((p) => (
                <AgentCard
                  key={p.id}
                  agent={p}
                  selected={selectedIds.has(p.id)}
                  onToggleSelected={() => toggleSelected(p.id)}
                  onEdit={() => {
                    setEditingAgent(p);
                    setFormOpen(true);
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {isFormOpen && (
        <AgentFormModal
          editing={editingAgent}
          onClose={() => {
            setFormOpen(false);
            setEditingAgent(null);
          }}
        />
      )}
    </div>
  );
};
