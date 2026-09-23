import React, { useState } from "react";
import { useCRM } from "../../context/CRMContext";
import { KnowledgeBaseCategory, KnowledgeBaseEntry } from "../../types";
import {
  BookOpen,
  Building2,
  Package,
  ShieldCheck,
  Plus,
  Search,
  Pencil,
  Trash2,
  X,
  Sparkles,
} from "lucide-react";

const CATEGORY_META: Record<
  KnowledgeBaseCategory,
  { label: string; description: string; icon: React.ElementType; accent: string }
> = {
  company: {
    label: "Company Knowledge Base",
    description: "Who you are: mission, differentiators, tone of voice, policies -- grounds the AI when it talks about your business.",
    icon: Building2,
    accent: "indigo",
  },
  product: {
    label: "Product & Service Knowledge Base",
    description: "What you sell: positioning, pricing rationale, FAQs -- grounds the AI when it writes or answers about your offerings.",
    icon: Package,
    accent: "emerald",
  },
  operator: {
    label: "Dashboard Operator Knowledge Base",
    description: "Internal playbook for your own team: SOPs, scripts, objection handling. Never shown to prospects or customers.",
    icon: ShieldCheck,
    accent: "amber",
  },
};

const ACCENT_CLASSES: Record<string, { badge: string; icon: string; button: string }> = {
  indigo: {
    badge: "bg-indigo-50 text-indigo-700 border-indigo-200",
    icon: "bg-indigo-100 text-indigo-600",
    button: "bg-indigo-600 hover:bg-indigo-500",
  },
  emerald: {
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    icon: "bg-emerald-100 text-emerald-600",
    button: "bg-emerald-600 hover:bg-emerald-500",
  },
  amber: {
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    icon: "bg-amber-100 text-amber-600",
    button: "bg-amber-600 hover:bg-amber-500",
  },
};

const EntryEditorModal: React.FC<{
  isOpen: boolean;
  category: KnowledgeBaseCategory;
  entry: KnowledgeBaseEntry | null;
  onClose: () => void;
}> = ({ isOpen, category, entry, onClose }) => {
  const { addKnowledgeBaseEntry, updateKnowledgeBaseEntry } = useCRM();
  const [title, setTitle] = useState(entry?.title || "");
  const [content, setContent] = useState(entry?.content || "");
  const [tagsInput, setTagsInput] = useState((entry?.tags || []).join(", "));
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setTitle(entry?.title || "");
      setContent(entry?.content || "");
      setTagsInput((entry?.tags || []).join(", "));
      setError(null);
    }
  }, [isOpen, entry]);

  if (!isOpen) return null;

  const meta = CATEGORY_META[category];
  const accent = ACCENT_CLASSES[meta.accent];

  const handleSave = () => {
    if (!title.trim()) {
      setError("Give this entry a title.");
      return;
    }
    if (!content.trim()) {
      setError("Entry content can't be empty.");
      return;
    }
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    if (entry) {
      updateKnowledgeBaseEntry(entry.id, { title: title.trim(), content: content.trim(), tags });
    } else {
      addKnowledgeBaseEntry({ category, title: title.trim(), content: content.trim(), tags });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden text-xs text-slate-700">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accent.icon}`}>
              <meta.icon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                {entry ? "Edit Entry" : "New Entry"}
              </h2>
              <p className="text-[11px] text-slate-500">{meta.label}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3.5 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-medium">
              {error}
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-600 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Our Refund Policy, Elevator Pitch, Objection: Too Expensive"
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400"
              autoFocus
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-600 mb-1">Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={10}
              placeholder="Write this out in plain language -- the AI assistant reads this directly when answering related questions."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400 resize-y font-sans"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-600 mb-1">Tags (optional, comma-separated)</label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="pricing, onboarding, objections"
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400"
            />
          </div>
        </div>

        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className={`px-3.5 py-1.5 rounded-lg text-white font-semibold shadow-sm ${accent.button}`}
          >
            {entry ? "Save Changes" : "Add Entry"}
          </button>
        </div>
      </div>
    </div>
  );
};

export const KnowledgeBaseView: React.FC = () => {
  const { knowledgeBase, deleteKnowledgeBaseEntry } = useCRM();
  const [activeCategory, setActiveCategory] = useState<KnowledgeBaseCategory>("company");
  const [searchTerm, setSearchTerm] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<KnowledgeBaseEntry | null>(null);

  const categoryEntries = knowledgeBase.filter((e) => e.category === activeCategory);
  const filteredEntries = categoryEntries.filter((e) => {
    const term = searchTerm.toLowerCase();
    return (
      e.title.toLowerCase().includes(term) ||
      e.content.toLowerCase().includes(term) ||
      e.tags.some((t) => t.toLowerCase().includes(term))
    );
  });

  const openNewEntry = () => {
    setEditingEntry(null);
    setEditorOpen(true);
  };

  const openEditEntry = (entry: KnowledgeBaseEntry) => {
    setEditingEntry(entry);
    setEditorOpen(true);
  };

  const meta = CATEGORY_META[activeCategory];
  const accent = ACCENT_CLASSES[meta.accent];

  return (
    <div id="knowledge-base-view" className="space-y-5 animate-in fade-in duration-200">
      {/* Header */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
          <BookOpen className="w-4.5 h-4.5" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
            Knowledge Base
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
          </h1>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Reference material that grounds the floating AI assistant's answers -- the more you write here, the more accurate and on-brand its answers are.
          </p>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {(Object.keys(CATEGORY_META) as KnowledgeBaseCategory[]).map((cat) => {
          const catMeta = CATEGORY_META[cat];
          const catAccent = ACCENT_CLASSES[catMeta.accent];
          const count = knowledgeBase.filter((e) => e.category === cat).length;
          const isActive = activeCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`text-left bg-white p-4 rounded-xl border shadow-2xs transition-all ${
                isActive ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${catAccent.icon}`}>
                  <catMeta.icon className="w-4 h-4" />
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${catAccent.badge}`}>
                  {count} {count === 1 ? "entry" : "entries"}
                </span>
              </div>
              <div className="text-xs font-bold text-slate-900">{catMeta.label}</div>
              <div className="text-[11px] text-slate-400 mt-1 leading-relaxed">{catMeta.description}</div>
            </button>
          );
        })}
      </div>

      {/* Control Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        <div className="relative w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={`Search ${meta.label.toLowerCase()}...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs"
          />
        </div>

        <button
          onClick={openNewEntry}
          className={`px-3.5 py-1.5 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm self-end sm:self-auto ${accent.button}`}
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Entry</span>
        </button>
      </div>

      {/* Entries */}
      {filteredEntries.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-10 text-center">
          <div className={`w-10 h-10 rounded-full mx-auto mb-3 flex items-center justify-center ${accent.icon}`}>
            <meta.icon className="w-5 h-5" />
          </div>
          <p className="text-xs font-semibold text-slate-700">
            {categoryEntries.length === 0 ? `No entries in ${meta.label} yet` : "No entries match your search"}
          </p>
          <p className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto">
            {categoryEntries.length === 0
              ? "Add your first entry and the AI assistant will start using it to ground its answers."
              : "Try a different search term, or clear the search to see all entries."}
          </p>
          {categoryEntries.length === 0 && (
            <button
              onClick={openNewEntry}
              className={`mt-4 px-3.5 py-1.5 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm ${accent.button}`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Entry</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredEntries.map((entry) => (
            <div
              key={entry.id}
              className="bg-white rounded-xl border border-slate-200 shadow-2xs p-4 flex flex-col hover:border-slate-300 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-xs font-bold text-slate-900 leading-snug">{entry.title}</h3>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openEditEntry(entry)}
                    className="w-6.5 h-6.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors"
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`Delete "${entry.title}"? This can't be undone.`)) {
                        deleteKnowledgeBaseEntry(entry.id);
                      }
                    }}
                    className="w-6.5 h-6.5 rounded-md hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 mt-2 leading-relaxed line-clamp-4 whitespace-pre-wrap">
                {entry.content}
              </p>

              {entry.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {entry.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="text-[10px] text-slate-400 mt-3 pt-3 border-t border-slate-100">
                Updated {new Date(entry.updatedAt).toLocaleDateString()}
                {entry.createdBy ? ` by ${entry.createdBy}` : ""}
              </div>
            </div>
          ))}
        </div>
      )}

      <EntryEditorModal
        isOpen={editorOpen}
        category={activeCategory}
        entry={editingEntry}
        onClose={() => setEditorOpen(false)}
      />
    </div>
  );
};
