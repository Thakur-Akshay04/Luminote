"use client";

import { useState } from "react";
import { notesApi } from "@/lib/api";
import type { ChecklistItem } from "@/types";
import { Plus, Trash2, Sparkles, Loader2, ListTodo } from "lucide-react";

interface ChecklistEditorProps {
  noteId: string;
  items: ChecklistItem[] | null;
  onItemsUpdate: (newItems: ChecklistItem[]) => void;
}

export default function ChecklistEditor({
  noteId,
  items,
  onItemsUpdate,
}: ChecklistEditorProps) {
  const [newItemText, setNewItemText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checklistItems = items || [];

  const handleToggle = async (index: number, checked: boolean) => {
    try {
      // Optimistic update
      const updated = [...checklistItems];
      updated[index] = { ...updated[index], checked };
      onItemsUpdate(updated);

      await notesApi.toggleChecklistItem(noteId, index, checked);
    } catch (err) {
      console.error("Failed to toggle checklist item:", err);
      // Revert if API failed
      const reverted = [...checklistItems];
      reverted[index] = { ...reverted[index], checked: !checked };
      onItemsUpdate(reverted);
      setError("Failed to update item state.");
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemText.trim()) return;

    try {
      const newItem: ChecklistItem = {
        id: crypto.randomUUID(),
        text: newItemText.trim(),
        checked: false,
      };

      const updated = [...checklistItems, newItem];
      onItemsUpdate(updated);
      setNewItemText("");

      // Update full checklist on backend by saving via note update endpoint
      await notesApi.update(noteId, { checklist_items: updated });
    } catch (err) {
      console.error("Failed to add item:", err);
      setError("Failed to add item to checklist.");
    }
  };

  const handleDeleteItem = async (index: number) => {
    try {
      const updated = checklistItems.filter((_, i) => i !== index);
      onItemsUpdate(updated);

      await notesApi.update(noteId, { checklist_items: updated });
    } catch (err) {
      console.error("Failed to delete item:", err);
      setError("Failed to delete item from checklist.");
    }
  };

  const handleAIExtract = async () => {
    setExtracting(true);
    setError(null);
    try {
      const res = await notesApi.extractTasks(noteId);
      const extracted = res.data.tasks || [];
      
      if (extracted.length === 0) {
        setError("No action items found in this note's content.");
        return;
      }

      // Merge extracted tasks, avoiding duplicates by text
      const existingTexts = new Set(checklistItems.map((item) => item.text.toLowerCase()));
      const newItems = extracted.filter(
        (item) => !existingTexts.has(item.text.toLowerCase())
      );

      const merged = [...checklistItems, ...newItems];
      onItemsUpdate(merged);

      // Save to backend
      await notesApi.update(noteId, { checklist_items: merged });
    } catch (err) {
      console.error("Failed to extract tasks:", err);
      setError("AI task extraction failed. Make sure the note has content.");
    } finally {
      setExtracting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header Controls */}
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
        <div className="flex items-center gap-1.5">
          <ListTodo className="w-4 h-4 text-neutral-400" />
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Checklist Items
          </span>
        </div>

        <button
          onClick={handleAIExtract}
          disabled={extracting}
          className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1 hover:border-brand-500/40 hover:bg-brand-500/10"
          id="ai-extract-tasks-btn"
        >
          {extracting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Sparkles className="w-3.5 h-3.5 text-brand-400 fill-brand-400" />
          )}
          <span>Extract Tasks with AI</span>
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xs text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Add New Item Form */}
      <form onSubmit={handleAddItem} className="flex gap-2">
        <input
          type="text"
          className="input flex-1 py-2 text-xs"
          placeholder="Add a to-do item..."
          value={newItemText}
          onChange={(e) => setNewItemText(e.target.value)}
          id="new-task-input"
        />
        <button
          type="submit"
          disabled={!newItemText.trim()}
          className="btn-primary py-2 px-3 shrink-0 flex items-center justify-center"
          id="add-task-btn"
        >
          <Plus className="w-4 h-4" />
        </button>
      </form>

      {/* List Items */}
      <div className="flex flex-col gap-1.5 mt-2">
        {checklistItems.length === 0 ? (
          <div className="text-center py-8 text-xs text-gray-500 italic">
            Checklist is empty. Add a task or use AI to extract tasks.
          </div>
        ) : (
          checklistItems.map((item, index) => (
            <div
              key={item.id || index}
              className="flex items-center justify-between gap-3 p-3 rounded-xs border border-white/[0.04] bg-surface-raised hover:bg-surface-strong group transition-all"
            >
              <div className="flex items-center gap-3 min-w-0">
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={(e) => handleToggle(index, e.target.checked)}
                  className="w-4 h-4 rounded border-border-muted text-brand-500 focus:ring-0 focus:ring-offset-0 bg-transparent cursor-pointer"
                  id={`task-check-${index}`}
                />
                <span
                  className={`text-sm select-none break-all transition-all duration-300 ${
                    item.checked
                      ? "text-gray-500 line-through decoration-gray-600"
                      : "text-gray-200"
                  }`}
                >
                  {item.text}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleDeleteItem(index)}
                className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-1"
                title="Delete task"
                id={`task-delete-${index}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
