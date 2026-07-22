"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  HelpCircle,
  Search,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Bell,
  Database,
  Lock,
  Keyboard,
  Compass,
} from "lucide-react";

interface FAQItem {
  question: string;
  answer: string;
  category: "general" | "ai" | "alerts" | "data";
}

const FAQS: FAQItem[] = [
  {
    category: "general",
    question: "What is Luminote?",
    answer: "Luminote is an AI-powered note-taking application designed for developers and technical teams. It provides automatic summarization, semantic search (finding notes by meaning rather than exact keywords), and interactive reminder scheduling."
  },
  {
    category: "ai",
    question: "How does the AI Summarization work?",
    answer: "Whenever you write or update a note, Luminote's background pipeline parses the content using Groq's high-performance LLMs. It generates a summary, extracts key action items or calendar reminders, and tags your note automatically."
  },
  {
    category: "ai",
    question: "Can I customize the AI summarization format?",
    answer: "Yes! Navigate to the Settings tab, select 'AI Settings', and choose between a standard 'Paragraph', 'Bullet Points', or 'Action Items' format. You can also toggle whether the AI should automatically extract alerts."
  },
  {
    category: "alerts",
    question: "How do I create and manage alerts?",
    answer: "You can create alerts manually on the Calendar page by selecting a note, writing an alert title, and picking a date/time. Additionally, AI-extracted alerts will appear automatically. You can review and delete scheduled alerts directly on the Calendar page or your Home dashboard."
  },
  {
    category: "data",
    question: "Can I back up my notes?",
    answer: "Absolutely. Under the Settings -> 'Backup & Data' tab, you can export your entire note library to a JSON file. To restore or migrate your notes, simply upload the JSON backup file in the 'Import Notes' section."
  },
  {
    category: "data",
    question: "How do I permanently delete my notes or account?",
    answer: "Luminote provides options to wipe all notes or delete your account permanently in the Settings page (under the 'Backup & Data' and 'Danger Zone' tabs respectively). These actions are irreversible and will delete all stored notes, embeddings, and reminders."
  },
  {
    category: "general",
    question: "What are the keyboard shortcuts?",
    answer: "Luminote is designed to be keyboard-friendly. Press 'Tab' to move focus between navigation links, editor textareas, and active buttons. In the editor view, standard markdown shortcuts are supported natively."
  }
];

export default function HelpPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<"all" | "general" | "ai" | "alerts" | "data">("all");
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const toggleExpand = (idx: number) => {
    setExpandedIndex(expandedIndex === idx ? null : idx);
  };

  const filteredFaqs = FAQS.filter((faq) => {
    const matchesSearch =
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === "all" || faq.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = [
    { id: "all", label: "All Topics", icon: Compass },
    { id: "general", label: "General", icon: HelpCircle },
    { id: "ai", label: "AI & Search", icon: Sparkles },
    { id: "alerts", label: "Alerts & Calendar", icon: Bell },
    { id: "data", label: "Backup & Privacy", icon: Database },
  ] as const;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 animate-slide-up">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gradient flex items-center gap-2">
          <HelpCircle className="w-8 h-8 text-brand-400" />
          Help & Support
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Find answers to frequently asked questions and learn how to navigate Luminote.
        </p>
      </div>

      {/* Search Input */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500 pointer-events-none" />
        <input
          type="text"
          placeholder="Search support articles, features, or shortcuts..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-surface-900 border border-surface-600 rounded-xl pl-12 pr-4 py-3 text-white text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 shadow-sm transition-all placeholder:text-neutral-500"
        />
      </div>

      {/* Category Pills */}
      <div className="flex border-b border-white/[0.06] mb-8 overflow-x-auto gap-2 pb-2">
        {categories.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => {
              setActiveCategory(id);
              setExpandedIndex(null);
            }}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border transition-all shrink-0
              ${activeCategory === id
                ? "bg-brand-500/10 border-brand-500 text-white"
                : "border-transparent text-neutral-400 hover:text-neutral-200 hover:bg-surface-700"
              }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* FAQ Accordion List */}
      <div className="flex flex-col gap-4">
        {filteredFaqs.length > 0 ? (
          filteredFaqs.map((faq, idx) => {
            const isExpanded = expandedIndex === idx;
            return (
              <div
                key={idx}
                className="glass rounded-xl border border-surface-600 overflow-hidden transition-all duration-200 hover:border-brand-500/30"
              >
                <button
                  onClick={() => toggleExpand(idx)}
                  className="w-full px-6 py-4 flex items-center justify-between text-left text-sm font-semibold text-white bg-surface-900/40 hover:bg-surface-700/30 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                    {faq.question}
                  </span>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-neutral-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-neutral-400" />
                  )}
                </button>
                <div
                  className={`transition-all duration-250 ease-in-out ${
                    isExpanded ? "max-h-[300px] border-t border-white/[0.04] p-6 bg-surface-900/20" : "max-h-0 overflow-hidden"
                  }`}
                >
                  <p className="text-xs text-neutral-400 leading-relaxed font-normal">
                    {faq.answer}
                  </p>
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center text-neutral-500">
            <HelpCircle className="w-12 h-12 text-neutral-600 mb-3" />
            <p className="text-sm font-semibold">No matches found</p>
            <p className="text-xs text-neutral-600 mt-1">Try clearing your search query or choosing another topic category.</p>
          </div>
        )}
      </div>

      {/* Quick Cards Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-12">
        <div className="glass p-5 flex gap-4 items-start border border-surface-600">
          <div className="p-3 bg-brand-500/10 border border-brand-500/20 rounded-xl text-brand-400 shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Security & Privacy</h3>
            <p className="text-[11px] text-neutral-400 mt-1 leading-relaxed">
              Luminote stores note vector representations locally. All communication with Groq uses encrypted TLS channels to maintain notes security.
            </p>
          </div>
        </div>

        <div className="glass p-5 flex gap-4 items-start border border-surface-600">
          <div className="p-3 bg-brand-500/10 border border-brand-500/20 rounded-xl text-brand-400 shrink-0">
            <Keyboard className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Accessibility AA</h3>
            <p className="text-[11px] text-neutral-400 mt-1 leading-relaxed">
              Fully compliant with WCAG 2.2 accessibility parameters, featuring focus indicators, keyboard navigation, and high-contrast color choices.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
