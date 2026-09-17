import React, { useEffect, useState } from "react";
import { useCRM } from "../../context/CRMContext";
import { TenantBillingProduct } from "../../types";
import { apiFetch } from "../../lib/apiClient";
import { ProductPricingModal } from "../modals/ProductPricingModal";
import {
  Landmark,
  Wallet,
  Clock,
  RefreshCw,
  Plus,
  Package,
  Link2,
  CheckCircle2,
  AlertCircle,
  Repeat,
  Zap,
  Receipt,
  FileText,
  ExternalLink,
  ShieldCheck,
  Settings as SettingsIcon,
  X,
} from "lucide-react";

interface StripeBalanceAmount {
  amount: number;
  currency: string;
}

interface StripeSubscription {
  id: string;
  status: string;
  customerName: string | null;
  customerEmail: string | null;
  productName: string;
  amount: number;
  currency: string;
  interval?: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
}

interface StripeInvoiceSummary {
  id: string;
  number: string | null;
  status: string | null;
  customerName: string | null;
  customerEmail: string | null;
  amountDue: number;
  amountPaid: number;
  currency: string;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
  createdAt: string;
}

const statusBadge = (status: string | null | undefined) => {
  const s = (status || "").toLowerCase();
  const map: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-700",
    trialing: "bg-teal-100 text-teal-700",
    paid: "bg-emerald-100 text-emerald-700",
    open: "bg-amber-100 text-amber-700",
    past_due: "bg-rose-100 text-rose-700",
    canceled: "bg-slate-200 text-slate-600",
    incomplete: "bg-slate-200 text-slate-600",
    draft: "bg-slate-200 text-slate-600",
    uncollectible: "bg-rose-100 text-rose-700",
    void: "bg-slate-200 text-slate-600",
  };
  return map[s] || "bg-slate-200 text-slate-600";
};

export const StripeView: React.FC = () => {
  const { activeTenant, addAuditLogEntry, setActiveNav } = useCRM();

  const stripeSecretKey = activeTenant?.stripeConfig?.secretKey || "";
  const isStripeConnected = !!stripeSecretKey.trim();

  const [available, setAvailable] = useState<StripeBalanceAmount[]>([]);
  const [pending, setPending] = useState<StripeBalanceAmount[]>([]);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  const [subscriptions, setSubscriptions] = useState<StripeSubscription[]>([]);
  const [isLoadingSubs, setIsLoadingSubs] = useState(false);
  const [subsError, setSubsError] = useState<string | null>(null);

  const [stripeInvoices, setStripeInvoices] = useState<StripeInvoiceSummary[]>([]);
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(false);
  const [invoicesError, setInvoicesError] = useState<string | null>(null);

  const [billingProducts, setBillingProducts] = useState<TenantBillingProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [isProductModalOpen, setProductModalOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Quick ad-hoc payment link (not tied to a saved product)
  const [isQuickLinkOpen, setQuickLinkOpen] = useState(false);
  const [quickLinkName, setQuickLinkName] = useState("");
  const [quickLinkAmount, setQuickLinkAmount] = useState("");
  const [isCreatingQuickLink, setIsCreatingQuickLink] = useState(false);
  const [quickLinkError, setQuickLinkError] = useState<string | null>(null);
  const [quickLinkResult, setQuickLinkResult] = useState<string | null>(null);

  const loadBalance = async () => {
    if (!isStripeConnected) return;
    setIsLoadingBalance(true);
    setBalanceError(null);
    try {
      const res = await apiFetch(`/api/stripe/balance?apiKey=${encodeURIComponent(stripeSecretKey)}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        setBalanceError(data.error || "Failed to load balance from Stripe.");
        return;
      }
      setAvailable(data.available || []);
      setPending(data.pending || []);
    } catch (err: any) {
      setBalanceError(err.message || "Unable to reach the billing service.");
    } finally {
      setIsLoadingBalance(false);
    }
  };

  const loadSubscriptions = async () => {
    if (!isStripeConnected) return;
    setIsLoadingSubs(true);
    setSubsError(null);
    try {
      const res = await apiFetch(`/api/stripe/subscriptions/list?apiKey=${encodeURIComponent(stripeSecretKey)}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        setSubsError(data.error || "Failed to load subscriptions from Stripe.");
        return;
      }
      setSubscriptions(data.subscriptions || []);
    } catch (err: any) {
      setSubsError(err.message || "Unable to reach the billing service.");
    } finally {
      setIsLoadingSubs(false);
    }
  };

  const loadStripeInvoices = async () => {
    if (!isStripeConnected) return;
    setIsLoadingInvoices(true);
    setInvoicesError(null);
    try {
      const res = await apiFetch(`/api/stripe/invoices/list?apiKey=${encodeURIComponent(stripeSecretKey)}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        setInvoicesError(data.error || "Failed to load invoices from Stripe.");
        return;
      }
      setStripeInvoices(data.invoices || []);
    } catch (err: any) {
      setInvoicesError(err.message || "Unable to reach the billing service.");
    } finally {
      setIsLoadingInvoices(false);
    }
  };

  const loadProducts = async () => {
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

  const refreshAll = () => {
    loadBalance();
    loadSubscriptions();
    loadStripeInvoices();
    loadProducts();
  };

  useEffect(() => {
    if (isStripeConnected) refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripeSecretKey]);

  const handleCopyLink = async (id: string, url: string, label: string) => {
    await navigator.clipboard.writeText(url);
    setCopiedId(id);
    addAuditLogEntry("Generated payment link", label, "billing");
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleGenerateProductLink = async (priceId: string, productName: string) => {
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
      await handleCopyLink(priceId, data.url, `${productName} — ${data.url}`);
    } catch (err: any) {
      setProductsError(err.message || "Unable to reach the billing service.");
    }
  };

  const handleCreateQuickLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setQuickLinkError(null);
    const numericAmount = Number(quickLinkAmount);
    if (!quickLinkName.trim()) {
      setQuickLinkError("Enter a short description for what this link is for.");
      return;
    }
    if (!numericAmount || numericAmount <= 0) {
      setQuickLinkError("Enter an amount greater than 0.");
      return;
    }
    setIsCreatingQuickLink(true);
    try {
      const res = await apiFetch("/api/stripe/quick-payment-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: stripeSecretKey,
          name: quickLinkName.trim(),
          amount: numericAmount,
          currency: activeTenant?.currency || "USD",
          quantity: 1,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setQuickLinkError(data.error || "Failed to create payment link.");
        return;
      }
      setQuickLinkResult(data.url);
      await navigator.clipboard.writeText(data.url);
      addAuditLogEntry("Generated quick payment link", `${quickLinkName.trim()} — $${numericAmount}`, "billing");
    } catch (err: any) {
      setQuickLinkError(err.message || "Unable to reach the billing service.");
    } finally {
      setIsCreatingQuickLink(false);
    }
  };

  const closeQuickLinkModal = () => {
    setQuickLinkOpen(false);
    setQuickLinkName("");
    setQuickLinkAmount("");
    setQuickLinkError(null);
    setQuickLinkResult(null);
  };

  if (!isStripeConnected) {
    return (
      <div id="stripe-view" className="space-y-5 animate-in fade-in duration-200">
        <div className="flex items-center gap-2.5">
          <Landmark className="w-5 h-5 text-teal-400" />
          <h1 className="text-lg font-black text-white">Stripe</h1>
        </div>
        <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-2xs text-center space-y-3 max-w-lg mx-auto">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-500 flex items-center justify-center mx-auto">
            <Landmark className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">Connect Your Stripe Account</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Add your Stripe secret key under <strong>Settings &rarr; Stripe Custom Keys</strong> to see your live
            balance, create payment links, and manage subscriptions and invoices from this workspace.
          </p>
          <button
            onClick={() => setActiveNav("Settings")}
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 mx-auto transition-colors"
          >
            <SettingsIcon className="w-3.5 h-3.5" />
            <span>Go to Settings</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div id="stripe-view" className="space-y-5 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Landmark className="w-5 h-5 text-teal-400" />
          <div>
            <h1 className="text-lg font-black text-white">Stripe</h1>
            <p className="text-[11px] text-slate-400">
              Live from {activeTenant?.name}'s connected Stripe account
              {activeTenant?.stripeConfig?.isLiveMode ? " (live mode)" : " (test mode)"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveNav("Invoices")}
            className="px-3 py-1.5 bg-[#181b21] hover:bg-[#222630] border border-[#2d323f] text-slate-200 hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <FileText className="w-3.5 h-3.5 text-teal-400" />
            <span>Invoice Templates</span>
          </button>
          <button
            onClick={refreshAll}
            className="px-3 py-1.5 bg-[#181b21] hover:bg-[#222630] border border-[#2d323f] text-slate-200 hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingBalance || isLoadingSubs || isLoadingInvoices || isLoadingProducts ? "animate-spin" : ""}`} />
            <span>Refresh All</span>
          </button>
        </div>
      </div>

      {/* Current Balance */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-bold uppercase tracking-wide">
              <Wallet className="w-4 h-4 text-emerald-500" />
              <span>Available Balance</span>
            </div>
          </div>
          {balanceError ? (
            <div className="text-rose-600 text-xs font-medium flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" /> {balanceError}
            </div>
          ) : available.length === 0 ? (
            <div className="text-slate-400 text-xs">{isLoadingBalance ? "Loading..." : "$0.00"}</div>
          ) : (
            <div className="space-y-1">
              {available.map((b) => (
                <div key={b.currency} className="text-2xl font-black text-slate-900">
                  {b.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} {b.currency}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-bold uppercase tracking-wide mb-2">
            <Clock className="w-4 h-4 text-amber-500" />
            <span>Pending Balance</span>
          </div>
          {pending.length === 0 ? (
            <div className="text-slate-400 text-xs">{isLoadingBalance ? "Loading..." : "$0.00"}</div>
          ) : (
            <div className="space-y-1">
              {pending.map((b) => (
                <div key={b.currency} className="text-2xl font-black text-slate-900">
                  {b.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} {b.currency}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Payment Link */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Link2 className="w-4 h-4 text-indigo-500" /> Payment Links
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Create a one-off payment link for any amount, or generate one from a saved product below.
          </p>
        </div>
        <button
          onClick={() => setQuickLinkOpen(true)}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Quick Payment Link</span>
        </button>
      </div>

      {/* Products & Pricing */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Package className="w-4 h-4 text-indigo-500" /> Products & Pricing
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Create a subscription price or a one-time fee, then share the payment link with your customer.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadProducts}
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
                      {price.type === "recurring" && <span className="text-slate-400"> / {price.interval}</span>}
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
                        onClick={() => handleGenerateProductLink(price.id, product.name)}
                        className="px-2.5 py-1 bg-[#181b21] hover:bg-[#222630] text-teal-300 border border-[#2d323f] rounded text-[11px] font-semibold flex items-center gap-1.5 transition-colors ml-auto"
                      >
                        {copiedId === price.id ? (
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

      {/* Subscriptions */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Repeat className="w-4 h-4 text-indigo-500" /> Subscriptions
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Active and past subscriptions on your Stripe account.</p>
          </div>
          <button
            onClick={loadSubscriptions}
            disabled={isLoadingSubs}
            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSubs ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>

        {subsError && (
          <div className="mx-4 mt-4 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-medium flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{subsError}</span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 whitespace-nowrap">
              <tr>
                <th className="p-3.5">Customer</th>
                <th className="p-3.5">Plan</th>
                <th className="p-3.5">Amount</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5">Renews / Ends</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {subscriptions.length === 0 && !isLoadingSubs && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-400">
                    No subscriptions yet.
                  </td>
                </tr>
              )}
              {subscriptions.map((sub) => (
                <tr key={sub.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="p-3.5 font-semibold text-slate-800">
                    {sub.customerName || sub.customerEmail || "Unknown customer"}
                    {sub.customerName && sub.customerEmail && (
                      <div className="text-[10px] font-normal text-slate-400">{sub.customerEmail}</div>
                    )}
                  </td>
                  <td className="p-3.5 text-slate-700">{sub.productName}</td>
                  <td className="p-3.5 font-mono font-semibold text-slate-800">
                    ${sub.amount.toLocaleString()} {sub.currency}
                    {sub.interval && <span className="text-slate-400"> / {sub.interval}</span>}
                  </td>
                  <td className="p-3.5">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold w-fit ${statusBadge(sub.status)}`}>
                      {sub.status}
                      {sub.cancelAtPeriodEnd ? " (canceling)" : ""}
                    </span>
                  </td>
                  <td className="p-3.5 text-slate-500 whitespace-nowrap">
                    {sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stripe Invoices */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Receipt className="w-4 h-4 text-indigo-500" /> Stripe Invoices
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Invoices sent through Stripe (from subscriptions or the invoice builder). For CRM-tracked invoices &
              templates, use the Invoices tab.
            </p>
          </div>
          <button
            onClick={loadStripeInvoices}
            disabled={isLoadingInvoices}
            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingInvoices ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>

        {invoicesError && (
          <div className="mx-4 mt-4 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-medium flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{invoicesError}</span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 whitespace-nowrap">
              <tr>
                <th className="p-3.5">Invoice</th>
                <th className="p-3.5">Customer</th>
                <th className="p-3.5">Amount</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stripeInvoices.length === 0 && !isLoadingInvoices && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-400">
                    No Stripe invoices yet.
                  </td>
                </tr>
              )}
              {stripeInvoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="p-3.5 font-semibold text-slate-800">{inv.number || inv.id}</td>
                  <td className="p-3.5 text-slate-700">
                    {inv.customerName || inv.customerEmail || "Unknown customer"}
                  </td>
                  <td className="p-3.5 font-mono font-semibold text-slate-800">
                    ${(inv.amountPaid || inv.amountDue).toLocaleString()} {inv.currency}
                  </td>
                  <td className="p-3.5">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold w-fit ${statusBadge(inv.status)}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="p-3.5 text-right">
                    {inv.hostedInvoiceUrl ? (
                      <a
                        href={inv.hostedInvoiceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 bg-[#181b21] hover:bg-[#222630] text-teal-300 border border-[#2d323f] rounded text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>View</span>
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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

      {/* Quick Payment Link Modal */}
      {isQuickLinkOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Link2 className="w-4 h-4 text-indigo-500" /> Quick Payment Link
              </h3>
              <button onClick={closeQuickLinkModal} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            {quickLinkResult ? (
              <div className="p-5 space-y-3 text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                <p className="text-xs font-semibold text-slate-700">Link created and copied to your clipboard!</p>
                <p className="text-[11px] text-slate-500 break-all bg-slate-50 border border-slate-200 rounded-lg p-2">
                  {quickLinkResult}
                </p>
                <button
                  onClick={closeQuickLinkModal}
                  className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleCreateQuickLink} className="p-5 space-y-3">
                {quickLinkError && (
                  <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-medium flex items-start gap-2">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{quickLinkError}</span>
                  </div>
                )}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">What's this payment for?</label>
                  <input
                    type="text"
                    value={quickLinkName}
                    onChange={(e) => setQuickLinkName(e.target.value)}
                    placeholder="e.g. Consulting retainer"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Amount ({activeTenant?.currency || "USD"})
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={quickLinkAmount}
                    onChange={(e) => setQuickLinkAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-indigo-400 font-mono"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isCreatingQuickLink}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                >
                  {isCreatingQuickLink ? "Creating..." : "Create & Copy Link"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 text-[11px] text-slate-400 px-1">
        <ShieldCheck className="w-3.5 h-3.5 text-teal-500" />
        <span>Funds move directly through your own Stripe account — Aargard never touches or holds them.</span>
      </div>
    </div>
  );
};
