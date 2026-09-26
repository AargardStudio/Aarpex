export type CustomerStatus =
  | "Prospect"
  | "Lead"
  | "Qualified Prospect"
  | "Active Customer"
  | "High Value Customer"
  | "At Risk"
  | "Dormant"
  | "Former Customer";

export type LeadStatus =
  | "New"
  | "Contacted"
  | "Engaged"
  | "Qualified"
  | "Proposal"
  | "Negotiation"
  | "Converted"
  | "Lost"
  | "Nurture";

export type DealStatus = "Open" | "Won" | "Lost" | "On Hold";

export type InvoiceStatus =
  | "Draft"
  | "Sent"
  | "Partially Paid"
  | "Paid"
  | "Overdue"
  | "Cancelled";

export type PaymentMethod =
  | "Bank Transfer"
  | "Cash"
  | "Card"
  | "Cheque"
  | "Online Payment"
  | "Other";

export type ActivityType =
  | "Call"
  | "Meeting"
  | "Email"
  | "WhatsApp"
  | "Follow-up"
  | "Demo"
  | "Proposal"
  | "Invoice"
  | "Payment"
  | "Task"
  | "Note";

export type TaskStatus = "To Do" | "In Progress" | "Completed" | "Cancelled";
export type TaskPriority = "Low" | "Medium" | "High" | "Urgent";
export type DealPriority = "Low" | "Medium" | "High";

export type UserRole =
  | "admin"
  | "sales_manager"
  | "sales_rep"
  | "finance"
  | "viewer";

export interface UserPermissions {
  canDeleteRecords: boolean;
  canExportData: boolean;
  canViewFinancials: boolean;
  canManageInvoices: boolean;
  canManageUsers: boolean;
  canManageSettings: boolean;
  canAssignLeads: boolean;
  canImportLeads: boolean;
}

export const ROLE_PERMISSIONS: Record<UserRole, UserPermissions> = {
  admin: {
    canDeleteRecords: true,
    canExportData: true,
    canViewFinancials: true,
    canManageInvoices: true,
    canManageUsers: true,
    canManageSettings: true,
    canAssignLeads: true,
    canImportLeads: true,
  },
  sales_manager: {
    canDeleteRecords: false,
    canExportData: true,
    canViewFinancials: true,
    canManageInvoices: true,
    canManageUsers: true,
    canManageSettings: false,
    canAssignLeads: true,
    canImportLeads: true,
  },
  sales_rep: {
    canDeleteRecords: false,
    canExportData: false,
    canViewFinancials: false,
    canManageInvoices: false,
    canManageUsers: false,
    canManageSettings: false,
    canAssignLeads: false,
    canImportLeads: true,
  },
  finance: {
    canDeleteRecords: false,
    canExportData: true,
    canViewFinancials: true,
    canManageInvoices: true,
    canManageUsers: false,
    canManageSettings: false,
    canAssignLeads: false,
    canImportLeads: false,
  },
  viewer: {
    canDeleteRecords: false,
    canExportData: false,
    canViewFinancials: false,
    canManageInvoices: false,
    canManageUsers: false,
    canManageSettings: false,
    canAssignLeads: false,
    canImportLeads: false,
  },
};

export const ROLE_LABELS: Record<UserRole, { title: string; description: string; badgeColor: string }> = {
  admin: {
    title: "Super Administrator",
    description: "Full access: user management, financial ledgers, system settings, record deletion",
    badgeColor: "bg-red-500/20 text-red-300 border-red-500/40",
  },
  sales_manager: {
    title: "Sales Manager",
    description: "Pipeline management, rep assignment, pipeline analytics, quotes approval",
    badgeColor: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  },
  sales_rep: {
    title: "Sales Representative",
    description: "Manage assigned leads, deals, contacts, log activities and tasks",
    badgeColor: "bg-teal-500/20 text-teal-300 border-teal-500/40",
  },
  finance: {
    title: "Finance & Billing",
    description: "Invoices, payment processing, Stripe billing, and revenue accounting",
    badgeColor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  },
  viewer: {
    title: "Auditor / Read-Only",
    description: "View-only access across CRM modules; cannot create, edit, or delete records",
    badgeColor: "bg-slate-500/20 text-slate-300 border-slate-500/40",
  },
};

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole | string;
  roleTitle?: string;
  avatar: string;
  photoUrl?: string;
  isGoogleAccount?: boolean;
  googleId?: string;
  permissions?: Partial<UserPermissions>;
  lastLogin?: string;
  status?: "Active" | "Pending" | "Suspended";
}

// ----------------------------------------------------------------------------
// Business Profile — the AI-analysis + call-log layer that rides along with
// a Company record. A "business profile" isn't a separate entity: it's this
// bundle of fields living on the Company that gets auto-populated the moment
// a Lead is added, and shown on the Company 360 drawer's own tab.
// ----------------------------------------------------------------------------
export interface CompanyAIAnalysis {
  healthScore: number;
  healthStatus: "Healthy" | "Stable" | "At Risk" | "Critical";
  churnRisk: "Low" | "Medium" | "High" | "Critical";
  churnReason: string;
  summary: string;
  actionableRecommendations: string[];
  opportunities?: Array<{
    type: string;
    title: string;
    description: string;
    estimatedValue?: number;
    confidence?: string;
  }>;
  recommendedAction?: string;
  generatedAt: string;
  source: "gemini" | "heuristic";
}

export interface CallLogEntry {
  id: string;
  contactId?: string;
  contactName?: string;
  date: string;
  durationMinutes: number;
  outcome: "Connected" | "No Answer" | "Voicemail" | "Follow-Up Needed" | "Not Interested" | "Closed";
  summary: string;
  loggedBy: string;
  createdAt: string;
}

export interface Company {
  id: string;
  name: string;
  logo?: string;
  // Business Profile fields (see above) — all optional so existing
  // companies created before this feature keep working unchanged.
  aiAnalysis?: CompanyAIAnalysis;
  callLog?: CallLogEntry[];
  sourceLeadId?: string;
  industry: string;
  // Classification of the client itself (size/type of buyer), independent
  // of what industry they're in -- e.g. two Textile & Fashion companies
  // might be "Enterprise" and "Startup" respectively. See
  // src/data/industries.ts for the standard picklist (freeform is still
  // accepted for anything not on it).
  clientCategory?: string;
  website: string;
  country: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  primaryContactId?: string;
  salesperson: string;
  status: CustomerStatus;
  customerValue: number;
  notes: string;
  tags: string[];
  createdAt: string;

  // Derived / calculated properties
  totalRevenue?: number;
  totalInvoiced?: number;
  totalPaid?: number;
  outstandingBalance?: number;
  overdueBalance?: number;
  averagePaymentDays?: number;
  dealsCount?: number;
  openDealsCount?: number;
  wonDealsCount?: number;
  lostDealsCount?: number;
  lastActivityDate?: string;
  nextActivityDate?: string;
}

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
  companyId: string;
  email: string;
  phone: string;
  whatsapp?: string;
  linkedin?: string;
  country: string;
  city: string;
  status: string;
  leadSource: string;
  salesperson: string;
  notes: string;
  tags: string[];
  createdAt: string;
}

// A lead's social profile -- deliberately open-ended (platform is free
// text, not a fixed union) so "any other social media link" beyond
// Instagram/Facebook/LinkedIn/X/TikTok just works without a code change.
export interface SocialLink {
  id: string;
  platform: string;
  url: string;
}

export interface Lead {
  id: string;
  name: string;
  company: string;
  jobTitle: string;
  email: string;
  phone: string;
  whatsapp?: string;
  website?: string;
  socialLinks?: SocialLink[];
  industry: string;
  // See Company.clientCategory -- same idea, set at the lead stage.
  clientCategory?: string;
  country: string;
  city: string;
  source: string;
  salesperson: string;
  leadScore: number;
  priority: TaskPriority;
  status: LeadStatus;
  estimatedValue: number;
  expectedCloseDate: string;
  createdDate: string;
  lastContact: string;
  nextFollowUp: string;
  tags: string[];
  notes: string;
  convertedCompanyId?: string;
  convertedDealId?: string;
  // Set by "Sync All to Companies/Contacts" (or the per-lead equivalent) --
  // marks that this lead has a matching Company/Contact record, without
  // implying a full pipeline conversion the way convertedCompanyId does.
  linkedCompanyId?: string;
  linkedContactId?: string;
}

// ----------------------------------------------------------------------------
// Products / Services — the versatile catalog: agency retainers, SaaS
// subscriptions, tour packages, one-off B2B products, anything sellable.
// Each one can be set up manually or drafted by AI from a plain-language
// description, and carries a "who this is for" fit profile used to surface
// matching companies/leads/contacts and to seed Email Marketing campaigns.
// ----------------------------------------------------------------------------
export type ProductType =
  | "Agency Retainer"
  | "SaaS Subscription"
  | "Tour Package"
  | "B2B Product"
  | "One-Time Service"
  | "Other";

export type ProductPricingModel =
  | "One-Time"
  | "Monthly Recurring"
  | "Annual Recurring"
  | "Per-Project"
  | "Custom Quote";

export type ProductStatus = "Active" | "Draft" | "Archived";

// The "who this should be sold to" fit profile. Every field is optional and
// additive (an empty array/undefined means "no constraint on this field") --
// a product with no criteria at all simply matches everyone.
export interface ProductTargetCriteria {
  industries: string[]; // matches Company.industry / Lead.industry
  // matches Company.clientCategory / Lead.clientCategory -- optional, an
  // empty array means "no constraint" same as every other criteria field.
  clientCategories: string[];
  companyStatuses: CustomerStatus[]; // e.g. "Prospect", "Active Customer"
  countries: string[];
  tags: string[]; // matches Company.tags / Lead.tags / Contact.tags
  leadSources: string[]; // matches Lead.source
  idealCustomerNotes: string; // free-text description of the ideal buyer
}

export interface ProductAIInsight {
  suggestedTargetSummary: string;
  suggestedIndustries: string[];
  suggestedTags: string[];
  pitchAngles: string[]; // short marketing hooks / angles
  objectionHandling: string[]; // common objections + how to answer them
  generatedAt: string;
  source: "gemini" | "heuristic";
}

export interface Product {
  id: string;
  name: string;
  type: ProductType;
  pricingModel: ProductPricingModel;
  price: number;
  currency?: string;
  status: ProductStatus;
  description: string; // short, factual description of the offering
  pitch: string; // marketing pitch / positioning copy (AI-drafted or manual)
  targetCriteria: ProductTargetCriteria;
  aiInsight?: ProductAIInsight;
  createdBy: string;
  createdAt: string;
  tags: string[];
}

// ----------------------------------------------------------------------------
// Knowledge Base — free-text reference material the AI chat assistant is
// grounded in, split into three categories so the right content shows up in
// the right place instead of one undifferentiated pile:
//   - "company": context ABOUT specific leads/contacts/companies -- industry
//     background, research notes, anything relevant to who you're talking
//     to. An entry can be attached to as many records as apply (e.g. one
//     "Healthcare industry context" entry attached to every lead/company in
//     that vertical) via linkedLeadIds/linkedContactIds/linkedCompanyIds.
//     An entry with none of those set is still usable as general
//     company-category reference, just not tied to specific records.
//   - "product": what you sell -- positioning, pricing rationale, FAQs
//   - "operator": who YOUR business is (background, service offering) and
//     how it aligns with what you sell -- so the AI can help position it to
//     specific leads/companies/contacts. Internal-only: never shown to
//     prospects/customers as if it were customer-facing copy.
// ----------------------------------------------------------------------------
export type KnowledgeBaseCategory = "company" | "product" | "operator";

export interface KnowledgeBaseEntry {
  id: string;
  category: KnowledgeBaseCategory;
  title: string;
  content: string;
  tags: string[];
  // "company" category only: which specific records this entry is about.
  // Ignored for "product"/"operator" entries.
  linkedLeadIds?: string[];
  linkedContactIds?: string[];
  linkedCompanyIds?: string[];
  // Set when this entry was drafted (or last re-drafted) from a webpage via
  // "Generate from a link" -- shown as provenance, never required.
  sourceUrl?: string;
  // Set when this entry was created from a file in the File Manager --
  // lets the Knowledge Base view link back to (and re-open) the original.
  linkedFileId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ----------------------------------------------------------------------------
// File Manager -- workspace file storage, backed by a Supabase Storage
// bucket (see server.ts's /api/storage/* endpoints). Only file METADATA is
// synced through the normal TenantTable mechanism, same as every other
// entity; the actual bytes live in the bucket at `storagePath`, fetched via
// a short-lived signed URL rather than embedded in this record. `size` (in
// bytes) is what's summed to enforce each plan's storage quota -- see
// STORAGE_LIMITS_BYTES in src/data/subscriptionPlans.ts.
// ----------------------------------------------------------------------------
export type StoredFileSource = "manual_upload" | "email_attachment" | "import" | "other";

export interface StoredFile {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  storagePath: string;
  source: StoredFileSource;
  linkedLeadId?: string;
  linkedContactId?: string;
  linkedCompanyId?: string;
  linkedDealId?: string;
  uploadedBy: string;
  createdAt: string;
}

// ----------------------------------------------------------------------------
// Industry Playbooks — configurable, user-defined AI management profiles per
// industry (matches the freeform `industry` field on Lead/Company — see
// src/data/industries.ts for the standard picklist, custom values still
// work). One playbook per industry controls three things at once wherever
// that industry's leads/contacts/companies are touched by AI:
//   - email tone & talking points (bulk Email Marketing campaigns AND the
//     single-recipient "Generate Personalized Email" feature)
//   - lead qualification/scoring guidance (fed into /api/ai/lead-analysis)
//   - follow-up cadence & preferred channel defaults
// Not a hard-coded list of exactly N industries -- the user manages however
// many they want from the Industry Playbooks view.
// ----------------------------------------------------------------------------
export type PreferredOutreachChannel = "Email" | "WhatsApp" | "Call" | "Mixed";

export interface IndustryPlaybook {
  id: string;
  industry: string; // freeform, ideally matches src/data/industries.ts INDUSTRIES
  isActive: boolean;
  // Optional Product/Service this playbook is pitching -- when set, its
  // name and pitch are fed into the AI as extra context for every
  // auto-drafted follow-up/reply/negotiation offer this playbook's agent
  // generates, the same way a campaign's Product/Service picker seeds its
  // generated email copy.
  productId?: string;
  // Email tone & talking points
  tone: string; // e.g. "Consultative and data-driven, minimal hype"
  talkingPoints: string[]; // key value props / hooks to lean on
  painPoints: string[]; // common pain points this industry has
  objectionNotes?: string; // common objections + how to handle them
  // Lead qualification / scoring guidance -- free-text guidance fed into the
  // AI qualification prompt, not a rigid formula, so it stays flexible.
  qualificationGuidance?: string;
  // Follow-up cadence & channel defaults
  preferredChannel: PreferredOutreachChannel;
  followUpFrequencyDays: number;
  followUpCount: number;
  // Autonomous agent behavior -- when enabled, AarPex periodically scans
  // this industry's leads/contacts (while the app is open) for due
  // follow-ups and inbound replies and drafts proposed actions into the
  // Agent Approvals queue for the user to approve/edit/reject. Nothing is
  // ever sent without an explicit approval.
  autoRunEnabled: boolean;
  // Negotiation guardrails: the ceiling the agent may propose (0 disables
  // price/terms negotiation entirely for this industry) and free-text
  // guidance on acceptable terms (e.g. "annual prepay only", "no discount
  // below $500 deals"). The agent never exceeds maxDiscountPercent.
  maxDiscountPercent: number;
  negotiationGuidance?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ----------------------------------------------------------------------------
// Agent Approvals -- the human-in-the-loop queue every autonomous or
// negotiation action from an Industry Playbook-enabled agent passes through.
// Nothing an agent drafts is ever sent to a prospect until a user approves
// it here (or edits it first). Populated either on-demand (a rep clicks
// "Propose Offer" on a lead/contact) or by the periodic background scan for
// industries with autoRunEnabled.
// ----------------------------------------------------------------------------
export type AgentActionType = "follow_up" | "email_reply" | "negotiation_offer";
export type AgentActionStatus = "pending" | "approved" | "rejected";

export interface AgentAction {
  id: string;
  industry: string;
  actionType: AgentActionType;
  leadId?: string;
  contactId?: string;
  recipientName: string;
  recipientEmail: string;
  subject: string;
  body: string;
  // Why the agent is proposing this -- shown to the user for context, e.g.
  // "No response in 8 days (playbook cadence: every 7 days)" or "Detected a
  // reply in the inbox on 2026-09-26".
  reasoning: string;
  // negotiation_offer only -- the specific discount being proposed, capped
  // at the playbook's maxDiscountPercent at generation time.
  proposedDiscountPercent?: number;
  productId?: string;
  // Best-effort snippet of the inbound message that triggered this (reply
  // detection only) -- included so the user can see what they're actually
  // responding to before approving.
  triggerSnippet?: string;
  status: AgentActionStatus;
  triggerSource: "manual" | "auto_followup" | "auto_reply";
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

// ----------------------------------------------------------------------------
// Email Marketing — AI-generated outbound sequences targeting leads/contacts.
// ----------------------------------------------------------------------------
export type SalesTechnique = "Need-Based" | "Emotional" | "Problem-Solution";
export type EmailCampaignTechnique = SalesTechnique | "Mixed";
export type EmailFrequency = "Daily" | "Weekly" | "Biweekly" | "Monthly" | "Custom";
export type EmailStepStatus = "Draft" | "Scheduled" | "Sent" | "Failed";
export type EmailCampaignStatus = "Draft" | "Active" | "Paused" | "Completed";

// Per-recipient outcome of a step's most recent send attempt -- captured so
// "Sent" reflects what actually happened instead of just "we fired the
// requests and didn't wait to see". Overwritten each time a step is (re)sent.
export interface EmailStepDeliveryResult {
  recipientId: string;
  email: string;
  success: boolean;
  error?: string;
  messageId?: string;
  sentAt: string; // ISO timestamp
}

export interface EmailStep {
  id: string;
  stepNumber: number; // 1 = initial send, 2+ = follow-ups
  delayDays: number; // days after the previous step (0 for step 1)
  technique: SalesTechnique;
  subject: string;
  // May contain {{firstName}} / {{company}} / {{jobTitle}} merge tags,
  // substituted per-recipient at send time.
  body: string;
  status: EmailStepStatus;
  scheduledDate?: string; // ISO date this step becomes due to send
  sentDate?: string;
  // Set once a send attempt completes -- one entry per recipient targeted,
  // true success/failure per the actual API response (not assumed).
  deliveryResults?: EmailStepDeliveryResult[];
}

export interface EmailCampaign {
  id: string;
  name: string;
  // Optional link to the Product/Service this campaign is promoting --
  // when set, the audience picker can pre-select this product's matches
  // and its pitch seeds the AI-generated email copy.
  productId?: string;
  audienceType: "Leads" | "Contacts";
  audienceIds: string[];
  frequency: EmailFrequency;
  frequencyDays: number; // resolved cadence in days (7 for Weekly, etc.)
  followUpCount: number; // number of follow-ups after the initial email (0-6)
  technique: EmailCampaignTechnique;
  status: EmailCampaignStatus;
  steps: EmailStep[];
  createdDate: string;
  startDate?: string;
  salesperson: string;
  notes?: string;
  // Reply-tracking (Inbox section): audienceIds confirmed to have replied via
  // IMAP inbox scan -- their remaining scheduled follow-up steps are
  // auto-paused once they show up here.
  repliedAudienceIds?: string[];
  lastReplyCheckAt?: string;
  // Which of the workspace's connected mailboxes sends this campaign's
  // emails and is scanned for its replies. Unset falls back to the
  // tenant's default mailbox (see Tenant.webmailConfigs).
  mailboxId?: string;
}

export interface Deal {
  id: string;
  name: string;
  companyId: string;
  contactId?: string;
  salesperson: string;
  pipelineId: string;
  stageId: string;
  status: DealStatus;
  dealValue: number;
  currency: string;
  probability: number;
  weightedValue: number;
  expectedCloseDate: string;
  productService: string;
  source: string;
  priority: DealPriority;
  createdDate: string;
  lastActivity: string;
  nextActivity: string;
  notes: string;
}

export interface PipelineStage {
  id: string;
  name: string;
  probability: number;
  color: string;
  order: number;
  isWon?: boolean;
  isLost?: boolean;
}

export interface Pipeline {
  id: string;
  name: string;
  description: string;
  stages: PipelineStage[];
  isDefault?: boolean;
}

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  taxPercent: number;
  total: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  companyId: string;
  contactId?: string;
  dealId?: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  amountPaid: number;
  remainingBalance: number;
  status: InvoiceStatus;
  notes?: string;
  poNumber?: string;
  paymentTerms?: string;
  stripeInvoiceId?: string;
  stripeHostedUrl?: string;
  stripePaymentLink?: string;
  stripeStatus?: "draft" | "open" | "paid" | "uncollectible" | "void";
  stripeLiveMode?: boolean;
  templateTheme?: "executive" | "modern" | "classic";
}

export type InvoiceTemplateTheme = "executive" | "modern" | "classic";

export interface InvoiceTemplateConfig {
  theme: InvoiceTemplateTheme;
  companyName: string;
  companyAddress: string;
  companyCityStateZip: string;
  companyTaxId: string;
  companyEmail: string;
  companyPhone: string;
  companyWebsite: string;
  paymentTerms: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  routingOrIban: string;
  swiftCode: string;
  defaultNotes: string;
  enableStripePayment: boolean;
  enableQrCode: boolean;
}

export interface Payment {
  id: string;
  paymentNumber: string;
  companyId: string;
  invoiceId: string;
  dealId?: string;
  date: string;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  reference: string;
  notes: string;
  recordedBy: string;
}

export interface Activity {
  id: string;
  type: ActivityType;
  companyId?: string;
  contactId?: string;
  dealId?: string;
  leadId?: string;
  date: string;
  time: string;
  user: string;
  description: string;
  outcome: string;
  nextAction: string;
}

export interface Task {
  id: string;
  title: string;
  companyId?: string;
  contactId?: string;
  dealId?: string;
  assignedUser: string;
  priority: TaskPriority;
  dueDate: string;
  status: TaskStatus;
  notes: string;
}

export interface CommentReply {
  id: string;
  userName: string;
  content: string;
  timestamp: string;
}

export interface Comment {
  id: string;
  entityType: "company" | "contact" | "deal";
  entityId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  timestamp: string;
  isInternal: boolean;
  replies?: CommentReply[];
}

// ----------------------------------------------------------------------------
// CEO Notes -- a global, read-only broadcast feed from Aargard's CEO to
// every AarPex user, across every workspace. A memoir-style running log,
// not a CRM record and not user-editable: entries ship as static content
// in src/data/ceoNotes.ts (see that file), the same way release notes do.
// No user, in any tenant, can create, edit, or delete an entry from the
// app -- publishing only happens by editing that file and pushing a build.
// ----------------------------------------------------------------------------
export type CeoNoteType = "Note" | "Activity" | "Milestone" | "Progress Update";

export interface CeoNote {
  id: string;
  title: string;
  content: string; // free-form story/memoir text, may contain line breaks
  type: CeoNoteType;
  date: string; // YYYY-MM-DD -- the date this entry is about
  authorName: string;
  tags: string[];
  createdAt: string;
  updatedAt?: string;
}

export interface AICustomerAnalysis {
  healthScore: number;
  healthStatus: "Healthy" | "Stable" | "At Risk" | "Critical";
  relationshipSummary: string;
  revenueAnalysis: {
    trend: "Growth" | "Stable" | "Declining" | "Volatile";
    dealFrequency: string;
    averageDealSize: number;
    growthDeclineSummary: string;
    revenuePotential: string;
  };
  paymentAnalysis: {
    reliability: "Excellent" | "Good" | "Delayed" | "High Risk";
    averageDelayDays: number;
    outstandingAmount: number;
    overdueRisk: "Low" | "Medium" | "High";
    summary: string;
  };
  engagementAnalysis: {
    trend: "Increasing" | "Steady" | "Dormant" | "Disengaging";
    communicationFrequency: string;
    lastInteractionSummary: string;
    summary: string;
  };
  riskDetection: {
    churnRisk: "Low" | "Medium" | "High" | "Critical";
    churnFactors: string[];
    paymentRisk: "Low" | "Medium" | "High";
    dealRisk: "Low" | "Medium" | "High";
    relationshipRisk: string;
  };
  opportunities: {
    type: "Upsell" | "Cross-sell" | "Renewal" | "New Service" | "Expansion";
    title: string;
    description: string;
    estimatedValue: number;
    confidence: "High" | "Medium" | "Low";
  }[];
  recommendedAction: string;
}

export interface AIPotentialPitch {
  recommendedPitch: string;
  whyThisPitch: string;
  bestOffer: string;
  recommendedApproach: "Email" | "Call" | "Meeting" | "WhatsApp" | "Proposal";
  bestTiming: string;
  talkingPoints: string[];
  potentialObjections: {
    objection: string;
    suggestedResponse: string;
  }[];
}

export interface AIDealAnalysis {
  winProbability: number;
  dealHealth: "Strong" | "Average" | "At Risk" | "Critical";
  keyBlockers: string[];
  missingInformation: string[];
  recommendedNextAction: string;
  recommendedFollowUpDate: string;
  potentialObjections: string[];
  suggestedResponse: string;
  closeLikelihoodSummary: string;
}

export interface AIDailyBriefing {
  headline: string;
  highlights: {
    label: string;
    badge: string;
    variant: "warning" | "danger" | "success" | "info";
  }[];
  topOpportunity: {
    name: string;
    value: number;
    strategy: string;
  };
  criticalActions: {
    action: string;
    target: string;
    urgency: "High" | "Medium";
  }[];
  briefingSummary: string;
}

export type DateFilterRange =
  | "Today"
  | "This Week"
  | "This Month"
  | "This Quarter"
  | "This Year"
  | "Custom Range"
  | "All";

export interface CRMSettings {
  companyName: string;
  taxId: string;
  currency: string;
  commissionRate: number;
}

export interface TenantStripeConfig {
  isEnabled: boolean;
  publishableKey: string;
  secretKey: string;
  webhookSecret?: string;
  currency: string;
  isLiveMode: boolean;
  lastVerifiedAt?: string;
  status: "unconfigured" | "connected" | "invalid_key" | "testing";
  accountName?: string;
}

export interface TenantWebmailConfig {
  /** Stable id for this mailbox within the tenant -- used to pick a sender
   * when composing a single email or a campaign (see EmailCampaign.mailboxId)
   * now that a workspace can connect more than one mailbox. */
  id: string;
  /** Friendly name shown in mailbox pickers, e.g. "Sales Inbox". Falls back
   * to the email address itself when not set. */
  label?: string;
  /** Exactly one mailbox per tenant is the default -- used when composing or
   * building a campaign without explicitly choosing a mailbox. */
  isDefault?: boolean;
  isEnabled: boolean;
  provider: "hostinger" | "cpanel" | "gmail" | "outlook" | "custom";
  email: string;
  displayName: string;
  password?: string;
  smtpHost: string;
  smtpPort: number;
  smtpEncryption: "SSL" | "TLS" | "STARTTLS";
  imapHost: string;
  imapPort: number;
  imapEncryption: "SSL" | "TLS";
  replyTo?: string;
  signature?: string;
  lastTestedAt?: string;
  status: "unconfigured" | "connected" | "error" | "testing";
  statusMessage?: string;
}

// WhatsApp Business (Meta Cloud API) -- one connection per tenant. A real
// send requires either a free-text message inside the 24-hour customer
// service window (the lead/contact messaged this number first, or replied
// within the last day) or a pre-approved message template outside it --
// that's a WhatsApp platform rule, not something AarPex can route around,
// so the compose UI surfaces both options rather than pretending free text
// always works.
export interface TenantWhatsAppConfig {
  isEnabled: boolean;
  // Which API actually sends the message. Both talk to the same WhatsApp
  // network -- this only picks how AarPex authenticates and which fields
  // below are used. Defaults to "meta" for tenants configured before this
  // field existed.
  provider?: "meta" | "twilio";

  // -- Meta Cloud API fields (provider: "meta") --
  // Meta Graph API access token (system user or temporary) for the
  // WhatsApp Business Account this phone number belongs to.
  accessToken?: string;
  phoneNumberId: string;
  businessAccountId?: string;

  // -- Twilio fields (provider: "twilio") -- Twilio's WhatsApp API sits in
  // front of the same Meta WhatsApp network, authenticated with your
  // Twilio Account SID/Auth Token instead of a Meta system-user token, and
  // sent from a WhatsApp-enabled Twilio number (sandbox or a real number
  // approved for WhatsApp in the Twilio console).
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  // E.164, no "whatsapp:" prefix -- that's added at send time.
  twilioWhatsAppNumber?: string;

  // Filled in by "Test Connection" from the provider's own record of the
  // number -- not user-entered, so it always matches what's on file.
  displayPhoneNumber?: string;
  verifiedName?: string;
  lastVerifiedAt?: string;
  status: "unconfigured" | "connected" | "error" | "testing";
  statusMessage?: string;
}

export interface TenantMember {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  joinedAt: string;
}

export interface EmailAttachment {
  id: string;
  filename: string;
  size: number;
  contentType: string;
  content: string;
  dataUrl?: string;
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceRoleKey?: string;
  databaseUrl?: string;
  isConnected: boolean;
  lastTestedAt?: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  details?: string;
  category?: "billing" | "security" | "settings" | "general";
}

export type BillingPriceType = "recurring" | "one_time";

export interface TenantBillingPrice {
  id: string; // Stripe price ID
  amount: number; // in whole currency units (e.g. dollars)
  currency: string;
  type: BillingPriceType;
  interval?: "day" | "week" | "month" | "year";
  createdAt: string;
}

export interface TenantBillingProduct {
  id: string; // Stripe product ID
  name: string;
  description?: string;
  prices: TenantBillingPrice[];
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  logo?: string;
  industry?: string;
  currency: string;
  createdAt: string;
  ownerEmail: string;
  plan: "Starter" | "Growth" | "Pro" | "Enterprise" | "Free";
  subscriptionStatus?: "active" | "trialing" | "past_due" | "canceled";
  billingCycle?: "monthly" | "annually";
  subscriptionPrice?: number;
  nextBillingDate?: string;
  subscriptionId?: string;
  /** The platform-level Stripe Customer id (from checkout), used to open the
   * Stripe Billing Portal so a workspace owner can add/change/remove their
   * own payment method without support having to do it for them. */
  stripeCustomerId?: string;
  cardLast4?: string;
  cardBrand?: string;
  seatsAllocated?: number;
  companyName: string;
  taxId: string;
  commissionRate: number;
  members: TenantMember[];
  stripeConfig: TenantStripeConfig;
  /** Every mailbox this workspace has connected. Each one supports both
   * sending (SMTP) and receiving (IMAP reply detection). Compose and Email
   * Marketing campaigns pick a specific mailbox to send from (falling back
   * to the one with isDefault:true); see TenantWebmailConfig.id. */
  webmailConfigs: TenantWebmailConfig[];
  whatsappConfig?: TenantWhatsAppConfig;
  supabaseConfig?: SupabaseConfig;
  auditLog?: AuditLogEntry[];
}
