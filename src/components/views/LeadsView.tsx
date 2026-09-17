import React, { useState } from "react";
import { useCRM } from "../../context/CRMContext";
import { Lead } from "../../types";
import {
  UserCheck,
  Plus,
  Search,
  Filter,
  Kanban,
  Table as TableIcon,
  Flame,
  ArrowRight,
  Phone,
  Mail,
  Building2,
  Trash2,
  FileSpreadsheet,
  Sparkles,
} from "lucide-react";
import { LeadConvertModal } from "../modals/LeadConvertModal";
import { LeadImportModal } from "../leads/LeadImportModal";
import { LeadAIAnalysisModal } from "../leads/LeadAIAnalysisModal";

// Lead has no standalone "rating" field — temperature is derived from the
// real leadScore (0-100) it does have, rather than a separate value that
// would need to be kept in sync with it.
const getLeadRating = (lead: Lead): "Hot" | "Warm" | "Cold" => {
  if (lead.leadScore >= 75) return "Hot";
  if (lead.leadScore >= 45) return "Warm";
  return "Cold";
};

export const LeadsView: React.FC = () => {
  const {
    leads,
    moveLeadStatus,
    deleteLead,
    setQuickCreateOpen,
    setQuickCreateType,
  } = useCRM();

  const [viewMode, setViewMode] = useState<"kanban" | "table">("kanban");
  const [searchTerm, setSearchTerm] = useState("");
  const [isImportOpen, setImportOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [ratingFilter, setRatingFilter] = useState<string>("All");
  const [convertingLead, setConvertingLead] = useState<Lead | null>(null);
  const [analyzingLead, setAnalyzingLead] = useState<Lead | null>(null);

  const statuses: Array<Lead["status"]> = [
    "New",
    "Contacted",
    "Engaged",
    "Qualified",
    "Converted",
    "Lost",
  ];

  const filteredLeads = leads.filter((lead) => {
    const matchesSearch =
      lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "All" || lead.status === statusFilter;
    const matchesRating = ratingFilter === "All" || getLeadRating(lead) === ratingFilter;
    return matchesSearch && matchesStatus && matchesRating;
  });

  const ratingBadges: Record<string, { bg: string; text: string; icon: boolean }> = {
    Hot: { bg: "bg-rose-100 text-rose-800 border-rose-200", text: "Hot", icon: true },
    Warm: { bg: "bg-amber-100 text-amber-800 border-amber-200", text: "Warm", icon: false },
    Cold: { bg: "bg-slate-100 text-slate-700 border-slate-200", text: "Cold", icon: false },
  };

  return (
    <div id="leads-view" className="space-y-5 animate-in fade-in duration-200">
      {/* Action Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search leads..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700 focus:outline-none"
          >
            <option value="All">All Statuses</option>
            {statuses.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>

          {/* Temperature Filter */}
          <select
            value={ratingFilter}
            onChange={(e) => setRatingFilter(e.target.value)}
            className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700 focus:outline-none"
          >
            <option value="All">All Temperatures</option>
            <option value="Hot">Hot</option>
            <option value="Warm">Warm</option>
            <option value="Cold">Cold</option>
          </select>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {/* View Mode Toggle */}
          <div className="flex border border-slate-200 rounded-lg overflow-hidden p-0.5 bg-slate-50">
            <button
              onClick={() => setViewMode("kanban")}
              className={`p-1.5 rounded text-xs ${
                viewMode === "kanban"
                  ? "bg-white shadow-2xs text-indigo-600 font-semibold"
                  : "text-slate-500 hover:text-slate-800"
              }`}
              title="Kanban Board"
            >
              <Kanban className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`p-1.5 rounded text-xs ${
                viewMode === "table"
                  ? "bg-white shadow-2xs text-indigo-600 font-semibold"
                  : "text-slate-500 hover:text-slate-800"
              }`}
              title="Data Table"
            >
              <TableIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Import Leads (Excel / Google Sheets) */}
          <button
            id="btn-import-leads"
            onClick={() => setImportOpen(true)}
            className="px-3.5 py-1.5 bg-[#252a36] hover:bg-[#2f3544] border border-[#3d4455] text-slate-200 hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
            title="Import prospects from Excel or Google Sheets"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-teal-400" />
            <span>Import Leads</span>
          </button>

          {/* New Lead */}
          <button
            onClick={() => {
              setQuickCreateType("lead");
              setQuickCreateOpen(true);
            }}
            className="px-3.5 py-1.5 bg-[#252a36] hover:bg-[#2f3544] border border-[#3d4455] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Lead</span>
          </button>
        </div>
      </div>

      {/* KANBAN BOARD VIEW */}
      {viewMode === "kanban" && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-start">
          {statuses.map((status) => {
            const columnLeads = filteredLeads.filter((l) => l.status === status);
            const totalEst = columnLeads.reduce((sum, l) => sum + (l.estimatedValue || 0), 0);

            return (
              <div
                key={status}
                className="bg-slate-100/70 rounded-xl p-3 border border-slate-200/80 min-h-[550px] flex flex-col space-y-3"
              >
                {/* Column Header */}
                <div className="flex items-center justify-between pb-1 border-b border-slate-200">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-xs text-slate-800">{status}</span>
                    <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold flex items-center justify-center">
                      {columnLeads.length}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono font-semibold text-slate-500">
                    ${(totalEst / 1000).toFixed(0)}k
                  </span>
                </div>

                {/* Cards Container */}
                <div className="flex-1 space-y-2.5 overflow-y-auto">
                  {columnLeads.map((lead) => {
                    const ratingInfo = ratingBadges[getLeadRating(lead)];
                    return (
                      <div
                        key={lead.id}
                        className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs hover:border-indigo-300 hover:shadow-xs transition-all space-y-2 group"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-bold text-slate-900 text-xs leading-snug">
                              {lead.name}
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                              <Building2 className="w-3 h-3 text-slate-400" />
                              <span className="font-medium">{lead.company}</span>
                            </div>
                            {lead.phone && (
                              <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                                <Phone className="w-3 h-3 text-slate-400" />
                                <span>{lead.phone}</span>
                              </div>
                            )}
                          </div>

                          {/* Temperature Badge */}
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border flex items-center gap-0.5 ${ratingInfo.bg}`}
                          >
                            {ratingInfo.icon && <Flame className="w-2.5 h-2.5 text-rose-600 fill-rose-600" />}
                            {ratingInfo.text}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[11px] pt-1">
                          <span className="font-mono font-bold text-slate-800">
                            ${(lead.estimatedValue || 0).toLocaleString()}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {lead.source}
                          </span>
                        </div>

                        {/* Card Footer: Quick Actions */}
                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setAnalyzingLead(lead)}
                              className="px-2 py-0.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded text-[10px] font-bold border border-indigo-200 flex items-center gap-1"
                              title="Analyze with Aargard Business Intelligence Construct"
                            >
                              <Sparkles className="w-2.5 h-2.5" />
                              <span>Analyze</span>
                            </button>

                            {lead.status !== "Converted" && (
                              <button
                                onClick={() => setConvertingLead(lead)}
                                className="px-2 py-0.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded text-[10px] font-bold border border-emerald-200 flex items-center gap-1"
                                title="Convert to Company & Deal"
                              >
                                <span>Convert</span>
                                <ArrowRight className="w-2.5 h-2.5" />
                              </button>
                            )}

                            {/* Move Status Dropdown */}
                            <select
                              value={lead.status}
                              onChange={(e) => moveLeadStatus(lead.id, e.target.value as any)}
                              className="text-[10px] border border-slate-200 rounded px-1 py-0.5 bg-slate-50 text-slate-600"
                            >
                              {statuses.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          </div>

                          <button
                            onClick={() => deleteLead(lead.id)}
                            className="text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                            title="Delete Lead"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {columnLeads.length === 0 && (
                    <div className="py-12 text-center text-slate-400 text-xs">
                      No leads in {status}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TABLE VIEW */}
      {viewMode === "table" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="p-3">Lead / Company</th>
                <th className="p-3">Contact Details</th>
                <th className="p-3">Status</th>
                <th className="p-3">Temperature</th>
                <th className="p-3 text-right">Est. Value</th>
                <th className="p-3">Source</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLeads.map((lead) => (
                <tr key={lead.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="p-3">
                    <div className="font-bold text-slate-900">{lead.name}</div>
                    <div className="text-slate-500 text-[11px]">{lead.company} • {lead.jobTitle}</div>
                  </td>
                  <td className="p-3 text-slate-600 space-y-0.5">
                    {lead.email && <div className="text-indigo-600">{lead.email}</div>}
                    {lead.phone && <div className="text-slate-500 text-[11px]">{lead.phone}</div>}
                  </td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-800 rounded-full font-semibold text-[10px]">
                      {lead.status}
                    </span>
                  </td>
                  <td className="p-3">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                        ratingBadges[getLeadRating(lead)].bg
                      }`}
                    >
                      {getLeadRating(lead)}
                    </span>
                  </td>
                  <td className="p-3 text-right font-mono font-bold text-slate-900">
                    ${(lead.estimatedValue || 0).toLocaleString()}
                  </td>
                  <td className="p-3 text-slate-500">{lead.source}</td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => setAnalyzingLead(lead)}
                        className="px-2.5 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded text-xs font-semibold border border-indigo-200 flex items-center gap-1"
                        title="Analyze with Aargard Business Intelligence Construct"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Analyze</span>
                      </button>
                      {lead.status !== "Converted" && (
                        <button
                          onClick={() => setConvertingLead(lead)}
                          className="px-2.5 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded text-xs font-semibold border border-emerald-200"
                        >
                          Convert Lead
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Convert Modal */}
      {convertingLead && (
        <LeadConvertModal
          lead={convertingLead}
          onClose={() => setConvertingLead(null)}
        />
      )}

      {/* Excel / Google Sheets Import Modal */}
      <LeadImportModal
        isOpen={isImportOpen}
        onClose={() => setImportOpen(false)}
      />

      {/* Aargard Business Intelligence Construct — AI Lead Analysis */}
      {analyzingLead && (
        <LeadAIAnalysisModal
          lead={analyzingLead}
          onClose={() => setAnalyzingLead(null)}
        />
      )}
    </div>
  );
};
