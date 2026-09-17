import React, { useState } from "react";
import { useCRM } from "../../context/CRMContext";
import { Lead } from "../../types";
import { X, CheckCircle2, ArrowRight, Building2, User, Briefcase } from "lucide-react";

interface LeadConvertModalProps {
  lead: Lead | null;
  onClose: () => void;
}

export const LeadConvertModal: React.FC<LeadConvertModalProps> = ({ lead, onClose }) => {
  const { convertLead, setSelectedCompanyId, setActiveNav } = useCRM();
  const [createDeal, setCreateDeal] = useState(true);

  if (!lead) return null;

  const handleConvert = () => {
    const result = convertLead(lead.id, createDeal);
    onClose();
    if (result.company) {
      setSelectedCompanyId(result.company.id);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#181b21] rounded-2xl shadow-2xl border border-[#2d323f] w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-xs text-slate-100">
        <div className="px-6 py-4 border-b border-[#2d323f] flex items-center justify-between bg-[#121418]">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-teal-400" />
              Convert Lead to Qualified Accounts
            </h3>
            <p className="text-slate-400 text-[11px]">
              Transforms {lead.name} into interconnected CRM entities
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#252a36]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-slate-300 leading-relaxed">
            Converting <strong className="text-white">{lead.name}</strong> from <strong className="text-teal-300">{lead.company}</strong> will automatically generate the following linked records:
          </p>

          <div className="space-y-3 bg-[#121418] p-4 rounded-xl border border-[#2d323f]">
            <div className="flex items-start gap-3">
              <Building2 className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-white">New / Linked Company</span>
                <div className="text-slate-400 text-[11px]">{lead.company} ({lead.city || "Headquarters"})</div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <User className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-white">Primary Contact</span>
                <div className="text-slate-400 text-[11px]">
                  {lead.name} — {lead.jobTitle || "Director"} ({lead.email})
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Briefcase className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">Sales Pipeline Deal</span>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={createDeal}
                      onChange={(e) => setCreateDeal(e.target.checked)}
                      className="rounded accent-teal-500 focus:ring-teal-500"
                    />
                    <span className="text-[11px] text-slate-300 font-medium">Create Deal</span>
                  </label>
                </div>
                {createDeal && (
                  <div className="text-teal-300 font-mono text-[11px]">
                    {lead.company} - Expansion Core (${(lead.estimatedValue || 50000).toLocaleString()})
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="p-3 bg-[#252a36] border border-[#3d4455] rounded-xl text-slate-200 text-[11px]">
            Lead history, notes, and activity source ({lead.source}) will be preserved in the new account timeline.
          </div>
        </div>

        <div className="p-4 bg-[#121418] border-t border-[#2d323f] flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-[#2d323f] rounded-lg text-slate-300 font-semibold hover:bg-[#252a36] hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConvert}
            className="px-5 py-2 bg-[#252a36] hover:bg-[#2f3544] text-white rounded-lg font-bold shadow-sm border border-[#3d4455] flex items-center gap-1.5 transition-all"
          >
            <span>Confirm & Convert</span>
            <ArrowRight className="w-3.5 h-3.5 text-teal-400" />
          </button>
        </div>
      </div>
    </div>
  );
};
