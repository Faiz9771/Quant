"use client";

import { create } from "zustand";
import { nanoid } from "nanoid";
import type {
  DocumentDoc,
  FileDoc,
  OfficeDoc,
  PdfDoc,
  SpreadsheetDoc,
  TodoItem,
  TodoList,
  TodoPriority,
} from "./types";

// ---------- Server sync helpers ----------

async function putDoc(doc: OfficeDoc): Promise<void> {
  try {
    await fetch(`/api/office/docs/${doc.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(doc),
    });
  } catch (err) {
    console.error("[office] failed to save doc", doc.id, err);
  }
}

async function deleteDocServer(id: string): Promise<void> {
  try {
    await fetch(`/api/office/docs/${id}`, { method: "DELETE" });
  } catch (err) {
    console.error("[office] failed to delete doc", id, err);
  }
}

async function putTodoList(list: TodoList): Promise<void> {
  try {
    await fetch(`/api/office/todo-lists/${list.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(list),
    });
  } catch (err) {
    console.error("[office] failed to save todo list", list.id, err);
  }
}

async function deleteTodoListServer(id: string): Promise<void> {
  try {
    await fetch(`/api/office/todo-lists/${id}`, { method: "DELETE" });
  } catch (err) {
    console.error("[office] failed to delete todo list", id, err);
  }
}

// ---------- Simple per-doc save coalescing ----------
//
// Cell edits fire on every keystroke; the TipTap editor already debounces to
// ~400ms but spreadsheets don't. Coalesce per id so fast typing becomes one
// PUT per ~250ms instead of one PUT per keystroke.
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const SAVE_DELAY_MS = 250;

function scheduleDocSave(getDoc: () => OfficeDoc | undefined, id: string) {
  const existing = saveTimers.get(id);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => {
    saveTimers.delete(id);
    const d = getDoc();
    if (d) void putDoc(d);
  }, SAVE_DELAY_MS);
  saveTimers.set(id, t);
}

function scheduleListSave(getList: () => TodoList | undefined, id: string) {
  const existing = saveTimers.get(`list:${id}`);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => {
    saveTimers.delete(`list:${id}`);
    const l = getList();
    if (l) void putTodoList(l);
  }, SAVE_DELAY_MS);
  saveTimers.set(`list:${id}`, t);
}

// ---------- Store ----------

interface OfficeState {
  docs: Record<string, OfficeDoc>;
  todoLists: Record<string, TodoList>;
  hydrated: boolean;
  hydrating: boolean;

  hydrate: () => Promise<void>;

  // Documents
  createSpreadsheet: (name?: string) => string;
  createSpreadsheetFromCells: (name: string, cells: string[][]) => string;
  createDocument: (name?: string, html?: string) => string;
  createPdf: (name: string, dataUrl: string, size: number) => string;
  createFile: (
    name: string,
    dataUrl: string,
    size: number,
    mimeType: string,
    extension: string
  ) => string;
  renameDoc: (id: string, name: string) => void;
  deleteDoc: (id: string) => void;
  updateSpreadsheet: (id: string, patch: Partial<SpreadsheetDoc>) => void;
  updateDocument: (id: string, html: string) => void;

  // Todo lists
  createTodoList: (name: string, color?: string) => string;
  renameTodoList: (id: string, name: string) => void;
  deleteTodoList: (id: string) => void;
  addTodo: (
    listId: string,
    title: string,
    opts?: Partial<Omit<TodoItem, "id" | "createdAt" | "updatedAt">>
  ) => string;
  updateTodo: (listId: string, itemId: string, patch: Partial<TodoItem>) => void;
  toggleTodo: (listId: string, itemId: string) => void;
  deleteTodo: (listId: string, itemId: string) => void;
  reorderTodos: (listId: string, itemIds: string[]) => void;
}

const DEFAULT_ROWS = 30;
const DEFAULT_COLS = 12;

function blankGrid(rows: number, cols: number): string[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => ""));
}

export const useOfficeStore = create<OfficeState>()((set, get) => ({
  docs: {},
  todoLists: {},
  hydrated: false,
  hydrating: false,

  hydrate: async () => {
    const s = get();
    if (s.hydrated || s.hydrating) return;
    set({ hydrating: true });
    try {
      const res = await fetch("/api/office/bootstrap", { cache: "no-store" });
      if (!res.ok) throw new Error(`Bootstrap failed: ${res.status}`);
      const data = (await res.json()) as {
        docs: OfficeDoc[];
        todoLists: TodoList[];
      };
      const docsMap: Record<string, OfficeDoc> = {};
      for (const d of data.docs) docsMap[d.id] = d;
      const listsMap: Record<string, TodoList> = {};
      for (const l of data.todoLists) listsMap[l.id] = l;
      set({
        docs: docsMap,
        todoLists: listsMap,
        hydrated: true,
        hydrating: false,
      });
    } catch (err) {
      console.error("[office] hydrate failed", err);
      set({ hydrating: false });
    }
  },

  createSpreadsheet: (name) => {
    const id = nanoid(10);
    const now = Date.now();
    const doc: SpreadsheetDoc = {
      id,
      kind: "spreadsheet",
      name: name || "Untitled spreadsheet",
      rows: DEFAULT_ROWS,
      cols: DEFAULT_COLS,
      cells: blankGrid(DEFAULT_ROWS, DEFAULT_COLS),
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({ docs: { ...s.docs, [id]: doc } }));
    void putDoc(doc);
    return id;
  },

  createDocument: (name, html) => {
    const id = nanoid(10);
    const now = Date.now();
    const doc: DocumentDoc = {
      id,
      kind: "document",
      name: name || "Untitled document",
      html: html ?? "<p></p>",
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({ docs: { ...s.docs, [id]: doc } }));
    void putDoc(doc);
    return id;
  },

  createSpreadsheetFromCells: (name, cells) => {
    const id = nanoid(10);
    const now = Date.now();
    const rows = Math.max(DEFAULT_ROWS, cells.length);
    const cols = Math.max(
      DEFAULT_COLS,
      cells.reduce((m, r) => Math.max(m, r.length), 0)
    );
    // Normalize to rows x cols, padding blanks.
    const grid: string[][] = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => cells[r]?.[c] ?? "")
    );
    const doc: SpreadsheetDoc = {
      id,
      kind: "spreadsheet",
      name: name || "Untitled spreadsheet",
      rows,
      cols,
      cells: grid,
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({ docs: { ...s.docs, [id]: doc } }));
    void putDoc(doc);
    return id;
  },

  createPdf: (name, dataUrl, size) => {
    const id = nanoid(10);
    const now = Date.now();
    const doc: PdfDoc = {
      id,
      kind: "pdf",
      name,
      dataUrl,
      size,
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({ docs: { ...s.docs, [id]: doc } }));
    void putDoc(doc);
    return id;
  },

  createFile: (name, dataUrl, size, mimeType, extension) => {
    const id = nanoid(10);
    const now = Date.now();
    const doc: FileDoc = {
      id,
      kind: "file",
      name,
      dataUrl,
      size,
      mimeType,
      extension,
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({ docs: { ...s.docs, [id]: doc } }));
    void putDoc(doc);
    return id;
  },

  renameDoc: (id, name) => {
    set((s) => {
      const d = s.docs[id];
      if (!d) return s;
      return {
        docs: { ...s.docs, [id]: { ...d, name, updatedAt: Date.now() } },
      };
    });
    const next = get().docs[id];
    if (next) void putDoc(next);
  },

  deleteDoc: (id) => {
    set((s) => {
      const { [id]: _, ...rest } = s.docs;
      void _;
      return { docs: rest };
    });
    void deleteDocServer(id);
  },

  updateSpreadsheet: (id, patch) => {
    set((s) => {
      const d = s.docs[id];
      if (!d || d.kind !== "spreadsheet") return s;
      const next: SpreadsheetDoc = {
        ...d,
        ...patch,
        updatedAt: Date.now(),
      };
      return { docs: { ...s.docs, [id]: next } };
    });
    scheduleDocSave(() => get().docs[id], id);
  },

  updateDocument: (id, html) => {
    set((s) => {
      const d = s.docs[id];
      if (!d || d.kind !== "document") return s;
      const next: DocumentDoc = { ...d, html, updatedAt: Date.now() };
      return { docs: { ...s.docs, [id]: next } };
    });
    scheduleDocSave(() => get().docs[id], id);
  },

  // Todos
  createTodoList: (name, color = "#b3b788") => {
    const id = nanoid(10);
    const now = Date.now();
    const list: TodoList = {
      id,
      name,
      color,
      items: [],
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({ todoLists: { ...s.todoLists, [id]: list } }));
    void putTodoList(list);
    return id;
  },

  renameTodoList: (id, name) => {
    set((s) => {
      const l = s.todoLists[id];
      if (!l) return s;
      return {
        todoLists: {
          ...s.todoLists,
          [id]: { ...l, name, updatedAt: Date.now() },
        },
      };
    });
    const next = get().todoLists[id];
    if (next) void putTodoList(next);
  },

  deleteTodoList: (id) => {
    set((s) => {
      const { [id]: _, ...rest } = s.todoLists;
      void _;
      return { todoLists: rest };
    });
    void deleteTodoListServer(id);
  },

  addTodo: (listId, title, opts) => {
    const itemId = nanoid(10);
    const now = Date.now();
    set((s) => {
      const list = s.todoLists[listId];
      if (!list) return s;
      const priority: TodoPriority = opts?.priority ?? "normal";
      const item: TodoItem = {
        id: itemId,
        title,
        done: opts?.done ?? false,
        priority,
        dueDate: opts?.dueDate,
        tags: opts?.tags ?? [],
        notes: opts?.notes,
        createdAt: now,
        updatedAt: now,
      };
      return {
        todoLists: {
          ...s.todoLists,
          [listId]: {
            ...list,
            items: [...list.items, item],
            updatedAt: now,
          },
        },
      };
    });
    scheduleListSave(() => get().todoLists[listId], listId);
    return itemId;
  },

  updateTodo: (listId, itemId, patch) => {
    set((s) => {
      const list = s.todoLists[listId];
      if (!list) return s;
      const now = Date.now();
      const items = list.items.map((it) =>
        it.id === itemId ? { ...it, ...patch, updatedAt: now } : it
      );
      return {
        todoLists: {
          ...s.todoLists,
          [listId]: { ...list, items, updatedAt: now },
        },
      };
    });
    scheduleListSave(() => get().todoLists[listId], listId);
  },

  toggleTodo: (listId, itemId) => {
    set((s) => {
      const list = s.todoLists[listId];
      if (!list) return s;
      const now = Date.now();
      const items = list.items.map((it) =>
        it.id === itemId ? { ...it, done: !it.done, updatedAt: now } : it
      );
      return {
        todoLists: {
          ...s.todoLists,
          [listId]: { ...list, items, updatedAt: now },
        },
      };
    });
    scheduleListSave(() => get().todoLists[listId], listId);
  },

  deleteTodo: (listId, itemId) => {
    set((s) => {
      const list = s.todoLists[listId];
      if (!list) return s;
      const items = list.items.filter((it) => it.id !== itemId);
      return {
        todoLists: {
          ...s.todoLists,
          [listId]: { ...list, items, updatedAt: Date.now() },
        },
      };
    });
    scheduleListSave(() => get().todoLists[listId], listId);
  },

  reorderTodos: (listId, itemIds) => {
    set((s) => {
      const list = s.todoLists[listId];
      if (!list) return s;
      const byId = new Map(list.items.map((it) => [it.id, it]));
      const items: TodoItem[] = [];
      for (const id of itemIds) {
        const it = byId.get(id);
        if (it) items.push(it);
      }
      return {
        todoLists: {
          ...s.todoLists,
          [listId]: { ...list, items, updatedAt: Date.now() },
        },
      };
    });
    scheduleListSave(() => get().todoLists[listId], listId);
  },
}));

// Selectors
export function listDocs(docs: Record<string, OfficeDoc>): OfficeDoc[] {
  return Object.values(docs).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function listTodoLists(lists: Record<string, TodoList>): TodoList[] {
  return Object.values(lists).sort((a, b) => a.createdAt - b.createdAt);
}
