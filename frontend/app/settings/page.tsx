"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated, getUser, clearAuth } from "@/lib/auth";
import type { StoredUser } from "@/lib/auth";
import { notesApi, authApi } from "@/lib/api";
import {
  User,
  Lock,
  Bot,
  Database,
  ShieldAlert,
  Download,
  Upload,
  Trash2,
  Loader2,
  CheckCircle,
  AlertCircle,
  Save,
} from "lucide-react";

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [activeTab, setActiveTab] = useState<"account" | "ai" | "data" | "danger">("account");

  // Auth / Redirect
  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
    } else {
      setUser(getUser());
    }
  }, [router]);

  // Tab 1: Account (Password Change)
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  // Tab 2: AI Preferences
  const [aiFormat, setAiFormat] = useState<"paragraph" | "bullets" | "actions">("paragraph");
  const [aiExtractAlerts, setAiExtractAlerts] = useState(true);
  const [aiSuccess, setAiSuccess] = useState(false);

  // Load AI Preferences from localStorage on load
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

  // Tab 3: Backup & Restore
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

  // Tab 4: Danger Zone
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Password strength logic
  const passwordStrength =
    newPassword.length === 0 ? null :
    newPassword.length < 8 ? "weak" :
    newPassword.length < 12 ? "medium" : "strong";

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      return;
    }
    setPasswordLoading(true);
    setPasswordError(null);
    setPasswordSuccess(null);
    try {
      await authApi.updatePassword(currentPassword, newPassword);
      setPasswordSuccess("Password updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      const message = err.response?.data?.detail || "Failed to update password. Verify current password.";
      setPasswordError(message);
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleSaveAiSettings = () => {
    localStorage.setItem("luminote_ai_format", aiFormat);
    localStorage.setItem("luminote_ai_extract_alerts", String(aiExtractAlerts));
    setAiSuccess(true);
    setTimeout(() => setAiSuccess(false), 2000);
  };

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
            // Import note
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
        // Clear input value
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

  const handleDeleteAccount = async () => {
    if (!user || deleteConfirmInput !== user.email) {
      setDeleteError("Confirmation email does not match your account email.");
      return;
    }

    setDeletingAccount(true);
    setDeleteError(null);

    try {
      await authApi.deleteAccount();
      clearAuth();
      router.push("/landing");
    } catch (err: any) {
      const message = err.response?.data?.detail || "Failed to delete account. Please try again.";
      setDeleteError(message);
      setDeletingAccount(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-800">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  const tabs = [
    { id: "account", label: "Account & Password", icon: User },
    { id: "ai", label: "AI Settings", icon: Bot },
    { id: "data", label: "Backup & Data", icon: Database },
    { id: "danger", label: "Danger Zone", icon: ShieldAlert },
  ] as const;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 animate-slide-up">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gradient">Settings</h1>
        <p className="text-gray-500 text-sm mt-1">Configure your Luminote account, preferences, and backups</p>
      </div>

      {/* Tabs list (horizontal top bar) */}
      <div className="flex border-b border-white/[0.06] mb-8 overflow-x-auto gap-2">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all shrink-0
              ${activeTab === id
                ? "border-brand-500 text-white font-semibold"
                : "border-transparent text-neutral-400 hover:text-neutral-200 hover:border-white/[0.06]"
              }`}
          >
            <Icon className={`w-4 h-4 ${activeTab === id ? "text-brand-500" : "text-neutral-500"}`} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Panels */}
      <div className="glass p-6">
        
        {/* Tab 1: Account Settings */}
        {activeTab === "account" && (
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-lg font-semibold text-neutral-200">Account details</h2>
              <div className="mt-3 p-4 rounded-xl bg-neutral-900 border border-white/[0.04]">
                <div className="text-xs text-neutral-500 uppercase tracking-wider font-semibold">User Email</div>
                <div className="text-sm font-mono text-gray-200 mt-1">{user.email}</div>
              </div>
            </div>

            <div className="h-px bg-white/[0.06]" />

            <form onSubmit={handlePasswordChange} className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold text-neutral-200">Change Password</h2>

              {passwordError && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {passwordError}
                </div>
              )}

              {passwordSuccess && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  {passwordSuccess}
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-gray-400">Current Password</label>
                <input
                  type="password"
                  className="input"
                  placeholder="Enter current password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-gray-400">New Password</label>
                <input
                  type="password"
                  className="input"
                  placeholder="Min. 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
                
                {passwordStrength && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="text-[10px] text-gray-500">Strength:</span>
                    <span className={`text-[10px] font-semibold uppercase tracking-tight
                      ${passwordStrength === "weak" ? "text-red-400" : ""}
                      ${passwordStrength === "medium" ? "text-amber-400" : ""}
                      ${passwordStrength === "strong" ? "text-emerald-400" : ""}
                    `}>
                      {passwordStrength}
                    </span>
                    <div className="flex gap-1 flex-1 max-w-[80px] h-1 bg-neutral-900 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-300
                        ${passwordStrength === "weak" ? "w-1/3 bg-red-400" : ""}
                        ${passwordStrength === "medium" ? "w-2/3 bg-amber-400" : ""}
                        ${passwordStrength === "strong" ? "w-full bg-emerald-400" : ""}
                      `} />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-gray-400">Confirm New Password</label>
                <input
                  type="password"
                  className="input"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>

              <button
                type="submit"
                className="btn-primary mt-2 flex items-center justify-center gap-2 self-start px-6"
                disabled={passwordLoading}
              >
                {passwordLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                Change Password
              </button>
            </form>
          </div>
        )}

        {/* Tab 2: AI Preferences */}
        {activeTab === "ai" && (
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-lg font-semibold text-neutral-200">AI Summary Format</h2>
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
                <h2 className="text-lg font-semibold text-neutral-200">Extract alerts</h2>
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
        )}

        {/* Tab 3: Backup & Restore */}
        {activeTab === "data" && (
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-lg font-semibold text-neutral-200">Export Notes</h2>
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
              <h2 className="text-lg font-semibold text-neutral-200">Import Notes</h2>
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
              <h2 className="text-sm font-bold text-red-400 flex items-center gap-2">
                <Trash2 className="w-4 h-4" /> Wipe Notes
              </h2>
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
        )}

        {/* Tab 4: Danger Zone (Account Deletion) */}
        {activeTab === "danger" && (
          <div className="flex flex-col gap-6">
            <div className="p-4 rounded-xl bg-red-950/10 border border-red-900/20">
              <h2 className="text-lg font-bold text-red-400 flex items-center gap-2">
                <Trash2 className="w-5 h-5" /> Delete Account
              </h2>
              <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                Permanently delete your account and all associated notes, reminders, and summaries. 
                This action is irreversible. All session data will be invalidated immediately.
              </p>

              {deleteError && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm mt-4">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {deleteError}
                </div>
              )}

              <div className="flex flex-col gap-3 mt-5">
                <label className="text-xs font-semibold text-neutral-400">
                  To confirm, type your account email: <span className="font-mono text-gray-200">{user.email}</span>
                </label>
                
                <div className="flex flex-col sm:flex-row gap-3 max-w-md mt-1">
                  <input
                    type="email"
                    placeholder="Enter your email"
                    className="input !py-2.5"
                    value={deleteConfirmInput}
                    onChange={(e) => setDeleteConfirmInput(e.target.value)}
                  />
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deletingAccount}
                    className="btn-danger flex items-center justify-center gap-2 shrink-0 px-6 !py-2.5"
                  >
                    {deletingAccount ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
                    Delete Account
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        
      </div>
    </div>
  );
}
