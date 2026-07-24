"use client";

import { useState, useRef, useEffect } from "react";
import type { Note } from "@/types";
import { notesApi } from "@/lib/api";
import {
  MessageSquare,
  SendHorizonal,
  Loader2,
  Trash2,
  Copy,
  Check,
  Plus,
  Wand2,
  Languages,
  BookOpen,
  Clock,
  FileText,
  CornerDownLeft,
  ChevronDown,
  CornerUpRight,
  Maximize2,
  ShieldAlert,
  Brain,
  SpellCheck,
  Zap
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface AIPanelProps {
  note: Note;
  onUpdateNote?: (note: Note) => void;
  editor?: any; // Tiptap editor instance
  onSaveBeforeAction?: () => Promise<string>;
}

export default function AIPanel({ note, onUpdateNote, editor, onSaveBeforeAction }: Readonly<AIPanelProps>) {
  // Tabs: 'chat' | 'insights' | 'assistant'
  const [activeTab, setActiveTab] = useState<"chat" | "insights" | "assistant">("chat");

  // Selection detection
  const [selectedText, setSelectedText] = useState("");

  // Track selection state on the Tiptap editor
  useEffect(() => {
    if (!editor) return;

    const updateSelection = () => {
      const { from, to } = editor.state.selection;
      const text = editor.state.doc.textBetween(from, to, " ");
      setSelectedText(text.trim());
    };

    editor.on("selectionUpdate", updateSelection);
    updateSelection(); // Initial check

    return () => {
      editor.off("selectionUpdate", updateSelection);
    };
  }, [editor]);

  // Copy status alerts
  const [copiedStates, setCopiedStates] = useState<{ [key: string]: boolean }>({});

  const triggerCopyAlert = (id: string, text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedStates((prev) => ({ ...prev, [id]: true }));
    setTimeout(() => {
      setCopiedStates((prev) => ({ ...prev, [id]: false }));
    }, 2000);
  };

  // ── 1. CHAT TAB STATE & HANDLERS ──────────────────────────────────────────
  const [question, setQuestion] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const chatHistory = note.chat_history || [];

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory.length, chatLoading, activeTab]);

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = question.trim();
    if (!query) return;

    setQuestion("");
    setChatLoading(true);
    setChatError(null);

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
      let activeId = note.id;
      if (activeId === "new" && onSaveBeforeAction) {
        activeId = await onSaveBeforeAction();
      } else if (activeId === "new") {
        setChatError("Please write something and save the note first.");
        return;
      }

      const res = await notesApi.ask(activeId, query);
      if (onUpdateNote) {
        onUpdateNote({
          ...note,
          chat_history: res.data.chat_history || optimisticHistory,
        });
      }
    } catch {
      setChatError("Failed to get an answer. Please try again.");
      if (onUpdateNote) {
        onUpdateNote({
          ...note,
          chat_history: initialHistory,
        });
      }
    } finally {
      setChatLoading(false);
    }
  };

  const handleClearChat = () => {
    if (onUpdateNote) {
      onUpdateNote({
        ...note,
        chat_history: [],
      });
    }
  };

  // ── 2. INSIGHTS TAB STATE & HANDLERS ──────────────────────────────────────
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

  useEffect(() => {
    if (typeof window !== "undefined" && activeTab === "insights") {
      const stored = localStorage.getItem("luminote_ai_format");
      if (stored === "paragraph" || stored === "bullets" || stored === "actions") {
        setFormat(stored);
      }
    }
  }, [activeTab]);

  const handleSummarize = async () => {
    setSummarizing(true);
    setSummarizeError(null);
    try {
      let activeId = note.id;
      if (activeId === "new" && onSaveBeforeAction) {
        activeId = await onSaveBeforeAction();
      } else if (activeId === "new") {
        setSummarizeError("Please write something and save the note first.");
        return;
      }

      const activeFormat = (typeof window !== "undefined" && (localStorage.getItem("luminote_ai_format") as "paragraph" | "bullets" | "actions")) || format;
      const extractAlerts = typeof window !== "undefined"
        ? localStorage.getItem("luminote_ai_extract_alerts") !== "false"
        : true;
      const res = await notesApi.summarize(activeId, activeFormat, extractAlerts);
      if (onUpdateNote) {
        onUpdateNote(res.data.note);
      }
    } catch {
      setSummarizeError("Failed to generate summary.");
    } finally {
      setSummarizing(false);
    }
  };

  // Reading Stats
  const getWordAndCharCount = () => {
    let text = "";
    if (editor) {
      text = editor.getText();
    } else {
      text = note.content;
      if (note.content.trim().startsWith('{"') || note.content.trim().startsWith('[{')) {
        try {
          const data = JSON.parse(note.content);
          text = extractTextFromTiptapJson(data);
        } catch {}
      }
    }
    const chars = text.length;
    const words = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
    return { words, chars, readTime: Math.max(1, Math.ceil(words / 200)) };
  };

  const extractTextFromTiptapJson = (node: any): string => {
    if (!node) return "";
    if (typeof node === "string") return node;
    if (typeof node === "object") {
      if ("text" in node && typeof node.text === "string") {
        return node.text;
      }
      if ("content" in node && Array.isArray(node.content)) {
        return node.content.map(extractTextFromTiptapJson).join(" ");
      }
    }
    if (Array.isArray(node)) {
      return node.map(extractTextFromTiptapJson).join(" ");
    }
    return "";
  };

  const stats = getWordAndCharCount();
  const hasSummary = note.summary && note.summary.length > 0;

  // ── 3. WRITING ASSISTANT STATE & HANDLERS ──────────────────────────────────
  const [assistantOutput, setAssistantOutput] = useState("");
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState<string | null>(null);

  // Tone dropdown
  const [toneDropdownOpen, setToneDropdownOpen] = useState(false);
  const tones = ["Professional", "Casual", "Creative", "Academic", "Friendly"];

  // Translation dropdown
  const [translateDropdownOpen, setTranslateDropdownOpen] = useState(false);
  const languages = ["Spanish", "French", "German", "Japanese", "Chinese", "Hindi"];

  const handleAssistantAction = async (action: string, param?: string) => {
    // Get text to process: selection first, fallback to entire editor text
    const textToProcess = selectedText || editor?.getText() || note.content;
    if (!textToProcess || !textToProcess.trim()) {
      setAssistantError("No text found in the editor to process.");
      return;
    }

    setAssistantLoading(true);
    setAssistantError(null);
    setAssistantOutput("");
    setToneDropdownOpen(false);
    setTranslateDropdownOpen(false);

    try {
      let activeId = note.id;
      if (activeId === "new" && onSaveBeforeAction) {
        activeId = await onSaveBeforeAction();
      } else if (activeId === "new") {
        setAssistantError("Please write something and save the note first.");
        return;
      }

      const res = await notesApi.aiAction(activeId, action, textToProcess, param);
      const resultText = res.data.result;
      const lowerText = resultText.toLowerCase();

      // Detect safety policy refusal keywords
      if (
        lowerText.includes("sorry") &&
        (lowerText.includes("can't help") || lowerText.includes("cannot help") || lowerText.includes("can’t help"))
      ) {
        if (action === "translate") {
          setAssistantError(
            `The AI model refused to generate the translation in ${param || "the selected language"} because the note content contains sensitive terms triggering safety policy guardrails.`
          );
        } else {
          setAssistantError(
            `The AI model refused to process this writing action because the note content contains sensitive terms triggering safety policy guardrails.`
          );
        }
      } else {
        setAssistantOutput(resultText);
      }
    } catch {
      setAssistantError("Failed to process text with AI. Please check your network and try again.");
    } finally {
      setAssistantLoading(false);
    }
  };

  const handleInsertToEditor = (textToInsert: string) => {
    if (!editor) return;
    // Focus the editor first to ensure insertion location is correct
    editor.chain().focus().insertContent(textToInsert).run();
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#131316] border border-white/[0.06] rounded-2xl shadow-2xl relative">
      {/* Glow effect at top */}
      <div className="absolute top-0 left-1/4 right-1/4 h-[1px] bg-gradient-to-r from-transparent via-brand-500/45 to-transparent blur-[2px]" />

      {/* AI Panel Header */}
      <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-brand-500/20 group-hover:scale-105 transition-transform duration-300">
            <Brain className="w-4 h-4 text-white animate-pulse" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-white flex items-center gap-1.5">
              LumiAI Assistant
            </h3>
            <p className="text-[10px] text-gray-400 font-medium">Powered by Groq LLM</p>
          </div>
        </div>

        {/* Live Selection Indicator Badge */}
        {selectedText ? (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-500/10 border border-brand-500/20 animate-fade-in">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-ping" />
            <span className="text-[9px] font-bold text-brand-300 uppercase tracking-wide">Text Selected</span>
          </div>
        ) : (
          <div className="px-2 py-0.5 rounded-full bg-white/[0.03] border border-white/[0.05]">
            <span className="text-[9px] font-semibold text-gray-500 uppercase tracking-wide">Entire Note</span>
          </div>
        )}
      </div>

      {/* Tabs Selector */}
      <div className="px-4 py-2 bg-white/[0.01] border-b border-white/[0.04] shrink-0 flex">
        <div className="flex w-full bg-neutral-900/60 rounded-xl p-1 border border-white/[0.04]">
          {(["chat", "insights", "assistant"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-1.5
                ${activeTab === tab
                  ? "bg-white/[0.08] text-white shadow-glow border border-white/[0.05]"
                  : "text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.02]"
                }`}
            >
              {tab === "chat" ? (
                <>
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Chat</span>
                </>
              ) : tab === "insights" ? (
                <>
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Insights</span>
                </>
              ) : (
                <>
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>Writing</span>
                </>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── TAB CONTENT ── */}
      <div className="flex-1 overflow-hidden flex flex-col p-4 min-h-0 bg-[#131316]">
        
        {/* ── 1. CHAT TAB ── */}
        {activeTab === "chat" && (
          <div className="flex flex-col h-full min-h-0">
            {/* Chat Sub-Header */}
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/[0.03] shrink-0">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                History ({chatHistory.length})
              </span>
              {chatHistory.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearChat}
                  className="flex items-center gap-1 text-[10px] text-red-400 hover:text-red-300 font-semibold transition-colors"
                  title="Clear Chat History"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              )}
            </div>

            {/* Message list */}
            <div className="flex-1 overflow-y-auto flex flex-col gap-3 pr-1 py-1 scroll-smooth" ref={chatContainerRef}>
              {chatHistory.length === 0 && !chatLoading && (
                <div className="flex flex-col items-center justify-center flex-1 text-center py-8 text-neutral-500 gap-3 border border-white/[0.03] border-dashed rounded-xl bg-white/[0.01]">
                  <div className="w-12 h-12 rounded-full bg-white/[0.02] flex items-center justify-center text-neutral-400">
                    <MessageSquare className="w-5 h-5 opacity-40" />
                  </div>
                  <div className="max-w-[200px]">
                    <p className="text-xs font-bold text-neutral-400">Ask a Question</p>
                    <p className="text-[10px] text-neutral-500 mt-1">
                      Query your note for summaries, translations, lists, or custom details.
                    </p>
                  </div>
                </div>
              )}

              {chatHistory.map((msg, idx) => {
                const isUser = msg.role === "user";
                const msgId = `chat-msg-${idx}`;
                return (
                  <div
                    key={msgId}
                    className={`flex flex-col max-w-[88%] ${isUser ? "self-end items-end animate-slide-in-right" : "self-start items-start animate-slide-in-left"}`}
                  >
                    <div className={`p-3 rounded-2xl text-xs leading-relaxed group relative ${
                      isUser
                        ? "bg-brand-600/90 border border-brand-500/30 text-white rounded-tr-none shadow-md shadow-brand-600/10"
                        : "bg-white/[0.03] border border-white/[0.06] text-gray-200 rounded-tl-none shadow-sm"
                    }`}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>

                      {/* Message actions for AI replies */}
                      {!isUser && (
                        <div className="opacity-0 group-hover:opacity-100 absolute bottom-1 right-2 flex items-center gap-1.5 bg-[#17171d]/90 px-1.5 py-0.5 rounded-md border border-white/[0.08] shadow transition-opacity duration-200">
                          <button
                            type="button"
                            onClick={() => triggerCopyAlert(msgId, msg.content)}
                            className="p-0.5 text-[9px] text-neutral-400 hover:text-white"
                            title="Copy Response"
                          >
                            {copiedStates[msgId] ? (
                              <Check className="w-2.5 h-2.5 text-green-400" />
                            ) : (
                              <Copy className="w-2.5 h-2.5" />
                            )}
                          </button>
                          {editor && (
                            <button
                              type="button"
                              onClick={() => handleInsertToEditor(msg.content)}
                              className="p-0.5 text-[9px] text-neutral-400 hover:text-white hover:bg-white/[0.08] p-1 rounded transition"
                              title="Insert into Note"
                            >
                              <Plus className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {chatLoading && (
                <div className="self-start flex flex-col items-start max-w-[85%] animate-pulse">
                  <div className="p-3 bg-white/[0.02] border border-white/[0.05] text-gray-400 text-xs rounded-2xl rounded-tl-none flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin text-brand-400" />
                    <span>AI is reading note & typing...</span>
                  </div>
                </div>
              )}
            </div>

            {chatError && (
              <p className="text-[10px] text-red-400 px-1 py-1 font-semibold shrink-0">{chatError}</p>
            )}

            {/* Input form */}
            <form onSubmit={handleAsk} className="flex gap-2 mt-2 pt-2 border-t border-white/[0.04] shrink-0">
              <div className="relative flex-1">
                <input
                  type="text"
                  className="input w-full text-xs py-2.5 pr-8 bg-neutral-900 border-white/[0.08] text-white placeholder-neutral-500 rounded-xl focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  placeholder="Ask a question about this note..."
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  disabled={chatLoading}
                  id="ai-question-input"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] text-neutral-600 font-bold border border-neutral-800 rounded px-1 flex items-center gap-0.5 select-none">
                  Enter <CornerDownLeft className="w-2 h-2" />
                </span>
              </div>
              <button
                type="submit"
                className="btn-primary p-2.5 shrink-0 bg-brand-600 hover:bg-brand-500 text-white rounded-xl shadow-lg shadow-brand-600/10 flex items-center justify-center"
                disabled={chatLoading || !question.trim()}
                id="ai-ask-btn"
              >
                {chatLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <SendHorizonal className="w-4 h-4" />
                )}
              </button>
            </form>
          </div>
        )}

        {/* ── 2. INSIGHTS TAB ── */}
        {activeTab === "insights" && (
          <div className="flex flex-col h-full min-h-0 gap-4 overflow-y-auto pr-1">
            
            {/* Reading stats widget */}
            <div className="grid grid-cols-3 gap-2 bg-white/[0.02] border border-white/[0.04] p-3 rounded-xl shrink-0">
              <div className="flex flex-col items-center justify-center p-1 border-r border-white/[0.04]">
                <Clock className="w-3.5 h-3.5 text-neutral-400 mb-1" />
                <span className="text-[10px] text-gray-400">Read Time</span>
                <span className="text-xs font-bold text-white mt-0.5">{stats.readTime} min</span>
              </div>
              <div className="flex flex-col items-center justify-center p-1 border-r border-white/[0.04]">
                <FileText className="w-3.5 h-3.5 text-neutral-400 mb-1" />
                <span className="text-[10px] text-gray-400">Words</span>
                <span className="text-xs font-bold text-white mt-0.5">{stats.words}</span>
              </div>
              <div className="flex flex-col items-center justify-center p-1">
                <span className="w-4 h-4 rounded bg-neutral-800 flex items-center justify-center text-[10px] font-bold text-neutral-400 mb-1">C</span>
                <span className="text-[10px] text-gray-400">Characters</span>
                <span className="text-xs font-bold text-white mt-0.5">{stats.chars}</span>
              </div>
            </div>

            {/* AI Summary card */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between border-b border-white/[0.05] pb-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  Summary Settings
                </span>
                
                {/* Format buttons */}
                <div className="flex bg-neutral-900 rounded-lg p-0.5 border border-white/[0.04]">
                  {(["paragraph", "bullets", "actions"] as const).map((fmt) => {
                    const formatLabelMap: Record<string, string> = {
                      paragraph: "Text",
                      bullets: "Points",
                      actions: "Tasks",
                    };
                    return (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => {
                          setFormat(fmt);
                          if (typeof window !== "undefined") {
                            localStorage.setItem("luminote_ai_format", fmt);
                          }
                        }}
                        className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide transition-all
                          ${format === fmt
                            ? "bg-white/[0.08] text-white shadow-glow border border-white/[0.04]"
                            : "text-neutral-400 hover:text-neutral-200"
                          }`}
                      >
                        {formatLabelMap[fmt] || fmt}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Summary display box */}
              <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3.5 min-h-[100px] flex flex-col relative group">
                {hasSummary ? (
                  <>
                    <div className="prose-luminote text-xs text-gray-300 leading-relaxed overflow-y-auto max-h-44 pr-1">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {note.summary!}
                      </ReactMarkdown>
                    </div>

                    {/* Summary Quick Actions */}
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 absolute top-2 right-2 bg-[#17171d]/90 px-2 py-1 rounded-md border border-white/[0.08] shadow transition-opacity duration-200">
                      <button
                        type="button"
                        onClick={() => triggerCopyAlert("summary-copy", note.summary!)}
                        className="p-1 text-[10px] text-neutral-400 hover:text-white flex items-center gap-1"
                        title="Copy Summary"
                      >
                        {copiedStates["summary-copy"] ? (
                          <>
                            <Check className="w-3 h-3 text-green-400" />
                            <span className="text-[9px] text-green-400 font-semibold">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span className="text-[9px]">Copy</span>
                          </>
                        )}
                      </button>
                      {editor && (
                        <button
                          type="button"
                          onClick={() => handleInsertToEditor(`<div class="ai-summary-block"><h3>Summary</h3><p>${note.summary}</p></div><hr/>`)}
                          className="p-1 text-[10px] text-neutral-400 hover:text-white border-l border-white/[0.08] pl-1.5 flex items-center gap-1"
                          title="Insert Summary at Cursor"
                        >
                          <CornerUpRight className="w-3 h-3 animate-bounce" />
                          <span className="text-[9px]">Insert</span>
                        </button>
                      )}
                    </div>
                  </>
                ) : summarizing ? (
                  <div className="space-y-2.5 w-full py-4 animate-pulse">
                    <div className="h-3 w-full bg-white/10 rounded" />
                    <div className="h-3 w-11/12 bg-white/10 rounded" />
                    <div className="h-3 w-4/5 bg-white/10 rounded" />
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center py-6 text-neutral-500 gap-2">
                    <Brain className="w-7 h-7 opacity-20 animate-pulse" />
                    <span className="text-xs italic">No summary generated yet.</span>
                  </div>
                )}
              </div>

              {summarizeError && (
                <p className="text-[10px] text-red-400 font-semibold shrink-0">{summarizeError}</p>
              )}

              <button
                type="button"
                onClick={handleSummarize}
                disabled={summarizing || !note.content.trim()}
                className="w-full py-2 bg-neutral-900 border border-white/[0.08] hover:border-brand-500/50 hover:bg-neutral-800 text-white rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 shadow-md hover:scale-[1.01] active:scale-[0.99] transition-all duration-300"
              >
                {summarizing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-400" />
                ) : (
                  <Zap className="w-3.5 h-3.5 text-brand-400" />
                )}
                {hasSummary ? "Regenerate Summary" : "Generate Summary"}
              </button>
            </div>

            {/* Keyword tags card */}
            <div className="flex flex-col gap-2 pb-2">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-white/[0.03] pb-1.5">
                Note Tags
              </span>
              {note.tags && note.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 py-1">
                  {note.tags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => triggerCopyAlert(`tag-${tag}`, tag)}
                      className="px-2.5 py-1 text-[10px] font-semibold bg-white/[0.03] border border-white/[0.06] text-gray-300 hover:text-white hover:bg-brand-500/10 hover:border-brand-500/20 rounded-lg flex items-center gap-1 transition-all duration-200 group"
                      title="Click to copy tag"
                    >
                      <span>#{tag}</span>
                      {copiedStates[`tag-${tag}`] ? (
                        <Check className="w-2.5 h-2.5 text-green-400 animate-scale-in" />
                      ) : (
                        <Copy className="w-2.5 h-2.5 opacity-0 group-hover:opacity-60 transition-opacity" />
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-neutral-500 italic py-1">
                  No tags auto-generated. Generate a summary to extract key tags.
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── 3. WRITING ASSISTANT TAB ── */}
        {activeTab === "assistant" && (
          <div className="flex flex-col h-full min-h-0 gap-3 overflow-y-auto pr-1">
            
            {/* Instruction Banner */}
            <div className="bg-brand-600/10 border border-brand-500/20 rounded-xl p-3 flex gap-2">
              <Wand2 className="w-4 h-4 text-brand-400 shrink-0 mt-0.5 animate-pulse" />
              <div className="flex-1 min-w-0">
                <span className="text-xs font-bold text-white block">Smart Assistant Tools</span>
                <span className="text-[10px] text-gray-300 leading-relaxed block mt-0.5">
                  {selectedText 
                    ? `Will transform the highlighted text (${selectedText.split(/\s+/).length} words).`
                    : "Highlight any text in the editor to transform it, or click tools below to process the whole note."}
                </span>
              </div>
            </div>

            {/* Quick Actions Grid */}
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-white/[0.03] pb-1">
                Writing Actions
              </span>
              
              <div className="grid grid-cols-2 gap-2">
                
                {/* 1. Tone Dropdown Menu */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setToneDropdownOpen(!toneDropdownOpen);
                      setTranslateDropdownOpen(false);
                    }}
                    disabled={assistantLoading}
                    className="w-full py-2 px-3 bg-neutral-900 border border-white/[0.06] hover:bg-neutral-800 text-left text-xs font-semibold text-white rounded-xl flex items-center justify-between gap-1 transition-all duration-200"
                  >
                    <span className="flex items-center gap-1.5">
                      <Wand2 className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
                      <span>Change Tone</span>
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 transition-transform ${toneDropdownOpen ? "rotate-180" : ""}`} />
                  </button>
                  {toneDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-[#17171d] border border-white/[0.08] rounded-xl shadow-xl p-1 flex flex-col animate-fade-in">
                      {tones.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => handleAssistantAction("tone", t)}
                          className="w-full py-1.5 px-3 text-left text-xs text-gray-300 hover:text-white hover:bg-white/[0.04] rounded-lg transition-colors font-medium"
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 2. Translate Dropdown Menu */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setTranslateDropdownOpen(!translateDropdownOpen);
                      setToneDropdownOpen(false);
                    }}
                    disabled={assistantLoading}
                    className="w-full py-2 px-3 bg-neutral-900 border border-white/[0.06] hover:bg-neutral-800 text-left text-xs font-semibold text-white rounded-xl flex items-center justify-between gap-1 transition-all duration-200"
                  >
                    <span className="flex items-center gap-1.5">
                      <Languages className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                      <span>Translate</span>
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 transition-transform ${translateDropdownOpen ? "rotate-180" : ""}`} />
                  </button>
                  {translateDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-[#17171d] border border-white/[0.08] rounded-xl shadow-xl p-1 flex flex-col animate-fade-in">
                      {languages.map((l) => (
                        <button
                          key={l}
                          type="button"
                          onClick={() => handleAssistantAction("translate", l)}
                          className="w-full py-1.5 px-3 text-left text-xs text-gray-300 hover:text-white hover:bg-white/[0.04] rounded-lg transition-colors font-medium"
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 3. Grammar check */}
                <button
                  type="button"
                  onClick={() => handleAssistantAction("grammar")}
                  disabled={assistantLoading}
                  className="py-2 px-3 bg-neutral-900 border border-white/[0.06] hover:bg-neutral-800 text-left text-xs font-semibold text-white rounded-xl flex items-center gap-1.5 transition-all duration-200"
                >
                  <SpellCheck className="w-3.5 h-3.5 text-blue-400" />
                  <span>Grammar & Polish</span>
                </button>

                {/* 4. Simplify */}
                <button
                  type="button"
                  onClick={() => handleAssistantAction("simplify")}
                  disabled={assistantLoading}
                  className="py-2 px-3 bg-neutral-900 border border-white/[0.06] hover:bg-neutral-800 text-left text-xs font-semibold text-white rounded-xl flex items-center gap-1.5 transition-all duration-200"
                >
                  <Check className="w-3.5 h-3.5 text-green-400" />
                  <span>Simplify Text</span>
                </button>

                {/* 5. Expand */}
                <button
                  type="button"
                  onClick={() => handleAssistantAction("expand")}
                  disabled={assistantLoading}
                  className="col-span-2 py-2 px-3 bg-neutral-900 border border-white/[0.06] hover:bg-neutral-800 text-center text-xs font-semibold text-white rounded-xl flex items-center justify-center gap-1.5 transition-all duration-200 hover:scale-[1.005] active:scale-[0.995]"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Expand Content (Add details)</span>
                </button>
              </div>
            </div>

            {/* Processing State & Output display */}
            <div className="flex flex-col gap-2.5 flex-1 min-h-[140px]">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-white/[0.03] pb-1">
                Assistant Output
              </span>

              <div className="flex-1 bg-white/[0.02] border border-white/[0.05] rounded-xl p-3.5 min-h-[120px] flex flex-col relative group">
                {assistantLoading ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center text-neutral-500 gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
                    <span className="text-xs animate-pulse">LumiAI is transforming your writing...</span>
                  </div>
                ) : assistantError ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center py-6 px-4 gap-3 bg-red-950/10 border border-red-500/10 rounded-xl">
                    <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-400">
                      <ShieldAlert className="w-5 h-5 animate-pulse" />
                    </div>
                    <div className="max-w-[280px]">
                      <p className="text-xs font-bold text-red-400">Content Refusal</p>
                      <p className="text-[10px] text-gray-400 mt-1.5 leading-relaxed">
                        {assistantError}
                      </p>
                    </div>
                  </div>
                ) : assistantOutput ? (
                  <>
                    <div className="prose-luminote text-xs text-gray-300 leading-relaxed overflow-y-auto max-h-56 pr-1">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {assistantOutput}
                      </ReactMarkdown>
                    </div>

                    {/* Actions overlay */}
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 absolute bottom-2 right-2 bg-[#17171d]/90 px-2 py-1.5 rounded-lg border border-white/[0.08] shadow transition-opacity duration-200">
                      <button
                        type="button"
                        onClick={() => triggerCopyAlert("assistant-copy", assistantOutput)}
                        className="p-1 text-[10px] text-neutral-400 hover:text-white flex items-center gap-1"
                        title="Copy Output"
                      >
                        {copiedStates["assistant-copy"] ? (
                          <>
                            <Check className="w-3 h-3 text-green-400 animate-scale-in" />
                            <span className="text-[9px] text-green-400 font-semibold">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span className="text-[9px]">Copy</span>
                          </>
                        )}
                      </button>
                      {editor && (
                        <button
                          type="button"
                          onClick={() => handleInsertToEditor(assistantOutput)}
                          className="p-1 text-[10px] text-neutral-400 hover:text-white border-l border-white/[0.08] pl-1.5 flex items-center gap-1"
                          title={selectedText ? "Replace selection with AI output" : "Insert AI output at cursor"}
                        >
                          <Plus className="w-3 h-3 text-brand-400" />
                          <span className="text-[9px] text-brand-300 font-semibold">
                            {selectedText ? "Replace" : "Insert"}
                          </span>
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center py-6 text-neutral-500 gap-2">
                    <Wand2 className="w-7 h-7 opacity-20" />
                    <span className="text-xs italic max-w-[200px]">
                      Your AI results will show up here. Select text & trigger an action.
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
