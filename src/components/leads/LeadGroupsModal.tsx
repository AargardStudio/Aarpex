import React, { useState } from "react";
import { X, Plus, Trash2, Check, Users, Pencil } from "lucide-react";
import { useCRM } from "../../context/CRMContext";

const COLORS = ["#14b8a6", "#6366f1", "#f59e0b", "#ec4899", "#22c55e", "#0ea5e9", "#ef4444", "#a855f7"];

/** Small colored group chip used across the app. */
export const GroupChip: React.FC<{ name: string; color?: string; onRemove?: () => void }> = ({ name, color, onRemove }) => (
  <span
    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border"
    style={{ color: color || "#14b8a6", borderColor: `${color || "#14b8a6"}66`, backgroundColor: `${color || "#14b8a6"}1f` }}
  >
    {name}
    {onRemove && (
      <button type="button" onClick={onRemove} className="opacity-70 hover:opacity-100" title="Remove from group">
        <X className="w-2.5 h-2.5" />
      </button>
    )}
  </span>
);

/** Create / rename / recolor / delete groups. */
export const LeadGroupsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { leads, leadGroups, industryAgents, addLeadGroup, updateLeadGroup, deleteLeadGroup } = useCRM();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const create = () => {
    if (!name.trim()) return;
    addLeadGroup({ name, description });
    setName("");
    setDescription("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#181b21] border border-[#2d323f] rounded-2xl w-full max-w-lg max-h-[90vh] shadow-2xl overflow-hidden text-xs text-slate-200 flex flex-col">
        <div className="px-6 py-4 border-b border-[#2d323f] flex items-center justify-between bg-[#121418]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/30 text-teal-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Groups</h2>
              <p className="text-[11px] text-slate-400">Organize leads and businesses into lists, then deploy Industry Agents to a group.</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg bg-[#252a36] hover:bg-[#2f3544] text-slate-400 hover:text-white flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          <div className="space-y-2 p-3 rounded-xl bg-[#121418] border border-[#2d323f]">
            <div className="font-semibold text-white">New group</div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
              placeholder="e.g. Dubai clinics, October import, Warm referrals"
              className="w-full px-3 py-2 bg-[#181b21] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
            />
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              className="w-full px-3 py-2 bg-[#181b21] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
            />
            <button
              onClick={create}
              disabled={!name.trim()}
              className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-bold rounded-lg flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Create group
            </button>
          </div>

          {leadGroups.length === 0 ? (
            <p className="text-slate-500 text-center py-4">No groups yet. Create one above, then select leads on the Leads page and use "Add to group".</p>
          ) : (
            <div className="space-y-2">
              {leadGroups.map((g) => {
                const count = leads.filter((l) => (l.groupIds || []).includes(g.id)).length;
                const agentCount = industryAgents.filter((a) => (a.groupIds || []).includes(g.id)).length;
                return (
                  <div key={g.id} className="p-3 rounded-xl bg-[#121418] border border-[#2d323f] space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                      {editingId === g.id ? (
                        <>
                          <input
                            autoFocus
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && editName.trim()) {
                                updateLeadGroup(g.id, { name: editName.trim() });
                                setEditingId(null);
                              }
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            className="flex-1 px-2 py-1 bg-[#181b21] border border-[#2d323f] text-white rounded-lg"
                          />
                          <button
                            onClick={() => {
                              if (editName.trim()) updateLeadGroup(g.id, { name: editName.trim() });
                              setEditingId(null);
                            }}
                            className="p-1 rounded bg-emerald-500/15 text-emerald-300"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="font-bold text-white flex-1 truncate">{g.name}</span>
                          <button
                            onClick={() => {
                              setEditingId(g.id);
                              setEditName(g.name);
                            }}
                            className="p-1 rounded text-slate-400 hover:text-white"
                            title="Rename"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => {
                          if (confirm(`Delete the group "${g.name}"? The leads stay; they just leave the group.`)) deleteLeadGroup(g.id);
                        }}
                        className="p-1 rounded text-slate-400 hover:text-rose-300"
                        title="Delete group"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {g.description && <div className="text-slate-400">{g.description}</div>}
                    <div className="flex items-center gap-3 text-[11px] text-slate-500">
                      <span>{count} lead{count === 1 ? "" : "s"}</span>
                      <span>{agentCount} agent{agentCount === 1 ? "" : "s"} deployed</span>
                      <span className="ml-auto flex items-center gap-1">
                        {COLORS.map((c) => (
                          <button
                            key={c}
                            onClick={() => updateLeadGroup(g.id, { color: c })}
                            className={`w-3.5 h-3.5 rounded-full border ${g.color === c ? "border-white" : "border-transparent"}`}
                            style={{ backgroundColor: c }}
                            title="Set color"
                          />
                        ))}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/** Toggleable chips to put one lead in / out of groups. */
export const GroupPicker: React.FC<{ value: string[]; onChange: (ids: string[]) => void }> = ({ value, onChange }) => {
  const { leadGroups } = useCRM();
  if (leadGroups.length === 0) return <p className="text-[11px] text-slate-500">No groups yet -- create them from the Leads page (Groups button).</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {leadGroups.map((g) => {
        const on = value.includes(g.id);
        return (
          <button
            key={g.id}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== g.id) : [...value, g.id])}
            className="px-2 py-1 rounded-full text-[11px] font-semibold border transition-opacity"
            style={{
              color: g.color,
              borderColor: `${g.color}${on ? "" : "55"}`,
              backgroundColor: on ? `${g.color}33` : "transparent",
              opacity: on ? 1 : 0.65,
            }}
          >
            {on ? "✓ " : "+ "}
            {g.name}
          </button>
        );
      })}
    </div>
  );
};
