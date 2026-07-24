"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import SparkleMountainBackground from "@/components/SparkleMountainBackground";

export default function LegacyLoginPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/sign-in");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#030303] relative overflow-hidden">
      <SparkleMountainBackground />
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin relative z-10" />
    </div>
  );
}
