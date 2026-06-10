import { promises as fs } from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import { asyncBufferFromFile, parquetReadObjects } from "hyparquet";
import {
  dashDataDir,
  historyDir,
  latestCsvPath,
  latestParquetPath,
} from "@/lib/env";
import type {
  SnapshotDataset,
  SnapshotFile,
  SnapshotRow,
  SnapshotValue,
} from "./types";

const HISTORY_TS_RE = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})\.(parquet|csv)$/;

function parseHistoryTimestamp(fileName: string): number | null {
  const match = HISTORY_TS_RE.exec(fileName);
  if (!match) return null;
  const [, y, m, d, hh, mm, ss] = match;
  const dt = new Date(
    Number(y),
    Number(m) - 1,
    Number(d),
    Number(hh),
    Number(mm),
    Number(ss)
  );
  const t = dt.getTime();
  return Number.isFinite(t) ? t : null;
}

function formatLabel(ts: number): string {
  const d = new Date(ts);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export async function listSnapshots(): Promise<SnapshotFile[]> {
  const dir = historyDir();
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }

  const snapshots: SnapshotFile[] = [];
  for (const name of entries) {
    if (!name.endsWith(".parquet") && !name.endsWith(".csv")) continue;
    const parsed = parseHistoryTimestamp(name);
    let timestamp = parsed;
    if (timestamp === null) {
      try {
        timestamp = (await fs.stat(path.join(dir, name))).mtimeMs;
      } catch {
        timestamp = 0;
      }
    }
    snapshots.push({
      name,
      timestamp: timestamp ?? 0,
      label: formatLabel(timestamp ?? 0),
    });
  }

  snapshots.sort((a, b) => b.timestamp - a.timestamp);
  return snapshots;
}

export async function listComparableSnapshots(): Promise<SnapshotFile[]> {
  const snapshots = await listSnapshots();
  const latest = latestParquetPath();

  try {
    const stat = await fs.stat(latest);
    return [
      {
        name: "latest.parquet",
        timestamp: stat.mtimeMs,
        label: `latest.parquet • ${formatLabel(stat.mtimeMs)}`,
      },
      ...snapshots,
    ];
  } catch {
    return snapshots;
  }
}

/** Read raw rows from a parquet file using hyparquet. */
async function readParquet(absPath: string): Promise<SnapshotRow[]> {
  const file = await asyncBufferFromFile(absPath);
  const rows = (await parquetReadObjects({ file })) as Record<string, unknown>[];
  return rows.map((row) => normalizeRow(row));
}

/** Read raw rows from a CSV file using PapaParse. */
async function readCsv(absPath: string): Promise<SnapshotRow[]> {
  const text = await fs.readFile(absPath, "utf8");
  const result = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  });
  return (result.data || []).map((row) => normalizeRow(row));
}

function normalizeRow(row: Record<string, unknown>): SnapshotRow {
  const out: SnapshotRow = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = normalizeValue(v);
  }
  return out;
}

function normalizeValue(v: unknown): SnapshotValue {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    if (v === "") return null;
    return v;
  }
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return v;
  if (typeof v === "bigint") return Number(v);
  // Anything else: stringify
  return String(v);
}

export async function loadSnapshotByName(
  name: string
): Promise<SnapshotDataset> {
  const safeName = path.basename(name);
  const absPath =
    safeName === "latest.parquet"
      ? latestParquetPath()
      : safeName === "latest.csv"
        ? latestCsvPath()
        : path.join(historyDir(), safeName);

  let rows: SnapshotRow[];
  if (safeName.endsWith(".parquet")) {
    rows = await readParquet(absPath);
  } else if (safeName.endsWith(".csv")) {
    rows = await readCsv(absPath);
  } else {
    throw new Error(`Unsupported file type: ${safeName}`);
  }

  const stat = await fs.stat(absPath);
  const updatedAt = new Date(stat.mtimeMs).toISOString();
  const columns = collectColumns(rows);

  return {
    name: safeName,
    columns,
    rows,
    updatedAt,
    message: `Loaded ${safeName} (${rows.length} rows) • Updated: ${formatLabel(stat.mtimeMs)}`,
  };
}

export async function loadLatest(): Promise<SnapshotDataset> {
  // Always pick the freshest available scrape: compare latest.parquet against
  // the newest file in history/ and read whichever was written most recently.
  // This guards against the case where the scraper writes a new history file
  // but latest.parquet wasn't updated for some reason.
  const latestPath = latestParquetPath();

  let latestStat: { mtimeMs: number } | null = null;
  try {
    latestStat = await fs.stat(latestPath);
  } catch {
    latestStat = null;
  }

  const snapshots = await listSnapshots();
  const newestHistory = snapshots.length > 0 ? snapshots[0] : null;

  // Pick whichever exists and is most recent.
  const useHistory =
    newestHistory !== null &&
    (latestStat === null || newestHistory.timestamp > latestStat.mtimeMs);

  if (useHistory && newestHistory) {
    const absPath = path.join(historyDir(), newestHistory.name);
    const rows = newestHistory.name.endsWith(".parquet")
      ? await readParquet(absPath)
      : await readCsv(absPath);
    const stat = await fs.stat(absPath);
    return {
      name: "latest.parquet",
      columns: collectColumns(rows),
      rows,
      updatedAt: new Date(stat.mtimeMs).toISOString(),
      message: `Loaded latest scrape · ${newestHistory.name} (${rows.length} rows) • Updated: ${formatLabel(stat.mtimeMs)}`,
    };
  }

  if (latestStat) {
    const rows = await readParquet(latestPath);
    return {
      name: "latest.parquet",
      columns: collectColumns(rows),
      rows,
      updatedAt: new Date(latestStat.mtimeMs).toISOString(),
      message: `Loaded latest.parquet (${rows.length} rows) • Updated: ${formatLabel(latestStat.mtimeMs)}`,
    };
  }

  // Last-resort fallback: latest.csv, then empty.
  const csv = latestCsvPath();
  try {
    const stat = await fs.stat(csv);
    const rows = await readCsv(csv);
    return {
      name: "latest.csv",
      columns: collectColumns(rows),
      rows,
      updatedAt: new Date(stat.mtimeMs).toISOString(),
      message: `Loaded latest.csv (${rows.length} rows) • Updated: ${formatLabel(stat.mtimeMs)}`,
    };
  } catch {
    return {
      name: "latest.parquet",
      columns: [],
      rows: [],
      updatedAt: new Date().toISOString(),
      message: "No data found in " + dashDataDir(),
    };
  }
}

function collectColumns(rows: SnapshotRow[]): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      if (!seen.has(k)) {
        seen.add(k);
        order.push(k);
      }
    }
  }
  return order;
}

/** Resolve absolute path for a history filename, throwing on traversal attempts. */
export function resolveHistoryFile(name: string): string {
  const safe = path.basename(name);
  return path.join(historyDir(), safe);
}
