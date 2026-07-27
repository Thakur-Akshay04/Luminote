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
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={() => {
        if (!loading) onCancel();
      }}
    >
      <div
        className="w-full max-w-md bg-[#131316] border border-white/[0.1] rounded-2xl p-6 shadow-2xl flex flex-col gap-5 animate-scale-in relative overflow-hidden select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ambient Top Glow */}
        <div
          className={clsx(
            "absolute top-0 left-0 right-0 h-1",
            isDanger ? "bg-gradient-to-r from-red-500 via-rose-500 to-red-500" : "bg-gradient-to-r from-brand-500 via-indigo-500 to-brand-500"
          )}
        />

        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={clsx(
                "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border mt-0.5",
                isDanger
                  ? "bg-red-500/10 border-red-500/20 text-red-400"
                  : "bg-brand-500/10 border-brand-500/20 text-brand-400"
              )}
            >
              {isDanger ? <AlertTriangle className="w-5 h-5" /> : <Trash2 className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">{title}</h3>
              <p className="text-xs text-neutral-400 mt-1 leading-relaxed">{message}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="text-neutral-500 hover:text-white p-1 rounded-lg hover:bg-white/[0.05] transition-colors shrink-0"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/[0.06]">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-xs font-semibold text-neutral-400 hover:text-white bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06] rounded-xl transition-all"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={clsx(
              "px-4.5 py-2 text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-lg transition-all",
              isDanger
                ? "bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white shadow-red-600/20"
                : "bg-brand-600 hover:bg-brand-500 text-white shadow-brand-600/20"
            )}
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              isDanger && <Trash2 className="w-3.5 h-3.5" />
            )}
            <span>{loading ? "Deleting..." : confirmText}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
