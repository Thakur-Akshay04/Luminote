"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

import { notesApi, BASE_URL } from "@/lib/api";
import type { Note, ChecklistItem } from "@/types";
import AIPanel from "@/components/AIPanel";
import DrawingCanvas, { DrawingCanvasRef } from "@/components/DrawingCanvas";
import AudioRecorder from "@/components/AudioRecorder";
import ChecklistEditor from "@/components/ChecklistEditor";
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

const TextStyleExtended = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: element => element.style.fontSize,
        renderHTML: attributes => {
          if (!attributes.fontSize) {
            return {}
          }
          return {
            style: `font-size: ${attributes.fontSize}`,
          }
        },
      },
    }
  },
});

import {
  ArrowLeft,
  Save,
  Trash2,
  Loader2,
  Eye,
  Edit3,
  Brain,
  Zap,
  Wand2,
  ChevronRight,
  ChevronLeft,
  FileText,
  Palette,
  Mic,
  ListTodo,
  Plus,
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
  Printer,
  Upload
} from "lucide-react";
import Link from "next/link";

const generateSecureId = (): string => {
  const cryptoObj = typeof window !== "undefined" ? (window.crypto || (window as any).msCrypto) : null;
  if (cryptoObj && cryptoObj.getRandomValues) {
    const array = new Uint32Array(1);
    cryptoObj.getRandomValues(array);
    return array[0].toString();
  }
  return "fallback-id-" + Date.now();
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
          className={`rounded-lg transition-all duration-200 border-2 ${
            selected
              ? "border-brand-500 shadow-lg ring-2 ring-brand-500/20"
              : "border-transparent"
          }`}
        />
        {/* Resizer Handle at bottom-right edge */}
        <div
          onMouseDown={onMouseDown}
          className="absolute bottom-1.5 right-1.5 w-3.5 h-3.5 bg-brand-500 hover:bg-brand-400 rounded flex items-center justify-center cursor-se-resize opacity-0 group-hover:opacity-100 transition-opacity duration-150 shadow-md border border-white/20 select-none"
        >
          <svg
            className="w-2.5 h-2.5 text-white"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <line x1="22" y1="6" x2="6" y2="22" />
            <line x1="22" y1="14" x2="14" y2="22" />
          </svg>
        </div>
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
        renderHTML: (attributes) => {
          return {
            width: attributes.width,
          };
        },
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageNodeView);
  },
});

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

  const isDirty = useRef(false);
  const titleRef = useRef("");
  const contentRef = useRef("");
  const descriptionRef = useRef("");
  const aiContextRef = useRef("");
  const drawingCanvasRef = useRef<DrawingCanvasRef>(null);

  // Tabbed Rich Text Toolbar
  const [activeToolbarTab, setActiveToolbarTab] = useState<string>("Formatting");

  // Popover States
  const [showFontDropdown, setShowFontDropdown] = useState(false);
  const [showSizeDropdown, setShowSizeDropdown] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const [showLinkPopover, setShowLinkPopover] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [showImagePopover, setShowImagePopover] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showTablePopover, setShowTablePopover] = useState(false);
  const [hoveredGrid, setHoveredGrid] = useState<{ r: number; c: number } | null>(null);
  const [showClipboardPopover, setShowClipboardPopover] = useState(false);
  const [clipboardHistory, setClipboardHistory] = useState<{ id: string; type: "text" | "image"; content: string }[]>([]);
  
  // Sidebar Notes list state for specific type
  const [sidebarNotes, setSidebarNotes] = useState<Note[]>([]);
  const [sidebarLoading, setSidebarLoading] = useState(false);

  // Popover Refs
  const fontDropdownRef = useRef<HTMLDivElement>(null);
  const sizeDropdownRef = useRef<HTMLDivElement>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const highlightPickerRef = useRef<HTMLDivElement>(null);
  const linkPopoverRef = useRef<HTMLDivElement>(null);
  const imagePopoverRef = useRef<HTMLDivElement>(null);
  const tablePopoverRef = useRef<HTMLDivElement>(null);
  const clipboardPopoverRef = useRef<HTMLDivElement>(null);

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

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    setImageUploadError(null);
    try {
      const res = await notesApi.uploadImage(file);
      const relativeUrl = res.data.url;
      const fullUrl = relativeUrl.startsWith("http") ? relativeUrl : `${BASE_URL}${relativeUrl}`;
      editor?.chain().focus().setImage({ src: fullUrl }).run();
      setShowImagePopover(false);
      setImageUrl("");
    } catch (err: any) {
      const msg = err.response?.data?.detail || "Failed to upload image. Make sure it is a valid image file.";
      setImageUploadError(msg);
    } finally {
      setIsUploadingImage(false);
    }
  };

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
      if (clipboardPopoverRef.current && !clipboardPopoverRef.current.contains(target)) {
        setShowClipboardPopover(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Listen for copy, cut, paste events to build custom clipboard history
  useEffect(() => {
    const handleGlobalCopy = (e: ClipboardEvent) => {
      const text = window.getSelection()?.toString();
      if (text && text.trim()) {
        setClipboardHistory((prev) => {
          if (prev.some(item => item.content === text)) return prev;
          const isImg = text.startsWith("data:image/") || /\.(jpeg|jpg|gif|png|webp|svg)$/i.test(text.trim());
          return [{ id: generateSecureId(), type: isImg ? ("image" as const) : ("text" as const), content: text }, ...prev].slice(0, 10);
        });
      }
    };

    const handleGlobalPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf("image") !== -1) {
          const file = item.getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
              const base64 = event.target?.result as string;
              if (base64) {
                setClipboardHistory((prev) => {
                  if (prev.some(x => x.content === base64)) return prev;
                  return [{ id: generateSecureId(), type: "image" as const, content: base64 }, ...prev].slice(0, 10);
                });
              }
            };
            reader.readAsDataURL(file);
          }
        } else if (item.type === "text/plain") {
          item.getAsString((text) => {
            if (text && text.trim()) {
              setClipboardHistory((prev) => {
                if (prev.some(x => x.content === text)) return prev;
                const isImg = text.startsWith("data:image/") || /\.(jpeg|jpg|gif|png|webp|svg)$/i.test(text.trim());
                return [{ id: generateSecureId(), type: isImg ? ("image" as const) : ("text" as const), content: text }, ...prev].slice(0, 10);
              });
            }
          });
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
  }, []);

  // Tiptap Editor Setup
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        link: false,
        underline: false,
      }),
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
    onUpdate: ({ editor }) => {
      onContentChange(editor.getJSON());
    },
  });

  // Load content into editor on mount / when note is loaded
  useEffect(() => {
    if (!editor || !note || isEditorInitialized.current) return;
    
    // Do not load content into the rich text editor if the note is not a text note
    if (noteType !== "text") {
      isEditorInitialized.current = true;
      return;
    }

    let initialContent: any = "";
    if (note.content) {
      try {
        const parsed = JSON.parse(note.content);
        if (parsed && typeof parsed === "object" && parsed.type === "doc") {
          initialContent = parsed;
        } else if (parsed && typeof parsed === "object" && ("description" in parsed || "ai_context" in parsed)) {
          initialContent = parsed.description || "";
        } else {
          initialContent = note.content;
        }
      } catch {
        initialContent = note.content; // fallback
      }
    }

    const currentJsonStr = JSON.stringify(editor.getJSON());
    const isSame = note.content === currentJsonStr || (note.content === "" && editor.isEmpty);

    isEditorInitialized.current = true;
    if (!isSame) {
      setTimeout(() => {
        if (editor && !editor.isDestroyed) {
          editor.commands.setContent(initialContent);
        }
      }, 0);
    }
  }, [editor, note, noteType]);

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
    if (!isLoaded) return;
    if (noteId) {
      fetchNote();
    }
  }, [fetchNote, noteId, isLoaded]);

  const fetchSidebarNotes = useCallback(async (type: string) => {
    setSidebarLoading(true);
    try {
      const res = await notesApi.list(undefined, type);
      setSidebarNotes(res.data);
    } catch {
      // silent fallback
    } finally {
      setSidebarLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    if (noteType) {
      fetchSidebarNotes(noteType);
    }
  }, [noteType, fetchSidebarNotes, isLoaded]);

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
    return `p-1.5 rounded-md text-xs font-medium transition-all ${isActive
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
        <Link href="/notes" className="btn-secondary">← Back to notes</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Toolbar */}
      <div className="no-print flex flex-wrap items-center gap-4 px-5 py-3.5 border-b border-white/[0.05] bg-[#0c0c0e]/80 backdrop-blur-xl shadow-lg relative z-30 select-none">
        <Link
          href="/notes"
          className="flex items-center justify-center w-8 h-8 rounded-xl bg-white/[0.02] border border-white/[0.06] text-gray-400 hover:text-white hover:bg-white/[0.06] hover:border-white/[0.1] active:scale-95 transition-all shrink-0"
          id="back-to-notes"
          title="Back to Notes"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>

        <div className="h-4 w-px bg-white/10 shrink-0" />

        {/* Title input */}
        <input
          type="text"
          id="note-title"
          className="flex-1 bg-transparent text-white font-bold text-base placeholder-neutral-600
                     focus:outline-none min-w-[140px] tracking-tight py-1 transition-all"
          placeholder="Untitled Note…"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            titleRef.current = e.target.value;
            markDirty();
          }}
        />

        {/* Note Type Selector Tabs */}
        <div className="flex bg-white/[0.02] border border-white/[0.05] rounded-xl p-1 shrink-0 select-none items-center gap-1">
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
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-300
                  ${isSelected
                    ? "bg-gradient-to-tr from-brand-600 to-indigo-650 text-white shadow-md shadow-brand-500/10 scale-102 border border-brand-500/20"
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

        {/* Save indicator */}
        <div className="shrink-0 flex items-center">
          {hasUnsavedChanges && !saving && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[9px] font-bold uppercase tracking-wider animate-fade-in">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              Unsaved
            </span>
          )}
          {saving && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[9px] font-bold uppercase tracking-wider animate-fade-in">
              <Loader2 className="w-2.5 h-2.5 text-blue-400 animate-spin" />
              Saving
            </span>
          )}
          {saved && !saving && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-bold uppercase tracking-wider animate-fade-in">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Saved
            </span>
          )}
          {error && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-[9px] font-bold uppercase tracking-wider animate-fade-in">
              Error
            </span>
          )}
        </div>

        <div className="flex items-center gap-2.5 ml-auto shrink-0">
          {/* Preview toggle (mobile) - hidden for text notes */}
          {noteType !== "drawing" && noteType !== "text" && (
            <button
              onClick={() => setPreviewMode(!previewMode)}
              className="sm:hidden w-9 h-9 rounded-xl bg-neutral-900 border border-white/[0.08] hover:bg-neutral-800 text-gray-300 flex items-center justify-center text-xs active:scale-95 transition-all"
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
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-neutral-900 border border-white/[0.08] hover:bg-neutral-800 hover:border-white/[0.15] text-white text-xs font-semibold shadow-md active:scale-95 transition-all"
          >
            <Save className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Save</span>
          </button>

          {/* Delete */}
          <button
            id="delete-note-btn"
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center justify-center w-9 h-9 rounded-xl bg-neutral-900 border border-red-500/10 hover:bg-red-500/10 hover:border-red-500/25 text-red-400 hover:text-red-300 shadow-md active:scale-95 transition-all"
          >
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>

          {/* AI Panel toggle */}
          {noteType === "text" && (
            <button
              onClick={() => setShowAI(!showAI)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold shadow-md active:scale-95 transition-all
                ${showAI
                  ? "bg-gradient-to-tr from-indigo-600 to-brand-500 text-white border border-indigo-500/30 shadow-lg shadow-indigo-500/15"
                  : "bg-neutral-900 border border-indigo-500/15 text-indigo-400 hover:bg-indigo-500/10 hover:border-indigo-500/30"
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

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden animate-fade-in">
        {/* Left side-notes list navbar */}
        <aside className="no-print w-64 border-r border-white/[0.05] bg-[#0c0c0e]/30 backdrop-blur-md flex flex-col shrink-0 select-none">
          {/* Sidebar Header */}
          <div className="px-4.5 py-4 border-b border-white/[0.04] flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                Workspace
              </span>
              <span className="text-xs font-bold text-white mt-0.5">
                {noteType === "text" && "Text Notes"}
                {noteType === "drawing" && "Drawing Notes"}
                {noteType === "audio" && "Voice Notes"}
                {noteType === "checklist" && "Checklists"}
                {!noteType && "\u00a0"}
              </span>
            </div>
            {/* Create new note of current type */}
            <button
              onClick={() => {
                isDirty.current = false;
                setHasUnsavedChanges(false);
                router.push(`/notes/new?type=${noteType}`);
              }}
              title={`New ${noteType === "checklist" ? "checklist" : noteType + " note"}`}
              className="w-7 h-7 rounded-lg bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.1] active:scale-95 text-gray-300 hover:text-white flex items-center justify-center transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Notes list items */}
          <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-1 scrollbar-thin">
            {(() => {
              const filteredSidebarNotes = sidebarNotes.filter(
                (n) => n.note_type === noteType || n.id === noteId
              );

              if (sidebarLoading && filteredSidebarNotes.length === 0) {
                return (
                  <div className="flex flex-col gap-2 p-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-10 w-full bg-white/[0.02] border border-white/[0.04] rounded-xl animate-pulse" />
                    ))}
                  </div>
                );
              }

              if (filteredSidebarNotes.length === 0) {
                return (
                  <div className="text-center py-8 text-[11px] text-neutral-500 italic">
                    No {noteType === "checklist" ? "checklists" : `${noteType} notes`} yet.
                  </div>
                );
              }

              return filteredSidebarNotes.map((n) => {
                const isActive = n.id === noteId;
                const noteTitle = n.id === noteId ? (title || "Untitled Note") : (n.title || "Untitled Note");
                
                // Date formatting
                let displayDate = "";
                try {
                  const date = new Date(n.updated_at);
                  displayDate = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
                } catch {}

                return (
                  <button
                    key={n.id}
                    onClick={() => {
                      if (isActive) return;
                      // Prompt if dirty (auto-save is usually active, but let's just transition or save)
                      if (isDirty.current) {
                        saveNote().then(() => {
                          router.push(`/notes/${n.id}`);
                        });
                      } else {
                        router.push(`/notes/${n.id}`);
                      }
                    }}
                    className={`group w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs transition-all duration-200 border text-left truncate relative ${
                      isActive
                        ? "bg-gradient-to-tr from-brand-600/10 to-indigo-650/5 border-brand-500/20 text-white font-semibold shadow-sm"
                        : "bg-transparent border-transparent text-neutral-400 hover:text-white hover:bg-white/[0.02] hover:border-white/[0.04]"
                    }`}
                  >
                    {n.note_type === "text" && <FileText className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-brand-400" : "text-neutral-500 group-hover:text-neutral-300"}`} />}
                    {n.note_type === "drawing" && <Palette className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-amber-400" : "text-neutral-500 group-hover:text-neutral-300"}`} />}
                    {n.note_type === "audio" && <Mic className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-red-400" : "text-neutral-500 group-hover:text-neutral-300"}`} />}
                    {n.note_type === "checklist" && <ListTodo className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-green-400" : "text-neutral-500 group-hover:text-neutral-300"}`} />}
                    
                    <span className="truncate pr-8 flex-1 text-[11px]">{noteTitle}</span>

                    {displayDate && (
                      <span className="absolute right-3 text-[9px] text-neutral-500 font-medium select-none group-hover:text-neutral-400 transition-colors">
                        {displayDate}
                      </span>
                    )}
                  </button>
                );
              });
            })()}
          </div>
        </aside>

        {/* Editor + Preview (split) */}
        <div className="flex flex-1 overflow-hidden flex-col">

          {/* TIPTAP RICH TEXT TOOLBAR (Sticky at top of text note) */}
          {noteType === "text" && (
            <div className="no-print sticky top-0 z-20 bg-neutral-900 border-b border-white/[0.06] p-2 flex flex-col gap-1.5 select-none shrink-0">

              {/* Category tabs aligned horizontally */}
              <div
                className="flex items-center gap-2 overflow-x-auto pb-1.5 mb-1 border-b border-white/[0.04] scrollbar-none"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                {[
                  "History & Clipboard",
                  "Font & Size",
                  "Formatting",
                  "Paragraph & Align",
                  "Lists & Indent",
                  "Insert & Clear",
                  "Print & Utilities"
                ].map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveToolbarTab(tab)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${activeToolbarTab === tab
                      ? "bg-brand-500/15 text-brand-300 border border-brand-500/30"
                      : "text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.02] border border-transparent"
                      }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Selected heading tools row */}
              <div className="min-h-[40px] flex items-center px-1">
                {activeToolbarTab === "History & Clipboard" && (
                  <div className="flex items-center gap-1.5 animate-fade-in">
                    <button type="button" onClick={() => editor?.chain().focus().undo().run()} className={getBtnClass(false)} title="Undo (Ctrl+Z)"><Undo className="w-4 h-4" /></button>
                    <button type="button" onClick={() => editor?.chain().focus().redo().run()} className={getBtnClass(false)} title="Redo (Ctrl+Shift+Z)"><Redo className="w-4 h-4" /></button>
                    <div className="h-5 w-px bg-white/10 mx-1.5" />
                    <button type="button" onClick={handleCut} className={getBtnClass(false)} title="Cut"><Scissors className="w-4 h-4" /></button>
                    <button type="button" onClick={handleCopy} className={getBtnClass(false)} title="Copy"><Copy className="w-4 h-4" /></button>
                    {/* Clipboard History Popover */}
                    <div className="relative" ref={clipboardPopoverRef}>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.readText().then(text => {
                            if (text && text.trim()) {
                              setClipboardHistory((prev) => {
                                if (prev.some(item => item.content === text)) return prev;
                                const isImg = text.startsWith("data:image/") || /\.(jpeg|jpg|gif|png|webp|svg)$/i.test(text.trim());
                                return [{ id: generateSecureId(), type: isImg ? ("image" as const) : ("text" as const), content: text }, ...prev].slice(0, 10);
                              });
                            }
                          }).catch(() => { });
                          setShowClipboardPopover(!showClipboardPopover);
                        }}
                        className={getBtnClass(showClipboardPopover)}
                        title="Clipboard History (Text & Images)"
                      >
                        <Clipboard className="w-4 h-4" />
                      </button>
                      {showClipboardPopover && (
                        <div className="absolute left-0 mt-1 p-3 rounded-xl bg-neutral-950 border border-white/[0.08] shadow-lg z-30 w-64 flex flex-col gap-2.5 max-h-72 overflow-y-auto">
                          <span className="text-[10px] font-bold uppercase text-gray-500 tracking-wider">Clipboard History</span>

                          {clipboardHistory.length === 0 ? (
                            <span className="text-xs text-neutral-600 italic text-center py-4">History is empty. Copy some text or images first.</span>
                          ) : (
                            <div className="flex flex-col gap-3">
                              {/* Text items */}
                              {clipboardHistory.some(item => item.type === "text") && (
                                <div className="flex flex-col gap-1.5">
                                  <span className="text-[9px] font-bold uppercase text-brand-400">Copied Text</span>
                                  <div className="flex flex-col gap-1">
                                    {clipboardHistory.filter(item => item.type === "text").map((item) => (
                                      <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => {
                                          editor?.chain().focus().insertContent(item.content).run();
                                          setShowClipboardPopover(false);
                                        }}
                                        className="w-full text-left p-2 rounded-lg bg-neutral-900 border border-white/[0.04] hover:bg-neutral-800 hover:border-brand-500/30 text-xs text-gray-300 truncate transition-colors"
                                        title={item.content}
                                      >
                                        {item.content}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Image items */}
                              {clipboardHistory.some(item => item.type === "image") && (
                                <div className="flex flex-col gap-1.5 mt-1.5 border-t border-white/[0.04] pt-2">
                                  <span className="text-[9px] font-bold uppercase text-brand-400">Copied Images</span>
                                  <div className="grid grid-cols-2 gap-1.5">
                                    {clipboardHistory.filter(item => item.type === "image").map((item) => (
                                      <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => {
                                          editor?.chain().focus().setImage({ src: item.content }).run();
                                          setShowClipboardPopover(false);
                                        }}
                                        className="p-1 rounded-lg bg-neutral-900 border border-white/[0.04] hover:bg-neutral-800 hover:border-brand-500/30 transition-all aspect-video overflow-hidden flex items-center justify-center relative"
                                        title="Click to paste image"
                                      >
                                        <img src={item.content} className="max-h-full max-w-full object-cover rounded-md" alt="Clipboard Preview" />
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeToolbarTab === "Font & Size" && (
                  <div className="flex items-center gap-2.5 animate-fade-in">
                    {/* Font Family Dropdown */}
                    <div className="relative" ref={fontDropdownRef}>
                      <button
                        type="button"
                        onClick={() => setShowFontDropdown(!showFontDropdown)}
                        className="px-2.5 py-1.5 rounded-lg bg-neutral-950 border border-white/[0.08] text-xs text-gray-300 flex items-center gap-2 hover:bg-neutral-900 transition-all font-medium min-w-[130px]"
                      >
                        <span className="truncate max-w-[90px]">{getActiveFontFamily()}</span>
                        <span className="text-[8px] text-gray-500 ml-auto">▼</span>
                      </button>
                      {showFontDropdown && (
                        <div className="absolute left-0 mt-1 w-44 rounded-lg bg-neutral-950 border border-white/[0.08] shadow-lg z-30 py-1 max-h-48 overflow-y-auto">
                          {["Inter", "Georgia", "Courier New", "Arial", "Times New Roman"].map((font) => (
                            <button
                              key={font}
                              type="button"
                              onClick={() => {
                                editor?.chain().focus().setFontFamily(font).run();
                                setShowFontDropdown(false);
                              }}
                              className={`w-full px-3 py-2 text-left text-xs transition-colors hover:bg-white/[0.05] ${getActiveFontFamily() === font ? "text-brand-400 font-bold" : "text-gray-300"
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
                        className="px-2.5 py-1.5 rounded-lg bg-neutral-950 border border-white/[0.08] text-xs text-gray-300 flex items-center gap-2 hover:bg-neutral-900 transition-all font-medium min-w-[80px]"
                      >
                        <span>{getActiveFontSize()} px</span>
                        <span className="text-[8px] text-gray-500 ml-auto">▼</span>
                      </button>
                      {showSizeDropdown && (
                        <div className="absolute left-0 mt-1 w-24 max-h-48 overflow-y-auto rounded-lg bg-neutral-950 border border-white/[0.08] shadow-lg z-30 py-1">
                          {[10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72].map((size) => (
                            <button
                              key={size}
                              type="button"
                              onClick={() => {
                                editor?.chain().focus().setMark("textStyle", { fontSize: size + "px" }).run();
                                setShowSizeDropdown(false);
                              }}
                              className={`w-full px-3 py-2 text-left text-xs transition-colors hover:bg-white/[0.05] ${getActiveFontSize() === String(size) ? "text-brand-400 font-bold" : "text-gray-300"
                                }`}
                            >
                              {size}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeToolbarTab === "Formatting" && (
                  <div className="flex items-center gap-1.5 animate-fade-in">
                    <button type="button" onClick={() => editor?.chain().focus().toggleBold().run()} className={getBtnClass(editor?.isActive("bold") || false)} title="Bold (Ctrl+B)"><Bold className="w-4 h-4" /></button>
                    <button type="button" onClick={() => editor?.chain().focus().toggleItalic().run()} className={getBtnClass(editor?.isActive("italic") || false)} title="Italic (Ctrl+I)"><Italic className="w-4 h-4" /></button>
                    <button type="button" onClick={() => editor?.chain().focus().toggleUnderline().run()} className={getBtnClass(editor?.isActive("underline") || false)} title="Underline (Ctrl+U)"><UnderlineIcon className="w-4 h-4" /></button>
                    <button type="button" onClick={() => editor?.chain().focus().toggleStrike().run()} className={getBtnClass(editor?.isActive("strike") || false)} title="Strikethrough"><Strikethrough className="w-4 h-4" /></button>
                    <button type="button" onClick={() => editor?.chain().focus().toggleSubscript().run()} className={getBtnClass(editor?.isActive("subscript") || false)} title="Subscript"><SubscriptIcon className="w-4 h-4" /></button>
                    <button type="button" onClick={() => editor?.chain().focus().toggleSuperscript().run()} className={getBtnClass(editor?.isActive("superscript") || false)} title="Superscript"><SuperscriptIcon className="w-4 h-4" /></button>
                    <div className="h-5 w-px bg-white/10 mx-1.5" />

                    {/* Text Color Picker */}
                    <div className="relative" ref={colorPickerRef}>
                      <button
                        type="button"
                        onClick={() => setShowColorPicker(!showColorPicker)}
                        className={`p-1.5 rounded-md hover:bg-white/[0.04] border border-transparent transition-all flex items-center gap-1.5 ${showColorPicker ? "bg-white/[0.05] border-white/10" : ""
                          }`}
                        title="Text Color"
                      >
                        <div className="flex flex-col items-center justify-center">
                          <span className="text-xs font-bold font-serif leading-none mt-[-2px]">A</span>
                          <div
                            className="w-4 h-0.5 mt-0.5 rounded-full"
                            style={{ backgroundColor: editor?.getAttributes("textStyle").color || "#e5e7eb" }}
                          />
                        </div>
                      </button>
                      {showColorPicker && (
                        <div className="absolute left-0 mt-1 p-2 rounded-lg bg-neutral-950 border border-white/[0.08] shadow-lg z-30 w-36">
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
                        className={`p-1.5 rounded-md hover:bg-white/[0.04] border border-transparent transition-all flex items-center gap-1.5 ${showHighlightPicker ? "bg-white/[0.05] border-white/10" : ""
                          }`}
                        title="Highlight Color"
                      >
                        <Palette className="w-4 h-4" />
                      </button>
                      {showHighlightPicker && (
                        <div className="absolute left-0 mt-1 p-2 rounded-lg bg-neutral-950 border border-white/[0.08] shadow-lg z-30 w-36">
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
                )}

                {activeToolbarTab === "Paragraph & Align" && (
                  <div className="flex items-center gap-1.5 animate-fade-in">
                    <button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} className={getBtnClass(editor?.isActive("heading", { level: 1 }) || false)} title="Heading 1">H1</button>
                    <button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} className={getBtnClass(editor?.isActive("heading", { level: 2 }) || false)} title="Heading 2">H2</button>
                    <button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} className={getBtnClass(editor?.isActive("heading", { level: 3 }) || false)} title="Heading 3">H3</button>
                    <button type="button" onClick={() => editor?.chain().focus().setParagraph().run()} className={getBtnClass(editor?.isActive("paragraph") || false)} title="Normal text">P</button>
                    <div className="h-5 w-px bg-white/10 mx-1.5" />
                    <button type="button" onClick={() => editor?.chain().focus().setTextAlign("left").run()} className={getBtnClass(editor?.isActive({ textAlign: "left" }) || false)} title="Align Left"><AlignLeft className="w-4 h-4" /></button>
                    <button type="button" onClick={() => editor?.chain().focus().setTextAlign("center").run()} className={getBtnClass(editor?.isActive({ textAlign: "center" }) || false)} title="Align Center"><AlignCenter className="w-4 h-4" /></button>
                    <button type="button" onClick={() => editor?.chain().focus().setTextAlign("right").run()} className={getBtnClass(editor?.isActive({ textAlign: "right" }) || false)} title="Align Right"><AlignRight className="w-4 h-4" /></button>
                    <button type="button" onClick={() => editor?.chain().focus().setTextAlign("justify").run()} className={getBtnClass(editor?.isActive({ textAlign: "justify" }) || false)} title="Justify"><AlignJustify className="w-4 h-4" /></button>
                  </div>
                )}

                {activeToolbarTab === "Lists & Indent" && (
                  <div className="flex items-center gap-1.5 animate-fade-in">
                    <button type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()} className={getBtnClass(editor?.isActive("bulletList") || false)} title="Bullet List"><List className="w-4 h-4" /></button>
                    <button type="button" onClick={() => editor?.chain().focus().toggleOrderedList().run()} className={getBtnClass(editor?.isActive("orderedList") || false)} title="Numbered List"><ListOrdered className="w-4 h-4" /></button>
                    <button type="button" onClick={() => editor?.chain().focus().toggleBlockquote().run()} className={getBtnClass(editor?.isActive("blockquote") || false)} title="Blockquote"><Quote className="w-4 h-4" /></button>
                    <button type="button" onClick={() => editor?.chain().focus().toggleCodeBlock().run()} className={getBtnClass(editor?.isActive("codeBlock") || false)} title="Code Block"><Code className="w-4 h-4" /></button>
                    <div className="h-5 w-px bg-white/10 mx-1.5" />
                    <button type="button" onClick={() => editor?.chain().focus().liftListItem("listItem").run()} className={getBtnClass(false)} title="Decrease Indent (Shift+Tab)"><Outdent className="w-4 h-4" /></button>
                    <button type="button" onClick={() => editor?.chain().focus().sinkListItem("listItem").run()} className={getBtnClass(false)} title="Increase Indent (Tab)"><Indent className="w-4 h-4" /></button>
                  </div>
                )}

                {activeToolbarTab === "Insert & Clear" && (
                  <div className="flex items-center gap-1.5 animate-fade-in">
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
                        <LinkIcon className="w-4 h-4" />
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
                        <ImageIcon className="w-4 h-4" />
                      </button>
                      {showImagePopover && (
                        <div className="absolute left-0 mt-1 p-3 rounded-xl bg-neutral-950 border border-white/[0.08] shadow-lg z-30 w-72 flex flex-col gap-3">
                          <div className="flex flex-col gap-1.5">
                            <span className="text-[10px] font-bold uppercase text-gray-500 tracking-wider">Insert Image URL</span>
                            <input
                              type="text"
                              className="w-full bg-neutral-900 border border-neutral-800 rounded px-2.5 py-1 text-xs text-gray-200 focus:outline-none focus:border-brand-500"
                              placeholder="https://example.com/image.jpg"
                              value={imageUrl}
                              onChange={(e) => setImageUrl(e.target.value)}
                              disabled={isUploadingImage}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !isUploadingImage) {
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
                                onClick={() => {
                                  if (imageUrl) {
                                    editor?.chain().focus().setImage({ src: imageUrl }).run();
                                  }
                                  setShowImagePopover(false);
                                  setImageUrl("");
                                }}
                                disabled={isUploadingImage || !imageUrl}
                                className="px-2.5 py-1 text-[11px] font-bold bg-brand-500 hover:bg-brand-400 text-white rounded transition-colors disabled:opacity-50"
                              >
                                Insert URL
                              </button>
                            </div>
                          </div>

                          <div className="relative flex py-1 items-center">
                            <div className="flex-grow border-t border-white/[0.06]"></div>
                            <span className="flex-shrink mx-2 text-[9px] text-gray-600 font-bold uppercase">OR</span>
                            <div className="flex-grow border-t border-white/[0.06]"></div>
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <span className="text-[10px] font-bold uppercase text-gray-500 tracking-wider">Upload from computer</span>
                            <input
                              type="file"
                              ref={fileInputRef}
                              onChange={handleImageUpload}
                              accept="image/*"
                              disabled={isUploadingImage}
                              className="hidden"
                            />
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              disabled={isUploadingImage}
                              className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-neutral-800 hover:border-brand-500/50 hover:bg-neutral-900 rounded-lg text-xs font-semibold text-gray-300 hover:text-white transition-all duration-200"
                            >
                              {isUploadingImage ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-500" />
                                  <span>Uploading image...</span>
                                </>
                              ) : (
                                <>
                                  <Upload className="w-3.5 h-3.5 text-neutral-500" />
                                  <span>Choose local picture</span>
                                </>
                              )}
                            </button>
                            {imageUploadError && (
                              <p className="text-[10px] text-red-400 mt-1 leading-normal">
                                {imageUploadError}
                              </p>
                            )}
                          </div>

                          <div className="flex border-t border-white/[0.04] pt-2 mt-1">
                            <button
                              type="button"
                              onClick={() => {
                                setShowImagePopover(false);
                                setImageUrl("");
                                setImageUploadError(null);
                              }}
                              disabled={isUploadingImage}
                              className="ml-auto px-2.5 py-1 text-[11px] font-medium text-gray-400 hover:text-gray-200 transition-colors"
                            >
                              Close
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
                        <TableIcon className="w-4 h-4" />
                      </button>
                      {showTablePopover && (
                        <div className="absolute left-0 mt-1 p-3 rounded-xl bg-neutral-950 border border-white/[0.08] shadow-lg z-30 flex flex-col gap-2.5 select-none w-[166px]">
                          <span className="text-[10px] font-bold uppercase text-gray-500 tracking-wider font-sans text-gray-400">Insert Table Grid</span>
                          <div
                            className="grid grid-cols-6 gap-1"
                            onMouseLeave={() => setHoveredGrid(null)}
                          >
                            {Array.from({ length: 36 }).map((_, index) => {
                              const row = Math.floor(index / 6) + 1;
                              const col = (index % 6) + 1;
                              const isSelected = hoveredGrid && row <= hoveredGrid.r && col <= hoveredGrid.c;
                              return (
                                <button
                                  key={index}
                                  type="button"
                                  onMouseEnter={() => setHoveredGrid({ r: row, c: col })}
                                  onClick={() => {
                                    editor?.chain().focus().insertTable({ rows: row, cols: col, withHeaderRow: true }).run();
                                    setShowTablePopover(false);
                                    setHoveredGrid(null);
                                  }}
                                  className={`w-5 h-5 rounded transition-colors border ${isSelected
                                    ? "bg-brand-500/80 border-brand-500"
                                    : "bg-neutral-900 border-neutral-800 hover:border-neutral-700"
                                    }`}
                                />
                              );
                            })}
                          </div>
                          <span className="text-[10px] font-bold text-center text-gray-400 font-sans">
                            {hoveredGrid ? `${hoveredGrid.r} x ${hoveredGrid.c} Table` : "Hover to choose size"}
                          </span>
                        </div>
                      )}
                    </div>

                    <button type="button" onClick={() => editor?.chain().focus().setHorizontalRule().run()} className={getBtnClass(false)} title="Horizontal Rule"><Minus className="w-4 h-4" /></button>
                    <button type="button" onClick={() => editor?.chain().focus().clearNodes().unsetAllMarks().run()} className={getBtnClass(false)} title="Clear Formatting"><Eraser className="w-4 h-4" /></button>
                  </div>
                )}

                {activeToolbarTab === "Print & Utilities" && (
                  <div className="flex flex-wrap items-center gap-2.5 animate-fade-in w-full">
                    <span className="text-xs text-gray-400 bg-neutral-950 border border-white/[0.08] px-3 py-1.5 rounded-lg font-mono select-none">Words: {wordCount}</span>
                    <span className="text-xs text-gray-400 bg-neutral-950 border border-white/[0.08] px-3 py-1.5 rounded-lg font-mono select-none">Characters: {charCount}</span>
                    <button type="button" onClick={() => window.print()} className="ml-auto btn-secondary py-1.5 px-3.5 text-xs flex items-center gap-1.5 border-neutral-800 hover:border-neutral-700 font-medium" title="Print Document"><Printer className="w-4 h-4" /> Print</button>
                  </div>
                )}
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
            <div className={`flex flex-col ${previewMode ? "hidden sm:flex" : "flex"} ${noteType === "drawing"
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
                  {/* Centered Heading visible only in print */}
                  <div className="only-print flex-col items-center justify-center border-b-2 border-neutral-300 pb-4 mb-6 w-full text-center">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">Luminote</span>
                    <h2 className="text-2xl font-bold text-black">{title || "Untitled Note"}</h2>
                    <div className="flex gap-4 mt-2 text-xs text-neutral-500 justify-center font-medium">
                      <span>Date: {note ? new Date(note.created_at).toLocaleDateString() : new Date().toLocaleDateString()}</span>
                      <span>Time: {note ? new Date(note.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>

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
              <div className={`flex flex-col ${previewMode ? "flex" : "hidden sm:flex"} ${noteType === "checklist" ? "w-full sm:w-[35%]" : "w-full sm:w-1/2"
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
                      <Brain className="w-3.5 h-3.5 text-brand-400 animate-pulse" />
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
                          <Wand2 className="w-4 h-4 text-white" />
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
            <AIPanel note={note} onUpdateNote={setNote} editor={editor} />
          </div>
        )}
      </div>

      {/* Mobile AI panel (bottom sheet) */}
      {noteType === "text" && showAI && note && (
        <div className="lg:hidden border-t border-white/[0.06] max-h-64 overflow-y-auto p-4 select-none bg-surface-900/40 backdrop-blur-sm">
          <AIPanel note={note} onUpdateNote={setNote} editor={editor} />
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
