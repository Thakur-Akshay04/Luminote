"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
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

// Auto-saving is disabled. Saving is done manually.

function NoteEditorContent() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const noteId = params.id as string;

  const [note, setNote] = useState<Note | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [noteType, setNoteType] = useState<string>("text");
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [checklistDescription, setChecklistDescription] = useState("");
  const [aiContext, setAiContext] = useState("");
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [showAI, setShowAI] = useState(true);
  const [previewMode, setPreviewMode] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [extractingTasks, setExtractingTasks] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  const isDirty = useRef(false);
  const titleRef = useRef("");
  const contentRef = useRef("");
  const descriptionRef = useRef("");
  const aiContextRef = useRef("");
  const drawingCanvasRef = useRef<DrawingCanvasRef>(null);

  useEffect(() => {
    if (!isAuthenticated()) router.replace("/login");
  }, [router]);

  const fetchNote = useCallback(async () => {
    if (noteId === "new") {
      const defaultType = searchParams.get("type") || "text";
      setNote({
        id: "new",
        user_id: "",
        title: "",
        content: "",
        summary: null,
        tags: null,
        note_type: defaultType,
        media_url: null,
        transcript: null,
        checklist_items: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      setTitle("");
      setContent("");
      setChecklistDescription("");
      setAiContext("");
      setNoteType(defaultType);
      setChecklistItems([]);
      titleRef.current = "";
      contentRef.current = "";
      descriptionRef.current = "";
      aiContextRef.current = "";
      setLoading(false);
      isDirty.current = true;
      setHasUnsavedChanges(true);
      return;
    }

    try {
      const res = await notesApi.get(noteId);
      setNote(res.data);
      setTitle(res.data.title ?? "");
      setContent(res.data.content);
      setNoteType(res.data.note_type || "text");
      setChecklistItems(res.data.checklist_items || []);
      titleRef.current = res.data.title ?? "";
      contentRef.current = res.data.content;
      
      if (res.data.note_type === "checklist" && res.data.content) {
        try {
          const data = JSON.parse(res.data.content);
          setChecklistDescription(data.description || "");
          setAiContext(data.ai_context || "");
          descriptionRef.current = data.description || "";
          aiContextRef.current = data.ai_context || "";
        } catch {
          setChecklistDescription(res.data.content);
          setAiContext("");
          descriptionRef.current = res.data.content;
          aiContextRef.current = "";
        }
      } else {
        setChecklistDescription("");
        setAiContext("");
        descriptionRef.current = "";
        aiContextRef.current = "";
      }
    } catch {
      setError("Note not found.");
    } finally {
      setLoading(false);
    }
  }, [noteId, searchParams]);

  useEffect(() => {
    if (noteId) {
      fetchNote();
    }
  }, [fetchNote, noteId]);

  // Poll for AI enrichment if not ready yet
  useEffect(() => {
    if (!note || noteType !== "text") return;
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
  }, [note, noteId, noteType]);

  const saveNote = useCallback(async () => {
    if (!isDirty.current) return;
    setSaving(true);
    setError(null);
    try {
      if (noteId === "new") {
        const res = await notesApi.create({
          title: titleRef.current || undefined,
          content: contentRef.current || "",
          note_type: noteType,
        });
        setNote(res.data);
        isDirty.current = false;
        setHasUnsavedChanges(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        window.history.replaceState(null, "", `/notes/${res.data.id}`);
        router.replace(`/notes/${res.data.id}`);
      } else {
        const res = await notesApi.update(noteId, {
          title: titleRef.current || undefined,
          content: contentRef.current,
          note_type: noteType,
        });
        setNote(res.data);
        isDirty.current = false;
        setHasUnsavedChanges(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      setError("Failed to save.");
    } finally {
      setSaving(false);
    }
  }, [noteId, noteType, router]);

  const markDirty = useCallback(() => {
    isDirty.current = true;
    setHasUnsavedChanges(true);
  }, []);

  const handleExtractTasks = async () => {
    setExtractingTasks(true);
    setExtractError(null);
    try {
      let activeId = noteId;
      if (noteId === "new") {
        const res = await notesApi.create({
          title: titleRef.current || undefined,
          content: contentRef.current || "",
          note_type: noteType,
        });
        setNote(res.data);
        isDirty.current = false;
        setHasUnsavedChanges(false);
        activeId = res.data.id;
        window.history.replaceState(null, "", `/notes/${activeId}`);
        router.replace(`/notes/${activeId}`);
      } else if (isDirty.current) {
        const res = await notesApi.update(noteId, {
          title: titleRef.current || undefined,
          content: contentRef.current,
          note_type: noteType,
        });
        setNote(res.data);
        isDirty.current = false;
        setHasUnsavedChanges(false);
      }

      const res = await notesApi.extractTasks(activeId);
      const extracted = res.data.tasks || [];

      if (extracted.length === 0) {
        setExtractError("No action items found in this note's content.");
        return;
      }

      const existingTexts = new Set(checklistItems.map((item) => item.text.toLowerCase()));
      const newItems = extracted.filter(
        (item) => !existingTexts.has(item.text.toLowerCase())
      );

      const merged = [...checklistItems, ...newItems];
      setChecklistItems(merged);
      if (note) {
        setNote({ ...note, checklist_items: merged });
      }

      await notesApi.update(activeId, { checklist_items: merged });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      console.error("AI task extraction error:", err);
      setExtractError(
        err.response?.data?.detail || "AI task extraction failed. Make sure to enter context details first."
      );
    } finally {
      setExtractingTasks(false);
    }
  };

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
    let activeId = noteId;
    if (noteId === "new") {
      setSaving(true);
      setError(null);
      try {
        const res = await notesApi.create({
          title: titleRef.current || undefined,
          content: contentRef.current || "",
          note_type: noteType,
        });
        setNote(res.data);
        isDirty.current = false;
        setHasUnsavedChanges(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        activeId = res.data.id;
        window.history.replaceState(null, "", `/notes/${activeId}`);
        router.replace(`/notes/${activeId}`);
      } catch {
        setError("Failed to create note.");
        setSaving(false);
        return;
      }
    }

    if (noteType === "drawing" && drawingCanvasRef.current) {
      await drawingCanvasRef.current.save(activeId);
    } else {
      isDirty.current = true;
      saveNote();
    }
  };

  const handleNoteTypeChange = async (type: string) => {
    setNoteType(type);
    if (noteId === "new") {
      return;
    }
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
            markDirty();
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
          {hasUnsavedChanges && !saving && (
            <span className="text-xs text-amber-500 animate-fade-in font-medium">Unsaved changes</span>
          )}
          {saving && <Loader2 className="w-3.5 h-3.5 text-gray-500 animate-spin" />}
          {saved && !saving && (
            <span className="text-xs text-emerald-500 animate-fade-in font-medium">Saved ✓</span>
          )}
          {error && <span className="text-xs text-red-400 font-medium">{error}</span>}
        </div>

        <div className="flex items-center gap-1 ml-auto shrink-0">
          {/* Preview toggle (mobile) */}
          {noteType !== "drawing" && (
            <button
              onClick={() => setPreviewMode(!previewMode)}
              className="sm:hidden btn-secondary px-2.5 py-1.5 text-xs"
              id="preview-toggle"
            >
              {previewMode ? <Edit3 className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          )}

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
          {noteType === "text" && (
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
          )}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Editor + Preview (split) */}
        <div className="flex flex-1 overflow-hidden">
          
          {/* EDITOR PANEL (LEFT) */}
          <div className={`flex flex-col ${previewMode ? "hidden sm:flex" : "flex"} ${
            noteType === "drawing" 
              ? "w-full overflow-hidden h-full" 
              : noteType === "checklist"
                ? "w-full sm:w-[65%] border-r border-white/[0.06] overflow-y-auto"
                : "w-full sm:w-1/2 border-r border-white/[0.06] overflow-y-auto"
          }`}>
            
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
                    markDirty();
                  }}
                  spellCheck
                />
              </>
            )}

            {noteType === "drawing" && (
              <div className="p-3 pb-1 sm:p-4 sm:pb-1 flex-1 flex flex-col min-h-0">
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
                    onSaveBeforeAction={async () => {
                      // Save note and return new note's ID
                      setSaving(true);
                      setError(null);
                      try {
                        const res = await notesApi.create({
                          title: titleRef.current || undefined,
                          content: contentRef.current || "",
                          note_type: noteType,
                        });
                        setNote(res.data);
                        isDirty.current = false;
                        setHasUnsavedChanges(false);
                        setSaved(true);
                        setTimeout(() => setSaved(false), 2000);
                        window.history.replaceState(null, "", `/notes/${res.data.id}`);
                        router.replace(`/notes/${res.data.id}`);
                        return res.data.id;
                      } catch {
                        setError("Failed to create note before recording audio.");
                        throw new Error("Init note failed");
                      } finally {
                        setSaving(false);
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
                <div className="p-4 sm:p-6 flex-1 flex flex-col gap-5 overflow-y-auto">
                  {/* Description Box */}
                  {(() => {
                    const descWordCount = checklistDescription.trim() === "" ? 0 : checklistDescription.trim().split(/\s+/).filter(Boolean).length;
                    return (
                      <div className="flex flex-col gap-1.5 shrink-0">
                        <label htmlFor="checklist-desc" className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                          Checklist Sub-title / Short Description
                        </label>
                        <div className="relative w-full">
                          <input
                            type="text"
                            id="checklist-desc"
                            className="w-full bg-surface-900/50 border border-white/[0.04] focus:border-brand-500/50 rounded-xl pl-3 pr-20 py-2 text-xs text-gray-200
                                       placeholder-gray-700 focus:outline-none transition-all"
                            placeholder="Add a short subtitle or description for this checklist..."
                            value={checklistDescription}
                            onChange={(e) => {
                              const val = e.target.value;
                              const words = val.trim().split(/\s+/).filter(Boolean);
                              if (words.length <= 25) {
                                setChecklistDescription(val);
                                descriptionRef.current = val;
                                contentRef.current = JSON.stringify({
                                  description: val,
                                  ai_context: aiContextRef.current,
                                });
                                markDirty();
                              } else {
                                const truncated = val.split(/\s+/).slice(0, 25).join(" ");
                                setChecklistDescription(truncated);
                                descriptionRef.current = truncated;
                                contentRef.current = JSON.stringify({
                                  description: truncated,
                                  ai_context: aiContextRef.current,
                                });
                                markDirty();
                              }
                            }}
                            spellCheck
                          />
                          <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-bold tracking-wider pointer-events-none select-none ${descWordCount >= 25 ? "text-red-400" : "text-gray-500"}`}>
                            {descWordCount}/25 words
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="h-px bg-white/[0.04] shrink-0" />

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
          {noteType !== "drawing" && (
            <div className={`flex flex-col ${previewMode ? "flex" : "hidden sm:flex"} ${
              noteType === "checklist" ? "w-full sm:w-[35%]" : "w-full sm:w-1/2"
            } overflow-y-auto`}>
              
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
                          Note: The audio transcript is saved inside your note database record and will automatically enrich search insights.
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
                  <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.04] bg-surface-900/40">
                    <Sparkles className="w-3.5 h-3.5 text-brand-400 fill-brand-400/20" />
                    <span className="text-xs text-gray-200 font-semibold uppercase tracking-wider">AI Task Generator</span>
                  </div>
                  <div className="p-5 flex-1 flex flex-col gap-4">
                    <div className="text-xs text-neutral-400 leading-relaxed">
                      Type or paste context, meeting notes, project briefs, or general thoughts below. The AI will extract actionable checklist items and add them to your checklist items.
                    </div>
                    
                    <textarea
                      id="note-checklist-content"
                      className="flex-1 min-h-[180px] bg-surface-900/40 border border-white/[0.04] focus:border-brand-500/50 rounded-xl p-4 text-sm text-gray-200
                                 font-mono leading-relaxed placeholder-gray-700
                                 focus:outline-none transition-all resize-none"
                      placeholder="e.g. 'Must call the plumber to fix the kitchen sink by Tuesday. Also send final slides to the team and schedule a sync with the marketing lead.'..."
                      value={aiContext}
                      onChange={(e) => {
                        setAiContext(e.target.value);
                        aiContextRef.current = e.target.value;
                        contentRef.current = JSON.stringify({
                          description: descriptionRef.current,
                          ai_context: e.target.value,
                        });
                        markDirty();
                      }}
                      spellCheck
                    />

                    {extractError && (
                      <div className="px-3.5 py-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400 font-medium">
                        {extractError}
                      </div>
                    )}

                    <button
                      onClick={handleExtractTasks}
                      disabled={extractingTasks || !aiContext.trim()}
                      className="btn-primary w-full py-2.5 text-xs flex items-center justify-center gap-1.5 shadow-md shadow-brand-500/10 hover:shadow-brand-500/20 transition-all font-semibold"
                    >
                      {extractingTasks ? (
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                      ) : (
                        <Sparkles className="w-4 h-4 text-white fill-white" />
                      )}
                      <span>{extractingTasks ? "Extracting Tasks..." : "Generate AI Checklist Items"}</span>
                    </button>
                  </div>
                </>
              )}

            </div>
          )}
        </div>

        {/* AI Panel */}
        {noteType === "text" && showAI && note && (
          <div className="hidden lg:flex flex-col w-80 xl:w-96 border-l border-white/[0.06] overflow-y-auto p-4">
            <AIPanel note={note} onUpdateNote={setNote} />
          </div>
        )}
      </div>

      {/* Mobile AI panel (bottom sheet) */}
      {noteType === "text" && showAI && note && (
        <div className="lg:hidden border-t border-white/[0.06] max-h-64 overflow-y-auto p-4">
          <AIPanel note={note} onUpdateNote={setNote} />
        </div>
      )}
    </div>
  );
}

export default function NoteEditorPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-surface-800">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    }>
      <NoteEditorContent />
    </Suspense>
  );
}
