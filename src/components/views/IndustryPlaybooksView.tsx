import React, { useState } from "react";
import { useCRM } from "../../context/CRMContext";
import {
  BookMarked,
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
} from "lucide-react";
import { IndustryPlaybook, PreferredOutreachChannel, AgentAction } from "../../types";
import { INDUSTRIES } from "../../data/industries";
import { normalizeIndustry, summarizeIndustryUsage, findCloseIndustryMatches, IndustryUsage } from "../../lib/industryMatch";

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

const emptyDraft = (): Omit<IndustryPlaybook, "id" | "createdAt" | "updatedAt" | "createdBy"> => ({
  industry: INDUSTRIES[0],
  isActive: true,
  productId: undefined,
  excludedLeadIds: [],
  excludedCompanyIds: [],
  tone: "",
  talkingPoints: [],
  painPoints: [],
  objectionNotes: "",
  qualificationGuidance: "",
  preferredChannel: "Email",
  followUpFrequencyDays: 7,
  followUpCount: 2,
  autoRunEnabled: false,
  maxDiscountPercent: 0,
  negotiationGuidance: "",
});

// ----------------------------------------------------------------------------
// First-time explanation banner -- item 22 of the UX redesign spec: a
// lightweight, dismissible explanation of the whole model (match -> AI
// prepares -> you approve -> AarPex sends), shown once before a user has
// ever needed to open Instructions to understand what a Playbook is.
// ----------------------------------------------------------------------------
const PLAYBOOKS_INTRO_KEY = "aarpex_playbooks_intro_dismissed";

const PlaybooksIntroBanner: React.FC = () => {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(PLAYBOOKS_INTRO_KEY) === "1";
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
        A Playbook continuously finds businesses in a matching industry, prepares personalized outreach for them, and
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
            localStorage.setItem(PLAYBOOKS_INTRO_KEY, "1");
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
// Create / Edit modal -- one playbook per industry. Every field here is
// plain guidance text/lists fed straight into the AI prompts for email
// generation, lead qualification, and follow-up scheduling -- there's no
// hidden scoring formula, so what's written here is exactly what the AI
// sees.
// ----------------------------------------------------------------------------
const PlaybookFormModal: React.FC<{ editing: IndustryPlaybook | null; onClose: () => void }> = ({
  editing,
  onClose,
}) => {
  const {
    addIndustryPlaybook,
    updateIndustryPlaybook,
    industryPlaybooks,
    products,
    leads,
    rawCompanies,
    agentActions,
    lastAgentScanAt,
    isAgentScanRunning,
    activeTenant,
    setActiveNav,
  } = useCRM() as any;
  const [draft, setDraft] = useState<Omit<IndustryPlaybook, "id" | "createdAt" | "updatedAt" | "createdBy">>(
    editing
      ? {
          industry: editing.industry,
          isActive: editing.isActive,
          productId: editing.productId,
          excludedLeadIds: editing.excludedLeadIds || [],
          excludedCompanyIds: editing.excludedCompanyIds || [],
          tone: editing.tone,
          talkingPoints: editing.talkingPoints,
          painPoints: editing.painPoints,
          objectionNotes: editing.objectionNotes || "",
          qualificationGuidance: editing.qualificationGuidance || "",
          preferredChannel: editing.preferredChannel,
          followUpFrequencyDays: editing.followUpFrequencyDays,
          followUpCount: editing.followUpCount,
          autoRunEnabled: editing.autoRunEnabled,
          maxDiscountPercent: editing.maxDiscountPercent,
          negotiationGuidance: editing.negotiationGuidance || "",
        }
      : emptyDraft()
  );
  const [isSaving, setIsSaving] = useState(false);
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
    industryPlaybooks.some((p) => normalizeIndustry(p.industry) === normalizeIndustry(draft.industry));

  // "Matching Businesses" -- every playbook already applies to every
  // Lead/Company whose Industry field matches this one, automatically and
  // invisibly. This surfaces exactly who that is right now (live, as the
  // Industry field above is edited) and lets specific businesses be opted
  // back out via a checkbox, without touching their Industry field.
  const industryLc = normalizeIndustry(draft.industry);
  const matchingLeads = industryLc ? (leads || []).filter((l: any) => normalizeIndustry(l.industry) === industryLc) : [];
  const matchingCompanies = industryLc ? (rawCompanies || []).filter((c: any) => normalizeIndustry(c.industry) === industryLc) : [];
  const excludedLeadIds = draft.excludedLeadIds || [];
  const excludedCompanyIds = draft.excludedCompanyIds || [];
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
  const toggleExcludedLead = (id: string) => {
    setDraft((p) => {
      const cur = p.excludedLeadIds || [];
      return { ...p, excludedLeadIds: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] };
    });
  };
  const toggleExcludedCompany = (id: string) => {
    setDraft((p) => {
      const cur = p.excludedCompanyIds || [];
      return { ...p, excludedCompanyIds: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] };
    });
  };

  const matchSearchLc = matchSearch.trim().toLowerCase();
  const visibleLeads =
    matchFilter === "companies"
      ? []
      : matchingLeads.filter((l: any) => !matchSearchLc || (l.name || "").toLowerCase().includes(matchSearchLc) || (l.company || "").toLowerCase().includes(matchSearchLc));
  const visibleCompanies =
    matchFilter === "leads"
      ? []
      : matchingCompanies.filter((c: any) => !matchSearchLc || (c.name || "").toLowerCase().includes(matchSearchLc));

  // Editing an existing, already-saved Playbook and changing the Industry
  // text changes WHO this Playbook applies to -- surfaced as an explicit
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

  // This Playbook's own slice of the shared Agent Approvals queue --
  // AgentAction has no direct playbookId, but every action the scan creates
  // for a playbook is stamped with that exact playbook.industry string (see
  // runAgentScan in CRMContext.tsx), so an exact-string filter is reliable
  // here (not normalizeIndustry -- we want THIS playbook's own actions, not
  // every playbook that happens to normalize the same).
  const ownActions: AgentAction[] = editing
    ? (agentActions || []).filter((a: AgentAction) => a.industry === editing.industry)
    : [];
  const pendingActions = ownActions.filter((a) => a.status === "pending");
  const recentActivity = [...ownActions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5);

  const hasWebmail = ((activeTenant?.webmailConfigs || []) as any[]).length > 0;

  // Monitoring status -- deliberately never claims continuous monitoring.
  // This app has no server-side scheduler; the scan only runs while this
  // browser tab is open (see runAgentScan in CRMContext.tsx), so the
  // honest states are: off, off-because-playbook-paused, checking right
  // now, or "browser monitoring" with a last-checked time -- never a plain
  // green "always on".
  const monitoringState: "off" | "checking" | "browser" | "not_yet" = !draft.autoRunEnabled || !draft.isActive
    ? "off"
    : isAgentScanRunning
    ? "checking"
    : lastAgentScanAt
    ? "browser"
    : "not_yet";

  const handleTogglePlaybookActive = () => {
    if (draft.isActive) {
      if (!confirm("Pause this Playbook?\n\nPausing stops it from generating new automated actions. Anything already waiting in your approval queue stays there for you to review.")) {
        return;
      }
    }
    setDraft((p) => ({ ...p, isActive: !p.isActive }));
  };

  const handleSave = () => {
    if (!draft.industry.trim() || duplicateIndustry) return;
    setIsSaving(true);
    try {
      if (editing) {
        updateIndustryPlaybook(editing.id, draft);
      } else {
        addIndustryPlaybook(draft);
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
            <h2 className="text-sm font-bold text-white">{editing ? "Edit Industry Playbook" : "New Industry Playbook"}</h2>
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
              <input
                type="text"
                list="playbook-industry-suggestions"
                value={draft.industry}
                onChange={(e) => setDraft((p) => ({ ...p, industry: e.target.value }))}
                placeholder="e.g. Healthcare & Wellness"
                className="w-full px-3 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
              />
              <datalist id="playbook-industry-suggestions">
                {INDUSTRIES.map((ind) => (
                  <option key={ind} value={ind} />
                ))}
              </datalist>
              {duplicateIndustry && (
                <p className="text-rose-400 mt-1">A playbook for this industry already exists -- edit that one instead.</p>
              )}
              <p className="text-slate-500 mt-1">
                Match this to the Industry field on your Leads/Companies exactly so it auto-applies.
              </p>
              {existingIndustryUsages.length > 0 && (
                <div className="mt-2">
                  <p className="text-slate-500 mb-1">
                    Or pick a value already used on your records (guaranteed to match exactly):
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {existingIndustryUsages.slice(0, 12).map((u) => {
                      const isCurrent = normalizeIndustry(u.raw) === industryLc;
                      return (
                        <button
                          key={u.raw}
                          type="button"
                          onClick={() => setDraft((p) => ({ ...p, industry: u.raw }))}
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
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Playbook</label>
              <button
                type="button"
                onClick={handleTogglePlaybookActive}
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
                <p className="text-slate-500 mt-1">This Playbook is not generating new actions.</p>
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
                  When set, this product's name and pitch are fed into every follow-up, reply, and offer this playbook's agent drafts.
                </p>
              </div>
            )}
          </div>

          {/* "Who will this Playbook reach?" -- item 4: the audience summary
              must be visible before anything is activated, not buried in a
              tooltip or the Instructions page. */}
          <div className="p-3.5 bg-[#121418] rounded-xl border border-[#2d323f] space-y-1.5">
            <div className="flex items-center gap-1.5 text-teal-300 font-bold">
              <Users className="w-3.5 h-3.5" />
              Who will this Playbook reach?
            </div>
            <p className="text-slate-300">
              This Playbook automatically works with every business whose industry matches{" "}
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
                Change which businesses this Playbook applies to?
              </div>
              <p>Changing the industry changes who this Playbook works with.</p>
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
              the Playbook itself so this is answerable without opening
              Instructions. */}
          <div className="p-3.5 bg-[#121418] rounded-xl border border-[#2d323f] space-y-2.5">
            <div className="flex items-center gap-1.5 text-teal-300 font-bold">
              <Bot className="w-3.5 h-3.5" />
              How this Playbook works
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
              <li>The AI prepares a personalized message using this Playbook's settings and linked Product.</li>
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
                This Playbook can still identify matching businesses and prepare proposed actions, but AarPex can't
                send anything you approve until a mailbox is connected in Settings.
              </div>
            </div>
          )}

          {/* Real-time status for an existing Playbook -- items 9, 11, 16.
              Only shown once a Playbook exists to have a history at all. */}
          {editing && (
            <div className="p-3.5 bg-[#121418] rounded-xl border border-[#2d323f] space-y-3">
              <div className="flex items-center gap-1.5 text-teal-300 font-bold">
                <Radio className="w-3.5 h-3.5" />
                Monitoring status
              </div>
              {monitoringState === "off" && (
                <div className="flex items-center gap-2 text-slate-500">
                  <span className="w-2 h-2 rounded-full bg-slate-600" />
                  Not monitoring -- {!draft.isActive ? "this Playbook is paused." : "automated monitoring is off below."}
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
                  <div className="flex items-center gap-2 text-amber-300">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    Browser monitoring -- last checked {timeAgo(lastAgentScanAt)}
                  </div>
                  <p className="text-slate-500">
                    AarPex checks this Playbook while this workspace is open in a browser tab. There's no
                    server-side scheduler yet, so it does not run in the background when no tab is open.
                  </p>
                </div>
              )}
              {monitoringState === "not_yet" && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-amber-300">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    Browser monitoring -- hasn't checked yet this session
                  </div>
                  <p className="text-slate-500">
                    The first check runs shortly after this workspace loads, then every ~10 minutes while a tab
                    stays open.
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
                  <p className="text-slate-500">No agent activity yet -- proposed actions and activity will show up here as this Playbook runs.</p>
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

          {/* Matching Businesses -- this playbook's agent works EVERY
              Lead/Company whose Industry matches the field above,
              automatically. This makes that otherwise-invisible audience
              visible and lets specific ones be opted out. */}
          <div className="p-3.5 bg-[#121418] rounded-xl border border-[#2d323f] space-y-3">
            <div className="flex items-center gap-1.5 text-teal-300 font-bold">
              <Users className="w-3.5 h-3.5" />
              Matching Businesses
            </div>
            <p className="text-slate-500">
              This playbook's agent automatically works every Lead and Company below, because their Industry field matches "{draft.industry || "..."}" above.
              Uncheck any you want to leave out -- this only affects this Playbook and never changes the business's own Industry field or removes it from AarPex.
            </p>

            {matchingLeads.length === 0 && matchingCompanies.length === 0 ? (
              <div className="p-3 bg-[#181b21] border border-[#2d323f] rounded-lg text-slate-500 space-y-2">
                <p>
                  No leads or companies currently have this industry -- nothing for this playbook to work yet. Set a
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
                              title={`Included because this Lead's Industry ("${l.industry}") matches this Playbook's Industry ("${draft.industry}").`}
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
                              title={`Included because this Company's Industry ("${c.industry}") matches this Playbook's Industry ("${draft.industry}").`}
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
                  <p className="text-slate-600">No businesses are excluded from this Playbook.</p>
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
                value={draft.negotiationGuidance}
                onChange={(e) => setDraft((p) => ({ ...p, negotiationGuidance: e.target.value }))}
                placeholder={`Any other negotiation guidance, e.g. "annual prepay only", "no discount below $500 deals"`}
                className="w-full px-3 py-2 bg-[#181b21] border border-[#2d323f] text-white rounded-lg resize-none focus:outline-none focus:border-teal-400"
              />
            </div>
          </div>

          {/* "Ready to activate" summary -- item 8, shown before a brand new
              Playbook is created so nothing about what's about to happen is
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
            {isSaving ? "Saving..." : editing ? "Save Changes" : "Activate Playbook"}
          </button>
        </div>
      </div>
    </div>
  );
};

const PlaybookCard: React.FC<{ playbook: IndustryPlaybook; onEdit: () => void }> = ({ playbook, onEdit }) => {
  const { deleteIndustryPlaybook, updateIndustryPlaybook, leads, rawCompanies, products, agentActions, lastAgentScanAt, isAgentScanRunning, setActiveNav } = useCRM() as any;
  const linkedProduct = playbook.productId ? products.find((p: any) => p.id === playbook.productId) : null;
  const ChannelIcon = channelIcon(playbook.preferredChannel);
  const industryLc = normalizeIndustry(playbook.industry);
  const matchingLeadCount = leads.filter((l: any) => normalizeIndustry(l.industry) === industryLc).length;
  const matchingCompanyCount = (rawCompanies || []).filter((c: any) => normalizeIndustry(c.industry) === industryLc).length;
  const excludedCount = (playbook.excludedLeadIds || []).length + (playbook.excludedCompanyIds || []).length;
  const matchCount = matchingLeadCount + matchingCompanyCount - excludedCount;
  const pendingCount = ((agentActions || []) as AgentAction[]).filter(
    (a) => a.industry === playbook.industry && a.status === "pending"
  ).length;

  const monitoringState: "off" | "checking" | "browser" | "not_yet" = !playbook.autoRunEnabled || !playbook.isActive
    ? "off"
    : isAgentScanRunning
    ? "checking"
    : lastAgentScanAt
    ? "browser"
    : "not_yet";

  const handleTogglePause = () => {
    if (playbook.isActive) {
      if (!confirm("Pause this Playbook?\n\nPausing stops it from generating new automated actions. Anything already waiting in your approval queue stays there for you to review.")) {
        return;
      }
    }
    updateIndustryPlaybook(playbook.id, { isActive: !playbook.isActive });
  };

  return (
    <div className="bg-[#181b21] rounded-2xl border border-[#2d323f] shadow-lg p-4 sm:p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-white truncate">{playbook.industry}</h3>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                playbook.isActive
                  ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                  : "bg-slate-500/15 text-slate-400 border-slate-500/30"
              }`}
            >
              {playbook.isActive ? "Active" : "Paused"}
            </span>
            {monitoringState === "browser" && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-amber-500/15 text-amber-300 border-amber-500/30" title={`Last checked ${timeAgo(lastAgentScanAt)}`}>
                Browser monitoring
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
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={handleTogglePause} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#252a36]" title={playbook.isActive ? "Pause Playbook" : "Resume Playbook"}>
            {playbook.isActive ? <PauseCircle className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
          </button>
          <button onClick={onEdit} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#252a36]" title="Edit">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete the "${playbook.industry}" playbook? This can't be undone.`)) deleteIndustryPlaybook(playbook.id);
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

      {playbook.tone && <p className="text-xs text-slate-300 leading-relaxed">{playbook.tone}</p>}

      {playbook.talkingPoints.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {playbook.talkingPoints.map((t) => (
            <span key={t} className="text-[10px] px-2 py-0.5 bg-[#252a36] border border-[#3d4455] text-slate-300 rounded-full">
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2 border-t border-[#2d323f] text-[11px] text-slate-400 flex-wrap">
        <span className="flex items-center gap-1">
          <ChannelIcon className="w-3.5 h-3.5 text-teal-400" />
          {playbook.preferredChannel}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-3.5 h-3.5 text-teal-400" />
          Every {playbook.followUpFrequencyDays}d &bull; {playbook.followUpCount} follow-ups
        </span>
        {playbook.autoRunEnabled && (
          <span className="flex items-center gap-1 text-emerald-300">
            <Bot className="w-3.5 h-3.5" />
            Monitoring on
          </span>
        )}
        {playbook.maxDiscountPercent > 0 && (
          <span className="flex items-center gap-1 text-amber-300">
            <Percent className="w-3.5 h-3.5" />
            Up to {playbook.maxDiscountPercent}% off
          </span>
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

export const IndustryPlaybooksView: React.FC = () => {
  const { industryPlaybooks } = useCRM();
  const [isFormOpen, setFormOpen] = useState(false);
  const [editingPlaybook, setEditingPlaybook] = useState<IndustryPlaybook | null>(null);

  return (
    <div id="industry-playbooks-view" className="space-y-5 animate-in fade-in duration-200 text-slate-100">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <BookMarked className="w-5 h-5 text-teal-400" />
            Industry Playbooks
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure how AI manages leads and contacts per industry -- email tone &amp; talking points, qualification
            guidance, and follow-up cadence &amp; channel. Applies automatically wherever a lead/contact/company's
            Industry field matches.
          </p>
        </div>
        <button
          onClick={() => {
            setEditingPlaybook(null);
            setFormOpen(true);
          }}
          className="px-3.5 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          New Playbook
        </button>
      </div>

      <PlaybooksIntroBanner />

      {industryPlaybooks.length === 0 ? (
        <div className="p-10 text-center bg-[#181b21] rounded-2xl border border-[#2d323f] text-slate-400 text-xs space-y-2">
          <BookMarked className="w-8 h-8 text-slate-600 mx-auto" />
          <p>
            No industry playbooks yet. Create one for any industry you sell into -- AarPex will use it to tailor email
            copy, qualification, and follow-up automatically.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {industryPlaybooks.map((p) => (
            <PlaybookCard
              key={p.id}
              playbook={p}
              onEdit={() => {
                setEditingPlaybook(p);
                setFormOpen(true);
              }}
            />
          ))}
        </div>
      )}

      {isFormOpen && (
        <PlaybookFormModal
          editing={editingPlaybook}
          onClose={() => {
            setFormOpen(false);
            setEditingPlaybook(null);
          }}
        />
      )}
    </div>
  );
};
