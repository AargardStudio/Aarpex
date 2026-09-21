import React, { useState } from "react";
import { useCRM } from "../../context/CRMContext";
import { BookOpen, Plus, ChevronRight, NotebookPen, CalendarDays, Flag, TrendingUp } from "lucide-react";
import { CeoNote, CeoNoteType } from "../../types";
import { CeoNoteFormModal } from "../views/CeoNotesView";

// Maroon / burgundy / teal / black -- deliberately its own palette, distinct
// from the rest of the (teal/graphite) dashboard, so this reads as the
// CEO's own personal corner rather than another CRM widget.
const TYPE_META: Record<CeoNoteType, { icon: React.ElementType; className: string }> = {
  Note: { icon: NotebookPen, className: "bg-black/40 text-slate-300 border-[#4a1420]" },
  Activity: { icon: CalendarDays, className: "bg-teal-950/50 text-teal-300 border-teal-800/50" },
  Milestone: { icon: Flag, className: "bg-[#5c1a2e]/50 text-rose-200 border-[#7c1d3a]" },
  "Progress Update": { icon: TrendingUp, className: "bg-[#3a0d14]/60 text-red-200 border-[#5c1a1a]" },
};

// Compact "next to What's New" dashboard box -- shows the latest couple of
// entries and lets the CEO jump straight into writing one. The full
// timeline (browse/edit/delete everything) lives on the CEO Notes page,
// reached here via "View all" -- there's deliberately no sidebar link to it
// anymore, this box is the entry point.
export const CeoNotesWidget: React.FC = () => {
  const { ceoNotes, setActiveNav } = useCRM();
  const [isFormOpen, setFormOpen] = useState(false);

  const recentNotes = ceoNotes
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || "").localeCompare(a.createdAt || "")))
    .slice(0, 2);

  return (
    <div className="relative bg-gradient-to-br from-[#1a0a10] via-[#120a0d] to-black rounded-2xl p-4 sm:p-5 border border-[#5c1a2e]/50 shadow-lg text-white space-y-3.5 overflow-hidden">
      {/* subtle teal accent glow, kept faint so maroon/black still leads */}
      <div className="pointer-events-none absolute -top-10 -right-10 w-32 h-32 rounded-full bg-teal-500/10 blur-3xl" />

      <div className="flex items-center justify-between gap-2 relative">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-7 h-7 rounded-lg bg-[#5c1a2e]/60 border border-[#7c1d3a] flex items-center justify-center shrink-0">
            <BookOpen className="w-3.5 h-3.5 text-teal-300" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white leading-tight">CEO Notes</h3>
            <p className="text-[10px] text-rose-200/70 leading-tight">A running journal, for the team</p>
          </div>
        </div>
        <button
          onClick={() => setFormOpen(true)}
          className="shrink-0 w-7 h-7 rounded-lg bg-teal-600/90 hover:bg-teal-500 text-white flex items-center justify-center shadow-sm"
          title="New entry"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {recentNotes.length === 0 ? (
        <div className="p-3.5 bg-black/30 rounded-xl border border-[#4a1420] text-center">
          <p className="text-[11px] text-slate-400">
            No entries yet -- write your first note, or hand AI a rough thought to polish.
          </p>
        </div>
      ) : (
        <div className="space-y-2 relative">
          {recentNotes.map((note: CeoNote) => {
            const meta = TYPE_META[note.type];
            const Icon = meta.icon;
            return (
              <button
                key={note.id}
                onClick={() => setActiveNav("CEO Notes")}
                className="w-full text-left p-3 bg-black/30 hover:bg-black/45 rounded-xl border border-[#3a0d14] hover:border-[#7c1d3a] transition-colors"
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border flex items-center gap-1 ${meta.className}`}>
                    <Icon className="w-2.5 h-2.5" />
                    {note.type}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {new Date(note.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                </div>
                <div className="text-xs font-bold text-white leading-snug truncate">{note.title}</div>
                <p className="text-[11px] text-slate-400 leading-snug mt-0.5 line-clamp-2">{note.content}</p>
              </button>
            );
          })}
        </div>
      )}

      <button
        onClick={() => setActiveNav("CEO Notes")}
        className="w-full flex items-center justify-center gap-1 text-[11px] font-semibold text-teal-300 hover:text-teal-200 pt-1"
      >
        View all entries
        <ChevronRight className="w-3 h-3" />
      </button>

      {isFormOpen && <CeoNoteFormModal editing={null} onClose={() => setFormOpen(false)} />}
    </div>
  );
};
