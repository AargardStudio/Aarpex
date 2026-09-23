import React, { useState } from "react";
import { useCRM } from "../../context/CRMContext";
import {
  ShieldCheck,
  CheckCircle2,
  X,
  CreditCard,
  Sparkles,
  Zap,
  ArrowRight,
  Clock,
  Users,
  Check,
  Building,
  RefreshCw,
} from "lucide-react";
import {
  VISIBLE_SUBSCRIPTION_PLANS,
  SubscriptionPlan,
  PLATFORM_TRIAL_DAYS,
  buildPlatformPaymentLinkUrl,
  getSelectablePlansForEmail,
} from "../../data/subscriptionPlans";
import { apiFetch } from "../../lib/apiClient";

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({ isOpen, onClose }) => {
  const { activeTenant, updateTenant, users } = useCRM();
  const [selectedPlanId, setSelectedPlanId] = useState<"Starter" | "Growth" | "Pro" | "Enterprise">(
    (activeTenant?.plan as any) || "Growth"
  );
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annually">(
    activeTenant?.billingCycle || "annually"
  );
  const [isUpdating, setIsUpdating] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Pro is testing-only right now — only the allowlisted tester email(s)
  // can see or select it here. Everyone else's picker only ever shows
  // Growth. An existing Pro tenant that isn't on the allowlist (shouldn't
  // happen, but just in case) still falls back through
  // VISIBLE_SUBSCRIPTION_PLANS so its own "Current Plan" badge is correct.
  const selectablePlans = getSelectablePlansForEmail(activeTenant?.ownerEmail);
  const currentPlan =
    VISIBLE_SUBSCRIPTION_PLANS.find((p) => p.id === activeTenant?.plan) || VISIBLE_SUBSCRIPTION_PLANS[0];
  const targetPlan = selectablePlans.find((p) => p.id === selectedPlanId) || currentPlan;

  const handleUpdateSubscription = async () => {
    setIsUpdating(true);
    setSuccessMessage(null);

    try {
      const price = billingCycle === "annually" ? targetPlan.annualPrice : targetPlan.monthlyPrice;

      // A workspace with no Stripe customer on file yet hasn't paid through
      // the API-driven Checkout Session flow before -- it's either still on
      // the free trial or came in through a Payment Link originally. Sending
      // it to the real Payment Link for the *target* plan (Growth or Pro,
      // whichever it's switching to) collects a real card the same way
      // sign-up does, rather than faking activation locally.
      if (!activeTenant?.stripeCustomerId) {
        window.location.href = buildPlatformPaymentLinkUrl(
          activeTenant?.ownerEmail || "billing@aarpex.com",
          activeTenant?.id || `tenant_${Date.now()}`,
          targetPlan.id
        );
        return;
      }

      // Call backend API endpoint to register subscription checkout (against
      // Aargard's own platform Stripe account, configured server-side only).
      let checkoutUrl: string | null = null;
      try {
        const res = await apiFetch("/api/subscriptions/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenantId: activeTenant.id,
            plan: targetPlan.id,
            billingCycle,
            email: activeTenant.ownerEmail || "billing@aarpex.com",
            organizationName: activeTenant.companyName || activeTenant.name,
          }),
        });
        const data = await res.json();
        if (data?.checkoutUrl) checkoutUrl = data.checkoutUrl;
      } catch (err) {
        console.warn("Backend checkout call logged:", err);
      }

      if (checkoutUrl) {
        // Real Stripe Checkout is available — hand off to Stripe to collect payment.
        window.location.href = checkoutUrl;
        return;
      }

      updateTenant(activeTenant.id, {
        plan: targetPlan.id,
        billingCycle,
        subscriptionPrice: price,
        seatsAllocated: targetPlan.seats,
        subscriptionStatus: "active",
        nextBillingDate: new Date(Date.now() + (billingCycle === "annually" ? 365 : 30) * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0],
      });
      setSuccessMessage(`Subscription successfully activated for ${targetPlan.name} — $${price}/mo!`);
      setTimeout(() => {
        setSuccessMessage(null);
      }, 3500);
    } finally {
      setIsUpdating(false);
    }
  };

  // Opens the Stripe-hosted Customer Portal so the workspace owner can
  // add a new card, change their default payment method, update their
  // billing address, or download past invoices — without anyone here
  // having to do it for them.
  const handleManagePaymentMethod = async () => {
    setPortalError(null);
    if (!activeTenant?.stripeCustomerId) {
      setPortalError(
        "No Stripe billing account is on file for this workspace yet — this can happen for workspaces created before live billing was connected. Contact support to link one."
      );
      return;
    }

    setIsOpeningPortal(true);
    try {
      const res = await apiFetch("/api/subscriptions/billing-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: activeTenant.stripeCustomerId }),
      });
      const data = await res.json();
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      setPortalError(data?.error || "Unable to open the billing portal. Please try again.");
    } catch (err: any) {
      setPortalError(err.message || "Unable to reach the billing service. Please try again.");
    } finally {
      setIsOpeningPortal(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-[#181b21] border border-[#2d323f] rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden text-xs text-slate-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#2d323f] flex items-center justify-between bg-[#121418]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-500/15 border border-teal-500/30 text-teal-400 flex items-center justify-center font-bold shadow-sm">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Subscription & Workspace Billing</h2>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${
                    activeTenant?.subscriptionStatus === "trialing"
                      ? "bg-amber-950/60 border border-amber-500/40 text-amber-300"
                      : "bg-emerald-950/60 border border-emerald-500/40 text-emerald-300"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                      activeTenant?.subscriptionStatus === "trialing" ? "bg-amber-400" : "bg-emerald-400"
                    }`}
                  />
                  {activeTenant?.subscriptionStatus === "trialing" ? "Free Trial" : "Active Subscription"}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Managed tenant organization: <strong className="text-white">{activeTenant?.name}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-[#252a36] hover:bg-[#2f3544] text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[82vh] overflow-y-auto custom-scrollbar">
          {/* Current Status Banner */}
          <div className="p-4 rounded-xl bg-[#121418] border border-[#282d39] grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">Current Plan</span>
              <div className="text-base font-black text-white mt-0.5 flex items-center gap-1.5">
                <span>{activeTenant?.plan || "Growth"}</span>
                <span className="text-xs font-semibold text-teal-400">({activeTenant?.billingCycle || "annual"})</span>
              </div>
              <span className="text-[11px] text-slate-400 mt-0.5 block">
                ${activeTenant?.subscriptionPrice || 29}/mo flat rate
              </span>
            </div>

            <div>
              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">Seat Allocation</span>
              <div className="text-base font-black text-white mt-0.5 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-teal-400" />
                <span>{users.length} of {activeTenant?.seatsAllocated || 5} used</span>
              </div>
              <span className="text-[11px] text-slate-400 mt-0.5 block">Isolated role permissions</span>
            </div>

            <div>
              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">
                {activeTenant?.subscriptionStatus === "trialing" ? "Trial Ends" : "Next Renewal"}
              </span>
              <div className="text-base font-black text-white mt-0.5 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-teal-400" />
                <span>{activeTenant?.nextBillingDate || "2027-01-15"}</span>
              </div>
              <span className="text-[11px] text-slate-400 mt-0.5 block">
                {activeTenant?.subscriptionStatus === "trialing"
                  ? "No charge until trial ends"
                  : `Card •••• ${activeTenant?.cardLast4 || "4242"}`}
              </span>
            </div>
          </div>

          <div>
            <h3 className="font-bold text-white text-sm">AarPex Subscription</h3>
            <p className="text-[11px] text-slate-400">
              One flat plan, everything included. {PLATFORM_TRIAL_DAYS}-day free trial, no tiers, no annual lock-in.
            </p>
          </div>

          {/* Plan */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
            {selectablePlans.map((plan) => {
              const isSelected = selectedPlanId === plan.id;
              const isCurrent = activeTenant?.plan === plan.id;
              const price = billingCycle === "annually" ? plan.annualPrice : plan.monthlyPrice;

              return (
                <div
                  key={plan.id}
                  onClick={() => setSelectedPlanId(plan.id)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer relative flex flex-col justify-between ${
                    isSelected
                      ? "bg-teal-950/20 border-teal-500 shadow-md ring-1 ring-teal-500"
                      : "bg-[#121418] border-[#282d39] hover:border-slate-600"
                  }`}
                >
                  {plan.isPopular && (
                    <span className="absolute -top-2.5 right-3 px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-teal-500 text-slate-950 shadow-sm">
                      Most Popular
                    </span>
                  )}

                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-black text-white">{plan.name}</span>
                      {isCurrent && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#222630] text-teal-300 border border-teal-500/30">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1 min-h-[28px]">{plan.tagline}</p>

                    <div className="my-3">
                      <span className="text-2xl font-black text-white">${price}</span>
                      <span className="text-slate-400 text-[10px]"> / month</span>
                      <div className="text-[10px] text-emerald-400 font-semibold">
                        {PLATFORM_TRIAL_DAYS}-day free trial, then billed monthly
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-2 border-t border-[#252a36]">
                      {plan.features.slice(0, 4).map((feat, idx) => (
                        <div key={idx} className="flex items-start gap-1.5 text-[10px] text-slate-300">
                          <Check className="w-3 h-3 text-teal-400 shrink-0 mt-0.5" />
                          <span>{feat}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-3 mt-3 border-t border-[#252a36]">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPlanId(plan.id);
                      }}
                      className={`w-full py-1.5 rounded-lg text-xs font-bold transition-all ${
                        isSelected
                          ? "bg-teal-600 text-white"
                          : "bg-[#252a36] text-slate-300 hover:text-white"
                      }`}
                    >
                      {isCurrent ? "Current Plan" : isSelected ? "Selected" : "Select Tier"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Success Notification */}
          {successMessage && (
            <div className="p-3 bg-emerald-950/40 border border-emerald-500/40 text-emerald-200 rounded-xl text-xs flex items-center gap-2 font-bold animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Payment Method on File */}
          <div className="p-4 bg-[#14171d] rounded-xl border border-[#2d323f] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#252a36] flex items-center justify-center text-teal-300">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-white text-xs flex items-center gap-2">
                    {activeTenant?.cardLast4 ? (
                      <span>Card on File: {activeTenant?.cardBrand || "Card"} ending in {activeTenant.cardLast4}</span>
                    ) : (
                      <span>No payment method on file</span>
                    )}
                    {activeTenant?.cardLast4 && <span className="text-[10px] font-semibold text-emerald-400">Default</span>}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Automated recurring billing securely charged via Stripe Billing Engine.
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleManagePaymentMethod}
                  disabled={isOpeningPortal}
                  className="px-3.5 py-2 bg-[#252a36] hover:bg-[#2f3544] disabled:opacity-50 border border-[#3d4455] text-slate-200 hover:text-white font-bold rounded-lg flex items-center justify-center gap-2 transition-all text-xs"
                >
                  {isOpeningPortal ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Opening...</span>
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>Manage Payment Method</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleUpdateSubscription}
                  disabled={isUpdating || (selectedPlanId === activeTenant?.plan && billingCycle === activeTenant?.billingCycle)}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-bold rounded-lg flex items-center justify-center gap-2 transition-all shadow-sm"
                >
                  {isUpdating ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Updating...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Confirm Plan Change</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {portalError && (
              <div className="p-2.5 bg-rose-950/40 border border-rose-500/40 text-rose-200 rounded-lg text-[11px] font-medium">
                {portalError}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[#2d323f] bg-[#121418] flex items-center justify-end text-[11px] text-slate-400">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 bg-[#252a36] hover:bg-[#2f3544] text-slate-300 font-semibold rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
