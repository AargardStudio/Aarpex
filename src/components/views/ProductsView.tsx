import React, { useMemo, useState } from "react";
import { useCRM } from "../../context/CRMContext";
import {
  Package,
  Plus,
  Sparkles,
  X,
  Trash2,
  Pencil,
  ChevronDown,
  Building2,
  UserCheck,
  Users,
  Tag,
  Target,
  Lightbulb,
  ShieldQuestion,
  DollarSign,
} from "lucide-react";
import { Product, ProductPricingModel, ProductType, ProductStatus, CustomerStatus } from "../../types";
import { computeProductMatches, hasAnyTargetCriteria } from "../../lib/productMatching";

const PRODUCT_TYPES: ProductType[] = [
  "Agency Retainer",
  "SaaS Subscription",
  "Tour Package",
  "B2B Product",
  "One-Time Service",
  "Other",
];

const PRICING_MODELS: ProductPricingModel[] = [
  "One-Time",
  "Monthly Recurring",
  "Annual Recurring",
  "Per-Project",
  "Custom Quote",
];

const PRODUCT_STATUSES: ProductStatus[] = ["Active", "Draft", "Archived"];

const COMPANY_STATUSES: CustomerStatus[] = [
  "Prospect",
  "Lead",
  "Qualified Prospect",
  "Active Customer",
  "High Value Customer",
  "At Risk",
  "Dormant",
  "Former Customer",
];

const PRICING_SUFFIX: Record<ProductPricingModel, string> = {
  "One-Time": "one-time",
  "Monthly Recurring": "/mo",
  "Annual Recurring": "/yr",
  "Per-Project": "/project",
  "Custom Quote": "custom",
};

const STATUS_COLORS: Record<ProductStatus, string> = {
  Active: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  Draft: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  Archived: "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

function csv(list: string[] | undefined): string {
  return (list || []).join(", ");
}

function fromCsv(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

const emptyDraft = (createdBy: string): Omit<Product, "id" | "createdAt"> => ({
  name: "",
  type: "Other",
  pricingModel: "Custom Quote",
  price: 0,
  currency: "USD",
  status: "Draft",
  description: "",
  pitch: "",
  tags: [],
  targetCriteria: {
    industries: [],
    companyStatuses: [],
    countries: [],
    tags: [],
    leadSources: [],
    idealCustomerNotes: "",
  },
  createdBy,
});

// ----------------------------------------------------------------------------
// Create / Edit modal -- the single form both the manual path and the
// AI-assisted path feed into. AI never saves on its own: it only prefills
// these same fields for the user to review and adjust before hitting Save.
// ----------------------------------------------------------------------------
const ProductFormModal: React.FC<{ editing: Product | null; onClose: () => void }> = ({ editing, onClose }) => {
  const { currentUser, addProduct, updateProduct, generateProductDraft } = useCRM();

  const [draft, setDraft] = useState<Omit<Product, "id" | "createdAt">>(
    editing
      ? {
          name: editing.name,
          type: editing.type,
          pricingModel: editing.pricingModel,
          price: editing.price,
          currency: editing.currency,
          status: editing.status,
          description: editing.description,
          pitch: editing.pitch,
          tags: editing.tags,
          targetCriteria: editing.targetCriteria,
          aiInsight: editing.aiInsight,
          createdBy: editing.createdBy,
        }
      : emptyDraft(currentUser?.name || "")
  );
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setIsGenerating(true);
    setGenError("");
    try {
      const generated = await generateProductDraft(aiPrompt.trim());
      setDraft((prev) => ({
        ...prev,
        ...generated,
        targetCriteria: { ...prev.targetCriteria, ...(generated.targetCriteria || {}) },
      }));
    } catch {
      setGenError("Couldn't reach the AI service -- fill in the fields manually below instead.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = () => {
    if (!draft.name.trim()) return;
    setIsSaving(true);
    try {
      if (editing) {
        updateProduct(editing.id, draft);
      } else {
        addProduct(draft);
      }
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const toggleCompanyStatus = (status: CustomerStatus) => {
    setDraft((prev) => {
      const has = prev.targetCriteria.companyStatuses.includes(status);
      return {
        ...prev,
        targetCriteria: {
          ...prev.targetCriteria,
          companyStatuses: has
            ? prev.targetCriteria.companyStatuses.filter((s) => s !== status)
            : [...prev.targetCriteria.companyStatuses, status],
        },
      };
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-[#181b21] border border-[#2d323f] rounded-2xl w-full max-w-2xl max-h-[90vh] shadow-2xl overflow-hidden text-xs text-slate-200 flex flex-col">
        <div className="px-6 py-4 border-b border-[#2d323f] flex items-center justify-between bg-[#121418]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/30 text-teal-400 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-bold text-white">{editing ? "Edit Product / Service" : "New Product / Service"}</h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-[#252a36] hover:bg-[#2f3544] text-slate-400 hover:text-white flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
          {/* AI-assisted setup */}
          {!editing && (
            <div className="p-3.5 bg-teal-950/20 border border-teal-800/40 rounded-xl space-y-2">
              <div className="flex items-center gap-1.5 text-teal-300 font-bold">
                <Sparkles className="w-3.5 h-3.5" />
                Set up with AI (optional)
              </div>
              <p className="text-slate-400">
                Describe it in plain language -- AarPex will draft the fields below, including who to sell it to. You can edit everything before saving.
              </p>
              <div className="flex gap-2">
                <textarea
                  rows={2}
                  placeholder='e.g. "A $2,500/month retainer where we run paid social ads for boutique fitness studios"'
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  className="flex-1 px-3 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400 resize-none"
                />
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating || !aiPrompt.trim()}
                  className="px-3.5 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded-lg font-bold flex items-center gap-1.5 shrink-0 self-start"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isGenerating ? "animate-spin" : ""}`} />
                  {isGenerating ? "Drafting..." : "Generate"}
                </button>
              </div>
              {genError && <p className="text-rose-400">{genError}</p>}
            </div>
          )}

          {/* Manual fields -- also where AI's draft lands for review */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-slate-300 font-semibold mb-1">Name *</label>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Growth Marketing Retainer"
                className="w-full px-3 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Type</label>
              <select
                value={draft.type}
                onChange={(e) => setDraft((p) => ({ ...p, type: e.target.value as ProductType }))}
                className="w-full px-3 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-lg"
              >
                {PRODUCT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Status</label>
              <select
                value={draft.status}
                onChange={(e) => setDraft((p) => ({ ...p, status: e.target.value as ProductStatus }))}
                className="w-full px-3 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-lg"
              >
                {PRODUCT_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Pricing Model</label>
              <select
                value={draft.pricingModel}
                onChange={(e) => setDraft((p) => ({ ...p, pricingModel: e.target.value as ProductPricingModel }))}
                className="w-full px-3 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-lg"
              >
                {PRICING_MODELS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Price ({draft.currency || "USD"})</label>
              <input
                type="number"
                min={0}
                value={draft.price}
                onChange={(e) => setDraft((p) => ({ ...p, price: Number(e.target.value) || 0 }))}
                className="w-full px-3 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-slate-300 font-semibold mb-1">Description</label>
              <textarea
                rows={2}
                value={draft.description}
                onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))}
                className="w-full px-3 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-lg resize-none focus:outline-none focus:border-teal-400"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-slate-300 font-semibold mb-1">Marketing Pitch</label>
              <textarea
                rows={2}
                value={draft.pitch}
                onChange={(e) => setDraft((p) => ({ ...p, pitch: e.target.value }))}
                placeholder="The punchy version -- what a rep pastes into an email or opens a call with."
                className="w-full px-3 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-lg resize-none focus:outline-none focus:border-teal-400"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-slate-300 font-semibold mb-1">Tags (comma-separated)</label>
              <input
                type="text"
                value={csv(draft.tags)}
                onChange={(e) => setDraft((p) => ({ ...p, tags: fromCsv(e.target.value) }))}
                className="w-full px-3 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
              />
            </div>
          </div>

          {/* Target audience */}
          <div className="p-3.5 bg-[#121418] rounded-xl border border-[#2d323f] space-y-3">
            <div className="flex items-center gap-1.5 text-teal-300 font-bold">
              <Target className="w-3.5 h-3.5" />
              Who should this be sold to?
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Industries (comma-separated)</label>
                <input
                  type="text"
                  value={csv(draft.targetCriteria.industries)}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, targetCriteria: { ...p.targetCriteria, industries: fromCsv(e.target.value) } }))
                  }
                  placeholder="e.g. Fitness, Retail, Healthcare"
                  className="w-full px-3 py-2 bg-[#181b21] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
                />
              </div>
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Countries (comma-separated)</label>
                <input
                  type="text"
                  value={csv(draft.targetCriteria.countries)}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, targetCriteria: { ...p.targetCriteria, countries: fromCsv(e.target.value) } }))
                  }
                  className="w-full px-3 py-2 bg-[#181b21] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
                />
              </div>
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Tags to match (comma-separated)</label>
                <input
                  type="text"
                  value={csv(draft.targetCriteria.tags)}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, targetCriteria: { ...p.targetCriteria, tags: fromCsv(e.target.value) } }))
                  }
                  className="w-full px-3 py-2 bg-[#181b21] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
                />
              </div>
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Lead sources (comma-separated)</label>
                <input
                  type="text"
                  value={csv(draft.targetCriteria.leadSources)}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, targetCriteria: { ...p.targetCriteria, leadSources: fromCsv(e.target.value) } }))
                  }
                  className="w-full px-3 py-2 bg-[#181b21] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1.5">Company status</label>
              <div className="flex flex-wrap gap-1.5">
                {COMPANY_STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleCompanyStatus(s)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                      draft.targetCriteria.companyStatuses.includes(s)
                        ? "bg-teal-600 border-teal-500 text-white"
                        : "bg-[#181b21] border-[#2d323f] text-slate-400 hover:text-white"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">Ideal customer notes</label>
              <textarea
                rows={2}
                value={draft.targetCriteria.idealCustomerNotes}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, targetCriteria: { ...p.targetCriteria, idealCustomerNotes: e.target.value } }))
                }
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
            disabled={isSaving || !draft.name.trim()}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded-lg font-bold"
          >
            {isSaving ? "Saving..." : editing ? "Save Changes" : "Create Product"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------------
// Product card -- collapsed summary + expandable detail (AI insight, target
// criteria, and a live list of matching companies/leads/contacts).
// ----------------------------------------------------------------------------
const ProductCard: React.FC<{ product: Product; onEdit: () => void }> = ({ product, onEdit }) => {
  const { companies, leads, contacts, deleteProduct, runProductAIInsight, setActiveNav, setSelectedCompanyId } = useCRM();
  const [expanded, setExpanded] = useState(false);
  const [isRunningInsight, setIsRunningInsight] = useState(false);

  const matches = useMemo(
    () => computeProductMatches(product, { companies, leads, contacts }),
    [product, companies, leads, contacts]
  );
  const targeted = hasAnyTargetCriteria(product);
  const totalMatches = matches.companies.length + matches.leads.length + matches.contacts.length;

  const handleRunInsight = async () => {
    setIsRunningInsight(true);
    try {
      await runProductAIInsight(product.id);
    } finally {
      setIsRunningInsight(false);
    }
  };

  return (
    <div className="bg-[#181b21] rounded-2xl border border-[#2d323f] shadow-lg overflow-hidden">
      <div className="p-4 sm:p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-white truncate">{product.name}</h3>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_COLORS[product.status]}`}>
                {product.status}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">{product.type}</div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={onEdit} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#252a36]" title="Edit">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                if (confirm(`Delete "${product.name}"? This can't be undone.`)) deleteProduct(product.id);
              }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-[#252a36]"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-teal-300 font-mono font-bold text-sm">
          <DollarSign className="w-3.5 h-3.5" />
          {product.price.toLocaleString()} {product.currency || "USD"}
          <span className="text-slate-500 font-normal text-[11px]">{PRICING_SUFFIX[product.pricingModel]}</span>
        </div>

        {product.description && <p className="text-xs text-slate-300 leading-relaxed">{product.description}</p>}

        {product.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {product.tags.map((t) => (
              <span key={t} className="text-[10px] px-2 py-0.5 bg-[#252a36] border border-[#3d4455] text-slate-300 rounded-full">
                #{t}
              </span>
            ))}
          </div>
        )}

        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-between pt-2 border-t border-[#2d323f] text-xs font-semibold text-teal-400 hover:text-teal-300"
        >
          <span className="flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5" />
            {targeted ? `${totalMatches} matching in your CRM` : "No targeting set -- matches everyone"}
          </span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-[#2d323f] bg-[#121418] p-4 sm:p-5 space-y-4 animate-in fade-in duration-150">
          {product.pitch && (
            <div className="p-3 bg-[#181b21] rounded-lg border border-[#2d323f]">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Marketing Pitch</div>
              <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">{product.pitch}</p>
            </div>
          )}

          {/* AI Insight */}
          <div className="p-3.5 bg-[#181b21] rounded-xl border border-[#2d323f] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-teal-300 font-bold text-xs">
                <Sparkles className="w-3.5 h-3.5" />
                AI Insight
              </span>
              <button
                onClick={handleRunInsight}
                disabled={isRunningInsight}
                className="text-[11px] text-teal-400 hover:text-teal-300 font-semibold flex items-center gap-1"
              >
                <Sparkles className={`w-3 h-3 ${isRunningInsight ? "animate-spin" : ""}`} />
                {isRunningInsight ? "Working..." : product.aiInsight ? "Regenerate" : "Generate"}
              </button>
            </div>
            {product.aiInsight ? (
              <div className="space-y-2.5">
                <p className="text-xs text-slate-300">{product.aiInsight.suggestedTargetSummary}</p>
                {product.aiInsight.pitchAngles.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
                      <Lightbulb className="w-3 h-3" /> Pitch Angles
                    </div>
                    <ul className="space-y-1">
                      {product.aiInsight.pitchAngles.map((a, i) => (
                        <li key={i} className="text-xs text-slate-300">&bull; {a}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {product.aiInsight.objectionHandling.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
                      <ShieldQuestion className="w-3 h-3" /> Objection Handling
                    </div>
                    <ul className="space-y-1">
                      {product.aiInsight.objectionHandling.map((a, i) => (
                        <li key={i} className="text-xs text-slate-300">&bull; {a}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500">No AI insight yet -- click Generate to get pitch angles and targeting suggestions.</p>
            )}
          </div>

          {/* Matches */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <button
              onClick={() => setActiveNav("Companies")}
              className="p-3 bg-[#181b21] rounded-xl border border-[#2d323f] hover:border-teal-500/40 text-left transition-colors"
            >
              <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-semibold">
                <Building2 className="w-3.5 h-3.5" /> Companies
              </div>
              <div className="text-lg font-extrabold text-white mt-0.5">{matches.companies.length}</div>
            </button>
            <button
              onClick={() => setActiveNav("Leads")}
              className="p-3 bg-[#181b21] rounded-xl border border-[#2d323f] hover:border-teal-500/40 text-left transition-colors"
            >
              <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-semibold">
                <UserCheck className="w-3.5 h-3.5" /> Leads
              </div>
              <div className="text-lg font-extrabold text-white mt-0.5">{matches.leads.length}</div>
            </button>
            <button
              onClick={() => setActiveNav("Contacts")}
              className="p-3 bg-[#181b21] rounded-xl border border-[#2d323f] hover:border-teal-500/40 text-left transition-colors"
            >
              <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-semibold">
                <Users className="w-3.5 h-3.5" /> Contacts
              </div>
              <div className="text-lg font-extrabold text-white mt-0.5">{matches.contacts.length}</div>
            </button>
          </div>

          {matches.companies.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {matches.companies.slice(0, 6).map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCompanyId(c.id)}
                  className="text-[11px] px-2.5 py-1 bg-[#181b21] border border-[#2d323f] hover:border-teal-500/40 text-slate-300 hover:text-white rounded-full transition-colors"
                >
                  {c.name}
                </button>
              ))}
              {matches.companies.length > 6 && (
                <span className="text-[11px] px-2.5 py-1 text-slate-500">+{matches.companies.length - 6} more</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const ProductsView: React.FC = () => {
  const { products } = useCRM();
  const [isFormOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [statusFilter, setStatusFilter] = useState<"All" | ProductStatus>("All");

  const filteredProducts = products.filter((p) => statusFilter === "All" || p.status === statusFilter);

  return (
    <div id="products-view" className="space-y-5 animate-in fade-in duration-200 text-slate-100">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-teal-400" />
            Products &amp; Services
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Agency retainers, SaaS subscriptions, tour packages, B2B products -- whatever you sell. Set up manually or let AI draft it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-2.5 py-2 bg-[#181b21] border border-[#2d323f] rounded-lg text-xs text-slate-300"
          >
            <option value="All">All Statuses</option>
            {PRODUCT_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button
            onClick={() => {
              setEditingProduct(null);
              setFormOpen(true);
            }}
            className="px-3.5 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            New Product / Service
          </button>
        </div>
      </div>

      {filteredProducts.length === 0 ? (
        <div className="p-10 text-center bg-[#181b21] rounded-2xl border border-[#2d323f] text-slate-400 text-xs space-y-2">
          <Package className="w-8 h-8 text-slate-600 mx-auto" />
          <p>
            {products.length === 0
              ? "No products or services yet. Describe one in plain language and let AI draft it, or add one manually."
              : "No products match this filter."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredProducts.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              onEdit={() => {
                setEditingProduct(p);
                setFormOpen(true);
              }}
            />
          ))}
        </div>
      )}

      {isFormOpen && (
        <ProductFormModal
          editing={editingProduct}
          onClose={() => {
            setFormOpen(false);
            setEditingProduct(null);
          }}
        />
      )}
    </div>
  );
};
