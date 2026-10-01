import type { KnowledgeBaseEntry, Lead } from "../types";
import { apiFetch } from "./apiClient";

// ABIC -- Aargard Business Intelligence Construct (Snapshot edition).
// Types + helpers for the structured audit stored on Lead.abicSnapshot (JSON
// text). The audit itself is produced server-side by POST /api/ai/abic-audit.

export type AbicEvidenceTag = "VERIFIED" | "STRONG_INFERENCE" | "HYPOTHESIS" | "UNKNOWN";

export interface AbicSnapshot {
  status: "ok" | "insufficient_data" | "ai_unavailable";
  message?: string;
  researchDate?: string;
  sources?: string[];
  pagesRead?: number;
  verification?: { summary?: string; businessModel?: string; industry?: string; confidence?: AbicEvidenceTag };
  strategy?: { primary?: string; evidence?: string };
  scores?: Array<{ category: string; score: number; justification: string; evidence: AbicEvidenceTag }>;
  overallScore?: number | null;
  cluster?: string[];
  strengths?: Array<{ text: string; evidence: AbicEvidenceTag }>;
  gaps?: Array<{ text: string; evidence: AbicEvidenceTag }>;
  opportunities?: Array<{ service: string; problem: string; solution: string; impact: string; complexity: string; priority: string }>;
  aargardOpportunityScore?: number | null;
  leadPriority?: "A" | "B" | "C" | "D" | null;
  primarySalesAngle?: string;
  secondarySalesAngle?: string;
  bestEntryService?: string;
  expansionService?: string;
  longTermPlatform?: string;
  unknowns?: string[];
  focus?: string;
  customChecks?: Array<{ question: string; answer: "YES" | "NO" | "UNCLEAR"; evidence: string; confidence: AbicEvidenceTag }>;
}

export function parseAbicSnapshot(raw: string | undefined | null): AbicSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as AbicSnapshot) : null;
  } catch {
    return null;
  }
}

// A lead is due an audit when it has a website and has never been audited, or
// the last audit is over 30 days old.
export function abicAuditDue(lead: { website?: string; abicAuditedAt?: string }, now = Date.now()): boolean {
  if (!lead.website || !lead.website.trim()) return false;
  if (!lead.abicAuditedAt) return true;
  const at = new Date(lead.abicAuditedAt).getTime();
  return !at || now - at > 30 * 86400000;
}

export const PRIORITY_LABEL: Record<string, string> = {
  A: "Major transformation opportunity",
  B: "Strong opportunity",
  C: "Targeted / specialised opportunity",
  D: "Limited immediate opportunity",
};

export interface AbicAuditResult {
  status: "ok" | "insufficient_data" | "ai_unavailable";
  snapshot?: AbicSnapshot;
  knowledgeText?: string;
  message?: string;
  researchDate: string;
}

// Calls the server-side audit for one lead. Never throws.
export async function callAbicAudit(lead: Lead, options?: { checks?: string[]; focus?: string }): Promise<AbicAuditResult> {
  try {
    const res = await apiFetch("/api/ai/abic-audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: lead.name,
        company: lead.company,
        jobTitle: lead.jobTitle,
        website: lead.website,
        industry: lead.industry,
        country: lead.country,
        city: lead.city,
        socialLinks: lead.socialLinks,
        notes: lead.notes,
        customChecks: options?.checks,
        focus: options?.focus,
      }),
    });
    const data = await res.json();
    return { status: data.status || "ai_unavailable", snapshot: data.snapshot, knowledgeText: data.knowledgeText, message: data.message, researchDate: data.researchDate || new Date().toISOString().split("T")[0] };
  } catch (err: any) {
    return { status: "ai_unavailable", message: err?.message || "Couldn't reach the server.", researchDate: new Date().toISOString().split("T")[0] };
  }
}

// What to write onto the lead. A failed/insufficient audit still stamps
// abicAuditedAt (so an unreachable site isn't retried on every scan) and
// keeps the reason in the snapshot; scores/priority are only set on success.
export function abicLeadPatch(result: AbicAuditResult): Partial<Lead> {
  const stamp = new Date().toISOString();
  if (result.status === "ok" && result.snapshot) {
    return {
      abicAuditedAt: stamp,
      abicScore: result.snapshot.overallScore ?? undefined,
      abicOpportunityScore: result.snapshot.aargardOpportunityScore ?? undefined,
      abicPriority: result.snapshot.leadPriority ?? undefined,
      abicSnapshot: JSON.stringify(result.snapshot),
    };
  }
  return {
    abicAuditedAt: stamp,
    abicSnapshot: JSON.stringify({ status: result.status, message: result.message, researchDate: result.researchDate }),
  };
}

// Replace (or create) the lead's single "ABIC Audit" knowledge entry. It is
// lead-scoped (linkedLeadIds), tagged so it is visible/editable/deletable in
// the Knowledge Base, and never industry-wide.
export function upsertAbicKnowledge(prev: KnowledgeBaseEntry[], lead: Lead, text: string): KnowledgeBaseEntry[] {
  const now = new Date().toISOString();
  const isAbic = (k: KnowledgeBaseEntry) => k.tags.includes("ABIC-Audit") && (k.linkedLeadIds || []).includes(lead.id);
  const existing = prev.find(isAbic);
  if (existing) return prev.map((k) => (k.id === existing.id ? { ...k, content: text, updatedAt: now } : k));
  return [
    {
      id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `kb_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      category: "company",
      title: `${lead.name} — ABIC Audit`,
      content: text,
      tags: ["AI-Generated", "ABIC-Audit"],
      linkedLeadIds: [lead.id],
      createdBy: "AI Agent",
      createdAt: now,
      updatedAt: now,
    },
    ...prev,
  ];
}
