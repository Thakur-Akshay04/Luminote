"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { clearAuth, getUser } from "@/lib/auth";
import {
  BookOpen,
  Search,
  LogOut,
  Sparkles,
} from "lucide-react";
import clsx from "clsx";

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const user = getUser();

  const handleLogout = () => {
    clearAuth();
    router.push("/login");
  };

  const navLinks = [
    { href: "/notes",  label: "Notes",  icon: BookOpen },
    { href: "/search", label: "Search", icon: Search },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-surface-900/80 backdrop-blur-xl">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link href="/notes" className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-accent-violet flex items-center justify-center shadow-glow-sm">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight text-gradient">Notiq</span>
        </Link>

        {/* Nav Links */}
        <div className="flex items-center gap-1">
          {navLinks.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150",
                pathname.startsWith(href)
                  ? "bg-brand-500/15 text-brand-300"
                  : "text-gray-400 hover:text-gray-200 hover:bg-white/[0.05]"
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}
        </div>

        {/* User + Logout */}
        <div className="flex items-center gap-3">
          {user && (
            <span className="hidden sm:block text-xs text-gray-500 truncate max-w-[140px]">
              {user.email}
            </span>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-150"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </nav>
    </header>
  );
}
