import React, { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { useCRM } from "../../context/CRMContext";
import { Lead } from "../../types";
import {
  X,
  UploadCloud,
  FileSpreadsheet,
  Link2,
  CheckCircle2,
  AlertCircle,
  Download,
  ArrowRight,
  Database,
  Sparkles,
  Layers,
} from "lucide-react";

interface LeadImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LeadImportModal: React.FC<LeadImportModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { importLeadsFromSpreadsheet, currentUser, canPerform } = useCRM();

  const [activeTab, setActiveTab] = useState<"file" | "sheets">("file");
  const [file, setFile] = useState<File | null>(null);
  const [googleSheetsUrl, setGoogleSheetsUrl] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({
    name: "",
    company: "",
    email: "",
    phone: "",
    value: "",
    status: "",
    salesperson: "",
    source: "",
  });
  const [importSuccessCount, setImportSuccessCount] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  // Flattens every sheet/tab in a workbook into one row list, instead of
  // only reading workbook.SheetNames[0] -- a multi-tab spreadsheet (e.g.
  // one tab per month, or per source) used to silently lose every row
  // outside the first tab. Headers are the union of every column seen
  // across every sheet, since different tabs can use slightly different
  // column names/orders; XLSX.utils.sheet_to_json already fills a row's
  // missing columns with "" via defval, so a merged row list stays
  // rectangular for the column-mapping step below.
  const readAllSheets = (workbook: XLSX.WorkBook): { rows: any[]; headers: string[] } => {
    const rows: any[] = [];
    const headerSet = new Set<string>();
    workbook.SheetNames.forEach((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      const sheetRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
      sheetRows.forEach((row) => {
        Object.keys(row).forEach((k) => headerSet.add(k));
        rows.push(row);
      });
    });
    return { rows, headers: Array.from(headerSet) };
  };

  const autoMapHeaders = (detectedHeaders: string[]) => {
    const map: Record<string, string> = {};
    detectedHeaders.forEach((h) => {
      const lower = h.toLowerCase().trim();
      if (lower.includes("name") || lower.includes("contact") || lower.includes("lead")) {
        if (!map.name) map.name = h;
      }
      if (lower.includes("company") || lower.includes("organization") || lower.includes("account")) {
        if (!map.company) map.company = h;
      }
      if (lower.includes("email") || lower.includes("mail")) {
        if (!map.email) map.email = h;
      }
      if (lower.includes("phone") || lower.includes("mobile") || lower.includes("tel")) {
        if (!map.phone) map.phone = h;
      }
      if (lower.includes("value") || lower.includes("amount") || lower.includes("deal") || lower.includes("budget") || lower.includes("revenue")) {
        if (!map.value) map.value = h;
      }
      if (lower.includes("status") || lower.includes("stage")) {
        if (!map.status) map.status = h;
      }
      if (lower.includes("sales") || lower.includes("rep") || lower.includes("owner") || lower.includes("assignee")) {
        if (!map.salesperson) map.salesperson = h;
      }
      if (lower.includes("source") || lower.includes("origin") || lower.includes("channel")) {
        if (!map.source) map.source = h;
      }
    });

    setColumnMap((prev) => ({ ...prev, ...map }));
  };

  const handleFileUpload = (uploadedFile: File) => {
    setFile(uploadedFile);
    setParseError(null);
    setIsProcessing(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result;
        const workbook = XLSX.read(buffer, { type: "binary" });
        const { rows: json, headers: detectedHeaders } = readAllSheets(workbook);

        if (!json || json.length === 0) {
          setParseError("The uploaded spreadsheet does not contain any data rows.");
          setIsProcessing(false);
          return;
        }

        setHeaders(detectedHeaders);
        setParsedRows(json);
        autoMapHeaders(detectedHeaders);
        setIsProcessing(false);
      } catch (err: any) {
        setParseError(`Could not read Excel/Sheets file: ${err?.message || "Invalid file format"}`);
        setIsProcessing(false);
      }
    };
    reader.readAsBinaryString(uploadedFile);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  // Google Sheets Backend Integration
  const handleConnectGoogleSheets = async () => {
    if (!googleSheetsUrl.trim()) return;
    setIsProcessing(true);
    setParseError(null);

    try {
      let fetchUrl = googleSheetsUrl.trim();
      // Extract Google Sheet ID if standard edit URL provided. Exporting as
      // CSV only ever returns ONE tab (whichever the URL's gid points at,
      // or the first tab with none) -- that's why data from every tab past
      // the first used to silently disappear. Exporting the whole workbook
      // as XLSX instead returns every tab in one file, which readAllSheets
      // then flattens together.
      const match = googleSheetsUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      if (match && match[1]) {
        fetchUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=xlsx`;
      }

      const response = await fetch(fetchUrl);
      if (!response.ok) {
        throw new Error(`Google Sheets responded with HTTP ${response.status}. Please make sure the sheet is shared as "Anyone with link can view".`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const { rows: json, headers: detectedHeaders } = readAllSheets(workbook);

      if (!json || json.length === 0) {
        throw new Error("No data found in the connected Google Sheet.");
      }

      setHeaders(detectedHeaders);
      setParsedRows(json);
      autoMapHeaders(detectedHeaders);
      setIsProcessing(false);
    } catch (err: any) {
      // If CORS or public permission blocks direct fetch in browser iframe, provide friendly fallback
      setParseError(
        `Unable to fetch directly from Google Sheets: ${err?.message || "Check permissions"}. Tip: In Google Sheets, click File -> Download -> Microsoft Excel (.xlsx) and drag it into the file upload tab.`
      );
      setIsProcessing(false);
    }
  };

  const handleLoadDemoDataset = () => {
    const demoLeads = [
      { "Lead Name": "Julian Drake", "Company": "Starlight Aerospace", "Email": "julian.drake@starlight.io", "Phone": "+1 (555) 392-1084", "Value": 65000, "Status": "Qualified", "Salesperson": "Sarah Jenkins", "Source": "Inbound Web" },
      { "Lead Name": "Victoria Chen", "Company": "Apex Quant Systems", "Email": "v.chen@apexquant.co", "Phone": "+1 (555) 832-9901", "Value": 120000, "Status": "New", "Salesperson": "David Miller", "Source": "Google Ads" },
      { "Lead Name": "Omar Al-Mansoor", "Company": "Crestline Logistics", "Email": "omar@crestlinelog.com", "Phone": "+1 (555) 201-4478", "Value": 45000, "Status": "Contacted", "Salesperson": "Elena Rostova", "Source": "Referral" },
      { "Lead Name": "Clara Sterling", "Company": "Helios BioTech", "Email": "c.sterling@heliosbio.org", "Phone": "+1 (555) 912-7733", "Value": 95000, "Status": "Proposal Sent", "Salesperson": "Sarah Jenkins", "Source": "Conference" },
      { "Lead Name": "Brandon Vance", "Company": "Vance Industrial AI", "Email": "bvance@vanceai.tech", "Phone": "+1 (555) 604-3312", "Value": 80000, "Status": "New", "Salesperson": "Hamza Sheikh", "Source": "Outbound Email" },
    ];
    const detectedHeaders = Object.keys(demoLeads[0]);
    setHeaders(detectedHeaders);
    setParsedRows(demoLeads);
    autoMapHeaders(detectedHeaders);
    setParseError(null);
  };

  const handleDownloadTemplate = () => {
    const templateData = [
      ["Lead Name", "Company", "Email", "Phone", "Estimated Value", "Lead Status", "Sales Rep", "Lead Source"],
      ["Jane Doe", "Acme Corporation", "jane.doe@acme.com", "+1 (555) 019-2831", "50000", "New", "Alex Rivera", "Website"],
      ["John Smith", "Nexus Analytics", "j.smith@nexus.io", "+1 (555) 882-9944", "75000", "Qualified", "Sarah Jenkins", "Google Search"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Leads_Import_Template");
    XLSX.writeFile(wb, "CRM_Leads_Import_Template.xlsx");
  };

  const handleExecuteImport = () => {
    if (!columnMap.name || !columnMap.company) {
      setParseError("Please map at least 'Lead Name' and 'Company' before importing.");
      return;
    }

    const leadsToImport: Array<Omit<Lead, "id" | "createdDate">> = parsedRows.map((row) => {
      const rawVal = row[columnMap.value];
      let cleanVal = 0;
      if (typeof rawVal === "number") {
        cleanVal = rawVal;
      } else if (typeof rawVal === "string") {
        cleanVal = parseFloat(rawVal.replace(/[^0-9.-]+/g, "")) || 0;
      }

      const rawStatus = row[columnMap.status];
      let status: Lead["status"] = "New";
      if (["New", "Contacted", "Qualified", "Proposal Sent", "Converted", "Unqualified"].includes(rawStatus)) {
        status = rawStatus as Lead["status"];
      }

      const today = new Date().toISOString().split("T")[0];

      return {
        name: String(row[columnMap.name] || "Unnamed Lead"),
        company: String(row[columnMap.company] || "Unassigned Company"),
        jobTitle: "",
        email: String(row[columnMap.email] || ""),
        phone: String(row[columnMap.phone] || ""),
        industry: "General",
        country: "",
        city: "",
        estimatedValue: cleanVal,
        status,
        priority: "Medium",
        leadScore: 50,
        salesperson: String(row[columnMap.salesperson] || currentUser.name),
        source: String(row[columnMap.source] || "Spreadsheet Import"),
        notes: "Imported from spreadsheet.",
        tags: [],
        lastContact: today,
        expectedCloseDate: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
        nextFollowUp: new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0],
      };
    });

    const count = importLeadsFromSpreadsheet(leadsToImport);
    setImportSuccessCount(count);
  };

  return (
    <div
      id="lead-import-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="w-full max-w-3xl bg-[#181b21] border border-[#2d323f] rounded-2xl shadow-2xl overflow-hidden text-slate-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-[#2d323f] flex items-center justify-between bg-[#14171d] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#252a36] border border-[#3d4455] flex items-center justify-center text-teal-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Import Leads from Excel or Google Sheets
              </h2>
              <p className="text-xs text-slate-400">
                Bulk ingest prospects into CRM pipeline with automated column mapping
              </p>
            </div>
          </div>
          <button
            id="close-lead-import-modal"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#252a36] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success Confirmation Screen */}
        {importSuccessCount !== null ? (
          <div className="p-10 text-center space-y-4 my-auto">
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-white">
              Successfully Imported {importSuccessCount} Leads
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              All leads have been added to your CRM pipeline and assigned to respective sales
              representatives with full audit activity logged.
            </p>
            <div className="pt-4 flex justify-center gap-3">
              <button
                onClick={() => {
                  setImportSuccessCount(null);
                  setParsedRows([]);
                  setHeaders([]);
                  setFile(null);
                }}
                className="px-4 py-2 bg-[#252a36] hover:bg-[#2f3544] border border-[#3d4455] rounded-xl text-xs font-semibold text-slate-200"
              >
                Import Another File
              </button>
              <button
                onClick={onClose}
                className="px-5 py-2 bg-[#252a36] hover:bg-[#2f3544] border border-[#3d4455] text-white rounded-xl text-xs font-bold shadow-md"
              >
                View Leads Pipeline
              </button>
            </div>
          </div>
        ) : (
          /* Main Import Wizard */
          <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
            {/* Source Type Selector */}
            {parsedRows.length === 0 && (
              <>
                <div className="grid grid-cols-2 p-1 bg-[#121418] rounded-xl border border-[#2d323f] text-xs font-semibold">
                  <button
                    onClick={() => setActiveTab("file")}
                    className={`py-2 rounded-lg flex items-center justify-center gap-2 transition-all ${
                      activeTab === "file"
                        ? "bg-[#252a36] text-white border border-[#3d4455]"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <UploadCloud className="w-4 h-4 text-teal-400" /> Excel / CSV File (.xlsx, .csv)
                  </button>
                  <button
                    onClick={() => setActiveTab("sheets")}
                    className={`py-2 rounded-lg flex items-center justify-center gap-2 transition-all ${
                      activeTab === "sheets"
                        ? "bg-[#252a36] text-white border border-[#3d4455]"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <Link2 className="w-4 h-4 text-blue-400" /> Google Sheets Backend URL
                  </button>
                </div>

                {activeTab === "file" ? (
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-[#2d323f] hover:border-teal-500/50 bg-[#14171d] hover:bg-[#181b21] rounded-2xl p-8 text-center cursor-pointer transition-all group"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx, .xls, .csv"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleFileUpload(e.target.files[0]);
                        }
                      }}
                    />
                    <div className="w-12 h-12 rounded-xl bg-[#252a36] text-teal-400 mx-auto flex items-center justify-center mb-3 group-hover:scale-105 transition-transform border border-[#3d4455]">
                      <UploadCloud className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-bold text-white">
                      Drop your Excel (.xlsx) or CSV file here, or browse
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Supports standard multi-column prospect spreadsheets up to 25MB
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 bg-[#14171d] p-5 rounded-2xl border border-[#2d323f]">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Google Sheets Link or Sheet ID
                      </label>
                      <div className="relative">
                        <Link2 className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                        <input
                          type="url"
                          placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5.../edit"
                          value={googleSheetsUrl}
                          onChange={(e) => setGoogleSheetsUrl(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 bg-[#121418] border border-[#2d323f] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
                        />
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Ensure the Google Sheet is shared with "Anyone with the link can view".
                      </p>
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={handleConnectGoogleSheets}
                        disabled={isProcessing || !googleSheetsUrl}
                        className="px-4 py-2 bg-[#252a36] hover:bg-[#2f3544] border border-[#3d4455] text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all disabled:opacity-50"
                      >
                        <Database className="w-3.5 h-3.5 text-teal-400" />
                        {isProcessing ? "Connecting to Google Sheet..." : "Sync from Google Sheet"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Helpful Utilities & Presets */}
                <div className="flex items-center justify-between pt-2">
                  <button
                    onClick={handleDownloadTemplate}
                    className="text-xs text-slate-400 hover:text-teal-300 flex items-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-teal-400" /> Download Sample .XLSX Template
                  </button>

                  <button
                    onClick={handleLoadDemoDataset}
                    className="text-xs text-teal-400 hover:text-teal-300 font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Load Pre-populated Leads Dataset
                  </button>
                </div>
              </>
            )}

            {/* Error banner */}
            {parseError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                <span>{parseError}</span>
              </div>
            )}

            {/* Column Mapping Section (When rows parsed) */}
            {parsedRows.length > 0 && (
              <div className="space-y-5 animate-in fade-in">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <Layers className="w-4 h-4 text-teal-400" />
                      Map Spreadsheet Columns ({parsedRows.length} rows detected)
                    </h4>
                    <p className="text-xs text-slate-400">
                      Verify how each spreadsheet column corresponds to CRM Lead fields
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setParsedRows([]);
                      setHeaders([]);
                    }}
                    className="text-xs text-slate-400 hover:text-slate-200 underline"
                  >
                    Change File
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-[#14171d] rounded-xl border border-[#2d323f]">
                  {[
                    { key: "name", label: "Lead Name *", required: true },
                    { key: "company", label: "Company Name *", required: true },
                    { key: "email", label: "Email Address" },
                    { key: "phone", label: "Phone Number" },
                    { key: "value", label: "Estimated Value ($)" },
                    { key: "status", label: "Lead Status" },
                    { key: "salesperson", label: "Assigned Rep" },
                    { key: "source", label: "Lead Source" },
                  ].map((field) => (
                    <div key={field.key} className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
                        <span>{field.label}</span>
                        {columnMap[field.key] && (
                          <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-0.5">
                            <CheckCircle2 className="w-3 h-3" /> Mapped
                          </span>
                        )}
                      </label>
                      <select
                        value={columnMap[field.key] || ""}
                        onChange={(e) =>
                          setColumnMap((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                        className="w-full px-2.5 py-1.5 bg-[#121418] border border-[#2d323f] rounded-lg text-xs text-white focus:outline-none focus:border-teal-500"
                      >
                        <option value="">-- Ignore / Unmapped --</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h} (Preview: {String(parsedRows[0]?.[h] || "").slice(0, 20)})
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                {/* Data Preview Table (First 4 rows) */}
                <div className="space-y-2">
                  <h5 className="text-xs font-semibold text-slate-300">
                    Preview First {Math.min(4, parsedRows.length)} Records
                  </h5>
                  <div className="border border-[#2d323f] rounded-xl overflow-x-auto custom-scrollbar bg-[#14171d]">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-[#2d323f] bg-[#121418] text-slate-400">
                          <th className="p-2.5 font-semibold">Lead Name</th>
                          <th className="p-2.5 font-semibold">Company</th>
                          <th className="p-2.5 font-semibold">Email</th>
                          <th className="p-2.5 font-semibold">Value</th>
                          <th className="p-2.5 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#242935]">
                        {parsedRows.slice(0, 4).map((row, idx) => (
                          <tr key={idx} className="hover:bg-[#1f232c]/50">
                            <td className="p-2.5 font-bold text-white">
                              {columnMap.name ? row[columnMap.name] : "--"}
                            </td>
                            <td className="p-2.5 text-slate-300">
                              {columnMap.company ? row[columnMap.company] : "--"}
                            </td>
                            <td className="p-2.5 font-mono text-slate-400 text-[11px]">
                              {columnMap.email ? row[columnMap.email] : "--"}
                            </td>
                            <td className="p-2.5 font-mono text-teal-300 font-semibold">
                              ${columnMap.value ? Number(row[columnMap.value] || 0).toLocaleString() : "0"}
                            </td>
                            <td className="p-2.5 text-slate-400">
                              {columnMap.status ? row[columnMap.status] : "New"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Submit Action */}
                <div className="pt-2 flex items-center justify-end gap-3 border-t border-[#2d323f]">
                  <button
                    onClick={() => {
                      setParsedRows([]);
                      setHeaders([]);
                    }}
                    className="px-4 py-2 bg-[#252a36] hover:bg-[#2f3544] border border-[#3d4455] rounded-xl text-xs font-semibold text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    id="btn-confirm-import-leads"
                    onClick={handleExecuteImport}
                    className="px-6 py-2.5 bg-[#252a36] hover:bg-[#2f3544] border border-[#3d4455] text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-2 transition-all"
                  >
                    <ArrowRight className="w-4 h-4 text-teal-400" />
                    Confirm & Import {parsedRows.length} Leads
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
