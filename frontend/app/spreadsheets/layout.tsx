import type { Metadata } from "next";
import type { ReactNode } from "react";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = { title: "My Spreadsheets" };

export default function SpreadsheetsLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="min-h-screen flex bg-surface-800">
      <Navbar />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
