import axios from "axios";
import { getToken, clearAuth } from "@/lib/auth";
import type {
  AuthResponse,
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

// Attach JWT to every request
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401, clear auth and redirect
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== "undefined") {
      clearAuth();
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  register: (email: string, password: string, name?: string) =>
    api.post<AuthResponse>("/auth/register", { email, password, name }),
  login: (email: string, password: string) =>
    api.post<AuthResponse>("/auth/login", { email, password }),
  updatePassword: (currentPassword: string, newPassword: string) =>
    api.put("/auth/password", { current_password: currentPassword, new_password: newPassword }),
  deleteAccount: () =>
    api.delete("/auth/account"),
};

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

  // ── Feature 1: Freehand Drawing ──────────────────────────────────────────
  saveDrawing: (id: string, base64Image: string) =>
    api.post<DrawingResponse>(`/notes/${id}/drawing`, { image: base64Image }),
  getDrawing: (id: string) =>
    api.get<DrawingResponse>(`/notes/${id}/drawing`),
  switchDrawingVersion: (id: string, version: number) =>
    api.post<DrawingResponse>(`/notes/${id}/drawing/switch`, { version }),
  deleteDrawingVersion: (id: string, version: number) =>
    api.delete<DrawingResponse>(`/notes/${id}/drawing/version/${version}`),

  // ── Feature 2: Audio Recording & Transcription ───────────────────────────
  uploadAudio: (id: string, audioBlob: Blob) => {
    const formData = new FormData();
    formData.append("file", audioBlob, "recording.mp3");
    return api.post<AudioUploadResponse>(`/notes/${id}/audio`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  transcribeAudio: (id: string, force: boolean = false) =>
    api.post<TranscriptResponse>(`/notes/${id}/transcribe${force ? "?force=true" : ""}`),

  // ── Feature 3: To-do Checklist ───────────────────────────────────────────
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
  changePassword: (currentPassword: string, newPassword: string) =>
    api.patch<{ message: string }>("/users/me/password", { current_password: currentPassword, new_password: newPassword }),
  changeName: (displayName: string) =>
    api.patch<{ display_name: string }>("/users/me/name", { display_name: displayName }),
  deleteMe: () => api.delete<void>("/users/me"),
};


