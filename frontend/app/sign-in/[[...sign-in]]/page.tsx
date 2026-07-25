import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
import { Notebook } from "lucide-react";
import SparkleMountainBackground from "@/components/SparkleMountainBackground";
import InteractiveThoughtMap from "@/components/InteractiveThoughtMap";

export default function SignInPage() {
  return (
    <main className="min-h-screen w-full flex flex-col items-center justify-center lg:flex-row lg:justify-end bg-[#030303] p-4 sm:p-6 lg:p-0 lg:pr-24 xl:pr-36 relative overflow-hidden">
      <SparkleMountainBackground />
      <div className="absolute inset-0 z-0">
        <InteractiveThoughtMap />
      </div>

      {/* Top Left Header */}
      <div className="w-full max-w-md mb-6 lg:mb-0 lg:absolute lg:top-10 lg:left-10 z-20 flex flex-col gap-1.5 pointer-events-none text-left">
        <Link
          href="/landing"
          className="inline-flex items-center gap-2.5 group pointer-events-auto w-fit mb-1"
        >
          <div className="w-9 h-9 rounded-xl bg-neutral-900/80 border border-white/[0.1] flex items-center justify-center text-white shrink-0 group-hover:scale-105 group-hover:border-brand-500/40 backdrop-blur-md transition-all duration-300 shadow-md">
            <Notebook className="w-4.5 h-4.5 fill-white/10 text-white" />
          </div>
          <span className="font-bold text-lg text-white tracking-tight group-hover:text-neutral-200 transition-colors">
            Luminote
          </span>
        </Link>

        <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight">
          Welcome back
        </h1>
        <p className="text-zinc-400 text-xs sm:text-sm leading-relaxed">
          Sign in to access your connected notes, voice memos, and AI assistant.
        </p>
      </div>

      <div className="relative z-10 -translate-x-[3px]">
        <SignIn
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
    </main>
  );
}

