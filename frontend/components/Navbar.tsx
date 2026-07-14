"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
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
  ChevronDown,
  FileText,
  Mic,
  Palette,
  ListTodo,
} from "lucide-react";
import clsx from "clsx";

function NavbarContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeType = searchParams.get("type");
  
  const [user, setUser] = useState<StoredUser | null>(null);
  const [notesDropdownOpen, setNotesDropdownOpen] = useState(false);

  useEffect(() => {
    setUser(getUser());
  }, []);

  // Keep notes dropdown open if current path is a notes list filter
  useEffect(() => {
    if (pathname.startsWith("/notes")) {
      setNotesDropdownOpen(true);
    }
  }, [pathname]);

  const handleLogout = () => {
    clearAuth();
    router.push("/login");
  };

  const navLinks = user
    ? [
        { href: "/dashboard", label: "Home", icon: LayoutDashboard },
        { href: "/notes",  label: "Notes",  icon: BookOpen, hasDropdown: true },
        { href: "/calendar", label: "Calendar", icon: Calendar },
        { href: "/search", label: "Search", icon: Search },
      ]
    : [];

  const dropdownOptions = [
    { type: "text", label: "Text", icon: FileText },
    { type: "audio", label: "Voice", icon: Mic },
    { type: "drawing", label: "Drawing", icon: Palette },
    { type: "checklist", label: "Checklist", icon: ListTodo },
  ];

  if (!user) {
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
          {navLinks.map(({ href, label, icon: Icon, hasDropdown }) => {
            const isActive = pathname.startsWith(href);
            
            if (hasDropdown) {
              return (
                <div key={href} className="flex flex-col gap-1">
                  <div
                    className={clsx(
                      "flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer select-none focus:outline-none focus:bg-surface-700 focus:text-white",
                      isActive && !activeType
                        ? "bg-surface-700 text-white font-semibold shadow-sm"
                        : "text-neutral-400 hover:text-white hover:bg-surface-700"
                    )}
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      router.push(href);
                      setNotesDropdownOpen(!notesDropdownOpen);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push(href);
                        setNotesDropdownOpen(!notesDropdownOpen);
                      }
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={clsx("w-4 h-4", isActive ? "text-brand-500" : "text-neutral-500")} />
                      <span>{label}</span>
                    </div>
                    <ChevronDown
                      className={clsx(
                        "w-4 h-4 text-neutral-500 transition-transform duration-200",
                        notesDropdownOpen && "rotate-180"
                      )}
                    />
                  </div>
                  
                  {/* Dropdown Options */}
                  {notesDropdownOpen && (
                    <div className="flex flex-col gap-1 pl-4 mt-1 border-l border-surface-600 ml-5">
                      {dropdownOptions.map((opt) => {
                        const optHref = `/notes?type=${opt.type}`;
                        const isOptActive = pathname.startsWith("/notes") && activeType === opt.type;
                        const OptIcon = opt.icon;
                        
                        return (
                          <Link
                            key={opt.type}
                            href={optHref}
                            className={clsx(
                              "flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150",
                              isOptActive
                                ? "bg-surface-700 text-white font-semibold shadow-sm"
                                : "text-neutral-400 hover:text-white hover:bg-surface-700/50"
                            )}
                          >
                            <OptIcon className={clsx("w-3.5 h-3.5", isOptActive ? "text-brand-500" : "text-neutral-500")} />
                            <span>{opt.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

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

export default function Navbar() {
  return (
    <Suspense fallback={<aside className="w-64 h-screen border-r border-surface-600 bg-surface-800 shrink-0 sticky top-0" />}>
      <NavbarContent />
    </Suspense>
  );
}
