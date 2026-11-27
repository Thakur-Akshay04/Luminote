"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  X, 
  FileText, 
  ListTodo, 
  Mic, 
  Notebook
} from "lucide-react";

interface NoteTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function NoteTypeModal({ isOpen, onClose }: Readonly<NoteTypeModalProps>) {
  const router = useRouter();

  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const noteTypes = [
    {
      id: "text",
      label: "Text Note",
      description: "Standard document with rich details and formatting.",
      icon: FileText,
      colorClass: "text-[#6ed6de] bg-[#1faab7]/15",
      hoverClass: "hover:shadow-[0_0_20px_rgba(31,170,183,0.18)] hover:border-[#1faab7]/40",
    },
    {
      id: "checklist",
      label: "Task Checklist",
      description: "Organized task manager with AI progress tracking.",
      icon: ListTodo,
      colorClass: "text-[#f58c24] bg-[#f58c24]/15",
      hoverClass: "hover:shadow-[0_0_20px_rgba(245,140,36,0.18)] hover:border-[#f58c24]/40",
    },
    {
      id: "audio",
      label: "Voice Note",
      description: "Record audio and get automated smart transcription.",
      icon: Mic,
      colorClass: "text-[#e3af35] bg-[#e3af35]/15",
      hoverClass: "hover:shadow-[0_0_20px_rgba(227,175,53,0.18)] hover:border-[#e3af35]/40",
    },
  ];

  const handleSelect = (id: string) => {
    onClose();
    router.push(`/notes/new?type=${id}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/70 backdrop-blur-md transition-opacity duration-300 animate-fade-in cursor-default"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Content */}
      <div className="relative w-full max-w-lg bg-popover border border-border rounded-xl p-6 shadow-2xl z-10 animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-border-muted">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-500 shadow-sm shrink-0">
              <Notebook className="w-4 h-4 text-brand-500 fill-brand-500/20 animate-pulse-slow" />
            </div>
            <div>
              <h2 className="text-md font-bold text-white tracking-tight">Create New Note</h2>
              <p className="text-xs text-text-secondary mt-0.5">Select a template for your thoughts</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-secondary hover:text-white hover:bg-surface-strong transition-colors"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Options Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {noteTypes.map((type) => {
            const Icon = type.icon;
            return (
              <button
                type="button"
                key={type.id}
                onClick={() => handleSelect(type.id)}
                className={`flex flex-col items-start p-4 rounded-lg border border-border-muted bg-surface-base hover:bg-surface-strong text-left transition-all duration-300 hover:-translate-y-1 group ${type.hoverClass}`}
                id={`create-note-type-${type.id}`}
              >
                <div className={`p-2.5 rounded-lg mb-3 ${type.colorClass} transition-colors`}>
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-white mb-1 group-hover:text-brand-300 transition-colors">
                  {type.label}
                </h3>
                <p className="text-xs text-text-secondary leading-relaxed">
                  {type.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
