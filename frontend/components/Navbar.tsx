"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { clearAuth, getUser } from "@/lib/auth";
import type { StoredUser } from "@/lib/auth";
import {
  BookOpen,
  Search,
  LogOut,
  Sparkles,
  Calendar,
  LayoutDashboard,
  Settings,
  HelpCircle,
} from "lucide-react";
import clsx from "clsx";

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<StoredUser | null>(null);

  useEffect(() => {
    setUser(getUser());
  }, []);

  const handleLogout = () => {
    clearAuth();
    router.push("/login");
  };

  const navLinks = user
    ? [
        { href: "/dashboard", label: "Home", icon: LayoutDashboard },
        { href: "/notes",  label: "Notes",  icon: BookOpen },
        { href: "/calendar", label: "Calendar", icon: Calendar },
        { href: "/search", label: "Search", icon: Search },
      ]
    : [];

  if (!user) {
    // Render top horizontal navbar for landing / guest pages
    return (
      <header className="w-full border-b border-surface-600 bg-surface-900/80 backdrop-blur-md sticky top-0 z-50 animate-fade-in">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/landing" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-500 shadow-sm shrink-0">
              <Sparkles className="w-4 h-4 fill-brand-500" />
            </div>
            <span className="font-bold text-lg text-white tracking-tight">Luminote</span>
          </Link>
          <Link href="/login" className="btn-primary text-xs px-4 py-2 shrink-0">
            Login
          </Link>
        </div>
      </header>
    );
  }

  // Render left vertical sidebar for authenticated pages
  return (
    <aside className="w-64 h-screen border-r border-surface-600 bg-surface-800 flex flex-col justify-between py-6 px-4 shrink-0 sticky top-0 animate-fade-in">
      <div className="flex flex-col gap-8">
        {/* Profile / Header */}
        <Link 
          href="/settings"
          className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-surface-700/50 transition-colors cursor-pointer group"
        >
          <div className="w-8 h-8 rounded-full bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-500 shadow-sm shrink-0 group-hover:border-brand-500/40 transition-colors">
            <Sparkles className="w-4 h-4 fill-brand-500" />
          </div>
          <div className="flex-1 min-w-0 flex items-center justify-between">
            <span className="text-sm font-semibold text-neutral-200 truncate group-hover:text-white transition-colors">
              {user.email.split("@")[0]}
            </span>
            <span className="text-[10px] text-neutral-500 group-hover:text-neutral-300 transition-colors">▼</span>
          </div>
        </Link>

        {/* Nav Links */}
        <div className="flex flex-col gap-1.5">
          {navLinks.map(({ href, label, icon: Icon }) => {
            const isActive = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={clsx(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                  isActive
                    ? "bg-surface-700 text-white font-semibold shadow-sm"
                    : "text-neutral-400 hover:text-white hover:bg-surface-700"
                )}
              >
                <Icon className={clsx("w-4 h-4", isActive ? "text-brand-500" : "text-neutral-500")} />
                {label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="flex flex-col gap-1.5">
        <button
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-neutral-400 hover:text-white hover:bg-surface-700 w-full text-left transition-colors"
          onClick={() => router.push("/settings")}
        >
          <Settings className="w-4 h-4 text-neutral-500" />
          Settings
        </button>
        <button
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-neutral-400 hover:text-white hover:bg-surface-700 w-full text-left transition-colors"
          onClick={() => router.push("/help")}
        >
          <HelpCircle className="w-4 h-4 text-neutral-500" />
          Help
        </button>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-400 hover:bg-red-950/20 w-full text-left transition-colors"
          title="Logout"
        >
          <LogOut className="w-4 h-4 text-red-400" />
          Logout
        </button>
      </div>
    </aside>
  );
}
