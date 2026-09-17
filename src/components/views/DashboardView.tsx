import React, { useState, useEffect } from "react";
import { useCRM } from "../../context/CRMContext";
import {
  DollarSign,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  Briefcase,
  Users,
  Receipt,
  CreditCard,
  Clock,
  Sparkles,
  ArrowUpRight,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { apiFetch } from "../../lib/apiClient";

export const DashboardView: React.FC = () => {
  const {
    leads,
    deals,
    invoices,
    companies,
    tasks,
    pipelines,
    currentUser,
    setActiveNav,
    setSelectedCompanyId,
    setQuickCreateOpen,
    setQuickCreateType,
    loadSampleData,
  } = useCRM();

  const [briefing, setBriefing] = useState<any>(null);
  const [isBriefingLoading, setIsBriefingLoading] = useState(false);

  // Computed Metrics
  const openDeals = deals.filter((d) => d.status === "Open");
  const wonDeals = deals.filter((d) => d.status === "Won");
  const lostDeals = deals.filter((d) => d.status === "Lost");

  const pipelineValue = openDeals.reduce((sum, d) => sum + d.dealValue, 0);
  const weightedPipelineValue = openDeals.reduce(
    (sum, d) => sum + (d.dealValue * (d.probability || 0)) / 100,
    0
  );
  const wonRevenue = wonDeals.reduce((sum, d) => sum + d.dealValue, 0);
  const winRate =
    deals.length > 0
      ? Math.round((wonDeals.length / (wonDeals.length + lostDeals.length || 1)) * 100)
      : 0;

  const totalInvoiced = invoices.reduce((sum, i) => sum + i.total, 0);
  const totalCollected = invoices.reduce((sum, i) => sum + i.amountPaid, 0);
  const outstandingBalance = invoices.reduce(
    (sum, i) => sum + i.remainingBalance,
    0
  );

  const overdueInvoicesList = invoices.filter(
    (i) => i.remainingBalance > 0 && new Date(i.dueDate) < new Date()
  );
  const overdueBalance = overdueInvoicesList.reduce(
    (sum, i) => sum + i.remainingBalance,
    0
  );

  // Recharts Monthly Revenue vs Collection
  const monthlyData = [
    { month: "Jan", invoiced: 45000, collected: 42000 },
    { month: "Feb", invoiced: 68000, collected: 54000 },
    { month: "Mar", invoiced: 92000, collected: 81000 },
    { month: "Apr", invoiced: 115000, collected: 96000 },
    { month: "May", invoiced: 84000, collected: 88000 },
    { month: "Jun", invoiced: 138000, collected: 112000 },
  ];

  // Pipeline stages distribution — deals reference a stageId scoped to their
  // own pipeline (e.g. "stg_nb_4"), not a shared stage name, so this looks
  // each open deal's stage up across every pipeline and rolls same-named
  // stages (e.g. "Negotiation" appears in more than one pipeline) together,
  // ordered by each pipeline's own stage ordering.
  const stageLookup = new Map<string, { name: string; order: number }>();
  pipelines.forEach((p) => {
    p.stages.forEach((s) => {
      if (!s.isWon && !s.isLost) {
        stageLookup.set(s.id, { name: s.name, order: s.order });
      }
    });
  });

  const stageTotals = new Map<string, { count: number; value: number; order: number }>();
  openDeals.forEach((d) => {
    const info = stageLookup.get(d.stageId);
    const stageName = info?.name || "Other";
    const order = info?.order ?? 999;
    const existing = stageTotals.get(stageName) || { count: 0, value: 0, order };
    existing.count += 1;
    existing.value += d.dealValue;
    stageTotals.set(stageName, existing);
  });

  const stageData = Array.from(stageTotals.entries())
    .map(([stage, v]) => ({ stage, count: v.count, value: v.value, order: v.order }))
    .sort((a, b) => a.order - b.order);

  // Sales rep quota leaderboard
  const repPerformance = [
    { name: "Sarah Jenkins", target: 200000, closedWon: 165000, progress: 82.5 },
    { name: "David Miller", target: 180000, closedWon: 135000, progress: 75.0 },
    { name: "Elena Rostova", target: 150000, closedWon: 142000, progress: 94.6 },
    { name: "Hamza Sheikh", target: 160000, closedWon: 98000, progress: 61.2 },
  ];

  const fetchDailyBriefing = async () => {
    setIsBriefingLoading(true);
    try {
      const res = await apiFetch("/api/ai/daily-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pipelineValue,
          wonRevenue,
          overdueBalance,
          overdueCount: overdueInvoicesList.length,
          pendingTasks: tasks.filter((t) => t.status !== "Completed").length,
        }),
      });
      const data = await res.json();
      setBriefing(data);
    } catch {
      setBriefing({
        headline: `CRM status healthy: $${(pipelineValue / 1000).toFixed(0)}k active pipeline with $${(wonRevenue / 1000).toFixed(0)}k closed. Attention needed on ${overdueInvoicesList.length} overdue client accounts.`,
        priorityAlerts: [
          "Follow up on 2 high-value enterprise proposals awaiting signature",
          "Escalate overdue collections for Apex Quant Systems",
          "3 scheduled discovery calls due today",
        ],
      });
    } finally {
      setIsBriefingLoading(false);
    }
  };

  useEffect(() => {
    fetchDailyBriefing();
  }, []);

  return (
    <div id="dashboard-view" className="space-y-6 animate-in fade-in duration-200 text-slate-100">
      {/* Empty-state banner: offer sample data for brand-new, unpopulated workspaces */}
      {companies.length === 0 && (
        <div className="bg-teal-950/40 border border-teal-800/50 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-teal-200 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-teal-400" />
              This workspace is empty
            </h3>
            <p className="text-xs text-teal-100/70 max-w-xl">
              Start adding your own companies, deals, and invoices — or load sample data to explore what AarPex can do first.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={loadSampleData}
              className="px-3.5 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-semibold shadow-md transition-all"
            >
              Load Sample Data
            </button>
            <button
              onClick={() => {
                setQuickCreateType("company");
                setQuickCreateOpen(true);
              }}
              className="px-3.5 py-2 bg-[#252a36] hover:bg-[#2f3544] text-white rounded-xl text-xs font-semibold border border-[#3d4455] shadow-sm transition-all"
            >
              Add Your Own Data
            </button>
          </div>
        </div>
      )}

      {/* Top Banner with AI Daily Briefing (Graphite & Slate Grey) */}
      <div className="bg-[#181b21] rounded-2xl p-6 text-white border border-[#2d323f] shadow-xl relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5 z-10">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-[#252a36] text-teal-300 border border-[#3d4455] text-[11px] font-bold flex items-center gap-1.5 shadow-sm">
                <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                Executive Sales Intelligence
              </span>
              <span className="text-slate-400 text-xs font-mono">
                Live Briefing • 8:00 AM
              </span>
            </div>
            <h2 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-2">
              Good morning, <span className="text-teal-300">{currentUser.name}</span>.
            </h2>
            <p className="text-slate-300 text-xs max-w-2xl leading-relaxed">
              {briefing?.headline ||
                `Pipeline is healthy at $${(pipelineValue / 1000).toFixed(0)}k with $${(wonRevenue / 1000).toFixed(0)}k won this period. Priority action: ${overdueInvoicesList.length} invoices are overdue and require collection escalation.`}
            </p>
          </div>

          <div className="flex items-center gap-3 z-10 shrink-0">
            <button
              onClick={fetchDailyBriefing}
              disabled={isBriefingLoading}
              className="px-3.5 py-2 bg-[#252a36] hover:bg-[#2f3544] text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md border border-[#3d4455] transition-all"
            >
              <Sparkles className="w-3.5 h-3.5 text-teal-400" />
              <span>{isBriefingLoading ? "Refreshing..." : "Generate Fresh Briefing"}</span>
            </button>
            <button
              onClick={() => setActiveNav("AI Insights")}
              className="px-3.5 py-2 bg-[#1f232c] hover:bg-[#282d39] text-slate-200 border border-[#2d323f] rounded-xl text-xs font-semibold transition-colors"
            >
              View Full Insights
            </button>
          </div>
        </div>

        {briefing?.priorityAlerts && briefing.priorityAlerts.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4 pt-4 border-t border-[#2d323f] text-xs">
            {briefing.priorityAlerts.map((alert: string, idx: number) => (
              <div
                key={idx}
                className="bg-[#121418] p-2.5 rounded-lg border border-[#2d323f] flex items-start gap-2"
              >
                <AlertCircle className="w-3.5 h-3.5 text-teal-400 shrink-0 mt-0.5" />
                <span className="text-slate-300 text-[11px] leading-snug">
                  {alert}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 8 Essential Executive KPIs in Sleek Graphite */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* KPI 1: Pipeline Value */}
        <div className="bg-[#181b21] p-4 rounded-xl border border-[#2d323f] hover:border-teal-400/50 shadow-md text-white transition-all">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Pipeline Value</span>
            <Briefcase className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono mt-2">
            ${pipelineValue.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
            <span className="text-teal-400 font-semibold flex items-center">
              <ArrowUpRight className="w-3 h-3" /> +14.2%
            </span>
            <span>vs last month ({openDeals.length} deals)</span>
          </div>
        </div>

        {/* KPI 2: Weighted Pipeline */}
        <div className="bg-[#181b21] p-4 rounded-xl border border-[#2d323f] hover:border-teal-400/50 shadow-md text-white transition-all">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Weighted Pipeline</span>
            <TrendingUp className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-2xl font-black text-teal-300 font-mono mt-2">
            ${weightedPipelineValue.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Probability adjusted forecast
          </div>
        </div>

        {/* KPI 3: Closed Won Revenue */}
        <div className="bg-[#181b21] p-4 rounded-xl border border-[#2d323f] hover:border-teal-400/50 shadow-md text-white transition-all">
          <div className="flex items-center justify-between text-slate-300 text-xs font-semibold">
            <span>Closed Won Revenue</span>
            <CheckCircle2 className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono mt-2">
            ${wonRevenue.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-300 mt-1 flex items-center gap-1">
            <span className="font-semibold text-teal-400">{wonDeals.length} won</span>
            <span>• {winRate}% win rate</span>
          </div>
        </div>

        {/* KPI 4: Total Cash Collected */}
        <div className="bg-[#181b21] p-4 rounded-xl border border-[#2d323f] hover:border-teal-400/50 shadow-md text-white transition-all">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Cash Collected</span>
            <CreditCard className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono mt-2">
            ${totalCollected.toLocaleString()}
          </div>
          <div className="text-[11px] text-teal-400 mt-1">
            Realized cash flow to date
          </div>
        </div>

        {/* KPI 5: Total Invoiced */}
        <div className="bg-[#181b21] p-4 rounded-xl border border-[#2d323f] shadow-md text-white transition-all">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Total Invoiced</span>
            <Receipt className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono mt-2">
            ${totalInvoiced.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Across {invoices.length} billable invoices
          </div>
        </div>

        {/* KPI 6: Outstanding Receivables */}
        <div className="bg-[#181b21] p-4 rounded-xl border border-[#2d323f] shadow-md text-white transition-all">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Outstanding Balance</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-400 font-mono mt-2">
            ${outstandingBalance.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Pending client settlements
          </div>
        </div>

        {/* KPI 7: Overdue Invoices */}
        <div className="bg-[#181b21] p-4 rounded-xl border border-rose-900/40 shadow-md text-white transition-all">
          <div className="flex items-center justify-between text-rose-300 text-xs font-medium">
            <span>Overdue Balance</span>
            <AlertCircle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-black text-rose-400 font-mono mt-2">
            ${overdueBalance.toLocaleString()}
          </div>
          <div className="text-[11px] text-rose-300 font-semibold mt-1">
            {overdueInvoicesList.length} invoices past due
          </div>
        </div>

        {/* KPI 8: Active Accounts */}
        <div className="bg-[#181b21] p-4 rounded-xl border border-[#2d323f] shadow-md text-white transition-all">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Customer Base</span>
            <Users className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono mt-2">
            {companies.length}
          </div>
          <div className="text-[11px] text-teal-400 mt-1">
            {companies.filter((c) => c.status === "Active Customer").length} active accounts
          </div>
        </div>
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue & Cash Flow Trend (2 Cols) */}
        <div className="bg-[#181b21] p-5 rounded-2xl border border-[#2d323f] shadow-lg lg:col-span-2 space-y-4 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                Revenue Invoiced vs. Cash Collected
              </h3>
              <p className="text-xs text-slate-400">
                Tracking monthly billing velocity and payment realization
              </p>
            </div>
            <span className="text-xs text-teal-400 font-mono font-medium">2026 H1</span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#2d323f" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} stroke="#2d323f" />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} stroke="#2d323f" tickFormatter={(v) => `$${v / 1000}k`} />
                <Tooltip
                  formatter={(val: any) => [`$${Number(val).toLocaleString()}`, ""]}
                  contentStyle={{ backgroundColor: "#121418", borderColor: "#2d323f", borderRadius: "8px", color: "#fff", fontSize: "12px" }}
                />
                <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }} />
                <Bar dataKey="invoiced" name="Invoiced" fill="#475569" radius={[4, 4, 0, 0]} />
                <Bar dataKey="collected" name="Cash Collected" fill="#0d9488" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pipeline Stage Funnel (1 Col) */}
        <div className="bg-[#181b21] p-5 rounded-2xl border border-[#2d323f] shadow-lg space-y-4 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white">
                Pipeline Stages Breakdown
              </h3>
              <p className="text-xs text-slate-400">
                Value concentrated in active stages
              </p>
            </div>
            <button
              onClick={() => setActiveNav("Pipelines")}
              className="text-xs font-semibold text-teal-400 hover:text-teal-300 flex items-center gap-0.5"
            >
              Board <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3 pt-1">
            {stageData.map((stg) => (
              <div key={stg.stage} className="space-y-1">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-slate-200">{stg.stage}</span>
                  <span className="text-teal-300 font-mono font-bold">
                    ${stg.value.toLocaleString()}{" "}
                    <span className="text-slate-400 font-normal">({stg.count})</span>
                  </span>
                </div>
                <div className="w-full bg-[#121418] rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-teal-500 h-full rounded-full"
                    style={{ width: `${Math.min(100, (stg.value / 600000) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-[#2d323f] flex items-center justify-between text-xs">
            <span className="text-slate-400">Total In Stages:</span>
            <span className="font-bold text-white font-mono">
              ${stageData.reduce((acc, s) => acc + s.value, 0).toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Actionable Operations Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Overdue Invoices Alert List */}
        <div className="bg-[#181b21] p-5 rounded-2xl border border-[#2d323f] shadow-lg space-y-3 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <h3 className="text-sm font-bold text-white">
                Overdue Invoices Action List
              </h3>
            </div>
            <button
              onClick={() => setActiveNav("Invoices")}
              className="text-xs text-teal-400 hover:text-teal-300 font-semibold"
            >
              View All
            </button>
          </div>

          <div className="space-y-2.5 divide-y divide-[#2d323f]">
            {overdueInvoicesList.slice(0, 4).map((inv) => {
              const comp = companies.find((c) => c.id === inv.companyId);
              return (
                <div key={inv.id} className="pt-2.5 flex items-center justify-between text-xs">
                  <div>
                    <button
                      onClick={() => comp && setSelectedCompanyId(comp.id)}
                      className="font-bold text-slate-100 hover:text-teal-300 text-left block transition-colors"
                    >
                      {comp?.name || "Customer"}
                    </button>
                    <div className="text-slate-400 text-[11px]">
                      {inv.invoiceNumber} • Due {inv.dueDate}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-rose-400">
                      ${inv.remainingBalance.toLocaleString()}
                    </div>
                    <button
                      onClick={() => {
                        setQuickCreateType("payment");
                        setQuickCreateOpen(true);
                      }}
                      className="text-[10px] text-teal-400 font-semibold hover:text-teal-300"
                    >
                      Collect Now
                    </button>
                  </div>
                </div>
              );
            })}

            {overdueInvoicesList.length === 0 && (
              <div className="p-4 text-center text-slate-400 text-xs">
                No overdue invoices! Receivables are completely current.
              </div>
            )}
          </div>
        </div>

        {/* Priority Tasks & Follow-ups */}
        <div className="bg-[#181b21] p-5 rounded-2xl border border-[#2d323f] shadow-lg space-y-3 text-white">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">
              Urgent Follow-ups & Tasks
            </h3>
            <button
              onClick={() => setActiveNav("Tasks")}
              className="text-xs text-teal-400 hover:text-teal-300 font-semibold"
            >
              All Tasks
            </button>
          </div>

          <div className="space-y-2">
            {tasks
              .filter((t) => t.status !== "Completed")
              .slice(0, 4)
              .map((tsk) => {
                const comp = companies.find((c) => c.id === tsk.companyId);
                return (
                  <div
                    key={tsk.id}
                    className="p-2.5 bg-[#121418] border border-[#2d323f] rounded-xl flex items-start justify-between text-xs"
                  >
                    <div>
                      <div className="font-medium text-white">{tsk.title}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {comp?.name} • Due {tsk.dueDate}
                      </div>
                    </div>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        tsk.priority === "High"
                          ? "bg-rose-950/60 text-rose-300 border border-rose-800"
                          : "bg-[#252a36] text-slate-300 border border-[#3d4455]"
                      }`}
                    >
                      {tsk.priority}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Sales Team Leaderboard */}
        <div className="bg-[#181b21] p-5 rounded-2xl border border-[#2d323f] shadow-lg space-y-3 text-white">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">
              Sales Rep Performance
            </h3>
            <span className="text-[11px] text-slate-400 font-mono">Quarterly Target</span>
          </div>

          <div className="space-y-3 pt-1">
            {repPerformance.map((rep) => (
              <div key={rep.name} className="space-y-1 text-xs">
                <div className="flex justify-between font-medium">
                  <span className="text-white font-semibold">{rep.name}</span>
                  <span className="font-mono text-teal-300">
                    ${(rep.closedWon / 1000).toFixed(0)}k / ${(rep.target / 1000).toFixed(0)}k
                  </span>
                </div>
                <div className="w-full bg-[#121418] rounded-full h-2 overflow-hidden flex">
                  <div
                    className="h-full rounded-full bg-teal-500"
                    style={{ width: `${rep.progress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
