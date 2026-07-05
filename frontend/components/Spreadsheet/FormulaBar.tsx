"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

interface FormulaBarProps {
  selectedCellLabel: string;
  rawValue: string;
  onChange: (value: string) => void;
  onCommit: () => void;
}

export default function FormulaBar({
  selectedCellLabel,
  rawValue,
  onChange,
  onCommit,
}: FormulaBarProps) {
  const [inputValue, setInputValue] = useState(rawValue);

  useEffect(() => {
    setInputValue(rawValue);
  }, [rawValue]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      onCommit();
    }
  };

  return (
    <div className="flex items-center gap-1 bg-surface-900 border-b border-surface-600 px-3 py-1.5 text-xs">
      {/* Selected Cell Reference */}
      <div className="bg-surface-800 border border-surface-600 rounded px-2.5 py-1 text-neutral-300 font-bold min-w-12 text-center select-none">
        {selectedCellLabel || "-"}
      </div>

      {/* FX Icon Divider */}
      <div className="flex items-center justify-center w-6 h-6 text-neutral-400 font-semibold italic text-sm select-none">
        fx
      </div>

      {/* Input Field */}
      <div className="flex-1 relative flex items-center">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            onChange(e.target.value);
          }}
          onKeyDown={handleKeyDown}
          onBlur={onCommit}
          className="w-full bg-surface-800 border border-surface-600 rounded px-3 py-1 text-white font-mono focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20"
          placeholder="Enter text, numbers, or formulas starting with ="
        />
        {inputValue.startsWith("=") && (
          <Sparkles className="w-3.5 h-3.5 text-pink-400 absolute right-3 pointer-events-none animate-pulse" />
        )}
      </div>
    </div>
  );
}
