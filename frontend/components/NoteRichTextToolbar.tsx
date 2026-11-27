"use client";

import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Clipboard,
  Code,
  Copy,
  Eraser,
  Image as ImageIcon,
  Indent,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Loader2,
  Minus,
  Outdent,
  Palette,
  Printer,
  Quote,
  Redo,
  Scissors,
  Strikethrough,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  Table as TableIcon,
  Underline as UnderlineIcon,
  Undo,
  Upload,
} from "lucide-react";

export interface ClipboardItem {
  id: string;
  type: "text" | "image";
  content: string;
}

const TOOLBAR_TABS = [
  "History & Clipboard",
  "Formatting",
  "Paragraph & Align",
  "Lists & Indent",
  "Insert & Clear",
  "Print & Utilities",
] as const;

const FONT_FAMILIES = ["Inter", "Georgia", "Courier New", "Arial", "Times New Roman"];
const FONT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];

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

const TABLE_GRID_CELLS = Array.from({ length: 36 }, (_, index) => ({
  key: `cell-${Math.floor(index / 6) + 1}-${(index % 6) + 1}`,
  row: Math.floor(index / 6) + 1,
  col: (index % 6) + 1,
}));

function getBtnClass(isActive: boolean): string {
  return `p-1.5 rounded-md text-xs font-medium transition-all ${
    isActive
      ? "bg-brand-500/20 text-brand-300 border border-brand-500/40"
      : "text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] border border-transparent"
  }`;
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, onClose]);
}

function TableSubToolbar({ editor }: Readonly<{ editor: Editor | null }>) {
  if (!editor?.isActive("table")) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 bg-brand-500/10 border border-brand-500/20 rounded-md text-brand-300 text-xs font-semibold animate-fade-in mt-1 select-none">
      <span className="uppercase tracking-wider mr-2 text-[9px] text-brand-400 font-bold select-none">
        Table Tools:
      </span>
      <button type="button" onClick={() => editor.chain().focus().addRowBefore().run()} className="btn-secondary py-0.5 px-1.5 rounded-sm text-[10px] font-medium border-brand-500/30 bg-neutral-900/50 hover:bg-neutral-900">
        Add Row Above
      </button>
      <button type="button" onClick={() => editor.chain().focus().addRowAfter().run()} className="btn-secondary py-0.5 px-1.5 rounded-sm text-[10px] font-medium border-brand-500/30 bg-neutral-900/50 hover:bg-neutral-900">
        Add Row Below
      </button>
      <button type="button" onClick={() => editor.chain().focus().deleteRow().run()} className="btn-danger py-0.5 px-1.5 rounded-sm text-[10px] font-medium bg-red-950/10 border-red-500/20 hover:bg-red-950/30">
        Delete Row
      </button>
      <div className="h-4 w-px bg-brand-500/30 mx-0.5" />
      <button type="button" onClick={() => editor.chain().focus().addColumnBefore().run()} className="btn-secondary py-0.5 px-1.5 rounded-sm text-[10px] font-medium border-brand-500/30 bg-neutral-900/50 hover:bg-neutral-900">
        Add Col Left
      </button>
      <button type="button" onClick={() => editor.chain().focus().addColumnAfter().run()} className="btn-secondary py-0.5 px-1.5 rounded-sm text-[10px] font-medium border-brand-500/30 bg-neutral-900/50 hover:bg-neutral-900">
        Add Col Right
      </button>
      <button type="button" onClick={() => editor.chain().focus().deleteColumn().run()} className="btn-danger py-0.5 px-1.5 rounded-sm text-[10px] font-medium bg-red-950/10 border-red-500/20 hover:bg-red-950/30">
        Delete Col
      </button>
      <div className="h-4 w-px bg-brand-500/30 mx-0.5" />
      <button type="button" onClick={() => editor.chain().focus().deleteTable().run()} className="btn-danger py-0.5 px-1.5 rounded-sm text-[10px] font-semibold bg-red-500/20 border-red-500/40 text-red-100 hover:bg-red-500/30">
        Delete Table
      </button>
    </div>
  );
}

function ClipboardPopoverContent({
  clipboardHistory,
  onInsertText,
  onInsertImage,
}: Readonly<{
  clipboardHistory: ClipboardItem[];
  onInsertText: (text: string) => void;
  onInsertImage: (src: string) => void;
}>) {
  if (clipboardHistory.length === 0) {
    return (
      <span className="text-xs text-neutral-600 italic text-center py-4">
        History is empty. Copy some text or images first.
      </span>
    );
  }
  const textItems = clipboardHistory.filter((item) => item.type === "text");
  const imageItems = clipboardHistory.filter((item) => item.type === "image");

  return (
    <div className="flex flex-col gap-3">
      {textItems.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] font-bold uppercase text-brand-400">Copied Text</span>
          <div className="flex flex-col gap-1">
            {textItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onInsertText(item.content)}
                className="w-full text-left p-2 rounded-lg bg-neutral-900 border border-white/[0.04] hover:bg-neutral-800 hover:border-brand-500/30 text-xs text-gray-300 truncate transition-colors"
                title={item.content}
              >
                {item.content}
              </button>
            ))}
          </div>
        </div>
      )}
      {imageItems.length > 0 && (
        <div className="flex flex-col gap-1.5 mt-1.5 border-t border-white/[0.04] pt-2">
          <span className="text-[9px] font-bold uppercase text-brand-400">Copied Images</span>
          <div className="grid grid-cols-2 gap-1.5">
            {imageItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onInsertImage(item.content)}
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
  );
}

function HistoryClipboardTab({
  editor,
  clipboardHistory,
  onCut,
  onCopy,
  onReadClipboard,
}: Readonly<{
  editor: Editor | null;
  clipboardHistory: ClipboardItem[];
  onCut: () => void;
  onCopy: () => void;
  onReadClipboard: (text: string) => void;
}>) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  useClickOutside(popoverRef, () => setOpen(false));

  return (
    <div className="flex items-center gap-1.5 animate-fade-in">
      <button type="button" onClick={() => editor?.chain().focus().undo().run()} className={getBtnClass(false)} title="Undo (Ctrl+Z)">
        <Undo className="w-4 h-4" />
      </button>
      <button type="button" onClick={() => editor?.chain().focus().redo().run()} className={getBtnClass(false)} title="Redo (Ctrl+Shift+Z)">
        <Redo className="w-4 h-4" />
      </button>
      <div className="h-5 w-px bg-white/10 mx-1.5" />
      <button type="button" onClick={onCut} className={getBtnClass(false)} title="Cut">
        <Scissors className="w-4 h-4" />
      </button>
      <button type="button" onClick={onCopy} className={getBtnClass(false)} title="Copy">
        <Copy className="w-4 h-4" />
      </button>
      <div className="relative" ref={popoverRef}>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard
              .readText()
              .then((text) => {
                if (text?.trim()) onReadClipboard(text);
              })
              .catch(() => undefined);
            setOpen((prev) => !prev);
          }}
          className={getBtnClass(open)}
          title="Clipboard History (Text & Images)"
        >
          <Clipboard className="w-4 h-4" />
        </button>
        {open && (
          <div className="absolute left-0 mt-1 p-3 rounded-xl bg-neutral-950 border border-white/[0.08] shadow-lg z-30 w-64 flex flex-col gap-2.5 max-h-72 overflow-y-auto">
            <span className="text-[10px] font-bold uppercase text-gray-500 tracking-wider">Clipboard History</span>
            <ClipboardPopoverContent
              clipboardHistory={clipboardHistory}
              onInsertText={(text) => {
                editor?.chain().focus().insertContent(text).run();
                setOpen(false);
              }}
              onInsertImage={(src) => {
                editor?.chain().focus().setImage({ src }).run();
                setOpen(false);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function FontFamilyDropdown({ editor }: Readonly<{ editor: Editor | null }>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));
  const activeFont = editor?.getAttributes("textStyle").fontFamily || "Inter";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="px-2.5 py-1.5 rounded-lg bg-neutral-950 border border-white/[0.08] text-xs text-gray-300 flex items-center gap-2 hover:bg-neutral-900 transition-all font-medium min-w-[130px]"
      >
        <span className="truncate max-w-[90px]">{activeFont}</span>
        <span className="text-[8px] text-gray-500 ml-auto">▼</span>
      </button>
      {open && (
        <div className="absolute left-0 mt-1 w-44 rounded-lg bg-neutral-950 border border-white/[0.08] shadow-lg z-30 py-1 max-h-48 overflow-y-auto">
          {FONT_FAMILIES.map((font) => (
            <button
              key={font}
              type="button"
              onClick={() => {
                editor?.chain().focus().setFontFamily(font).run();
                setOpen(false);
              }}
              className={`w-full px-3 py-2 text-left text-xs transition-colors hover:bg-white/[0.05] ${
                activeFont === font ? "text-brand-400 font-bold" : "text-gray-300"
              }`}
              style={{ fontFamily: font }}
            >
              {font}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FontSizeDropdown({ editor }: Readonly<{ editor: Editor | null }>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));
  const rawSize = editor?.getAttributes("textStyle").fontSize;
  const activeSize = rawSize ? rawSize.replace("px", "") : "16";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="px-2.5 py-1.5 rounded-lg bg-neutral-950 border border-white/[0.08] text-xs text-gray-300 flex items-center gap-2 hover:bg-neutral-900 transition-all font-medium min-w-[80px]"
      >
        <span>{activeSize} px</span>
        <span className="text-[8px] text-gray-500 ml-auto">▼</span>
      </button>
      {open && (
        <div className="absolute left-0 mt-1 w-24 max-h-48 overflow-y-auto rounded-lg bg-neutral-950 border border-white/[0.08] shadow-lg z-30 py-1">
          {FONT_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => {
                editor?.chain().focus().setMark("textStyle", { fontSize: `${size}px` }).run();
                setOpen(false);
              }}
              className={`w-full px-3 py-2 text-left text-xs transition-colors hover:bg-white/[0.05] ${
                activeSize === String(size) ? "text-brand-400 font-bold" : "text-gray-300"
              }`}
            >
              {size}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TextColorPicker({ editor }: Readonly<{ editor: Editor | null }>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));
  const activeColor = editor?.getAttributes("textStyle").color || "#e5e7eb";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`p-1.5 rounded-md hover:bg-white/[0.04] border border-transparent transition-all flex items-center gap-1.5 ${
          open ? "bg-white/[0.05] border-white/10" : ""
        }`}
        title="Text Color"
      >
        <div className="flex flex-col items-center justify-center">
          <span className="text-xs font-bold font-serif leading-none mt-[-2px]">A</span>
          <div className="w-4 h-0.5 mt-0.5 rounded-full" style={{ backgroundColor: activeColor }} />
        </div>
      </button>
      {open && (
        <div className="absolute left-0 mt-1 p-2 rounded-lg bg-neutral-950 border border-white/[0.08] shadow-lg z-30 w-36">
          <div className="grid grid-cols-5 gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => {
                  if (c.value === "#e5e7eb") editor?.chain().focus().unsetColor().run();
                  else editor?.chain().focus().setColor(c.value).run();
                  setOpen(false);
                }}
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
  );
}

function HighlightColorPicker({ editor }: Readonly<{ editor: Editor | null }>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`p-1.5 rounded-md hover:bg-white/[0.04] border border-transparent transition-all flex items-center gap-1.5 ${
          open ? "bg-white/[0.05] border-white/10" : ""
        }`}
        title="Highlight Color"
      >
        <Palette className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute left-0 mt-1 p-2 rounded-lg bg-neutral-950 border border-white/[0.08] shadow-lg z-30 w-36">
          <div className="grid grid-cols-4 gap-1.5">
            {HIGHLIGHTS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => {
                  if (c.value === "transparent") editor?.chain().focus().unsetHighlight().run();
                  else editor?.chain().focus().toggleHighlight({ color: c.value }).run();
                  setOpen(false);
                }}
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
  );
}

function FormattingTab({ editor }: Readonly<{ editor: Editor | null }>) {
  return (
    <div className="flex items-center gap-2 animate-fade-in flex-wrap">
      <FontFamilyDropdown editor={editor} />
      <FontSizeDropdown editor={editor} />
      <div className="h-5 w-px bg-white/10 mx-1" />
      <button type="button" onClick={() => editor?.chain().focus().toggleBold().run()} className={getBtnClass(Boolean(editor?.isActive("bold")))} title="Bold (Ctrl+B)"><Bold className="w-4 h-4" /></button>
      <button type="button" onClick={() => editor?.chain().focus().toggleItalic().run()} className={getBtnClass(Boolean(editor?.isActive("italic")))} title="Italic (Ctrl+I)"><Italic className="w-4 h-4" /></button>
      <button type="button" onClick={() => editor?.chain().focus().toggleUnderline().run()} className={getBtnClass(Boolean(editor?.isActive("underline")))} title="Underline (Ctrl+U)"><UnderlineIcon className="w-4 h-4" /></button>
      <button type="button" onClick={() => editor?.chain().focus().toggleStrike().run()} className={getBtnClass(Boolean(editor?.isActive("strike")))} title="Strikethrough"><Strikethrough className="w-4 h-4" /></button>
      <button type="button" onClick={() => editor?.chain().focus().toggleSubscript().run()} className={getBtnClass(Boolean(editor?.isActive("subscript")))} title="Subscript"><SubscriptIcon className="w-4 h-4" /></button>
      <button type="button" onClick={() => editor?.chain().focus().toggleSuperscript().run()} className={getBtnClass(Boolean(editor?.isActive("superscript")))} title="Superscript"><SuperscriptIcon className="w-4 h-4" /></button>
      <div className="h-5 w-px bg-white/10 mx-1.5" />
      <TextColorPicker editor={editor} />
      <HighlightColorPicker editor={editor} />
    </div>
  );
}

function LinkInsertControl({
  editor,
  linkOpenTrigger,
}: Readonly<{ editor: Editor | null; linkOpenTrigger: number }>) {
  const [open, setOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  useEffect(() => {
    if (linkOpenTrigger > 0) {
      setLinkUrl(editor?.getAttributes("link").href || "");
      setOpen(true);
    }
  }, [linkOpenTrigger, editor]);

  const applyLink = () => {
    if (linkUrl) editor?.chain().focus().setLink({ href: linkUrl }).run();
    else editor?.chain().focus().unsetLink().run();
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          setLinkUrl(editor?.getAttributes("link").href || "");
          setOpen((prev) => !prev);
        }}
        className={getBtnClass(Boolean(editor?.isActive("link")))}
        title="Link (Ctrl+K)"
      >
        <LinkIcon className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute left-0 mt-1 p-3 rounded-xl bg-neutral-950 border border-white/[0.08] shadow-lg z-30 w-64 flex flex-col gap-2">
          <span className="text-[10px] font-bold uppercase text-gray-500 tracking-wider">Insert/Edit Link</span>
          <input
            type="text"
            className="w-full bg-neutral-900 border border-neutral-800 rounded px-2.5 py-1 text-xs text-gray-200 focus:outline-none focus:border-brand-500"
            placeholder="https://example.com"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyLink();
            }}
          />
          <div className="flex justify-between items-center gap-1.5 mt-1">
            {editor?.isActive("link") && (
              <button
                type="button"
                onClick={() => {
                  editor?.chain().focus().unsetLink().run();
                  setOpen(false);
                }}
                className="text-[11px] font-semibold text-red-400 hover:text-red-300 transition-colors"
              >
                Remove Link
              </button>
            )}
            <div className="flex gap-1 ml-auto">
              <button type="button" onClick={() => setOpen(false)} className="px-2 py-1 text-[11px] font-medium text-gray-400 hover:text-gray-200 transition-colors">
                Cancel
              </button>
              <button type="button" onClick={applyLink} className="px-2.5 py-1 text-[11px] font-bold bg-brand-500 hover:bg-brand-400 text-white rounded transition-colors">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ImageInsertControl({
  editor,
  isUploadingImage,
  imageUploadError,
  onUploadImage,
  onClearImageError,
}: Readonly<{
  editor: Editor | null;
  isUploadingImage: boolean;
  imageUploadError: string | null;
  onUploadImage: (e: React.ChangeEvent<HTMLInputElement>) => Promise<boolean>;
  onClearImageError: () => void;
}>) {
  const [open, setOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  useClickOutside(ref, () => setOpen(false));

  const applyImageUrl = () => {
    if (imageUrl) editor?.chain().focus().setImage({ src: imageUrl }).run();
    setOpen(false);
    setImageUrl("");
  };

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((prev) => !prev)} className={getBtnClass(false)} title="Insert Image">
        <ImageIcon className="w-4 h-4" />
      </button>
      {open && (
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
                if (e.key === "Enter" && !isUploadingImage) applyImageUrl();
              }}
            />
            <div className="flex gap-1 ml-auto mt-1">
              <button
                type="button"
                onClick={applyImageUrl}
                disabled={isUploadingImage || !imageUrl}
                className="px-2.5 py-1 text-[11px] font-bold bg-brand-500 hover:bg-brand-400 text-white rounded transition-colors disabled:opacity-50"
              >
                Insert URL
              </button>
            </div>
          </div>

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-white/[0.06]" />
            <span className="flex-shrink mx-2 text-[9px] text-gray-600 font-bold uppercase">OR</span>
            <div className="flex-grow border-t border-white/[0.06]" />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase text-gray-500 tracking-wider">Upload from computer</span>
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                void onUploadImage(e).then((ok) => {
                  if (ok) {
                    setOpen(false);
                    setImageUrl("");
                  }
                });
              }}
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
            {imageUploadError && <p className="text-[10px] text-red-400 mt-1 leading-normal">{imageUploadError}</p>}
          </div>

          <div className="flex border-t border-white/[0.04] pt-2 mt-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setImageUrl("");
                onClearImageError();
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
  );
}

function TableInsertControl({ editor }: Readonly<{ editor: Editor | null }>) {
  const [open, setOpen] = useState(false);
  const [hoveredGrid, setHoveredGrid] = useState<{ r: number; c: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((prev) => !prev)} className={getBtnClass(Boolean(editor?.isActive("table")))} title="Insert Table">
        <TableIcon className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute left-0 mt-1 p-3 rounded-xl bg-neutral-950 border border-white/[0.08] shadow-lg z-30 flex flex-col gap-2.5 select-none w-[166px]">
          <span className="text-[10px] font-bold uppercase tracking-wider font-sans text-gray-400">Insert Table Grid</span>
          <div className="grid grid-cols-6 gap-1" onMouseLeave={() => setHoveredGrid(null)}>
            {TABLE_GRID_CELLS.map((cell) => {
              const isSelected = Boolean(hoveredGrid && cell.row <= hoveredGrid.r && cell.col <= hoveredGrid.c);
              return (
                <button
                  key={cell.key}
                  type="button"
                  onMouseEnter={() => setHoveredGrid({ r: cell.row, c: cell.col })}
                  onClick={() => {
                    editor?.chain().focus().insertTable({ rows: cell.row, cols: cell.col, withHeaderRow: true }).run();
                    setOpen(false);
                    setHoveredGrid(null);
                  }}
                  className={`w-5 h-5 rounded transition-colors border ${
                    isSelected ? "bg-brand-500/80 border-brand-500" : "bg-neutral-900 border-neutral-800 hover:border-neutral-700"
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
  );
}

function InsertClearTab({
  editor,
  isUploadingImage,
  imageUploadError,
  linkOpenTrigger,
  onUploadImage,
  onClearImageError,
}: Readonly<{
  editor: Editor | null;
  isUploadingImage: boolean;
  imageUploadError: string | null;
  linkOpenTrigger: number;
  onUploadImage: (e: React.ChangeEvent<HTMLInputElement>) => Promise<boolean>;
  onClearImageError: () => void;
}>) {
  return (
    <div className="flex items-center gap-1.5 animate-fade-in">
      <LinkInsertControl editor={editor} linkOpenTrigger={linkOpenTrigger} />
      <ImageInsertControl
        editor={editor}
        isUploadingImage={isUploadingImage}
        imageUploadError={imageUploadError}
        onUploadImage={onUploadImage}
        onClearImageError={onClearImageError}
      />
      <TableInsertControl editor={editor} />
      <button type="button" onClick={() => editor?.chain().focus().setHorizontalRule().run()} className={getBtnClass(false)} title="Horizontal Rule"><Minus className="w-4 h-4" /></button>
      <button type="button" onClick={() => editor?.chain().focus().clearNodes().unsetAllMarks().run()} className={getBtnClass(false)} title="Clear Formatting"><Eraser className="w-4 h-4" /></button>
    </div>
  );
}

export interface NoteRichTextToolbarProps {
  editor: Editor | null;
  clipboardHistory: ClipboardItem[];
  onCut: () => void;
  onCopy: () => void;
  onReadClipboard: (text: string) => void;
  onUploadImage: (e: React.ChangeEvent<HTMLInputElement>) => Promise<boolean>;
  isUploadingImage: boolean;
  imageUploadError: string | null;
  onClearImageError: () => void;
}

export default function NoteRichTextToolbar({
  editor,
  clipboardHistory,
  onCut,
  onCopy,
  onReadClipboard,
  onUploadImage,
  isUploadingImage,
  imageUploadError,
  onClearImageError,
}: Readonly<NoteRichTextToolbarProps>) {
  const [activeToolbarTab, setActiveToolbarTab] = useState<string>("Formatting");
  const [linkOpenTrigger, setLinkOpenTrigger] = useState(0);
  const wordCount = editor?.storage.characterCount.words() || 0;
  const charCount = editor?.storage.characterCount.characters() || 0;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setActiveToolbarTab("Insert & Clear");
        setLinkOpenTrigger((prev) => prev + 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="no-print sticky top-0 z-20 bg-neutral-900 border-b border-white/[0.06] p-2 flex flex-col gap-1.5 select-none shrink-0">
      <div
        className="flex items-center gap-2 overflow-x-auto pb-1.5 mb-1 border-b border-white/[0.04] scrollbar-none"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {TOOLBAR_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveToolbarTab(tab)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
              activeToolbarTab === tab
                ? "bg-brand-500/15 text-brand-300 border border-brand-500/30"
                : "text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.02] border border-transparent"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="min-h-[40px] flex items-center px-1">
        {activeToolbarTab === "History & Clipboard" && (
          <HistoryClipboardTab
            editor={editor}
            clipboardHistory={clipboardHistory}
            onCut={onCut}
            onCopy={onCopy}
            onReadClipboard={onReadClipboard}
          />
        )}
        {activeToolbarTab === "Formatting" && <FormattingTab editor={editor} />}
        {activeToolbarTab === "Paragraph & Align" && (
          <div className="flex items-center gap-1.5 animate-fade-in">
            <button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} className={getBtnClass(Boolean(editor?.isActive("heading", { level: 1 })))} title="Heading 1">H1</button>
            <button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} className={getBtnClass(Boolean(editor?.isActive("heading", { level: 2 })))} title="Heading 2">H2</button>
            <button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} className={getBtnClass(Boolean(editor?.isActive("heading", { level: 3 })))} title="Heading 3">H3</button>
            <button type="button" onClick={() => editor?.chain().focus().setParagraph().run()} className={getBtnClass(Boolean(editor?.isActive("paragraph")))} title="Normal text">P</button>
            <div className="h-5 w-px bg-white/10 mx-1.5" />
            <button type="button" onClick={() => editor?.chain().focus().setTextAlign("left").run()} className={getBtnClass(Boolean(editor?.isActive({ textAlign: "left" })))} title="Align Left"><AlignLeft className="w-4 h-4" /></button>
            <button type="button" onClick={() => editor?.chain().focus().setTextAlign("center").run()} className={getBtnClass(Boolean(editor?.isActive({ textAlign: "center" })))} title="Align Center"><AlignCenter className="w-4 h-4" /></button>
            <button type="button" onClick={() => editor?.chain().focus().setTextAlign("right").run()} className={getBtnClass(Boolean(editor?.isActive({ textAlign: "right" })))} title="Align Right"><AlignRight className="w-4 h-4" /></button>
            <button type="button" onClick={() => editor?.chain().focus().setTextAlign("justify").run()} className={getBtnClass(Boolean(editor?.isActive({ textAlign: "justify" })))} title="Justify"><AlignJustify className="w-4 h-4" /></button>
          </div>
        )}
        {activeToolbarTab === "Lists & Indent" && (
          <div className="flex items-center gap-1.5 animate-fade-in">
            <button type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()} className={getBtnClass(Boolean(editor?.isActive("bulletList")))} title="Bullet List"><List className="w-4 h-4" /></button>
            <button type="button" onClick={() => editor?.chain().focus().toggleOrderedList().run()} className={getBtnClass(Boolean(editor?.isActive("orderedList")))} title="Numbered List"><ListOrdered className="w-4 h-4" /></button>
            <button type="button" onClick={() => editor?.chain().focus().toggleBlockquote().run()} className={getBtnClass(Boolean(editor?.isActive("blockquote")))} title="Blockquote"><Quote className="w-4 h-4" /></button>
            <button type="button" onClick={() => editor?.chain().focus().toggleCodeBlock().run()} className={getBtnClass(Boolean(editor?.isActive("codeBlock")))} title="Code Block"><Code className="w-4 h-4" /></button>
            <div className="h-5 w-px bg-white/10 mx-1.5" />
            <button type="button" onClick={() => editor?.chain().focus().liftListItem("listItem").run()} className={getBtnClass(false)} title="Decrease Indent (Shift+Tab)"><Outdent className="w-4 h-4" /></button>
            <button type="button" onClick={() => editor?.chain().focus().sinkListItem("listItem").run()} className={getBtnClass(false)} title="Increase Indent (Tab)"><Indent className="w-4 h-4" /></button>
          </div>
        )}
        {activeToolbarTab === "Insert & Clear" && (
          <InsertClearTab
            editor={editor}
            isUploadingImage={isUploadingImage}
            imageUploadError={imageUploadError}
            linkOpenTrigger={linkOpenTrigger}
            onUploadImage={onUploadImage}
            onClearImageError={onClearImageError}
          />
        )}
        {activeToolbarTab === "Print & Utilities" && (
          <div className="flex flex-wrap items-center gap-2.5 animate-fade-in w-full">
            <span className="text-xs text-gray-400 bg-neutral-950 border border-white/[0.08] px-3 py-1.5 rounded-lg font-mono select-none">
              Words: {wordCount}
            </span>
            <span className="text-xs text-gray-400 bg-neutral-950 border border-white/[0.08] px-3 py-1.5 rounded-lg font-mono select-none">
              Characters: {charCount}
            </span>
            <button
              type="button"
              onClick={() => window.print()}
              className="ml-auto btn-secondary py-1.5 px-3.5 text-xs flex items-center gap-1.5 border-neutral-800 hover:border-neutral-700 font-medium"
              title="Print Document"
            >
              <Printer className="w-4 h-4" /> Print
            </button>
          </div>
        )}
      </div>

      <TableSubToolbar editor={editor} />
    </div>
  );
}
