"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { notesApi } from "@/lib/api";
import { Mic, Square, Loader2, Play, Volume2, Copy, Check, Sparkles, RefreshCw } from "lucide-react";

interface AudioRecorderProps {
  noteId: string;
  mediaUrl: string | null;
  transcript: string | null;
  onTranscriptUpdate: (newTranscript: string) => void;
  onMediaUrlUpdate: (newUrl: string) => void;
}

export default function AudioRecorder({
  noteId,
  mediaUrl,
  transcript,
  onTranscriptUpdate,
  onMediaUrlUpdate,
}: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [loading, setLoading] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stop timer and audio tracks on cleanup
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const startRecording = async () => {
    setError(null);
    audioChunksRef.current = [];
    setRecordingTime(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const options = { mimeType: "audio/webm" };
      
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all audio stream tracks to release microphone
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        await handleUpload(audioBlob);
      };

      mediaRecorder.start(250); // Slice every 250ms
      setIsRecording(true);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error("Microphone access error:", err);
      setError("Microphone access denied or not supported.");
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    }
  };

  const stopRecording = () => {
    if (!mediaRecorderRef.current || !isRecording) return;
    
    mediaRecorderRef.current.stop();
    setIsRecording(false);
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const handleUpload = async (audioBlob: Blob) => {
    setLoading(true);
    setError(null);
    try {
      const res = await notesApi.uploadAudio(noteId, audioBlob);
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
      const res = await notesApi.transcribeAudio(noteId, force);
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
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  const audioUrl = mediaUrl ? `${baseUrl}${mediaUrl}?t=${Date.now()}` : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Recorder Panel */}
      <div className="glass p-6 flex flex-col items-center justify-center gap-6 min-h-[220px]">
        {isRecording ? (
          <div className="flex flex-col items-center gap-3">
            {/* Pulsing microphone icon */}
            <div className="w-16 h-16 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-500 animate-pulse">
              <Mic className="w-7 h-7" />
            </div>
            
            {/* Visual soundwave effect */}
            <div className="flex items-center gap-1 h-6">
              {[1, 2, 3, 4, 5, 4, 3, 2, 1].map((h, i) => (
                <span
                  key={i}
                  className="w-1 rounded-sm bg-red-500 animate-pulse"
                  style={{
                    height: `${h * 4}px`,
                    animationDelay: `${i * 0.1}s`,
                    animationDuration: "0.6s",
                  }}
                />
              ))}
            </div>

            <span className="text-xl font-mono text-gray-200">{formatTime(recordingTime)}</span>
            <span className="text-xs text-gray-500">Recording audio...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
              <Mic className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h4 className="font-semibold text-sm text-gray-200">Voice Note Recorder</h4>
              <p className="text-xs text-gray-500 max-w-xs leading-normal">
                Record your voice to save it as an MP3. You can transcribe it using AI on demand.
              </p>
            </div>
          </div>
        )}

        {/* Buttons */}
        <div className="flex items-center gap-3">
          {isRecording ? (
            <button
              onClick={stopRecording}
              className="btn-danger flex items-center gap-2 px-6 py-2.5 rounded-xs"
              id="stop-recording-btn"
            >
              <Square className="w-4 h-4 fill-red-400" />
              Stop & Save
            </button>
          ) : (
            <button
              onClick={startRecording}
              disabled={loading || transcribing}
              className="btn-primary flex items-center gap-2 px-6 py-2.5 rounded-xs"
              id="start-recording-btn"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
              {loading ? "Saving audio..." : "Record Audio"}
            </button>
          )}
        </div>

        {/* Error message */}
        {error && (
          <div className="w-full max-w-md px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xs text-xs text-red-400 text-center">
            {error}
          </div>
        )}
      </div>

      {/* Audio Player and Transcription Trigger */}
      {audioUrl && !isRecording && (
        <div className="glass p-5 flex flex-col gap-4 animate-fade-in">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
            <div className="flex items-center gap-1.5">
              <Volume2 className="w-4 h-4 text-neutral-400" />
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Voice Recording Player
              </span>
            </div>
          </div>
          
          <audio src={audioUrl} controls className="w-full" id="voice-note-audio-player" />

          {!transcript && (
            <button
              onClick={() => handleTranscribe(false)}
              disabled={transcribing}
              className="btn-primary w-full py-2 flex items-center justify-center gap-2"
              id="transcribe-audio-btn"
            >
              {transcribing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {transcribing ? "Transcribing Audio..." : "Transcribe Audio"}
            </button>
          )}
        </div>
      )}

      {/* Transcript Results Panel */}
      {transcript && !isRecording && (
        <div className="glass p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-brand-400 fill-brand-400" />
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Voice Transcript
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleTranscribe(true)}
                disabled={transcribing}
                className="text-neutral-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1 text-xs"
                title="Regenerate transcript"
                id="regenerate-transcript-btn"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${transcribing ? "animate-spin text-brand-400" : ""}`} />
                <span>{transcribing ? "Regenerating..." : "Regenerate"}</span>
              </button>
              <button
                onClick={copyToClipboard}
                className="text-neutral-400 hover:text-white transition-colors flex items-center gap-1 text-xs"
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
          <p className="text-sm text-gray-300 leading-relaxed font-sans whitespace-pre-wrap">
            {transcript}
          </p>
        </div>
      )}
    </div>
  );
}
