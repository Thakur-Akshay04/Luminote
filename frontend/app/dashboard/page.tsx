"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { isAuthenticated, getUser } from "@/lib/auth";
import { notesApi, alertsApi } from "@/lib/api";
import type { Note, Alert } from "@/types";
import NoteCard from "@/components/NoteCard";
import NoteTypeModal from "@/components/NoteTypeModal";
import {
  StickyNote,
  Bell,
  Sparkles,
  Tag,
  Plus,
  Search,
  Calendar,
  Clock,
  Bot,
  Trash2,
  MoreVertical,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import clsx from "clsx";
import {
  format,
  isSameDay,
  isToday,
} from "date-fns";
import { useCalendar } from "@/hooks/useCalendar";

// ── Mini Calendar Component ──────────────────────────────────────────────────

function MiniCalendar({ alerts }: { alerts: Alert[] }) {
  const {
    currentMonth,
    handlePrevMonth,
    handleNextMonth,
    daysGrid,
    getAlertsForDay,
  } = useCalendar(new Date(), alerts);

  const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  return (
    <div className="bg-surface-900 p-5 rounded-2xl border border-white/[0.06] shadow-xl relative overflow-hidden group/calendar">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-bold text-white tracking-tight uppercase">
          {format(currentMonth, "MMMM yyyy")}
        </span>
        <div className="flex gap-1">
          <button
            onClick={handlePrevMonth}
            className="p-1.5 hover:bg-surface-700 rounded-full text-neutral-400 hover:text-white transition-all active:scale-90"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleNextMonth}
            className="p-1.5 hover:bg-surface-700 rounded-full text-neutral-400 hover:text-white transition-all active:scale-90"
            aria-label="Next month"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Weekdays */}
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-neutral-500 mb-3 tracking-wider">
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 gap-1">
        {daysGrid.map((day, idx) => {
          const isCurrentMonthDay = day.getMonth() === currentMonth.getMonth();
          const dayAlerts = getAlertsForDay(day);
          const hasAlerts = dayAlerts.length > 0;
          const isCurrent = isToday(day);

          const upcoming = dayAlerts.filter((a) => !a.is_notified);
          const completed = dayAlerts.filter((a) => a.is_notified);

          return (
            <div
              key={idx}
              className={`
                relative aspect-square flex flex-col items-center justify-center text-xs rounded-full select-none transition-all duration-150 group/day
                ${isCurrentMonthDay ? "text-neutral-200" : "text-neutral-600/50"}
                ${
                  isCurrent
                    ? "bg-brand-500/10 border border-brand-500 text-brand-300 font-extrabold shadow-[0_0_10px_rgba(219,39,119,0.2)]"
                    : "hover:bg-surface-700/60 hover:scale-105 active:scale-95 cursor-pointer"
                }
              `}
              title={day.toLocaleDateString()}
            >
              <span>{format(day, "d")}</span>
              
              {/* Alert Indicator Dots */}
              {hasAlerts && (
                <div className="absolute bottom-1 flex gap-0.5 justify-center">
                  {upcoming.length > 0 && (
                    <span className="w-1 h-1 rounded-full bg-pink-500 shadow-[0_0_4px_rgba(236,72,153,0.5)] animate-pulse" />
                  )}
                  {completed.length > 0 && (
                    <span className="w-1 h-1 rounded-full bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.5)]" />
                  )}
                </div>
              )}

              {/* Tooltip on Hover */}
              {hasAlerts && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-44 bg-surface-raised border border-border-muted p-2.5 rounded-xl shadow-2xl opacity-0 pointer-events-none group-hover/day:opacity-100 transition-all duration-200 scale-95 group-hover/day:scale-100 z-50">
                  <div className="text-[10px] font-bold text-neutral-400 mb-1 border-b border-border-muted pb-1 flex justify-between">
                    <span>Alerts ({dayAlerts.length})</span>
                    <span className="text-[8px] font-medium text-neutral-500">{format(day, "MMM d")}</span>
                  </div>
                  <div className="space-y-1.5 max-h-24 overflow-y-auto custom-scrollbar">
                    {dayAlerts.map((alert) => (
                      <div key={alert.id} className="text-[10px] text-white flex items-start gap-1">
                        <span className={`w-1 h-1 rounded-full mt-1.5 shrink-0 ${alert.is_notified ? "bg-emerald-500" : "bg-pink-500 animate-pulse"}`} />
                        <span className="truncate leading-relaxed">{alert.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ── Main Dashboard Component ─────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();

  const [notes, setNotes] = useState<Note[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [firstName, setFirstName] = useState("there");
  const [isNoteTypeModalOpen, setIsNoteTypeModalOpen] = useState(false);

  // Input states
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/landing");
    } else {
      const user = getUser();
      setFirstName((user?.display_name || user?.email?.split("@")[0]) ?? "there");
      setMounted(true);
    }
  }, [router]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [notesRes, alertsRes] = await Promise.all([
        notesApi.list(),
        alertsApi.list(),
      ]);
      setNotes(notesRes.data);
      setAlerts(alertsRes.data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mounted) {
      fetchData();
    }
  }, [mounted, fetchData]);

  const handleCreateNote = () => {
    setIsNoteTypeModalOpen(true);
  };

  const handleDeleteNote = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this note?")) return;
    try {
      await notesApi.delete(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch {
      alert("Failed to delete note.");
    }
  };

  const handleDeleteAlert = async (alertId: string) => {
    try {
      await alertsApi.delete(alertId);
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    } catch {
      alert("Failed to delete alert.");
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
  };

  // Group notes by date
  const groupNotesByDate = () => {
    const groups: { [key: string]: Note[] } = {};
    const sorted = [...notes].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );

    sorted.forEach((note) => {
      const date = new Date(note.updated_at);
      let label = "";

      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);

      if (isSameDay(date, today)) {
        label = "Today, " + format(date, "MMM d");
      } else if (isSameDay(date, yesterday)) {
        label = "Yesterday, " + format(date, "MMM d");
      } else {
        label = format(date, "MMM d, yyyy");
      }

      if (!groups[label]) {
        groups[label] = [];
      }
      groups[label].push(note);
    });

    return groups;
  };

  const groupedNotes = groupNotesByDate();

  const isUpcoming = (dateStr: string): boolean => {
    return new Date(dateStr) > new Date();
  };

  const upcomingAlerts = alerts
    .filter((a) => isUpcoming(a.alert_time))
    .sort((a, b) => new Date(a.alert_time).getTime() - new Date(b.alert_time).getTime());

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-800">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col xl:flex-row bg-surface-800 text-neutral-200">
      {/* ── Middle/Main Content Column ── */}
      <div className="flex-1 px-8 py-8 flex flex-col justify-between min-h-[calc(100vh-1px)]">
        <div className="space-y-6">
          {/* Header Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 items-center gap-4 border-b border-white/[0.04] pb-5">
            {/* Column 1: Title */}
            <div className="flex items-center justify-start">
              <h1 className="text-2xl font-bold text-white tracking-tight">Home</h1>
            </div>

            {/* Column 2: Centered Search Bar */}
            <div className="flex justify-center w-full">
              <form onSubmit={handleSearchSubmit} className="relative max-w-sm w-full hidden md:block">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-500 pointer-events-none" />
                <input
                  type="text"
                  placeholder="How can I help?"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-surface-900 border border-white/[0.06] rounded-full pl-9 pr-4 py-1.5 text-white text-xs focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 shadow-sm transition-all placeholder:text-neutral-500 text-center"
                />
              </form>
            </div>
            
            {/* Column 3: Actions & Mobile Search */}
            <div className="flex items-center justify-between sm:justify-end gap-3 w-full">
              {/* Search Bar - visible on mobile, hidden on desktop */}
              <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-xs md:hidden">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-500 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-surface-900 border border-white/[0.06] rounded-full pl-9 pr-4 py-1.5 text-white text-xs focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 shadow-sm transition-all placeholder:text-neutral-500 text-center"
                />
              </form>

              <button 
                onClick={handleCreateNote} 
                disabled={creating}
                className="btn-primary py-2 px-4 text-xs font-semibold flex items-center gap-1.5 shrink-0"
              >
                {creating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    New Note
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Notes grouped by day */}
          {loading ? (
            <div className="space-y-6">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="space-y-3">
                  <div className="skeleton h-6 w-32" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="skeleton h-24 rounded-xl" />
                    <div className="skeleton h-24 rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          ) : Object.keys(groupedNotes).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-surface-900 flex items-center justify-center shadow-sm border border-surface-600">
              <StickyNote className="w-8 h-8 text-neutral-500" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-300">No notes yet</h3>
                <p className="text-xs text-neutral-500 mt-1">Click "New Note" to get started.</p>
              </div>
              <button onClick={handleCreateNote} className="btn-primary text-xs py-1.5 px-3">
                <Plus className="w-3.5 h-3.5" /> Create a Note
              </button>
            </div>
          ) : (
            <div className="space-y-8">
              {Object.entries(groupedNotes).map(([dayLabel, groupNotes]) => (
                <div key={dayLabel} className="space-y-3">
                  {/* Day Header Bar */}
                  <div className="flex items-center gap-2 bg-surface-700 py-1.5 px-3 rounded-lg border border-surface-600/30 text-neutral-300">
                    <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                    <span className="text-xs font-semibold tracking-wide uppercase">{dayLabel}</span>
                  </div>

                  {/* Notes Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {groupNotes.map((note) => (
                      <NoteCard
                        key={note.id}
                        note={note}
                        onDelete={(e) => handleDeleteNote(note.id, e)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* ── Right Sidebar Column (Calendar/Upcoming) ── */}
      <div className="w-full xl:w-96 border-t xl:border-t-0 xl:border-l border-surface-600 bg-surface-900 px-6 py-8 flex flex-col gap-6 shrink-0 min-h-[calc(100vh-1px)]">
        {/* Calendar widget */}
        <div className="flex flex-col gap-2">
          <MiniCalendar alerts={alerts} />
          {/* Legend */}
          <div className="flex justify-end gap-3 text-[10px] text-neutral-500 px-1">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-pink-500" /> Upcoming
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" /> Completed
            </span>
          </div>
        </div>

        {/* Upcoming Events banner */}
        <div className="flex flex-col gap-4">
          <div className="bg-pink-950/20 border border-pink-900/30 text-pink-400 font-semibold rounded-lg px-4 py-2.5 flex items-center gap-2 text-xs">
            <Bell className="w-4 h-4 text-pink-400" />
            Upcoming Events
          </div>

          {/* Upcoming Alerts List */}
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-3 animate-pulse">
                  <div className="skeleton w-12 h-12 rounded-xl" />
                  <div className="flex-1 space-y-2 py-1">
                    <div className="skeleton h-3.5 w-3/4 rounded" />
                    <div className="skeleton h-2.5 w-1/2 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : upcomingAlerts.length === 0 ? (
            <div className="text-center py-8 text-neutral-500 text-xs italic">
              No upcoming alerts scheduled
            </div>
          ) : (
            <div className="flex flex-col">
              {upcomingAlerts.slice(0, 5).map((alert) => {
                const alertDate = new Date(alert.alert_time);
                const dayName = format(alertDate, "EEE").toUpperCase();
                const dayNum = format(alertDate, "d");

                return (
                  <div
                    key={alert.id}
                    className="flex gap-4 items-center py-3 border-b border-surface-700 last:border-0 hover:bg-surface-700/50 px-2 rounded-lg transition-colors group"
                  >
                    {/* Pink date badge */}
                    <div className="w-12 h-12 flex flex-col items-center justify-center rounded-xl border border-pink-500/40 text-pink-400 bg-surface-900 shrink-0 shadow-sm">
                      <span className="text-[8px] font-bold tracking-wider leading-none uppercase">{dayName}</span>
                      <span className="text-base font-extrabold leading-none mt-1">{dayNum}</span>
                    </div>

                    {/* Alert Info */}
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-bold text-white truncate leading-snug group-hover:text-pink-400 transition-colors">
                        {alert.title}
                      </h4>
                      <div className="flex items-center gap-1.5 mt-1 text-[10px] text-neutral-400">
                        <Clock className="w-3 h-3 text-neutral-500" />
                        <span>{format(alertDate, "h:mm a")}</span>
                        {alert.note_title && (
                          <Link
                            href={`/notes/${alert.note_id}`}
                            className="truncate max-w-[120px] text-pink-400 font-semibold hover:underline"
                          >
                            • {alert.note_title}
                          </Link>
                        )}
                      </div>
                    </div>

                    {/* Delete */}
                    <button
                      onClick={() => handleDeleteAlert(alert.id)}
                      className="text-neutral-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-950/20 transition-colors opacity-0 group-hover:opacity-100"
                      title="Delete Alert"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <NoteTypeModal
        isOpen={isNoteTypeModalOpen}
        onClose={() => setIsNoteTypeModalOpen(false)}
      />
    </div>
  );
}
