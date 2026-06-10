// Office — types for the Office workspace (Spreadsheet, Document, PDF, Todo).

export type OfficeDocKind = "spreadsheet" | "document" | "pdf" | "file";

export interface OfficeDocBase {
  id: string;
  name: string;
  kind: OfficeDocKind;
  createdAt: number;
  updatedAt: number;
}

export interface SpreadsheetDoc extends OfficeDocBase {
  kind: "spreadsheet";
  /** 2D array of raw cell values (as entered). Formula starts with "=". */
  cells: string[][];
  /** Column count — renders at least this many columns. */
  cols: number;
  /** Row count — renders at least this many rows. */
  rows: number;
}

export interface DocumentDoc extends OfficeDocBase {
  kind: "document";
  /** TipTap HTML content. */
  html: string;
}

export interface PdfDoc extends OfficeDocBase {
  kind: "pdf";
  /** Stored as data URL for offline use (small/medium PDFs). */
  dataUrl: string;
  size: number;
}

/** Generic file we can't convert but can still display/download (images, old .doc, etc). */
export interface FileDoc extends OfficeDocBase {
  kind: "file";
  dataUrl: string;
  size: number;
  mimeType: string;
  /** Lowercase extension without the dot, e.g. "png", "doc". Used by the viewer. */
  extension: string;
}

export type OfficeDoc = SpreadsheetDoc | DocumentDoc | PdfDoc | FileDoc;

export type TodoPriority = "low" | "normal" | "high";

export interface TodoItem {
  id: string;
  title: string;
  done: boolean;
  priority: TodoPriority;
  dueDate?: string; // ISO date
  tags: string[];
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface TodoList {
  id: string;
  name: string;
  color: string; // hex accent
  items: TodoItem[];
  createdAt: number;
  updatedAt: number;
}
