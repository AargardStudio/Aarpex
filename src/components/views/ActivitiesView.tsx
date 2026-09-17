import React, { useState } from "react";
import { useCRM } from "../../context/CRMContext";
import { Activity } from "../../types";
import {
  CalendarCheck,
  Plus,
  Search,
  Filter,
  Phone,
  Video,
  Mail,
  FileText,
  Building2,
  Trash2,
} from "lucide-react";

export const ActivitiesView: React.FC = () => {
  const {
    activities,
    companies,
    deleteActivity,
    setSelectedCompanyId,
    setQuickCreateOpen,
    setQuickCreateType,
  } = useCRM();

  const [typeFilter, setTypeFilter] = useState<string>("All");
  const [searchTerm, setSearchTerm] = useState("");

  const filteredActivities = activities.filter((act) => {
    const comp = companies.find((c) => c.id === act.companyId);
    const matchesType = typeFilter === "All" || act.type === typeFilter;
    const matchesSearch =
      act.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (act.outcome && act.outcome.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (comp && comp.name.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesType && matchesSearch;
  });

  const sortedActivities = [...filteredActivities].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const typeIcons: Record<string, React.ElementType> = {
    Call: Phone,
    Meeting: Video,
    Email: Mail,
    Proposal: FileText,
    Note: FileText,
  };

  return (
    <div id="activities-view" className="space-y-5 animate-in fade-in duration-200">
      {/* Control Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search activities or outcomes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs"
            />
          </div>

          <div className="flex border border-slate-200 rounded-lg overflow-hidden p-0.5 bg-slate-50 text-xs">
            {["All", "Call", "Meeting", "Email", "Proposal", "Note"].map((tab) => (
              <button
                key={tab}
                onClick={() => setTypeFilter(tab)}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  typeFilter === tab
                    ? "bg-white text-indigo-600 font-bold shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => {
            setQuickCreateType("activity");
            setQuickCreateOpen(true);
          }}
          className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm self-end sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Log Activity</span>
        </button>
      </div>

      {/* Timeline Stream */}
      <div className="relative pl-6 border-l-2 border-slate-200 space-y-4">
        {sortedActivities.map((act) => {
          const comp = companies.find((c) => c.id === act.companyId);
          const Icon = typeIcons[act.type] || FileText;

          return (
            <div key={act.id} className="relative group">
              <div className="absolute -left-[31px] top-1.5 w-4 h-4 rounded-full bg-white border-2 border-indigo-600 group-hover:scale-110 transition-transform" />

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs hover:border-indigo-300 transition-all space-y-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="p-1 rounded bg-indigo-50 text-indigo-700">
                      <Icon className="w-3.5 h-3.5" />
                    </span>
                    <span className="font-bold text-slate-900 text-xs">{act.type}</span>
                    <span className="text-slate-400 text-xs">• logged by {act.user}</span>
                    {comp && (
                      <button
                        onClick={() => setSelectedCompanyId(comp.id)}
                        className="font-semibold text-indigo-600 hover:underline flex items-center gap-1 text-xs ml-1"
                      >
                        <Building2 className="w-3 h-3 text-slate-400" />
                        <span>{comp.name}</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-slate-400 text-xs">
                    <span>{act.date} {act.time}</span>
                    <button
                      onClick={() => deleteActivity(act.id)}
                      className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500 transition-opacity"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <p className="text-slate-800 text-xs leading-relaxed">{act.description}</p>

                {(act.outcome || act.nextAction) && (
                  <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 text-[11px]">
                    {act.outcome && (
                      <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-medium">
                        Outcome: {act.outcome}
                      </span>
                    )}
                    {act.nextAction && (
                      <span className="text-slate-600">
                        Next Action: <strong>{act.nextAction}</strong>
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
