import React, { useState } from "react";
import { useCRM } from "../../context/CRMContext";
import { Deal, PipelineStage } from "../../types";
import {
  Briefcase,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  Building2,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  ChevronRight,
  MoreVertical,
  Calendar,
} from "lucide-react";

export const DealsView: React.FC = () => {
  const {
    deals,
    pipelines,
    companies,
    moveDealStage,
    updateDeal,
    deleteDeal,
    setSelectedCompanyId,
    setQuickCreateOpen,
    setQuickCreateType,
  } = useCRM();

  const [selectedPipelineId, setSelectedPipelineId] = useState<string>(
    pipelines[0]?.id || ""
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDealForModal, setSelectedDealForModal] = useState<Deal | null>(null);

  const activePipeline =
    pipelines.find((p) => p.id === selectedPipelineId) || pipelines[0];

  const filteredDeals = deals.filter((deal) => {
    const matchesPipeline = !selectedPipelineId || deal.pipelineId === activePipeline?.id;
    const comp = companies.find((c) => c.id === deal.companyId);
    const matchesSearch =
      deal.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (comp && comp.name.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesPipeline && matchesSearch;
  });

  const openDeals = filteredDeals.filter((d) => d.status === "Open");
  const totalOpenValue = openDeals.reduce((sum, d) => sum + d.dealValue, 0);
  const totalWeighted = openDeals.reduce((sum, d) => sum + (d.weightedValue || 0), 0);
  const wonValue = filteredDeals
    .filter((d) => d.status === "Won")
    .reduce((sum, d) => sum + d.dealValue, 0);

  return (
    <div id="deals-view" className="space-y-5 animate-in fade-in duration-200">
      {/* Header Pipeline Switcher & Pipeline Summary Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Pipeline Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Pipeline:
            </span>
            <select
              value={selectedPipelineId}
              onChange={(e) => setSelectedPipelineId(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 bg-slate-50 focus:outline-none cursor-pointer"
            >
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div className="relative w-60">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search deals or accounts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs"
            />
          </div>
        </div>

        {/* Quick Metrics & Add Deal */}
        <div className="flex items-center gap-4">
          <div className="hidden lg:flex items-center gap-4 text-xs">
            <div>
              <span className="text-slate-400 block text-[10px]">Open Pipeline</span>
              <span className="font-mono font-bold text-slate-900">
                ${totalOpenValue.toLocaleString()}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">Weighted</span>
              <span className="font-mono font-bold text-indigo-600">
                ${totalWeighted.toLocaleString()}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">Won</span>
              <span className="font-mono font-bold text-emerald-600">
                ${wonValue.toLocaleString()}
              </span>
            </div>
          </div>

          <button
            onClick={() => {
              setQuickCreateType("deal");
              setQuickCreateOpen(true);
            }}
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Deal</span>
          </button>
        </div>
      </div>

      {/* Visual Kanban Stages */}
      <div className="flex gap-4 overflow-x-auto pb-4 items-start custom-scrollbar">
        {activePipeline?.stages.map((stage) => {
          const stageDeals = filteredDeals.filter((d) => d.stageId === stage.id);
          const stageTotal = stageDeals.reduce((sum, d) => sum + d.dealValue, 0);
          const stageWeighted = stageDeals.reduce((sum, d) => sum + (d.weightedValue || 0), 0);

          return (
            <div
              key={stage.id}
              className="w-80 bg-slate-100/70 rounded-xl p-3 border border-slate-200 shrink-0 min-h-[600px] flex flex-col space-y-3"
            >
              {/* Stage Header */}
              <div className="pb-2 border-b border-slate-200/80">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-xs text-slate-900">{stage.name}</span>
                    <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold flex items-center justify-center">
                      {stageDeals.length}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                    {stage.probability}% prob
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono mt-1">
                  <span>Total: ${stageTotal.toLocaleString()}</span>
                  <span>Wtd: ${stageWeighted.toLocaleString()}</span>
                </div>
              </div>

              {/* Deal Cards */}
              <div className="space-y-2.5 flex-1 overflow-y-auto">
                {stageDeals.map((deal) => {
                  const comp = companies.find((c) => c.id === deal.companyId);
                  const isStalled =
                    deal.lastActivity &&
                    Math.round(
                      (Date.now() - new Date(deal.lastActivity).getTime()) / 86400000
                    ) > 10;

                  return (
                    <div
                      key={deal.id}
                      className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs hover:border-indigo-400 hover:shadow-xs transition-all space-y-2.5 group"
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-0.5">
                          <button
                            onClick={() => setSelectedDealForModal(deal)}
                            className="font-bold text-slate-900 text-xs hover:text-indigo-600 text-left line-clamp-2"
                          >
                            {deal.name}
                          </button>
                          {comp && (
                            <button
                              onClick={() => setSelectedCompanyId(comp.id)}
                              className="text-[11px] text-slate-500 hover:text-indigo-600 flex items-center gap-1 font-medium"
                            >
                              <Building2 className="w-3 h-3 text-slate-400" />
                              <span>{comp.name}</span>
                            </button>
                          )}
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-xs font-mono font-black text-slate-900">
                            ${deal.dealValue.toLocaleString()}
                          </div>
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                              deal.priority === "High"
                                ? "bg-rose-50 text-rose-700"
                                : deal.priority === "Medium"
                                ? "bg-amber-50 text-amber-700"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {deal.priority}
                          </span>
                        </div>
                      </div>

                      {/* Stalled or Alert Flag */}
                      {isStalled && (
                        <div className="flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Stalled: No activity in 10+ days</span>
                        </div>
                      )}

                      {/* Expected Close Date & Next Step */}
                      <div className="text-[11px] space-y-1 text-slate-600 pt-1 border-t border-slate-100">
                        <div className="flex items-center justify-between text-slate-400 text-[10px]">
                          <span>Rep: {deal.salesperson}</span>
                          <span>Close: {deal.expectedCloseDate}</span>
                        </div>
                        {deal.nextActivity && (
                          <div className="text-indigo-600 text-[11px] line-clamp-1 font-medium">
                            Next: {deal.nextActivity}
                          </div>
                        )}
                      </div>

                      {/* Move Stage Selector & Instant Won/Lost Buttons */}
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                        <select
                          value={deal.stageId}
                          onChange={(e) => moveDealStage(deal.id, e.target.value)}
                          className="text-[10px] border border-slate-200 rounded px-1.5 py-0.5 bg-slate-50 text-slate-700 focus:outline-none"
                        >
                          {activePipeline?.stages.map((st) => (
                            <option key={st.id} value={st.id}>
                              Move to: {st.name}
                            </option>
                          ))}
                        </select>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              const wonStage = activePipeline?.stages.find((s) => s.isWon);
                              if (wonStage) moveDealStage(deal.id, wonStage.id);
                            }}
                            className="p-1 hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 rounded transition-colors"
                            title="Mark Won"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              const lostStage = activePipeline?.stages.find((s) => s.isLost);
                              if (lostStage) moveDealStage(deal.id, lostStage.id);
                            }}
                            className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded transition-colors"
                            title="Mark Lost"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {stageDeals.length === 0 && (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    No deals in {stage.name}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Deal Detail / Quick Edit Modal */}
      {selectedDealForModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden text-xs p-6 space-y-4">
            <div className="flex items-start justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {selectedDealForModal.name}
                </h3>
                <span className="text-slate-500">
                  Value: ${selectedDealForModal.dealValue.toLocaleString()} USD
                </span>
              </div>
              <button
                onClick={() => setSelectedDealForModal(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Deal Value ($)</label>
                <input
                  type="number"
                  value={selectedDealForModal.dealValue}
                  onChange={(e) =>
                    setSelectedDealForModal({
                      ...selectedDealForModal,
                      dealValue: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono font-bold"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Next Activity Planned</label>
                <input
                  type="text"
                  value={selectedDealForModal.nextActivity || ""}
                  onChange={(e) =>
                    setSelectedDealForModal({
                      ...selectedDealForModal,
                      nextActivity: e.target.value,
                    })
                  }
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Notes / Deal Strategy</label>
                <textarea
                  rows={3}
                  value={selectedDealForModal.notes || ""}
                  onChange={(e) =>
                    setSelectedDealForModal({
                      ...selectedDealForModal,
                      notes: e.target.value,
                    })
                  }
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-between">
              <button
                onClick={() => {
                  deleteDeal(selectedDealForModal.id);
                  setSelectedDealForModal(null);
                }}
                className="px-3 py-1.5 text-rose-600 hover:bg-rose-50 rounded-lg font-semibold"
              >
                Delete Deal
              </button>

              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedDealForModal(null)}
                  className="px-4 py-1.5 border border-slate-300 rounded-lg text-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    updateDeal(selectedDealForModal.id, selectedDealForModal);
                    setSelectedDealForModal(null);
                  }}
                  className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg font-semibold"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
