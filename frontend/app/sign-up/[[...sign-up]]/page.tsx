import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import SparkleMountainBackground from "@/components/SparkleMountainBackground";
import InteractiveThoughtMap from "@/components/InteractiveThoughtMap";

export default function SignUpPage() {
  return (
    <main className="min-h-screen w-full flex flex-col items-center justify-center lg:flex-row lg:justify-end bg-[#030303] p-4 sm:p-6 lg:p-0 lg:pr-20 xl:pr-32 relative overflow-hidden">
      <SparkleMountainBackground />
      <div className="absolute inset-0 z-0">
        <InteractiveThoughtMap />
      </div>

      {/* Top Left Header Branding */}
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

      {/* Custom Auth Container Card */}
      <div className="relative z-10 my-auto py-8 w-full max-w-md">
        <div className="relative rounded-3xl border border-white/[0.1] bg-[#0c0c10]/85 backdrop-blur-2xl p-2 sm:p-3 shadow-[0_30px_90px_rgba(0,0,0,0.9),0_0_60px_rgba(139,92,246,0.15)] overflow-hidden transition-all duration-300 hover:border-white/[0.16]">
          {/* Ambient top glowing line */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-brand-500 to-transparent opacity-80 z-20 pointer-events-none" />

          <SignUp
            fallbackRedirectUrl="/dashboard"
            forceRedirectUrl="/dashboard"
            appearance={{
              variables: {
                colorPrimary: "#8b5cf6",
                colorBackground: "transparent",
                borderRadius: "1rem",
              },
              elements: {
                rootBox: "w-full",
                cardBox: "shadow-none w-full bg-transparent",
                card: "bg-transparent shadow-none border-none p-4 sm:p-6 w-full",
                headerTitle: "text-white font-black tracking-tight text-2xl text-center",
                headerSubtitle: "text-zinc-400 text-xs text-center mt-1",
                socialButtonsBlockButton: "bg-[#14141c] hover:bg-[#1a1a24] border border-white/[0.1] hover:border-white/25 text-white font-semibold text-xs sm:text-sm rounded-xl py-3 shadow-md transition-all duration-200",
                socialButtonsBlockButtonText: "text-white font-semibold text-xs sm:text-sm",
                socialButtonsBlockButtonArrow: "hidden",
                badge: "bg-brand-500/20 text-brand-300 border border-brand-500/30 text-[10px] font-bold rounded-full px-2 py-0.5",
                dividerLine: "bg-white/[0.08]",
                dividerText: "text-zinc-500 text-[10px] font-extrabold uppercase tracking-widest bg-[#0c0c10] px-3",
                formFieldLabel: "text-zinc-300 font-semibold text-xs mb-1.5",
                formFieldInput: "bg-[#121217] border border-white/[0.08] text-white rounded-xl focus:border-brand-500/80 focus:ring-2 focus:ring-brand-500/20 transition-all text-xs sm:text-sm px-4 py-3 outline-none",
                formButtonPrimary: "bg-gradient-to-r from-brand-600 via-purple-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-[0_0_25px_rgba(139,92,246,0.35)] hover:shadow-[0_0_35px_rgba(139,92,246,0.55)] hover:-translate-y-0.5 active:translate-y-0 transition-all py-3.5 text-xs sm:text-sm mt-2",
                footerActionLink: "text-brand-400 hover:text-brand-300 font-bold transition-colors text-xs",
                footerActionText: "text-zinc-400 text-xs",
                footer: "bg-transparent border-t border-white/[0.06] pt-4 mt-4 text-center",
                identityPreviewText: "text-white font-semibold",
                identityPreviewEditButtonIcon: "text-brand-400",
              },
            }}
          />

        </div>
      </div>
    </main>
  );
}
