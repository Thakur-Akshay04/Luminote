"use client";

import { useState, useRef, useEffect } from "react";
import type { Note } from "@/types";
import { notesApi } from "@/lib/api";
import { Sparkles, MessageSquare, SendHorizonal, Loader2, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface AIPanelProps {
  note: Note;
  onUpdateNote?: (note: Note) => void;
}

export default function AIPanel({ note, onUpdateNote }: AIPanelProps) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const chatHistory = note.chat_history || [];

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory.length, loading]);

  // Summarize state
  const [format, setFormat] = useState<"paragraph" | "bullets" | "actions">(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("luminote_ai_format");
      if (stored === "paragraph" || stored === "bullets" || stored === "actions") {
        return stored;
      }
    }
    return "paragraph";
  });
  const [summarizing, setSummarizing] = useState(false);
  const [summarizeError, setSummarizeError] = useState<string | null>(null);

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = question.trim();
    if (!query) return;

    setQuestion("");
    setLoading(true);
    setError(null);

    const tempUserMsg = { role: "user" as const, content: query };
    const initialHistory = note.chat_history || [];
    const optimisticHistory = [...initialHistory, tempUserMsg];

    if (onUpdateNote) {
      onUpdateNote({
        ...note,
        chat_history: optimisticHistory,
      });
    }

    try {
      const res = await notesApi.ask(note.id, query);
      if (onUpdateNote) {
        onUpdateNote({
          ...note,
          chat_history: res.data.chat_history || optimisticHistory,
        });
      }
    } catch {
      setError("Failed to get an answer. Try again.");
      if (onUpdateNote) {
        onUpdateNote({
          ...note,
          chat_history: initialHistory,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSummarize = async () => {
    setSummarizing(true);
    setSummarizeError(null);
    try {
      const extractAlerts = typeof window !== "undefined"
        ? localStorage.getItem("luminote_ai_extract_alerts") !== "false"
        : true;
      const res = await notesApi.summarize(note.id, format, extractAlerts);
      if (onUpdateNote) {
        onUpdateNote(res.data.note);
      }
    } catch {
      setSummarizeError("Failed to generate summary.");
    } finally {
      setSummarizing(false);
    }
  };

  const hasSummary = note.summary && note.summary.length > 0;
  const hasTags = note.tags && note.tags.length > 0;
  const isPending = !hasSummary && !hasTags;

  return (
    <div className="glass flex flex-col gap-5 p-5 h-full overflow-hidden">
      {/* AI Header */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center text-black shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-black" />
        </div>
        <span className="font-semibold text-sm text-white">AI Insights</span>
        {(isPending || summarizing) && (
          <span className="ml-auto flex items-center gap-1 text-xs text-gray-500 animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin" /> Processing…
          </span>
        )}
      </div>

      {/* Summary Section */}
      <div className="flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-neutral-400" />
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Summary</span>
          </div>

          {/* Format selector */}
          <div className="flex bg-neutral-900 rounded-lg p-0.5 border border-neutral-800">
            {(["paragraph", "bullets", "actions"] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => setFormat(fmt)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-tight transition-all
                  ${format === fmt 
                    ? "bg-white text-black font-semibold" 
                    : "text-neutral-400 hover:text-neutral-200"
                  }`}
              >
                {fmt === "paragraph" ? "Text" : fmt === "bullets" ? "Points" : "Tasks"}
              </button>
            ))}
          </div>
        </div>

        {hasSummary ? (
          <div className="prose-luminote text-xs text-gray-300 leading-relaxed mb-1 max-h-24 overflow-y-auto pr-1">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {note.summary!}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="space-y-2 mb-1">
            <div className="skeleton h-3 w-full" />
            <div className="skeleton h-3 w-4/5" />
          </div>
        )}

        {summarizeError && (
          <p className="text-[11px] text-red-400">{summarizeError}</p>
        )}

        <button
          onClick={handleSummarize}
          disabled={summarizing || !note.content.trim()}
          className="btn-secondary w-full py-1.5 text-xs flex items-center justify-center gap-1"
        >
          {summarizing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Sparkles className="w-3.5 h-3.5 text-neutral-400" />
          )}
          {hasSummary ? "Regenerate Summary" : "Generate Summary"}
        </button>
      </div>
      <div className="h-px bg-white/[0.06] shrink-0" />

      {/* Chat Section */}
      <div className="flex flex-col gap-3 flex-1 min-h-0">
        <div className="flex items-center gap-1.5 shrink-0">
          <MessageSquare className="w-3.5 h-3.5 text-neutral-400" />
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Ask About This Note</span>
        </div>

        {/* Scrollable messages container */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-3 pr-1 py-1 scroll-smooth" ref={chatContainerRef}>
          {chatHistory.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center flex-1 text-center py-6 text-neutral-500 gap-2">
              <MessageSquare className="w-8 h-8 opacity-30" />
              <p className="text-xs">No questions asked yet. Start a conversation about this note!</p>
            </div>
          )}

          {chatHistory.map((msg, idx) => {
            const isUser = msg.role === "user";
            return (
              <div
                key={idx}
                className={`flex flex-col max-w-[85%] ${isUser ? "self-end items-end" : "self-start items-start"}`}
              >
                <div className={`p-3 rounded-2xl text-xs leading-relaxed ${
                  isUser
                    ? "bg-brand-500/20 border border-brand-500/30 text-brand-100 rounded-tr-none"
                    : "bg-white/[0.03] border border-white/[0.05] text-gray-200 rounded-tl-none"
                }`}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.content}
                  </ReactMarkdown>
                </div>
              </div>
            );
          })}

          {loading && (
            <div className="self-start flex flex-col items-start max-w-[85%] animate-pulse">
              <div className="p-3 bg-white/[0.03] border border-white/[0.05] text-gray-400 text-xs rounded-2xl rounded-tl-none flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin text-brand-400" />
                <span>AI is thinking…</span>
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="text-[11px] text-red-400 shrink-0">{error}</p>
        )}

        <form onSubmit={handleAsk} className="flex gap-2 mt-auto shrink-0">
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
