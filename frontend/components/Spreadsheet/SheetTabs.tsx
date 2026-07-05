"use client";

import { useState } from "react";
import { Plus, Trash2, Edit2 } from "lucide-react";
import { SheetMeta } from "@/types";

interface SheetTabsProps {
  sheets: SheetMeta[];
  activeSheetId: string;
  onSelectSheet: (id: string) => void;
  onAddSheet: () => void;
  onRenameSheet: (id: string, newName: string) => void;
  onDeleteSheet: (id: string) => void;
}

export default function SheetTabs({
  sheets,
  activeSheetId,
  onSelectSheet,
  onAddSheet,
  onRenameSheet,
  onDeleteSheet,
}: SheetTabsProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleStartRename = (sheet: SheetMeta) => {
    setEditingId(sheet.id);
    setEditName(sheet.name);
  };

  const handleFinishRename = (id: string) => {
    if (editName.trim()) {
      onRenameSheet(id, editName.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="bg-surface-900 border-t border-surface-600 px-3 py-1 flex items-center gap-1.5 overflow-x-auto select-none select-tabs">
      {/* Sheets Loop */}
      {sheets
        .sort((a, b) => a.index - b.index)
        .map((sheet) => {
          const isActive = sheet.id === activeSheetId;
          const isEditing = sheet.id === editingId;

          return (
            <div
              key={sheet.id}
              onClick={() => !isEditing && onSelectSheet(sheet.id)}
              onDoubleClick={() => !isEditing && handleStartRename(sheet)}
              className={`
                flex items-center gap-2 px-4 py-1.5 text-xs rounded-t-lg border-x border-t transition-all cursor-pointer group shrink-0
                ${
                  isActive
                    ? "bg-surface-800 border-surface-600 text-white font-bold"
                    : "bg-surface-900 border-transparent hover:bg-surface-800 text-neutral-400 hover:text-neutral-200"
                }
              `}
            >
              {isEditing ? (
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => handleFinishRename(sheet.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleFinishRename(sheet.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  autoFocus
                  className="bg-surface-700 text-white text-xs border border-brand-500 rounded px-1.5 py-0.5 focus:outline-none w-24"
                />
              ) : (
                <span>{sheet.name}</span>
              )}

              {/* Action Buttons */}
              {!isEditing && isActive && sheets.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete sheet "${sheet.name}"?`)) {
                      onDeleteSheet(sheet.id);
                    }
                  }}
                  className="text-neutral-500 hover:text-red-400 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Delete Sheet"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}

      {/* Add Sheet Button */}
      <button
        onClick={onAddSheet}
        className="p-1.5 hover:bg-surface-700 rounded-lg text-neutral-400 hover:text-white transition-colors ml-1"
        title="Add Sheet"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}
