"use client";

import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Strikethrough,
  Undo2,
  Redo2,
  Merge,
  Search,
  ArrowUpDown,
  Filter,
  Coins,
  Percent,
  Clock,
  Sparkles,
  RefreshCw,
  Eye,
} from "lucide-react";
import { CellFormat } from "@/types";

interface ToolbarProps {
  currentFormat: CellFormat;
  onApplyFormat: (format: Partial<CellFormat>) => void;
  onUndo: () => void;
  onRedo: () => void;
  onMerge: () => void;
  onSort: (dir: "asc" | "desc") => void;
  onFilterToggle: () => void;
  onFindReplace: () => void;
  onFreezeToggle: (rows: number, cols: number) => void;
  isSaving: boolean;
}

export default function Toolbar({
  currentFormat,
  onApplyFormat,
  onUndo,
  onRedo,
  onMerge,
  onSort,
  onFilterToggle,
  onFindReplace,
  onFreezeToggle,
  isSaving,
}: ToolbarProps) {
  // Predefined lists of standard colors
  const BG_COLORS = [
    { name: "None", value: "" },
    { name: "Red", value: "#FEE2E2" },
    { name: "Yellow", value: "#FEF3C7" },
    { name: "Green", value: "#D1FAE5" },
    { name: "Blue", value: "#DBEAFE" },
    { name: "Purple", value: "#F3E8FF" },
    { name: "Pink", value: "#FCE7F3" },
    { name: "Gray", value: "#F3F4F6" },
  ];

  const FONT_COLORS = [
    { name: "Default", value: "" },
    { name: "Red", value: "#DC2626" },
    { name: "Yellow", value: "#D97706" },
    { name: "Green", value: "#059669" },
    { name: "Blue", value: "#2563EB" },
    { name: "Purple", value: "#7C3AED" },
    { name: "Pink", value: "#DB2777" },
    { name: "White", value: "#FFFFFF" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 bg-surface-900 border-b border-surface-600 px-4 py-2 text-xs select-none">
      {/* Undo & Redo */}
      <div className="flex items-center gap-0.5 border-r border-surface-700 pr-2 mr-1">
        <button
          onClick={onUndo}
          className="p-1.5 hover:bg-surface-700 rounded-lg text-neutral-400 hover:text-white"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onRedo}
          className="p-1.5 hover:bg-surface-700 rounded-lg text-neutral-400 hover:text-white"
          title="Redo (Ctrl+Y)"
        >
          <Redo2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Font Size Selection */}
      <div className="flex items-center gap-1 border-r border-surface-700 pr-2 mr-1">
        <select
          value={currentFormat.fontSize || 12}
          onChange={(e) => onApplyFormat({ fontSize: Number(e.target.value) })}
          className="bg-surface-800 border border-surface-600 text-white rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-brand-500"
        >
          {[9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32].map((size) => (
            <option key={size} value={size}>
              {size}px
            </option>
          ))}
        </select>
      </div>

      {/* Text Styles: B, I, U, S */}
      <div className="flex items-center gap-0.5 border-r border-surface-700 pr-2 mr-1">
        <button
          onClick={() => onApplyFormat({ bold: !currentFormat.bold })}
          className={`p-1.5 rounded-lg transition-colors ${
            currentFormat.bold
              ? "bg-brand-500/20 text-brand-400 font-bold"
              : "hover:bg-surface-700 text-neutral-400 hover:text-white"
          }`}
          title="Bold"
        >
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onApplyFormat({ italic: !currentFormat.italic })}
          className={`p-1.5 rounded-lg transition-colors ${
            currentFormat.italic
              ? "bg-brand-500/20 text-brand-400 font-bold"
              : "hover:bg-surface-700 text-neutral-400 hover:text-white"
          }`}
          title="Italic"
        >
          <Italic className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onApplyFormat({ underline: !currentFormat.underline })}
          className={`p-1.5 rounded-lg transition-colors ${
            currentFormat.underline
              ? "bg-brand-500/20 text-brand-400 font-bold"
              : "hover:bg-surface-700 text-neutral-400 hover:text-white"
          }`}
          title="Underline"
        >
          <Underline className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onApplyFormat({ strikethrough: !currentFormat.strikethrough })}
          className={`p-1.5 rounded-lg transition-colors ${
            currentFormat.strikethrough
              ? "bg-brand-500/20 text-brand-400 font-bold"
              : "hover:bg-surface-700 text-neutral-400 hover:text-white"
          }`}
          title="Strikethrough"
        >
          <Strikethrough className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Alignments */}
      <div className="flex items-center gap-0.5 border-r border-surface-700 pr-2 mr-1">
        <button
          onClick={() => onApplyFormat({ textAlign: "left" })}
          className={`p-1.5 rounded-lg transition-colors ${
            currentFormat.textAlign === "left"
              ? "bg-brand-500/20 text-brand-400"
              : "hover:bg-surface-700 text-neutral-400 hover:text-white"
          }`}
          title="Align Left"
        >
          <AlignLeft className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onApplyFormat({ textAlign: "center" })}
          className={`p-1.5 rounded-lg transition-colors ${
            currentFormat.textAlign === "center"
              ? "bg-brand-500/20 text-brand-400"
              : "hover:bg-surface-700 text-neutral-400 hover:text-white"
          }`}
          title="Align Center"
        >
          <AlignCenter className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onApplyFormat({ textAlign: "right" })}
          className={`p-1.5 rounded-lg transition-colors ${
            currentFormat.textAlign === "right"
              ? "bg-brand-500/20 text-brand-400"
              : "hover:bg-surface-700 text-neutral-400 hover:text-white"
          }`}
          title="Align Right"
        >
          <AlignRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Colors (Background / Fill Color & Font Color dropdown selectors) */}
      <div className="flex items-center gap-2 border-r border-surface-700 pr-2 mr-1">
        {/* Fill Color */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-neutral-500 font-bold uppercase">Fill</span>
          <select
            value={currentFormat.backgroundColor || ""}
            onChange={(e) => onApplyFormat({ backgroundColor: e.target.value })}
            className="bg-surface-800 border border-surface-600 text-white rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-brand-500"
          >
            {BG_COLORS.map((c) => (
              <option key={c.name} value={c.value}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Text Color */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-neutral-500 font-bold uppercase">Text</span>
          <select
            value={currentFormat.fontColor || ""}
            onChange={(e) => onApplyFormat({ fontColor: e.target.value })}
            className="bg-surface-800 border border-surface-600 text-white rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-brand-500"
          >
            {FONT_COLORS.map((c) => (
              <option key={c.name} value={c.value}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Number Formats & Decimals */}
      <div className="flex items-center gap-2 border-r border-surface-700 pr-2 mr-1">
        <select
          value={currentFormat.numberFormat || "general"}
          onChange={(e) => onApplyFormat({ numberFormat: e.target.value as any })}
          className="bg-surface-800 border border-surface-600 text-white rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-brand-500"
          title="Number Format"
        >
          <option value="general">General</option>
          <option value="number">Number</option>
          <option value="currency">Currency ($)</option>
          <option value="percentage">Percentage (%)</option>
          <option value="date">Date</option>
          <option value="time">Time</option>
          <option value="text">Text</option>
        </select>

        <div className="flex items-center gap-0.5">
          <button
            onClick={() => {
              const currentDec = currentFormat.decimals !== undefined ? currentFormat.decimals : 2;
              onApplyFormat({ decimals: Math.min(10, currentDec + 1) });
            }}
            className="px-2 py-0.5 hover:bg-surface-700 border border-surface-600 rounded text-neutral-300 hover:text-white text-[10px] font-bold"
            title="Increase Decimals"
          >
            .00+.0
          </button>
          <button
            onClick={() => {
              const currentDec = currentFormat.decimals !== undefined ? currentFormat.decimals : 2;
              onApplyFormat({ decimals: Math.max(0, currentDec - 1) });
            }}
            className="px-2 py-0.5 hover:bg-surface-700 border border-surface-600 rounded text-neutral-300 hover:text-white text-[10px] font-bold"
            title="Decrease Decimals"
          >
            .0-.00
          </button>
        </div>
      </div>

      {/* Merge, Find, Sort, Filter */}
      <div className="flex items-center gap-1 border-r border-surface-700 pr-2 mr-1">
        <button
          onClick={onMerge}
          className="p-1.5 hover:bg-surface-700 rounded-lg text-neutral-400 hover:text-white"
          title="Merge & Center"
        >
          <Merge className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onFindReplace}
          className="p-1.5 hover:bg-surface-700 rounded-lg text-neutral-400 hover:text-white"
          title="Find & Replace"
        >
          <Search className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => onSort("asc")}
          className="p-1.5 hover:bg-surface-700 rounded-lg text-neutral-400 hover:text-white"
          title="Sort Ascending"
        >
          <ArrowUpDown className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onFilterToggle}
          className="p-1.5 hover:bg-surface-700 rounded-lg text-neutral-400 hover:text-white"
          title="Toggle Filters"
        >
          <Filter className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Freeze Options */}
      <div className="flex items-center gap-1 border-r border-surface-700 pr-2 mr-1">
        <span className="text-[10px] text-neutral-500 font-bold uppercase flex items-center gap-1">
          <Eye className="w-3 h-3 text-neutral-500" />
          Freeze
        </span>
        <select
          onChange={(e) => {
            const val = e.target.value;
            if (val === "row") onFreezeToggle(1, 0);
            else if (val === "col") onFreezeToggle(0, 1);
            else if (val === "both") onFreezeToggle(1, 1);
            else onFreezeToggle(0, 0);
            e.target.value = ""; // Reset value for reuse
          }}
          defaultValue=""
          className="bg-surface-800 border border-surface-600 text-white rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-brand-500"
        >
          <option value="" disabled>
            Freeze...
          </option>
          <option value="none">Unfreeze All</option>
          <option value="row">Freeze Top Row</option>
          <option value="col">Freeze First Column</option>
          <option value="both">Freeze Top Row & First Column</option>
        </select>
      </div>

      {/* Saving status indicator */}
      <div className="ml-auto flex items-center gap-1.5 text-neutral-400">
        {isSaving ? (
          <>
            <RefreshCw className="w-3 h-3 animate-spin text-brand-500" />
            <span className="text-[10px] text-neutral-500">Saving...</span>
          </>
        ) : (
          <>
            <Sparkles className="w-3 h-3 text-emerald-400" />
            <span className="text-[10px] text-neutral-500">Changes Saved</span>
          </>
        )}
      </div>
    </div>
  );
}
