import React from "react";
import { useCRM, NavView } from "../../context/CRMContext";
import {
  LayoutDashboard,
  Users,
  Building2,
  UserCheck,
  Briefcase,
  GitBranch,
  CalendarCheck,
  Receipt,
  CreditCard,
  TrendingUp,
  CheckSquare,
  Sparkles,
  BarChart3,
  Settings,
  Plus,
  ChevronRight,
  ChevronDown,
  Check,
  ShieldAlert,
  ShieldCheck,
  Mail,
  LogIn,
  UserPlus,
  LogOut,
  Landmark,
  Inbox as InboxIcon,
  Package,
  X,
  BookOpen,
  BookMarked,
} from "lucide-react";
import { ROLE_LABELS, UserRole } from "../../types";

interface NavItem {
  name: NavView;
  icon: React.ElementType;
  badge?: number | string;
  badgeColor?: string;
  category: "Core" | "Sales" | "Finance" | "Productivity" | "Intelligence" | "Marketing" | "System";
}

export const Sidebar: React.FC = () => {
  const {
    activeNav,
    setActiveNav,
    leads,
    deals,
    invoices,
    tasks,
    emailCampaigns,
    setQuickCreateOpen,
    setSelectedCompanyId,
    currentUser,
    signOut,
    tenants,
    activeTenant,
    activeTenantId,
    switchTenant,
    products,
    knowledgeBase,
    industryPlaybooks,
    setCreateTenantModalOpen,
    setAuthPageOpen,
    setAuthPageMode,
    openEmailComposer,
    isMobileSidebarOpen,
    setMobileSidebarOpen,
  } = useCRM();

  const [isWorkspaceDropdownOpen, setWorkspaceDropdownOpen] = React.useState(false);
  const [isUserMenuOpen, setUserMenuOpen] = React.useState(false);

  const openDealsCount = deals.filter((d) => d.status === "Open").length;
  const overdueInvoicesCount = invoices.filter(
    (i) => i.remainingBalance > 0 && new Date(i.dueDate) < new Date()
  ).length;
  const pendingTasksCount = tasks.filter((t) => t.status !== "Completed").length;

  const navItems: NavItem[] = [
    { name: "Dashboard", icon: LayoutDashboard, category: "Core" },
    { name: "Leads", icon: UserCheck, badge: leads.filter((l) => l.status === "New").length || undefined, category: "Core" },
    { name: "Contacts", icon: Users, category: "Core" },
    { name: "Companies", icon: Building2, category: "Core" },

    { name: "Deals", icon: Briefcase, badge: openDealsCount, category: "Sales" },
    { name: "Pipelines", icon: GitBranch, category: "Sales" },
    { name: "Activities", icon: CalendarCheck, category: "Sales" },
    { name: "Products", icon: Package, badge: products?.length || undefined, category: "Sales" },

    {
      name: "Invoices",
      icon: Receipt,
      badge: overdueInvoicesCount > 0 ? `${overdueInvoicesCount} overdue` : undefined,
      badgeColor: overdueInvoicesCount > 0 ? "bg-rose-950/80 text-rose-300 border border-rose-500/40" : undefined,
      category: "Finance",
    },
    { name: "Payments", icon: CreditCard, category: "Finance" },
    { name: "Revenue", icon: TrendingUp, category: "Finance" },
    { name: "Stripe", icon: Landmark, category: "Finance" },

    { name: "Tasks", icon: CheckSquare, badge: pendingTasksCount, category: "Productivity" },
    { name: "AI Insights", icon: Sparkles, badge: "AI", badgeColor: "bg-[#252a36] text-teal-300 border border-[#3d4455] font-semibold", category: "Intelligence" },
    { name: "Knowledge Base", icon: BookOpen, badge: knowledgeBase?.length || undefined, category: "Intelligence" },
    { name: "Industry Playbooks", icon: BookMarked, badge: industryPlaybooks?.length || undefined, category: "Intelligence" },

    {
      name: "Email Marketing",
      icon: Mail,
      badge: emailCampaigns.filter((c) => c.status === "Active").length || undefined,
      badgeColor: "bg-[#252a36] text-teal-300 border border-[#3d4455] font-semibold",
      category: "Marketing",
    },
    {
      name: "Inbox",
      icon: InboxIcon,
      badge: emailCampaigns.reduce((sum, c) => sum + c.audienceIds.filter((id) => !(c.repliedAudienceIds || []).includes(id)).length, 0) || undefined,
      badgeColor: "bg-[#252a36] text-amber-300 border border-[#3d4455] font-semibold",
      category: "Marketing",
    },

    { name: "Reports", icon: BarChart3, category: "System" },
    { name: "Settings", icon: Settings, category: "System" },
  ];

  const categories: Array<NavItem["category"]> = [
    "Core",
    "Sales",
    "Finance",
    "Productivity",
    "Intelligence",
    "Marketing",
    "System",
  ];

  return (
    <>
      {/* Mobile/tablet backdrop -- tapping it closes the drawer. Irrelevant
          at `lg` and above, where the sidebar is always docked in place. */}
      {isMobileSidebarOpen && (
        <div
          onClick={() => setMobileSidebarOpen(false)}
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-2xs z-40 lg:hidden animate-in fade-in duration-150"
        />
      )}

      <aside
        id="crm-sidebar"
        className={`w-64 bg-[#121418] border-r border-[#282d39] flex flex-col h-screen shrink-0 select-none text-slate-300 fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-in-out lg:static lg:z-auto lg:translate-x-0 ${
          isMobileSidebarOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        }`}
      >
        {/* AarPex Brand Header */}
        <div className="px-4 py-3 border-b border-[#282d39] bg-[#14171d]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src={`${import.meta.env.BASE_URL}assets/aarpex-logo-192.png`}
                alt="AarPex"
                className="w-8 h-8 rounded-lg border border-teal-500/40 shadow-sm shrink-0 object-cover"
              />
              <div className="min-w-0">
                <div className="font-extrabold text-white text-sm tracking-tight leading-none flex items-center gap-1.5">
                  <span>AarPex</span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-teal-950/60 border border-teal-500/30 text-teal-300">
                    CRM
                  </span>
                </div>
                <div className="text-[10px] text-teal-400 font-medium truncate mt-0.5">
                  by Aargard Business Solutions
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="hidden sm:inline text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-[#222630] text-slate-400 border border-[#3d4455]">
                Multi-Tenant
              </span>
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="lg:hidden p-1 rounded-md text-slate-400 hover:text-white hover:bg-[#222630] transition-colors"
                title="Close menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

      {/* Multi-Tenant Workspace Header with Switcher Dropdown */}
      <div className="h-14 px-4 border-b border-[#282d39] flex items-center justify-between relative bg-[#121418]">
        <button
          onClick={() => setWorkspaceDropdownOpen(!isWorkspaceDropdownOpen)}
          className="w-full flex items-center justify-between p-1.5 rounded-xl hover:bg-[#1c2027] transition-all group text-left"
          title="Switch Tenant Workspace"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500/20 to-teal-500/5 border border-teal-500/30 flex items-center justify-center text-teal-300 font-black text-sm shrink-0 shadow-sm">
              {activeTenant?.logo || activeTenant?.name?.charAt(0) || "W"}
            </div>
            <div className="min-w-0">
              <div className="font-bold text-white text-xs tracking-tight truncate group-hover:text-teal-300 transition-colors flex items-center gap-1">
                <span className="truncate">{activeTenant?.name || "Workspace"}</span>
              </div>
              <div className="text-[10px] text-slate-400 truncate flex items-center gap-1">
                <span>{activeTenant?.plan || "Growth"} Tier</span>
                <span>•</span>
                <span className="text-teal-400 font-semibold">{activeTenant?.currency || "USD"}</span>
              </div>
            </div>
          </div>
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-transform ${
              isWorkspaceDropdownOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        {/* Workspace Switcher Popover */}
        {isWorkspaceDropdownOpen && (
          <div className="absolute top-full left-3 right-3 mt-1 bg-[#181b21] border border-[#2d323f] rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-1 duration-150 p-1.5">
            <div className="px-2.5 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-[#282d39] flex items-center justify-between">
              <span>Workspaces ({tenants?.length || 1})</span>
              <span className="text-teal-400">Multi-Tenant</span>
            </div>

            <div className="max-h-48 overflow-y-auto py-1 space-y-0.5 custom-scrollbar">
              {tenants?.map((t: any) => {
                const isSelected = t.id === activeTenantId;
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      switchTenant(t.id);
                      setWorkspaceDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors ${
                      isSelected
                        ? "bg-teal-600/20 text-teal-300 font-bold"
                        : "text-slate-300 hover:bg-[#252a36] hover:text-white"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-5 h-5 rounded bg-[#252a36] border border-[#3d4455] flex items-center justify-center text-[10px] font-bold text-slate-300 shrink-0">
                        {t.logo || t.name.charAt(0)}
                      </div>
                      <span className="truncate">{t.name}</span>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-teal-400 shrink-0" />}
                  </button>
                );
              })}
            </div>

            <div className="pt-1 mt-1 border-t border-[#282d39] space-y-1">
              <button
                onClick={() => {
                  setWorkspaceDropdownOpen(false);
                  setCreateTenantModalOpen(true);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-teal-300 hover:bg-[#252a36] hover:text-teal-200 rounded-lg font-semibold transition-colors"
              >
                <Plus className="w-3.5 h-3.5 text-teal-400" />
                <span>Create New Workspace</span>
              </button>

              <button
                onClick={() => {
                  setWorkspaceDropdownOpen(false);
                  setActiveNav("Settings");
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-400 hover:bg-[#252a36] hover:text-white rounded-lg transition-colors"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Workspace Settings</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Quick Action Button */}
      <div className="p-3 border-b border-[#282d39]">
        <button
          id="btn-quick-create-sidebar"
          onClick={() => {
            setQuickCreateOpen(true);
            setMobileSidebarOpen(false);
          }}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-[#252a36] hover:bg-[#2f3544] text-white text-xs font-semibold rounded-lg shadow-sm border border-[#3d4455] transition-all duration-150 group"
        >
          <Plus className="w-4 h-4 transition-transform group-hover:rotate-90 duration-200 text-teal-400" />
          <span>Create New Record</span>
        </button>
      </div>

      {/* Navigation Links Scrollable */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-5 custom-scrollbar">
        {categories.map((cat) => {
          const items = navItems.filter((i) => i.category === cat);
          if (items.length === 0) return null;

          return (
            <div key={cat} className="space-y-1">
              <div className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {cat}
              </div>
              {items.map((item) => {
                const Icon = item.icon;
                const isActive = activeNav === item.name;

                return (
                  <button
                    key={item.name}
                    id={`nav-${item.name.toLowerCase().replace(/\s+/g, "-")}`}
                    onClick={() => {
                      setActiveNav(item.name);
                      setSelectedCompanyId(null);
                      setMobileSidebarOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition-colors group ${
                      isActive
                        ? "bg-[#1f232c] text-white font-semibold border-l-2 border-teal-400 pl-2 shadow-sm"
                        : "text-slate-300 hover:bg-[#181b21] hover:text-white"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          isActive
                            ? "text-teal-400"
                            : "text-slate-400 group-hover:text-teal-400"
                        }`}
                      />
                      <span className="truncate">{item.name}</span>
                    </div>

                    {item.badge !== undefined && (
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                          item.badgeColor ||
                          (isActive
                            ? "bg-teal-500/20 text-teal-300 border border-teal-500/30 font-bold"
                            : "bg-[#181b21] text-slate-400 border border-[#2d323f] group-hover:border-teal-500/40")
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Critical Overdue Warning if present */}
      {overdueInvoicesCount > 0 && (
        <div className="p-3 mx-3 mb-3 rounded-lg bg-rose-950/40 border border-rose-800/60 flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="text-[11px] text-rose-200">
            <div className="font-semibold">{overdueInvoicesCount} Overdue Invoices</div>
            <div className="text-rose-300 text-[10px] mt-0.5">
              Cash flow action required
            </div>
          </div>
        </div>
      )}

      {/* Active User Footer with Dynamic Profile & Auth Hub */}
      <div className="relative border-t border-[#282d39] bg-[#14171d]">
        <div
          onClick={() => setUserMenuOpen(!isUserMenuOpen)}
          className="p-3 flex items-center justify-between hover:bg-[#181b21] cursor-pointer transition-colors"
          title="Account & Workspace authentication"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-full bg-[#252a36] border border-[#3d4455] flex items-center justify-center text-xs font-bold text-teal-300 shrink-0">
              {currentUser.avatar || "AR"}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-white truncate flex items-center gap-1">
                {currentUser.name}
                {currentUser.isGoogleAccount && (
                  <ShieldCheck className="w-3 h-3 text-blue-400 shrink-0" />
                )}
              </div>
              <div className="text-[10px] text-slate-400 truncate">
                {ROLE_LABELS[(currentUser.role as UserRole) || "viewer"]?.title || currentUser.role}
              </div>
            </div>
          </div>
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
              isUserMenuOpen ? "rotate-180" : ""
            }`}
          />
        </div>

        {/* User Account Popover */}
        {isUserMenuOpen && (
          <div className="absolute bottom-full left-2 right-2 mb-2 p-1.5 bg-[#181b21] border border-[#2d323f] rounded-xl shadow-2xl z-50 text-white space-y-1">
            <div className="px-2.5 py-1.5 border-b border-[#282d39] text-[10px] text-slate-400 flex items-center justify-between">
              <span>Account Hub</span>
              <span className="text-teal-400 font-mono">{activeTenant?.slug}</span>
            </div>

            <button
              type="button"
              onClick={() => {
                setAuthPageMode("signin");
                setAuthPageOpen(true);
                setUserMenuOpen(false);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-[#222630] hover:text-white rounded-lg text-left transition-colors font-medium"
            >
              <LogIn className="w-3.5 h-3.5 text-teal-400" />
              <span>Sign In / Switch Persona</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setAuthPageMode("signup");
                setAuthPageOpen(true);
                setUserMenuOpen(false);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-[#222630] hover:text-white rounded-lg text-left transition-colors font-medium"
            >
              <UserPlus className="w-3.5 h-3.5 text-teal-400" />
              <span>Create Account / Workspace</span>
            </button>

            <button
              type="button"
              onClick={() => {
                openEmailComposer();
                setUserMenuOpen(false);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-teal-300 hover:bg-teal-950/40 hover:text-teal-200 rounded-lg text-left transition-colors font-medium"
            >
              <Mail className="w-3.5 h-3.5 text-teal-400" />
              <span>Compose Email (Attachments)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setUserMenuOpen(false);
                if (confirm("Sign out of AarPex?")) signOut();
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-rose-300 hover:bg-rose-950/40 hover:text-rose-200 rounded-lg text-left transition-colors font-medium"
            >
              <LogOut className="w-3.5 h-3.5 text-rose-400" />
              <span>Sign Out</span>
            </button>

            <div className="border-t border-[#282d39] pt-1">
              <button
                type="button"
                onClick={() => {
                  setActiveNav("Settings");
                  setUserMenuOpen(false);
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-[#222630] rounded-lg text-left transition-colors"
              >
                <span>Workspace Settings</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
      </div>
      </aside>
    </>
  );
};
