import type { Metadata } from "next";
import type { ReactNode } from "react";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = { title: "Landing Page" };

export default function LandingLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">{children}</main>
    </div>
  );
}
