import React, { useState } from "react";
import { useCRM } from "../../context/CRMContext";
import {
  Search,
  Plus,
  Sparkles,
  Calendar,
  Bell,
  ChevronDown,
  Building2,
  Users,
  Briefcase,
  Receipt,
  CreditCard,
  CalendarCheck,
  CheckSquare,
  AlertCircle,
  X,
  ShieldCheck,
  Shield,
  UserCheck,
  Mail,
  LogIn,
  Menu,
  MessageSquare,
  Bot,
} from "lucide-react";
import { DateFilterRange, ROLE_LABELS, UserRole } from "../../types";
import { apiFetch } from "../../lib/apiClient";

export const Header: React.FC = () => {
  const {
    activeNav,
    setActiveNav,
    dateRange,
    setDateRange,
    setQuickCreateOpen,
    setQuickCreateType,
    setSelectedCompanyId,
    companies,
    deals,
    invoices,
    tasks,
    agentActions,
    currentUser,
    signOut,
    setAccessControlOpen,
    setAuthPageOpen,
    setAuthPageMode,
    openEmailComposer,
    openWhatsAppComposer,
    activeTenant,
    setSettingsDeepLinkTab,
    setMobileSidebarOpen,
  } = useCRM();

  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isQuickMenuOpen, setIsQuickMenuOpen] = useState(false);
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);

  // AI Smart query execution state
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [isAiSearching, setIsAiSearching] = useState(false);

  const overdueInvoices = invoices.filter(
    (i) => i.remainingBalance > 0 && new Date(i.dueDate) < new Date()
  );
  const highPriorityTasks = tasks.filter(
    (t) => t.priority === "High" && t.status !== "Completed"
  );
  const atRiskCompanies = companies.filter((c) => c.status === "At Risk");
  const pendingAgentActions = (agentActions || []).filter((a) => a.status === "pending");

  const totalAlerts =
    overdueInvoices.length +
    highPriorityTasks.length +
    atRiskCompanies.length +
    pendingAgentActions.length;

  // Search matches
  const matchedCompanies = searchQuery
    ? companies
        .filter(
          (c) =>
            c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.industry.toLowerCase().includes(searchQuery.toLowerCase())
        )
        .slice(0, 4)
    : [];

  const matchedDeals = searchQuery
    ? deals
        .filter((d) =>
          d.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
        .slice(0, 4)
    : [];

  const handleAskAI = async (customPrompt?: string) => {
    const query = customPrompt || searchQuery;
    if (!query) return;
    setIsAiSearching(true);
    setAiAnswer(null);

    try {
      const res = await apiFetch("/api/ai/smart-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      setAiAnswer(data.answer || "No insights found for this query.");
    } catch {
      setAiAnswer("Could not connect to AI search engine. Please try again.");
    } finally {
      setIsAiSearching(false);
    }
  };

  const dateOptions: DateFilterRange[] = [
    "Today",
    "This Week",
    "This Month",
    "This Quarter",
    "This Year",
    "All",
  ];

  return (
    <>
    <header
      id="crm-header"
      className="h-14 sm:h-16 bg-[#121418] border-b border-[#282d39] px-3 sm:px-6 flex items-center justify-between gap-2 z-20 shrink-0 sticky top-0 text-white"
    >
      {/* Hamburger -- opens the off-canvas sidebar on mobile/tablet (below `lg`) */}
      <button
        id="btn-mobile-menu"
        onClick={() => setMobileSidebarOpen(true)}
        className="lg:hidden p-1.5 -ml-1 rounded-lg text-slate-300 hover:text-white hover:bg-[#1f232c] transition-colors shrink-0"
        title="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Current Section Title */}
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="text-base sm:text-xl font-bold text-white tracking-tight truncate">
          {activeNav}
        </h1>
        <span className="text-xs text-teal-400 font-medium hidden sm:inline-block">
          / Overview & Management
        </span>
      </div>

      {/* Center Search Bar with Smart AI Integration -- hidden on phone/tablet,
          replaced there by the icon button below that reveals a full-width
          search row under the header instead. */}
      <div className="flex-1 max-w-md mx-6 relative hidden md:block">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            id="global-search-input"
            type="text"
            placeholder="Search companies, deals, invoices, or ask AI..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsSearchOpen(true);
            }}
            onFocus={() => setIsSearchOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleAskAI();
              }
            }}
            className="w-full pl-9 pr-24 py-1.5 bg-[#181b21] hover:bg-[#1f232c] focus:bg-[#1f232c] border border-[#2d323f] focus:border-teal-400 rounded-lg text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all"
          />
          <button
            onClick={() => handleAskAI()}
            disabled={isAiSearching}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded text-[11px] font-semibold bg-[#252a36] text-teal-300 hover:bg-[#2f3544] flex items-center gap-1 border border-[#3d4455] transition-colors"
            title="Ask AI regarding your CRM"
          >
            <Sparkles className="w-3 h-3 text-teal-300" />
            <span>Ask AI</span>
          </button>
        </div>

        {/* Search Results Dropdown */}
        {isSearchOpen && (searchQuery.length > 0 || aiAnswer) && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-[#181b21] border border-[#2d323f] rounded-xl shadow-2xl overflow-hidden z-50 text-white animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="p-3 border-b border-[#2d323f] flex items-center justify-between bg-[#121418]">
              <span className="text-xs font-semibold text-teal-300">
                Search Results & Insights
              </span>
              <button
                onClick={() => {
                  setIsSearchOpen(false);
                  setAiAnswer(null);
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* AI Answer Box */}
            {isAiSearching && (
              <div className="p-4 flex items-center gap-3 text-xs text-teal-200 bg-[#121418]">
                <Sparkles className="w-4 h-4 animate-spin text-teal-400" />
                <span>AarPex AI is analyzing CRM records...</span>
              </div>
            )}

            {aiAnswer && (
              <div className="p-4 bg-[#1f232c] border-b border-[#2d323f] text-xs text-slate-100">
                <div className="font-bold text-teal-300 flex items-center gap-1.5 mb-1">
                  <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                  AI Intelligence Insight
                </div>
                <p className="leading-relaxed whitespace-pre-wrap">{aiAnswer}</p>
              </div>
            )}

            {/* Direct matches */}
            <div className="max-h-64 overflow-y-auto p-2 space-y-2 custom-scrollbar">
              {matchedCompanies.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1">
                    Companies
                  </div>
                  {matchedCompanies.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setSelectedCompanyId(c.id);
                        setIsSearchOpen(false);
                      }}
                      className="w-full flex items-center justify-between p-2 hover:bg-[#222630] rounded-lg text-left text-xs text-slate-200 group transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Building2 className="w-3.5 h-3.5 text-slate-400 group-hover:text-teal-400" />
                        <span className="font-medium text-white">{c.name}</span>
                        <span className="text-slate-400 text-[11px]">({c.city})</span>
                      </div>
                      <span className="text-teal-300 text-[10px] font-mono">
                        ${(c.totalRevenue || 0).toLocaleString()}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {matchedDeals.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1">
                    Deals
                  </div>
                  {matchedDeals.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => {
                        setActiveNav("Deals");
                        setIsSearchOpen(false);
                      }}
                      className="w-full flex items-center justify-between p-2 hover:bg-[#222630] rounded-lg text-left text-xs text-slate-200 group transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Briefcase className="w-3.5 h-3.5 text-slate-400 group-hover:text-teal-400" />
                        <span className="font-medium text-white">{d.name}</span>
                      </div>
                      <span className="text-teal-300 text-[10px] font-mono font-bold">
                        ${d.dealValue.toLocaleString()}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Right side controls */}
      <div className="flex items-center gap-1.5 sm:gap-3">
        {/* Mobile-only search trigger -- expands the full-width search row
            rendered below the header on phone/tablet. */}
        <button
          onClick={() => setIsMobileSearchOpen((v) => !v)}
          className="md:hidden p-2 rounded-lg bg-[#181b21] hover:bg-[#222630] border border-[#2d323f] text-slate-300 hover:text-white transition-colors"
          title="Search"
        >
          <Search className="w-4 h-4" />
        </button>

        {/* Controlled Access / Roles Button -- secondary action, tucked away below `lg` */}
        <button
          id="btn-access-roles"
          onClick={() => setAccessControlOpen(true)}
          className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 bg-[#181b21] hover:bg-[#222630] border border-[#2d323f] text-slate-200 hover:text-white rounded-lg text-xs font-semibold transition-colors"
          title="Manage Controlled User Access & Roles"
        >
          <Shield className="w-3.5 h-3.5 text-teal-400" />
          <span className="hidden xl:inline">Access & Roles</span>
        </button>

        {/* Billing Shortcut — always available, including mid-trial, so an
            owner can add/change a card or open the Stripe portal without
            waiting for the trial to end. Reachable on mobile via Settings
            when this shortcut is hidden below `sm`. */}
        <button
          id="btn-header-billing"
          onClick={() => {
            setSettingsDeepLinkTab("subscription");
            setActiveNav("Settings");
          }}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-[#181b21] hover:bg-[#222630] border border-[#2d323f] text-slate-200 hover:text-white rounded-lg text-xs font-semibold transition-colors"
          title={
            activeTenant?.subscriptionStatus === "trialing"
              ? "Manage billing & payment method (you're still on your free trial)"
              : "Manage billing & payment method"
          }
        >
          <CreditCard className="w-3.5 h-3.5 text-teal-400" />
          <span className="hidden md:inline">Billing</span>
          {activeTenant?.subscriptionStatus === "trialing" && (
            <span className="hidden lg:inline text-[9px] font-bold uppercase tracking-wider text-amber-300 bg-amber-400/10 border border-amber-400/30 rounded px-1 py-0.5">
              Trial
            </span>
          )}
        </button>

        {/* User Badge / Sign Out */}
        <button
          id="btn-user-signout"
          onClick={() => {
            if (confirm("Sign out of AarPex?")) signOut();
          }}
          className="flex items-center gap-2 px-1.5 sm:px-2.5 py-1 bg-[#181b21] hover:bg-[#222630] border border-[#2d323f] rounded-lg text-left transition-colors group"
          title="Sign out"
        >
          <div className="w-6 h-6 rounded-full bg-[#252a36] border border-[#3d4455] text-teal-300 flex items-center justify-center text-[10px] font-bold shrink-0">
            {currentUser.avatar || "U"}
          </div>
          <div className="hidden lg:block text-left pr-1">
            <div className="text-[11px] font-bold text-white leading-tight flex items-center gap-1">
              {currentUser.name.split(" ")[0]}
              {currentUser.isGoogleAccount && (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              )}
            </div>
            <div className="text-[9px] text-slate-400 uppercase tracking-wider">
              {ROLE_LABELS[(currentUser.role as UserRole) || "viewer"]?.title.split(" ")[0] || currentUser.role}
            </div>
          </div>
          <LogIn className="hidden sm:block w-3.5 h-3.5 text-slate-400 group-hover:text-rose-400 rotate-180" />
        </button>

        {/* Global Date Filter Pill */}
        <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 bg-[#181b21] border border-[#2d323f] rounded-lg text-xs text-slate-300">
          <Calendar className="w-3.5 h-3.5 text-teal-400" />
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as DateFilterRange)}
            className="bg-transparent border-none text-white focus:outline-none text-xs font-semibold cursor-pointer"
          >
            {dateOptions.map((opt) => (
              <option key={opt} value={opt} className="bg-[#181b21] text-white">
                {opt}
              </option>
            ))}
          </select>
        </div>

        {/* Real-time Alerts Notification Bell */}
        <div className="relative">
          <button
            id="btn-header-alerts"
            onClick={() => setIsAlertsOpen(!isAlertsOpen)}
            className="p-2 rounded-lg bg-[#181b21] hover:bg-[#222630] border border-[#2d323f] text-slate-300 hover:text-white relative transition-colors"
          >
            <Bell className="w-4 h-4" />
            {totalAlerts > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center shadow-sm">
                {totalAlerts}
              </span>
            )}
          </button>

          {isAlertsOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-[#181b21] border border-[#2d323f] rounded-xl shadow-2xl overflow-hidden z-50 text-white animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="p-3 border-b border-[#2d323f] flex items-center justify-between bg-[#121418]">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-teal-400" />
                  Actionable CRM Alerts
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#252a36] text-slate-300">
                  {totalAlerts} Pending
                </span>
              </div>

              <div className="max-h-72 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                {overdueInvoices.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold text-rose-400 uppercase tracking-wider px-2 py-0.5">
                      Overdue Invoices ({overdueInvoices.length})
                    </div>
                    {overdueInvoices.slice(0, 3).map((inv) => (
                      <div
                        key={inv.id}
                        onClick={() => {
                          setActiveNav("Invoices");
                          setIsAlertsOpen(false);
                        }}
                        className="p-2 hover:bg-[#222630] rounded-lg cursor-pointer text-xs transition-colors"
                      >
                        <div className="flex justify-between font-medium text-white">
                          <span>{inv.invoiceNumber}</span>
                          <span className="text-rose-400 font-bold font-mono">
                            ${inv.remainingBalance.toLocaleString()}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Due: {inv.dueDate}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {highPriorityTasks.length > 0 && (
                  <div className="pt-2">
                    <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider px-2 py-0.5 flex items-center gap-1">
                      <CheckSquare className="w-3 h-3 text-amber-400" /> Urgent Follow-ups ({highPriorityTasks.length})
                    </div>
                    {highPriorityTasks.slice(0, 3).map((tsk) => (
                      <div
                        key={tsk.id}
                        onClick={() => {
                          setActiveNav("Tasks");
                          setIsAlertsOpen(false);
                        }}
                        className="p-2 hover:bg-[#222630] rounded-lg cursor-pointer text-xs transition-colors"
                      >
                        <div className="font-medium text-white">
                          {tsk.title}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Due: {tsk.dueDate}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {pendingAgentActions.length > 0 && (
                  <div className="pt-2">
                    <div className="text-[10px] font-bold text-teal-400 uppercase tracking-wider px-2 py-0.5 flex items-center gap-1">
                      <Bot className="w-3 h-3 text-teal-400" /> Agent Approvals ({pendingAgentActions.length})
                    </div>
                    {pendingAgentActions.slice(0, 3).map((act) => (
                      <div
                        key={act.id}
                        onClick={() => {
                          setActiveNav("Agent Approvals");
                          setIsAlertsOpen(false);
                        }}
                        className="p-2 hover:bg-[#222630] rounded-lg cursor-pointer text-xs transition-colors"
                      >
                        <div className="font-medium text-white">
                          {act.recipientName}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {act.subject}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {totalAlerts === 0 && (
                  <div className="p-4 text-center text-xs text-slate-400">
                    All accounts and tasks are up to date!
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Compose Email with Attachments Button */}
        <button
          id="btn-header-compose-mail"
          onClick={() => openEmailComposer()}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/40 text-teal-300 rounded-lg text-xs font-bold shadow-sm transition-all"
          title="Compose Email with Multiple Attachments"
        >
          <Mail className="w-3.5 h-3.5 text-teal-400" />
          <span className="hidden md:inline">Compose</span>
        </button>

        {/* Send WhatsApp Message Button */}
        <button
          id="btn-header-whatsapp"
          onClick={() => openWhatsAppComposer()}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 rounded-lg text-xs font-bold shadow-sm transition-all"
          title="Send a WhatsApp Message"
        >
          <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
          <span className="hidden md:inline">WhatsApp</span>
        </button>

        {/* Global Quick Create Dropdown Button (Executive Slate-Grey) */}
        <div className="relative">
          <button
            id="btn-header-quick-add"
            onClick={() => setIsQuickMenuOpen(!isQuickMenuOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#252a36] hover:bg-[#2f3544] border border-[#3d4455] text-white rounded-lg text-xs font-bold shadow-sm transition-all"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span className="hidden sm:inline">Add</span>
            <ChevronDown className="w-3 h-3 text-slate-300" />
          </button>

          {isQuickMenuOpen && (
            <div className="absolute right-0 mt-2 w-52 bg-[#181b21] border border-[#2d323f] rounded-xl shadow-2xl overflow-hidden z-50 p-1.5 text-white">
              <button
                onClick={() => {
                  openEmailComposer();
                  setIsQuickMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-xs text-teal-300 hover:bg-teal-950/40 hover:text-teal-200 rounded-md text-left transition-colors font-semibold"
              >
                <Mail className="w-3.5 h-3.5 text-teal-400" />
                <span>Send Email (Attachments)</span>
              </button>

              <button
                onClick={() => {
                  openWhatsAppComposer();
                  setIsQuickMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-xs text-emerald-300 hover:bg-emerald-950/40 hover:text-emerald-200 rounded-md text-left transition-colors font-semibold"
              >
                <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                <span>Send WhatsApp Message</span>
              </button>

              <div className="border-t border-[#282d39] my-1" />

              {[
                { label: "New Lead", type: "lead" as const, icon: Users },
                { label: "New Deal", type: "deal" as const, icon: Briefcase },
                { label: "New Company", type: "company" as const, icon: Building2 },
                { label: "New Contact", type: "contact" as const, icon: Users },
                { label: "New Invoice", type: "invoice" as const, icon: Receipt },
                { label: "Record Payment", type: "payment" as const, icon: CreditCard },
                { label: "Log Activity", type: "activity" as const, icon: CalendarCheck },
                { label: "Create Task", type: "task" as const, icon: CheckSquare },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    onClick={() => {
                      setQuickCreateType(item.type);
                      setQuickCreateOpen(true);
                      setIsQuickMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-[#222630] hover:text-white rounded-md text-left transition-colors"
                  >
                    <Icon className="w-3.5 h-3.5 text-teal-400" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Dedicated Sign In / Sign Up Access Trigger */}
        <button
          onClick={() => {
            setAuthPageMode("signin");
            setAuthPageOpen(true);
          }}
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 bg-[#181b21] hover:bg-[#222630] border border-[#2d323f] text-slate-300 hover:text-white rounded-lg text-xs font-semibold transition-all"
          title="Open Dedicated Sign In / Sign Up Portal"
        >
          <LogIn className="w-3.5 h-3.5 text-teal-400" />
          <span>Sign In / Up</span>
        </button>
      </div>
    </header>

    {/* Mobile/tablet search row -- revealed by the search icon button above.
        Reuses the same AI-search behavior as the desktop bar. */}
    {isMobileSearchOpen && (
      <div className="md:hidden bg-[#121418] border-b border-[#282d39] px-3 py-2.5 sticky top-14 z-20">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            autoFocus
            placeholder="Search or ask AI..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsSearchOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAskAI();
            }}
            className="w-full pl-9 pr-16 py-2 bg-[#181b21] border border-[#2d323f] focus:border-teal-400 rounded-lg text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all"
          />
          <button
            onClick={() => handleAskAI()}
            disabled={isAiSearching}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2 py-1 rounded text-[11px] font-semibold bg-[#252a36] text-teal-300 hover:bg-[#2f3544] flex items-center gap-1 border border-[#3d4455] transition-colors"
          >
            <Sparkles className="w-3 h-3 text-teal-300" />
            <span>AI</span>
          </button>
        </div>

        {(searchQuery.length > 0 || aiAnswer) && (
          <div className="mt-2 bg-[#181b21] border border-[#2d323f] rounded-xl shadow-2xl overflow-hidden text-white animate-in fade-in duration-150">
            {isAiSearching && (
              <div className="p-3 flex items-center gap-2 text-xs text-teal-200">
                <Sparkles className="w-4 h-4 animate-spin text-teal-400" />
                <span>AarPex AI is analyzing CRM records...</span>
              </div>
            )}
            {aiAnswer && (
              <div className="p-3 bg-[#1f232c] border-b border-[#2d323f] text-xs text-slate-100">
                <p className="leading-relaxed whitespace-pre-wrap">{aiAnswer}</p>
              </div>
            )}
            <div className="max-h-56 overflow-y-auto p-2 space-y-2 custom-scrollbar">
              {matchedCompanies.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setSelectedCompanyId(c.id);
                    setIsMobileSearchOpen(false);
                  }}
                  className="w-full flex items-center justify-between p-2 hover:bg-[#222630] rounded-lg text-left text-xs text-slate-200"
                >
                  <span className="flex items-center gap-2">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-medium text-white">{c.name}</span>
                  </span>
                </button>
              ))}
              {matchedDeals.map((d) => (
                <button
                  key={d.id}
                  onClick={() => {
                    setActiveNav("Deals");
                    setIsMobileSearchOpen(false);
                  }}
                  className="w-full flex items-center justify-between p-2 hover:bg-[#222630] rounded-lg text-left text-xs text-slate-200"
                >
                  <span className="flex items-center gap-2">
                    <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-medium text-white">{d.name}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    )}
    </>
  );
};
