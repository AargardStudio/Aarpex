import React, { useState, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import { useCRM } from "../../context/CRMContext";

// Generalizes the column-mapping Excel/Google Sheets importer that used to
// exist only for Leads (see LeadImportModal.tsx, still Lead-only) to
// Contacts, Companies, and Deals -- same wizard, same "map each spreadsheet
// column to a CRM field" step, plus a mode toggle Lead import doesn't have:
// "Create new records" (the original behavior) or "Update existing records"
// (a data-alteration pass -- rows are matched against existing records by
// one key field, and only the columns you mapped are applied as updates).
export type ImportableEntity = "contact" | "company" | "deal";

interface FieldDef {
  key: string;
  label: string;
  required?: boolean;
}

interface EntityConfig {
  label: string;
  matchField: string;
  matchLabel: string;
  fields: FieldDef[];
  templateHeaders: string[];
  templateRow: (string | number)[];
}

const CONFIGS: Record<ImportableEntity, EntityConfig> = {
  contact: {
    label: "Contacts",
    matchField: "email",
    matchLabel: "Email Address",
    fields: [
      { key: "firstName", label: "First Name", required: true },
      { key: "lastName", label: "Last Name" },
      { key: "company", label: "Company Name", required: true },
      { key: "email", label: "Email Address" },
      { key: "phone", label: "Phone Number" },
      { key: "position", label: "Job Title" },
      { key: "status", label: "Status" },
      { key: "salesperson", label: "Assigned Rep" },
    ],
    templateHeaders: ["First Name", "Last Name", "Company", "Email", "Phone", "Job Title", "Status", "Assigned Rep"],
    templateRow: ["Jane", "Doe", "Acme Corporation", "jane.doe@acme.com", "+1 (555) 019-2831", "VP Operations", "Active", "Alex Rivera"],
  },
  company: {
    label: "Companies",
    matchField: "name",
    matchLabel: "Company Name",
    fields: [
      { key: "name", label: "Company Name", required: true },
      { key: "industry", label: "Industry" },
      { key: "website", label: "Website" },
      { key: "email", label: "Email Address" },
      { key: "phone", label: "Phone Number" },
      { key: "country", label: "Country" },
      { key: "city", label: "City" },
      { key: "status", label: "Status" },
      { key: "salesperson", label: "Assigned Rep" },
    ],
    templateHeaders: ["Company", "Industry", "Website", "Email", "Phone", "Country", "City", "Status", "Assigned Rep"],
    templateRow: ["Nexus Analytics", "Technology / SaaS", "nexus.io", "hello@nexus.io", "+1 (555) 882-9944", "United States", "Austin", "Qualified Prospect", "Sarah Jenkins"],
  },
  deal: {
    label: "Deals",
    matchField: "name",
    matchLabel: "Deal Name",
    fields: [
      { key: "name", label: "Deal Name", required: true },
      { key: "company", label: "Company Name", required: true },
      { key: "value", label: "Deal Value ($)" },
      { key: "currency", label: "Currency" },
      { key: "priority", label: "Priority" },
      { key: "expectedCloseDate", label: "Expected Close Date" },
      { key: "productService", label: "Product/Service" },
      { key: "salesperson", label: "Assigned Rep" },
    ],
    templateHeaders: ["Deal Name", "Company", "Value", "Currency", "Priority", "Expected Close Date", "Product/Service", "Assigned Rep"],
    templateRow: ["Acme — Annual Renewal", "Acme Corporation", "45000", "USD", "High", "2026-12-01", "Growth Plan", "Alex Rivera"],
  },
};

interface EntityImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  entity: ImportableEntity;
}

export const EntityImportModal: React.FC<EntityImportModalProps> = ({ isOpen, onClose, entity }) => {
  const {
    currentUser,
    companies,
    contacts,
    deals,
    pipelines,
    addCompany,
    addContact,
    updateContact,
    addDeal,
    updateDeal,
    updateCompany,
    pendingBulkImport,
    setPendingBulkImport,
  } = useCRM();

  const config = CONFIGS[entity];

  const [activeTab, setActiveTab] = useState<"file" | "sheets">("file");
  const [googleSheetsUrl, setGoogleSheetsUrl] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<"create" | "update">("create");
  const [summary, setSummary] = useState<{ created: number; updated: number; skipped: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reset per-entity column map whenever the modal is opened for a
  // different entity (each has its own field set).
  useEffect(() => {
    if (isOpen) {
      setColumnMap({});
      setSummary(null);
      setParseError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, entity]);

  // Cross-view handoff from the File Manager's "Use for bulk update" action
  // -- if a pending import targets this exact entity, consume it once the
  // modal is open rather than asking the user to re-upload the same file.
  useEffect(() => {
    if (isOpen && pendingBulkImport && pendingBulkImport.entity === entity) {
      setHeaders(pendingBulkImport.headers);
      setParsedRows(pendingBulkImport.rows);
      setMode("update");
      autoMapHeaders(pendingBulkImport.headers);
      setPendingBulkImport(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, pendingBulkImport, entity]);

  if (!isOpen) return null;

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
      const tryMap = (key: string, ...tests: string[]) => {
        if (!map[key] && tests.some((t) => lower.includes(t))) map[key] = h;
      };
      tryMap("firstName", "first name", "firstname");
      tryMap("lastName", "last name", "lastname", "surname");
      tryMap("name", "name", "title");
      tryMap("company", "company", "organization", "account");
      tryMap("email", "email", "mail");
      tryMap("phone", "phone", "mobile", "tel");
      tryMap("position", "job title", "position", "role", "title");
      tryMap("industry", "industry", "sector");
      tryMap("website", "website", "domain", "url");
      tryMap("country", "country");
      tryMap("city", "city");
      tryMap("status", "status", "stage");
      tryMap("salesperson", "sales", "rep", "owner", "assignee");
      tryMap("value", "value", "amount", "deal", "budget", "revenue");
      tryMap("currency", "currency");
      tryMap("priority", "priority");
      tryMap("expectedCloseDate", "close date", "expected close");
      tryMap("productService", "product", "service");
    });
    setColumnMap((prev) => ({ ...prev, ...map }));
  };

  const handleFileUpload = (uploadedFile: File) => {
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

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) handleFileUpload(e.target.files[0]);
    if (e.target) e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFileUpload(e.dataTransfer.files[0]);
  };

  const handleConnectGoogleSheets = async () => {
    if (!googleSheetsUrl.trim()) return;
    setIsProcessing(true);
    setParseError(null);
    try {
      let fetchUrl = googleSheetsUrl.trim();
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
      if (!json || json.length === 0) throw new Error("No data found in the connected Google Sheet.");
      setHeaders(detectedHeaders);
      setParsedRows(json);
      autoMapHeaders(detectedHeaders);
      setIsProcessing(false);
    } catch (err: any) {
      setParseError(`Unable to fetch directly from Google Sheets: ${err?.message || "Check permissions"}. Tip: In Google Sheets, click File -> Download -> Microsoft Excel (.xlsx) and drag it into the file upload tab.`);
      setIsProcessing(false);
    }
  };

  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([config.templateHeaders, config.templateRow]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${config.label}_Import_Template`);
    XLSX.writeFile(wb, `AarPex_${config.label}_Import_Template.xlsx`);
  };

  const resolveCompanyByName = (name: string) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return null;
    const existing = companies.find((c) => c.name.trim().toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing;
    return addCompany({
      name: trimmed,
      industry: "General",
      website: "",
      country: "",
      city: "",
      address: "",
      phone: "",
      email: "",
      salesperson: currentUser.name,
      status: "Prospect",
      customerValue: 0,
      notes: `Auto-created during ${config.label} import.`,
      tags: ["Auto-Created", "From Import"],
    } as any);
  };

  const handleExecuteImport = () => {
    const requiredMissing = config.fields.filter((f) => f.required && !columnMap[f.key]);
    if (requiredMissing.length > 0) {
      setParseError(`Please map at least: ${requiredMissing.map((f) => f.label).join(", ")}.`);
      return;
    }
    if (mode === "update" && !columnMap[config.matchField]) {
      setParseError(`Update mode needs a "${config.matchLabel}" column mapped, to match rows against existing records.`);
      return;
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of parsedRows) {
      const get = (key: string) => (columnMap[key] ? String(row[columnMap[key]] ?? "").trim() : "");

      if (entity === "contact") {
        const matchVal = get("email").toLowerCase();
        if (mode === "update") {
          const target = contacts.find((c) => c.email.trim().toLowerCase() === matchVal);
          if (!target || !matchVal) { skipped++; continue; }
          const updates: Record<string, any> = {};
          if (columnMap.firstName) updates.firstName = get("firstName") || target.firstName;
          if (columnMap.lastName) updates.lastName = get("lastName");
          if (columnMap.phone) updates.phone = get("phone");
          if (columnMap.position) updates.position = get("position");
          if (columnMap.status) updates.status = get("status") || target.status;
          updateContact(target.id, updates);
          updated++;
        } else {
          const company = resolveCompanyByName(get("company"));
          if (!company) { skipped++; continue; }
          addContact({
            firstName: get("firstName") || "New",
            lastName: get("lastName") || "",
            companyId: company.id,
            position: get("position") || "",
            email: get("email"),
            phone: get("phone") || "",
            salesperson: get("salesperson") || currentUser.name,
            status: get("status") || "Active",
            leadSource: "Spreadsheet Import",
            notes: "Imported from spreadsheet.",
            country: "",
            city: "",
            tags: [],
          });
          created++;
        }
      }

      if (entity === "company") {
        const matchVal = get("name").toLowerCase();
        if (mode === "update") {
          const target = companies.find((c) => c.name.trim().toLowerCase() === matchVal);
          if (!target || !matchVal) { skipped++; continue; }
          const updates: Record<string, any> = {};
          if (columnMap.industry) updates.industry = get("industry") || target.industry;
          if (columnMap.website) updates.website = get("website");
          if (columnMap.email) updates.email = get("email");
          if (columnMap.phone) updates.phone = get("phone");
          if (columnMap.country) updates.country = get("country");
          if (columnMap.city) updates.city = get("city");
          if (columnMap.status) updates.status = get("status") || target.status;
          updateCompany(target.id, updates);
          updated++;
        } else {
          if (!get("name")) { skipped++; continue; }
          addCompany({
            name: get("name"),
            industry: get("industry") || "General",
            website: get("website") || "",
            country: get("country") || "",
            city: get("city") || "",
            address: "",
            phone: get("phone") || "",
            email: get("email") || "",
            salesperson: get("salesperson") || currentUser.name,
            status: (get("status") as any) || "Qualified Prospect",
            customerValue: 0,
            notes: "Imported from spreadsheet.",
            tags: [],
          } as any);
          created++;
        }
      }

      if (entity === "deal") {
        const matchVal = get("name").toLowerCase();
        if (mode === "update") {
          const target = deals.find((d) => d.name.trim().toLowerCase() === matchVal);
          if (!target || !matchVal) { skipped++; continue; }
          const updates: Record<string, any> = {};
          if (columnMap.value) {
            const raw = get("value");
            const num = parseFloat(raw.replace(/[^0-9.-]+/g, ""));
            if (!Number.isNaN(num)) updates.dealValue = num;
          }
          if (columnMap.currency) updates.currency = get("currency");
          if (columnMap.priority) updates.priority = get("priority") || target.priority;
          if (columnMap.expectedCloseDate) updates.expectedCloseDate = get("expectedCloseDate") || target.expectedCloseDate;
          if (columnMap.productService) updates.productService = get("productService");
          updateDeal(target.id, updates);
          updated++;
        } else {
          const company = resolveCompanyByName(get("company"));
          if (!company) { skipped++; continue; }
          const defaultPipeline = pipelines.find((p) => p.isDefault) || pipelines[0];
          const defaultStage = defaultPipeline?.stages?.[0];
          if (!defaultPipeline || !defaultStage) { skipped++; continue; }
          const rawVal = get("value");
          const dealValue = parseFloat(rawVal.replace(/[^0-9.-]+/g, "")) || 0;
          addDeal({
            name: get("name") || `${company.name} Deal`,
            companyId: company.id,
            salesperson: get("salesperson") || currentUser.name,
            pipelineId: defaultPipeline.id,
            stageId: defaultStage.id,
            dealValue,
            currency: get("currency") || "USD",
            probability: defaultStage.probability,
            expectedCloseDate: get("expectedCloseDate") || new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
            productService: get("productService") || "",
            source: "Spreadsheet Import",
            priority: (get("priority") as any) || "Medium",
            status: "Open",
            notes: "Imported from spreadsheet.",
            lastActivity: new Date().toISOString().split("T")[0],
            nextActivity: "Follow up",
          });
          created++;
        }
      }
    }

    setSummary({ created, updated, skipped });
  };

  const resetWizard = () => {
    setParsedRows([]);
    setHeaders([]);
    setColumnMap({});
    setSummary(null);
    setParseError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-3xl bg-[#181b21] border border-[#2d323f] rounded-2xl shadow-2xl overflow-hidden text-slate-100 flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-[#2d323f] flex items-center justify-between bg-[#14171d] shrink-0">
          <div>
            <h2 className="text-base font-bold text-white">Import {config.label} from Excel or Google Sheets</h2>
            <p className="text-xs text-slate-400">
              {mode === "create"
                ? `Create new ${config.label.toLowerCase()} with automated column mapping`
                : `Update existing ${config.label.toLowerCase()} -- matched by ${config.matchLabel}`}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#252a36] transition-colors">
            ✕
          </button>
        </div>

        {summary ? (
          <div className="p-10 text-center space-y-4 my-auto">
            <h3 className="text-lg font-bold text-white">Import Complete</h3>
            <p className="text-xs text-slate-400">
              {summary.created > 0 && <>Created {summary.created} new {config.label.toLowerCase()}. </>}
              {summary.updated > 0 && <>Updated {summary.updated} existing {config.label.toLowerCase()}. </>}
              {summary.skipped > 0 && <>Skipped {summary.skipped} row(s) with no match or missing data.</>}
            </p>
            <div className="pt-2 flex justify-center gap-3">
              <button onClick={resetWizard} className="px-4 py-2 bg-[#252a36] hover:bg-[#2f3544] border border-[#3d4455] rounded-xl text-xs font-semibold text-slate-200">
                Import Another File
              </button>
              <button onClick={onClose} className="px-5 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-bold shadow-md">
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-5">
            {parsedRows.length === 0 && (
              <>
                <div className="grid grid-cols-2 p-1 bg-[#121418] rounded-xl border border-[#2d323f] text-xs font-semibold">
                  <button
                    onClick={() => setActiveTab("file")}
                    className={`py-2 rounded-lg transition-all ${activeTab === "file" ? "bg-[#252a36] text-white border border-[#3d4455]" : "text-slate-400 hover:text-slate-200"}`}
                  >
                    Excel / CSV File
                  </button>
                  <button
                    onClick={() => setActiveTab("sheets")}
                    className={`py-2 rounded-lg transition-all ${activeTab === "sheets" ? "bg-[#252a36] text-white border border-[#3d4455]" : "text-slate-400 hover:text-slate-200"}`}
                  >
                    Google Sheets URL
                  </button>
                </div>

                {activeTab === "file" ? (
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-[#2d323f] hover:border-teal-500/50 bg-[#14171d] hover:bg-[#181b21] rounded-2xl p-8 text-center cursor-pointer transition-all"
                  >
                    <input ref={fileInputRef} type="file" accept=".xlsx, .xls, .csv" className="hidden" onChange={handleFileInputChange} />
                    <p className="text-sm font-bold text-white">Drop your Excel (.xlsx) or CSV file here, or browse</p>
                    <p className="text-xs text-slate-400 mt-1">Supports standard multi-column spreadsheets</p>
                  </div>
                ) : (
                  <div className="space-y-3 bg-[#14171d] p-5 rounded-2xl border border-[#2d323f]">
                    <input
                      type="url"
                      placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                      value={googleSheetsUrl}
                      onChange={(e) => setGoogleSheetsUrl(e.target.value)}
                      className="w-full px-3 py-2 bg-[#121418] border border-[#2d323f] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
                    />
                    <button
                      onClick={handleConnectGoogleSheets}
                      disabled={isProcessing || !googleSheetsUrl}
                      className="px-4 py-2 bg-[#252a36] hover:bg-[#2f3544] border border-[#3d4455] text-white rounded-xl text-xs font-bold disabled:opacity-50"
                    >
                      {isProcessing ? "Connecting..." : "Sync from Google Sheet"}
                    </button>
                  </div>
                )}

                <button onClick={handleDownloadTemplate} className="text-xs text-slate-400 hover:text-teal-300">
                  Download Sample .XLSX Template
                </button>
              </>
            )}

            {parseError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-xs">{parseError}</div>
            )}

            {parsedRows.length > 0 && (
              <div className="space-y-5 animate-in fade-in">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-white">Map Spreadsheet Columns ({parsedRows.length} rows detected)</h4>
                  <button onClick={resetWizard} className="text-xs text-slate-400 hover:text-slate-200 underline">
                    Change File
                  </button>
                </div>

                <div className="flex items-center gap-2 p-1 bg-[#121418] rounded-xl border border-[#2d323f] text-xs font-semibold w-fit">
                  <button
                    onClick={() => setMode("create")}
                    className={`px-3 py-1.5 rounded-lg transition-all ${mode === "create" ? "bg-[#252a36] text-white border border-[#3d4455]" : "text-slate-400 hover:text-slate-200"}`}
                  >
                    Create new records
                  </button>
                  <button
                    onClick={() => setMode("update")}
                    className={`px-3 py-1.5 rounded-lg transition-all ${mode === "update" ? "bg-amber-500/20 text-amber-300 border border-amber-500/40" : "text-slate-400 hover:text-slate-200"}`}
                  >
                    Update existing records
                  </button>
                </div>
                {mode === "update" && (
                  <p className="text-[11px] text-amber-300/90 bg-amber-950/20 border border-amber-800/40 rounded-lg px-3 py-2">
                    Each row is matched to an existing {config.label.toLowerCase().slice(0, -1)} by <strong>{config.matchLabel}</strong> --
                    make sure that column is mapped below. Only the fields you map are changed; unmatched rows are skipped.
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-[#14171d] rounded-xl border border-[#2d323f]">
                  {config.fields.map((field) => (
                    <div key={field.key} className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
                        <span>
                          {field.label}
                          {field.required && mode === "create" ? " *" : ""}
                          {field.key === config.matchField && mode === "update" ? " (match key)" : ""}
                        </span>
                        {columnMap[field.key] && <span className="text-[10px] text-emerald-400">Mapped</span>}
                      </label>
                      <select
                        value={columnMap[field.key] || ""}
                        onChange={(e) => setColumnMap((prev) => ({ ...prev, [field.key]: e.target.value }))}
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

                <div className="pt-2 flex items-center justify-end gap-3 border-t border-[#2d323f]">
                  <button onClick={resetWizard} className="px-4 py-2 bg-[#252a36] hover:bg-[#2f3544] border border-[#3d4455] rounded-xl text-xs font-semibold text-slate-300">
                    Cancel
                  </button>
                  <button
                    onClick={handleExecuteImport}
                    className="px-6 py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-bold shadow-md"
                  >
                    {mode === "create" ? `Confirm & Import ${parsedRows.length} ${config.label}` : `Apply Updates to ${parsedRows.length} Rows`}
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
