"use client";

import { useEffect, useState } from "react";
import { useAuth, useClerk, useUser } from "@clerk/nextjs";
import { notesApi, usersApi } from "@/lib/api";
import type { Note } from "@/types";
import {
  Loader2,
  CheckCircle,
  AlertCircle,
  Save,
  ShieldAlert,
  Trash2,
  Download,
  FileText,
  ListOrdered,
  CheckSquare,
  Zap,
  User as UserIcon,
  Sliders,
  Database,
  Calendar,
  Shield,
  LogOut,
  X,
  Check,
} from "lucide-react";

export default function SettingsPage() {
  const { isLoaded } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();

  const [activeSection, setActiveSection] = useState<"preferences" | "data" | "account">("preferences");

  // ── AI Preferences ────────────────────────────────────────────────────────
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
    setTimeout(() => setAiSuccess(false), 2500);
  };

  // ── Backup & Wipe Data ───────────────────────────────────────────────────
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  const [wipeConfirmInput, setWipeConfirmInput] = useState("");
  const [wiping, setWiping] = useState(false);
  const [wipeError, setWipeError] = useState<string | null>(null);
  const [wipeSuccess, setWipeSuccess] = useState<string | null>(null);

  const handleExportData = async () => {
    setExporting(true);
    setExportError(null);
    setExportSuccess(null);
    try {
      const res = await notesApi.list();
      const notes = res.data.filter((note: Note) => note.note_type === "text" || note.note_type === "checklist");
      const dataStr = JSON.stringify(notes, null, 2);
      const dataBlob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `luminote_backup_${new Date().toISOString().split("T")[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setExportSuccess(`Successfully exported ${notes.length} notes.`);
    } catch {
      setExportError("Failed to export notes backup.");
    } finally {
      setExporting(false);
    }
  };

  const handleWipeNotes = async () => {
    if (wipeConfirmInput !== "DELETE ALL NOTES") {
      setWipeError("Please type DELETE ALL NOTES exactly to confirm.");
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
        setWipeSuccess("No notes found to delete.");
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
      setWipeSuccess(`Successfully wiped all ${count} notes.`);
      setWipeConfirmInput("");
    } catch {
      setWipeError("An error occurred while deleting notes.");
    } finally {
      setWiping(false);
    }
  };

  // ── Danger Zone Account Deletion ─────────────────────────────────────────
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
      await signOut({ redirectUrl: "/" });
    } catch (err: any) {
      setDeleteError(err.response?.data?.detail || "Failed to delete account. Please try again.");
      setDeletingAccount(false);
    }
  };

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#030305]">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  const primaryEmail = user?.primaryEmailAddress?.emailAddress || "User Account";
  const fullName = user?.fullName || user?.firstName || "Luminote User";

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 sm:px-6 lg:px-8 animate-fade-in">
      {/* ── TOP HERO HEADER ──────────────────────────────────────────────── */}
      <div className="relative mb-8 p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-neutral-900/90 via-surface-900/50 to-neutral-950/90 border border-white/[0.08] shadow-2xl backdrop-blur-xl overflow-hidden">
        {/* Glow ambient background */}
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-16 w-64 h-64 bg-accent-violet/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            {user?.imageUrl ? (
              <img
                src={user.imageUrl}
                alt={fullName}
                className="w-14 h-14 rounded-2xl border-2 border-white/10 shadow-lg object-cover"
              />
            ) : (
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-accent-violet flex items-center justify-center shadow-lg text-white font-bold text-xl">
                {fullName.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">{fullName}</h1>
              </div>
              <p className="text-xs text-neutral-400 mt-1 flex items-center gap-1.5 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                {primaryEmail}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => signOut({ redirectUrl: "/" })}
            className="self-start md:self-auto px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-red-500/10 border border-white/[0.08] hover:border-red-500/30 text-xs font-semibold text-neutral-300 hover:text-red-400 transition-all flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="flex items-center gap-2 mt-8 pt-6 border-t border-white/[0.06] overflow-x-auto scrollbar-none">
          {[
            { id: "preferences", label: "Workspace & AI", icon: Sliders },
            { id: "data", label: "Export & Data", icon: Database },
            { id: "account", label: "Account Security", icon: Shield },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSection === tab.id;
            return (
              <button
                type="button"
                key={tab.id}
                onClick={() => setActiveSection(tab.id as any)}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${isActive
                    ? "bg-brand-500 text-white shadow-lg shadow-brand-500/25 border border-brand-400/40"
                    : "bg-neutral-900/60 text-neutral-400 hover:text-white hover:bg-neutral-800/60 border border-white/[0.04]"
                  }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── SECTION 1: WORKSPACE & AI PREFERENCES ───────────────────────── */}
      {activeSection === "preferences" && (
        <div className="flex flex-col gap-6 animate-slide-up">
          <section className="glass p-6 sm:p-8 rounded-3xl flex flex-col gap-8 border border-white/[0.06]">
            <div>
              <div className="flex items-center gap-2 text-brand-400 text-xs font-bold uppercase tracking-widest mb-1">
                <Zap className="w-4 h-4" />
                <span>LumiAI Preferences</span>
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">AI Summary Format</h2>
              <p className="text-xs text-neutral-400 mt-1 max-w-xl">
                Choose the default structure and format applied when generating automated summaries for your notes.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
                {[
                  {
                    id: "paragraph",
                    title: "Paragraph",
                    desc: "A clean, textual overview summarizing core ideas.",
                    icon: FileText,
                  },
                  {
                    id: "bullets",
                    title: "Bullet Points",
                    desc: "Key insights broken down into a scannable bullet list.",
                    icon: ListOrdered,
                  },
                  {
                    id: "actions",
                    title: "Action Items",
                    desc: "Actionable items, tasks, and follow-ups extracted.",
                    icon: CheckSquare,
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  const isSelected = aiFormat === item.id;
                  return (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => setAiFormat(item.id as any)}
                      className={`relative flex flex-col items-start p-5 rounded-2xl border transition-all text-left group overflow-hidden ${isSelected
                          ? "bg-brand-500/10 border-brand-500 shadow-glow text-white"
                          : "bg-neutral-900/60 border-white/[0.06] text-neutral-400 hover:border-white/[0.12] hover:bg-neutral-900"
                        }`}
                    >
                      {isSelected && (
                        <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-brand-500 flex items-center justify-center text-white">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      )}
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 transition-colors ${isSelected
                            ? "bg-brand-500/20 text-brand-300 border border-brand-500/30"
                            : "bg-white/[0.04] text-neutral-400 group-hover:text-white"
                          }`}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="font-bold text-sm text-white mb-1">{item.title}</span>
                      <span className="text-xs text-neutral-400 leading-relaxed">{item.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="h-px bg-white/[0.06]" />

            {/* Extract Alerts Toggle */}
            <div className="flex items-center justify-between gap-4 py-2">
              <div className="max-w-md">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-brand-400" />
                  <span>Extract Alerts & Reminders</span>
                </h3>
                <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                  Automatically parse dates, deadlines, and time references in your notes and sync them to your calendar.
                </p>
              </div>

              <label htmlFor="settings-ai-extract-alerts" className="relative inline-flex items-center cursor-pointer shrink-0">
                <span className="sr-only">Extract Alerts & Reminders</span>
                <input
                  id="settings-ai-extract-alerts"
                  type="checkbox"
                  checked={aiExtractAlerts}
                  onChange={(e) => setAiExtractAlerts(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-12 h-7 bg-neutral-900 rounded-full peer peer-focus:ring-0 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-neutral-500 after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500 peer-checked:after:bg-white peer-checked:after:border-brand-500 border border-white/[0.08]" />
              </label>
            </div>

            <div className="h-px bg-white/[0.06]" />

            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={handleSaveAiSettings}
                className="btn-primary py-2.5 px-6 font-bold text-xs flex items-center gap-2 shadow-lg shadow-brand-500/20"
              >
                <Save className="w-4 h-4" />
                <span>Save Preferences</span>
              </button>

              {aiSuccess && (
                <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5 animate-fade-in bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl">
                  <CheckCircle className="w-4 h-4" /> Preferences saved!
                </span>
              )}
            </div>
          </section>
        </div>
      )}

      {/* ── SECTION 2: EXPORT & DATA MANAGEMENT ────────────────────────── */}
      {activeSection === "data" && (
        <div className="flex flex-col gap-6 animate-slide-up">
          <section className="glass p-6 sm:p-8 rounded-3xl flex flex-col gap-8 border border-white/[0.06]">
            <div>
              <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-widest mb-1">
                <Database className="w-4 h-4" />
                <span>Workspace Data</span>
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">Export Notes Backup</h2>
              <p className="text-xs text-neutral-400 mt-1 max-w-xl">
                Download a full JSON archive containing all text notes, checklists, and metadata created in your workspace.
              </p>

              {exportError && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs mt-4">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{exportError}</span>
                </div>
              )}

              {exportSuccess && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs mt-4">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>{exportSuccess}</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleExportData}
                disabled={exporting}
                className="btn-secondary mt-5 py-2.5 px-5 font-bold text-xs flex items-center gap-2 border-white/[0.1] hover:bg-white/[0.06]"
              >
                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 text-indigo-400" />}
                <span>Download Workspace Backup (.json)</span>
              </button>
            </div>

            <div className="h-px bg-white/[0.06]" />

            {/* Wipe Notes Box */}
            <div className="p-6 rounded-2xl bg-red-950/20 border border-red-900/30 flex flex-col gap-4">
              <div>
                <h3 className="text-sm font-bold text-red-400 flex items-center gap-2 uppercase tracking-wider">
                  <Trash2 className="w-4 h-4" />
                  <span>Wipe All Workspace Notes</span>
                </h3>
                <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                  Permanently delete all notes, checklist items, and calendar alerts stored in this account. This action cannot be reversed.
                </p>
              </div>

              {wipeError && <div className="text-xs text-red-400 font-semibold">{wipeError}</div>}
              {wipeSuccess && <div className="text-xs text-emerald-400 font-semibold">{wipeSuccess}</div>}

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mt-1">
                <input
                  type="text"
                  placeholder="Type DELETE ALL NOTES to confirm"
                  className="input max-w-sm text-xs py-2 border-red-900/40 focus:border-red-500"
                  value={wipeConfirmInput}
                  onChange={(e) => setWipeConfirmInput(e.target.value)}
                />
                <button
                  type="button"
                  onClick={handleWipeNotes}
                  disabled={wiping || wipeConfirmInput !== "DELETE ALL NOTES"}
                  className="btn-danger py-2 px-5 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shrink-0"
                >
                  {wiping && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Wipe All Notes</span>
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ── SECTION 3: ACCOUNT & DANGER ZONE ─────────────────────────────── */}
      {activeSection === "account" && (
        <div className="flex flex-col gap-6 animate-slide-up">
          {/* User Profile Overview */}
          <section className="glass p-6 sm:p-8 rounded-3xl flex flex-col gap-6 border border-white/[0.06]">
            <div>
              <div className="flex items-center gap-2 text-brand-400 text-xs font-bold uppercase tracking-widest mb-1">
                <UserIcon className="w-4 h-4" />
                <span>Identity Details</span>
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">Account Overview</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-neutral-900/60 border border-white/[0.04] flex flex-col gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Full Name</span>
                <span className="text-sm font-semibold text-white">{fullName}</span>
              </div>
              <div className="p-4 rounded-2xl bg-neutral-900/60 border border-white/[0.04] flex flex-col gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Email Address</span>
                <span className="text-sm font-semibold text-white truncate">{primaryEmail}</span>
              </div>
            </div>
          </section>

          {/* Danger Zone */}
          <section className="glass p-6 sm:p-8 rounded-3xl flex flex-col gap-6 border border-red-950/40 bg-red-950/[0.03]">
            <div>
              <div className="flex items-center gap-2 text-red-400 text-xs font-bold uppercase tracking-widest mb-1">
                <ShieldAlert className="w-4 h-4 animate-pulse" />
                <span>Critical Actions</span>
              </div>
              <h2 className="text-xl font-bold text-red-400 tracking-tight">Danger Zone</h2>
              <p className="text-xs text-neutral-400 mt-1 max-w-xl leading-relaxed">
                Permanently delete your account and remove all personal notes, transcripts, audio recordings, and calendar entries from database servers.
              </p>
            </div>

            <div>
              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                className="btn-danger py-2.5 px-6 font-bold text-xs inline-flex items-center gap-2 border-red-500/30 hover:border-red-500/60 shadow-lg shadow-red-950/50"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Account Permanently</span>
              </button>
            </div>
          </section>
        </div>
      )}

      {/* ── Danger Zone Account Deletion Confirmation Modal ──────────────── */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
          <div className="bg-[#0b0b10] border border-red-500/30 rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl flex flex-col gap-5 relative">
            <button
              type="button"
              onClick={() => {
                setShowDeleteModal(false);
                setDeleteConfirmInput("");
                setDeleteError(null);
              }}
              className="absolute top-5 right-5 p-1 text-neutral-400 hover:text-white rounded-lg hover:bg-white/[0.05] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
              <ShieldAlert className="w-6 h-6 animate-pulse" />
            </div>

            <div>
              <h3 className="text-lg font-extrabold text-white">Confirm Account Deletion</h3>
              <p className="text-xs text-neutral-400 leading-relaxed mt-1.5">
                This action is final and will completely wipe all of your data. To proceed, please type <span className="font-mono text-red-400 font-bold">DELETE</span> in the field below.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="settings-confirm-delete-input" className="text-xs font-bold text-neutral-300">
                Type DELETE to confirm:
              </label>
              <input
                id="settings-confirm-delete-input"
                type="text"
                placeholder="DELETE"
                className="input py-2.5 text-xs border-red-900/40 focus:border-red-500"
                value={deleteConfirmInput}
                onChange={(e) => setDeleteConfirmInput(e.target.value)}
              />
            </div>

            {deleteError && (
              <div className="text-xs text-red-400 font-semibold bg-red-500/10 p-3 rounded-xl border border-red-500/20">
                {deleteError}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmInput("");
                  setDeleteError(null);
                }}
                className="btn-secondary px-4 py-2.5 text-xs font-bold"
                disabled={deletingAccount}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleteConfirmInput !== "DELETE" || deletingAccount}
                className="btn-danger px-5 py-2.5 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {deletingAccount && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{deletingAccount ? "Deleting Account..." : "Permanently Delete"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
