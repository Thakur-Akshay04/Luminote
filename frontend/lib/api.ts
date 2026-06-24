import axios from "axios";
import { getToken, clearAuth } from "@/lib/auth";
import type {
  AuthResponse,
  Note,
  NoteCreate,
  NoteUpdate,
  SearchResponse,
  AskResponse,
} from "@/types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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
  register: (email: string, password: string) =>
    api.post<AuthResponse>("/auth/register", { email, password }),
  login: (email: string, password: string) =>
    api.post<AuthResponse>("/auth/login", { email, password }),
};

// ── Notes ─────────────────────────────────────────────────────────────────────
export const notesApi = {
  list: (tag?: string) =>
    api.get<Note[]>("/notes", { params: tag ? { tag } : {} }),
  get: (id: string) => api.get<Note>(`/notes/${id}`),
  create: (data: NoteCreate) => api.post<Note>("/notes", data),
  update: (id: string, data: NoteUpdate) => api.put<Note>(`/notes/${id}`, data),
  delete: (id: string) => api.delete(`/notes/${id}`),
  ask: (id: string, question: string) =>
    api.post<AskResponse>(`/notes/${id}/ask`, { question }),
};

// ── Search ────────────────────────────────────────────────────────────────────
export const searchApi = {
  semantic: (query: string) =>
    api.post<SearchResponse>("/search", { query }),
};
