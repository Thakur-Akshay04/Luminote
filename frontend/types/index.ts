export interface User {
  user_id: string;
  email: string;
  access_token: string;
}

export interface Note {
  id: string;
  user_id: string;
  title: string | null;
  content: string;
  summary: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface NoteCreate {
  title?: string;
  content: string;
}

export interface NoteUpdate {
  title?: string;
  content?: string;
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

// ── Spreadsheet Types ─────────────────────────────────────────────────────────

export interface CellFormat {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  fontSize?: number;
  fontColor?: string;
  backgroundColor?: string;
  textAlign?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  wrapText?: boolean;
  numberFormat?: "general" | "number" | "currency" | "percentage" | "date" | "time" | "text";
  decimals?: number;
  currencySymbol?: string;
  borderTop?: string;
  borderBottom?: string;
  borderLeft?: string;
  borderRight?: string;
}

export interface CellData {
  value?: string | number | boolean | null;
  formula?: string;
  format?: CellFormat;
  comment?: string;
}

export interface MergedCell {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export interface SheetData {
  cells: Record<string, CellData>; // key: "A1", "B3" etc.
  columnWidths: Record<number, number>; // col index → width px
  rowHeights: Record<number, number>;   // row index → height px
  mergedCells: MergedCell[];
  frozenRows: number;
  frozenCols: number;
}

export interface SheetMeta {
  id: string;
  name: string;
  index: number;
}

export interface Spreadsheet {
  id: string;
  user_id: string;
  title: string;
  workbook_data: Record<string, SheetData> | null;
  sheets: SheetMeta[] | null;
  active_sheet_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SpreadsheetCreate {
  title?: string;
}

export interface SpreadsheetUpdate {
  title?: string;
  workbook_data?: Record<string, SheetData>;
  sheets?: SheetMeta[];
  active_sheet_id?: string;
}
