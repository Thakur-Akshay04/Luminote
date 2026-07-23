"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { searchApi } from "@/lib/api";
import type { SearchResultItem } from "@/types";
import SearchResult from "@/components/SearchResult";
import { Search, Loader2, Palette, Zap, Brain } from "lucide-react";

export default function SearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [cached, setCached] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSearch = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = query.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    setResults([]);
    try {
      const res = await searchApi.semantic(q);
      setResults(res.data.results);
      setCached(res.data.cached);
      setSearched(true);
    } catch {
      setError("Search failed. Make sure you have notes with AI embeddings.");
    } finally {
      setLoading(false);
    }
  }, [query, loading]);

  const searchTips = [
    {
      label: "Research & Concepts",
      example: "key insights from my books and reading list",
      icon: Brain,
      color: "text-purple-400 border-purple-500/20 bg-purple-500/5 hover:border-purple-500/40 hover:bg-purple-500/10",
    },
    {
      label: "Meetings & Tasks",
      example: "weekly project meeting notes with tasks",
      icon: Zap,
      color: "text-amber-400 border-amber-500/20 bg-amber-500/5 hover:border-amber-500/40 hover:bg-amber-500/10",
    },
    {
      label: "Sketches & Creative",
      example: "UI wireframes and sketch ideas for the landing page",
      icon: Palette,
      color: "text-pink-400 border-pink-500/20 bg-pink-500/5 hover:border-pink-500/40 hover:bg-pink-500/10",
    },
  ];

  return (
    <div className="relative max-w-3xl mx-auto px-4 sm:px-6 py-16 min-h-[calc(100vh-1px)] flex flex-col justify-center">
      {/* Premium Ambient Background Blur Circle */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[550px] h-[550px] bg-gradient-to-r from-emerald-500/5 via-cyan-500/5 to-indigo-500/5 rounded-full blur-[140px] pointer-events-none -z-10 animate-pulse" style={{ animationDuration: '8s' }} />

      <div className="w-full">
        {/* Header */}
        <div className="text-center mb-12 animate-fade-in flex flex-col items-center">
          <h1 className="text-4xl sm:text-5xl font-extrabold bg-gradient-to-r from-amber-200 via-orange-400 to-pink-600 bg-clip-text text-transparent tracking-tight mb-3">Find your notes</h1>
          <p className="text-gray-400 text-sm max-w-md leading-relaxed">
            Search by meaning, context, or concepts instead of just exact matching keywords.
          </p>
        </div>

        {/* Search form */}
        <form onSubmit={handleSearch} className="relative mb-12 animate-slide-up">
          <div className="relative flex items-center bg-surface-900 border border-white/[0.06] rounded-2xl p-2 hover:border-brand-400/40 focus-within:border-brand-400/50 transition-all shadow-xl">
            <Search className="w-5 h-5 text-neutral-500 ml-3 pointer-events-none shrink-0" />
            <input
              ref={inputRef}
              id="search-input"
              type="text"
              className="w-full bg-transparent border-0 outline-none focus:ring-0 text-white placeholder:text-neutral-500 pl-3 pr-28 py-3 text-base"
              placeholder="Describe what you're looking for…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              id="search-btn"
              type="submit"
              disabled={loading || !query.trim()}
              className="absolute right-2 btn-primary px-5 py-2.5 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 disabled:hover:translate-y-0"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Search className="w-3.5 h-3.5" />
              )}
              {loading ? "Searching…" : "Search"}
            </button>
          </div>
        </form>

        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center gap-4 py-16 animate-fade-in">
            <div className="relative">
              <div className="w-12 h-12 rounded-full border-2 border-brand-500/30 animate-ping absolute inset-0" />
              <div className="w-12 h-12 rounded-full border-2 border-t-brand-500 border-brand-500/20 animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-gray-300 font-medium text-sm">Searching the embedding space…</p>
              <p className="text-gray-600 text-xs mt-1">Running cosine similarity calculations</p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center animate-fade-in mb-8">
            {error}
          </div>
        )}

        {/* Results */}
        {!loading && searched && (
          <div className="animate-fade-in mb-12">
            <div className="flex items-center justify-between mb-5 border-b border-white/[0.04] pb-3">
              <h2 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
                {results.length === 0
                  ? "No results found"
                  : `${results.length} result${results.length !== 1 ? "s" : ""} found`}
              </h2>
            </div>

            {results.length > 0 ? (
              <div className="flex flex-col gap-4">
                {results.map((item, i) => (
                  <SearchResult key={item.id} item={item} rank={i + 1} />
                ))}
              </div>
            ) : (
              <div className="text-center py-16 rounded-2xl border border-dashed border-white/5 bg-surface-900/40 p-8 flex flex-col items-center justify-center gap-2">
                <Search className="w-8 h-8 text-neutral-600" />
                <p className="text-neutral-400 font-medium text-sm mt-1">No notes matched your query.</p>
                <p className="text-neutral-600 text-xs">Try phrasing your search in a different way.</p>
              </div>
            )}
          </div>
        )}

        {/* Idle state tips */}
        {!searched && !loading && (
          <div className="flex flex-col gap-4 animate-fade-in">
            <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1">Try searching for</h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {searchTips.map(({ label, example, icon: Icon, color }) => (
                <button
                  key={label}
                  onClick={() => { setQuery(example); inputRef.current?.focus(); }}
                  className={`flex flex-col items-start gap-3 p-5 rounded-2xl border transition-all text-left group hover:-translate-y-0.5 active:translate-y-0 ${color}`}
                >
                  <div className="w-8 h-8 rounded-full border border-current/15 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold block mb-1 uppercase tracking-tight opacity-90">{label}</span>
                    <span className="text-xs text-neutral-400 group-hover:text-neutral-200 transition-colors italic leading-relaxed">&ldquo;{example}&rdquo;</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
