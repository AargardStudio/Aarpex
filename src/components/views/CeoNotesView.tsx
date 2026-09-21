import React, { useState } from "react";
import { useCRM } from "../../context/CRMContext";
import {
  BookOpen,
  Plus,
  Sparkles,
  X,
  Trash2,
  Pencil,
  CalendarDays,
  Rocket,
  Flag,
  TrendingUp,
  NotebookPen,
} from "lucide-react";
import { CeoNote, CeoNoteType } from "../../types";

const NOTE_TYPES: CeoNoteType[] = ["Note", "Activity", "Milestone", "Progress Update"];

const TYPE_META: Record<CeoNoteType, { icon: React.ElementType; color: string }> = {
  Note: { icon: NotebookPen, color: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
  Activity: { icon: CalendarDays, color: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  Milestone: { icon: Flag, color: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  "Progress Update": { icon: TrendingUp, color: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
};

function csv(list: string[] | undefined): string {
  return (list || []).join(", ");
}
function fromCsv(value: string): string[] {
  return value.split(",").map((v) => v.trim()).filter(Boolean);
}

const emptyDraft = (authorName: string): Omit<CeoNote, "id" | "createdAt"> => ({
  title: "",
  content: "",
  type: "Note",
  date: new Date().toISOString().split("T")[0],
  authorName,
  tags: [],
});

// ----------------------------------------------------------------------------
// Create / Edit modal -- write it yourself, or jot a rough note and let AI
// polish it into a proper entry. AI never saves on its own: it only fills
// the title/content fields for you to review and edit before saving.
// ----------------------------------------------------------------------------
const CeoNoteFormModal: React.FC<{ editing: CeoNote | null; onClose: () => void }> = ({ editing, onClose }) => {
  const { currentUser, addCeoNote, updateCeoNote, generateCeoNoteDraft } = useCRM();

  const [draft, setDraft] = useState<Omit<CeoNote, "id" | "createdAt">>(
    editing
      ? {
          title: editing.title,
          content: editing.content,
          type: editing.type,
          date: editing.date,
          authorName: editing.authorName,
          tags: editing.tags,
        }
      : emptyDraft(currentUser?.name || "")
  );
  const [roughNote, setRoughNote] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleGenerate = async () => {
    if (!roughNote.trim()) return;
    setIsGenerating(true);
    setGenError("");
    try {
      const generated = await generateCeoNoteDraft(roughNote.trim(), draft.type);
      setDraft((prev) => ({
        ...prev,
        title: generated.title || prev.title,
        content: generated.content || prev.content,
      }));
    } catch {
      setGenError("Couldn't reach the AI service -- write it directly in the fields below instead.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = () => {
    if (!draft.title.trim() || !draft.content.trim()) return;
    setIsSaving(true);
    try {
      if (editing) {
        updateCeoNote(editing.id, draft);
      } else {
        addCeoNote({ ...draft, authorName: draft.authorName || currentUser?.name || "" });
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
              <BookOpen className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-bold text-white">{editing ? "Edit Entry" : "New CEO Note"}</h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-[#252a36] hover:bg-[#2f3544] text-slate-400 hover:text-white flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
          {/* AI-assisted writing */}
          <div className="p-3.5 bg-teal-950/20 border border-teal-800/40 rounded-xl space-y-2">
            <div className="flex items-center gap-1.5 text-teal-300 font-bold">
              <Sparkles className="w-3.5 h-3.5" />
              Write with AI (optional)
            </div>
            <p className="text-slate-400">
              Jot down a rough note -- bullet points, a stream of thought, whatever -- and AarPex will turn it into a
              polished entry in your voice, ready to review below.
            </p>
            <div className="flex gap-2">
              <textarea
                rows={3}
                placeholder='e.g. "closed the YJCo deal today, took 3 months, team worked hard, feeling proud but exhausted"'
                value={roughNote}
                onChange={(e) => setRoughNote(e.target.value)}
                className="flex-1 px-3 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400 resize-none"
              />
              <button
                onClick={handleGenerate}
                disabled={isGenerating || !roughNote.trim()}
                className="px-3.5 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded-lg font-bold flex items-center gap-1.5 shrink-0 self-start"
              >
                <Sparkles className={`w-3.5 h-3.5 ${isGenerating ? "animate-spin" : ""}`} />
                {isGenerating ? "Writing..." : "Generate"}
              </button>
            </div>
            {genError && <p className="text-rose-400">{genError}</p>}
          </div>

          {/* Manual fields -- also where AI's draft lands for review */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-slate-300 font-semibold mb-1">Title *</label>
              <input
                type="text"
                value={draft.title}
                onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
                placeholder="e.g. The week we closed YJCo"
                className="w-full px-3 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Type</label>
              <select
                value={draft.type}
                onChange={(e) => setDraft((p) => ({ ...p, type: e.target.value as CeoNoteType }))}
                className="w-full px-3 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-lg"
              >
                {NOTE_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Date</label>
              <input
                type="date"
                value={draft.date}
                onChange={(e) => setDraft((p) => ({ ...p, date: e.target.value }))}
                className="w-full px-3 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-slate-300 font-semibold mb-1">Entry *</label>
              <textarea
                rows={8}
                value={draft.content}
                onChange={(e) => setDraft((p) => ({ ...p, content: e.target.value }))}
                placeholder="Write it in your own words -- this is your journal, shared with your team."
                className="w-full px-3 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-lg resize-none focus:outline-none focus:border-teal-400 leading-relaxed"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-slate-300 font-semibold mb-1">Tags (comma-separated)</label>
              <input
                type="text"
                value={csv(draft.tags)}
                onChange={(e) => setDraft((p) => ({ ...p, tags: fromCsv(e.target.value) }))}
                placeholder="e.g. team, wins, lessons-learned"
                className="w-full px-3 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
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
            disabled={isSaving || !draft.title.trim() || !draft.content.trim()}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded-lg font-bold"
          >
            {isSaving ? "Saving..." : editing ? "Save Changes" : "Publish Entry"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------------
// Timeline entry -- reads like a journal card, not a CRM record.
// ----------------------------------------------------------------------------
const CeoNoteCard: React.FC<{ note: CeoNote; onEdit: () => void }> = ({ note, onEdit }) => {
  const { deleteCeoNote } = useCRM();
  const meta = TYPE_META[note.type];
  const Icon = meta.icon;

  return (
    <div className="bg-[#181b21] rounded-2xl border border-[#2d323f] shadow-lg p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${meta.color}`}>
              <Icon className="w-3 h-3" />
              {note.type}
            </span>
            <span className="text-[11px] text-slate-500">
              {new Date(note.date).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
            </span>
          </div>
          <h3 className="text-sm font-bold text-white leading-snug">{note.title}</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">by {note.authorName}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onEdit} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#252a36]" title="Edit">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete "${note.title}"? This can't be undone.`)) deleteCeoNote(note.id);
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-[#252a36]"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{note.content}</p>

      {note.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {note.tags.map((t) => (
            <span key={t} className="text-[10px] px-2 py-0.5 bg-[#252a36] border border-[#3d4455] text-slate-300 rounded-full">
              #{t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export const CeoNotesView: React.FC = () => {
  const { ceoNotes } = useCRM();
  const [isFormOpen, setFormOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<CeoNote | null>(null);
  const [typeFilter, setTypeFilter] = useState<"All" | CeoNoteType>("All");

  const filteredNotes = ceoNotes
    .filter((n) => typeFilter === "All" || n.type === typeFilter)
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || "").localeCompare(a.createdAt || "")));

  return (
    <div id="ceo-notes-view" className="space-y-5 animate-in fade-in duration-200 text-slate-100">
      <div className="bg-gradient-to-r from-teal-950 via-slate-900 to-teal-950 p-6 rounded-2xl text-white border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-teal-400 font-bold text-xs">
            <Rocket className="w-4 h-4" />
            <span>CEO NOTES</span>
          </div>
          <h2 className="text-xl font-black mt-1">A running journal, for the team that builds this with you</h2>
          <p className="text-xs text-slate-300 max-w-xl mt-0.5">
            Reflections, activity, milestones, and honest progress updates -- your way of connecting with the people
            who work alongside you. Write it yourself, or hand AI a rough note to polish.
          </p>
        </div>
        <button
          onClick={() => {
            setEditingNote(null);
            setFormOpen(true);
          }}
          className="px-4 py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Entry</span>
        </button>
      </div>

      <div className="flex items-center gap-2">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as any)}
          className="px-2.5 py-2 bg-[#181b21] border border-[#2d323f] rounded-lg text-xs text-slate-300"
        >
          <option value="All">All Entries</option>
          {NOTE_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {filteredNotes.length === 0 ? (
        <div className="p-10 text-center bg-[#181b21] rounded-2xl border border-[#2d323f] text-slate-400 text-xs space-y-2">
          <BookOpen className="w-8 h-8 text-slate-600 mx-auto" />
          <p>
            {ceoNotes.length === 0
              ? "No entries yet. Write your first note -- what today felt like, what you're building, what's next."
              : "No entries match this filter."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredNotes.map((n) => (
            <CeoNoteCard
              key={n.id}
              note={n}
              onEdit={() => {
                setEditingNote(n);
                setFormOpen(true);
              }}
            />
          ))}
        </div>
      )}

      {isFormOpen && (
        <CeoNoteFormModal
          editing={editingNote}
          onClose={() => {
            setFormOpen(false);
            setEditingNote(null);
          }}
        />
      )}
    </div>
  );
};
