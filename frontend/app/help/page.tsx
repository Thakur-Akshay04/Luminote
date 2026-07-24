"use client";

import { useState, useEffect } from "react";

import {
  HelpCircle,
  Search,
  ChevronDown,
  ChevronUp,
  Bot,
  Bell,
  Database,
  Compass,
  BookOpen,
  X,
  Lock,
  Shield,
  Check,
} from "lucide-react";

interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: "general" | "ai" | "alerts" | "data";
  tags: string[];
}

const FAQS: FAQItem[] = [
  {
    id: "what-is-luminote",
    category: "general",
    question: "What is Luminote?",
    answer: "Luminote is a next-generation AI note-taking and thought workspace. It combines rich-text Markdown editing, freehand drawings, voice recordings with transcription, semantic vector search, and automated AI insights into a unified workspace.",
    tags: ["Overview", "Features", "Getting Started"],
  },
  {
    id: "ai-summarization",
    category: "ai",
    question: "How does AI Summarization and Action Extraction work?",
    answer: "When you write or update notes, Luminote's background pipeline processes your content using high-speed LLMs. It generates structured summaries, extracts keywords, and parses event dates/deadlines into your calendar automatically based on your Workspace Preferences.",
    tags: ["LumiAI", "Summaries", "Automation"],
  },
  {
    id: "ai-settings-format",
    category: "ai",
    question: "Can I customize the summary format?",
    answer: "Yes! Navigate to Settings → 'Workspace & AI' to choose your default summary format: Paragraph, Bullet Points, or Action Items. You can also toggle automatic calendar alert extraction.",
    tags: ["Settings", "Preferences", "Format"],
  },
  {
    id: "calendar-alerts",
    category: "alerts",
    question: "How do calendar reminders and alerts work?",
    answer: "You can schedule manual alerts on the Calendar page by choosing a note, writing a reminder title, and selecting a time. In addition, AI-extracted deadlines from your notes automatically appear in your calendar timeline.",
    tags: ["Calendar", "Reminders", "Deadlines"],
  },
  {
    id: "backup-data",
    category: "data",
    question: "How do I export a backup of my workspace data?",
    answer: "Go to Settings → 'Export & Data' and click 'Download Workspace Backup (.json)'. This generates a JSON file containing all your text notes, checklists, and metadata to save offline.",
    tags: ["Export", "Backup", "JSON"],
  },
  {
    id: "privacy-security",
    category: "data",
    question: "Is my note data secure and private?",
    answer: "Your account is secured via Clerk authentication. All communication with backend endpoints and AI language models is encrypted using TLS. You retain full control to wipe workspace notes or permanently delete your account at any time in Settings.",
    tags: ["Privacy", "Security", "Encryption"],
  },
];

export default function HelpPage() {
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<"all" | "general" | "ai" | "alerts" | "data">("all");
  const [expandedId, setExpandedId] = useState<string | null>("what-is-luminote");

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const filteredFaqs = FAQS.filter((faq) => {
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !query ||
      faq.question.toLowerCase().includes(query) ||
      faq.answer.toLowerCase().includes(query) ||
      faq.tags.some((t) => t.toLowerCase().includes(query));
    const matchesCategory = activeCategory === "all" || faq.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = [
    { id: "all", label: "All Topics", icon: Compass, count: FAQS.length },
    { id: "general", label: "General", icon: HelpCircle, count: FAQS.filter((f) => f.category === "general").length },
    { id: "ai", label: "AI & Insights", icon: Bot, count: FAQS.filter((f) => f.category === "ai").length },
    { id: "alerts", label: "Calendar & Alerts", icon: Bell, count: FAQS.filter((f) => f.category === "alerts").length },
    { id: "data", label: "Data & Privacy", icon: Database, count: FAQS.filter((f) => f.category === "data").length },
  ] as const;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 sm:px-6 lg:px-8 animate-fade-in">
      {/* ── UNIFIED HERO HEADER CONTAINER ─────────────────────────────────── */}
      <div className="relative mb-8 p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-neutral-900/90 via-surface-900/50 to-neutral-950/90 border border-white/[0.08] shadow-2xl backdrop-blur-xl overflow-hidden">
        {/* Glow ambient background */}
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-16 w-64 h-64 bg-accent-violet/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-accent-violet flex items-center justify-center shadow-lg text-white font-bold shrink-0">
              <HelpCircle className="w-7 h-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  Help & Support Center
                </h1>
              </div>
              <p className="text-xs text-neutral-400 mt-1 font-medium">
                Find user guides, platform documentation, and answers.
              </p>
            </div>
          </div>
        </div>

        {/* Integrated Search Bar */}
        <div className="w-full mt-6 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search help articles, features, or keywords..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-neutral-950/80 border border-white/[0.08] focus:border-brand-500 rounded-2xl pl-11 pr-10 py-3 text-white text-xs sm:text-sm focus:outline-none transition-all placeholder:text-neutral-500 shadow-inner"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Integrated Category Filter Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-6 pt-6 border-t border-white/[0.06]">
          {categories.map(({ id, label, icon: Icon, count }) => {
            const isActive = activeCategory === id;
            return (
              <button
                type="button"
                key={id}
                onClick={() => {
                  setActiveCategory(id);
                  setExpandedId(null);
                }}
                className={`relative flex flex-col justify-between p-4 rounded-2xl border transition-all text-left group overflow-hidden ${
                  isActive
                    ? "bg-brand-500/10 border-brand-500 shadow-glow text-white"
                    : "bg-neutral-900/60 border-white/[0.04] text-neutral-400 hover:border-white/[0.12] hover:bg-neutral-900/90"
                }`}
              >
                {isActive && (
                  <div className="absolute top-3 right-3 w-4 h-4 rounded-full bg-brand-500 flex items-center justify-center text-white">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </div>
                )}
                <div>
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center mb-2.5 transition-colors ${
                      isActive
                        ? "bg-brand-500/20 text-brand-300 border border-brand-500/30"
                        : "bg-white/[0.04] text-neutral-400 group-hover:text-white"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-bold text-xs text-white block group-hover:text-brand-300 transition-colors">
                      {label}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[9px] font-extrabold shrink-0 ${
                        isActive ? "bg-brand-500 text-white" : "bg-white/[0.06] text-neutral-500"
                      }`}
                    >
                      {count}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── SECTION 2: FAQ ACCORDION LIST ────────────────────────────────── */}
      <div className="flex flex-col gap-6 animate-slide-up">
        <section className="glass p-6 sm:p-8 rounded-3xl flex flex-col gap-6 border border-white/[0.06]">
          <div>
            <div className="flex items-center gap-2 text-brand-400 text-xs font-bold uppercase tracking-widest mb-1">
              <BookOpen className="w-4 h-4" />
              <span>Knowledge Base</span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">Frequently Asked Questions</h2>
            <p className="text-xs text-neutral-400 mt-1 max-w-xl">
              Showing {filteredFaqs.length} article{filteredFaqs.length === 1 ? "" : "s"} matching your selected topic.
            </p>
          </div>

          <div className="flex flex-col gap-3.5">
            {filteredFaqs.length > 0 ? (
              filteredFaqs.map((faq) => {
                const isExpanded = expandedId === faq.id;
                return (
                  <div
                    key={faq.id}
                    className={`rounded-2xl border transition-all duration-300 overflow-hidden ${
                      isExpanded
                        ? "border-brand-500/40 bg-surface-900/70 shadow-xl"
                        : "border-white/[0.06] hover:border-white/[0.12] bg-neutral-900/50"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleExpand(faq.id)}
                      className="w-full p-5 sm:p-6 flex items-center justify-between text-left transition-colors group"
                    >
                      <div className="flex items-start gap-3.5 min-w-0 pr-4">
                        <div
                          className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 transition-colors ${
                            isExpanded ? "bg-brand-400 animate-pulse" : "bg-neutral-600 group-hover:bg-neutral-400"
                          }`}
                        />
                        <div>
                          <h3 className="text-sm sm:text-base font-bold text-white group-hover:text-brand-300 transition-colors">
                            {faq.question}
                          </h3>
                          <div className="flex items-center gap-2 mt-2">
                            {faq.tags.map((tag) => (
                              <span
                                key={tag}
                                className="px-2.5 py-0.5 rounded-md text-[9px] font-semibold bg-white/[0.04] text-neutral-400 border border-white/[0.06]"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border transition-all ${
                          isExpanded
                            ? "bg-brand-500/20 text-brand-300 border-brand-500/30"
                            : "bg-white/[0.04] text-neutral-400 group-hover:text-white border-white/[0.06]"
                        }`}
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-6 pb-6 pt-2 border-t border-white/[0.04] animate-fade-in">
                        <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed font-normal bg-neutral-950/60 p-4 rounded-xl border border-white/[0.04]">
                          {faq.answer}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center text-neutral-500 rounded-3xl border border-white/[0.06] bg-neutral-900/30">
                <HelpCircle className="w-12 h-12 text-neutral-600 mb-3" />
                <h3 className="text-base font-bold text-white">No articles found</h3>
                <p className="text-xs text-neutral-400 mt-1 max-w-sm">
                  We couldn't find any articles matching "{searchQuery}". Try clearing your search query or selecting another category tab above.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setActiveCategory("all");
                  }}
                  className="mt-4 px-4 py-2 rounded-xl bg-brand-500 text-white text-xs font-bold shadow-lg shadow-brand-500/20 hover:bg-brand-600 transition-all"
                >
                  Clear Search Filters
                </button>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ── SECTION 3: PLATFORM SECURITY & POLICIES (SETTINGS CARDS) ───── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
        <div className="p-6 rounded-3xl glass border border-white/[0.06] flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-400 flex items-center justify-center shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Security & Encryption</h3>
            <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
              All communications are encrypted in-transit via TLS. Clerk authentication guarantees identity protection across your devices.
            </p>
          </div>
        </div>

        <div className="p-6 rounded-3xl glass border border-white/[0.06] flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-400 flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Data Ownership & Control</h3>
            <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
              Export your full workspace data as a JSON file anytime or execute a complete data wipe in Settings.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
