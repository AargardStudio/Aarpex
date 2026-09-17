import React from "react";
import { useCRM } from "../../context/CRMContext";
import { Invoice } from "../../types";
import { X, Printer, CreditCard, Copy, Building2, CheckCircle2, FileText } from "lucide-react";

interface InvoiceDetailModalProps {
  invoice: Invoice | null;
  onClose: () => void;
  onOpenTemplate?: (invoiceId: string) => void;
}

export const InvoiceDetailModal: React.FC<InvoiceDetailModalProps> = ({ invoice, onClose, onOpenTemplate }) => {
  const { companies, markInvoicePaid, duplicateInvoice, setQuickCreateOpen, setQuickCreateType, activeTenant } = useCRM();

  if (!invoice) return null;

  const company = companies.find((c) => c.id === invoice.companyId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#181b21] rounded-2xl shadow-2xl border border-[#2d323f] w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden text-xs text-slate-100">
        {/* Modal Controls Bar */}
        <div className="px-6 py-3.5 border-b border-[#2d323f] flex items-center justify-between bg-[#121418]">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white text-sm">
              Invoice #{invoice.invoiceNumber}
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                invoice.status === "Paid"
                  ? "bg-teal-950/80 text-teal-300 border border-teal-500/30"
                  : invoice.status === "Overdue"
                  ? "bg-rose-950/80 text-rose-300 border border-rose-500/30"
                  : invoice.status === "Partially Paid"
                  ? "bg-amber-950/80 text-amber-300 border border-amber-500/30"
                  : "bg-[#252a36] text-slate-300 border border-[#3d4455]"
              }`}
            >
              {invoice.status}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {onOpenTemplate && (
              <button
                onClick={() => {
                  onOpenTemplate(invoice.id);
                  onClose();
                }}
                className="px-2.5 py-1 bg-[#252a36] border border-[#3d4455] text-teal-300 hover:bg-[#2f3544] rounded-lg flex items-center gap-1 font-semibold transition-colors"
                title="Open Printable Template & Stripe Portal"
              >
                <FileText className="w-3.5 h-3.5 text-teal-400" /> Template & Stripe
              </button>
            )}
            <button
              onClick={() => window.print()}
              className="px-2.5 py-1 bg-[#121418] border border-[#2d323f] text-slate-200 hover:text-white hover:bg-[#222630] rounded-lg flex items-center gap-1 font-medium transition-colors"
            >
              <Printer className="w-3.5 h-3.5 text-teal-400" /> Print / PDF
            </button>
            <button
              onClick={() => {
                duplicateInvoice(invoice.id);
                onClose();
              }}
              className="px-2.5 py-1 bg-[#121418] border border-[#2d323f] text-slate-200 hover:text-white hover:bg-[#222630] rounded-lg flex items-center gap-1 font-medium transition-colors"
            >
              <Copy className="w-3.5 h-3.5 text-teal-400" /> Duplicate
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#252a36] transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Invoice Printable View Body */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6 bg-white">
          {/* Top Brand & Invoice Metadata */}
          <div className="flex justify-between items-start pb-6 border-b border-slate-200">
            <div>
              <div className="text-lg font-black text-slate-900 tracking-tight">
                {activeTenant?.companyName || activeTenant?.name || "Aargard Business Solutions Inc."}
              </div>
              <div className="text-slate-500 text-[11px] mt-1 space-y-0.5">
                <div>AarPex Enterprise Multi-Tenant Platform</div>
                <div>{activeTenant?.webmailConfig?.email || "billing@aargard-solutions.com"}</div>
                <div>Tax / VAT: {activeTenant?.taxId || "GB-9012384-EX"}</div>
              </div>
            </div>

            <div className="text-right space-y-1">
              <div className="text-xl font-extrabold text-slate-900 uppercase tracking-wide">
                Invoice
              </div>
              <div className="font-mono text-slate-600 font-medium">#{invoice.invoiceNumber}</div>
              <div className="text-slate-400 text-[11px]">
                Issue Date: <strong className="text-slate-700">{invoice.issueDate}</strong>
              </div>
              <div className="text-slate-400 text-[11px]">
                Due Date: <strong className="text-rose-600">{invoice.dueDate}</strong>
              </div>
            </div>
          </div>

          {/* Bill To Info */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Billed To:
              </span>
              <div className="text-sm font-bold text-slate-900">{company?.name}</div>
              <div className="text-slate-500 text-[11px] mt-0.5">
                {company?.city}, {company?.country}
              </div>
              <div className="text-slate-500 text-[11px]">{company?.email}</div>
            </div>

            <div className="text-right">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Balance Due:
              </span>
              <div className="text-lg font-black font-mono text-rose-600">
                ${invoice.remainingBalance.toLocaleString()} {invoice.currency}
              </div>
              <div className="text-slate-400 text-[11px]">
                Paid to date: ${invoice.amountPaid.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Items Table */}
          <table className="w-full text-left">
            <thead className="border-b-2 border-slate-200 text-slate-400 text-[10px] uppercase font-bold tracking-wider">
              <tr>
                <th className="py-2">Description</th>
                <th className="py-2 text-center">Qty</th>
                <th className="py-2 text-right">Unit Price</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoice.items.map((item, idx) => (
                <tr key={idx}>
                  <td className="py-3 font-medium text-slate-800">{item.description}</td>
                  <td className="py-3 text-center text-slate-600">{item.quantity}</td>
                  <td className="py-3 text-right font-mono text-slate-600">
                    ${item.unitPrice.toLocaleString()}
                  </td>
                  <td className="py-3 text-right font-mono font-bold text-slate-900">
                    ${(item.quantity * item.unitPrice).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Calculation Summary Footer */}
          <div className="flex justify-end pt-4 border-t border-slate-200">
            <div className="w-64 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span className="font-mono">${invoice.subtotal.toLocaleString()}</span>
              </div>
              {invoice.discount > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Discount:</span>
                  <span className="font-mono">-${invoice.discount.toLocaleString()}</span>
                </div>
              )}
              {invoice.tax > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Estimated Tax:</span>
                  <span className="font-mono">+${invoice.tax.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-slate-900 text-sm pt-2 border-t border-slate-200">
                <span>Total Amount:</span>
                <span className="font-mono">${invoice.total.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-emerald-600 font-semibold">
                <span>Paid:</span>
                <span className="font-mono">-${invoice.amountPaid.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-rose-600 font-extrabold text-sm pt-1 border-t border-slate-200">
                <span>Remaining Due:</span>
                <span className="font-mono">${invoice.remainingBalance.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {invoice.notes && (
            <div className="p-3 bg-slate-50 rounded-lg text-slate-500 text-[11px] border border-slate-100">
              <strong>Notes:</strong> {invoice.notes}
            </div>
          )}
        </div>

        {/* Modal Action Footer */}
        <div className="px-6 py-4 bg-[#121418] border-t border-[#2d323f] flex items-center justify-between">
          <div className="text-[11px] text-teal-400/80">
            All settlements automatically update client ledger and cash flow analytics.
          </div>
          <div className="flex gap-2">
            {invoice.remainingBalance > 0 && (
              <button
                onClick={() => {
                  markInvoicePaid(invoice.id);
                  onClose();
                }}
                className="px-4 py-2 bg-[#252a36] hover:bg-[#2f3544] text-white font-bold rounded-lg flex items-center gap-1.5 shadow-sm border border-[#3d4455] transition-all"
              >
                <CheckCircle2 className="w-4 h-4 text-teal-400" /> Settle Full Balance
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 bg-[#181b21] hover:bg-[#222630] text-slate-300 hover:text-white border border-[#2d323f] font-semibold rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
