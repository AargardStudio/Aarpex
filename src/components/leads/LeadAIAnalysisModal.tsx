import React, { useEffect, useState } from "react";
import {
  X,
  Sparkles,
  Flame,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Mail,
  Phone,
  MessageSquare,
  Linkedin,
  Users,
  Loader2,
} from "lucide-react";
import { Lead } from "../../types";
import { useCRM } from "../../context/CRMContext";
import { apiFetch } from "../../lib/apiClient";

interface LeadAnalysisResult {
  qualificationScore: number;
  temperature: "Hot" | "Warm" | "Cold";
  buyerIntentSignals: string[];
  riskFactors: string[];
  bestOutreachChannel: string;
  bestOutreachTiming: string;
  recommendedNextAction: string;
  recommendedFollowUpDate: string;
  suggestedOpeningLine: string;
  summary: string;
  source?: string;
}

const channelIcons: Record<string, React.ReactNode> = {
  Email: <Mail className="w-3.5 h-3.5" />,
  Phone: <Phone className="w-3.5 h-3.5" />,
  WhatsApp: <MessageSquare className="w-3.5 h-3.5" />,
  LinkedIn: <Linkedin className="w-3.5 h-3.5" />,
  "In-Person": <Users className="w-3.5 h-3.5" />,
};

const temperatureStyles: Record<string, string> = {
  Hot: "bg-rose-50 text-rose-700 border-rose-300",
  Warm: "bg-amber-50 text-amber-700 border-amber-300",
  Cold: "bg-slate-100 text-slate-600 border-slate-300",
};

export const LeadAIAnalysisModal: React.FC<{ lead: Lead; onClose: () => void }> = ({ lead, onClose }) => {
  const { activities, updateLead } = useCRM();
  const [isLoading, setIsLoading] = useState(true);
  const [result, setResult] = useState<LeadAnalysisResult | null>(null);
  const [error, setError] = useState(false);

  const leadActivities = (activities || []).filter(
    (a: any) => a.description?.toLowerCase().includes(lead.name.toLowerCase()) || a.companyId === lead.convertedCompanyId
  );

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setIsLoading(true);
      setError(false);
      try {
        const res = await apiFetch("/api/ai/lead-analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lead, activities: leadActivities }),
        });
        const data = await res.json();
        if (!cancelled) setResult(data);
      } catch (err) {
        console.error(err);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id]);

  const handleApplyScore = () => {
    if (!result) return;
    updateLead(lead.id, {
      leadScore: result.qualificationScore,
      priority:
        result.temperature === "Hot" ? "Urgent" : result.temperature === "Warm" ? "Medium" : "Low",
      nextFollowUp: result.recommendedFollowUpDate,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden text-xs text-slate-700 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-indigo-600 to-cyan-600 text-white">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-white/15 border border-white/30 flex items-center justify-center">
              <Sparkles className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="text-sm font-bold">Aargard Business Intelligence Construct</h2>
              <p className="text-[11px] text-white/80">AI-powered lead qualification for {lead.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          {isLoading && (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
              <p className="text-[11px] font-medium">Running Aargard Business Intelligence Construct analysis…</p>
            </div>
          )}

          {!isLoading && error && (
            <div className="py-10 text-center text-rose-500 text-[11px]">
              Analysis failed to run. Please try again in a moment.
            </div>
          )}

          {!isLoading && !error && result && (
            <>
              {/* Score + Temperature */}
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-2xl bg-indigo-50 border border-indigo-200 flex flex-col items-center justify-center">
                  <span className="text-2xl font-black text-indigo-700">{result.qualificationScore}</span>
                  <span className="text-[9px] text-indigo-400 font-semibold">/ 100</span>
                </div>
                <div className="flex-1 space-y-1.5">
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      temperatureStyles[result.temperature] || temperatureStyles.Warm
                    }`}
                  >
                    <Flame className="w-2.5 h-2.5" />
                    {result.temperature} Lead
                  </span>
                  <p className="text-[11px] text-slate-600 leading-snug">{result.summary}</p>
                </div>
              </div>

              {/* Signals + Risks */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-1.5">
                  <div className="flex items-center gap-1.5 text-emerald-700 font-bold text-[11px]">
                    <TrendingUp className="w-3.5 h-3.5" /> Buyer Intent Signals
                  </div>
                  <ul className="space-y-1">
                    {(result.buyerIntentSignals || []).map((s, i) => (
                      <li key={i} className="flex items-start gap-1 text-[10.5px] text-emerald-800">
                        <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" />
                        <span>{s}</span>
                      </li>
                    ))}
                    {(result.buyerIntentSignals || []).length === 0 && (
                      <li className="text-[10.5px] text-emerald-800/60">None identified yet</li>
                    )}
                  </ul>
                </div>
                <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-xl space-y-1.5">
                  <div className="flex items-center gap-1.5 text-amber-700 font-bold text-[11px]">
                    <AlertTriangle className="w-3.5 h-3.5" /> Risk Factors
                  </div>
                  <ul className="space-y-1">
                    {(result.riskFactors || []).map((s, i) => (
                      <li key={i} className="flex items-start gap-1 text-[10.5px] text-amber-800">
                        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                        <span>{s}</span>
                      </li>
                    ))}
                    {(result.riskFactors || []).length === 0 && (
                      <li className="text-[10.5px] text-amber-800/60">None identified</li>
                    )}
                  </ul>
                </div>
              </div>

              {/* Outreach recommendation */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5 font-bold text-slate-700">
                    {channelIcons[result.bestOutreachChannel] || <Mail className="w-3.5 h-3.5" />}
                    <span>Best Channel: {result.bestOutreachChannel}</span>
                  </div>
                  <div className="flex items-center gap-1 text-slate-500">
                    <Clock className="w-3 h-3" />
                    <span>{result.bestOutreachTiming}</span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-700">
                  <span className="font-bold">Next Action: </span>
                  {result.recommendedNextAction}
                </p>
                <p className="text-[10px] text-slate-400">
                  Recommended follow-up date: {result.recommendedFollowUpDate}
                </p>
              </div>

              {/* Suggested opener */}
              <div className="p-3 bg-indigo-50/60 border border-indigo-200 rounded-xl space-y-1">
                <div className="text-[11px] font-bold text-indigo-700">Suggested Opening Line</div>
                <p className="text-[11px] text-indigo-900 italic leading-snug">
                  "{result.suggestedOpeningLine}"
                </p>
              </div>

              {result.source && (
                <p className="text-[9px] text-slate-300 text-right">
                  {result.source === "gemini" ? "Generated live by Gemini" : "Generated via heuristic fallback"}
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 flex items-center justify-end gap-2 bg-slate-50/70">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 font-semibold rounded-lg text-xs transition-colors"
          >
            Close
          </button>
          {!isLoading && !error && result && (
            <button
              onClick={handleApplyScore}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Apply Score & Follow-Up</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
