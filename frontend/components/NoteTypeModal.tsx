"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  X, 
  FileText, 
  ListTodo, 
  Mic, 
  Palette,
  Notebook
} from "lucide-react";

interface NoteTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function NoteTypeModal({ isOpen, onClose }: NoteTypeModalProps) {
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
      colorClass: "text-accent-cyan bg-accent-cyan/10",
      hoverClass: "hover:shadow-[0_0_20px_rgba(6,182,212,0.15)] hover:border-accent-cyan/40",
    },
    {
      id: "checklist",
      label: "Task Checklist",
      description: "Organized task manager with AI progress tracking.",
      icon: ListTodo,
      colorClass: "text-accent-violet bg-accent-violet/10",
      hoverClass: "hover:shadow-[0_0_20px_rgba(139,92,246,0.15)] hover:border-accent-violet/40",
    },
    {
      id: "audio",
      label: "Voice Note",
      description: "Record audio and get automated smart transcription.",
      icon: Mic,
      colorClass: "text-accent-pink bg-accent-pink/10",
      hoverClass: "hover:shadow-[0_0_20px_rgba(219,39,119,0.15)] hover:border-accent-pink/40",
    },
    {
      id: "drawing",
      label: "Drawing Canvas",
      description: "Sketch and visualize your ideas on a freehand canvas.",
      icon: Palette,
      colorClass: "text-accent-amber bg-accent-amber/10",
      hoverClass: "hover:shadow-[0_0_20px_rgba(245,158,11,0.15)] hover:border-accent-amber/40",
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
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            onClose();
          }
        }}
        role="button"
        tabIndex={-1}
        aria-hidden="true"
      />

      {/* Modal Content */}
      <div className="relative w-full max-w-lg bg-surface-raised border border-border-muted rounded-xl p-6 shadow-2xl z-10 animate-slide-up">
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
