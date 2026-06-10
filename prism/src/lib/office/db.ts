// Server-only SQLite persistence for the Office workspace.
//
// Stores each OfficeDoc / TodoList as a JSON blob keyed by id. The client data
// model is unchanged — the server is just a typed key/value store with a
// couple of indexes. A single DB file lives at ./data/office.db.
//
// NEVER import this module from a client component. It uses Node-native
// `better-sqlite3` and depends on `fs` / `path`.

import "server-only";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { OfficeDoc, TodoList } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "office.db");

// Cache the handle across HMR in dev.
type GlobalWithDb = typeof globalThis & { __officeDb?: Database.Database };
const g = globalThis as GlobalWithDb;

function openDb(): Database.Database {
  if (g.__officeDb) return g.__officeDb;

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS docs (
      id         TEXT PRIMARY KEY,
      kind       TEXT NOT NULL,
      name       TEXT NOT NULL,
      data       TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_docs_updated_at ON docs(updated_at DESC);

    CREATE TABLE IF NOT EXISTS todo_lists (
      id         TEXT PRIMARY KEY,
      data       TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_todo_lists_created_at ON todo_lists(created_at);
  `);

  g.__officeDb = db;
  return db;
}

// -------- Docs --------

export function listAllDocs(): OfficeDoc[] {
  const db = openDb();
  const rows = db
    .prepare("SELECT data FROM docs ORDER BY updated_at DESC")
    .all() as { data: string }[];
  return rows.map((r) => JSON.parse(r.data) as OfficeDoc);
}

export function getDoc(id: string): OfficeDoc | null {
  const db = openDb();
  const row = db.prepare("SELECT data FROM docs WHERE id = ?").get(id) as
    | { data: string }
    | undefined;
  return row ? (JSON.parse(row.data) as OfficeDoc) : null;
}

export function upsertDoc(doc: OfficeDoc): void {
  const db = openDb();
  db.prepare(
    `INSERT INTO docs (id, kind, name, data, created_at, updated_at)
     VALUES (@id, @kind, @name, @data, @createdAt, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       kind = excluded.kind,
       name = excluded.name,
       data = excluded.data,
       updated_at = excluded.updated_at`
  ).run({
    id: doc.id,
    kind: doc.kind,
    name: doc.name,
    data: JSON.stringify(doc),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  });
}

export function deleteDocRow(id: string): void {
  openDb().prepare("DELETE FROM docs WHERE id = ?").run(id);
}

// -------- Todo lists --------

export function listAllTodoLists(): TodoList[] {
  const db = openDb();
  const rows = db
    .prepare("SELECT data FROM todo_lists ORDER BY created_at ASC")
    .all() as { data: string }[];
  return rows.map((r) => JSON.parse(r.data) as TodoList);
}

export function getTodoList(id: string): TodoList | null {
  const db = openDb();
  const row = db.prepare("SELECT data FROM todo_lists WHERE id = ?").get(id) as
    | { data: string }
    | undefined;
  return row ? (JSON.parse(row.data) as TodoList) : null;
}

export function upsertTodoList(list: TodoList): void {
  const db = openDb();
  db.prepare(
    `INSERT INTO todo_lists (id, data, created_at, updated_at)
     VALUES (@id, @data, @createdAt, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       data = excluded.data,
       updated_at = excluded.updated_at`
  ).run({
    id: list.id,
    data: JSON.stringify(list),
    createdAt: list.createdAt,
    updatedAt: list.updatedAt,
  });
}

export function deleteTodoListRow(id: string): void {
  openDb().prepare("DELETE FROM todo_lists WHERE id = ?").run(id);
}
