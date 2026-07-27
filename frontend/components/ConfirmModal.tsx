"use client";

import { useEffect } from "react";
import { AlertTriangle, Trash2, X, Loader2 } from "lucide-react";
import clsx from "clsx";

interface ConfirmModalProps {
  isOpen: boolean;
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  isOpen,
  title = "Delete Note",
  message = "Are you sure you want to delete this note? This action cannot be undone.",
  confirmText = "Delete Note",
  cancelText = "Cancel",
  isDanger = true,
  loading = false,
  onConfirm,
  onCancel,
}: Readonly<ConfirmModalProps>) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !loading) {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, loading, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in"
      onClick={() => {
        if (!loading) onCancel();
      }}
    >
      <div
        className="w-full max-w-[420px] bg-[#0f0f12]/95 border border-white/[0.08] rounded-2xl p-6 shadow-2xl shadow-black/80 flex flex-col gap-6 animate-scale-in relative overflow-hidden select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Subtle Ambient Accent Header Line */}
        <div
          className={clsx(
            "absolute top-0 left-0 right-0 h-1",
            isDanger
              ? "bg-gradient-to-r from-rose-500 via-red-500 to-rose-500"
              : "bg-gradient-to-r from-brand-500 via-indigo-500 to-brand-500"
          )}
        />

        {/* Modal Header & Content */}
        <div className="flex items-start gap-4">
          <div
            className={clsx(
              "w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border shadow-inner",
              isDanger
                ? "bg-rose-500/10 border-rose-500/20 text-rose-400"
                : "bg-brand-500/10 border-brand-500/20 text-brand-400"
            )}
          >
            {isDanger ? <AlertTriangle className="w-5 h-5" /> : <Trash2 className="w-5 h-5" />}
          </div>

          <div className="flex-1 min-w-0 pr-6">
            <h3 className="text-base font-bold text-white tracking-tight">{title}</h3>
            <p className="text-xs text-neutral-400 mt-1.5 leading-relaxed">{message}</p>
          </div>

          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="absolute top-5 right-5 text-neutral-500 hover:text-white p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors shrink-0"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Actions Footer */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/[0.06]">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2.5 text-xs font-semibold text-neutral-300 hover:text-white bg-neutral-800/70 hover:bg-neutral-700/80 border border-white/[0.06] rounded-xl transition-all active:scale-95 whitespace-nowrap"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={clsx(
              "px-5 py-2.5 text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 whitespace-nowrap shrink-0",
              isDanger
                ? "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/40 border border-rose-500/30"
                : "bg-brand-600 hover:bg-brand-500 text-white shadow-brand-950/40 border border-brand-500/30"
            )}
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            ) : (
              isDanger && <Trash2 className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>{loading ? "Deleting..." : confirmText}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
