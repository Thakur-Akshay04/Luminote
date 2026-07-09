"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { notesApi } from "@/lib/api";
import type { Note, ChecklistItem } from "@/types";
import AIPanel from "@/components/AIPanel";
import DrawingCanvas, { DrawingCanvasRef } from "@/components/DrawingCanvas";
import AudioRecorder from "@/components/AudioRecorder";
import ChecklistEditor from "@/components/ChecklistEditor";
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
  FileText,
  Palette,
  Mic,
  ListTodo,
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
  const [noteType, setNoteType] = useState<string>("text");
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [showAI, setShowAI] = useState(true);
  const [previewMode, setPreviewMode] = useState(false);

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirty = useRef(false);
  const titleRef = useRef("");
  const contentRef = useRef("");
  const drawingCanvasRef = useRef<DrawingCanvasRef>(null);

  useEffect(() => {
    if (!isAuthenticated()) router.replace("/login");
  }, [router]);

  const fetchNote = useCallback(async () => {
    try {
      const res = await notesApi.get(noteId);
      setNote(res.data);
      setTitle(res.data.title ?? "");
      setContent(res.data.content);
      setNoteType(res.data.note_type || "text");
      setChecklistItems(res.data.checklist_items || []);
      titleRef.current = res.data.title ?? "";
      contentRef.current = res.data.content;
    } catch {
      setError("Note not found.");
    } finally {
      setLoading(false);
    }
  }, [noteId]);

  useEffect(() => {
    if (noteId) {
      fetchNote();
    }
  }, [fetchNote, noteId]);

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
        title: titleRef.current || undefined,
        content: contentRef.current,
        note_type: noteType,
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
  }, [noteId, noteType]);

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

  const handleManualSave = async () => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    if (noteType === "drawing" && drawingCanvasRef.current) {
      await drawingCanvasRef.current.save();
    }
    isDirty.current = true;
    saveNote();
  };

  const handleNoteTypeChange = async (type: string) => {
    setNoteType(type);
    try {
      setSaving(true);
      const res = await notesApi.update(noteId, { note_type: type });
      setNote(res.data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Failed to update note type:", err);
      setError("Failed to update note type.");
    } finally {
      setSaving(false);
    }
  };

  const handleTranscriptUpdate = (newTranscript: string) => {
    if (!note) return;
    setNote({ ...note, transcript: newTranscript });
    // Also append the transcript to note content for AI pipelines
    const updatedContent = content ? `${content}\n\nTranscript:\n${newTranscript}` : newTranscript;
    setContent(updatedContent);
    contentRef.current = updatedContent;
    isDirty.current = true;
    saveNote();
  };

  const handleChecklistUpdate = (newItems: ChecklistItem[]) => {
    setChecklistItems(newItems);
    if (note) {
      setNote({ ...note, checklist_items: newItems });
    }
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

  const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 px-4 sm:px-6 py-3 border-b border-white/[0.06] bg-surface-900/60 backdrop-blur-sm">
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
                     focus:outline-none min-w-[120px]"
          placeholder="Note title…"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            titleRef.current = e.target.value;
            scheduleAutosave();
          }}
        />

        {/* Note Type Selector Tabs */}
        <div className="flex bg-neutral-900 rounded-lg p-0.5 border border-neutral-800 shrink-0 select-none">
          {[
            { id: "text", label: "Text", icon: FileText },
            { id: "drawing", label: "Drawing", icon: Palette },
            { id: "audio", label: "Voice", icon: Mic },
            { id: "checklist", label: "Task", icon: ListTodo },
          ].map((type) => {
            const Icon = type.icon;
            const isSelected = noteType === type.id;
            return (
              <button
                key={type.id}
                type="button"
                onClick={() => handleNoteTypeChange(type.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-all
                  ${isSelected
                    ? "bg-text-primary text-text-inverse font-bold"
                    : "text-neutral-400 hover:text-neutral-200"
                  }`}
                title={`${type.label} Note`}
                id={`note-type-${type.id}`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden md:inline">{type.label}</span>
              </button>
            );
          })}
        </div>

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
          
          {/* EDITOR PANEL (LEFT) */}
          <div className={`flex flex-col ${previewMode ? "hidden sm:flex" : "flex"} w-full sm:w-1/2 border-r border-white/[0.06] overflow-y-auto`}>
            
            {noteType === "text" && (
              <>
                <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.04]">
                  <Edit3 className="w-3.5 h-3.5 text-gray-600" />
                  <span className="text-xs text-gray-600 font-medium">Markdown Editor</span>
                </div>
                <textarea
                  id="note-content"
                  className="flex-1 bg-transparent resize-none p-4 sm:p-6 text-sm text-gray-200
                             font-mono leading-relaxed placeholder-gray-700
                             focus:outline-none"
                  placeholder="Write your note in Markdown…"
                  value={content}
                  onChange={(e) => {
                    setContent(e.target.value);
                    contentRef.current = e.target.value;
                    scheduleAutosave();
                  }}
                  spellCheck
                />
              </>
            )}

            {noteType === "drawing" && (
              <>
                <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.04]">
                  <Palette className="w-3.5 h-3.5 text-gray-600" />
                  <span className="text-xs text-gray-600 font-medium">Freehand Sketch Canvas</span>
                </div>
                <div className="p-4 sm:p-6 flex-1">
                  <DrawingCanvas 
                    ref={drawingCanvasRef}
                    noteId={noteId} 
                    mediaUrl={note?.media_url || null} 
                    onDrawingSave={(newUrl) => {
                      if (note) {
                        setNote({ ...note, media_url: newUrl });
                      }
                    }}
                  />
                </div>
              </>
            )}

            {noteType === "audio" && (
              <>
                <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.04]">
                  <Mic className="w-3.5 h-3.5 text-gray-600" />
                  <span className="text-xs text-gray-600 font-medium">Audio Transcriber</span>
                </div>
                <div className="p-4 sm:p-6 flex-1">
                  <AudioRecorder
                    noteId={noteId}
                    mediaUrl={note?.media_url || null}
                    transcript={note?.transcript || null}
                    onTranscriptUpdate={handleTranscriptUpdate}
                    onMediaUrlUpdate={(newUrl) => {
                      if (note) {
                        setNote({ ...note, media_url: newUrl });
                      }
                    }}
                  />
                </div>
              </>
            )}

            {noteType === "checklist" && (
              <>
                <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.04]">
                  <ListTodo className="w-3.5 h-3.5 text-gray-600" />
                  <span className="text-xs text-gray-600 font-medium">Checklist Planner</span>
                </div>
                <div className="p-4 sm:p-6 flex-1">
                  <ChecklistEditor
                    noteId={noteId}
                    items={checklistItems}
                    onItemsUpdate={handleChecklistUpdate}
                  />
                </div>
              </>
            )}

            {/* Editor info footer */}
            {noteType === "text" && (
              <div className="px-4 py-2 border-t border-white/[0.04] flex items-center justify-between mt-auto">
                <span className="text-xs text-gray-700 font-mono">
                  {content.split(/\s+/).filter(Boolean).length} words
                </span>
                <span className="text-xs text-gray-700">
                  {content.length} chars
                </span>
              </div>
            )}
          </div>

          {/* PREVIEW PANEL (RIGHT) */}
          <div className={`flex flex-col ${previewMode ? "flex" : "hidden sm:flex"} w-full sm:w-1/2 overflow-y-auto`}>
            
            {noteType === "text" && (
              <>
                <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.04]">
                  <Eye className="w-3.5 h-3.5 text-gray-600" />
                  <span className="text-xs text-gray-600 font-medium">Markdown Preview</span>
                </div>
                <div className="flex-1 p-4 sm:p-6 prose-luminote overflow-y-auto">
                  {content ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {content}
                    </ReactMarkdown>
                  ) : (
                    <p className="text-gray-700 text-sm italic">Preview will appear here…</p>
                  )}
                </div>
              </>
            )}

            {noteType === "drawing" && (
              <>
                <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.04]">
                  <Eye className="w-3.5 h-3.5 text-gray-600" />
                  <span className="text-xs text-gray-600 font-medium">Saved Drawing Preview</span>
                </div>
                <div className="flex-1 p-4 sm:p-6 flex flex-col items-center justify-center">
                  {note?.media_url ? (
                    <div className="glass p-2 max-w-full overflow-hidden flex flex-col items-center gap-2 animate-fade-in shadow-lg">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`${baseUrl}${note.media_url}?t=${Date.now()}`}
                        alt="Note drawing"
                        className="max-h-[350px] object-contain rounded-xs border border-white/[0.06] bg-[#18181b]"
                      />
                      <span className="text-[10px] text-gray-500 uppercase tracking-widest font-mono">
                        Saved Drawing PNG
                      </span>
                    </div>
                  ) : (
                    <div className="text-center text-gray-600 text-sm italic">
                      No saved drawing yet. Create one and click &quot;Save Drawing&quot; on the left canvas.
                    </div>
                  )}
                </div>
              </>
            )}

            {noteType === "audio" && (
              <>
                <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.04]">
                  <Eye className="w-3.5 h-3.5 text-gray-600" />
                  <span className="text-xs text-gray-600 font-medium">Voice Note Transcript</span>
                </div>
                <div className="flex-1 p-4 sm:p-6 prose-luminote overflow-y-auto">
                  {note?.transcript ? (
                    <div className="space-y-4">
                      <p className="text-gray-300 text-sm leading-relaxed">{note.transcript}</p>
                      <hr className="border-white/[0.06]" />
                      <div className="text-xs text-gray-500 italic">
                        Note: The audio transcript is saved inside your note database record and will automatically enrich search and summary insights.
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-700 text-sm italic">
                      Transcribed text will be generated here when you stop recording.
                    </p>
                  )}
                </div>
              </>
            )}

            {noteType === "checklist" && (
              <>
                <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.04]">
                  <Edit3 className="w-3.5 h-3.5 text-gray-600" />
                  <span className="text-xs text-gray-600 font-medium">Context / Description Editor</span>
                </div>
                <div className="flex-1 flex flex-col min-h-[300px]">
                  <textarea
                    id="note-checklist-content"
                    className="flex-1 bg-transparent resize-none p-4 sm:p-6 text-sm text-gray-200
                               font-mono leading-relaxed placeholder-gray-700
                               focus:outline-none"
                    placeholder="Write details, descriptions, or general notes regarding this checklist here…"
                    value={content}
                    onChange={(e) => {
                      setContent(e.target.value);
                      contentRef.current = e.target.value;
                      scheduleAutosave();
                    }}
                    spellCheck
                  />
                  <div className="px-4 py-2 border-t border-white/[0.04] flex items-center justify-between text-xs text-gray-700 font-mono">
                    <span>
                      {content.split(/\s+/).filter(Boolean).length} words
                    </span>
                  </div>
                </div>
              </>
            )}

          </div>
        </div>

        {/* AI Panel */}
        {showAI && note && (
          <div className="hidden lg:flex flex-col w-80 xl:w-96 border-l border-white/[0.06] overflow-y-auto p-4">
            <AIPanel note={note} onUpdateNote={setNote} />
          </div>
        )}
      </div>

      {/* Mobile AI panel (bottom sheet) */}
      {showAI && note && (
        <div className="lg:hidden border-t border-white/[0.06] max-h-64 overflow-y-auto p-4">
          <AIPanel note={note} onUpdateNote={setNote} />
        </div>
      )}
    </div>
  );
}
