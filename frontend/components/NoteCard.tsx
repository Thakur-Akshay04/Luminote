import type { Note } from "@/types";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { FileText, ChevronRight } from "lucide-react";
import clsx from "clsx";

interface NoteCardProps {
  note: Note;
  className?: string;
}

export default function NoteCard({ note, className }: NoteCardProps) {
  const preview = note.summary || note.content.slice(0, 140);
  const timeAgo = formatDistanceToNow(new Date(note.updated_at), { addSuffix: true });

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
          <div className="flex items-center gap-2 min-w-0">
            <div className="shrink-0 w-8 h-8 rounded-lg bg-brand-500/15 flex items-center justify-center">
              <FileText className="w-4 h-4 text-brand-400" />
            </div>
            <h3 className="font-semibold text-gray-100 truncate text-sm">
              {note.title || "Untitled note"}
            </h3>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-brand-400 shrink-0 transition-colors" />
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
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </Link>
  );
}
