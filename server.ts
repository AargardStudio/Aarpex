import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import Stripe from "stripe";
import nodemailer from "nodemailer";
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

// AI Daily Briefing
// AI Lead Analysis — "Aargard Business Intelligence Construct"
// Scores and qualifies a raw lead before it's ever converted into a company
// or deal: buying-intent signals, risk flags, best outreach channel/timing,
// and a ready-to-send opening line, generated from the lead's own fields
// plus whatever activity/notes history exists for it.
app.post("/api/ai/lead-analysis", async (req, res) => {
  try {
    const { lead, activities } = req.body;
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
// AarPex's own platform subscription — a flat $29/month charge for using the
// CRM itself, with a 7-day free trial on signup. This ALWAYS bills through
// Aargard's own master Stripe account (STRIPE_SECRET_KEY from the server
// environment) and never accepts a caller-supplied key: tenant/custom Stripe
// keys are only ever used for a tenant's own downstream customer billing
// (see /api/stripe/products/*).
const AARPEX_PLATFORM_MONTHLY_PRICE_USD = 29;
const AARPEX_PLATFORM_TRIAL_DAYS = 7;
// The real Stripe Product record ("AarPex CRM — Standard Plan") in Aargard's
// master Stripe account — checkout references this product id directly
// (via price_data.product) instead of creating a throwaway product_data
// object on every checkout session, so all subscriptions roll up under one
// product in Stripe's dashboard/reporting. Overridable via env for a
// different Stripe mode/account without a code change.
const AARPEX_PLATFORM_STRIPE_PRODUCT_ID =
  process.env.AARPEX_PLATFORM_STRIPE_PRODUCT_ID || "prod_VH0Cjb9lnxq6UN";

app.post("/api/subscriptions/checkout", async (req, res) => {
  try {
    const { plan, billingCycle, email, name, organizationName, cardNumber } = req.body;

    if (!email || !organizationName) {
      return res.status(400).json({
        error: "Email and organization name are required.",
      });
    }

    // Flat-rate platform pricing: every plan/billing cycle resolves to $29/mo,
    // starting with a 7-day free trial — nothing is charged today.
    const pricePerMonth = AARPEX_PLATFORM_MONTHLY_PRICE_USD;
    const totalCharge = 0;
    const resolvedPlan = plan || "Growth";

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
          // platform can actually charge $29/mo automatically the moment the
          // 7-day trial ends instead of relying on a manual follow-up.
          payment_method_collection: "always",
          line_items: [
            {
              price_data: {
                currency: "usd",
                product: AARPEX_PLATFORM_STRIPE_PRODUCT_ID,
                unit_amount: AARPEX_PLATFORM_MONTHLY_PRICE_USD * 100,
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
          message: `Redirecting to Stripe Checkout for the AarPex Standard plan ($${AARPEX_PLATFORM_MONTHLY_PRICE_USD}/mo after a ${AARPEX_PLATFORM_TRIAL_DAYS}-day free trial).`,
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
      message: `Card saved. Your ${AARPEX_PLATFORM_TRIAL_DAYS}-day free trial has started for ${organizationName} — first charge of $${AARPEX_PLATFORM_MONTHLY_PRICE_USD}/mo on ${trialEnds}. (Simulated — connect a platform Stripe key to charge real cards.)`,
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
