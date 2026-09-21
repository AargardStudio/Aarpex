import React, { useState } from "react";
import {
  BookOpen,
  CalendarDays,
  Rocket,
  Flag,
  TrendingUp,
  NotebookPen,
} from "lucide-react";
import { CeoNote, CeoNoteType } from "../../types";
import { CEO_NOTES } from "../../data/ceoNotes";

const NOTE_TYPES: CeoNoteType[] = ["Note", "Activity", "Milestone", "Progress Update"];

const TYPE_META: Record<CeoNoteType, { icon: React.ElementType; color: string }> = {
  Note: { icon: NotebookPen, color: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
  Activity: { icon: CalendarDays, color: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  Milestone: { icon: Flag, color: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  "Progress Update": { icon: TrendingUp, color: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
};

// ----------------------------------------------------------------------------
// Timeline entry -- reads like a journal card, not a CRM record. Read-only:
// this is Aargard's broadcast feed, not something any user (including the
// CEO's own account in the app) can create, edit, or delete.
// ----------------------------------------------------------------------------
const CeoNoteCard: React.FC<{ note: CeoNote }> = ({ note }) => {
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
  const [typeFilter, setTypeFilter] = useState<"All" | CeoNoteType>("All");

  const filteredNotes = CEO_NOTES
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
          <h2 className="text-xl font-black mt-1">A running journal, straight from Aargard's CEO</h2>
          <p className="text-xs text-slate-300 max-w-xl mt-0.5">
            Reflections, activity, milestones, and honest progress updates, shared with every AarPex user. Published
            directly by Aargard -- not editable in-app.
          </p>
        </div>
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
            {CEO_NOTES.length === 0
              ? "No entries yet -- check back soon."
              : "No entries match this filter."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredNotes.map((n) => (
            <CeoNoteCard key={n.id} note={n} />
          ))}
        </div>
      )}
    </div>
  );
};
