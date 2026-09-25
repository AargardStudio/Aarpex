import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from "react";
import {
  Company,
  Contact,
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
  CallLogEntry,
  CompanyAIAnalysis,
  Product,
  ProductAIInsight,
  KnowledgeBaseEntry,
  KnowledgeBaseCategory,
} from "../types";
import { isSupabaseAuthConfigured, getSupabaseAuthClient } from "../config/supabaseAuthClient";
import { getMailboxById } from "../lib/webmail";
import {
  syncTenantTable,
  syncTenantRow,
  fetchTenantTable,
  createTenantWithOwner,
  fetchMyTenantsFull,
  savePendingTenantCreation,
  clearPendingTenantCreation,
  hasPendingTenantCreations,
  flushPendingTenantCreations,
  flushAllPendingSyncs,
  onSyncFailure,
} from "../lib/tenantDataSync";
import {
  initialCompanies,
  initialContacts,
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
  | "Contacts"
  | "Companies"
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
  | "Knowledge Base";

interface CRMContextType {
  // Navigation & Active selection
  activeNav: NavView;
  setActiveNav: (nav: NavView) => void;
  // Lets any view (e.g. a header "Billing" shortcut) jump straight into a
  // specific Settings tab — read once by SettingsView and cleared.
  settingsDeepLinkTab: string | null;
  setSettingsDeepLinkTab: (tab: string | null) => void;
  selectedCompanyId: string | null;
  setSelectedCompanyId: (id: string | null) => void;
  selectedDealId: string | null;
  setSelectedDealId: (id: string | null) => void;
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
  deleteTenant: (tenantId: string) => void;
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
    companyId?: string;
    contactId?: string;
    dealId?: string;
    leadId?: string;
  };
  openEmailComposer: (props?: {
    to?: string;
    subject?: string;
    body?: string;
    attachments?: EmailAttachment[];
    companyId?: string;
    contactId?: string;
    dealId?: string;
    leadId?: string;
  }) => void;

  // WhatsApp Composer (send-to-lead/contact/company, mirrors Email Composer)
  isWhatsAppComposeOpen: boolean;
  setWhatsAppComposeOpen: (open: boolean) => void;
  whatsappComposeProps: {
    to?: string;
    body?: string;
    companyId?: string;
    contactId?: string;
    leadId?: string;
  };
  openWhatsAppComposer: (props?: {
    to?: string;
    body?: string;
    companyId?: string;
    contactId?: string;
    leadId?: string;
  }) => void;

  // Entities
  companies: Company[];
  contacts: Contact[];
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
  addCompany: (company: Omit<Company, "id" | "createdAt">) => Company;
  updateCompany: (id: string, updates: Partial<Company>) => void;
  deleteCompany: (id: string) => void;

  addContact: (contact: Omit<Contact, "id" | "createdAt">) => Contact;
  updateContact: (id: string, updates: Partial<Contact>) => void;
  deleteContact: (id: string) => void;

  addLead: (lead: Omit<Lead, "id" | "createdDate">) => Lead;
  updateLead: (id: string, updates: Partial<Lead>) => void;
  deleteLead: (id: string) => void;
  moveLeadStatus: (leadId: string, newStatus: Lead["status"]) => void;
  convertLead: (leadId: string, createDeal: boolean) => { company: Company; contact: Contact; deal?: Deal };

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
  generateKnowledgeBaseDraftFromUrl: (
    url: string,
    category: KnowledgeBaseCategory
  ) => Promise<{ title: string; content: string; tags: string[]; sourceUrl: string }>;

  // Business Profile: AI analysis + manual call log riding on a Company record.
  runCompanyAIAnalysis: (companyId: string) => Promise<void>;
  addCallLogEntry: (companyId: string, entry: Omit<CallLogEntry, "id" | "createdAt" | "loggedBy">) => void;
  deleteCallLogEntry: (companyId: string, entryId: string) => void;
  syncAllLeadsToCompaniesAndContacts: () => { companiesCreated: number; contactsCreated: number; companiesLinked: number };

  clearAllData: () => void;

  // Quick modals
  isQuickCreateOpen: boolean;
  setQuickCreateOpen: (open: boolean) => void;
  quickCreateType: "lead" | "contact" | "company" | "deal" | "invoice" | "payment" | "activity" | "task";
  setQuickCreateType: (type: "lead" | "contact" | "company" | "deal" | "invoice" | "payment" | "activity" | "task") => void;
}

const CRMContext = createContext<CRMContextType | undefined>(undefined);

const STORAGE_KEYS = {
  COMPANIES: "crm_companies_v1",
  CONTACTS: "crm_contacts_v1",
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
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateFilterRange>("This Year");
  const [isQuickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateType, setQuickCreateType] = useState<"lead" | "contact" | "company" | "deal" | "invoice" | "payment" | "activity" | "task">("deal");

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
    companyId?: string;
    contactId?: string;
    dealId?: string;
    leadId?: string;
  }>({});

  const openEmailComposer = (props?: {
    to?: string;
    subject?: string;
    body?: string;
    attachments?: EmailAttachment[];
    companyId?: string;
    contactId?: string;
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
    companyId?: string;
    contactId?: string;
    leadId?: string;
  }>({});

  const openWhatsAppComposer = (props?: {
    to?: string;
    body?: string;
    companyId?: string;
    contactId?: string;
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
  const [rawCompanies, setRawCompanies] = useState<Company[]>(() =>
    loadTenantEntity("companies", initialCompanies)
  );

  const [contacts, setContacts] = useState<Contact[]>(() =>
    loadTenantEntity("contacts", initialContacts)
  );

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
    localStorage.setItem(`crm_tenant_${activeTenantId}_companies`, JSON.stringify(rawCompanies));
    if (shouldSyncToSupabase) syncTenantTable("companies", activeTenantId, rawCompanies);
  }, [rawCompanies, activeTenantId]);

  useEffect(() => {
    localStorage.setItem(`crm_tenant_${activeTenantId}_contacts`, JSON.stringify(contacts));
    if (shouldSyncToSupabase) syncTenantTable("contacts", activeTenantId, contacts);
  }, [contacts, activeTenantId]);

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
        companiesRes,
        contactsRes,
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
      ] = await Promise.all([
        fetchTenantTable<Company>("companies", activeTenantId),
        fetchTenantTable<Contact>("contacts", activeTenantId),
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
      ]);
      if (cancelled) return;
      if (companiesRes) setRawCompanies(companiesRes);
      if (contactsRes) setContacts(contactsRes);
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
    localStorage.setItem(`crm_tenant_${activeTenantId}_companies`, JSON.stringify(rawCompanies));
    localStorage.setItem(`crm_tenant_${activeTenantId}_contacts`, JSON.stringify(contacts));
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
    setRawCompanies(loadTarget("companies", initialCompanies));
    setContacts(loadTarget("contacts", initialContacts));
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
    setSelectedCompanyId(null);
    setSelectedDealId(null);
  };

  // Opt-in action for a real (empty) workspace that wants to explore the
  // product with the built-in sample dataset instead of starting blank.
  const loadSampleData = () => {
    setRawCompanies(initialCompanies);
    setContacts(initialContacts);
    setLeads(initialLeads);
    setDeals(initialDeals);
    setPipelines(initialPipelines);
    setInvoices(initialInvoices);
    setPayments(initialPayments);
    setActivities(initialActivities);
    setTasks(initialTasks);
    setComments(initialComments);
    addAuditLogEntry("Loaded sample data", "Populated this workspace with demo companies, deals, and invoices for exploration.", "general");
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

  const deleteTenant = (tenantId: string) => {
    if (tenants.length <= 1) return;
    const remaining = tenants.filter((t) => t.id !== tenantId);
    setTenants(remaining);
    if (activeTenantId === tenantId) {
      switchTenant(remaining[0].id);
    }
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

  // Derived Company calculations based on live financial and deal records
  const companies: Company[] = useMemo(() => {
    const now = new Date();
    return rawCompanies.map((c) => {
      const companyDeals = deals.filter((d) => d.companyId === c.id);
      const companyInvoices = invoices.filter((i) => i.companyId === c.id);
      const companyPayments = payments.filter((p) => p.companyId === c.id);
      const companyActivities = activities.filter((a) => a.companyId === c.id);

      const wonDeals = companyDeals.filter((d) => d.status === "Won");
      const openDeals = companyDeals.filter((d) => d.status === "Open");
      const lostDeals = companyDeals.filter((d) => d.status === "Lost");

      const totalInvoiced = companyInvoices.reduce((acc, inv) => acc + (inv.total || 0), 0);
      const totalPaid = companyPayments.reduce((acc, p) => acc + (p.amount || 0), 0);
      const outstandingBalance = companyInvoices.reduce((acc, inv) => acc + (inv.remainingBalance || 0), 0);

      const overdueBalance = companyInvoices
        .filter((inv) => inv.remainingBalance > 0 && new Date(inv.dueDate) < now)
        .reduce((acc, inv) => acc + inv.remainingBalance, 0);

      // Won deals value + total paid invoices
      const wonDealsTotal = wonDeals.reduce((acc, d) => acc + (d.dealValue || 0), 0);
      const totalRevenue = Math.max(wonDealsTotal, totalPaid);

      // Average payment days calculation
      let totalPaymentDays = 0;
      let settledCount = 0;
      companyInvoices.forEach((inv) => {
        if (inv.status === "Paid" && inv.issueDate) {
          const matchingPayment = companyPayments.find((p) => p.invoiceId === inv.id);
          if (matchingPayment) {
            const days = Math.max(1, Math.round((new Date(matchingPayment.date).getTime() - new Date(inv.issueDate).getTime()) / 86400000));
            totalPaymentDays += days;
            settledCount++;
          }
        }
      });
      const averagePaymentDays = settledCount > 0 ? Math.round(totalPaymentDays / settledCount) : 18;

      // Last and next activity
      const sortedActivities = [...companyActivities].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const lastActivityDate = sortedActivities[0]?.date || undefined;

      const companyTasks = tasks.filter((t) => t.companyId === c.id && t.status !== "Completed");
      const sortedTasks = [...companyTasks].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
      const nextActivityDate = sortedTasks[0]?.dueDate || undefined;

      // Smart status update if severely overdue or highly valued
      let status = c.status;
      if (overdueBalance > 15000 && status !== "At Risk" && status !== "Former Customer") {
        // Can be flagged At Risk
      }

      return {
        ...c,
        totalRevenue,
        totalInvoiced,
        totalPaid,
        outstandingBalance,
        overdueBalance,
        averagePaymentDays,
        dealsCount: companyDeals.length,
        openDealsCount: openDeals.length,
        wonDealsCount: wonDeals.length,
        lostDealsCount: lostDeals.length,
        lastActivityDate,
        nextActivityDate,
      };
    });
  }, [rawCompanies, deals, invoices, payments, activities, tasks]);

  // Company Actions
  const addCompany = (companyData: Omit<Company, "id" | "createdAt">): Company => {
    const newId = `comp_${Date.now()}`;
    const newCompany: Company = {
      ...companyData,
      id: newId,
      createdAt: new Date().toISOString().split("T")[0],
      customerValue: companyData.customerValue || 0,
      tags: companyData.tags || [],
    };
    setRawCompanies((prev) => [newCompany, ...prev]);
    return newCompany;
  };

  const updateCompany = (id: string, updates: Partial<Company>) => {
    setRawCompanies((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  };

  const deleteCompany = (id: string) => {
    setRawCompanies((prev) => prev.filter((c) => c.id !== id));
    if (selectedCompanyId === id) setSelectedCompanyId(null);
  };

  // Business Profile: runs the same Gemini-powered account analysis used
  // elsewhere in the app (customer health, churn risk, opportunities) and
  // persists the result onto the company record itself, so it shows up on
  // the Company 360 drawer's Business Profile tab without having to be
  // regenerated every time the drawer opens. Safe to call on a brand-new
  // company with no deals/invoices/activities yet -- the endpoint has a
  // heuristic fallback either way.
  const runCompanyAIAnalysis = async (companyId: string): Promise<void> => {
    const company = rawCompanies.find((c) => c.id === companyId);
    if (!company) return;
    try {
      const companyDeals = deals.filter((d) => d.companyId === companyId);
      const companyContacts = contacts.filter((c) => c.companyId === companyId);
      const companyInvoices = invoices.filter((i) => i.companyId === companyId);
      const companyActivities = activities.filter((a) => a.companyId === companyId);
      const res = await apiFetch("/api/ai/customer-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company,
          contacts: companyContacts,
          deals: companyDeals,
          invoices: companyInvoices,
          activities: companyActivities,
        }),
      });
      const data = await res.json();
      const analysis: CompanyAIAnalysis = {
        healthScore: data.healthScore ?? 50,
        healthStatus: data.healthStatus || "Stable",
        churnRisk: data.churnRisk || "Medium",
        churnReason: data.churnReason || "",
        summary: data.summary || data.relationshipSummary || "",
        actionableRecommendations: data.actionableRecommendations || [],
        opportunities: data.opportunities || [],
        recommendedAction: data.recommendedAction,
        generatedAt: new Date().toISOString(),
        source: data.source === "gemini" ? "gemini" : "heuristic",
      };
      updateCompany(companyId, { aiAnalysis: analysis });
    } catch (err) {
      console.error("[CRMContext] runCompanyAIAnalysis failed:", err);
      // Leave the company without an aiAnalysis rather than blocking the
      // rest of the lead-creation flow on an AI/network hiccup.
    }
  };

  const addCallLogEntry = (companyId: string, entry: Omit<CallLogEntry, "id" | "createdAt" | "loggedBy">) => {
    const newEntry: CallLogEntry = {
      ...entry,
      id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      loggedBy: currentUser.name,
      createdAt: new Date().toISOString(),
    };
    setRawCompanies((prev) =>
      prev.map((c) => (c.id === companyId ? { ...c, callLog: [newEntry, ...(c.callLog || [])] } : c))
    );
  };

  const deleteCallLogEntry = (companyId: string, entryId: string) => {
    setRawCompanies((prev) =>
      prev.map((c) =>
        c.id === companyId ? { ...c, callLog: (c.callLog || []).filter((e) => e.id !== entryId) } : c
      )
    );
  };

  // Contact Actions
  const addContact = (contactData: Omit<Contact, "id" | "createdAt">): Contact => {
    const newId = `cnt_${Date.now()}`;
    const newContact: Contact = {
      ...contactData,
      id: newId,
      createdAt: new Date().toISOString().split("T")[0],
      tags: contactData.tags || [],
    };
    setContacts((prev) => [newContact, ...prev]);
    return newContact;
  };

  const updateContact = (id: string, updates: Partial<Contact>) => {
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  };

  const deleteContact = (id: string) => {
    setContacts((prev) => prev.filter((c) => c.id !== id));
  };

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

    // Business Profile: every new lead gets its own Company (the business)
    // and Contact (the person) automatically -- reusing an existing company
    // by name / contact by email when one already matches, rather than
    // creating duplicates every time the same business submits another lead.
    if (newLead.company && newLead.company.trim()) {
      let company = rawCompanies.find(
        (c) => c.name.trim().toLowerCase() === newLead.company.trim().toLowerCase()
      );
      if (!company) {
        company = addCompany({
          name: newLead.company,
          industry: newLead.industry || "General Industry",
          website: newLead.website || "",
          country: newLead.country || "",
          city: newLead.city || "",
          address: "",
          phone: newLead.phone || "",
          email: newLead.email || "",
          salesperson: newLead.salesperson || currentUser.name,
          status: "Lead",
          customerValue: 0,
          notes: `Auto-created from Lead ${newLead.id}.`,
          tags: ["Auto-Created", "From Lead"],
          sourceLeadId: newLead.id,
        } as Omit<Company, "id" | "createdAt">);
      }

      if (newLead.email && newLead.email.trim()) {
        const existingContact = contacts.find(
          (c) => c.email.trim().toLowerCase() === newLead.email.trim().toLowerCase()
        );
        if (!existingContact) {
          const nameParts = newLead.name.trim().split(" ");
          addContact({
            firstName: nameParts[0] || newLead.name || "Lead",
            lastName: nameParts.slice(1).join(" ") || "",
            position: newLead.jobTitle || "",
            companyId: company.id,
            email: newLead.email,
            phone: newLead.phone || "",
            whatsapp: newLead.whatsapp,
            country: newLead.country || "",
            city: newLead.city || "",
            status: "Active",
            leadSource: newLead.source || "Lead Form",
            salesperson: newLead.salesperson || currentUser.name,
            notes: `Auto-created from Lead ${newLead.id}. ${newLead.notes || ""}`.trim(),
            tags: ["Auto-Created", "From Lead"],
          });
        }
      }

      // Kick off the AI business-profile analysis in the background -- it's
      // fine if this takes a moment or even fails; the profile still works
      // without it and can always be regenerated from the Company 360 drawer.
      void runCompanyAIAnalysis(company.id);
    }

    return newLead;
  };

  // Bulk version of the auto-create-on-add logic above, for leads that
  // already existed before Business Profiles shipped (or were imported)
  // and never got a linked Company/Contact. Builds the updated
  // companies/contacts arrays locally first -- rather than calling
  // addCompany/addContact per lead -- so that two leads sharing the same
  // new company in this same batch correctly reuse one record instead of
  // each creating their own (state updates from addCompany/addContact
  // wouldn't be visible to the next iteration until a re-render).
  const syncAllLeadsToCompaniesAndContacts = (): {
    companiesCreated: number;
    contactsCreated: number;
    companiesLinked: number;
  } => {
    const localCompanies = [...rawCompanies];
    const localContacts = [...contacts];
    const newlyCreatedCompanyIds: string[] = [];
    let companiesCreated = 0;
    let contactsCreated = 0;
    let companiesLinked = 0;
    const today = new Date().toISOString().split("T")[0];
    // Tracks, per lead, which Company/Contact it ended up matched or linked
    // to this pass -- written back onto the leads themselves at the end so
    // the sync actually persists (setRawCompanies/setContacts alone only
    // save the Company/Contact records, not the fact that each Lead is now
    // linked to one).
    const leadLinkage = new Map<string, { companyId: string; contactId?: string }>();

    leads.forEach((lead) => {
      if (!lead.company || !lead.company.trim()) return;

      let company = localCompanies.find(
        (c) => c.name.trim().toLowerCase() === lead.company.trim().toLowerCase()
      );
      if (!company) {
        company = {
          id: `comp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: lead.company,
          industry: lead.industry || "General Industry",
          website: lead.website || "",
          country: lead.country || "",
          city: lead.city || "",
          address: "",
          phone: lead.phone || "",
          email: lead.email || "",
          salesperson: lead.salesperson || currentUser.name,
          status: "Lead",
          customerValue: 0,
          notes: `Auto-created from Lead ${lead.id} via bulk sync.`,
          tags: ["Auto-Created", "From Lead"],
          sourceLeadId: lead.id,
          createdAt: today,
        };
        localCompanies.push(company);
        newlyCreatedCompanyIds.push(company.id);
        companiesCreated++;
      } else {
        companiesLinked++;
      }

      let contactId: string | undefined;
      if (lead.email && lead.email.trim()) {
        const existingContact = localContacts.find(
          (c) => c.email.trim().toLowerCase() === lead.email.trim().toLowerCase()
        );
        if (existingContact) {
          contactId = existingContact.id;
        } else {
          const nameParts = lead.name.trim().split(" ");
          const newContactId = `cnt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          localContacts.push({
            id: newContactId,
            firstName: nameParts[0] || lead.name || "Lead",
            lastName: nameParts.slice(1).join(" ") || "",
            position: lead.jobTitle || "",
            companyId: company.id,
            email: lead.email,
            phone: lead.phone || "",
            whatsapp: lead.whatsapp,
            country: lead.country || "",
            city: lead.city || "",
            status: "Active",
            leadSource: lead.source || "Lead Form",
            salesperson: lead.salesperson || currentUser.name,
            notes: `Auto-created from Lead ${lead.id} via bulk sync. ${lead.notes || ""}`.trim(),
            tags: ["Auto-Created", "From Lead"],
            createdAt: today,
          });
          contactId = newContactId;
          contactsCreated++;
        }
      }

      leadLinkage.set(lead.id, { companyId: company.id, contactId });
    });

    setRawCompanies(localCompanies);
    setContacts(localContacts);

    // Write the match/link back onto the leads themselves -- without this,
    // nothing about the sync survives a reload: Company/Contact records
    // persist fine, but the Lead objects (and anything reading them, like
    // the "Linked" badge in the Leads view) never change, so it looks like
    // the sync silently didn't save.
    if (leadLinkage.size > 0) {
      setLeads((prev) =>
        prev.map((l) => {
          const link = leadLinkage.get(l.id);
          if (!link) return l;
          return { ...l, linkedCompanyId: link.companyId, linkedContactId: link.contactId };
        })
      );
    }

    // Kick off AI analysis in the background, only for companies this sync
    // actually created -- companies that already existed likely already
    // have (or intentionally lack) an analysis.
    newlyCreatedCompanyIds.forEach((id) => void runCompanyAIAnalysis(id));

    return { companiesCreated, contactsCreated, companiesLinked };
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

  const convertLead = (leadId: string, createDeal: boolean) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) throw new Error("Lead not found");

    // Check if company exists or create
    let existingCompany = rawCompanies.find((c) => c.name.toLowerCase() === lead.company.toLowerCase());
    if (!existingCompany) {
      existingCompany = addCompany({
        name: lead.company,
        industry: lead.industry || "General Industry",
        website: lead.website || "",
        country: lead.country || "United States",
        city: lead.city || "",
        address: "",
        phone: lead.phone || "",
        email: lead.email || "",
        salesperson: lead.salesperson || currentUser.name,
        status: "Qualified Prospect",
        customerValue: lead.estimatedValue || 0,
        notes: `Converted from Lead ${lead.id}. ${lead.notes}`,
        tags: [...(lead.tags || []), "Converted Lead"],
      });
    }

    // Create Contact
    const nameParts = lead.name.trim().split(" ");
    const firstName = nameParts[0] || "Contact";
    const lastName = nameParts.slice(1).join(" ") || "";
    const newContact = addContact({
      firstName,
      lastName,
      position: lead.jobTitle || "Lead",
      companyId: existingCompany.id,
      email: lead.email,
      phone: lead.phone,
      whatsapp: lead.whatsapp,
      country: lead.country,
      city: lead.city,
      status: "Active",
      leadSource: lead.source,
      salesperson: lead.salesperson || currentUser.name,
      notes: `Converted from Lead ${lead.id}`,
      tags: ["Converted"],
    });

    let newDeal: Deal | undefined = undefined;
    if (createDeal) {
      const defaultPipeline = pipelines.find((p) => p.isDefault) || pipelines[0];
      const defaultStage = defaultPipeline.stages[2] || defaultPipeline.stages[0]; // Qualified stage
      newDeal = addDeal({
        name: `${lead.company} - Expansion Core`,
        companyId: existingCompany.id,
        contactId: newContact.id,
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
              convertedCompanyId: existingCompany!.id,
              convertedDealId: newDeal?.id,
            }
          : l
      )
    );

    // Log Activity
    addActivity({
      type: "Note",
      companyId: existingCompany.id,
      contactId: newContact.id,
      dealId: newDeal?.id,
      date: new Date().toISOString().split("T")[0],
      time: "10:00",
      user: currentUser.name,
      description: `Lead ${lead.name} (${lead.company}) was converted to qualified contact and deal.`,
      outcome: "Converted successfully",
      nextAction: "Schedule initial strategic alignment call",
    });

    return { company: existingCompany, contact: newContact, deal: newDeal };
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
      companyId: dealData.companyId,
      contactId: dealData.contactId,
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

          // If moved to Won, record activity & update company customer status
          if (status === "Won" && d.status !== "Won") {
            setTimeout(() => {
              addActivity({
                type: "Proposal",
                companyId: d.companyId,
                contactId: d.contactId,
                dealId: d.id,
                date: new Date().toISOString().split("T")[0],
                time: "11:00",
                user: currentUser.name,
                description: `Deal "${d.name}" closed WON ($${d.dealValue.toLocaleString()})!`,
                outcome: "Contract finalized and signed",
                nextAction: "Generate onboarding invoice and schedule kickoff",
              });
              updateCompany(d.companyId, { status: "Active Customer" });
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
      companyId: invoiceData.companyId,
      contactId: invoiceData.contactId,
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
      companyId: existing.companyId,
      contactId: existing.contactId,
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
        companyId: invoice.companyId,
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
      companyId: paymentData.companyId,
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
      const email =
        campaign.audienceType === "Leads"
          ? leads.find((l) => l.id === id)?.email
          : contacts.find((c) => c.id === id)?.email;
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

  // AI-assisted setup: turns a plain-language description into a structured
  // draft the user reviews and edits before saving -- this never saves a
  // product on its own, it only returns fields for the create/edit form to
  // prefill. Falls back to a sensible heuristic draft if the AI call fails,
  // so "set up by AI" never just breaks.
  const generateProductDraft = async (rawDescription: string): Promise<Partial<Product>> => {
    const existingIndustries = Array.from(
      new Set([...rawCompanies.map((c) => c.industry), ...leads.map((l) => l.industry)].filter(Boolean))
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
    setRawCompanies([]);
    setContacts([]);
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
        selectedCompanyId,
        setSelectedCompanyId,
        selectedDealId,
        setSelectedDealId,
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

        companies,
        contacts,
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

        addCompany,
        updateCompany,
        deleteCompany,

        addContact,
        updateContact,
        deleteContact,

        addLead,
        updateLead,
        deleteLead,
        moveLeadStatus,
        convertLead,

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
        generateKnowledgeBaseDraftFromUrl,

        runCompanyAIAnalysis,
        addCallLogEntry,
        deleteCallLogEntry,
        syncAllLeadsToCompaniesAndContacts,

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
