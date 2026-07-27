import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { Notebook } from "lucide-react";
import SparkleMountainBackground from "@/components/SparkleMountainBackground";
import InteractiveThoughtMap from "@/components/InteractiveThoughtMap";

export default function SignUpPage() {
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
            Create your account
          </h1>
          <p className="text-zinc-400 group-hover/header:text-zinc-200 transition-colors duration-300 text-xs sm:text-sm leading-relaxed">
            Join Luminote to structure, index, and connect your thoughts effortlessly.
          </p>
        </div>
      </div>

      <div className="relative z-10 my-auto py-8">
        <SignUp
          fallbackRedirectUrl="/dashboard"
          forceRedirectUrl="/dashboard"
          appearance={{
            variables: {
              colorPrimary: "#8b5cf6",
              colorBackground: "#0c0c0e",
              borderRadius: "16px",
            },

            elements: {
              cardBox: "shadow-none",
              card: "border border-white/[0.08] bg-[#0c0c0e]/90 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.85),0_0_40px_rgba(139,92,246,0.15)] p-2 rounded-2xl",
              headerTitle: "text-white font-extrabold tracking-tight text-xl",
              headerSubtitle: "text-zinc-400 text-xs",
              socialButtonsBlockButton: "bg-[#141419] border border-white/[0.08] text-white hover:bg-white/[0.06] hover:border-white/20 transition-all rounded-xl",
              socialButtonsBlockButtonText: "text-white font-semibold text-xs",
              dividerLine: "bg-white/[0.08]",
              dividerText: "text-zinc-500 text-xs font-semibold uppercase tracking-wider",
              formFieldLabel: "text-zinc-300 font-semibold text-xs",
              formFieldInput: "bg-[#121217] border border-white/[0.08] text-white rounded-xl focus:border-brand-500 focus:ring-1 focus:ring-brand-500/50 transition-all text-sm px-3.5 py-2.5",
              formButtonPrimary: "bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:shadow-[0_0_25px_rgba(139,92,246,0.5)] transition-all py-3 text-sm",
              footerActionLink: "text-brand-400 hover:text-brand-300 font-semibold transition-colors",
              footerActionText: "text-zinc-400 text-xs",
              identityPreviewText: "text-white font-semibold",
              identityPreviewEditButtonIcon: "text-brand-400",
            },
          }}
        />

      </div>

    </main>
  );
}

