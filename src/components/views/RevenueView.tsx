import React from "react";
import { useCRM } from "../../context/CRMContext";
import {
  TrendingUp,
  CreditCard,
  Receipt,
  Calendar,
  DollarSign,
  AlertTriangle,
  ArrowUpRight,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";

export const RevenueView: React.FC = () => {
  const { companies, invoices, payments, deals, setSelectedCompanyId } = useCRM();

  const totalInvoiced = invoices.reduce((sum, i) => sum + (i.total || 0), 0);
  const totalCollected = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalOutstanding = invoices.reduce((sum, i) => sum + (i.remainingBalance || 0), 0);

  // Aging breakdown calculations
  const now = new Date();
  let agingCurrent = 0; // not due yet
  let aging1to30 = 0;
  let aging31to60 = 0;
  let aging60Plus = 0;

  invoices.forEach((inv) => {
    if (inv.remainingBalance > 0) {
      const dueDate = new Date(inv.dueDate);
      const diffDays = Math.round((now.getTime() - dueDate.getTime()) / 86400000);

      if (diffDays <= 0) {
        agingCurrent += inv.remainingBalance;
      } else if (diffDays <= 30) {
        aging1to30 += inv.remainingBalance;
      } else if (diffDays <= 60) {
        aging31to60 += inv.remainingBalance;
      } else {
        aging60Plus += inv.remainingBalance;
      }
    }
  });

  const agingData = [
    { name: "Current (Not Due)", amount: agingCurrent, color: "#10b981" },
    { name: "1-30 Days Overdue", amount: aging1to30, color: "#f59e0b" },
    { name: "31-60 Days Overdue", amount: aging31to60, color: "#f97316" },
    { name: "60+ Days Critical", amount: aging60Plus, color: "#ef4444" },
  ];

  // Top Revenue Contributing Companies
  const topCompanies = [...companies]
    .sort((a, b) => (b.totalPaid || 0) - (a.totalPaid || 0))
    .slice(0, 5);

  const topCompaniesData = topCompanies.map((c) => ({
    name: c.name.length > 15 ? `${c.name.substring(0, 15)}...` : c.name,
    collected: c.totalPaid || 0,
    outstanding: c.outstandingBalance || 0,
  }));

  return (
    <div id="revenue-view" className="space-y-6 animate-in fade-in duration-200">
      {/* Top Aggregates */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-slate-500 text-xs font-medium">Total Billed Volume</span>
          <div className="text-2xl font-black text-slate-900 font-mono mt-1">
            ${totalInvoiced.toLocaleString()}
          </div>
          <span className="text-[11px] text-slate-400">Total invoiced value</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-slate-500 text-xs font-medium">Realized Cash Collections</span>
          <div className="text-2xl font-black text-emerald-600 font-mono mt-1">
            ${totalCollected.toLocaleString()}
          </div>
          <span className="text-[11px] text-emerald-600 font-medium">
            {totalInvoiced > 0 ? Math.round((totalCollected / totalInvoiced) * 100) : 0}% realization rate
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-slate-500 text-xs font-medium">Outstanding Receivables</span>
          <div className="text-2xl font-black text-amber-600 font-mono mt-1">
            ${totalOutstanding.toLocaleString()}
          </div>
          <span className="text-[11px] text-slate-400">Pending client settlement</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-slate-500 text-xs font-medium">Critical Overdue (&gt;30d)</span>
          <div className="text-2xl font-black text-rose-600 font-mono mt-1">
            ${(aging31to60 + aging60Plus).toLocaleString()}
          </div>
          <span className="text-[11px] text-rose-600 font-semibold">Immediate collection risk</span>
        </div>
      </div>

      {/* Aging Analysis and Top Accounts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Receivables Aging Breakdown */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Accounts Receivable Aging Analysis
            </h3>
            <p className="text-xs text-slate-500">
              Delinquency distribution across outstanding invoices
            </p>
          </div>

          <div className="space-y-3 pt-2">
            {agingData.map((item) => {
              const pct = totalOutstanding > 0 ? Math.round((item.amount / totalOutstanding) * 100) : 0;
              return (
                <div key={item.name} className="space-y-1 text-xs">
                  <div className="flex justify-between font-medium">
                    <span className="text-slate-700">{item.name}</span>
                    <span className="font-mono font-bold text-slate-900">
                      ${item.amount.toLocaleString()}{" "}
                      <span className="text-slate-400 font-normal">({pct}%)</span>
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: item.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top 5 Revenue Contributing Clients */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Top 5 Revenue Accounts
            </h3>
            <p className="text-xs text-slate-500">
              Accounts with highest cash collections and open balances
            </p>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topCompaniesData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" tickFormatter={(v) => `$${v / 1000}k`} />
                <Tooltip
                  formatter={(val: any) => [`$${Number(val).toLocaleString()}`, ""]}
                  contentStyle={{ backgroundColor: "#1e293b", borderRadius: "8px", color: "#fff", fontSize: "11px" }}
                />
                <Bar dataKey="collected" name="Cash Collected" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="outstanding" name="Outstanding" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
