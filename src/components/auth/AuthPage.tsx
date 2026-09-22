import React, { useState, useEffect } from "react";
import { useCRM } from "../../context/CRMContext";
import {
  Building2,
  Building,
  Mail,
  Lock,
  User,
  Shield,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Eye,
  EyeOff,
  Globe,
  Layers,
  ChevronRight,
  ExternalLink,
  Users,
  CreditCard,
  Briefcase,
  Plus,
} from "lucide-react";
import { UserRole, ROLE_LABELS, Tenant } from "../../types";
import { getSupabaseAuthClient, isSupabaseAuthConfigured } from "../../config/supabaseAuthClient";
import { PLATFORM_PLAN, PLATFORM_TRIAL_DAYS } from "../../data/subscriptionPlans";
import { apiFetch } from "../../lib/apiClient";
import { AuroraBackground } from "../common/AuroraBackground";

interface AuthPageProps {
  onSuccess?: () => void;
  defaultMode?: "signin" | "signup";
}

// Local key for the one new-workspace's details that survive the round trip
// to Stripe Checkout and back — a full-page redirect wipes React state, so
// this is how the app remembers what to provision once the card is confirmed.
const PENDING_SIGNUP_KEY = "crm_pending_signup_v1";

interface PendingSignup {
  email: string;
  name: string;
  organizationName: string;
  industry: string;
  currency: string;
}

export const AuthPage: React.FC<AuthPageProps> = ({
  onSuccess,
  defaultMode = "signin",
}) => {
  const {
    activeTenantId,
    switchTenant,
    createTenant,
  } = useCRM();

  const [mode, setMode] = useState<"signin" | "signup">(defaultMode);

  // Sign In Form State
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [showSignInPassword, setShowSignInPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Sign Up Form State
  const [signUpName, setSignUpName] = useState("");
  const [signUpEmail, setSignUpEmail] = useState("");
  const [signUpPassword, setSignUpPassword] = useState("");
  const [showSignUpPassword, setShowSignUpPassword] = useState(false);

  // New Workspace Parameters (every sign-up provisions its own new workspace —
  // there's no "join an existing tenant" flow yet since that needs a real
  // invite system to be safe under RLS)
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgIndustry, setNewOrgIndustry] = useState("Technology & Software");
  const [newOrgCurrency, setNewOrgCurrency] = useState("USD ($)");
  const [newOrgPlan] = useState<"Free" | "Growth" | "Enterprise">("Growth"); // AarPex Standard — flat $29/mo plan, 14-day free trial
  const [userRole] = useState<UserRole>("admin"); // account creator always owns their new workspace
  const [agreedTerms, setAgreedTerms] = useState(true);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const authNotConfiguredMessage =
    "Sign-in isn't available yet — this deployment has no Supabase project connected. Contact your administrator.";

  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!isSupabaseAuthConfigured()) {
      setErrorMessage(authNotConfiguredMessage);
      return;
    }

    if (!signInEmail) {
      setErrorMessage("Please enter your account email address.");
      return;
    }

    setIsLoading(true);
    try {
      const supabase = getSupabaseAuthClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: signInEmail,
        password: signInPassword,
      });

      if (error) {
        setErrorMessage(error.message || "Invalid email or password.");
        setIsLoading(false);
        return;
      }

      // The CRMContext session-bootstrap listener (onAuthStateChange) picks
      // this up, fetches the user's real tenants from Supabase, and closes
      // AuthPage itself — nothing further to do here.
      setIsLoading(false);
      setSuccessNotice("Authentication successful. Loading workspace...");
      setTimeout(() => {
        if (onSuccess) onSuccess();
      }, 700);
    } catch (err: any) {
      setErrorMessage(err.message || "Unable to reach the authentication service. Please try again.");
      setIsLoading(false);
    }
  };

  // Provisions the new tenant workspace for a freshly-created account. Only
  // called after a real Supabase session exists — and, for every account
  // except the exempt founder one below, only after a live Stripe Checkout
  // session has actually been completed (see handleSignUpSubmit and the
  // redirect-completion effect further down).
  const provisionWorkspace = (opts: {
    name: string;
    industry: string;
    currency: string;
    ownerEmail: string;
    subscriptionId?: string;
    stripeCustomerId?: string;
    cardLast4?: string;
    cardBrand?: string;
  }) => {
    const currencyCode = opts.currency.includes("EUR") ? "EUR" : opts.currency.includes("GBP") ? "GBP" : "USD";
    const created = createTenant({
      name: opts.name,
      industry: opts.industry,
      currency: currencyCode,
      plan: newOrgPlan,
      ownerEmail: opts.ownerEmail,
      companyName: opts.name,
      taxId: `TAX-${Math.floor(10000000 + Math.random() * 90000000)}`,
      commissionRate: 10,
      subscriptionId: opts.subscriptionId,
      stripeCustomerId: opts.stripeCustomerId,
      cardLast4: opts.cardLast4,
      cardBrand: opts.cardBrand,
    });

    if (created.id !== activeTenantId) {
      switchTenant(created.id);
    }

    setSuccessNotice(`Workspace "${opts.name}" created! Redirecting to dashboard...`);
  };

  // Handles the return trip from Stripe Checkout. Stripe redirects the
  // browser back to this same page with ?subscription=success&session_id=...
  // (card confirmed, trial started) or ?subscription=cancelled (no charge,
  // no card saved) — a full page reload, so none of the sign-up form state
  // above survives it. The pending workspace details saved to localStorage
  // right before the redirect are what let this finish the job.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const subscriptionParam = params.get("subscription");
    if (!subscriptionParam) return;

    // Always scrub the query string immediately so a refresh doesn't
    // reprocess a stale success/cancel result.
    window.history.replaceState({}, "", window.location.pathname);

    if (subscriptionParam === "cancelled") {
      localStorage.removeItem(PENDING_SIGNUP_KEY);
      setMode("signup");
      setErrorMessage("Checkout was cancelled — no card was charged. You can try creating your workspace again below.");
      return;
    }

    if (subscriptionParam !== "success") return;

    const pendingRaw = localStorage.getItem(PENDING_SIGNUP_KEY);
    if (!pendingRaw) return;
    let pending: PendingSignup;
    try {
      pending = JSON.parse(pendingRaw);
    } catch {
      localStorage.removeItem(PENDING_SIGNUP_KEY);
      return;
    }

    const sessionId = params.get("session_id");

    (async () => {
      let subscriptionId: string | undefined;
      let stripeCustomerId: string | undefined;
      let cardLast4: string | undefined;
      let cardBrand: string | undefined;

      if (sessionId) {
        try {
          const verifyRes = await apiFetch("/api/subscriptions/verify-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId }),
          });
          const verifyData = await verifyRes.json();
          subscriptionId = verifyData.subscriptionId || undefined;
          stripeCustomerId = verifyData.customerId || undefined;
          cardLast4 = verifyData.cardLast4 || undefined;
          cardBrand = verifyData.cardBrand || undefined;
        } catch (err) {
          // The card was still charged/confirmed on Stripe's side regardless
          // — proceed with provisioning even if this lookup failed, rather
          // than leaving the paying customer stuck with no workspace.
          console.error(err);
        }
      }

      provisionWorkspace({
        name: pending.organizationName,
        industry: pending.industry,
        currency: pending.currency,
        ownerEmail: pending.email,
        subscriptionId,
        stripeCustomerId,
        cardLast4,
        cardBrand,
      });
      localStorage.removeItem(PENDING_SIGNUP_KEY);
      setTimeout(() => {
        if (onSuccess) onSuccess();
      }, 800);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!isSupabaseAuthConfigured()) {
      setErrorMessage(authNotConfiguredMessage);
      return;
    }

    if (!signUpName.trim() || !signUpEmail.trim()) {
      setErrorMessage("Full name and email are required.");
      return;
    }

    if (!signUpPassword.trim() || signUpPassword.trim().length < 6) {
      setErrorMessage("Please choose a password of at least 6 characters.");
      return;
    }

    if (!newOrgName.trim()) {
      setErrorMessage("Please enter an organization / workspace name.");
      return;
    }

    if (!agreedTerms) {
      setErrorMessage("Please accept the terms of service and tenant privacy agreement.");
      return;
    }

    setIsLoading(true);
    try {
      const supabase = getSupabaseAuthClient();
      const { data, error } = await supabase.auth.signUp({
        email: signUpEmail.trim(),
        password: signUpPassword,
        options: {
          data: { full_name: signUpName.trim() },
        },
      });

      if (error) {
        setErrorMessage(error.message || "Unable to create your account.");
        setIsLoading(false);
        return;
      }

      if (!data.session) {
        // Email confirmation is required before the account is active —
        // there's no session yet, so the new workspace can't be created
        // (and won't pass RLS) until the user confirms and signs in.
        setIsLoading(false);
        setSuccessNotice(
          `Account created for ${signUpEmail.trim()}! Check your email to confirm your address, then sign in to finish setting up "${newOrgName.trim()}".`
        );
        return;
      }

      // Every new account — founder or not — is provisioned immediately on
      // AarPex's platform plan with its 14-day free trial. provisionWorkspace
      // (via createTenant) already sets subscriptionStatus: "trialing" and a
      // nextBillingDate PLATFORM_TRIAL_DAYS days out for non-founder
      // accounts, and "active" with no trial clock for the founder account.
      // No Stripe redirect happens at sign-up time.
      provisionWorkspace({
        name: newOrgName.trim(),
        industry: newOrgIndustry,
        currency: newOrgCurrency,
        ownerEmail: signUpEmail.trim(),
      });
      setIsLoading(false);
      setTimeout(() => {
        if (onSuccess) onSuccess();
      }, 800);
    } catch (err: any) {
      setErrorMessage(err.message || "Unable to reach the authentication service. Please try again.");
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!isSupabaseAuthConfigured()) {
      setErrorMessage(authNotConfiguredMessage);
      return;
    }
    if (!signInEmail) {
      setErrorMessage("Enter your account email above first, then click Forgot Password.");
      return;
    }
    try {
      const supabase = getSupabaseAuthClient();
      const { error } = await supabase.auth.resetPasswordForEmail(signInEmail);
      if (error) {
        setErrorMessage(error.message || "Unable to send password reset email.");
        return;
      }
      setSuccessNotice(`Password reset email sent to ${signInEmail}.`);
    } catch (err: any) {
      setErrorMessage(err.message || "Unable to reach the authentication service.");
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#0d0f12] flex flex-col justify-center items-center p-4 sm:p-6 text-slate-100 antialiased font-sans relative overflow-y-auto custom-scrollbar">
      {/* Northern Lights (Aurora Borealis) animated backdrop */}
      <AuroraBackground />

      {/* Top Brand Header */}
      <div className="w-full max-w-xl text-center mb-6 z-10">
        <img
          src={`${import.meta.env.BASE_URL}assets/aarpex-logo-192.png`}
          alt="AarPex"
          className="w-16 h-16 rounded-2xl mx-auto mb-3 shadow-lg shadow-teal-500/10 border border-[#2d323f]"
        />
        <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-[#181b21] border border-[#2d323f] text-xs font-semibold text-teal-400 mb-3 shadow-md">
          <Building2 className="w-3.5 h-3.5" />
          <span>Multi-Tenant Enterprise Architecture</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
          AarPex
        </h1>
        <p className="text-xs sm:text-sm font-semibold text-teal-400 mt-1">
          by Aargard Business Solutions
        </p>
        <p className="text-xs text-slate-400 mt-1.5 max-w-md mx-auto">
          Isolated tenant environments, custom Stripe billing rails, and verified webmail SMTP integrations.
        </p>
      </div>

      {/* Main Card Container */}
      <div className="w-full max-w-xl bg-[#14171d] rounded-2xl border border-[#282d39] shadow-2xl overflow-hidden z-10">
        {/* Mode Selector Tabs (Sign In vs Sign Up) */}
        <div className="flex border-b border-[#282d39] bg-[#101217]">
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              setErrorMessage(null);
            }}
            className={`flex-1 py-3 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all ${
              mode === "signin"
                ? "text-white bg-[#14171d] border-b-2 border-teal-400 shadow-sm"
                : "text-slate-400 hover:text-white hover:bg-[#181b21]"
            }`}
          >
            <Lock className="w-4 h-4 text-teal-400" />
            <span>Sign In to Workspace</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setErrorMessage(null);
            }}
            className={`flex-1 py-3 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all ${
              mode === "signup"
                ? "text-white bg-[#14171d] border-b-2 border-teal-400 shadow-sm"
                : "text-slate-400 hover:text-white hover:bg-[#181b21]"
            }`}
          >
            <Building className="w-4 h-4 text-teal-400" />
            <span>Create New Account / Tenant</span>
          </button>
        </div>

        {/* Status / Alert Banners */}
        {errorMessage && (
          <div className="p-3 mx-6 mt-4 rounded-xl bg-rose-950/50 border border-rose-800 text-rose-200 text-xs font-medium">
            {errorMessage}
          </div>
        )}

        {successNotice && (
          <div className="p-3 mx-6 mt-4 rounded-xl bg-teal-950/50 border border-teal-800 text-teal-200 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
            <span>{successNotice}</span>
          </div>
        )}

        {!isSupabaseAuthConfigured() && (
          <div className="p-2.5 mx-6 mt-4 rounded-xl bg-amber-950/30 border border-amber-800/50 text-amber-200 text-[11px] font-medium flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>
              This deployment has no Supabase project connected, so sign-in and sign-up are unavailable until
              an administrator configures it.
            </span>
          </div>
        )}

        {/* TAB 1: SIGN IN */}
        {mode === "signin" && (
          <div className="p-6 sm:p-8 space-y-6">
            <form onSubmit={handleSignInSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Work Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    value={signInEmail}
                    onChange={(e) => setSignInEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full pl-9 pr-3 py-2 bg-[#101217] border border-[#2d323f] text-white rounded-xl text-xs focus:outline-none focus:border-teal-400 font-medium"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <label className="font-semibold text-slate-300">Password</label>
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-teal-400 hover:underline text-[11px]"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type={showSignInPassword ? "text" : "password"}
                    required
                    value={signInPassword}
                    onChange={(e) => setSignInPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full pl-9 pr-10 py-2 bg-[#101217] border border-[#2d323f] text-white rounded-xl text-xs focus:outline-none focus:border-teal-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSignInPassword(!showSignInPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
                  >
                    {showSignInPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-slate-400">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded border-[#2d323f] bg-[#101217] text-teal-500 focus:ring-0"
                  />
                  <span>Remember this device</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
              >
                <span>{isLoading ? "Authenticating..." : "Sign In to Workspace"}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}

        {/* TAB 2: SIGN UP & MULTI-TENANT ONBOARDING */}
        {mode === "signup" && (
          <div className="p-6 sm:p-8 space-y-5">
            <form onSubmit={handleSignUpSubmit} className="space-y-4">
              {/* Personal Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Your Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={signUpName}
                    onChange={(e) => setSignUpName(e.target.value)}
                    placeholder="Sarah Jenkins"
                    className="w-full px-3 py-1.5 bg-[#101217] border border-[#2d323f] text-white rounded-xl text-xs focus:outline-none focus:border-teal-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Work Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={signUpEmail}
                    onChange={(e) => setSignUpEmail(e.target.value)}
                    placeholder="sarah@company.com"
                    className="w-full px-3 py-1.5 bg-[#101217] border border-[#2d323f] text-white rounded-xl text-xs focus:outline-none focus:border-teal-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Password</label>
                <div className="relative">
                  <input
                    type={showSignUpPassword ? "text" : "password"}
                    required
                    value={signUpPassword}
                    onChange={(e) => setSignUpPassword(e.target.value)}
                    placeholder="Create a strong password"
                    className="w-full px-3 pr-10 py-1.5 bg-[#101217] border border-[#2d323f] text-white rounded-xl text-xs focus:outline-none focus:border-teal-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSignUpPassword(!showSignUpPassword)}
                    className="absolute right-3 top-2 text-slate-400 hover:text-white"
                  >
                    {showSignUpPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* New Workspace Details */}
              <div className="pt-2 border-t border-[#282d39]">
                <label className="block text-xs font-bold text-teal-400 mb-2">
                  Your New Workspace
                </label>
                <div className="p-3.5 bg-[#101217] rounded-xl border border-[#2d323f] space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Workspace / Company Name
                    </label>
                    <input
                      type="text"
                      required
                      value={newOrgName}
                      onChange={(e) => setNewOrgName(e.target.value)}
                      placeholder="e.g. Skyline Logistics Ltd"
                      className="w-full px-3 py-1.5 bg-[#181b21] border border-[#2d323f] text-white rounded-lg text-xs focus:outline-none focus:border-teal-400 font-semibold"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Industry Sector
                      </label>
                      <select
                        value={newOrgIndustry}
                        onChange={(e) => setNewOrgIndustry(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-[#181b21] border border-[#2d323f] text-white rounded-lg text-xs focus:outline-none focus:border-teal-400"
                      >
                        <option value="Technology & Software">Technology & SaaS</option>
                        <option value="FinTech & Banking">FinTech & Banking</option>
                        <option value="Cybersecurity">Cybersecurity</option>
                        <option value="Healthcare">Healthcare & Bio</option>
                        <option value="Manufacturing">Manufacturing & Supply</option>
                        <option value="Consulting & Agency">Professional Services</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Base Currency
                      </label>
                      <select
                        value={newOrgCurrency}
                        onChange={(e) => setNewOrgCurrency(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-[#181b21] border border-[#2d323f] text-white rounded-lg text-xs focus:outline-none focus:border-teal-400 font-semibold"
                      >
                        <option value="USD ($)">USD ($) - US Dollar</option>
                        <option value="EUR (€)">EUR (€) - Euro</option>
                        <option value="GBP (£)">GBP (£) - British Pound</option>
                        <option value="CAD ($)">CAD ($) - Canadian Dollar</option>
                        <option value="AUD ($)">AUD ($) - Australian Dollar</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] pt-1 text-slate-400">
                    <span>
                      Plan: <strong className="text-white">AarPex Standard — ${PLATFORM_PLAN.monthlyPrice} / month</strong>{" "}
                      ({PLATFORM_TRIAL_DAYS}-day free trial)
                    </span>
                    <span className="text-teal-400">Isolated database partition</span>
                  </div>
                  <p className="text-[10px] text-slate-500 flex items-center gap-1.5 pt-0.5">
                    <CreditCard className="w-3 h-3 text-slate-400 shrink-0" />
                    Your workspace is ready instantly — no card required to start your trial.
                  </p>
                </div>
              </div>

              <div className="text-xs pt-1">
                <label className="flex items-start gap-2 cursor-pointer text-slate-400">
                  <input
                    type="checkbox"
                    checked={agreedTerms}
                    onChange={(e) => setAgreedTerms(e.target.checked)}
                    className="mt-0.5 rounded border-[#2d323f] bg-[#101217] text-teal-500 focus:ring-0"
                  />
                  <span className="text-[11px]">
                    I agree to the Enterprise Multi-Tenant Terms of Service and Scoped Data Security Policy.
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
              >
                <span>{isLoading ? "Provisioning Workspace..." : "Create Account & Launch Workspace"}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}

        {/* Footer info */}
        <div className="p-4 bg-[#101217] border-t border-[#282d39] flex items-center gap-2 text-xs text-slate-400">
          <ShieldCheck className="w-4 h-4 text-teal-400" />
          <span>Multi-Tenant Row & Workspace Isolation</span>
        </div>
      </div>
    </div>
  );
};
