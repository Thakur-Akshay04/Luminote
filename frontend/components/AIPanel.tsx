"use client";

import { useState } from "react";
import type { Note } from "@/types";
import { notesApi } from "@/lib/api";
import { Sparkles, Tag, MessageSquare, SendHorizonal, Loader2, X } from "lucide-react";

interface AIPanelProps {
  note: Note;
}

export default function AIPanel({ note }: AIPanelProps) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    try {
      const res = await notesApi.ask(note.id, question.trim());
      setAnswer(res.data.answer);
    } catch {
      setError("Failed to get an answer. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const hasSummary = note.summary && note.summary.length > 0;
  const hasTags = note.tags && note.tags.length > 0;
  const isPending = !hasSummary && !hasTags;

  return (
    <div className="glass flex flex-col gap-5 p-5 h-full overflow-y-auto">
      {/* AI Header */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-500 to-accent-violet flex items-center justify-center">
          <Sparkles className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="font-semibold text-sm text-white">AI Insights</span>
        {isPending && (
          <span className="ml-auto flex items-center gap-1 text-xs text-gray-500">
            <Loader2 className="w-3 h-3 animate-spin" /> Analyzing…
          </span>
        )}
      </div>

      {/* Summary */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Sparkles className="w-3.5 h-3.5 text-brand-400" />
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Summary</span>
        </div>
        {hasSummary ? (
          <p className="text-sm text-gray-300 leading-relaxed">{note.summary}</p>
        ) : (
          <div className="space-y-2">
            <div className="skeleton h-3 w-full" />
            <div className="skeleton h-3 w-4/5" />
            <div className="skeleton h-3 w-3/5" />
          </div>
        )}
      </div>

      <div className="h-px bg-white/[0.06]" />

      {/* Tags */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Tag className="w-3.5 h-3.5 text-accent-cyan" />
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Tags</span>
        </div>
        {hasTags ? (
          <div className="flex flex-wrap gap-1.5">
            {note.tags!.map((tag) => (
              <span key={tag} className="tag">{tag}</span>
            ))}
          </div>
        ) : (
          <div className="flex gap-2">
            <div className="skeleton h-5 w-16 rounded-full" />
            <div className="skeleton h-5 w-20 rounded-full" />
            <div className="skeleton h-5 w-14 rounded-full" />
          </div>
        )}
      </div>

      <div className="h-px bg-white/[0.06]" />

      {/* Q&A */}
      <div className="flex flex-col gap-3 flex-1">
        <div className="flex items-center gap-1.5">
          <MessageSquare className="w-3.5 h-3.5 text-accent-pink" />
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Ask About This Note</span>
        </div>

        {answer && (
          <div className="relative glass p-3 rounded-xl text-sm text-gray-200 leading-relaxed animate-fade-in">
            <button
              onClick={() => setAnswer(null)}
              className="absolute top-2 right-2 text-gray-600 hover:text-gray-400"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            {answer}
          </div>
        )}

        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}

        <form onSubmit={handleAsk} className="flex gap-2 mt-auto">
          <input
            type="text"
            className="input flex-1 text-xs py-2"
            placeholder="Ask anything about this note…"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={loading}
            id="ai-question-input"
          />
          <button
            type="submit"
            className="btn-primary px-3 py-2 shrink-0"
            disabled={loading || !question.trim()}
            id="ai-ask-btn"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <SendHorizonal className="w-4 h-4" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
