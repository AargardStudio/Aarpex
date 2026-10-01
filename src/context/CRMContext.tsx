import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from "react";
import {
  Lead,
  Deal,
  Pipeline,
  Invoice,
  Payment,
  Activity,
  Task,
  Comment,
  User,
  UserRole,
  UserPermissions,
  ROLE_PERMISSIONS,
  ROLE_LABELS,
  DateFilterRange,
  CustomerStatus,
  Tenant,
  TenantMember,
  TenantStripeConfig,
  TenantWebmailConfig,
  TenantWhatsAppConfig,
  CRMSettings,
  SupabaseConfig,
  EmailAttachment,
  AuditLogEntry,
  EmailCampaign,
  Product,
  ProductAIInsight,
  KnowledgeBaseEntry,
  KnowledgeBaseCategory,
  IndustryAgent,
  AgentAction,
  AgentActionStatus,
  StoredFile,
  StoredFileSource,
} from "../types";
import { STORAGE_LIMITS_BYTES } from "../data/subscriptionPlans";
import { isSupabaseAuthConfigured, getSupabaseAuthClient } from "../config/supabaseAuthClient";
import { getMailboxById } from "../lib/webmail";
import {
  syncTenantTable,
  syncTenantRow,
  fetchTenantTable,
  createTenantWithOwner,
  deleteTenantServerSide,
  fetchMyTenantsFull,
  savePendingTenantCreation,
  clearPendingTenantCreation,
  hasPendingTenantCreations,
  flushPendingTenantCreations,
  flushAllPendingSyncs,
  onSyncFailure,
} from "../lib/tenantDataSync";
import {
  initialLeads,
  initialDeals,
  initialPipelines,
  initialInvoices,
  initialPayments,
  initialActivities,
  initialTasks,
  initialComments,
} from "../data/mockData";
import { defaultTenants } from "../data/tenantData";
import { PLATFORM_PLAN, PLATFORM_TRIAL_DAYS, FOUNDER_EMAIL } from "../data/subscriptionPlans";
import { apiFetch } from "../lib/apiClient";
import { normalizeIndustry } from "../lib/industryMatch";

// Local key for an in-progress "add another workspace" request (from
// WorkspaceModal) that survives the full-page redirect to Stripe Checkout
// and back — mirrors AuthPage's PENDING_SIGNUP_KEY, but for a user who is
// already signed in and is provisioning an *additional* billed workspace
// rather than completing sign-up.
const PENDING_WORKSPACE_KEY = "crm_pending_workspace_v1";

interface PendingWorkspace {
  name: string;
  industry: string;
  currency: string;
  companyName: string;
  ownerEmail: string;
}

export type NavView =
  | "Dashboard"
  | "Leads"
  | "Products"
  | "Deals"
  | "Pipelines"
  | "Activities"
  | "Invoices"
  | "Payments"
  | "Revenue"
  | "Stripe"
  | "Tasks"
  | "AI Insights"
  | "Email Marketing"
  | "Inbox"
  | "Reports"
  | "Settings"
  | "CEO Notes"
  | "Knowledge Base"
  | "Industry Agents"
  | "Agent Approvals"
  | "File Manager"
  | "Instructions";

interface CRMContextType {
  // Navigation & Active selection
  activeNav: NavView;
  setActiveNav: (nav: NavView) => void;
  // Lets any view (e.g. a header "Billing" shortcut) jump straight into a
  // specific Settings tab — read once by SettingsView and cleared.
  settingsDeepLinkTab: string | null;
  setSettingsDeepLinkTab: (tab: string | null) => void;
  selectedDealId: string | null;
  setSelectedDealId: (id: string | null) => void;
  // Lead 360 profile drawer.
  selectedLeadId: string | null;
  setSelectedLeadId: (id: string | null) => void;
  // Lifted out of LeadsView so the Lead Profile Drawer can trigger the
  // same convert-to-Deal flow as the Leads list.
  convertingLeadId: string | null;
  setConvertingLeadId: (id: string | null) => void;
  dateRange: DateFilterRange;
  setDateRange: (range: DateFilterRange) => void;
  currentUser: User;
  setCurrentUser: (user: User) => void;
  users: User[];
  updateUserRole: (userId: string, role: UserRole | string, customPermissions?: Partial<UserPermissions>) => void;
  addUser: (user: User) => void;
  canPerform: (permission: keyof UserPermissions) => boolean;
  signOut: () => void;
  isAuthPageOpen: boolean;
  setAuthPageOpen: (open: boolean) => void;
  isBootstrapping: boolean;
  authPageMode: "signin" | "signup";
  setAuthPageMode: (mode: "signin" | "signup") => void;
  isAccessControlOpen: boolean;
  setAccessControlOpen: (open: boolean) => void;
  importLeadsFromSpreadsheet: (importedLeads: Array<Omit<Lead, "id" | "createdDate">>) => number;

  // Off-canvas sidebar drawer on mobile/tablet (screens below the `lg`
  // breakpoint) -- the sidebar is always in the DOM, this just controls
  // whether it's slid into view. Irrelevant at desktop widths, where the
  // sidebar is always visible regardless of this flag.
  isMobileSidebarOpen: boolean;
  setMobileSidebarOpen: (open: boolean) => void;

  // Multi-Tenancy & Workspaces
  tenants: Tenant[];
  activeTenantId: string;
  activeTenant: Tenant;
  switchTenant: (tenantId: string) => void;
  createTenant: (tenantData: Partial<Tenant>) => Tenant;
  loadSampleData: () => void;
  updateTenant: (tenantId: string, updates: Partial<Tenant>) => void;
  // Returns false when the server-side delete failed (e.g. not an admin of
  // that workspace, or a network error) -- the tenant is deliberately left
  // in place locally in that case rather than optimistically removed, since
  // an optimistic removal is exactly what let a "deleted" workspace silently
  // reappear on the next reload.
  deleteTenant: (tenantId: string) => Promise<boolean>;
  isCreateTenantModalOpen: boolean;
  setCreateTenantModalOpen: (open: boolean) => void;

  // Settings & Custom Configurations
  settings: CRMSettings;
  updateSettings: (updates: Partial<CRMSettings>) => void;
  updateStripeConfig: (config: Partial<TenantStripeConfig>) => void;
  addWebmailConfig: (config?: Partial<TenantWebmailConfig>) => TenantWebmailConfig;
  updateWebmailConfig: (id: string, config: Partial<TenantWebmailConfig>) => void;
  deleteWebmailConfig: (id: string) => void;
  setDefaultWebmailConfig: (id: string) => void;
  updateWhatsAppConfig: (config: Partial<TenantWhatsAppConfig>) => void;
  updateSupabaseConfig: (config: Partial<SupabaseConfig>) => void;
  addAuditLogEntry: (action: string, details?: string, category?: AuditLogEntry["category"]) => void;

  // Email Composer with Multiple Attachments
  isEmailComposeOpen: boolean;
  setEmailComposeOpen: (open: boolean) => void;
  emailComposeProps: {
    to?: string;
    subject?: string;
    body?: string;
    attachments?: EmailAttachment[];
    dealId?: string;
    leadId?: string;
  };
  openEmailComposer: (props?: {
    to?: string;
    subject?: string;
    body?: string;
    attachments?: EmailAttachment[];
    dealId?: string;
    leadId?: string;
  }) => void;

  // WhatsApp Composer (send-to-lead, mirrors Email Composer)
  isWhatsAppComposeOpen: boolean;
  setWhatsAppComposeOpen: (open: boolean) => void;
  whatsappComposeProps: {
    to?: string;
    body?: string;
    leadId?: string;
  };
  openWhatsAppComposer: (props?: {
    to?: string;
    body?: string;
    leadId?: string;
  }) => void;

  // Entities
  leads: Lead[];
  deals: Deal[];
  pipelines: Pipeline[];
  invoices: Invoice[];
  payments: Payment[];
  activities: Activity[];
  tasks: Task[];
  comments: Comment[];
  emailCampaigns: EmailCampaign[];
  products: Product[];

  // Data Actions
  addLead: (lead: Omit<Lead, "id" | "createdDate">) => Lead;
  updateLead: (id: string, updates: Partial<Lead>) => void;
  deleteLead: (id: string) => void;
  moveLeadStatus: (leadId: string, newStatus: Lead["status"]) => void;
  convertLead: (leadId: string, createDeal: boolean) => { deal?: Deal };
  bulkDeleteLeads: (ids: string[]) => void;
  bulkUpdateLeadStatus: (ids: string[], status: Lead["status"]) => void;

  addDeal: (deal: Omit<Deal, "id" | "createdDate" | "weightedValue">) => Deal;
  updateDeal: (id: string, updates: Partial<Deal>) => void;
  deleteDeal: (id: string) => void;
  moveDealStage: (dealId: string, newStageId: string, newPipelineId?: string) => void;

  addPipeline: (pipeline: Omit<Pipeline, "id">) => void;
  updatePipeline: (id: string, updates: Partial<Pipeline>) => void;
  deletePipeline: (id: string) => void;

  addInvoice: (invoice: Omit<Invoice, "id" | "subtotal" | "discount" | "tax" | "total" | "amountPaid" | "remainingBalance" | "status"> & { status?: Invoice["status"] }) => Invoice;
  updateInvoice: (id: string, updates: Partial<Invoice>) => void;
  deleteInvoice: (id: string) => void;
  duplicateInvoice: (id: string) => Invoice;
  markInvoicePaid: (id: string) => void;

  addPayment: (payment: Omit<Payment, "id">) => Payment;
  deletePayment: (id: string) => void;

  addActivity: (activity: Omit<Activity, "id">) => void;
  deleteActivity: (id: string) => void;

  addTask: (task: Omit<Task, "id">) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  toggleTaskStatus: (id: string) => void;
  deleteTask: (id: string) => void;

  addComment: (comment: Omit<Comment, "id" | "timestamp" | "userId" | "userName">) => void;
  deleteComment: (id: string) => void;
  addCommentReply: (commentId: string, replyText: string) => void;

  addEmailCampaign: (campaign: Omit<EmailCampaign, "id" | "createdDate">) => EmailCampaign;
  updateEmailCampaign: (id: string, updates: Partial<EmailCampaign>) => void;
  deleteEmailCampaign: (id: string) => void;
  checkCampaignReplies: (campaignId: string) => Promise<void>;

  // Products / Services -- the versatile catalog (retainers, subscriptions,
  // packages, B2B products), settable up manually or drafted by AI.
  addProduct: (product: Omit<Product, "id" | "createdAt">) => Product;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  generateProductDraft: (rawDescription: string) => Promise<Partial<Product>>;
  runProductAIInsight: (productId: string) => Promise<void>;

  // Knowledge Base -- free-text reference entries (Company / Product &
  // Service / Operator Playbook) that ground the floating AI chat
  // assistant's answers instead of it only knowing live CRM records.
  knowledgeBase: KnowledgeBaseEntry[];
  addKnowledgeBaseEntry: (
    entry: Omit<KnowledgeBaseEntry, "id" | "createdAt" | "updatedAt" | "createdBy">
  ) => KnowledgeBaseEntry;
  updateKnowledgeBaseEntry: (id: string, updates: Partial<KnowledgeBaseEntry>) => void;
  deleteKnowledgeBaseEntry: (id: string) => void;
  bulkDeleteKnowledgeBaseEntries: (ids: string[]) => void;
  bulkUpdateKnowledgeBaseCategory: (ids: string[], category: KnowledgeBaseCategory) => void;
  generateKnowledgeBaseDraftFromUrl: (
    url: string,
    category: KnowledgeBaseCategory
  ) => Promise<{ title: string; content: string; tags: string[]; sourceUrl: string }>;

  // Industry Agents -- configurable, user-defined AI management profiles
  // per industry (see IndustryAgent in types.ts). Drives email tone,
  // qualification guidance, and follow-up cadence/channel wherever AI
  // touches a lead in that industry.
  industryAgents: IndustryAgent[];
  addIndustryAgent: (
    agent: Omit<IndustryAgent, "id" | "createdAt" | "updatedAt" | "createdBy">
  ) => IndustryAgent;
  updateIndustryAgent: (id: string, updates: Partial<IndustryAgent>) => void;
  deleteIndustryAgent: (id: string) => void;
  bulkSetIndustryAgentActive: (ids: string[], isActive: boolean) => void;
  bulkDeleteIndustryAgents: (ids: string[]) => void;
  getAgentForIndustry: (industry: string | undefined) => IndustryAgent | undefined;
  // Honest status for the autonomous scan (see runAgentScanForAgents below): when it
  // last actually ran in this browser tab, and whether one is running right
  // now. There is no server-side scheduler, so this is the ONLY source of
  // truth for "is this actually being monitored" -- the UI must never claim
  // continuous monitoring beyond what these two fields can support.
  lastAgentScanAt: string | null;
  isAgentScanRunning: boolean;
  // Manual "Run Now" trigger -- reuses the exact same scan logic as the
  // automatic interval (see runAgentScanForAgents in the provider), but
  // lets a user force a scan on demand instead of waiting for the next
  // 10-minute tick. With an agentId, scans only that agent (still requires
  // it to be isActive, but -- unlike the automatic interval -- does NOT
  // require autoRunEnabled, since manually clicking "Run Now" is itself
  // the explicit intent). With no agentId, sweeps every isActive agent
  // regardless of autoRunEnabled. No-ops (and resolves to false) if the
  // targeted agent is paused, or if a scan is already in flight.
  runAgentScanNow: (agentId?: string) => Promise<boolean>;

  // Agent Approvals -- the human-in-the-loop queue every autonomous or
  // negotiation action proposes into before anything reaches a prospect.
  agentActions: AgentAction[];
  addAgentAction: (action: Omit<AgentAction, "id" | "createdAt" | "status">) => AgentAction;
  draftInstantFollowUp: (leadId: string) => Promise<boolean>;
  // Agent-level instant controls (the buttons on each agent card).
  // draftAgentFollowUpsNow: drafts a follow-up for every eligible lead of one
  //   agent right now, ignoring its normal cadence, capped per click. Drafts
  //   land in the approval queue like everything else.
  // sendAgentDraftsNow: sends every draft waiting in that agent's approval
  //   queue immediately, one at a time, through approveAndSendAgentAction.
  // setAgentNextEmailDirective: arms/disarms the one-shot "add pricing" /
  //   "add more problems" switches consumed by the agent's next batch.
  draftAgentFollowUpsNow: (agentId: string) => Promise<{ drafted: number; remaining: number; reason?: string }>;
  sendAgentDraftsNow: (agentId: string) => Promise<{ total: number; sent: number; failed: number }>;
  setAgentNextEmailDirective: (
    agentId: string,
    patch: { includePricing?: boolean; extraProblems?: boolean }
  ) => void;
  // Take Charge: setLeadOperatorControl silences the AI for one lead (it only
  //   notifies; the operator replies personally) or hands it back.
  //   setAgentOperatorControl does the same for every lead under one agent and
  //   returns how many leads changed. Taking charge also withdraws that
  //   lead's unsent AI drafts.
  setLeadOperatorControl: (leadId: string, inControl: boolean) => void;
  setAgentOperatorControl: (agentId: string, inControl: boolean) => { changed: number; withdrawn: number };
  resolveAgentAction: (id: string, status: AgentActionStatus, updates?: Partial<AgentAction>) => void;
  deleteAgentAction: (id: string) => void;
  approveAndSendAgentAction: (id: string, overrides?: { subject?: string; body?: string }) => Promise<boolean>;
  // Bulk status flip only -- no side effects (no send). Used for bulk reject;
  // bulk approve must go through approveAndSendAgentAction per item instead,
  // since approving actually sends a real email (see AgentApprovalsView).
  bulkResolveAgentActions: (ids: string[], status: AgentActionStatus) => void;

  // File Manager -- workspace file storage, backed by a Supabase Storage
  // bucket (see server.ts's /api/storage/* endpoints). storageUsedBytes/
  // storageLimitBytes are derived, not stored, so they can never drift from
  // the actual storedFiles list; the server independently re-enforces the
  // same limit on every upload regardless of what the client reports.
  storedFiles: StoredFile[];
  storageUsedBytes: number;
  storageLimitBytes: number;
  uploadStoredFile: (
    file: File,
    opts: {
      source: StoredFileSource;
      linkedLeadId?: string;
      linkedDealId?: string;
    }
  ) => Promise<StoredFile>;
  deleteStoredFile: (id: string) => Promise<void>;
  getStoredFileUrl: (id: string) => Promise<string | null>;
  // Cross-view handoff: File Manager sets this when the user picks "Use for
  // bulk update/create" on a file, then navigates to the matching entity's
  // list view -- that view's EntityImportModal picks it up on mount (if its
  // own entity matches) and clears it, pre-loading the parsed rows instead
  // of asking the user to upload the same file again.
  pendingBulkImport: { entity: "deal"; rows: any[]; headers: string[]; filename: string } | null;
  setPendingBulkImport: (
    value: { entity: "deal"; rows: any[]; headers: string[]; filename: string } | null
  ) => void;

  clearAllData: () => void;

  // Quick modals
  isQuickCreateOpen: boolean;
  setQuickCreateOpen: (open: boolean) => void;
  quickCreateType: "lead" | "deal" | "invoice" | "payment" | "activity" | "task";
  setQuickCreateType: (type: "lead" | "deal" | "invoice" | "payment" | "activity" | "task") => void;
}

// One-shot "instant control" switches on an Industry Agent (armed from the
// agent card) become extra fields on the /api/ai/personalized-email request.
// Pricing text comes only from the agent's linked Product; when there isn't
// one (or it has no price) it is left undefined and the server is told not to
// invent figures. Pair every use with `hasAgentDirectives` so the switches
// are reset once a batch has actually been drafted.
const buildAgentDirectiveFields = (agent: IndustryAgent, product?: Product) => ({
  includePricing: !!agent.nextEmailIncludePricing,
  extraProblems: !!agent.nextEmailExtraProblems,
  productPricing:
    product && Number(product.price) > 0
      ? `${product.currency || "USD"} ${product.price}${product.pricingModel ? ` (${product.pricingModel})` : ""}`
      : undefined,
});
const hasAgentDirectives = (agent: IndustryAgent) => !!agent.nextEmailIncludePricing || !!agent.nextEmailExtraProblems;

const CRMContext = createContext<CRMContextType | undefined>(undefined);

const STORAGE_KEYS = {
  LEADS: "crm_leads_v1",
  DEALS: "crm_deals_v1",
  PIPELINES: "crm_pipelines_v1",
  INVOICES: "crm_invoices_v1",
  PAYMENTS: "crm_payments_v1",
  ACTIVITIES: "crm_activities_v1",
  TASKS: "crm_tasks_v1",
  COMMENTS: "crm_comments_v1",
};

export const CRMProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeNav, setActiveNav] = useState<NavView>("Dashboard");
  const [settingsDeepLinkTab, setSettingsDeepLinkTab] = useState<string | null>(null);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [convertingLeadId, setConvertingLeadId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateFilterRange>("This Year");
  const [isQuickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateType, setQuickCreateType] = useState<"lead" | "deal" | "invoice" | "payment" | "activity" | "task">("deal");

  // No pre-seeded team roster — real members are added when they sign up or
  // are invited into a workspace.
  const [users, setUsers] = useState<User[]>(() => {
    const saved = localStorage.getItem("crm_users_v2");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    return [];
  });

  const SIGNED_OUT_USER: User = { id: "", name: "", email: "", role: "viewer", avatar: "", status: "Pending" };

  const [currentUser, setCurrentUser] = useState<User>(() => {
    const saved = localStorage.getItem("crm_current_user_v2");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // fallback
      }
    }
    return SIGNED_OUT_USER;
  });

  // Require a real session before showing the app — starts closed only
  // while the initial Supabase session check (below) is still running, to
  // avoid a flash of the (empty) dashboard before we know the answer.
  const [isAuthPageOpen, setAuthPageOpen] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  // True from the moment activeTenantId is set/changed until the Supabase
  // fetch that hydrates that tenant's CRM tables (see the effect below)
  // actually resolves. isBootstrapping alone doesn't cover this: it only
  // guards the very first page load, but activeTenantId changes again on
  // every sign-out+sign-in and every tenant switch WITHOUT isBootstrapping
  // going back to true -- so without this second flag, the write-sync
  // effects could fire with whatever's momentarily in React state (often
  // empty, before the fetch below repopulates it) and, combined with the
  // mirror sync's delete-diff step, wipe real data in Supabase. See
  // shouldSyncToSupabase below and CHANGELOG v1.13.3.
  const [isHydratingTenantData, setIsHydratingTenantData] = useState(true);
  const [authPageMode, setAuthPageMode] = useState<"signin" | "signup">("signin");
  const [isEmailComposeOpen, setEmailComposeOpen] = useState(false);
  const [emailComposeProps, setEmailComposeProps] = useState<{
    to?: string;
    subject?: string;
    body?: string;
    attachments?: EmailAttachment[];
    dealId?: string;
    leadId?: string;
  }>({});

  const openEmailComposer = (props?: {
    to?: string;
    subject?: string;
    body?: string;
    attachments?: EmailAttachment[];
    dealId?: string;
    leadId?: string;
  }) => {
    setEmailComposeProps(props || {});
    setEmailComposeOpen(true);
  };

  const [isWhatsAppComposeOpen, setWhatsAppComposeOpen] = useState(false);
  const [whatsappComposeProps, setWhatsAppComposeProps] = useState<{
    to?: string;
    body?: string;
    leadId?: string;
  }>({});

  const openWhatsAppComposer = (props?: {
    to?: string;
    body?: string;
    leadId?: string;
  }) => {
    setWhatsAppComposeProps(props || {});
    setWhatsAppComposeOpen(true);
  };

  const [isAccessControlOpen, setAccessControlOpen] = useState(false);
  const [isMobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem("crm_users_v2", JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    localStorage.setItem("crm_current_user_v2", JSON.stringify(currentUser));
  }, [currentUser]);

  // Starts empty — no workspace exists until the signed-in user creates or
  // is invited into a real one. The session bootstrap effect below (and
  // switchTenant/createTenant) are the only things that ever populate this.
  const [tenants, setTenants] = useState<Tenant[]>(() => {
    const saved = localStorage.getItem("crm_tenants_v3");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    return defaultTenants;
  });

  const [activeTenantId, setActiveTenantId] = useState<string>(() => {
    return localStorage.getItem("crm_active_tenant_id_v3") || "";
  });

  const [isCreateTenantModalOpen, setCreateTenantModalOpen] = useState(false);

  const activeTenant = useMemo(() => {
    return tenants.find((t) => t.id === activeTenantId) || tenants[0];
  }, [tenants, activeTenantId]);

  useEffect(() => {
    localStorage.setItem("crm_tenants_v3", JSON.stringify(tenants));
  }, [tenants]);

  useEffect(() => {
    localStorage.setItem("crm_active_tenant_id_v3", activeTenantId);
  }, [activeTenantId]);

  // Scoped tenant loader. Every workspace starts genuinely empty — the only
  // built-in default is "pipelines", a structural default (stage
  // names/colors, not sample company data) so Deals has somewhere to live.
  const loadTenantEntity = <T,>(key: string, fallbackData: T): T => {
    const scopedKey = `crm_tenant_${activeTenantId}_${key}`;
    const saved = localStorage.getItem(scopedKey);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    if (key === "pipelines") return fallbackData;
    return ([] as unknown) as T;
  };

  // Initial local storage hydration scoped by tenant
  const [leads, setLeads] = useState<Lead[]>(() =>
    loadTenantEntity("leads", initialLeads)
  );

  const [deals, setDeals] = useState<Deal[]>(() =>
    loadTenantEntity("deals", initialDeals)
  );

  const [pipelines, setPipelines] = useState<Pipeline[]>(() =>
    loadTenantEntity("pipelines", initialPipelines)
  );

  const [invoices, setInvoices] = useState<Invoice[]>(() =>
    loadTenantEntity("invoices", initialInvoices)
  );

  const [payments, setPayments] = useState<Payment[]>(() =>
    loadTenantEntity("payments", initialPayments)
  );

  const [activities, setActivities] = useState<Activity[]>(() =>
    loadTenantEntity("activities", initialActivities)
  );

  const [tasks, setTasks] = useState<Task[]>(() =>
    loadTenantEntity("tasks", initialTasks)
  );

  const [comments, setComments] = useState<Comment[]>(() =>
    loadTenantEntity("comments", initialComments)
  );

  const [emailCampaigns, setEmailCampaigns] = useState<EmailCampaign[]>(() =>
    loadTenantEntity("emailCampaigns", [] as EmailCampaign[])
  );

  const [products, setProducts] = useState<Product[]>(() =>
    loadTenantEntity("products", [] as Product[])
  );

  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeBaseEntry[]>(() =>
    loadTenantEntity("knowledgeBase", [] as KnowledgeBaseEntry[])
  );

  // Lossless migration from the retired Industry Playbook feature: a tenant
  // that never touched anything new here still has its old data sitting
  // under the old localStorage key (and, before its first Supabase sync
  // under the new table name, in the old `industry_playbooks` Supabase
  // rows -- picked up by the normal fetch/hydrate path once the migration
  // in supabase/migrations/0015_industry_agents.sql has been applied,
  // which renames that table in place so no row is ever duplicated or
  // lost). Backfills the new required fields with safe defaults so an
  // old row loads as a fully valid IndustryAgent rather than crashing.
  const [industryAgents, setIndustryAgents] = useState<IndustryAgent[]>(() => {
    const current = loadTenantEntity("industryAgents", [] as IndustryAgent[]);
    if (current.length > 0) return current;
    const legacy = loadTenantEntity("industryPlaybooks", [] as any[]);
    if (!legacy || legacy.length === 0) return current;
    return legacy.map((p: any) => ({
      ...p,
      modelProvider: p.modelProvider || "gemini",
      modelName: p.modelName || "gemini-2.5-flash",
      frequencyMinutes: p.frequencyMinutes || 15,
      negotiationConditions: p.negotiationConditions ?? p.negotiationGuidance,
    })) as IndustryAgent[];
  });

  // Deliberately NOT persisted (no localStorage/Supabase) -- this describes
  // what THIS browser tab has actually done this session, not a durable
  // fact, so it must reset to "hasn't happened yet" on every fresh load
  // rather than showing a stale timestamp from a previous session as if it
  // were still true.
  const [lastAgentScanAt, setLastAgentScanAt] = useState<string | null>(null);
  const [isAgentScanRunning, setIsAgentScanRunning] = useState(false);

  const [agentActions, setAgentActions] = useState<AgentAction[]>(() =>
    loadTenantEntity("agentActions", [] as AgentAction[])
  );

  const [storedFiles, setStoredFiles] = useState<StoredFile[]>(() =>
    loadTenantEntity("storedFiles", [] as StoredFile[])
  );

  const [pendingBulkImport, setPendingBulkImport] = useState<CRMContextType["pendingBulkImport"]>(null);

  // Every real tenant with Supabase configured mirrors its data to the
  // tenants' Postgres tables on every change. Guarded by !isBootstrapping
  // AND !isHydratingTenantData so the transient local state present before
  // this tenant's Supabase fetch (below) resolves never overwrites --
  // or, worse, via the mirror sync's delete-diff step, deletes -- what's
  // already in the database. isBootstrapping alone only covers first page
  // load; isHydratingTenantData covers every later sign-out+in and tenant
  // switch too.
  const shouldSyncToSupabase =
    isSupabaseAuthConfigured() && Boolean(activeTenantId) && !isBootstrapping && !isHydratingTenantData;

  // The tenant row itself (plan, Stripe config, webmail config, etc.) mirrors
  // to Supabase the same way the CRM record tables do above.
  useEffect(() => {
    if (shouldSyncToSupabase && activeTenant) syncTenantRow(activeTenant);
  }, [activeTenant, shouldSyncToSupabase]);

  // Persist to tenant-scoped storage
  useEffect(() => {
    localStorage.setItem(`crm_tenant_${activeTenantId}_leads`, JSON.stringify(leads));
    if (shouldSyncToSupabase) syncTenantTable("leads", activeTenantId, leads);
  }, [leads, activeTenantId]);

  useEffect(() => {
    localStorage.setItem(`crm_tenant_${activeTenantId}_deals`, JSON.stringify(deals));
    if (shouldSyncToSupabase) syncTenantTable("deals", activeTenantId, deals);
  }, [deals, activeTenantId]);

  useEffect(() => {
    localStorage.setItem(`crm_tenant_${activeTenantId}_pipelines`, JSON.stringify(pipelines));
    if (shouldSyncToSupabase) syncTenantTable("pipelines", activeTenantId, pipelines);
  }, [pipelines, activeTenantId]);

  useEffect(() => {
    localStorage.setItem(`crm_tenant_${activeTenantId}_invoices`, JSON.stringify(invoices));
    if (shouldSyncToSupabase) syncTenantTable("invoices", activeTenantId, invoices);
  }, [invoices, activeTenantId]);

  useEffect(() => {
    localStorage.setItem(`crm_tenant_${activeTenantId}_payments`, JSON.stringify(payments));
    if (shouldSyncToSupabase) syncTenantTable("payments", activeTenantId, payments);
  }, [payments, activeTenantId]);

  useEffect(() => {
    localStorage.setItem(`crm_tenant_${activeTenantId}_activities`, JSON.stringify(activities));
    if (shouldSyncToSupabase) syncTenantTable("activities", activeTenantId, activities);
  }, [activities, activeTenantId]);

  useEffect(() => {
    localStorage.setItem(`crm_tenant_${activeTenantId}_tasks`, JSON.stringify(tasks));
    if (shouldSyncToSupabase) syncTenantTable("tasks", activeTenantId, tasks);
  }, [tasks, activeTenantId]);

  useEffect(() => {
    localStorage.setItem(`crm_tenant_${activeTenantId}_comments`, JSON.stringify(comments));
    if (shouldSyncToSupabase) syncTenantTable("comments", activeTenantId, comments);
  }, [comments, activeTenantId]);

  useEffect(() => {
    localStorage.setItem(`crm_tenant_${activeTenantId}_emailCampaigns`, JSON.stringify(emailCampaigns));
    if (shouldSyncToSupabase) syncTenantTable("email_campaigns", activeTenantId, emailCampaigns);
  }, [emailCampaigns, activeTenantId]);

  useEffect(() => {
    localStorage.setItem(`crm_tenant_${activeTenantId}_products`, JSON.stringify(products));
    if (shouldSyncToSupabase) syncTenantTable("products", activeTenantId, products);
  }, [products, activeTenantId]);

  useEffect(() => {
    localStorage.setItem(`crm_tenant_${activeTenantId}_knowledgeBase`, JSON.stringify(knowledgeBase));
    if (shouldSyncToSupabase) syncTenantTable("knowledge_base", activeTenantId, knowledgeBase);
  }, [knowledgeBase, activeTenantId]);

  useEffect(() => {
    localStorage.setItem(`crm_tenant_${activeTenantId}_industryAgents`, JSON.stringify(industryAgents));
    if (shouldSyncToSupabase) syncTenantTable("industry_agents", activeTenantId, industryAgents);
  }, [industryAgents, activeTenantId]);

  useEffect(() => {
    localStorage.setItem(`crm_tenant_${activeTenantId}_agentActions`, JSON.stringify(agentActions));
    if (shouldSyncToSupabase) syncTenantTable("agent_actions", activeTenantId, agentActions);
  }, [agentActions, activeTenantId]);

  useEffect(() => {
    localStorage.setItem(`crm_tenant_${activeTenantId}_storedFiles`, JSON.stringify(storedFiles));
    if (shouldSyncToSupabase) syncTenantTable("stored_files", activeTenantId, storedFiles);
  }, [storedFiles, activeTenantId]);

  // ------------------------------------------------------------------------
  // Autonomous agent scan -- for any Industry Agent with autoRunEnabled,
  // periodically (while AarPex is open in a browser tab) looks for leads
  // that are due a follow-up, and checks the tenant's default mailbox for
  // new replies, drafting a proposed action into the Agent Approvals queue
  // for each. This is intentionally best-effort and client-driven (there's
  // no server-side scheduler in this app) -- it only runs while someone has
  // the tenant open, same as the existing manual "check replies" flow it
  // reuses.
  //
  // A ref bag avoids re-registering the interval (and losing its cadence)
  // every time any of this state changes -- the interval callback always
  // reads the latest values off the ref.
  const agentScanStateRef = React.useRef({
    leads,
    activities,
    industryAgents,
    agentActions,
    knowledgeBase,
    activeTenant,
    currentUser,
    products,
  });
  useEffect(() => {
    agentScanStateRef.current = {
      leads,
      activities,
      industryAgents,
      agentActions,
      knowledgeBase,
      activeTenant,
      currentUser,
      products,
    };
  });

  // Tracks isAgentScanRunning synchronously alongside the state value --
  // runAgentScanNow (below) needs to check "is a scan already in flight"
  // at call time, before its own async work starts, and reading state
  // directly in a plain (non-effect) callback can be stale.
  const isAgentScanRunningRef = React.useRef(false);
  const setScanRunning = (v: boolean) => {
    isAgentScanRunningRef.current = v;
    setIsAgentScanRunning(v);
  };

  // Shared scan implementation -- runs the exact same follow-up-drafting /
  // reply-detection pass against whatever list of agents it's given.
  // Used by both the automatic interval below (which always passes
  // isActive && autoRunEnabled agents) and runAgentScanNow (the manual
  // "Run Now" trigger, which relaxes the autoRunEnabled requirement).
  // Reads the rest of its working state (leads, activities, knowledge
  // base, tenant, user, products) off agentScanStateRef so it never goes
  // stale without needing to be re-created on every state change.
  const runAgentScanForAgents = React.useCallback(async (targetAgents: IndustryAgent[]) => {
    if (targetAgents.length === 0) return;
    setScanRunning(true);
    setLastAgentScanAt(new Date().toISOString());
    try {
      const {
        leads: curLeads,
        activities: curActivities,
        agentActions: curAgentActions,
        knowledgeBase: curKnowledge,
        activeTenant: curTenant,
        currentUser: curUser,
        products: curProducts,
      } = agentScanStateRef.current;

      const autoAgents = targetAgents;

      // Auto-extracted knowledge base -- for industries running on autopilot,
      // the agent builds each lead's individual "AI-Extracted Summary" itself
      // (same call the manual "Generate" button in the drawer's Knowledge tab
      // makes) instead of waiting for someone to click it. Only fills in
      // records that don't have one yet; a stale summary is still refreshed
      // on demand via the manual button, and the user can always hand-edit
      // the generated text afterward.
      const kbUpserts: Omit<KnowledgeBaseEntry, "id" | "createdAt" | "updatedAt" | "createdBy">[] = [];

      const now = Date.now();
      const hasPendingOrRecent = (recipientEmail: string, type: string, cooldownMs: number) =>
        curAgentActions.some(
          (a) =>
            a.recipientEmail.toLowerCase() === recipientEmail.toLowerCase() &&
            a.actionType === type &&
            (a.status === "pending" || now - new Date(a.createdAt).getTime() < cooldownMs)
        );

      const newActions: Omit<AgentAction, "id" | "createdAt" | "status">[] = [];
      // Reply learning (see the reply block below): what each new inbound
      // reply taught us, leads whose reply the operator must handle
      // personally (Take Charge), and addresses whose older unsent reply
      // draft is now stale.
      const replyLearnings: Array<{
        lead: Lead;
        analysis: { note: string; sentiment?: string; intent?: string; nextStep?: string };
        subject: string;
        date: string;
        key: string;
      }> = [];
      const operatorAlerts: Array<{ lead: Lead; subject: string; intent?: string }> = [];
      const supersedeReplyDraftFor: string[] = [];

      for (const agent of autoAgents) {
        const industryLc = normalizeIndustry(agent.industry);
        const cadenceMs = Math.max(1, agent.followUpFrequencyDays) * 86400000;
        // Resolve this agent's optional Product/Service so every draft it
        // generates below is seeded with the same name/pitch context a
        // manually-built Email Marketing campaign gets from its own
        // Product/Service picker.
        const agentProduct = agent.productId ? curProducts.find((prod) => prod.id === agent.productId) : undefined;

        // Follow-up due: leads
        const dueLeads = curLeads.filter((l) => {
          if (normalizeIndustry(l.industry) !== industryLc) return false;
          if ((agent.excludedLeadIds || []).includes(l.id)) return false;
          if (l.operatorInControl) return false; // Take Charge: operator handles this lead
          if (!l.email) return false;
          if (l.status === "Converted" || l.status === "Lost") return false;
          const reference = l.lastContact ? new Date(l.lastContact).getTime() : new Date(l.createdDate || 0).getTime();
          if (!reference || now - reference < cadenceMs) return false;
          return !hasPendingOrRecent(l.email, "follow_up", cadenceMs);
        });

        // Leads in this industry that don't have an AI-Generated
        // knowledge-base summary yet (checked against the live snapshot
        // plus anything this same scan has already queued, so a lead never
        // gets two summaries in one pass).
        const leadsNeedingSummary = curLeads.filter((l) => {
          if (normalizeIndustry(l.industry) !== industryLc) return false;
          if ((agent.excludedLeadIds || []).includes(l.id)) return false;
          if (curKnowledge.some((k) => k.tags.includes("AI-Generated") && (k.linkedLeadIds || []).includes(l.id))) return false;
          return !kbUpserts.some((k) => (k.linkedLeadIds || []).includes(l.id));
        });

        for (const lead of leadsNeedingSummary.slice(0, 3)) {
          try {
            const leadActs = curActivities.filter((a) => a.leadId === lead.id);
            const res = await apiFetch("/api/ai/lead-knowledge-summary", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: lead.name,
                company: lead.company,
                jobTitle: lead.jobTitle,
                industry: lead.industry,
                notes: lead.notes,
                tags: lead.tags,
                activities: leadActs,
              }),
            });
            const data = await res.json();
            if (data.summary) {
              kbUpserts.push({
                category: "company",
                title: `${lead.name} — AI Summary`,
                content: data.summary,
                tags: ["AI-Generated"],
                linkedLeadIds: [lead.id],
              });
            }
          } catch (err) {
            console.error("[agent scan] knowledge summary failed for lead", lead.id, err);
          }
        }

        for (const lead of dueLeads.slice(0, 5)) {
          try {
            const leadActs = curActivities.filter((a) => a.leadId === lead.id);
            const res = await apiFetch("/api/ai/personalized-email", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                recipientName: lead.name,
                recipientCompany: lead.company,
                recipientJobTitle: lead.jobTitle,
                recipientIndustry: lead.industry,
                activities: leadActs,
                agent,
                productName: agentProduct?.name,
                productPitch: agentProduct?.pitch,
                senderName: curUser?.name,
                senderCompany: curTenant?.companyName || curTenant?.name,
                goal: `Send a follow-up -- it's been ${agent.followUpFrequencyDays}+ days since last contact with no response.`,
                ...buildAgentDirectiveFields(agent, agentProduct),
              }),
            });
            const data = await res.json();
            newActions.push({
              industry: agent.industry,
              actionType: "follow_up",
              leadId: lead.id,
              recipientName: lead.name,
              recipientEmail: lead.email,
              subject: data.subject,
              body: data.body,
              reasoning: `No response in ${agent.followUpFrequencyDays}+ days (agent cadence for ${agent.industry}).`,
              triggerSource: "auto_followup",
            });
          } catch (err) {
            console.error("[agent scan] follow-up draft failed for lead", lead.id, err);
          }
        }

        // The one-shot switches only ever apply to the very next batch --
        // reset them once this agent has actually drafted something.
        if (hasAgentDirectives(agent) && newActions.some((a) => a.industry === agent.industry && a.actionType === "follow_up")) {
          setIndustryAgents((prev) =>
            prev.map((p) => (p.id === agent.id ? { ...p, nextEmailIncludePricing: false, nextEmailExtraProblems: false } : p))
          );
        }

        // Reply detection -- reuses the same IMAP check the manual Inbox
        // "check replies" button uses, against this industry's candidate
        // addresses, then drafts a proposed reply for any that wrote back.
        const mailCfg = getMailboxById(curTenant);
        if (mailCfg?.email && mailCfg?.password && mailCfg?.imapHost) {
          const candidateLeads = curLeads.filter(
            (l) =>
              normalizeIndustry(l.industry) === industryLc &&
              !(agent.excludedLeadIds || []).includes(l.id) &&
              l.email &&
              l.status !== "Converted" &&
              l.status !== "Lost"
          );
          const addressToRecord = new Map<string, { type: "lead"; record: any }>();
          candidateLeads.forEach((l) => addressToRecord.set(l.email.toLowerCase(), { type: "lead", record: l }));

          if (addressToRecord.size > 0) {
            try {
              const knownKeys: Record<string, string> = {};
              candidateLeads.forEach((l) => {
                if (l.lastReplyKey) knownKeys[l.email.toLowerCase()] = l.lastReplyKey;
              });
              const res = await apiFetch("/api/webmail/fetch-replies", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  email: mailCfg.email,
                  password: mailCfg.password,
                  imapHost: mailCfg.imapHost,
                  imapPort: mailCfg.imapPort,
                  imapEncryption: mailCfg.imapEncryption,
                  addresses: Array.from(addressToRecord.keys()),
                  knownKeys,
                }),
              });
              const data = await res.json();
              for (const reply of (data.replies || []) as Array<{ address: string; key: string; subject: string; date: string; text: string }>) {
                const match = addressToRecord.get(String(reply.address).toLowerCase());
                if (!match) continue;
                const record = match.record as Lead;
                if (record.lastReplyKey === reply.key) continue;
                const replyText = (reply.text || "").trim();
                const address = reply.address;

                // 1) Learn: summarise the reply into THIS lead's own knowledge
                //    (never shared industry-wide) and log it on the timeline.
                let analysis: { note: string; sentiment?: string; intent?: string; nextStep?: string } = {
                  note: replyText.replace(/\s+/g, " ").slice(0, 280) || "Replied (no readable text).",
                };
                if (replyText) {
                  try {
                    const existing = curKnowledge.find(
                      (k) => k.tags.includes("Reply-Learned") && (k.linkedLeadIds || []).includes(record.id)
                    );
                    const aRes = await apiFetch("/api/ai/analyze-reply", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        name: record.name,
                        company: record.company,
                        jobTitle: record.jobTitle,
                        industry: record.industry,
                        replyText,
                        replySubject: reply.subject,
                        existingKnowledge: existing?.content,
                      }),
                    });
                    const aData = await aRes.json();
                    if (aData.note) analysis = aData;
                  } catch (err) {
                    console.error("[agent scan] reply analysis failed for", address, err);
                  }
                }
                replyLearnings.push({ lead: record, analysis, subject: reply.subject, date: reply.date, key: reply.key });

                // 2) Take Charge: the operator is handling this lead --
                //    notify only, never draft.
                if (record.operatorInControl) {
                  operatorAlerts.push({ lead: record, subject: reply.subject, intent: analysis.intent });
                  continue;
                }

                // 3) Otherwise draft a tailored reply using what we now know
                //    -- queued for one-click approval, never auto-sent.
                const leadKnowledge = [
                  ...curKnowledge
                    .filter((k) => (k.linkedLeadIds || []).includes(record.id))
                    .map((k) => `${k.title}: ${k.content}`),
                  `Latest reply (${reply.date.slice(0, 10)}): ${analysis.note}`,
                ];
                try {
                  const draftRes = await apiFetch("/api/ai/personalized-email", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      recipientName: record.name,
                      recipientCompany: record.company,
                      recipientJobTitle: record.jobTitle,
                      recipientIndustry: agent.industry,
                      knowledgeEntries: leadKnowledge,
                      activities: curActivities.filter((a) => a.leadId === record.id),
                      agent,
                      productName: agentProduct?.name,
                      productPitch: agentProduct?.pitch,
                      senderName: curUser?.name,
                      senderCompany: curTenant?.companyName || curTenant?.name,
                      replyText,
                      replyAnalysis: [analysis.sentiment && `sentiment ${analysis.sentiment}`, analysis.intent && `intent ${analysis.intent}`, analysis.nextStep]
                        .filter(Boolean)
                        .join("; "),
                      goal: "They just replied in our inbox -- draft a warm, specific reply to what they said that keeps the conversation moving forward.",
                    }),
                  });
                  const draftData = await draftRes.json();
                  newActions.push({
                    industry: agent.industry,
                    actionType: "email_reply",
                    leadId: record.id,
                    recipientName: record.name,
                    recipientEmail: address,
                    subject: draftData.subject,
                    body: draftData.body,
                    reasoning: `Replied: "${analysis.note.slice(0, 160)}"`,
                    triggerSnippet: replyText.slice(0, 300) || undefined,
                    triggerSource: "auto_reply",
                  });
                  supersedeReplyDraftFor.push(address.toLowerCase());
                } catch (err) {
                  console.error("[agent scan] reply draft failed for", address, err);
                }
              }
            } catch (err) {
              console.error("[agent scan] fetch-replies failed:", err);
            }
          }
        }
      }

      // ---- Reply learning: apply what the new inbound replies taught us ----
      if (replyLearnings.length > 0) {
        const todayStr = new Date().toISOString().split("T")[0];
        const nowIso = new Date().toISOString();

        // Lead-scoped knowledge: one "Reply Log" entry per lead, newest first,
        // tagged so it's visible/editable/deletable in the Knowledge Base.
        setKnowledgeBase((prev) => {
          let next = prev;
          for (const l of replyLearnings) {
            const line = `[${l.date.slice(0, 10)}] ${l.analysis.note}${
              l.analysis.intent && l.analysis.intent !== "unclear" ? ` (${l.analysis.intent.replace(/_/g, " ")})` : ""
            }${l.analysis.nextStep ? ` Next: ${l.analysis.nextStep}` : ""}`;
            const existing = next.find((k) => k.tags.includes("Reply-Learned") && (k.linkedLeadIds || []).includes(l.lead.id));
            if (existing) {
              next = next.map((k) =>
                k.id === existing.id ? { ...k, content: `${line}\n${k.content}`.slice(0, 4000), updatedAt: nowIso } : k
              );
            } else {
              next = [
                {
                  id:
                    typeof crypto !== "undefined" && "randomUUID" in crypto
                      ? crypto.randomUUID()
                      : `kb_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
                  category: "company" as const,
                  title: `${l.lead.name} — Reply Log`,
                  content: line,
                  tags: ["AI-Generated", "Reply-Learned"],
                  linkedLeadIds: [l.lead.id],
                  createdBy: "AI Agent",
                  createdAt: nowIso,
                  updatedAt: nowIso,
                },
                ...next,
              ];
            }
          }
          return next;
        });

        // Mark each reply as processed (never learn from the same email
        // twice) and note the contact on the lead.
        setLeads((prev) =>
          prev.map((l) => {
            const hit = replyLearnings.find((r) => r.lead.id === l.id);
            return hit ? { ...l, lastReplyKey: hit.key, lastContact: hit.date.slice(0, 10) || todayStr } : l;
          })
        );

        setActivities((prev) => [
          ...replyLearnings.map((l, i) => ({
            id: `act_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
            type: "Email" as const,
            leadId: l.lead.id,
            date: todayStr,
            time: new Date().toTimeString().slice(0, 5),
            user: "AI Agent",
            description: `Reply received from ${l.lead.name}${l.subject ? `: "${l.subject}"` : ""} — ${l.analysis.note.slice(0, 200)}`,
            outcome: l.analysis.intent ? l.analysis.intent.replace(/_/g, " ") : "Replied",
            nextAction: l.analysis.nextStep || "Review the drafted reply in Agent Approvals",
          })),
          ...prev,
        ]);
      }

      // Take Charge: leads the operator handles personally get a task +
      // notification instead of an AI draft.
      if (operatorAlerts.length > 0) {
        const dueStr = new Date().toISOString().split("T")[0];
        setTasks((prev) => [
          ...operatorAlerts.map((o, i) => ({
            id: `tsk_${Date.now()}_${i}`,
            title: `Reply to ${o.lead.name} (${o.lead.company || "lead"}) — they wrote back`,
            assignedUser: curUser?.name || "Unassigned",
            priority: "High" as const,
            dueDate: dueStr,
            status: "To Do" as const,
            notes: `You've taken charge of this lead, so the AI did not draft a reply. Subject: "${o.subject || "(none)"}". Open the lead's Reply Log in Knowledge for a summary.`,
          })),
          ...prev,
        ]);
        try {
          if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            new Notification(
              operatorAlerts.length === 1 ? `${operatorAlerts[0].lead.name} replied — your lead` : `${operatorAlerts.length} leads you manage replied`,
              { body: "You're in charge of these leads, so no AI reply was drafted. Open AarPex to respond." }
            );
          }
        } catch {
          // best-effort only
        }
      }

      if (newActions.length > 0) {
        setAgentActions((prev) => [
          ...newActions.map((a) => ({
            ...a,
            id:
              typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID()
                : `agt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            status: "pending" as const,
            createdAt: new Date().toISOString(),
          })),
          ...prev.map((p) =>
            p.status === "pending" && p.actionType === "email_reply" && supersedeReplyDraftFor.includes(p.recipientEmail.toLowerCase())
              ? { ...p, status: "rejected" as const, resolvedAt: new Date().toISOString(), resolvedBy: "Superseded by a newer reply" }
              : p
          ),
        ]);

        // Best-effort desktop notification -- the agent may draft these
        // while the user isn't looking at the tab at all, so the in-app
        // alert bell (Header.tsx) alone won't reach them. Never blocks or
        // throws: browsers that don't support the API, or where permission
        // was denied/not yet granted, just silently skip this.
        try {
          if (typeof window !== "undefined" && "Notification" in window) {
            if (Notification.permission === "granted") {
              new Notification(
                newActions.length === 1
                  ? "New agent approval waiting"
                  : `${newActions.length} new agent approvals waiting`,
                {
                  body:
                    newActions.length === 1
                      ? `${newActions[0].recipientName}: ${newActions[0].subject}`
                      : "Review them in Agent Approvals.",
                }
              );
            } else if (Notification.permission !== "denied") {
              Notification.requestPermission().catch(() => {});
            }
          }
        } catch {
          // Notifications are a nice-to-have -- never let this break the scan.
        }
      }

      if (kbUpserts.length > 0) {
        const now = new Date().toISOString();
        setKnowledgeBase((prev) => [
          ...kbUpserts.map((entry) => ({
            ...entry,
            id:
              typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID()
                : `kb_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            createdBy: "AI Agent",
            createdAt: now,
            updatedAt: now,
          })),
          ...prev,
        ]);
      }

      // Wire up lastScanAt -- stamp every agent this pass actually covered
      // with the time it ran, in a single batched setIndustryAgents update
      // (rather than one updateIndustryAgent call per agent) so scanning
      // several agents in one pass doesn't trigger N separate re-renders/
      // syncs, same principle as the bulk-action helpers above.
      const scannedIds = new Set(autoAgents.map((a) => a.id));
      const scannedAt = new Date().toISOString();
      setIndustryAgents((prev) =>
        prev.map((p) => (scannedIds.has(p.id) ? { ...p, lastScanAt: scannedAt, updatedAt: scannedAt } : p))
      );
    } finally {
      setScanRunning(false);
    }
  }, []);

  useEffect(() => {
    if (!activeTenantId) return;

    const runAutoScan = () => {
      const { industryAgents: curAgents } = agentScanStateRef.current;
      const autoAgents = curAgents.filter((p) => p.isActive && p.autoRunEnabled);
      void runAgentScanForAgents(autoAgents);
    };

    // Run once shortly after mount/tenant switch, then on a slow interval --
    // this hits AI + IMAP endpoints, so it deliberately doesn't run often.
    const initialTimer = setTimeout(runAutoScan, 15000);
    const interval = setInterval(runAutoScan, 10 * 60 * 1000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [activeTenantId, runAgentScanForAgents]);

  // Manual "Run Now" trigger -- see the CRMContextType field comment for
  // full behavior. Single-flight with the automatic interval: both paths
  // share isAgentScanRunningRef, so a manual click while either kind of
  // scan is already running is a no-op (resolves false) rather than
  // overlapping two scans.
  const runAgentScanNow = React.useCallback(
    async (agentId?: string): Promise<boolean> => {
      if (isAgentScanRunningRef.current) return false;
      const { industryAgents: curAgents } = agentScanStateRef.current;

      let targets: IndustryAgent[];
      if (agentId) {
        const agent = curAgents.find((a) => a.id === agentId);
        if (!agent || !agent.isActive) return false;
        targets = [agent];
      } else {
        targets = curAgents.filter((a) => a.isActive);
      }
      if (targets.length === 0) return false;

      await runAgentScanForAgents(targets);
      return true;
    },
    [runAgentScanForAgents]
  );

  // Best-effort: flush any still-pending (debounced) Supabase table syncs
  // the moment the tab is hidden (switched away from, closed, or the
  // browser is closed) rather than only on an explicit "Sign out" click.
  // `visibilitychange` fires reliably earlier than `beforeunload` for this
  // purpose. This can't be guaranteed to complete if the tab is actually
  // torn down a moment later, but it closes most of the window where an
  // action taken right before closing the tab would otherwise be lost.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void flushAllPendingSyncs();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  // Whenever the active tenant changes (including the very first time it's
  // set, by the session-bootstrap effect below), re-hydrate its records
  // from the database instead of trusting whatever's cached in localStorage
  // — the database is the source of truth once persistence is live. This
  // runs independently of isBootstrapping (unlike the write-sync effects
  // above) so it's exactly what populates state during bootstrap.
  useEffect(() => {
    if (!isSupabaseAuthConfigured() || !activeTenantId) {
      // Nothing to hydrate (no backend configured, or no active tenant
      // yet) -- don't leave shouldSyncToSupabase blocked forever on a
      // fetch that will never run.
      setIsHydratingTenantData(false);
      return;
    }
    // Block the write-sync effects (shouldSyncToSupabase) until this
    // tenant's real data has actually come back from Supabase -- see the
    // comment on isHydratingTenantData's declaration for why this matters.
    setIsHydratingTenantData(true);
    let cancelled = false;
    (async () => {
      const [
        leadsRes,
        dealsRes,
        pipelinesRes,
        invoicesRes,
        paymentsRes,
        activitiesRes,
        tasksRes,
        commentsRes,
        emailCampaignsRes,
        productsRes,
        knowledgeBaseRes,
        industryAgentsRes,
        agentActionsRes,
        storedFilesRes,
      ] = await Promise.all([
        fetchTenantTable<Lead>("leads", activeTenantId),
        fetchTenantTable<Deal>("deals", activeTenantId),
        fetchTenantTable<Pipeline>("pipelines", activeTenantId),
        fetchTenantTable<Invoice>("invoices", activeTenantId),
        fetchTenantTable<Payment>("payments", activeTenantId),
        fetchTenantTable<Activity>("activities", activeTenantId),
        fetchTenantTable<Task>("tasks", activeTenantId),
        fetchTenantTable<Comment>("comments", activeTenantId),
        fetchTenantTable<EmailCampaign>("email_campaigns", activeTenantId),
        fetchTenantTable<Product>("products", activeTenantId),
        fetchTenantTable<KnowledgeBaseEntry>("knowledge_base", activeTenantId),
        fetchTenantTable<IndustryAgent>("industry_agents", activeTenantId),
        fetchTenantTable<AgentAction>("agent_actions", activeTenantId),
        fetchTenantTable<StoredFile>("stored_files", activeTenantId),
      ]);
      if (cancelled) return;
      if (leadsRes) setLeads(leadsRes);
      if (dealsRes) setDeals(dealsRes);
      if (pipelinesRes && pipelinesRes.length > 0) setPipelines(pipelinesRes);
      if (invoicesRes) setInvoices(invoicesRes);
      if (paymentsRes) setPayments(paymentsRes);
      if (activitiesRes) setActivities(activitiesRes);
      if (tasksRes) setTasks(tasksRes);
      if (commentsRes) setComments(commentsRes);
      if (emailCampaignsRes) setEmailCampaigns(emailCampaignsRes);
      if (productsRes) setProducts(productsRes);
      if (knowledgeBaseRes) setKnowledgeBase(knowledgeBaseRes);
      if (industryAgentsRes) setIndustryAgents(industryAgentsRes);
      if (agentActionsRes) setAgentActions(agentActionsRes);
      if (storedFilesRes) setStoredFiles(storedFilesRes);
      setIsHydratingTenantData(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTenantId]);

  // Tenant workspace operations
  const switchTenant = (targetId: string) => {
    if (targetId === activeTenantId) return;

    // Flush current tenant state before switching
    localStorage.setItem(`crm_tenant_${activeTenantId}_leads`, JSON.stringify(leads));
    localStorage.setItem(`crm_tenant_${activeTenantId}_deals`, JSON.stringify(deals));
    localStorage.setItem(`crm_tenant_${activeTenantId}_pipelines`, JSON.stringify(pipelines));
    localStorage.setItem(`crm_tenant_${activeTenantId}_invoices`, JSON.stringify(invoices));
    localStorage.setItem(`crm_tenant_${activeTenantId}_payments`, JSON.stringify(payments));
    localStorage.setItem(`crm_tenant_${activeTenantId}_activities`, JSON.stringify(activities));
    localStorage.setItem(`crm_tenant_${activeTenantId}_tasks`, JSON.stringify(tasks));
    localStorage.setItem(`crm_tenant_${activeTenantId}_comments`, JSON.stringify(comments));
    localStorage.setItem(`crm_tenant_${activeTenantId}_emailCampaigns`, JSON.stringify(emailCampaigns));
    localStorage.setItem(`crm_tenant_${activeTenantId}_products`, JSON.stringify(products));
    localStorage.setItem(`crm_tenant_${activeTenantId}_knowledgeBase`, JSON.stringify(knowledgeBase));
    localStorage.setItem(`crm_tenant_${activeTenantId}_industryAgents`, JSON.stringify(industryAgents));
    localStorage.setItem(`crm_tenant_${activeTenantId}_agentActions`, JSON.stringify(agentActions));
    localStorage.setItem(`crm_tenant_${activeTenantId}_storedFiles`, JSON.stringify(storedFiles));

    // Every workspace starts genuinely empty except "pipelines" (a
    // structural default, not sample data) — see loadTenantEntity above.
    const loadTarget = <T,>(key: string, defaultVal: T): T => {
      const item = localStorage.getItem(`crm_tenant_${targetId}_${key}`);
      if (item) {
        try {
          return JSON.parse(item);
        } catch {}
      }
      if (key === "pipelines") return defaultVal;
      return ([] as unknown) as T;
    };

    setActiveTenantId(targetId);
    setLeads(loadTarget("leads", initialLeads));
    setDeals(loadTarget("deals", initialDeals));
    setPipelines(loadTarget("pipelines", initialPipelines));
    setInvoices(loadTarget("invoices", initialInvoices));
    setPayments(loadTarget("payments", initialPayments));
    setActivities(loadTarget("activities", initialActivities));
    setTasks(loadTarget("tasks", initialTasks));
    setComments(loadTarget("comments", initialComments));
    setEmailCampaigns(loadTarget("emailCampaigns", [] as EmailCampaign[]));
    setProducts(loadTarget("products", [] as Product[]));
    setKnowledgeBase(loadTarget("knowledgeBase", [] as KnowledgeBaseEntry[]));
    setIndustryAgents(loadTarget("industryAgents", [] as IndustryAgent[]));
    setAgentActions(loadTarget("agentActions", [] as AgentAction[]));
    setStoredFiles(loadTarget("storedFiles", [] as StoredFile[]));
    setSelectedDealId(null);
  };

  // Opt-in action for a real (empty) workspace that wants to explore the
  // product with the built-in sample dataset instead of starting blank.
  const loadSampleData = () => {
    setLeads(initialLeads);
    setDeals(initialDeals);
    setPipelines(initialPipelines);
    setInvoices(initialInvoices);
    setPayments(initialPayments);
    setActivities(initialActivities);
    setTasks(initialTasks);
    setComments(initialComments);
    addAuditLogEntry("Loaded sample data", "Populated this workspace with demo leads, deals, and invoices for exploration.", "general");
  };

  const createTenant = (tenantData: Partial<Tenant>): Tenant => {
    // A real UUID so the tenant's id matches the row Supabase creates for
    // it (when configured) with zero reconciliation — every CRM record
    // synced under this tenant references this same id as its tenant_id.
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `tenant-${Date.now().toString(36)}`;
    const slug = (tenantData.name || "workspace").toLowerCase().replace(/[^a-z0-9]/g, "-");

    // The one exempt founder account: always kept active, never gated behind
    // a Stripe checkout. Every other workspace is only ever provisioned
    // (see AuthPage's sign-up flow) after that account's owner has completed
    // a real, live Stripe Checkout with a card on file — so it starts on the
    // normal 14-day trial that auto-charges once the trial ends.
    const ownerEmail = (tenantData.ownerEmail || currentUser.email || "").trim().toLowerCase();
    const isFounderAccount = ownerEmail === FOUNDER_EMAIL.toLowerCase();

    const newTenant: Tenant = {
      id,
      name: tenantData.name || "New Workspace",
      slug,
      logo: tenantData.name ? tenantData.name.charAt(0).toUpperCase() : "W",
      industry: tenantData.industry || "General Enterprise",
      currency: tenantData.currency || "USD",
      createdAt: new Date().toISOString(),
      ownerEmail: currentUser.email,
      plan: tenantData.plan || "Growth",
      companyName: tenantData.companyName || tenantData.name || "New Enterprise Corp",
      taxId: tenantData.taxId || "",
      commissionRate: tenantData.commissionRate ?? 10,
      // Every new workspace starts on a 14-day free trial of the flat-rate
      // platform plan; nextBillingDate doubles as "trial ends / first charge
      // date" since there's only ever one plan. The founder account is kept
      // permanently active instead, with no trial/billing clock running.
      billingCycle: "monthly",
      subscriptionStatus: isFounderAccount ? "active" : "trialing",
      subscriptionPrice: PLATFORM_PLAN.monthlyPrice,
      seatsAllocated: PLATFORM_PLAN.seats,
      nextBillingDate: new Date(Date.now() + PLATFORM_TRIAL_DAYS * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
      // Real Stripe identifiers, when this workspace was provisioned right
      // after a completed live Checkout session (see AuthPage) — left
      // undefined for the founder account, which never goes through Stripe.
      subscriptionId: tenantData.subscriptionId,
      stripeCustomerId: tenantData.stripeCustomerId,
      cardLast4: tenantData.cardLast4,
      cardBrand: tenantData.cardBrand,
      members: [
        {
          userId: currentUser.id,
          name: currentUser.name,
          email: currentUser.email,
          role: "admin",
          joinedAt: new Date().toISOString(),
        },
      ],
      stripeConfig: {
        isEnabled: false,
        publishableKey: "",
        secretKey: "",
        currency: tenantData.currency || "USD",
        isLiveMode: false,
        status: "unconfigured",
        accountName: `${tenantData.name || "Workspace"} Merchant`,
      },
      webmailConfigs: [
        {
          id:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `mbx_${Date.now().toString(36)}`,
          label: "Primary Mailbox",
          isDefault: true,
          isEnabled: true,
          provider: "hostinger",
          email: currentUser.email,
          displayName: currentUser.name,
          password: "",
          smtpHost: "smtp.hostinger.com",
          smtpPort: 465,
          smtpEncryption: "SSL",
          imapHost: "imap.hostinger.com",
          imapPort: 993,
          imapEncryption: "SSL",
          replyTo: currentUser.email,
          status: "unconfigured",
          signature: `--\n${currentUser.name}\n${tenantData.name || "Workspace"}`,
        },
      ],
    };

    setTenants((prev) => [...prev, newTenant]);
    switchTenant(id);

    // Create the matching row (+ owner membership) in Supabase in the
    // background so the UI never blocks on network latency. The attempt is
    // recorded in a local retry queue *before* it's fired — if it fails
    // (offline, a dropped connection, a transient error) the workspace stays
    // queued and is retried automatically on the next app load (see the
    // session-bootstrap effect below), instead of silently disappearing the
    // moment the page reloads because Supabase never got the row.
    if (isSupabaseAuthConfigured()) {
      const creationArgs = {
        id,
        name: newTenant.name,
        industry: newTenant.industry,
        currency: newTenant.currency,
        companyName: newTenant.companyName,
        taxId: newTenant.taxId,
        commissionRate: newTenant.commissionRate,
        ownerName: currentUser.name,
        ownerEmail: currentUser.email,
      };
      savePendingTenantCreation(creationArgs);
      void createTenantWithOwner(creationArgs).then((result) => {
        if (result) {
          clearPendingTenantCreation(id);
        }
        // On failure it simply stays in the pending queue — the next app
        // load (or the next successful hydrate) will retry it.
      });
    }

    return newTenant;
  };

  const updateTenant = (tenantId: string, updates: Partial<Tenant>) => {
    setTenants((prev) =>
      prev.map((t) => (t.id === tenantId ? { ...t, ...updates } : t))
    );
  };

  const deleteTenant = async (tenantId: string): Promise<boolean> => {
    if (tenants.length <= 1) return false;

    // Delete the row in Supabase FIRST (every CRM table cascades off of
    // it), and only remove it from local state once that actually
    // succeeded. Previously this only ever updated local React state --
    // the tenant row lived on in Supabase, so the very next hydrate
    // (reload, re-sign-in, tab reopen) pulled it right back via
    // fetchMyTenantsFull() and it reappeared as if nothing happened.
    const deleted = await deleteTenantServerSide(tenantId);
    if (!deleted) return false;

    const remaining = tenants.filter((t) => t.id !== tenantId);
    setTenants(remaining);
    if (activeTenantId === tenantId) {
      switchTenant(remaining[0].id);
    }
    return true;
  };

  // Session bootstrap: require a real, currently-valid Supabase session
  // before showing the app at all — no more falling back to a local demo
  // user/workspace when nobody's actually signed in. Runs once on mount,
  // then keeps itself in sync via onAuthStateChange (sign-out anywhere
  // reopens AuthPage; a fresh sign-in populates real workspace data).
  useEffect(() => {
    if (!isSupabaseAuthConfigured()) {
      // No real auth backend configured for this deployment — there's
      // nothing to authenticate against, so always require sign-in rather
      // than ever falling into a local-only "it just works" demo state.
      setTenants([]);
      setActiveTenantId("");
      setCurrentUser(SIGNED_OUT_USER);
      setUsers([]);
      setAuthPageOpen(true);
      setIsBootstrapping(false);
      return;
    }

    const supabase = getSupabaseAuthClient();
    let cancelled = false;

    const hydrateFromSession = async (sessionUser: { id: string; email?: string; user_metadata?: any } | null) => {
      if (!sessionUser || !sessionUser.email) {
        setTenants([]);
        setActiveTenantId("");
        setCurrentUser(SIGNED_OUT_USER);
        setUsers([]);
        setAuthPageOpen(true);
        return;
      }

      const displayName =
        sessionUser.user_metadata?.full_name ||
        sessionUser.email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
      const initials =
        displayName
          .split(/\s+/)
          .map((s: string) => s[0])
          .filter(Boolean)
          .slice(0, 2)
          .join("")
          .toUpperCase() || "US";

      const realUser: User = {
        id: sessionUser.id,
        name: displayName,
        email: sessionUser.email,
        role: "admin",
        roleTitle: "Workspace Owner",
        avatar: initials,
        status: "Active",
        lastLogin: "Active Now",
      };
      setCurrentUser(realUser);
      setUsers([realUser]);

      // Before trusting Supabase as the source of truth, give any workspace
      // that was created but never confirmed server-side (e.g. the create
      // RPC failed on a flaky connection, or the tab closed/redeployed
      // before it landed) one more chance to actually land there. Without
      // this, a real workspace that only exists in local cache would be
      // wiped out below the moment fetchMyTenantsFull() comes back empty.
      if (hasPendingTenantCreations()) {
        await flushPendingTenantCreations();
        if (cancelled) return;
      }

      const myTenants = await fetchMyTenantsFull();
      if (cancelled) return;

      if (myTenants === null) {
        // The fetch itself failed (offline, a transient Supabase error,
        // etc.) — this is NOT the same as "this user has zero workspaces".
        // Keep whatever is already in local state/localStorage rather than
        // wiping it out on a network hiccup; the next successful hydrate
        // (retry on reload, or the next onAuthStateChange fire) will
        // reconcile it properly.
        setAuthPageOpen(false);
        return;
      }

      if (myTenants.length > 0) {
        setTenants(myTenants);
        setActiveTenantId((prev) => (myTenants.some((t) => t.id === prev) ? prev : myTenants[0].id));
      } else if (hasPendingTenantCreations()) {
        // Supabase genuinely has no rows for this user *yet*, but there's a
        // workspace creation still queued for retry (its RPC call hasn't
        // succeeded even after the flush attempt above, likely because the
        // network is down right now). Keep the locally cached workspace
        // instead of showing an empty shell — it will keep retrying.
      } else {
        // Signed in, confirmed zero workspaces, and nothing pending. This
        // used to just show an empty shell — but that shell looked and
        // behaved exactly like a real, working workspace (its own
        // localStorage-cached "Workspace" placeholder), so people worked in
        // it for real without ever noticing nothing they entered was being
        // saved anywhere. Force the create-workspace modal open instead —
        // see the mandatory-workspace gate in App.tsx, which keeps it open
        // and blocks the rest of the app until a real tenant exists.
        setTenants([]);
        setActiveTenantId("");
        setCreateTenantModalOpen(true);
      }
      setAuthPageOpen(false);
    };

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      await hydrateFromSession(data.session?.user || null);
      if (!cancelled) setIsBootstrapping(false);
    })();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      void hydrateFromSession(session?.user || null);
    });

    return () => {
      cancelled = true;
      authListener?.subscription?.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handles the return trip from Stripe Checkout for a signed-in user who
  // was adding an *additional* workspace via WorkspaceModal (as opposed to
  // AuthPage's own sign-up flow, which handles its own redirect). Stripe
  // redirects here with ?subscription=success&session_id=... or
  // ?subscription=cancelled — a full page reload, so the modal's React
  // state doesn't survive it; the pending workspace details saved to
  // localStorage right before the redirect are what let this finish the
  // job. Waits for session bootstrap to finish first so currentUser/tenants
  // are populated before creating the new one, and only ever runs once.
  const hasProcessedWorkspaceRedirectRef = useRef(false);
  useEffect(() => {
    if (isBootstrapping || hasProcessedWorkspaceRedirectRef.current) return;

    const params = new URLSearchParams(window.location.search);
    const subscriptionParam = params.get("subscription");
    if (!subscriptionParam) return;

    const pendingRaw = localStorage.getItem(PENDING_WORKSPACE_KEY);
    if (!pendingRaw) return;

    hasProcessedWorkspaceRedirectRef.current = true;
    // Scrub the query string so a refresh doesn't reprocess a stale result.
    window.history.replaceState({}, "", window.location.pathname);

    if (subscriptionParam === "cancelled") {
      localStorage.removeItem(PENDING_WORKSPACE_KEY);
      return;
    }

    if (subscriptionParam !== "success") return;

    let pending: PendingWorkspace;
    try {
      pending = JSON.parse(pendingRaw);
    } catch {
      localStorage.removeItem(PENDING_WORKSPACE_KEY);
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
          // than leaving the paying customer stuck with no new workspace.
          console.error(err);
        }
      }

      const created = createTenant({
        name: pending.name,
        industry: pending.industry,
        currency: pending.currency,
        companyName: pending.companyName,
        ownerEmail: pending.ownerEmail,
        plan: PLATFORM_PLAN.id,
        subscriptionId,
        stripeCustomerId,
        cardLast4,
        cardBrand,
      });
      switchTenant(created.id);
      localStorage.removeItem(PENDING_WORKSPACE_KEY);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBootstrapping]);

  // activeTenant can be undefined for the brief window between a real
  // sign-in and that user's first workspace existing (e.g. mid-signup, or
  // an account with zero workspaces) — every field here falls back safely
  // so the app shell doesn't crash while that resolves.
  const settings: CRMSettings = useMemo(
    () => ({
      companyName: activeTenant?.companyName || activeTenant?.name || "",
      taxId: activeTenant?.taxId || "",
      currency: activeTenant?.currency === "EUR" ? "EUR (€)" : activeTenant?.currency === "GBP" ? "GBP (£)" : "USD ($)",
      commissionRate: activeTenant?.commissionRate ?? 10,
    }),
    [activeTenant]
  );

  const updateSettings = (updates: Partial<CRMSettings>) => {
    setTenants((prev) =>
      prev.map((t) => {
        if (t.id === activeTenantId) {
          return {
            ...t,
            companyName: updates.companyName ?? t.companyName,
            taxId: updates.taxId ?? t.taxId,
            currency: updates.currency?.includes("EUR") ? "EUR" : updates.currency?.includes("GBP") ? "GBP" : "USD",
            commissionRate: updates.commissionRate ?? t.commissionRate,
          };
        }
        return t;
      })
    );
  };

  const updateStripeConfig = (configUpdates: Partial<TenantStripeConfig>) => {
    setTenants((prev) =>
      prev.map((t) => {
        if (t.id === activeTenantId) {
          return {
            ...t,
            stripeConfig: {
              ...t.stripeConfig,
              ...configUpdates,
            },
          };
        }
        return t;
      })
    );
  };

  const updateWhatsAppConfig = (configUpdates: Partial<TenantWhatsAppConfig>) => {
    setTenants((prev) =>
      prev.map((t) => {
        if (t.id === activeTenantId) {
          return {
            ...t,
            whatsappConfig: {
              isEnabled: false,
              phoneNumberId: "",
              status: "unconfigured",
              ...t.whatsappConfig,
              ...configUpdates,
            },
          };
        }
        return t;
      })
    );
  };

  // Webmail mailboxes -- a workspace can connect more than one, each one
  // usable for both sending (SMTP) and receiving/reply-detection (IMAP).
  // Exactly one is ever flagged isDefault; compose and campaign creation
  // fall back to it when no specific mailbox is chosen (see lib/webmail.ts).
  const addWebmailConfig = (configData?: Partial<TenantWebmailConfig>): TenantWebmailConfig => {
    const newId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `mbx_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const newConfig: TenantWebmailConfig = {
      isEnabled: false,
      provider: "hostinger",
      email: "",
      displayName: "",
      password: "",
      smtpHost: "smtp.hostinger.com",
      smtpPort: 465,
      smtpEncryption: "SSL",
      imapHost: "imap.hostinger.com",
      imapPort: 993,
      imapEncryption: "SSL",
      status: "unconfigured",
      ...configData,
      id: newId,
      label: configData?.label?.trim() || "New Mailbox",
    };
    setTenants((prev) =>
      prev.map((t) => {
        if (t.id !== activeTenantId) return t;
        const existing = t.webmailConfigs || [];
        const isFirstMailbox = existing.length === 0;
        return {
          ...t,
          webmailConfigs: [...existing, { ...newConfig, isDefault: isFirstMailbox || !!configData?.isDefault }],
        };
      })
    );
    return newConfig;
  };

  const updateWebmailConfig = (id: string, configUpdates: Partial<TenantWebmailConfig>) => {
    setTenants((prev) =>
      prev.map((t) => {
        if (t.id !== activeTenantId) return t;
        return {
          ...t,
          webmailConfigs: (t.webmailConfigs || []).map((m) => (m.id === id ? { ...m, ...configUpdates } : m)),
        };
      })
    );
  };

  const deleteWebmailConfig = (id: string) => {
    setTenants((prev) =>
      prev.map((t) => {
        if (t.id !== activeTenantId) return t;
        const remaining = (t.webmailConfigs || []).filter((m) => m.id !== id);
        // The deleted mailbox may have been the default -- promote whatever
        // is left so compose/campaigns never end up with zero default.
        if (remaining.length > 0 && !remaining.some((m) => m.isDefault)) {
          remaining[0] = { ...remaining[0], isDefault: true };
        }
        return { ...t, webmailConfigs: remaining };
      })
    );
  };

  const setDefaultWebmailConfig = (id: string) => {
    setTenants((prev) =>
      prev.map((t) => {
        if (t.id !== activeTenantId) return t;
        return {
          ...t,
          webmailConfigs: (t.webmailConfigs || []).map((m) => ({ ...m, isDefault: m.id === id })),
        };
      })
    );
  };

  const updateSupabaseConfig = (configUpdates: Partial<SupabaseConfig>) => {
    setTenants((prev) =>
      prev.map((t) => {
        if (t.id === activeTenantId) {
          const current = t.supabaseConfig || {
            url: "",
            anonKey: "",
            isConnected: false,
          };
          return {
            ...t,
            supabaseConfig: {
              ...current,
              ...configUpdates,
            },
          };
        }
        return t;
      })
    );
  };

  // Billing / security audit trail, scoped per tenant. Capped at 200 entries
  // per tenant so it never grows unbounded in localStorage.
  const addAuditLogEntry = (action: string, details?: string, category: AuditLogEntry["category"] = "general") => {
    setTenants((prev) =>
      prev.map((t) => {
        if (t.id !== activeTenantId) return t;
        const entry: AuditLogEntry = {
          id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          timestamp: new Date().toISOString(),
          actor: currentUser?.name || currentUser?.email || "Unknown User",
          action,
          details,
          category,
        };
        const nextLog = [entry, ...(t.auditLog || [])].slice(0, 200);
        return { ...t, auditLog: nextLog };
      })
    );
  };

  // Surface Supabase sync failures as a real, visible audit-log entry
  // instead of only a browser console.error -- these used to be invisible
  // to anyone without devtools open, which is exactly why diagnosing
  // "some records didn't save" kept requiring screenshots and guesswork.
  useEffect(() => {
    const unsubscribe = onSyncFailure((failure) => {
      if (failure.tenantId !== activeTenantId) return;
      const sampleText = failure.sample.map((s) => `${s.id}: ${s.error}`).join("; ");
      const headline =
        failure.kind === "delete"
          ? `Cleanup of ${failure.table} could not remove some stale record(s) in Supabase (${failure.failedCount} of ${failure.totalCount} batch(es) failed) -- nothing new was lost, but old rows may briefly reappear`
          : `${failure.failedCount} of ${failure.totalCount} ${failure.table} record(s) failed to save`;
      addAuditLogEntry(headline, sampleText || undefined, "general");
    });
    return unsubscribe;
  }, [addAuditLogEntry, activeTenantId]);

  // Lead Actions
  const addLead = (leadData: Omit<Lead, "id" | "createdDate">): Lead => {
    const newId = `LD-${Math.floor(100 + Math.random() * 900)}`;
    const newLead: Lead = {
      ...leadData,
      id: newId,
      createdDate: new Date().toISOString().split("T")[0],
      tags: leadData.tags || [],
    };
    setLeads((prev) => [newLead, ...prev]);
    return newLead;
  };

  const updateLead = (id: string, updates: Partial<Lead>) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...updates } : l)));
  };

  const deleteLead = (id: string) => {
    setLeads((prev) => prev.filter((l) => l.id !== id));
  };

  const moveLeadStatus = (leadId: string, newStatus: Lead["status"]) => {
    setLeads((prev) =>
      prev.map((l) => {
        if (l.id === leadId) {
          return {
            ...l,
            status: newStatus,
            lastContact: new Date().toISOString().split("T")[0],
          };
        }
        return l;
      })
    );
  };

  const bulkDeleteLeads = (ids: string[]) => {
    const idSet = new Set(ids);
    setLeads((prev) => prev.filter((l) => !idSet.has(l.id)));
  };

  const bulkUpdateLeadStatus = (ids: string[], status: Lead["status"]) => {
    const idSet = new Set(ids);
    setLeads((prev) =>
      prev.map((l) =>
        idSet.has(l.id)
          ? { ...l, status, lastContact: new Date().toISOString().split("T")[0] }
          : l
      )
    );
  };

  const convertLead = (leadId: string, createDeal: boolean) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) throw new Error("Lead not found");

    let newDeal: Deal | undefined = undefined;
    if (createDeal) {
      const defaultPipeline = pipelines.find((p) => p.isDefault) || pipelines[0];
      const defaultStage = defaultPipeline.stages[2] || defaultPipeline.stages[0]; // Qualified stage
      newDeal = addDeal({
        name: `${lead.company} - Expansion Core`,
        salesperson: lead.salesperson || currentUser.name,
        pipelineId: defaultPipeline.id,
        stageId: defaultStage.id,
        status: "Open",
        dealValue: lead.estimatedValue || 50000,
        currency: "USD",
        probability: defaultStage.probability,
        expectedCloseDate: lead.expectedCloseDate || new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
        productService: "Core Enterprise Solution",
        source: lead.source,
        priority: lead.priority === "Urgent" ? "High" : lead.priority === "High" ? "High" : "Medium",
        lastActivity: new Date().toISOString().split("T")[0],
        nextActivity: "Initial qualification and discovery call",
        notes: `Deal generated from lead conversion ${lead.id}. Notes: ${lead.notes}`,
      });
    }

    // Update lead status to Converted
    setLeads((prev) =>
      prev.map((l) =>
        l.id === leadId
          ? {
              ...l,
              status: "Converted",
              convertedDealId: newDeal?.id,
            }
          : l
      )
    );

    // Log Activity
    addActivity({
      type: "Note",
      dealId: newDeal?.id,
      leadId: lead.id,
      date: new Date().toISOString().split("T")[0],
      time: "10:00",
      user: currentUser.name,
      description: `Lead ${lead.name} (${lead.company}) was converted${newDeal ? " to a deal" : ""}.`,
      outcome: "Converted successfully",
      nextAction: "Schedule initial strategic alignment call",
    });

    return { deal: newDeal };
  };

  // Deal Actions
  const addDeal = (dealData: Omit<Deal, "id" | "createdDate" | "weightedValue">): Deal => {
    const newId = `DL-${Math.floor(200 + Math.random() * 800)}`;
    const probability = dealData.probability || 50;
    const weightedValue = Math.round((dealData.dealValue * probability) / 100);
    const newDeal: Deal = {
      ...dealData,
      id: newId,
      probability,
      weightedValue,
      createdDate: new Date().toISOString().split("T")[0],
      lastActivity: dealData.lastActivity || new Date().toISOString().split("T")[0],
      nextActivity: dealData.nextActivity || "Follow up on proposal",
    };
    setDeals((prev) => [newDeal, ...prev]);

    // Log activity
    addActivity({
      type: "Note",
      dealId: newId,
      date: new Date().toISOString().split("T")[0],
      time: "09:00",
      user: dealData.salesperson || currentUser.name,
      description: `Deal created: "${dealData.name}" valued at $${dealData.dealValue.toLocaleString()}`,
      outcome: "Deal opened in pipeline",
      nextAction: dealData.nextActivity || "Follow up with client",
    });

    return newDeal;
  };

  const updateDeal = (id: string, updates: Partial<Deal>) => {
    setDeals((prev) =>
      prev.map((d) => {
        if (d.id === id) {
          const updated = { ...d, ...updates };
          if (updates.dealValue !== undefined || updates.probability !== undefined) {
            const prob = updated.probability || 0;
            updated.weightedValue = Math.round((updated.dealValue * prob) / 100);
          }
          return updated;
        }
        return d;
      })
    );
  };

  const deleteDeal = (id: string) => {
    setDeals((prev) => prev.filter((d) => d.id !== id));
  };

  const moveDealStage = (dealId: string, newStageId: string, newPipelineId?: string) => {
    setDeals((prev) =>
      prev.map((d) => {
        if (d.id === dealId) {
          const pipeId = newPipelineId || d.pipelineId;
          const pipeline = pipelines.find((p) => p.id === pipeId);
          const stage = pipeline?.stages.find((s) => s.id === newStageId);
          const probability = stage ? stage.probability : d.probability;
          let status: Deal["status"] = d.status;

          if (stage?.isWon) status = "Won";
          else if (stage?.isLost) status = "Lost";
          else status = "Open";

          const updated: Deal = {
            ...d,
            pipelineId: pipeId,
            stageId: newStageId,
            probability,
            weightedValue: Math.round((d.dealValue * probability) / 100),
            status,
            lastActivity: new Date().toISOString().split("T")[0],
          };

          // If moved to Won, record activity
          if (status === "Won" && d.status !== "Won") {
            setTimeout(() => {
              addActivity({
                type: "Proposal",
                dealId: d.id,
                date: new Date().toISOString().split("T")[0],
                time: "11:00",
                user: currentUser.name,
                description: `Deal "${d.name}" closed WON ($${d.dealValue.toLocaleString()})!`,
                outcome: "Contract finalized and signed",
                nextAction: "Generate onboarding invoice and schedule kickoff",
              });
            }, 50);
          }

          return updated;
        }
        return d;
      })
    );
  };

  // Pipeline Actions
  const addPipeline = (pipelineData: Omit<Pipeline, "id">) => {
    const newPipeline: Pipeline = {
      ...pipelineData,
      id: `pipe_${Date.now()}`,
    };
    setPipelines((prev) => [...prev, newPipeline]);
  };

  const updatePipeline = (id: string, updates: Partial<Pipeline>) => {
    setPipelines((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  };

  const deletePipeline = (id: string) => {
    if (pipelines.length <= 1) return; // Keep at least one
    setPipelines((prev) => prev.filter((p) => p.id !== id));
  };

  // Invoice Calculations & Actions
  const calculateInvoiceTotals = (items: Invoice["items"], initialDiscount = 0) => {
    const subtotal = items.reduce((sum, itm) => sum + (itm.quantity * itm.unitPrice), 0);
    const itemDiscounts = items.reduce((sum, itm) => sum + (itm.quantity * itm.unitPrice * (itm.discountPercent / 100)), 0);
    const discount = itemDiscounts || initialDiscount;
    const taxableAmount = Math.max(0, subtotal - discount);
    const tax = items.reduce((sum, itm) => sum + (itm.quantity * itm.unitPrice * (itm.taxPercent / 100)), 0);
    const total = Math.round(taxableAmount + tax);
    return { subtotal, discount, tax, total };
  };

  const addInvoice = (invoiceData: Omit<Invoice, "id" | "subtotal" | "discount" | "tax" | "total" | "amountPaid" | "remainingBalance" | "status"> & { status?: Invoice["status"] }): Invoice => {
    const newId = `INV-2026-${Math.floor(100 + Math.random() * 900)}`;
    const items = invoiceData.items.map((item, idx) => ({
      ...item,
      id: item.id || `itm_${Date.now()}_${idx}`,
      total: Math.round(item.quantity * item.unitPrice * (1 - (item.discountPercent || 0) / 100) * (1 + (item.taxPercent || 0) / 100)),
    }));
    const { subtotal, discount, tax, total } = calculateInvoiceTotals(items);
    const amountPaid = 0;
    const remainingBalance = total;
    const status: Invoice["status"] = invoiceData.status || "Sent";

    const newInvoice: Invoice = {
      ...invoiceData,
      id: newId,
      invoiceNumber: invoiceData.invoiceNumber || newId,
      items,
      subtotal,
      discount,
      tax,
      total,
      amountPaid,
      remainingBalance,
      status,
    };

    setInvoices((prev) => [newInvoice, ...prev]);

    // Log Activity
    addActivity({
      type: "Invoice",
      dealId: invoiceData.dealId,
      date: invoiceData.issueDate || new Date().toISOString().split("T")[0],
      time: "09:30",
      user: currentUser.name,
      description: `Invoice ${newId} issued for $${total.toLocaleString()}`,
      outcome: `Invoice status: ${status}`,
      nextAction: `Follow up on payment before due date ${invoiceData.dueDate}`,
    });

    return newInvoice;
  };

  const updateInvoice = (id: string, updates: Partial<Invoice>) => {
    setInvoices((prev) =>
      prev.map((inv) => {
        if (inv.id === id) {
          const items = updates.items || inv.items;
          const { subtotal, discount, tax, total } = calculateInvoiceTotals(items);
          const amountPaid = updates.amountPaid !== undefined ? updates.amountPaid : inv.amountPaid;
          const remainingBalance = Math.max(0, total - amountPaid);
          let status = updates.status || inv.status;

          if (amountPaid >= total && total > 0) status = "Paid";
          else if (amountPaid > 0 && amountPaid < total) status = "Partially Paid";
          else if (new Date(inv.dueDate) < new Date() && remainingBalance > 0 && status !== "Cancelled") status = "Overdue";

          return {
            ...inv,
            ...updates,
            items,
            subtotal,
            discount,
            tax,
            total,
            amountPaid,
            remainingBalance,
            status,
          };
        }
        return inv;
      })
    );
  };

  const deleteInvoice = (id: string) => {
    setInvoices((prev) => prev.filter((i) => i.id !== id));
  };

  const duplicateInvoice = (id: string): Invoice => {
    const existing = invoices.find((i) => i.id === id);
    if (!existing) throw new Error("Invoice not found");

    return addInvoice({
      invoiceNumber: `INV-2026-${Math.floor(100 + Math.random() * 900)}`,
      dealId: existing.dealId,
      issueDate: new Date().toISOString().split("T")[0],
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
      currency: existing.currency,
      items: existing.items.map((itm) => ({ ...itm, id: `itm_${Date.now()}_${Math.random()}` })),
      notes: `Duplicated from ${existing.invoiceNumber}. ${existing.notes || ""}`,
      status: "Draft",
    });
  };

  const markInvoicePaid = (id: string) => {
    const invoice = invoices.find((i) => i.id === id);
    if (!invoice) return;

    const remaining = invoice.remainingBalance;
    if (remaining > 0) {
      addPayment({
        paymentNumber: `PAY-${Math.floor(500 + Math.random() * 500)}`,
        invoiceId: invoice.id,
        dealId: invoice.dealId,
        date: new Date().toISOString().split("T")[0],
        amount: remaining,
        currency: invoice.currency,
        paymentMethod: "Bank Transfer",
        reference: `SETTLE-${invoice.invoiceNumber}`,
        notes: `Full settlement of invoice ${invoice.invoiceNumber}`,
        recordedBy: currentUser.name,
      });
    }
  };

  // Payment Actions & Strict Balance Reconciliations
  const addPayment = (paymentData: Omit<Payment, "id">): Payment => {
    const newId = `PAY-${Math.floor(500 + Math.random() * 500)}`;
    const newPayment: Payment = {
      ...paymentData,
      id: newId,
      paymentNumber: paymentData.paymentNumber || newId,
    };

    setPayments((prev) => [newPayment, ...prev]);

    // Update target invoice
    setInvoices((prev) =>
      prev.map((inv) => {
        if (inv.id === paymentData.invoiceId) {
          const newAmountPaid = (inv.amountPaid || 0) + paymentData.amount;
          const newRemaining = Math.max(0, inv.total - newAmountPaid);
          let newStatus: Invoice["status"] = inv.status;

          if (newRemaining <= 0) {
            newStatus = "Paid";
          } else {
            newStatus = "Partially Paid";
          }

          return {
            ...inv,
            amountPaid: newAmountPaid,
            remainingBalance: newRemaining,
            status: newStatus,
          };
        }
        return inv;
      })
    );

    // Log Activity
    addActivity({
      type: "Payment",
      dealId: paymentData.dealId,
      date: paymentData.date || new Date().toISOString().split("T")[0],
      time: "14:15",
      user: paymentData.recordedBy || currentUser.name,
      description: `Payment ${newId} recorded: $${paymentData.amount.toLocaleString()} via ${paymentData.paymentMethod} (Ref: ${paymentData.reference})`,
      outcome: "Payment credited to balance",
      nextAction: "Issue payment receipt to customer",
    });

    return newPayment;
  };

  const deletePayment = (id: string) => {
    const payment = payments.find((p) => p.id === id);
    if (!payment) return;

    setPayments((prev) => prev.filter((p) => p.id !== id));

    // Reverse payment from invoice
    setInvoices((prev) =>
      prev.map((inv) => {
        if (inv.id === payment.invoiceId) {
          const updatedPaid = Math.max(0, inv.amountPaid - payment.amount);
          const updatedRemaining = Math.max(0, inv.total - updatedPaid);
          let updatedStatus: Invoice["status"] = inv.status;
          if (updatedPaid === 0) updatedStatus = "Sent";
          else if (updatedRemaining > 0) updatedStatus = "Partially Paid";

          return {
            ...inv,
            amountPaid: updatedPaid,
            remainingBalance: updatedRemaining,
            status: updatedStatus,
          };
        }
        return inv;
      })
    );
  };

  // Activity Actions
  const addActivity = (activityData: Omit<Activity, "id">) => {
    const newActivity: Activity = {
      ...activityData,
      id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    };
    setActivities((prev) => [newActivity, ...prev]);
  };

  const deleteActivity = (id: string) => {
    setActivities((prev) => prev.filter((a) => a.id !== id));
  };

  // Task Actions
  const addTask = (taskData: Omit<Task, "id">) => {
    const newTask: Task = {
      ...taskData,
      id: `tsk_${Date.now()}`,
    };
    setTasks((prev) => [newTask, ...prev]);
  };

  const updateTask = (id: string, updates: Partial<Task>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
  };

  const toggleTaskStatus = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === id) {
          return {
            ...t,
            status: t.status === "Completed" ? "To Do" : "Completed",
          };
        }
        return t;
      })
    );
  };

  const deleteTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  // Comment Actions
  const addComment = (commentData: Omit<Comment, "id" | "timestamp" | "userId" | "userName">) => {
    const now = new Date();
    const formatted = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    const newComment: Comment = {
      ...commentData,
      id: `cm_${Date.now()}`,
      userId: currentUser.id,
      userName: currentUser.name,
      userAvatar: currentUser.avatar,
      timestamp: formatted,
      replies: [],
    };
    setComments((prev) => [newComment, ...prev]);
  };

  const deleteComment = (id: string) => {
    setComments((prev) => prev.filter((c) => c.id !== id));
  };

  const addCommentReply = (commentId: string, replyText: string) => {
    const now = new Date();
    const formatted = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    setComments((prev) =>
      prev.map((c) => {
        if (c.id === commentId) {
          const newReply = {
            id: `rep_${Date.now()}`,
            userName: currentUser.name,
            content: replyText,
            timestamp: formatted,
          };
          return {
            ...c,
            replies: [...(c.replies || []), newReply],
          };
        }
        return c;
      })
    );
  };

  // Email Marketing Actions
  const addEmailCampaign = (campaignData: Omit<EmailCampaign, "id" | "createdDate">): EmailCampaign => {
    const newId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `camp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const newCampaign: EmailCampaign = {
      ...campaignData,
      id: newId,
      createdDate: new Date().toISOString().split("T")[0],
    };
    setEmailCampaigns((prev) => [newCampaign, ...prev]);
    return newCampaign;
  };

  const updateEmailCampaign = (id: string, updates: Partial<EmailCampaign>) => {
    setEmailCampaigns((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  };

  const deleteEmailCampaign = (id: string) => {
    setEmailCampaigns((prev) => prev.filter((c) => c.id !== id));
  };

  // Inbox / reply-tracking: scans the workspace's own connected mailbox (via
  // IMAP, using whatever webmail credentials are on the active tenant) for
  // any reply from this campaign's audience, and records who has replied so
  // the Email Marketing view can stop sending them further follow-ups.
  const checkCampaignReplies = async (campaignId: string): Promise<void> => {
    const campaign = emailCampaigns.find((c) => c.id === campaignId);
    if (!campaign) return;

    const emailsByAudienceId = new Map<string, string>();
    campaign.audienceIds.forEach((id) => {
      const email = leads.find((l) => l.id === id)?.email;
      if (email && email.trim()) emailsByAudienceId.set(id, email.trim().toLowerCase());
    });

    const addresses = Array.from(new Set(emailsByAudienceId.values()));
    if (addresses.length === 0) {
      updateEmailCampaign(campaignId, { lastReplyCheckAt: new Date().toISOString() });
      return;
    }

    try {
      const webmail = getMailboxById(activeTenant, campaign.mailboxId);
      const res = await apiFetch("/api/webmail/check-replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: webmail?.email,
          password: webmail?.password,
          imapHost: webmail?.imapHost,
          imapPort: webmail?.imapPort,
          imapEncryption: webmail?.imapEncryption,
          addresses,
          sinceDate: campaign.createdDate,
        }),
      });
      const data = await res.json();
      const repliedSet = new Set<string>(data.repliedEmails || []);
      const newlyReplied = Array.from(emailsByAudienceId.entries())
        .filter(([, email]) => repliedSet.has(email))
        .map(([id]) => id);
      const mergedReplied = Array.from(new Set([...(campaign.repliedAudienceIds || []), ...newlyReplied]));

      updateEmailCampaign(campaignId, {
        repliedAudienceIds: mergedReplied,
        lastReplyCheckAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("[CRMContext] checkCampaignReplies failed:", err);
    }
  };

  // Products / Services -------------------------------------------------
  const addProduct = (productData: Omit<Product, "id" | "createdAt">): Product => {
    const newId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `prod_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const newProduct: Product = {
      ...productData,
      id: newId,
      createdAt: new Date().toISOString().split("T")[0],
      tags: productData.tags || [],
    };
    setProducts((prev) => [newProduct, ...prev]);
    return newProduct;
  };

  const updateProduct = (id: string, updates: Partial<Product>) => {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  };

  const deleteProduct = (id: string) => {
    setProducts((prev) => prev.filter((p) => p.id !== id));
  };

  const addKnowledgeBaseEntry = (
    entryData: Omit<KnowledgeBaseEntry, "id" | "createdAt" | "updatedAt" | "createdBy">
  ): KnowledgeBaseEntry => {
    const newId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `kb_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const now = new Date().toISOString();
    const newEntry: KnowledgeBaseEntry = {
      ...entryData,
      id: newId,
      tags: entryData.tags || [],
      createdBy: currentUser.name,
      createdAt: now,
      updatedAt: now,
    };
    setKnowledgeBase((prev) => [newEntry, ...prev]);
    return newEntry;
  };

  const updateKnowledgeBaseEntry = (id: string, updates: Partial<KnowledgeBaseEntry>) => {
    setKnowledgeBase((prev) =>
      prev.map((entry) =>
        entry.id === id ? { ...entry, ...updates, updatedAt: new Date().toISOString() } : entry
      )
    );
  };

  const deleteKnowledgeBaseEntry = (id: string) => {
    setKnowledgeBase((prev) => prev.filter((entry) => entry.id !== id));
  };

  const bulkDeleteKnowledgeBaseEntries = (ids: string[]) => {
    const idSet = new Set(ids);
    setKnowledgeBase((prev) => prev.filter((entry) => !idSet.has(entry.id)));
  };

  const bulkUpdateKnowledgeBaseCategory = (ids: string[], category: KnowledgeBaseCategory) => {
    const idSet = new Set(ids);
    const now = new Date().toISOString();
    setKnowledgeBase((prev) =>
      prev.map((entry) => (idSet.has(entry.id) ? { ...entry, category, updatedAt: now } : entry))
    );
  };

  // Industry Agents ---------------------------------------------------
  const addIndustryAgent = (
    agentData: Omit<IndustryAgent, "id" | "createdAt" | "updatedAt" | "createdBy">
  ): IndustryAgent => {
    const newId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `pbk_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const now = new Date().toISOString();
    const newAgent: IndustryAgent = {
      ...agentData,
      id: newId,
      talkingPoints: agentData.talkingPoints || [],
      painPoints: agentData.painPoints || [],
      autoRunEnabled: agentData.autoRunEnabled ?? false,
      maxDiscountPercent: agentData.maxDiscountPercent ?? 0,
      createdBy: currentUser.name,
      createdAt: now,
      updatedAt: now,
    };
    setIndustryAgents((prev) => [newAgent, ...prev]);
    return newAgent;
  };

  const updateIndustryAgent = (id: string, updates: Partial<IndustryAgent>) => {
    setIndustryAgents((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p))
    );
  };

  const deleteIndustryAgent = (id: string) => {
    setIndustryAgents((prev) => prev.filter((p) => p.id !== id));
  };

  const bulkSetIndustryAgentActive = (ids: string[], isActive: boolean) => {
    const idSet = new Set(ids);
    const now = new Date().toISOString();
    setIndustryAgents((prev) =>
      prev.map((p) => (idSet.has(p.id) ? { ...p, isActive, updatedAt: now } : p))
    );
  };

  const bulkDeleteIndustryAgents = (ids: string[]) => {
    const idSet = new Set(ids);
    setIndustryAgents((prev) => prev.filter((p) => !idSet.has(p.id)));
  };

  // Case-insensitive exact match on the industry name -- inactive agents
  // are skipped so toggling one off actually stops it from being applied.
  const getAgentForIndustry = (industry: string | undefined): IndustryAgent | undefined => {
    if (!industry) return undefined;
    const normalized = normalizeIndustry(industry);
    if (!normalized) return undefined;
    return industryAgents.find((p) => p.isActive && normalizeIndustry(p.industry) === normalized);
  };

  // Agent Approvals ------------------------------------------------------
  // Every autonomous or negotiation action lands here first -- nothing is
  // ever sent to a prospect without an explicit approve/edit-and-send from
  // this queue (see approveAndSendAgentAction below).
  const addAgentAction = (
    actionData: Omit<AgentAction, "id" | "createdAt" | "status">
  ): AgentAction => {
    const newId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `agt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const newAction: AgentAction = {
      ...actionData,
      id: newId,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    setAgentActions((prev) => [newAction, ...prev]);
    return newAction;
  };

  // Instant follow-up -- drafts a follow-up for one specific lead right now,
  // bypassing this agent's normal follow-up cadence (which otherwise only
  // proposes a follow-up once followUpFrequencyDays have passed since last
  // contact -- see the dueLeads filter in the automatic scan above). Still
  // lands in the normal Agent Approvals queue like every other AI-drafted
  // action: instant means "drafted now," never "sent without approval."
  const draftInstantFollowUp = async (leadId: string): Promise<boolean> => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || !lead.email) return false;
    if (lead.operatorInControl) return false; // Take Charge: operator handles this lead
    const agent = getAgentForIndustry(lead.industry);
    if (!agent) return false;
    const agentProduct = agent.productId ? products.find((p) => p.id === agent.productId) : undefined;
    try {
      const res = await apiFetch("/api/ai/personalized-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientName: lead.name,
          recipientCompany: lead.company,
          recipientJobTitle: lead.jobTitle,
          recipientIndustry: lead.industry,
          activities: activities.filter((a) => a.leadId === lead.id),
          agent,
          productName: agentProduct?.name,
          productPitch: agentProduct?.pitch,
          senderName: currentUser?.name,
          senderCompany: activeTenant?.companyName || activeTenant?.name,
          goal: "Send a follow-up right now -- the user asked for this instantly rather than waiting for the agent's normal cadence.",
          ...buildAgentDirectiveFields(agent, agentProduct),
        }),
      });
      const data = await res.json();
      if (!data.subject || !data.body) return false;
      if (hasAgentDirectives(agent)) {
        updateIndustryAgent(agent.id, { nextEmailIncludePricing: false, nextEmailExtraProblems: false });
      }
      addAgentAction({
        industry: agent.industry,
        actionType: "follow_up",
        leadId: lead.id,
        recipientName: lead.name,
        recipientEmail: lead.email,
        subject: data.subject,
        body: data.body,
        reasoning: "Instant follow-up requested manually -- not the agent's normal cadence.",
        triggerSource: "manual",
      });
      return true;
    } catch (err) {
      console.error("[instant follow-up] draft failed for lead", leadId, err);
      return false;
    }
  };

  const resolveAgentAction = (id: string, status: AgentActionStatus, updates?: Partial<AgentAction>) => {
    setAgentActions((prev) =>
      prev.map((a) =>
        a.id === id
          ? {
              ...a,
              ...updates,
              status,
              resolvedAt: new Date().toISOString(),
              resolvedBy: currentUser?.name,
            }
          : a
      )
    );
  };

  const deleteAgentAction = (id: string) => {
    setAgentActions((prev) => prev.filter((a) => a.id !== id));
  };

  // Pure status flip, no side effects -- safe for bulk use (e.g. bulk
  // reject). Never use this for "approved": approving has to actually send
  // via approveAndSendAgentAction, one call per item (see AgentApprovalsView).
  const bulkResolveAgentActions = (ids: string[], status: AgentActionStatus) => {
    const idSet = new Set(ids);
    const now = new Date().toISOString();
    setAgentActions((prev) =>
      prev.map((a) =>
        idSet.has(a.id)
          ? { ...a, status, resolvedAt: now, resolvedBy: currentUser?.name }
          : a
      )
    );
  };

  // The one path that actually sends anything to a prospect from the Agent
  // Approvals queue -- reuses the same webmail send endpoint the manual
  // compose modal uses, then logs it to the record's activity timeline and
  // marks the queued item approved. overrides lets the user edit the
  // subject/body right before sending without a separate round-trip.
  const approveAndSendAgentAction = async (
    id: string,
    overrides?: { subject?: string; body?: string }
  ): Promise<boolean> => {
    const action = agentActions.find((a) => a.id === id);
    if (!action) return false;
    const mailCfg = getMailboxById(activeTenant);
    const subject = overrides?.subject ?? action.subject;
    const body = overrides?.body ?? action.body;
    try {
      const res = await apiFetch("/api/webmail/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: mailCfg?.email || currentUser?.email || "",
          displayName: mailCfg?.displayName || currentUser?.name || activeTenant?.name,
          password: mailCfg?.password || "",
          smtpHost: mailCfg?.smtpHost || "smtp.hostinger.com",
          smtpPort: mailCfg?.smtpPort || 465,
          smtpEncryption: mailCfg?.smtpEncryption || "SSL",
          to: (action.recipientEmail || "").trim(),
          subject,
          body,
          attachments: [],
        }),
      });
      const data = await res.json();
      if (!data.success) {
        resolveAgentAction(id, "pending", { reasoning: `${action.reasoning} — last send attempt failed: ${data.error || "unknown error"}` });
        return false;
      }
      // success:true alone isn't delivery. The endpoint also answers
      // success:true in simulation mode (no SMTP password on file), where
      // nothing is actually relayed. Marking those approved is how a queue
      // ends up full of "sent" messages that no one ever received, so treat
      // a simulated send as a failure the user has to act on.
      if (data.simulated || data.liveMode === false) {
        resolveAgentAction(id, "pending", {
          reasoning: `${action.reasoning} — not sent: this workspace has no SMTP password saved, so the message was only simulated. Add it in Settings → Webmail.`,
        });
        return false;
      }
      addActivity({
        type: "Email",
        leadId: action.leadId,
        date: new Date().toISOString().split("T")[0],
        time: new Date().toTimeString().slice(0, 5),
        user: currentUser?.name || "Agent (approved)",
        description: `${action.actionType === "negotiation_offer" ? "Sent negotiation offer" : action.actionType === "email_reply" ? "Replied" : "Sent follow-up"} "${subject}" to ${action.recipientEmail}`,
        outcome: "Delivered",
        nextAction: "Monitor for response",
      });
      resolveAgentAction(id, "approved", { subject, body });
      return true;
    } catch (err: any) {
      resolveAgentAction(id, "pending", { reasoning: `${action.reasoning} — last send attempt failed: ${err.message || "network error"}` });
      return false;
    }
  };

  // Take Charge helpers. Unsent AI drafts for a lead the operator takes over
  // are withdrawn (marked rejected) so nothing the AI wrote can still go out.
  const withdrawPendingDraftsForLeads = (leadIds: string[]): number => {
    const ids = new Set(leadIds);
    const emails = new Set(leads.filter((l) => ids.has(l.id) && l.email).map((l) => l.email.toLowerCase()));
    let count = 0;
    setAgentActions((prev) =>
      prev.map((a) => {
        const mine = a.status === "pending" && ((a.leadId && ids.has(a.leadId)) || emails.has(a.recipientEmail.toLowerCase()));
        if (!mine) return a;
        count += 1;
        return { ...a, status: "rejected" as const, resolvedAt: new Date().toISOString(), resolvedBy: "Take Charge — operator took over" };
      })
    );
    return count;
  };

  const setLeadOperatorControl = (leadId: string, inControl: boolean) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    updateLead(leadId, { operatorInControl: inControl });
    if (inControl) withdrawPendingDraftsForLeads([leadId]);
    addActivity({
      type: "Note",
      leadId,
      date: new Date().toISOString().split("T")[0],
      time: new Date().toTimeString().slice(0, 5),
      user: currentUser?.name || "Operator",
      description: inControl
        ? `${currentUser?.name || "Operator"} took charge of ${lead.name} — AI agents will only notify, not draft or send.`
        : `${currentUser?.name || "Operator"} handed ${lead.name} back to the AI agent.`,
      outcome: inControl ? "Operator in control" : "AI agent active",
      nextAction: inControl ? "Reply to this lead personally" : "",
    });
  };

  const setAgentOperatorControl = (agentId: string, inControl: boolean): { changed: number; withdrawn: number } => {
    const agent = industryAgents.find((a) => a.id === agentId);
    if (!agent) return { changed: 0, withdrawn: 0 };
    const industryLc = normalizeIndustry(agent.industry);
    const targets = leads.filter((l) => normalizeIndustry(l.industry) === industryLc && !!l.operatorInControl !== inControl);
    if (targets.length === 0) return { changed: 0, withdrawn: 0 };
    const ids = new Set(targets.map((l) => l.id));
    setLeads((prev) => prev.map((l) => (ids.has(l.id) ? { ...l, operatorInControl: inControl } : l)));
    const withdrawn = inControl ? withdrawPendingDraftsForLeads(targets.map((l) => l.id)) : 0;
    addActivity({
      type: "Note",
      date: new Date().toISOString().split("T")[0],
      time: new Date().toTimeString().slice(0, 5),
      user: currentUser?.name || "Operator",
      description: inControl
        ? `${currentUser?.name || "Operator"} took charge of all ${targets.length} ${agent.industry} leads — the agent will only notify.`
        : `${currentUser?.name || "Operator"} handed ${targets.length} ${agent.industry} leads back to the agent.`,
      outcome: inControl ? "Operator in control" : "AI agent active",
      nextAction: "",
    });
    return { changed: targets.length, withdrawn };
  };

  // Arms/disarms the one-shot switches on an agent (see IndustryAgent).
  const setAgentNextEmailDirective = (
    agentId: string,
    patch: { includePricing?: boolean; extraProblems?: boolean }
  ) => {
    const updates: Partial<IndustryAgent> = {};
    if (patch.includePricing !== undefined) updates.nextEmailIncludePricing = patch.includePricing;
    if (patch.extraProblems !== undefined) updates.nextEmailExtraProblems = patch.extraProblems;
    updateIndustryAgent(agentId, updates);
  };

  // "Create a follow-up email now" -- drafts a follow-up for each eligible
  // lead of ONE agent immediately, ignoring the agent's normal cadence. Each
  // draft goes to the approval queue like any other; nothing is sent. Leads
  // that already have a pending follow-up are skipped, and a single click
  // drafts at most MAX_PER_CLICK (each one is a real AI call), reporting how
  // many eligible leads are left so a second click can pick them up.
  const draftAgentFollowUpsNow = async (
    agentId: string
  ): Promise<{ drafted: number; remaining: number; reason?: string }> => {
    const MAX_PER_CLICK = 10;
    const agent = industryAgents.find((a) => a.id === agentId);
    if (!agent) return { drafted: 0, remaining: 0, reason: "That agent no longer exists." };
    if (!agent.isActive) return { drafted: 0, remaining: 0, reason: "Activate this agent first." };
    const industryLc = normalizeIndustry(agent.industry);
    const agentProduct = agent.productId ? products.find((p) => p.id === agent.productId) : undefined;

    const eligible = leads.filter((l) => {
      if (normalizeIndustry(l.industry) !== industryLc) return false;
      if ((agent.excludedLeadIds || []).includes(l.id)) return false;
      if (l.operatorInControl) return false; // Take Charge: operator handles this lead
      if (!l.email) return false;
      if (l.status === "Converted" || l.status === "Lost") return false;
      return !agentActions.some(
        (a) =>
          a.status === "pending" &&
          a.actionType === "follow_up" &&
          a.recipientEmail.toLowerCase() === l.email.toLowerCase()
      );
    });
    if (eligible.length === 0) {
      return { drafted: 0, remaining: 0, reason: "No leads are waiting for a follow-up (everyone eligible already has a draft, or none match)." };
    }

    const batch = eligible.slice(0, MAX_PER_CLICK);
    const directiveFields = buildAgentDirectiveFields(agent, agentProduct);
    let drafted = 0;
    for (const lead of batch) {
      try {
        const res = await apiFetch("/api/ai/personalized-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipientName: lead.name,
            recipientCompany: lead.company,
            recipientJobTitle: lead.jobTitle,
            recipientIndustry: lead.industry,
            activities: activities.filter((a) => a.leadId === lead.id),
            agent,
            productName: agentProduct?.name,
            productPitch: agentProduct?.pitch,
            senderName: currentUser?.name,
            senderCompany: activeTenant?.companyName || activeTenant?.name,
            goal: "Send a follow-up right now -- the user asked for this instantly rather than waiting for the agent's normal cadence.",
            ...directiveFields,
          }),
        });
        const data = await res.json();
        if (!data.subject || !data.body) continue;
        addAgentAction({
          industry: agent.industry,
          actionType: "follow_up",
          leadId: lead.id,
          recipientName: lead.name,
          recipientEmail: lead.email,
          subject: data.subject,
          body: data.body,
          reasoning: "Instant follow-up requested manually from the agent card -- not the agent's normal cadence.",
          triggerSource: "manual",
        });
        drafted += 1;
      } catch (err) {
        console.error("[instant follow-ups] draft failed for lead", lead.id, err);
      }
    }
    if (drafted > 0 && hasAgentDirectives(agent)) {
      updateIndustryAgent(agent.id, { nextEmailIncludePricing: false, nextEmailExtraProblems: false });
    }
    return { drafted, remaining: Math.max(0, eligible.length - batch.length) };
  };

  // "Send email now" -- sends every draft waiting in one agent's approval
  // queue right now. Goes through approveAndSendAgentAction for each item
  // (same live-SMTP send, same activity log, same "approved only if it truly
  // went out" guarantee), one at a time so a failure on one never blocks the
  // rest and the mailbox isn't hit with a burst of parallel connections.
  const sendAgentDraftsNow = async (agentId: string): Promise<{ total: number; sent: number; failed: number }> => {
    const agent = industryAgents.find((a) => a.id === agentId);
    if (!agent) return { total: 0, sent: 0, failed: 0 };
    const industryLc = normalizeIndustry(agent.industry);
    const waiting = agentActions.filter((a) => a.status === "pending" && normalizeIndustry(a.industry) === industryLc);
    let sent = 0;
    let failed = 0;
    for (const action of waiting) {
      const ok = await approveAndSendAgentAction(action.id);
      if (ok) sent += 1;
      else failed += 1;
    }
    return { total: waiting.length, sent, failed };
  };

  // File Manager ----------------------------------------------------------
  // storageUsedBytes is derived from the live storedFiles list, never a
  // separately-tracked counter, so it can never drift out of sync with what
  // the list actually shows -- the server independently re-sums the same
  // way (against the database, not this client state) before enforcing the
  // quota on every upload, so a stale/tampered client value here can never
  // let an upload through that shouldn't be.
  const storageUsedBytes = storedFiles.reduce((sum, f) => sum + (f.size || 0), 0);
  const storageLimitBytes = STORAGE_LIMITS_BYTES[activeTenant?.plan || "Growth"] ?? STORAGE_LIMITS_BYTES.Growth;

  const addStoredFile = (data: Omit<StoredFile, "id" | "createdAt">): StoredFile => {
    const newId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `file_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const newFile: StoredFile = { ...data, id: newId, createdAt: new Date().toISOString() };
    setStoredFiles((prev) => [newFile, ...prev]);
    return newFile;
  };

  // Reads the file, uploads it to the tenant's Storage bucket (the server
  // enforces the plan's quota there -- see /api/storage/upload -- and
  // throws with a clear message if it would be exceeded), then records the
  // metadata via the normal synced CRUD path above.
  const uploadStoredFile = async (
    file: File,
    opts: {
      source: StoredFileSource;
      linkedLeadId?: string;
      linkedDealId?: string;
    }
  ): Promise<StoredFile> => {
    const dataUrl: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Couldn't read that file."));
      reader.readAsDataURL(file);
    });

    const res = await apiFetch("/api/storage/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantId: activeTenantId,
        plan: activeTenant?.plan || "Growth",
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        dataUrl,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error || "Upload failed.");
    }

    return addStoredFile({
      filename: data.filename || file.name,
      contentType: data.contentType || file.type || "application/octet-stream",
      size: data.size ?? file.size,
      storagePath: data.storagePath,
      source: opts.source,
      linkedLeadId: opts.linkedLeadId,
      linkedDealId: opts.linkedDealId,
      uploadedBy: currentUser?.name || "Unknown",
    });
  };

  const deleteStoredFile = async (id: string): Promise<void> => {
    const target = storedFiles.find((f) => f.id === id);
    if (!target) return;
    try {
      await apiFetch("/api/storage/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath: target.storagePath }),
      });
    } catch (err) {
      console.error("[deleteStoredFile] bucket delete failed:", err);
      // Still remove the metadata row -- an orphaned bucket object is far
      // less harmful than a file the user can no longer see or manage.
    }
    setStoredFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const getStoredFileUrl = async (id: string): Promise<string | null> => {
    const target = storedFiles.find((f) => f.id === id);
    if (!target) return null;
    try {
      const res = await apiFetch("/api/storage/signed-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath: target.storagePath }),
      });
      const data = await res.json();
      return data.url || null;
    } catch (err) {
      console.error("[getStoredFileUrl] failed:", err);
      return null;
    }
  };

  // AI-assisted setup: turns a plain-language description into a structured
  // draft the user reviews and edits before saving -- this never saves a
  // product on its own, it only returns fields for the create/edit form to
  // prefill. Falls back to a sensible heuristic draft if the AI call fails,
  // so "set up by AI" never just breaks.
  const generateProductDraft = async (rawDescription: string): Promise<Partial<Product>> => {
    const existingIndustries = Array.from(
      new Set(leads.map((l) => l.industry).filter(Boolean))
    );
    try {
      const res = await apiFetch("/api/ai/product-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawDescription, existingIndustries }),
      });
      const data = await res.json();
      return {
        name: data.name || "",
        type: data.type || "Other",
        pricingModel: data.pricingModel || "Custom Quote",
        price: typeof data.price === "number" ? data.price : 0,
        currency: data.currency || activeTenant?.currency || "USD",
        description: data.description || rawDescription,
        pitch: data.pitch || "",
        tags: data.tags || [],
        targetCriteria: {
          industries: data.targetCriteria?.industries || [],
          clientCategories: data.targetCriteria?.clientCategories || [],
          companyStatuses: data.targetCriteria?.companyStatuses || [],
          countries: data.targetCriteria?.countries || [],
          tags: data.targetCriteria?.tags || [],
          leadSources: data.targetCriteria?.leadSources || [],
          idealCustomerNotes: data.targetCriteria?.idealCustomerNotes || "",
        },
        aiInsight: data.aiInsight
          ? {
              suggestedTargetSummary: data.aiInsight.suggestedTargetSummary || "",
              suggestedIndustries: data.aiInsight.suggestedIndustries || [],
              suggestedTags: data.aiInsight.suggestedTags || [],
              pitchAngles: data.aiInsight.pitchAngles || [],
              objectionHandling: data.aiInsight.objectionHandling || [],
              generatedAt: new Date().toISOString(),
              source: data.source === "gemini" ? "gemini" : "heuristic",
            }
          : undefined,
      };
    } catch (err) {
      console.error("[CRMContext] generateProductDraft failed:", err);
      return { description: rawDescription };
    }
  };

  // Fetches a public webpage server-side and asks the AI to turn it into a
  // single Knowledge Base entry draft -- framed differently per category
  // (see the endpoint's own comment). Never saves anything itself; throws
  // with a user-facing message on failure so the entry editor can show
  // exactly why (site unreachable, blocked, no readable text, etc.) instead
  // of silently doing nothing.
  const generateKnowledgeBaseDraftFromUrl = async (
    url: string,
    category: KnowledgeBaseCategory
  ): Promise<{ title: string; content: string; tags: string[]; sourceUrl: string }> => {
    const res = await apiFetch("/api/ai/knowledge-base-from-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, category }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Couldn't generate a knowledge base entry from that URL.");
    }
    return {
      title: data.title || "",
      content: data.content || "",
      tags: Array.isArray(data.tags) ? data.tags : [],
      sourceUrl: data.sourceUrl || url,
    };
  };

  // Re-runs (or runs for the first time) the AI targeting/positioning
  // insight for an already-saved product -- used when the user tweaks a
  // product's description/criteria and wants fresh pitch angles without
  // rebuilding the whole record.
  const runProductAIInsight = async (productId: string): Promise<void> => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    try {
      const res = await apiFetch("/api/ai/product-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawDescription: `${product.name}: ${product.description}`,
          existingProduct: product,
        }),
      });
      const data = await res.json();
      const insight: ProductAIInsight = {
        suggestedTargetSummary: data.aiInsight?.suggestedTargetSummary || "",
        suggestedIndustries: data.aiInsight?.suggestedIndustries || [],
        suggestedTags: data.aiInsight?.suggestedTags || [],
        pitchAngles: data.aiInsight?.pitchAngles || [],
        objectionHandling: data.aiInsight?.objectionHandling || [],
        generatedAt: new Date().toISOString(),
        source: data.source === "gemini" ? "gemini" : "heuristic",
      };
      updateProduct(productId, { aiInsight: insight });
    } catch (err) {
      console.error("[CRMContext] runProductAIInsight failed:", err);
    }
  };

  const clearAllData = () => {
    setLeads([]);
    setDeals([]);
    setInvoices([]);
    setPayments([]);
    setActivities([]);
    setTasks([]);
    setComments([]);
    setEmailCampaigns([]);
  };

  // RBAC Permission Evaluator
  const canPerform = (permission: keyof UserPermissions): boolean => {
    if (!currentUser) return false;
    // Explicit user-level permission override if configured
    if (currentUser.permissions && currentUser.permissions[permission] !== undefined) {
      return !!currentUser.permissions[permission];
    }
    const roleKey = (currentUser.role || "viewer") as UserRole;
    const basePermissions = ROLE_PERMISSIONS[roleKey] || ROLE_PERMISSIONS.viewer;
    return !!basePermissions[permission];
  };

  // Dynamic Role & Permission Update. `role` accepts a plain UserRole or the
  // literal string "custom" for a selective, checkbox-built permission set
  // that doesn't map to any preset role.
  const updateUserRole = (userId: string, role: UserRole | string, customPermissions?: Partial<UserPermissions>) => {
    const roleInfo = ROLE_LABELS[role as UserRole] || { title: role === "custom" ? "Custom Role" : role };
    setUsers((prev) =>
      prev.map((u) => {
        if (u.id === userId) {
          const updated: User = {
            ...u,
            role,
            roleTitle: roleInfo.title,
            permissions: customPermissions !== undefined ? customPermissions : u.permissions,
          };
          if (currentUser.id === userId) {
            setCurrentUser(updated);
          }
          return updated;
        }
        return u;
      })
    );
  };

  const addUser = (newUser: User) => {
    setUsers((prev) => [newUser, ...prev]);
  };

  // Real sign-out: ends the Supabase session. The session-bootstrap effect's
  // onAuthStateChange listener picks up the SIGNED_OUT event and clears
  // tenants/users/currentUser and reopens AuthPage — no local-only identity
  // switching happens here anymore.
  //
  // Flushes any still-pending (debounced, not-yet-fired) table/tenant syncs
  // FIRST and waits for them to land -- otherwise a change made moments
  // earlier (e.g. "Sync All to Companies/Contacts" followed right away by
  // "Sign out") races auth.signOut() invalidating the session token: the
  // debounced write fires after the session is gone, RLS silently rejects
  // it, and that data is never actually saved even though it looked correct
  // in the browser right up until sign-out.
  const signOut = () => {
    if (isSupabaseAuthConfigured()) {
      void flushAllPendingSyncs().finally(() => {
        void getSupabaseAuthClient().auth.signOut();
      });
    } else {
      setCurrentUser(SIGNED_OUT_USER);
      setTenants([]);
      setActiveTenantId("");
      setUsers([]);
      setAuthPageOpen(true);
    }
  };

  // Bulk Lead Import from Spreadsheet / Excel / Google Sheets
  const importLeadsFromSpreadsheet = (
    importedLeads: Array<Omit<Lead, "id" | "createdDate">>
  ): number => {
    const newRecords: Lead[] = importedLeads.map((item, idx) => ({
      ...item,
      id: `lead_imp_${Date.now()}_${idx}`,
      createdDate: new Date().toISOString().split("T")[0],
      salesperson: item.salesperson || currentUser.name,
    }));

    setLeads((prev) => [...newRecords, ...prev]);

    // Record system audit activity
    addActivity({
      type: "Note",
      description: `Bulk imported ${newRecords.length} leads from spreadsheet by ${currentUser.name}`,
      date: new Date().toISOString().split("T")[0],
      time: new Date().toTimeString().slice(0, 5),
      user: currentUser.name,
      outcome: `Imported ${newRecords.length} records successfully`,
      nextAction: "Assign leads to sales representatives",
    });

    return newRecords.length;
  };

  return (
    <CRMContext.Provider
      value={{
        activeNav,
        setActiveNav,
        settingsDeepLinkTab,
        setSettingsDeepLinkTab,
        selectedDealId,
        setSelectedDealId,
        selectedLeadId,
        setSelectedLeadId,
        convertingLeadId,
        setConvertingLeadId,
        dateRange,
        setDateRange,
        currentUser,
        setCurrentUser,
        users,
        updateUserRole,
        addUser,
        canPerform,
        signOut,
        isAuthPageOpen,
        setAuthPageOpen,
        isBootstrapping,
        authPageMode,
        setAuthPageMode,
        isAccessControlOpen,
        setAccessControlOpen,
        isMobileSidebarOpen,
        setMobileSidebarOpen,
        importLeadsFromSpreadsheet,

        tenants,
        activeTenantId,
        activeTenant,
        switchTenant,
        createTenant,
        loadSampleData,
        updateTenant,
        deleteTenant,
        isCreateTenantModalOpen,
        setCreateTenantModalOpen,

        settings,
        updateSettings,
        updateStripeConfig,
        addWebmailConfig,
        updateWebmailConfig,
        deleteWebmailConfig,
        setDefaultWebmailConfig,
        updateWhatsAppConfig,
        updateSupabaseConfig,
        addAuditLogEntry,

        isEmailComposeOpen,
        setEmailComposeOpen,
        emailComposeProps,
        openEmailComposer,

        isWhatsAppComposeOpen,
        setWhatsAppComposeOpen,
        whatsappComposeProps,
        openWhatsAppComposer,

        leads,
        deals,
        pipelines,
        invoices,
        payments,
        activities,
        tasks,
        comments,
        emailCampaigns,
        products,

        addLead,
        updateLead,
        deleteLead,
        moveLeadStatus,
        convertLead,
        bulkDeleteLeads,
        bulkUpdateLeadStatus,

        addDeal,
        updateDeal,
        deleteDeal,
        moveDealStage,

        addPipeline,
        updatePipeline,
        deletePipeline,

        addInvoice,
        updateInvoice,
        deleteInvoice,
        duplicateInvoice,
        markInvoicePaid,

        addPayment,
        deletePayment,

        addActivity,
        deleteActivity,

        addTask,
        updateTask,
        toggleTaskStatus,
        deleteTask,

        addComment,
        deleteComment,
        addCommentReply,

        addEmailCampaign,
        updateEmailCampaign,
        deleteEmailCampaign,
        checkCampaignReplies,

        addProduct,
        updateProduct,
        deleteProduct,
        generateProductDraft,
        runProductAIInsight,

        knowledgeBase,
        addKnowledgeBaseEntry,
        updateKnowledgeBaseEntry,
        deleteKnowledgeBaseEntry,
        bulkDeleteKnowledgeBaseEntries,
        bulkUpdateKnowledgeBaseCategory,
        generateKnowledgeBaseDraftFromUrl,

        industryAgents,
        addIndustryAgent,
        updateIndustryAgent,
        deleteIndustryAgent,
        bulkSetIndustryAgentActive,
        bulkDeleteIndustryAgents,
        getAgentForIndustry,
        lastAgentScanAt,
        isAgentScanRunning,
        runAgentScanNow,

        agentActions,
        addAgentAction,
        draftInstantFollowUp,
        draftAgentFollowUpsNow,
        sendAgentDraftsNow,
        setAgentNextEmailDirective,
        setLeadOperatorControl,
        setAgentOperatorControl,
        resolveAgentAction,
        deleteAgentAction,
        approveAndSendAgentAction,
        bulkResolveAgentActions,

        storedFiles,
        storageUsedBytes,
        storageLimitBytes,
        uploadStoredFile,
        deleteStoredFile,
        getStoredFileUrl,
        pendingBulkImport,
        setPendingBulkImport,

        clearAllData,

        isQuickCreateOpen,
        setQuickCreateOpen,
        quickCreateType,
        setQuickCreateType,
      }}
    >
      {children}
    </CRMContext.Provider>
  );
};

export const useCRM = () => {
  const context = useContext(CRMContext);
  if (!context) {
    throw new Error("useCRM must be used within a CRMProvider");
  }
  return context;
};
