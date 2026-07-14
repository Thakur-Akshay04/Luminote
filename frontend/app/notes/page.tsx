"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { notesApi } from "@/lib/api";
import type { Note } from "@/types";
import NoteCard from "@/components/NoteCard";
import TagFilter from "@/components/TagFilter";
import { Plus, Loader2, StickyNote, Sparkles } from "lucide-react";

function NotesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const noteTypeParam = searchParams.get("type") || undefined;

  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated()) router.replace("/login");
  }, [router]);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await notesApi.list(selectedTag ?? undefined, noteTypeParam);
      setNotes(res.data);
    } catch {
      setError("Failed to load notes.");
    } finally {
      setLoading(false);
    }
  }, [selectedTag, noteTypeParam]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const allTags = Array.from(
    new Set(notes.flatMap((n) => n.tags ?? []))
  ).sort();

  const handleCreate = () => {
    const url = noteTypeParam ? `/notes/new?type=${noteTypeParam}` : "/notes/new";
    router.push(url);
  };

  const getTitle = () => {
    if (!noteTypeParam) return "My Notes";
    const typeMap: { [key: string]: string } = {
      text: "Text Notes",
      audio: "Voice Notes",
      drawing: "Drawing Notes",
      checklist: "Checklists",
    };
    return typeMap[noteTypeParam] || "My Notes";
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gradient">{getTitle()}</h1>
          <p className="text-gray-500 text-sm mt-1">
            {loading ? "Loading…" : `${notes.length} note${notes.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <button
          id="create-note-btn"
          onClick={handleCreate}
          disabled={creating}
          className="btn-primary shrink-0"
        >
          {creating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
          New note
        </button>
      </div>

      {/* Tag filter */}
      {allTags.length > 0 && (
        <div className="mb-6">
          <TagFilter allTags={allTags} selectedTag={selectedTag} onSelect={setSelectedTag} />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass p-5 flex flex-col gap-3 animate-pulse">
              <div className="flex gap-2">
                <div className="skeleton w-8 h-8 rounded-lg" />
                <div className="skeleton flex-1 h-4 rounded" />
              </div>
              <div className="space-y-2">
                <div className="skeleton h-3 w-full rounded" />
                <div className="skeleton h-3 w-4/5 rounded" />
              </div>
              <div className="flex gap-2 mt-2">
                <div className="skeleton h-5 w-14 rounded-full" />
                <div className="skeleton h-5 w-16 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Notes grid */}
      {!loading && notes.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {notes.map((note) => (
            <NoteCard key={note.id} note={note} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && notes.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-24 gap-5 animate-fade-in">
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl bg-surface-700/50 border border-white/[0.06] flex items-center justify-center">
              <StickyNote className="w-9 h-9 text-gray-600" />
            </div>
            <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-gradient-to-br from-brand-500 to-accent-violet flex items-center justify-center">
              <Sparkles className="w-3 h-3 text-white" />
            </div>
          </div>
          <div className="text-center">
            <h2 className="text-lg font-semibold text-gray-300 mb-1">
              {selectedTag ? `No notes tagged "${selectedTag}"` : "No notes yet"}
            </h2>
            <p className="text-gray-600 text-sm">
              {selectedTag ? "Try clearing the filter." : "Create your first AI-powered note."}
            </p>
          </div>
          {!selectedTag && (
            <button
              id="create-first-note-btn"
              onClick={handleCreate}
              disabled={creating}
              className="btn-primary"
            >
              <Plus className="w-4 h-4" /> Create first note
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function NotesPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-surface-800">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    }>
      <NotesContent />
    </Suspense>
  );
}
