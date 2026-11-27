"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import dynamic from "next/dynamic";
import Link from "next/link";

import { notesApi, BASE_URL } from "@/lib/api";
import type { Note, ChecklistItem } from "@/types";
import AIPanel from "@/components/AIPanel";
import ConfirmModal from "@/components/ConfirmModal";
import ChecklistEditor from "@/components/ChecklistEditor";
import NoteEditorSidebar from "@/components/NoteEditorSidebar";
import NoteRichTextToolbar, { type ClipboardItem } from "@/components/NoteRichTextToolbar";

import { useEditor, EditorContent, ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import FontFamily from "@tiptap/extension-font-family";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import ImageExtension from "@tiptap/extension-image";
import LinkExtension from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { Table as TableExtension } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";

import {
  ArrowLeft,
  Save,
  Trash2,
  Loader2,
  Eye,
  Edit3,
  Brain,
  Wand2,
  ChevronRight,
  ChevronLeft,
  FileText,
  Mic,
  ListTodo,
} from "lucide-react";

const AudioRecorder = dynamic(() => import("@/components/AudioRecorder"), { ssr: false });

const TextStyleExtended = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: (element) => element.style.fontSize,
        renderHTML: (attributes) => {
          if (!attributes.fontSize) return {};
          return { style: `font-size: ${attributes.fontSize}` };
        },
      },
    };
  },
});

const generateSecureId = (): string => {
  const cryptoObj = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (cryptoObj?.getRandomValues) {
    const array = new Uint32Array(1);
    cryptoObj.getRandomValues(array);
    return array[0].toString();
  }
  return `fallback-id-${Date.now()}`;
};

const isImageText = (text: string): boolean =>
  text.startsWith("data:image/") || /\.(jpeg|jpg|gif|png|webp|svg)$/i.test(text.trim());

const parseEditorInitialContent = (rawContent: string): unknown => {
  if (!rawContent) return "";
  try {
    const parsed = JSON.parse(rawContent);
    if (parsed && typeof parsed === "object") {
      if (parsed.type === "doc") return parsed;
      if ("description" in parsed || "ai_context" in parsed) return parsed.description || "";
    }
  } catch {
    return rawContent;
  }
  return rawContent;
};

const ResizableImageNodeView = (props: NodeViewProps) => {
  const { node, updateAttributes, selected } = props;
  const imgRef = useRef<HTMLImageElement>(null);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = imgRef.current ? imgRef.current.clientWidth : 300;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const currentWidth = startWidth + (moveEvent.clientX - startX);
      const newWidth = Math.max(80, Math.min(1200, currentWidth));
      updateAttributes({ width: `${newWidth}px` });
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  return (
    <NodeViewWrapper className="inline-block relative group my-2">
      <div className="relative inline-block select-none">
        <img
          ref={imgRef}
          src={node.attrs.src}
          alt={node.attrs.alt}
          style={{
            width: node.attrs.width || "100%",
            height: "auto",
            display: "block",
            maxWidth: "100%",
          }}
          className={`rounded-lg transition-all duration-200 border-2 ${selected ? "border-brand-500 shadow-lg ring-2 ring-brand-500/20" : "border-transparent"
            }`}
        />
        <button
          type="button"
          onMouseDown={onMouseDown}
          aria-label="Resize image"
          className="absolute bottom-1.5 right-1.5 w-3.5 h-3.5 bg-brand-500 hover:bg-brand-400 rounded flex items-center justify-center cursor-se-resize opacity-0 group-hover:opacity-100 transition-opacity duration-150 shadow-md border border-white/20 select-none"
        >
          <svg aria-hidden="true" className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="22" y1="6" x2="6" y2="22" />
            <line x1="22" y1="14" x2="14" y2="22" />
          </svg>
        </button>
      </div>
    </NodeViewWrapper>
  );
};

const ResizableImage = ImageExtension.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: "100%",
        parseHTML: (element) => element.getAttribute("width"),
        renderHTML: (attributes) => ({ width: attributes.width }),
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageNodeView);
  },
});

function getEditorPanelClass(noteType: string, previewMode: boolean): string {
  const display = previewMode ? "hidden sm:flex" : "flex";
  if (noteType === "checklist") return `flex flex-col ${display} w-full sm:w-[65%] border-r border-white/[0.06] overflow-y-auto`;
  if (noteType === "text" || noteType === "audio") return `flex flex-col ${display} w-full overflow-y-auto`;
  return `flex flex-col ${display} w-full sm:w-1/2 border-r border-white/[0.06] overflow-y-auto`;
}

function ChecklistDescriptionField({
  value,
  onChange,
}: Readonly<{
  value: string;
  onChange: (nextVal: string) => void;
}>) {
  const descWordCount = value.trim() === "" ? 0 : value.trim().split(/\s+/).filter(Boolean).length;
  return (
    <div className="flex flex-col gap-1.5 shrink-0">
      <label htmlFor="checklist-desc" className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
        Checklist Sub-title / Short Description
      </label>
      <div className="relative w-full">
        <input
          type="text"
          id="checklist-desc"
          className="w-full bg-surface-900/50 border border-white/[0.04] focus:border-brand-500/50 rounded-xl pl-3 pr-20 py-2 text-xs text-gray-200 placeholder-gray-700 focus:outline-none transition-all"
          placeholder="Add a short subtitle or description for this checklist..."
          value={value}
          onChange={(e) => {
            const raw = e.target.value;
            const words = raw.trim().split(/\s+/).filter(Boolean);
            const nextVal = words.length <= 25 ? raw : raw.split(/\s+/).slice(0, 25).join(" ");
            onChange(nextVal);
          }}
          spellCheck
        />
        <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-bold tracking-wider pointer-events-none select-none ${descWordCount >= 25 ? "text-red-400" : "text-gray-500"}`}>
          {descWordCount}/25 words
        </span>
      </div>
    </div>
  );
}

const NOTE_TYPE_OPTIONS = [
  { id: "text", label: "Text", icon: FileText },
  { id: "audio", label: "Voice", icon: Mic },
  { id: "checklist", label: "Task", icon: ListTodo },
] as const;

function SaveStatusIndicator({
  hasUnsavedChanges,
  saving,
  saved,
  error,
}: Readonly<{
  hasUnsavedChanges: boolean;
  saving: boolean;
  saved: boolean;
  error: string | null;
}>) {
  return (
    <div className="shrink-0 flex items-center">
      {hasUnsavedChanges && !saving && (
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[9px] font-bold uppercase tracking-wider animate-fade-in">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> Unsaved
        </span>
      )}
      {saving && (
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[9px] font-bold uppercase tracking-wider animate-fade-in">
          <Loader2 className="w-2.5 h-2.5 text-blue-400 animate-spin" /> Saving
        </span>
      )}
      {saved && !saving && (
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-bold uppercase tracking-wider animate-fade-in">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Saved
        </span>
      )}
      {error && (
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-[9px] font-bold uppercase tracking-wider animate-fade-in">
          Error
        </span>
      )}
    </div>
  );
}

function NoteEditorHeader({
  title,
  noteType,
  hasUnsavedChanges,
  saving,
  saved,
  deleting,
  error,
  previewMode,
  showAI,
  onTitleChange,
  onNoteTypeChange,
  onTogglePreview,
  onManualSave,
  onDelete,
  onToggleAI,
}: Readonly<{
  title: string;
  noteType: string;
  hasUnsavedChanges: boolean;
  saving: boolean;
  saved: boolean;
  deleting: boolean;
  error: string | null;
  previewMode: boolean;
  showAI: boolean;
  onTitleChange: (value: string) => void;
  onNoteTypeChange: (type: string) => void;
  onTogglePreview: () => void;
  onManualSave: () => void;
  onDelete: () => void;
  onToggleAI: () => void;
}>) {
  return (
    <div className="no-print flex flex-wrap items-center gap-4 px-5 py-3.5 border-b border-sidebar-border bg-sidebar/85 backdrop-blur-xl shadow-lg relative z-30 select-none">
      <Link
        href="/notes"
        className="flex items-center justify-center w-8 h-8 rounded-xl bg-white/[0.02] border border-white/[0.06] text-gray-400 hover:text-white hover:bg-white/[0.06] hover:border-white/[0.1] active:scale-95 transition-all shrink-0"
        id="back-to-notes"
        title="Back to Notes"
      >
        <ArrowLeft className="w-4 h-4" />
      </Link>

      <div className="h-4 w-px bg-white/10 shrink-0" />

      <input
        type="text"
        id="note-title"
        className="flex-1 bg-transparent text-white font-bold text-base placeholder-neutral-600 focus:outline-none min-w-[140px] tracking-tight py-1 transition-all"
        placeholder="Untitled Note…"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
      />

      <div className="flex bg-white/[0.02] border border-white/[0.05] rounded-xl p-1 shrink-0 select-none items-center gap-1">
        {NOTE_TYPE_OPTIONS.map((type) => {
          const Icon = type.icon;
          const isSelected = noteType === type.id;
          return (
            <button
              key={type.id}
              type="button"
              onClick={() => onNoteTypeChange(type.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-300 ${isSelected
                ? "bg-gradient-to-tr from-[#f58c24] to-[#f9a748] text-[#1a0f05] shadow-md shadow-brand-500/15 scale-102 border border-brand-400/30"
                : "text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.03]"
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

      <SaveStatusIndicator
        hasUnsavedChanges={hasUnsavedChanges}
        saving={saving}
        saved={saved}
        error={error}
      />

      <div className="flex items-center gap-2.5 ml-auto shrink-0">
        {noteType !== "text" && (
          <button
            type="button"
            onClick={onTogglePreview}
            className="sm:hidden w-9 h-9 rounded-xl bg-neutral-900 border border-white/[0.08] hover:bg-neutral-800 text-gray-300 flex items-center justify-center text-xs active:scale-95 transition-all"
            id="preview-toggle"
          >
            {previewMode ? <Edit3 className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        )}

        <button
          type="button"
          id="save-note-btn"
          onClick={onManualSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-neutral-900 border border-white/[0.08] hover:bg-neutral-800 hover:border-white/[0.15] text-white text-xs font-semibold shadow-md active:scale-95 transition-all"
        >
          <Save className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Save</span>
        </button>

        <button
          type="button"
          id="delete-note-btn"
          onClick={onDelete}
          disabled={deleting}
          className="flex items-center justify-center w-9 h-9 rounded-xl bg-neutral-900 border border-red-500/10 hover:bg-red-500/10 hover:border-red-500/25 text-red-400 hover:text-red-300 shadow-md active:scale-95 transition-all"
        >
          {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
        </button>

        {noteType === "text" && (
          <button
            type="button"
            onClick={onToggleAI}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold shadow-md active:scale-95 transition-all ${showAI
              ? "bg-gradient-to-tr from-[#f58c24] to-[#e3af35] text-[#1a0f05] border border-brand-400/30 shadow-lg shadow-brand-500/15"
              : "bg-neutral-900 border border-brand-500/20 text-brand-400 hover:bg-brand-500/10 hover:border-brand-500/35"
              }`}
            id="ai-panel-toggle"
          >
            <Brain className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">AI</span>
            {showAI ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
          </button>
        )}
      </div>
    </div>
  );
}

function ChecklistGeneratorPanel({
  previewMode,
  aiContext,
  extractError,
  extractingTasks,
  onAiContextChange,
  onExtractTasks,
}: Readonly<{
  previewMode: boolean;
  aiContext: string;
  extractError: string | null;
  extractingTasks: boolean;
  onAiContextChange: (value: string) => void;
  onExtractTasks: () => void;
}>) {
  return (
    <div className={`flex flex-col ${previewMode ? "flex" : "hidden sm:flex"} w-full sm:w-[35%] overflow-y-auto`}>
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.04] bg-surface-900/40">
        <Brain className="w-3.5 h-3.5 text-brand-400 animate-pulse" />
        <span className="text-xs text-gray-200 font-semibold uppercase tracking-wider">AI Task Generator</span>
      </div>
      <div className="p-5 flex-1 flex flex-col gap-4">
        <div className="text-xs text-neutral-400 leading-relaxed">
          Type or paste context, meeting notes, project briefs, or general thoughts below. The AI will extract actionable checklist items and add them to your checklist items.
        </div>

        <textarea
          id="note-checklist-content"
          className="flex-1 min-h-[180px] bg-surface-900/40 border border-white/[0.04] focus:border-brand-500/50 rounded-xl p-4 text-sm text-gray-200 font-mono leading-relaxed placeholder-gray-700 focus:outline-none transition-all resize-none"
          placeholder="e.g. 'Must call the plumber to fix the kitchen sink by Tuesday. Also send final slides to the team and schedule a sync with the marketing lead.'..."
          value={aiContext}
          onChange={(e) => onAiContextChange(e.target.value)}
          spellCheck
        />

        {extractError && (
          <div className="px-3.5 py-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400 font-medium">
            {extractError}
          </div>
        )}

        <button
          type="button"
          onClick={onExtractTasks}
          disabled={extractingTasks || !aiContext.trim()}
          className="btn-primary w-full py-2.5 text-xs flex items-center justify-center gap-1.5 shadow-md shadow-brand-500/10 hover:shadow-brand-500/20 transition-all font-semibold"
        >
          {extractingTasks ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Wand2 className="w-4 h-4 text-white" />}
          <span>{extractingTasks ? "Extracting Tasks..." : "Generate AI Checklist Items"}</span>
        </button>
      </div>
    </div>
  );
}

function PrintDocumentHeader({ title, createdAt }: Readonly<{ title: string; createdAt?: string }>) {
  const dateObj = createdAt ? new Date(createdAt) : new Date();
  return (
    <div className="only-print flex-col items-center justify-center border-b-2 border-neutral-300 pb-4 mb-6 w-full text-center">
      <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">Luminote</span>
      <h2 className="text-2xl font-bold text-black">{title || "Untitled Note"}</h2>
      <div className="flex gap-4 mt-2 text-xs text-neutral-500 justify-center font-medium">
        <span>Date: {dateObj.toLocaleDateString()}</span>
        <span>Time: {dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
    </div>
  );
}

function AudioNotePanel({
  noteId,
  mediaUrl,
  transcript,
  onTranscriptUpdate,
  onMediaUrlUpdate,
  onSaveBeforeAction,
}: Readonly<{
  noteId: string;
  mediaUrl: string | null;
  transcript: string | null;
  onTranscriptUpdate: (newTranscript: string) => void;
  onMediaUrlUpdate: (newUrl: string) => void;
  onSaveBeforeAction: () => Promise<string>;
}>) {
  return (
    <>
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.04]">
        <Mic className="w-3.5 h-3.5 text-gray-600" />
        <span className="text-xs text-gray-600 font-medium">Audio Transcriber</span>
      </div>
      <div className="p-4 sm:p-6 flex-1">
        <AudioRecorder
          noteId={noteId}
          mediaUrl={mediaUrl}
          transcript={transcript}
          onTranscriptUpdate={onTranscriptUpdate}
          onMediaUrlUpdate={onMediaUrlUpdate}
          onSaveBeforeAction={onSaveBeforeAction}
        />
      </div>
    </>
  );
}

function ChecklistNotePanel({
  noteId,
  checklistDescription,
  checklistItems,
  onDescriptionChange,
  onItemsUpdate,
  onSaveBeforeAction,
}: Readonly<{
  noteId: string;
  checklistDescription: string;
  checklistItems: ChecklistItem[];
  onDescriptionChange: (nextVal: string) => void;
  onItemsUpdate: (items: ChecklistItem[]) => void;
  onSaveBeforeAction: () => Promise<string>;
}>) {
  return (
    <>
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.04]">
        <ListTodo className="w-3.5 h-3.5 text-gray-600" />
        <span className="text-xs text-gray-600 font-medium">Checklist Planner</span>
      </div>
      <div className="p-4 sm:p-6 flex-1 flex flex-col gap-5 overflow-y-auto">
        <ChecklistDescriptionField value={checklistDescription} onChange={onDescriptionChange} />
        <div className="h-px bg-white/[0.04] shrink-0" />
        <ChecklistEditor
          noteId={noteId}
          items={checklistItems}
          onItemsUpdate={onItemsUpdate}
          onSaveBeforeAction={onSaveBeforeAction}
        />
      </div>
    </>
  );
}

function NoteEditorContent() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const noteId = params.id as string;
  const { isLoaded } = useAuth();

  const [note, setNote] = useState<Note | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [noteType, setNoteType] = useState<string>("");
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
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [clipboardHistory, setClipboardHistory] = useState<ClipboardItem[]>([]);
  const [sidebarNotes, setSidebarNotes] = useState<Note[]>([]);
  const [sidebarLoading, setSidebarLoading] = useState(false);
  const [openMenuNoteId, setOpenMenuNoteId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const isDirty = useRef(false);
  const titleRef = useRef("");
  const contentRef = useRef("");
  const descriptionRef = useRef("");
  const aiContextRef = useRef("");
  const sidebarFetchTypeRef = useRef("");
  const isEditorInitialized = useRef(false);
  const debouncedSave = useRef<NodeJS.Timeout | null>(null);
  const pollAttempts = useRef(0);

  const markDirty = useCallback(() => {
    isDirty.current = true;
    setHasUnsavedChanges(true);
  }, []);

  const flashSavedIndicator = useCallback(() => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, []);

  const persistCurrentNote = useCallback(
    async (forceUpdate = false): Promise<string> => {
      if (noteId === "new") {
        const res = await notesApi.create({
          title: titleRef.current || undefined,
          content: contentRef.current || "",
          note_type: noteType,
        });
        setNote(res.data);
        isDirty.current = false;
        setHasUnsavedChanges(false);
        flashSavedIndicator();
        window.history.replaceState(null, "", `/notes/${res.data.id}`);
        router.replace(`/notes/${res.data.id}`);
        return res.data.id;
      }
      if (isDirty.current || forceUpdate) {
        const res = await notesApi.update(noteId, {
          title: titleRef.current || undefined,
          content: contentRef.current,
          note_type: noteType,
        });
        setNote(res.data);
        isDirty.current = false;
        setHasUnsavedChanges(false);
        flashSavedIndicator();
        return res.data.id;
      }
      return noteId;
    },
    [flashSavedIndicator, noteId, noteType, router]
  );

  const ensureNoteSaved = useCallback(async (): Promise<string> => {
    if (noteId !== "new" && !isDirty.current) return noteId;
    setSaving(true);
    setError(null);
    try {
      return await persistCurrentNote(false);
    } catch {
      setError(noteId === "new" ? "Failed to create note." : "Failed to save note.");
      throw new Error(noteId === "new" ? "Init note failed" : "Save note failed");
    } finally {
      setSaving(false);
    }
  }, [noteId, persistCurrentNote]);

  const saveNote = useCallback(async (force = false) => {
    if (!isDirty.current && !force) return;
    setSaving(true);
    setError(null);
    try {
      await persistCurrentNote(force);
    } catch {
      setError("Failed to save.");
    } finally {
      setSaving(false);
    }
  }, [persistCurrentNote]);

  const fetchSidebarNotes = useCallback(async (type: string) => {
    sidebarFetchTypeRef.current = type;
    setSidebarNotes([]);
    setSidebarLoading(true);
    try {
      const res = await notesApi.list(undefined, type);
      if (sidebarFetchTypeRef.current === type) {
        setSidebarNotes(res.data);
      }
    } catch {
      // silent fallback
    } finally {
      if (sidebarFetchTypeRef.current === type) {
        setSidebarLoading(false);
      }
    }
  }, []);

  const addClipboardItem = useCallback((text: string, isImage = false) => {
    if (!text?.trim()) return;
    setClipboardHistory((prev) => {
      if (prev.some((x) => x.content === text)) return prev;
      const itemType: "text" | "image" = isImage || isImageText(text) ? "image" : "text";
      return [{ id: generateSecureId(), type: itemType, content: text }, ...prev].slice(0, 10);
    });
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.("[data-note-menu]")) return;
      setOpenMenuNoteId(null);
    };
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, []);

  useEffect(() => {
    const handleGlobalCopy = () => {
      const text = window.getSelection()?.toString();
      if (text) addClipboardItem(text);
    };

    const handleGlobalPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.includes("image")) {
          const file = item.getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
              const base64 = ev.target?.result as string;
              if (base64) addClipboardItem(base64, true);
            };
            reader.readAsDataURL(file);
          }
        } else if (item.type === "text/plain") {
          item.getAsString((val) => addClipboardItem(val));
        }
      }
    };

    document.addEventListener("copy", handleGlobalCopy);
    document.addEventListener("cut", handleGlobalCopy);
    document.addEventListener("paste", handleGlobalPaste);
    return () => {
      document.removeEventListener("copy", handleGlobalCopy);
      document.removeEventListener("cut", handleGlobalCopy);
      document.removeEventListener("paste", handleGlobalPaste);
    };
  }, [addClipboardItem]);

  const onContentChange = useCallback(
    (json: unknown) => {
      const jsonStr = JSON.stringify(json);
      contentRef.current = jsonStr;
      setContent(jsonStr);
      markDirty();
      if (debouncedSave.current) clearTimeout(debouncedSave.current);
      debouncedSave.current = setTimeout(() => {
        void saveNote();
      }, 800);
    },
    [saveNote, markDirty]
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ link: false, underline: false }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      FontFamily,
      TextStyleExtended,
      Color,
      Highlight.configure({ multicolor: true }),
      ResizableImage,
      LinkExtension.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: "Start writing your note..." }),
      CharacterCount,
      Subscript,
      Superscript,
      TableExtension.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: "",
    onUpdate: ({ editor: activeEditor }) => {
      onContentChange(activeEditor.getJSON());
    },
  });

  useEffect(() => {
    if (!editor || !note || isEditorInitialized.current) return;
    if (noteType !== "text") {
      isEditorInitialized.current = true;
      return;
    }

    const initialContent = parseEditorInitialContent(note.content);
    const currentJsonStr = JSON.stringify(editor.getJSON());
    const isSame = note.content === currentJsonStr || (note.content === "" && editor.isEmpty);

    isEditorInitialized.current = true;
    if (!isSame) {
      setTimeout(() => {
        if (editor && !editor.isDestroyed) {
          editor.commands.setContent(initialContent as Parameters<typeof editor.commands.setContent>[0]);
        }
      }, 0);
    }
  }, [editor, note, noteType]);

  useEffect(() => {
    isEditorInitialized.current = false;
    pollAttempts.current = 0;
  }, [noteId]);

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
    if (!isLoaded || !noteId) return;
    void fetchNote();
  }, [fetchNote, noteId, isLoaded]);

  useEffect(() => {
    if (!isLoaded || !noteType) return;
    void fetchSidebarNotes(noteType);
  }, [noteType, fetchSidebarNotes, isLoaded]);

  useEffect(() => {
    if (!note || noteType !== "text" || noteId === "new") return;
    if (note.summary && note.tags?.length) return;
    if (pollAttempts.current >= 5) return;

    const interval = setInterval(() => {
      pollAttempts.current += 1;
      if (pollAttempts.current > 5) {
        clearInterval(interval);
        return;
      }
      void notesApi
        .get(noteId)
        .then((res) => {
          if (res.data.summary || res.data.tags?.length) setNote(res.data);
          if (res.data.summary || res.data.tags?.length) clearInterval(interval);
        })
        .catch(() => {
          clearInterval(interval);
        });
    }, 3000);

    return () => clearInterval(interval);
  }, [note, noteId, noteType]);

  useEffect(() => {
    return () => {
      if (debouncedSave.current) clearTimeout(debouncedSave.current);
    };
  }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>): Promise<boolean> => {
    const file = e.target.files?.[0];
    if (!file) return false;
    setIsUploadingImage(true);
    setImageUploadError(null);
    try {
      const res = await notesApi.uploadImage(file);
      const relativeUrl = res.data.url;
      const fullUrl = relativeUrl.startsWith("http") ? relativeUrl : `${BASE_URL}${relativeUrl}`;
      editor?.chain().focus().setImage({ src: fullUrl }).run();
      return true;
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setImageUploadError(detail || "Failed to upload image. Make sure it is a valid image file.");
      return false;
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleSelectSidebarNote = async (targetId: string) => {
    if (targetId === noteId) return;
    if (isDirty.current) await saveNote();
    router.push(`/notes/${targetId}`);
  };

  const handleTogglePinNote = async (targetNote: Note) => {
    setOpenMenuNoteId(null);
    const newPinned = !targetNote.is_pinned;
    try {
      setSidebarNotes((prev) => prev.map((item) => (item.id === targetNote.id ? { ...item, is_pinned: newPinned } : item)));
      if (targetNote.id === noteId && note) setNote({ ...note, is_pinned: newPinned });
      await notesApi.update(targetNote.id, { is_pinned: newPinned });
      void fetchSidebarNotes(noteType);
    } catch {
      void fetchSidebarNotes(noteType);
    }
  };

  const handleToggleFavoriteNote = async (targetNote: Note) => {
    setOpenMenuNoteId(null);
    const newFav = !targetNote.is_favorite;
    try {
      setSidebarNotes((prev) => prev.map((item) => (item.id === targetNote.id ? { ...item, is_favorite: newFav } : item)));
      if (targetNote.id === noteId && note) setNote({ ...note, is_favorite: newFav });
      await notesApi.update(targetNote.id, { is_favorite: newFav });
    } catch {
      void fetchSidebarNotes(noteType);
    }
  };

  const handleExtractTasks = async () => {
    setExtractingTasks(true);
    setExtractError(null);
    try {
      const activeId = await persistCurrentNote(false);
      const res = await notesApi.extractTasks(activeId);
      const extracted = res.data.tasks || [];
      if (extracted.length === 0) {
        setExtractError("No action items found in this note's content.");
        return;
      }

      const existingTexts = new Set(checklistItems.map((item) => item.text.toLowerCase()));
      const merged = [...checklistItems, ...extracted.filter((item) => !existingTexts.has(item.text.toLowerCase()))];
      setChecklistItems(merged);
      if (note) setNote({ ...note, checklist_items: merged });

      await notesApi.update(activeId, { checklist_items: merged });
      flashSavedIndicator();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setExtractError(detail || "AI task extraction failed. Make sure to enter context details first.");
    } finally {
      setExtractingTasks(false);
    }
  };

  const handleConfirmDeleteNote = async () => {
    const targetId = deleteTargetId || noteId;
    if (!targetId || targetId === "new") return;
    setDeleting(true);
    try {
      await notesApi.delete(targetId);
      if (targetId === noteId) router.push("/notes");
      else setSidebarNotes((prev) => prev.filter((item) => item.id !== targetId));
    } catch {
      setError("Failed to delete note.");
    } finally {
      setDeleting(false);
      setDeleteTargetId(null);
    }
  };

  const handleCut = () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, " ");
    if (selectedText) {
      void navigator.clipboard.writeText(selectedText);
      editor.commands.deleteSelection();
    }
  };

  const handleCopy = () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, " ");
    if (selectedText) void navigator.clipboard.writeText(selectedText);
  };

  if (loading || !isLoaded) {
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
        <Link href="/notes" className="btn-secondary">
          ← Back to notes
        </Link>
      </div>
    );
  }

  const showAIPanel = noteType === "text" && showAI && note !== null;

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <NoteEditorHeader
        title={title}
        noteType={noteType}
        hasUnsavedChanges={hasUnsavedChanges}
        saving={saving}
        saved={saved}
        deleting={deleting}
        error={error}
        previewMode={previewMode}
        showAI={showAI}
        onTitleChange={(val) => {
          setTitle(val);
          titleRef.current = val;
          markDirty();
        }}
        onNoteTypeChange={(type) => {
          if (noteId === "new") {
            setNoteType(type);
            window.history.replaceState(null, "", `/notes/new?type=${type}`);
          } else {
            router.push(`/notes?type=${type}`);
          }
        }}
        onTogglePreview={() => setPreviewMode((prev) => !prev)}
        onManualSave={() => void saveNote(true)}
        onDelete={() => setDeleteTargetId(noteId)}
        onToggleAI={() => setShowAI((prev) => !prev)}
      />

      <div className="flex flex-1 overflow-hidden animate-fade-in">
        <NoteEditorSidebar
          noteType={noteType}
          noteId={noteId}
          currentTitle={title}
          sidebarNotes={sidebarNotes}
          sidebarLoading={sidebarLoading}
          openMenuNoteId={openMenuNoteId}
          onToggleMenu={setOpenMenuNoteId}
          onCreateNew={() => {
            isDirty.current = false;
            setHasUnsavedChanges(false);
            router.push(`/notes/new?type=${noteType}`);
          }}
          onSelectNote={(id) => void handleSelectSidebarNote(id)}
          onTogglePin={(item) => void handleTogglePinNote(item)}
          onToggleFavorite={(item) => void handleToggleFavoriteNote(item)}
          onDeleteRequest={(id) => setDeleteTargetId(id)}
        />

        <div className="flex flex-1 overflow-hidden flex-col">
          {noteType === "text" && (
            <NoteRichTextToolbar
              editor={editor}
              clipboardHistory={clipboardHistory}
              onCut={handleCut}
              onCopy={handleCopy}
              onReadClipboard={(text) => addClipboardItem(text)}
              onUploadImage={handleImageUpload}
              isUploadingImage={isUploadingImage}
              imageUploadError={imageUploadError}
              onClearImageError={() => setImageUploadError(null)}
            />
          )}

          <div className="flex flex-1 overflow-hidden">
            <div className={getEditorPanelClass(noteType, previewMode)}>
              {noteType === "text" && (
                <div className="flex-1 flex flex-col min-h-0 print-content overflow-y-auto">
                  <PrintDocumentHeader title={title} createdAt={note?.created_at} />
                  <EditorContent editor={editor} className="flex-1" />
                </div>
              )}

              {noteType === "audio" && (
                <AudioNotePanel
                  noteId={noteId}
                  mediaUrl={note?.media_url ?? null}
                  transcript={note?.transcript ?? null}
                  onTranscriptUpdate={(newTranscript) => {
                    if (!note) return;
                    setNote({ ...note, transcript: newTranscript });
                    const updated = content ? `${content}\n\nTranscript:\n${newTranscript}` : newTranscript;
                    setContent(updated);
                    contentRef.current = updated;
                    isDirty.current = true;
                    void saveNote();
                  }}
                  onMediaUrlUpdate={(newUrl) => {
                    if (note) setNote({ ...note, media_url: newUrl });
                  }}
                  onSaveBeforeAction={ensureNoteSaved}
                />
              )}

              {noteType === "checklist" && (
                <ChecklistNotePanel
                  noteId={noteId}
                  checklistDescription={checklistDescription}
                  checklistItems={checklistItems}
                  onDescriptionChange={(nextVal) => {
                    setChecklistDescription(nextVal);
                    descriptionRef.current = nextVal;
                    contentRef.current = JSON.stringify({
                      description: nextVal,
                      ai_context: aiContextRef.current,
                    });
                    markDirty();
                  }}
                  onItemsUpdate={(newItems) => {
                    setChecklistItems(newItems);
                    if (note) setNote({ ...note, checklist_items: newItems });
                  }}
                  onSaveBeforeAction={ensureNoteSaved}
                />
              )}
            </div>

            {noteType === "checklist" && (
              <ChecklistGeneratorPanel
                previewMode={previewMode}
                aiContext={aiContext}
                extractError={extractError}
                extractingTasks={extractingTasks}
                onAiContextChange={(val) => {
                  setAiContext(val);
                  aiContextRef.current = val;
                  contentRef.current = JSON.stringify({
                    description: descriptionRef.current,
                    ai_context: val,
                  });
                  markDirty();
                }}
                onExtractTasks={() => void handleExtractTasks()}
              />
            )}
          </div>
        </div>

        {showAIPanel && (
          <div className="hidden lg:flex flex-col w-80 xl:w-96 border-l border-white/[0.06] overflow-y-auto p-4 select-none bg-surface-900/40 backdrop-blur-sm">
            <AIPanel note={note} onUpdateNote={setNote} editor={editor} onSaveBeforeAction={ensureNoteSaved} />
          </div>
        )}
      </div>

      {showAIPanel && (
        <div className="lg:hidden border-t border-white/[0.06] max-h-64 overflow-y-auto p-4 select-none bg-surface-900/40 backdrop-blur-sm">
          <AIPanel note={note} onUpdateNote={setNote} editor={editor} onSaveBeforeAction={ensureNoteSaved} />
        </div>
      )}

      <ConfirmModal
        isOpen={deleteTargetId !== null}
        loading={deleting}
        onConfirm={() => void handleConfirmDeleteNote()}
        onCancel={() => setDeleteTargetId(null)}
      />
    </div>
  );
}

export default function NoteEditorPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-surface-800">
          <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
        </div>
      }
    >
      <NoteEditorContent />
    </Suspense>
  );
}
