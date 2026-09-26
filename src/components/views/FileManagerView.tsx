import React, { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useCRM } from "../../context/CRMContext";
import { StoredFile } from "../../types";
import {
  FolderOpen,
  UploadCloud,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  FileArchive,
  Search,
  Trash2,
  Download,
  BookMarked,
  Database,
  AlertTriangle,
  X,
  Loader2,
} from "lucide-react";

const formatBytes = (bytes: number): string => {
  if (!bytes) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const iconFor = (filename: string, contentType: string) => {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (ext === "pdf" || contentType.includes("pdf")) return <FileText className="w-4 h-4 text-rose-500 shrink-0" />;
  if (["xlsx", "xls", "csv"].includes(ext) || contentType.includes("sheet") || contentType.includes("csv"))
    return <FileSpreadsheet className="w-4 h-4 text-emerald-500 shrink-0" />;
  if (["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext) || contentType.startsWith("image/"))
    return <ImageIcon className="w-4 h-4 text-sky-500 shrink-0" />;
  if (["zip", "tar", "gz", "rar", "7z"].includes(ext) || contentType.includes("zip"))
    return <FileArchive className="w-4 h-4 text-amber-500 shrink-0" />;
  return <FileText className="w-4 h-4 text-slate-400 shrink-0" />;
};

const SOURCE_LABEL: Record<StoredFile["source"], string> = {
  manual_upload: "Uploaded",
  email_attachment: "Email attachment",
  import: "Import",
  other: "Other",
};

const TEXT_EXTENSIONS = ["txt", "md", "csv", "json"];
const TABULAR_EXTENSIONS = ["xlsx", "xls", "csv"];

export const FileManagerView: React.FC = () => {
  const {
    storedFiles,
    storageUsedBytes,
    storageLimitBytes,
    uploadStoredFile,
    deleteStoredFile,
    getStoredFileUrl,
    addKnowledgeBaseEntry,
    setPendingBulkImport,
    setActiveNav,
  } = useCRM();

  const [searchTerm, setSearchTerm] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [busyFileId, setBusyFileId] = useState<string | null>(null);
  const [bulkPickerFileId, setBulkPickerFileId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const usedPct = storageLimitBytes > 0 ? Math.min(100, (storageUsedBytes / storageLimitBytes) * 100) : 0;
  const isNearLimit = usedPct >= 85;

  const filteredFiles = storedFiles.filter((f) => f.filename.toLowerCase().includes(searchTerm.toLowerCase()));

  const handleUploadFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploadError(null);
    setIsUploading(true);
    for (const file of Array.from(fileList)) {
      try {
        await uploadStoredFile(file, { source: "manual_upload" });
      } catch (err: any) {
        setUploadError(err?.message || `Couldn't upload "${file.name}".`);
        break;
      }
    }
    setIsUploading(false);
  };

  const handleDownload = async (file: StoredFile) => {
    setBusyFileId(file.id);
    try {
      const url = await getStoredFileUrl(file.id);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      else setUploadError(`Couldn't generate a download link for "${file.filename}".`);
    } finally {
      setBusyFileId(null);
    }
  };

  const handleDelete = async (file: StoredFile) => {
    setBusyFileId(file.id);
    try {
      await deleteStoredFile(file.id);
    } finally {
      setBusyFileId(null);
    }
  };

  // Text-friendly files feed their own content straight into the KB entry;
  // everything else (PDFs, images, archives) still gets a KB entry so it's
  // discoverable and linked back to the original file, just without
  // extracted body text -- full document parsing is a future step.
  const handleAddToKnowledgeBase = async (file: StoredFile) => {
    setBusyFileId(file.id);
    try {
      const ext = file.filename.split(".").pop()?.toLowerCase() || "";
      let content = `Reference file: ${file.filename} (${formatBytes(file.size)}). Open it from the File Manager for the full content.`;
      if (TEXT_EXTENSIONS.includes(ext)) {
        const url = await getStoredFileUrl(file.id);
        if (url) {
          const res = await fetch(url);
          const text = await res.text();
          content = text.length > 4000 ? `${text.slice(0, 4000)}...` : text;
        }
      }
      addKnowledgeBaseEntry({
        category: "company",
        title: file.filename,
        content,
        tags: ["From File Manager"],
        linkedFileId: file.id,
      });
      setUploadError(null);
    } catch (err: any) {
      setUploadError(`Couldn't add "${file.filename}" to the Knowledge Base.`);
    } finally {
      setBusyFileId(null);
    }
  };

  // Fetches the file's bytes back from storage, parses it as a spreadsheet,
  // and hands the parsed rows off to the matching entity view's import
  // modal via pendingBulkImport -- so a file already sitting in the File
  // Manager can be reused for a bulk create/update without re-uploading it.
  const handleUseForBulkImport = async (file: StoredFile, entity: "contact" | "company" | "deal") => {
    setBusyFileId(file.id);
    setBulkPickerFileId(null);
    try {
      const url = await getStoredFileUrl(file.id);
      if (!url) {
        setUploadError(`Couldn't read "${file.filename}" back from storage.`);
        return;
      }
      const res = await fetch(url);
      const buffer = await res.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const rows: any[] = [];
      const headerSet = new Set<string>();
      workbook.SheetNames.forEach((sheetName) => {
        const sheetRows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
        sheetRows.forEach((row) => {
          Object.keys(row).forEach((k) => headerSet.add(k));
          rows.push(row);
        });
      });
      if (rows.length === 0) {
        setUploadError(`"${file.filename}" doesn't contain any rows to import.`);
        return;
      }
      setPendingBulkImport({ entity, rows, headers: Array.from(headerSet), filename: file.filename });
      const navByEntity = { contact: "Contacts", company: "Companies", deal: "Deals" } as const;
      setActiveNav(navByEntity[entity]);
    } catch (err: any) {
      setUploadError(`Couldn't parse "${file.filename}" as a spreadsheet.`);
    } finally {
      setBusyFileId(null);
    }
  };

  const canUseForBulkImport = (file: StoredFile) => {
    const ext = file.filename.split(".").pop()?.toLowerCase() || "";
    return TABULAR_EXTENSIONS.includes(ext);
  };

  return (
    <div id="file-manager-view" className="space-y-5 animate-in fade-in duration-200">
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-indigo-500" />
            <h2 className="text-sm font-bold text-slate-900">Storage</h2>
          </div>
          <span className={`text-xs font-mono font-semibold ${isNearLimit ? "text-rose-600" : "text-slate-500"}`}>
            {formatBytes(storageUsedBytes)} / {formatBytes(storageLimitBytes)}
          </span>
        </div>
        <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${isNearLimit ? "bg-rose-500" : "bg-indigo-500"}`}
            style={{ width: `${usedPct}%` }}
          />
        </div>
        {isNearLimit && (
          <p className="text-[11px] text-rose-600 flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3" /> You're close to your plan's storage limit -- delete a few files or upgrade your plan.
          </p>
        )}
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleUploadFiles(e.dataTransfer.files); }}
        onClick={() => fileInputRef.current?.click()}
        className={`rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-all ${
          isDragging ? "border-indigo-400 bg-indigo-50" : "border-slate-200 hover:border-slate-300 bg-white"
        }`}
      >
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => { handleUploadFiles(e.target.files); if (e.target) e.target.value = ""; }} />
        <UploadCloud className={`w-7 h-7 mx-auto mb-2 ${isDragging ? "text-indigo-500" : "text-slate-400"}`} />
        <p className="text-sm font-bold text-slate-900">
          {isUploading ? "Uploading..." : "Drag & drop files here, or browse"}
        </p>
        <p className="text-xs text-slate-400 mt-1">
          Anything you upload here can also be dropped straight into the Knowledge Base or used for a bulk data update.
        </p>
      </div>

      {uploadError && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{uploadError}</span>
          <button onClick={() => setUploadError(null)} className="ml-auto text-rose-400 hover:text-rose-600">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <div className="relative w-72 max-w-full">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search files..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs"
            />
          </div>
        </div>

        {filteredFiles.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400">
            {storedFiles.length === 0 ? "No files yet -- upload one above to get started." : "No files match your search."}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredFiles.map((file) => (
              <div key={file.id} className="p-3.5 flex items-center gap-3 hover:bg-slate-50/60 transition-colors">
                {iconFor(file.filename, file.contentType)}
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-slate-900 truncate" title={file.filename}>
                    {file.filename}
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center gap-2 flex-wrap">
                    <span>{formatBytes(file.size)}</span>
                    <span>&middot;</span>
                    <span>{SOURCE_LABEL[file.source]}</span>
                    <span>&middot;</span>
                    <span>{file.uploadedBy}</span>
                    <span>&middot;</span>
                    <span>{new Date(file.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0 relative">
                  {busyFileId === file.id ? (
                    <Loader2 className="w-4 h-4 text-slate-400 animate-spin mx-2" />
                  ) : (
                    <>
                      <button
                        onClick={() => handleDownload(file)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                        title="Download"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleAddToKnowledgeBase(file)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50"
                        title="Add to Knowledge Base"
                      >
                        <BookMarked className="w-3.5 h-3.5" />
                      </button>
                      {canUseForBulkImport(file) && (
                        <button
                          onClick={() => setBulkPickerFileId(bulkPickerFileId === file.id ? null : file.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50"
                          title="Use for bulk create/update"
                        >
                          <Database className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(file)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}

                  {bulkPickerFileId === file.id && (
                    <div className="absolute right-0 top-full mt-1 z-10 bg-white border border-slate-200 rounded-lg shadow-lg py-1 w-44 text-xs">
                      <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-slate-400 font-bold">Bulk create/update</div>
                      {(["contact", "company", "deal"] as const).map((entity) => (
                        <button
                          key={entity}
                          onClick={() => handleUseForBulkImport(file, entity)}
                          className="w-full text-left px-3 py-1.5 text-slate-700 hover:bg-slate-50 capitalize"
                        >
                          {entity}s
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
