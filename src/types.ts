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

export interface Lead {
  id: string;
  name: string;
  company: string;
  jobTitle: string;
  email: string;
  phone: string;
  whatsapp?: string;
  website?: string;
  industry: string;
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
}

// ----------------------------------------------------------------------------
// Email Marketing — AI-generated outbound sequences targeting leads/contacts.
// ----------------------------------------------------------------------------
export type SalesTechnique = "Need-Based" | "Emotional" | "Problem-Solution";
export type EmailCampaignTechnique = SalesTechnique | "Mixed";
export type EmailFrequency = "Daily" | "Weekly" | "Biweekly" | "Monthly" | "Custom";
export type EmailStepStatus = "Draft" | "Scheduled" | "Sent" | "Failed";
export type EmailCampaignStatus = "Draft" | "Active" | "Paused" | "Completed";

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
}

export interface EmailCampaign {
  id: string;
  name: string;
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
  plan: "Starter" | "Growth" | "Enterprise" | "Free";
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
  webmailConfig: TenantWebmailConfig;
  supabaseConfig?: SupabaseConfig;
  auditLog?: AuditLogEntry[];
}
