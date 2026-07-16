"use client";

import { useEffect, useState, useRef } from "react";
import { isAuthenticated, getToken } from "@/lib/auth";
import { Bell, X, ExternalLink } from "lucide-react";
import Link from "next/link";

interface ToastAlert {
  id: string;
  title: string;
  note_id: string;
  note_title?: string;
  alert_time: string;
}

export default function AlertListener() {
  const [toasts, setToasts] = useState<ToastAlert[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeAudios = useRef<{ [id: string]: { audioCtx: AudioContext; intervalId?: NodeJS.Timeout | number } }>({});

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const active = activeAudios.current[id];
    if (active) {
      if (active.intervalId) clearInterval(active.intervalId);
      active.audioCtx.close().catch(() => {});
      delete activeAudios.current[id];
    }
  };

  const connectWebSocket = () => {
    if (wsRef.current) return;

    const token = getToken();
    if (!token) return;

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

          // Play a subtle notification sound (browser-safe, fallback to silent if blocked)
          try {
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            
            const playChime = () => {
              const startTime = audioCtx.currentTime;
              
              // First note: C5 (523.25 Hz) - Softer, warm triangle wave
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

              // Second note: E5 (659.25 Hz) - Pure sine wave, slightly delayed by 100ms
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
            };

            // Play once immediately
            playChime();

            // Play 4 more times spaced by 1.2s intervals (total duration ~5.5s)
            let playCount = 1;
            const intervalId = setInterval(() => {
              if (playCount >= 5) {
                clearInterval(intervalId);
                audioCtx.close().catch(() => {});
                delete activeAudios.current[newAlert.id];
              } else {
                playChime();
                playCount++;
              }
            }, 1200);

            // Store references in a ref to keep context from garbage collection and enable manual stop
            activeAudios.current[newAlert.id] = { audioCtx, intervalId };
          } catch (e) {
            // Audio context failed to play (e.g. no user interaction yet), ignore
          }

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

    ws.onclose = () => {
      console.log("Alerts WebSocket closed. Reconnecting in 5 seconds...");
      wsRef.current = null;
      reconnectTimeoutRef.current = setTimeout(connectWebSocket, 5000);
    };

    ws.onerror = (err) => {
      console.warn("Alerts WebSocket error:", err);
      ws.close();
    };
  };

  useEffect(() => {
    // Start connection if authenticated
    if (isAuthenticated()) {
      connectWebSocket();
    }

    // Periodically poll auth state in case they log in later
    const checkInterval = setInterval(() => {
      if (isAuthenticated() && !wsRef.current) {
        connectWebSocket();
      } else if (!isAuthenticated() && wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    }, 3000);

    return () => {
      clearInterval(checkInterval);
      if (wsRef.current) {
        // Remove close listener to prevent loop reconnections during unmount
        wsRef.current.onclose = null;
        wsRef.current.close();
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
  }, []);

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
