"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated, getUser, clearAuth } from "@/lib/auth";
import type { StoredUser } from "@/lib/auth";
import { notesApi, usersApi } from "@/lib/api";
import {
  Loader2,
  CheckCircle,
  AlertCircle,
  Save,
  ShieldAlert,
  Trash2,
  Download,
  Upload,
} from "lucide-react";

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);

  // Auth Redirect & Load User
  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
    } else {
      setUser(getUser());
    }
  }, [router]);

  // ── Existing Settings Logic: AI settings ────────────────────────────────────
  const [aiFormat, setAiFormat] = useState<"paragraph" | "bullets" | "actions">("paragraph");
  const [aiExtractAlerts, setAiExtractAlerts] = useState(true);
  const [aiSuccess, setAiSuccess] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedFormat = localStorage.getItem("luminote_ai_format");
      if (storedFormat === "paragraph" || storedFormat === "bullets" || storedFormat === "actions") {
        setAiFormat(storedFormat);
      }
      const storedExtract = localStorage.getItem("luminote_ai_extract_alerts");
      if (storedExtract !== null) {
        setAiExtractAlerts(storedExtract !== "false");
      }
    }
  }, []);

  const handleSaveAiSettings = () => {
    localStorage.setItem("luminote_ai_format", aiFormat);
    localStorage.setItem("luminote_ai_extract_alerts", String(aiExtractAlerts));
    setAiSuccess(true);
    setTimeout(() => setAiSuccess(false), 2000);
  };

  // ── Existing Settings Logic: Backups ────────────────────────────────────────
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [wipeConfirmInput, setWipeConfirmInput] = useState("");
  const [wiping, setWiping] = useState(false);
  const [wipeError, setWipeError] = useState<string | null>(null);
  const [wipeSuccess, setWipeSuccess] = useState<string | null>(null);

  const handleExportData = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const res = await notesApi.list();
      const notes = res.data;
      const dataStr = JSON.stringify(notes, null, 2);
      const dataBlob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `luminote_backup_${new Date().toISOString().split("T")[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("Failed to export notes.");
    } finally {
      setExporting(false);
    }
  };

  const handleImportData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportError(null);
    setImportSuccess(null);
    setImportProgress("Reading backup file...");

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target?.result as string;
        const notes = JSON.parse(text);

        if (!Array.isArray(notes)) {
          throw new Error("Invalid backup format. Expected an array of notes.");
        }

        const total = notes.length;
        if (total === 0) {
          setImportSuccess("Backup file has 0 notes. Nothing to import.");
          setImporting(false);
          return;
        }

        let count = 0;
        for (const item of notes) {
          try {
            await notesApi.create({
              title: item.title || "Imported Note",
              content: item.content || "",
            });
            count++;
            setImportProgress(`Importing notes: ${count} of ${total} complete...`);
          } catch (createErr) {
            console.error("Failed to create note during import", createErr);
          }
        }
        setImportSuccess(`Successfully imported ${count} notes.`);
      } catch (err: any) {
        setImportError(err.message || "Failed to parse backup JSON file.");
      } finally {
        setImporting(false);
        setImportProgress("");
        e.target.value = "";
      }
    };
    reader.onerror = () => {
      setImportError("Failed to read the file.");
      setImporting(false);
    };
    reader.readAsText(file);
  };

  const handleWipeNotes = async () => {
    if (wipeConfirmInput !== "DELETE ALL NOTES") {
      setWipeError("Please type DELETE ALL NOTES to confirm.");
      return;
    }

    setWiping(true);
    setWipeError(null);
    setWipeSuccess(null);

    try {
      const res = await notesApi.list();
      const notes = res.data;
      const total = notes.length;

      if (total === 0) {
        setWipeSuccess("No notes to delete.");
        setWiping(false);
        setWipeConfirmInput("");
        return;
      }

      let count = 0;
      await Promise.all(
        notes.map(async (n) => {
          try {
            await notesApi.delete(n.id);
            count++;
          } catch (deleteErr) {
            console.error("Failed to delete note during wipe", deleteErr);
          }
        })
      );
      setWipeSuccess(`Successfully deleted all ${count} notes.`);
      setWipeConfirmInput("");
    } catch {
      setWipeError("An error occurred during note deletion.");
    } finally {
      setWiping(false);
    }
  };

  // ── Feature 4: Danger Zone ──────────────────────────────────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDeleteAccount = async () => {
    if (deleteConfirmInput !== "DELETE") {
      setDeleteError("Confirmation text must match DELETE exactly.");
      return;
    }

    setDeletingAccount(true);
    setDeleteError(null);

    try {
      await usersApi.deleteMe();
      clearAuth();
      router.push("/");
    } catch (err: any) {
      setDeleteError(err.response?.data?.detail || "Failed to delete account. Please try again.");
      setDeletingAccount(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#030303]">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 animate-slide-up">
      <div className="mb-8 border-b border-white/[0.06] pb-5">
        <h1 className="text-3xl font-bold text-gradient">Settings</h1>
        <p className="text-gray-500 text-sm mt-1">Configure your workspace preferences and backups</p>
      </div>

      <div className="flex flex-col gap-8">
        {/* ── WORKSPACE PREFERENCES / AI SETTINGS SECTION ──────────────────── */}
        <section className="glass p-6 flex flex-col gap-6">
          <h2 className="text-xl font-bold text-neutral-200 border-b border-white/[0.04] pb-2">Workspace Preferences</h2>
          
          <div className="flex flex-col gap-6">
            <div>
              <h3 className="text-sm font-bold text-neutral-300 uppercase tracking-wider">AI Summary Format</h3>
              <p className="text-xs text-gray-500 mt-1">Select the default format used when generating automatic summaries.</p>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                {(["paragraph", "bullets", "actions"] as const).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => setAiFormat(fmt)}
                    className={`flex flex-col items-start gap-1.5 p-4 rounded-xl border transition-all text-left
                      ${aiFormat === fmt
                        ? "bg-brand-500/10 border-brand-500 text-white"
                        : "bg-neutral-900 border-white/[0.04] text-neutral-400 hover:border-white/[0.08] hover:bg-neutral-900/60"
                      }`}
                  >
                    <span className="font-semibold text-sm capitalize">
                      {fmt === "paragraph" ? "Paragraph" : fmt === "bullets" ? "Bullet Points" : "Action items"}
                    </span>
                    <span className="text-[10px] text-gray-500">
                      {fmt === "paragraph" && "A clean, textual overview summarizing core ideas."}
                      {fmt === "bullets" && "Key insights broken down into scanable bullet list."}
                      {fmt === "actions" && "Actionable items, tasks, and follow-ups extracted."}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="h-px bg-white/[0.06]" />

            <div className="flex items-center justify-between py-2">
              <div>
                <h3 className="text-sm font-bold text-neutral-300 uppercase tracking-wider">Extract alerts</h3>
                <p className="text-xs text-gray-500 mt-1">Extract dates/reminders automatically and show them in your calendar.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={aiExtractAlerts}
                  onChange={(e) => setAiExtractAlerts(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-neutral-900 rounded-full peer peer-focus:ring-0 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-neutral-500 after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500 peer-checked:after:bg-white peer-checked:after:border-brand-500 border border-white/[0.06]" />
              </label>
            </div>

            <div className="h-px bg-white/[0.06]" />

            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveAiSettings}
                className="btn-primary flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                Save Preferences
              </button>
              {aiSuccess && (
                <span className="text-xs text-emerald-400 flex items-center gap-1 animate-fade-in">
                  <CheckCircle className="w-3.5 h-3.5" /> Preferences saved!
                </span>
              )}
            </div>
          </div>
        </section>

        {/* ── BACKUP & DATA SECTION ────────────────────────────────────────── */ }
        <section className="glass p-6 flex flex-col gap-6">
          <h2 className="text-xl font-bold text-neutral-200 border-b border-white/[0.04] pb-2">Backup & Data</h2>

          <div className="flex flex-col gap-6">
            <div>
              <h3 className="text-sm font-bold text-neutral-300 uppercase tracking-wider">Export Notes</h3>
              <p className="text-xs text-gray-500 mt-1">Download all your notes as a JSON backup file to store locally.</p>
              
              {exportError && <div className="text-xs text-red-400 mt-2">{exportError}</div>}
              
              <button
                onClick={handleExportData}
                disabled={exporting}
                className="btn-secondary mt-4 flex items-center gap-2"
              >
                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Export Notes Backup (.json)
              </button>
            </div>

            <div className="h-px bg-white/[0.06]" />

            <div>
              <h3 className="text-sm font-bold text-neutral-300 uppercase tracking-wider">Import Notes</h3>
              <p className="text-xs text-gray-500 mt-1">Upload a previously exported JSON backup file to restore your notes.</p>
              
              {importError && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm mt-3">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {importError}
                </div>
              )}

              {importSuccess && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm mt-3">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  {importSuccess}
                </div>
              )}

              <div className="mt-4 relative group cursor-pointer border border-dashed border-white/10 hover:border-brand-500/40 hover:bg-neutral-900/40 rounded-xl p-6 transition-all text-center flex flex-col items-center justify-center">
                {importing ? (
                  <>
                    <Loader2 className="w-8 h-8 text-brand-500 animate-spin mb-2" />
                    <span className="text-xs text-neutral-400 font-medium">{importProgress}</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-neutral-500 group-hover:text-brand-300 transition-colors mb-2" />
                    <span className="text-xs text-neutral-300 font-medium">Click to select backup file</span>
                    <span className="text-[10px] text-gray-500 mt-1">Support JSON format only</span>
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleImportData}
                      disabled={importing}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </>
                )}
              </div>
            </div>

            <div className="h-px bg-white/[0.06]" />

            <div className="p-4 rounded-xl bg-red-950/10 border border-red-900/20">
              <h3 className="text-sm font-bold text-red-400 flex items-center gap-2">
                <Trash2 className="w-4 h-4" /> Wipe Notes
              </h3>
              <p className="text-xs text-gray-500 mt-1">This will permanently delete ALL notes and reminders in your workspace. This action cannot be undone.</p>
              
              {wipeError && (
                <div className="text-xs text-red-400 mt-2 font-semibold">{wipeError}</div>
              )}
              {wipeSuccess && (
                <div className="text-xs text-emerald-400 mt-2 font-semibold">{wipeSuccess}</div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 mt-4">
                <input
                  type="text"
                  placeholder="Type DELETE ALL NOTES to confirm"
                  className="input max-w-xs !py-2 border-red-900/20"
                  value={wipeConfirmInput}
                  onChange={(e) => setWipeConfirmInput(e.target.value)}
                />
                <button
                  onClick={handleWipeNotes}
                  disabled={wiping}
                  className="btn-danger !py-2"
                >
                  {wiping && <Loader2 className="w-4 h-4 animate-spin" />}
                  Wipe All Notes
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ── DANGER ZONE ───────────────────────────────────────────────────── */}
        <section className="glass p-6 border-red-950/50 bg-red-950/[0.02]">
          <h2 className="text-xl font-bold text-red-400 border-b border-red-900/20 pb-2 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 animate-pulse" /> Danger Zone
          </h2>
          <p className="text-xs text-gray-400 mt-3 leading-relaxed">
            Deleting your account will permanently wipe all notes, audio records, canvas drawings, and calendars from our database. This action is final and cannot be reversed.
          </p>
          
          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            className="btn-danger mt-5 inline-flex items-center gap-2 bg-transparent hover:bg-red-950/40 text-red-400 border border-red-500/20 font-semibold text-xs py-2 px-6 rounded-lg hover:border-red-500/40 shadow-sm"
          >
            <Trash2 className="w-4 h-4" />
            Delete Account
          </button>
        </section>
      </div>

      {/* ── Danger Zone Confirmation Modal ────────────────────────────────── */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-surface-900 border border-border-muted rounded-2xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4">
            <h3 className="text-lg font-bold text-red-400 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 animate-pulse" /> Confirm Account Deletion
            </h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              This action is final and will completely wipe all of your data. To proceed, please type <span className="font-mono text-white font-bold">DELETE</span> in the field below.
            </p>
            
            <div className="flex flex-col gap-2 mt-2">
              <label className="text-xs font-semibold text-neutral-400">
                Type DELETE to confirm:
              </label>
              <input
                type="text"
                placeholder="Type DELETE"
                className="input"
                value={deleteConfirmInput}
                onChange={(e) => setDeleteConfirmInput(e.target.value)}
              />
            </div>

            {deleteError && (
              <div className="text-xs text-red-400 font-semibold">{deleteError}</div>
            )}

            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmInput("");
                  setDeleteError(null);
                }}
                className="btn-secondary px-4 py-2 text-xs"
                disabled={deletingAccount}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirmInput !== "DELETE" || deletingAccount}
                className="btn-danger px-4 py-2 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deletingAccount ? "Deleting..." : "Permanently Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
