import type { Metadata } from "next";
import type { ReactNode } from "react";
import Navbar from "@/components/Navbar";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsLayout({ children }: Readonly<{ children: ReactNode }>) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  return (
    <div className="min-h-screen flex bg-surface-800">
      <Navbar />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
