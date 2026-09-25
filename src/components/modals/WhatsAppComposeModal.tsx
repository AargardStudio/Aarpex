import React, { useState } from "react";
import { useCRM } from "../../context/CRMContext";
import {
  X,
  MessageSquare,
  Send,
  CheckCircle2,
  AlertCircle,
  Clock,
  FileType,
} from "lucide-react";
import { apiFetch } from "../../lib/apiClient";

interface WhatsAppComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTo?: string;
  initialBody?: string;
  companyId?: string;
  contactId?: string;
  leadId?: string;
}

export const WhatsAppComposeModal: React.FC<WhatsAppComposeModalProps> = ({
  isOpen,
  onClose,
  initialTo = "",
  initialBody = "",
  companyId,
  contactId,
  leadId,
}) => {
  const { activeTenant, currentUser, addActivity } = useCRM();

  const [to, setTo] = useState(initialTo);
  const [mode, setMode] = useState<"text" | "template">("text");
  const [body, setBody] = useState(initialBody);
  const [templateName, setTemplateName] = useState("");
  const [templateLanguage, setTemplateLanguage] = useState("en_US");
  const [templateParams, setTemplateParams] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [resultStatus, setResultStatus] = useState<{
    success: boolean;
    message: string;
    outsideWindow?: boolean;
  } | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setTo(initialTo);
      setBody(initialBody);
      setMode("text");
      setTemplateName("");
      setTemplateParams("");
      setResultStatus(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialTo, initialBody, activeTenant?.id]);

  if (!isOpen) return null;

  const waConfig = activeTenant?.whatsappConfig;
  const waProvider = waConfig?.provider || "meta";
  const isConfigured =
    waProvider === "twilio"
      ? !!(waConfig?.twilioAccountSid && waConfig?.twilioAuthToken && waConfig?.twilioWhatsAppNumber)
      : !!(waConfig?.accessToken && waConfig?.phoneNumberId);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!to || !to.trim()) {
      alert("Please enter a recipient WhatsApp number.");
      return;
    }
    if (!isConfigured) {
      setResultStatus({
        success: false,
        message: "WhatsApp Business isn't connected yet. Set it up in Settings first.",
      });
      return;
    }

    setIsSending(true);
    setResultStatus(null);

    try {
      const payload: Record<string, any> =
        waProvider === "twilio"
          ? {
              provider: "twilio",
              twilioAccountSid: waConfig?.twilioAccountSid,
              twilioAuthToken: waConfig?.twilioAuthToken,
              twilioWhatsAppNumber: waConfig?.twilioWhatsAppNumber,
              to: to.trim(),
            }
          : {
              provider: "meta",
              accessToken: waConfig?.accessToken,
              phoneNumberId: waConfig?.phoneNumberId,
              to: to.trim(),
            };
      if (mode === "template") {
        payload.templateName = templateName.trim();
        payload.templateLanguage = templateLanguage.trim() || "en_US";
        if (templateParams.trim()) {
          payload.templateParams = templateParams.split(",").map((p) => p.trim()).filter(Boolean);
        }
      } else {
        payload.body = body.trim();
      }

      const res = await apiFetch("/api/whatsapp/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (data.success) {
        setResultStatus({
          success: true,
          message: `Sent to ${to}.`,
        });

        addActivity({
          type: "WhatsApp",
          companyId,
          contactId,
          leadId,
          date: new Date().toISOString().split("T")[0],
          time: new Date().toTimeString().slice(0, 5),
          user: currentUser?.name || "System",
          description:
            mode === "template"
              ? `Sent WhatsApp template "${templateName}" to ${to}`
              : `Sent WhatsApp message to ${to}: "${body.slice(0, 120)}${body.length > 120 ? "…" : ""}"`,
          outcome: "Delivered",
          nextAction: "Monitor for a reply",
        });

        setTimeout(() => {
          onClose();
        }, 2200);
      } else {
        setResultStatus({
          success: false,
          message: data.error || "Failed to send WhatsApp message.",
          outsideWindow: !!data.outsideWindow,
        });
      }
    } catch (err: any) {
      setResultStatus({
        success: false,
        message: err.message || "Network error while contacting WhatsApp.",
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-[#181b21] rounded-2xl shadow-2xl border border-[#2d323f] w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden text-xs text-slate-100">
        {/* Header Bar */}
        <div className="px-6 py-4 border-b border-[#282d39] flex items-center justify-between bg-[#121418]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-white text-sm flex items-center gap-2">
                <span>Send WhatsApp Message</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                  {activeTenant?.name}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {isConfigured ? (
                  <span className="text-emerald-400">
                    Connected{waConfig?.displayPhoneNumber ? ` • ${waConfig.displayPhoneNumber}` : ""}
                  </span>
                ) : (
                  <span className="text-amber-400">Not connected — configure in Settings</span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-[#252a36] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSend} className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {resultStatus && (
            <div
              className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                resultStatus.success
                  ? "bg-emerald-950/40 border-emerald-800 text-emerald-200"
                  : "bg-rose-950/40 border-rose-800 text-rose-200"
              }`}
            >
              {resultStatus.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div>
                <div className="font-bold">{resultStatus.message}</div>
                {resultStatus.outsideWindow && (
                  <div className="text-[11px] text-slate-300 mt-1">
                    This contact hasn't messaged you in the last 24 hours, so WhatsApp only allows a pre-approved
                    message template here. Switch to "Template" below and enter the template name approved for
                    this number.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Recipient */}
          <div className="flex items-center gap-2">
            <label className="w-16 font-semibold text-slate-400 text-right shrink-0">To:</label>
            <input
              type="text"
              required
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="+1 555 123 4567"
              className="flex-1 px-3 py-1.5 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-emerald-400 font-medium font-mono"
            />
          </div>

          {/* Mode toggle */}
          <div className="flex items-center gap-2 p-1 bg-[#121418] border border-[#2d323f] rounded-lg w-fit">
            <button
              type="button"
              onClick={() => setMode("text")}
              className={`px-3 py-1.5 rounded-md font-semibold flex items-center gap-1.5 transition-colors ${
                mode === "text" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              <Clock className="w-3.5 h-3.5" /> Free Text (24h window)
            </button>
            <button
              type="button"
              onClick={() => setMode("template")}
              className={`px-3 py-1.5 rounded-md font-semibold flex items-center gap-1.5 transition-colors ${
                mode === "template" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              <FileType className="w-3.5 h-3.5" /> Template (anytime)
            </button>
          </div>

          {mode === "text" ? (
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-300">Message</label>
              <textarea
                rows={5}
                required
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full px-3 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-xl focus:outline-none focus:border-emerald-400 font-sans text-xs leading-relaxed custom-scrollbar"
                placeholder="Write your WhatsApp message..."
              />
              <div className="text-[10px] text-slate-500">
                Only works if this contact messaged you first, or replied, within the last 24 hours. Otherwise
                Meta will reject the send — use a Template instead.
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <label className="w-28 font-semibold text-slate-400 text-right shrink-0">
                  {waProvider === "twilio" ? "Content SID:" : "Template name:"}
                </label>
                <input
                  type="text"
                  required
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder={waProvider === "twilio" ? "HX..." : "order_update"}
                  className="flex-1 px-3 py-1.5 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-emerald-400 font-mono"
                />
              </div>
              {waProvider !== "twilio" && (
                <div className="flex items-center gap-2">
                  <label className="w-28 font-semibold text-slate-400 text-right shrink-0">Language code:</label>
                  <input
                    type="text"
                    value={templateLanguage}
                    onChange={(e) => setTemplateLanguage(e.target.value)}
                    placeholder="en_US"
                    className="flex-1 px-3 py-1.5 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-emerald-400 font-mono"
                  />
                </div>
              )}
              <div className="flex items-center gap-2">
                <label className="w-28 font-semibold text-slate-400 text-right shrink-0">Parameters:</label>
                <input
                  type="text"
                  value={templateParams}
                  onChange={(e) => setTemplateParams(e.target.value)}
                  placeholder="John, Order #1234 (comma-separated)"
                  className="flex-1 px-3 py-1.5 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-emerald-400"
                />
              </div>
              <div className="text-[10px] text-slate-500 pl-[7.5rem]">
                {waProvider === "twilio"
                  ? "Must be an approved Content Template's SID from the Twilio Console (Content Editor)."
                  : "Must match a template already approved for this WhatsApp number in Meta Business Manager."}
              </div>
            </div>
          )}

          {/* Footer Submit Bar */}
          <div className="pt-4 border-t border-[#282d39] flex items-center justify-between">
            <div className="text-slate-400 text-[11px]">Logs to activity feed on success</div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-[#252a36] hover:bg-[#2f3544] text-slate-300 rounded-xl font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSending}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl font-bold flex items-center gap-2 shadow-sm transition-all"
              >
                <Send className={`w-3.5 h-3.5 ${isSending ? "animate-pulse" : ""}`} />
                <span>{isSending ? "Sending..." : "Send Message"}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
