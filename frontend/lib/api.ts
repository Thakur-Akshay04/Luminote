import axios from "axios";
import { useAuth } from "@clerk/nextjs";
import type {
  Note,
  NoteCreate,
  NoteUpdate,
  SearchResponse,
  AskResponse,
  Alert,
  SummarizeResponse,
  DrawingResponse,
  TranscriptResponse,
  ExtractTasksResponse,
  AudioUploadResponse,
} from "@/types";

export const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const api = axios.create({ baseURL: BASE_URL });

// Attach Clerk JWT to every request automatically via window.Clerk
api.interceptors.request.use(async (config) => {
  if (typeof window !== "undefined" && (window as any).Clerk?.session) {
    try {
      const token = await (window as any).Clerk.session.getToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (err) {
      console.error("Failed to fetch Clerk token for API request:", err);
    }
  }
  return config;
});

// On 401, redirect to sign-in page
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== "undefined") {
      window.location.href = "/sign-in";
    }
    return Promise.reject(err);
  }
);

// ── Hook for custom fetch calls with Clerk Auth ──────────────────────────────
export function useApi() {
  const { getToken } = useAuth();

  const apiFetch = async (url: string, options: RequestInit = {}) => {
    const token = await getToken();

    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const res = await fetch(`${baseUrl}${url}`, {
      ...options,
      headers,
    });

    if (!res.ok) throw new Error(await res.text());
    return res.json();
  };

  return { apiFetch, notesApi, alertsApi, searchApi, usersApi };
}

// ── Notes ─────────────────────────────────────────────────────────────────────
export const notesApi = {
  list: (tag?: string, noteType?: string) =>
    api.get<Note[]>("/notes", {
      params: {
        ...(tag ? { tag } : {}),
        ...(noteType ? { note_type: noteType } : {}),
      },
    }),
  get: (id: string) => api.get<Note>(`/notes/${id}`),
  create: (data: NoteCreate) => api.post<Note>("/notes", data),
  update: (id: string, data: NoteUpdate) => api.put<Note>(`/notes/${id}`, data),
  delete: (id: string) => api.delete(`/notes/${id}`),
  ask: (id: string, question: string) =>
    api.post<AskResponse>(`/notes/${id}/ask`, { question }),
  summarize: (id: string, format: string, extractAlerts: boolean) =>
    api.post<SummarizeResponse>(`/notes/${id}/summarize`, { format, extract_alerts: extractAlerts }),

  // Freehand Drawing
  saveDrawing: (id: string, base64Image: string) =>
    api.post<DrawingResponse>(`/notes/${id}/drawing`, { image: base64Image }),
  getDrawing: (id: string) =>
    api.get<DrawingResponse>(`/notes/${id}/drawing`),
  switchDrawingVersion: (id: string, version: number) =>
    api.post<DrawingResponse>(`/notes/${id}/drawing/switch`, { version }),
  deleteDrawingVersion: (id: string, version: number) =>
    api.delete<DrawingResponse>(`/notes/${id}/drawing/version/${version}`),

  // Audio Recording & Transcription
  uploadAudio: (id: string, audioBlob: Blob) => {
    const formData = new FormData();
    formData.append("file", audioBlob, "recording.mp3");
    return api.post<AudioUploadResponse>(`/notes/${id}/audio`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  transcribeAudio: (id: string, force: boolean = false) =>
    api.post<TranscriptResponse>(`/notes/${id}/transcribe${force ? "?force=true" : ""}`),

  // To-do Checklist
  toggleChecklistItem: (id: string, index: number, checked: boolean) =>
    api.patch(`/notes/${id}/checklist/${index}`, { checked }),
  extractTasks: (id: string) =>
    api.post<ExtractTasksResponse>(`/notes/${id}/extract-tasks`),
  uploadImage: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post<{ url: string }>("/notes/upload-image", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
};

// ── Alerts ────────────────────────────────────────────────────────────────────
export const alertsApi = {
  list: () => api.get<Alert[]>("/alerts"),
  create: (data: { note_id: string; title: string; alert_time: string }) =>
    api.post<Alert>("/alerts", data),
  delete: (id: string) => api.delete(`/alerts/${id}`),
};

// ── Search ────────────────────────────────────────────────────────────────────
export const searchApi = {
  semantic: (query: string) =>
    api.post<SearchResponse>("/search", { query }),
};

// ── Users ─────────────────────────────────────────────────────────────────────
export const usersApi = {
  uploadAvatar: (file: Blob, onUploadProgress?: (progressEvent: any) => void) => {
    const formData = new FormData();
    formData.append("file", file, "avatar.jpg");
    return api.post<{ avatar_url: string }>("/users/me/avatar", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress,
    });
  },
  deleteAvatar: () => api.delete<{ message: string }>("/users/me/avatar"),
  changeEmail: (newEmail: string, confirmNewEmail: string) =>
    api.patch<{ message: string }>("/users/me/email", { new_email: newEmail, confirm_new_email: confirmNewEmail }),
  changeName: (displayName: string) =>
    api.patch<{ display_name: string }>("/users/me/name", { display_name: displayName }),
  deleteMe: () => api.delete<void>("/users/me"),
};
