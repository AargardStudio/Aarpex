export interface SubscriptionPlan {
  id: "Starter" | "Growth" | "Pro" | "Enterprise";
  name: string;
  tagline: string;
  monthlyPrice: number;
  annualPrice: number; // per month when billed annually
  seats: number;
  isPopular?: boolean;
  features: string[];
  stripePriceIdMonthly?: string;
  stripePriceIdAnnual?: string;
  /** Hidden from all plan pickers while PRICING_LOCKED is true — kept in the
   * data model in case multi-tier pricing is reintroduced later. */
  hidden?: boolean;
}

/**
 * AarPex is sold as two visible tiers -- Growth ($29/mo, the default every
 * new workspace is provisioned on) and Pro ($99/mo, adds multiple sending
 * mailboxes and the rest of the Pro feature set below) -- both with a
 * 14-day free trial and no annual discount. Starter and Enterprise are kept
 * in the data model (id, seats, feature lists) so they can be reactivated
 * later without a data migration, but stay hidden from every plan picker.
 * Every plan picker in the app should read from VISIBLE_SUBSCRIPTION_PLANS
 * (or PLATFORM_PLAN for the default) rather than the full SUBSCRIPTION_PLANS
 * array, so a plan only has to be un-hidden here to go live everywhere.
 */
export const PRICING_LOCKED = false;

/** Free trial length offered on the platform subscription. */
export const PLATFORM_TRIAL_DAYS = 14;

/**
 * The single exempt founder account — always kept active regardless of
 * billing status, and the only account that ever provisions a workspace
 * without going through live Stripe Checkout first. Every other new
 * account must add a real card and go through the platform's live $29/mo
 * Stripe subscription (with its 14-day trial) before its workspace exists.
 */
export const FOUNDER_EMAIL = "aargardglobal@gmail.com";

/**
 * While Pro is in testing, only these workspace owner emails may select or
 * remain on the Pro tier — every other workspace can only subscribe to
 * Growth. This is a temporary gate; remove it (and PRICING_LOCKED stays
 * false) once Pro is ready for general availability. Enforced both in the
 * UI plan pickers (getSelectablePlansForEmail below) and, critically,
 * server-side in /api/subscriptions/checkout in server.ts, since a UI-only
 * restriction can be bypassed by calling the API directly.
 */
export const PRO_TESTER_EMAILS: string[] = ["ceo@aargard.com"];

/** Whether this email is allowed to select/stay on the Pro tier while it's
 * still testing-only. Case-insensitive. */
export function isProTesterEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return PRO_TESTER_EMAILS.some((e) => e.toLowerCase() === normalized);
}

/** The plans a given workspace owner email is allowed to see/select in any
 * plan picker. Filters Pro out of VISIBLE_SUBSCRIPTION_PLANS unless the
 * email is on the PRO_TESTER_EMAILS allowlist. */
export function getSelectablePlansForEmail(email: string | undefined | null): SubscriptionPlan[] {
  if (isProTesterEmail(email)) return VISIBLE_SUBSCRIPTION_PLANS;
  return VISIBLE_SUBSCRIPTION_PLANS.filter((p) => p.id !== "Pro");
}

/**
 * Stripe-hosted Payment Link for the platform's own $29/mo AarPex
 * subscription — this is the permanent, primary way every non-founder
 * sign-up / new workspace pays and starts its trial. It is a deliberate,
 * standing choice (not a stand-in for the API-driven Checkout Session flow):
 * it needs no STRIPE_SECRET_KEY at all, since Stripe hosts the page itself,
 * so it keeps working regardless of whether a secret key is ever configured
 * on this deployment. Do not route sign-up/new-workspace checkout back
 * through /api/subscriptions/checkout — this link is the one to keep using.
 *
 * IMPORTANT — one-time Stripe Dashboard setup for this to round-trip back
 * into the app: open this Payment Link in the Stripe Dashboard -> "After
 * payment" -> "Redirect customers to a specific page", and set the URL to
 *   https://aarpex.aarbook.com/app/?subscription=success&session_id={CHECKOUT_SESSION_ID}
 * (Stripe substitutes {CHECKOUT_SESSION_ID} automatically.) If a
 * STRIPE_SECRET_KEY is ever added later, that session_id lets
 * /api/subscriptions/verify-session pull back the real customer/
 * subscription/card details for the record — but the app provisions the
 * workspace on `subscription=success` alone either way, so this stays
 * fully functional with or without a secret key.
 */
export const PLATFORM_PAYMENT_LINK_URL = "https://buy.stripe.com/8x200j30d3EbdgS84f8Ra07";

/**
 * Stripe-hosted Payment Link for the $99/mo Pro plan — the same
 * no-STRIPE_SECRET_KEY-required mechanism as PLATFORM_PAYMENT_LINK_URL
 * above, just for the Pro tier. Needs the same one-time Stripe Dashboard
 * "After payment" redirect setup pointed back at
 * https://aarpex.aarbook.com/app/?subscription=success&session_id={CHECKOUT_SESSION_ID}
 * for the round-trip back into the app to work.
 */
export const PRO_PAYMENT_LINK_URL = "https://buy.stripe.com/14AeVd8kxeiPfp05W78Ra08";

/** Every visible plan's real Stripe Payment Link, keyed by plan id. Plans
 * without a live link yet (Starter, Enterprise -- both hidden anyway) are
 * simply absent, since nothing should ever redirect to them. */
export const PLAN_PAYMENT_LINKS: Partial<Record<SubscriptionPlan["id"], string>> = {
  Growth: PLATFORM_PAYMENT_LINK_URL,
  Pro: PRO_PAYMENT_LINK_URL,
};

/** Resolves the right Payment Link for a given plan id, falling back to the
 * default Growth link for a plan that doesn't have its own yet. */
export function getPaymentLinkUrlForPlan(planId: string | undefined | null): string {
  return (planId && PLAN_PAYMENT_LINKS[planId as SubscriptionPlan["id"]]) || PLATFORM_PAYMENT_LINK_URL;
}

/**
 * Builds the Payment Link URL for one specific sign-up/workspace attempt —
 * pre-fills the email on Stripe's hosted page and stamps a
 * `client_reference_id` so the payment can be matched back to this pending
 * record by hand in the Stripe Dashboard (Payments -> a given charge) while
 * no secret key is configured for automatic server-side verification.
 * `planId` picks which plan's Payment Link to use (defaults to Growth).
 */
export function buildPlatformPaymentLinkUrl(email: string, referenceId: string, planId?: string): string {
  const params = new URLSearchParams({
    prefilled_email: email,
    client_reference_id: referenceId,
  });
  return `${getPaymentLinkUrlForPlan(planId)}?${params.toString()}`;
}

/** Generates a short, locally-unique id to correlate a pending signup or
 * workspace with the Payment Link redirect it kicks off. */
export function generatePendingReferenceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `pend_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: "Starter",
    name: "Starter",
    tagline: "Essential CRM for solo founders & boutique teams",
    monthlyPrice: 29,
    annualPrice: 29,
    seats: 3,
    hidden: true,
    features: [
      "Up to 3 team members",
      "Unlimited leads, deals & contacts",
      "Interactive visual sales pipeline",
      "Hostinger Webmail & SMTP integration",
      "Custom invoice generator & PDF export",
      "Standard email support",
    ],
  },
  {
    id: "Growth",
    name: "Growth",
    tagline: "The complete AarPex CRM at one low starting price",
    monthlyPrice: 29,
    annualPrice: 29,
    seats: 5,
    features: [
      "Up to 5 team members",
      "Unlimited leads, deals, contacts & companies",
      "AarPex AI Sales Intelligence & Copilot",
      "WhatsApp Business API messaging",
      "Connect your own Stripe account for client billing",
      "Create subscription & one-time pricing for your customers",
      "Multi-currency billing (USD, EUR, GBP)",
      "Hostinger Webmail & SMTP integration",
      "Priority customer support",
    ],
  },
  {
    id: "Pro",
    name: "Pro",
    tagline: "For teams running multiple inboxes and heavier AI workflows",
    monthlyPrice: 99,
    annualPrice: 99,
    seats: 10,
    isPopular: true,
    features: [
      "Everything in Growth, plus:",
      "Connect multiple sending mailboxes",
      "Choose which mailbox sends each campaign",
      "WhatsApp Business API messaging",
      "AI Prompt Manager — customize the prompts behind every AI feature",
      "Analysis Manager — a searchable history of every AI analysis you've run",
      "Workspace Knowledge Base to ground AI answers in your own material",
      "Higher AI usage credit limits",
      "Up to 10 team members",
    ],
  },
  {
    id: "Enterprise",
    name: "Enterprise",
    tagline: "Global multi-tier organizations with full isolation",
    monthlyPrice: 29,
    annualPrice: 29,
    seats: 999,
    hidden: true,
    features: [
      "Unlimited team seats & users",
      "Dedicated PostgreSQL database schema",
      "Custom SMTP & IMAP routing rails",
      "Granular RBAC & Role-Based Access Control",
      "Custom branding & white-label invoices",
      "Full cryptographic audit logging",
      "Dedicated account engineer & 99.9% SLA",
    ],
  },
];

/** Plans that should actually appear in plan pickers / pricing pages. */
export const VISIBLE_SUBSCRIPTION_PLANS: SubscriptionPlan[] = SUBSCRIPTION_PLANS.filter((p) => !p.hidden);

/** The default plan every new workspace is provisioned on (Pro is an upgrade). */
export const PLATFORM_PLAN: SubscriptionPlan =
  SUBSCRIPTION_PLANS.find((p) => p.id === "Growth") || SUBSCRIPTION_PLANS[0];

/** Plan ids that unlock Pro-only functionality (multi-mailbox, Prompt
 * Manager, Analysis Manager, Knowledge Base, higher AI credit limits). */
export const PRO_TIER_PLAN_IDS: ReadonlyArray<SubscriptionPlan["id"]> = ["Pro", "Enterprise"];

/** Whether a given workspace plan has Pro-tier functionality unlocked. */
export function isProTierPlan(plan: string | undefined | null): boolean {
  return !!plan && (PRO_TIER_PLAN_IDS as readonly string[]).includes(plan);
}
