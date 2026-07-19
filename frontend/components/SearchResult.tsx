import type { SearchResultItem } from "@/types";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Zap, Calendar, CheckCircle, ArrowRight } from "lucide-react";

interface SearchResultProps {
  item: SearchResultItem;
  rank: number;
}

export default function SearchResult({ item, rank }: SearchResultProps) {
  const similarityPct = Math.round(item.similarity * 100);
  const timeAgo = formatDistanceToNow(new Date(item.updated_at), { addSuffix: true });

  const getMatchTheme = (pct: number) => {
    if (pct >= 85) {
      return {
        text: "text-emerald-400",
        bar: "bg-gradient-to-r from-emerald-500 to-teal-400",
        bg: "bg-emerald-500/5 border-emerald-500/15 text-emerald-400",
        label: "High Match",
      };
    }
    if (pct >= 70) {
      return {
        text: "text-amber-400",
        bar: "bg-gradient-to-r from-amber-500 to-yellow-400",
        bg: "bg-amber-500/5 border-amber-500/15 text-amber-400",
        label: "Medium Match",
      };
    }
    return {
      text: "text-neutral-400",
      bar: "bg-neutral-500",
      bg: "bg-neutral-500/5 border-neutral-500/15 text-neutral-400",
      label: "Potential Match",
    };
  };

  const theme = getMatchTheme(similarityPct);

  return (
    <Link href={`/notes/${item.id}`}>
      <div className="bg-[#0c0c0e] border border-white/[0.04] hover:border-brand-500/30 rounded-2xl p-5 cursor-pointer shadow-lg hover:shadow-brand-500/5 transition-all duration-300 group flex flex-col gap-4 animate-slide-up hover:-translate-y-0.5 active:translate-y-0 relative overflow-hidden">
        {/* Glow accent */}
        <div className="absolute top-0 right-0 w-24 h-24 bg-brand-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-brand-500/10 transition-colors" />

        {/* Rank + Similarity badge */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-7 h-7 rounded-lg bg-neutral-900 border border-white/[0.06] text-neutral-300 text-xs font-bold flex items-center justify-center shadow-inner group-hover:border-brand-500/40 group-hover:text-white transition-colors">
              #{rank}
            </span>
            <h3 className="font-bold text-sm text-neutral-200 group-hover:text-white transition-colors leading-tight">
              {item.title || "Untitled note"}
            </h3>
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${theme.bg}`}>
              {theme.label}
            </span>
            <div className="flex items-center gap-1 bg-neutral-900/55 border border-white/[0.04] px-2.5 py-1 rounded-lg">
              <Zap className={`w-3.5 h-3.5 ${theme.text}`} />
              <span className={`text-xs font-bold ${theme.text}`}>{similarityPct}%</span>
            </div>
          </div>
        </div>

        {/* Custom Match Similarity Bar Indicator */}
        <div className="h-1.5 bg-neutral-900 rounded-full overflow-hidden border border-white/[0.02]">
          <div
            className={`h-full rounded-full transition-all duration-500 ${theme.bar}`}
            style={{ width: `${similarityPct}%` }}
          />
        </div>

        {/* Summary / Preview text */}
        <p className="text-sm text-neutral-400 line-clamp-2 leading-relaxed">
          {item.summary || item.content.slice(0, 160)}
        </p>

        {/* Metadata section (Tags & Time) */}
        <div className="flex items-center justify-between gap-2 border-t border-white/[0.04] pt-3 mt-1">
          <div className="flex flex-wrap gap-1.5">
            {item.tags && item.tags.length > 0 ? (
              item.tags.slice(0, 3).map((tag) => (
                <span key={tag} className="bg-white/[0.03] border border-white/[0.06] text-neutral-400 text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-md">
                  {tag}
                </span>
              ))
            ) : (
              <span className="text-[10px] text-neutral-600 italic">No tags</span>
            )}
          </div>
          
          <div className="flex items-center gap-1.5 text-neutral-500 group-hover:text-neutral-400 transition-colors">
            <Calendar className="w-3.5 h-3.5 text-neutral-600 shrink-0" />
            <span className="text-xs shrink-0">{timeAgo}</span>
            <ArrowRight className="w-3.5 h-3.5 text-neutral-600 group-hover:translate-x-1 transition-transform ml-1" />
          </div>
        </div>
      </div>
    </Link>
  );
}
