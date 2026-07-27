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
          className="inline-flex items-center group pointer-events-auto w-fit mb-1"
        >
          <img
            src="/webLogo.png"
            alt="Luminote Logo"
            className="h-10 sm:h-12 w-auto object-contain group-hover:scale-105 transition-transform duration-300 drop-shadow-md"
          />
        </Link>

        <div className="group/header pointer-events-auto cursor-default flex flex-col gap-1.5 w-fit">
          <h1 className="text-2xl sm:text-3xl font-black text-white group-hover/header:bg-gradient-to-r group-hover/header:from-brand-300 group-hover/header:via-purple-400 group-hover/header:to-indigo-400 group-hover/header:bg-clip-text group-hover/header:text-transparent transition-all duration-300 tracking-tight leading-tight">
            Welcome back
          </h1>
          <p className="text-zinc-400 group-hover/header:text-zinc-200 transition-colors duration-300 text-xs sm:text-sm leading-relaxed">
            Sign in to access your connected notes, voice memos, and AI assistant.
          </p>
        </div>
      </div>

      <div className="relative z-10 -translate-x-[100px]">
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

