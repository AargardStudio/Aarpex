import React, { useEffect, useState } from "react";
import { X, Check, Plus, Trash2 } from "lucide-react";
import { useCRM } from "../../context/CRMContext";
import { sanitizeIndustryText } from "../../lib/industryMatch";
import { INDUSTRIES, CLIENT_CATEGORIES } from "../../data/industries";
import type { Lead, LeadStatus, SocialLink, TaskPriority } from "../../types";

// Full "Edit details" form for a lead, opened from the Overview and 360°
// Profile tabs (the header pencil still opens the compact edit form). Edits
// are held in a local draft and committed in ONE updateLead call on Save;
// Cancel / Escape discards them.
//
// "Converted" is deliberately not selectable here: converting a lead creates a
// deal (see convertLead in CRMContext), so a converted lead's status is shown
// read-only and nobody can mark a lead Converted without a deal behind it.
const STATUSES: LeadStatus[] = ["New", "Contacted", "Engaged", "Qualified", "Proposal", "Negotiation", "Nurture", "Lost"];
const PRIORITIES: TaskPriority[] = ["Low", "Medium", "High", "Urgent"];

const dateOnly = (v?: string) => (v ? String(v).slice(0, 10) : "");

const Field: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({ label, children, className }) => (
  <label className={`block text-[11px] font-medium text-slate-500 ${className || ""}`}>
    {label}
    <div className="mt-1">{children}</div>
  </label>
);
const inputCls =
  "w-full px-2.5 py-2 sm:py-1.5 border border-slate-300 rounded-lg text-sm sm:text-xs text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-400";

export const LeadDetailsEditor: React.FC<{ lead: Lead; onClose: () => void }> = ({ lead, onClose }) => {
  const { updateLead, users } = useCRM() as any;
  const [d, setD] = useState(() => ({
    name: lead.name || "",
    company: lead.company || "",
    jobTitle: lead.jobTitle || "",
    email: lead.email || "",
    phone: lead.phone || "",
    whatsapp: lead.whatsapp || "",
    website: lead.website || "",
    industry: lead.industry || "",
    clientCategory: lead.clientCategory || "",
    country: lead.country || "",
    city: lead.city || "",
    source: lead.source || "",
    salesperson: lead.salesperson || "",
    status: lead.status as LeadStatus,
    priority: lead.priority as TaskPriority,
    estimatedValue: lead.estimatedValue || 0,
    expectedCloseDate: dateOnly(lead.expectedCloseDate),
    nextFollowUp: dateOnly(lead.nextFollowUp),
    notes: lead.notes || "",
    tags: lead.tags || [],
    socialLinks: (lead.socialLinks || []) as SocialLink[],
  }));
  const [tagText, setTagText] = useState("");
  const set = (patch: Partial<typeof d>) => setD((p) => ({ ...p, ...patch }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const emailInvalid = d.email.trim() !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim());
  const nameMissing = !d.name.trim();
  const canSave = !emailInvalid && !nameMissing;
  const isConverted = lead.status === "Converted";

  const addTag = () => {
    const t = tagText.trim().replace(/^#/, "");
    if (t && !d.tags.includes(t)) set({ tags: [...d.tags, t] });
    setTagText("");
  };

  const handleSave = () => {
    if (!canSave) return;
    const updates: Partial<Lead> = {
      name: d.name.trim(),
      company: d.company.trim(),
      jobTitle: d.jobTitle.trim(),
      email: d.email.trim(),
      phone: d.phone.trim(),
      whatsapp: d.whatsapp.trim(),
      website: d.website.trim(),
      clientCategory: d.clientCategory.trim(),
      country: d.country.trim(),
      city: d.city.trim(),
      source: d.source.trim(),
      salesperson: d.salesperson.trim(),
      priority: d.priority,
      estimatedValue: Number(d.estimatedValue) || 0,
      expectedCloseDate: d.expectedCloseDate,
      nextFollowUp: d.nextFollowUp,
      notes: d.notes,
      tags: d.tags,
      socialLinks: d.socialLinks.filter((s) => s.url.trim()),
    };
    if (d.industry.trim()) updates.industry = sanitizeIndustryText(d.industry);
    if (!isConverted) updates.status = d.status;
    // A changed website means any earlier ABIC audit described the wrong site;
    // clearing the stamp lets the next scan (or a manual run) audit the new one.
    if ((d.website.trim() || "") !== (lead.website || "").trim()) {
      updates.abicAuditedAt = undefined;
    }
    updateLead(lead.id, updates);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Edit lead details" className="bg-white w-full sm:max-w-3xl max-h-[92dvh] flex flex-col rounded-t-2xl sm:rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900">Edit details</h2>
            <p className="text-[11px] text-slate-500 truncate">{lead.name}{lead.company ? ` · ${lead.company}` : ""}</p>
          </div>
          <button onClick={onClose} className="p-2 -mr-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-5">
          <section className="space-y-3">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Contact</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Name *">
                <input className={`${inputCls} ${nameMissing ? "border-rose-400" : ""}`} value={d.name} onChange={(e) => set({ name: e.target.value })} />
              </Field>
              <Field label="Company">
                <input className={inputCls} value={d.company} onChange={(e) => set({ company: e.target.value })} />
              </Field>
              <Field label="Job title">
                <input className={inputCls} value={d.jobTitle} onChange={(e) => set({ jobTitle: e.target.value })} />
              </Field>
              <Field label="Email">
                <input type="email" inputMode="email" className={`${inputCls} ${emailInvalid ? "border-rose-400" : ""}`} value={d.email} onChange={(e) => set({ email: e.target.value })} />
                {emailInvalid && <span className="text-[10.5px] text-rose-500">That doesn't look like an email address.</span>}
              </Field>
              <Field label="Phone">
                <input type="tel" className={inputCls} value={d.phone} onChange={(e) => set({ phone: e.target.value })} />
              </Field>
              <Field label="WhatsApp">
                <input type="tel" className={inputCls} value={d.whatsapp} onChange={(e) => set({ whatsapp: e.target.value })} />
              </Field>
              <Field label="Website">
                <input type="url" className={inputCls} value={d.website} onChange={(e) => set({ website: e.target.value })} placeholder="example.com" />
              </Field>
              <Field label="Country">
                <input className={inputCls} value={d.country} onChange={(e) => set({ country: e.target.value })} />
              </Field>
              <Field label="City">
                <input className={inputCls} value={d.city} onChange={(e) => set({ city: e.target.value })} />
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Business</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Industry (matches an Industry Agent)">
                <input list="lde-industries" className={inputCls} value={d.industry} onChange={(e) => set({ industry: e.target.value })} />
                <datalist id="lde-industries">{INDUSTRIES.map((i) => <option key={i} value={i} />)}</datalist>
              </Field>
              <Field label="Client category">
                <input list="lde-categories" className={inputCls} value={d.clientCategory} onChange={(e) => set({ clientCategory: e.target.value })} />
                <datalist id="lde-categories">{CLIENT_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
              </Field>
              <Field label="Source">
                <input className={inputCls} value={d.source} onChange={(e) => set({ source: e.target.value })} />
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Pipeline</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Status">
                {isConverted ? (
                  <div className="px-2.5 py-2 sm:py-1.5 border border-slate-200 bg-slate-50 rounded-lg text-sm sm:text-xs text-slate-500">Converted (set by the deal)</div>
                ) : (
                  <select className={inputCls} value={d.status} onChange={(e) => set({ status: e.target.value as LeadStatus })}>
                    {STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                )}
              </Field>
              <Field label="Priority">
                <select className={inputCls} value={d.priority} onChange={(e) => set({ priority: e.target.value as TaskPriority })}>
                  {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="Salesperson">
                <input list="lde-users" className={inputCls} value={d.salesperson} onChange={(e) => set({ salesperson: e.target.value })} />
                <datalist id="lde-users">{((users || []) as any[]).map((u) => <option key={u.id || u.name} value={u.name} />)}</datalist>
              </Field>
              <Field label="Estimated value">
                <input type="number" min={0} inputMode="decimal" className={inputCls} value={d.estimatedValue} onChange={(e) => set({ estimatedValue: Number(e.target.value) })} />
              </Field>
              <Field label="Expected close date">
                <input type="date" className={inputCls} value={d.expectedCloseDate} onChange={(e) => set({ expectedCloseDate: e.target.value })} />
              </Field>
              <Field label="Next follow-up">
                <input type="date" className={inputCls} value={d.nextFollowUp} onChange={(e) => set({ nextFollowUp: e.target.value })} />
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Notes, tags and links</h3>
            <Field label="Notes">
              <textarea rows={3} className={inputCls} value={d.notes} onChange={(e) => set({ notes: e.target.value })} />
            </Field>
            <div>
              <span className="text-[11px] font-medium text-slate-500 block mb-1">Tags</span>
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {d.tags.map((t) => (
                  <span key={t} className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-600 rounded-md text-[11px] flex items-center gap-1">
                    #{t}
                    <button type="button" onClick={() => set({ tags: d.tags.filter((x) => x !== t) })} className="text-slate-400 hover:text-rose-500" aria-label={`Remove ${t}`}>
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-1.5">
                <input className={inputCls} placeholder="Add a tag" value={tagText} onChange={(e) => setTagText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())} />
                <button type="button" onClick={addTag} className="px-3 bg-slate-900 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shrink-0">
                  <Plus className="w-3 h-3" /> Add
                </button>
              </div>
            </div>
            <div>
              <span className="text-[11px] font-medium text-slate-500 block mb-1">Social links</span>
              <div className="space-y-1.5">
                {d.socialLinks.map((s) => (
                  <div key={s.id} className="flex items-center gap-1.5">
                    <input className={`${inputCls} w-28 shrink-0`} placeholder="Platform" value={s.platform} onChange={(e) => set({ socialLinks: d.socialLinks.map((x) => (x.id === s.id ? { ...x, platform: e.target.value } : x)) })} />
                    <input className={inputCls} placeholder="URL" value={s.url} onChange={(e) => set({ socialLinks: d.socialLinks.map((x) => (x.id === s.id ? { ...x, url: e.target.value } : x)) })} />
                    <button type="button" onClick={() => set({ socialLinks: d.socialLinks.filter((x) => x.id !== s.id) })} className="p-2 text-slate-400 hover:text-rose-500" aria-label="Remove link">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => set({ socialLinks: [...d.socialLinks, { id: `sl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, platform: "", url: "" }] })}
                  className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-500 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add a link
                </button>
              </div>
            </div>
          </section>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button onClick={onClose} className="px-4 py-2 sm:py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold">Cancel</button>
          <button onClick={handleSave} disabled={!canSave} className="px-4 py-2 sm:py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5" /> Save changes
          </button>
        </div>
      </div>
    </div>
  );
};
