import type { Note } from "@/types";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { FileText, Mic, ListTodo, Trash2, Clock, Pin, Star } from "lucide-react";
import clsx from "clsx";

interface NoteCardProps {
  note: Note;
  className?: string;
  onDelete?: (e: React.MouseEvent) => void;
}

const typeConfig: {
  [key: string]: {
    icon: any;
    label: string;
    glowClass: string;
    borderClass: string;
    iconClass: string;
    labelClass: string;
    accentLine: string;
    subtitle: string;
  };
} = {
  text: {
    icon: FileText,
    label: "Text Note",
    subtitle: "Document with key details",
    glowClass: "bg-[#1faab7]/10 group-hover:bg-[#1faab7]/15",
    borderClass: "hover:border-[#1faab7]/35 hover:shadow-[#0e6a81]/20",
    iconClass: "bg-[#1faab7]/15 border-[#1faab7]/25 text-[#6ed6de]",
    labelClass: "text-[#6ed6de] bg-[#1faab7]/15 border-[#1faab7]/20",
    accentLine: "bg-[#1faab7]/30",
  },
  audio: {
    icon: Mic,
    label: "Voice Note",
    subtitle: "Recording & transcript",
    glowClass: "bg-[#f58c24]/10 group-hover:bg-[#f58c24]/15",
    borderClass: "hover:border-[#f58c24]/35 hover:shadow-[#f58c24]/10",
    iconClass: "bg-[#f58c24]/15 border-[#f58c24]/25 text-[#f9a748]",
    labelClass: "text-[#f9a748] bg-[#f58c24]/15 border-[#f58c24]/20",
    accentLine: "bg-[#f58c24]/30",
  },
  checklist: {
    icon: ListTodo,
    label: "Checklist",
    subtitle: "AI structured planner",
    glowClass: "bg-[#e3af35]/10 group-hover:bg-[#e3af35]/15",
    borderClass: "hover:border-[#e3af35]/35 hover:shadow-[#e3af35]/10",
    iconClass: "bg-[#e3af35]/15 border-[#e3af35]/25 text-[#e3af35]",
    labelClass: "text-[#e3af35] bg-[#e3af35]/15 border-[#e3af35]/20",
    accentLine: "bg-[#e3af35]/30",
  },
};

const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function extractTextFromTiptapJson(node: any): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (node.text) return node.text;
  if (Array.isArray(node.content)) {
    return node.content.map(extractTextFromTiptapJson).join(" ");
  }
  if (node.content && typeof node.content === "object") {
    return extractTextFromTiptapJson(node.content);
  }
  return "";
}

function extractCleanNoteText(note: Note): string {
  if (!note.content) return "";
  const cleanContent = note.content.trim();
  if (!cleanContent.startsWith("{")) return cleanContent;

  try {
    const parsed = JSON.parse(cleanContent);
    if (parsed && typeof parsed === "object") {
      if (parsed.type === "doc") {
        return extractTextFromTiptapJson(parsed).trim();
      }
      if ("description" in parsed) {
        return (parsed.description || "").trim();
      }
    }
  } catch {
    return cleanContent;
  }
  return cleanContent;
}

export default function NoteCard({ note, className, onDelete }: Readonly<NoteCardProps>) {
  // If it is an audio note but has no media file, treat it as a text note for visual layout purposes
  const isAudioWithNoMedia = note.note_type === "audio" && !note.media_url;
  const effectiveType = isAudioWithNoMedia ? "text" : note.note_type;

  const config = typeConfig[effectiveType] || typeConfig.text;
  const TypeIcon = config.icon;
  const timeAgo = formatDistanceToNow(new Date(note.updated_at), { addSuffix: true });

  const getPreview = () => {
    if (note.summary) return note.summary;
    const rawText = extractCleanNoteText(note);
    const cleaned = rawText
      .replace(/^(Start writing here[….]*|Start writing)\s*/i, "")
      .trim();

    if (note.note_type === "audio") {
      return cleaned ? cleaned.slice(0, 120) : "Start writing here...";
    }

    if (!cleaned) {
      return "Start writing here...";
    }
    return cleaned.slice(0, 120);
  };
  const preview = getPreview();

  const getWordCount = () => {
    const rawText = extractCleanNoteText(note);
    const cleaned = rawText
      .replace(/^(Start writing here[….]*|Start writing)\s*/i, "")
      .trim();
    return cleaned.split(/\s+/).filter(Boolean).length;
  };
  const wordCount = getWordCount();

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onDelete) {
      onDelete(e);
    }
  };

  // Helper to render type-specific interactive previews
  const renderCardContent = () => {
    switch (effectiveType) {
      case "checklist": {
        const items = note.checklist_items || [];
        const totalItems = items.length;
        const completedItems = items.filter((i) => i.checked).length;
        const progressPct = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

        return (
          <div className="space-y-3 z-10">
            {totalItems > 0 && (
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[10px] font-semibold text-neutral-400">
                  <span className="flex items-center gap-1">Task Progress</span>
                  <span className="text-[#e3af35] font-bold">
                    {completedItems}/{totalItems} ({progressPct}%)
                  </span>
                </div>
                <div className="h-1 w-full bg-neutral-800/80 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#e3af35] rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            )}

            {items.length > 0 ? (
              <div className="flex flex-col gap-1.5 bg-[#e3af35]/[0.03] border border-[#e3af35]/10 rounded-lg p-2.5">
                {items.slice(0, 2).map((item) => (
                  <div key={item.id} className="flex items-center gap-2 text-xs text-neutral-300">
                    <div className={clsx(
                      "w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors shrink-0",
                      item.checked
                        ? "bg-[#e3af35]/20 border-[#e3af35]/40 text-[#e3af35]"
                        : "border-neutral-700 bg-neutral-900"
                    )}>
                      {item.checked && (
                        <svg aria-hidden="true" className="w-2.5 h-2.5 stroke-[3]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span className={clsx("truncate flex-1 font-medium", item.checked && "line-through opacity-45")}>
                      {item.text}
                    </span>
                  </div>
                ))}
                {items.length > 2 && (
                  <div className="text-[9px] text-neutral-500 font-semibold pl-5">
                    + {items.length - 2} more task{items.length - 2 !== 1 ? "s" : ""}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-neutral-400 leading-relaxed line-clamp-2">{preview || "No tasks listed."}</p>
            )}
          </div>
        );
      }

      case "audio": {
        return (
          <div className="space-y-3.5 z-10">
            {/* Audio Waveform Mock Visualizer */}
            <div className="flex items-center gap-3 bg-[#f58c24]/[0.04] border border-[#f58c24]/10 rounded-lg px-3 py-2">
              <div className="flex items-center justify-center w-7 h-7 rounded-full bg-[#f58c24]/15 border border-[#f58c24]/25 text-[#f9a748] shrink-0">
                <Mic className="w-3.5 h-3.5 animate-pulse" />
              </div>
              <div className="flex items-end gap-[3px] flex-1 h-5 justify-center">
                <div className="w-[3px] bg-[#f58c24]/40 rounded-full h-2.5 animate-pulse-slow" style={{ animationDelay: "0.1s" }} />
                <div className="w-[3px] bg-[#f58c24]/60 rounded-full h-4 animate-pulse" style={{ animationDelay: "0.3s" }} />
                <div className="w-[3px] bg-[#f58c24]/80 rounded-full h-2 animate-pulse-slow" style={{ animationDelay: "0.5s" }} />
                <div className="w-[3px] bg-[#f58c24]/50 rounded-full h-5 animate-pulse" style={{ animationDelay: "0.2s" }} />
                <div className="w-[3px] bg-[#f58c24]/70 rounded-full h-3.5 animate-pulse-slow" style={{ animationDelay: "0.7s" }} />
                <div className="w-[3px] bg-[#f58c24] rounded-full h-1.5 animate-pulse" style={{ animationDelay: "0.4s" }} />
                <div className="w-[3px] bg-[#f58c24]/60 rounded-full h-3 animate-pulse-slow" style={{ animationDelay: "0.9s" }} />
                <div className="w-[3px] bg-[#f58c24]/40 rounded-full h-2 animate-pulse" style={{ animationDelay: "0.6s" }} />
              </div>
            </div>
            {preview ? (
              <p className="text-xs text-neutral-400 leading-relaxed line-clamp-2 italic">
                "{preview}"
              </p>
            ) : (
              <p className="text-xs text-neutral-500 italic">No transcript recorded.</p>
            )}
          </div>
        );
      }

      default: {
        return (
          <p className="text-xs text-neutral-400 leading-relaxed line-clamp-3 z-10 min-h-[48px]">
            {preview || "Empty note content."}
          </p>
        );
      }
    }
  };

  return (
    <Link href={`/notes/${note.id}`} className="block">
      <div
        className={clsx(
          "bg-surface-900/45 backdrop-blur-lg border border-white/[0.05] rounded-xl p-5 flex flex-col gap-4.5 cursor-pointer relative overflow-hidden group select-none",
          "shadow-sm transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          "hover:-translate-y-1 hover:scale-[1.01] hover:bg-surface-900/85 hover:shadow-lg hover:shadow-black/45",
          config.borderClass,
          className
        )}
      >
        {/* Glow Mesh Element */}
        <div
          className={clsx(
            "absolute -top-16 -right-16 w-36 h-36 rounded-full blur-3xl opacity-10 group-hover:opacity-20 transition-all duration-500 pointer-events-none",
            config.glowClass
          )}
        />

        {/* Card Header */}
        <div className="flex items-start justify-between gap-3 relative z-10">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div
              className={clsx(
                "shrink-0 w-8.5 h-8.5 rounded-lg border flex items-center justify-center transition-all duration-300 group-hover:scale-105",
                config.iconClass
              )}
            >
              <TypeIcon className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                {note.is_pinned && (
                  <Pin className="w-3 h-3 text-amber-400 fill-amber-400/30 shrink-0 transform -rotate-45" />
                )}
                {note.is_favorite && (
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400 shrink-0" />
                )}
                <h3 className="text-sm font-bold text-white leading-tight truncate group-hover:text-white transition-colors pr-1">
                  {note.title || "Untitled Note"}
                </h3>
              </div>
              <div className="flex items-center gap-1.5 mt-1 min-w-0">
                <span
                  className={clsx(
                    "text-[8px] uppercase font-extrabold tracking-wider px-1.5 py-0.5 rounded border border-white/[0.03] shrink-0",
                    config.labelClass
                  )}
                >
                  {config.label}
                </span>
                <span className="text-[10px] text-neutral-500 truncate font-medium">
                  {config.subtitle}
                </span>
              </div>
            </div>
          </div>

          {/* Delete Button (renders if onDelete is passed) */}
          {onDelete && (
            <button
              type="button"
              onClick={handleDelete}
              className="text-neutral-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-surface-700/60 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all duration-200"
              title="Delete Note"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Dynamic Card Content Preview */}
        {renderCardContent()}

        {/* Card Footer */}
        <div className="flex items-center justify-between border-t border-white/[0.04] pt-3.5 mt-0.5 relative z-10 text-[10px] text-neutral-500 font-medium">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-neutral-600" />
            <span>{timeAgo}</span>
            {(effectiveType === "text" || effectiveType === "audio") && (
              <>
                <span>•</span>
                <span>{wordCount} word{wordCount !== 1 ? "s" : ""}</span>
              </>
            )}
          </div>

          {/* Tags */}
          {note.tags && note.tags.length > 0 ? (
            <div className="flex gap-1 shrink-0">
              {note.tags.slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 bg-surface-700/40 border border-white/[0.04] text-neutral-300 rounded text-[9px] font-semibold"
                >
                  {tag}
                </span>
              ))}
              {note.tags.length > 2 && (
                <span className="px-1.5 py-0.5 bg-surface-700/30 border border-white/[0.03] text-neutral-400 rounded text-[9px] font-bold">
                  +{note.tags.length - 2}
                </span>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
