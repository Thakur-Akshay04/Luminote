"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { Bell, X, ExternalLink } from "lucide-react";
import Link from "next/link";
import { alertsApi } from "@/lib/api";

interface ToastAlert {
  id: string;
  title: string;
  note_id: string;
  note_title?: string;
  alert_time: string;
}

function playChime(audioCtx: AudioContext) {
  const startTime = audioCtx.currentTime;

  // First note: C5 (523.25 Hz)
  const osc1 = audioCtx.createOscillator();
  const gain1 = audioCtx.createGain();
  osc1.connect(gain1);
  gain1.connect(audioCtx.destination);
  osc1.type = "triangle";
  osc1.frequency.setValueAtTime(523.25, startTime);
  gain1.gain.setValueAtTime(0, startTime);
  gain1.gain.linearRampToValueAtTime(0.12, startTime + 0.04);
  gain1.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.45);
  osc1.start(startTime);
  osc1.stop(startTime + 0.5);

  // Second note: E5 (659.25 Hz)
  const osc2 = audioCtx.createOscillator();
  const gain2 = audioCtx.createGain();
  osc2.connect(gain2);
  gain2.connect(audioCtx.destination);
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(659.25, startTime + 0.12);
  gain2.gain.setValueAtTime(0, startTime + 0.12);
  gain2.gain.linearRampToValueAtTime(0.12, startTime + 0.16);
  gain2.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.7);
  osc2.start(startTime + 0.12);
  osc2.stop(startTime + 0.75);
}

async function startNotificationChime(
  alertId: string,
  activeAudios: React.MutableRefObject<{ [id: string]: { audioCtx: AudioContext; intervalId?: NodeJS.Timeout | number } }>
) {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioContextClass();
    if (audioCtx.state === "suspended") {
      await audioCtx.resume().catch(() => {});
    }
    playChime(audioCtx);

    let playCount = 1;
    const intervalId = setInterval(async () => {
      if (playCount >= 9) {
        clearInterval(intervalId);
        audioCtx.close().catch(() => {});
        delete activeAudios.current[alertId];
      } else {
        if (audioCtx.state === "suspended") {
          await audioCtx.resume().catch(() => {});
        }
        playChime(audioCtx);
        playCount++;
      }
    }, 1200);

    activeAudios.current[alertId] = { audioCtx, intervalId };
  } catch (e) {
    console.warn("Audio context playback notification failed:", e);
  }
}

function buildToastAlert(data: any): ToastAlert {
  return {
    id: data.id,
    title: data.title,
    note_id: data.note_id,
    note_title: data.note_title,
    alert_time: data.alert_time,
  };
}

function addUniqueToast(prev: ToastAlert[], newAlert: ToastAlert): ToastAlert[] {
  if (prev.some((t) => t.id === newAlert.id)) return prev;
  return [...prev, newAlert];
}

function stopAudio(active: { audioCtx: AudioContext; intervalId?: NodeJS.Timeout | number }) {
  if (active.intervalId) clearInterval(active.intervalId);
  active.audioCtx.close().catch(() => {});
}

export default function AlertListener() {
  const { getToken, isSignedIn } = useAuth();
  const [toasts, setToasts] = useState<ToastAlert[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeAudios = useRef<{ [id: string]: { audioCtx: AudioContext; intervalId?: NodeJS.Timeout | number } }>({});
  const connectingRef = useRef(false);
  const notifiedAlertIdsRef = useRef<Set<string>>(new Set());

  // Unlock AudioContext on first user interaction anywhere on page
  useEffect(() => {
    const unlockAudio = () => {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          const dummyCtx = new AudioContextClass();
          if (dummyCtx.state === "suspended") {
            dummyCtx.resume().catch(() => {});
          }
          setTimeout(() => dummyCtx.close().catch(() => {}), 100);
        }
      } catch {}
    };

    window.addEventListener("click", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });
    window.addEventListener("touchstart", unlockAudio, { once: true });

    return () => {
      window.removeEventListener("click", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      window.removeEventListener("touchstart", unlockAudio);
    };
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const active = activeAudios.current[id];
    if (active) {
      if (active.intervalId) clearInterval(active.intervalId);
      active.audioCtx.close().catch(() => {});
      delete activeAudios.current[id];
    }
  };

  const triggerAlertNotification = useCallback((data: any) => {
    const alertId = data.id;
    if (notifiedAlertIdsRef.current.has(alertId)) return;
    notifiedAlertIdsRef.current.add(alertId);

    const newAlert = buildToastAlert(data);
    startNotificationChime(newAlert.id, activeAudios);

    setToasts((prev) => addUniqueToast(prev, newAlert));

    // Auto-remove toast after 22 seconds (extended by 10s)
    setTimeout(() => {
      removeToast(newAlert.id);
    }, 22000);
  }, []);

  const connectWebSocket = useCallback(async () => {
    if (wsRef.current || connectingRef.current || !isSignedIn) return;

    connectingRef.current = true;
    try {
      let token: string | null = null;
      try {
        token = await getToken({ skipCache: true });
      } catch {}

      if (!token && typeof window !== "undefined" && (window as any).Clerk?.session) {
        try {
          token = await (window as any).Clerk.session.getToken();
        } catch {}
      }

      if (!token) {
        // Retry connection in 3s if token isn't ready yet
        connectingRef.current = false;
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
        return;
      }

      if (wsRef.current || !isSignedIn) return;

      const baseApiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const wsBase = baseApiUrl.replace(/^http/, "ws");
      const wsUrl = `${wsBase}/alerts/ws?token=${token}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        // Heartbeat ping every 25s to prevent disconnection
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, 25000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type !== "alert") return;
          triggerAlertNotification(data);
        } catch (err) {
          console.error("Error parsing WebSocket message:", err);
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, 4000);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      reconnectTimeoutRef.current = setTimeout(connectWebSocket, 4000);
    } finally {
      connectingRef.current = false;
    }
  }, [getToken, isSignedIn, triggerAlertNotification]);

  // HTTP Fallback Polling (polls every 8s to guarantee delivery if WS drops)
  useEffect(() => {
    if (!isSignedIn) return;

    const checkDueAlertsFallback = async () => {
      try {
        const res = await alertsApi.list();
        const now = Date.now();
        for (const alert of res.data) {
          const alertTimeMs = new Date(alert.alert_time).getTime();
          if (!alert.is_notified && alertTimeMs <= now + 2000) {
            triggerAlertNotification(alert);
            alertsApi.markNotified(alert.id).catch(() => {});
          }
        }
      } catch {}
    };

    checkDueAlertsFallback();
    const fallbackInterval = setInterval(checkDueAlertsFallback, 8000);

    return () => clearInterval(fallbackInterval);
  }, [isSignedIn, triggerAlertNotification]);

  useEffect(() => {
    if (isSignedIn) {
      connectWebSocket();
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      Object.values(activeAudios.current).forEach(stopAudio);
    };
  }, [isSignedIn, connectWebSocket]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-3 max-w-sm w-full px-4 sm:px-0">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="glass border-brand-500/30 p-4 shadow-glow flex items-start gap-3 animate-slide-in relative overflow-hidden"
          style={{
            backgroundImage: "linear-gradient(to right, rgba(64,96,245,0.06), transparent)",
          }}
        >
          {/* Pulsing Alert Bell */}
          <div className="w-9 h-9 rounded-xl bg-brand-500/20 flex items-center justify-center shrink-0 border border-brand-500/30 animate-pulse">
            <Bell className="w-4.5 h-4.5 text-brand-300" />
          </div>

          <div className="flex-1 min-w-0 pr-4">
            <h4 className="text-xs font-bold text-brand-300 uppercase tracking-wider mb-0.5">
              Reminder Alert!
            </h4>
            <p className="text-sm font-semibold text-white leading-snug mb-1">
              {toast.title}
            </p>
            {toast.note_title && (
              <Link
                href={`/notes/${toast.note_id}`}
                onClick={() => removeToast(toast.id)}
                className="inline-flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 underline font-medium"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open Note: {toast.note_title}</span>
              </Link>
            )}
          </div>

          {/* Close button */}
          <button
            onClick={() => removeToast(toast.id)}
            className="text-gray-500 hover:text-white p-1 rounded-lg transition-colors shrink-0"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
