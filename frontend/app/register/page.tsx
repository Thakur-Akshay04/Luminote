"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import SparkleMountainBackground from "@/components/SparkleMountainBackground";
import InteractiveThoughtMap from "@/components/InteractiveThoughtMap";

export default function LegacyRegisterPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/sign-up");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center lg:justify-end bg-[#030303] p-4 sm:p-6 lg:pr-24 xl:pr-36 relative overflow-hidden">
      <SparkleMountainBackground />
      <div className="absolute inset-0 z-0">
        <InteractiveThoughtMap />
      </div>
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin relative z-10" />
    </div>
  );
}
