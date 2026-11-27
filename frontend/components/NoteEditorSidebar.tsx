"use client";

import type { Note } from "@/types";
import {
  FileText,
  ListTodo,
  Mic,
  MoreVertical,
  Pin,
  PinOff,
  Plus,
  Star,
  Trash2,
} from "lucide-react";

function getNoteTypeLabel(noteType: string): string {
  if (noteType === "text") return "Text Notes";
  if (noteType === "audio") return "Voice Notes";
  if (noteType === "checklist") return "Checklists";
  return "Notes";
}

function SidebarNoteTypeIcon({ noteType, className }: Readonly<{ noteType: string; className?: string }>) {
  if (noteType === "text") return <FileText className={className || "w-3.5 h-3.5 text-[#6ed6de] shrink-0"} />;
  if (noteType === "audio") return <Mic className={className || "w-3.5 h-3.5 text-[#f58c24] shrink-0"} />;
  if (noteType === "checklist") return <ListTodo className={className || "w-3.5 h-3.5 text-[#e3af35] shrink-0"} />;
  return null;
}

function getSidebarItemIconClass(itemType: string, isActive: boolean): string {
  if (!isActive) return "w-3.5 h-3.5 shrink-0 text-neutral-500 group-hover:text-neutral-300";
  if (itemType === "text") return "w-3.5 h-3.5 shrink-0 text-[#6ed6de]";
  if (itemType === "audio") return "w-3.5 h-3.5 shrink-0 text-[#f58c24]";
  return "w-3.5 h-3.5 shrink-0 text-[#e3af35]";
}

function formatSidebarDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function SidebarNoteMenu({
  item,
  onTogglePin,
  onToggleFavorite,
  onDelete,
}: Readonly<{
  item: Note;
  onTogglePin: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
}>) {
  return (
    <div
      data-note-menu
      className="absolute right-2 top-9 z-50 w-48 py-1.5 rounded-xl bg-popover border border-border shadow-2xl backdrop-blur-2xl flex flex-col gap-0.5 animate-fade-in select-none"
    >
      <button
        type="button"
        onClick={onTogglePin}
        className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-neutral-300 hover:text-white hover:bg-white/[0.06] transition-colors rounded-lg text-left"
      >
        {item.is_pinned ? (
          <>
            <PinOff className="w-3.5 h-3.5 text-amber-400" />
            <span>Unpin note</span>
          </>
        ) : (
          <>
            <Pin className="w-3.5 h-3.5 text-neutral-400" />
            <span>Pin to top</span>
          </>
        )}
      </button>

      <button
        type="button"
        onClick={onToggleFavorite}
        className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-neutral-300 hover:text-white hover:bg-white/[0.06] transition-colors rounded-lg text-left"
      >
        <Star
          className={`w-3.5 h-3.5 ${
            item.is_favorite ? "fill-amber-400 text-amber-400" : "text-neutral-400"
          }`}
        />
        <span>{item.is_favorite ? "Remove from Favorites" : "Add to Favorites"}</span>
      </button>

      <div className="h-px bg-white/[0.06] my-1" />

      <button
        type="button"
        onClick={onDelete}
        className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors rounded-lg text-left"
      >
        <Trash2 className="w-3.5 h-3.5 text-red-400" />
        <span>Delete note</span>
      </button>
    </div>
  );
}

interface SidebarNoteRowProps {
  item: Note;
  isActive: boolean;
  displayTitle: string;
  isMenuOpen: boolean;
  onSelect: (id: string) => void;
  onToggleMenu: (id: string | null) => void;
  onTogglePin: (note: Note) => void;
  onToggleFavorite: (note: Note) => void;
  onDelete: (id: string) => void;
}

function SidebarNoteRow({
  item,
  isActive,
  displayTitle,
  isMenuOpen,
  onSelect,
  onToggleMenu,
  onTogglePin,
  onToggleFavorite,
  onDelete,
}: Readonly<SidebarNoteRowProps>) {
  const displayDate = formatSidebarDate(item.updated_at);
  const buttonStyle = isActive
    ? "bg-brand-500/10 border-brand-500/30 text-white font-semibold shadow-[0_2px_12px_rgba(245,140,36,0.12)]"
    : "bg-transparent border-transparent text-neutral-400 hover:text-white hover:bg-white/[0.03] hover:border-white/[0.05]";
  const dateStyle = isActive ? "text-brand-300/80" : "text-neutral-500 group-hover:text-neutral-400";
  const menuBtnStyle = isMenuOpen
    ? "bg-white/10 text-white"
    : "opacity-0 group-hover:opacity-100 hover:bg-white/[0.08] text-neutral-400 hover:text-white";

  return (
    <div className="relative group w-full flex items-center">
      <button
        type="button"
        onClick={() => onSelect(item.id)}
        className={`w-full flex items-center justify-between gap-2 pl-3 pr-9 py-2.5 rounded-xl text-xs transition-all duration-200 border text-left relative cursor-pointer ${buttonStyle}`}
      >
        {isActive && <span className="absolute left-0 top-2 bottom-2 w-1 bg-brand-500 rounded-r-full" />}

        <div className="flex items-center gap-2 min-w-0 flex-1">
          <SidebarNoteTypeIcon
            noteType={item.note_type}
            className={getSidebarItemIconClass(item.note_type, isActive)}
          />
          {item.is_pinned && (
            <Pin className="w-3 h-3 text-amber-400 fill-amber-400/30 shrink-0 transform -rotate-45" />
          )}
          <span className="truncate text-xs font-medium tracking-tight leading-none">{displayTitle}</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {item.is_favorite && <Star className="w-3 h-3 fill-amber-400 text-amber-400 shrink-0" />}
          {displayDate && <span className={`text-[10px] font-medium select-none ${dateStyle}`}>{displayDate}</span>}
        </div>
      </button>

      <button
        type="button"
        data-note-menu
        onClick={(e) => {
          e.stopPropagation();
          onToggleMenu(isMenuOpen ? null : item.id);
        }}
        title="Note options"
        className={`absolute right-2 w-6 h-6 rounded-lg flex items-center justify-center transition-all ${menuBtnStyle}`}
      >
        <MoreVertical className="w-3.5 h-3.5" />
      </button>

      {isMenuOpen && (
        <SidebarNoteMenu
          item={item}
          onTogglePin={() => onTogglePin(item)}
          onToggleFavorite={() => onToggleFavorite(item)}
          onDelete={() => {
            onToggleMenu(null);
            onDelete(item.id);
          }}
        />
      )}
    </div>
  );
}

export interface NoteEditorSidebarProps {
  noteType: string;
  noteId: string;
  currentTitle: string;
  sidebarNotes: Note[];
  sidebarLoading: boolean;
  openMenuNoteId: string | null;
  onToggleMenu: (id: string | null) => void;
  onCreateNew: () => void;
  onSelectNote: (id: string) => void;
  onTogglePin: (note: Note) => void;
  onToggleFavorite: (note: Note) => void;
  onDeleteRequest: (id: string) => void;
}

export default function NoteEditorSidebar({
  noteType,
  noteId,
  currentTitle,
  sidebarNotes,
  sidebarLoading,
  openMenuNoteId,
  onToggleMenu,
  onCreateNew,
  onSelectNote,
  onTogglePin,
  onToggleFavorite,
  onDeleteRequest,
}: Readonly<NoteEditorSidebarProps>) {
  const filteredNotes = sidebarNotes.filter((n) => n.note_type === noteType || n.id === noteId);
  const emptyLabel = noteType === "checklist" ? "checklists" : `${noteType} notes`;
  const createLabel = noteType === "checklist" ? "checklist" : `${noteType} note`;

  let listContent;
  if (sidebarLoading && filteredNotes.length === 0) {
    listContent = (
      <div className="flex flex-col gap-2 p-1">
        {["skel-1", "skel-2", "skel-3"].map((key) => (
          <div key={key} className="h-11 w-full bg-white/[0.02] border border-white/[0.04] rounded-xl animate-pulse" />
        ))}
      </div>
    );
  } else if (filteredNotes.length === 0) {
    listContent = (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <p className="text-xs text-neutral-500 font-medium mb-1">No {emptyLabel} yet</p>
        <p className="text-[10px] text-neutral-600">Click the + button above to create one.</p>
      </div>
    );
  } else {
    listContent = filteredNotes.map((item) => {
      const isActive = item.id === noteId;
      const fallbackTitle = item.title || "Untitled Note";
      const displayTitle = isActive ? currentTitle || "Untitled Note" : fallbackTitle;
      return (
        <SidebarNoteRow
          key={item.id}
          item={item}
          isActive={isActive}
          displayTitle={displayTitle}
          isMenuOpen={openMenuNoteId === item.id}
          onSelect={onSelectNote}
          onToggleMenu={onToggleMenu}
          onTogglePin={onTogglePin}
          onToggleFavorite={onToggleFavorite}
          onDelete={onDeleteRequest}
        />
      );
    });
  }

  return (
    <aside className="no-print w-64 border-r border-sidebar-border bg-sidebar/70 backdrop-blur-xl flex flex-col shrink-0 select-none">
      <div className="px-4 py-3.5 border-b border-white/[0.06] flex items-center justify-between bg-white/[0.01]">
        <div className="flex flex-col min-w-0 pr-2">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-neutral-500">Workspace</span>
            <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded-full bg-white/[0.06] text-neutral-400">
              {filteredNotes.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <SidebarNoteTypeIcon noteType={noteType} />
            <span className="text-sm font-bold text-white tracking-tight truncate">{getNoteTypeLabel(noteType)}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onCreateNew}
          title={`New ${createLabel}`}
          className="w-7 h-7 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-brand-500/20 hover:border-brand-500/30 hover:text-brand-300 active:scale-95 text-neutral-400 flex items-center justify-center transition-all shrink-0"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-1.5 scrollbar-thin">{listContent}</div>
    </aside>
  );
}
