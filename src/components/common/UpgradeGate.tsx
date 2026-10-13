import React, { useEffect, useState } from "react";
import { Lock, Sparkles, X, Check } from "lucide-react";
import { useCRM } from "../../context/CRMContext";
import { UPGRADE_REQUIRED_EVENT } from "../../lib/apiClient";
import { beginPaidUpgrade, PRO_PLAN_PRICE } from "../../data/subscriptionPlans";

const INTELLIGENCE_PERKS = [
  "Industry Agents that scan, draft and queue follow-ups for you (by industry or group)",
  "AarPex AI Copilot, AI Insights, smart search and daily briefings",
  "AI campaign and email writing, reply analysis, lead analysis and ABIC audits",
  "AI-drafted WhatsApp replies, plus multiple mailboxes and 10GB of storage",
];

function useUpgrade() {
  const { activeTenant } = useCRM();
  return () => {
    if (!activeTenant) return;
    beginPaidUpgrade(activeTenant.id, activeTenant.ownerEmail || "", "Pro");
  };
}

/** Full-page replacement shown to Growth workspaces for a Pro-only screen. */
export const UpgradePrompt: React.FC<{ feature: string }> = ({ feature }) => {
  const upgrade = useUpgrade();
  return (
    <div className="max-w-xl mx-auto mt-16 p-8 rounded-2xl border border-[#2d323f] bg-[#161920] text-center">
      <div className="w-12 h-12 rounded-full bg-teal-500/10 border border-teal-500/30 flex items-center justify-center mx-auto mb-4">
        <Lock className="w-5 h-5 text-teal-400" />
      </div>
      <h2 className="text-xl font-black text-white">{feature} is part of AarPex Pro</h2>
      <p className="text-sm text-slate-400 mt-2">
        Your workspace is on the Growth plan. The full Intelligence suite is included with Pro at ${PRO_PLAN_PRICE}/mo.
      </p>
      <ul className="text-left text-sm text-slate-300 mt-5 space-y-2">
        {INTELLIGENCE_PERKS.map((p) => (
          <li key={p} className="flex gap-2">
            <Check className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
            <span>{p}</span>
          </li>
        ))}
      </ul>
      <button
        onClick={upgrade}
        className="mt-6 w-full px-4 py-2.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-[#0b0d11] font-bold text-sm flex items-center justify-center gap-2"
      >
        <Sparkles className="w-4 h-4" /> Upgrade to Pro
      </button>
      <p className="text-[11px] text-slate-500 mt-2">You'll check out securely with Stripe, then come straight back here.</p>
    </div>
  );
};

/** Global popup: appears whenever the server refuses an AI call with a 402. */
export const UpgradeModal: React.FC = () => {
  const [open, setOpen] = useState(false);
  const upgrade = useUpgrade();
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(UPGRADE_REQUIRED_EVENT, show);
    return () => window.removeEventListener(UPGRADE_REQUIRED_EVENT, show);
  }, []);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[300] bg-black/70 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
      <div
        className="relative w-full max-w-md p-6 rounded-2xl border border-[#2d323f] bg-[#161920]"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={() => setOpen(false)} className="absolute top-3 right-3 text-slate-500 hover:text-white">
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2 mb-2">
          <Lock className="w-4 h-4 text-teal-400" />
          <h3 className="text-lg font-black text-white">AI features need AarPex Pro</h3>
        </div>
        <p className="text-sm text-slate-400">
          The Intelligence suite is included with Pro (${PRO_PLAN_PRICE}/mo). Your Growth plan keeps everything else.
        </p>
        <ul className="text-sm text-slate-300 mt-4 space-y-2">
          {INTELLIGENCE_PERKS.map((p) => (
            <li key={p} className="flex gap-2">
              <Check className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
        <div className="flex gap-2 mt-5">
          <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg border border-[#2d323f] text-slate-300 text-sm font-semibold">
            Not now
          </button>
          <button
            onClick={upgrade}
            className="flex-1 px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-[#0b0d11] font-bold text-sm flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4" /> Upgrade to Pro
          </button>
        </div>
      </div>
    </div>
  );
};
