import React from "react";
import { useCRM } from "../../context/CRMContext";
import { BarChart3, Download, TrendingUp, CheckCircle2, Clock, DollarSign } from "lucide-react";

export const ReportsView: React.FC = () => {
  const { deals, companies, invoices, payments, leads } = useCRM();

  const wonDeals = deals.filter((d) => d.status === "Won");
  const lostDeals = deals.filter((d) => d.status === "Lost");
  const winRate = deals.length > 0 ? Math.round((wonDeals.length / deals.length) * 100) : 0;

  // Average sales cycle calculation
  const totalDays = wonDeals.reduce((sum, d) => {
    const created = new Date(d.createdDate).getTime();
    const close = new Date(d.expectedCloseDate).getTime();
    return sum + Math.max(7, Math.round((close - created) / 86400000));
  }, 0);
  const avgCycleDays = wonDeals.length > 0 ? Math.round(totalDays / wonDeals.length) : 32;

  // Data Exporters
  const downloadJSON = (data: any, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  };

  const downloadCSV = (rows: string[][], filename: string) => {
    const csvContent = "data:text/csv;charset=utf-8," + rows.map((e) => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const a = document.createElement("a");
    a.href = encodedUri;
    a.download = filename;
    a.click();
  };

  const handleExportDeals = () => {
    const header = ["Deal ID", "Deal Name", "Company ID", "Value", "Status", "Close Date", "Salesperson"];
    const rows = deals.map((d) => [
      d.id,
      `"${d.name.replace(/"/g, '""')}"`,
      d.companyId,
      d.dealValue.toString(),
      d.status,
      d.expectedCloseDate,
      d.salesperson,
    ]);
    downloadCSV([header, ...rows], "crm_deals_export.csv");
  };

  const handleExportInvoices = () => {
    const header = ["Invoice #", "Company ID", "Issue Date", "Due Date", "Total", "Paid", "Remaining", "Status"];
    const rows = invoices.map((i) => [
      i.invoiceNumber,
      i.companyId,
      i.issueDate,
      i.dueDate,
      i.total.toString(),
      i.amountPaid.toString(),
      i.remainingBalance.toString(),
      i.status,
    ]);
    downloadCSV([header, ...rows], "crm_invoices_ledger.csv");
  };

  return (
    <div id="reports-view" className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Executive Performance & Audit Reports
          </h2>
          <p className="text-xs text-slate-500">
            Exportable audit trails and pipeline velocity metrics
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportDeals}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Deals CSV</span>
          </button>
          <button
            onClick={handleExportInvoices}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Invoices CSV</span>
          </button>
          <button
            onClick={() => downloadJSON(companies, "crm_companies_full.json")}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JSON Database</span>
          </button>
        </div>
      </div>

      {/* Analytical Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-1">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
            <Clock className="w-4 h-4 text-indigo-600" />
            <span>Average Sales Velocity</span>
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono">
            {avgCycleDays} days
          </div>
          <span className="text-[11px] text-slate-400">
            From creation to Closed Won milestone
          </span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-1">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Pipeline Win Rate</span>
          </div>
          <div className="text-2xl font-black text-emerald-600 font-mono">
            {winRate}%
          </div>
          <span className="text-[11px] text-slate-400">
            {wonDeals.length} won vs {lostDeals.length} lost
          </span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-1">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
            <DollarSign className="w-4 h-4 text-cyan-600" />
            <span>Avg Won Deal Value</span>
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono">
            $
            {wonDeals.length > 0
              ? Math.round(
                  wonDeals.reduce((s, d) => s + d.dealValue, 0) / wonDeals.length
                ).toLocaleString()
              : 0}
          </div>
          <span className="text-[11px] text-slate-400">Per closed contract</span>
        </div>
      </div>
    </div>
  );
};
