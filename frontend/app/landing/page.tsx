"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";

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
  Pencil,

  Zap,
  Globe,
  Layers,
  Lock,
  Play
} from "lucide-react";
import SparkleMountainBackground from "@/components/SparkleMountainBackground";

// Intersection Observer Hook for scroll reveal
function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [hasRevealed, setHasRevealed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Safety fallback: force reveal elements after 2 seconds if the observer hasn't triggered
    const timer = setTimeout(() => {
      setHasRevealed(true);
    }, 2000);

    if (!("IntersectionObserver" in window)) {
      setHasRevealed(true);
      clearTimeout(timer);
      return;
    }

    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasRevealed(true);
          clearTimeout(timer);
          observer.unobserve(el);
        }
      },
      { threshold: 0, rootMargin: "0px 0px -20px 0px" }
    );

    observer.observe(el);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  return [ref, hasRevealed] as const;
}

// 3D Physics Mouse-Tilt wrapper for browser mockup
function TiltMockup({ children }: { children: React.ReactNode }) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    // Position of cursor relative to center of mockup
    const x = e.clientX - rect.left - width / 2;
    const y = e.clientY - rect.top - height / 2;

    // Max 10 degrees of tilt
    const tiltX = -(y / height) * 10;
    const tiltY = (x / width) * 10;

    setTilt({ x: tiltX, y: tiltY });
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setTilt({ x: 0, y: 0 });
      }}
      style={{
        transform: isHovered
          ? `perspective(2000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(1.015)`
          : "perspective(2000px) rotateX(0deg) rotateY(0deg) scale(1)",
        transition: isHovered ? "none" : "transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)",
        transformStyle: "preserve-3d",
      }}
      className="w-full h-full"
    >
      {children}
    </div>
  );
}

// Spotlight Card component that tracks mouse position for an elegant radial glow effect
function SpotlightCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setCoords({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0c0c0e]/80 backdrop-blur-md p-6 transition-all duration-300 hover:border-brand-500/20 hover:-translate-y-1 hover:shadow-2xl ${className}`}
    >
      <div
        className="pointer-events-none absolute -inset-px transition-opacity duration-300"
        style={{
          opacity: isHovered ? 1 : 0,
          background: `radial-gradient(400px circle at ${coords.x}px ${coords.y}px, rgba(139, 92, 246, 0.05), transparent 80%)`,
        }}
      />
      <div
        className="pointer-events-none absolute -inset-px transition-opacity duration-300"
        style={{
          opacity: isHovered ? 1 : 0,
          background: `radial-gradient(120px circle at ${coords.x}px ${coords.y}px, rgba(139, 92, 246, 0.15), transparent 80%)`,
          border: '1px solid transparent',
          WebkitMaskImage: `radial-gradient(120px circle at ${coords.x}px ${coords.y}px, black, transparent)`,
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

// Bidirectional scroll-reveal: pops up when entering viewport, fades out when leaving
function FadeUp({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible
          ? "translateY(0px) scale(1)"
          : "translateY(30px) scale(0.97)",
        transition: `opacity 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

export default function LandingPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<"capture" | "summarize" | "ask">("capture");
  const [waveformHeights, setWaveformHeights] = useState([8, 16, 24, 12, 18, 14, 22, 10, 16, 20]);
  const autoRotateRef = useRef<NodeJS.Timeout | null>(null);
  const userInteracted = useRef(false);

  // AI Typewriter simulation states
  const [typedSummary, setTypedSummary] = useState("");
  const [typedChat, setTypedChat] = useState("");

  const fullSummary = "Plan to deploy AI notes next Friday. Core features are semantic search, layout edits, and transcription. Focus is currently on finalizing Product Hunt assets and staging deployment.";
  const fullChat = "Based on your note roadmap, here are your remaining tasks:\n• Finalize design assets for Product Hunt.\n• Deploy staging build and run performance tests.";

  // Scroll reveals handled by <FadeUp> component

  const { isSignedIn, isLoaded } = useAuth();

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) {
      router.replace("/dashboard");
    } else {
      setMounted(true);
    }
  }, [isLoaded, isSignedIn, router]);

  // Audio wave visualizer animation for capture mode
  const getSecureRandom = () => {
    if (typeof window !== "undefined" && window.crypto) {
      const array = new Uint32Array(1);
      window.crypto.getRandomValues(array);
      return array[0] / 4294967296;
    }
    return 0.5;
  };

  useEffect(() => {
    if (!mounted || activeTab !== "capture") return;
    const interval = setInterval(() => {
      setWaveformHeights((prev) => prev.map(() => Math.floor(getSecureRandom() * 24) + 6));
    }, 150);
    return () => clearInterval(interval);
  }, [mounted, activeTab]);

  // AI Typing simulation effect
  useEffect(() => {
    if (activeTab === "summarize") {
      setTypedSummary("");
      let i = 0;
      const interval = setInterval(() => {
        setTypedSummary(fullSummary.slice(0, i));
        i += 3;
        if (i >= fullSummary.length) {
          setTypedSummary(fullSummary);
          clearInterval(interval);
        }
      }, 25);
      return () => clearInterval(interval);
    } else if (activeTab === "ask") {
      setTypedChat("");
      let i = 0;
      const interval = setInterval(() => {
        setTypedChat(fullChat.slice(0, i));
        i += 3;
        if (i >= fullChat.length) {
          setTypedChat(fullChat);
          clearInterval(interval);
        }
      }, 25);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

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
      <div className="min-h-screen flex items-center justify-center bg-[#030303]">
        <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#030303] text-zinc-300 relative flex flex-col font-sans">

      {/* Parallax animated pixel sparkle mountain background */}
      <SparkleMountainBackground />

      {/* Hero Header Section */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-24 pb-16 relative z-10 animate-fade-in min-h-[calc(100vh-80px)] flex flex-col justify-center">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center w-full">

          {/* Left Column: Headline and CTAs */}
          <div className="lg:col-span-5 flex flex-col items-start text-left gap-6 animate-slide-up">

            {/* Live Announcement Badge */}
            <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.06] text-neutral-300 text-xs font-semibold hover:border-brand-500/40 hover:bg-brand-500/5 transition-all duration-300 group cursor-pointer shadow-[0_0_15px_rgba(255,255,255,0.02)]">
              <span className="flex h-1.5 w-1.5 rounded-full bg-brand-400 relative shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-brand-400"></span>
              </span>
              <span>Introducing the personal Notes</span>
              <ArrowRight className="w-3 h-3 text-neutral-500 group-hover:text-brand-400 group-hover:translate-x-0.5 transition-all" />
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.08] text-wrap-balance">
              Notes that <br />
              <span className="text-white">connect themselves...</span>
            </h1>

            {/* Subtitle */}
            <p className="text-zinc-400 text-sm sm:text-base leading-relaxed text-wrap-pretty">
              Ditch the folders. Just write. Luminote automatically summarizes, structures, and connects your thoughts for you.
            </p>

            {/* Features checkmarks list */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-brand-400 shrink-0" />
                <span className="text-xs sm:text-sm text-neutral-300 font-semibold">Find notes by meaning, even if you forgot the words</span>
              </div>
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-brand-400 shrink-0" />
                <span className="text-xs sm:text-sm text-neutral-300 font-semibold">Speak your mind, This will clean up the transcripts</span>
              </div>
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-brand-400 shrink-0" />
                <span className="text-xs sm:text-sm text-neutral-300 font-semibold">Isolated database architecture for 100% privacy</span>
              </div>
            </div>

            {/* Hero CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 mt-4 w-full sm:w-auto">
              <Link
                href="/register"
                id="landing-cta-register"
                className="px-8 py-3.5 rounded-xl bg-white text-black hover:bg-neutral-200 font-bold flex items-center justify-center gap-2 group text-sm sm:text-base shadow-lg hover:-translate-y-1 hover:scale-102 hover:shadow-[0_0_25px_rgba(139,92,246,0.35)] btn-smooth-hover text-center"
              >
                Get Started Free
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                href="/login"
                id="landing-cta-login"
                className="px-8 py-3.5 rounded-xl border border-white/[0.08] hover:border-brand-500/40 hover:bg-white/[0.02] text-neutral-300 hover:text-white font-bold text-sm sm:text-base hover:-translate-y-1 hover:scale-102 hover:shadow-[0_0_15px_rgba(139,92,246,0.15)] btn-smooth-hover flex items-center justify-center text-center"
              >
                Sign In
              </Link>
            </div>
          </div>

          {/* Right Column: Showcase Tabs + 3D Mockup */}
          <div id="showcase" className="lg:col-span-7 w-full flex flex-col gap-5 scroll-mt-24">

            {/* Interactive Navigation Tabs */}
            <div className="flex justify-center w-full mb-1">
              <div className="inline-flex gap-1 p-1 bg-[#0c0c0f]/60 border border-white/[0.06] rounded-full backdrop-blur-xl shadow-xl">
                <button
                  onClick={() => handleTabClick("capture")}
                  className={`flex items-center justify-center gap-2 px-5 py-2 rounded-full text-xs font-bold transition-all duration-300 ${activeTab === "capture"
                    ? "bg-white text-black shadow-[0_4px_12px_rgba(255,255,255,0.15)]"
                    : "text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.04]"
                    }`}
                >
                  <Notebook className="w-3.5 h-3.5 shrink-0" />
                  <span>1. Capture</span>
                </button>
                <button
                  onClick={() => handleTabClick("summarize")}
                  className={`flex items-center justify-center gap-2 px-5 py-2 rounded-full text-xs font-bold transition-all duration-300 ${activeTab === "summarize"
                    ? "bg-white text-black shadow-[0_4px_12px_rgba(255,255,255,0.15)]"
                    : "text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.04]"
                    }`}
                >
                  <Pencil className="w-3.5 h-3.5 shrink-0" />
                  <span>2. Summarize</span>
                </button>
                <button
                  onClick={() => handleTabClick("ask")}
                  className={`flex items-center justify-center gap-2 px-5 py-2 rounded-full text-xs font-bold transition-all duration-300 ${activeTab === "ask"
                    ? "bg-white text-black shadow-[0_4px_12px_rgba(255,255,255,0.15)]"
                    : "text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.04]"
                    }`}
                >
                  <Bot className="w-3.5 h-3.5 shrink-0" />
                  <span>3. Ask AI</span>
                </button>
              </div>
            </div>

            {/* 3D Tilted Browser Mockup Window */}
            <div className="relative w-full">

              {/* Subtle ambient backglow */}
              <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-[90%] h-[60%] rounded-full bg-brand-500/[0.04] blur-[100px] pointer-events-none -z-10 animate-pulse-slow" style={{ animationDuration: '8s' }} />

              <TiltMockup>
                <div className="w-full rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#0e0e12]/90 to-[#07070a]/90 backdrop-blur-xl shadow-[0_30px_60px_-15px_rgba(0,0,0,0.9),0_0_50px_rgba(139,92,246,0.03)] overflow-hidden aspect-[16/10.5] sm:aspect-[16/9.5] flex flex-col transition-all duration-500 hover:border-white/[0.16] hover:shadow-[0_40px_80px_-15px_rgba(0,0,0,0.95),0_0_60px_rgba(139,92,246,0.08)] animate-book-open">
                  {/* Title Bar */}
                  <div className="h-11 border-b border-white/[0.06] bg-[#08080b]/80 px-4 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-white/[0.12]" />
                      <div className="w-2.5 h-2.5 rounded-full bg-white/[0.12]" />
                      <div className="w-2.5 h-2.5 rounded-full bg-white/[0.12]" />
                    </div>
                    <div className="flex items-center gap-2 px-4 py-1 bg-black/45 border border-white/[0.05] rounded-full text-[10px] sm:text-xs text-neutral-400 font-mono w-44 sm:w-64 justify-center">
                      <Shield className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                      <span className="truncate tracking-wide text-neutral-400">luminote.app/notes/roadmap</span>
                    </div>
                    <div className="w-14" />
                  </div>

                  {/* Main Application Area */}
                  <div className="flex-1 flex overflow-hidden min-h-0 relative">
                    {/* Spine Crease to make it look like a physical notebook cover folding */}
                    <div className="absolute top-0 bottom-0 left-[60px] sm:left-[80px] w-[6px] shadow-inner bg-gradient-to-r from-black/35 via-white/[0.03] to-black/35 z-20 pointer-events-none" />

                    {/* App Sidebar Mockup */}
                    <div className="w-12 sm:w-16 border-r border-white/[0.06] bg-[#07070a]/40 flex flex-col items-center py-4 gap-4 shrink-0 z-10">
                      <div className="w-8 h-8 rounded-xl bg-white/[0.03] border border-white/[0.06] text-neutral-400 flex items-center justify-center shrink-0">
                        <Notebook className="w-4 h-4" />
                      </div>
                      <div className="w-8 h-8 rounded-xl bg-brand-600 border border-brand-400/30 flex items-center justify-center text-white shadow-[0_0_15px_rgba(139,92,246,0.35)] shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="w-8 h-8 rounded-xl hover:bg-white/[0.04] flex items-center justify-center text-neutral-500 hover:text-neutral-300 transition-colors shrink-0">
                        <Search className="w-4 h-4" />
                      </div>
                      <div className="w-8 h-8 rounded-xl hover:bg-white/[0.04] flex items-center justify-center text-neutral-500 hover:text-neutral-300 transition-colors shrink-0">
                        <Bell className="w-4 h-4" />
                      </div>
                    </div>

                    {/* Editor Workspace Panel */}
                    <div className="flex-1 flex overflow-hidden relative min-h-0 bg-[#09090b]/10 z-10">
                      {/* Editor Content */}
                      <div className="flex-1 flex flex-col p-4 sm:p-6 overflow-y-auto text-left min-w-0 transition-all duration-300">
                        <div className="space-y-1 mb-4 shrink-0">
                          <div className="text-[9px] sm:text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Workspace Note</div>
                          <h2 className="text-base sm:text-xl font-bold text-white leading-tight">🚀 Product Launch Roadmap</h2>
                          <div className="flex gap-2 pt-1" style={{ transform: "translateZ(20px)" }}>
                            <span className="px-2.5 py-0.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-[9px] sm:text-[10px] text-brand-300 font-bold uppercase tracking-wider">#launch</span>
                            <span className="px-2.5 py-0.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-[9px] sm:text-[10px] text-brand-300 font-bold uppercase tracking-wider">#marketing</span>
                          </div>
                        </div>

                        {/* Body Content */}
                        <div className="space-y-4 text-xs sm:text-[13px] text-neutral-300 leading-relaxed font-sans pr-1 overflow-y-auto">
                          <p>
                            The goal is to deploy Luminote on the next billionth Friday. The release includes the semantic search engine, layout editor, and audio transcription services. Stay Tuned fellas!
                          </p>

                          {/* Pending Action Items Section */}
                          <div className="space-y-2.5 bg-[#121217]/60 border border-white/[0.06] p-4 rounded-2xl backdrop-blur-md shadow-xl" style={{ transform: "translateZ(15px)" }}>
                            <div className="font-bold text-white text-[10px] sm:text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                              <FileText className="w-3.5 h-3.5 text-neutral-400" />
                              <span>Pending Action Items</span>
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center gap-2.5 text-neutral-400">
                                <CheckCircle2 className="w-4 h-4 text-brand-400 shrink-0" />
                                <span className="line-through text-neutral-500 text-[11px] sm:text-[13px]">Coordinate launch dates with stakeholders</span>
                              </div>
                              <div className="flex items-center gap-2.5">
                                <div className="w-4 h-4 rounded-full border border-white/20 hover:border-brand-500/40 hover:bg-brand-500/5 shrink-0 transition-all duration-200 cursor-pointer" />
                                <span className="text-[11px] sm:text-[13px]">Finalize design assets for Product Hunt launch page</span>
                              </div>
                              <div className="flex items-center gap-2.5">
                                <div className="w-4 h-4 rounded-full border border-white/20 hover:border-brand-500/40 hover:bg-brand-500/5 shrink-0 transition-all duration-200 cursor-pointer" />
                                <span className="text-[11px] sm:text-[13px]">Deploy staging build and run performance audits</span>
                              </div>
                            </div>
                          </div>

                          {/* Multimodal Rich Media Attachments */}
                          <div className="grid grid-cols-2 gap-3 mt-2 shrink-0">
                            {/* Audio Attachment */}
                            <div className="border border-white/[0.06] bg-[#121217]/40 p-3 rounded-2xl flex items-center gap-3" style={{ transform: "translateZ(25px)" }}>
                              <div className="w-8 h-8 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-400 flex items-center justify-center shrink-0 shadow-lg">
                                <Mic className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-[10px] font-bold text-white truncate">Voice Memo #01</div>
                                {/* Animated Waveform */}
                                <div className="flex items-end gap-[2px] h-6 mt-1 overflow-hidden">
                                  {waveformHeights.map((h, i) => (
                                    <div
                                      key={i}
                                      className="flex-1 bg-gradient-to-t from-brand-600 to-brand-400 rounded-sm transition-all duration-150"
                                      style={{ height: `${h}px` }}
                                    />
                                  ))}
                                </div>
                              </div>
                            </div>

                            {/* Sketch Attachment */}
                            <div className="border border-white/[0.06] bg-[#121217]/40 p-3 rounded-2xl flex flex-col justify-between" style={{ transform: "translateZ(25px)" }}>
                              <div className="flex items-center gap-2 mb-1.5">
                                <div className="w-6 h-6 rounded-lg bg-brand-500/10 border border-brand-500/20 text-brand-400 flex items-center justify-center shrink-0">
                                  <Palette className="w-3.5 h-3.5" />
                                </div>
                                <span className="text-[10px] font-bold text-white truncate">PH Wireframe.png</span>
                              </div>
                              {/* Hand-drawn Mockup SVG */}
                              <div className="bg-[#030303]/60 border border-white/[0.05] rounded-xl p-1.5 h-10 flex items-center justify-center overflow-hidden">
                                <svg className="w-full h-full text-brand-400/40 stroke-current" viewBox="0 0 100 40" fill="none" strokeWidth="1.5">
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

                      {/* AI Copilot Side Panel (Visible in SUMMARIZE Mode with Typing Effect) */}
                      <div
                        style={{ transform: "translateZ(40px)" }}
                        className={`absolute top-0 right-0 bottom-0 w-60 sm:w-64 md:w-72 bg-[#09090c]/95 border-l border-white/[0.06] p-4 flex flex-col gap-4 shadow-2xl transition-all duration-300 transform backdrop-blur-lg z-30 ${activeTab === "summarize" ? "translate-x-0 opacity-100 font-sans" : "translate-x-full opacity-0 pointer-events-none"
                          }`}
                      >
                        <div className="flex items-center gap-2 border-b border-white/[0.04] pb-2 shrink-0">
                          <div className="w-6 h-6 rounded-md bg-brand-500/10 border border-brand-500/20 text-brand-400 flex items-center justify-center">
                            <Pencil className="w-3.5 h-3.5" />
                          </div>
                          <span className="text-[10px] sm:text-xs font-bold text-white uppercase tracking-wider">AI Copilot Analysis</span>
                        </div>

                        <div className="flex-1 flex flex-col gap-4 text-left overflow-y-auto pr-0.5">
                          <div className="space-y-1.5">
                            <div className="text-[9px] sm:text-[10px] text-neutral-400 uppercase tracking-wide font-bold">Auto Summary</div>
                            <p className="text-[11px] sm:text-xs text-neutral-300 leading-relaxed bg-[#121217]/60 border border-white/[0.04] p-3 rounded-xl min-h-[90px] relative font-mono select-none">
                              {typedSummary}
                              <span className="w-1.5 h-3.5 bg-brand-400 inline-block animate-pulse ml-0.5 align-middle" />
                            </p>
                          </div>

                          <div className="space-y-1.5">
                            <div className="text-[9px] sm:text-[10px] text-neutral-400 uppercase tracking-wide font-bold">Generated Tags</div>
                            <div className="flex flex-wrap gap-1.5">
                              <span className="px-2.5 py-0.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-[9px] sm:text-[10px] font-bold text-brand-300">#product-launch</span>
                              <span className="px-2.5 py-0.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-[9px] sm:text-[10px] font-bold text-brand-300">#roadmap</span>
                              <span className="px-2.5 py-0.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-[9px] sm:text-[10px] text-brand-300 font-bold">#task-list</span>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <div className="text-[9px] sm:text-[10px] text-neutral-400 uppercase tracking-wide font-bold">Extracted Reminders</div>
                            <div className="flex items-center gap-2 text-[11px] sm:text-xs text-neutral-300 bg-[#121217]/60 p-3 rounded-xl border border-white/[0.04]">
                              <Bell className="w-3.5 h-3.5 text-brand-400 shrink-0" />
                              <span>Notify: Next Friday (Release Date)</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* AI Assistant Chat Panel (Visible in ASK AI Mode with Typing Effect) */}
                      <div
                        style={{ transform: "translateZ(40px)" }}
                        className={`absolute top-0 right-0 bottom-0 w-60 sm:w-64 md:w-72 bg-[#09090c]/95 border-l border-white/[0.06] p-4 flex flex-col shadow-2xl transition-all duration-300 transform backdrop-blur-lg z-30 ${activeTab === "ask" ? "translate-x-0 opacity-100" : "translate-x-full opacity-0 pointer-events-none"
                          }`}
                      >
                        {/* Chat Panel Header */}
                        <div className="flex items-center gap-2 border-b border-white/[0.04] pb-2 shrink-0">
                          <div className="w-6 h-6 rounded-md bg-brand-500/10 border border-brand-500/20 text-brand-400 flex items-center justify-center">
                            <Bot className="w-3.5 h-3.5" />
                          </div>
                          <span className="text-[10px] sm:text-xs font-bold text-white uppercase tracking-wider">Ask Note AI</span>
                        </div>

                        {/* Chat Content Messages */}
                        <div className="flex-1 flex flex-col gap-3 py-3 overflow-y-auto text-left text-[11px] sm:text-xs min-h-0 pr-0.5">
                          <div className="self-end max-w-[85%] bg-white text-black px-3.5 py-2.5 rounded-2xl rounded-tr-none leading-normal shadow-lg font-bold select-none">
                            What are the remaining tasks and deadlines?
                          </div>
                          <div className="self-start max-w-[85%] bg-[#121217]/60 border border-white/[0.06] text-neutral-200 p-3 rounded-2xl rounded-tl-none leading-relaxed space-y-1.5 shadow-lg">
                            <div className="font-bold text-brand-300 text-[10px] uppercase tracking-wide">Assistant Response</div>
                            <p className="whitespace-pre-line min-h-[90px] select-none font-mono">
                              {typedChat}
                              <span className="w-1.5 h-3.5 bg-brand-400 inline-block animate-pulse ml-0.5 align-middle" />
                            </p>
                            <div className="text-[10px] text-brand-400 font-bold bg-brand-500/10 border border-brand-500/20 px-2.5 py-0.5 rounded-full inline-block mt-1">
                              📅 Deadline: Next Friday
                            </div>
                          </div>
                        </div>

                        {/* Chat Panel Input */}
                        <div className="pt-2 border-t border-white/[0.04] shrink-0 flex gap-1.5">
                          <div className="flex-1 bg-[#121217]/60 border border-white/[0.06] rounded-xl px-3 py-2 text-[10px] sm:text-xs text-neutral-500 text-left select-none cursor-text">
                            Ask follow-up question...
                          </div>
                          <button className="bg-white hover:bg-neutral-200 text-black rounded-xl p-2 transition-colors shrink-0 shadow-[0_4px_12px_rgba(255,255,255,0.15)]">
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </TiltMockup>
            </div>
          </div>

        </div>
      </section>

      {/* Feature Bento Grid Section */}
      <section id="features" className="border-y border-white/[0.06] py-24 relative z-10 scroll-mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col items-center gap-14 text-center">
          <FadeUp className="space-y-3">
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-tight">
              Designed for cognitive clarity.
            </h2>
            <p className="text-zinc-400 text-xs sm:text-sm max-w-xl mx-auto leading-relaxed">
              A spatial canvas that understands your content. Conceptually index your notes, transcribe meetings in real time, and query your workspace securely.
            </p>
          </FadeUp>

          <div className="grid grid-cols-1 lg:grid-cols-6 gap-6 w-full text-left mt-4">

            {/* Bento Card 1: Semantic Search (Large - Col Span 4) */}
            <FadeUp className="lg:col-span-4">
              <SpotlightCard className="h-full flex flex-col justify-between">
                <div>
                  <div className="w-11 h-11 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-400 flex items-center justify-center shadow-md">
                    <Search className="w-5.5 h-5.5" />
                  </div>
                  <h3 className="text-lg font-bold text-white tracking-wide mt-4">Conceptual Search</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed mt-2 max-w-xl">
                    Find ideas by concept, mood, or meaning instead of matching exact keyword strings. Powered by advanced high-dimensional semantic embeddings.
                  </p>
                </div>

                {/* Visual Mockup: Search Node Map */}
                <div className="mt-6 bg-[#030303]/60 border border-white/[0.05] rounded-xl p-4 flex flex-col gap-3 font-sans">
                  {/* Mock Search Input */}
                  <div className="flex items-center gap-2 bg-[#0c0c0f] border border-white/[0.06] rounded-lg px-3 py-1.5 text-xs text-neutral-400">
                    <Search className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                    <span>Search: "PH product wireframes and layout drawings"</span>
                  </div>
                  {/* Results preview */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="bg-[#0c0c0f]/80 border border-white/[0.06] p-2.5 rounded-lg flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[11px] font-bold text-white truncate">🎨 PH Wireframe.png</div>
                        <div className="text-[9px] text-neutral-500 font-semibold tracking-wider uppercase mt-0.5">#design-assets</div>
                      </div>
                      <div className="shrink-0 flex items-center gap-1.5 bg-brand-500/10 border border-brand-500/20 px-2 py-0.5 rounded text-[10px] text-brand-300 font-bold font-mono">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-ping-glow shrink-0" />
                        <span>94% Match</span>
                      </div>
                    </div>
                    <div className="bg-[#0c0c0f]/80 border border-white/[0.06] p-2.5 rounded-lg flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[11px] font-bold text-white truncate">🚀 Launch Roadmap</div>
                        <div className="text-[9px] text-neutral-500 font-semibold tracking-wider uppercase mt-0.5">#product-hunt</div>
                      </div>
                      <div className="shrink-0 flex items-center gap-1.5 bg-brand-500/10 border border-brand-500/20 px-2 py-0.5 rounded text-[10px] text-brand-300 font-bold font-mono">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand-400 shrink-0" />
                        <span>86% Match</span>
                      </div>
                    </div>
                  </div>
                </div>
              </SpotlightCard>
            </FadeUp>

            {/* Bento Card 2: Voice Dictation (Small - Col Span 2) */}
            <FadeUp className="lg:col-span-2" delay={120}>
              <SpotlightCard className="h-full flex flex-col justify-between">
                <div>
                  <div className="w-11 h-11 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-400 flex items-center justify-center shadow-md">
                    <Mic className="w-5.5 h-5.5" />
                  </div>
                  <h3 className="text-lg font-bold text-white tracking-wide mt-4">Speak Freely</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed mt-2">
                    Dictate audio memos seamlessly. Luminote transcribes and indexes spoken thoughts into fully queryable text formats.
                  </p>
                </div>

                {/* Visual Mockup: Audio Recording Indicator */}
                <div className="mt-6 bg-[#030303]/60 border border-white/[0.05] rounded-xl p-4 flex flex-col gap-3 h-[106px] justify-between">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                      <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Dictation Active</span>
                    </div>
                    <span className="text-[10px] font-mono text-neutral-500 font-bold">01:24</span>
                  </div>
                  {/* Interactive Waveform */}
                  <div className="flex items-end gap-[3px] h-9 overflow-hidden">
                    {waveformHeights.map((h, i) => (
                      <div
                        key={i}
                        className="flex-1 bg-brand-500/40 rounded-sm transition-all duration-150"
                        style={{ height: `${h * 1.2}px` }}
                      />
                    ))}
                  </div>
                </div>
              </SpotlightCard>
            </FadeUp>

            {/* Bento Card 3: AI Copilot (Small - Col Span 2) */}
            <FadeUp className="lg:col-span-2" delay={120}>
              <SpotlightCard className="h-full flex flex-col justify-between">
                <div>
                  <div className="w-11 h-11 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-400 flex items-center justify-center shadow-md">
                    <Bot className="w-5.5 h-5.5" />
                  </div>
                  <h3 className="text-lg font-bold text-white tracking-wide mt-4">AI Copilot</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed mt-2">
                    Extract follow-up actions, draft structured summaries, and query note contexts inside safe private sandboxes.
                  </p>
                </div>

                {/* Visual Mockup: AI Action Summary bubble */}
                <div className="mt-6 bg-[#030303]/60 border border-white/[0.05] rounded-xl p-4 flex flex-col gap-2.5 text-[11px] h-[106px] overflow-hidden text-neutral-300">
                  <div className="flex items-center gap-1.5 text-brand-300 font-bold uppercase tracking-wider text-[9px]">
                    <Sparkles className="w-3.5 h-3.5 text-brand-400" />
                    <span>Extracted Insights</span>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 rounded-full bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-[8px] text-brand-400 font-bold shrink-0">✓</div>
                      <span className="truncate">PH design asset wireframe deadline: Friday</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 rounded-full bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-[8px] text-brand-400 font-bold shrink-0">✓</div>
                      <span className="truncate">Linked references: product-roadmap</span>
                    </div>
                  </div>
                </div>
              </SpotlightCard>
            </FadeUp>

            {/* Bento Card 4: Multimodal Formats (Large - Col Span 4) */}
            <FadeUp className="lg:col-span-4">
              <SpotlightCard className="h-full flex flex-col justify-between">
                <div>
                  <div className="w-11 h-11 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-400 flex items-center justify-center shadow-md">
                    <Notebook className="w-5.5 h-5.5" />
                  </div>
                  <h3 className="text-lg font-bold text-white tracking-wide mt-4">Multimodal Canvas</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed mt-2 max-w-xl">
                    Organize raw ideas with multiple structural tools. Create real-time task lists, embed drawing boards, and build document networks.
                  </p>
                </div>

                {/* Visual Mockup: Split Checklist and Canvas */}
                <div className="mt-6 bg-[#030303]/60 border border-white/[0.05] rounded-xl p-4 grid grid-cols-2 gap-4 h-[106px]">
                  {/* Left Side: Checklist */}
                  <div className="flex flex-col justify-center gap-2 border-r border-white/[0.04] pr-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-brand-400 shrink-0" />
                      <span className="text-[10px] text-neutral-500 line-through truncate font-medium">Finalize PH wireframe sketch</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 rounded border border-white/20 shrink-0" />
                      <span className="text-[10px] text-neutral-300 truncate font-semibold">Deploy staging build audits</span>
                    </div>
                  </div>

                  {/* Right Side: Sketch Mockup */}
                  <div className="flex items-center justify-center bg-[#0c0c0f]/80 border border-white/[0.06] rounded-lg p-2 overflow-hidden h-full">
                    <svg className="w-full h-full text-neutral-600 opacity-60 stroke-current" viewBox="0 0 100 40" fill="none" strokeWidth="1.5">
                      <path d="M 5 5 L 95 5 L 95 35 L 5 35 Z" strokeDasharray="2 2" />
                      <path d="M 5 13 L 95 13" />
                      <path d="M 12 24 L 60 24" strokeWidth="1" />
                      <circle cx="80" cy="24" r="4" className="text-brand-500/50" fill="currentColor" />
                    </svg>
                  </div>
                </div>
              </SpotlightCard>
            </FadeUp>
          </div>
        </div>
      </section>

      {/* Security & Workflow Section */}
      <section id="security" className="py-24 relative z-10 scroll-mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col lg:flex-row gap-12 items-center justify-between">
          <FadeUp className="space-y-5 max-w-xl text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-300 text-xs font-semibold">
              <Shield className="w-3.5 h-3.5" />
              <span>Secure Knowledge Storage</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">Your data is secured by design.</h2>
            <p className="text-zinc-400 text-xs sm:text-sm leading-relaxed">
              We encrypt your notes in transit and at rest. AI integrations use secure, compartmentalized sandboxes that never train models on your personal files.
            </p>
            <div className="space-y-4 pt-2">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 shrink-0 mt-0.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-white">Full Data Encryption</h4>
                  <p className="text-[11px] sm:text-xs text-zinc-500 mt-0.5">All notebook transactions are protected via AES-256 standard.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 shrink-0 mt-0.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-white">Zero Model Training Leaks</h4>
                  <p className="text-[11px] sm:text-xs text-zinc-500 mt-0.5">Your query history remains completely private to your account.</p>
                </div>
              </div>
            </div>
          </FadeUp>

          {/* Steps Visualizer */}
          <FadeUp delay={150} className="w-full lg:max-w-md">
            <div className="bg-[#0c0c0e]/80 border border-white/[0.08] p-6 sm:p-8 rounded-2xl flex flex-col gap-6 text-left shadow-2xl backdrop-blur-md relative overflow-hidden group">
              <h3 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
                <Workflow className="w-4.5 h-4.5 text-neutral-400" />
                <span>How It Works</span>
              </h3>
              <div className="relative border-l border-white/[0.08] ml-2.5 pl-6 space-y-6">
                {/* Step 1 */}
                <div className="relative group/step">
                  <div className="absolute -left-[31px] top-0.5 w-4.5 h-4.5 rounded-full bg-brand-500/10 border border-brand-500/30 flex items-center justify-center text-[10px] font-bold text-brand-300">1</div>
                  <h4 className="text-xs sm:text-sm font-bold text-white">Dump your thoughts</h4>
                  <p className="text-[11px] sm:text-xs text-zinc-400 leading-relaxed mt-1">Quick text, voice memos, workflows, or sketches. Drop it in raw without worrying about formatting or folders.</p>
                </div>

                {/* Step 2 */}
                <div className="relative group/step">
                  <div className="absolute -left-[31px] top-0.5 w-4.5 h-4.5 rounded-full bg-brand-500/10 border border-brand-500/30 flex items-center justify-center text-[10px] font-bold text-brand-300">2</div>
                  <h4 className="text-xs sm:text-sm font-bold text-white">Let the magic happen</h4>
                  <p className="text-[11px] sm:text-xs text-zinc-400 leading-relaxed mt-1">We automatically extract tasks/deadlines, generate concise summaries, and link related thoughts together.</p>
                </div>

                {/* Step 3 */}
                <div className="relative group/step">
                  <div className="absolute -left-[31px] top-0.5 w-4.5 h-4.5 rounded-full bg-brand-500/10 border border-brand-500/30 flex items-center justify-center text-[10px] font-bold text-brand-300">3</div>
                  <h4 className="text-xs sm:text-sm font-bold text-white">Ask your second brain</h4>
                  <p className="text-[11px] sm:text-xs text-zinc-400 leading-relaxed mt-1">Ask questions, search by concepts, or query your entire personal database in plain English.</p>
                </div>
              </div>
            </div>
          </FadeUp>
        </div>
      </section>


    </div>
  );
}
