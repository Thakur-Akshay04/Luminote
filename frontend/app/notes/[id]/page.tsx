"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { notesApi } from "@/lib/api";
import type { Note } from "@/types";
import AIPanel from "@/components/AIPanel";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft,
  Save,
  Trash2,
  Loader2,
  Eye,
  Edit3,
  Sparkles,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import Link from "next/link";

const AUTOSAVE_DELAY = 1500; // ms

export default function NoteEditorPage() {
  const router = useRouter();
  const params = useParams();
  const noteId = params.id as string;

  const [note, setNote] = useState<Note | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [showAI, setShowAI] = useState(true);
  const [previewMode, setPreviewMode] = useState(false);

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirty = useRef(false);

  useEffect(() => {
    if (!isAuthenticated()) router.replace("/login");
  }, [router]);

  const fetchNote = useCallback(async () => {
    try {
      const res = await notesApi.get(noteId);
      setNote(res.data);
      setTitle(res.data.title ?? "");
      setContent(res.data.content);
    } catch {
      setError("Note not found.");
    } finally {
      setLoading(false);
    }
  }, [noteId]);

  useEffect(() => {
    fetchNote();
  }, [fetchNote]);

  // Poll for AI enrichment if not ready yet
  useEffect(() => {
    if (!note) return;
    if (note.summary && note.tags?.length) return; // already enriched

    const interval = setInterval(async () => {
      try {
        const res = await notesApi.get(noteId);
        if (res.data.summary || res.data.tags?.length) {
          setNote(res.data);
          clearInterval(interval);
        }
      } catch {
        clearInterval(interval);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [note, noteId]);

  const saveNote = useCallback(async () => {
    if (!isDirty.current) return;
    setSaving(true);
    try {
      const res = await notesApi.update(noteId, {
        title: title || undefined,
        content,
      });
      setNote(res.data);
      isDirty.current = false;
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Failed to save.");
    } finally {
      setSaving(false);
    }
  }, [noteId, title, content]);

  const scheduleAutosave = useCallback(() => {
    isDirty.current = true;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(saveNote, AUTOSAVE_DELAY);
  }, [saveNote]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, []);

  const handleDelete = async () => {
    if (!confirm("Delete this note? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await notesApi.delete(noteId);
      router.push("/notes");
    } catch {
      setError("Failed to delete note.");
      setDeleting(false);
    }
  };

  const handleManualSave = () => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    saveNote();
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-brand-400 animate-spin" />
      </div>
    );
  }

  if (error && !note) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <p className="text-red-400">{error}</p>
        <Link href="/notes" className="btn-secondary">← Back to notes</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-white/[0.06] bg-surface-900/60 backdrop-blur-sm">
        <Link
          href="/notes"
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-300 transition-colors shrink-0"
          id="back-to-notes"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Notes</span>
        </Link>

        <div className="h-4 w-px bg-white/10 shrink-0" />

        {/* Title input */}
        <input
          type="text"
          id="note-title"
          className="flex-1 bg-transparent text-gray-100 font-semibold text-sm placeholder-gray-600
                     focus:outline-none min-w-0"
          placeholder="Note title…"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            scheduleAutosave();
          }}
        />

        {/* Save indicator */}
        <div className="shrink-0 flex items-center gap-1">
          {saving && <Loader2 className="w-3.5 h-3.5 text-gray-500 animate-spin" />}
          {saved && !saving && (
            <span className="text-xs text-emerald-500 animate-fade-in">Saved ✓</span>
          )}
          {error && <span className="text-xs text-red-400">{error}</span>}
        </div>

        <div className="flex items-center gap-1 ml-auto shrink-0">
          {/* Preview toggle (mobile) */}
          <button
            onClick={() => setPreviewMode(!previewMode)}
            className="sm:hidden btn-secondary px-2.5 py-1.5 text-xs"
            id="preview-toggle"
          >
            {previewMode ? <Edit3 className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>

          {/* Save */}
          <button
            id="save-note-btn"
            onClick={handleManualSave}
            disabled={saving}
            className="btn-secondary px-3 py-1.5 text-xs"
          >
            <Save className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Save</span>
          </button>

          {/* Delete */}
          <button
            id="delete-note-btn"
            onClick={handleDelete}
            disabled={deleting}
            className="btn-danger px-3 py-1.5 text-xs"
          >
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>

          {/* AI Panel toggle */}
          <button
            onClick={() => setShowAI(!showAI)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all
              ${showAI
                ? "bg-brand-500/15 border border-brand-500/30 text-brand-300"
                : "btn-secondary"
              }`}
            id="ai-panel-toggle"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">AI</span>
            {showAI ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Editor + Preview (split) */}
        <div className="flex flex-1 overflow-hidden">
          {/* Editor panel */}
          <div className={`flex flex-col ${previewMode ? "hidden sm:flex" : "flex"} w-full sm:w-1/2 border-r border-white/[0.06]`}>
            <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.04]">
              <Edit3 className="w-3.5 h-3.5 text-gray-600" />
              <span className="text-xs text-gray-600 font-medium">Markdown</span>
            </div>
            <textarea
              id="note-content"
              className="flex-1 bg-transparent resize-none p-4 sm:p-6 text-sm text-gray-200
                         font-mono leading-relaxed placeholder-gray-700
                         focus:outline-none"
              placeholder="Write your note in Markdown…

# Heading 1
## Heading 2

**Bold**, _italic_, `code`

- List item
- Another item

> Blockquote"
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                scheduleAutosave();
              }}
              spellCheck
            />
            <div className="px-4 py-2 border-t border-white/[0.04] flex items-center justify-between">
              <span className="text-xs text-gray-700 font-mono">
                {content.split(/\s+/).filter(Boolean).length} words
              </span>
              <span className="text-xs text-gray-700">
                {content.length} chars
              </span>
            </div>
          </div>

          {/* Preview panel */}
          <div className={`flex flex-col ${previewMode ? "flex" : "hidden sm:flex"} w-full sm:w-1/2 overflow-y-auto`}>
            <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.04]">
              <Eye className="w-3.5 h-3.5 text-gray-600" />
              <span className="text-xs text-gray-600 font-medium">Preview</span>
            </div>
            <div className="flex-1 p-4 sm:p-6 prose-notiq overflow-y-auto">
              {content ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {content}
                </ReactMarkdown>
              ) : (
                <p className="text-gray-700 text-sm italic">Preview will appear here…</p>
              )}
            </div>
          </div>
        </div>

        {/* AI Panel */}
        {showAI && note && (
          <div className="hidden lg:flex flex-col w-80 xl:w-96 border-l border-white/[0.06] overflow-y-auto p-4">
            <AIPanel note={{ ...note, summary: note.summary, tags: note.tags }} />
          </div>
        )}
      </div>

      {/* Mobile AI panel (bottom sheet) */}
      {showAI && note && (
        <div className="lg:hidden border-t border-white/[0.06] max-h-64 overflow-y-auto p-4">
          <AIPanel note={{ ...note, summary: note.summary, tags: note.tags }} />
        </div>
      )}
    </div>
  );
}
