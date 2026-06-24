import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Notiq", template: "%s | Notiq" },
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
    <html lang="en" className="dark">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
