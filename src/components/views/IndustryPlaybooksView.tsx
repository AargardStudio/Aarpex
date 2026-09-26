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
} from "lucide-react";
import { IndustryPlaybook, PreferredOutreachChannel } from "../../types";
import { INDUSTRIES } from "../../data/industries";

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
  tone: "",
  talkingPoints: [],
  painPoints: [],
  objectionNotes: "",
  qualificationGuidance: "",
  preferredChannel: "Email",
  followUpFrequencyDays: 7,
  followUpCount: 2,
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
  const { addIndustryPlaybook, updateIndustryPlaybook, industryPlaybooks } = useCRM();
  const [draft, setDraft] = useState<Omit<IndustryPlaybook, "id" | "createdAt" | "updatedAt" | "createdBy">>(
    editing
      ? {
          industry: editing.industry,
          isActive: editing.isActive,
          tone: editing.tone,
          talkingPoints: editing.talkingPoints,
          painPoints: editing.painPoints,
          objectionNotes: editing.objectionNotes || "",
          qualificationGuidance: editing.qualificationGuidance || "",
          preferredChannel: editing.preferredChannel,
          followUpFrequencyDays: editing.followUpFrequencyDays,
          followUpCount: editing.followUpCount,
        }
      : emptyDraft()
  );
  const [isSaving, setIsSaving] = useState(false);

  const duplicateIndustry =
    !editing &&
    industryPlaybooks.some((p) => p.industry.trim().toLowerCase() === draft.industry.trim().toLowerCase());

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
                value={csv(draft.talkingPoints)}
                onChange={(e) => setDraft((p) => ({ ...p, talkingPoints: fromCsv(e.target.value) }))}
                placeholder="ROI within 90 days, compliance-ready, dedicated onboarding"
                className="w-full px-3 py-2 bg-[#181b21] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Common pain points (comma-separated)</label>
              <input
                type="text"
                value={csv(draft.painPoints)}
                onChange={(e) => setDraft((p) => ({ ...p, painPoints: fromCsv(e.target.value) }))}
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
  const { deleteIndustryPlaybook, leads, rawCompanies } = useCRM() as any;
  const ChannelIcon = channelIcon(playbook.preferredChannel);
  const matchCount =
    leads.filter((l: any) => (l.industry || "").trim().toLowerCase() === playbook.industry.trim().toLowerCase()).length +
    (rawCompanies || []).filter(
      (c: any) => (c.industry || "").trim().toLowerCase() === playbook.industry.trim().toLowerCase()
    ).length;

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

      <div className="flex items-center gap-3 pt-2 border-t border-[#2d323f] text-[11px] text-slate-400">
        <span className="flex items-center gap-1">
          <ChannelIcon className="w-3.5 h-3.5 text-teal-400" />
          {playbook.preferredChannel}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-3.5 h-3.5 text-teal-400" />
          Every {playbook.followUpFrequencyDays}d &bull; {playbook.followUpCount} follow-ups
        </span>
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
