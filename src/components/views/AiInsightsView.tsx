import React, { useState, useEffect } from "react";
import { useCRM } from "../../context/CRMContext";
import {
  Sparkles,
  RefreshCw,
  Send,
  Building2,
  Briefcase,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Copy,
  ArrowRight,
} from "lucide-react";
import { apiFetch } from "../../lib/apiClient";

export const AiInsightsView: React.FC = () => {
  const { companies, deals, invoices, payments, setSelectedCompanyId } = useCRM();

  const [activeTab, setActiveTab] = useState<"briefing" | "account" | "pitch" | "query">("briefing");

  // Daily Briefing State
  const [briefingData, setBriefingData] = useState<any>(null);
  const [isBriefingLoading, setIsBriefingLoading] = useState(false);

  // Account Deep Dive State
  const [selectedCompId, setSelectedCompId] = useState<string>(companies[0]?.id || "");
  const [isAccountAnalyzing, setIsAccountAnalyzing] = useState(false);
  const [accountAnalysis, setAccountAnalysis] = useState<any>(null);

  // Pitch Generator State
  const [pitchCompanyId, setPitchCompanyId] = useState<string>(companies[0]?.id || "");
  const [pitchDealId, setPitchDealId] = useState<string>(deals[0]?.id || "");
  const [isPitchLoading, setIsPitchLoading] = useState(false);
  const [generatedPitch, setGeneratedPitch] = useState<string | null>(null);

  // Natural Language Query State
  const [nlQuery, setNlQuery] = useState("");
  const [isQueryLoading, setIsQueryLoading] = useState(false);
  const [queryResponse, setQueryResponse] = useState<string | null>(null);

  useEffect(() => {
    fetchBriefing();
  }, []);

  const fetchBriefing = async () => {
    setIsBriefingLoading(true);
    try {
      const openDeals = deals.filter((d) => d.status === "Open");
      const wonDeals = deals.filter((d) => d.status === "Won");
      const pipelineValue = openDeals.reduce((sum, d) => sum + d.dealValue, 0);
      const wonRevenue = wonDeals.reduce((sum, d) => sum + d.dealValue, 0);
      const totalInvoiced = invoices.reduce((sum, i) => sum + (i.total || 0), 0);
      const totalCollected = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const outstandingBalance = invoices.reduce((sum, i) => sum + (i.remainingBalance || 0), 0);
      const overdueBalance = invoices
        .filter((i) => i.remainingBalance > 0 && new Date(i.dueDate) < new Date())
        .reduce((sum, i) => sum + i.remainingBalance, 0);

      const res = await apiFetch("/api/ai/daily-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metrics: {
            pipelineValue,
            wonRevenue,
            totalInvoiced,
            totalCollected,
            outstandingBalance,
            overdueBalance,
          },
          deals: deals.slice(0, 5),
          overdueInvoices: invoices.filter((i) => i.remainingBalance > 0).slice(0, 5),
        }),
      });
      const data = await res.json();
      setBriefingData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsBriefingLoading(false);
    }
  };

  const handleRunAccountAnalysis = async () => {
    const comp = companies.find((c) => c.id === selectedCompId);
    if (!comp) return;

    setIsAccountAnalyzing(true);
    setAccountAnalysis(null);
    try {
      const compDeals = deals.filter((d) => d.companyId === comp.id);
      const compInvoices = invoices.filter((i) => i.companyId === comp.id);
      const res = await apiFetch("/api/ai/customer-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: comp, deals: compDeals, invoices: compInvoices }),
      });
      const data = await res.json();
      setAccountAnalysis(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsAccountAnalyzing(false);
    }
  };

  const handleGeneratePitch = async () => {
    const comp = companies.find((c) => c.id === pitchCompanyId);
    const deal = deals.find((d) => d.id === pitchDealId);
    if (!comp) return;

    setIsPitchLoading(true);
    setGeneratedPitch(null);
    try {
      const res = await apiFetch("/api/ai/pitch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: comp, deal }),
      });
      const data = await res.json();
      setGeneratedPitch(data.pitch || data.rawText || "Pitch generated.");
    } catch (err) {
      console.error(err);
    } finally {
      setIsPitchLoading(false);
    }
  };

  const handleRunNlQuery = async (queryToRun?: string) => {
    const q = queryToRun || nlQuery;
    if (!q) return;

    setIsQueryLoading(true);
    setQueryResponse(null);
    try {
      const res = await apiFetch("/api/ai/smart-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      setQueryResponse(data.answer);
    } catch (err) {
      console.error(err);
      setQueryResponse("Unable to run query against CRM database.");
    } finally {
      setIsQueryLoading(false);
    }
  };

  return (
    <div id="ai-insights-view" className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 p-6 rounded-2xl text-white border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs">
            <Sparkles className="w-4 h-4 animate-spin" />
            <span>AarPex AI Intelligence Engine</span>
          </div>
          <h2 className="text-xl font-black mt-1">
            CRM AI Sales & Revenue Intelligence
          </h2>
          <p className="text-xs text-slate-300 max-w-xl mt-0.5">
            Automated health scoring, executive risk briefings, predictive churn detection, and natural language analytics.
          </p>
        </div>

        {/* Tab navigation pills */}
        <div className="flex border border-slate-700 bg-slate-800/80 p-1 rounded-xl text-xs overflow-x-auto">
          {[
            { id: "briefing", label: "Executive Briefing" },
            { id: "account", label: "Account Deep Dive" },
            { id: "pitch", label: "Pitch Studio" },
            { id: "query", label: "Ask AI" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* BRIEFING TAB */}
      {activeTab === "briefing" && (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                Executive Sales & Revenue Briefing
              </h3>
              <p className="text-xs text-slate-500">
                AI synthesized overview of key opportunities and cash collection roadblocks
              </p>
            </div>
            <button
              onClick={fetchBriefing}
              disabled={isBriefingLoading}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isBriefingLoading ? "animate-spin" : ""}`} />
              <span>{isBriefingLoading ? "Synthesizing..." : "Refresh Briefing"}</span>
            </button>
          </div>

          {briefingData && (
            <div className="space-y-4">
              {/* Summary Card */}
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-indigo-600 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Key Takeaway
                </div>
                <div className="text-base font-extrabold text-slate-900 leading-snug">
                  {briefingData.headline}
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">
                  {briefingData.summary}
                </p>
              </div>

              {/* Priority Alerts & Recommended Actions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-rose-600 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    Operational Risks & Overdue Invoices
                  </div>
                  <div className="space-y-2">
                    {briefingData.priorityAlerts?.map((alert: string, idx: number) => (
                      <div
                        key={idx}
                        className="p-3 bg-rose-50/70 border border-rose-200/60 rounded-xl text-xs text-slate-800 flex items-start gap-2"
                      >
                        <span className="font-bold text-rose-700">•</span>
                        <span>{alert}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-emerald-600 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    High-Impact Recommendations
                  </div>
                  <div className="space-y-2">
                    {briefingData.recommendedActions?.map((act: string, idx: number) => (
                      <div
                        key={idx}
                        className="p-3 bg-emerald-50/70 border border-emerald-200/60 rounded-xl text-xs text-slate-800 flex items-start gap-2"
                      >
                        <span className="font-bold text-emerald-700">✓</span>
                        <span>{act}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ACCOUNT DEEP DIVE TAB */}
      {activeTab === "account" && (
        <div className="space-y-5">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-700">Select Customer Account:</span>
              <select
                value={selectedCompId}
                onChange={(e) => setSelectedCompId(e.target.value)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 bg-slate-50 focus:outline-none"
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.status})
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleRunAccountAnalysis}
              disabled={isAccountAnalyzing}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isAccountAnalyzing ? "Analyzing..." : "Run Account Deep Dive"}</span>
            </button>
          </div>

          {accountAnalysis && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200">
                  <span className="text-xs text-slate-500">Account Health Score</span>
                  <div className="text-3xl font-black font-mono text-indigo-600 mt-1">
                    {accountAnalysis.healthScore}
                    <span className="text-sm font-normal text-slate-400">/100</span>
                  </div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200">
                  <span className="text-xs text-slate-500">Churn Risk Trajectory</span>
                  <div
                    className={`text-xl font-black mt-1 ${
                      accountAnalysis.churnRisk === "High"
                        ? "text-rose-600"
                        : accountAnalysis.churnRisk === "Medium"
                        ? "text-amber-600"
                        : "text-emerald-600"
                    }`}
                  >
                    {accountAnalysis.churnRisk}
                  </div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200">
                  <span className="text-xs text-slate-500">Churn Factors</span>
                  <div className="text-xs text-slate-700 mt-1">
                    {accountAnalysis.churnReason || "Healthy engagement and prompt payments"}
                  </div>
                </div>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Strategic Account Summary
                </h4>
                <p className="text-xs text-slate-700 leading-relaxed">
                  {accountAnalysis.summary}
                </p>
              </div>

              {accountAnalysis.actionableRecommendations && (
                <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Recommended Steps
                  </h4>
                  {accountAnalysis.actionableRecommendations.map((item: string, idx: number) => (
                    <div key={idx} className="flex items-center gap-2 text-xs text-slate-700">
                      <ArrowRight className="w-3.5 h-3.5 text-indigo-600" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* PITCH STUDIO TAB */}
      {activeTab === "pitch" && (
        <div className="space-y-5">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Target Company:
                </label>
                <select
                  value={pitchCompanyId}
                  onChange={(e) => setPitchCompanyId(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-slate-50"
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.industry})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Associated Deal / Opportunity:
                </label>
                <select
                  value={pitchDealId}
                  onChange={(e) => setPitchDealId(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-slate-50"
                >
                  {deals
                    .filter((d) => !pitchCompanyId || d.companyId === pitchCompanyId)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} (${d.dealValue.toLocaleString()})
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <button
              onClick={handleGeneratePitch}
              disabled={isPitchLoading}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isPitchLoading ? "Drafting with AarPex AI..." : "Generate Tailored Outreach"}</span>
            </button>
          </div>

          {generatedPitch && (
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-xs font-bold text-indigo-700 uppercase tracking-wider">
                  Generated Sales Pitch & Proposal Draft
                </span>
                <button
                  onClick={() => navigator.clipboard.writeText(generatedPitch)}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" /> Copy to Clipboard
                </button>
              </div>
              <p className="text-xs text-slate-800 whitespace-pre-wrap leading-relaxed font-sans">
                {generatedPitch}
              </p>
            </div>
          )}
        </div>
      )}

      {/* NATURAL LANGUAGE QUERY CONSOLE TAB */}
      {activeTab === "query" && (
        <div className="space-y-5">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Natural Language CRM Query
              </h3>
              <p className="text-xs text-slate-500">
                Ask questions in plain English across accounts, deals, invoices, and payment histories
              </p>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={nlQuery}
                onChange={(e) => setNlQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRunNlQuery()}
                placeholder="e.g. Which clients have overdue balances above $10,000?"
                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
              />
              <button
                onClick={() => handleRunNlQuery()}
                disabled={isQueryLoading}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isQueryLoading ? "Searching..." : "Ask AI"}</span>
              </button>
            </div>

            {/* Quick Prompt Chips */}
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="text-[11px] text-slate-400 font-medium self-center">Try asking:</span>
              {[
                "Which clients owe more than $10,000?",
                "Which high priority deals are closing this month?",
                "Summarize our cash collection rate this quarter",
                "Show me accounts marked At Risk",
              ].map((chip) => (
                <button
                  key={chip}
                  onClick={() => {
                    setNlQuery(chip);
                    handleRunNlQuery(chip);
                  }}
                  className="px-2.5 py-1 bg-slate-50 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 rounded-full text-[11px] border border-slate-200 transition-colors"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          {queryResponse && (
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs">
                <Sparkles className="w-4 h-4" />
                <span>AarPex AI CRM Answer</span>
              </div>
              <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">
                {queryResponse}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
