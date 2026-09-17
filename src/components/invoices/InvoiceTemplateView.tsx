import React, { useState, useEffect, useRef } from "react";
import { useCRM } from "../../context/CRMContext";
import { Invoice, InvoiceTemplateTheme, InvoiceTemplateConfig } from "../../types";
import {
  Printer,
  CreditCard,
  Building2,
  CheckCircle2,
  ExternalLink,
  Sparkles,
  RefreshCw,
  Edit3,
  QrCode,
  Download,
  ArrowLeft,
  DollarSign,
  AlertCircle,
  FileCheck,
  ShieldCheck,
  Landmark,
} from "lucide-react";
import { apiFetch } from "../../lib/apiClient";

interface InvoiceTemplateViewProps {
  initialInvoiceId?: string;
  onBackToLedger?: () => void;
}

export const InvoiceTemplateView: React.FC<InvoiceTemplateViewProps> = ({
  initialInvoiceId,
  onBackToLedger,
}) => {
  const { invoices, companies, contacts, updateInvoice, markInvoicePaid, addPayment, currentUser, activeTenant } = useCRM();

  // Selected Invoice
  const [selectedId, setSelectedId] = useState<string>(
    initialInvoiceId || (invoices.length > 0 ? invoices[0].id : "")
  );

  const invoice = invoices.find((i) => i.id === selectedId) || invoices[0] || null;
  const company = invoice ? companies.find((c) => c.id === invoice.companyId) : null;
  const contact = invoice?.contactId ? contacts.find((c) => c.id === invoice.contactId) : null;

  // Template Theme
  const [theme, setTheme] = useState<InvoiceTemplateTheme>("executive");

  // Stripe State
  const [stripeStatus, setStripeStatus] = useState<{ isConfigured: boolean; mode: string } | null>(null);
  const [isGeneratingStripe, setIsGeneratingStripe] = useState(false);
  const [isSyncingStripe, setIsSyncingStripe] = useState(false);
  const [stripeSuccessMsg, setStripeSuccessMsg] = useState<string | null>(null);
  const [stripeErrorMsg, setStripeErrorMsg] = useState<string | null>(null);

  // Template Customization Settings
  const [isEditingTemplate, setIsEditingTemplate] = useState(false);
  const [config, setConfig] = useState<InvoiceTemplateConfig>({
    theme: "executive",
    companyName: activeTenant?.companyName || activeTenant?.name || "Aargard Business Solutions Inc.",
    companyAddress: "100 Montgomery Street, Suite 2400",
    companyCityStateZip: "San Francisco, CA 94104, USA",
    companyTaxId: activeTenant?.taxId || "US-EIN-94-2819402 / VAT: EU37201948",
    companyEmail: activeTenant?.webmailConfig?.email || "billing@aargard-solutions.com",
    companyPhone: "+1 (415) 890-2400",
    companyWebsite: "www.aargard-solutions.com",
    paymentTerms: "Net 30 Days. Invoices unpaid after 30 days are subject to 1.5% monthly late assessment.",
    bankName: "JPMorgan Chase Bank, N.A.",
    accountName: `${activeTenant?.name || "Aargard Business Solutions"} Operating`,
    accountNumber: "9482-1049-2918",
    routingOrIban: "ROUTING: 12100024 / IBAN: US34CHAS1210002494821049",
    swiftCode: "CHASUS33XXX",
    defaultNotes: `Thank you for partnering with ${activeTenant?.name || "Aargard Business Solutions"}. All cloud licenses & enterprise engineering SLA active upon execution.`,
    enableStripePayment: true,
    enableQrCode: true,
  });

  // Load Stripe configuration from backend on mount
  useEffect(() => {
    apiFetch("/api/stripe/status")
      .then((res) => res.json())
      .then((data) => {
        setStripeStatus(data);
      })
      .catch((err) => {
        console.error("Failed to check Stripe status:", err);
      });
  }, []);

  // Update theme when changed
  const handleThemeChange = (newTheme: InvoiceTemplateTheme) => {
    setTheme(newTheme);
    if (invoice) {
      updateInvoice(invoice.id, { templateTheme: newTheme });
    }
  };

  // Generate official Stripe invoice
  const handleCreateStripeInvoice = async () => {
    if (!invoice || !company) return;
    setIsGeneratingStripe(true);
    setStripeSuccessMsg(null);
    setStripeErrorMsg(null);

    try {
      const response = await apiFetch("/api/stripe/create-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          companyName: company.name,
          clientEmail: contact?.email || `${company.name.toLowerCase().replace(/[^a-z0-9]/g, "")}@example.com`,
          currency: invoice.currency || "USD",
          items: invoice.items,
          total: invoice.total,
          dueDate: invoice.dueDate,
          notes: invoice.notes || config.defaultNotes,
        }),
      });

      const data = await response.json();

      if (data.success) {
        updateInvoice(invoice.id, {
          stripeInvoiceId: data.stripeInvoiceId,
          stripeHostedUrl: data.hostedInvoiceUrl,
          stripeStatus: data.status || "open",
          stripeLiveMode: data.liveMode,
        });

        setStripeSuccessMsg(
          data.liveMode
            ? "Stripe Invoice successfully created and finalized! Public payment portal link generated."
            : "Stripe Invoice simulated successfully. Add STRIPE_SECRET_KEY in Settings to process real credit cards."
        );
      } else {
        setStripeErrorMsg(data.error || "Failed to create Stripe invoice");
      }
    } catch (err: any) {
      setStripeErrorMsg(err.message || "Network error communicating with Stripe server");
    } finally {
      setIsGeneratingStripe(false);
    }
  };

  // Generate instant Stripe Checkout payment link
  const handleCreatePaymentLink = async () => {
    if (!invoice || !company) return;
    setIsGeneratingStripe(true);
    setStripeSuccessMsg(null);
    setStripeErrorMsg(null);

    try {
      const response = await apiFetch("/api/stripe/create-payment-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          companyName: company.name,
          clientEmail: contact?.email,
          currency: invoice.currency || "USD",
          amount: invoice.remainingBalance || invoice.total,
          description: `AarPex CRM Settlement for Invoice #${invoice.invoiceNumber}`,
        }),
      });

      const data = await response.json();

      if (data.success && data.checkoutUrl) {
        updateInvoice(invoice.id, {
          stripePaymentLink: data.checkoutUrl,
          stripeLiveMode: data.liveMode,
        });

        setStripeSuccessMsg("Instant Stripe Checkout link generated! Ready to send to customer.");
      } else {
        setStripeErrorMsg(data.error || "Failed to generate Stripe payment link");
      }
    } catch (err: any) {
      setStripeErrorMsg(err.message || "Network error connecting to Stripe");
    } finally {
      setIsGeneratingStripe(false);
    }
  };

  // Sync payment status with Stripe
  const handleSyncStripeStatus = async () => {
    if (!invoice || !invoice.stripeInvoiceId) return;
    setIsSyncingStripe(true);
    setStripeSuccessMsg(null);
    setStripeErrorMsg(null);

    try {
      const response = await apiFetch("/api/stripe/sync-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stripeInvoiceId: invoice.stripeInvoiceId,
        }),
      });

      const data = await response.json();

      if (data.success) {
        if (data.isPaid) {
          markInvoicePaid(invoice.id);
          setStripeSuccessMsg("Stripe payment confirmed! Invoice marked as settled in CRM ledger.");
        } else {
          setStripeSuccessMsg(`Stripe status synced: ${data.status.toUpperCase()}. Awaiting customer settlement.`);
        }
      } else {
        setStripeErrorMsg(data.error || "Could not retrieve Stripe status");
      }
    } catch (err: any) {
      setStripeErrorMsg(err.message || "Failed to sync status");
    } finally {
      setIsSyncingStripe(false);
    }
  };

  // One-click simulated payment for test invoices
  const handleInstantSettle = () => {
    if (!invoice) return;
    markInvoicePaid(invoice.id);
    addPayment({
      paymentNumber: `PAY-STRIPE-${Math.floor(1000 + Math.random() * 9000)}`,
      companyId: invoice.companyId,
      invoiceId: invoice.id,
      dealId: invoice.dealId,
      date: new Date().toISOString().split("T")[0],
      amount: invoice.remainingBalance,
      currency: invoice.currency || "USD",
      paymentMethod: "Card",
      reference: invoice.stripeInvoiceId || `stripe_pi_${Date.now()}`,
      notes: "Settled via Integrated Stripe Invoicing portal",
      recordedBy: currentUser.name,
    });
    setStripeSuccessMsg("Payment received & recorded in company ledger!");
  };

  if (!invoice) {
    return (
      <div className="p-8 text-center text-slate-400 bg-[#181b21] rounded-2xl border border-[#2d323f]">
        <p>No invoices available to render. Please create an invoice first.</p>
        {onBackToLedger && (
          <button
            onClick={onBackToLedger}
            className="mt-4 px-4 py-2 bg-teal-600 text-white rounded-lg text-xs font-semibold"
          >
            Back to Invoices Ledger
          </button>
        )}
      </div>
    );
  }

  // Active Stripe payment link or hosted URL
  const paymentUrl =
    invoice.stripePaymentLink ||
    invoice.stripeHostedUrl ||
    `https://checkout.stripe.com/pay/${invoice.invoiceNumber.toLowerCase()}`;

  return (
    <div id="invoice-template-container" className="space-y-5 animate-in fade-in duration-200">
      {/* Non-printable Control Toolbar */}
      <div className="print:hidden bg-[#181b21] p-4 rounded-xl border border-[#2d323f] shadow-md flex flex-wrap items-center justify-between gap-4">
        {/* Left: Navigation & Invoice Picker */}
        <div className="flex items-center gap-3">
          {onBackToLedger && (
            <button
              onClick={onBackToLedger}
              className="px-3 py-1.5 bg-[#121418] hover:bg-[#222630] text-slate-300 hover:text-white border border-[#2d323f] rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-teal-400" />
              <span>Back to Ledger</span>
            </button>
          )}

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-400">Select Invoice:</span>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="px-2.5 py-1.5 bg-[#121418] border border-[#2d323f] text-white rounded-lg text-xs font-mono font-bold focus:outline-none focus:border-teal-400"
            >
              {invoices.map((inv) => {
                const c = companies.find((co) => co.id === inv.companyId);
                return (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoiceNumber} - {c?.name || "Client"} (${inv.total.toLocaleString()} - {inv.status})
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {/* Center: Template Styles */}
        <div className="flex items-center gap-1.5 bg-[#121418] p-1 rounded-lg border border-[#2d323f]">
          <button
            onClick={() => handleThemeChange("executive")}
            className={`px-3 py-1 text-xs rounded-md font-semibold transition-all ${
              theme === "executive"
                ? "bg-[#252a36] text-teal-300 border border-[#3d4455] shadow-xs"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Executive Dark Grey
          </button>
          <button
            onClick={() => handleThemeChange("modern")}
            className={`px-3 py-1 text-xs rounded-md font-semibold transition-all ${
              theme === "modern"
                ? "bg-slate-100 text-slate-900 shadow-xs"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Corporate Clean Light
          </button>
          <button
            onClick={() => handleThemeChange("classic")}
            className={`px-3 py-1 text-xs rounded-md font-semibold transition-all ${
              theme === "classic"
                ? "bg-teal-900/80 text-teal-300 border border-teal-500/40 shadow-xs"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Teal Vanguard
          </button>
        </div>

        {/* Right: Actions (Stripe, Print, Edit) */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsEditingTemplate(!isEditingTemplate)}
            className="px-3 py-1.5 bg-[#121418] hover:bg-[#222630] text-slate-300 hover:text-white border border-[#2d323f] rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Edit3 className="w-3.5 h-3.5 text-teal-400" />
            <span>{isEditingTemplate ? "Hide Settings" : "Customize Template"}</span>
          </button>

          <button
            onClick={() => window.print()}
            className="px-3 py-1.5 bg-[#252a36] hover:bg-[#2f3544] text-white border border-[#3d4455] font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-sm transition-all"
          >
            <Printer className="w-3.5 h-3.5 text-teal-400" />
            <span>Print / Save PDF</span>
          </button>
        </div>
      </div>

      {/* Stripe Invoicing Panel */}
      <div className="print:hidden bg-[#181b21] border border-[#2d323f] rounded-xl p-4 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#635bff]/20 border border-[#635bff]/40 flex items-center justify-center shrink-0">
              <CreditCard className="w-5 h-5 text-[#635bff]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-sm flex items-center gap-1.5">
                  Stripe Invoicing & Online Payment Portal
                </span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                    stripeStatus?.isConfigured
                      ? "bg-teal-950 text-teal-300 border border-teal-500/40"
                      : "bg-slate-800 text-slate-300 border border-slate-700"
                  }`}
                >
                  {stripeStatus?.isConfigured ? "Live Mode Ready" : "Simulation Mode"}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Generate hosted payment links, credit card checkouts, and customer invoices directly linked to Stripe.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!invoice.stripeInvoiceId && (
              <button
                onClick={handleCreateStripeInvoice}
                disabled={isGeneratingStripe}
                className="px-3 py-1.5 bg-[#635bff] hover:bg-[#5349e0] active:bg-[#4339c0] text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingStripe ? "animate-spin" : ""}`} />
                <span>Create Stripe Invoice</span>
              </button>
            )}

            {!invoice.stripePaymentLink && (
              <button
                onClick={handleCreatePaymentLink}
                disabled={isGeneratingStripe}
                className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>Generate Stripe Pay Link</span>
              </button>
            )}

            {invoice.stripeInvoiceId && (
              <button
                onClick={handleSyncStripeStatus}
                disabled={isSyncingStripe}
                className="px-3 py-1.5 bg-[#121418] hover:bg-[#222630] text-teal-300 border border-teal-500/40 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingStripe ? "animate-spin" : ""}`} />
                <span>Sync Stripe Status</span>
              </button>
            )}

            {invoice.remainingBalance > 0 && (
              <button
                onClick={handleInstantSettle}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm transition-all"
                title="Mark as paid and record ledger receipt immediately"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Simulate Settle ($)</span>
              </button>
            )}
          </div>
        </div>

        {/* Live Stripe Links Bar if already generated */}
        {(invoice.stripeHostedUrl || invoice.stripePaymentLink) && (
          <div className="mt-3 pt-3 border-t border-[#2d323f] flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <span className="font-semibold text-teal-400">Customer Stripe Portal:</span>
              <span className="font-mono text-[11px] text-slate-400 truncate max-w-xs sm:max-w-md">
                {paymentUrl}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={paymentUrl}
                target="_blank"
                rel="noreferrer"
                className="px-2.5 py-1 bg-[#121418] hover:bg-[#222630] text-[#635bff] font-semibold rounded-md border border-[#635bff]/30 flex items-center gap-1 transition-colors"
              >
                <span>Open Checkout</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        )}

        {/* Alerts & Messages */}
        {stripeSuccessMsg && (
          <div className="mt-2.5 p-2 bg-teal-950/80 border border-teal-500/40 rounded-lg text-xs text-teal-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
            <span>{stripeSuccessMsg}</span>
          </div>
        )}
        {stripeErrorMsg && (
          <div className="mt-2.5 p-2 bg-rose-950/80 border border-rose-500/40 rounded-lg text-xs text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{stripeErrorMsg}</span>
          </div>
        )}
      </div>

      {/* Template Customizer Drawer (Collapsible) */}
      {isEditingTemplate && (
        <div className="print:hidden bg-[#181b21] p-5 rounded-xl border border-[#2d323f] shadow-xl text-xs text-slate-300 space-y-4">
          <div className="flex items-center justify-between border-b border-[#2d323f] pb-2">
            <span className="font-bold text-white text-sm flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-teal-400" /> Customize Corporate Invoice Template
            </span>
            <span className="text-slate-400 text-[11px]">Changes update the live invoice layout in real-time</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-slate-400 font-medium mb-1">Company / Legal Name</label>
              <input
                type="text"
                value={config.companyName}
                onChange={(e) => setConfig({ ...config, companyName: e.target.value })}
                className="w-full px-3 py-1.5 bg-[#121418] border border-[#2d323f] text-white rounded-lg"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">Tax ID / VAT Registration</label>
              <input
                type="text"
                value={config.companyTaxId}
                onChange={(e) => setConfig({ ...config, companyTaxId: e.target.value })}
                className="w-full px-3 py-1.5 bg-[#121418] border border-[#2d323f] text-white rounded-lg"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">Billing Email</label>
              <input
                type="text"
                value={config.companyEmail}
                onChange={(e) => setConfig({ ...config, companyEmail: e.target.value })}
                className="w-full px-3 py-1.5 bg-[#121418] border border-[#2d323f] text-white rounded-lg"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">Office Address</label>
              <input
                type="text"
                value={config.companyAddress}
                onChange={(e) => setConfig({ ...config, companyAddress: e.target.value })}
                className="w-full px-3 py-1.5 bg-[#121418] border border-[#2d323f] text-white rounded-lg"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">City, State, Zip & Country</label>
              <input
                type="text"
                value={config.companyCityStateZip}
                onChange={(e) => setConfig({ ...config, companyCityStateZip: e.target.value })}
                className="w-full px-3 py-1.5 bg-[#121418] border border-[#2d323f] text-white rounded-lg"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">Support Phone</label>
              <input
                type="text"
                value={config.companyPhone}
                onChange={(e) => setConfig({ ...config, companyPhone: e.target.value })}
                className="w-full px-3 py-1.5 bg-[#121418] border border-[#2d323f] text-white rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#2d323f]">
            <div>
              <label className="block text-slate-400 font-medium mb-1">Bank Wiring Details</label>
              <input
                type="text"
                value={config.bankName}
                onChange={(e) => setConfig({ ...config, bankName: e.target.value })}
                placeholder="Bank Name"
                className="w-full mb-2 px-3 py-1.5 bg-[#121418] border border-[#2d323f] text-white rounded-lg"
              />
              <input
                type="text"
                value={config.routingOrIban}
                onChange={(e) => setConfig({ ...config, routingOrIban: e.target.value })}
                placeholder="Routing / IBAN"
                className="w-full px-3 py-1.5 bg-[#121418] border border-[#2d323f] text-white rounded-lg"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">Invoice Payment Terms & Notes</label>
              <textarea
                rows={3}
                value={config.paymentTerms}
                onChange={(e) => setConfig({ ...config, paymentTerms: e.target.value })}
                className="w-full px-3 py-1.5 bg-[#121418] border border-[#2d323f] text-white rounded-lg resize-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* Printable Invoice Sheet Container */}
      <div className="flex justify-center">
        <div
          id="printable-invoice"
          className={`w-full max-w-4xl p-8 sm:p-12 rounded-2xl shadow-2xl transition-all duration-150 ${
            theme === "executive"
              ? "bg-[#121418] border-2 border-[#2d323f] text-slate-100"
              : theme === "modern"
              ? "bg-white text-slate-900 border border-slate-300"
              : "bg-[#0f172a] border-2 border-teal-500/30 text-slate-100"
          }`}
        >
          {/* Top Brand Header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 pb-8 border-b border-[#2d323f]">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-base shadow-md ${
                    theme === "modern"
                      ? "bg-slate-900 text-white"
                      : "bg-[#252a36] text-teal-300 border border-[#3d4455]"
                  }`}
                >
                  A
                </div>
                <div>
                  <h1
                    className={`text-xl font-extrabold tracking-tight ${
                      theme === "modern" ? "text-slate-900" : "text-white"
                    }`}
                  >
                    {config.companyName}
                  </h1>
                  <span className="text-xs text-teal-400 font-medium">Enterprise Software & Cloud Systems</span>
                </div>
              </div>

              <div className={`text-xs space-y-0.5 ${theme === "modern" ? "text-slate-600" : "text-slate-400"}`}>
                <p>{config.companyAddress}</p>
                <p>{config.companyCityStateZip}</p>
                <p>Tax ID / VAT: {config.companyTaxId}</p>
                <p>
                  {config.companyEmail} • {config.companyPhone}
                </p>
              </div>
            </div>

            {/* Right: Invoice Meta */}
            <div className="sm:text-right space-y-2">
              <div>
                <span
                  className={`text-2xl font-black tracking-wider uppercase font-mono ${
                    theme === "executive"
                      ? "text-teal-400"
                      : theme === "modern"
                      ? "text-slate-900"
                      : "text-teal-400"
                  }`}
                >
                  INVOICE
                </span>
                <div
                  className={`text-base font-bold font-mono ${
                    theme === "modern" ? "text-slate-800" : "text-white"
                  }`}
                >
                  #{invoice.invoiceNumber}
                </div>
              </div>

              <div className="inline-block">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                    invoice.status === "Paid"
                      ? "bg-emerald-900/60 text-emerald-300 border border-emerald-500/40"
                      : invoice.status === "Overdue"
                      ? "bg-[#800000]/70 text-rose-300 border border-rose-500/40"
                      : "bg-amber-900/60 text-amber-300 border border-amber-500/40"
                  }`}
                >
                  {invoice.status}
                </span>
              </div>

              <div className={`text-xs space-y-1 ${theme === "modern" ? "text-slate-600" : "text-slate-400"}`}>
                <div>
                  <span className="font-semibold">Issue Date: </span>
                  <span className="font-mono">{invoice.issueDate}</span>
                </div>
                <div>
                  <span className="font-semibold">Payment Due: </span>
                  <span className="font-mono font-bold text-rose-400">{invoice.dueDate}</span>
                </div>
                {invoice.poNumber && (
                  <div>
                    <span className="font-semibold">PO #: </span>
                    <span className="font-mono">{invoice.poNumber}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Client & Billing Info Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-6 border-b border-[#2d323f] text-xs">
            <div>
              <span
                className={`font-bold uppercase tracking-wider block mb-2 ${
                  theme === "modern" ? "text-slate-500" : "text-teal-400"
                }`}
              >
                Billed To (Client):
              </span>
              <div
                className={`text-base font-bold ${
                  theme === "modern" ? "text-slate-900" : "text-white"
                }`}
              >
                {company?.name || "Corporate Account"}
              </div>
              {contact && (
                <p className={theme === "modern" ? "text-slate-700" : "text-slate-300"}>
                  Attn: {contact.firstName} {contact.lastName} ({contact.position})
                </p>
              )}
              {contact?.email && (
                <p className={theme === "modern" ? "text-slate-600" : "text-slate-400"}>
                  Email: {contact.email}
                </p>
              )}
              {company && (
                <p className={theme === "modern" ? "text-slate-600" : "text-slate-400"}>
                  {company.city}, {company.country}
                </p>
              )}
            </div>

            <div>
              <span
                className={`font-bold uppercase tracking-wider block mb-2 ${
                  theme === "modern" ? "text-slate-500" : "text-teal-400"
                }`}
              >
                Payment Instructions:
              </span>
              <div className={`space-y-1 ${theme === "modern" ? "text-slate-600" : "text-slate-300"}`}>
                <p className="font-semibold">Wire / ACH: {config.bankName}</p>
                <p className="font-mono text-[11px]">{config.routingOrIban}</p>
                <p className="font-mono text-[11px]">SWIFT: {config.swiftCode}</p>
                <p className="text-teal-400 font-medium pt-1">
                  Credit Card / Online: Instant settlement via integrated Stripe Portal
                </p>
              </div>
            </div>
          </div>

          {/* Itemized Line Items Table */}
          <div className="py-6">
            <table className="w-full text-left text-xs">
              <thead>
                <tr
                  className={`border-b font-bold uppercase tracking-wider ${
                    theme === "modern"
                      ? "border-slate-300 text-slate-700 bg-slate-50"
                      : "border-[#2d323f] text-slate-300 bg-[#181b21]"
                  }`}
                >
                  <th className="py-3 px-3">#</th>
                  <th className="py-3 px-3">Description</th>
                  <th className="py-3 px-3 text-center">Qty</th>
                  <th className="py-3 px-3 text-right">Unit Price</th>
                  <th className="py-3 px-3 text-right">Discount</th>
                  <th className="py-3 px-3 text-right">Tax</th>
                  <th className="py-3 px-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody
                className={`divide-y ${
                  theme === "modern" ? "divide-slate-200" : "divide-[#2d323f]"
                }`}
              >
                {invoice.items.map((item, idx) => {
                  const lineTotal = Math.round(
                    item.quantity * item.unitPrice * (1 - (item.discountPercent || 0) / 100)
                  );
                  return (
                    <tr key={item.id || idx}>
                      <td className="py-3 px-3 font-mono text-slate-400">{idx + 1}</td>
                      <td className="py-3 px-3 font-medium">
                        <div className={theme === "modern" ? "text-slate-900" : "text-white"}>
                          {item.description}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center font-mono">{item.quantity}</td>
                      <td className="py-3 px-3 text-right font-mono">
                        ${item.unitPrice.toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-amber-400">
                        {item.discountPercent > 0 ? `${item.discountPercent}%` : "—"}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-400">
                        {item.taxPercent > 0 ? `${item.taxPercent}%` : "—"}
                      </td>
                      <td
                        className={`py-3 px-3 text-right font-mono font-bold ${
                          theme === "modern" ? "text-slate-900" : "text-white"
                        }`}
                      >
                        ${lineTotal.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Subtotals & Balances Calculation Row */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-6 pt-4 border-t border-[#2d323f]">
            {/* Left: Stripe Payment Card & QR Code */}
            <div
              className={`p-4 rounded-xl border flex-1 max-w-sm ${
                theme === "modern"
                  ? "bg-slate-50 border-slate-200"
                  : "bg-[#181b21] border-[#2d323f]"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-xs flex items-center gap-1.5 text-teal-400">
                  <CreditCard className="w-3.5 h-3.5" /> Instant Online Stripe Settlement
                </span>
                <span className="text-[10px] text-slate-400 font-mono">SSL 256-bit</span>
              </div>

              <div className="flex items-center gap-4">
                {/* Visual SVG QR Code */}
                <div className="w-20 h-20 bg-white p-1.5 rounded-lg border border-slate-300 shrink-0 flex items-center justify-center">
                  <svg className="w-full h-full" viewBox="0 0 29 29" fill="black">
                    <path d="M0,0 h7 v7 h-7 z M1,1 h5 v5 h-5 z M2,2 h3 v3 h-3 z" />
                    <path d="M22,0 h7 v7 h-7 z M23,1 h5 v5 h-5 z M24,2 h3 v3 h-3 z" />
                    <path d="M0,22 h7 v7 h-7 z M1,23 h5 v5 h-5 z M2,24 h3 v3 h-3 z" />
                    <rect x="9" y="2" width="2" height="4" />
                    <rect x="13" y="1" width="3" height="2" />
                    <rect x="18" y="2" width="2" height="3" />
                    <rect x="9" y="8" width="4" height="2" />
                    <rect x="15" y="7" width="2" height="4" />
                    <rect x="2" y="9" width="3" height="3" />
                    <rect x="10" y="12" width="9" height="5" />
                    <rect x="8" y="19" width="3" height="4" />
                    <rect x="13" y="19" width="4" height="2" />
                    <rect x="19" y="18" width="3" height="4" />
                    <rect x="24" y="10" width="3" height="3" />
                    <rect x="24" y="15" width="2" height="5" />
                    <rect x="23" y="22" width="4" height="2" />
                  </svg>
                </div>

                <div className="space-y-1.5 text-[11px] text-slate-400">
                  <p className="leading-tight">
                    Scan with smartphone camera to pay immediately via Apple Pay, Google Pay, or Card.
                  </p>
                  <a
                    href={paymentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-bold text-[#635bff] hover:underline"
                  >
                    <span>Click to open Stripe Checkout</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>

            {/* Right: Numbers Summary */}
            <div className="w-full sm:w-72 space-y-2 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Subtotal:</span>
                <span className="font-mono font-medium">${invoice.subtotal.toLocaleString()}</span>
              </div>
              {invoice.discount > 0 && (
                <div className="flex justify-between text-amber-400">
                  <span>Discount:</span>
                  <span className="font-mono font-medium">-${invoice.discount.toLocaleString()}</span>
                </div>
              )}
              {invoice.tax > 0 && (
                <div className="flex justify-between text-slate-400">
                  <span>Estimated Tax:</span>
                  <span className="font-mono font-medium">+${invoice.tax.toLocaleString()}</span>
                </div>
              )}
              <div
                className={`flex justify-between text-sm font-bold pt-2 border-t border-[#2d323f] ${
                  theme === "modern" ? "text-slate-900" : "text-white"
                }`}
              >
                <span>Total Invoiced:</span>
                <span className="font-mono">${invoice.total.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-emerald-400 font-semibold">
                <span>Amount Paid:</span>
                <span className="font-mono">-${invoice.amountPaid.toLocaleString()}</span>
              </div>
              <div
                className={`flex justify-between text-base font-extrabold pt-2 border-t-2 border-[#2d323f] ${
                  invoice.remainingBalance > 0
                    ? "text-rose-400"
                    : "text-emerald-400"
                }`}
              >
                <span>Balance Due:</span>
                <span className="font-mono">${invoice.remainingBalance.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Footer Terms & Signatures */}
          <div className="pt-8 mt-8 border-t border-[#2d323f] text-xs space-y-4">
            <div className={theme === "modern" ? "text-slate-600" : "text-slate-400"}>
              <strong>Payment Terms & SLA: </strong> {config.paymentTerms}
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-end gap-6 pt-4">
              <div className={`text-[11px] ${theme === "modern" ? "text-slate-500" : "text-slate-500"}`}>
                <p>{config.companyName} is an authorized AarPex cloud enterprise solutions provider.</p>
                <p>Electronic invoice verified and cryptographic integrity ensured.</p>
              </div>

              <div className="text-right">
                <div className="h-8 border-b border-slate-500 w-48 mb-1" />
                <span className={`text-[11px] font-semibold ${theme === "modern" ? "text-slate-700" : "text-slate-400"}`}>
                  Authorized Finance Officer
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
