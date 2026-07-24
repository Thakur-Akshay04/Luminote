"use client";

import { useEffect, useState, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { Bell, X, ExternalLink } from "lucide-react";
import Link from "next/link";

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
  gain1.gain.linearRampToValueAtTime(0.08, startTime + 0.04);
  gain1.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.4);
  osc1.start(startTime);
  osc1.stop(startTime + 0.45);

  // Second note: E5 (659.25 Hz)
  const osc2 = audioCtx.createOscillator();
  const gain2 = audioCtx.createGain();
  osc2.connect(gain2);
  gain2.connect(audioCtx.destination);
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(659.25, startTime + 0.1);
  gain2.gain.setValueAtTime(0, startTime + 0.1);
  gain2.gain.linearRampToValueAtTime(0.08, startTime + 0.14);
  gain2.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.65);
  osc2.start(startTime + 0.1);
  osc2.stop(startTime + 0.7);
}

function startNotificationChime(
  alertId: string,
  activeAudios: React.MutableRefObject<{ [id: string]: { audioCtx: AudioContext; intervalId?: NodeJS.Timeout | number } }>
) {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioContextClass();
    playChime(audioCtx);

    let playCount = 1;
    const intervalId = setInterval(() => {
      if (playCount >= 5) {
        clearInterval(intervalId);
        audioCtx.close().catch(() => {});
        delete activeAudios.current[alertId];
      } else {
        playChime(audioCtx);
        playCount++;
      }
    }, 1200);

    activeAudios.current[alertId] = { audioCtx, intervalId };
  } catch (e) {
    console.warn("Audio context playback notification failed:", e);
  }
}

export default function AlertListener() {
  const { getToken, isSignedIn } = useAuth();
  const [toasts, setToasts] = useState<ToastAlert[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeAudios = useRef<{ [id: string]: { audioCtx: AudioContext; intervalId?: NodeJS.Timeout | number } }>({});
  const connectingRef = useRef(false);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const active = activeAudios.current[id];
    if (active) {
      if (active.intervalId) clearInterval(active.intervalId);
      active.audioCtx.close().catch(() => {});
      delete activeAudios.current[id];
    }
  };

  const connectWebSocket = async () => {
    if (wsRef.current || connectingRef.current || !isSignedIn) return;

    connectingRef.current = true;
    try {
      const token = await getToken({ skipCache: true });
      if (!token) return;

      // Double-check flags in case they changed during token fetch
      if (wsRef.current || !isSignedIn) return;

      // Convert http(s) API URL to ws(s)
      const baseApiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const wsBase = baseApiUrl.replace(/^http/, "ws");
      const wsUrl = `${wsBase}/alerts/ws?token=${token}`;

      console.log("Connecting to Alerts WebSocket:", wsUrl);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("Alerts WebSocket connected.");
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "alert") {
            const newAlert: ToastAlert = {
              id: data.id,
              title: data.title,
              note_id: data.note_id,
              note_title: data.note_title,
              alert_time: data.alert_time,
            };

            startNotificationChime(newAlert.id, activeAudios);

            // Add to active toast list
            setToasts((prev) => {
              // Avoid duplicate toasts for the same alert
              if (prev.some((t) => t.id === newAlert.id)) return prev;
              return [...prev, newAlert];
            });

            // Auto-remove toast after 10 seconds
            setTimeout(() => {
              removeToast(newAlert.id);
            }, 10000);
          }
        } catch (err) {
          console.error("Error parsing WebSocket message:", err);
        }
      };

      ws.onclose = (event) => {
        console.log(`Alerts WebSocket closed (code: ${event.code}, reason: ${event.reason || "none"}). Reconnecting in 5 seconds...`);
        wsRef.current = null;
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, 5000);
      };

      ws.onerror = (err) => {
        console.warn("Alerts WebSocket error:", err);
        ws.close();
      };
    } catch (err) {
      console.error("Error setting up WebSocket:", err);
    } finally {
      connectingRef.current = false;
    }
  };

  useEffect(() => {
    // Start connection if authenticated
    if (isSignedIn) {
      connectWebSocket();
    }

    return () => {
      if (wsRef.current) {
        // Remove close listener to prevent loop reconnections during unmount
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      // Stop and clean up any playing audios on unmount
      Object.values(activeAudios.current).forEach((active) => {
        if (active.intervalId) clearInterval(active.intervalId);
        active.audioCtx.close().catch(() => {});
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn]);


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
