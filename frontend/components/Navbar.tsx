"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { clearAuth, getUser } from "@/lib/auth";
import type { StoredUser } from "@/lib/auth";
import { alertsApi } from "@/lib/api";
import type { Alert } from "@/types";
import {
  BookOpen,
  Search,
  LogOut,
  Notebook,
  Calendar,
  LayoutDashboard,
  Settings,
  HelpCircle,
  ChevronDown,
  FileText,
  Mic,
  Palette,
  ListTodo,
  Bell,
  Trash2,
  ExternalLink,
  X,
} from "lucide-react";
import clsx from "clsx";

function NavbarContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeType = searchParams.get("type");
  
  const [user, setUser] = useState<StoredUser | null>(null);
  const [notesDropdownOpen, setNotesDropdownOpen] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [readAlertIds, setReadAlertIds] = useState<string[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    setUser(getUser());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (user) {
      const fetchAlerts = async () => {
        try {
          const res = await alertsApi.list();
          setAlerts(res.data);
        } catch {
          // ignore
        }
      };
      fetchAlerts();

      try {
        const stored = localStorage.getItem("read_alerts");
        if (stored) {
          setReadAlertIds(JSON.parse(stored));
        }
      } catch {
        // ignore
      }
    }
  }, [user]);

  const handleDeleteAlert = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await alertsApi.delete(id);
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch {
      alert("Failed to delete alert.");
    }
  };

  const hasUnread = alerts.some((a) => !readAlertIds.includes(a.id));

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
      <header 
        className={clsx(
          "sticky top-0 z-50 w-full transition-all duration-300 animate-fade-in",
          scrolled 
            ? "border-b border-white/[0.05] bg-[#030303]/45 backdrop-blur-md shadow-[0_2px_20px_rgba(0,0,0,0.5)] py-3.5" 
            : "border-b border-transparent bg-transparent py-5"
        )}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          <Link href="/landing" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-xl bg-neutral-900/60 border border-white/[0.08] flex items-center justify-center text-white shrink-0 group-hover:scale-105 group-hover:border-brand-500/30 transition-all duration-300">
              <Notebook className="w-4.5 h-4.5 fill-white/10" />
            </div>
            <span className="font-bold text-lg text-white tracking-tight group-hover:text-neutral-200 transition-colors">
              Luminote
            </span>
          </Link>

          {/* Landing Navigation Links */}
          <nav className="hidden md:flex items-center gap-2">
            <a 
              href="#showcase" 
              className="text-[13px] font-medium text-neutral-400 hover:text-white px-4 py-1.5 rounded-full hover:bg-white/[0.06] transition-all duration-200"
            >
              Showcase
            </a>
            <a 
              href="#features" 
              className="text-[13px] font-medium text-neutral-400 hover:text-white px-4 py-1.5 rounded-full hover:bg-white/[0.06] transition-all duration-200"
            >
              Features
            </a>
            <a 
              href="#security" 
              className="text-[13px] font-medium text-neutral-400 hover:text-white px-4 py-1.5 rounded-full hover:bg-white/[0.06] transition-all duration-200"
            >
              Security
            </a>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <Link 
              href="/login" 
              className="text-[13px] font-medium text-neutral-400 hover:text-white border border-white/[0.1] hover:border-white/30 hover:bg-white/[0.05] transition-all duration-200 px-5 py-1.5 rounded-full"
            >
              Sign In
            </Link>
            <Link 
              href="/register" 
              className="px-5 py-1.5 rounded-full bg-white text-black hover:bg-neutral-100 text-[13px] font-bold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_0_20px_rgba(255,255,255,0.25)] active:translate-y-0"
            >
              Get Started
            </Link>
          </div>
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
            <Notebook className="w-4 h-4 text-brand-500 fill-brand-500/20" />
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
        <div className="relative">
          <button
            onClick={() => {
              setNotificationsOpen(!notificationsOpen);
              if (!notificationsOpen) {
                const ids = alerts.map((a) => a.id);
                setReadAlertIds(ids);
                localStorage.setItem("read_alerts", JSON.stringify(ids));
              }
            }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-neutral-400 hover:text-white hover:bg-surface-700 w-full text-left transition-colors relative"
          >
            <Bell className="w-4 h-4 text-neutral-500" />
            <span>Notifications</span>
            {hasUnread && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 bg-pink-500 rounded-full animate-pulse" />
            )}
          </button>

          {/* Notifications Popover */}
          {notificationsOpen && (
            <div className="absolute bottom-full left-0 mb-2 w-80 bg-surface-raised border border-border-muted rounded-xl p-4 shadow-2xl z-50 flex flex-col gap-3 max-h-[350px] overflow-hidden animate-slide-up">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border-muted pb-2">
                <span className="text-xs font-bold text-white tracking-wide uppercase">Notifications</span>
                <button
                  onClick={() => setNotificationsOpen(false)}
                  className="p-1 hover:bg-surface-strong rounded text-neutral-500 hover:text-white transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Notifications List */}
              <div className="flex-1 overflow-y-auto space-y-2.5 custom-scrollbar pr-0.5">
                {alerts.length === 0 ? (
                  <div className="text-center py-6 text-neutral-500 text-xs italic">
                    No notifications yet
                  </div>
                ) : (
                  [...alerts]
                    .sort((a, b) => new Date(b.alert_time).getTime() - new Date(a.alert_time).getTime())
                    .map((alert) => {
                      const alertDate = new Date(alert.alert_time);
                      return (
                        <div
                          key={alert.id}
                          className="flex items-start gap-2.5 p-2 rounded-lg bg-surface-base border border-border-muted hover:bg-surface-strong transition-colors group relative"
                        >
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border mt-0.5
                            ${alert.is_notified 
                              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
                              : "bg-pink-500/10 border-pink-500/20 text-pink-400"
                            }`}
                          >
                            <Bell className="w-3.5 h-3.5" />
                          </div>

                          <div className="flex-1 min-w-0 pr-6">
                            <p className="text-xs font-semibold text-white leading-normal">
                              {alert.title}
                            </p>
                            <span className="text-[10px] text-neutral-500 block mt-0.5">
                              {alertDate.toLocaleString()}
                            </span>
                            {alert.note_title && (
                              <Link
                                href={`/notes/${alert.note_id}`}
                                onClick={() => setNotificationsOpen(false)}
                                className="inline-flex items-center gap-1 mt-1 text-[10px] text-brand-400 hover:underline font-semibold"
                              >
                                <ExternalLink className="w-3 h-3" />
                                <span className="truncate max-w-[150px]">Open Note: {alert.note_title}</span>
                              </Link>
                            )}
                          </div>

                          {/* Delete Button */}
                          <button
                            onClick={(e) => handleDeleteAlert(alert.id, e)}
                            className="absolute top-2 right-2 text-neutral-500 hover:text-red-400 p-1 rounded hover:bg-red-950/20 transition-colors opacity-0 group-hover:opacity-100"
                            title="Delete Alert"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })
                )}
              </div>
            </div>
          )}
        </div>
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
