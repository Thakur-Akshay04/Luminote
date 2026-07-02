"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { isAuthenticated } from "@/lib/auth";
import { Sparkles, Bot, Search, Bell } from "lucide-react";

export default function LandingPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (isAuthenticated()) {
      router.replace("/dashboard");
    } else {
      setMounted(true);
    }
  }, [router]);

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-800">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 flex flex-col items-center gap-12 text-center animate-fade-in text-neutral-300">
      {/* Hero Header */}
      <div className="space-y-4 max-w-3xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-300 text-xs font-semibold">
          <Sparkles className="w-3.5 h-3.5" /> Introducing Luminote AI Workspace
        </div>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-tight leading-none">
          Your Personal Knowledge <span className="text-gradient">Enriched by AI</span>
        </h1>
        <p className="text-neutral-400 text-base sm:text-lg max-w-2xl mx-auto">
          A beautiful, secure, and blazing-fast home for your ideas. Auto-summarize notes, query them using AI, set intelligent reminders, and find everything using semantic search.
        </p>
      </div>

      {/* Action CTA Card */}
      <div className="glass p-8 max-w-md w-full flex flex-col gap-6 relative overflow-hidden group">
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-brand-500 to-accent-pink"></div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-white">Get Started with Luminote</h2>
          <p className="text-xs text-neutral-400">
            Sign in or create a free account to begin storing, searching, and organizing your thoughts with AI.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Link
            href="/login"
            id="landing-cta-login"
            className="btn-primary w-full py-3"
          >
            Sign In to Your Account
          </Link>
          <Link
            href="/register"
            id="landing-cta-register"
            className="btn-secondary w-full py-3"
          >
            Create Free Account
          </Link>
        </div>
      </div>

      {/* Features Showcase */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl w-full text-left mt-8">
        <div className="glass p-6 flex flex-col gap-3 hover:border-brand-500/30 transition-all duration-200">
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
            <Bot className="w-5 h-5" />
          </div>
          <h3 className="text-base font-semibold text-white">AI Summarization</h3>
          <p className="text-xs text-neutral-400 leading-relaxed">
            Instantly compile summaries, identify actionable takeaways, and generate categorizing tags directly from your text using Llama models.
          </p>
        </div>

        <div className="glass p-6 flex flex-col gap-3 hover:border-brand-500/30 transition-all duration-200">
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
            <Search className="w-5 h-5" />
          </div>
          <h3 className="text-base font-semibold text-white">Semantic Search</h3>
          <p className="text-xs text-neutral-400 leading-relaxed">
            Find notes by concepts, feelings, or related ideas, not just keyword matches. Powered by high-dimensional vector embeddings.
          </p>
        </div>

        <div className="glass p-6 flex flex-col gap-3 hover:border-brand-500/30 transition-all duration-200">
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
            <Bell className="w-5 h-5" />
          </div>
          <h3 className="text-base font-semibold text-white">Smart Reminders</h3>
          <p className="text-xs text-neutral-400 leading-relaxed">
            Extract dates, deadlines, and follow-ups from your notes automatically to set up push-reminders and schedule interactive calendar cards.
          </p>
        </div>
      </div>
    </div>
  );
}
