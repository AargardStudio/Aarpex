import React, { useState } from "react";
import { useCRM } from "../../context/CRMContext";
import { Company, CustomerStatus } from "../../types";
import {
  Building2,
  Plus,
  Search,
  Filter,
  ArrowUpRight,
  MapPin,
  Globe,
  AlertCircle,
  Clock,
  Sparkles,
  ChevronRight,
  ExternalLink,
} from "lucide-react";

export const CompaniesView: React.FC = () => {
  const {
    companies,
    setSelectedCompanyId,
    setQuickCreateOpen,
    setQuickCreateType,
  } = useCRM();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");

  const filteredCompanies = companies.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.industry.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.clientCategory || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.salesperson.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "All" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusColors: Record<CustomerStatus, string> = {
    "Active Customer": "bg-emerald-50 text-emerald-700 border-emerald-300",
    "Qualified Prospect": "bg-blue-50 text-blue-700 border-blue-300",
    Prospect: "bg-indigo-50 text-indigo-700 border-indigo-300",
    Lead: "bg-slate-100 text-slate-700 border-slate-300",
    "High Value Customer": "bg-purple-50 text-purple-700 border-purple-300",
    "At Risk": "bg-rose-50 text-rose-700 border-rose-300",
    Dormant: "bg-amber-50 text-amber-700 border-amber-300",
    "Former Customer": "bg-slate-100 text-slate-700 border-slate-300",
  };

  const totalOutstanding = companies.reduce((sum, c) => sum + (c.outstandingBalance || 0), 0);
  const totalOverdue = companies.reduce((sum, c) => sum + (c.overdueBalance || 0), 0);
  const totalRevenue = companies.reduce((sum, c) => sum + (c.totalRevenue || 0), 0);

  return (
    <div id="companies-view" className="space-y-5 animate-in fade-in duration-200">
      {/* Top Aggregates Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-slate-500 text-xs font-medium">Customer Accounts Total</span>
          <div className="text-xl font-bold text-slate-900 font-mono mt-1">
            {companies.length} Companies
          </div>
          <span className="text-[11px] text-slate-400">
            {companies.filter((c) => c.status === "Active Customer").length} active paying clients
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-slate-500 text-xs font-medium">Total Account Revenue</span>
          <div className="text-xl font-bold text-emerald-600 font-mono mt-1">
            ${totalRevenue.toLocaleString()}
          </div>
          <span className="text-[11px] text-slate-400">Aggregate won & paid volume</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-slate-500 text-xs font-medium">Overdue Accounts Balance</span>
          <div className="text-xl font-bold text-rose-600 font-mono mt-1">
            ${totalOverdue.toLocaleString()}
          </div>
          <span className="text-[11px] text-rose-600 font-medium">
            Outstanding: ${totalOutstanding.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Control Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by company, industry, city, rep..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700"
          >
            <option value="All">All Lifecycle Statuses</option>
            <option value="Active Customer">Active Customer</option>
            <option value="Qualified Prospect">Qualified Prospect</option>
            <option value="Prospect">Prospect</option>
            <option value="At Risk">At Risk</option>
            <option value="Former Customer">Former Customer</option>
          </select>
        </div>

        <button
          onClick={() => {
            setQuickCreateType("company");
            setQuickCreateOpen(true);
          }}
          className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm self-end sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Company</span>
        </button>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 whitespace-nowrap">
              <tr>
                <th className="p-3.5">Company & Industry</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5">Location & Rep</th>
                <th className="p-3.5 text-right">Invoiced</th>
                <th className="p-3.5 text-right">Collected</th>
                <th className="p-3.5 text-right">Outstanding</th>
                <th className="p-3.5 text-right">Overdue</th>
                <th className="p-3.5 text-center">Deals (Won/Open)</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 whitespace-nowrap">
              {filteredCompanies.map((comp) => (
                <tr
                  key={comp.id}
                  className="hover:bg-indigo-50/30 transition-colors group cursor-pointer"
                  onClick={() => setSelectedCompanyId(comp.id)}
                >
                  <td className="p-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-xs">
                        {comp.name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 group-hover:text-indigo-600 flex items-center gap-1.5">
                          <span>{comp.name}</span>
                          <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 text-indigo-500 transition-opacity" />
                        </div>
                        <div className="text-slate-400 text-[11px]">
                          {comp.industry}
                          {comp.clientCategory ? ` • ${comp.clientCategory}` : ""}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="p-3.5">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        statusColors[comp.status]
                      }`}
                    >
                      {comp.status}
                    </span>
                  </td>

                  <td className="p-3.5 text-slate-600">
                    <div>{comp.city}, {comp.country}</div>
                    <div className="text-slate-400 text-[11px]">Rep: {comp.salesperson}</div>
                  </td>

                  <td className="p-3.5 text-right font-mono font-medium text-slate-800">
                    ${(comp.totalInvoiced || 0).toLocaleString()}
                  </td>

                  <td className="p-3.5 text-right font-mono font-bold text-emerald-600">
                    ${(comp.totalPaid || 0).toLocaleString()}
                  </td>

                  <td className="p-3.5 text-right font-mono font-medium text-slate-800">
                    ${(comp.outstandingBalance || 0).toLocaleString()}
                  </td>

                  <td className="p-3.5 text-right font-mono font-extrabold">
                    {(comp.overdueBalance || 0) > 0 ? (
                      <span className="text-rose-600 bg-rose-50 px-2 py-0.5 rounded">
                        ${comp.overdueBalance?.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-slate-300">$0</span>
                    )}
                  </td>

                  <td className="p-3.5 text-center font-mono">
                    <span className="text-emerald-600 font-bold">{comp.wonDealsCount || 0} won</span>
                    {" / "}
                    <span className="text-indigo-600">{comp.openDealsCount || 0} open</span>
                  </td>

                  <td className="p-3.5 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCompanyId(comp.id);
                      }}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 font-semibold rounded text-xs transition-colors"
                    >
                      360° Profile
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
