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
} from "lucide-react";
import { IndustryPlaybook, PreferredOutreachChannel } from "../../types";
import { INDUSTRIES } from "../../data/industries";
import { normalizeIndustry } from "../../lib/industryMatch";

function csv(list: string[] | undefined): string {
  return (list || []).join(", ");
}

function fromCsv(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

const CHANNELS: PreferredOutreachChannel[] = ["Email", "WhatsApp", "Call", "Mixed"];

const channelIcon = (channel: PreferredOutreachChannel) => {
  if (channel === "WhatsApp") return MessagesSquare;
  if (channel === "Call") return Phone;
  if (channel === "Mixed") return Target;
  return Mail;
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
  const { addIndustryPlaybook, updateIndustryPlaybook, industryPlaybooks, products, leads, rawCompanies } = useCRM() as any;
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
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Status</label>
              <button
                type="button"
                onClick={() => setDraft((p) => ({ ...p, isActive: !p.isActive }))}
                className={`w-full px-3 py-2 rounded-lg border font-bold flex items-center justify-center gap-1.5 transition-colors ${
                  draft.isActive
                    ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300"
                    : "bg-[#121418] border-[#2d323f] text-slate-500"
                }`}
              >
                <Power className="w-3.5 h-3.5" />
                {draft.isActive ? "Active" : "Inactive"}
              </button>
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
              Uncheck any you want to leave out. To add a business that isn't listed here, open it and set its Industry to match.
            </p>

            {matchingLeads.length === 0 && matchingCompanies.length === 0 ? (
              <div className="p-3 bg-[#181b21] border border-[#2d323f] rounded-lg text-slate-500">
                No leads or companies currently have this industry -- nothing for this playbook to work yet. Set a
                lead's or company's Industry field to "{draft.industry || "this industry"}" from its profile to include it.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {matchingLeads.length > 0 && (
                  <div>
                    <div className="text-slate-400 font-semibold mb-1">
                      Leads ({(matchingLeads.length - (draft.excludedLeadIds || []).length)}/{matchingLeads.length} included)
                    </div>
                    <div className="max-h-40 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                      {matchingLeads.map((l: any) => {
                        const included = !(draft.excludedLeadIds || []).includes(l.id);
                        return (
                          <label
                            key={l.id}
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
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
                {matchingCompanies.length > 0 && (
                  <div>
                    <div className="text-slate-400 font-semibold mb-1">
                      Companies ({(matchingCompanies.length - (draft.excludedCompanyIds || []).length)}/{matchingCompanies.length} included)
                    </div>
                    <div className="max-h-40 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                      {matchingCompanies.map((c: any) => {
                        const included = !(draft.excludedCompanyIds || []).includes(c.id);
                        return (
                          <label
                            key={c.id}
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
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
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
                Autonomous Agent
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
                {draft.autoRunEnabled ? "Auto-run: On" : "Auto-run: Off"}
              </button>
            </div>
            <p className="text-slate-500">
              When on, AarPex periodically scans this industry's leads/contacts (while the app is open) for due
              follow-ups and inbox replies, and drafts proposed actions into Agent Approvals for you to review --
              nothing is ever sent without your approval.
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
            {isSaving ? "Saving..." : editing ? "Save Changes" : "Create Playbook"}
          </button>
        </div>
      </div>
    </div>
  );
};

const PlaybookCard: React.FC<{ playbook: IndustryPlaybook; onEdit: () => void }> = ({ playbook, onEdit }) => {
  const { deleteIndustryPlaybook, leads, rawCompanies, products } = useCRM() as any;
  const linkedProduct = playbook.productId ? products.find((p: any) => p.id === playbook.productId) : null;
  const ChannelIcon = channelIcon(playbook.preferredChannel);
  const industryLc = normalizeIndustry(playbook.industry);
  const matchingLeadCount = leads.filter((l: any) => normalizeIndustry(l.industry) === industryLc).length;
  const matchingCompanyCount = (rawCompanies || []).filter((c: any) => normalizeIndustry(c.industry) === industryLc).length;
  const excludedCount = (playbook.excludedLeadIds || []).length + (playbook.excludedCompanyIds || []).length;
  const matchCount = matchingLeadCount + matchingCompanyCount - excludedCount;

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
              {playbook.isActive ? "Active" : "Inactive"}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {matchCount} matching lead/compan{matchCount === 1 ? "y" : "ies"} in your CRM
            {excludedCount > 0 && ` (${excludedCount} excluded)`}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
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
            Auto-run on
          </span>
        )}
        {playbook.maxDiscountPercent > 0 && (
          <span className="flex items-center gap-1 text-amber-300">
            <Percent className="w-3.5 h-3.5" />
            Up to {playbook.maxDiscountPercent}% off
          </span>
        )}
      </div>
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
