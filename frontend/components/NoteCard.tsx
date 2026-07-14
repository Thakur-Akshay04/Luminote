import type { Note } from "@/types";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { FileText, Mic, Palette, ListTodo, ChevronRight } from "lucide-react";
import clsx from "clsx";

interface NoteCardProps {
  note: Note;
  className?: string;
}

const typeConfig: {
  [key: string]: {
    icon: any;
    colorClass: string;
    label: string;
  };
} = {
  text: {
    icon: FileText,
    colorClass: "bg-blue-500/10 border-blue-500/25 text-blue-400",
    label: "Text",
  },
  audio: {
    icon: Mic,
    colorClass: "bg-rose-500/10 border-rose-500/25 text-rose-400",
    label: "Voice",
  },
  drawing: {
    icon: Palette,
    colorClass: "bg-violet-500/10 border-violet-500/25 text-violet-400",
    label: "Drawing",
  },
  checklist: {
    icon: ListTodo,
    colorClass: "bg-emerald-500/10 border-emerald-500/25 text-emerald-400",
    label: "Checklist",
  },
};

export default function NoteCard({ note, className }: NoteCardProps) {
  const getPreview = () => {
    if (note.summary) return note.summary;
    if (note.note_type === "checklist" && note.content) {
      try {
        const data = JSON.parse(note.content);
        if (data && typeof data === "object" && "description" in data) {
          return data.description.slice(0, 140);
        }
      } catch {
        // Fallback if content is not JSON
      }
    }
    return note.content.slice(0, 140);
  };
  const preview = getPreview();
  const timeAgo = formatDistanceToNow(new Date(note.updated_at), { addSuffix: true });
  const config = typeConfig[note.note_type] || typeConfig.text;
  const TypeIcon = config.icon;

  return (
    <Link href={`/notes/${note.id}`}>
      <div
        className={clsx(
          "glass-hover group relative flex flex-col gap-3 p-5 cursor-pointer",
          "animate-fade-in",
          className
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className={clsx(
              "shrink-0 w-8 h-8 rounded-lg border flex items-center justify-center transition-colors duration-150",
              config.colorClass
            )}>
              <TypeIcon className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-gray-100 truncate text-sm group-hover:text-white transition-colors">
                {note.title || "Untitled note"}
              </h3>
              <span className="text-[10px] uppercase font-bold tracking-wider opacity-60">
                {config.label}
              </span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-white shrink-0 transition-colors self-center" />
        </div>

        {/* Preview */}
        <p className="text-gray-400 text-sm leading-relaxed line-clamp-2">{preview}</p>

        {/* Tags + Time */}
        <div className="flex items-center justify-between gap-2 mt-auto">
          <div className="flex flex-wrap gap-1">
            {(note.tags ?? []).slice(0, 3).map((tag) => (
              <span key={tag} className="tag">{tag}</span>
            ))}
            {(note.tags ?? []).length > 3 && (
              <span className="tag">+{(note.tags ?? []).length - 3}</span>
            )}
            {!note.tags?.length && !note.summary && (
              <span className="text-xs text-gray-600 italic">Analyzing…</span>
            )}
          </div>
          <span className="text-xs text-gray-600 shrink-0">{timeAgo}</span>
        </div>

        {/* Hover glow line */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-neutral-700 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </Link>
  );
}
