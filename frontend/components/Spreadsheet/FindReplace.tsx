"use client";

import { useState } from "react";
import { X, Search } from "lucide-react";

interface FindReplaceProps {
  onClose: () => void;
  onFind: (search: string, matchCase: boolean) => void;
  onReplace: (search: string, replace: string, matchCase: boolean, all: boolean) => void;
}

export default function FindReplace({ onClose, onFind, onReplace }: FindReplaceProps) {
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [matchCase, setMatchCase] = useState(false);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-900 border border-surface-600 rounded-2xl w-full max-w-sm shadow-2xl p-5 space-y-4 text-neutral-200 animate-scale-in">
        <div className="flex items-center justify-between border-b border-surface-700 pb-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Search className="w-4 h-4 text-brand-500" />
            Find and Replace
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-surface-700 rounded-lg text-neutral-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-neutral-500">Find What</label>
            <input
              type="text"
              value={findText}
              onChange={(e) => setFindText(e.target.value)}
              className="w-full bg-surface-800 border border-surface-600 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
              placeholder="Text to find..."
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-neutral-500">Replace With</label>
            <input
              type="text"
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              className="w-full bg-surface-800 border border-surface-600 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
              placeholder="Replacement text..."
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="matchCase"
              checked={matchCase}
              onChange={(e) => setMatchCase(e.target.checked)}
              className="rounded border-surface-600 bg-surface-800 text-brand-500 focus:ring-0 w-3.5 h-3.5"
            />
            <label htmlFor="matchCase" className="text-xs text-neutral-400 select-none">
              Match case
            </label>
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-2 border-t border-surface-700">
          <button
            onClick={() => onFind(findText, matchCase)}
            disabled={!findText}
            className="btn-secondary text-xs px-3 py-1.5 hover:bg-surface-700"
          >
            Find Next
          </button>
          <button
            onClick={() => onReplace(findText, replaceText, matchCase, false)}
            disabled={!findText}
            className="btn-secondary text-xs px-3 py-1.5 hover:bg-surface-700"
          >
            Replace
          </button>
          <button
            onClick={() => onReplace(findText, replaceText, matchCase, true)}
            disabled={!findText}
            className="btn-primary text-xs px-3 py-1.5"
          >
            Replace All
          </button>
        </div>
      </div>
    </div>
  );
}
