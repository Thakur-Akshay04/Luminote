"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { alertsApi, notesApi } from "@/lib/api";
import type { Alert, Note } from "@/types";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Bell,
  CalendarDays,
  Loader2,
  Clock,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import {
  format,
  parseISO,
  isToday,
  isSameDay,
} from "date-fns";
import { useCalendar } from "@/hooks/useCalendar";

export default function CalendarPage() {
  const router = useRouter();

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Calendar view state
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const {
    currentMonth,
    handlePrevMonth,
    handleNextMonth,
    daysGrid,
    getAlertsForDay,
  } = useCalendar(new Date(), alerts);

  // Manual alert creation state
  const [noteId, setNoteId] = useState("");
  const [title, setTitle] = useState("");
  const [alertDate, setAlertDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [alertTime, setAlertTime] = useState("09:00");
  const [creatingAlert, setCreatingAlert] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated()) router.replace("/login");
  }, [router]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [alertsRes, notesRes] = await Promise.all([
        alertsApi.list(),
        notesApi.list(),
      ]);
      setAlerts(alertsRes.data);
      setNotes(notesRes.data);
      if (notesRes.data.length > 0) {
        setNoteId(notesRes.data[0].id);
      }
    } catch {
      setError("Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Create alert handler
  const handleCreateAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteId || !title.trim() || !alertDate || !alertTime) return;

    setCreatingAlert(true);
    setError(null);
    try {
      // Create local ISO string
      const isoDateTime = new Date(`${alertDate}T${alertTime}:00`).toISOString();
      const res = await alertsApi.create({
        note_id: noteId,
        title: title.trim(),
        alert_time: isoDateTime,
      });

      setAlerts((prev) => [...prev, res.data].sort((a, b) => new Date(a.alert_time).getTime() - new Date(b.alert_time).getTime()));
      setTitle("");
      // Refetch to sync join names if necessary
      fetchData();
    } catch {
      setError("Failed to create alert.");
    } finally {
      setCreatingAlert(false);
    }
  };

  // Delete alert handler
  const handleDeleteAlert = async (alertId: string) => {
    try {
      await alertsApi.delete(alertId);
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    } catch {
      setError("Failed to delete alert.");
    }
  };

  const selectedDayAlerts = getAlertsForDay(selectedDate);
  const upcomingAlerts = alerts
    .filter((a) => new Date(a.alert_time).getTime() >= Date.now())
    .slice(0, 5);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex flex-col lg:flex-row gap-8">
      {/* Left Column: Calendar view */}
      <div className="flex-1 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gradient flex items-center gap-2">
              <CalendarDays className="w-7 h-7 text-brand-400" />
              Calendar Alerts
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              View deadlines and set real-time triggers for your notes.
            </p>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Calendar Card */}
        <div className="glass p-6 flex flex-col">
          {/* Calendar Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-200">
              {format(currentMonth, "MMMM yyyy")}
            </h2>
            <div className="flex items-center gap-1">
              <button
                onClick={handlePrevMonth}
                className="p-1.5 rounded-lg border border-white/[0.06] hover:bg-surface-700 text-gray-400 hover:text-white transition-all"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={handleNextMonth}
                className="p-1.5 rounded-lg border border-white/[0.06] hover:bg-surface-700 text-gray-400 hover:text-white transition-all"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Weekdays Row */}
          <div className="grid grid-cols-7 gap-1 text-center mb-2">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
              <span key={day} className="text-xs font-semibold text-gray-600 uppercase tracking-wider py-2">
                {day}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-2">
            {daysGrid.map((day, idx) => {
              const isCurrentMonthDay = day.getMonth() === currentMonth.getMonth();
              const isSel = isSameDay(day, selectedDate);
              const dayAlerts = getAlertsForDay(day);
              const hasAlerts = dayAlerts.length > 0;

              return (
                <button
                  key={idx}
                  onClick={() => {
                    setSelectedDate(day);
                    setAlertDate(format(day, "yyyy-MM-dd"));
                  }}
                  className={`
                    relative aspect-square rounded-xl flex flex-col items-center justify-center gap-1 transition-all duration-150
                    ${isCurrentMonthDay ? "text-gray-200" : "text-gray-600"}
                    ${isToday(day) && !isSel ? "border border-brand-500/40 text-brand-400" : ""}
                    ${isSel 
                      ? "bg-brand-500/20 border-2 border-brand-500/80 shadow-glow-sm text-white scale-[1.03]" 
                      : "hover:bg-surface-700/50 border border-white/[0.03]"
                    }
                  `}
                >
                  <span className="text-sm font-semibold">{format(day, "d")}</span>
                  {hasAlerts && (
                    <span className="w-1.5 h-1.5 rounded-full bg-accent-pink shadow-glow-sm" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right Column: Alerts Manager & Create form */}
      <div className="w-full lg:w-96 flex flex-col gap-6 shrink-0">
        {/* Alerts for selected day */}
        <div className="glass p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">
              Alerts for {format(selectedDate, "MMM d, yyyy")}
            </h2>
            <span className="tag">{selectedDayAlerts.length}</span>
          </div>

          {selectedDayAlerts.length > 0 ? (
            <div className="flex flex-col gap-3 max-h-60 overflow-y-auto pr-1">
              {selectedDayAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="p-3 rounded-xl border border-white/[0.04] bg-surface-700/30 flex items-start justify-between gap-3 group hover:border-white/[0.08] transition-all"
                >
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="text-sm font-medium text-white truncate">{alert.title}</span>
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{format(parseISO(alert.alert_time), "h:mm a")}</span>
                    </div>
                    {alert.note_title && (
                      <Link
                        href={`/notes/${alert.note_id}`}
                        className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-0.5 mt-1 underline"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span className="truncate max-w-[140px]">{alert.note_title}</span>
                      </Link>
                    )}
                  </div>
                  <button
                    onClick={() => handleDeleteAlert(alert.id)}
                    className="text-gray-600 hover:text-red-400 p-1 rounded-lg hover:bg-red-500/10 transition-colors shrink-0"
                    title="Delete alert"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-500 italic py-4 text-center">
              No alerts set for this date.
            </p>
          )}
        </div>

        {/* Schedule Alert form */}
        {notes.length > 0 && (
          <div className="glass p-5 flex flex-col gap-4">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider border-b border-white/[0.06] pb-3">
              Schedule New Alert
            </h2>

            <form onSubmit={handleCreateAlert} className="flex flex-col gap-3">
              {/* Select Note */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500 font-medium">Select Note</label>
                <select
                  className="input py-2 text-xs"
                  value={noteId}
                  onChange={(e) => setNoteId(e.target.value)}
                  required
                >
                  {notes.map((note) => (
                    <option key={note.id} value={note.id} className="bg-surface-800">
                      {note.title || "Untitled Note"}
                    </option>
                  ))}
                </select>
              </div>

              {/* Title */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500 font-medium">Alert Title</label>
                <input
                  type="text"
                  className="input py-2 text-xs"
                  placeholder="e.g. Call client, review notes"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              {/* Date & Time Grid */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-500 font-medium">Date</label>
                  <input
                    type="date"
                    className="input py-2 text-xs"
                    value={alertDate}
                    onChange={(e) => setAlertDate(e.target.value)}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-500 font-medium">Time</label>
                  <input
                    type="time"
                    className="input py-2 text-xs"
                    value={alertTime}
                    onChange={(e) => setAlertTime(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={creatingAlert || !title.trim()}
                className="btn-primary w-full py-2 mt-2 text-xs"
              >
                {creatingAlert ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Scheduling...
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" /> Schedule Alert
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
