import React, { useState, useEffect } from "react";
import { useCRM } from "../../context/CRMContext";
import {
  Building,
  Building2,
  Save,
  CreditCard,
  Key,
  LogOut,
  Trash2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Landmark,
  ShieldCheck,
  Users,
  Mail,
  Send,
  Eye,
  EyeOff,
  ExternalLink,
  Plus,
  Layers,
  Sparkles,
  ArrowRight,
  Globe,
  FileText,
  Download,
  Database,
  Check,
  Zap,
  Clock,
} from "lucide-react";
import { ROLE_LABELS, UserRole } from "../../types";
import {
  VISIBLE_SUBSCRIPTION_PLANS,
  PLATFORM_PLAN,
  getPaymentLinkUrlForPlan,
  getSelectablePlansForEmail,
  isProTesterEmail,
} from "../../data/subscriptionPlans";
import { apiFetch } from "../../lib/apiClient";
import { getMailboxById, mailboxLabel } from "../../lib/webmail";

type SettingsTab = "workspaces" | "subscription" | "stripe" | "webmail" | "company" | "security" | "database";

export const SettingsView: React.FC = () => {
  const {
    activeNav,
    tenants,
    activeTenantId,
    activeTenant,
    switchTenant,
    updateTenant,
    deleteTenant,
    setCreateTenantModalOpen,
    settings,
    updateSettings,
    updateStripeConfig,
    addWebmailConfig,
    updateWebmailConfig,
    deleteWebmailConfig,
    setDefaultWebmailConfig,
    addAuditLogEntry,
    signOut,
    clearAllData,
    currentUser,
    users,
    setAccessControlOpen,
    rawCompanies,
    deals,
    invoices,
    settingsDeepLinkTab,
    setSettingsDeepLinkTab,
  } = useCRM() as any;

  const [activeTab, setActiveTab] = useState<SettingsTab>("workspaces");

  // Honor a deep-link request (e.g. the header's "Billing" shortcut) to land
  // directly on a specific tab — works at any point in the subscription
  // lifecycle, including mid-trial, since there's no gating on this tab.
  useEffect(() => {
    if (settingsDeepLinkTab) {
      setActiveTab(settingsDeepLinkTab as SettingsTab);
      setSettingsDeepLinkTab(null);
    }
  }, [settingsDeepLinkTab, setSettingsDeepLinkTab]);

  // Company Preferences State
  const [companyName, setCompanyName] = useState(settings?.companyName || activeTenant?.name || "Aargard Business Solutions Inc.");
  const [taxId, setTaxId] = useState(settings?.taxId || "US-987654321");
  const [currency, setCurrency] = useState(settings?.currency || "USD ($)");
  const [commissionRate, setCommissionRate] = useState(settings?.commissionRate || 10);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Subscription & Tier Management State
  const [selectedTierId, setSelectedTierId] = useState<"Starter" | "Growth" | "Pro" | "Enterprise">(
    (activeTenant?.plan as any) || "Growth"
  );
  const [tierBillingCycle, setTierBillingCycle] = useState<"monthly" | "annually">(
    activeTenant?.billingCycle || "annually"
  );
  const [isUpdatingTier, setIsUpdatingTier] = useState(false);
  const [tierNotice, setTierNotice] = useState<string | null>(null);
  const [isOpeningBillingPortal, setIsOpeningBillingPortal] = useState(false);
  const [billingPortalError, setBillingPortalError] = useState<string | null>(null);

  // Stripe Configuration State (100% Customizable in Settings)
  const stripeCfg = activeTenant?.stripeConfig || {};
  const [stripeSecretKey, setStripeSecretKey] = useState(stripeCfg.secretKey || "");
  const [stripePublishableKey, setStripePublishableKey] = useState(stripeCfg.publishableKey || "");
  const [stripeCurrency, setStripeCurrency] = useState(stripeCfg.currency || "USD");
  const [stripeAccountName, setStripeAccountName] = useState(stripeCfg.accountName || `${activeTenant?.name || "Aargard"} Stripe`);
  const [showStripeSecret, setShowStripeSecret] = useState(false);
  const [isVerifyingStripe, setIsVerifyingStripe] = useState(false);
  const [stripeVerifyResult, setStripeVerifyResult] = useState<any>(null);
  const [stripeSaveSuccess, setStripeSaveSuccess] = useState(false);

  // Webmail / Hostinger State (100% Customizable in Settings) -- a
  // workspace can connect more than one mailbox now; selectedMailboxId
  // tracks which one this form is currently editing, defaulting to the
  // tenant's default mailbox.
  const [selectedMailboxId, setSelectedMailboxId] = useState<string>(
    () => getMailboxById(activeTenant)?.id || ""
  );
  const mailCfg = getMailboxById(activeTenant, selectedMailboxId) || ({} as any);
  const [mailLabel, setMailLabel] = useState(mailCfg.label || "");
  const [mailProvider, setMailProvider] = useState<any>(mailCfg.provider || "hostinger");
  const [mailEmail, setMailEmail] = useState(mailCfg.email || currentUser?.email || "hamzamazharsheikh007@gmail.com");
  const [mailDisplayName, setMailDisplayName] = useState(mailCfg.displayName || currentUser?.name || "Hamza Sheikh");
  const [mailPassword, setMailPassword] = useState(mailCfg.password || "");
  const [showMailPassword, setShowMailPassword] = useState(false);
  const [smtpHost, setSmtpHost] = useState(mailCfg.smtpHost || "smtp.hostinger.com");
  const [smtpPort, setSmtpPort] = useState(mailCfg.smtpPort || 465);
  const [smtpEncryption, setSmtpEncryption] = useState<any>(mailCfg.smtpEncryption || "SSL");
  const [imapHost, setImapHost] = useState(mailCfg.imapHost || "imap.hostinger.com");
  const [imapPort, setImapPort] = useState(mailCfg.imapPort || 993);
  const [mailSignature, setMailSignature] = useState(mailCfg.signature || `--\n${currentUser?.name || "Hamza Sheikh"}\n${activeTenant?.name || "Aargard Business Solutions"}`);
  const [testRecipient, setTestRecipient] = useState(mailCfg.email || currentUser?.email || "hamzamazharsheikh007@gmail.com");
  const [isVerifyingMail, setIsVerifyingMail] = useState(false);
  const [mailVerifyResult, setMailVerifyResult] = useState<any>(null);
  const [isSendingTestMail, setIsSendingTestMail] = useState(false);
  const [testMailResult, setTestMailResult] = useState<any>(null);
  const [mailSaveSuccess, setMailSaveSuccess] = useState(false);

  // Synchronize local form states when active tenant changes
  useEffect(() => {
    if (activeTenant) {
      setCompanyName(activeTenant.companyName || activeTenant.name);
      setTaxId(activeTenant.taxId || "US-EIN-99214812");
      setCurrency(activeTenant.currency === "EUR" ? "EUR (€)" : activeTenant.currency === "GBP" ? "GBP (£)" : "USD ($)");
      setCommissionRate(activeTenant.commissionRate ?? 10);

      setSelectedTierId((activeTenant.plan as any) || "Growth");
      setTierBillingCycle(activeTenant.billingCycle || "annually");

      const s = activeTenant.stripeConfig || {};
      setStripeSecretKey(s.secretKey || "");
      setStripePublishableKey(s.publishableKey || "");
      setStripeCurrency(s.currency || activeTenant.currency || "USD");
      setStripeAccountName(s.accountName || `${activeTenant.name} Stripe`);
      setStripeVerifyResult(null);

      // Jump to this workspace's default mailbox -- the per-mailbox effect
      // below fills in the rest of the webmail form fields.
      setSelectedMailboxId(getMailboxById(activeTenant)?.id || "");
    }
  }, [activeTenantId]);

  // Synchronize the webmail form whenever the selected mailbox changes --
  // switching mailboxes within the tab, a new one being added, or the
  // active tenant changing (handled above, which resets selectedMailboxId).
  useEffect(() => {
    const mailboxes = activeTenant?.webmailConfigs || [];
    if (selectedMailboxId && !mailboxes.some((m: any) => m.id === selectedMailboxId)) {
      // The selected mailbox no longer exists (e.g. just deleted) -- fall
      // back to whatever is now the default.
      setSelectedMailboxId(getMailboxById(activeTenant)?.id || "");
      return;
    }
    const m = mailboxes.find((mb: any) => mb.id === selectedMailboxId) || {};
    setMailLabel(m.label || "");
    setMailProvider(m.provider || "hostinger");
    setMailEmail(m.email || currentUser?.email || "");
    setMailDisplayName(m.displayName || currentUser?.name || "");
    setMailPassword(m.password || "");
    setSmtpHost(m.smtpHost || "smtp.hostinger.com");
    setSmtpPort(m.smtpPort || 465);
    setSmtpEncryption(m.smtpEncryption || "SSL");
    setImapHost(m.imapHost || "imap.hostinger.com");
    setImapPort(m.imapPort || 993);
    setMailSignature(m.signature || `--\n${currentUser?.name}\n${activeTenant?.name}`);
    setTestRecipient(m.email || currentUser?.email || "");
    setMailVerifyResult(null);
    setTestMailResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMailboxId, activeTenant?.webmailConfigs?.length]);

  // Provider presets helper
  const applyMailPreset = (preset: "hostinger" | "gmail" | "outlook" | "cpanel" | "custom") => {
    setMailProvider(preset);
    if (preset === "hostinger") {
      setSmtpHost("smtp.hostinger.com");
      setSmtpPort(465);
      setSmtpEncryption("SSL");
      setImapHost("imap.hostinger.com");
      setImapPort(993);
    } else if (preset === "cpanel") {
      setSmtpHost("mail.yourdomain.com");
      setSmtpPort(465);
      setSmtpEncryption("SSL");
      setImapHost("mail.yourdomain.com");
      setImapPort(993);
    } else if (preset === "gmail") {
      setSmtpHost("smtp.gmail.com");
      setSmtpPort(587);
      setSmtpEncryption("STARTTLS");
      setImapHost("imap.gmail.com");
      setImapPort(993);
    } else if (preset === "outlook") {
      setSmtpHost("smtp.office365.com");
      setSmtpPort(587);
      setSmtpEncryption("STARTTLS");
      setImapHost("outlook.office365.com");
      setImapPort(993);
    }
  };

  // Verify Stripe Key via Backend
  const handleVerifyStripeKey = async () => {
    setIsVerifyingStripe(true);
    setStripeVerifyResult(null);
    try {
      const res = await apiFetch("/api/stripe/verify-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: stripeSecretKey.trim(),
          publishableKey: stripePublishableKey.trim(),
        }),
      });
      const data = await res.json();
      setStripeVerifyResult(data);
      if (data.success) {
        updateStripeConfig({
          secretKey: stripeSecretKey.trim(),
          publishableKey: stripePublishableKey.trim(),
          status: "connected",
          isLiveMode: data.isLiveMode,
          currency: stripeCurrency,
        });
        addAuditLogEntry("Verified Stripe connection", data.isLiveMode ? "Live mode" : "Test mode", "billing");
      }
    } catch (err: any) {
      setStripeVerifyResult({
        success: false,
        error: err.message || "Failed to reach backend verification service.",
      });
    } finally {
      setIsVerifyingStripe(false);
    }
  };

  // Save Stripe Config
  const handleSaveStripe = (e: React.FormEvent) => {
    e.preventDefault();
    updateStripeConfig({
      secretKey: stripeSecretKey.trim(),
      publishableKey: stripePublishableKey.trim(),
      currency: stripeCurrency,
      accountName: stripeAccountName.trim(),
      isEnabled: true,
      status: stripeSecretKey.trim() ? "connected" : "unconfigured",
      isLiveMode: stripeSecretKey.startsWith("sk_live_"),
    });
    addAuditLogEntry("Updated Stripe configuration", `Account: ${stripeAccountName.trim() || "Unnamed"}`, "billing");
    setStripeSaveSuccess(true);
    setTimeout(() => setStripeSaveSuccess(false), 3000);
  };

  // Verify Webmail SMTP Handshake via Backend
  const handleVerifyWebmail = async () => {
    setIsVerifyingMail(true);
    setMailVerifyResult(null);
    try {
      const res = await apiFetch("/api/webmail/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: mailProvider,
          email: mailEmail.trim(),
          password: mailPassword.trim(),
          smtpHost: smtpHost.trim(),
          smtpPort,
          smtpEncryption,
        }),
      });
      const data = await res.json();
      setMailVerifyResult(data);
      if (data.success && selectedMailboxId) {
        updateWebmailConfig(selectedMailboxId, {
          status: "connected",
          statusMessage: data.message,
          lastVerifiedAt: data.verifiedAt,
        });
      }
    } catch (err: any) {
      setMailVerifyResult({
        success: false,
        error: err.message || "Failed to test webmail server handshake.",
      });
    } finally {
      setIsVerifyingMail(false);
    }
  };

  // Send Test Email via Webmail Backend
  const handleSendTestEmail = async () => {
    if (!testRecipient) return;
    setIsSendingTestMail(true);
    setTestMailResult(null);
    try {
      const res = await apiFetch("/api/webmail/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: mailEmail.trim(),
          displayName: mailDisplayName.trim(),
          password: mailPassword.trim(),
          smtpHost: smtpHost.trim(),
          smtpPort,
          recipientEmail: testRecipient.trim(),
          subject: `Test verification from ${activeTenant?.name || "AarPex CRM"}`,
          body: `Webmail integration test successfully processed via ${smtpHost}:${smtpPort} (${smtpEncryption}). Workspace: ${activeTenant?.name}.`,
        }),
      });
      const data = await res.json();
      setTestMailResult(data);
    } catch (err: any) {
      setTestMailResult({
        success: false,
        error: err.message || "Could not dispatch test email.",
      });
    } finally {
      setIsSendingTestMail(false);
    }
  };

  // Save Webmail Config (for whichever mailbox is currently selected --
  // creates a new one if the workspace has none configured yet)
  const handleSaveWebmail = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      label: mailLabel.trim() || undefined,
      isEnabled: true,
      provider: mailProvider,
      email: mailEmail.trim(),
      displayName: mailDisplayName.trim(),
      password: mailPassword.trim(),
      smtpHost: smtpHost.trim(),
      smtpPort: Number(smtpPort),
      smtpEncryption,
      imapHost: imapHost.trim(),
      imapPort: Number(imapPort),
      signature: mailSignature,
      replyTo: mailEmail.trim(),
      status: mailPassword.trim() ? "connected" : "unconfigured",
    };
    if (selectedMailboxId) {
      updateWebmailConfig(selectedMailboxId, payload);
    } else {
      const created = addWebmailConfig(payload);
      setSelectedMailboxId(created.id);
    }
    addAuditLogEntry("Updated webmail configuration", mailEmail.trim(), "settings");
    setMailSaveSuccess(true);
    setTimeout(() => setMailSaveSuccess(false), 3000);
  };

  // Connect a new, blank mailbox and switch the form to it
  const handleAddMailbox = () => {
    const mailboxCount = activeTenant?.webmailConfigs?.length || 0;
    const created = addWebmailConfig({ label: `Mailbox ${mailboxCount + 1}` });
    setSelectedMailboxId(created.id);
    setMailSaveSuccess(false);
  };

  const handleDeleteMailbox = (id: string) => {
    const mailbox = (activeTenant?.webmailConfigs || []).find((m: any) => m.id === id);
    if (!confirm(`Disconnect mailbox "${mailboxLabel(mailbox)}"? Any campaign sending from it will fall back to the default mailbox.`)) {
      return;
    }
    deleteWebmailConfig(id);
    addAuditLogEntry("Disconnected webmail mailbox", mailboxLabel(mailbox), "settings");
  };

  const handleSetDefaultMailbox = (id: string) => {
    setDefaultWebmailConfig(id);
    const mailbox = (activeTenant?.webmailConfigs || []).find((m: any) => m.id === id);
    addAuditLogEntry("Set default webmail mailbox", mailboxLabel(mailbox), "settings");
  };

  // Handle Subscription Plan Modification
  const handleUpdateSubscriptionTier = async (newPlan: "Starter" | "Growth" | "Pro" | "Enterprise", newCycle: "monthly" | "annually") => {
    // Pro is testing-only — block it here too, not just in the picker's
    // rendered list, since this function is the one that actually writes
    // the tenant's plan.
    if (newPlan === "Pro" && !isProTesterEmail(activeTenant?.ownerEmail)) {
      setTierNotice("Pro is currently limited to internal testing and isn't available on this workspace yet.");
      setTimeout(() => setTierNotice(null), 3500);
      return;
    }
    setIsUpdatingTier(true);
    setTierNotice(null);
    try {
      const targetPlanConfig = VISIBLE_SUBSCRIPTION_PLANS.find((p) => p.name === newPlan) || VISIBLE_SUBSCRIPTION_PLANS[0];
      const newPrice =
        newCycle === "annually" ? targetPlanConfig?.annualPrice || PLATFORM_PLAN.monthlyPrice : targetPlanConfig?.monthlyPrice || PLATFORM_PLAN.monthlyPrice;
      const newSeats = targetPlanConfig?.seats || PLATFORM_PLAN.seats;

      // Persist plan changes to active tenant
      updateTenant(activeTenantId, {
        plan: newPlan,
        billingCycle: newCycle,
        subscriptionPrice: newPrice,
        seatsAllocated: newSeats,
        subscriptionStatus: "active",
      });

      setSelectedTierId(newPlan);
      setTierBillingCycle(newCycle);
      setTierNotice(`Workspace upgraded to ${newPlan} Tier successfully!`);
      setTimeout(() => setTierNotice(null), 3500);
    } catch (err: any) {
      setTierNotice(`Failed to update tier: ${err.message}`);
    } finally {
      setIsUpdatingTier(false);
    }
  };

  // Opens the Stripe-hosted Customer Portal (activated on the platform's
  // Stripe account) so the workspace owner can add a new card, change their
  // default payment method, update billing details, or pull past invoices
  // themselves — this is the real, live control; nothing here fakes success.
  // Most workspaces pay through the platform Payment Link (no
  // STRIPE_SECRET_KEY needed) rather than an API-created Checkout Session,
  // so they have no stripeCustomerId on file and the Billing Portal isn't
  // reachable for them yet — send them back to the same Payment Link
  // instead of a dead end.
  const handleManagePaymentMethod = async () => {
    setBillingPortalError(null);
    if (!activeTenant?.stripeCustomerId) {
      window.location.href = getPaymentLinkUrlForPlan(activeTenant?.plan);
      return;
    }

    setIsOpeningBillingPortal(true);
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
      setBillingPortalError(data?.error || "Unable to open the billing portal. Please try again.");
    } catch (err: any) {
      setBillingPortalError(err.message || "Unable to reach the billing service. Please try again.");
    } finally {
      setIsOpeningBillingPortal(false);
    }
  };

  // Save General Company Defaults
  const handleSaveCompany = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings({
      companyName,
      taxId,
      currency,
      commissionRate,
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  // Export current workspace ledger JSON
  const handleExportTenantData = () => {
    const backup = {
      tenant: activeTenant,
      exportedAt: new Date().toISOString(),
      companies: rawCompanies,
      deals,
      invoices,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeTenant?.slug || "workspace"}_crm_backup.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div id="settings-view" className="space-y-6 max-w-5xl animate-in fade-in duration-200 text-xs text-slate-200 pb-16">
      {/* Top Banner with Active Workspace Overview */}
      <div className="bg-[#181b21] p-5 rounded-2xl border border-[#2d323f] shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500/20 to-teal-500/5 border border-teal-500/40 text-teal-300 flex items-center justify-center font-black text-xl shadow-inner">
            {activeTenant?.logo || "W"}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-tight">{activeTenant?.name || "Workspace"}</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-300 border border-teal-500/30 font-semibold uppercase tracking-wider">
                {activeTenant?.plan || "Growth"} Tier
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold">
                Active Tenant
              </span>
            </div>
            <p className="text-slate-400 text-[11px] mt-0.5">
              Organization: <strong className="text-slate-300">{activeTenant?.companyName || activeTenant?.name}</strong> • Currency:{" "}
              <strong className="text-teal-400">{activeTenant?.currency || "USD"}</strong> • Industry: {activeTenant?.industry || "Enterprise"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setCreateTenantModalOpen(true)}
            className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Workspace</span>
          </button>
          <button
            onClick={handleExportTenantData}
            className="px-3 py-1.5 bg-[#252a36] hover:bg-[#2f3544] border border-[#3d4455] text-slate-300 hover:text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
            title="Export workspace backup"
          >
            <Download className="w-3.5 h-3.5 text-teal-400" />
            <span>Export JSON</span>
          </button>
        </div>
      </div>

      {/* Settings Navigation Tabs */}
      <div className="flex items-center gap-1 p-1 bg-[#121418] border border-[#2d323f] rounded-xl overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab("workspaces")}
          className={`px-3.5 py-2 rounded-lg font-bold flex items-center gap-2 transition-all whitespace-nowrap ${
            activeTab === "workspaces"
              ? "bg-teal-600 text-white shadow-sm"
              : "text-slate-400 hover:text-white hover:bg-[#1e232d]"
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>Workspaces ({tenants?.length || 1})</span>
        </button>

        <button
          onClick={() => setActiveTab("subscription")}
          className={`px-3.5 py-2 rounded-lg font-bold flex items-center gap-2 transition-all whitespace-nowrap ${
            activeTab === "subscription"
              ? "bg-teal-600 text-white shadow-sm"
              : "text-slate-400 hover:text-white hover:bg-[#1e232d]"
          }`}
        >
          <Zap className="w-3.5 h-3.5 text-teal-400" />
          <span>Subscription & Billing</span>
          <span className="px-1.5 py-0.2 rounded text-[9px] bg-teal-500/20 text-teal-300 font-bold uppercase">
            {activeTenant?.plan || "Growth"}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("stripe")}
          className={`px-3.5 py-2 rounded-lg font-bold flex items-center gap-2 transition-all whitespace-nowrap ${
            activeTab === "stripe"
              ? "bg-teal-600 text-white shadow-sm"
              : "text-slate-400 hover:text-white hover:bg-[#1e232d]"
          }`}
        >
          <CreditCard className="w-3.5 h-3.5" />
          <span>Stripe Custom Keys</span>
          {activeTenant?.stripeConfig?.status === "connected" && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("webmail")}
          className={`px-3.5 py-2 rounded-lg font-bold flex items-center gap-2 transition-all whitespace-nowrap ${
            activeTab === "webmail"
              ? "bg-teal-600 text-white shadow-sm"
              : "text-slate-400 hover:text-white hover:bg-[#1e232d]"
          }`}
        >
          <Mail className="w-3.5 h-3.5" />
          <span>Hostinger & Webmail</span>
          {(activeTenant?.webmailConfigs || []).some((m: any) => m.status === "connected") && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("company")}
          className={`px-3.5 py-2 rounded-lg font-bold flex items-center gap-2 transition-all whitespace-nowrap ${
            activeTab === "company"
              ? "bg-teal-600 text-white shadow-sm"
              : "text-slate-400 hover:text-white hover:bg-[#1e232d]"
          }`}
        >
          <Building className="w-3.5 h-3.5" />
          <span>Company & Billing</span>
        </button>

        <button
          onClick={() => setActiveTab("security")}
          className={`px-3.5 py-2 rounded-lg font-bold flex items-center gap-2 transition-all whitespace-nowrap ${
            activeTab === "security"
              ? "bg-teal-600 text-white shadow-sm"
              : "text-slate-400 hover:text-white hover:bg-[#1e232d]"
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Access & Roles</span>
        </button>

        <button
          onClick={() => setActiveTab("database")}
          className={`px-3.5 py-2 rounded-lg font-bold flex items-center gap-2 transition-all whitespace-nowrap ${
            activeTab === "database"
              ? "bg-teal-600 text-white shadow-sm"
              : "text-slate-400 hover:text-white hover:bg-[#1e232d]"
          }`}
        >
          <Database className="w-3.5 h-3.5 text-teal-400" />
          <span>Workspace Data</span>
        </button>
      </div>

      {/* TAB 1: WORKSPACES & MULTI-TENANCY */}
      {activeTab === "workspaces" && (
        <div className="space-y-5 animate-in fade-in duration-150">
          <div className="bg-[#181b21] p-6 rounded-2xl border border-[#2d323f] shadow-md space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-teal-400" /> Multi-Tenant Workspace Instances
                </h3>
                <p className="text-slate-400 mt-0.5">
                  Each workspace operates as an isolated CRM instance with its own companies, deals, invoices, currencies, Stripe credentials, and Webmail.
                </p>
              </div>
              <button
                onClick={() => setCreateTenantModalOpen(true)}
                className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-lg flex items-center gap-1.5 transition-colors self-start sm:self-auto"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Workspace</span>
              </button>
            </div>

            {/* Workspace Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {tenants?.map((tenant: any) => {
                const isActive = tenant.id === activeTenantId;
                const membersCount = tenant.members?.length || 1;
                const hasStripe = !!tenant.stripeConfig?.secretKey || !!tenant.stripeConfig?.publishableKey;
                const tenantDefaultMailbox = getMailboxById(tenant);
                const hasMail = !!tenantDefaultMailbox?.email;

                return (
                  <div
                    key={tenant.id}
                    className={`p-5 rounded-xl border transition-all relative ${
                      isActive
                        ? "bg-[#1c222b] border-teal-500/60 shadow-lg shadow-teal-500/5 ring-1 ring-teal-500/40"
                        : "bg-[#121418] border-[#2d323f] hover:border-slate-600"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-base border ${
                            isActive
                              ? "bg-teal-500/20 text-teal-300 border-teal-500/40"
                              : "bg-[#252a36] text-slate-300 border-[#3d4455]"
                          }`}
                        >
                          {tenant.logo || tenant.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-white text-sm flex items-center gap-2">
                            {tenant.name}
                            {isActive && (
                              <span className="text-[9px] px-2 py-0.2 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/40 font-bold uppercase tracking-wider">
                                Current
                              </span>
                            )}
                          </div>
                          <div className="text-slate-400 text-[11px]">
                            {tenant.industry} • <span className="text-teal-400 font-semibold">{tenant.currency}</span>
                          </div>
                        </div>
                      </div>

                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-semibold">
                        {tenant.plan || "Growth"}
                      </span>
                    </div>

                    <div className="mt-4 pt-3 border-t border-[#2d323f]/80 space-y-2 text-[11px]">
                      <div className="flex items-center justify-between text-slate-400">
                        <span>Legal Entity:</span>
                        <span className="text-slate-200 font-medium">{tenant.companyName || tenant.name}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-400">
                        <span>Team Members:</span>
                        <span className="text-slate-200">{membersCount} active user{membersCount > 1 ? "s" : ""}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-400">
                        <span>Stripe Account:</span>
                        <span className={hasStripe ? "text-teal-400 font-medium" : "text-slate-500"}>
                          {hasStripe ? "Custom Key Configured" : "Default Simulation"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-400">
                        <span>Mail Gateway:</span>
                        <span className={hasMail ? "text-teal-400 font-medium" : "text-slate-500"}>
                          {tenantDefaultMailbox?.provider?.toUpperCase() || "HOSTINGER"} ({tenantDefaultMailbox?.email || "None"})
                          {(tenant.webmailConfigs?.length || 0) > 1 ? ` +${tenant.webmailConfigs.length - 1} more` : ""}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-[#2d323f]/80 flex items-center justify-between">
                      {isActive ? (
                        <span className="text-teal-400 text-[11px] font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Workspace Active
                        </span>
                      ) : (
                        <button
                          onClick={() => switchTenant(tenant.id)}
                          className="px-3.5 py-1.5 bg-teal-600/20 hover:bg-teal-600 text-teal-300 hover:text-white border border-teal-500/40 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5"
                        >
                          <span>Switch to Workspace</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      )}

                      {tenants.length > 1 && !isActive && (
                        <button
                          onClick={() => {
                            if (confirm(`Are you sure you want to delete workspace "${tenant.name}"?`)) {
                              deleteTenant(tenant.id);
                            }
                          }}
                          className="p-1.5 text-slate-500 hover:text-rose-400 rounded transition-colors"
                          title="Delete workspace"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: STRIPE CUSTOM KEY INTEGRATION */}
      {activeTab === "stripe" && (
        <div className="space-y-5 animate-in fade-in duration-150">
          <div className="bg-[#181b21] p-6 rounded-2xl border border-[#2d323f] shadow-md space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-teal-400" /> Per-User / Per-Tenant Stripe Configuration
                </h3>
                <p className="text-slate-400 mt-0.5">
                  Input your personal or organization Stripe API keys. Payments, hosted checkouts, and customer invoices for{" "}
                  <strong className="text-teal-400">{activeTenant?.name}</strong> will execute directly against your Stripe merchant balance.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href="https://dashboard.stripe.com/apikeys"
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 bg-[#252a36] hover:bg-[#2f3544] border border-[#3d4455] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <span>Stripe Keys Dashboard</span>
                  <ExternalLink className="w-3 h-3 text-slate-400" />
                </a>
              </div>
            </div>

            {/* Connection Status Banner */}
            <div className="p-4 bg-[#121418] rounded-xl border border-[#2d323f] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className={`w-3 h-3 rounded-full ${
                    stripeSecretKey
                      ? "bg-emerald-400 shadow-sm shadow-emerald-500/50 animate-pulse"
                      : "bg-slate-500"
                  }`}
                />
                <div>
                  <div className="font-bold text-white text-xs flex items-center gap-2">
                    Gateway Mode:{" "}
                    <span className={stripeSecretKey ? "text-emerald-400" : "text-slate-400"}>
                      {stripeSecretKey.startsWith("sk_live_")
                        ? "Live Merchant Production"
                        : stripeSecretKey.startsWith("sk_test_")
                        ? "Stripe Test Mode (Real API Handshake)"
                        : "Demo / Simulated Gateway"}
                    </span>
                  </div>
                  <div className="text-slate-400 text-[11px] mt-0.5">
                    Target Workspace: <strong className="text-teal-300">{activeTenant?.name}</strong> • Currency:{" "}
                    <strong className="text-white">{stripeCurrency}</strong>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleVerifyStripeKey}
                disabled={isVerifyingStripe || !stripeSecretKey.trim()}
                className="px-3.5 py-1.5 bg-teal-600/20 hover:bg-teal-600 disabled:opacity-40 text-teal-300 hover:text-white border border-teal-500/40 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors self-start sm:self-auto"
              >
                <RefreshCw className={`w-3 h-3 ${isVerifyingStripe ? "animate-spin" : ""}`} />
                <span>{isVerifyingStripe ? "Testing Stripe API..." : "Verify Connection"}</span>
              </button>
            </div>

            {/* Verification Result Notification */}
            {stripeVerifyResult && (
              <div
                className={`p-3.5 rounded-xl border text-[11px] leading-relaxed flex items-start gap-2.5 ${
                  stripeVerifyResult.success
                    ? "bg-emerald-950/30 border-emerald-500/40 text-emerald-200"
                    : "bg-rose-950/30 border-rose-500/40 text-rose-200"
                }`}
              >
                {stripeVerifyResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-bold">
                    {stripeVerifyResult.success ? "Stripe Key Verified Successfully!" : "Stripe Connection Error"}
                  </div>
                  <p className="mt-0.5">{stripeVerifyResult.message || stripeVerifyResult.error}</p>
                  {stripeVerifyResult.availableCurrency && (
                    <p className="mt-1 font-mono text-[10px] text-emerald-300">
                      Merchant Account Currency: {stripeVerifyResult.availableCurrency} • Livemode:{" "}
                      {stripeVerifyResult.isLiveMode ? "LIVE" : "TEST"}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Stripe Form */}
            <form onSubmit={handleSaveStripe} className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-slate-300 font-semibold mb-1 flex items-center justify-between">
                    <span>
                      Stripe Secret Key (<code className="text-teal-300">sk_live_...</code> or <code className="text-teal-300">sk_test_...</code>)
                    </span>
                    <span className="text-[10px] text-slate-500">Workspace Isolated</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showStripeSecret ? "text" : "password"}
                      placeholder="sk_test_51... or sk_live_51..."
                      value={stripeSecretKey}
                      onChange={(e) => setStripeSecretKey(e.target.value)}
                      className="w-full pl-3 pr-10 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400 font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowStripeSecret(!showStripeSecret)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      {showStripeSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Your key is securely retained within this workspace and passed via backend proxy to Stripe API without client exposure.
                  </p>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Stripe Publishable Key (<code className="text-teal-300">pk_test_...</code> or <code className="text-teal-300">pk_live_...</code>)
                  </label>
                  <input
                    type="text"
                    placeholder="pk_test_51... or pk_live_51..."
                    value={stripePublishableKey}
                    onChange={(e) => setStripePublishableKey(e.target.value)}
                    className="w-full px-3 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400 font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Default Settlement Currency</label>
                  <select
                    value={stripeCurrency}
                    onChange={(e) => setStripeCurrency(e.target.value)}
                    className="w-full px-3 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400 font-semibold"
                  >
                    <option value="USD">USD ($) - United States Dollar</option>
                    <option value="EUR">EUR (€) - Euro (SEPA Compatible)</option>
                    <option value="GBP">GBP (£) - British Pound</option>
                    <option value="CAD">CAD ($) - Canadian Dollar</option>
                    <option value="AUD">AUD ($) - Australian Dollar</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-[#2d323f]">
                {stripeSaveSuccess ? (
                  <span className="text-teal-400 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> Stripe credentials saved for this workspace!
                  </span>
                ) : (
                  <span className="text-slate-400">
                    Changes take effect immediately for new invoices and Checkout links.
                  </span>
                )}

                <button
                  type="submit"
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-lg flex items-center gap-1.5 shadow-sm transition-all"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Stripe Settings</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB 3: HOSTINGER & WEBMAIL INTEGRATION */}
      {activeTab === "webmail" && (
        <div className="space-y-5 animate-in fade-in duration-150">
          <div className="bg-[#181b21] p-6 rounded-2xl border border-[#2d323f] shadow-md space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Mail className="w-4 h-4 text-teal-400" /> Hostinger & Webmail Outbound Integration
                </h3>
                <p className="text-slate-400 mt-0.5">
                  Connect your business mailbox (Hostinger, cPanel, Google Workspace, or custom SMTP). Invoices, deal agreements, and activity logs will be sent directly through your authenticated mail server.
                </p>
              </div>

              <button
                type="button"
                onClick={handleVerifyWebmail}
                disabled={isVerifyingMail || !mailEmail || !smtpHost}
                className="px-3.5 py-1.5 bg-teal-600/20 hover:bg-teal-600 disabled:opacity-40 text-teal-300 hover:text-white border border-teal-500/40 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors self-start sm:self-auto"
              >
                <RefreshCw className={`w-3 h-3 ${isVerifyingMail ? "animate-spin" : ""}`} />
                <span>{isVerifyingMail ? "Testing SMTP Server..." : "Test Connection"}</span>
              </button>
            </div>

            {/* Mailbox List -- a workspace can connect more than one, each
                usable for both sending and receiving (its own IMAP inbox).
                Composing an email and creating an Email Marketing campaign
                both let you pick which of these sends. */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-slate-300 font-semibold text-[11px]">
                  Connected Mailboxes ({activeTenant?.webmailConfigs?.length || 0})
                </label>
                <button
                  type="button"
                  onClick={handleAddMailbox}
                  className="px-2.5 py-1 bg-teal-600/20 hover:bg-teal-600 text-teal-300 hover:text-white border border-teal-500/40 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Mailbox</span>
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {(activeTenant?.webmailConfigs || []).length === 0 && (
                  <div className="text-[11px] text-slate-500">
                    No mailboxes connected yet -- fill in the form below and save to connect your first one.
                  </div>
                )}
                {(activeTenant?.webmailConfigs || []).map((m: any) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelectedMailboxId(m.id)}
                    className={`px-3 py-1.5 rounded-lg border text-left transition-all flex items-center gap-2 ${
                      m.id === selectedMailboxId
                        ? "bg-teal-500/10 border-teal-500/50 text-white shadow-sm"
                        : "bg-[#121418] border-[#2d323f] text-slate-400 hover:border-slate-600"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        m.status === "connected" ? "bg-emerald-400" : "bg-slate-600"
                      }`}
                    />
                    <span className="text-xs font-semibold">{mailboxLabel(m)}</span>
                    {m.isDefault && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-teal-500/20 text-teal-300 font-bold uppercase">
                        Default
                      </span>
                    )}
                  </button>
                ))}
              </div>
              {selectedMailboxId && (
                <div className="flex items-center gap-3 pt-0.5">
                  {!mailCfg?.isDefault && (
                    <button
                      type="button"
                      onClick={() => handleSetDefaultMailbox(selectedMailboxId)}
                      className="text-[10px] text-teal-400 hover:text-teal-300 font-semibold"
                    >
                      Set as default mailbox
                    </button>
                  )}
                  {(activeTenant?.webmailConfigs?.length || 0) > 1 && (
                    <button
                      type="button"
                      onClick={() => handleDeleteMailbox(selectedMailboxId)}
                      className="text-[10px] text-rose-400 hover:text-rose-300 font-semibold flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      Disconnect this mailbox
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Quick Provider Presets */}
            <div className="space-y-1.5">
              <label className="block text-slate-300 font-semibold text-[11px]">Quick Setup Presets</label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {[
                  { id: "hostinger", name: "Hostinger", desc: "smtp.hostinger.com:465" },
                  { id: "cpanel", name: "cPanel Webmail", desc: "mail.domain:465" },
                  { id: "gmail", name: "Google Workspace", desc: "smtp.gmail.com:587" },
                  { id: "outlook", name: "Microsoft 365", desc: "smtp.office365:587" },
                  { id: "custom", name: "Custom SMTP", desc: "Manual Config" },
                ].map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyMailPreset(preset.id as any)}
                    className={`p-2 rounded-lg border text-left transition-all ${
                      mailProvider === preset.id
                        ? "bg-teal-500/10 border-teal-500/50 text-white shadow-sm"
                        : "bg-[#121418] border-[#2d323f] text-slate-400 hover:border-slate-600"
                    }`}
                  >
                    <div className="font-bold text-white text-xs">{preset.name}</div>
                    <div className="text-[10px] text-slate-500 truncate">{preset.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Verification Result Feedback */}
            {mailVerifyResult && (
              <div
                className={`p-3.5 rounded-xl border text-[11px] leading-relaxed flex items-start gap-2.5 ${
                  mailVerifyResult.success
                    ? "bg-emerald-950/30 border-emerald-500/40 text-emerald-200"
                    : "bg-rose-950/30 border-rose-500/40 text-rose-200"
                }`}
              >
                {mailVerifyResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-bold">
                    {mailVerifyResult.success ? "Webmail Server Connected & Verified!" : "Webmail Handshake Failed"}
                  </div>
                  <p className="mt-0.5">{mailVerifyResult.message || mailVerifyResult.error}</p>
                  {mailVerifyResult.details && (
                    <p className="text-[10px] text-slate-400 mt-1">{mailVerifyResult.details}</p>
                  )}
                </div>
              </div>
            )}

            {/* Webmail Form */}
            <form onSubmit={handleSaveWebmail} className="space-y-4 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-slate-300 font-semibold mb-1">Mailbox Label</label>
                  <input
                    type="text"
                    placeholder="e.g. Sales Inbox, Support, Founder"
                    value={mailLabel}
                    onChange={(e) => setMailLabel(e.target.value)}
                    className="w-full px-3 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Email Account Address <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. sales@yourdomain.com or hamzamazharsheikh007@gmail.com"
                    value={mailEmail}
                    onChange={(e) => setMailEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Sender Display Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Hamza Sheikh | Aargard Operations"
                    value={mailDisplayName}
                    onChange={(e) => setMailDisplayName(e.target.value)}
                    className="w-full px-3 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1 flex items-center justify-between">
                    <span>Mailbox Password / App Password</span>
                    <span className="text-[10px] text-slate-500">Encrypted server-side</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showMailPassword ? "text" : "password"}
                      placeholder="Enter mailbox password or app password"
                      value={mailPassword}
                      onChange={(e) => setMailPassword(e.target.value)}
                      className="w-full pl-3 pr-10 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowMailPassword(!showMailPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      {showMailPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Outgoing SMTP Host</label>
                    <input
                      type="text"
                      placeholder="smtp.hostinger.com"
                      value={smtpHost}
                      onChange={(e) => setSmtpHost(e.target.value)}
                      className="w-full px-3 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Port & Security</label>
                    <select
                      value={`${smtpPort}-${smtpEncryption}`}
                      onChange={(e) => {
                        const [p, enc] = e.target.value.split("-");
                        setSmtpPort(Number(p));
                        setSmtpEncryption(enc as any);
                      }}
                      className="w-full px-3 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400 text-xs font-mono"
                    >
                      <option value="465-SSL">465 (SSL)</option>
                      <option value="587-STARTTLS">587 (STARTTLS)</option>
                      <option value="587-TLS">587 (TLS)</option>
                      <option value="25-None">25 (Plain)</option>
                    </select>
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-slate-300 font-semibold mb-1">Default Outbound Email Signature</label>
                  <textarea
                    rows={3}
                    value={mailSignature}
                    onChange={(e) => setMailSignature(e.target.value)}
                    placeholder="--&#10;Your Name&#10;Title | Company"
                    className="w-full p-2.5 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400 font-mono text-xs"
                  />
                </div>
              </div>

              {/* Actions & Dispatch Test */}
              <div className="pt-3 border-t border-[#2d323f] space-y-3">
                <div className="p-3 bg-[#121418] rounded-xl border border-[#2d323f] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-300 text-[11px]">Send Live Test Email To:</span>
                    <input
                      type="email"
                      placeholder="recipient@example.com"
                      value={testRecipient}
                      onChange={(e) => setTestRecipient(e.target.value)}
                      className="px-2.5 py-1 bg-[#181b21] border border-[#2d323f] text-white rounded-lg text-xs focus:outline-none focus:border-teal-400 w-60"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleSendTestEmail}
                    disabled={isSendingTestMail || !testRecipient || !mailEmail}
                    className="px-3.5 py-1.5 bg-[#252a36] hover:bg-[#2f3544] disabled:opacity-40 text-teal-300 border border-[#3d4455] rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors self-start sm:self-auto"
                  >
                    <Send className={`w-3 h-3 ${isSendingTestMail ? "animate-pulse" : ""}`} />
                    <span>{isSendingTestMail ? "Dispatching..." : "Send Verification Email"}</span>
                  </button>
                </div>

                {testMailResult && (
                  <div
                    className={`p-3 rounded-xl border text-[11px] ${
                      testMailResult.success
                        ? "bg-emerald-950/30 border-emerald-500/40 text-emerald-200"
                        : "bg-rose-950/30 border-rose-500/40 text-rose-200"
                    }`}
                  >
                    {testMailResult.message || testMailResult.error}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  {mailSaveSuccess ? (
                    <span className="text-teal-400 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" /> Webmail settings saved for this workspace!
                    </span>
                  ) : (
                    <span className="text-slate-400">
                      Configuration is isolated to <strong className="text-white">{activeTenant?.name}</strong>.
                    </span>
                  )}

                  <button
                    type="submit"
                    className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-lg flex items-center gap-1.5 shadow-sm transition-all"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Webmail Settings</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB: SUBSCRIPTION & BILLING */}
      {activeTab === "subscription" && (
        <div className="space-y-5 animate-in fade-in duration-150">
          {/* Current Subscription Status Card */}
          <div className="bg-[#181b21] p-6 rounded-2xl border border-[#2d323f] shadow-md space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Zap className="w-4 h-4 text-teal-400" /> Active Workspace Subscription
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {activeTenant?.subscriptionStatus || "active"}
                  </span>
                </div>
                <p className="text-slate-400 mt-1">
                  Online recurring subscription managed for organization:{" "}
                  <strong className="text-white">{activeTenant?.name}</strong>
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-2xl font-black text-white">
                    ${activeTenant?.subscriptionPrice || PLATFORM_PLAN.monthlyPrice}
                    <span className="text-xs text-slate-400 font-normal"> / mo</span>
                  </div>
                  <div className="text-[10px] text-teal-400 font-semibold uppercase">
                    Billed {activeTenant?.billingCycle || "monthly"}
                  </div>
                </div>
              </div>
            </div>

            {tierNotice && (
              <div className="p-3 rounded-xl bg-teal-950/40 border border-teal-800/60 text-teal-200 text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                <span>{tierNotice}</span>
              </div>
            )}

            {billingPortalError && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{billingPortalError}</span>
              </div>
            )}

            {/* Quick Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 bg-[#121418] rounded-xl border border-[#2d323f]">
                <div className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider">Current Plan Tier</div>
                <div className="text-base font-bold text-white mt-0.5 flex items-center gap-1.5">
                  <span>{activeTenant?.plan || "Growth"} Tier</span>
                  <span className="text-[10px] text-teal-400 font-medium">({activeTenant?.billingCycle || "monthly"})</span>
                </div>
                <div className="text-slate-400 text-[10px] mt-1">Auto-renews next cycle</div>
              </div>

              <div className="p-3.5 bg-[#121418] rounded-xl border border-[#2d323f]">
                <div className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider">Team Member Seats</div>
                <div className="text-base font-bold text-white mt-0.5">
                  {users?.length || 1} / {activeTenant?.seatsAllocated || PLATFORM_PLAN.seats} Seats Used
                </div>
                <div className="w-full bg-[#222733] h-1.5 rounded-full mt-2 overflow-hidden">
                  <div
                    className="bg-teal-400 h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, ((users?.length || 1) / (activeTenant?.seatsAllocated || PLATFORM_PLAN.seats)) * 100)}%`,
                    }}
                  />
                </div>
              </div>

              <div className="p-3.5 bg-[#121418] rounded-xl border border-[#2d323f] space-y-2">
                <div className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider">Payment Method on File</div>
                <div className="text-sm font-bold text-white mt-0.5 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-slate-300" />
                  {activeTenant?.cardLast4 ? (
                    <span>{activeTenant.cardBrand || "Card"} ending in {activeTenant.cardLast4}</span>
                  ) : (
                    <span className="text-slate-400 font-semibold">None on file</span>
                  )}
                </div>
                <div className="text-slate-400 text-[10px]">
                  {activeTenant?.subscriptionStatus === "trialing" ? "No charge until trial ends" : `Next invoice: ${activeTenant?.nextBillingDate || "—"}`}
                </div>
                <button
                  type="button"
                  onClick={handleManagePaymentMethod}
                  disabled={isOpeningBillingPortal}
                  className="w-full mt-1 px-3 py-1.5 bg-[#252a36] hover:bg-[#2f3544] disabled:opacity-50 border border-[#3d4455] text-slate-200 hover:text-white font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all text-[11px]"
                >
                  {isOpeningBillingPortal ? (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span>Opening...</span>
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-3 h-3" />
                      <span>{activeTenant?.stripeCustomerId ? "Manage Payment Method" : "Pay / Update Card via Stripe"}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Change Subscription Plan Options */}
          <div className="bg-[#181b21] p-6 rounded-2xl border border-[#2d323f] shadow-md space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-teal-400" /> Available Subscription Tiers
                </h4>
                <p className="text-slate-400 mt-0.5 text-xs">
                  Upgrade or scale your workspace plan instantly. New rates apply to next billing cycle.
                </p>
              </div>

              {/* Billing Cycle Switcher */}
              <div className="flex items-center p-1 bg-[#121418] rounded-xl border border-[#2d323f] self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setTierBillingCycle("monthly")}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                    tierBillingCycle === "monthly"
                      ? "bg-teal-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Monthly Billing
                </button>
                <button
                  type="button"
                  onClick={() => setTierBillingCycle("annually")}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1 ${
                    tierBillingCycle === "annually"
                      ? "bg-teal-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <span>Annual Billing</span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-400/20 text-emerald-300 font-extrabold">
                    SAVE 20%
                  </span>
                </button>
              </div>
            </div>

            {/* Plans Comparison Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 max-w-2xl">
              {getSelectablePlansForEmail(activeTenant?.ownerEmail).map((plan) => {
                const isCurrent = (activeTenant?.plan || "Growth") === plan.name;
                const price = tierBillingCycle === "annually" ? plan.annualPrice : plan.monthlyPrice;

                return (
                  <div
                    key={plan.name}
                    className={`rounded-2xl p-5 border flex flex-col justify-between transition-all relative ${
                      isCurrent
                        ? "bg-[#1d222b] border-teal-500/50 shadow-lg shadow-teal-500/5 ring-1 ring-teal-500/40"
                        : "bg-[#14171d] border-[#2d323f] hover:border-slate-600"
                    }`}
                  >
                    {plan.isPopular && (
                      <div className="absolute -top-2.5 right-4 bg-teal-500 text-[#0d0f12] text-[9px] font-black uppercase px-2 py-0.5 rounded-full tracking-wider shadow">
                        Most Popular
                      </div>
                    )}

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h5 className="font-extrabold text-white text-base">{plan.name}</h5>
                        {isCurrent && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 font-bold border border-teal-500/30">
                            Current Plan
                          </span>
                        )}
                      </div>

                      <p className="text-slate-400 text-xs">{plan.tagline}</p>

                      <div className="py-2">
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl font-black text-white">${price}</span>
                          <span className="text-slate-400 text-xs font-semibold">/ month</span>
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {tierBillingCycle === "annually" ? `Billed $${price * 12}/year` : "Billed monthly"}
                        </div>
                      </div>

                      <div className="border-t border-[#282d39] pt-3 space-y-2">
                        <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                          Includes:
                        </div>
                        {plan.features.map((feat, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                            <Check className="w-3.5 h-3.5 text-teal-400 shrink-0 mt-0.5" />
                            <span className="leading-tight">{feat}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pt-5 mt-4 border-t border-[#282d39]">
                      <button
                        type="button"
                        disabled={isCurrent || isUpdatingTier}
                        onClick={() => handleUpdateSubscriptionTier(plan.name as any, tierBillingCycle)}
                        className={`w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                          isCurrent
                            ? "bg-[#252a36] text-slate-400 cursor-default border border-[#3d4455]"
                            : "bg-teal-600 hover:bg-teal-500 text-white shadow-md active:scale-98"
                        }`}
                      >
                        {isUpdatingTier ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : isCurrent ? (
                          <span>Active Subscription</span>
                        ) : (
                          <>
                            <span>Switch to {plan.name}</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Billing Receipts & History */}
          <div className="bg-[#181b21] p-6 rounded-2xl border border-[#2d323f] shadow-md space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-teal-400" /> Subscription Receipts & Invoices
                </h4>
                <p className="text-slate-400 mt-0.5 text-xs">
                  Automated charges processed through the online subscription portal.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#2d323f] text-slate-400 font-semibold">
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Invoice Number</th>
                    <th className="py-2.5 px-3">Plan Tier</th>
                    <th className="py-2.5 px-3">Amount</th>
                    <th className="py-2.5 px-3">Payment Method</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#282d39] text-slate-300">
                  <tr>
                    <td className="py-2.5 px-3 font-medium">Oct 01, 2026</td>
                    <td className="py-2.5 px-3 font-mono text-teal-300">INV-SUB-2026-1001</td>
                    <td className="py-2.5 px-3">{activeTenant?.plan || "Growth"} Tier</td>
                    <td className="py-2.5 px-3 font-bold text-white">
                      ${activeTenant?.subscriptionPrice || PLATFORM_PLAN.monthlyPrice}.00
                    </td>
                    <td className="py-2.5 px-3 flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                      <span>{activeTenant?.cardBrand || "Visa"} •••• {activeTenant?.cardLast4 || "4242"}</span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Paid
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => alert(`Receipt INV-SUB-2026-1001 downloaded for ${activeTenant?.name}.`)}
                        className="text-teal-400 hover:text-teal-300 font-semibold text-xs inline-flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" />
                        <span>PDF</span>
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: COMPANY & BILLING DEFAULTS */}
      {activeTab === "company" && (
        <div className="space-y-5 animate-in fade-in duration-150">
          <div className="bg-[#181b21] p-6 rounded-2xl border border-[#2d323f] shadow-md space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Building className="w-4 h-4 text-teal-400" /> Company & Financial Configuration
              </h3>
              <p className="text-slate-400 mt-0.5">
                Appears on customer invoices, export documents, and financial ledgers for{" "}
                <strong className="text-teal-300">{activeTenant?.name}</strong>.
              </p>
            </div>

            <form onSubmit={handleSaveCompany} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">
                    Legal Entity / Company Name
                  </label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full px-3 py-1.5 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-300 mb-1">
                    Tax ID / VAT Registration
                  </label>
                  <input
                    type="text"
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    className="w-full px-3 py-1.5 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-300 mb-1">
                    Primary Operating Currency
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full px-3 py-1.5 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400 font-semibold"
                  >
                    <option value="USD ($)">USD ($) - United States Dollar</option>
                    <option value="EUR (€)">EUR (€) - Euro</option>
                    <option value="GBP (£)">GBP (£) - British Pound</option>
                    <option value="CAD ($)">CAD ($) - Canadian Dollar</option>
                    <option value="AUD ($)">AUD ($) - Australian Dollar</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-300 mb-1">
                    Standard Sales Rep Commission Rate (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={commissionRate}
                    onChange={(e) => setCommissionRate(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-[#2d323f]">
                {savedSuccess ? (
                  <span className="text-teal-400 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> Preferences saved!
                  </span>
                ) : (
                  <span className="text-slate-400">
                    Configurations apply to all generated invoices and reports in this workspace.
                  </span>
                )}

                <button
                  type="submit"
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-lg flex items-center gap-1.5 shadow-sm transition-all"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Preferences</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB 5: SECURITY & USER ACCESS */}
      {activeTab === "security" && (
        <div className="space-y-5 animate-in fade-in duration-150">
          <div className="bg-[#181b21] p-6 rounded-2xl border border-[#2d323f] shadow-md space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-teal-400" /> Controlled User Access
                </h3>
                <p className="text-slate-400 mt-0.5">
                  Role-based permissions (Super Admin, Sales Manager, Rep, Viewer)
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (confirm("Sign out of AarPex?")) signOut();
                  }}
                  className="px-3 py-1.5 bg-[#252a36] hover:bg-[#2f3544] border border-[#3d4455] text-rose-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>

                <button
                  onClick={() => setAccessControlOpen(true)}
                  className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Manage Roles & Permissions</span>
                </button>
              </div>
            </div>

            {/* Current User Session Overview */}
            <div className="p-4 bg-[#121418] rounded-xl border border-[#2d323f] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#252a36] border border-[#3d4455] text-teal-300 flex items-center justify-center text-xs font-bold">
                  {currentUser.avatar || "U"}
                </div>
                <div>
                  <div className="font-bold text-white flex items-center gap-2">
                    {currentUser.name}
                    {currentUser.isGoogleAccount && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 border border-blue-500/40">
                        Google Account
                      </span>
                    )}
                  </div>
                  <div className="text-slate-400 text-[11px]">
                    {currentUser.email} • Role:{" "}
                    <span className="text-teal-400 font-semibold">
                      {ROLE_LABELS[(currentUser.role as UserRole) || "viewer"]?.title || currentUser.role}
                    </span>
                  </div>
                </div>
              </div>

              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold">
                Active Session
              </span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: WORKSPACE DATA CONTROLS */}
      {activeTab === "database" && (
        <div className="space-y-5 animate-in fade-in duration-150">
          {/* Local State Controls */}
          <div className="bg-[#181b21] p-6 rounded-2xl border border-[#2d323f] shadow-md space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Landmark className="w-4 h-4 text-teal-400" /> Local Data & Environment Controls
              </h3>
              <p className="text-slate-400 mt-0.5">
                Manage persistent state for workspace: <strong className="text-white">{activeTenant?.name}</strong>
              </p>
            </div>

            <div className="p-4 bg-rose-950/20 rounded-xl border border-rose-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="font-bold text-rose-300">Purge Workspace Records</div>
                <p className="text-rose-400/80 text-[11px] mt-0.5">
                  Permanently empties all records in the active workspace ({activeTenant?.name}).
                </p>
              </div>
              <button
                onClick={() => {
                  if (confirm(`Are you sure you want to clear all data in "${activeTenant?.name}"? This cannot be undone.`)) {
                    clearAllData();
                  }
                }}
                className="px-3.5 py-1.5 bg-rose-900 hover:bg-rose-800 text-white rounded-lg font-bold flex items-center gap-1.5 shrink-0 transition-colors shadow-sm"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear All Data</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
