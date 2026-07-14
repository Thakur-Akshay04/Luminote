export interface User {
  user_id: string;
  email: string;
  access_token: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}

export interface Note {
  id: string;
  user_id: string;
  title: string | null;
  content: string;
  summary: string | null;
  tags: string[] | null;
  note_type: string;
  media_url: string | null;
  transcript: string | null;
  checklist_items: ChecklistItem[] | null;
  created_at: string;
  updated_at: string;
}

export interface NoteCreate {
  title?: string;
  content: string;
  note_type?: string;
}

export interface NoteUpdate {
  title?: string;
  content?: string;
  note_type?: string;
  checklist_items?: ChecklistItem[];
}

export interface SearchResultItem {
  id: string;
  user_id: string;
  title: string | null;
  content: string;
  summary: string | null;
  tags: string[] | null;
  similarity: number;
  created_at: string;
  updated_at: string;
}

export interface SearchResponse {
  results: SearchResultItem[];
  cached: boolean;
}

export interface AskResponse {
  answer: string;
  note_id: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user_id: string;
  email: string;
}

export interface Alert {
  id: string;
  user_id: string;
  note_id: string;
  title: string;
  alert_time: string;
  is_notified: boolean;
  created_by_ai: boolean;
  created_at: string;
  note_title?: string;
}

export interface SummarizeResponse {
  note: Note;
  alerts: Alert[];
}

export interface DrawingResponse {
  media_url: string | null;
  versions: string[];
}

export interface TranscriptResponse {
  transcript: string;
}

export interface ExtractTasksResponse {
  tasks: ChecklistItem[];
}

export interface AudioUploadResponse {
  media_url: string;
}
