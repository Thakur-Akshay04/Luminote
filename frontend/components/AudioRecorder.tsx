"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { notesApi } from "@/lib/api";
import {
  Mic,
  Square,
  Play,
  Pause,
  RotateCcw,
  Loader2,
  Volume2,
  VolumeX,
  Copy,
  Check,
  Wand2,
  RefreshCw,
  Sparkles,
  Radio,
  FileAudio,
} from "lucide-react";

interface AudioRecorderProps {
  noteId: string;
  mediaUrl: string | null;
  transcript: string | null;
  onTranscriptUpdate: (newTranscript: string) => void;
  onMediaUrlUpdate: (newUrl: string) => void;
  onSaveBeforeAction?: () => Promise<string>;
}

function getSupportedMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
    "audio/aac",
    "audio/wav",
  ];
  for (const t of types) {
    if (MediaRecorder.isTypeSupported(t)) {
      return t;
    }
  }
  return "";
}

function formatAudioUrl(url: string | null, base: string): string | null {
  if (!url) return null;
  let fullUrl = url;
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    const cleanBase = base.replace(/\/+$/, "");
    const cleanPath = url.startsWith("/") ? url : `/${url}`;
    fullUrl = `${cleanBase}${cleanPath}`;
  }
  return fullUrl;
}

export default function AudioRecorder({
  noteId,
  mediaUrl,
  transcript,
  onTranscriptUpdate,
  onMediaUrlUpdate,
  onSaveBeforeAction,
}: Readonly<AudioRecorderProps>) {
  // Recorder State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [loading, setLoading] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Real-time Audio Level State for Canvas Waveform
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const audioLevelsHistory = useRef<number[]>(new Array(40).fill(10));

  // Audio Player Custom Controls State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  const audioUrl = useMemo(() => {
    if (!mediaUrl) return null;
    return formatAudioUrl(mediaUrl, baseUrl);
  }, [mediaUrl, baseUrl]);

  // Audio Visualizer loop
  const startVisualizer = (stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateVisualizer = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalized = Math.min(100, Math.max(12, (avg / 128) * 100));
        setAudioLevel(normalized);

        audioLevelsHistory.current.push(normalized);
        if (audioLevelsHistory.current.length > 40) {
          audioLevelsHistory.current.shift();
        }

        animFrameRef.current = requestAnimationFrame(updateVisualizer);
      };
      updateVisualizer();
    } catch (e) {
      console.warn("Visualizer setup error:", e);
    }
  };

  const stopVisualizer = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
  };

  // Reload audio player element when audioUrl changes
  useEffect(() => {
    if (audioPlayerRef.current && audioUrl) {
      setIsPlaying(false);
      setCurrentTime(0);
      audioPlayerRef.current.load();
    }
  }, [audioUrl]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      stopVisualizer();
    };
  }, []);

  // Recorder handlers
  const startRecording = async () => {
    setError(null);
    audioChunksRef.current = [];
    setRecordingTime(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = getSupportedMimeType();
      const options = mimeType ? { mimeType } : undefined;

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stopVisualizer();
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }

        if (audioChunksRef.current.length === 0) {
          setError("No audio recorded. Please try again.");
          return;
        }

        const recordingMime = mediaRecorder.mimeType || mimeType || "audio/webm";
        const audioBlob = new Blob(audioChunksRef.current, { type: recordingMime });
        await handleUpload(audioBlob, recordingMime);
      };

      startVisualizer(stream);
      mediaRecorder.start(250);
      setIsRecording(true);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error("Microphone access error:", err);
      setError("Microphone access denied or not supported in this browser.");
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    }
  };

  const stopRecording = () => {
    if (!mediaRecorderRef.current || !isRecording) return;
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.requestData();
      } catch (e) {
        console.warn("requestData warning:", e);
      }
      mediaRecorderRef.current.stop();
    }
  };

  const handleUpload = async (audioBlob: Blob, mimeType?: string) => {
    setLoading(true);
    setError(null);
    try {
      let activeId = noteId;
      if (noteId === "new" && onSaveBeforeAction) {
        activeId = await onSaveBeforeAction();
      }
      const ext = mimeType?.includes("mp4")
        ? "mp4"
        : mimeType?.includes("ogg")
        ? "ogg"
        : mimeType?.includes("wav")
        ? "wav"
        : "webm";
      const filename = `recording.${ext}`;
      const res = await notesApi.uploadAudio(activeId, audioBlob, filename);
      onMediaUrlUpdate(res.data.media_url);
    } catch (err: any) {
      console.error("Audio upload error:", err);
      setError(
        err.response?.data?.detail || "Failed to save audio recording. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleTranscribe = async (force: boolean = false) => {
    setTranscribing(true);
    setError(null);
    try {
      let activeId = noteId;
      if (noteId === "new" && onSaveBeforeAction) {
        activeId = await onSaveBeforeAction();
      }
      const res = await notesApi.transcribeAudio(activeId, force);
      onTranscriptUpdate(res.data.transcript);
    } catch (err: any) {
      console.error("Audio transcription error:", err);
      setError(
        err.response?.data?.detail || "Failed to transcribe audio. Please try again."
      );
    } finally {
      setTranscribing(false);
    }
  };

  const copyToClipboard = () => {
    if (!transcript) return;
    navigator.clipboard.writeText(transcript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0 || !isFinite(seconds)) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Custom Player Handlers
  const togglePlay = async () => {
    if (!audioPlayerRef.current || !audioUrl) return;
    if (isPlaying) {
      audioPlayerRef.current.pause();
    } else {
      try {
        if (audioPlayerRef.current.readyState === 0) {
          audioPlayerRef.current.load();
        }
        await audioPlayerRef.current.play();
      } catch (err: any) {
        if (err.name !== "AbortError") {
          console.error("Audio playback error:", err);
          setError("Audio playback failed. Please try clicking play again or reloading.");
        }
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (audioPlayerRef.current) {
      audioPlayerRef.current.currentTime = val;
    }
  };

  const toggleMute = () => {
    if (!audioPlayerRef.current) return;
    audioPlayerRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const cyclePlaybackRate = () => {
    const rates = [1, 1.25, 1.5, 2];
    const nextRate = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
    setPlaybackRate(nextRate);
    if (audioPlayerRef.current) {
      audioPlayerRef.current.playbackRate = nextRate;
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-2xl mx-auto">
      {/* ── Studio Audio Recording Deck ──────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-[#16161a] to-[#0d0d10] border border-white/[0.08] shadow-2xl p-6 sm:p-8 flex flex-col items-center justify-center gap-6 text-center">
        {/* Background Ambient Glow */}
        <div
          className={`absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full blur-3xl transition-all duration-700 pointer-events-none ${
            isRecording
              ? "bg-red-500/20 scale-125"
              : audioUrl
              ? "bg-brand-500/15"
              : "bg-indigo-500/10"
          }`}
        />

        {isRecording ? (
          <div className="flex flex-col items-center gap-4 z-10 w-full">
            {/* Live Recording Mic Badge */}
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-semibold uppercase tracking-wider animate-pulse">
              <Radio className="w-3.5 h-3.5" />
              <span>Recording Live</span>
            </div>

            {/* Dynamic Soundwave Visualizer */}
            <div className="flex items-center justify-center gap-1 h-16 w-full max-w-sm px-4">
              {audioLevelsHistory.current.map((lvl, idx) => (
                <span
                  key={idx}
                  className="w-1.5 rounded-full bg-gradient-to-t from-red-600 via-rose-400 to-amber-300 transition-all duration-75"
                  style={{
                    height: `${Math.max(6, (lvl / 100) * 56)}px`,
                    opacity: 0.4 + (idx / 40) * 0.6,
                  }}
                />
              ))}
            </div>

            {/* Live Timer */}
            <span className="text-3xl font-mono font-bold tracking-tight text-white drop-shadow-md">
              {formatTime(recordingTime)}
            </span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 z-10">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-brand-600/30 to-indigo-600/30 border border-brand-500/30 flex items-center justify-center text-brand-400 shadow-lg shadow-brand-500/10">
              <Mic className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-base text-gray-100 tracking-tight">
                Voice Note Studio
              </h3>
              <p className="text-xs text-neutral-400 max-w-sm leading-relaxed">
                Capture high-quality audio ideas. Transcribe into actionable AI insights on-demand.
              </p>
            </div>
          </div>
        )}

        {/* Action Controls */}
        <div className="flex items-center gap-4 z-10">
          {isRecording ? (
            <button
              type="button"
              onClick={stopRecording}
              className="flex items-center gap-2 px-7 py-3 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white text-sm font-semibold shadow-lg shadow-red-500/25 active:scale-95 transition-all"
              id="stop-recording-btn"
            >
              <Square className="w-4 h-4 fill-white" />
              Stop & Save Recording
            </button>
          ) : (
            <button
              type="button"
              onClick={startRecording}
              disabled={loading || transcribing}
              className="flex items-center gap-2.5 px-7 py-3 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white text-sm font-semibold shadow-xl shadow-brand-500/20 hover:shadow-brand-500/30 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              id="start-recording-btn"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
              <span>{loading ? "Saving Audio..." : "Start Recording"}</span>
            </button>
          )}
        </div>

        {/* Error notification */}
        {error && (
          <div className="w-full max-w-md px-4 py-2.5 bg-red-500/10 border border-red-500/25 rounded-xl text-xs text-red-400 font-medium z-10">
            {error}
          </div>
        )}
      </div>

      {/* ── Custom HTML5 Audio Player Card ────────────────────────────────────── */}
      {audioUrl && !isRecording && (
        <div className="rounded-2xl bg-gradient-to-b from-[#18181c] to-[#0f0f12] border border-white/[0.08] shadow-2xl p-5 sm:p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
                <FileAudio className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-bold text-gray-200 uppercase tracking-wider">
                Voice Recording Player
              </span>
            </div>
            <div className="px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-[11px] font-mono font-medium text-gray-300 flex items-center gap-1 shadow-inner">
              <span className="text-brand-300 font-semibold">{formatTime(currentTime)}</span>
              <span className="text-neutral-500">/</span>
              <span className="text-neutral-400">{formatTime(duration)}</span>
            </div>
          </div>

          {/* Native Audio Element */}
          <audio
            key={audioUrl}
            ref={audioPlayerRef}
            src={audioUrl}
            preload="metadata"
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => {
              setIsPlaying(false);
              setCurrentTime(0);
            }}
            onTimeUpdate={() => {
              if (audioPlayerRef.current) {
                const cur = audioPlayerRef.current.currentTime;
                setCurrentTime(cur);
                const dur = audioPlayerRef.current.duration;
                if (isFinite(dur) && !isNaN(dur) && dur > 0) {
                  setDuration(dur);
                } else if (cur > duration) {
                  setDuration(cur);
                }
              }
            }}
            onLoadedMetadata={() => {
              if (audioPlayerRef.current) {
                const dur = audioPlayerRef.current.duration;
                if (isFinite(dur) && !isNaN(dur) && dur > 0) {
                  setDuration(dur);
                } else if (dur === Infinity) {
                  // WebM duration trick for browser recordings without fixed header
                  audioPlayerRef.current.currentTime = 1e101;
                  setTimeout(() => {
                    if (audioPlayerRef.current) {
                      const resolvedDur = audioPlayerRef.current.duration;
                      if (isFinite(resolvedDur) && !isNaN(resolvedDur)) {
                        setDuration(resolvedDur);
                      }
                      audioPlayerRef.current.currentTime = 0;
                    }
                  }, 50);
                }
              }
            }}
            onError={(e) => {
              const mediaErr = e.currentTarget.error;
              console.error("Audio player element error:", mediaErr?.code, mediaErr?.message, e);
              setError("Failed to load audio format. Try refreshing the page.");
            }}
            id="voice-note-audio-player"
          />

          {/* Modern Custom Controls Bar */}
          <div className="flex flex-col gap-3.5">
            {/* Scrubber Progress Range Slider */}
            <div className="relative w-full flex items-center group">
              {(() => {
                const progressPct =
                  isFinite(duration) && duration > 0
                    ? Math.min(100, Math.max(0, (currentTime / duration) * 100))
                    : 0;
                return (
                  <input
                    type="range"
                    min={0}
                    max={isFinite(duration) && duration > 0 ? duration : 100}
                    step={0.1}
                    value={currentTime}
                    onChange={handleSeek}
                    style={{
                      background: `linear-gradient(to right, #8b5cf6 0%, #a855f7 ${progressPct}%, #262626 ${progressPct}%, #262626 100%)`,
                    }}
                    className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-brand-400 focus:outline-none transition-all"
                  />
                );
              })()}
            </div>

            {/* Playback Button Toolbar */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={togglePlay}
                  className="w-11 h-11 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white flex items-center justify-center shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40 active:scale-95 transition-all"
                  title={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4 fill-white" />
                  ) : (
                    <Play className="w-4 h-4 fill-white translate-x-0.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (audioPlayerRef.current) {
                      audioPlayerRef.current.currentTime = 0;
                      setCurrentTime(0);
                    }
                  }}
                  className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] text-neutral-300 flex items-center justify-center active:scale-95 transition-all"
                  title="Restart"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={cyclePlaybackRate}
                  className="px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] text-xs font-mono font-semibold text-neutral-300 transition-all active:scale-95"
                  title="Playback Speed"
                >
                  {playbackRate}x
                </button>

                <button
                  type="button"
                  onClick={toggleMute}
                  className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] text-neutral-300 flex items-center justify-center active:scale-95 transition-all"
                  title={isMuted ? "Unmute" : "Mute"}
                >
                  {isMuted ? (
                    <VolumeX className="w-4 h-4 text-red-400" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {!transcript && (
            <button
              type="button"
              onClick={() => handleTranscribe(false)}
              disabled={transcribing}
              className="mt-2 w-full py-2.5 rounded-xl bg-gradient-to-r from-brand-600/90 to-indigo-600/90 hover:from-brand-500 hover:to-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-md active:scale-95 disabled:opacity-50 transition-all"
              id="transcribe-audio-btn"
            >
              {transcribing ? (
                <Loader2 className="w-4 h-4 animate-spin text-white" />
              ) : (
                <Wand2 className="w-4 h-4 text-white" />
              )}
              <span>{transcribing ? "Transcribing with Groq Whisper..." : "Transcribe Audio with AI"}</span>
            </button>
          )}
        </div>
      )}

      {/* ── Voice Transcript Card ────────────────────────────────────────────── */}
      {transcript && !isRecording && (
        <div className="rounded-2xl bg-[#141417] border border-white/[0.08] shadow-xl p-5 sm:p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brand-400" />
              <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">
                Voice Transcript
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleTranscribe(true)}
                disabled={transcribing}
                className="text-neutral-400 hover:text-white disabled:opacity-50 transition-colors flex items-center gap-1.5 text-xs font-medium"
                title="Regenerate transcript"
                id="regenerate-transcript-btn"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${transcribing ? "animate-spin text-brand-400" : ""}`}
                />
                <span>{transcribing ? "Regenerating..." : "Regenerate"}</span>
              </button>
              <button
                type="button"
                onClick={copyToClipboard}
                className="text-neutral-400 hover:text-white transition-colors flex items-center gap-1.5 text-xs font-medium"
                title="Copy to clipboard"
                id="copy-transcript-btn"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>
          <p className="text-sm text-gray-200 leading-relaxed font-sans whitespace-pre-wrap">
            {transcript}
          </p>
        </div>
      )}
    </div>
  );
}
