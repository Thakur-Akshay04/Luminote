import { SignUp } from "@clerk/nextjs";
import SparkleMountainBackground from "@/components/SparkleMountainBackground";
import InteractiveThoughtMap from "@/components/InteractiveThoughtMap";
import { Sparkles, Brain, Mic, Wand2 } from "lucide-react";

export default function SignUpPage() {
  return (
    <main className="min-h-screen w-full flex items-center justify-center bg-[#030303] p-4 sm:p-6 lg:p-12 relative overflow-hidden">
      <SparkleMountainBackground />
      <div className="absolute inset-0 z-0">
        <InteractiveThoughtMap />
      </div>

      <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center relative z-10">
        {/* Left Side Info Panel */}
        <div className="hidden lg:flex lg:col-span-6 xl:col-span-7 flex-col items-start text-left gap-6 pointer-events-none select-none pr-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-300 text-xs font-semibold shadow-lg backdrop-blur-md">
            <Sparkles className="w-3.5 h-3.5 text-brand-400" />
            <span>Spatial Knowledge Graph</span>
          </div>

          <h1 className="text-4xl xl:text-5xl font-black text-white tracking-tight leading-[1.12]">
            Notes that <br />
            <span className="bg-gradient-to-r from-brand-300 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
              connect themselves.
            </span>
          </h1>

          <p className="text-zinc-400 text-sm xl:text-base leading-relaxed max-w-lg">
            Ditch rigid folder structures. Luminote automatically structures, indexes, and surfaces relationships across your thoughts.
          </p>

          <div className="grid grid-cols-1 gap-3 pt-2">
            <div className="flex items-center gap-3 bg-[#0c0c0e]/60 border border-white/[0.06] backdrop-blur-md px-4 py-2.5 rounded-xl">
              <Brain className="w-4 h-4 text-brand-400 shrink-0" />
              <span className="text-xs text-neutral-200 font-medium">Conceptual & semantic search engine</span>
            </div>
            <div className="flex items-center gap-3 bg-[#0c0c0e]/60 border border-white/[0.06] backdrop-blur-md px-4 py-2.5 rounded-xl">
              <Mic className="w-4 h-4 text-brand-400 shrink-0" />
              <span className="text-xs text-neutral-200 font-medium">AI voice transcription and memo cleanup</span>
            </div>
            <div className="flex items-center gap-3 bg-[#0c0c0e]/60 border border-white/[0.06] backdrop-blur-md px-4 py-2.5 rounded-xl">
              <Wand2 className="w-4 h-4 text-brand-400 shrink-0" />
              <span className="text-xs text-neutral-200 font-medium">Private single-tenant sandbox architecture</span>
            </div>
          </div>
        </div>

        {/* Right Side Auth Card */}
        <div className="lg:col-span-6 xl:col-span-5 flex justify-center lg:justify-end w-full">
          <SignUp
            fallbackRedirectUrl="/dashboard"
            forceRedirectUrl="/dashboard"
            appearance={{
              variables: {
                colorPrimary: "#6366f1",
                colorBackground: "#18181b",
                borderRadius: "8px",
              },
              elements: {
                card: "border border-surface-border shadow-2xl bg-[#18181b]",
              },
            }}
          />
        </div>
      </div>
    </main>
  );
}
