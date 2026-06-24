import type { SearchResultItem } from "@/types";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Zap } from "lucide-react";

interface SearchResultProps {
  item: SearchResultItem;
  rank: number;
}

export default function SearchResult({ item, rank }: SearchResultProps) {
  const similarityPct = Math.round(item.similarity * 100);
  const timeAgo = formatDistanceToNow(new Date(item.updated_at), { addSuffix: true });

  return (
    <Link href={`/notes/${item.id}`}>
      <div className="glass-hover group flex flex-col gap-3 p-5 cursor-pointer animate-slide-up">
        {/* Rank + similarity */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-brand-500/20 text-brand-300 text-xs font-bold flex items-center justify-center">
              {rank}
            </span>
            <h3 className="font-semibold text-sm text-gray-100 group-hover:text-white transition-colors">
              {item.title || "Untitled note"}
            </h3>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Zap className="w-3.5 h-3.5 text-accent-amber" />
            <span className="text-xs font-semibold text-accent-amber">{similarityPct}%</span>
          </div>
        </div>

        {/* Similarity bar */}
        <div className="h-1 bg-surface-600 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-brand-500 to-accent-violet rounded-full transition-all"
            style={{ width: `${similarityPct}%` }}
          />
        </div>

        {/* Summary / preview */}
        <p className="text-sm text-gray-400 line-clamp-2">
          {item.summary || item.content.slice(0, 160)}
        </p>

        {/* Tags + time */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {(item.tags ?? []).slice(0, 4).map((tag) => (
              <span key={tag} className="tag text-xs">{tag}</span>
            ))}
          </div>
          <span className="text-xs text-gray-600 shrink-0">{timeAgo}</span>
        </div>
      </div>
    </Link>
  );
}
