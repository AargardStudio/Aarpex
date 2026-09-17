import React, { useState } from "react";
import { useCRM } from "../../context/CRMContext";
import { Task } from "../../types";
import {
  CheckSquare,
  Square,
  Plus,
  Search,
  Calendar,
  Building2,
  Trash2,
  AlertCircle,
} from "lucide-react";

export const TasksView: React.FC = () => {
  const {
    tasks,
    companies,
    toggleTaskStatus,
    deleteTask,
    setSelectedCompanyId,
    setQuickCreateOpen,
    setQuickCreateType,
  } = useCRM();

  const [filter, setFilter] = useState<"All" | "Pending" | "Completed">("Pending");
  const [searchTerm, setSearchTerm] = useState("");

  const filteredTasks = tasks.filter((t) => {
    const comp = companies.find((c) => c.id === t.companyId);
    const matchesFilter =
      filter === "All" ||
      (filter === "Pending" && t.status !== "Completed") ||
      (filter === "Completed" && t.status === "Completed");
    const matchesSearch =
      t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (comp && comp.name.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  return (
    <div id="tasks-view" className="space-y-5 animate-in fade-in duration-200">
      {/* Control Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs"
            />
          </div>

          <div className="flex border border-slate-200 rounded-lg overflow-hidden p-0.5 bg-slate-50 text-xs">
            {["Pending", "Completed", "All"].map((tab) => (
              <button
                key={tab}
                onClick={() => setFilter(tab as any)}
                className={`px-3 py-1 rounded-md font-medium transition-colors ${
                  filter === tab
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
            setQuickCreateType("task");
            setQuickCreateOpen(true);
          }}
          className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm self-end sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Task</span>
        </button>
      </div>

      {/* Task List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs divide-y divide-slate-100">
        {filteredTasks.map((t) => {
          const comp = companies.find((c) => c.id === t.companyId);
          const isCompleted = t.status === "Completed";
          const isOverdue =
            !isCompleted && new Date(t.dueDate) < new Date();

          return (
            <div
              key={t.id}
              className={`p-4 flex items-center justify-between text-xs hover:bg-slate-50/70 transition-colors group ${
                isCompleted ? "opacity-60 bg-slate-50/40" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleTaskStatus(t.id)}
                  className="text-slate-400 hover:text-indigo-600 transition-colors"
                >
                  {isCompleted ? (
                    <CheckSquare className="w-5 h-5 text-indigo-600" />
                  ) : (
                    <Square className="w-5 h-5" />
                  )}
                </button>

                <div className="space-y-0.5">
                  <div
                    className={`font-semibold text-slate-900 text-xs ${
                      isCompleted ? "line-through text-slate-500" : ""
                    }`}
                  >
                    {t.title}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500">
                    {comp && (
                      <button
                        onClick={() => setSelectedCompanyId(comp.id)}
                        className="hover:text-indigo-600 flex items-center gap-1"
                      >
                        <Building2 className="w-3 h-3 text-slate-400" />
                        <span>{comp.name}</span>
                      </button>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      <span className={isOverdue ? "text-rose-600 font-bold" : ""}>
                        Due {t.dueDate}
                      </span>
                    </span>
                    <span>Assigned: {t.assignedUser}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    t.priority === "High"
                      ? "bg-rose-100 text-rose-800"
                      : t.priority === "Medium"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {t.priority}
                </span>

                <button
                  onClick={() => deleteTask(t.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-600 transition-opacity"
                  title="Delete Task"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}

        {filteredTasks.length === 0 && (
          <div className="p-8 text-center text-slate-400 text-xs">
            No tasks found in {filter} view.
          </div>
        )}
      </div>
    </div>
  );
};
