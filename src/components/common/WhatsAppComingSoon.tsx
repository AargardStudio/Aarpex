import React from "react";
import { MessageSquare, Clock } from "lucide-react";

/** Shown in place of the WhatsApp inbox and Settings > WhatsApp. */
export const WhatsAppComingSoon: React.FC = () => (
  <div className="bg-[#181b21] rounded-2xl border border-[#2d323f] shadow-md p-8 md:p-12 text-center max-w-2xl mx-auto">
    <span className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto">
      <MessageSquare className="w-7 h-7 text-emerald-400" />
    </span>
    <div className="inline-flex items-center gap-1.5 mt-4 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-bold uppercase tracking-wide">
      <Clock className="w-3 h-3" /> Coming soon
    </div>
    <h2 className="text-lg font-bold text-white mt-3">WhatsApp is on its way</h2>
    <p className="text-sm text-slate-400 mt-2 leading-relaxed">
      We're completing Meta's partner approval so you can connect your WhatsApp Business number in one click and message leads, receive replies and let your Industry Agents draft responses, all inside AarPex.
    </p>
    <p className="text-xs text-slate-500 mt-4">Email outreach, campaigns and everything else keep working as normal. We'll announce WhatsApp in the release notes as soon as it's live.</p>
  </div>
);
