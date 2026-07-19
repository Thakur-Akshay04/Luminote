"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authApi } from "@/lib/api";
import { setAuth } from "@/lib/auth";
import { Notebook, Mail, Lock, Loader2, AlertCircle, ArrowLeft, Eye, EyeOff } from "lucide-react";
import SparkleMountainBackground from "@/components/SparkleMountainBackground";
import InteractiveThoughtMap from "@/components/InteractiveThoughtMap";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await authApi.login(email, password);
      setAuth(res.data.access_token, {
        user_id: res.data.user_id,
        email: res.data.email,
        name: res.data.name,
        avatar_url: res.data.avatar_url,
        display_name: res.data.display_name,
      });
      router.push("/notes");
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Login failed. Please check your credentials.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#030303] text-zinc-300 relative flex overflow-hidden font-sans">
      {/* Animated pixel sparkle mountain background */}
      <SparkleMountainBackground />

      {/* Interactive Thought Node Graph Map (Full Bleed Background) */}
      <div className="absolute inset-0 w-full h-full z-0">
        <InteractiveThoughtMap />
      </div>

      {/* Go Back button */}
      <Link
        href="/landing"
        className="absolute top-6 left-6 z-30 flex items-center gap-2 text-xs font-semibold text-neutral-400 hover:text-white border border-white/[0.08] hover:border-white/20 bg-[#0c0c0e]/60 hover:bg-[#0c0c0e] px-3.5 py-2 rounded-full backdrop-blur-md transition-all duration-300 group shadow-lg"
      >
        <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
        Go Back
      </Link>

      {/* Left Column Showcase Overlay (Hidden on Mobile) */}
      <div className="hidden lg:flex lg:w-1/2 min-h-screen relative z-10 flex-col justify-between p-12 pointer-events-none">
        {/* Floating Top-Left Header */}
        <div className="max-w-sm mt-6 space-y-5 pointer-events-auto select-none">
          {/* Badge */}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#0c0c0e]/80 border border-white/[0.08] backdrop-blur-md">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
            <span className="text-[9px] uppercase tracking-wider font-extrabold text-neutral-400">Luminote Workspace</span>
          </div>

          {/* Heading */}
          <div className="space-y-1">
            <h1 className="text-4xl font-extrabold text-white tracking-tight leading-none">
              Create your <span className="bg-gradient-to-r from-amber-200 via-orange-400 to-pink-500 bg-clip-text text-transparent bg-[length:200%_auto] bg-left hover:bg-right transition-all duration-700 cursor-pointer pointer-events-auto">workspace.</span>
            </h1>
          </div>

          {/* Features Checklist */}
          <div className="space-y-2.5 pt-3 border-t border-white/[0.04] max-w-[280px]">
            <div className="flex items-center gap-2.5 text-[11px] text-neutral-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.6)]" />
              <span>Real-time voice recordings</span>
            </div>
            <div className="flex items-center gap-2.5 text-[11px] text-neutral-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-pink-400 shadow-[0_0_8px_rgba(219,39,119,0.6)]" />
              <span>Freehand canvas sketchpad</span>
            </div>
            <div className="flex items-center gap-2.5 text-[11px] text-neutral-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
              <span>Sprint checklists & schedules</span>
            </div>
            <div className="flex items-center gap-2.5 text-[11px] text-neutral-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-400 shadow-[0_0_8px_rgba(217,70,239,0.6)]" />
              <span>Interactive AI Agents</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column - Auth Form Card */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-4 relative z-10 min-h-screen">
        {/* Glow block behind form */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-brand-500/5 blur-[100px] pointer-events-none" />

        <div className="relative w-full max-w-[400px] animate-slide-up">
          {/* Logo (only visible on mobile/tablet) */}
          <div className="flex flex-col items-center mb-8 lg:hidden">
            <div className="w-12 h-12 rounded-2xl bg-neutral-900/60 border border-white/[0.08] flex items-center justify-center mb-4 shadow-xl text-white">
              <Notebook className="w-6 h-6 fill-white/10" />
            </div>
            <h1 className="text-2xl font-bold text-gradient">Welcome back</h1>
            <p className="text-neutral-400 text-sm mt-1">Sign in to your Luminote account</p>
          </div>

          {/* Desktop Heading (hidden on mobile) */}
          <div className="hidden lg:block mb-8">
            <h1 className="text-4xl font-extrabold text-white tracking-tight">Welcome back</h1>
            <p className="text-neutral-400 text-base mt-2">Sign in to your account to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="bg-[#0c0c0e]/10 border border-white/[0.05] backdrop-blur-md px-8 py-10 rounded-2xl shadow-2xl flex flex-col gap-6">
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm animate-fade-in">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <label htmlFor="email" className="text-sm font-semibold text-neutral-300">Email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500 pointer-events-none" />
                <input
                  id="email"
                  type="email"
                  className="w-full bg-[#121217]/60 border border-white/[0.08] rounded-xl pl-12 pr-5 py-3.5 text-white placeholder-neutral-500 text-base focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 transition-all duration-300"
                  placeholder="Enter your email..."
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="password" className="text-sm font-semibold text-neutral-300">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500 pointer-events-none" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  className="w-full bg-[#121217]/60 border border-white/[0.08] rounded-xl pl-12 pr-12 py-3.5 text-white placeholder-neutral-500 text-base focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 transition-all duration-300"
                  placeholder="Enter your password..."
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 transition-colors focus:outline-none"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              id="login-btn"
              type="submit"
              className="w-full bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white font-bold py-3.5 rounded-xl hover:-translate-y-0.5 hover:shadow-[0_0_20px_rgba(139,92,246,0.4)] active:translate-y-0 active:scale-[0.98] transition-all duration-300 flex items-center justify-center gap-2 mt-2 text-base"
              disabled={loading}
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
              {loading ? "Signing in…" : "Sign in"}
            </button>

            <p className="text-center text-base text-neutral-400 mt-3">
              Don&apos;t have an account?{" "}
              <Link href="/register" className="text-brand-400 hover:text-brand-300 font-medium transition-colors">
                Register
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
