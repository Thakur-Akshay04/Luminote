"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { isAuthenticated } from "@/lib/auth";
import { searchApi } from "@/lib/api";
import type { SearchResultItem } from "@/types";
import SearchResult from "@/components/SearchResult";
import { Search, Loader2, Sparkles, Zap } from "lucide-react";

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
    if (!isAuthenticated()) router.replace("/login");
    inputRef.current?.focus();
  }, [router]);

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

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      {/* Header */}
      <div className="text-center mb-10 animate-fade-in">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-300 text-xs font-medium mb-4">
          <Sparkles className="w-3.5 h-3.5" />
          Semantic Search
        </div>
        <h1 className="text-4xl font-bold text-gradient mb-2">Find your notes</h1>
        <p className="text-gray-500 text-sm">
          Search by meaning, not just keywords — powered by vector embeddings
        </p>
      </div>

      {/* Search form */}
      <form onSubmit={handleSearch} className="relative mb-8 animate-slide-up">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 pointer-events-none z-10" />
        <input
          ref={inputRef}
          id="search-input"
          type="text"
          className="input pl-12 pr-32 py-4 text-base rounded-2xl"
          placeholder="Describe what you're looking for…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          id="search-btn"
          type="submit"
          disabled={loading || !query.trim()}
          className="absolute right-2 top-1/2 -translate-y-1/2 btn-primary px-4 py-2 text-sm"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
          {loading ? "Searching…" : "Search"}
        </button>
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
            <p className="text-gray-600 text-xs mt-1">Running cosine similarity with pgvector</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center animate-fade-in">
          {error}
        </div>
      )}

      {/* Results */}
      {!loading && searched && (
        <div className="animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-400">
              {results.length === 0
                ? "No results found"
                : `${results.length} result${results.length !== 1 ? "s" : ""} found`}
            </h2>
            {cached && (
              <div className="flex items-center gap-1.5 text-xs text-accent-cyan">
                <Zap className="w-3.5 h-3.5" />
                Served from cache
              </div>
            )}
          </div>

          {results.length > 0 ? (
            <div className="flex flex-col gap-3">
              {results.map((item, i) => (
                <SearchResult key={item.id} item={item} rank={i + 1} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-600 text-sm">
              <p>No notes matched your query.</p>
              <p className="mt-1 text-xs">Try a different phrasing or create more notes first.</p>
            </div>
          )}
        </div>
      )}

      {/* Idle state tips */}
      {!searched && !loading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 animate-fade-in">
          {[
            { label: "Conceptual", example: "notes about machine learning optimization" },
            { label: "Thematic", example: "meeting notes with action items" },
            { label: "Descriptive", example: "ideas for my startup product" },
          ].map(({ label, example }) => (
            <button
              key={label}
              onClick={() => { setQuery(example); inputRef.current?.focus(); }}
              className="glass-hover p-4 text-left flex flex-col gap-1 rounded-xl group"
            >
              <span className="text-xs font-semibold text-brand-400 group-hover:text-brand-300">{label}</span>
              <span className="text-xs text-gray-500 group-hover:text-gray-400">&ldquo;{example}&rdquo;</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
