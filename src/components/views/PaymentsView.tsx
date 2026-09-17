import React, { useState } from "react";
import { useCRM } from "../../context/CRMContext";
import { CreditCard, Plus, Search, Building2, Trash2 } from "lucide-react";

export const PaymentsView: React.FC = () => {
  const {
    payments,
    companies,
    invoices,
    deletePayment,
    setSelectedCompanyId,
    setQuickCreateOpen,
    setQuickCreateType,
  } = useCRM();

  const [searchTerm, setSearchTerm] = useState("");

  const filteredPayments = payments.filter((p) => {
    const comp = companies.find((c) => c.id === p.companyId);
    const matchesSearch =
      p.paymentNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.reference.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (comp && comp.name.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesSearch;
  });

  const totalCollected = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

  return (
    <div id="payments-view" className="space-y-5 animate-in fade-in duration-200">
      {/* Top Banner */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
        <div>
          <span className="text-slate-500 text-xs font-medium">Total Cash Settled & Collected</span>
          <div className="text-2xl font-black text-emerald-600 font-mono mt-0.5">
            ${totalCollected.toLocaleString()} USD
          </div>
          <div className="text-[11px] text-slate-400">
            Across {payments.length} verified transactions
          </div>
        </div>

        <button
          onClick={() => {
            setQuickCreateType("payment");
            setQuickCreateOpen(true);
          }}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm"
        >
          <CreditCard className="w-3.5 h-3.5" />
          <span>Record New Payment</span>
        </button>
      </div>

      {/* Control Bar */}
      <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        <div className="relative w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by payment #, reference, or company..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs"
          />
        </div>
      </div>

      {/* Payments Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 whitespace-nowrap">
              <tr>
                <th className="p-3.5">Payment #</th>
                <th className="p-3.5">Company Client</th>
                <th className="p-3.5">Invoice Ref</th>
                <th className="p-3.5">Settlement Date</th>
                <th className="p-3.5">Payment Method</th>
                <th className="p-3.5">Reference Code</th>
                <th className="p-3.5 text-right">Amount Settled</th>
                <th className="p-3.5">Recorded By</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 whitespace-nowrap">
              {filteredPayments.map((pay) => {
                const comp = companies.find((c) => c.id === pay.companyId);
                const inv = invoices.find((i) => i.id === pay.invoiceId);

                return (
                  <tr key={pay.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="p-3.5 font-bold font-mono text-slate-900">
                      {pay.paymentNumber}
                    </td>

                    <td className="p-3.5">
                      {comp ? (
                        <button
                          onClick={() => setSelectedCompanyId(comp.id)}
                          className="font-bold text-slate-800 hover:text-indigo-600 flex items-center gap-1.5"
                        >
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          <span>{comp.name}</span>
                        </button>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    <td className="p-3.5 font-mono text-slate-600">
                      {inv ? inv.invoiceNumber : "Unlinked"}
                    </td>

                    <td className="p-3.5 text-slate-600">{pay.date}</td>

                    <td className="p-3.5">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 text-[10px] font-semibold border border-slate-200">
                        {pay.paymentMethod}
                      </span>
                    </td>

                    <td className="p-3.5 font-mono text-slate-500 text-[11px]">
                      {pay.reference}
                    </td>

                    <td className="p-3.5 text-right font-mono font-black text-emerald-600 text-sm">
                      +${pay.amount.toLocaleString()}
                    </td>

                    <td className="p-3.5 text-slate-500">{pay.recordedBy}</td>

                    <td className="p-3.5 text-right">
                      <button
                        onClick={() => deletePayment(pay.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                        title="Delete payment and reverse balance"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
