"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LegacyLoginPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/sign-in");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-base">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
