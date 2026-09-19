import React, { useState } from "react";
import { useCRM } from "../../context/CRMContext";
import { Building2, X, Plus, Sparkles, Check, Globe, Shield } from "lucide-react";
import { PLATFORM_PLAN, PLATFORM_TRIAL_DAYS, FOUNDER_EMAIL, buildPlatformPaymentLinkUrl, generatePendingReferenceId } from "../../data/subscriptionPlans";

// Mirrors AuthPage's PENDING_SIGNUP_KEY, but for a signed-in user
// provisioning an *additional* billed workspace rather than completing
// sign-up — read back by the redirect-completion effect in CRMContext.
const PENDING_WORKSPACE_KEY = "crm_pending_workspace_v1";

export interface WorkspaceModalProps {
  // True only for the "you're signed in but have zero real workspaces"
  // gate rendered by App.tsx. In that mode this is the only thing on
  // screen (there's no dashboard behind it to fall back into), so it
  // can't be dismissed without either creating a workspace or signing
  // out -- no X button, no backdrop-click close, no plain "Cancel".
  mandatory?: boolean;
}

export const WorkspaceModal: React.FC<WorkspaceModalProps> = ({ mandatory = false }) => {
  const { isCreateTenantModalOpen, setCreateTenantModalOpen, createTenant, currentUser, signOut } = useCRM();

  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("Enterprise SaaS");
  const [currency, setCurrency] = useState("USD");
  // AarPex is a flat-rate product — every new workspace is provisioned on the single platform plan.
  const plan: "Starter" | "Growth" | "Enterprise" = PLATFORM_PLAN.id;
  const [companyName, setCompanyName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");

  if (!mandatory && !isCreateTenantModalOpen) return null;

  const isFounderAccount = (currentUser.email || "").trim().toLowerCase() === FOUNDER_EMAIL.toLowerCase();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCheckoutError("");

    // The one exempt founder account — always kept active, never routed
    // through Stripe Checkout.
    if (isFounderAccount) {
      setIsSubmitting(true);
      try {
        createTenant({
          name: name.trim(),
          industry,
          currency,
          plan,
          companyName: companyName.trim() || name.trim(),
        });
        setCreateTenantModalOpen(false);
        setName("");
        setCompanyName("");
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // Every other new workspace is its own billed subscription and must go
    // through AarPex's platform Stripe Payment Link — with a chargeable card
    // on file — before it's provisioned, exactly like sign-up. The workspace
    // is only ever created after Stripe redirects back with a confirmed
    // payment (see the redirect-completion effect in CRMContext). This
    // Payment Link is the permanent, primary checkout — see
    // subscriptionPlans.ts for why.
    setIsSubmitting(true);
    try {
      const pending = {
        name: name.trim(),
        industry,
        currency,
        companyName: companyName.trim() || name.trim(),
        ownerEmail: currentUser.email,
      };
      localStorage.setItem(PENDING_WORKSPACE_KEY, JSON.stringify(pending));

      const referenceId = generatePendingReferenceId();
      window.location.href = buildPlatformPaymentLinkUrl(currentUser.email, referenceId);
      // Execution ends here — the browser is navigating away to Stripe.
    } catch (err: any) {
      localStorage.removeItem(PENDING_WORKSPACE_KEY);
      setIsSubmitting(false);
      setCheckoutError(err.message || "Unable to start checkout. Please try again.");
    }
  };

  const content = (
    <div className="bg-[#181b21] border border-[#2d323f] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden text-xs text-slate-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#2d323f] flex items-center justify-between bg-[#121418]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/30 text-teal-400 flex items-center justify-center font-bold">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">
                {mandatory ? "Create Your Workspace" : "Create Multi-Tenant Workspace"}
              </h2>
              <p className="text-[11px] text-slate-400">
                {mandatory
                  ? "Every AarPex account works inside a workspace — create yours to continue. This is required once, the first time you sign in."
                  : "Launch an isolated organization instance with its own ledgers, custom Stripe & Webmail"}
              </p>
            </div>
          </div>
          {!mandatory && (
            <button
              onClick={() => setCreateTenantModalOpen(false)}
              className="w-7 h-7 rounded-lg bg-[#252a36] hover:bg-[#2f3544] text-slate-400 hover:text-white flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              Workspace / Organization Name <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Aargard Business Solutions, Nordic Dynamics, Horizon Agency"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!companyName) {
                  setCompanyName(e.target.value);
                }
              }}
              className="w-full px-3 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Industry Sector</label>
              <select
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="w-full px-3 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
              >
                <option value="Enterprise SaaS">Enterprise SaaS</option>
                <option value="Fintech & Banking">Fintech & Banking</option>
                <option value="Healthcare & BioTech">Healthcare & BioTech</option>
                <option value="Cybersecurity">Cybersecurity</option>
                <option value="E-Commerce & Retail">E-Commerce & Retail</option>
                <option value="Consulting & Agency">Consulting & Agency</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Default Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
              >
                <option value="USD">USD ($) - US Dollar</option>
                <option value="EUR">EUR (€) - Euro</option>
                <option value="GBP">GBP (£) - British Pound</option>
                <option value="CAD">CAD ($) - Canadian Dollar</option>
                <option value="AUD">AUD ($) - Australian Dollar</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Legal Company / Invoicing Name</label>
            <input
              type="text"
              placeholder="e.g. Aargard Business Solutions Inc."
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full px-3 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
            />
            <p className="text-[10px] text-slate-500 mt-1">Appears on tenant customer invoices and Stripe payment portal receipts.</p>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1.5">Workspace Plan</label>
            <div className="p-3 rounded-lg border bg-teal-500/10 border-teal-500/50 text-white shadow-sm flex items-center justify-between">
              <div>
                <div className="font-bold text-white text-xs flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-teal-400" />
                  <span>AarPex Standard — every feature included</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Up to {PLATFORM_PLAN.seats} team members, unlimited records &bull; {PLATFORM_TRIAL_DAYS}-day free trial
                </div>
              </div>
              <div className="text-right">
                <div className="text-base font-black text-white">${PLATFORM_PLAN.monthlyPrice}</div>
                <div className="text-[10px] text-slate-400">/ month</div>
              </div>
            </div>
          </div>

          {/* Highlights */}
          <div className="p-3 bg-[#121418] rounded-xl border border-[#2d323f] space-y-1 text-[11px] text-slate-400">
            <div className="font-semibold text-teal-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Workspace Features
            </div>
            <p>• Completely separate client directory, sales pipelines, deals, and invoices</p>
            <p>• Tenant-specific Stripe account keys (Publishable & Secret)</p>
            <p>• Custom Hostinger or company webmail SMTP for client emails</p>
          </div>

          {!isFounderAccount && (
            <p className="text-[10px] text-slate-500 -mt-1">
              You'll be asked to add a card on the next step — nothing is charged until this workspace's 7-day trial ends.
            </p>
          )}

          {checkoutError && (
            <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-lg text-[11px] text-rose-300">
              {checkoutError}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#2d323f]">
            {mandatory ? (
              <button
                type="button"
                onClick={() => signOut()}
                className="px-4 py-2 bg-[#252a36] hover:bg-[#2f3544] text-slate-300 font-semibold rounded-lg transition-colors"
              >
                Sign Out
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setCreateTenantModalOpen(false)}
                className="px-4 py-2 bg-[#252a36] hover:bg-[#2f3544] text-slate-300 font-semibold rounded-lg transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={!name.trim() || isSubmitting}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-bold rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>
                {isSubmitting
                  ? isFounderAccount
                    ? "Provisioning..."
                    : "Redirecting to Stripe..."
                  : isFounderAccount
                  ? "Create Workspace"
                  : "Continue to Payment"}
              </span>
            </button>
          </div>
        </form>
    </div>
  );

  // Non-mandatory (adding an additional workspace to an already-working
  // account): render as a dismissible modal overlay, as before. Mandatory
  // (the zero-tenant first-sign-in gate): App.tsx already provides the
  // full-screen backdrop and centering, so just render the card itself --
  // there's nothing behind it to overlay.
  if (mandatory) return content;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      {content}
    </div>
  );
};
