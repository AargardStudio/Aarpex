import React, { useState } from "react";
import { Loader2, Search, Plus, X, ExternalLink, CheckCircle2, AlertTriangle, HelpCircle } from "lucide-react";
import { useCRM } from "../../context/CRMContext";
import type { Lead } from "../../types";
import { parseAbicSnapshot, PRIORITY_LABEL, type AbicEvidenceTag } from "../../lib/abic";

// ABIC Business Audit -- reads the lead's own website and applies the
// Aargard Business Intelligence Construct. The audit can be customised: the
// lead's Industry Agent carries saved questions + a focus, and a one-off
// question or focus can be added for a single run ("Do they sell honey?").
const TAG_STYLE: Record<string, string> = {
  VERIFIED: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  STRONG_INFERENCE: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  HYPOTHESIS: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  UNKNOWN: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};
const TAG_LABEL: Record<string, string> = { VERIFIED: "Verified", STRONG_INFERENCE: "Strong inference", HYPOTHESIS: "Hypothesis", UNKNOWN: "Unknown" };

const Tag: React.FC<{ tag?: AbicEvidenceTag | string }> = ({ tag }) =>
  tag ? (
    <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded border ${TAG_STYLE[tag] || TAG_STYLE.UNKNOWN}`}>{TAG_LABEL[tag] || tag}</span>
  ) : null;

export const AbicAuditPanel: React.FC<{ lead: Lead }> = ({ lead }) => {
  const { runAbicAudit, getAgentForIndustry } = useCRM() as any;
  const agent = getAgentForIndustry?.(lead.industry);
  const savedChecks: string[] = agent?.auditChecks || [];
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [oneOffChecks, setOneOffChecks] = useState<string[]>([]);
  const [newCheck, setNewCheck] = useState("");
  const [oneOffFocus, setOneOffFocus] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  const snap = parseAbicSnapshot(lead.abicSnapshot);
  const ok = snap?.status === "ok";
  const hasWebsite = !!lead.website?.trim();

  const addCheck = () => {
    const v = newCheck.trim();
    if (!v || oneOffChecks.length >= 8) return;
    setOneOffChecks((p) => [...p, v]);
    setNewCheck("");
  };

  const handleRun = async () => {
    setRunning(true);
    setMessage(null);
    try {
      const r = await runAbicAudit(lead.id, { extraChecks: oneOffChecks, focus: oneOffFocus.trim() || undefined });
      if (r.status !== "ok") setMessage(r.message || "The audit couldn't be completed.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="p-5 bg-[#181b21] text-white rounded-2xl border border-[#2d323f] shadow-xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 font-bold text-sm text-teal-300">
            <Search className="w-4 h-4 text-teal-400" /> ABIC Business Audit
          </div>
          <p className="text-xs text-slate-300 max-w-lg">
            Reads {hasWebsite ? lead.website : "the lead's website"} and scores the business from Aargard's point of view. Anything it can't see is marked Unknown, never guessed.
          </p>
        </div>
        <button
          onClick={handleRun}
          disabled={running || !hasWebsite}
          title={!hasWebsite ? "Add a website to this lead first" : undefined}
          className="px-4 py-2 bg-[#252a36] hover:bg-[#2f3544] disabled:opacity-40 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 border border-[#3d4455] shrink-0"
        >
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-400" /> : <Search className="w-3.5 h-3.5 text-teal-400" />}
          {running ? "Auditing…" : snap ? "Re-run audit" : "Run audit"}
        </button>
      </div>

      {/* Customisation */}
      <div className="space-y-2">
        <button type="button" onClick={() => setShowCustom((v) => !v)} className="text-[11px] font-semibold text-teal-300 hover:text-teal-200">
          {showCustom ? "Hide" : "Customize this audit"}
          {savedChecks.length + oneOffChecks.length > 0 && ` · ${savedChecks.length + oneOffChecks.length} custom question${savedChecks.length + oneOffChecks.length === 1 ? "" : "s"}`}
        </button>
        {showCustom && (
          <div className="p-3 bg-white/5 border border-white/10 rounded-xl space-y-2.5">
            <p className="text-[10.5px] text-slate-400 leading-relaxed">
              Ask your own yes/no questions about this business, e.g. “Do they sell honey?” or “Do they ship internationally?”. They're answered strictly from the website.
              {agent ? ` Questions saved on the ${agent.industry} agent run on every audit; add more for this run below.` : " Create an Industry Agent for this industry to save questions that run on every audit."}
            </p>
            {savedChecks.map((c) => (
              <div key={c} className="text-[11px] text-slate-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3 text-teal-400 shrink-0" /> {c}
                <span className="text-slate-500">(saved on agent)</span>
              </div>
            ))}
            {oneOffChecks.map((c, i) => (
              <div key={i} className="text-[11px] text-slate-200 flex items-center gap-1.5">
                <Plus className="w-3 h-3 text-teal-400 shrink-0" /> <span className="flex-1">{c}</span>
                <button type="button" onClick={() => setOneOffChecks((p) => p.filter((_, j) => j !== i))} className="text-slate-500 hover:text-rose-400">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <input
                value={newCheck}
                onChange={(e) => setNewCheck(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCheck())}
                placeholder="Add a question, e.g. Do they sell honey?"
                className="flex-1 px-3 py-1.5 bg-[#12151a] border border-[#2d323f] rounded-lg text-[11px] text-white focus:outline-none focus:border-teal-400"
              />
              <button type="button" onClick={addCheck} className="px-3 py-1.5 bg-[#252a36] border border-[#3d4455] rounded-lg text-[11px] font-bold hover:bg-[#2f3544]">
                Add
              </button>
            </div>
            <input
              value={oneOffFocus}
              onChange={(e) => setOneOffFocus(e.target.value)}
              placeholder="Optional focus for this run, e.g. We sell packaging to honey producers"
              className="w-full px-3 py-1.5 bg-[#12151a] border border-[#2d323f] rounded-lg text-[11px] text-white focus:outline-none focus:border-teal-400"
            />
          </div>
        )}
      </div>

      {message && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-[11px] text-amber-200 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {message}
        </div>
      )}
      {!message && snap && !ok && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-[11px] text-amber-200 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {snap.message || "The last audit couldn't establish what this business does."}
        </div>
      )}

      {ok && snap && (
        <div className="space-y-3.5">
          <div className="grid grid-cols-3 gap-2.5">
            <div className="p-3 bg-white/5 border border-white/10 rounded-xl text-center">
              <div className="text-xl font-black text-teal-300">{snap.overallScore ?? "—"}</div>
              <div className="text-[9.5px] text-slate-400 font-semibold">ABIC score</div>
            </div>
            <div className="p-3 bg-white/5 border border-white/10 rounded-xl text-center">
              <div className="text-xl font-black text-indigo-300">{snap.aargardOpportunityScore ?? "—"}</div>
              <div className="text-[9.5px] text-slate-400 font-semibold">Aargard opportunity</div>
            </div>
            <div className="p-3 bg-white/5 border border-white/10 rounded-xl text-center" title={snap.leadPriority ? PRIORITY_LABEL[snap.leadPriority] : undefined}>
              <div className="text-xl font-black text-amber-300">{snap.leadPriority ? `Priority ${snap.leadPriority}` : "—"}</div>
              <div className="text-[9.5px] text-slate-400 font-semibold">{snap.leadPriority ? PRIORITY_LABEL[snap.leadPriority] : "Lead priority"}</div>
            </div>
          </div>

          {snap.verification?.summary && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-200">
                Business model check <Tag tag={snap.verification.confidence} />
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">{snap.verification.summary}</p>
              {snap.strategy?.primary && (
                <p className="text-[10.5px] text-slate-400">
                  Strategy: <span className="text-slate-200">{snap.strategy.primary}</span>
                  {snap.strategy.evidence ? ` — ${snap.strategy.evidence}` : ""}
                </p>
              )}
              {(snap.cluster || []).length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {snap.cluster!.map((c) => (
                    <span key={c} className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/10 border border-teal-500/30 text-teal-300">
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {(snap.customChecks || []).length > 0 && (
            <div className="p-3 bg-white/5 border border-white/10 rounded-xl space-y-1.5">
              <div className="text-[11px] font-bold text-slate-200">Your custom checks</div>
              {snap.customChecks!.map((c, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px]">
                  <span
                    className={`shrink-0 mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-bold text-[9.5px] ${
                      c.answer === "YES" ? "bg-emerald-500/20 text-emerald-300" : c.answer === "NO" ? "bg-rose-500/20 text-rose-300" : "bg-slate-500/20 text-slate-300"
                    }`}
                  >
                    {c.answer === "UNCLEAR" ? <HelpCircle className="w-2.5 h-2.5" /> : null}
                    {c.answer === "UNCLEAR" ? "UNCLEAR" : c.answer}
                  </span>
                  <div className="text-slate-300">
                    <span className="text-slate-100">{c.question}</span>
                    {c.evidence && <span className="text-slate-400"> — {c.evidence}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 bg-white/5 border border-white/10 rounded-xl space-y-1.5">
              <div className="text-emerald-300 font-bold text-[11px]">Strengths</div>
              {(snap.strengths || []).map((s, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[10.5px] text-slate-300">
                  <span className="flex-1">{s.text}</span> <Tag tag={s.evidence} />
                </div>
              ))}
            </div>
            <div className="p-3 bg-white/5 border border-white/10 rounded-xl space-y-1.5">
              <div className="text-amber-300 font-bold text-[11px]">Gaps</div>
              {(snap.gaps || []).map((s, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[10.5px] text-slate-300">
                  <span className="flex-1">{s.text}</span> <Tag tag={s.evidence} />
                </div>
              ))}
            </div>
          </div>

          <div className="p-3 bg-white/5 border border-white/10 rounded-xl space-y-1.5 text-[11px]">
            <div className="font-bold text-slate-200">How to sell to them</div>
            {snap.primarySalesAngle && <p className="text-slate-300"><span className="text-teal-300 font-semibold">Primary angle:</span> {snap.primarySalesAngle}</p>}
            {snap.secondarySalesAngle && <p className="text-slate-300"><span className="text-slate-400 font-semibold">Secondary:</span> {snap.secondarySalesAngle}</p>}
            {snap.bestEntryService && <p className="text-slate-300"><span className="text-slate-400 font-semibold">Best entry service:</span> {snap.bestEntryService}</p>}
            {snap.expansionService && <p className="text-slate-300"><span className="text-slate-400 font-semibold">Expansion:</span> {snap.expansionService}</p>}
            {snap.longTermPlatform && <p className="text-slate-300"><span className="text-slate-400 font-semibold">Long-term platform:</span> {snap.longTermPlatform}</p>}
          </div>

          {(snap.opportunities || []).length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold text-slate-200">Top Aargard opportunities</div>
              {snap.opportunities!.map((o, i) => (
                <div key={i} className="p-2.5 bg-white/5 border border-white/10 rounded-lg text-[10.5px] text-slate-300 space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-100">{o.service}</span>
                    <span className="text-[9.5px] text-slate-400">{o.priority} priority · {o.complexity} complexity</span>
                  </div>
                  <div>{o.problem}</div>
                  <div className="text-slate-400">{o.impact}</div>
                </div>
              ))}
            </div>
          )}

          {(snap.scores || []).length > 0 && (
            <details className="text-[11px]">
              <summary className="cursor-pointer text-slate-300 font-semibold">Score breakdown ({snap.scores!.length} categories)</summary>
              <div className="mt-2 space-y-1.5">
                {snap.scores!.map((s) => (
                  <div key={s.category} className="flex items-start gap-2 text-[10.5px]">
                    <span className="w-8 text-right font-bold text-teal-300">{s.score}</span>
                    <div className="flex-1 text-slate-300">
                      <span className="text-slate-100 font-semibold">{s.category}</span> — {s.justification}
                    </div>
                    <Tag tag={s.evidence} />
                  </div>
                ))}
              </div>
            </details>
          )}

          {(snap.unknowns || []).length > 0 && (
            <p className="text-[10.5px] text-slate-400">
              <span className="font-semibold text-slate-300">Could not assess from the website:</span> {snap.unknowns!.join("; ")}
            </p>
          )}
          <div className="text-[10px] text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>Researched {snap.researchDate}</span>
            {(snap.sources || []).slice(0, 4).map((u) => (
              <a key={u} href={u} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-teal-400 hover:text-teal-300">
                {u.replace(/^https?:\/\/(www\.)?/, "").slice(0, 38)} <ExternalLink className="w-2.5 h-2.5" />
              </a>
            ))}
          </div>
          <p className="text-[10px] text-slate-500">Scores are structured strategic judgements from public website evidence, not precise measurements. Saved to this lead's Knowledge as “ABIC Audit”.</p>
        </div>
      )}
    </div>
  );
};
