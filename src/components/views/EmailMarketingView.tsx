import React, { useMemo, useState } from "react";
import { useCRM } from "../../context/CRMContext";
import { EmailCampaign, EmailFrequency, EmailCampaignTechnique, EmailStep, EmailStepDeliveryResult, SalesTechnique } from "../../types";
import { apiFetch } from "../../lib/apiClient";
import { computeProductMatches } from "../../lib/productMatching";
import { getMailboxById, mailboxLabel } from "../../lib/webmail";
import {
  Mail,
  Plus,
  X,
  Search,
  Users,
  UserCheck,
  Send,
  Sparkles,
  Check,
  Clock,
  CalendarClock,
  Loader2,
  ChevronRight,
  Trash2,
  Pause,
  Play,
  HeartHandshake,
  Target,
  Wrench,
  Shuffle,
  Package,
  Wand2,
} from "lucide-react";

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
const FREQUENCY_DAYS: Record<EmailFrequency, number> = {
  Daily: 1,
  Weekly: 7,
  Biweekly: 14,
  Monthly: 30,
  Custom: 7,
};

const TECHNIQUE_META: Record<
  SalesTechnique,
  { label: string; description: string; icon: React.ElementType; color: string }
> = {
  "Need-Based": {
    label: "Need-Based",
    description: "Leads with a concrete operational or business need the offer solves.",
    icon: Target,
    color: "text-sky-600 bg-sky-50 border-sky-200",
  },
  Emotional: {
    label: "Emotional",
    description: "Leans on urgency, aspiration, and the cost of staying put.",
    icon: HeartHandshake,
    color: "text-rose-600 bg-rose-50 border-rose-200",
  },
  "Problem-Solution": {
    label: "Problem-Solution",
    description: "Names a specific pain point, then pairs it with a specific fix.",
    icon: Wrench,
    color: "text-amber-600 bg-amber-50 border-amber-200",
  },
};

function addDaysToToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function mergeTags(template: string, vars: { firstName: string; company: string; jobTitle: string }): string {
  return (template || "")
    .replace(/\{\{\s*firstName\s*\}\}/gi, vars.firstName || "there")
    .replace(/\{\{\s*company\s*\}\}/gi, vars.company || "your company")
    .replace(/\{\{\s*jobTitle\s*\}\}/gi, vars.jobTitle || "your role");
}

interface Recipient {
  id: string;
  email: string;
  firstName: string;
  company: string;
  jobTitle: string;
}

// Sends one email and reports back what actually happened instead of
// assuming success. /api/webmail/send-email only rejects on a genuine
// network failure -- an SMTP/auth error still comes back as a normal 2xx-or-4xx
// HTTP response, so we have to read res.ok + the JSON body's `success` flag,
// not just catch().
async function sendCampaignEmail(
  mailCfg: ReturnType<typeof getMailboxById>,
  currentUser: { email?: string; name?: string } | null | undefined,
  activeTenant: { name?: string } | null | undefined,
  recipient: Recipient,
  subject: string,
  body: string
): Promise<EmailStepDeliveryResult> {
  const sentAt = new Date().toISOString();
  try {
    const res = await apiFetch("/api/webmail/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: mailCfg?.email || currentUser?.email,
        displayName: mailCfg?.displayName || currentUser?.name || activeTenant?.name,
        password: mailCfg?.password || "",
        smtpHost: mailCfg?.smtpHost || "smtp.hostinger.com",
        smtpPort: mailCfg?.smtpPort || 465,
        to: recipient.email,
        subject,
        body,
      }),
    });
    let data: any = null;
    try {
      data = await res.json();
    } catch {
      // Non-JSON body -- fall through and treat as a failure below.
    }
    if (res.ok && data?.success) {
      return { recipientId: recipient.id, email: recipient.email, success: true, messageId: data.messageId, sentAt };
    }
    return {
      recipientId: recipient.id,
      email: recipient.email,
      success: false,
      error: data?.error || `Server responded ${res.status} ${res.statusText}`.trim(),
      sentAt,
    };
  } catch (err: any) {
    return {
      recipientId: recipient.id,
      email: recipient.email,
      success: false,
      error: err?.message || "Network error -- request never reached the server",
      sentAt,
    };
  }
}

// ----------------------------------------------------------------------------
// Main View
// ----------------------------------------------------------------------------
export const EmailMarketingView: React.FC = () => {
  const { emailCampaigns, deleteEmailCampaign, updateEmailCampaign } = useCRM();
  const [isWizardOpen, setWizardOpen] = useState(false);
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);

  const activeCampaign = emailCampaigns.find((c) => c.id === activeCampaignId) || null;

  const dueFollowUps = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    let count = 0;
    for (const c of emailCampaigns) {
      for (const s of c.steps) {
        if (s.status === "Scheduled" && s.scheduledDate && s.scheduledDate <= today) count++;
      }
    }
    return count;
  }, [emailCampaigns]);

  return (
    <div id="email-marketing-view" className="space-y-5 animate-in fade-in duration-200">
      {/* Header */}
      <div className="bg-gradient-to-r from-teal-950 via-slate-900 to-teal-950 p-6 rounded-2xl text-white border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-teal-400 font-bold text-xs">
            <Mail className="w-4 h-4" />
            <span>EMAIL MARKETING</span>
          </div>
          <h2 className="text-xl font-black mt-1">AI-Generated Outreach Sequences</h2>
          <p className="text-xs text-slate-300 max-w-xl mt-0.5">
            Pick your audience, set a cadence, and let AI write the initial email plus every follow-up — using
            need-based, emotional, or problem-solution sales techniques.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {dueFollowUps > 0 && (
            <div className="flex items-center gap-1.5 bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-semibold px-3 py-2 rounded-lg">
              <Clock className="w-3.5 h-3.5" />
              <span>{dueFollowUps} email{dueFollowUps === 1 ? "" : "s"} due today</span>
            </div>
          )}
          <button
            onClick={() => setWizardOpen(true)}
            className="px-4 py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Campaign</span>
          </button>
        </div>
      </div>

      {/* Campaign list */}
      {emailCampaigns.length === 0 ? (
        <div className="bg-white p-10 rounded-xl border border-slate-200 shadow-2xs text-center">
          <Mail className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-800">No email campaigns yet</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Create your first campaign to have AI write a personalized outbound sequence for a group of leads or
            contacts.
          </p>
          <button
            onClick={() => setWizardOpen(true)}
            className="mt-4 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Campaign</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {emailCampaigns.map((c) => (
            <CampaignCard
              key={c.id}
              campaign={c}
              onOpen={() => setActiveCampaignId(c.id)}
              onDelete={() => deleteEmailCampaign(c.id)}
              onToggleStatus={() =>
                updateEmailCampaign(c.id, { status: c.status === "Active" ? "Paused" : "Active" })
              }
            />
          ))}
        </div>
      )}

      {isWizardOpen && <CampaignWizardModal onClose={() => setWizardOpen(false)} />}
      {activeCampaign && (
        <CampaignDetailModal campaign={activeCampaign} onClose={() => setActiveCampaignId(null)} />
      )}
    </div>
  );
};

// ----------------------------------------------------------------------------
// Campaign card
// ----------------------------------------------------------------------------
const STATUS_STYLES: Record<EmailCampaign["status"], string> = {
  Draft: "bg-slate-100 text-slate-600 border-slate-200",
  Active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Paused: "bg-amber-50 text-amber-700 border-amber-200",
  Completed: "bg-slate-100 text-slate-500 border-slate-200",
};

const CampaignCard: React.FC<{
  campaign: EmailCampaign;
  onOpen: () => void;
  onDelete: () => void;
  onToggleStatus: () => void;
}> = ({ campaign, onOpen, onDelete, onToggleStatus }) => {
  const sentCount = campaign.steps.filter((s) => s.status === "Sent").length;
  const failedDeliveryCount = campaign.steps.reduce(
    (sum, s) => sum + (s.deliveryResults || []).filter((r) => !r.success).length,
    0
  );

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-900 truncate">{campaign.name}</h3>
          <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
            {campaign.audienceType === "Leads" ? <UserCheck className="w-3 h-3" /> : <Users className="w-3 h-3" />}
            {campaign.audienceIds.length} {campaign.audienceType.toLowerCase()} &bull; {campaign.technique}
          </p>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-1 rounded-full border whitespace-nowrap ${STATUS_STYLES[campaign.status]}`}>
          {campaign.status}
        </span>
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
        <CalendarClock className="w-3.5 h-3.5 text-slate-400" />
        <span>
          {campaign.frequency} cadence &bull; {sentCount}/{campaign.steps.length} sent
        </span>
      </div>

      {failedDeliveryCount > 0 && (
        <div className="text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5">
          {failedDeliveryCount} send{failedDeliveryCount === 1 ? "" : "s"} failed — open to review
        </div>
      )}

      <div className="flex items-center gap-1.5 pt-2 border-t border-slate-100">
        <button
          onClick={onOpen}
          className="flex-1 px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700 flex items-center justify-center gap-1"
        >
          View Sequence
          <ChevronRight className="w-3 h-3" />
        </button>
        {campaign.status !== "Draft" && campaign.status !== "Completed" && (
          <button
            onClick={onToggleStatus}
            title={campaign.status === "Active" ? "Pause campaign" : "Resume campaign"}
            className="p-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-600"
          >
            {campaign.status === "Active" ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
        )}
        <button
          onClick={onDelete}
          title="Delete campaign"
          className="p-1.5 bg-slate-50 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-lg text-slate-500 hover:text-rose-600"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------------
// New Campaign Wizard
// ----------------------------------------------------------------------------
const CampaignWizardModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { leads, contacts, companies, products, activeTenant, currentUser, addEmailCampaign, addActivity } = useCRM();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [name, setName] = useState("");
  const [audienceType, setAudienceType] = useState<"Leads" | "Contacts">("Leads");
  const [audienceSearch, setAudienceSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [selectedMailboxId, setSelectedMailboxId] = useState<string>(
    () => getMailboxById(activeTenant)?.id || ""
  );

  const selectedProduct = products.find((p) => p.id === selectedProductId) || null;

  const productMatches = useMemo(() => {
    if (!selectedProduct) return null;
    return computeProductMatches(selectedProduct, { companies, leads, contacts });
  }, [selectedProduct, companies, leads, contacts]);

  const handleApplyProductAudience = () => {
    if (!productMatches) return;
    const matchIds =
      audienceType === "Leads"
        ? productMatches.leads.map((l) => l.id)
        : productMatches.contacts.map((c) => c.id);
    setSelectedIds(matchIds);
    if (!name.trim() && selectedProduct) {
      setName(`${selectedProduct.name} — Outreach`);
    }
  };
  const [frequency, setFrequency] = useState<EmailFrequency>("Weekly");
  const [customDays, setCustomDays] = useState(10);
  const [followUpCount, setFollowUpCount] = useState(2);
  const [technique, setTechnique] = useState<EmailCampaignTechnique>("Mixed");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [generatedSteps, setGeneratedSteps] = useState<EmailStep[]>([]);
  const [activeStepTab, setActiveStepTab] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  const frequencyDays = frequency === "Custom" ? Math.max(1, customDays) : FREQUENCY_DAYS[frequency];

  const audiencePool = useMemo(() => {
    if (audienceType === "Leads") {
      return leads.map((l) => ({
        id: l.id,
        title: l.name,
        subtitle: `${l.company || "No company"} &bull; ${l.jobTitle || "Unknown role"}`,
        email: l.email,
      }));
    }
    return contacts.map((c) => {
      const comp = companies.find((co) => co.id === c.companyId);
      return {
        id: c.id,
        title: `${c.firstName} ${c.lastName || ""}`.trim(),
        subtitle: `${comp?.name || "No company"} &bull; ${c.position || "Unknown role"}`,
        email: c.email,
      };
    });
  }, [audienceType, leads, contacts, companies]);

  const filteredPool = audiencePool.filter(
    (p) =>
      !audienceSearch.trim() ||
      p.title.toLowerCase().includes(audienceSearch.toLowerCase()) ||
      p.subtitle.toLowerCase().includes(audienceSearch.toLowerCase())
  );

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const buildRecipients = (): Recipient[] => {
    if (audienceType === "Leads") {
      return leads
        .filter((l) => selectedIds.includes(l.id))
        .map((l) => ({
          id: l.id,
          email: l.email,
          firstName: (l.name || "").split(" ")[0] || "there",
          company: l.company || "your company",
          jobTitle: l.jobTitle || "your role",
        }));
    }
    return contacts
      .filter((c) => selectedIds.includes(c.id))
      .map((c) => {
        const comp = companies.find((co) => co.id === c.companyId);
        return {
          id: c.id,
          email: c.email,
          firstName: c.firstName || "there",
          company: comp?.name || "your company",
          jobTitle: c.position || "your role",
        };
      });
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenerateError("");
    try {
      const recipients = buildRecipients();
      const res = await apiFetch("/api/ai/email-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audienceType,
          audienceCount: recipients.length,
          audienceSample: recipients.slice(0, 5).map((r) => ({
            firstName: r.firstName,
            company: r.company,
            jobTitle: r.jobTitle,
          })),
          technique,
          followUpCount,
          frequency,
          frequencyDays,
          senderName: currentUser?.name,
          senderCompany: activeTenant?.companyName || activeTenant?.name,
          productName: selectedProduct?.name,
          productPitch: selectedProduct?.pitch,
        }),
      });
      const data = await res.json();
      const steps: EmailStep[] = (data.steps || []).map((s: any, i: number) => ({
        id: `${Date.now()}_${i}`,
        stepNumber: s.stepNumber ?? i + 1,
        delayDays: s.delayDays ?? (i === 0 ? 0 : frequencyDays),
        technique: s.technique || "Need-Based",
        subject: s.subject || "",
        body: s.body || "",
        status: "Draft" as const,
      }));
      setGeneratedSteps(steps);
      setActiveStepTab(0);
      setStep(4);
    } catch (err: any) {
      setGenerateError(err.message || "Failed to generate emails. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const updateGeneratedStep = (idx: number, updates: Partial<EmailStep>) => {
    setGeneratedSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...updates } : s)));
  };

  const handleSave = async (activate: boolean) => {
    setIsSaving(true);
    try {
      let steps = generatedSteps;
      const recipients = buildRecipients();
      const mailCfg = getMailboxById(activeTenant, selectedMailboxId);

      if (activate && recipients.length > 0) {
        // Send step 1 to every recipient right now (personalizing merge tags
        // per recipient), and compute the due dates for the remaining steps.
        const step1 = steps[0];
        const deliveryResults = await Promise.all(
          recipients.map((r) =>
            sendCampaignEmail(mailCfg, currentUser, activeTenant, r, mergeTags(step1.subject, r), mergeTags(step1.body, r))
          )
        );
        const succeeded = deliveryResults.filter((d) => d.success).length;
        const failed = deliveryResults.length - succeeded;
        const today = new Date().toISOString().split("T")[0];

        addActivity({
          type: "Email",
          date: today,
          time: new Date().toTimeString().slice(0, 5),
          user: currentUser?.name || "System",
          description:
            failed === 0
              ? `Launched email campaign "${name}" — delivered to all ${succeeded} ${audienceType.toLowerCase()}`
              : `Launched email campaign "${name}" — ${succeeded} delivered, ${failed} failed out of ${recipients.length} ${audienceType.toLowerCase()}`,
          outcome: failed === 0 ? "Delivered" : succeeded === 0 ? "Failed" : "Partially Delivered",
          nextAction:
            failed > 0
              ? "Review failed sends in campaign details and retry"
              : steps.length > 1
              ? `${steps.length - 1} follow-up(s) scheduled`
              : "Monitor responses",
        });

        steps = steps.map((s, i) => {
          if (i === 0) {
            return {
              ...s,
              status: succeeded > 0 ? ("Sent" as const) : ("Failed" as const),
              sentDate: today,
              deliveryResults,
            };
          }
          // Only schedule follow-ups once the initial send actually reached
          // someone -- no point queuing a sequence for recipients step 1
          // never got to.
          if (succeeded === 0) return s;
          const cumulativeDelay = steps.slice(1, i + 1).reduce((sum, st) => sum + (st.delayDays || frequencyDays), 0);
          return { ...s, status: "Scheduled" as const, scheduledDate: addDaysToToday(cumulativeDelay) };
        });
      }

      addEmailCampaign({
        name: name.trim() || `${audienceType} Campaign`,
        productId: selectedProductId || undefined,
        audienceType,
        audienceIds: selectedIds,
        frequency,
        frequencyDays,
        followUpCount,
        technique,
        status: activate ? "Active" : "Draft",
        steps,
        startDate: activate ? new Date().toISOString().split("T")[0] : undefined,
        salesperson: currentUser?.name || "",
        mailboxId: selectedMailboxId || undefined,
      });

      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const canProceedStep1 = name.trim().length > 0 && selectedIds.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-[#181b21] border border-[#2d323f] rounded-2xl w-full max-w-2xl max-h-[90vh] shadow-2xl overflow-hidden text-xs text-slate-200 flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#2d323f] flex items-center justify-between bg-[#121418]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/30 text-teal-400 flex items-center justify-center">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">New Email Campaign</h2>
              <p className="text-[11px] text-slate-400">
                Step {step} of 4 &bull;{" "}
                {step === 1 ? "Name & Audience" : step === 2 ? "Cadence" : step === 3 ? "Sales Technique" : "Customize Emails"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-[#252a36] hover:bg-[#2f3544] text-slate-400 hover:text-white flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Campaign Name</label>
                <input
                  type="text"
                  placeholder="e.g. Q4 Enterprise Outreach"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
                />
              </div>

              {(activeTenant?.webmailConfigs?.length || 0) > 1 && (
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Send From</label>
                  <select
                    value={selectedMailboxId}
                    onChange={(e) => setSelectedMailboxId(e.target.value)}
                    className="w-full px-3 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
                  >
                    {(activeTenant?.webmailConfigs || []).map((m) => (
                      <option key={m.id} value={m.id}>
                        {mailboxLabel(m)} {m.isDefault ? "(Default)" : ""} — {m.email || "not configured"}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Every email and reply check for this campaign uses this mailbox.
                  </p>
                </div>
              )}

              {products.length > 0 && (
                <div>
                  <label className="block text-slate-300 font-semibold mb-1.5 flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-teal-400" />
                    Product / Service <span className="text-slate-500 font-normal">(optional)</span>
                  </label>
                  <select
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    className="w-full px-3 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
                  >
                    <option value="">None — general outreach</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.type})
                      </option>
                    ))}
                  </select>
                  {selectedProduct && (
                    <div className="mt-2 p-2.5 rounded-lg bg-[#121418] border border-[#2d323f] flex items-start justify-between gap-2">
                      <p className="text-[11px] text-slate-400 line-clamp-2">
                        {selectedProduct.pitch || selectedProduct.description || "No pitch written for this product yet."}
                      </p>
                      <button
                        onClick={handleApplyProductAudience}
                        className="shrink-0 px-2.5 py-1.5 bg-teal-600/20 hover:bg-teal-600/30 border border-teal-500/40 text-teal-300 rounded-lg text-[10px] font-bold flex items-center gap-1 whitespace-nowrap"
                        title={`Select every ${audienceType.toLowerCase()} that matches this product's target criteria`}
                      >
                        <Wand2 className="w-3 h-3" />
                        Use matching {audienceType.toLowerCase()} (
                        {audienceType === "Leads" ? productMatches?.leads.length ?? 0 : productMatches?.contacts.length ?? 0}
                        )
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">Audience</label>
                <div className="flex border border-[#2d323f] bg-[#121418] p-1 rounded-lg w-fit mb-2">
                  {(["Leads", "Contacts"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => {
                        setAudienceType(t);
                        setSelectedIds([]);
                      }}
                      className={`px-3 py-1 rounded-md font-medium transition-colors ${
                        audienceType === t ? "bg-teal-600 text-white" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                <div className="relative mb-2">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder={`Search ${audienceType.toLowerCase()}...`}
                    value={audienceSearch}
                    onChange={(e) => setAudienceSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
                  />
                </div>

                <div className="border border-[#2d323f] rounded-lg max-h-56 overflow-y-auto divide-y divide-[#2d323f]">
                  {filteredPool.length === 0 && (
                    <div className="p-4 text-center text-slate-500">
                      No {audienceType.toLowerCase()} found{audienceType === "Leads" ? "" : " with an email on file"}.
                    </div>
                  )}
                  {filteredPool.map((p) => (
                    <label
                      key={p.id}
                      className="flex items-center gap-2.5 px-3 py-2 hover:bg-[#20242e] cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(p.id)}
                        onChange={() => toggleSelected(p.id)}
                        className="accent-teal-500"
                      />
                      <div className="min-w-0">
                        <div className="text-slate-200 font-medium truncate">{p.title || "Unnamed"}</div>
                        <div className="text-[10px] text-slate-500 truncate" dangerouslySetInnerHTML={{ __html: p.subtitle }} />
                      </div>
                    </label>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500 mt-1.5">{selectedIds.length} selected</p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">Sending Frequency</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["Daily", "Weekly", "Biweekly", "Monthly", "Custom"] as EmailFrequency[]).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFrequency(f)}
                      className={`px-3 py-2 rounded-lg border text-center font-medium transition-colors ${
                        frequency === f
                          ? "bg-teal-500/10 border-teal-500/50 text-teal-300"
                          : "bg-[#121418] border-[#2d323f] text-slate-400 hover:text-white"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                {frequency === "Custom" && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-slate-400">Every</span>
                    <input
                      type="number"
                      min={1}
                      max={90}
                      value={customDays}
                      onChange={(e) => setCustomDays(Number(e.target.value) || 1)}
                      className="w-16 px-2 py-1.5 bg-[#121418] border border-[#2d323f] text-white rounded-lg text-center"
                    />
                    <span className="text-slate-400">day(s)</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">Number of Follow-ups</label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setFollowUpCount((n) => Math.max(0, n - 1))}
                    className="w-8 h-8 rounded-lg bg-[#252a36] hover:bg-[#2f3544] text-white font-bold"
                  >
                    -
                  </button>
                  <span className="text-white font-bold w-6 text-center">{followUpCount}</span>
                  <button
                    onClick={() => setFollowUpCount((n) => Math.min(6, n + 1))}
                    className="w-8 h-8 rounded-lg bg-[#252a36] hover:bg-[#2f3544] text-white font-bold"
                  >
                    +
                  </button>
                  <span className="text-[11px] text-slate-500">
                    {followUpCount === 0
                      ? "Initial email only, no follow-ups"
                      : `1 initial email + ${followUpCount} follow-up(s), ${frequencyDays} day(s) apart`}
                  </span>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-2.5">
              <label className="block text-slate-300 font-semibold mb-1">Sales Technique</label>
              {(Object.keys(TECHNIQUE_META) as SalesTechnique[]).map((t) => {
                const meta = TECHNIQUE_META[t];
                const Icon = meta.icon;
                return (
                  <button
                    key={t}
                    onClick={() => setTechnique(t)}
                    className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                      technique === t ? "bg-teal-500/10 border-teal-500/50" : "bg-[#121418] border-[#2d323f] hover:border-[#3d4455]"
                    }`}
                  >
                    <Icon className="w-4 h-4 mt-0.5 text-teal-400 shrink-0" />
                    <div>
                      <div className="font-semibold text-white">{meta.label}</div>
                      <div className="text-[11px] text-slate-400">{meta.description}</div>
                    </div>
                    {technique === t && <Check className="w-4 h-4 text-teal-400 ml-auto shrink-0" />}
                  </button>
                );
              })}
              <button
                onClick={() => setTechnique("Mixed")}
                className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                  technique === "Mixed" ? "bg-teal-500/10 border-teal-500/50" : "bg-[#121418] border-[#2d323f] hover:border-[#3d4455]"
                }`}
              >
                <Shuffle className="w-4 h-4 mt-0.5 text-teal-400 shrink-0" />
                <div>
                  <div className="font-semibold text-white">Mixed (Recommended)</div>
                  <div className="text-[11px] text-slate-400">
                    Rotates through need-based, emotional, and problem-solution across the sequence.
                  </div>
                </div>
                {technique === "Mixed" && <Check className="w-4 h-4 text-teal-400 ml-auto shrink-0" />}
              </button>

              {generateError && (
                <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-300">
                  {generateError}
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {generatedSteps.map((s, i) => (
                  <button
                    key={s.id}
                    onClick={() => setActiveStepTab(i)}
                    className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap border ${
                      activeStepTab === i
                        ? "bg-teal-600 border-teal-600 text-white"
                        : "bg-[#121418] border-[#2d323f] text-slate-400 hover:text-white"
                    }`}
                  >
                    {i === 0 ? "Initial" : `Follow-up ${i}`}
                    <span className="ml-1.5 text-[10px] opacity-70">({s.technique})</span>
                  </button>
                ))}
              </div>

              {generatedSteps[activeStepTab] && (
                <div className="space-y-2.5">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Subject</label>
                    <input
                      type="text"
                      value={generatedSteps[activeStepTab].subject}
                      onChange={(e) => updateGeneratedStep(activeStepTab, { subject: e.target.value })}
                      className="w-full px-3 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Body</label>
                    <textarea
                      rows={9}
                      value={generatedSteps[activeStepTab].body}
                      onChange={(e) => updateGeneratedStep(activeStepTab, { body: e.target.value })}
                      className="w-full px-3 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400 resize-none"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Use <code className="text-teal-400">{"{{firstName}}"}</code>,{" "}
                      <code className="text-teal-400">{"{{company}}"}</code>, and{" "}
                      <code className="text-teal-400">{"{{jobTitle}}"}</code> — each recipient gets their own version
                      automatically.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#2d323f] bg-[#121418] flex items-center justify-between">
          <button
            onClick={() => (step === 1 ? onClose() : setStep((s) => (s - 1) as any))}
            className="px-4 py-2 bg-[#252a36] hover:bg-[#2f3544] text-slate-300 font-semibold rounded-lg"
          >
            {step === 1 ? "Cancel" : "Back"}
          </button>

          {step < 3 && (
            <button
              onClick={() => setStep((s) => (s + 1) as any)}
              disabled={step === 1 && !canProceedStep1}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-bold rounded-lg flex items-center gap-1.5"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}

          {step === 3 && (
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-60 text-white font-bold rounded-lg flex items-center gap-1.5"
            >
              {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>{isGenerating ? "Generating..." : "Execute AI"}</span>
            </button>
          )}

          {step === 4 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleSave(false)}
                disabled={isSaving}
                className="px-4 py-2 bg-[#252a36] hover:bg-[#2f3544] disabled:opacity-60 text-slate-200 font-semibold rounded-lg"
              >
                Save as Draft
              </button>
              <button
                onClick={() => handleSave(true)}
                disabled={isSaving}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-60 text-white font-bold rounded-lg flex items-center gap-1.5"
              >
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>{isSaving ? "Launching..." : "Save & Send Now"}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------------
// Campaign Detail — view/edit steps, send due follow-ups
// ----------------------------------------------------------------------------
const CampaignDetailModal: React.FC<{ campaign: EmailCampaign; onClose: () => void }> = ({ campaign, onClose }) => {
  const { leads, contacts, companies, activeTenant, currentUser, updateEmailCampaign, addActivity, checkCampaignReplies } = useCRM();
  const [sendingStepId, setSendingStepId] = useState<string | null>(null);
  const [isCheckingReplies, setIsCheckingReplies] = useState(false);

  const repliedIds = campaign.repliedAudienceIds || [];

  const handleCheckReplies = async () => {
    setIsCheckingReplies(true);
    try {
      await checkCampaignReplies(campaign.id);
    } finally {
      setIsCheckingReplies(false);
    }
  };

  // Follow-ups skip anyone who has already replied -- see the Inbox section,
  // which is what populates campaign.repliedAudienceIds.
  const recipients: Recipient[] = useMemo(() => {
    if (campaign.audienceType === "Leads") {
      return leads
        .filter((l) => campaign.audienceIds.includes(l.id) && !repliedIds.includes(l.id))
        .map((l) => ({
          id: l.id,
          email: l.email,
          firstName: (l.name || "").split(" ")[0] || "there",
          company: l.company || "your company",
          jobTitle: l.jobTitle || "your role",
        }));
    }
    return contacts
      .filter((c) => campaign.audienceIds.includes(c.id) && !repliedIds.includes(c.id))
      .map((c) => {
        const comp = companies.find((co) => co.id === c.companyId);
        return {
          id: c.id,
          email: c.email,
          firstName: c.firstName || "there",
          company: comp?.name || "your company",
          jobTitle: c.position || "your role",
        };
      });
  }, [campaign, leads, contacts, companies, repliedIds]);

  const today = new Date().toISOString().split("T")[0];

  // targetRecipients lets "Retry" re-send only to whoever previously failed,
  // instead of hitting everyone (including already-successful recipients)
  // again -- see the "Retry Failed" button below.
  const sendStep = async (step: EmailStep, targetRecipients: Recipient[] = recipients) => {
    setSendingStepId(step.id);
    try {
      const mailCfg = getMailboxById(activeTenant, campaign.mailboxId);
      const newResults = await Promise.all(
        targetRecipients.map((r) =>
          sendCampaignEmail(mailCfg, currentUser, activeTenant, r, mergeTags(step.subject, r), mergeTags(step.body, r))
        )
      );
      const succeeded = newResults.filter((d) => d.success).length;
      const failed = newResults.length - succeeded;

      // Merge into any prior results for this step -- a retry of just the
      // failed recipients shouldn't erase the record of who already got it.
      const priorResults = (step.deliveryResults || []).filter(
        (r) => !newResults.some((nr) => nr.recipientId === r.recipientId)
      );
      const deliveryResults = [...priorResults, ...newResults];
      const overallSucceeded = deliveryResults.filter((d) => d.success).length;

      const updatedSteps = campaign.steps.map((s) =>
        s.id === step.id
          ? { ...s, status: overallSucceeded > 0 ? ("Sent" as const) : ("Failed" as const), sentDate: today, deliveryResults }
          : s
      );
      const allSent = updatedSteps.every((s) => s.status === "Sent");
      updateEmailCampaign(campaign.id, {
        steps: updatedSteps,
        status: allSent ? "Completed" : campaign.status === "Draft" ? "Active" : campaign.status,
      });

      addActivity({
        type: "Email",
        date: today,
        time: new Date().toTimeString().slice(0, 5),
        user: currentUser?.name || "System",
        description:
          failed === 0
            ? `Sent "${campaign.name}" step ${step.stepNumber} — delivered to all ${succeeded} recipient(s)`
            : `Sent "${campaign.name}" step ${step.stepNumber} — ${succeeded} delivered, ${failed} failed out of ${targetRecipients.length} recipient(s)`,
        outcome: failed === 0 ? "Delivered" : succeeded === 0 ? "Failed" : "Partially Delivered",
        nextAction: failed > 0 ? "Review failed sends below and retry" : allSent ? "Sequence complete" : "Next follow-up scheduled",
      });
    } finally {
      setSendingStepId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-[#181b21] border border-[#2d323f] rounded-2xl w-full max-w-2xl max-h-[90vh] shadow-2xl overflow-hidden text-xs text-slate-200 flex flex-col">
        <div className="px-6 py-4 border-b border-[#2d323f] flex items-center justify-between bg-[#121418]">
          <div>
            <h2 className="text-sm font-bold text-white">{campaign.name}</h2>
            <p className="text-[11px] text-slate-400">
              {recipients.length} still active {campaign.audienceType.toLowerCase()}
              {repliedIds.length > 0 && ` · ${repliedIds.length} replied (follow-ups paused)`}
              {" · "}
              {campaign.technique} &bull; {campaign.frequency}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCheckReplies}
              disabled={isCheckingReplies}
              className="px-2.5 py-1.5 bg-[#252a36] hover:bg-[#2f3544] text-teal-300 rounded-lg text-[11px] font-bold border border-[#3d4455] whitespace-nowrap"
              title="Scan the connected mailbox for replies from this campaign's audience"
            >
              {isCheckingReplies ? "Checking..." : "Check for Replies"}
            </button>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg bg-[#252a36] hover:bg-[#2f3544] text-slate-400 hover:text-white flex items-center justify-center shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
          {campaign.steps.map((s) => {
            const isDue = s.status === "Scheduled" && s.scheduledDate && s.scheduledDate <= today;
            const results = s.deliveryResults || [];
            const failedResults = results.filter((r) => !r.success);
            const succeededCount = results.length - failedResults.length;
            return (
              <div key={s.id} className="border border-[#2d323f] rounded-lg p-3.5 bg-[#121418]">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="font-semibold text-white">
                    {s.stepNumber === 1 ? "Initial Email" : `Follow-up ${s.stepNumber - 1}`}{" "}
                    <span className="text-[10px] text-slate-500 font-normal">({s.technique})</span>
                  </div>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${
                      s.status === "Sent" && failedResults.length === 0
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                        : s.status === "Sent" || s.status === "Failed"
                        ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                        : isDue
                        ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                        : "bg-slate-700/40 text-slate-400 border-slate-600/40"
                    }`}
                  >
                    {results.length > 0
                      ? failedResults.length === 0
                        ? `Delivered to all ${succeededCount} · ${s.sentDate}`
                        : `${succeededCount} delivered, ${failedResults.length} failed · ${s.sentDate}`
                      : isDue
                      ? "Due today"
                      : s.status === "Scheduled"
                      ? `Scheduled ${s.scheduledDate}`
                      : "Draft"}
                  </span>
                </div>
                <div className="text-slate-300 font-medium mb-1">{s.subject}</div>
                <p className="text-slate-500 whitespace-pre-wrap line-clamp-3">{s.body}</p>

                {/* Per-recipient delivery breakdown -- only worth showing once
                    a send has actually been attempted for this step. */}
                {results.length > 0 && (
                  <div className="mt-2.5 border-t border-[#2d323f] pt-2.5 space-y-1">
                    {failedResults.length > 0 && (
                      <div className="text-[10px] font-semibold text-rose-400 mb-1">
                        {failedResults.length} send{failedResults.length === 1 ? "" : "s"} failed:
                      </div>
                    )}
                    {results.map((r) => (
                      <div
                        key={r.recipientId}
                        className={`flex items-center justify-between gap-2 text-[10.5px] px-2 py-1 rounded ${
                          r.success ? "text-slate-500" : "bg-rose-500/5 text-rose-300"
                        }`}
                      >
                        <span className="truncate">{r.email}</span>
                        <span className="shrink-0 flex items-center gap-1">
                          {r.success ? (
                            <>
                              <Check className="w-2.5 h-2.5 text-emerald-500" />
                              <span className="text-emerald-500/80">Delivered</span>
                            </>
                          ) : (
                            <span title={r.error} className="truncate max-w-[220px]">
                              {r.error || "Failed"}
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {(s.status !== "Sent" || failedResults.length > 0) && recipients.length > 0 && (
                  <button
                    onClick={() => {
                      if (failedResults.length > 0) {
                        // Retry: only the recipients whose last attempt failed.
                        const retryIds = new Set(failedResults.map((r) => r.recipientId));
                        sendStep(
                          s,
                          recipients.filter((r) => retryIds.has(r.id))
                        );
                      } else {
                        sendStep(s);
                      }
                    }}
                    disabled={sendingStepId === s.id}
                    className={`mt-2.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 ${
                      isDue || s.status === "Draft" || failedResults.length > 0
                        ? "bg-teal-600 hover:bg-teal-500 text-white"
                        : "bg-[#252a36] hover:bg-[#2f3544] text-slate-300"
                    } disabled:opacity-60`}
                  >
                    {sendingStepId === s.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Send className="w-3 h-3" />
                    )}
                    <span>
                      {sendingStepId === s.id
                        ? "Sending..."
                        : failedResults.length > 0
                        ? `Retry ${failedResults.length} Failed`
                        : "Send Now"}
                    </span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
