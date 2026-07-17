import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import AlertListener from "@/components/AlertListener";

export const metadata: Metadata = {
  title: { default: "Luminote", template: "%s | Luminote" },
  description:
    "AI-powered notes with semantic search, auto-summarization, and intelligent Q&A — powered by Groq and pgvector.",
  keywords: ["notes", "AI", "summarization", "semantic search", "productivity"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        {children}
        <AlertListener />
      </body>
    </html>
  );
}
