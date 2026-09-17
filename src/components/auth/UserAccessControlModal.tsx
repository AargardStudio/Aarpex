import React, { useState } from "react";
import { useCRM } from "../../context/CRMContext";
import { UserRole, ROLE_LABELS, ROLE_PERMISSIONS, UserPermissions } from "../../types";
import {
  X,
  Shield,
  Users,
  Check,
  Ban,
  UserPlus,
  RefreshCw,
  Sparkles,
  Info,
} from "lucide-react";

export const UserAccessControlModal: React.FC = () => {
  const {
    isAccessControlOpen,
    setAccessControlOpen,
    users,
    currentUser,
    setCurrentUser,
    updateUserRole,
    addUser,
    activeTenant,
  } = useCRM();

  const seatLimit = activeTenant?.seatsAllocated || 5;
  const seatsFull = users.length >= seatLimit;

  const [activeTab, setActiveTab] = useState<"members" | "matrix" | "add">("members");
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState<UserRole | "custom">("sales_rep");
  const [customRoleTitle, setCustomRoleTitle] = useState("Custom Role");
  const [customPermissions, setCustomPermissions] = useState<UserPermissions>({ ...ROLE_PERMISSIONS.sales_rep });
  const [notification, setNotification] = useState<string | null>(null);

  // Inline "selective access" editor for an existing member's custom
  // permission set (opened when their role dropdown is set to Custom).
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingPerms, setEditingPerms] = useState<UserPermissions>({ ...ROLE_PERMISSIONS.viewer });

  if (!isAccessControlOpen) return null;

  const handleRoleChange = (userId: string, role: UserRole | "custom") => {
    if (role === "custom") {
      const targetUser = users.find((u) => u.id === userId);
      setEditingUserId(userId);
      setEditingPerms({
        ...ROLE_PERMISSIONS[(targetUser?.role as UserRole) || "viewer"] || ROLE_PERMISSIONS.viewer,
        ...(targetUser?.permissions || {}),
      });
      return;
    }
    // Switching to a preset role clears any previous selective-access
    // overrides so the preset's permissions apply cleanly.
    updateUserRole(userId, role, {});
    const targetUser = users.find((u) => u.id === userId);
    setNotification(`Updated ${targetUser?.name || "User"} to ${ROLE_LABELS[role]?.title || role}`);
    setTimeout(() => setNotification(null), 2500);
  };

  const handleSaveCustomPermissions = (userId: string) => {
    updateUserRole(userId, "custom", editingPerms);
    const targetUser = users.find((u) => u.id === userId);
    setNotification(`Updated ${targetUser?.name || "User"} to a custom, selective-access role`);
    setEditingUserId(null);
    setTimeout(() => setNotification(null), 2500);
  };

  const handleSimulateRole = (user: (typeof users)[0]) => {
    setCurrentUser(user);
    setNotification(`Now viewing CRM as ${user.name} (${ROLE_LABELS[user.role as UserRole]?.title || user.role})`);
    setTimeout(() => setNotification(null), 2500);
  };

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName || !newUserEmail) return;
    if (seatsFull) {
      setNotification(`Seat limit reached (${seatLimit} team members). Remove a member or upgrade to add more.`);
      setTimeout(() => setNotification(null), 3500);
      return;
    }

    const initials =
      newUserName
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase() || "US";

    const isCustom = newUserRole === "custom";
    const newUser = {
      id: `usr_${Date.now()}`,
      name: newUserName,
      email: newUserEmail,
      role: isCustom ? "custom" : newUserRole,
      roleTitle: isCustom ? customRoleTitle.trim() || "Custom Role" : ROLE_LABELS[newUserRole]?.title || "Sales Representative",
      permissions: isCustom ? customPermissions : undefined,
      avatar: initials,
      status: "Active" as const,
      lastLogin: "Invited",
    };

    addUser(newUser);
    setNotification(`Created user ${newUserName} with ${isCustom ? customRoleTitle.trim() || "Custom Role" : ROLE_LABELS[newUserRole]?.title}`);
    setNewUserName("");
    setNewUserEmail("");
    setCustomRoleTitle("Custom Role");
    setCustomPermissions({ ...ROLE_PERMISSIONS.sales_rep });
    setActiveTab("members");
    setTimeout(() => setNotification(null), 2500);
  };

  const permissionKeys: Array<{ key: keyof UserPermissions; label: string; desc: string }> = [
    { key: "canViewFinancials", label: "View Financials", desc: "Access revenue, invoices, and payment summaries" },
    { key: "canManageInvoices", label: "Manage Invoices", desc: "Create, edit, duplicate, and record payments" },
    { key: "canImportLeads", label: "Import Leads", desc: "Upload leads from Excel and Google Sheets" },
    { key: "canAssignLeads", label: "Assign Leads & Deals", desc: "Reassign sales representatives on records" },
    { key: "canExportData", label: "Export Data", desc: "Download CSV, Excel reports, and CRM datasets" },
    { key: "canManageUsers", label: "Manage Team & Roles", desc: "Add, edit, or adjust user access permissions" },
    { key: "canManageSettings", label: "System Settings", desc: "Modify corporate billing profile and pipelines" },
    { key: "canDeleteRecords", label: "Delete Records", desc: "Permanently remove contacts, deals, or companies" },
  ];

  const rolesList: UserRole[] = ["admin", "sales_manager", "sales_rep", "finance", "viewer"];

  return (
    <div
      id="user-access-control-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="w-full max-w-4xl bg-[#181b21] border border-[#2d323f] rounded-2xl shadow-2xl overflow-hidden text-slate-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-[#2d323f] flex items-center justify-between bg-[#14171d] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#252a36] border border-[#3d4455] flex items-center justify-center text-teal-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Controlled User Access (RBAC)
              </h2>
              <p className="text-xs text-slate-400">
                Manage roles, granular privileges, and team security policies
              </p>
            </div>
          </div>
          <button
            id="close-access-modal-btn"
            onClick={() => setAccessControlOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#252a36] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notification banner */}
        {notification && (
          <div className="px-5 py-2.5 bg-teal-500/10 border-b border-teal-500/30 text-teal-300 text-xs flex items-center gap-2 animate-in fade-in">
            <Sparkles className="w-4 h-4 text-teal-400" />
            <span>{notification}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="px-5 pt-3 border-b border-[#2d323f] bg-[#14171d] flex items-center justify-between shrink-0">
          <div className="flex gap-2">
            <button
              id="tab-access-members"
              onClick={() => setActiveTab("members")}
              className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors border-b-2 ${
                activeTab === "members"
                  ? "border-teal-400 text-white bg-[#181b21]"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              Team Members ({users.length}/{seatLimit})
            </button>
            <button
              id="tab-access-matrix"
              onClick={() => setActiveTab("matrix")}
              className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors border-b-2 ${
                activeTab === "matrix"
                  ? "border-teal-400 text-white bg-[#181b21]"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              Permission Matrix
            </button>
            <button
              id="tab-access-add"
              onClick={() => setActiveTab("add")}
              className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors border-b-2 flex items-center gap-1.5 ${
                activeTab === "add"
                  ? "border-teal-400 text-white bg-[#181b21]"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" /> Invite Member
            </button>
          </div>

          <div className="text-xs text-slate-400 pb-2">
            Current session: <span className="font-bold text-teal-300">{currentUser.name}</span> ({currentUser.role})
          </div>
        </div>

        {/* Body content */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
          {activeTab === "members" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400">
                  Select a user's role to change their access permissions in real-time, or simulate their session.
                </p>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[11px] text-slate-400 font-mono">Live RBAC Enforcement</span>
                </div>
              </div>

              <div className="border border-[#2d323f] rounded-xl overflow-hidden bg-[#14171d]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#2d323f] text-slate-400 bg-[#121418]">
                      <th className="p-3.5 font-semibold">User</th>
                      <th className="p-3.5 font-semibold">Email</th>
                      <th className="p-3.5 font-semibold">Assigned Role</th>
                      <th className="p-3.5 font-semibold">Status</th>
                      <th className="p-3.5 font-semibold text-right">Session Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#242935]">
                    {users.map((u) => {
                      const isSelf = currentUser.id === u.id;
                      const roleConfig = ROLE_LABELS[(u.role as UserRole) || "viewer"] || {
                        title: u.role,
                        badgeColor: "bg-slate-500/20 text-slate-300",
                      };

                      const isEditingThis = editingUserId === u.id;

                      return (
                        <React.Fragment key={u.id}>
                        <tr className="hover:bg-[#1f232c]/50 transition-colors">
                          <td className="p-3.5">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-[#252a36] border border-[#3d4455] text-teal-300 font-bold flex items-center justify-center text-xs shrink-0">
                                {u.avatar}
                              </div>
                              <div>
                                <p className="font-bold text-white flex items-center gap-1.5">
                                  {u.name}
                                  {isSelf && (
                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-teal-500/20 text-teal-300 border border-teal-500/40">
                                      Active
                                    </span>
                                  )}
                                </p>
                                <p className="text-[11px] text-slate-400">{u.roleTitle || roleConfig.title}</p>
                              </div>
                            </div>
                          </td>
                          <td className="p-3.5 font-mono text-slate-300 text-[11px]">
                            {u.email}
                            {u.isGoogleAccount && (
                              <span className="block text-[9px] text-blue-400 font-sans">
                                Google SSO Connected
                              </span>
                            )}
                          </td>
                          <td className="p-3.5">
                            <select
                              value={u.role === "custom" ? "custom" : u.role}
                              onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole | "custom")}
                              className="px-2.5 py-1.5 bg-[#121418] border border-[#2d323f] rounded-lg text-xs font-semibold text-white focus:outline-none focus:border-teal-500 cursor-pointer"
                            >
                              <option value="admin">Super Administrator</option>
                              <option value="sales_manager">Sales Manager</option>
                              <option value="sales_rep">Sales Representative</option>
                              <option value="finance">Finance & Billing</option>
                              <option value="viewer">Viewer / Auditor</option>
                              <option value="custom">Custom (Selective Access)</option>
                            </select>
                          </td>
                          <td className="p-3.5">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                              {u.status || "Active"}
                            </span>
                          </td>
                          <td className="p-3.5 text-right">
                            {isSelf ? (
                              <span className="text-[11px] text-teal-400 font-medium">
                                Current User
                              </span>
                            ) : (
                              <button
                                onClick={() => handleSimulateRole(u)}
                                className="px-2.5 py-1 bg-[#252a36] hover:bg-[#2f3544] border border-[#3d4455] text-slate-200 hover:text-white rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1 ml-auto"
                              >
                                <RefreshCw className="w-3 h-3" /> Simulate
                              </button>
                            )}
                          </td>
                        </tr>
                        {isEditingThis && (
                          <tr className="bg-[#101217]">
                            <td colSpan={5} className="p-4">
                              <div className="space-y-3">
                                <p className="text-xs font-bold text-white flex items-center gap-1.5">
                                  <Shield className="w-3.5 h-3.5 text-teal-400" />
                                  Selective Access for {u.name}
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {permissionKeys.map((p) => (
                                    <label
                                      key={p.key}
                                      className="flex items-start gap-2 p-2 rounded-lg bg-[#181b21] border border-[#2d323f] cursor-pointer text-[11px] text-slate-300"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={!!editingPerms[p.key]}
                                        onChange={(e) =>
                                          setEditingPerms((prev) => ({ ...prev, [p.key]: e.target.checked }))
                                        }
                                        className="mt-0.5 rounded border-[#2d323f] bg-[#101217] text-teal-500 focus:ring-0"
                                      />
                                      <span>
                                        <span className="block font-bold text-white">{p.label}</span>
                                        <span className="block text-slate-400">{p.desc}</span>
                                      </span>
                                    </label>
                                  ))}
                                </div>
                                <div className="flex items-center justify-end gap-2 pt-1">
                                  <button
                                    type="button"
                                    onClick={() => setEditingUserId(null)}
                                    className="px-3 py-1.5 bg-[#252a36] hover:bg-[#2f3544] text-slate-300 font-semibold rounded-lg text-xs transition-colors"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSaveCustomPermissions(u.id)}
                                    className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-lg text-xs transition-colors"
                                  >
                                    Save Custom Access
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "matrix" && (
            <div className="space-y-4">
              <div className="p-3 bg-[#14171d] border border-[#2d323f] rounded-xl flex items-start gap-2.5 text-xs text-slate-300">
                <Info className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                <span>
                  The CRM evaluates permission scopes before permitting any sensitive database mutation,
                  export, or financial billing modification.
                </span>
              </div>

              <div className="border border-[#2d323f] rounded-xl overflow-hidden bg-[#14171d]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#2d323f] bg-[#121418] text-slate-300">
                      <th className="p-3 font-bold w-1/3">Permission Scope</th>
                      {rolesList.map((r) => (
                        <th key={r} className="p-3 font-bold text-center capitalize">
                          {ROLE_LABELS[r]?.title.split(" ")[0]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#242935]">
                    {permissionKeys.map((p) => (
                      <tr key={p.key} className="hover:bg-[#1f232c]/50 transition-colors">
                        <td className="p-3">
                          <p className="font-bold text-white">{p.label}</p>
                          <p className="text-[11px] text-slate-400">{p.desc}</p>
                        </td>
                        {rolesList.map((r) => {
                          const has = ROLE_PERMISSIONS[r][p.key];
                          return (
                            <td key={r} className="p-3 text-center">
                              {has ? (
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                                  <Check className="w-3.5 h-3.5" />
                                </span>
                              ) : (
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-800 text-slate-500 border border-slate-700">
                                  <Ban className="w-3 h-3" />
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "add" && (
            <form onSubmit={handleCreateUser} className="max-w-md mx-auto space-y-4 py-4">
              {seatsFull && (
                <div className="p-3 bg-amber-950/30 border border-amber-800/50 rounded-xl text-amber-200 text-xs font-medium flex items-start gap-2">
                  <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    You've reached your {seatLimit}-member seat limit. Remove a team member first, or upgrade your
                    plan to add more seats.
                  </span>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Taylor Morgan"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#121418] border border-[#2d323f] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="taylor@enterprisecrm.com"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-[#121418] border border-[#2d323f] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Role Assignment
                </label>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as UserRole | "custom")}
                  className="w-full px-3 py-2 bg-[#121418] border border-[#2d323f] rounded-xl text-xs text-white focus:outline-none focus:border-teal-500"
                >
                  <option value="admin">Super Administrator</option>
                  <option value="sales_manager">Sales Manager</option>
                  <option value="sales_rep">Sales Representative</option>
                  <option value="finance">Finance & Billing</option>
                  <option value="viewer">Viewer / Auditor</option>
                  <option value="custom">Custom Role (Selective Access)</option>
                </select>
                {newUserRole !== "custom" && (
                  <p className="text-[10px] text-slate-400 mt-1">
                    {ROLE_LABELS[newUserRole]?.description}
                  </p>
                )}
              </div>

              {newUserRole === "custom" && (
                <div className="space-y-3 p-3.5 bg-[#101217] rounded-xl border border-[#2d323f]">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Custom Role Title
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Regional Coordinator"
                      value={customRoleTitle}
                      onChange={(e) => setCustomRoleTitle(e.target.value)}
                      className="w-full px-3 py-1.5 bg-[#181b21] border border-[#2d323f] text-white rounded-lg text-xs focus:outline-none focus:border-teal-400"
                    />
                  </div>
                  <div>
                    <span className="block text-[11px] font-semibold text-slate-300 mb-1.5">
                      Select exactly the permissions this member should have
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {permissionKeys.map((p) => (
                        <label
                          key={p.key}
                          className="flex items-start gap-2 p-2 rounded-lg bg-[#181b21] border border-[#2d323f] cursor-pointer text-[11px] text-slate-300"
                        >
                          <input
                            type="checkbox"
                            checked={!!customPermissions[p.key]}
                            onChange={(e) =>
                              setCustomPermissions((prev) => ({ ...prev, [p.key]: e.target.checked }))
                            }
                            className="mt-0.5 rounded border-[#2d323f] bg-[#101217] text-teal-500 focus:ring-0"
                          />
                          <span>
                            <span className="block font-bold text-white">{p.label}</span>
                            <span className="block text-slate-400">{p.desc}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <button
                type="submit"
                id="btn-confirm-add-user"
                disabled={seatsFull}
                className="w-full py-2.5 bg-[#252a36] hover:bg-[#2f3544] disabled:opacity-50 disabled:cursor-not-allowed border border-[#3d4455] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md transition-all"
              >
                <UserPlus className="w-4 h-4 text-teal-400" />
                {seatsFull ? "Seat Limit Reached" : "Add Team Member with Controlled Role"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
