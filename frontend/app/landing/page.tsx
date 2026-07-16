"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { isAuthenticated } from "@/lib/auth";
import {
  Sparkles,
  Bot,
  Search,
  Bell,
  Notebook,
  FileText,
  Mic,
  Palette,
  Shield,
  ArrowRight,
  CheckCircle2,
  Workflow,
  Sparkle,
} from "lucide-react";

export default function LandingPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<"capture" | "summarize" | "ask">("capture");
  const [waveformHeights, setWaveformHeights] = useState([8, 16, 24, 12, 18, 14, 22, 10, 16, 20]);
  const autoRotateRef = useRef<NodeJS.Timeout | null>(null);
  const userInteracted = useRef(false);

  useEffect(() => {
    if (isAuthenticated()) {
      router.replace("/dashboard");
    } else {
      setMounted(true);
    }
  }, [router]);

  // Audio wave visualizer animation for capture mode
  useEffect(() => {
    if (!mounted || activeTab !== "capture") return;
    const interval = setInterval(() => {
      setWaveformHeights((prev) => prev.map(() => Math.floor(Math.random() * 24) + 6));
    }, 150);
    return () => clearInterval(interval);
  }, [mounted, activeTab]);

  // Auto-rotate tabs every 8 seconds unless user interacts
  useEffect(() => {
    if (!mounted) return;

    const startRotation = () => {
      autoRotateRef.current = setInterval(() => {
        if (!userInteracted.current) {
          setActiveTab((prev) => {
            if (prev === "capture") return "summarize";
            if (prev === "summarize") return "ask";
            return "capture";
          });
        }
      }, 8000);
    };

    startRotation();

    return () => {
      if (autoRotateRef.current) clearInterval(autoRotateRef.current);
    };
  }, [mounted]);

  const handleTabClick = (tab: "capture" | "summarize" | "ask") => {
    userInteracted.current = true;
    setActiveTab(tab);
    if (autoRotateRef.current) {
      clearInterval(autoRotateRef.current);
    }
  };

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-800">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-neutral-300 relative overflow-hidden flex flex-col">
      {/* Background Ambient Glows */}
      <div className="absolute top-[-10%] left-[5%] w-[450px] h-[450px] rounded-full bg-brand-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute top-[-5%] right-[5%] w-[450px] h-[450px] rounded-full bg-accent-violet/10 blur-[130px] pointer-events-none" />
      <div className="absolute top-[45%] left-1/2 -translate-x-1/2 w-[550px] h-[550px] rounded-full bg-accent-cyan/5 blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[15%] w-[450px] h-[450px] rounded-full bg-brand-500/5 blur-[120px] pointer-events-none" />

      {/* Hero Header */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 flex flex-col items-center gap-8 text-center relative z-10">
        {/* Intro Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-300 text-xs font-semibold hover:border-brand-500/35 transition-colors duration-300 cursor-default animate-fade-in">
          <Sparkle className="w-3.5 h-3.5 animate-pulse-slow fill-brand-300/25" />
          <span>Introducing Luminote AI Workspace 2.0</span>
        </div>

        {/* Title */}
        <h1 className="text-4xl sm:text-5xl lg:text-7xl font-extrabold text-white tracking-tight leading-[1.1] max-w-4xl mt-2 animate-slide-up text-wrap-balance">
          Your Personal Knowledge <span className="text-gradient">Enriched by AI</span>
        </h1>

        {/* Subtitle */}
        <p className="text-neutral-400 text-sm sm:text-base lg:text-lg max-w-3xl mx-auto leading-relaxed mt-2 text-wrap-pretty">
          A beautiful, secure, and blazing-fast home for your thoughts. Auto-summarize notes, query them using AI, set intelligent reminders, and find everything using semantic search.
        </p>

        {/* Hero CTAs */}
        <div className="flex flex-col sm:flex-row gap-4 mt-6 w-full sm:w-auto justify-center">
          <Link
            href="/register"
            id="landing-cta-register"
            className="btn-primary px-8 py-3.5 rounded-lg flex items-center justify-center gap-2 group text-sm sm:text-base"
          >
            Get Started Free
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
          <Link
            href="/login"
            id="landing-cta-login"
            className="btn-secondary px-8 py-3.5 rounded-lg text-sm sm:text-base"
          >
            Sign In to Account
          </Link>
        </div>

        {/* Interactive App Mockup & Tabs Container */}
        <div className="w-full max-w-4xl mt-16 flex flex-col gap-6">
          <div className="flex flex-col items-center gap-3">
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Interactive Showcase</h2>
            <p className="text-xs sm:text-sm text-neutral-400">Click the workflow tabs below to preview Luminote's intelligence in action.</p>
          </div>

          {/* Interactive Navigation Tabs */}
          <div className="grid grid-cols-3 gap-2 p-1.5 bg-[#121214]/65 border border-white/[0.06] rounded-xl max-w-xl w-full mx-auto backdrop-blur-md">
            <button
              onClick={() => handleTabClick("capture")}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-300 ${
                activeTab === "capture"
                  ? "bg-[#27272a]/70 text-white border border-white/[0.04] shadow-md"
                  : "text-neutral-400 hover:text-neutral-200 hover:bg-[#27272a]/20"
              }`}
            >
              <Notebook className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">1. Capture</span>
              <span className="sm:hidden">Capture</span>
            </button>
            <button
              onClick={() => handleTabClick("summarize")}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-300 ${
                activeTab === "summarize"
                  ? "bg-[#27272a]/70 text-white border border-white/[0.04] shadow-md"
                  : "text-neutral-400 hover:text-neutral-200 hover:bg-[#27272a]/20"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">2. Summarize</span>
              <span className="sm:hidden">Summarize</span>
            </button>
            <button
              onClick={() => handleTabClick("ask")}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-300 ${
                activeTab === "ask"
                  ? "bg-[#27272a]/70 text-white border border-white/[0.04] shadow-md"
                  : "text-neutral-400 hover:text-neutral-200 hover:bg-[#27272a]/20"
              }`}
            >
              <Bot className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">3. Ask AI</span>
              <span className="sm:hidden">Ask AI</span>
            </button>
          </div>

          {/* Browser Mockup Window */}
          <div className="w-full rounded-xl border border-white/[0.08] bg-[#18181b]/40 backdrop-blur-xl shadow-2xl overflow-hidden aspect-[16/10.5] sm:aspect-[16/9.5] flex flex-col transition-all duration-500 hover:border-brand-500/25 hover:shadow-brand-500/5">
            {/* Title Bar */}
            <div className="h-11 border-b border-white/[0.06] bg-[#121214] px-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-[#ef4444]/80" />
                <div className="w-3 h-3 rounded-full bg-[#eab308]/80" />
                <div className="w-3 h-3 rounded-full bg-[#22c55e]/80" />
              </div>
              <div className="flex items-center gap-2 px-3 py-1 bg-[#1c1c1f] border border-white/[0.04] rounded-md text-[10px] sm:text-xs text-neutral-400 font-mono w-40 sm:w-60 justify-center">
                <Shield className="w-3 h-3 text-emerald-500 shrink-0" />
                <span className="truncate">luminote.app/notes/launch</span>
              </div>
              <div className="w-14" />
            </div>

            {/* Main Application Area */}
            <div className="flex-1 flex overflow-hidden min-h-0">
              {/* App Sidebar Mockup */}
              <div className="w-12 sm:w-16 border-r border-white/[0.06] bg-[#121214]/50 flex flex-col items-center py-4 gap-4 shrink-0">
                <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-500 mb-2">
                  <Notebook className="w-4 h-4 fill-brand-500/20" />
                </div>
                <div className="w-8 h-8 rounded-lg bg-[#27272a]/50 border border-white/[0.04] flex items-center justify-center text-brand-400 shadow-inner">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="w-8 h-8 rounded-lg hover:bg-[#27272a]/20 flex items-center justify-center text-neutral-500 hover:text-neutral-300 transition-colors">
                  <Search className="w-4 h-4" />
                </div>
                <div className="w-8 h-8 rounded-lg hover:bg-[#27272a]/20 flex items-center justify-center text-neutral-500 hover:text-neutral-300 transition-colors">
                  <Bell className="w-4 h-4" />
                </div>
              </div>

              {/* Editor Workspace Panel */}
              <div className="flex-1 flex overflow-hidden relative min-h-0 bg-[#09090b]/10">
                {/* Editor Content */}
                <div className="flex-1 flex flex-col p-4 sm:p-6 overflow-y-auto text-left min-w-0 transition-all duration-300">
                  <div className="space-y-1 mb-4 shrink-0">
                    <div className="text-[9px] sm:text-[10px] font-bold text-brand-400 uppercase tracking-widest">Workspace Note</div>
                    <h2 className="text-base sm:text-xl font-bold text-white leading-tight">🚀 Product Launch Roadmap</h2>
                    <div className="flex gap-2 pt-0.5">
                      <span className="px-2 py-0.5 rounded bg-[#27272a]/80 border border-white/[0.04] text-[9px] sm:text-[10px] text-neutral-400 font-semibold uppercase tracking-wider">#launch</span>
                      <span className="px-2 py-0.5 rounded bg-[#27272a]/80 border border-white/[0.04] text-[9px] sm:text-[10px] text-neutral-400 font-semibold uppercase tracking-wider">#marketing</span>
                    </div>
                  </div>

                  {/* Body Content */}
                  <div className="space-y-4 text-xs sm:text-sm text-neutral-300 leading-relaxed font-sans pr-1 overflow-y-auto">
                    <p>
                      Our goal is to deploy the new AI note-taking app by next Friday. The release includes the semantic search engine, layout editor, and audio transcription services.
                    </p>

                    {/* Pending Action Items Section */}
                    <div className="space-y-2 bg-[#18181b]/50 border border-white/[0.04] p-3 rounded-lg backdrop-blur-md">
                      <div className="font-bold text-white text-[10px] sm:text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-brand-400" />
                        <span>Pending Action Items</span>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-neutral-400">
                          <CheckCircle2 className="w-3.5 h-3.5 text-brand-500 shrink-0 fill-brand-500/10" />
                          <span className="line-through text-neutral-500 text-[11px] sm:text-[13px]">Coordinate launch dates with stakeholders</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3.5 h-3.5 rounded-full border border-white/20 hover:border-brand-500/40 shrink-0 transition-colors" />
                          <span className="text-[11px] sm:text-[13px]">Finalize design assets for Product Hunt launch page</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3.5 h-3.5 rounded-full border border-white/20 hover:border-brand-500/40 shrink-0 transition-colors" />
                          <span className="text-[11px] sm:text-[13px]">Deploy staging build and run performance audits</span>
                        </div>
                      </div>
                    </div>

                    {/* Multimodal Rich Media Attachments (Visible in Capture Mode) */}
                    <div className="grid grid-cols-2 gap-3 mt-2 shrink-0">
                      {/* Audio Attachment */}
                      <div className="border border-white/[0.04] bg-[#18181b]/30 p-2.5 rounded-lg flex items-center gap-3">
                        <div className="w-7 h-7 rounded bg-brand-500/15 border border-brand-500/20 flex items-center justify-center text-brand-400 shrink-0">
                          <Mic className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-bold text-white truncate">Voice Memo #01</div>
                          {/* Animated Waveform */}
                          <div className="flex items-end gap-[2px] h-6 mt-1 overflow-hidden">
                            {waveformHeights.map((h, i) => (
                              <div
                                key={i}
                                className="flex-1 bg-brand-500 rounded-sm transition-all duration-150"
                                style={{ height: `${h}px` }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Sketch Attachment */}
                      <div className="border border-white/[0.04] bg-[#18181b]/30 p-2.5 rounded-lg flex flex-col justify-between">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-5 h-5 rounded bg-accent-violet/15 border border-accent-violet/20 flex items-center justify-center text-accent-violet shrink-0">
                            <Palette className="w-3 h-3" />
                          </div>
                          <span className="text-[10px] font-bold text-white truncate">PH Wireframe.png</span>
                        </div>
                        {/* Hand-drawn Mockup SVG */}
                        <div className="bg-[#09090b]/80 border border-white/[0.05] rounded p-1.5 h-10 flex items-center justify-center overflow-hidden">
                          <svg className="w-full h-full text-accent-violet opacity-65 stroke-current" viewBox="0 0 100 40" fill="none" strokeWidth="1.5">
                            <path d="M 5 5 L 95 5 L 95 35 L 5 35 Z" strokeDasharray="2 2" />
                            <path d="M 5 13 L 95 13" />
                            <path d="M 12 24 L 60 24" strokeWidth="1" />
                            <circle cx="80" cy="24" r="4" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* AI Copilot Side Panel (Visible in SUMMARIZE Mode) */}
                <div
                  className={`absolute top-0 right-0 bottom-0 w-60 sm:w-64 md:w-72 bg-[#121214]/95 border-l border-white/[0.06] p-4 flex flex-col gap-4 shadow-2xl transition-all duration-300 transform backdrop-blur-lg ${
                    activeTab === "summarize" ? "translate-x-0 opacity-100" : "translate-x-full opacity-0 pointer-events-none"
                  }`}
                >
                  <div className="flex items-center gap-2 border-b border-white/[0.04] pb-2 shrink-0">
                    <div className="w-6 h-6 rounded-md bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
                      <Sparkles className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-[10px] sm:text-xs font-bold text-white uppercase tracking-wider">AI Copilot Analysis</span>
                  </div>

                  <div className="flex-1 flex flex-col gap-4 text-left overflow-y-auto pr-0.5">
                    <div className="space-y-1.5">
                      <div className="text-[9px] sm:text-[10px] text-neutral-400 uppercase tracking-wide font-bold">Auto Summary</div>
                      <p className="text-[11px] sm:text-xs text-neutral-300 leading-relaxed bg-[#18181b]/50 p-2.5 rounded border border-white/[0.03]">
                        Plan to deploy AI workspace next Friday. Core features are semantic search, layout edits, and transcription. Focus is currently on finalizing Product Hunt assets and staging deployment.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <div className="text-[9px] sm:text-[10px] text-neutral-400 uppercase tracking-wide font-bold">Generated Tags</div>
                      <div className="flex flex-wrap gap-1.5">
                        <span className="px-2 py-0.5 rounded bg-brand-500/10 border border-brand-500/20 text-[9px] sm:text-[10px] font-semibold text-brand-400">#product-launch</span>
                        <span className="px-2 py-0.5 rounded bg-accent-violet/10 border border-accent-violet/20 text-[9px] sm:text-[10px] font-semibold text-accent-violet">#roadmap</span>
                        <span className="px-2 py-0.5 rounded bg-[#27272a]/70 text-[9px] sm:text-[10px] text-neutral-300">#task-list</span>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="text-[9px] sm:text-[10px] text-neutral-400 uppercase tracking-wide font-bold">Extracted Reminders</div>
                      <div className="flex items-center gap-2 text-[11px] sm:text-xs text-neutral-300 bg-[#1c1c1f]/40 p-2 rounded border border-white/[0.02]">
                        <Bell className="w-3.5 h-3.5 text-brand-400 shrink-0 animate-bounce" style={{ animationDuration: "2s" }} />
                        <span>Notify: Next Friday (Release Date)</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* AI Assistant Chat Panel (Visible in ASK AI Mode) */}
                <div
                  className={`absolute top-0 right-0 bottom-0 w-60 sm:w-64 md:w-72 bg-[#121214]/95 border-l border-white/[0.06] p-4 flex flex-col shadow-2xl transition-all duration-300 transform backdrop-blur-lg ${
                    activeTab === "ask" ? "translate-x-0 opacity-100" : "translate-x-full opacity-0 pointer-events-none"
                  }`}
                >
                  {/* Chat Panel Header */}
                  <div className="flex items-center gap-2 border-b border-white/[0.04] pb-2 shrink-0">
                    <div className="w-6 h-6 rounded-md bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
                      <Bot className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-[10px] sm:text-xs font-bold text-white uppercase tracking-wider">Ask Note AI</span>
                  </div>

                  {/* Chat Content Messages */}
                  <div className="flex-1 flex flex-col gap-3 py-3 overflow-y-auto text-left text-[11px] sm:text-xs min-h-0 pr-0.5">
                    <div className="self-end max-w-[85%] bg-brand-600 text-white p-2.5 rounded-lg rounded-tr-none leading-normal">
                      What are the remaining tasks and deadlines?
                    </div>
                    <div className="self-start max-w-[85%] bg-[#1c1c1f]/80 border border-white/[0.04] text-neutral-200 p-2.5 rounded-lg rounded-tl-none leading-relaxed space-y-1.5">
                      <div className="font-bold text-white text-[10px] uppercase text-brand-400 tracking-wide">Assistant Response</div>
                      <p>Based on your note roadmap, here are your remaining tasks:</p>
                      <ul className="list-disc pl-4 space-y-1">
                        <li>Finalize design assets for Product Hunt.</li>
                        <li>Deploy staging build and run performance tests.</li>
                      </ul>
                      <div className="text-[10px] text-brand-300 font-bold bg-brand-500/10 border border-brand-500/20 px-2 py-0.5 rounded inline-block mt-1">
                        📅 Deadline: Next Friday
                      </div>
                    </div>
                  </div>

                  {/* Chat Panel Input */}
                  <div className="pt-2 border-t border-white/[0.04] shrink-0 flex gap-1.5">
                    <div className="flex-1 bg-[#1c1c1f] border border-white/[0.06] rounded-lg px-2.5 py-1.5 text-[10px] sm:text-xs text-neutral-400 text-left select-none cursor-text">
                      Ask follow-up question...
                    </div>
                    <button className="bg-brand-500 hover:bg-brand-600 text-white rounded-lg p-1.5 transition-colors shrink-0">
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Feature Grids */}
      <div className="bg-[#0c0c0e] border-t border-white/[0.04] py-20 relative z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col items-center gap-12 text-center">
          <div className="space-y-3">
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Powered by Modern Intelligence</h2>
            <p className="text-neutral-400 text-xs sm:text-sm max-w-xl mx-auto">
              Luminote integrates high-end AI algorithms and intuitive layout models to supercharge your thought processing.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 w-full text-left mt-4">
            {/* Card 1 */}
            <div className="glass p-6 flex flex-col gap-4 hover:border-brand-500/30 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-brand-500/5 group">
              <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 group-hover:scale-110 transition-transform">
                <Bot className="w-5 h-5 animate-pulse-slow" />
              </div>
              <h3 className="text-base font-bold text-white tracking-wide">AI Assistant</h3>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Chat with your workspace, summarize dense articles, identify key bullet action items, and generate tags instantly.
              </p>
            </div>

            {/* Card 2 */}
            <div className="glass p-6 flex flex-col gap-4 hover:border-brand-500/30 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-brand-500/5 group">
              <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 group-hover:scale-110 transition-transform">
                <Search className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white tracking-wide">Semantic Search</h3>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Find notes by concept, mood, or meaning instead of matching exact keyword strings. Powered by advanced high-dimensional embeddings.
              </p>
            </div>

            {/* Card 3 */}
            <div className="glass p-6 flex flex-col gap-4 hover:border-brand-500/30 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-brand-500/5 group">
              <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 group-hover:scale-110 transition-transform">
                <Mic className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white tracking-wide">Multimodal Formats</h3>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Capture thoughts in any format you prefer. Supports interactive checklists, drawing canvas sketches, and voice transcripts.
              </p>
            </div>

            {/* Card 4 */}
            <div className="glass p-6 flex flex-col gap-4 hover:border-brand-500/30 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-brand-500/5 group">
              <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 group-hover:scale-110 transition-transform">
                <Bell className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white tracking-wide">Smart Reminders</h3>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Extract calendar events, project deadlines, and follow-ups from your texts automatically to schedule push notification alerts.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Security & Workflow Section */}
      <div className="py-20 relative z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col lg:flex-row gap-12 items-center justify-between">
          <div className="space-y-4 max-w-xl text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-violet/10 border border-accent-violet/20 text-accent-violet text-xs font-semibold">
              <Shield className="w-3.5 h-3.5" />
              <span>Secure Knowledge Storage</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Your data is secured by design.</h2>
            <p className="text-neutral-400 text-xs sm:text-sm leading-relaxed">
              We encrypt your notes in transit and at rest. AI integrations use secure, compartmentalized sandboxes that never train models on your personal files.
            </p>
            <div className="space-y-3 pt-2">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                  <CheckCircle2 className="w-3 h-3" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Full Data Encryption</h4>
                  <p className="text-[11px] text-neutral-400">All notebook transactions are protected via AES-256 standard.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                  <CheckCircle2 className="w-3 h-3" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Zero Model Training Data leaks</h4>
                  <p className="text-[11px] text-neutral-400">Your query history remains completely private to your account.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Steps Visualizer */}
          <div className="w-full lg:max-w-md bg-[#121214]/60 border border-white/[0.06] p-6 rounded-2xl flex flex-col gap-4 text-left shadow-xl backdrop-blur-md">
            <h3 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
              <Workflow className="w-4 h-4 text-brand-400" />
              <span>How It Works</span>
            </h3>
            <div className="relative border-l border-white/[0.06] ml-2.5 pl-5 space-y-6">
              {/* Step 1 */}
              <div className="relative group">
                <div className="absolute -left-[27px] top-0.5 w-3.5 h-3.5 rounded-full bg-brand-500 border border-[#09090b] flex items-center justify-center text-white" />
                <h4 className="text-xs font-bold text-white">1. Capture Anything</h4>
                <p className="text-[11px] text-neutral-400 leading-normal">Type text notes, record voice memos, check off workflows, or draw diagram sketches.</p>
              </div>

              {/* Step 2 */}
              <div className="relative group">
                <div className="absolute -left-[27px] top-0.5 w-3.5 h-3.5 rounded-full bg-accent-violet border border-[#09090b] flex items-center justify-center text-white" />
                <h4 className="text-xs font-bold text-white">2. Auto enrichment</h4>
                <p className="text-[11px] text-neutral-400 leading-normal">Our backend identifies deadlines, processes summaries, and links vector semantic tags.</p>
              </div>

              {/* Step 3 */}
              <div className="relative group">
                <div className="absolute -left-[27px] top-0.5 w-3.5 h-3.5 rounded-full bg-accent-cyan border border-[#09090b] flex items-center justify-center text-white" />
                <h4 className="text-xs font-bold text-white">3. Prompt & Ask</h4>
                <p className="text-[11px] text-neutral-400 leading-normal">Chat with single notes or search your entire personal repository in natural language.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Call to Action Section */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 w-full flex justify-center relative z-10">
        <div className="w-full max-w-4xl glass p-8 sm:p-14 rounded-2xl relative overflow-hidden text-center group bg-gradient-to-br from-[#18181b]/60 to-[#09090b]/60 border border-white/[0.08] shadow-2xl">
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-brand-500 via-pink-400 to-accent-violet" />
          <div className="absolute -top-24 -left-24 w-48 h-48 rounded-full bg-brand-500/10 blur-[80px]" />
          <div className="absolute -bottom-24 -right-24 w-48 h-48 rounded-full bg-accent-violet/10 blur-[80px]" />

          <div className="relative z-10 space-y-6 max-w-2xl mx-auto">
            <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">Ready to enrich your knowledge?</h2>
            <p className="text-neutral-400 text-xs sm:text-sm leading-relaxed max-w-lg mx-auto">
              Join developers, researchers, and creators using Luminote to organize ideas, search semantically, and collaborate with AI.
            </p>
            <div className="pt-4 flex flex-col sm:flex-row gap-4 justify-center w-full sm:w-auto">
              <Link
                href="/register"
                className="btn-primary px-8 py-3.5 rounded-lg flex items-center justify-center gap-2 group text-sm sm:text-base"
              >
                Create Free Account
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                href="/login"
                className="btn-secondary px-8 py-3.5 rounded-lg text-sm sm:text-base"
              >
                Sign In to Account
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-auto border-t border-white/[0.04] bg-[#0c0c0e] relative z-10 shrink-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-neutral-500">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-500">
              <Notebook className="w-3.5 h-3.5 fill-brand-500/20" />
            </div>
            <span className="font-bold text-neutral-300">Luminote</span>
          </div>
          <div>© {new Date().getFullYear()} Luminote Inc. All rights reserved.</div>
          <div className="flex gap-4">
            <Link href="/help" className="hover:text-neutral-300 transition-colors">Help</Link>
            <Link href="/login" className="hover:text-neutral-300 transition-colors">Terms</Link>
            <Link href="/register" className="hover:text-neutral-300 transition-colors">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
