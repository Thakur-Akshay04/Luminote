"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { isAuthenticated } from "@/lib/auth";
import { spreadsheetsApi } from "@/lib/api";
import { Spreadsheet } from "@/types";
import {
  Plus,
  Loader2,
  FileSpreadsheet,
  Sparkles,
  Trash2,
  Edit2,
  Calendar,
  Grid3X3,
} from "lucide-react";
import { format } from "date-fns";

export default function SpreadsheetsPage() {
  const router = useRouter();
  const [spreadsheets, setSpreadsheets] = useState<Spreadsheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Rename states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState("");

  // Authenticate
  useEffect(() => {
    if (!isAuthenticated()) router.replace("/login");
  }, [router]);

  const fetchSpreadsheets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await spreadsheetsApi.list();
      setSpreadsheets(res.data);
    } catch {
      setError("Failed to load spreadsheets.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSpreadsheets();
  }, [fetchSpreadsheets]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await spreadsheetsApi.create({
        title: "Untitled Spreadsheet",
      });
      router.push(`/spreadsheets/${res.data.id}`);
    } catch {
      setError("Failed to create spreadsheet.");
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this spreadsheet?")) return;

    try {
      await spreadsheetsApi.delete(id);
      setSpreadsheets((prev) => prev.filter((s) => s.id !== id));
    } catch {
      alert("Failed to delete spreadsheet.");
    }
  };

  const handleStartRename = (s: Spreadsheet, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingId(s.id);
    setRenameTitle(s.title);
  };

  const handleFinishRename = async (s: Spreadsheet, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!renameTitle.trim()) return;

    try {
      await spreadsheetsApi.update(s.id, { title: renameTitle.trim() });
      setSpreadsheets((prev) =>
        prev.map((item) => (item.id === s.id ? { ...item, title: renameTitle.trim() } : item))
      );
      setEditingId(null);
    } catch {
      alert("Failed to rename spreadsheet.");
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gradient">My Spreadsheets</h1>
          <p className="text-gray-500 text-sm mt-1">
            {loading ? "Loading…" : `${spreadsheets.length} sheet${spreadsheets.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="btn-primary shrink-0 flex items-center gap-1.5"
        >
          {creating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
          New sheet
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Loading Skeletons */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass p-5 flex flex-col gap-3 animate-pulse">
              <div className="flex gap-2">
                <div className="skeleton w-8 h-8 rounded-lg" />
                <div className="skeleton flex-1 h-4 rounded" />
              </div>
              <div className="space-y-2">
                <div className="skeleton h-3 w-full rounded" />
                <div className="skeleton h-3 w-4/5 rounded" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Spreadsheets grid */}
      {!loading && spreadsheets.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {spreadsheets.map((sheet) => {
            const isEditing = sheet.id === editingId;

            return (
              <Link
                key={sheet.id}
                href={`/spreadsheets/${sheet.id}`}
                className="bg-surface-900 border border-surface-600 rounded-xl p-5 flex flex-col justify-between gap-4 shadow-sm hover:shadow hover:border-brand-500/50 transition-all group relative cursor-pointer"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>

                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={renameTitle}
                            onChange={(e) => setRenameTitle(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleFinishRename(sheet, e as any);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            autoFocus
                            className="bg-surface-800 text-white text-xs border border-brand-500 rounded px-2 py-1 focus:outline-none w-32"
                          />
                          <button
                            onClick={(e) => handleFinishRename(sheet, e)}
                            className="text-[10px] text-brand-400 font-bold hover:underline"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <h3 className="text-sm font-bold text-white leading-snug group-hover:text-emerald-400 transition-colors truncate">
                          {sheet.title || "Untitled Spreadsheet"}
                        </h3>
                      )}
                      <p className="text-[10px] text-neutral-500 mt-0.5 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-neutral-600" />
                        Updated {format(new Date(sheet.updated_at), "MMM d, yyyy")}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  {!isEditing && (
                    <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all absolute top-4 right-4 bg-surface-900/90 pl-2">
                      <button
                        onClick={(e) => handleStartRename(sheet, e)}
                        className="text-neutral-500 hover:text-white p-1 rounded-lg hover:bg-surface-700 transition-all"
                        title="Rename"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleDelete(sheet.id, e)}
                        className="text-neutral-500 hover:text-red-400 p-1 rounded-lg hover:bg-surface-700 transition-all"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-surface-700 pt-3 mt-1 text-[10px] text-neutral-500">
                  <div className="flex items-center gap-1">
                    <Grid3X3 className="w-3 h-3 text-neutral-600" />
                    <span>Workbook</span>
                  </div>
                  <span>{(sheet.sheets || []).length} sheet(s)</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {!loading && spreadsheets.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-24 gap-5 animate-fade-in">
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl bg-surface-700/50 border border-white/[0.06] flex items-center justify-center">
              <FileSpreadsheet className="w-9 h-9 text-gray-600" />
            </div>
            <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-gradient-to-br from-brand-500 to-accent-violet flex items-center justify-center">
              <Sparkles className="w-3 h-3 text-white" />
            </div>
          </div>
          <div className="text-center">
            <h2 className="text-lg font-semibold text-gray-300 mb-1">No spreadsheets yet</h2>
            <p className="text-gray-600 text-sm">Create your first Excel-like workbook.</p>
          </div>
          <button onClick={handleCreate} disabled={creating} className="btn-primary">
            <Plus className="w-4 h-4" /> Create first sheet
          </button>
        </div>
      )}
    </div>
  );
}
