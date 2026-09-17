import React from "react";
import { Building2 } from "lucide-react";
import { useCRM } from "../../context/CRMContext";

export const Footer: React.FC = () => {
  const { activeTenant, setActiveNav } = useCRM();

  return (
    <footer
      id="app-global-footer"
      className="mt-8 border-t border-[#222733] bg-[#0d0f13] text-xs text-slate-400 py-5 px-6 rounded-2xl transition-all"
    >
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Left: Branding & Tenant Context */}
        <div className="flex flex-wrap items-center gap-3 text-center md:text-left">
          <div className="flex items-center gap-2 font-bold text-white tracking-wide">
            <span className="w-2.5 h-2.5 rounded-full bg-teal-400 animate-pulse" />
            <span className="text-slate-100">AarPex CRM</span>
          </div>

          <span className="hidden sm:inline text-slate-600">|</span>

          <div className="flex items-center gap-1.5 text-slate-400">
            <Building2 className="w-3.5 h-3.5 text-slate-500" />
            <span>Workspace:</span>
            <strong className="text-slate-200">{activeTenant?.name || "Global Headquarters"}</strong>
            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-[#1d222b] text-teal-300 border border-[#2d323f]">
              {activeTenant?.plan || "Growth"} Tier
            </span>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Quick Settings Link */}
          <button
            id="footer-settings-btn"
            type="button"
            onClick={() => setActiveNav("Settings")}
            className="text-slate-400 hover:text-white transition-colors text-xs font-medium px-2 py-1 rounded hover:bg-[#1a1e27]"
          >
            Settings & Billing
          </button>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-[#1a1f28] flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-500 gap-2">
        <p>
          &copy; {new Date().getFullYear()} Aargard Business Solutions. All rights reserved.
        </p>
      </div>
    </footer>
  );
};
