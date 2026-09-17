import React, { useState } from "react";
import { useCRM } from "../../context/CRMContext";
import { Pipeline, PipelineStage } from "../../types";
import { GitBranch, Plus, Trash2, Edit2, Check, X } from "lucide-react";

export const PipelinesView: React.FC = () => {
  const { pipelines, addPipeline, updatePipeline, deletePipeline, deals } = useCRM();

  const [selectedPipelineId, setSelectedPipelineId] = useState<string>(pipelines[0]?.id || "");
  const [isCreatingPipeline, setIsCreatingPipeline] = useState(false);
  const [newPipelineName, setNewPipelineName] = useState("");

  const activePipeline = pipelines.find((p) => p.id === selectedPipelineId) || pipelines[0];

  const handleCreatePipeline = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPipelineName) return;

    addPipeline({
      name: newPipelineName,
      description: "",
      stages: [
        { id: `stg_${Date.now()}_1`, name: "Lead In", probability: 10, color: "#64748b", order: 0 },
        { id: `stg_${Date.now()}_2`, name: "Discovery", probability: 25, color: "#3b82f6", order: 1 },
        { id: `stg_${Date.now()}_3`, name: "Proposal Sent", probability: 60, color: "#8b5cf6", order: 2 },
        { id: `stg_${Date.now()}_4`, name: "Closing", probability: 80, color: "#f59e0b", order: 3 },
        { id: `stg_${Date.now()}_5`, name: "Closed Won", probability: 100, color: "#10b981", order: 4, isWon: true },
        { id: `stg_${Date.now()}_6`, name: "Closed Lost", probability: 0, color: "#ef4444", order: 5, isLost: true },
      ],
    });
    setNewPipelineName("");
    setIsCreatingPipeline(false);
  };

  const handleAddStage = () => {
    if (!activePipeline) return;
    const newStage: PipelineStage = {
      id: `stg_${Date.now()}`,
      name: "New Stage",
      probability: 50,
      color: "#6366f1",
      order: activePipeline.stages.length,
    };
    updatePipeline(activePipeline.id, {
      stages: [...activePipeline.stages, newStage],
    });
  };

  const handleUpdateStage = (stageId: string, updates: Partial<PipelineStage>) => {
    if (!activePipeline) return;
    const updatedStages = activePipeline.stages.map((s) =>
      s.id === stageId ? { ...s, ...updates } : s
    );
    updatePipeline(activePipeline.id, { stages: updatedStages });
  };

  const handleDeleteStage = (stageId: string) => {
    if (!activePipeline || activePipeline.stages.length <= 2) return;
    const updatedStages = activePipeline.stages.filter((s) => s.id !== stageId);
    updatePipeline(activePipeline.id, { stages: updatedStages });
  };

  return (
    <div id="pipelines-view" className="space-y-6 animate-in fade-in duration-200">
      {/* Top Controls */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Active Pipeline:
          </span>
          <select
            value={selectedPipelineId}
            onChange={(e) => setSelectedPipelineId(e.target.value)}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 bg-slate-50 focus:outline-none"
          >
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.isDefault ? "(Default)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {pipelines.length > 1 && (
            <button
              onClick={() => deletePipeline(activePipeline.id)}
              className="px-3 py-1.5 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-semibold"
            >
              Delete Pipeline
            </button>
          )}

          <button
            onClick={() => setIsCreatingPipeline(true)}
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Custom Pipeline</span>
          </button>
        </div>
      </div>

      {/* New Pipeline Creator Modal/Bar */}
      {isCreatingPipeline && (
        <form
          onSubmit={handleCreatePipeline}
          className="bg-indigo-50/70 p-4 rounded-xl border border-indigo-200 flex items-center gap-3 text-xs"
        >
          <input
            type="text"
            required
            placeholder="Pipeline Name (e.g. Partner Channel Sales)"
            value={newPipelineName}
            onChange={(e) => setNewPipelineName(e.target.value)}
            className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
          />
          <button
            type="submit"
            className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg font-semibold"
          >
            Save Pipeline
          </button>
          <button
            type="button"
            onClick={() => setIsCreatingPipeline(false)}
            className="px-3 py-1.5 text-slate-600 hover:underline"
          >
            Cancel
          </button>
        </form>
      )}

      {/* Pipeline Stage Architecture Card */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Stages & Probability Architecture
            </h3>
            <p className="text-xs text-slate-500">
              Configure each sales milestone, conversion probability %, and win/loss flags
            </p>
          </div>
          <button
            onClick={handleAddStage}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Add Stage
          </button>
        </div>

        <div className="space-y-3">
          {activePipeline?.stages.map((stage, idx) => {
            const stageDeals = deals.filter(
              (d) => d.pipelineId === activePipeline.id && d.stageId === stage.id
            );
            return (
              <div
                key={stage.id}
                className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-4 text-xs"
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-[10px]">
                    {idx + 1}
                  </span>
                  <input
                    type="text"
                    value={stage.name}
                    onChange={(e) => handleUpdateStage(stage.id, { name: e.target.value })}
                    className="font-bold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-500 focus:outline-none px-1 py-0.5"
                  />
                  {stage.isWon && (
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px]">
                      Won Milestone
                    </span>
                  )}
                  {stage.isLost && (
                    <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded font-bold text-[10px]">
                      Lost Milestone
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500 text-[11px]">Win Probability:</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={stage.probability}
                      onChange={(e) =>
                        handleUpdateStage(stage.id, { probability: Number(e.target.value) })
                      }
                      className="w-16 px-2 py-1 border border-slate-300 rounded bg-white font-mono font-bold text-slate-800"
                    />
                    <span className="text-slate-400 font-bold">%</span>
                  </div>

                  <span className="text-slate-500 font-mono text-[11px] w-24 text-right">
                    {stageDeals.length} active deals
                  </span>

                  {activePipeline.stages.length > 2 && (
                    <button
                      onClick={() => handleDeleteStage(stage.id)}
                      className="text-slate-400 hover:text-rose-600 p-1"
                      title="Remove stage"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
