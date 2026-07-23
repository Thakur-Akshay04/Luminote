"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  HelpCircle,
  Search,
  ChevronDown,
  ChevronUp,
  Bot,
  Bell,
  Database,
  Keyboard,
  Compass,
  BookOpen,
  X,
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
  }
];

export default function HelpPage() {
  const router = useRouter();
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
      {/* ── HERO BANNER ──────────────────────────────────────────────────── */}
      <div className="mb-6 p-6 sm:p-7 rounded-2xl bg-neutral-900/60 border border-white/[0.06] flex flex-col gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Help Center</h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">Find answers, documentation, and feature guides.</p>
        </div>

        {/* Search Box */}
        <div className="w-full relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search help articles, topics, or FAQs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-neutral-950 border border-white/[0.08] focus:border-brand-500 rounded-xl pl-10 pr-9 py-2.5 text-white text-xs focus:outline-none transition-all placeholder:text-neutral-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── TOPIC CARDS GRID ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          {
            title: "Getting Started",
            desc: "Learn the core notes structure & views",
            icon: BookOpen,
            color: "text-brand-400 bg-brand-500/10 border-brand-500/20",
            category: "general",
          },
          {
            title: "AI Copilot",
            desc: "Automated summaries, tags & answers",
            icon: Bot,
            color: "text-purple-400 bg-purple-500/10 border-purple-500/20",
            category: "ai",
          },
          {
            title: "Calendar Sync",
            desc: "Schedule alerts and track deadlines",
            icon: Bell,
            color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
            category: "alerts",
          },
          {
            title: "Data Backup",
            desc: "Export JSON archives & manage data",
            icon: Database,
            color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
            category: "data",
          },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.title}
              onClick={() => {
                setActiveCategory(card.category as any);
                setSearchQuery("");
              }}
              className="glass p-4 rounded-2xl border border-white/[0.06] hover:border-white/[0.15] text-left transition-all group flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-2">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${card.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider group-hover:text-white transition-colors">
                  Explore →
                </span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-white group-hover:text-brand-300 transition-colors">
                  {card.title}
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5 leading-relaxed">{card.desc}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── CATEGORY TAB PILLS ────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-5 border-b border-white/[0.06] pb-3 overflow-x-auto scrollbar-none">
        {categories.map(({ id, label, icon: Icon, count }) => {
          const isActive = activeCategory === id;
          return (
            <button
              key={id}
              onClick={() => {
                setActiveCategory(id);
                setExpandedId(null);
              }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 ${isActive
                ? "bg-brand-500 text-white shadow-lg shadow-brand-500/20 border border-brand-400/30"
                : "bg-neutral-900/60 text-neutral-400 hover:text-white hover:bg-neutral-800/60 border border-white/[0.04]"
                }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[9px] font-extrabold ${isActive ? "bg-white/20 text-white" : "bg-white/[0.06] text-neutral-500"
                  }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── FAQ ACCORDION LIST ───────────────────────────────────────────── */}
      <div className="flex flex-col gap-3.5">
        {filteredFaqs.length > 0 ? (
          filteredFaqs.map((faq) => {
            const isExpanded = expandedId === faq.id;
            return (
              <div
                key={faq.id}
                className={`glass rounded-2xl border transition-all duration-300 overflow-hidden ${isExpanded
                  ? "border-brand-500/40 bg-surface-900/70 shadow-xl"
                  : "border-white/[0.06] hover:border-white/[0.12] bg-neutral-900/40"
                  }`}
              >
                <button
                  onClick={() => toggleExpand(faq.id)}
                  className="w-full p-5 sm:p-6 flex items-center justify-between text-left transition-colors group"
                >
                  <div className="flex items-start gap-3 min-w-0 pr-4">
                    <div
                      className={`w-2 h-2 rounded-full mt-2 shrink-0 transition-colors ${isExpanded ? "bg-brand-400 animate-pulse" : "bg-neutral-600 group-hover:bg-neutral-400"
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
                            className="px-2 py-0.5 rounded-md text-[9px] font-semibold bg-white/[0.04] text-neutral-400 border border-white/[0.06]"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border transition-all ${isExpanded
                      ? "bg-brand-500/20 text-brand-300 border-brand-500/30"
                      : "bg-white/[0.04] text-neutral-400 group-hover:text-white border-white/[0.06]"
                      }`}
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-6 pb-6 pt-2 border-t border-white/[0.04] animate-fade-in">
                    <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed font-normal bg-neutral-950/40 p-4 rounded-xl border border-white/[0.04]">
                      {faq.answer}
                    </p>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center text-neutral-500 glass rounded-3xl border border-white/[0.06]">
            <HelpCircle className="w-12 h-12 text-neutral-600 mb-3" />
            <h3 className="text-base font-bold text-white">No articles found</h3>
            <p className="text-xs text-neutral-400 mt-1 max-w-sm">
              We couldn't find any articles matching "{searchQuery}". Try clearing your search query or selecting a different category tab above.
            </p>
            <button
              onClick={() => {
                setSearchQuery("");
                setActiveCategory("all");
              }}
              className="btn-secondary mt-4 py-2 px-4 text-xs font-bold"
            >
              Clear Search Filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
