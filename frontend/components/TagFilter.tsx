"use client";

import { Tag, X } from "lucide-react";
import clsx from "clsx";

interface TagFilterProps {
  allTags: string[];
  selectedTag: string | null;
  onSelect: (tag: string | null) => void;
}

export default function TagFilter({ allTags, selectedTag, onSelect }: TagFilterProps) {
  if (allTags.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        <Tag className="w-3.5 h-3.5" />
        <span>Filter:</span>
      </div>
      {selectedTag && (
        <button
          onClick={() => onSelect(null)}
          className="flex items-center gap-1 tag text-red-400 border-red-500/20 bg-red-500/10"
          id="clear-tag-filter"
        >
          <X className="w-3 h-3" /> Clear
        </button>
      )}
      {allTags.map((tag) => (
        <button
          key={tag}
          onClick={() => onSelect(tag === selectedTag ? null : tag)}
          className={clsx(
            "tag transition-all duration-150",
            tag === selectedTag
              ? "bg-brand-500/30 border-brand-500/50 text-brand-200"
              : "hover:bg-brand-500/20 hover:border-brand-500/30"
          )}
          id={`tag-filter-${tag}`}
        >
          {tag}
        </button>
      ))}
    </div>
  );
}
