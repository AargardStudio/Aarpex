import React, { useState, useRef } from "react";
import { useCRM } from "../../context/CRMContext";
import {
  X,
  Mail,
  Send,
  Paperclip,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  FileArchive,
  FileCode,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Server,
  Building2,
  UserCheck,
} from "lucide-react";
import { EmailAttachment } from "../../types";
import { apiFetch } from "../../lib/apiClient";
import { getMailboxById, mailboxLabel } from "../../lib/webmail";

interface EmailComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTo?: string;
  initialSubject?: string;
  initialBody?: string;
  initialAttachments?: EmailAttachment[];
  companyId?: string;
  contactId?: string;
  dealId?: string;
}

export const EmailComposeModal: React.FC<EmailComposeModalProps> = ({
  isOpen,
  onClose,
  initialTo = "",
  initialSubject = "",
  initialBody = "",
  initialAttachments = [],
  companyId,
  contactId,
  dealId,
}) => {
  const { activeTenant, currentUser, addActivity, companies } = useCRM();

  const [to, setTo] = useState(initialTo);
  const [showCc, setShowCc] = useState(false);
  const [cc, setCc] = useState("");
  const [showBcc, setShowBcc] = useState(false);
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(
    initialBody ||
      `Dear partner,\n\nPlease find attached the requested documentation from ${
        activeTenant?.name || "our team"
      }.\n\nLet us know if you have any questions or require adjustments.\n\nBest regards,\n${
        currentUser?.name || "Account Executive"
      }\n${activeTenant?.name || "Aargard Business Solutions"}`
  );

  const [attachments, setAttachments] = useState<EmailAttachment[]>(initialAttachments);
  const [selectedMailboxId, setSelectedMailboxId] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [resultStatus, setResultStatus] = useState<{
    success: boolean;
    message: string;
    details?: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Synchronize when opening with new props
  React.useEffect(() => {
    if (isOpen) {
      if (initialTo) setTo(initialTo);
      if (initialSubject) setSubject(initialSubject);
      if (initialBody) setBody(initialBody);
      if (initialAttachments && initialAttachments.length > 0) {
        setAttachments(initialAttachments);
      }
      setResultStatus(null);
      setSelectedMailboxId((prev) => {
        if (prev && (activeTenant?.webmailConfigs || []).some((m) => m.id === prev)) return prev;
        return getMailboxById(activeTenant)?.id || "";
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialTo, initialSubject, initialBody, initialAttachments, activeTenant?.id]);

  if (!isOpen) return null;

  const mailboxes = activeTenant?.webmailConfigs || [];
  const mailCfg = getMailboxById(activeTenant, selectedMailboxId);
  const isSmtpConfigured = !!(mailCfg?.email && mailCfg?.smtpHost);
  const senderEmail = mailCfg?.email || currentUser?.email || "billing@apexcrm.enterprise";

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const getFileIcon = (filename: string, mime: string) => {
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    if (["pdf"].includes(ext) || mime.includes("pdf")) {
      return <FileText className="w-5 h-5 text-rose-400 shrink-0" />;
    }
    if (["xlsx", "xls", "csv"].includes(ext) || mime.includes("sheet") || mime.includes("csv")) {
      return <FileSpreadsheet className="w-5 h-5 text-emerald-400 shrink-0" />;
    }
    if (["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext) || mime.startsWith("image/")) {
      return <ImageIcon className="w-5 h-5 text-sky-400 shrink-0" />;
    }
    if (["zip", "tar", "gz", "rar", "7z"].includes(ext) || mime.includes("zip")) {
      return <FileArchive className="w-5 h-5 text-amber-400 shrink-0" />;
    }
    if (["json", "js", "ts", "html", "css"].includes(ext)) {
      return <FileCode className="w-5 h-5 text-purple-400 shrink-0" />;
    }
    return <FileText className="w-5 h-5 text-teal-400 shrink-0" />;
  };

  const handleProcessFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const newAttachments: EmailAttachment[] = [];
    Array.from(fileList).forEach((file) => {
      // 20MB limit per file check
      if (file.size > 20 * 1024 * 1024) {
        alert(`File "${file.name}" exceeds the 20MB email attachment size limit.`);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        const attachment: EmailAttachment = {
          id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          filename: file.name,
          size: file.size,
          contentType: file.type || "application/octet-stream",
          content: result,
          dataUrl: file.type.startsWith("image/") ? result : undefined,
        };
        setAttachments((prev) => [...prev, attachment]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleProcessFiles(e.target.files);
    if (e.target) e.target.value = "";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleProcessFiles(e.dataTransfer.files);
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  // Quick Preset Sample Attachments
  const handleAddPresetAttachment = (type: "invoice" | "sla" | "deck" | "quote") => {
    let preset: EmailAttachment;
    if (type === "invoice") {
      preset = {
        id: `att_pre_${Date.now()}`,
        filename: `Invoice_${activeTenant?.slug || "Aargard"}_2026.pdf`,
        size: 342000,
        contentType: "application/pdf",
        content: "data:application/pdf;base64,JVBERi0xLjQKJcTl8uXrp/Og0MTGCjQgMCBvYmoKPDwKL0xlbmd0aCAxNzAKL0ZpbHRlciAvRmxhdGVEZWNvZGUKPj4Kc3RyZWFtCnicU8hTMAJhMwZdBQUDpRRDBTCrUik5vzi5JDczL52Lwb9ULyixuCSzJDUnp5TLzV2Jq0qBwTslvyivWMEpNTkxj6skMccFKNXnClWbl1+SWlSWWJaaV5yfl1+iUKrg619ckJiXnJmY42+q4B5eCgCqLC5pCmVuZHN0cmVhbQplbmRvYmoKMSAwIG9ia...",
      };
    } else if (type === "sla") {
      preset = {
        id: `att_pre_${Date.now()}`,
        filename: "Enterprise_SLA_Guarantee_Terms.pdf",
        size: 512000,
        contentType: "application/pdf",
        content: "data:application/pdf;base64,JVBERi0xLjQKJcTl8uXrp/Og0MTGCjQgMCBvYmoKPDwKL0xlbmd0aCAxNzAKL0ZpbHRlciAvRmxhdGVEZWNvZGUKPj4Kc3RyZWFtCnicU8hTMAJhMwZdBQUDpRRDBTCrUik5vzi5JDczL52Lwb9ULyixuCSzJDUnp5TLzV2Jq0qBwTslvyivWMEpNTkxj6skMccFKNXnClWbl1+SWlSWWJaaV5yfl1+iUKrg619ckJiXnJmY42+q4B5eCgCqLC5pCmVuZHN0cmVhbQplbmRvYmoKMSAwIG9ia...",
      };
    } else if (type === "deck") {
      preset = {
        id: `att_pre_${Date.now()}`,
        filename: `${activeTenant?.name || "Enterprise"}_Overview_2026.pdf`,
        size: 1480000,
        contentType: "application/pdf",
        content: "data:application/pdf;base64,JVBERi0xLjQKJcTl8uXrp/Og0MTGCjQgMCBvYmoKPDwKL0xlbmd0aCAxNzAKL0ZpbHRlciAvRmxhdGVEZWNvZGUKPj4Kc3RyZWFtCnicU8hTMAJhMwZdBQUDpRRDBTCrUik5vzi5JDczL52Lwb9ULyixuCSzJDUnp5TLzV2Jq0qBwTslvyivWMEpNTkxj6skMccFKNXnClWbl1+SWlSWWJaaV5yfl1+iUKrg619ckJiXnJmY42+q4B5eCgCqLC5pCmVuZHN0cmVhbQplbmRvYmoKMSAwIG9ia...",
      };
    } else {
      preset = {
        id: `att_pre_${Date.now()}`,
        filename: "MultiTenant_Pricing_Schedule.xlsx",
        size: 215000,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        content: "data:application/vnd.ms-excel;base64,UEsDBBQABgAIAAAAIQAz/xL3kQAAABgCAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbKyRy07DMBBF90j8g+UrSpyyqIQQ6YIqC1i1fMCOp4k1P2R72vTvcZqW0A2wsFmce+bce+Zqtb/0DntEZh2nVZ4VGYDRVqZ1W+Wv5UP+kpkksjK2wdEqb0Dla/n0tFpdh0iK3mFqK5G9b2F6lG2kOa8E05mH3...",
      };
    }
    setAttachments((prev) => [...prev, preset]);
  };

  const totalAttachmentBytes = attachments.reduce((acc, a) => acc + (a.size || 0), 0);

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!to || !to.trim()) {
      alert("Please enter a recipient email address.");
      return;
    }

    setIsSending(true);
    setResultStatus(null);

    try {
      const payload = {
        email: senderEmail,
        displayName: mailCfg?.displayName || currentUser?.name || activeTenant?.name,
        password: mailCfg?.password || "",
        smtpHost: mailCfg?.smtpHost || "smtp.hostinger.com",
        smtpPort: mailCfg?.smtpPort || 465,
        smtpEncryption: mailCfg?.smtpEncryption || "SSL",
        to: to.trim(),
        cc: cc.trim() || undefined,
        bcc: bcc.trim() || undefined,
        subject: subject.trim() || "Message from CRM",
        body: body.trim(),
        attachments: attachments.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        })),
      };

      const res = await apiFetch("/api/webmail/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (data.success) {
        setResultStatus({
          success: true,
          message: data.message || `Dispatched to ${to} with ${attachments.length} attachment(s).`,
          details: data.liveMode ? "Delivered via active SMTP relay" : "Processed via CRM Mail Gateway",
        });

        // Automatically log activity to CRM Timeline
        const matchedComp = companyId || companies.find((c) => c.email === to || to.includes(c.name.toLowerCase()))?.id;
        addActivity({
          type: "Email",
          companyId: matchedComp,
          contactId,
          dealId,
          date: new Date().toISOString().split("T")[0],
          time: new Date().toTimeString().slice(0, 5),
          user: currentUser?.name || "System",
          description: `Dispatched email "${subject}" with ${attachments.length} file attachment(s) to ${to}`,
          outcome: "Delivered",
          nextAction: "Monitor recipient response or quote follow-up",
        });

        // Auto close after 2.5 seconds on success
        setTimeout(() => {
          onClose();
        }, 2200);
      } else {
        setResultStatus({
          success: false,
          message: data.error || "Failed to dispatch email. Check mail server credentials.",
        });
      }
    } catch (err: any) {
      setResultStatus({
        success: false,
        message: err.message || "Network error while connecting to mail gateway.",
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-[#181b21] rounded-2xl shadow-2xl border border-[#2d323f] w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden text-xs text-slate-100">
        {/* Header Bar */}
        <div className="px-6 py-4 border-b border-[#282d39] flex items-center justify-between bg-[#121418]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-white text-sm flex items-center gap-2">
                <span>Compose Email</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30 font-mono">
                  {activeTenant?.name}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                <span>From:</span>
                {mailboxes.length > 1 ? (
                  <select
                    value={selectedMailboxId}
                    onChange={(e) => setSelectedMailboxId(e.target.value)}
                    className="px-1.5 py-0.5 bg-[#121418] border border-[#2d323f] text-white rounded-md font-mono text-[11px] focus:outline-none focus:border-teal-400"
                  >
                    {mailboxes.map((m) => (
                      <option key={m.id} value={m.id}>
                        {mailboxLabel(m)} {m.isDefault ? "(Default)" : ""} — {m.email || "not configured"}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-white font-mono">{senderEmail}</span>
                )}
                {isSmtpConfigured ? (
                  <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
                    • <Server className="w-3 h-3" /> {mailCfg?.smtpHost}
                  </span>
                ) : (
                  <span className="text-[10px] text-amber-400">• Standard Mail Gateway</span>
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
        <form onSubmit={handleSendEmail} className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {resultStatus && (
            <div
              className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                resultStatus.success
                  ? "bg-teal-950/40 border-teal-800 text-teal-200"
                  : "bg-rose-950/40 border-rose-800 text-rose-200"
              }`}
            >
              {resultStatus.success ? (
                <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div>
                <div className="font-bold">{resultStatus.message}</div>
                {resultStatus.details && (
                  <div className="text-[11px] text-slate-400 mt-0.5">{resultStatus.details}</div>
                )}
              </div>
            </div>
          )}

          {/* Recipient Rows */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="w-16 font-semibold text-slate-400 text-right">To:</label>
              <input
                type="email"
                required
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="client@company.com"
                className="flex-1 px-3 py-1.5 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400 font-medium"
              />
              <div className="flex items-center gap-1">
                {!showCc && (
                  <button
                    type="button"
                    onClick={() => setShowCc(true)}
                    className="px-2 py-1 text-[11px] text-slate-400 hover:text-white hover:bg-[#252a36] rounded transition-colors"
                  >
                    Cc
                  </button>
                )}
                {!showBcc && (
                  <button
                    type="button"
                    onClick={() => setShowBcc(true)}
                    className="px-2 py-1 text-[11px] text-slate-400 hover:text-white hover:bg-[#252a36] rounded transition-colors"
                  >
                    Bcc
                  </button>
                )}
              </div>
            </div>

            {showCc && (
              <div className="flex items-center gap-2">
                <label className="w-16 font-semibold text-slate-400 text-right">Cc:</label>
                <input
                  type="text"
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  placeholder="colleague@company.com"
                  className="flex-1 px-3 py-1.5 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
                />
              </div>
            )}

            {showBcc && (
              <div className="flex items-center gap-2">
                <label className="w-16 font-semibold text-slate-400 text-right">Bcc:</label>
                <input
                  type="text"
                  value={bcc}
                  onChange={(e) => setBcc(e.target.value)}
                  placeholder="archive@company.com"
                  className="flex-1 px-3 py-1.5 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400"
                />
              </div>
            )}

            <div className="flex items-center gap-2">
              <label className="w-16 font-semibold text-slate-400 text-right">Subject:</label>
              <input
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Enterprise proposal & SLA details"
                className="flex-1 px-3 py-1.5 bg-[#121418] border border-[#2d323f] text-white rounded-lg focus:outline-none focus:border-teal-400 font-medium"
              />
            </div>
          </div>

          {/* Body Content */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-300">Message Body</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setBody(
                      (prev) =>
                        `${prev}\n\n[Action Item]: Please confirm receipt and signature of the attached terms by Friday.`
                    );
                  }}
                  className="text-[11px] text-teal-400 hover:text-teal-300 flex items-center gap-1 transition-colors"
                >
                  <Sparkles className="w-3 h-3" /> Add Executive Action
                </button>
              </div>
            </div>

            <textarea
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full px-3 py-2 bg-[#121418] border border-[#2d323f] text-white rounded-xl focus:outline-none focus:border-teal-400 font-sans text-xs leading-relaxed custom-scrollbar"
              placeholder="Write your email message..."
            />
          </div>

          {/* Multiple File Attachments Section */}
          <div className="space-y-3 pt-2 border-t border-[#282d39]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-teal-400" />
                <span className="font-bold text-white">Attached Files</span>
                <span className="px-2 py-0.5 rounded-full bg-[#252a36] text-slate-300 text-[10px] font-mono">
                  {attachments.length} file(s) • {formatFileSize(totalAttachmentBytes)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="file"
                  multiple
                  ref={fileInputRef}
                  onChange={handleFileInputChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1 bg-[#252a36] hover:bg-[#2f3544] text-teal-300 border border-[#3d4455] rounded-lg font-bold flex items-center gap-1 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Choose Files</span>
                </button>
              </div>
            </div>

            {/* Drag and Drop Zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`p-4 rounded-xl border-2 border-dashed text-center cursor-pointer transition-all ${
                isDragging
                  ? "border-teal-400 bg-teal-950/20 text-teal-200"
                  : "border-[#2d323f] hover:border-[#3d4455] bg-[#121418]/60 text-slate-400 hover:text-slate-200"
              }`}
            >
              <Paperclip className="w-6 h-6 mx-auto mb-1 text-slate-400" />
              <div className="font-semibold text-slate-200">
                Drag & drop multiple files here, or <span className="text-teal-400">browse computer</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Supports PDF, Excel (.xlsx, .csv), Word docs, Images, and ZIP archives up to 25MB total.
              </div>
            </div>

            {/* Quick Preset Buttons */}
            <div className="flex items-center flex-wrap gap-2 text-[11px]">
              <span className="text-slate-400">Quick Attach:</span>
              <button
                type="button"
                onClick={() => handleAddPresetAttachment("invoice")}
                className="px-2 py-0.5 bg-[#121418] hover:bg-[#252a36] border border-[#2d323f] text-slate-300 rounded-md transition-colors"
              >
                + Invoice PDF
              </button>
              <button
                type="button"
                onClick={() => handleAddPresetAttachment("sla")}
                className="px-2 py-0.5 bg-[#121418] hover:bg-[#252a36] border border-[#2d323f] text-slate-300 rounded-md transition-colors"
              >
                + SLA Terms PDF
              </button>
              <button
                type="button"
                onClick={() => handleAddPresetAttachment("deck")}
                className="px-2 py-0.5 bg-[#121418] hover:bg-[#252a36] border border-[#2d323f] text-slate-300 rounded-md transition-colors"
              >
                + Company Deck PDF
              </button>
              <button
                type="button"
                onClick={() => handleAddPresetAttachment("quote")}
                className="px-2 py-0.5 bg-[#121418] hover:bg-[#252a36] border border-[#2d323f] text-slate-300 rounded-md transition-colors"
              >
                + Pricing Sheet XLSX
              </button>
            </div>

            {/* Attachments List */}
            {attachments.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="p-2.5 rounded-xl bg-[#121418] border border-[#2d323f] flex items-center justify-between group hover:border-[#3d4455] transition-all"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {getFileIcon(att.filename, att.contentType)}
                      <div className="min-w-0">
                        <div className="font-semibold text-white truncate text-xs" title={att.filename}>
                          {att.filename}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {formatFileSize(att.size)}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveAttachment(att.id)}
                      className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 transition-colors ml-2 shrink-0"
                      title="Remove attachment"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer Submit Bar */}
          <div className="pt-4 border-t border-[#282d39] flex items-center justify-between">
            <div className="text-slate-400 text-[11px]">
              Outgoing relay: <strong className="text-teal-300">{activeTenant?.name}</strong> • Logs to activity feed
            </div>

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
                className="px-5 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded-xl font-bold flex items-center gap-2 shadow-sm transition-all"
              >
                <Send className={`w-3.5 h-3.5 ${isSending ? "animate-pulse" : ""}`} />
                <span>{isSending ? "Sending Email..." : `Send Email (${attachments.length} files)`}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
