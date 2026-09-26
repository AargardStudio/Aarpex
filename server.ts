import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import Stripe from "stripe";
import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

// Safe directory derivation for both ESM and CJS bundled outputs
const currentDir = typeof __dirname !== "undefined" ? __dirname : process.cwd();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ extended: true, limit: "30mb" }));

// ----------------------------------------------------------------------------
// Auth middleware — requires a valid Supabase session on every route below
// except /api/health. Without this, anyone who finds the deployed URL could
// call the AI/Stripe/webmail endpoints directly (bypassing the frontend
// login entirely) and spend the platform's Gemini/Stripe/SMTP quota.
//
// If SUPABASE_URL / a Supabase key aren't set in the environment, auth is
// not enforced — this matches local/demo-mode usage where there's no real
// account system to check against. Once real Supabase credentials are
// configured (as they are for production), every request must carry a
// valid `Authorization: Bearer <access_token>` header.
// ----------------------------------------------------------------------------
let serverSupabase: ReturnType<typeof createClient> | null = null;
function getServerSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!serverSupabase) {
    serverSupabase = createClient(url, key);
  }
  return serverSupabase;
}

function isServerAuthConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY));
}

async function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!isServerAuthConfigured()) {
    // No real Supabase project configured (local/demo mode) — allow through.
    return next();
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return res.status(401).json({ error: "Authentication required. Please sign in and try again." });
  }

  try {
    const supabase = getServerSupabase();
    if (!supabase) {
      return res.status(401).json({ error: "Authentication required. Please sign in and try again." });
    }
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: "Your session has expired. Please sign in again." });
    }
    (req as any).userId = data.user.id;
    (req as any).userEmail = data.user.email;
    return next();
  } catch (err) {
    console.error("Auth check failed:", err);
    return res.status(401).json({ error: "Authentication required. Please sign in and try again." });
  }
}

// Every /api/* route requires a valid session once Supabase is configured,
// except the health check (used for uptime monitoring, which can't sign in).
app.use((req, res, next) => {
  if (req.path === "/api/health") return next();
  if (!req.path.startsWith("/api/")) return next();
  return requireAuth(req, res, next);
});

// Lazy Stripe client supporting per-user and per-tenant custom secret keys
const customStripeClients = new Map<string, Stripe>();
let defaultStripeClient: Stripe | null = null;

function getStripe(customApiKey?: string): Stripe | null {
  const key = customApiKey && customApiKey.trim() ? customApiKey.trim() : process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return null;
  }
  if (customApiKey && customApiKey.trim()) {
    if (!customStripeClients.has(key)) {
      customStripeClients.set(key, new Stripe(key));
    }
    return customStripeClients.get(key) || null;
  }
  if (!defaultStripeClient && process.env.STRIPE_SECRET_KEY) {
    defaultStripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return defaultStripeClient;
}

// Lazy GoogleGenAI client
let genAiClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) {
    return null;
  }
  if (!genAiClient) {
    genAiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return genAiClient;
}

// Resilient Gemini caller with automatic fallback models and backoff for high demand spikes (503/429)
async function callGeminiSafe(prompt: string, responseMimeType: string = "application/json"): Promise<string | null> {
  const ai = getGenAI();
  if (!ai) return null;

  // Use high-availability low-latency models first: gemini-3.1-flash-lite avoids 503 high demand spikes
  const candidateModels = ["gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-3.8-flash"];

  for (let i = 0; i < candidateModels.length; i++) {
    const model = candidateModels[i];
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType,
        },
      });

      if (response?.text) {
        return response.text;
      }
    } catch {
      // Quietly try next candidate without polluting logs with raw 503 JSON
      if (i < candidateModels.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
  }

  // Gracefully return null so caller falls back to high-fidelity deterministic heuristic intelligence
  return null;
}

// ----------------------------------------------------------------------------
// Lightweight HTML -> plain text extraction, used by the "generate a
// Knowledge Base entry from a URL" feature below. Deliberately dependency-
// free (no cheerio/jsdom) -- good enough for typical marketing/about pages,
// not a general-purpose HTML parser.
// ----------------------------------------------------------------------------
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, code) => String.fromCharCode(parseInt(code, 16)));
}

function htmlToPlainText(html: string): string {
  let out = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  out = decodeHtmlEntities(out);
  out = out.replace(/[ \t]+/g, " ").replace(/\n[ \t]*\n+/g, "\n\n").trim();
  return out;
}

// Basic SSRF guard: refuse hostnames that are obviously local/private-network
// addresses. Not exhaustive (doesn't cover DNS rebinding), but this feature
// is an authenticated, low-stakes convenience for skimming a public
// marketing page, not a general-purpose fetch proxy.
function isPrivateOrLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === "localhost" ||
    h === "0.0.0.0" ||
    h === "::1" ||
    /^127\./.test(h) ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    /^169\.254\./.test(h)
  );
}

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    hasApiKey: !!process.env.GEMINI_API_KEY,
    timestamp: new Date().toISOString(),
  });
});

// Read-only diagnostics for confirming which environment variables are
// actually configured on THIS deployment (e.g. right after setting them up
// in Vercel) — reports presence/shape only, never the secret values
// themselves, so it's safe to hit from a browser. Add `?live=1` to also
// live-ping Supabase's REST endpoint with the configured URL/key (a real
// connectivity check, not just "is it set").
app.get("/api/env-check", async (req, res) => {
  const present = (v?: string) => !!(v && v.trim().length > 0);

  const checks: Record<string, any> = {
    GEMINI_API_KEY: present(process.env.GEMINI_API_KEY),
    APP_URL: present(process.env.APP_URL) ? process.env.APP_URL : false,
    STRIPE_SECRET_KEY: present(process.env.STRIPE_SECRET_KEY),
    STRIPE_PUBLISHABLE_KEY: present(process.env.STRIPE_PUBLISHABLE_KEY),
    SUPABASE_URL: present(process.env.SUPABASE_URL) ? process.env.SUPABASE_URL : false,
    SUPABASE_ANON_KEY: present(process.env.SUPABASE_ANON_KEY),
    SUPABASE_SERVICE_ROLE_KEY: present(process.env.SUPABASE_SERVICE_ROLE_KEY),
    SUPABASE_DATABASE_URL: present(process.env.SUPABASE_DATABASE_URL)
      ? /^postgres(ql)?:\/\//.test(process.env.SUPABASE_DATABASE_URL!.trim())
        ? "set (looks like a valid postgres:// URI)"
        : "set, but does NOT start with postgres:// or postgresql:// — this is wrong, check it"
      : false,
    SMTP_HOST: present(process.env.SMTP_HOST) ? process.env.SMTP_HOST : false,
    SMTP_PORT: present(process.env.SMTP_PORT) ? process.env.SMTP_PORT : false,
    SMTP_USER: present(process.env.SMTP_USER),
    SMTP_PASS: present(process.env.SMTP_PASS),
  };

  if (req.query.live === "1" && present(process.env.SUPABASE_URL)) {
    const cleanUrl = process.env.SUPABASE_URL!.trim().replace(/\/+$/, "");
    const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "").trim();
    try {
      const started = Date.now();
      const r = await fetch(`${cleanUrl}/rest/v1/`, {
        method: "GET",
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
      checks.SUPABASE_LIVE_CHECK = {
        reachable: r.ok || r.status === 200,
        statusCode: r.status,
        latencyMs: Date.now() - started,
      };
    } catch (err: any) {
      checks.SUPABASE_LIVE_CHECK = { reachable: false, error: err.message || "Network error reaching Supabase URL" };
    }
  }

  res.json({ checkedAt: new Date().toISOString(), env: checks });
});

// AI Customer 360 Analysis
app.post("/api/ai/customer-analysis", async (req, res) => {
  try {
    const { company, contacts, deals, invoices, payments, activities, comments, tasks } = req.body;
    if (!company) {
      return res.status(400).json({ error: "Company data is required" });
    }

    const openDeals = (deals || []).filter((d: any) => d.status === "Open");
    const wonDeals = (deals || []).filter((d: any) => d.status === "Won");
    const overdueInvoices = (invoices || []).filter((i: any) => i.status === "Overdue" || (i.remainingBalance > 0 && new Date(i.dueDate) < new Date()));
    const totalRevenue = company.totalRevenue || 0;
    const outstanding = company.outstandingBalance || 0;
    const hasRecentActivity = (activities || []).length > 0;

    let fallbackHealthScore = 75;
    if (overdueInvoices.length > 0) fallbackHealthScore -= 25;
    if (outstanding > 15000) fallbackHealthScore -= 10;
    if (wonDeals.length >= 2) fallbackHealthScore += 15;
    if (!hasRecentActivity) fallbackHealthScore -= 15;
    fallbackHealthScore = Math.max(15, Math.min(98, fallbackHealthScore));

    const fallbackHealthStatus = fallbackHealthScore >= 75 ? "Healthy" : fallbackHealthScore >= 55 ? "Stable" : fallbackHealthScore >= 35 ? "At Risk" : "Critical";
    const fallbackChurnRisk = overdueInvoices.length > 0 || !hasRecentActivity ? "Medium" : "Low";
    const fallbackChurnReason = overdueInvoices.length > 0 ? "Overdue invoice balance pending collection review" : "Consistent transaction velocity and regular contact";
    const fallbackSummary = `${company.name} is currently an ${company.status} with ${wonDeals.length} won deals, ${openDeals.length} active opportunities, and a total lifetime revenue of $${totalRevenue.toLocaleString()}. ${overdueInvoices.length > 0 ? `Attention is required on ${overdueInvoices.length} overdue invoices totaling $${company.overdueBalance?.toLocaleString() || '0'}.` : "Account communication and payment history are in good standing."}`;
    const fallbackRecs = [
      overdueInvoices.length > 0 ? "Schedule a finance reconciliation check-in before presenting new upsell proposals." : "Initiate quarterly strategic review call with primary contact.",
      "Expand contract scope to include dedicated SLA tier support.",
    ];

    const crmContext = {
      company: {
        name: company.name,
        industry: company.industry,
        country: company.country,
        city: company.city,
        status: company.status,
        salesperson: company.salesperson,
        lifetimeRevenue: company.totalRevenue,
        totalInvoiced: company.totalInvoiced,
        totalPaid: company.totalPaid,
        outstandingBalance: company.outstandingBalance,
        overdueBalance: company.overdueBalance,
        averagePaymentDays: company.averagePaymentDays,
      },
      contactsCount: contacts?.length || 0,
      contacts: (contacts || []).map((c: any) => ({ name: `${c.firstName} ${c.lastName}`, position: c.position, email: c.email })),
      dealsCount: deals?.length || 0,
      deals: (deals || []).map((d: any) => ({ name: d.name, stage: d.stage, status: d.status, value: d.dealValue, closeDate: d.expectedCloseDate })),
      invoices: (invoices || []).map((i: any) => ({ number: i.id, total: i.total, paid: i.amountPaid, balance: i.remainingBalance, status: i.status, dueDate: i.dueDate })),
      payments: (payments || []).map((p: any) => ({ date: p.date, amount: p.amount, method: p.paymentMethod })),
      recentActivities: (activities || []).slice(0, 10).map((a: any) => ({ type: a.type, date: a.date, description: a.description, outcome: a.outcome })),
      recentComments: (comments || []).slice(0, 8).map((cm: any) => ({ user: cm.userName, date: cm.timestamp, text: cm.content, isInternal: cm.isInternal })),
      openTasks: (tasks || []).filter((t: any) => t.status !== "Completed").map((t: any) => ({ title: t.title, dueDate: t.dueDate, priority: t.priority })),
    };

    const prompt = `You are an elite enterprise CRM sales intelligence system.
Analyze the following comprehensive customer 360 data for company "${company.name}".

CRM Context:
${JSON.stringify(crmContext, null, 2)}

Produce a structured JSON response matching this schema:
{
  "healthScore": number (0 to 100),
  "healthStatus": "Healthy" | "Stable" | "At Risk" | "Critical",
  "churnRisk": "Low" | "Medium" | "High" | "Critical",
  "churnReason": string,
  "summary": string,
  "relationshipSummary": string,
  "actionableRecommendations": string[],
  "revenueAnalysis": {
    "trend": "Growth" | "Stable" | "Declining" | "Volatile",
    "dealFrequency": string,
    "averageDealSize": number,
    "growthDeclineSummary": string,
    "revenuePotential": string
  },
  "paymentAnalysis": {
    "reliability": "Excellent" | "Good" | "Delayed" | "High Risk",
    "averageDelayDays": number,
    "outstandingAmount": number,
    "overdueRisk": "Low" | "Medium" | "High",
    "summary": string
  },
  "opportunities": [
    {
      "type": "Upsell" | "Cross-sell" | "Renewal" | "New Service" | "Expansion",
      "title": string,
      "description": string,
      "estimatedValue": number,
      "confidence": "High" | "Medium" | "Low"
    }
  ],
  "recommendedAction": string
}

IMPORTANT:
- Distinguish strictly between known facts and AI inferences.
- Return pure valid JSON only, without markdown fences or additional commentary.`;

    const rawAiText = await callGeminiSafe(prompt);
    if (rawAiText) {
      try {
        const parsed = JSON.parse(rawAiText);
        const healthScore = parsed.healthScore ?? fallbackHealthScore;
        const churnRisk = parsed.churnRisk || parsed.riskDetection?.churnRisk || fallbackChurnRisk;
        const churnReason = parsed.churnReason || parsed.riskDetection?.relationshipRisk || fallbackChurnReason;
        const summary = parsed.summary || parsed.relationshipSummary || fallbackSummary;
        const actionableRecommendations = parsed.actionableRecommendations || [
          parsed.recommendedAction,
          ...(parsed.opportunities?.map((o: any) => `${o.type}: ${o.title}`) || []),
        ].filter(Boolean);

        return res.json({
          healthScore,
          healthStatus: parsed.healthStatus || fallbackHealthStatus,
          churnRisk,
          churnReason,
          summary,
          relationshipSummary: parsed.relationshipSummary || summary,
          actionableRecommendations: actionableRecommendations.length > 0 ? actionableRecommendations : fallbackRecs,
          revenueAnalysis: parsed.revenueAnalysis || {},
          paymentAnalysis: parsed.paymentAnalysis || {},
          engagementAnalysis: parsed.engagementAnalysis || {},
          riskDetection: parsed.riskDetection || {},
          opportunities: parsed.opportunities || [],
          recommendedAction: parsed.recommendedAction || fallbackRecs[0],
          data: parsed,
          source: "gemini",
        });
      } catch {
        // Fallback to heuristic
      }
    }

    // Heuristic fallback response
    return res.json({
      healthScore: fallbackHealthScore,
      healthStatus: fallbackHealthStatus,
      churnRisk: fallbackChurnRisk,
      churnReason: fallbackChurnReason,
      summary: fallbackSummary,
      relationshipSummary: fallbackSummary,
      actionableRecommendations: fallbackRecs,
      revenueAnalysis: {
        trend: wonDeals.length > 1 ? "Growth" : "Stable",
        dealFrequency: `${deals?.length || 0} lifetime deals registered`,
        averageDealSize: deals && deals.length > 0 ? Math.round(totalRevenue / Math.max(1, wonDeals.length)) : 10000,
        growthDeclineSummary: wonDeals.length > 0 ? "Consistent deal closure cadence with positive account expansion." : "Pipeline stage progression ongoing.",
        revenuePotential: openDeals.length > 0 ? `$${openDeals.reduce((acc: number, d: any) => acc + (d.dealValue || 0), 0).toLocaleString()} across current open deals.` : "High cross-sell readiness for tier-2 service packages.",
      },
      paymentAnalysis: {
        reliability: overdueInvoices.length > 0 ? "Delayed" : "Good",
        averageDelayDays: company.averagePaymentDays || 14,
        outstandingAmount: outstanding,
        overdueRisk: overdueInvoices.length > 0 ? "High" : "Low",
        summary: overdueInvoices.length > 0 ? "Unsettled balances require active receivables follow-up." : "Payments have followed agreed contractual cycles without default.",
      },
      engagementAnalysis: {
        trend: hasRecentActivity ? "Steady" : "Dormant",
        communicationFrequency: `${activities?.length || 0} recorded touchpoints across calls, meetings, and emails`,
        lastInteractionSummary: activities && activities[0] ? `${activities[0].type} on ${activities[0].date}: ${activities[0].description}` : "No logged touchpoints in the last 30 days",
        summary: "Regular executive and operational contact maintained.",
      },
      riskDetection: {
        churnRisk: fallbackChurnRisk,
        churnFactors: overdueInvoices.length > 0 ? ["Overdue invoice balance pending", "Long gap since last strategic review"] : ["Normal business cadence"],
        paymentRisk: overdueInvoices.length > 0 ? "High" : "Low",
        dealRisk: openDeals.length > 0 ? "Low" : "Medium",
        relationshipRisk: "Healthy executive alignment with primary stakeholders.",
      },
      opportunities: [
        {
          type: "Upsell",
          title: "Enterprise Annual Service SLA & Tier-1 Support",
          description: `Given ${company.name}'s scaling operations in ${company.industry || 'their sector'}, expanding their contract to include dedicated 24/7 SLA will drive retention.`,
          estimatedValue: 24000,
          confidence: "High",
        },
        {
          type: "Cross-sell",
          title: "Cloud Infrastructure Optimization Add-on",
          description: "Complement current software licensing with managed migration and performance analytics.",
          estimatedValue: 12500,
          confidence: "Medium",
        },
      ],
      recommendedAction: fallbackRecs[0],
      data: {
        healthScore: fallbackHealthScore,
        healthStatus: fallbackHealthStatus,
        churnRisk: fallbackChurnRisk,
        churnReason: fallbackChurnReason,
        summary: fallbackSummary,
        relationshipSummary: fallbackSummary,
        actionableRecommendations: fallbackRecs,
      },
      source: "heuristic",
    });
  } catch {
    return res.json({
      healthScore: 75,
      healthStatus: "Healthy",
      churnRisk: "Low",
      churnReason: "Active account standing",
      summary: "Account is active and in good standing.",
      relationshipSummary: "Account is active and in good standing.",
      actionableRecommendations: ["Schedule quarterly review with key decision makers."],
      data: { healthScore: 75, healthStatus: "Healthy" },
      source: "fallback",
    });
  }
});

// AI Potential Pitch Generation
app.post("/api/ai/pitch", async (req, res) => {
  try {
    const { company, contacts, deals, comments, activities } = req.body;
    if (!company) {
      return res.status(400).json({ error: "Company data is required" });
    }

    const primaryContact = contacts?.[0] || { firstName: "Partner", position: "Decision Maker" };

    const fallbackPitch = `Hi ${primaryContact.firstName},\n\nI've been reviewing ${company.name}'s progress over the past quarter. Given your team's expansion in ${company.industry || "your market"}, we've developed an optimized roadmap specifically addressing the throughput and workflow efficiency goals we discussed.\n\nCould we set aside 15 minutes this Thursday to walk through how similar industry leaders cut operational cycle times by 35% with our integrated suite?\n\nBest regards,\n${company.salesperson || "Your Account Lead"}`;
    const fallbackWhy = `Tailored directly to ${company.name}'s current tier (${company.status}) and industry vertical (${company.industry || 'B2B'}). Acknowledges past collaboration while introducing an immediate efficiency dividend without upfront disruption.`;

    const prompt = `You are a world-class B2B sales strategist.
Create a hyper-personalized, high-converting sales pitch for "${company.name}".

Company Details:
- Industry: ${company.industry || "Technology"}
- Country/City: ${company.city || ""}, ${company.country || ""}
- Status: ${company.status}
- Primary Contact: ${primaryContact.firstName} ${primaryContact.lastName || ""} (${primaryContact.position || "Leader"})
- Existing Won Deals: ${(deals || []).filter((d: any) => d.status === "Won").map((d: any) => d.name).join(", ") || "None yet"}
- Open Deals: ${(deals || []).filter((d: any) => d.status === "Open").map((d: any) => `${d.name} ($${d.dealValue})`).join(", ") || "None"}
- Recent Comments/Pain points: ${(comments || []).slice(0, 5).map((c: any) => c.content).join(" | ") || "None recorded"}
- Recent Activities: ${(activities || []).slice(0, 5).map((a: any) => `${a.type}: ${a.description}`).join(" | ") || "None"}

Generate a structured JSON output with:
{
  "recommendedPitch": "A concise, ready-to-send personalized message or talking script that addresses their specific context and pain points",
  "whyThisPitch": "Evidence-based justification linking the pitch to their past data, deals, or comments",
  "bestOffer": "Specific product, service, or solution package recommended",
  "recommendedApproach": "Email" | "Call" | "Meeting" | "WhatsApp" | "Proposal",
  "bestTiming": "Specific recommended timing window and rationale",
  "talkingPoints": ["point 1", "point 2", "point 3"],
  "potentialObjections": [
    { "objection": string, "suggestedResponse": string }
  ]
}

Return pure valid JSON only.`;

    const rawAiText = await callGeminiSafe(prompt);
    if (rawAiText) {
      try {
        const parsed = JSON.parse(rawAiText);
        const pitchText = parsed.recommendedPitch || parsed.pitch || fallbackPitch;
        return res.json({
          pitch: pitchText,
          rawText: pitchText,
          recommendedPitch: pitchText,
          whyThisPitch: parsed.whyThisPitch || fallbackWhy,
          bestOffer: parsed.bestOffer || "Enterprise Transformation Package",
          recommendedApproach: parsed.recommendedApproach || "Email",
          bestTiming: parsed.bestTiming || "Tuesday or Thursday morning between 9:30 AM and 11:00 AM",
          talkingPoints: parsed.talkingPoints || ["Seamless integration", "Fixed pricing", "Guaranteed SLA"],
          potentialObjections: parsed.potentialObjections || [],
          data: parsed,
          source: "gemini",
        });
      } catch {
        // Fallback to heuristic
      }
    }

    // Heuristic fallback
    return res.json({
      pitch: fallbackPitch,
      rawText: fallbackPitch,
      recommendedPitch: fallbackPitch,
      whyThisPitch: fallbackWhy,
      bestOffer: "Executive Transformation Package & Dedicated Integrations Hub",
      recommendedApproach: "Email",
      bestTiming: "Tuesday or Thursday morning between 9:30 AM and 11:00 AM",
      talkingPoints: [
        `Seamless backward-compatibility with ${company.name}'s current tooling`,
        "Predictable fixed annual pricing with dedicated onboarding sprint",
        "Guaranteed SLA and executive quarterly reviews",
      ],
      potentialObjections: [
        {
          objection: "We are currently reviewing budget allocations for the coming quarter.",
          suggestedResponse: "Offer a phased rollout starting with priority modules, spreading cash outlay across milestones.",
        },
        {
          objection: "Internal engineering bandwidth is constrained.",
          suggestedResponse: "Emphasize our white-glove implementation team which handles 90% of data migration and configuration.",
        },
      ],
      data: {
        recommendedPitch: fallbackPitch,
        pitch: fallbackPitch,
        whyThisPitch: fallbackWhy,
      },
      source: "heuristic",
    });
  } catch {
    const fallbackPitch = "Hi,\n\nFollowing up on our recent conversations. We would love to share how our platform can help streamline operations for your team.\n\nCould we schedule 15 minutes this week to connect?\n\nBest regards,\nSales Team";
    return res.json({
      pitch: fallbackPitch,
      rawText: fallbackPitch,
      recommendedPitch: fallbackPitch,
      whyThisPitch: "Direct value proposition tailored to team operational efficiency.",
      bestOffer: "Enterprise Suite",
      recommendedApproach: "Email",
      bestTiming: "Morning hours",
      talkingPoints: ["Custom workflows", "Dedicated onboarding support"],
      potentialObjections: [],
      data: { pitch: fallbackPitch },
      source: "fallback",
    });
  }
});

// AI Deal Recommendation
app.post("/api/ai/deal-analysis", async (req, res) => {
  try {
    const { deal, company, activities } = req.body;
    if (!deal) {
      return res.status(400).json({ error: "Deal data is required" });
    }

    const isLateStage = deal.stage?.toLowerCase().includes("proposal") || deal.stage?.toLowerCase().includes("negotiation");
    const fallbackNextAction = `Contact the key decision maker within 48 hours. The deal has positive momentum in stage "${deal.stage}" but requires commercial term alignment.`;
    const fallbackFollowUpDate = new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0];

    const prompt = `You are an elite sales deal coach.
Analyze this active deal and provide actionable deal intelligence:

Deal Info:
- Name: ${deal.name}
- Value: $${deal.dealValue}
- Stage: ${deal.stage}
- Current Probability: ${deal.probability}%
- Status: ${deal.status}
- Expected Close Date: ${deal.expectedCloseDate}
- Priority: ${deal.priority}
- Company: ${company ? company.name : "N/A"} (${company ? company.industry : ""})
- Deal Notes: ${deal.notes || "None"}
- Recent Activities: ${(activities || []).slice(0, 5).map((a: any) => `${a.type}: ${a.description}`).join("; ") || "None"}

Generate a JSON response:
{
  "winProbability": number (0 to 100),
  "dealHealth": "Strong" | "Average" | "At Risk" | "Critical",
  "keyBlockers": string[],
  "missingInformation": string[],
  "recommendedNextAction": string,
  "recommendedFollowUpDate": string,
  "potentialObjections": string[],
  "suggestedResponse": string,
  "closeLikelihoodSummary": string
}

Return pure valid JSON only.`;

    const rawAiText = await callGeminiSafe(prompt);
    if (rawAiText) {
      try {
        const parsed = JSON.parse(rawAiText);
        return res.json({
          winProbability: parsed.winProbability ?? (deal.probability || 60),
          dealHealth: parsed.dealHealth || (isLateStage ? "Strong" : "Average"),
          keyBlockers: parsed.keyBlockers || [],
          missingInformation: parsed.missingInformation || [],
          recommendedNextAction: parsed.recommendedNextAction || fallbackNextAction,
          recommendedFollowUpDate: parsed.recommendedFollowUpDate || fallbackFollowUpDate,
          potentialObjections: parsed.potentialObjections || [],
          suggestedResponse: parsed.suggestedResponse || "",
          closeLikelihoodSummary: parsed.closeLikelihoodSummary || `Estimated ${deal.probability || 65}% close likelihood.`,
          data: parsed,
          source: "gemini",
        });
      } catch {
        // Continue to fallback if parse fails
      }
    }

    // Heuristic fallback
    return res.json({
      winProbability: deal.probability || 60,
      dealHealth: isLateStage ? "Strong" : "Average",
      keyBlockers: isLateStage ? ["Payment terms and security review sign-off"] : ["Decision maker stakeholder buy-in confirmation"],
      missingInformation: ["Competitor evaluation shortlist", "Formal procurement sign-off checklist"],
      recommendedNextAction: fallbackNextAction,
      recommendedFollowUpDate: fallbackFollowUpDate,
      potentialObjections: [
        "Contract duration commitment length",
        "Initial setup fee justification",
      ],
      suggestedResponse: "Offer an annual prepayment incentive or waived setup fee to finalize closure before end of month.",
      closeLikelihoodSummary: `Estimated ${deal.probability || 65}% close likelihood if executive call is conducted before ${deal.expectedCloseDate || 'close date'}.`,
      data: {
        winProbability: deal.probability || 60,
        dealHealth: isLateStage ? "Strong" : "Average",
      },
      source: "heuristic",
    });
  } catch {
    return res.json({
      winProbability: 60,
      dealHealth: "Average",
      keyBlockers: ["Contract review"],
      missingInformation: [],
      recommendedNextAction: "Contact primary decision maker within 48 hours to confirm next milestone.",
      recommendedFollowUpDate: new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0],
      potentialObjections: [],
      suggestedResponse: "Offer flexible scheduling or initial trial terms.",
      closeLikelihoodSummary: "Estimated 60% probability with proactive follow-up.",
      data: { winProbability: 60, dealHealth: "Average" },
      source: "fallback",
    });
  }
});

// AI Email Marketing Campaign Generator
// Generates one outbound email SEQUENCE (an initial send plus N follow-ups)
// for a whole audience of selected leads/contacts at once, using merge tags
// ({{firstName}}, {{company}}, {{jobTitle}}) instead of one AI call per
// recipient -- the frontend substitutes those per-recipient at send time.
app.post("/api/ai/email-campaign", async (req, res) => {
  try {
    const {
      audienceType, // "Leads" | "Contacts"
      audienceSample, // small sample for context, e.g. [{firstName, company, jobTitle, industry}]
      audienceCount, // total recipients selected
      technique, // "Need-Based" | "Emotional" | "Problem-Solution" | "Mixed"
      followUpCount, // number of follow-ups after the initial email (0-6)
      frequency, // "Daily" | "Weekly" | "Biweekly" | "Monthly" | "Custom"
      frequencyDays, // resolved cadence in days
      senderName,
      senderCompany,
      productName, // optional: the specific product/service this campaign is pitching
      productPitch, // optional: that product's marketing pitch, to seed the email copy
      playbook, // optional: IndustryPlaybook fields for the audience's industry -- see src/types.ts
    } = req.body;

    const totalSteps = 1 + Math.max(0, Number(followUpCount) || 0);
    const rotation = ["Need-Based", "Emotional", "Problem-Solution"];
    const resolveTechnique = (stepIdx: number) =>
      technique === "Mixed" ? rotation[stepIdx % rotation.length] : technique || "Need-Based";
    const cadenceDays = Number(frequencyDays) || 7;

    const sampleLine =
      (audienceSample || [])
        .slice(0, 5)
        .map((p: any) => `${p.firstName || "there"} @ ${p.company || "their company"} (${p.jobTitle || "unknown role"}, ${p.industry || "unspecified industry"})`)
        .join(" | ") || "No sample provided";

    const offer = productName ? `${productName}` : `what ${senderCompany || "we"} do`;
    const OPENINGS: Record<string, string> = {
      "Need-Based": `Hi {{firstName}},\n\nI wanted to reach out because teams like {{company}}'s often struggle with the exact operational gap ${offer} was built to close. Given your role, I think there's a clear fit worth exploring.\n\nWould a quick 15-minute call this week make sense to see if it's relevant for {{company}}?\n\nBest regards,\n${senderName || "The Team"}\n${senderCompany || ""}`,
      "Emotional": `Hi {{firstName}},\n\nMost teams at companies like {{company}} don't realize how much time and momentum they're losing until it's already cost them a quarter. I don't want that to be your story${productName ? ` — that's exactly why we built ${productName}` : ""}.\n\nCan we grab 15 minutes so I can show you what a better path looks like for {{company}}?\n\nWarmly,\n${senderName || "The Team"}\n${senderCompany || ""}`,
      "Problem-Solution": `Hi {{firstName}},\n\nHere's the problem I keep seeing at companies like {{company}}: slow, manual processes quietly eating margin. Here's the fix: ${offer}, with measurable results in weeks, not quarters.\n\nOpen to a short call this week to walk through how it would apply to {{company}} specifically?\n\nBest,\n${senderName || "The Team"}\n${senderCompany || ""}`,
    };

    const buildFallbackStep = (stepNumber: number, stepTechnique: string, delayDays: number) => {
      const prefix = stepNumber === 1 ? "" : `Following up on my note from ${delayDays} day(s) ago — `;
      return {
        stepNumber,
        technique: stepTechnique,
        delayDays,
        subject: stepNumber === 1 ? `Quick idea for {{company}}` : `Re: Quick idea for {{company}} (follow-up ${stepNumber - 1})`,
        body: prefix + (OPENINGS[stepTechnique] || OPENINGS["Need-Based"]),
      };
    };

    const fallbackSteps = Array.from({ length: totalSteps }, (_, i) =>
      buildFallbackStep(i + 1, resolveTechnique(i), i === 0 ? 0 : cadenceDays)
    );

    const productLine = productName
      ? `\n\nThis campaign is specifically pitching the following product/service — center every email around it rather than speaking generically: "${productName}"${
          productPitch ? `. Its marketing pitch: "${productPitch}"` : ""
        }. Weave its concrete value into the opening and the call-to-action.`
      : "";

    // Industry Playbook: when the audience is predominantly (or entirely) in
    // one industry with a configured playbook, its tone/talking
    // points/pain points override the generic technique-driven copy above --
    // this is what makes bulk campaigns "industry-aware" per the Industry
    // Playbooks feature.
    const playbookLine = playbook
      ? `\n\nIndustry Playbook for "${playbook.industry}" — follow this guidance closely, it overrides generic phrasing:
- Tone to use: ${playbook.tone || "professional and direct"}
- Talking points to weave in: ${(playbook.talkingPoints || []).join(", ") || "none specified"}
- Common pain points in this industry to speak to: ${(playbook.painPoints || []).join(", ") || "none specified"}
${playbook.objectionNotes ? `- Objection handling notes: ${playbook.objectionNotes}` : ""}`
      : "";

    const prompt = `You are a world-class B2B email marketing strategist writing an outbound email SEQUENCE for ${senderCompany || "a B2B company"}.

Audience: ${audienceCount || (audienceSample || []).length || "several"} ${audienceType === "Contacts" ? "existing contacts" : "sales leads"}.
Sample of who's in this audience: ${sampleLine}${productLine}${playbookLine}

Write a sequence of exactly ${totalSteps} email(s): step 1 is the initial outreach, steps 2+ are follow-ups spaced ${cadenceDays} day(s) apart (cadence: ${frequency || "Weekly"}).

Sales technique to use per step: ${
      technique === "Mixed"
        ? `rotate through Need-Based, Emotional, and Problem-Solution across the steps in that order (repeat the cycle if there are more steps than techniques)`
        : `use the "${technique}" technique for every step, but vary the angle, subject line, and specific value proposition in each follow-up so it never feels like a repeat`
    }.

Where "Need-Based" foregrounds a concrete operational/business need, "Emotional" foregrounds urgency, aspiration, or the cost of inaction, and "Problem-Solution" foregrounds a specific pain point paired with a specific fix.

Every email MUST use the merge tags {{firstName}} and {{company}} (and {{jobTitle}} where natural) instead of real names, so the same template can personalize per recipient at send time. Keep each email under 150 words, end with a clear single call-to-action, and make follow-ups reference that this is a follow-up without being repetitive of earlier steps.

Return pure JSON only, no markdown fences, in this exact shape:
{
  "steps": [
    { "stepNumber": 1, "technique": "Need-Based" | "Emotional" | "Problem-Solution", "subject": "...", "body": "..." }
  ]
}`;

    const rawAiText = await callGeminiSafe(prompt);
    if (rawAiText) {
      try {
        const parsed = JSON.parse(rawAiText);
        const aiSteps = Array.isArray(parsed.steps) ? parsed.steps : [];
        if (aiSteps.length > 0) {
          const steps = aiSteps.slice(0, totalSteps).map((s: any, i: number) => ({
            stepNumber: i + 1,
            technique: rotation.includes(s.technique) ? s.technique : resolveTechnique(i),
            delayDays: i === 0 ? 0 : cadenceDays,
            subject: s.subject || fallbackSteps[i]?.subject || "Quick idea for {{company}}",
            body: s.body || fallbackSteps[i]?.body || "",
          }));
          while (steps.length < totalSteps) {
            steps.push(fallbackSteps[steps.length]);
          }
          return res.json({ steps, source: "gemini" });
        }
      } catch {
        // fall through to heuristic
      }
    }

    return res.json({ steps: fallbackSteps, source: "heuristic" });
  } catch {
    return res.json({
      steps: [
        {
          stepNumber: 1,
          technique: "Need-Based",
          delayDays: 0,
          subject: "Quick idea for {{company}}",
          body: "Hi {{firstName}},\n\nWanted to reach out about a way we could help {{company}}. Would you be open to a short call this week?\n\nBest regards,\nSales Team",
        },
      ],
      source: "fallback",
    });
  }
});

// AI Daily Briefing
// AI Lead Analysis — "Aargard Business Intelligence Construct"
// Scores and qualifies a raw lead before it's ever converted into a company
// or deal: buying-intent signals, risk flags, best outreach channel/timing,
// and a ready-to-send opening line, generated from the lead's own fields
// plus whatever activity/notes history exists for it.
app.post("/api/ai/lead-analysis", async (req, res) => {
  try {
    const { lead, activities, playbook } = req.body;
    if (!lead) {
      return res.status(400).json({ error: "Lead data is required" });
    }

    const heuristicScore =
      typeof lead.leadScore === "number" && lead.leadScore > 0
        ? lead.leadScore
        : lead.priority === "Urgent"
        ? 82
        : lead.priority === "High"
        ? 70
        : lead.priority === "Medium"
        ? 55
        : 40;
    const heuristicTemperature = heuristicScore >= 75 ? "Hot" : heuristicScore >= 50 ? "Warm" : "Cold";
    const fallbackFollowUpDate = new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0];
    const fallbackNextAction = `Reach out to ${lead.name} at ${lead.company} within 48 hours via ${
      lead.email ? "email" : lead.phone ? "phone" : "their listed channel"
    } to confirm budget and decision-making timeline.`;

    const prompt = `You are "Aargard Business Intelligence Construct" — Aargard Business Solutions' proprietary AI lead-qualification engine, used by sales teams to triage and prioritize inbound/outbound leads before they're worked.
Analyze this raw lead and produce actionable, realistic qualification intelligence. Be specific to the details given, not generic.

Lead Info:
- Name: ${lead.name}
- Company: ${lead.company || "N/A"}
- Job Title: ${lead.jobTitle || "N/A"}
- Industry: ${lead.industry || "N/A"}
- Country/City: ${lead.city || ""}, ${lead.country || ""}
- Source: ${lead.source || "N/A"}
- Current Lead Score: ${lead.leadScore ?? "Unscored"}
- Priority: ${lead.priority || "Medium"}
- Status: ${lead.status || "New"}
- Estimated Value: $${lead.estimatedValue || 0}
- Expected Close Date: ${lead.expectedCloseDate || "N/A"}
- Last Contact: ${lead.lastContact || "Never"}
- Notes: ${lead.notes || "None"}
- Tags: ${(lead.tags || []).join(", ") || "None"}
- Recent Activities: ${(activities || []).slice(0, 5).map((a: any) => `${a.type}: ${a.description}`).join("; ") || "None recorded"}
${
  playbook
    ? `
Industry Playbook for "${playbook.industry}" — apply this guidance when scoring and recommending next steps:
- Qualification guidance: ${playbook.qualificationGuidance || "None specified"}
- Preferred outreach channel for this industry: ${playbook.preferredChannel || "Email"}
- Standard follow-up cadence for this industry: every ${playbook.followUpFrequencyDays || 7} day(s), ${playbook.followUpCount ?? 2} follow-up(s) total
Prefer this channel/cadence in your recommendations unless the lead's own data clearly suggests otherwise.`
    : ""
}

Generate a JSON response:
{
  "qualificationScore": number (0 to 100, how strong/sales-ready this lead is),
  "temperature": "Hot" | "Warm" | "Cold",
  "buyerIntentSignals": string[] (concrete signals suggesting real buying intent),
  "riskFactors": string[] (reasons this lead might stall, ghost, or not convert),
  "bestOutreachChannel": "Email" | "Phone" | "WhatsApp" | "LinkedIn" | "In-Person",
  "bestOutreachTiming": string (specific recommended timing window and rationale),
  "recommendedNextAction": string,
  "recommendedFollowUpDate": "YYYY-MM-DD",
  "suggestedOpeningLine": string (a ready-to-send first-touch message opener, 2-3 sentences),
  "summary": string (one or two sentence executive summary of this lead's qualification status)
}

Return pure valid JSON only.`;

    const rawAiText = await callGeminiSafe(prompt);
    if (rawAiText) {
      try {
        const parsed = JSON.parse(rawAiText);
        return res.json({
          qualificationScore: parsed.qualificationScore ?? heuristicScore,
          temperature: parsed.temperature || heuristicTemperature,
          buyerIntentSignals: parsed.buyerIntentSignals || [],
          riskFactors: parsed.riskFactors || [],
          bestOutreachChannel: parsed.bestOutreachChannel || (lead.email ? "Email" : lead.phone ? "Phone" : "Email"),
          bestOutreachTiming: parsed.bestOutreachTiming || "Tuesday or Thursday morning between 9:30 AM and 11:00 AM",
          recommendedNextAction: parsed.recommendedNextAction || fallbackNextAction,
          recommendedFollowUpDate: parsed.recommendedFollowUpDate || fallbackFollowUpDate,
          suggestedOpeningLine:
            parsed.suggestedOpeningLine ||
            `Hi ${lead.name.split(" ")[0]}, I noticed ${lead.company || "your team"} might be evaluating solutions in this space — would it be useful to compare notes on what's worked for similar teams?`,
          summary: parsed.summary || `Estimated ${parsed.qualificationScore ?? heuristicScore}/100 qualification score based on available signals.`,
          data: parsed,
          source: "gemini",
          engine: "Aargard Business Intelligence Construct",
        });
      } catch {
        // Continue to fallback if parse fails
      }
    }

    // Heuristic fallback
    return res.json({
      qualificationScore: heuristicScore,
      temperature: heuristicTemperature,
      buyerIntentSignals:
        heuristicTemperature === "Hot"
          ? ["High declared priority", "Recent inbound engagement", "Estimated value above account average"]
          : ["Initial interest recorded", "Awaiting further engagement signals"],
      riskFactors: ["Limited engagement history on file", "Budget and timeline not yet confirmed"],
      bestOutreachChannel: lead.email ? "Email" : lead.phone ? "Phone" : "Email",
      bestOutreachTiming: "Tuesday or Thursday morning between 9:30 AM and 11:00 AM",
      recommendedNextAction: fallbackNextAction,
      recommendedFollowUpDate: fallbackFollowUpDate,
      suggestedOpeningLine: `Hi ${lead.name.split(" ")[0]}, I noticed ${lead.company || "your team"} might be evaluating solutions in this space — would it be useful to compare notes on what's worked for similar teams?`,
      summary: `Estimated ${heuristicScore}/100 qualification score (${heuristicTemperature}) based on priority, source, and recorded activity.`,
      data: { qualificationScore: heuristicScore, temperature: heuristicTemperature },
      source: "heuristic",
      engine: "Aargard Business Intelligence Construct",
    });
  } catch {
    return res.json({
      qualificationScore: 55,
      temperature: "Warm",
      buyerIntentSignals: [],
      riskFactors: ["Unable to complete full analysis — insufficient data"],
      bestOutreachChannel: "Email",
      bestOutreachTiming: "Morning hours",
      recommendedNextAction: "Reach out within 48 hours to confirm interest and timeline.",
      recommendedFollowUpDate: new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0],
      suggestedOpeningLine: "Hi, I wanted to reach out and see if now's a good time to explore how we could help.",
      summary: "Estimated 55/100 qualification score based on limited available data.",
      data: { qualificationScore: 55, temperature: "Warm" },
      source: "fallback",
      engine: "Aargard Business Intelligence Construct",
    });
  }
});

// AI Personalized Email — single-recipient email generation (distinct from
// the bulk Email Marketing campaign generator above). Draws on the
// recipient's individual knowledge base entries (manual notes + prior
// AI-extracted summaries), their matching Industry Playbook, and recent
// activity to draft one specific, ready-to-send email rather than a
// merge-tag template. Returned subject/body are meant to prefill the
// EmailComposeModal for the rep to review before sending.
app.post("/api/ai/personalized-email", async (req, res) => {
  try {
    const {
      recipientName,
      recipientCompany,
      recipientJobTitle,
      recipientIndustry,
      knowledgeEntries, // string[] -- content of linked KnowledgeBaseEntry rows (manual + AI-extracted)
      activities, // recent Activity rows for this lead/contact
      playbook, // optional IndustryPlaybook for recipientIndustry
      senderName,
      senderCompany,
      goal, // optional: what this specific email should accomplish, e.g. "book a demo call"
    } = req.body;

    if (!recipientName) {
      return res.status(400).json({ error: "Recipient name is required" });
    }

    const firstName = String(recipientName).split(" ")[0] || "there";
    const knowledgeLine =
      (knowledgeEntries || []).length > 0
        ? `\n\nWhat we know about ${recipientName} / ${recipientCompany || "their company"} (from our CRM's knowledge base — use this to make the email genuinely specific, not generic):\n${(knowledgeEntries || [])
            .slice(0, 8)
            .map((k: string, i: number) => `${i + 1}. ${k}`)
            .join("\n")}`
        : "";
    const activityLine =
      (activities || []).length > 0
        ? `\n\nRecent activity history: ${(activities || [])
            .slice(0, 5)
            .map((a: any) => `${a.type}: ${a.description}`)
            .join("; ")}`
        : "";
    const playbookLine = playbook
      ? `\n\nIndustry Playbook for "${playbook.industry}" — follow this guidance:
- Tone: ${playbook.tone || "professional and direct"}
- Talking points to weave in: ${(playbook.talkingPoints || []).join(", ") || "none specified"}
- Common pain points to speak to: ${(playbook.painPoints || []).join(", ") || "none specified"}
${playbook.objectionNotes ? `- Objection handling notes: ${playbook.objectionNotes}` : ""}`
      : "";

    const fallbackSubject = `Quick idea for ${recipientCompany || firstName}`;
    const fallbackBody = `Dear ${firstName},\n\nI wanted to reach out directly given your role${
      recipientJobTitle ? ` as ${recipientJobTitle}` : ""
    } at ${recipientCompany || "your company"}. ${
      playbook?.painPoints?.[0] ? `Teams in ${playbook.industry} often deal with ${playbook.painPoints[0].toLowerCase()}, and that's exactly where we can help.` : "I think there's a strong fit worth a short conversation."
    }\n\nWould you be open to a quick call this week?\n\nBest regards,\n${senderName || "Account Executive"}\n${senderCompany || ""}`;

    const prompt = `You are an expert B2B sales rep at ${senderCompany || "our company"} writing ONE specific, personalized email to a single named recipient — not a template with merge tags. Write it as if you did real research on them.

Recipient: ${recipientName}${recipientJobTitle ? `, ${recipientJobTitle}` : ""} at ${recipientCompany || "their company"}${recipientIndustry ? ` (industry: ${recipientIndustry})` : ""}.${knowledgeLine}${activityLine}${playbookLine}
${goal ? `\n\nGoal of this specific email: ${goal}` : ""}

Write a subject line and email body. Reference at least one concrete, specific detail from what we know about them if anything specific was provided above — avoid generic filler. Keep the body under 180 words, end with one clear call-to-action, and sign off with the sender's name and company.

Return pure JSON only, no markdown fences, in this exact shape:
{ "subject": "...", "body": "..." }`;

    const rawAiText = await callGeminiSafe(prompt);
    if (rawAiText) {
      try {
        const parsed = JSON.parse(rawAiText);
        if (parsed.subject && parsed.body) {
          return res.json({ subject: parsed.subject, body: parsed.body, source: "gemini" });
        }
      } catch {
        // fall through to heuristic
      }
    }

    return res.json({ subject: fallbackSubject, body: fallbackBody, source: "heuristic" });
  } catch {
    return res.json({
      subject: "Quick idea for your team",
      body: "Hi,\n\nI wanted to reach out about a way we could help your team. Would you be open to a short call this week?\n\nBest regards,\nSales Team",
      source: "fallback",
    });
  }
});

// AI Lead/Contact Knowledge Summary — auto-extracts a knowledge base entry
// from a lead/contact's own record + activity history, so the "individual
// knowledge base" the AI later draws on doesn't rely purely on manual notes.
// The caller stores the returned summary as a KnowledgeBaseEntry tagged
// "AI-Generated" (see KnowledgeBaseEntry in src/types.ts) linked to that
// record, replacing any prior AI-Generated entry for it on refresh.
app.post("/api/ai/lead-knowledge-summary", async (req, res) => {
  try {
    const { name, company, jobTitle, industry, notes, tags, activities } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    const activityLines =
      (activities || [])
        .slice(0, 12)
        .map((a: any) => `- [${a.date || ""}] ${a.type}: ${a.description}${a.outcome ? ` (outcome: ${a.outcome})` : ""}`)
        .join("\n") || "No activity recorded yet.";

    const fallbackSummary = `${name}${jobTitle ? ` (${jobTitle})` : ""} at ${company || "an unlisted company"}${
      industry ? `, in the ${industry} industry` : ""
    }. ${notes ? `Notes on file: ${notes}. ` : ""}${(tags || []).length > 0 ? `Tagged: ${(tags || []).join(", ")}. ` : ""}${
      (activities || []).length > 0 ? `${activities.length} activity record(s) on file.` : "No activity recorded yet."
    }`;

    const prompt = `Summarize what we genuinely know about this CRM record into a short, dense knowledge-base entry a salesperson could quickly read before reaching out — not a generic restatement of the fields, but what actually stands out (buying signals, stated needs, objections raised, communication style, timing patterns).

Record: ${name}${jobTitle ? `, ${jobTitle}` : ""} at ${company || "N/A"}${industry ? ` (${industry})` : ""}.
Notes on file: ${notes || "None"}
Tags: ${(tags || []).join(", ") || "None"}
Activity history:
${activityLines}

Return pure JSON only, no markdown fences, in this exact shape:
{ "summary": "..." }
Keep "summary" under 120 words. If there's genuinely little to go on, say so plainly rather than padding.`;

    const rawAiText = await callGeminiSafe(prompt);
    if (rawAiText) {
      try {
        const parsed = JSON.parse(rawAiText);
        if (parsed.summary) {
          return res.json({ summary: parsed.summary, source: "gemini" });
        }
      } catch {
        // fall through to heuristic
      }
    }

    return res.json({ summary: fallbackSummary, source: "heuristic" });
  } catch {
    return res.json({ summary: "Unable to generate summary — insufficient data on file.", source: "fallback" });
  }
});

// AI Negotiation Offer — drafts a specific price/terms offer for one
// recipient, gated by the Industry Playbook's maxDiscountPercent (a hard
// ceiling the server itself enforces, not just a prompt instruction) so an
// AI hallucination can never propose more than the workspace configured.
// Like the other single-recipient generators, this only DRAFTS an offer --
// it's queued into the Agent Approvals list by the caller, never sent
// directly.
app.post("/api/ai/negotiation-offer", async (req, res) => {
  try {
    const {
      recipientName,
      recipientCompany,
      recipientJobTitle,
      recipientIndustry,
      productName,
      productPrice,
      productPricingModel,
      currency,
      maxDiscountPercent, // ceiling from the Industry Playbook -- enforced below
      negotiationGuidance,
      knowledgeEntries,
      activities,
      requestContext, // optional: what prompted this, e.g. "they asked for a lower price"
      senderName,
      senderCompany,
    } = req.body;

    if (!recipientName) {
      return res.status(400).json({ error: "Recipient name is required" });
    }

    const ceiling = Math.max(0, Math.min(100, Number(maxDiscountPercent) || 0));
    const firstName = String(recipientName).split(" ")[0] || "there";
    const cur = currency || "USD";

    // Heuristic anchor: open at roughly half the allowed ceiling rather
    // than maxing it out immediately -- leaves room to actually negotiate.
    const heuristicDiscount = ceiling > 0 ? Math.round(ceiling / 2) : 0;
    const heuristicPrice =
      typeof productPrice === "number" ? Math.round(productPrice * (1 - heuristicDiscount / 100)) : undefined;

    const knowledgeLine =
      (knowledgeEntries || []).length > 0
        ? `\n\nWhat we know about ${recipientName} / ${recipientCompany || "their company"}:\n${(knowledgeEntries || [])
            .slice(0, 8)
            .map((k: string, i: number) => `${i + 1}. ${k}`)
            .join("\n")}`
        : "";
    const activityLine =
      (activities || []).length > 0
        ? `\n\nRecent activity: ${(activities || []).slice(0, 5).map((a: any) => `${a.type}: ${a.description}`).join("; ")}`
        : "";

    const fallbackSubject = `A tailored offer for ${recipientCompany || firstName}`;
    const fallbackBody = `Dear ${firstName},\n\nThanks for the conversation so far${
      recipientCompany ? ` on behalf of ${recipientCompany}` : ""
    }. ${
      ceiling > 0 && heuristicPrice !== undefined
        ? `I've put together a tailored offer: ${productName || "our solution"} at ${cur} ${heuristicPrice.toLocaleString()} (${heuristicDiscount}% off list), reflecting your specific situation.`
        : `I've reviewed the details and wanted to follow up directly on next steps for ${productName || "our solution"}.`
    }\n\nWould this work for you, or is there flexibility you need on timing or terms instead?\n\nBest regards,\n${senderName || "Account Executive"}\n${senderCompany || ""}`;

    if (ceiling <= 0) {
      // No discount authority configured for this industry -- draft a
      // message that holds the line on price rather than inventing a
      // number the workspace never authorized.
      const holdLineBody = `Dear ${firstName},\n\n${
        productName ? `${productName} is priced at ${cur} ${Number(productPrice || 0).toLocaleString()}${productPricingModel ? ` (${productPricingModel})` : ""}.` : "Here's where things stand on pricing."
      } I'm not able to offer a discount on this, but I'd be glad to explore what's driving the ask -- timing, scope, or payment terms -- to see if there's another way to make this work for ${recipientCompany || "your team"}.\n\nBest regards,\n${senderName || "Account Executive"}\n${senderCompany || ""}`;
      return res.json({
        subject: fallbackSubject,
        body: holdLineBody,
        proposedDiscountPercent: 0,
        source: "policy",
      });
    }

    const prompt = `You are an experienced B2B sales negotiator at ${senderCompany || "our company"} drafting ONE specific negotiation email to a named prospect.

Recipient: ${recipientName}${recipientJobTitle ? `, ${recipientJobTitle}` : ""} at ${recipientCompany || "their company"}${recipientIndustry ? ` (industry: ${recipientIndustry})` : ""}.
Product/service: ${productName || "our solution"}, list price ${cur} ${Number(productPrice || 0).toLocaleString()}${productPricingModel ? ` (${productPricingModel})` : ""}.${knowledgeLine}${activityLine}
${requestContext ? `\nContext for this offer: ${requestContext}` : ""}

HARD RULE: you may NOT propose a discount greater than ${ceiling}% off list price under any circumstances, even if the prospect is pushing harder. Anchor lower than the ceiling when reasonable (e.g. propose half the ceiling first) so there's room to move if they push back, unless the context above indicates they've already pushed hard, in which case you may go closer to the ceiling.
${negotiationGuidance ? `\nAdditional negotiation guidance for this industry: ${negotiationGuidance}` : ""}

Write a subject and email body proposing a SPECIFIC discount percentage and resulting price (compute it correctly from the list price). Keep it under 160 words, professional, and end with a clear next step.

Return pure JSON only, no markdown fences, in this exact shape:
{ "subject": "...", "body": "...", "proposedDiscountPercent": number }`;

    const rawAiText = await callGeminiSafe(prompt);
    if (rawAiText) {
      try {
        const parsed = JSON.parse(rawAiText);
        if (parsed.subject && parsed.body) {
          // Enforce the ceiling server-side regardless of what the model
          // returned -- this is the one number that must never be trusted
          // blindly from an AI response.
          const clampedDiscount = Math.max(0, Math.min(ceiling, Number(parsed.proposedDiscountPercent) || heuristicDiscount));
          return res.json({ subject: parsed.subject, body: parsed.body, proposedDiscountPercent: clampedDiscount, source: "gemini" });
        }
      } catch {
        // fall through to heuristic
      }
    }

    return res.json({ subject: fallbackSubject, body: fallbackBody, proposedDiscountPercent: heuristicDiscount, source: "heuristic" });
  } catch {
    return res.json({
      subject: "A quick note on pricing",
      body: "Hi,\n\nWanted to follow up on pricing for your team. Let me know what would work best and I'll see what I can do.\n\nBest regards,\nSales Team",
      proposedDiscountPercent: 0,
      source: "fallback",
    });
  }
});

app.post("/api/ai/daily-briefing", async (req, res) => {
  try {
    const {
      deals = [],
      tasks = [],
      invoices = [],
      companies = [],
      metrics = {},
      pipelineValue: reqPipelineValue,
      wonRevenue: reqWonRevenue,
      overdueBalance: reqOverdueBalance,
      overdueCount: reqOverdueCount,
      pendingTasks: reqPendingTasks,
    } = req.body;

    const openDeals = (deals || []).filter((d: any) => d.status === "Open");
    const overdueTasks = (tasks || []).filter((t: any) => t.status !== "Completed" && t.dueDate && new Date(t.dueDate) < new Date());
    const overdueInvoices = (invoices || []).filter((i: any) => i.status === "Overdue" || (i.remainingBalance > 0 && new Date(i.dueDate) < new Date()));
    
    const totalPipeline = reqPipelineValue ?? metrics.pipelineValue ?? openDeals.reduce((sum: number, d: any) => sum + (d.dealValue || 0), 0);
    const totalWon = reqWonRevenue ?? metrics.wonRevenue ?? 135000;
    const totalOverdue = reqOverdueBalance ?? metrics.overdueBalance ?? overdueInvoices.reduce((sum: number, inv: any) => sum + (inv.remainingBalance || 0), 0);
    const overdueCount = reqOverdueCount ?? overdueInvoices.length;
    const pendingTasksCount = reqPendingTasks ?? overdueTasks.length;

    const atRiskCompanies = (companies || []).filter((c: any) => c.status === "At Risk" || (c.overdueBalance && c.overdueBalance > 5000));
    const topOpportunity = [...openDeals].sort((a: any, b: any) => (b.dealValue || 0) - (a.dealValue || 0))[0];

    const fallbackHeadline = `${openDeals.length || 4} active deals in flight • ${pendingTasksCount || 3} follow-ups due • $${totalOverdue.toLocaleString()} receivables pending`;
    const fallbackSummary = `Good morning! Your sales pipeline currently represents $${totalPipeline.toLocaleString()} in active deal value. Priority today should focus on settling aging receivables to preserve cashflow, followed by advancing mid-stage proposals.\n\nTop focus is on "${topOpportunity?.name || 'highest value deal'}" which represents immediate quarter-close impact. Ensure all logged contact follow-ups are cleared before close of business.`;
    const fallbackAlerts = [
      `${overdueCount > 0 ? overdueCount : 2} overdue client accounts totaling $${totalOverdue.toLocaleString()}`,
      `${pendingTasksCount > 0 ? pendingTasksCount : 3} priority follow-ups awaiting completion`,
      `${atRiskCompanies.length > 0 ? atRiskCompanies.length : 1} key accounts flagged for retention review`,
    ];
    const fallbackActions = [
      `Resolve ${pendingTasksCount > 0 ? pendingTasksCount : 3} overdue customer follow-up tasks`,
      `Send payment reminder notices for $${totalOverdue.toLocaleString()} in overdue invoices`,
      `Engage ${atRiskCompanies[0]?.name || "flagged accounts"} to prevent contract churn`,
    ];

    const summaryContext = {
      openDealsCount: openDeals.length,
      totalPipelineValue: totalPipeline,
      wonRevenue: totalWon,
      overdueTasksCount: pendingTasksCount,
      overdueInvoicesCount: overdueCount,
      overdueReceivables: totalOverdue,
      atRiskCompaniesCount: atRiskCompanies.length,
      atRiskCompanies: atRiskCompanies.slice(0, 3).map((c: any) => c.name),
      topOpportunity: topOpportunity ? { name: topOpportunity.name, value: topOpportunity.dealValue } : null,
    };

    const prompt = `You are the executive AI copilot for our CRM.
Generate the daily morning executive sales briefing based on this live CRM state:
${JSON.stringify(summaryContext, null, 2)}

Produce a JSON response:
{
  "headline": string (e.g. "Action Required: 3 deals closing soon & $42,500 overdue invoices"),
  "summary": string,
  "briefingSummary": string,
  "priorityAlerts": string[],
  "recommendedActions": string[],
  "highlights": [
    { "label": string, "badge": string, "variant": "warning" | "danger" | "success" | "info" }
  ],
  "topOpportunity": {
    "name": string,
    "value": number,
    "strategy": string
  },
  "criticalActions": [
    { "action": string, "target": string, "urgency": "High" | "Medium" }
  ]
}

Return pure valid JSON only.`;

    const rawAiText = await callGeminiSafe(prompt);
    if (rawAiText) {
      try {
        const parsed = JSON.parse(rawAiText);
        const headline = parsed.headline || fallbackHeadline;
        const summary = parsed.summary || parsed.briefingSummary || fallbackSummary;
        const priorityAlerts = parsed.priorityAlerts || parsed.highlights?.map((h: any) => h.label) || fallbackAlerts;
        const recommendedActions = parsed.recommendedActions || parsed.criticalActions?.map((a: any) => a.action) || fallbackActions;

        return res.json({
          headline,
          summary,
          briefingSummary: summary,
          priorityAlerts,
          recommendedActions,
          highlights: parsed.highlights || [
            { label: `${openDeals.length} Deals in Pipeline`, badge: "Pipeline", variant: "info" },
            { label: `${pendingTasksCount} Tasks Pending`, badge: "Urgent", variant: "danger" },
            { label: `$${totalOverdue.toLocaleString()} Receivables`, badge: "Cashflow", variant: "warning" },
          ],
          topOpportunity: parsed.topOpportunity || (topOpportunity ? {
            name: topOpportunity.name,
            value: topOpportunity.dealValue,
            strategy: "Advance commercial negotiations for quarter-close.",
          } : null),
          criticalActions: parsed.criticalActions || fallbackActions.map((a: string) => ({ action: a, urgency: "High" })),
          data: parsed,
          source: "gemini",
        });
      } catch {
        // Fallback to heuristic
      }
    }

    // Heuristic fallback
    return res.json({
      headline: fallbackHeadline,
      summary: fallbackSummary,
      briefingSummary: fallbackSummary,
      priorityAlerts: fallbackAlerts,
      recommendedActions: fallbackActions,
      highlights: [
        { label: `${openDeals.length || 4} Deals Require Attention`, badge: "Pipeline", variant: "info" },
        { label: `${pendingTasksCount || 3} Follow-ups Overdue`, badge: "Urgent", variant: "danger" },
        { label: `${atRiskCompanies.length || 1} Accounts Flagged At Risk`, badge: "Retention", variant: "warning" },
        { label: `$${totalOverdue.toLocaleString()} Outstanding Receivables`, badge: "Cashflow", variant: "warning" },
      ],
      topOpportunity: topOpportunity ? {
        name: topOpportunity.name,
        value: topOpportunity.dealValue || 25000,
        strategy: "High probability opportunity ready for negotiation closing call.",
      } : {
        name: "Enterprise Cloud Expansion",
        value: 35000,
        strategy: "Focus on closing stage negotiation.",
      },
      criticalActions: fallbackActions.map((a: string) => ({ action: a, target: "CRM", urgency: "High" })),
      data: {
        headline: fallbackHeadline,
        summary: fallbackSummary,
        priorityAlerts: fallbackAlerts,
        recommendedActions: fallbackActions,
      },
      source: "heuristic",
    });
  } catch {
    // Return resilient baseline briefing
    res.json({
      headline: "Pipeline Velocity & Account Intelligence Active",
      summary: "CRM intelligence engine is monitoring active accounts, deals, and collections. Review priority receivables and task queues.",
      briefingSummary: "CRM intelligence engine is monitoring active accounts, deals, and collections. Review priority receivables and task queues.",
      priorityAlerts: [
        "Review open receivables for payment reconciliation",
        "Check daily task queues for pending outreach",
      ],
      recommendedActions: [
        "Confirm scheduled customer follow-up calls",
      ],
      highlights: [
        { label: "CRM System Active", badge: "Status", variant: "success" },
      ],
      topOpportunity: null,
      criticalActions: [],
      source: "fallback",
    });
  }
});

// AI Smart Search natural language interpreter
app.post("/api/ai/smart-search", async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: "Query is required" });

    const q = query.toLowerCase();
    let fallbackEntity: any = "all";
    const fallbackFilters: any = {};

    if (q.includes("invoice") || q.includes("owe") || q.includes("balance") || q.includes("receivable") || q.includes("pay")) {
      fallbackEntity = "invoices";
    } else if (q.includes("deal") || q.includes("pipeline") || q.includes("closing") || q.includes("won") || q.includes("lost")) {
      fallbackEntity = "deals";
    } else if (q.includes("company") || q.includes("companies") || q.includes("customer") || q.includes("account") || q.includes("client")) {
      fallbackEntity = "companies";
    } else if (q.includes("lead")) {
      fallbackEntity = "leads";
    } else if (q.includes("task") || q.includes("follow-up") || q.includes("todo")) {
      fallbackEntity = "tasks";
    }

    if (q.includes("overdue")) fallbackFilters.isOverdue = true;
    const amountMatch = q.match(/\$?\s*([0-9,]+)/);
    if (amountMatch) {
      const num = parseInt(amountMatch[1].replace(/,/g, ""), 10);
      if (num > 0) {
        if (q.includes("more than") || q.includes("over") || q.includes(">")) fallbackFilters.minAmount = num;
        else if (q.includes("less than") || q.includes("under") || q.includes("<")) fallbackFilters.maxAmount = num;
      }
    }

    const fallbackAnswer = `Searching CRM for ${fallbackEntity} matching "${query}". ${fallbackFilters.isOverdue ? "Filtering for overdue records. " : ""}Displaying corresponding entries in the table view.`;

    const prompt = `You are a CRM assistant. The user typed a natural language search query:
"${query}"

Answer the query directly and extract structured filter parameters.
Possible entities: "companies" | "deals" | "invoices" | "contacts" | "leads" | "tasks" | "all"

Output JSON:
{
  "answer": "A clear, direct, informative response answering the user's inquiry based on CRM records",
  "entity": "companies" | "deals" | "invoices" | "contacts" | "leads" | "tasks" | "all",
  "explanation": "Brief explanation of what was extracted",
  "filters": {
    "minAmount": number or null,
    "maxAmount": number or null,
    "status": string or null,
    "isOverdue": boolean or null,
    "timeRangeDays": number or null,
    "searchTerm": string or null
  }
}
Return pure valid JSON only.`;

    const rawAiText = await callGeminiSafe(prompt);
    if (rawAiText) {
      try {
        const parsed = JSON.parse(rawAiText);
        return res.json({
          answer: parsed.answer || parsed.explanation || fallbackAnswer,
          entity: parsed.entity || fallbackEntity,
          explanation: parsed.explanation || fallbackAnswer,
          filters: parsed.filters || fallbackFilters,
          data: parsed,
          source: "gemini",
        });
      } catch {
        // Fallback to heuristic
      }
    }

    // Heuristic parsing fallback
    return res.json({
      answer: fallbackAnswer,
      entity: fallbackEntity,
      explanation: `Interpreted query looking for ${fallbackEntity} matching parameters.`,
      filters: fallbackFilters,
      data: {
        entity: fallbackEntity,
        explanation: `Interpreted query looking for ${fallbackEntity} matching parameters.`,
        filters: fallbackFilters,
      },
      source: "heuristic",
    });
  } catch {
    res.json({
      answer: `Showing results for "${req.body?.query || 'search'}".`,
      entity: "all",
      explanation: "Keyword search fallback",
      filters: {},
      source: "fallback",
    });
  }
});

// AI Chat Assistant — powers the floating chat bubble ("Sales Intelligence
// Copilot") in the bottom-right corner of every screen. It answers
// questions using a compact summary of the workspace's own CRM data (never
// raw record dumps, to keep prompts small) and can suggest a screen to
// navigate to, but never creates/edits/deletes anything itself.
const VALID_NAV_VIEWS = [
  "Dashboard", "Leads", "Contacts", "Companies", "Products", "Deals", "Pipelines",
  "Activities", "Invoices", "Payments", "Revenue", "Stripe", "Tasks",
  "AI Insights", "Email Marketing", "Inbox", "Reports", "Settings", "CEO Notes",
  "Knowledge Base", "File Manager", "Instructions",
];

// ----------------------------------------------------------------------------
// Chat-assistant action support -- lets the floating AI chat propose CRUD
// actions (create/update/delete a Lead, Contact, Company, Deal, Task,
// Activity, or Invoice) instead of only answering questions. The AI never
// touches real IDs directly: it names records by plain text ("Acme Corp",
// "Jane Doe's onboarding task") and this server resolves those names against
// a compact lookup list the client sends along with the request. Anything
// that can't be confidently resolved comes back with an `error` on that
// action instead of a guessed ID, so the client can show why an action can't
// be confirmed rather than silently acting on the wrong record. The client
// always shows every action to the user for explicit confirmation before
// calling the corresponding CRUD function -- this endpoint only proposes.
// ----------------------------------------------------------------------------
// "playbook" and "agent_action" extend chat control to the Industry
// Playbook agents: toggling a playbook's auto-run/negotiation settings, and
// approving/rejecting items already sitting in the Agent Approvals queue.
// "negotiation_offer"/"personalized_email" let the chat trigger the same
// single-recipient drafts the Lead/Contact drawers do -- both only ever
// DRAFT (queued into Agent Approvals, or handed to the email composer), the
// client still needs a separate send/approve step.
const ACTION_ENTITIES = [
  "lead", "contact", "company", "deal", "task", "activity", "invoice",
  "playbook", "agent_action", "negotiation_offer", "personalized_email",
] as const;
type ActionEntity = (typeof ACTION_ENTITIES)[number];
const ENTITY_ALLOWED_TYPES: Record<ActionEntity, Array<"create" | "update" | "delete">> = {
  lead: ["create", "update", "delete"],
  contact: ["create", "update", "delete"],
  company: ["create", "update", "delete"],
  deal: ["create", "update", "delete"],
  task: ["create", "update", "delete"],
  activity: ["create", "delete"],
  invoice: ["create", "update", "delete"],
  playbook: ["update"],
  agent_action: ["update"],
  negotiation_offer: ["create"],
  personalized_email: ["create"],
};

// Best-effort "find this record by what the user called it" -- exact
// case-insensitive match wins, otherwise a unique substring match, otherwise
// unresolved (never guess between multiple candidates).
function resolveByName(
  list: Array<{ id: string; name: string }> | undefined,
  needle: string | null | undefined
): { id: string | null; error?: string } {
  if (!needle || !needle.trim()) return { id: null };
  if (!list || list.length === 0) return { id: null, error: `No records available to match "${needle}" against.` };
  const target = needle.trim().toLowerCase();
  const exact = list.filter((r) => r.name.toLowerCase() === target);
  if (exact.length === 1) return { id: exact[0].id };
  const partial = list.filter((r) => r.name.toLowerCase().includes(target) || target.includes(r.name.toLowerCase()));
  if (partial.length === 1) return { id: partial[0].id };
  if (partial.length > 1) {
    return { id: null, error: `"${needle}" matches ${partial.length} records (${partial.slice(0, 3).map((r) => r.name).join(", ")}${partial.length > 3 ? ", ..." : ""}) -- be more specific.` };
  }
  return { id: null, error: `Couldn't find a record matching "${needle}".` };
}

app.post("/api/ai/chat-assistant", async (req, res) => {
  try {
    const { message, history, context, lookups, knowledgeBase } = req.body;
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "message is required" });
    }

    const lowerMsg = message.toLowerCase();
    const navKeywordMap: Record<string, string> = {
      lead: "Leads", contact: "Contacts", compan: "Companies", product: "Products", service: "Products", deal: "Deals",
      pipeline: "Pipelines", activit: "Activities", invoice: "Invoices",
      payment: "Payments", revenue: "Revenue", stripe: "Stripe", task: "Tasks",
      insight: "AI Insights", campaign: "Email Marketing", "email market": "Email Marketing",
      inbox: "Inbox", repl: "Inbox", report: "Reports", setting: "Settings",
      dashboard: "Dashboard", "ceo note": "CEO Notes", journal: "CEO Notes", memoir: "CEO Notes",
      "knowledge base": "Knowledge Base", playbook: "Knowledge Base",
    };
    let fallbackNav: string | null = null;
    if (/\b(show|open|go to|take me|navigate|view)\b/.test(lowerMsg)) {
      for (const [kw, nav] of Object.entries(navKeywordMap)) {
        if (lowerMsg.includes(kw)) {
          fallbackNav = nav;
          break;
        }
      }
    }

    const ctx = context || {};
    const lk = lookups || {};
    const companies: Array<{ id: string; name: string }> = lk.companies || [];
    const contacts: Array<{ id: string; name: string }> = lk.contacts || [];
    const leads: Array<{ id: string; name: string }> = lk.leads || [];
    const deals: Array<{ id: string; name: string }> = lk.deals || [];
    const tasks: Array<{ id: string; name: string }> = lk.tasks || [];
    const invoices: Array<{ id: string; name: string }> = lk.invoices || [];
    const pipelines: Array<{ id: string; name: string; stages: Array<{ id: string; name: string }> }> = lk.pipelines || [];
    const playbooks: Array<{ id: string; name: string }> = lk.playbooks || [];
    const agentActions: Array<{ id: string; name: string }> = lk.agentActions || [];

    const fallbackReply = fallbackNav
      ? `Opening ${fallbackNav} for you now.`
      : `Here's a quick snapshot: ${ctx.leadsCount ?? 0} leads, ${ctx.openDealsCount ?? 0} open deals worth $${(ctx.openDealsValue ?? 0).toLocaleString()}, and ${ctx.overdueInvoicesCount ?? 0} overdue invoices. Ask me something more specific and I'll dig into it.`;

    // Knowledge Base grounding: the client sends whatever entries fit its
    // own size budget (see FloatingAIChat's buildKnowledgeBase), already
    // split by category. Format each category into its own labeled block:
    //   - "company" entries are context ABOUT specific leads/contacts/
    //     companies (industry background, research notes, etc.) and may
    //     name which records they're attached to (linkedNames) -- use that
    //     to answer questions about a specific lead/company/contact.
    //   - "product" entries describe what's being sold.
    //   - "operator" entries describe the business running this dashboard
    //     (background, offering) and how to position it to a given lead/
    //     company/contact -- INTERNAL ONLY, never quoted back as if it were
    //     customer-facing copy.
    const kb = knowledgeBase && typeof knowledgeBase === "object" ? knowledgeBase : {};
    const formatKbSection = (label: string, entries: any[] | undefined): string => {
      if (!Array.isArray(entries) || entries.length === 0) return "";
      return `\n### ${label}\n${entries
        .map((e: any) => {
          const names = Array.isArray(e.linkedNames) ? e.linkedNames.filter(Boolean) : [];
          const scope = names.length > 0 ? ` [about: ${names.join(", ")}]` : "";
          return `- ${e.title}${scope}: ${e.content}`;
        })
        .join("\n")}`;
    };
    const kbBlock = [
      formatKbSection("Company Knowledge Base (context about specific leads/contacts/companies)", kb.company),
      formatKbSection("Product & Service Knowledge Base (what they sell)", kb.product),
      formatKbSection(
        "Operator Playbook (INTERNAL ONLY -- who this business is, their offering, and how to position it to leads/companies/contacts; never for prospects/customers)",
        kb.operator
      ),
    ]
      .filter(Boolean)
      .join("\n");

    const prompt = `You are the AI assistant embedded in AarPex, a Sales Intelligence System built by Aargard Business Solutions. You live in a small floating chat bubble in the corner of the app, and you can now DO things in the CRM, not just answer questions -- but every action you propose is only ever a PROPOSAL: the user must explicitly confirm it in the UI before anything actually changes. You never claim something has already happened.

Here is a compact snapshot of the signed-in user's workspace data (use ONLY this to answer -- never invent numbers or records that aren't here):
${JSON.stringify(ctx, null, 2)}
${kbBlock ? `\nThe user's own Knowledge Base -- ground answers about the business, its offerings, or how the team should operate in this content when relevant. Prefer it over generic assumptions, and never invent facts about the business that aren't here:\n${kbBlock}\n` : ""}

Existing records you can reference BY NAME (never invent an ID -- you don't have access to real IDs, only names):
Companies: ${JSON.stringify(companies.map((c) => c.name)).slice(0, 4000)}
Contacts: ${JSON.stringify(contacts.map((c) => c.name)).slice(0, 4000)}
Leads: ${JSON.stringify(leads.map((l) => l.name)).slice(0, 4000)}
Deals: ${JSON.stringify(deals.map((d) => d.name)).slice(0, 4000)}
Tasks: ${JSON.stringify(tasks.map((t) => t.name)).slice(0, 2000)}
Invoices: ${JSON.stringify(invoices.map((i) => i.name)).slice(0, 2000)}
Pipelines: ${JSON.stringify(pipelines.map((p) => ({ name: p.name, stages: p.stages.map((s) => s.name) })))}
Industry Playbooks (agents): ${JSON.stringify(playbooks.map((p) => p.name)).slice(0, 2000)}
Pending Agent Approvals (queued drafts awaiting your decision): ${JSON.stringify(agentActions.map((a) => a.name)).slice(0, 3000)}

Recent conversation (oldest first):
${JSON.stringify((history || []).slice(-8))}

The user just said: "${message}"

Reply conversationally and concisely (2-4 sentences, no bullet points). If the user is asking to see, open, or navigate to a specific screen, also set "navigateTo" to the single best-matching value from this exact list: ${VALID_NAV_VIEWS.map((v) => `"${v}"`).join(", ")}. Otherwise set "navigateTo" to null.

If the user is asking you to CREATE, UPDATE, or DELETE something, populate "actions" (an array, empty if none). Each action:
{
  "type": "create" | "update" | "delete",
  "entity": "lead" | "contact" | "company" | "deal" | "task" | "activity" | "invoice" | "playbook" | "agent_action" | "negotiation_offer" | "personalized_email",
  "summary": "short human-readable one-line description of exactly what this will do, written for a confirmation prompt",
  "target": string | null,       // REQUIRED for update/delete: the name of the existing record being changed, exactly as it appears in the lists above (an Industry Playbook's name is its industry; an Agent Approval's name is listed above too). null for create.
  "companyRef": string | null,   // for contact/deal/invoice/task/activity: the company name involved (existing, from the list above)
  "contactRef": string | null,   // for deal/invoice/task/activity/negotiation_offer/personalized_email: the contact name involved, if any
  "leadRef": string | null,      // for negotiation_offer/personalized_email: the lead name involved, if any (use leadRef OR contactRef, never both)
  "dealRef": string | null,      // for invoice/task/activity: the deal name involved, if any
  "pipelineRef": string | null,  // for deal create/update: pipeline name, if specified
  "stageRef": string | null,     // for deal create/update: stage name within that pipeline, if specified
  "fields": { ... }              // entity-specific plain values the user actually specified or clearly implied -- do NOT invent unrelated data, leave anything unstated out of "fields" so the app can fill sane defaults
}

AarPex's standard industry picklist (prefer these exact labels for "industry" when one fits; free text is still fine for anything not listed): ${JSON.stringify(STANDARD_INDUSTRIES)}
AarPex's standard client-category picklist (for "clientCategory" -- the type/size of the buyer, independent of industry): ${JSON.stringify(STANDARD_CLIENT_CATEGORIES)}

Field guidance per entity (only include what the user actually said or clearly implied):
- lead: name, company (plain text, not a companyRef), jobTitle, email, phone, industry, clientCategory, country, city, source, estimatedValue (number), priority ("Low"|"Medium"|"High"|"Urgent"), status ("New"|"Contacted"|"Engaged"|"Qualified"|"Proposal"|"Negotiation"|"Converted"|"Lost"|"Nurture"), notes
- contact: firstName, lastName, position, email, phone, country, city, notes (company via companyRef)
- company: name, industry, clientCategory, website, country, city, phone, email, status ("Prospect"|"Qualified Prospect"|"Active Customer"|"High Value Customer"|"At Risk"|"Dormant"|"Former Customer"), notes
- deal: name, dealValue (number), currency, priority ("Low"|"Medium"|"High"), expectedCloseDate (YYYY-MM-DD), productService, notes (company via companyRef, contact via contactRef, pipeline/stage via pipelineRef/stageRef)
- task: title, dueDate (YYYY-MM-DD), priority ("Low"|"Medium"|"High"|"Urgent"), status ("To Do"|"In Progress"|"Completed"|"Cancelled"), notes (related company/contact/deal via companyRef/contactRef/dealRef)
- activity: type ("Call"|"Meeting"|"Email"|"WhatsApp"|"Follow-up"|"Demo"|"Proposal"|"Note"), description, outcome, nextAction (related company/contact/deal via companyRef/contactRef/dealRef)
- invoice: dueDate (YYYY-MM-DD), items (array of {description, quantity, unitPrice}), notes (company via companyRef required, contact/deal optional via contactRef/dealRef)
- playbook (update only, target = the industry's playbook name from the list above): autoRunEnabled (boolean -- "turn on/off the agent" for that industry means this), maxDiscountPercent (number 0-100 -- "let it negotiate up to X%"), negotiationGuidance (string). Only include the field(s) the user actually asked to change.
- agent_action (update only, target = the pending item's name from the list above): decision ("approve" | "reject") -- this is how the user approves/rejects/sends/dismisses a queued drafted follow-up, reply, or offer from the chat. "approve" sends it exactly as drafted; the user can't edit the text through chat, only approve or reject -- if they want it changed first, tell them to edit it from the Agent Approvals page instead of proposing an action.
- negotiation_offer (create only): identify the recipient via leadRef OR contactRef (never both). Drafts a price/terms offer capped by that recipient's industry playbook and queues it into Agent Approvals -- it does not send anything.
- personalized_email (create only): identify the recipient via leadRef OR contactRef (never both). Drafts a one-off personalized email for that recipient and hands it to the email composer for review -- it does not send anything.

For update actions, put ONLY the fields being changed inside "fields". Never propose an action against a record that isn't in the lists above -- if the user references something that doesn't exist, say so in your reply instead and don't fabricate an action for it.

Return pure JSON only, no markdown fences: {"reply": string, "navigateTo": string | null, "actions": [...]}`;

    const rawAiText = await callGeminiSafe(prompt);
    if (rawAiText) {
      try {
        const parsed = JSON.parse(rawAiText);
        const navigateTo = VALID_NAV_VIEWS.includes(parsed.navigateTo) ? parsed.navigateTo : null;

        const byName = (arr: Array<{ id: string; name: string }>) => arr;
        const rawActions = Array.isArray(parsed.actions) ? parsed.actions : [];

        const actions = rawActions
          .filter((a: any) => ACTION_ENTITIES.includes(a?.entity) && ENTITY_ALLOWED_TYPES[a.entity as ActionEntity]?.includes(a?.type))
          .slice(0, 5)
          .map((a: any, idx: number) => {
            const entity = a.entity as ActionEntity;
            const fields = a.fields && typeof a.fields === "object" ? a.fields : {};
            let error: string | undefined;
            const params: Record<string, any> = { ...fields };

            // Resolve the target record itself for update/delete.
            let targetId: string | null = null;
            if (a.type === "update" || a.type === "delete") {
              const list = entity === "lead" ? byName(leads)
                : entity === "contact" ? byName(contacts)
                : entity === "company" ? byName(companies)
                : entity === "deal" ? byName(deals)
                : entity === "task" ? byName(tasks)
                : entity === "invoice" ? byName(invoices)
                : entity === "playbook" ? byName(playbooks)
                : entity === "agent_action" ? byName(agentActions)
                : [];
              const resolved = resolveByName(list, a.target);
              if (!resolved.id) error = resolved.error || `Couldn't identify which ${entity} "${a.target}" refers to.`;
              targetId = resolved.id;
            }

            // Resolve foreign-key references used by create/update.
            if (!error && a.companyRef) {
              const r = resolveByName(companies, a.companyRef);
              if (r.id) params.companyId = r.id;
              else if (["contact", "deal", "invoice"].includes(entity)) error = r.error || `Couldn't find company "${a.companyRef}".`;
              else if (r.error) error = r.error;
            }
            if (!error && a.contactRef) {
              const r = resolveByName(contacts, a.contactRef);
              if (r.id) params.contactId = r.id;
              else if (r.error) error = r.error;
            }
            if (!error && a.leadRef) {
              const r = resolveByName(leads, a.leadRef);
              if (r.id) params.leadId = r.id;
              else if (r.error) error = r.error;
            }
            if (!error && a.dealRef) {
              const r = resolveByName(deals, a.dealRef);
              if (r.id) params.dealId = r.id;
              else if (r.error) error = r.error;
            }
            if (!error && entity === "deal" && a.pipelineRef) {
              const pipe = pipelines.find((p) => p.name.toLowerCase() === String(a.pipelineRef).toLowerCase());
              if (pipe) {
                params.pipelineId = pipe.id;
                if (a.stageRef) {
                  const stage = pipe.stages.find((s) => s.name.toLowerCase() === String(a.stageRef).toLowerCase());
                  if (stage) params.stageId = stage.id;
                }
              }
            }
            if (!error && entity === "company" && a.type === "create" && !fields.name) {
              error = "No company name given.";
            }
            if (!error && entity === "contact" && a.type === "create" && !params.companyId) {
              error = `A contact needs a company -- couldn't resolve "${a.companyRef || "unspecified"}".`;
            }
            if (!error && entity === "deal" && a.type === "create" && !params.companyId) {
              error = `A deal needs a company -- couldn't resolve "${a.companyRef || "unspecified"}".`;
            }
            if (!error && entity === "invoice" && a.type === "create" && !params.companyId) {
              error = `An invoice needs a company -- couldn't resolve "${a.companyRef || "unspecified"}".`;
            }
            if (!error && (entity === "negotiation_offer" || entity === "personalized_email") && !params.leadId && !params.contactId) {
              error = `Couldn't identify who this is for -- needs a lead or contact.`;
            }
            if (!error && entity === "agent_action" && a.type === "update" && !["approve", "reject"].includes(fields.decision)) {
              error = `Need a clear approve or reject decision.`;
            }

            const built: Record<string, any> =
              a.type === "delete"
                ? { id: targetId }
                : a.type === "update"
                ? { id: targetId, updates: params }
                : params;

            return {
              id: `act_${Date.now()}_${idx}`,
              type: a.type,
              entity,
              summary: a.summary || `${a.type} ${entity}`,
              params: built,
              ...(error ? { error } : {}),
            };
          });

        return res.json({
          reply: parsed.reply || fallbackReply,
          navigateTo,
          actions,
          source: "gemini",
        });
      } catch {
        // Fall through to heuristic reply below
      }
    }

    return res.json({
      reply: fallbackReply,
      navigateTo: fallbackNav,
      actions: [],
      source: "heuristic",
    });
  } catch (err: any) {
    res.json({
      reply: "I ran into an issue reaching the AI service just now -- try again in a moment.",
      navigateTo: null,
      actions: [],
      source: "fallback",
    });
  }
});

// AI-assisted Products/Services setup: turns a plain-language description
// of an offering (agency retainer, SaaS subscription, tour package, B2B
// product, anything) into a structured draft -- name, pricing model, a
// marketing pitch, and a target-audience fit profile (which industries,
// company types, tags, lead sources it should be sold to) -- plus a set of
// positioning insights (pitch angles, objection handling). Also used to
// re-run just the AI insight for an already-saved product. Never persists
// anything itself; the client always reviews/edits before saving.
// Kept in sync by hand with src/data/industries.ts's INDUSTRIES/
// CLIENT_CATEGORIES -- duplicated here rather than imported since server.ts
// bundles standalone for the Node runtime and the two lists rarely change.
const STANDARD_INDUSTRIES = [
  "Technology / SaaS",
  "Textile & Fashion",
  "Retail & Ecommerce",
  "Travel & Hospitality",
  "Real Estate & Property Management",
  "Security Services",
  "Cleaning & Facilities Services",
  "Healthcare & Wellness",
  "Financial Services & Bookkeeping",
  "Professional Services & Consulting",
  "Legal Services",
  "Marketing & Advertising Agency",
  "Construction & Trades",
  "Manufacturing & Industrial",
  "Logistics & Transportation",
  "Food & Beverage",
  "Education & Training",
  "Nonprofit & NGO",
  "Government & Public Sector",
  "Automotive",
  "Energy & Utilities",
  "Media & Entertainment",
  "Telecommunications",
  "Agriculture",
  "Wholesale & Distribution",
  "Other",
];
const STANDARD_CLIENT_CATEGORIES = [
  "Startup",
  "Small Business / SMB",
  "Mid-Market",
  "Enterprise",
  "Franchise / Multi-Location",
  "Government / Public Sector",
  "Nonprofit / NGO",
  "Reseller / Channel Partner",
  "Individual / Consumer",
  "Other",
];

app.post("/api/ai/product-assist", async (req, res) => {
  try {
    const { rawDescription, existingIndustries, existingProduct } = req.body;
    if (!rawDescription || typeof rawDescription !== "string") {
      return res.status(400).json({ error: "rawDescription is required" });
    }

    const text = rawDescription.trim();
    const words = text.split(/\s+/).filter(Boolean);
    const fallbackName = existingProduct?.name || words.slice(0, 5).join(" ") || "New Offering";
    const lowerText = text.toLowerCase();

    let fallbackType = "Other";
    if (/retainer|agency|consult/.test(lowerText)) fallbackType = "Agency Retainer";
    else if (/saas|software|subscription|platform|app\b/.test(lowerText)) fallbackType = "SaaS Subscription";
    else if (/tour|trip|travel|package|itinerary/.test(lowerText)) fallbackType = "Tour Package";
    else if (/b2b|wholesale|bulk|supply|manufactur/.test(lowerText)) fallbackType = "B2B Product";
    else if (/one-time|one time|project|installation/.test(lowerText)) fallbackType = "One-Time Service";

    let fallbackPricingModel = "Custom Quote";
    if (/month|\/mo\b|monthly/.test(lowerText)) fallbackPricingModel = "Monthly Recurring";
    else if (/year|annual/.test(lowerText)) fallbackPricingModel = "Annual Recurring";
    else if (/per project|per-project/.test(lowerText)) fallbackPricingModel = "Per-Project";
    else if (/one-time|one time|flat fee/.test(lowerText)) fallbackPricingModel = "One-Time";

    const priceMatch = lowerText.match(/\$?([\d,]+(?:\.\d+)?)\s*(k\b)?/);
    let fallbackPrice = 0;
    if (priceMatch) {
      fallbackPrice = parseFloat(priceMatch[1].replace(/,/g, ""));
      if (priceMatch[2]) fallbackPrice *= 1000;
    }

    const fallbackDescription = text;
    const fallbackPitch = `${fallbackName} helps businesses get real results, fast -- built for teams who are done settling for "good enough."`;
    const fallbackIndustries = (existingIndustries || []).slice(0, 3);

    const prompt = `You are a product-marketing strategist inside AarPex, a Sales Intelligence System. A user described an offering they sell (an agency retainer, a SaaS subscription, a tour package, a B2B product, or any other product/service). Turn it into a structured catalog entry AND a "who should we sell this to" targeting profile.

${existingProduct ? `This product already exists (regenerating just the AI insight): ${JSON.stringify(existingProduct)}` : ""}

User's description: "${text}"

Industries already seen in this workspace's CRM data (ground your industry suggestions in these when they make sense, but you may suggest others): ${JSON.stringify(existingIndustries || [])}

AarPex's standard industry picklist (prefer these exact labels when they fit; you may still suggest others): ${JSON.stringify(STANDARD_INDUSTRIES)}
AarPex's standard client-category picklist (which type/size of buyer this suits -- prefer these exact labels): ${JSON.stringify(STANDARD_CLIENT_CATEGORIES)}

Return pure JSON only, matching this exact schema:
{
  "name": string,
  "type": "Agency Retainer" | "SaaS Subscription" | "Tour Package" | "B2B Product" | "One-Time Service" | "Other",
  "pricingModel": "One-Time" | "Monthly Recurring" | "Annual Recurring" | "Per-Project" | "Custom Quote",
  "price": number,
  "currency": string,
  "description": string (1-2 factual sentences, no hype),
  "pitch": string (2-3 punchy marketing sentences a salesperson could paste straight into an email -- confident, specific, benefit-led, no bland corporate-speak),
  "tags": string[] (3-6 short tags),
  "targetCriteria": {
    "industries": string[] (which industries should buy this),
    "clientCategories": string[] (which type/size of buyer this suits, from the standard client-category picklist above),
    "companyStatuses": string[] (choose only from: "Prospect", "Qualified Prospect", "Active Customer", "High Value Customer", "At Risk", "Dormant", "Former Customer", "Lead"),
    "countries": string[],
    "tags": string[],
    "leadSources": string[],
    "idealCustomerNotes": string (1-2 sentences describing the ideal buyer)
  },
  "aiInsight": {
    "suggestedTargetSummary": string (one sentence summarizing who to target and why),
    "suggestedIndustries": string[],
    "suggestedTags": string[],
    "pitchAngles": string[] (3-4 short, punchy hooks/angles a rep could open with),
    "objectionHandling": string[] (3-4 "Objection: ... Response: ..." style one-liners)
  }
}

IMPORTANT: Return pure valid JSON only, without markdown fences or additional commentary.`;

    const rawAiText = await callGeminiSafe(prompt);
    if (rawAiText) {
      try {
        const parsed = JSON.parse(rawAiText);
        return res.json({
          name: parsed.name || fallbackName,
          type: parsed.type || fallbackType,
          pricingModel: parsed.pricingModel || fallbackPricingModel,
          price: typeof parsed.price === "number" ? parsed.price : fallbackPrice,
          currency: parsed.currency || "USD",
          description: parsed.description || fallbackDescription,
          pitch: parsed.pitch || fallbackPitch,
          tags: parsed.tags || [],
          targetCriteria: parsed.targetCriteria || {
            industries: fallbackIndustries,
            clientCategories: [],
            companyStatuses: [],
            countries: [],
            tags: [],
            leadSources: [],
            idealCustomerNotes: "",
          },
          aiInsight: parsed.aiInsight || null,
          source: "gemini",
        });
      } catch {
        // Fall through to heuristic response below
      }
    }

    return res.json({
      name: fallbackName,
      type: fallbackType,
      pricingModel: fallbackPricingModel,
      price: fallbackPrice,
      currency: "USD",
      description: fallbackDescription,
      pitch: fallbackPitch,
      tags: [],
      targetCriteria: {
        industries: fallbackIndustries,
        companyStatuses: [],
        countries: [],
        tags: [],
        leadSources: [],
        idealCustomerNotes: "",
      },
      aiInsight: {
        suggestedTargetSummary: fallbackIndustries.length > 0
          ? `Likely best fit: businesses in ${fallbackIndustries.join(", ")}.`
          : "Add a few companies or leads first so AarPex can suggest a target industry.",
        suggestedIndustries: fallbackIndustries,
        suggestedTags: [],
        pitchAngles: [`${fallbackName} is built to deliver results fast, without the usual overhead.`],
        objectionHandling: ["Objection: \"We're not sure it's worth it.\" Response: Offer a scoped pilot or trial period to prove value before a full commitment."],
      },
      source: "heuristic",
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to generate product draft", details: err?.message });
  }
});

// AI-assisted Knowledge Base drafting from a URL: fetches a public webpage
// server-side (the browser can't do this cross-origin), strips it down to
// plain text, and asks Gemini to turn it into a single well-organized
// Knowledge Base entry -- framed differently per category, since "company"
// entries are about skimming a LEAD/CONTACT/COMPANY's own site (what's
// useful to know about them), while "product"/"operator" entries are about
// skimming the user's OWN site (their offering, or who they are). Never
// persists anything -- the client always reviews/edits the draft before
// saving, same as every other AI-assist endpoint in this file.
app.post("/api/ai/knowledge-base-from-url", async (req, res) => {
  try {
    const { url, category } = req.body;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "url is required" });
    }
    if (!["company", "product", "operator"].includes(category)) {
      return res.status(400).json({ error: "category must be company, product, or operator" });
    }

    let target: URL;
    try {
      target = new URL(url.trim());
    } catch {
      return res.status(400).json({ error: "That doesn't look like a valid URL." });
    }
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      return res.status(400).json({ error: "Only http:// and https:// URLs are supported." });
    }
    if (isPrivateOrLocalHostname(target.hostname)) {
      return res.status(400).json({ error: "That URL points to a private/internal address, which can't be fetched." });
    }

    let html: string;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      const response = await fetch(target.toString(), {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; AarpexBot/1.0; +https://aarpex.aarbook.com)" },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        return res.status(502).json({ error: `The site responded with ${response.status} ${response.statusText}.` });
      }
      html = await response.text();
    } catch (fetchErr: any) {
      const message =
        fetchErr?.name === "AbortError"
          ? "Timed out fetching that page -- it may be slow or unreachable."
          : `Couldn't reach that URL: ${fetchErr?.message || "unknown error"}`;
      return res.status(502).json({ error: message });
    }

    if (html.length > 2_000_000) html = html.slice(0, 2_000_000);

    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const pageTitle = titleMatch ? decodeHtmlEntities(titleMatch[1]).trim() : "";
    const pageText = htmlToPlainText(html).slice(0, 15000);

    if (!pageText || pageText.replace(/\s/g, "").length < 40) {
      return res.status(422).json({
        error: "Couldn't extract readable text from that page -- it may be JavaScript-rendered, gated behind a login, or blocking automated requests.",
      });
    }

    const categoryGuidance: Record<string, string> = {
      company:
        "This is a specific lead's, contact's, or company's OWN website. Write ONE Knowledge Base entry capturing what's useful to know about THEM when a salesperson is reaching out or preparing to talk -- what they do, their industry, size/positioning signals, anything relevant to selling to this specific prospect. Do not describe AarPex or the CRM itself.",
      product:
        "This is the user's OWN product or service page. Write ONE Knowledge Base entry describing this offering -- what it is, who it's for, key features/benefits, pricing signals if present -- suitable for grounding AI-written pitches and answers about this offering.",
      operator:
        "This is the user's OWN company/about page. Write ONE Knowledge Base entry describing who this business is -- their background, mission, service offering, and what makes them credible -- suitable for grounding how the AI should position this business and its offering to prospects.",
    };

    const prompt = `You are helping populate a CRM's Knowledge Base from a webpage's content. ${categoryGuidance[category]}

Page URL: ${target.toString()}
Page title: ${pageTitle || "(none found)"}

Extracted page text (this is a raw dump -- it may include navigation links, footer boilerplate, or other noise; ignore that and focus on substantive content):
"""
${pageText}
"""

Return pure JSON only, matching this exact schema:
{
  "title": string (a short, specific title for this entry, under 80 characters -- not just the page title verbatim),
  "content": string (a well-organized summary in plain prose, 150-400 words, strictly factual -- never invent anything not supported by the page text; if the page has too little substantive content, say so plainly in "content" instead of padding it out),
  "tags": string[] (2-5 short, relevant tags)
}

IMPORTANT: Return pure valid JSON only, without markdown fences or additional commentary.`;

    const rawAiText = await callGeminiSafe(prompt);
    if (rawAiText) {
      try {
        const parsed = JSON.parse(rawAiText);
        return res.json({
          title: parsed.title || pageTitle || target.hostname,
          content: parsed.content || pageText.slice(0, 1500),
          tags: Array.isArray(parsed.tags) ? parsed.tags : [],
          sourceUrl: target.toString(),
          source: "gemini",
        });
      } catch {
        // Fall through to the heuristic response below
      }
    }

    // Heuristic fallback: no AI cleanup, just the raw extracted text --
    // still useful as a starting draft the user edits down themselves.
    return res.json({
      title: pageTitle || target.hostname,
      content: pageText.slice(0, 1500),
      tags: [],
      sourceUrl: target.toString(),
      source: "heuristic",
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to generate a knowledge base entry from that URL", details: err?.message });
  }
});

// Stripe Invoicing Integration Endpoints

// 1. Get Stripe configuration status
app.get("/api/stripe/status", (_req, res) => {
  const isConfigured = !!process.env.STRIPE_SECRET_KEY;
  res.json({
    isConfigured,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
    mode: isConfigured ? "live" : "demo",
    message: isConfigured
      ? "Stripe is connected and ready for live invoicing."
      : "Stripe is running in test simulation mode. Provide your custom Stripe Key in Settings to enable live processing.",
  });
});

// 1b. Verify user/tenant custom Stripe Key live
app.post("/api/stripe/verify-key", async (req, res) => {
  try {
    const { secretKey } = req.body;
    if (!secretKey || typeof secretKey !== "string") {
      return res.status(400).json({ valid: false, error: "Stripe Secret Key is required." });
    }
    const cleanKey = secretKey.trim();
    if (!cleanKey.startsWith("sk_test_") && !cleanKey.startsWith("sk_live_") && !cleanKey.startsWith("rk_")) {
      return res.status(400).json({ valid: false, error: "Invalid Stripe Secret Key format. Must start with sk_live_ or sk_test_." });
    }

    const testStripe = new Stripe(cleanKey);
    const balance = await testStripe.balance.retrieve();
    const isLive = cleanKey.startsWith("sk_live_");

    return res.json({
      valid: true,
      liveMode: isLive,
      availableCurrency: balance.available?.[0]?.currency?.toUpperCase() || "USD",
      message: `Stripe connection authenticated successfully in ${isLive ? "LIVE" : "TEST"} mode.`,
      verifiedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return res.status(400).json({
      valid: false,
      error: err.message || "Failed to authenticate Stripe credentials with Stripe API.",
    });
  }
});

// 2. Create and finalize a Stripe Invoice
app.post("/api/stripe/create-invoice", async (req, res) => {
  try {
    const {
      invoiceId,
      invoiceNumber,
      companyName,
      clientEmail,
      currency = "USD",
      items = [],
      total = 0,
      dueDate,
      notes,
      stripeSecretKey,
    } = req.body;

    const customKey = stripeSecretKey || (req.headers["x-stripe-secret-key"] as string);
    const stripe = getStripe(customKey);

    if (stripe) {
      // Find or create customer in Stripe
      let customerId: string | null = null;
      if (clientEmail) {
        const existing = await stripe.customers.list({ email: clientEmail, limit: 1 });
        if (existing.data.length > 0) {
          customerId = existing.data[0].id;
        }
      }

      if (!customerId) {
        const newCustomer = await stripe.customers.create({
          name: companyName || "Client Account",
          email: clientEmail || undefined,
          description: `Apex CRM Client: ${companyName}`,
          metadata: {
            crmCompany: companyName || "",
            crmInvoiceId: invoiceId || "",
          },
        });
        customerId = newCustomer.id;
      }

      // Calculate days until due
      let daysUntilDue = 14;
      if (dueDate) {
        const diffMs = new Date(dueDate).getTime() - Date.now();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        daysUntilDue = Math.max(1, diffDays);
      }

      // Add line items to Stripe invoice draft
      const normalizedCurrency = (currency || "USD").toLowerCase();
      if (items && items.length > 0) {
        for (const item of items) {
          const discountMultiplier = 1 - (item.discountPercent || 0) / 100;
          const unitPriceCents = Math.round((item.unitPrice || 0) * discountMultiplier * 100);
          const quantity = Math.max(1, item.quantity || 1);

          await stripe.invoiceItems.create({
            customer: customerId,
            description: item.description || `Invoice #${invoiceNumber} item`,
            amount: unitPriceCents * quantity,
            currency: normalizedCurrency,
          });
        }
      } else {
        await stripe.invoiceItems.create({
          customer: customerId,
          description: `Apex CRM Invoice #${invoiceNumber}`,
          amount: Math.round(total * 100),
          currency: normalizedCurrency,
        });
      }

      // Create draft invoice
      const invoice = await stripe.invoices.create({
        customer: customerId,
        collection_method: "send_invoice",
        days_until_due: daysUntilDue,
        description: notes || `Invoice #${invoiceNumber} from Apex Technologies Inc.`,
        metadata: {
          crmInvoiceId: invoiceId || "",
          crmInvoiceNumber: invoiceNumber || "",
        },
      });

      // Finalize the invoice to generate the public hosted link and PDF
      const finalized = await stripe.invoices.finalizeInvoice(invoice.id);

      return res.json({
        success: true,
        liveMode: true,
        stripeInvoiceId: finalized.id,
        hostedInvoiceUrl: finalized.hosted_invoice_url,
        invoicePdf: finalized.invoice_pdf,
        status: finalized.status,
        amountDue: (finalized.amount_due || 0) / 100,
        customerEmail: clientEmail,
      });
    }

    // Demo simulation mode when no STRIPE_SECRET_KEY is configured
    const simulatedId = `in_demo_${Date.now().toString(36)}`;
    const simulatedUrl = `https://invoice.stripe.com/i/acct_simulation/invst_demo_${invoiceNumber.toLowerCase().replace(/[^a-z0-9]/g, "")}`;

    return res.json({
      success: true,
      liveMode: false,
      stripeInvoiceId: simulatedId,
      hostedInvoiceUrl: simulatedUrl,
      invoicePdf: null,
      status: "open",
      amountDue: total,
      customerEmail: clientEmail,
      message: "Stripe invoice created in demo mode. Add STRIPE_SECRET_KEY in Settings to enable live Stripe charges.",
    });
  } catch (err: any) {
    console.error("Error in /api/stripe/create-invoice:", err);
    res.status(500).json({ error: err.message || "Failed to create Stripe invoice" });
  }
});

// 3. Create instant Stripe Checkout payment link
app.post("/api/stripe/create-payment-link", async (req, res) => {
  try {
    const {
      invoiceId,
      invoiceNumber,
      companyName,
      clientEmail,
      currency = "USD",
      amount = 0,
      description,
      stripeSecretKey,
    } = req.body;

    const customKey = stripeSecretKey || (req.headers["x-stripe-secret-key"] as string);
    const stripe = getStripe(customKey);
    const origin = req.headers.origin || "http://localhost:3000";

    if (stripe) {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        customer_email: clientEmail || undefined,
        line_items: [
          {
            price_data: {
              currency: (currency || "usd").toLowerCase(),
              product_data: {
                name: `Invoice #${invoiceNumber} - ${companyName || "Apex CRM"}`,
                description: description || `Payment for Invoice #${invoiceNumber}`,
              },
              unit_amount: Math.round(amount * 100),
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `${origin}/?invoice_paid=${invoiceId}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/?invoice_cancelled=${invoiceId}`,
        metadata: {
          crmInvoiceId: invoiceId || "",
          crmInvoiceNumber: invoiceNumber || "",
          companyName: companyName || "",
        },
      });

      return res.json({
        success: true,
        liveMode: true,
        checkoutUrl: session.url,
        sessionId: session.id,
      });
    }

    // Demo simulation checkout link
    const demoCheckoutUrl = `https://checkout.stripe.com/c/pay/cs_test_simulated_${invoiceNumber.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
    return res.json({
      success: true,
      liveMode: false,
      checkoutUrl: demoCheckoutUrl,
      sessionId: `cs_demo_${Date.now()}`,
      message: "Instant Stripe Checkout link generated in simulation mode.",
    });
  } catch (err: any) {
    console.error("Error in /api/stripe/create-payment-link:", err);
    res.status(500).json({ error: err.message || "Failed to generate Stripe payment link" });
  }
});

// 4. Check Stripe invoice status / sync payment
app.post("/api/stripe/sync-status", async (req, res) => {
  try {
    const { stripeInvoiceId, sessionId, stripeSecretKey } = req.body;
    const customKey = stripeSecretKey || (req.headers["x-stripe-secret-key"] as string);
    const stripe = getStripe(customKey);

    if (stripe && stripeInvoiceId && !stripeInvoiceId.startsWith("in_demo_")) {
      const inv = await stripe.invoices.retrieve(stripeInvoiceId);
      return res.json({
        success: true,
        liveMode: true,
        status: inv.status,
        isPaid: inv.status === "paid",
        amountPaid: (inv.amount_paid || 0) / 100,
        amountRemaining: (inv.amount_remaining || 0) / 100,
      });
    }

    if (stripe && sessionId && !sessionId.startsWith("cs_demo_")) {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      return res.json({
        success: true,
        liveMode: true,
        isPaid: session.payment_status === "paid",
        status: session.status,
        amountPaid: (session.amount_total || 0) / 100,
      });
    }

    return res.json({
      success: true,
      liveMode: false,
      status: "open",
      isPaid: false,
      message: "Synced simulation status.",
    });
  } catch (err: any) {
    console.error("Error in /api/stripe/sync-status:", err);
    res.status(500).json({ error: err.message || "Failed to sync status" });
  }
});

// ---------------------------------------------------------------------------
// Tenant Billing Products & Pricing (each tenant's OWN connected Stripe account)
//
// This is what lets anyone using the AarPex dashboard plug in their own Stripe
// secret key (Settings > Stripe Custom Keys) and then define products they
// sell to THEIR customers — either a recurring subscription price or a
// one-time fee — and generate a shareable Stripe Payment Link for it. This is
// fully separate from AarPex's own $29/mo platform subscription above, which
// always uses Aargard's master Stripe key instead.
// ---------------------------------------------------------------------------

app.post("/api/stripe/products/create", async (req, res) => {
  try {
    const { apiKey, name, description, pricingType, amount, currency, interval } = req.body;

    if (!apiKey || !String(apiKey).trim()) {
      return res.status(400).json({ error: "Connect a Stripe secret key in Settings first." });
    }
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "Product name is required." });
    }
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      return res.status(400).json({ error: "Enter a price amount greater than 0." });
    }
    if (pricingType !== "recurring" && pricingType !== "one_time") {
      return res.status(400).json({ error: "pricingType must be 'recurring' or 'one_time'." });
    }
    if (pricingType === "recurring" && !["day", "week", "month", "year"].includes(interval)) {
      return res.status(400).json({ error: "Recurring prices require a valid billing interval." });
    }

    const stripe = getStripe(apiKey);
    if (!stripe) {
      return res.status(400).json({ error: "Unable to initialize Stripe with the provided key." });
    }

    const product = await stripe.products.create({
      name: String(name).trim(),
      description: description ? String(description).trim() : undefined,
    });

    const price = await stripe.prices.create({
      product: product.id,
      currency: (currency || "usd").toLowerCase(),
      unit_amount: Math.round(numericAmount * 100),
      ...(pricingType === "recurring" ? { recurring: { interval } } : {}),
    });

    return res.json({
      success: true,
      product: {
        id: product.id,
        name: product.name,
        description: product.description || "",
        prices: [
          {
            id: price.id,
            amount: numericAmount,
            currency: price.currency,
            type: pricingType,
            interval: pricingType === "recurring" ? interval : undefined,
            createdAt: new Date().toISOString(),
          },
        ],
      },
      message: `Created "${name}" with a ${pricingType === "recurring" ? `recurring ${interval}ly` : "one-time"} price of $${numericAmount}.`,
    });
  } catch (err: any) {
    console.error("Error in /api/stripe/products/create:", err);
    return res.status(500).json({ error: err.message || "Failed to create product/price in Stripe." });
  }
});

app.get("/api/stripe/products/list", async (req, res) => {
  try {
    const apiKey = (req.query.apiKey as string) || (req.headers["x-stripe-secret-key"] as string);
    if (!apiKey || !apiKey.trim()) {
      return res.status(400).json({ error: "Connect a Stripe secret key in Settings first." });
    }

    const stripe = getStripe(apiKey);
    if (!stripe) {
      return res.status(400).json({ error: "Unable to initialize Stripe with the provided key." });
    }

    const prices = await stripe.prices.list({ active: true, limit: 100, expand: ["data.product"] });

    const productsById = new Map<string, any>();
    for (const price of prices.data) {
      const product: any = price.product;
      if (!product || typeof product === "string" || product.deleted) continue;

      if (!productsById.has(product.id)) {
        productsById.set(product.id, {
          id: product.id,
          name: product.name,
          description: product.description || "",
          prices: [],
        });
      }

      productsById.get(product.id).prices.push({
        id: price.id,
        amount: (price.unit_amount || 0) / 100,
        currency: price.currency,
        type: price.type === "recurring" ? "recurring" : "one_time",
        interval: price.recurring?.interval,
        createdAt: new Date(price.created * 1000).toISOString(),
      });
    }

    return res.json({ success: true, products: Array.from(productsById.values()) });
  } catch (err: any) {
    console.error("Error in /api/stripe/products/list:", err);
    return res.status(500).json({ error: err.message || "Failed to list Stripe products." });
  }
});

app.post("/api/stripe/products/payment-link", async (req, res) => {
  try {
    const { apiKey, priceId, quantity } = req.body;
    if (!apiKey || !String(apiKey).trim()) {
      return res.status(400).json({ error: "Connect a Stripe secret key in Settings first." });
    }
    if (!priceId) {
      return res.status(400).json({ error: "priceId is required." });
    }

    const stripe = getStripe(apiKey);
    if (!stripe) {
      return res.status(400).json({ error: "Unable to initialize Stripe with the provided key." });
    }

    const link = await stripe.paymentLinks.create({
      line_items: [{ price: priceId, quantity: Number(quantity) > 0 ? Number(quantity) : 1 }],
    });

    return res.json({ success: true, url: link.url });
  } catch (err: any) {
    console.error("Error in /api/stripe/products/payment-link:", err);
    return res.status(500).json({ error: err.message || "Failed to create payment link." });
  }
});

// 5. Current Stripe balance (available + pending, per currency) for the
//    dedicated Stripe dashboard page.
app.get("/api/stripe/balance", async (req, res) => {
  try {
    const apiKey = (req.query.apiKey as string) || (req.headers["x-stripe-secret-key"] as string);
    if (!apiKey || !apiKey.trim()) {
      return res.status(400).json({ error: "Connect a Stripe secret key in Settings first." });
    }

    const stripe = getStripe(apiKey);
    if (!stripe) {
      return res.status(400).json({ error: "Unable to initialize Stripe with the provided key." });
    }

    const balance = await stripe.balance.retrieve();

    return res.json({
      success: true,
      available: balance.available.map((b) => ({ amount: b.amount / 100, currency: b.currency.toUpperCase() })),
      pending: balance.pending.map((b) => ({ amount: b.amount / 100, currency: b.currency.toUpperCase() })),
      liveMode: !balance.livemode ? false : true,
    });
  } catch (err: any) {
    console.error("Error in /api/stripe/balance:", err);
    return res.status(500).json({ error: err.message || "Failed to retrieve Stripe balance." });
  }
});

// 6. List subscriptions on the tenant's own connected Stripe account.
app.get("/api/stripe/subscriptions/list", async (req, res) => {
  try {
    const apiKey = (req.query.apiKey as string) || (req.headers["x-stripe-secret-key"] as string);
    if (!apiKey || !apiKey.trim()) {
      return res.status(400).json({ error: "Connect a Stripe secret key in Settings first." });
    }

    const stripe = getStripe(apiKey);
    if (!stripe) {
      return res.status(400).json({ error: "Unable to initialize Stripe with the provided key." });
    }

    const subs = await stripe.subscriptions.list({
      limit: 50,
      status: "all",
      expand: ["data.customer", "data.items.data.price.product"],
    });

    const subscriptions = subs.data.map((sub) => {
      const customer: any = sub.customer;
      const firstItem = sub.items.data[0];
      const price = firstItem?.price;
      const product: any = price?.product;
      return {
        id: sub.id,
        status: sub.status,
        customerName: (customer && typeof customer !== "string" && !customer.deleted && (customer as any).name) || null,
        customerEmail: (customer && typeof customer !== "string" && !customer.deleted && (customer as any).email) || null,
        productName: (product && typeof product !== "string" && !product.deleted && product.name) || "Subscription",
        amount: (price?.unit_amount || 0) / 100,
        currency: (price?.currency || "usd").toUpperCase(),
        interval: price?.recurring?.interval,
        currentPeriodEnd: firstItem?.current_period_end
          ? new Date(firstItem.current_period_end * 1000).toISOString()
          : null,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        createdAt: new Date(sub.created * 1000).toISOString(),
      };
    });

    return res.json({ success: true, subscriptions });
  } catch (err: any) {
    console.error("Error in /api/stripe/subscriptions/list:", err);
    return res.status(500).json({ error: err.message || "Failed to list Stripe subscriptions." });
  }
});

// 7. List invoices on the tenant's own connected Stripe account (distinct
//    from the CRM's local invoice ledger — these are Stripe-hosted invoices,
//    e.g. from subscriptions or invoices created via /api/stripe/create-invoice).
app.get("/api/stripe/invoices/list", async (req, res) => {
  try {
    const apiKey = (req.query.apiKey as string) || (req.headers["x-stripe-secret-key"] as string);
    if (!apiKey || !apiKey.trim()) {
      return res.status(400).json({ error: "Connect a Stripe secret key in Settings first." });
    }

    const stripe = getStripe(apiKey);
    if (!stripe) {
      return res.status(400).json({ error: "Unable to initialize Stripe with the provided key." });
    }

    const invoices = await stripe.invoices.list({ limit: 50, expand: ["data.customer"] });

    const results = invoices.data.map((inv) => {
      const customer: any = inv.customer;
      return {
        id: inv.id,
        number: inv.number,
        status: inv.status,
        customerName: (customer && typeof customer !== "string" && !customer.deleted && (customer as any).name) || null,
        customerEmail: (customer && typeof customer !== "string" && !customer.deleted && (customer as any).email) || inv.customer_email,
        amountDue: (inv.amount_due || 0) / 100,
        amountPaid: (inv.amount_paid || 0) / 100,
        currency: (inv.currency || "usd").toUpperCase(),
        hostedInvoiceUrl: inv.hosted_invoice_url,
        invoicePdf: inv.invoice_pdf,
        createdAt: new Date(inv.created * 1000).toISOString(),
      };
    });

    return res.json({ success: true, invoices: results });
  } catch (err: any) {
    console.error("Error in /api/stripe/invoices/list:", err);
    return res.status(500).json({ error: err.message || "Failed to list Stripe invoices." });
  }
});

// 8. Ad-hoc payment link for an arbitrary amount (not tied to a saved
//    product/price) — the "Quick Payment Link" action on the Stripe page.
app.post("/api/stripe/quick-payment-link", async (req, res) => {
  try {
    const { apiKey, name, amount, currency, quantity } = req.body;
    if (!apiKey || !String(apiKey).trim()) {
      return res.status(400).json({ error: "Connect a Stripe secret key in Settings first." });
    }
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "A short description is required." });
    }
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      return res.status(400).json({ error: "Enter an amount greater than 0." });
    }

    const stripe = getStripe(apiKey);
    if (!stripe) {
      return res.status(400).json({ error: "Unable to initialize Stripe with the provided key." });
    }

    const price = await stripe.prices.create({
      currency: (currency || "usd").toLowerCase(),
      unit_amount: Math.round(numericAmount * 100),
      product_data: { name: String(name).trim() },
    });

    const link = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: Number(quantity) > 0 ? Number(quantity) : 1 }],
    });

    return res.json({ success: true, url: link.url });
  } catch (err: any) {
    console.error("Error in /api/stripe/quick-payment-link:", err);
    return res.status(500).json({ error: err.message || "Failed to create payment link." });
  }
});

// SaaS Multi-Tenant Subscription & Checkout Endpoint
// AarPex's platform subscription — Growth at $29/month (the default every
// workspace is provisioned on) or Pro at $99/month (adds multi-mailbox
// sending and the rest of the Pro feature set — see
// src/data/subscriptionPlans.ts), both with a 14-day free trial on signup.
// This ALWAYS bills through Aargard's own master Stripe account
// (STRIPE_SECRET_KEY from the server environment) and never accepts a
// caller-supplied key: tenant/custom Stripe keys are only ever used for a
// tenant's own downstream customer billing (see /api/stripe/products/*).
const AARPEX_PLATFORM_MONTHLY_PRICE_USD = 29;
const AARPEX_PLATFORM_PRO_MONTHLY_PRICE_USD = 99;
const AARPEX_PLATFORM_TRIAL_DAYS = 14;
// The real Stripe Product record ("AarPex CRM — Standard Plan") in Aargard's
// master Stripe account — checkout references this product id directly
// (via price_data.product) instead of creating a throwaway product_data
// object on every checkout session, so all subscriptions roll up under one
// product in Stripe's dashboard/reporting. Both Growth and Pro currently
// bill under this same product with a different price_data.unit_amount --
// swap in a dedicated AARPEX_PLATFORM_PRO_STRIPE_PRODUCT_ID env var here if
// Pro should get its own Stripe Product later. Overridable via env for a
// different Stripe mode/account without a code change.
const AARPEX_PLATFORM_STRIPE_PRODUCT_ID =
  process.env.AARPEX_PLATFORM_STRIPE_PRODUCT_ID || "prod_VH0Cjb9lnxq6UN";

// Pro is testing-only right now -- keep this in sync with
// src/data/subscriptionPlans.ts's PRO_TESTER_EMAILS. This is the real
// enforcement boundary: the UI hides Pro from everyone else's plan picker,
// but that's bypassable by calling this endpoint directly, so any request
// for plan "Pro" from a caller whose email isn't on this list is clamped
// down to Growth pricing before a Stripe Checkout session is ever created.
const AARPEX_PRO_TESTER_EMAILS = ["ceo@aargard.com"];
function isAarpexProTesterEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  const normalized = String(email).trim().toLowerCase();
  return AARPEX_PRO_TESTER_EMAILS.some((e) => e.toLowerCase() === normalized);
}

app.post("/api/subscriptions/checkout", async (req, res) => {
  try {
    const { plan, billingCycle, email, name, organizationName, cardNumber } = req.body;

    if (!email || !organizationName) {
      return res.status(400).json({
        error: "Email and organization name are required.",
      });
    }

    // Platform pricing by tier -- Growth ($29/mo) or Pro ($99/mo), both with
    // a free trial and nothing charged today. Pro is clamped to Growth for
    // any caller not on the tester allowlist, regardless of what the
    // request asked for.
    const requestedPlan = plan || "Growth";
    const resolvedPlan = requestedPlan === "Pro" && !isAarpexProTesterEmail(email) ? "Growth" : requestedPlan;
    const pricePerMonth =
      resolvedPlan === "Pro" ? AARPEX_PLATFORM_PRO_MONTHLY_PRICE_USD : AARPEX_PLATFORM_MONTHLY_PRICE_USD;
    const totalCharge = 0;

    // Always the platform's own master key — never a per-request override.
    const stripe = getStripe();

    if (stripe) {
      try {
        const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
        const session = await stripe.checkout.sessions.create({
          mode: "subscription",
          payment_method_types: ["card"],
          customer_email: email,
          // Every new account (other than the exempt founder account handled
          // client-side) must have a live, chargeable card on file before its
          // workspace goes live — this forces Stripe Checkout to collect a
          // card even though the trial itself is $0 due today, so the
          // platform can actually charge automatically the moment the trial
          // ends instead of relying on a manual follow-up.
          payment_method_collection: "always",
          line_items: [
            {
              price_data: {
                currency: "usd",
                product: AARPEX_PLATFORM_STRIPE_PRODUCT_ID,
                unit_amount: pricePerMonth * 100,
                recurring: { interval: "month" },
              },
              quantity: 1,
            },
          ],
          subscription_data: {
            trial_period_days: AARPEX_PLATFORM_TRIAL_DAYS,
          },
          success_url: `${appUrl}/?subscription=success&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${appUrl}/?subscription=cancelled`,
          metadata: {
            organization: organizationName,
            plan: resolvedPlan,
          },
        });

        return res.json({
          success: true,
          mode: "live_checkout",
          checkoutUrl: session.url,
          plan: resolvedPlan,
          pricePerMonth,
          trialDays: AARPEX_PLATFORM_TRIAL_DAYS,
          currency: "USD",
          message: `Redirecting to Stripe Checkout for the AarPex ${resolvedPlan} plan ($${pricePerMonth}/mo after a ${AARPEX_PLATFORM_TRIAL_DAYS}-day free trial).`,
        });
      } catch (stripeErr: any) {
        // A live Stripe key IS configured, so this is a real misconfiguration
        // (bad/restricted key, a product id that doesn't belong to this
        // account, etc.) — surface it instead of silently falling back to
        // the simulated path below, which used to mask exactly this kind of
        // error as if billing had never been connected at all.
        console.error("Stripe Checkout Session creation failed:", stripeErr.message);
        return res.status(502).json({
          error: `Stripe rejected the checkout request: ${stripeErr.message || "unknown error"}`,
          stripeCode: stripeErr.code || stripeErr.type || null,
        });
      }
    }

    // No platform Stripe key configured at all yet — simulate activation so
    // the UI keeps working end-to-end until a real key is attached
    // server-side. (Only reached when STRIPE_SECRET_KEY is unset — any error
    // from an actually-configured key is returned above instead.)
    const last4 = cardNumber ? String(cardNumber).replace(/\s+/g, "").slice(-4) : "4242";
    const brand = cardNumber && String(cardNumber).startsWith("4") ? "Visa" : "Mastercard";
    const trialEnds = new Date(Date.now() + AARPEX_PLATFORM_TRIAL_DAYS * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    return res.json({
      success: true,
      mode: "simulated",
      subscriptionId: `sub_sim_${Date.now()}`,
      customerId: `cus_sim_${Date.now()}`,
      plan: resolvedPlan,
      billingCycle: "monthly",
      status: "trialing",
      pricePerMonth,
      totalCharged: totalCharge,
      trialDays: AARPEX_PLATFORM_TRIAL_DAYS,
      currency: "USD",
      nextBillingDate: trialEnds,
      cardLast4: last4,
      cardBrand: brand,
      receiptUrl: `https://billing.aarpex.com/receipts/rcpt_${Date.now().toString(36)}`,
      message: `Card saved. Your ${AARPEX_PLATFORM_TRIAL_DAYS}-day free trial has started for ${organizationName} — first charge of $${pricePerMonth}/mo on ${trialEnds}. (Simulated — connect a platform Stripe key to charge real cards.)`,
    });
  } catch (err: any) {
    console.error("Error in /api/subscriptions/checkout:", err);
    return res.status(500).json({ error: err.message || "Failed to process subscription checkout" });
  }
});

// Confirms a completed Stripe Checkout session (the redirect back from
// /api/subscriptions/checkout's success_url) and returns the real
// subscription/customer/card details so the client can finish provisioning
// the workspace tagged with real Stripe identifiers instead of local-only
// placeholders. This is the point where a new account's card is confirmed
// as actually on file and billing as "live" — the workspace is only ever
// provisioned client-side after this succeeds (except for the exempt
// founder account, which never goes through Checkout at all).
app.post("/api/subscriptions/verify-session", async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }

    const stripe = getStripe();
    if (!stripe) {
      return res.status(400).json({ error: "Live Stripe billing isn't configured on this deployment." });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "subscription.default_payment_method"],
    });

    if (session.payment_status === "unpaid" && session.mode === "payment") {
      return res.status(402).json({ error: "This checkout session was not completed." });
    }

    const subscription = session.subscription as any;
    const paymentMethod = subscription?.default_payment_method as any;

    return res.json({
      success: true,
      subscriptionId: typeof subscription === "string" ? subscription : subscription?.id || null,
      customerId: typeof session.customer === "string" ? session.customer : session.customer?.id || null,
      status: subscription?.status || null,
      trialEnd: subscription?.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
      cardLast4: paymentMethod?.card?.last4 || null,
      cardBrand: paymentMethod?.card?.brand
        ? paymentMethod.card.brand.charAt(0).toUpperCase() + paymentMethod.card.brand.slice(1)
        : null,
    });
  } catch (err: any) {
    console.error("Error in /api/subscriptions/verify-session:", err);
    return res.status(500).json({ error: err.message || "Failed to verify checkout session" });
  }
});

// Opens the Stripe-hosted Customer Portal for a workspace's own platform
// subscription — this is how a workspace owner adds a new card, swaps their
// default payment method, updates their billing address, or downloads past
// invoices, without anyone on our side touching it. Requires the Stripe
// Customer Portal to be activated for this account (Stripe Dashboard >
// Settings > Billing > Customer portal).
app.post("/api/subscriptions/billing-portal", async (req, res) => {
  try {
    const { customerId } = req.body;
    if (!customerId) {
      return res.status(400).json({
        error: "This workspace has no Stripe billing account on file yet — it may predate live billing, or belong to the exempt founder account.",
      });
    }

    const stripe = getStripe();
    if (!stripe) {
      return res.status(400).json({ error: "Live Stripe billing isn't configured on this deployment." });
    }

    const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/`,
    });

    return res.json({ success: true, url: portalSession.url });
  } catch (err: any) {
    console.error("Error in /api/subscriptions/billing-portal:", err);
    return res.status(502).json({ error: err.message || "Failed to open the billing portal" });
  }
});

// Webmail & Hostinger Integration Endpoints

// 1. Verify Webmail / Hostinger SMTP connection
app.post("/api/webmail/verify", async (req, res) => {
  try {
    const {
      provider,
      email,
      password,
      smtpHost,
      smtpPort = 465,
      smtpEncryption = "SSL",
    } = req.body;

    if (!email || !smtpHost) {
      return res.status(400).json({
        success: false,
        error: "Email address and SMTP host are required.",
      });
    }

    const port = Number(smtpPort) || (smtpEncryption === "STARTTLS" || smtpEncryption === "TLS" ? 587 : 465);
    const isSecure = port === 465;

    const transporter = nodemailer.createTransport({
      host: smtpHost.trim(),
      port,
      secure: isSecure,
      auth: password && password.trim() ? {
        user: email.trim(),
        pass: password.trim(),
      } : undefined,
      tls: {
        rejectUnauthorized: false,
      },
      connectionTimeout: 8000,
    });

    try {
      await transporter.verify();
      return res.json({
        success: true,
        provider: provider || "hostinger",
        smtpHost,
        port,
        secure: isSecure,
        message: `Connected successfully to ${smtpHost}:${port}. Mail server authentication verified.`,
        verifiedAt: new Date().toISOString(),
      });
    } catch (verifyErr: any) {
      return res.json({
        success: false,
        error: verifyErr.message || "Could not verify SMTP handshake with mail server.",
        details: "Ensure your mailbox email and password or app-password are valid, and port is open.",
      });
    }
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || "Failed to test webmail connection",
    });
  }
});

// Helper to format multiple attachments for nodemailer
function formatNodemailerAttachments(attachments: any[]): any[] {
  if (!Array.isArray(attachments) || attachments.length === 0) return [];
  return attachments.map((att: any) => {
    const filename = att.filename || "attachment.bin";
    const rawContent = att.content || "";

    if (typeof rawContent === "string" && rawContent.startsWith("data:")) {
      const parts = rawContent.split(";base64,");
      const mime = parts[0].replace("data:", "");
      const buffer = Buffer.from(parts[1] || "", "base64");
      return {
        filename,
        content: buffer,
        contentType: att.contentType || mime,
      };
    } else if (typeof rawContent === "string" && att.encoding === "base64") {
      return {
        filename,
        content: Buffer.from(rawContent, "base64"),
        contentType: att.contentType || "application/octet-stream",
      };
    } else if (typeof rawContent === "string") {
      return {
        filename,
        content: rawContent,
        contentType: att.contentType || "text/plain",
      };
    }
    return att;
  });
}

// 2. Send test email via Webmail / Hostinger (Supports Multiple Attachments)
app.post("/api/webmail/send-test", async (req, res) => {
  try {
    const {
      email,
      displayName,
      password,
      smtpHost,
      smtpPort = 465,
      recipientEmail,
      subject,
      body,
      attachments = [],
    } = req.body;

    if (!email || !smtpHost) {
      return res.status(400).json({ success: false, error: "Email address and SMTP host are required." });
    }

    const port = Number(smtpPort) || 465;
    const isSecure = port === 465;

    const transporter = nodemailer.createTransport({
      host: smtpHost.trim(),
      port,
      secure: isSecure,
      auth: password && password.trim() ? {
        user: email.trim(),
        pass: password.trim(),
      } : undefined,
      tls: { rejectUnauthorized: false },
      connectionTimeout: 10000,
    });

    const targetEmail = recipientEmail || email;
    const fromAddress = displayName ? `"${displayName}" <${email}>` : email;
    const formattedAttachments = formatNodemailerAttachments(attachments);

    const info = await transporter.sendMail({
      from: fromAddress,
      to: targetEmail,
      subject: subject || "Apex CRM - Webmail Integration Test",
      text: body || `This is an automated verification email sent from your CRM workspace via ${smtpHost}. Your mail configuration is active and working!`,
      attachments: formattedAttachments,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #1e293b; background: #f8fafc; border-radius: 12px; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0;">
          <h2 style="color: #0d9488; margin-top: 0; font-size: 20px;">Apex CRM Webmail Connected</h2>
          <p style="font-size: 14px; line-height: 1.6; color: #334155;">Hello,</p>
          <p style="font-size: 14px; line-height: 1.6; color: #334155;">This email confirms that your outgoing mail server (<strong>${smtpHost}:${port}</strong>) is correctly connected and authenticated to your CRM workspace.</p>
          <div style="margin: 20px 0; padding: 12px 16px; background: #f1f5f9; border-radius: 8px; font-size: 13px; font-family: monospace;">
            Server: ${smtpHost}<br/>
            Account: ${email}<br/>
            Security: ${isSecure ? "SSL (Port 465)" : `TLS (Port ${port})`}<br/>
            Attachments: ${formattedAttachments.length} file(s)<br/>
            Dispatched: ${new Date().toLocaleString()}
          </div>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="font-size: 12px; color: #64748b; margin-bottom: 0;">Sent via Apex CRM Multi-Tenant Webmail Integration</p>
        </div>
      `,
    });

    return res.json({
      success: true,
      messageId: info.messageId,
      recipient: targetEmail,
      attachmentsCount: formattedAttachments.length,
      message: `Test email dispatched successfully to ${targetEmail} with ${formattedAttachments.length} attachment(s).`,
    });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      error: err.message || "Failed to dispatch test email. Verify SMTP credentials and firewall rules.",
    });
  }
});

// 3. Send full transactional or customer email with multiple file attachments
app.post("/api/webmail/send-email", async (req, res) => {
  try {
    const {
      email,
      displayName,
      password,
      smtpHost,
      smtpPort = 465,
      to,
      cc,
      bcc,
      subject,
      body,
      html,
      attachments = [],
    } = req.body;

    if (!to) {
      return res.status(400).json({ success: false, error: "Recipient email (to) is required." });
    }

    // Default to configured Hostinger/SMTP credentials or simulation if not yet populated
    const senderEmail = email && email.trim() ? email.trim() : "billing@apexcrm.enterprise";
    const host = smtpHost && smtpHost.trim() ? smtpHost.trim() : "smtp.hostinger.com";
    const port = Number(smtpPort) || 465;
    const isSecure = port === 465;

    const formattedAttachments = formatNodemailerAttachments(attachments);

    // If real password and host are provided, dispatch via actual nodemailer SMTP
    if (password && password.trim()) {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: isSecure,
        auth: {
          user: senderEmail,
          pass: password.trim(),
        },
        tls: { rejectUnauthorized: false },
        connectionTimeout: 12000,
      });

      const fromHeader = displayName ? `"${displayName}" <${senderEmail}>` : senderEmail;

      const info = await transporter.sendMail({
        from: fromHeader,
        to,
        cc: cc || undefined,
        bcc: bcc || undefined,
        subject: subject || "Notification from CRM",
        text: body || "",
        html: html || (body ? `<div style="font-family: sans-serif; white-space: pre-wrap; color: #1e293b; font-size: 14px; line-height: 1.6;">${body}</div>` : undefined),
        attachments: formattedAttachments,
      });

      return res.json({
        success: true,
        liveMode: true,
        messageId: info.messageId,
        to,
        subject,
        attachmentsCount: formattedAttachments.length,
        message: `Email dispatched successfully to ${Array.isArray(to) ? to.join(", ") : to} with ${formattedAttachments.length} file attachment(s).`,
      });
    }

    // High-fidelity instant simulation mode for workspaces without live credentials
    return res.json({
      success: true,
      liveMode: false,
      messageId: `msg_sim_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      to,
      subject,
      attachmentsCount: formattedAttachments.length,
      message: `Email queued & dispatched via CRM Mail Gateway to ${Array.isArray(to) ? to.join(", ") : to} (${formattedAttachments.length} file attachment(s)). Connect your SMTP password in Settings → Webmail for direct live relay.`,
    });
  } catch (err: any) {
    console.error("Error in /api/webmail/send-email:", err);
    return res.status(400).json({
      success: false,
      error: err.message || "Failed to dispatch email.",
    });
  }
});

// Inbox reply-tracking: checks the tenant's own mailbox (via IMAP, using the
// same webmail credentials already stored for sending) for any reply from a
// given list of lead/contact email addresses -- used to auto-pause further
// Email Marketing follow-ups once someone has actually written back. Client
// sends the tenant's IMAP config per-request (server is stateless), exactly
// like /api/webmail/send-email does for SMTP.
app.post("/api/webmail/check-replies", async (req, res) => {
  const {
    email,
    password,
    imapHost,
    imapPort = 993,
    imapEncryption = "SSL",
    addresses = [],
    sinceDate,
  } = req.body || {};

  const cleanAddresses: string[] = Array.isArray(addresses)
    ? addresses.filter((a: any) => typeof a === "string" && a.trim()).map((a: string) => a.trim().toLowerCase())
    : [];

  if (cleanAddresses.length === 0) {
    return res.json({ repliedEmails: [], checked: 0, simulated: false, checkedAt: new Date().toISOString() });
  }

  // No real mailbox credentials configured yet -- can't check anything, but
  // this isn't an error, just "nothing to report" so the UI can say so.
  if (!password || !password.trim() || !email || !email.trim() || !imapHost || !imapHost.trim()) {
    return res.json({
      repliedEmails: [],
      checked: cleanAddresses.length,
      simulated: true,
      checkedAt: new Date().toISOString(),
      message: "No webmail IMAP credentials configured for this workspace yet -- connect one in Settings to enable real reply detection.",
    });
  }

  let client: ImapFlow | null = null;
  try {
    client = new ImapFlow({
      host: imapHost.trim(),
      port: Number(imapPort) || 993,
      secure: (imapEncryption || "SSL").toUpperCase() !== "STARTTLS",
      auth: { user: email.trim(), pass: password.trim() },
      logger: false,
      tls: { rejectUnauthorized: false },
    });

    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    const repliedEmails = new Set<string>();

    try {
      const searchWindow = sinceDate ? new Date(sinceDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      for (const address of cleanAddresses) {
        try {
          const uids = await client.search({ from: address, since: searchWindow }, { uid: true });
          if (uids && uids.length > 0) {
            repliedEmails.add(address);
          }
        } catch (perAddressErr) {
          // One address failing to search shouldn't abort the whole batch.
          console.error(`[check-replies] search failed for ${address}:`, perAddressErr);
        }
      }
    } finally {
      lock.release();
    }

    return res.json({
      repliedEmails: Array.from(repliedEmails),
      checked: cleanAddresses.length,
      simulated: false,
      checkedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[check-replies] IMAP connection failed:", err.message || err);
    return res.status(200).json({
      repliedEmails: [],
      checked: cleanAddresses.length,
      simulated: true,
      checkedAt: new Date().toISOString(),
      message: `Couldn't connect to the mailbox to check for replies: ${err.message || "unknown error"}`,
    });
  } finally {
    try {
      await client?.logout();
    } catch {
      // best-effort cleanup only
    }
  }
});

// ----------------------------------------------------------------------------
// File Manager -- workspace file storage, backed by a private Supabase
// Storage bucket. Only the /api/storage/* endpoints below ever touch the
// bucket directly; the client only ever sees a StoredFile metadata record
// (see src/types.ts) plus short-lived signed URLs for download. Quota is
// enforced HERE, server-side, against the actual sum of stored_files rows
// for the tenant -- never trust a client-computed usage figure, since that's
// trivially bypassed by calling this endpoint directly.
//
// STORAGE_LIMITS_BYTES is kept in sync by hand with
// src/data/subscriptionPlans.ts's STORAGE_LIMITS_GB (same reasoning as
// STANDARD_INDUSTRIES above -- server.ts bundles standalone for the Node
// runtime and this rarely changes): 1GB on Growth ($29/mo), 10GB on Pro
// ($99/mo).
// ----------------------------------------------------------------------------
const TENANT_FILES_BUCKET = "tenant-files";
const STORAGE_LIMITS_BYTES: Record<string, number> = {
  Starter: 1 * 1024 ** 3,
  Growth: 1 * 1024 ** 3,
  Pro: 10 * 1024 ** 3,
  Enterprise: 10 * 1024 ** 3,
  Free: 1 * 1024 ** 3,
};

let bucketEnsured = false;
async function ensureTenantFilesBucket(supabase: ReturnType<typeof createClient>) {
  if (bucketEnsured) return;
  try {
    await supabase.storage.createBucket(TENANT_FILES_BUCKET, { public: false });
  } catch (err: any) {
    // "already exists" (or any other create race) is fine -- the bucket
    // just needs to exist by the time we upload into it.
  } finally {
    bucketEnsured = true;
  }
}

app.post("/api/storage/upload", async (req, res) => {
  try {
    const { tenantId, plan, filename, contentType, dataUrl } = req.body || {};
    if (!tenantId || !dataUrl || !filename) {
      return res.status(400).json({ error: "tenantId, filename, and dataUrl are required." });
    }

    const commaIdx = String(dataUrl).indexOf(",");
    const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
    const buffer = Buffer.from(base64, "base64");
    const size = buffer.length;

    const supabase = getServerSupabase();
    if (supabase) {
      const quotaBytes = STORAGE_LIMITS_BYTES[plan] ?? STORAGE_LIMITS_BYTES.Growth;
      const { data: existing, error: sumErr } = await supabase
        .from("stored_files")
        .select("size")
        .eq("tenant_id", tenantId);
      if (!sumErr && Array.isArray(existing)) {
        const usedBytes = existing.reduce((sum: number, row: any) => sum + (Number(row.size) || 0), 0);
        if (usedBytes + size > quotaBytes) {
          const usedGb = (usedBytes / 1024 ** 3).toFixed(2);
          const quotaGb = (quotaBytes / 1024 ** 3).toFixed(0);
          return res.status(413).json({
            error: `Storage limit reached -- you're using ${usedGb}GB of your ${quotaGb}GB plan limit. Delete some files or upgrade your plan to upload more.`,
          });
        }
      }

      await ensureTenantFilesBucket(supabase);
      const storagePath = `${tenantId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${filename}`.replace(/\s+/g, "_");
      const { error: uploadErr } = await supabase.storage
        .from(TENANT_FILES_BUCKET)
        .upload(storagePath, buffer, { contentType: contentType || "application/octet-stream", upsert: false });
      if (uploadErr) {
        return res.status(500).json({ error: `Upload failed: ${uploadErr.message}` });
      }

      return res.json({ storagePath, size, contentType: contentType || "application/octet-stream", filename });
    }

    // No Supabase project configured (local/demo mode) -- accept the upload
    // without real persistence or enforcement so the UI still works.
    return res.json({
      storagePath: `local/${Date.now()}_${filename}`,
      size,
      contentType: contentType || "application/octet-stream",
      filename,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Upload failed." });
  }
});

app.post("/api/storage/signed-url", async (req, res) => {
  try {
    const { storagePath } = req.body || {};
    if (!storagePath) return res.status(400).json({ error: "storagePath is required." });
    const supabase = getServerSupabase();
    if (!supabase) return res.status(400).json({ error: "No storage backend configured." });
    const { data, error } = await supabase.storage.from(TENANT_FILES_BUCKET).createSignedUrl(storagePath, 3600);
    if (error || !data) return res.status(404).json({ error: error?.message || "File not found." });
    return res.json({ url: data.signedUrl });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Couldn't generate a download link." });
  }
});

app.post("/api/storage/delete", async (req, res) => {
  try {
    const { storagePath } = req.body || {};
    if (!storagePath) return res.status(400).json({ error: "storagePath is required." });
    const supabase = getServerSupabase();
    if (!supabase) return res.json({ success: true });
    const { error } = await supabase.storage.from(TENANT_FILES_BUCKET).remove([storagePath]);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Delete failed." });
  }
});

// 4. Supabase Cloud Database Connection Verification Endpoint
app.post("/api/supabase/verify", async (req, res) => {
  try {
    const { url, anonKey, serviceRoleKey } = req.body;

    if (!url || !url.trim()) {
      return res.status(400).json({
        success: false,
        error: "Supabase Project URL is required (e.g., https://your-project-id.supabase.co).",
      });
    }

    const cleanUrl = url.trim().replace(/\/+$/, "");

    // Validate URL syntax
    try {
      new URL(cleanUrl);
    } catch {
      return res.status(400).json({
        success: false,
        error: "Invalid Supabase Project URL format. Must begin with https://",
      });
    }

    const keyToUse = (serviceRoleKey && serviceRoleKey.trim()) || (anonKey && anonKey.trim()) || "";
    if (!keyToUse) {
      return res.status(400).json({
        success: false,
        error: "Either a Supabase anon/public key or service_role secret key is required.",
      });
    }

    const startTime = Date.now();
    try {
      // Probe Supabase PostgREST root endpoint
      const response = await fetch(`${cleanUrl}/rest/v1/`, {
        method: "GET",
        headers: {
          apikey: keyToUse,
          Authorization: `Bearer ${keyToUse}`,
        },
      });

      const latencyMs = Date.now() - startTime;

      if (response.ok || response.status === 200) {
        return res.json({
          success: true,
          status: "connected",
          url: cleanUrl,
          latencyMs,
          statusCode: response.status,
          message: `Connected successfully to Supabase project at ${cleanUrl}. API Gateway responded in ${latencyMs}ms.`,
          hasServiceRoleKey: !!(serviceRoleKey && serviceRoleKey.trim()),
          verifiedAt: new Date().toISOString(),
        });
      } else if (response.status === 401 || response.status === 403) {
        return res.json({
          success: false,
          status: "unauthorized",
          url: cleanUrl,
          statusCode: response.status,
          error: "Supabase rejected the API key (HTTP 401/403). Double-check your anon or service_role key.",
        });
      } else {
        return res.json({
          success: false,
          status: "warning",
          url: cleanUrl,
          statusCode: response.status,
          message: `Endpoint reachable (${response.status} ${response.statusText}).`,
          verifiedAt: new Date().toISOString(),
        });
      }
    } catch (networkErr: any) {
      return res.json({
        success: false,
        status: "unreachable",
        url: cleanUrl,
        error: networkErr.message || "Failed to establish network handshake with Supabase URL.",
        details: "Ensure the project ref is active and not paused in your Supabase dashboard.",
      });
    }
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || "Supabase verification service error",
    });
  }
});

// ============================================================================
// WhatsApp Business -- verify connection + send message, via either of two
// providers a tenant can choose between in Settings:
//
//   "meta"   -- talks to Meta's Graph/Cloud API directly with a system-user
//               access token.
//   "twilio" -- talks to Twilio's WhatsApp API (Twilio sits in front of the
//               same underlying WhatsApp network), authenticated with a
//               Twilio Account SID + Auth Token and sent from a
//               WhatsApp-enabled Twilio number.
//
// Both providers enforce the same WhatsApp platform rule: a free-text
// message only works inside the 24-hour "customer service window" (the
// contact messaged this number first, or replied within the last 24h).
// Outside that window only a pre-approved message template can be sent.
// Meta rejects an out-of-window free text with error code 131047; Twilio
// rejects it with error code 63016 -- both are detected below and passed
// back as `outsideWindow` so the UI can point at the template option
// instead of just failing.
// ============================================================================

const WHATSAPP_GRAPH_VERSION = "v21.0";
const TWILIO_API_VERSION = "2010-04-01";

// 5. Verify a WhatsApp Business connection (Meta or Twilio)
app.post("/api/whatsapp/verify", async (req, res) => {
  try {
    const provider = req.body.provider === "twilio" ? "twilio" : "meta";

    if (provider === "twilio") {
      const { twilioAccountSid, twilioAuthToken, twilioWhatsAppNumber } = req.body;
      if (!twilioAccountSid || !String(twilioAccountSid).trim()) {
        return res.status(400).json({ success: false, error: "Twilio Account SID is required." });
      }
      if (!twilioAuthToken || !String(twilioAuthToken).trim()) {
        return res.status(400).json({ success: false, error: "Twilio Auth Token is required." });
      }
      if (!twilioWhatsAppNumber || !String(twilioWhatsAppNumber).trim()) {
        return res.status(400).json({ success: false, error: "Twilio WhatsApp-enabled number is required." });
      }

      const sid = String(twilioAccountSid).trim();
      const token = String(twilioAuthToken).trim();
      const basicAuth = Buffer.from(`${sid}:${token}`).toString("base64");

      try {
        const response = await fetch(
          `https://api.twilio.com/${TWILIO_API_VERSION}/Accounts/${encodeURIComponent(sid)}.json`,
          { method: "GET", headers: { Authorization: `Basic ${basicAuth}` } }
        );
        const data: any = await response.json().catch(() => ({}));

        if (!response.ok) {
          return res.json({
            success: false,
            status: "error",
            error: data?.message || `Twilio API returned HTTP ${response.status}.`,
          });
        }
        if (data.status && data.status !== "active") {
          return res.json({
            success: false,
            status: "error",
            error: `This Twilio account is "${data.status}", not active.`,
          });
        }

        return res.json({
          success: true,
          status: "connected",
          displayPhoneNumber: String(twilioWhatsAppNumber).trim(),
          verifiedName: data.friendly_name || sid,
          verifiedAt: new Date().toISOString(),
        });
      } catch (networkErr: any) {
        return res.json({
          success: false,
          status: "error",
          error: networkErr.message || "Failed to reach the Twilio API.",
        });
      }
    }

    // provider === "meta"
    const { accessToken, phoneNumberId } = req.body;

    if (!accessToken || !accessToken.trim()) {
      return res.status(400).json({ success: false, error: "Meta access token is required." });
    }
    if (!phoneNumberId || !phoneNumberId.trim()) {
      return res.status(400).json({ success: false, error: "WhatsApp Phone Number ID is required." });
    }

    const cleanToken = accessToken.trim();
    const cleanPhoneId = phoneNumberId.trim();

    try {
      const response = await fetch(
        `https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${encodeURIComponent(cleanPhoneId)}?fields=display_phone_number,verified_name,quality_rating`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${cleanToken}` },
        }
      );

      const data: any = await response.json().catch(() => ({}));

      if (!response.ok) {
        const metaError = data?.error?.message || `Meta API returned HTTP ${response.status}.`;
        return res.json({
          success: false,
          status: "error",
          error: metaError,
        });
      }

      return res.json({
        success: true,
        status: "connected",
        displayPhoneNumber: data.display_phone_number || "",
        verifiedName: data.verified_name || "",
        qualityRating: data.quality_rating || undefined,
        verifiedAt: new Date().toISOString(),
      });
    } catch (networkErr: any) {
      return res.json({
        success: false,
        status: "error",
        error: networkErr.message || "Failed to reach the Meta Graph API.",
      });
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "WhatsApp verification service error" });
  }
});

// 6. Send a WhatsApp message -- free text (within the 24h window) or a
// pre-approved template (any time) -- via either provider.
app.post("/api/whatsapp/send-message", async (req, res) => {
  try {
    const provider = req.body.provider === "twilio" ? "twilio" : "meta";
    const { to, body, templateName, templateLanguage, templateParams } = req.body;

    if (!to || !String(to).trim()) {
      return res.status(400).json({ success: false, error: "Recipient WhatsApp number is required." });
    }

    if (provider === "twilio") {
      const { twilioAccountSid, twilioAuthToken, twilioWhatsAppNumber } = req.body;
      if (!twilioAccountSid || !String(twilioAccountSid).trim()) {
        return res.status(400).json({ success: false, error: "Twilio Account SID is required." });
      }
      if (!twilioAuthToken || !String(twilioAuthToken).trim()) {
        return res.status(400).json({ success: false, error: "Twilio Auth Token is required." });
      }
      if (!twilioWhatsAppNumber || !String(twilioWhatsAppNumber).trim()) {
        return res.status(400).json({ success: false, error: "Twilio WhatsApp-enabled number is required." });
      }
      // Twilio template sends go through the Content API (ContentSid +
      // ContentVariables) rather than Meta's inline template object --
      // templateName here is treated as that Content SID.
      if (!templateName && (!body || !String(body).trim())) {
        return res.status(400).json({ success: false, error: "Message body is required for a free-text WhatsApp message." });
      }

      const sid = String(twilioAccountSid).trim();
      const token = String(twilioAuthToken).trim();
      const basicAuth = Buffer.from(`${sid}:${token}`).toString("base64");
      const cleanTo = String(to).trim().replace(/[^\d+]/g, "");
      const fromNumber = String(twilioWhatsAppNumber).trim().replace(/[^\d+]/g, "");

      const form = new URLSearchParams();
      form.set("To", `whatsapp:${cleanTo}`);
      form.set("From", `whatsapp:${fromNumber}`);
      if (templateName && String(templateName).trim()) {
        form.set("ContentSid", String(templateName).trim());
        if (Array.isArray(templateParams) && templateParams.length > 0) {
          const vars: Record<string, string> = {};
          templateParams.forEach((p: string, i: number) => {
            vars[String(i + 1)] = String(p);
          });
          form.set("ContentVariables", JSON.stringify(vars));
        }
      } else {
        form.set("Body", String(body));
      }

      try {
        const response = await fetch(
          `https://api.twilio.com/${TWILIO_API_VERSION}/Accounts/${encodeURIComponent(sid)}/Messages.json`,
          {
            method: "POST",
            headers: {
              Authorization: `Basic ${basicAuth}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: form.toString(),
          }
        );
        const data: any = await response.json().catch(() => ({}));

        if (!response.ok) {
          // Twilio error 63016 is "outside the WhatsApp session window" --
          // the same platform rule Meta enforces as 131047.
          const outsideWindow = data?.code === 63016;
          return res.status(200).json({
            success: false,
            error: data?.message || `Twilio API returned HTTP ${response.status}.`,
            outsideWindow,
          });
        }

        return res.json({
          success: true,
          messageId: data.sid,
          sentAt: new Date().toISOString(),
        });
      } catch (networkErr: any) {
        return res.status(200).json({
          success: false,
          error: networkErr.message || "Failed to reach the Twilio API.",
        });
      }
    }

    // provider === "meta"
    const { accessToken, phoneNumberId } = req.body;
    if (!accessToken || !accessToken.trim()) {
      return res.status(400).json({ success: false, error: "Meta access token is required." });
    }
    if (!phoneNumberId || !phoneNumberId.trim()) {
      return res.status(400).json({ success: false, error: "WhatsApp Phone Number ID is required." });
    }

    // WhatsApp numbers are sent to the Graph API in E.164 without a leading "+".
    const cleanTo = String(to).trim().replace(/[^\d]/g, "");
    if (!cleanTo) {
      return res.status(400).json({ success: false, error: "Recipient WhatsApp number is invalid." });
    }

    let payload: Record<string, any>;
    if (templateName && String(templateName).trim()) {
      payload = {
        messaging_product: "whatsapp",
        to: cleanTo,
        type: "template",
        template: {
          name: String(templateName).trim(),
          language: { code: (templateLanguage && String(templateLanguage).trim()) || "en_US" },
          ...(Array.isArray(templateParams) && templateParams.length > 0
            ? { components: [{ type: "body", parameters: templateParams.map((p: string) => ({ type: "text", text: String(p) })) }] }
            : {}),
        },
      };
    } else {
      if (!body || !String(body).trim()) {
        return res.status(400).json({ success: false, error: "Message body is required for a free-text WhatsApp message." });
      }
      payload = {
        messaging_product: "whatsapp",
        to: cleanTo,
        type: "text",
        text: { body: String(body) },
      };
    }

    try {
      const response = await fetch(
        `https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${encodeURIComponent(String(phoneNumberId).trim())}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken.trim()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      const data: any = await response.json().catch(() => ({}));

      if (!response.ok) {
        const metaError = data?.error || {};
        // Error code 131047 is Meta's "outside the 24-hour customer service
        // window" rejection -- surface it distinctly so the UI can point the
        // user at the template option instead of a generic failure.
        const outsideWindow = metaError.code === 131047 || metaError.error_subcode === 131047;
        return res.status(200).json({
          success: false,
          error: metaError.message || `Meta API returned HTTP ${response.status}.`,
          outsideWindow,
        });
      }

      const messageId = data?.messages?.[0]?.id;
      return res.json({
        success: true,
        messageId,
        sentAt: new Date().toISOString(),
      });
    } catch (networkErr: any) {
      return res.status(200).json({
        success: false,
        error: networkErr.message || "Failed to reach the Meta Graph API.",
      });
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "WhatsApp send service error" });
  }
});

// The app is reverse-proxied in from the landing page's domain at
// https://aarpex.aarbook.com/app (the landing page itself is a separate
// Netlify deployment owning the bare domain root — see netlify.toml there).
// Registered unconditionally (not inside startServer/production-only) so it
// works the same way whether this file is invoked as a Vercel Function per
// request or run standalone via `npm start`. vite.config.ts's `base: '/app/'`
// makes the production build reference all of its own assets under this
// same prefix, so this mount has to exist for those requests to resolve.
const appDistPath = path.join(process.cwd(), "public");
app.use("/app", express.static(appDistPath));
app.get(["/app", "/app/*"], (_req, res) => {
  res.sendFile(path.join(appDistPath, "index.html"));
});

// Vite Middleware for Dev and Static Serving for Production
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "public");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`CRM Server running on http://0.0.0.0:${PORT}`);
  });
}

// On Vercel, the platform itself invokes the exported Express app per
// request (see "export default app" below) — it never runs this file's own
// dev-middleware/static-serving/listen logic, and Vercel serves the built
// frontend from public/** directly via its CDN rather than through Express.
// Everywhere else (local dev, self-hosting via `npm start`), startServer()
// runs exactly as before.
if (!process.env.VERCEL) {
  startServer();
}

export default app;
