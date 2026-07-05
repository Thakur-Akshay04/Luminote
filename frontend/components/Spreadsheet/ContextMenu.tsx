"use client";

import { useEffect, useRef } from "react";
import {
  Plus,
  Trash2,
  Copy,
  Scissors,
  Clipboard,
  Grid3X3,
  Combine,
} from "lucide-react";

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onInsertRow: () => void;
  onDeleteRow: () => void;
  onInsertCol: () => void;
  onDeleteCol: () => void;
  onMergeCells: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
}

export default function ContextMenu({
  x,
  y,
  onClose,
  onInsertRow,
  onDeleteRow,
  onInsertCol,
  onDeleteCol,
  onMergeCells,
  onCopy,
  onCut,
  onPaste,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  // Adjust coordinates if it overflows the screen
  const menuWidth = 180;
  const menuHeight = 280;
  const adjustedX = typeof window !== "undefined" && x + menuWidth > window.innerWidth ? window.innerWidth - menuWidth - 10 : x;
  const adjustedY = typeof window !== "undefined" && y + menuHeight > window.innerHeight ? window.innerHeight - menuHeight - 10 : y;

  return (
    <div
      ref={menuRef}
      style={{ top: adjustedY, left: adjustedX }}
      className="fixed z-50 bg-surface-900 border border-surface-600 rounded-xl shadow-xl py-1 text-xs text-neutral-200 w-44 animate-fade-in"
    >
      <button
        onClick={() => {
          onCopy();
          onClose();
        }}
        className="w-full text-left px-3 py-2 hover:bg-surface-700 flex items-center gap-2"
      >
        <Copy className="w-3.5 h-3.5 text-neutral-400" />
        Copy <span className="ml-auto text-[9px] text-neutral-500">Ctrl+C</span>
      </button>

      <button
        onClick={() => {
          onCut();
          onClose();
        }}
        className="w-full text-left px-3 py-2 hover:bg-surface-700 flex items-center gap-2"
      >
        <Scissors className="w-3.5 h-3.5 text-neutral-400" />
        Cut <span className="ml-auto text-[9px] text-neutral-500">Ctrl+X</span>
      </button>

      <button
        onClick={() => {
          onPaste();
          onClose();
        }}
        className="w-full text-left px-3 py-2 hover:bg-surface-700 flex items-center gap-2"
      >
        <Clipboard className="w-3.5 h-3.5 text-neutral-400" />
        Paste <span className="ml-auto text-[9px] text-neutral-500">Ctrl+V</span>
      </button>

      <div className="border-t border-surface-700 my-1" />

      <button
        onClick={() => {
          onInsertRow();
          onClose();
        }}
        className="w-full text-left px-3 py-2 hover:bg-surface-700 flex items-center gap-2"
      >
        <Plus className="w-3.5 h-3.5 text-emerald-400" />
        Insert Row Above
      </button>

      <button
        onClick={() => {
          onDeleteRow();
          onClose();
        }}
        className="w-full text-left px-3 py-2 hover:bg-surface-700 flex items-center gap-2"
      >
        <Trash2 className="w-3.5 h-3.5 text-rose-400" />
        Delete Row
      </button>

      <div className="border-t border-surface-700 my-1" />

      <button
        onClick={() => {
          onInsertCol();
          onClose();
        }}
        className="w-full text-left px-3 py-2 hover:bg-surface-700 flex items-center gap-2"
      >
        <Plus className="w-3.5 h-3.5 text-emerald-400" />
        Insert Column Left
      </button>

      <button
        onClick={() => {
          onDeleteCol();
          onClose();
        }}
        className="w-full text-left px-3 py-2 hover:bg-surface-700 flex items-center gap-2"
      >
        <Trash2 className="w-3.5 h-3.5 text-rose-400" />
        Delete Column
      </button>

      <div className="border-t border-surface-700 my-1" />

      <button
        onClick={() => {
          onMergeCells();
          onClose();
        }}
        className="w-full text-left px-3 py-2 hover:bg-surface-700 flex items-center gap-2"
      >
        <Combine className="w-3.5 h-3.5 text-neutral-400" />
        Merge / Split Cells
      </button>
    </div>
  );
}
