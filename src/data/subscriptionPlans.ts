export interface SubscriptionPlan {
  id: "Starter" | "Growth" | "Enterprise";
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
 * AarPex is currently sold as a single flat-rate subscription: $29/month
 * (with a 7-day free trial for new subscriptions), no tiers, no annual
 * discount. The Starter/Growth/Enterprise tier model below is kept intact
 * (id, seats, feature lists) so it can be reactivated later without a data
 * migration — but every plan picker in the app should read from
 * PLATFORM_PLAN / VISIBLE_SUBSCRIPTION_PLANS instead of the full
 * SUBSCRIPTION_PLANS array while this is true.
 */
export const PRICING_LOCKED = true;

/** Free trial length offered on the platform subscription. */
export const PLATFORM_TRIAL_DAYS = 7;

/**
 * The single exempt founder account — always kept active regardless of
 * billing status, and the only account that ever provisions a workspace
 * without going through live Stripe Checkout first. Every other new
 * account must add a real card and go through the platform's live $29/mo
 * Stripe subscription (with its 7-day trial) before its workspace exists.
 */
export const FOUNDER_EMAIL = "aargardglobal@gmail.com";

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
 * Builds the Payment Link URL for one specific sign-up/workspace attempt —
 * pre-fills the email on Stripe's hosted page and stamps a
 * `client_reference_id` so the payment can be matched back to this pending
 * record by hand in the Stripe Dashboard (Payments -> a given charge) while
 * no secret key is configured for automatic server-side verification.
 */
export function buildPlatformPaymentLinkUrl(email: string, referenceId: string): string {
  const params = new URLSearchParams({
    prefilled_email: email,
    client_reference_id: referenceId,
  });
  return `${PLATFORM_PAYMENT_LINK_URL}?${params.toString()}`;
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
    tagline: "The complete AarPex CRM — one flat price, everything included",
    monthlyPrice: 29,
    annualPrice: 29,
    seats: 5,
    isPopular: true,
    features: [
      "Up to 5 team members",
      "Unlimited leads, deals, contacts & companies",
      "Gemini AI Sales Intelligence & Copilot",
      "Connect your own Stripe account for client billing",
      "Create subscription & one-time pricing for your customers",
      "Multi-currency billing (USD, EUR, GBP)",
      "Hostinger Webmail & SMTP integration",
      "Priority customer support",
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

/** The single flat-rate plan every new workspace is provisioned on. */
export const PLATFORM_PLAN: SubscriptionPlan =
  SUBSCRIPTION_PLANS.find((p) => p.id === "Growth") || SUBSCRIPTION_PLANS[0];
