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
import { useEditor, EditorContent } from "@tiptap/react";
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
  Sparkles,
  ChevronRight,
  ChevronLeft,
  FileText,
  Palette,
  Mic,
  ListTodo,
  Undo,
  Redo,
  Scissors,
  Copy,
  Clipboard,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Quote,
  Code,
  Outdent,
  Indent,
  Link as LinkIcon,
  Image as ImageIcon,
  Table as TableIcon,
  Minus,
  Eraser,
  Printer
} from "lucide-react";
import Link from "next/link";

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

  // Popover States
  const [showFontDropdown, setShowFontDropdown] = useState(false);
  const [showSizeDropdown, setShowSizeDropdown] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const [showLinkPopover, setShowLinkPopover] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [showImagePopover, setShowImagePopover] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [showTablePopover, setShowTablePopover] = useState(false);
  const [hoveredGrid, setHoveredGrid] = useState<{ r: number; c: number } | null>(null);

  // Popover Refs
  const fontDropdownRef = useRef<HTMLDivElement>(null);
  const sizeDropdownRef = useRef<HTMLDivElement>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const highlightPickerRef = useRef<HTMLDivElement>(null);
  const linkPopoverRef = useRef<HTMLDivElement>(null);
  const imagePopoverRef = useRef<HTMLDivElement>(null);
  const tablePopoverRef = useRef<HTMLDivElement>(null);

  const isEditorInitialized = useRef(false);
  const debouncedSave = useRef<NodeJS.Timeout | null>(null);

  const markDirty = useCallback(() => {
    isDirty.current = true;
    setHasUnsavedChanges(true);
  }, []);

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

  const onContentChange = useCallback((json: any) => {
    const jsonStr = JSON.stringify(json);
    contentRef.current = jsonStr;
    setContent(jsonStr);
    markDirty();

    if (debouncedSave.current) {
      clearTimeout(debouncedSave.current);
    }

    debouncedSave.current = setTimeout(() => {
      saveNote();
    }, 800);
  }, [saveNote, markDirty]);

  // Click Outside Popovers handler
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (fontDropdownRef.current && !fontDropdownRef.current.contains(target)) {
        setShowFontDropdown(false);
      }
      if (sizeDropdownRef.current && !sizeDropdownRef.current.contains(target)) {
        setShowSizeDropdown(false);
      }
      if (colorPickerRef.current && !colorPickerRef.current.contains(target)) {
        setShowColorPicker(false);
      }
      if (highlightPickerRef.current && !highlightPickerRef.current.contains(target)) {
        setShowHighlightPicker(false);
      }
      if (linkPopoverRef.current && !linkPopoverRef.current.contains(target)) {
        setShowLinkPopover(false);
      }
      if (imagePopoverRef.current && !imagePopoverRef.current.contains(target)) {
        setShowImagePopover(false);
      }
      if (tablePopoverRef.current && !tablePopoverRef.current.contains(target)) {
        setShowTablePopover(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Tiptap Editor Setup
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      FontFamily,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      ImageExtension,
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
    onUpdate: ({ editor }) => {
      onContentChange(editor.getJSON());
    },
  });

  // Load content into editor on mount / when note is loaded
  useEffect(() => {
    if (!editor || !note || isEditorInitialized.current) return;
    
    let initialContent: any = "";
    if (note.content) {
      try {
        initialContent = JSON.parse(note.content);
      } catch {
        initialContent = note.content; // fallback
      }
    }
    
    const currentJsonStr = JSON.stringify(editor.getJSON());
    const isSame = note.content === currentJsonStr || (note.content === "" && editor.isEmpty);
    
    isEditorInitialized.current = true;
    if (!isSame) {
      editor.commands.setContent(initialContent);
    }
  }, [editor, note]);

  // Reset initialization ref if noteId changes
  useEffect(() => {
    isEditorInitialized.current = false;
  }, [noteId]);

  // Keyboard shortcut Ctrl+K wrapper
  const handleEditorKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      const currentLinkUrl = editor?.getAttributes("link").href || "";
      setLinkUrl(currentLinkUrl);
      setShowLinkPopover(true);
    }
  };

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
    if (note.summary && note.tags?.length) return;

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

  const getBtnClass = (isActive: boolean) => {
    return `p-1.5 rounded-md text-xs font-medium transition-all ${
      isActive 
        ? "bg-brand-500/20 text-brand-300 border border-brand-500/40" 
        : "text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] border border-transparent"
    }`;
  };

  const getActiveFontFamily = () => {
    return editor?.getAttributes("textStyle").fontFamily || "Inter";
  };

  const getActiveFontSize = () => {
    const size = editor?.getAttributes("textStyle").fontSize;
    if (size) return size.replace("px", "");
    return "16";
  };

  const setTextColor = (color: string) => {
    if (editor) {
      if (color === "#e5e7eb") {
        editor.chain().focus().unsetColor().run();
      } else {
        editor.chain().focus().setColor(color).run();
      }
    }
    setShowColorPicker(false);
  };

  const setHighlightColor = (color: string) => {
    if (editor) {
      if (color === "transparent") {
        editor.chain().focus().unsetHighlight().run();
      } else {
        editor.chain().focus().toggleHighlight({ color }).run();
      }
    }
    setShowHighlightPicker(false);
  };

  const handleCut = () => {
    editor?.commands.focus();
    document.execCommand("cut");
  };

  const handleCopy = () => {
    editor?.commands.focus();
    document.execCommand("copy");
  };

  const handlePaste = () => {
    editor?.commands.focus();
    navigator.clipboard.readText().then(text => {
      editor?.commands.insertContent(text);
    }).catch(() => {
      document.execCommand("paste");
    });
  };

  const COLORS = [
    { name: "Default", value: "#e5e7eb" },
    { name: "Black", value: "#000000" },
    { name: "White", value: "#ffffff" },
    { name: "Red", value: "#f87171" },
    { name: "Orange", value: "#fb923c" },
    { name: "Yellow", value: "#facc15" },
    { name: "Green", value: "#4ade80" },
    { name: "Blue", value: "#60a5fa" },
    { name: "Purple", value: "#c084fc" },
    { name: "Pink", value: "#f472b6" },
  ];

  const HIGHLIGHTS = [
    { name: "None", value: "transparent" },
    { name: "Yellow", value: "#facc15" },
    { name: "Green", value: "#4ade80" },
    { name: "Blue", value: "#60a5fa" },
    { name: "Red", value: "#f87171" },
    { name: "Purple", value: "#c084fc" },
    { name: "Pink", value: "#f472b6" },
    { name: "Orange", value: "#fb923c" },
  ];

  const wordCount = editor?.storage.characterCount.words() || 0;
  const charCount = editor?.storage.characterCount.characters() || 0;

  useEffect(() => {
    return () => {
      if (debouncedSave.current) {
        clearTimeout(debouncedSave.current);
      }
    };
  }, []);

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
      <div className="no-print flex flex-wrap items-center gap-3 px-4 sm:px-6 py-3 border-b border-white/[0.06] bg-surface-900/60 backdrop-blur-sm">
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
          {/* Preview toggle (mobile) - hidden for text notes */}
          {noteType !== "drawing" && noteType !== "text" && (
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
        <div className="flex flex-1 overflow-hidden flex-col">
          
          {/* TIPTAP RICH TEXT TOOLBAR (Sticky at top of text note) */}
          {noteType === "text" && (
            <div className="no-print sticky top-0 z-20 bg-neutral-900 border-b border-white/[0.06] p-2 flex flex-col gap-1.5 select-none shrink-0">
              
              {/* Desktop Toolbar (7 Rows) */}
              <div className="hidden md:flex flex-col gap-1.5">
                {/* Row 1: History & Clipboard */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider min-w-[130px] select-none">History & Clipboard</span>
                  <button type="button" onClick={() => editor?.chain().focus().undo().run()} className={getBtnClass(false)} title="Undo (Ctrl+Z)"><Undo className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => editor?.chain().focus().redo().run()} className={getBtnClass(false)} title="Redo (Ctrl+Shift+Z)"><Redo className="w-3.5 h-3.5" /></button>
                  <div className="h-4 w-px bg-white/10 mx-1" />
                  <button type="button" onClick={handleCut} className={getBtnClass(false)} title="Cut"><Scissors className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={handleCopy} className={getBtnClass(false)} title="Copy"><Copy className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={handlePaste} className={getBtnClass(false)} title="Paste"><Clipboard className="w-3.5 h-3.5" /></button>
                </div>

                {/* Row 2: Font & Size */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider min-w-[130px] select-none">Font & Size</span>
                  {/* Font Family Dropdown */}
                  <div className="relative" ref={fontDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setShowFontDropdown(!showFontDropdown)}
                      className="px-2 py-1 rounded bg-neutral-900 border border-neutral-800 text-xs text-gray-300 flex items-center gap-1.5 hover:bg-neutral-800 transition-all font-medium min-w-[110px]"
                    >
                      <span className="truncate max-w-[80px]">{getActiveFontFamily()}</span>
                      <span className="text-[8px] text-gray-500">▼</span>
                    </button>
                    {showFontDropdown && (
                      <div className="absolute left-0 mt-1 w-40 rounded-md bg-neutral-950 border border-white/[0.08] shadow-lg z-30 py-1 max-h-48 overflow-y-auto">
                        {["Inter", "Georgia", "Courier New", "Arial", "Times New Roman"].map((font) => (
                          <button
                            key={font}
                            type="button"
                            onClick={() => {
                              editor?.chain().focus().setFontFamily(font).run();
                              setShowFontDropdown(false);
                            }}
                            className={`w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-white/[0.05] ${
                              getActiveFontFamily() === font ? "text-brand-400 font-bold" : "text-gray-300"
                            }`}
                            style={{ fontFamily: font }}
                          >
                            {font}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Font Size Dropdown */}
                  <div className="relative" ref={sizeDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setShowSizeDropdown(!showSizeDropdown)}
                      className="px-2 py-1 rounded bg-neutral-900 border border-neutral-800 text-xs text-gray-300 flex items-center gap-1.5 hover:bg-neutral-800 transition-all font-medium min-w-[65px]"
                    >
                      <span>{getActiveFontSize()} px</span>
                      <span className="text-[8px] text-gray-500">▼</span>
                    </button>
                    {showSizeDropdown && (
                      <div className="absolute left-0 mt-1 w-20 max-h-48 overflow-y-auto rounded-md bg-neutral-950 border border-white/[0.08] shadow-lg z-30 py-1">
                        {[10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72].map((size) => (
                          <button
                            key={size}
                            type="button"
                            onClick={() => {
                              editor?.chain().focus().setMark("textStyle", { fontSize: size + "px" }).run();
                              setShowSizeDropdown(false);
                            }}
                            className={`w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-white/[0.05] ${
                              getActiveFontSize() === String(size) ? "text-brand-400 font-bold" : "text-gray-300"
                            }`}
                          >
                            {size}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Row 3: Text Formatting */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider min-w-[130px] select-none">Formatting</span>
                  <button type="button" onClick={() => editor?.chain().focus().toggleBold().run()} className={getBtnClass(editor?.isActive("bold") || false)} title="Bold (Ctrl+B)"><Bold className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => editor?.chain().focus().toggleItalic().run()} className={getBtnClass(editor?.isActive("italic") || false)} title="Italic (Ctrl+I)"><Italic className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => editor?.chain().focus().toggleUnderline().run()} className={getBtnClass(editor?.isActive("underline") || false)} title="Underline (Ctrl+U)"><UnderlineIcon className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => editor?.chain().focus().toggleStrike().run()} className={getBtnClass(editor?.isActive("strike") || false)} title="Strikethrough"><Strikethrough className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => editor?.chain().focus().toggleSubscript().run()} className={getBtnClass(editor?.isActive("subscript") || false)} title="Subscript"><SubscriptIcon className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => editor?.chain().focus().toggleSuperscript().run()} className={getBtnClass(editor?.isActive("superscript") || false)} title="Superscript"><SuperscriptIcon className="w-3.5 h-3.5" /></button>
                  <div className="h-4 w-px bg-white/10 mx-1" />
                  
                  {/* Text Color Picker */}
                  <div className="relative" ref={colorPickerRef}>
                    <button
                      type="button"
                      onClick={() => setShowColorPicker(!showColorPicker)}
                      className={`p-1.5 rounded-md hover:bg-white/[0.04] border border-transparent transition-all flex items-center gap-1 ${
                        showColorPicker ? "bg-white/[0.05] border-white/10" : ""
                      }`}
                      title="Text Color"
                    >
                      <div className="flex flex-col items-center justify-center">
                        <span className="text-[11px] font-bold font-serif leading-none mt-[-2px]">A</span>
                        <div 
                          className="w-3.5 h-0.5 mt-0.5 rounded-full" 
                          style={{ backgroundColor: editor?.getAttributes("textStyle").color || "#e5e7eb" }} 
                        />
                      </div>
                    </button>
                    {showColorPicker && (
                      <div className="absolute left-0 mt-1 p-2 rounded-md bg-neutral-950 border border-white/[0.08] shadow-lg z-30 w-36">
                        <div className="grid grid-cols-5 gap-1.5">
                          {COLORS.map((c) => (
                            <button
                              key={c.value}
                              type="button"
                              onClick={() => setTextColor(c.value)}
                              className="w-5 h-5 rounded border border-white/10 relative transition-transform hover:scale-110 active:scale-95"
                              style={{ backgroundColor: c.value }}
                              title={c.name}
                            >
                              {editor?.getAttributes("textStyle").color === c.value && (
                                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white mix-blend-difference">✓</span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Highlight Color Picker */}
                  <div className="relative" ref={highlightPickerRef}>
                    <button
                      type="button"
                      onClick={() => setShowHighlightPicker(!showHighlightPicker)}
                      className={`p-1.5 rounded-md hover:bg-white/[0.04] border border-transparent transition-all flex items-center gap-1 ${
                        showHighlightPicker ? "bg-white/[0.05] border-white/10" : ""
                      }`}
                      title="Highlight Color"
                    >
                      <Palette className="w-3.5 h-3.5" />
                    </button>
                    {showHighlightPicker && (
                      <div className="absolute left-0 mt-1 p-2 rounded-md bg-neutral-950 border border-white/[0.08] shadow-lg z-30 w-36">
                        <div className="grid grid-cols-4 gap-1.5">
                          {HIGHLIGHTS.map((c) => (
                            <button
                              key={c.value}
                              type="button"
                              onClick={() => setHighlightColor(c.value)}
                              className="w-5 h-5 rounded border border-white/10 relative transition-transform hover:scale-110 active:scale-95"
                              style={{ backgroundColor: c.value }}
                              title={c.name}
                            >
                              {editor?.isActive("highlight", { color: c.value }) && (
                                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-black">✓</span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Row 4: Paragraph & Alignment */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider min-w-[130px] select-none">Paragraph & Align</span>
                  <button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} className={getBtnClass(editor?.isActive("heading", { level: 1 }) || false)} title="Heading 1">H1</button>
                  <button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} className={getBtnClass(editor?.isActive("heading", { level: 2 }) || false)} title="Heading 2">H2</button>
                  <button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} className={getBtnClass(editor?.isActive("heading", { level: 3 }) || false)} title="Heading 3">H3</button>
                  <button type="button" onClick={() => editor?.chain().focus().setParagraph().run()} className={getBtnClass(editor?.isActive("paragraph") || false)} title="Normal text">P</button>
                  <div className="h-4 w-px bg-white/10 mx-1" />
                  <button type="button" onClick={() => editor?.chain().focus().setTextAlign("left").run()} className={getBtnClass(editor?.isActive({ textAlign: "left" }) || false)} title="Align Left"><AlignLeft className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => editor?.chain().focus().setTextAlign("center").run()} className={getBtnClass(editor?.isActive({ textAlign: "center" }) || false)} title="Align Center"><AlignCenter className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => editor?.chain().focus().setTextAlign("right").run()} className={getBtnClass(editor?.isActive({ textAlign: "right" }) || false)} title="Align Right"><AlignRight className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => editor?.chain().focus().setTextAlign("justify").run()} className={getBtnClass(editor?.isActive({ textAlign: "justify" }) || false)} title="Justify"><AlignJustify className="w-3.5 h-3.5" /></button>
                </div>

                {/* Row 5: Lists & Indentation */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider min-w-[130px] select-none">Lists & Indent</span>
                  <button type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()} className={getBtnClass(editor?.isActive("bulletList") || false)} title="Bullet List"><List className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => editor?.chain().focus().toggleOrderedList().run()} className={getBtnClass(editor?.isActive("orderedList") || false)} title="Numbered List"><ListOrdered className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => editor?.chain().focus().toggleBlockquote().run()} className={getBtnClass(editor?.isActive("blockquote") || false)} title="Blockquote"><Quote className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => editor?.chain().focus().toggleCodeBlock().run()} className={getBtnClass(editor?.isActive("codeBlock") || false)} title="Code Block"><Code className="w-3.5 h-3.5" /></button>
                  <div className="h-4 w-px bg-white/10 mx-1" />
                  <button type="button" onClick={() => editor?.chain().focus().liftListItem("listItem").run()} className={getBtnClass(false)} title="Decrease Indent (Shift+Tab)"><Outdent className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => editor?.chain().focus().sinkListItem("listItem").run()} className={getBtnClass(false)} title="Increase Indent (Tab)"><Indent className="w-3.5 h-3.5" /></button>
                </div>

                {/* Row 6: Insert */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider min-w-[130px] select-none">Insert & Clear</span>
                  {/* Link Insertion */}
                  <div className="relative" ref={linkPopoverRef}>
                    <button
                      type="button"
                      onClick={() => {
                        const activeUrl = editor?.getAttributes("link").href || "";
                        setLinkUrl(activeUrl);
                        setShowLinkPopover(!showLinkPopover);
                      }}
                      className={getBtnClass(editor?.isActive("link") || false)}
                      title="Link (Ctrl+K)"
                    >
                      <LinkIcon className="w-3.5 h-3.5" />
                    </button>
                    {showLinkPopover && (
                      <div className="absolute left-0 mt-1 p-3 rounded-xl bg-neutral-950 border border-white/[0.08] shadow-lg z-30 w-64 flex flex-col gap-2">
                        <span className="text-[10px] font-bold uppercase text-gray-500 tracking-wider">Insert/Edit Link</span>
                        <input
                          type="text"
                          className="w-full bg-neutral-900 border border-neutral-800 rounded px-2.5 py-1 text-xs text-gray-200 focus:outline-none focus:border-brand-500"
                          placeholder="https://example.com"
                          value={linkUrl}
                          onChange={(e) => setLinkUrl(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              if (linkUrl) {
                                editor?.chain().focus().setLink({ href: linkUrl }).run();
                              } else {
                                editor?.chain().focus().unsetLink().run();
                              }
                              setShowLinkPopover(false);
                            }
                          }}
                          autoFocus
                        />
                        <div className="flex justify-between items-center gap-1.5 mt-1">
                          {editor?.isActive("link") && (
                            <button
                              type="button"
                              onClick={() => {
                                editor?.chain().focus().unsetLink().run();
                                setShowLinkPopover(false);
                              }}
                              className="text-[11px] font-semibold text-red-400 hover:text-red-300 transition-colors"
                            >
                              Remove Link
                            </button>
                          )}
                          <div className="flex gap-1 ml-auto">
                            <button
                              type="button"
                              onClick={() => setShowLinkPopover(false)}
                              className="px-2 py-1 text-[11px] font-medium text-gray-400 hover:text-gray-200 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (linkUrl) {
                                  editor?.chain().focus().setLink({ href: linkUrl }).run();
                                } else {
                                  editor?.chain().focus().unsetLink().run();
                                }
                                setShowLinkPopover(false);
                              }}
                              className="px-2.5 py-1 text-[11px] font-bold bg-brand-500 hover:bg-brand-400 text-white rounded transition-colors"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Image Insertion */}
                  <div className="relative" ref={imagePopoverRef}>
                    <button
                      type="button"
                      onClick={() => setShowImagePopover(!showImagePopover)}
                      className={getBtnClass(false)}
                      title="Insert Image"
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                    </button>
                    {showImagePopover && (
                      <div className="absolute left-0 mt-1 p-3 rounded-xl bg-neutral-950 border border-white/[0.08] shadow-lg z-30 w-64 flex flex-col gap-2">
                        <span className="text-[10px] font-bold uppercase text-gray-500 tracking-wider">Insert Image URL</span>
                        <input
                          type="text"
                          className="w-full bg-neutral-900 border border-neutral-800 rounded px-2.5 py-1 text-xs text-gray-200 focus:outline-none focus:border-brand-500"
                          placeholder="https://example.com/image.jpg"
                          value={imageUrl}
                          onChange={(e) => setImageUrl(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              if (imageUrl) {
                                editor?.chain().focus().setImage({ src: imageUrl }).run();
                              }
                              setShowImagePopover(false);
                              setImageUrl("");
                            }
                          }}
                          autoFocus
                        />
                        <div className="flex gap-1 ml-auto mt-1">
                          <button
                            type="button"
                            onClick={() => setShowImagePopover(false)}
                            className="px-2 py-1 text-[11px] font-medium text-gray-400 hover:text-gray-200 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (imageUrl) {
                                editor?.chain().focus().setImage({ src: imageUrl }).run();
                              }
                              setShowImagePopover(false);
                              setImageUrl("");
                            }}
                            className="px-2.5 py-1 text-[11px] font-bold bg-brand-500 hover:bg-brand-400 text-white rounded transition-colors"
                          >
                            Insert
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Table Grid Picker */}
                  <div className="relative" ref={tablePopoverRef}>
                    <button
                      type="button"
                      onClick={() => setShowTablePopover(!showTablePopover)}
                      className={getBtnClass(editor?.isActive("table") || false)}
                      title="Insert Table"
                    >
                      <TableIcon className="w-3.5 h-3.5" />
                    </button>
                    {showTablePopover && (
                      <div className="absolute left-0 mt-1 p-3 rounded-xl bg-neutral-950 border border-white/[0.08] shadow-lg z-30 flex flex-col gap-2.5 select-none">
                        <span className="text-[10px] font-bold uppercase text-gray-500 tracking-wider font-sans text-gray-400">Insert Table Grid</span>
                        <div 
                          className="grid grid-cols-6 gap-1"
                          onMouseLeave={() => setHoveredGrid(null)}
                        >
                          {Array.from({ length: 6 }).map((_, rIdx) => (
                            <div key={rIdx} className="flex gap-1">
                              {Array.from({ length: 6 }).map((_, cIdx) => {
                                const row = rIdx + 1;
                                const col = cIdx + 1;
                                const isSelected = hoveredGrid && row <= hoveredGrid.r && col <= hoveredGrid.c;
                                return (
                                  <button
                                    key={cIdx}
                                    type="button"
                                    onMouseEnter={() => setHoveredGrid({ r: row, c: col })}
                                    onClick={() => {
                                      editor?.chain().focus().insertTable({ rows: row, cols: col, withHeaderRow: true }).run();
                                      setShowTablePopover(false);
                                      setHoveredGrid(null);
                                    }}
                                    className={`w-5 h-5 rounded transition-colors border ${
                                      isSelected 
                                        ? "bg-brand-500/80 border-brand-500" 
                                        : "bg-neutral-900 border-neutral-800 hover:border-neutral-700"
                                    }`}
                                  />
                                );
                              })}
                            </div>
                          ))}
                        </div>
                        <span className="text-[10px] font-bold text-center text-gray-400 font-sans">
                          {hoveredGrid ? `${hoveredGrid.r} x ${hoveredGrid.c} Table` : "Hover to choose size"}
                        </span>
                      </div>
                    )}
                  </div>

                  <button type="button" onClick={() => editor?.chain().focus().setHorizontalRule().run()} className={getBtnClass(false)} title="Horizontal Rule"><Minus className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => editor?.chain().focus().clearNodes().unsetAllMarks().run()} className={getBtnClass(false)} title="Clear Formatting"><Eraser className="w-3.5 h-3.5" /></button>
                </div>

                {/* Row 7: Utilities */}
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider min-w-[130px] select-none">Utilities</span>
                  <span className="text-xs text-gray-400 bg-neutral-900 border border-neutral-800 px-2 py-0.5 rounded font-mono select-none">Words: {wordCount}</span>
                  <span className="text-xs text-gray-400 bg-neutral-900 border border-neutral-800 px-2 py-0.5 rounded font-mono select-none">Characters: {charCount}</span>
                  <button type="button" onClick={() => window.print()} className="ml-auto btn-secondary py-1 px-3 text-xs flex items-center gap-1 border-neutral-800 hover:border-neutral-700 font-medium" title="Print Document"><Printer className="w-3.5 h-3.5" /> Print</button>
                </div>
              </div>

              {/* Mobile Toolbar (2 Rows) */}
              <div className="flex md:hidden flex-col gap-1.5">
                {/* Row 1 (Mobile) */}
                <div className="flex flex-wrap items-center gap-1">
                  <button type="button" onClick={() => editor?.chain().focus().undo().run()} className={getBtnClass(false)} title="Undo"><Undo className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => editor?.chain().focus().redo().run()} className={getBtnClass(false)} title="Redo"><Redo className="w-3.5 h-3.5" /></button>
                  <div className="h-4 w-px bg-white/10 mx-0.5" />
                  <button type="button" onClick={handleCut} className={getBtnClass(false)} title="Cut"><Scissors className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={handleCopy} className={getBtnClass(false)} title="Copy"><Copy className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={handlePaste} className={getBtnClass(false)} title="Paste"><Clipboard className="w-3.5 h-3.5" /></button>
                  <div className="h-4 w-px bg-white/10 mx-0.5" />
                  
                  {/* Font Family Dropdown */}
                  <div className="relative" ref={fontDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setShowFontDropdown(!showFontDropdown)}
                      className="px-1.5 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-[10px] text-gray-300 flex items-center gap-1 hover:bg-neutral-800"
                    >
                      <span className="truncate max-w-[50px]">{getActiveFontFamily()}</span>
                    </button>
                    {showFontDropdown && (
                      <div className="absolute left-0 mt-1 w-32 rounded bg-neutral-950 border border-white/[0.08] shadow-lg z-30 py-1">
                        {["Inter", "Georgia", "Courier New", "Arial", "Times New Roman"].map((font) => (
                          <button
                            key={font}
                            type="button"
                            onClick={() => {
                              editor?.chain().focus().setFontFamily(font).run();
                              setShowFontDropdown(false);
                            }}
                            className="w-full px-2 py-1 text-left text-[11px] text-gray-300 hover:bg-white/[0.05]"
                            style={{ fontFamily: font }}
                          >
                            {font}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Font Size Dropdown */}
                  <div className="relative" ref={sizeDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setShowSizeDropdown(!showSizeDropdown)}
                      className="px-1.5 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-[10px] text-gray-300 flex items-center gap-1 hover:bg-neutral-800"
                    >
                      <span>{getActiveFontSize()}px</span>
                    </button>
                    {showSizeDropdown && (
                      <div className="absolute left-0 mt-1 w-16 max-h-32 overflow-y-auto rounded bg-neutral-950 border border-white/[0.08] shadow-lg z-30 py-1">
                        {[10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72].map((size) => (
                          <button
                            key={size}
                            type="button"
                            onClick={() => {
                              editor?.chain().focus().setMark("textStyle", { fontSize: size + "px" }).run();
                              setShowSizeDropdown(false);
                            }}
                            className="w-full px-2 py-1 text-left text-[11px] text-gray-300 hover:bg-white/[0.05]"
                          >
                            {size}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="h-4 w-px bg-white/10 mx-0.5" />
                  <button type="button" onClick={() => editor?.chain().focus().toggleBold().run()} className={getBtnClass(editor?.isActive("bold") || false)}><Bold className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => editor?.chain().focus().toggleItalic().run()} className={getBtnClass(editor?.isActive("italic") || false)}><Italic className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => editor?.chain().focus().toggleUnderline().run()} className={getBtnClass(editor?.isActive("underline") || false)}><UnderlineIcon className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => editor?.chain().focus().toggleStrike().run()} className={getBtnClass(editor?.isActive("strike") || false)}><Strikethrough className="w-3.5 h-3.5" /></button>
                  
                  <div className="h-4 w-px bg-white/10 mx-0.5" />
                  {/* Color Pickers */}
                  <div className="relative" ref={colorPickerRef}>
                    <button
                      type="button"
                      onClick={() => setShowColorPicker(!showColorPicker)}
                      className="p-1 rounded hover:bg-white/[0.04]"
                    >
                      <span className="text-xs font-bold font-serif underline">A</span>
                    </button>
                    {showColorPicker && (
                      <div className="absolute left-0 mt-1 p-1 rounded bg-neutral-950 border border-white/[0.08] shadow-lg z-30 w-32">
                        <div className="grid grid-cols-5 gap-1">
                          {COLORS.map((c) => (
                            <button
                              key={c.value}
                              type="button"
                              onClick={() => setTextColor(c.value)}
                              className="w-4 h-4 rounded border border-white/10"
                              style={{ backgroundColor: c.value }}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="relative" ref={highlightPickerRef}>
                    <button
                      type="button"
                      onClick={() => setShowHighlightPicker(!showHighlightPicker)}
                      className="p-1 rounded hover:bg-white/[0.04]"
                    >
                      <Palette className="w-3.5 h-3.5" />
                    </button>
                    {showHighlightPicker && (
                      <div className="absolute left-0 mt-1 p-1 rounded bg-neutral-950 border border-white/[0.08] shadow-lg z-30 w-32">
                        <div className="grid grid-cols-4 gap-1">
                          {HIGHLIGHTS.map((c) => (
                            <button
                              key={c.value}
                              type="button"
                              onClick={() => setHighlightColor(c.value)}
                              className="w-4 h-4 rounded border border-white/10"
                              style={{ backgroundColor: c.value }}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Row 2 (Mobile) */}
                <div className="flex flex-wrap items-center gap-1">
                  <button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} className={getBtnClass(editor?.isActive("heading", { level: 1 }) || false)}>H1</button>
                  <button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} className={getBtnClass(editor?.isActive("heading", { level: 2 }) || false)}>H2</button>
                  <button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} className={getBtnClass(editor?.isActive("heading", { level: 3 }) || false)}>H3</button>
                  <button type="button" onClick={() => editor?.chain().focus().setParagraph().run()} className={getBtnClass(editor?.isActive("paragraph") || false)}>P</button>
                  
                  <div className="h-4 w-px bg-white/10 mx-0.5" />
                  <button type="button" onClick={() => editor?.chain().focus().setTextAlign("left").run()} className={getBtnClass(editor?.isActive({ textAlign: "left" }) || false)}><AlignLeft className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => editor?.chain().focus().setTextAlign("center").run()} className={getBtnClass(editor?.isActive({ textAlign: "center" }) || false)}><AlignCenter className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => editor?.chain().focus().setTextAlign("right").run()} className={getBtnClass(editor?.isActive({ textAlign: "right" }) || false)}><AlignRight className="w-3.5 h-3.5" /></button>
                  
                  <div className="h-4 w-px bg-white/10 mx-0.5" />
                  <button type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()} className={getBtnClass(editor?.isActive("bulletList") || false)}><List className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => editor?.chain().focus().toggleOrderedList().run()} className={getBtnClass(editor?.isActive("orderedList") || false)}><ListOrdered className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => editor?.chain().focus().toggleBlockquote().run()} className={getBtnClass(editor?.isActive("blockquote") || false)}><Quote className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => editor?.chain().focus().toggleCodeBlock().run()} className={getBtnClass(editor?.isActive("codeBlock") || false)}><Code className="w-3.5 h-3.5" /></button>
                  
                  <div className="h-4 w-px bg-white/10 mx-0.5" />
                  <button type="button" onClick={() => editor?.chain().focus().liftListItem("listItem").run()} className={getBtnClass(false)}><Outdent className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => editor?.chain().focus().sinkListItem("listItem").run()} className={getBtnClass(false)}><Indent className="w-3.5 h-3.5" /></button>
                  
                  <div className="h-4 w-px bg-white/10 mx-0.5" />
                  {/* Link Insert */}
                  <div className="relative" ref={linkPopoverRef}>
                    <button
                      type="button"
                      onClick={() => {
                        const activeUrl = editor?.getAttributes("link").href || "";
                        setLinkUrl(activeUrl);
                        setShowLinkPopover(!showLinkPopover);
                      }}
                      className={getBtnClass(editor?.isActive("link") || false)}
                    >
                      <LinkIcon className="w-3.5 h-3.5" />
                    </button>
                    {showLinkPopover && (
                      <div className="absolute right-0 mt-1 p-2 rounded bg-neutral-950 border border-white/[0.08] shadow-lg z-30 w-48 flex flex-col gap-1.5">
                        <input
                          type="text"
                          className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-0.5 text-xs text-gray-200"
                          placeholder="Link URL"
                          value={linkUrl}
                          onChange={(e) => setLinkUrl(e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (linkUrl) {
                              editor?.chain().focus().setLink({ href: linkUrl }).run();
                            } else {
                              editor?.chain().focus().unsetLink().run();
                            }
                            setShowLinkPopover(false);
                          }}
                          className="w-full bg-brand-500 py-1 rounded text-[10px] text-white font-bold"
                        >
                          Save
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Image Insert */}
                  <div className="relative" ref={imagePopoverRef}>
                    <button
                      type="button"
                      onClick={() => setShowImagePopover(!showImagePopover)}
                      className={getBtnClass(false)}
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                    </button>
                    {showImagePopover && (
                      <div className="absolute right-0 mt-1 p-2 rounded bg-neutral-950 border border-white/[0.08] shadow-lg z-30 w-48 flex flex-col gap-1.5">
                        <input
                          type="text"
                          className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-0.5 text-xs text-gray-200"
                          placeholder="Image URL"
                          value={imageUrl}
                          onChange={(e) => setImageUrl(e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (imageUrl) {
                              editor?.chain().focus().setImage({ src: imageUrl }).run();
                            }
                            setShowImagePopover(false);
                            setImageUrl("");
                          }}
                          className="w-full bg-brand-500 py-1 rounded text-[10px] text-white font-bold"
                        >
                          Insert
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Table Insert */}
                  <div className="relative" ref={tablePopoverRef}>
                    <button
                      type="button"
                      onClick={() => setShowTablePopover(!showTablePopover)}
                      className={getBtnClass(editor?.isActive("table") || false)}
                    >
                      <TableIcon className="w-3.5 h-3.5" />
                    </button>
                    {showTablePopover && (
                      <div className="absolute right-0 mt-1 p-2 rounded bg-neutral-950 border border-white/[0.08] shadow-lg z-30 flex flex-col gap-1.5">
                        <span className="text-[9px] text-gray-400 font-bold">Quick Table (3x3)</span>
                        <button
                          type="button"
                          onClick={() => {
                            editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
                            setShowTablePopover(false);
                          }}
                          className="bg-brand-500 py-1 px-3 rounded text-[10px] text-white font-bold"
                        >
                          Insert 3x3 Table
                        </button>
                      </div>
                    )}
                  </div>

                  <button type="button" onClick={() => editor?.chain().focus().setHorizontalRule().run()} className={getBtnClass(false)}><Minus className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => editor?.chain().focus().clearNodes().unsetAllMarks().run()} className={getBtnClass(false)}><Eraser className="w-3.5 h-3.5" /></button>
                </div>
              </div>

              {/* Table Sub-Toolbar (Active when cursor is inside table) */}
              {editor?.isActive("table") && (
                <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 bg-brand-500/10 border border-brand-500/20 rounded-md text-brand-300 text-xs font-semibold animate-fade-in mt-1 select-none">
                  <span className="uppercase tracking-wider mr-2 text-[9px] text-brand-400 font-bold select-none">Table Tools:</span>
                  <button type="button" onClick={() => editor.chain().focus().addRowBefore().run()} className="btn-secondary py-0.5 px-1.5 rounded-sm text-[10px] font-medium border-brand-500/30 bg-neutral-900/50 hover:bg-neutral-900">Add Row Above</button>
                  <button type="button" onClick={() => editor.chain().focus().addRowAfter().run()} className="btn-secondary py-0.5 px-1.5 rounded-sm text-[10px] font-medium border-brand-500/30 bg-neutral-900/50 hover:bg-neutral-900">Add Row Below</button>
                  <button type="button" onClick={() => editor.chain().focus().deleteRow().run()} className="btn-danger py-0.5 px-1.5 rounded-sm text-[10px] font-medium bg-red-950/10 border-red-500/20 hover:bg-red-950/30">Delete Row</button>
                  <div className="h-4 w-px bg-brand-500/30 mx-0.5" />
                  <button type="button" onClick={() => editor.chain().focus().addColumnBefore().run()} className="btn-secondary py-0.5 px-1.5 rounded-sm text-[10px] font-medium border-brand-500/30 bg-neutral-900/50 hover:bg-neutral-900">Add Col Left</button>
                  <button type="button" onClick={() => editor.chain().focus().addColumnAfter().run()} className="btn-secondary py-0.5 px-1.5 rounded-sm text-[10px] font-medium border-brand-500/30 bg-neutral-900/50 hover:bg-neutral-900">Add Col Right</button>
                  <button type="button" onClick={() => editor.chain().focus().deleteColumn().run()} className="btn-danger py-0.5 px-1.5 rounded-sm text-[10px] font-medium bg-red-950/10 border-red-500/20 hover:bg-red-950/30">Delete Col</button>
                  <div className="h-4 w-px bg-brand-500/30 mx-0.5" />
                  <button type="button" onClick={() => editor.chain().focus().deleteTable().run()} className="btn-danger py-0.5 px-1.5 rounded-sm text-[10px] font-semibold bg-red-500/20 border-red-500/40 text-red-100 hover:bg-red-500/30">Delete Table</button>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-1 overflow-hidden">
            
            {/* EDITOR PANEL (LEFT) */}
            <div className={`flex flex-col ${previewMode ? "hidden sm:flex" : "flex"} ${
              noteType === "drawing" 
                ? "w-full overflow-hidden h-full" 
                : noteType === "checklist"
                  ? "w-full sm:w-[65%] border-r border-white/[0.06] overflow-y-auto"
                  : noteType === "text"
                    ? "w-full overflow-y-auto"
                    : "w-full sm:w-1/2 border-r border-white/[0.06] overflow-y-auto"
            }`}>
              
              {noteType === "text" && (
                <div 
                  className="flex-1 flex flex-col min-h-0 print-content overflow-y-auto"
                  onKeyDown={handleEditorKeyDown}
                >
                  <EditorContent editor={editor} className="flex-1" />
                </div>
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
            </div>

            {/* PREVIEW PANEL (RIGHT) - Only active for audio & checklist types */}
            {noteType !== "drawing" && noteType !== "text" && (
              <div className={`flex flex-col ${previewMode ? "flex" : "hidden sm:flex"} ${
                noteType === "checklist" ? "w-full sm:w-[35%]" : "w-full sm:w-1/2"
              } overflow-y-auto`}>
                
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
        </div>

        {/* AI Panel */}
        {noteType === "text" && showAI && note && (
          <div className="hidden lg:flex flex-col w-80 xl:w-96 border-l border-white/[0.06] overflow-y-auto p-4 select-none bg-surface-900/40 backdrop-blur-sm">
            <AIPanel note={note} onUpdateNote={setNote} />
          </div>
        )}
      </div>

      {/* Mobile AI panel (bottom sheet) */}
      {noteType === "text" && showAI && note && (
        <div className="lg:hidden border-t border-white/[0.06] max-h-64 overflow-y-auto p-4 select-none bg-surface-900/40 backdrop-blur-sm">
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
