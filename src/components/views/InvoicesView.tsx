import React, { useEffect, useState } from "react";
import { useCRM } from "../../context/CRMContext";
import { Invoice, TenantBillingProduct } from "../../types";
import {
  Receipt,
  Plus,
  Search,
  Filter,
  CreditCard,
  Building2,
  CheckCircle2,
  Copy,
  Trash2,
  Eye,
  AlertCircle,
  FileText,
  Sparkles,
  Package,
  RefreshCw,
  Link2,
  ShieldCheck,
  History,
  Repeat,
  Zap,
} from "lucide-react";
import { InvoiceDetailModal } from "../modals/InvoiceDetailModal";
import { InvoiceTemplateView } from "../invoices/InvoiceTemplateView";
import { ProductPricingModal } from "../modals/ProductPricingModal";
import { apiFetch } from "../../lib/apiClient";

export const InvoicesView: React.FC = () => {
  const {
    invoices,
    companies,
    deleteInvoice,
    markInvoicePaid,
    setSelectedCompanyId,
    setQuickCreateOpen,
    setQuickCreateType,
    canPerform,
    activeTenant,
    addAuditLogEntry,
  } = useCRM();

  const [viewMode, setViewMode] = useState<"ledger" | "template" | "billing">("ledger");
  const [selectedTemplateInvoiceId, setSelectedTemplateInvoiceId] = useState<string | undefined>(undefined);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [selectedInvoiceForModal, setSelectedInvoiceForModal] = useState<Invoice | null>(null);

  // Products & Pricing (tenant's own connected Stripe account)
  const stripeSecretKey = activeTenant?.stripeConfig?.secretKey || "";
  const isStripeConnected = !!stripeSecretKey.trim();
  const [billingProducts, setBillingProducts] = useState<TenantBillingProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [isProductModalOpen, setProductModalOpen] = useState(false);
  const [copiedPriceId, setCopiedPriceId] = useState<string | null>(null);

  const loadBillingProducts = async () => {
    if (!isStripeConnected) return;
    setIsLoadingProducts(true);
    setProductsError(null);
    try {
      const res = await apiFetch(`/api/stripe/products/list?apiKey=${encodeURIComponent(stripeSecretKey)}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        setProductsError(data.error || "Failed to load products from Stripe.");
        return;
      }
      setBillingProducts(data.products || []);
    } catch (err: any) {
      setProductsError(err.message || "Unable to reach the billing service.");
    } finally {
      setIsLoadingProducts(false);
    }
  };

  useEffect(() => {
    if (viewMode === "billing" && isStripeConnected) {
      loadBillingProducts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, stripeSecretKey]);

  const handleGeneratePaymentLink = async (priceId: string, productName: string) => {
    try {
      const res = await apiFetch("/api/stripe/products/payment-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: stripeSecretKey, priceId, quantity: 1 }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setProductsError(data.error || "Failed to generate payment link.");
        return;
      }
      await navigator.clipboard.writeText(data.url);
      setCopiedPriceId(priceId);
      addAuditLogEntry("Generated payment link", `${productName} — ${data.url}`, "billing");
      setTimeout(() => setCopiedPriceId(null), 2500);
    } catch (err: any) {
      setProductsError(err.message || "Unable to reach the billing service.");
    }
  };

  const filteredInvoices = invoices.filter((inv) => {
    const comp = companies.find((c) => c.id === inv.companyId);
    const matchesSearch =
      inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (comp && comp.name.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = statusFilter === "All" || inv.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalInvoiced = invoices.reduce((sum, i) => sum + (i.total || 0), 0);
  const totalPaid = invoices.reduce((sum, i) => sum + (i.amountPaid || 0), 0);
  const totalRemaining = invoices.reduce((sum, i) => sum + (i.remainingBalance || 0), 0);
  const overdueTotal = invoices
    .filter((i) => i.remainingBalance > 0 && new Date(i.dueDate) < new Date())
    .reduce((sum, i) => sum + i.remainingBalance, 0);

  if (viewMode === "template") {
    return (
      <InvoiceTemplateView
        initialInvoiceId={selectedTemplateInvoiceId}
        onBackToLedger={() => setViewMode("ledger")}
      />
    );
  }

  if (viewMode === "billing") {
    const auditLog = activeTenant?.auditLog || [];

    return (
      <div id="invoices-billing-view" className="space-y-5 animate-in fade-in duration-200">
        {/* View Switcher Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#181b21] p-3 rounded-xl border border-[#2d323f]">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode("ledger")}
              className="px-3.5 py-1.5 bg-[#121418] hover:bg-[#1f232c] text-slate-300 hover:text-white border border-[#2d323f] rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Receipt className="w-3.5 h-3.5 text-teal-400" />
              <span>Invoices Ledger ({invoices.length})</span>
            </button>
            <button
              onClick={() => {
                setSelectedTemplateInvoiceId(invoices[0]?.id);
                setViewMode("template");
              }}
              className="px-3.5 py-1.5 bg-[#121418] hover:bg-[#1f232c] text-slate-300 hover:text-white border border-[#2d323f] rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <FileText className="w-3.5 h-3.5 text-teal-400" />
              <span>Invoice Template & Stripe Studio</span>
            </button>
            <button className="px-3.5 py-1.5 bg-[#252a36] text-teal-300 border border-[#3d4455] rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm">
              <Package className="w-3.5 h-3.5" />
              <span>Products & Subscriptions</span>
            </button>
          </div>
        </div>

        {!isStripeConnected ? (
          <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-2xs text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-500 flex items-center justify-center mx-auto">
              <CreditCard className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Connect Your Stripe Account First</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              To create subscription pricing or one-time fees and sell them to your own customers through this
              dashboard, add your Stripe secret key under{" "}
              <strong>Settings &rarr; Stripe Custom Keys</strong>. Products and payment links you create here run
              entirely on your own Stripe account — Aargard never touches the funds.
            </p>
          </div>
        ) : (
          <>
            {/* Products & Pricing */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Package className="w-4 h-4 text-indigo-500" /> Products & Pricing
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Live from your connected Stripe account. Create a subscription price or a one-time fee, then
                    share the payment link with your customer.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={loadBillingProducts}
                    disabled={isLoadingProducts}
                    className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingProducts ? "animate-spin" : ""}`} />
                    <span>Refresh</span>
                  </button>
                  <button
                    onClick={() => setProductModalOpen(true)}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create Product / Price</span>
                  </button>
                </div>
              </div>

              {productsError && (
                <div className="mx-4 mt-4 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-medium flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{productsError}</span>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 whitespace-nowrap">
                    <tr>
                      <th className="p-3.5">Product</th>
                      <th className="p-3.5">Price</th>
                      <th className="p-3.5">Type</th>
                      <th className="p-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {billingProducts.length === 0 && !isLoadingProducts && (
                      <tr>
                        <td colSpan={4} className="p-6 text-center text-slate-400">
                          No products yet. Create your first subscription or one-time fee above.
                        </td>
                      </tr>
                    )}
                    {billingProducts.flatMap((product) =>
                      product.prices.map((price) => (
                        <tr key={price.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="p-3.5 font-bold text-slate-800">
                            {product.name}
                            {product.description && (
                              <div className="text-[10px] font-normal text-slate-400 mt-0.5">{product.description}</div>
                            )}
                          </td>
                          <td className="p-3.5 font-mono font-semibold text-slate-800">
                            ${price.amount.toLocaleString()} {price.currency.toUpperCase()}
                            {price.type === "recurring" && (
                              <span className="text-slate-400"> / {price.interval}</span>
                            )}
                          </td>
                          <td className="p-3.5">
                            {price.type === "recurring" ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 flex items-center gap-1 w-fit">
                                <Repeat className="w-3 h-3" /> Subscription
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 flex items-center gap-1 w-fit">
                                <Zap className="w-3 h-3" /> One-Time
                              </span>
                            )}
                          </td>
                          <td className="p-3.5 text-right">
                            <button
                              onClick={() => handleGeneratePaymentLink(price.id, product.name)}
                              className="px-2.5 py-1 bg-[#181b21] hover:bg-[#222630] text-teal-300 border border-[#2d323f] rounded text-[11px] font-semibold flex items-center gap-1.5 transition-colors ml-auto"
                            >
                              {copiedPriceId === price.id ? (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Link2 className="w-3.5 h-3.5 text-teal-400" />
                                  <span>Copy Payment Link</span>
                                </>
                              )}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Billing Audit Log */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-2xs">
              <div className="p-4 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <History className="w-4 h-4 text-indigo-500" /> Billing Audit Log
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Every Stripe key change, verification, product/price creation, and payment link generated for this
                  workspace.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 whitespace-nowrap">
                    <tr>
                      <th className="p-3">When</th>
                      <th className="p-3">Who</th>
                      <th className="p-3">Action</th>
                      <th className="p-3">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {auditLog.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-6 text-center text-slate-400">
                          No billing activity logged yet.
                        </td>
                      </tr>
                    )}
                    {auditLog.slice(0, 25).map((entry) => (
                      <tr key={entry.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="p-3 text-slate-500 whitespace-nowrap">
                          {new Date(entry.timestamp).toLocaleString()}
                        </td>
                        <td className="p-3 font-semibold text-slate-700 whitespace-nowrap">{entry.actor}</td>
                        <td className="p-3 text-slate-800 flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                          <span>{entry.action}</span>
                        </td>
                        <td className="p-3 text-slate-400">{entry.details || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        <ProductPricingModal
          isOpen={isProductModalOpen}
          onClose={() => setProductModalOpen(false)}
          stripeSecretKey={stripeSecretKey}
          currency={activeTenant?.currency || "USD"}
          onCreated={(product) => {
            setBillingProducts((prev) => [product, ...prev]);
            addAuditLogEntry(
              "Created product",
              `${product.name} — $${product.prices[0]?.amount} ${product.prices[0]?.type === "recurring" ? `/${product.prices[0]?.interval}` : "one-time"}`,
              "billing"
            );
          }}
        />
      </div>
    );
  }

  return (
    <div id="invoices-view" className="space-y-5 animate-in fade-in duration-200">
      {/* View Switcher Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#181b21] p-3 rounded-xl border border-[#2d323f]">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode("ledger")}
            className="px-3.5 py-1.5 bg-[#252a36] text-teal-300 border border-[#3d4455] rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm"
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Invoices Ledger ({invoices.length})</span>
          </button>
          <button
            onClick={() => {
              setSelectedTemplateInvoiceId(invoices[0]?.id);
              setViewMode("template");
            }}
            className="px-3.5 py-1.5 bg-[#121418] hover:bg-[#1f232c] text-slate-300 hover:text-white border border-[#2d323f] rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors group"
          >
            <FileText className="w-3.5 h-3.5 text-teal-400 group-hover:text-teal-300" />
            <span>Invoice Template & Stripe Studio</span>
            <span className="text-[10px] bg-[#252a36] text-teal-300 px-1.5 py-0.2 rounded border border-[#3d4455]">
              Print & Pay
            </span>
          </button>
          <button
            onClick={() => setViewMode("billing")}
            className="px-3.5 py-1.5 bg-[#121418] hover:bg-[#1f232c] text-slate-300 hover:text-white border border-[#2d323f] rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors group"
          >
            <Package className="w-3.5 h-3.5 text-teal-400 group-hover:text-teal-300" />
            <span>Products & Subscriptions</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setQuickCreateType("invoice");
              setQuickCreateOpen(true);
            }}
            className="px-3.5 py-1.5 bg-[#252a36] hover:bg-[#2f3544] text-white border border-[#3d4455] rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
          >
            <Plus className="w-3.5 h-3.5 text-teal-400" />
            <span>Create New Invoice</span>
          </button>
        </div>
      </div>

      {/* 4 Financial Aggregate Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-slate-500 text-xs font-medium">Total Invoiced</span>
          <div className="text-xl font-bold text-slate-900 font-mono mt-1">
            ${totalInvoiced.toLocaleString()}
          </div>
          <span className="text-[11px] text-slate-400">{invoices.length} invoices generated</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-slate-500 text-xs font-medium">Total Collected</span>
          <div className="text-xl font-bold text-emerald-600 font-mono mt-1">
            ${totalPaid.toLocaleString()}
          </div>
          <span className="text-[11px] text-slate-400">Cash settled to date</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-slate-500 text-xs font-medium">Outstanding Balance</span>
          <div className="text-xl font-bold text-amber-600 font-mono mt-1">
            ${totalRemaining.toLocaleString()}
          </div>
          <span className="text-[11px] text-slate-400">Current open receivables</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-slate-500 text-xs font-medium">Overdue Receivables</span>
          <div className="text-xl font-bold text-rose-600 font-mono mt-1">
            ${overdueTotal.toLocaleString()}
          </div>
          <span className="text-[11px] text-rose-600 font-semibold">Past scheduled due dates</span>
        </div>
      </div>

      {/* Control Bar & Filter Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search invoice # or company..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs"
            />
          </div>

          <div className="flex border border-slate-200 rounded-lg overflow-hidden p-0.5 bg-slate-50 text-xs">
            {["All", "Sent", "Partially Paid", "Paid", "Overdue", "Draft"].map((tab) => (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  statusFilter === tab
                    ? "bg-white text-indigo-600 font-bold shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            onClick={() => {
              setQuickCreateType("payment");
              setQuickCreateOpen(true);
            }}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm"
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Record Payment</span>
          </button>
          <button
            onClick={() => {
              setQuickCreateType("invoice");
              setQuickCreateOpen(true);
            }}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Invoice</span>
          </button>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 whitespace-nowrap">
              <tr>
                <th className="p-3.5">Invoice #</th>
                <th className="p-3.5">Company Client</th>
                <th className="p-3.5">Issue Date</th>
                <th className="p-3.5">Due Date</th>
                <th className="p-3.5 text-right">Total</th>
                <th className="p-3.5 text-right">Paid</th>
                <th className="p-3.5 text-right">Balance Due</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 whitespace-nowrap">
              {filteredInvoices.map((inv) => {
                const comp = companies.find((c) => c.id === inv.companyId);
                const isOverdue =
                  inv.remainingBalance > 0 && new Date(inv.dueDate) < new Date();

                return (
                  <tr key={inv.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="p-3.5 font-bold font-mono text-slate-900">
                      {inv.invoiceNumber}
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

                    <td className="p-3.5 text-slate-500">{inv.issueDate}</td>

                    <td className="p-3.5">
                      <span className={isOverdue ? "text-rose-600 font-bold" : "text-slate-600"}>
                        {inv.dueDate}
                      </span>
                    </td>

                    <td className="p-3.5 text-right font-mono font-medium text-slate-800">
                      ${inv.total.toLocaleString()}
                    </td>

                    <td className="p-3.5 text-right font-mono font-bold text-emerald-600">
                      ${inv.amountPaid.toLocaleString()}
                    </td>

                    <td className="p-3.5 text-right font-mono font-extrabold text-slate-900">
                      ${inv.remainingBalance.toLocaleString()}
                    </td>

                    <td className="p-3.5">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          inv.status === "Paid"
                            ? "bg-emerald-100 text-emerald-800"
                            : inv.status === "Overdue"
                            ? "bg-rose-100 text-rose-800"
                            : inv.status === "Partially Paid"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {inv.status}
                      </span>
                    </td>

                    <td className="p-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => {
                            setSelectedTemplateInvoiceId(inv.id);
                            setViewMode("template");
                          }}
                          className="px-2 py-1 bg-[#181b21] hover:bg-[#222630] text-teal-300 border border-[#2d323f] rounded text-[11px] font-semibold flex items-center gap-1 transition-colors"
                          title="Open Styled Template & Stripe Portal"
                        >
                          <FileText className="w-3.5 h-3.5 text-teal-400" />
                          <span>Template</span>
                        </button>

                        <button
                          onClick={() => setSelectedInvoiceForModal(inv)}
                          className="p-1 text-slate-400 hover:text-white hover:bg-[#222630] rounded transition-colors"
                          title="Quick View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {inv.remainingBalance > 0 && (
                          <button
                            onClick={() => markInvoicePaid(inv.id)}
                            className="px-2 py-0.5 bg-emerald-950/80 text-emerald-300 hover:bg-emerald-900 border border-emerald-500/40 rounded text-[11px] font-semibold transition-colors"
                            title="Settle full remaining balance"
                          >
                            Mark Paid
                          </button>
                        )}

                        {canPerform("canDeleteRecords") && (
                          <button
                            onClick={() => deleteInvoice(inv.id)}
                            className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-950/50 rounded transition-colors"
                            title="Delete Invoice (Requires Admin/Manager role)"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invoice Detail Modal */}
      {selectedInvoiceForModal && (
        <InvoiceDetailModal
          invoice={selectedInvoiceForModal}
          onClose={() => setSelectedInvoiceForModal(null)}
          onOpenTemplate={(id) => {
            setSelectedTemplateInvoiceId(id);
            setViewMode("template");
          }}
        />
      )}
    </div>
  );
};
