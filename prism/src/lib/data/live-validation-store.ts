import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Papa from "papaparse";
import { liveValidationCsvPath } from "@/lib/env";
import type { SnapshotRow, SnapshotValue } from "./types";

/**
 * Canonical column order for the live-validation workspace. The 5 derived
 * columns are appended at read time — they are NOT stored.
 */
export const BASE_COLUMNS = [
  "Model",
  "Ticker",
  "Sector",
  "Date Range",
  "Entry Date",
  "Entry Price",
  "P_Target",
  "% Target",
  "P_Time_To_Target",
  "P_Stoploss",
  "% Stoploss",
  "P_Time_To_Stoploss",
  "Win/Loss",
  "+/- Points",
  "Exit Price",
  "Exit Date",
  "Win/Loss %",
  "Position Status",
  "Traded Timeframe",
  "Prediction",
  "Probability",
  "Outcome",
  "Tested",
  "Comments",
  "Summary",
  "Current Price",
] as const;

export const DERIVED_COLUMNS = [
  "Current PL",
  "% Current PL",
  "Point To Target",
  "Target Met",
  "Stoploss Met",
] as const;

export const ALL_COLUMNS: readonly string[] = [
  ...BASE_COLUMNS,
  ...DERIVED_COLUMNS,
];

export interface StoredRow {
  id: string;
  data: SnapshotRow;
}

interface StoreFile {
  version: 1;
  updatedAt: string;
  rows: StoredRow[];
}

function storePath(): string {
  return path.join(process.cwd(), "data", "live-validation.json");
}

function normalizeValue(v: unknown): SnapshotValue {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    const s = v.trim();
    if (s === "" || s.toUpperCase() === "NA" || s === "#N/A") return null;
    return s;
  }
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return v;
  if (typeof v === "bigint") return Number(v);
  return String(v);
}

function toNumber(v: SnapshotValue | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[,%]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * Adds derived columns.
 * - Open positions: uses Current Price for PL, % PL, Point To Target, and
 *   Target Met / Stoploss Met.
 * - Closed positions: ignores Current Price; evaluates Target Met / Stoploss
 *   Met against Exit Price only. Current PL / % Current PL / Point To Target
 *   are left null.
 */
export function withDerived(row: SnapshotRow): SnapshotRow {
  const entry = toNumber(row["Entry Price"]);
  const current = toNumber(row["Current Price"]);
  const exit = toNumber(row["Exit Price"]);
  const target = toNumber(row["P_Target"]);
  const stoploss = toNumber(row["P_Stoploss"]);
  const prediction = String(row["Prediction"] ?? "").trim().toLowerCase();
  const isShort = prediction === "sell" || prediction === "short";
  const closed = isClosed(row["Position Status"]);

  const out: SnapshotRow = { ...row };

  if (closed) {
    out["Current PL"] = null;
    out["% Current PL"] = null;
    out["Point To Target"] = null;
    out["Target Met"] =
      target !== null && exit !== null
        ? isShort
          ? exit <= target
          : exit >= target
        : null;
    out["Stoploss Met"] =
      stoploss !== null && exit !== null
        ? isShort
          ? exit >= stoploss
          : exit <= stoploss
        : null;
    return out;
  }

  if (entry !== null && current !== null) {
    const pl = isShort ? entry - current : current - entry;
    const pct = entry !== 0 ? (pl / entry) * 100 : null;
    out["Current PL"] = Number(pl.toFixed(2));
    out["% Current PL"] = pct === null ? null : Number(pct.toFixed(2));
  } else {
    out["Current PL"] = null;
    out["% Current PL"] = null;
  }

  if (target !== null && current !== null) {
    const ptt = isShort ? current - target : target - current;
    out["Point To Target"] = Number(ptt.toFixed(2));
    out["Target Met"] = isShort ? current <= target : current >= target;
  } else {
    out["Point To Target"] = null;
    out["Target Met"] = null;
  }

  if (stoploss !== null && current !== null) {
    out["Stoploss Met"] = isShort ? current >= stoploss : current <= stoploss;
  } else {
    out["Stoploss Met"] = null;
  }

  return out;
}

function parseEntryDate(v: SnapshotValue | undefined): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  const months: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  let m = /^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/.exec(s);
  if (m) {
    const day = Number(m[1]);
    const monIdx = months[m[2].toLowerCase()];
    if (monIdx === undefined) return null;
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    return new Date(Date.UTC(year, monIdx, day));
  }
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  m = /^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})$/.exec(s);
  if (m) {
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    return new Date(Date.UTC(year, Number(m[2]) - 1, Number(m[1])));
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t) : null;
}

function isClosed(v: SnapshotValue | undefined): boolean {
  if (v === null || v === undefined) return false;
  const k = String(v).trim().toLowerCase();
  return k === "close" || k === "closed" || k === "exit" || k === "exited";
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatExitDate(d: Date): string {
  const day = d.getUTCDate();
  const mon = MONTH_NAMES[d.getUTCMonth()];
  const yr = d.getUTCFullYear() % 100;
  return `${day}-${mon}-${String(yr).padStart(2, "0")}`;
}

function isShortPrediction(row: SnapshotRow): boolean {
  const prediction = String(row["Prediction"] ?? "").trim().toLowerCase();
  return prediction === "sell" || prediction === "short";
}

function isBuyPrediction(row: SnapshotRow): boolean {
  const prediction = String(row["Prediction"] ?? "").trim().toLowerCase();
  return prediction === "buy" || prediction === "long";
}

/**
 * Computes % Target and % Stoploss as positive magnitudes relative to entry.
 * Only fills when the value is currently null/missing so manual overrides are
 * preserved.
 */
function computeTargetStoplossPercents(row: SnapshotRow): void {
  const entry = toNumber(row["Entry Price"]);
  if (entry === null || entry === 0) return;
  const isShort = isShortPrediction(row);

  const target = toNumber(row["P_Target"]);
  if (target !== null && toNumber(row["% Target"]) === null) {
    const pct = isShort
      ? ((entry - target) / entry) * 100
      : ((target - entry) / entry) * 100;
    row["% Target"] = Number(pct.toFixed(2));
  }

  const stoploss = toNumber(row["P_Stoploss"]);
  if (stoploss !== null && toNumber(row["% Stoploss"]) === null) {
    const pct = isShort
      ? ((stoploss - entry) / entry) * 100
      : ((entry - stoploss) / entry) * 100;
    row["% Stoploss"] = Number(pct.toFixed(2));
  }
}

/**
 * When a row is marked closed and has an Exit Price, populate Win/Loss,
 * +/- Points, Win/Loss %, and Outcome if they are missing. Does not
 * overwrite existing non-null values.
 */
function computeWinLossFromExit(row: SnapshotRow): void {
  if (!isClosed(row["Position Status"])) return;
  const entry = toNumber(row["Entry Price"]);
  const exit = toNumber(row["Exit Price"]);
  if (entry === null || exit === null) return;
  const isShort = isShortPrediction(row);

  const points = isShort ? entry - exit : exit - entry;
  const pct = entry !== 0 ? (points / entry) * 100 : null;
  const win = points > 0;

  if (row["+/- Points"] === null || row["+/- Points"] === undefined) {
    row["+/- Points"] = Number(points.toFixed(2));
  }
  if (
    (row["Win/Loss %"] === null || row["Win/Loss %"] === undefined) &&
    pct !== null
  ) {
    row["Win/Loss %"] = Number(pct.toFixed(2));
  }
  if (!row["Win/Loss"]) {
    row["Win/Loss"] = win ? "Win" : "Loss";
  }
  if (!row["Outcome"]) {
    if (isShort) row["Outcome"] = win ? "TrueNegative" : "FalseNegative";
    else row["Outcome"] = win ? "TruePositive" : "FalsePositive";
  }
}

/**
 * Computes Traded Timeframe (days) between Entry Date and Exit Date.
 * Sets the value when both dates are present; overwrites legacy strings
 * (e.g. "17 days", "8d") with a normalized number-of-days string.
 */
function computeTradedTimeframe(row: SnapshotRow): void {
  const entryDate = parseEntryDate(row["Entry Date"]);
  const exitDate = parseEntryDate(row["Exit Date"]);
  if (!entryDate || !exitDate) return;
  const days = Math.max(
    0,
    Math.floor(
      (exitDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24)
    )
  );
  row["Traded Timeframe"] = `${days} days`;
}

/**
 * Legacy-data backfill: older rows stored the exit date in the `Timeframe`
 * column (e.g. "2-Mar-26"). If Exit Date is missing and Timeframe parses
 * as a date, copy it over. If Timeframe is a day-count like "8d" or
 * "17 days", derive Exit Date from Entry Date + days.
 */
function backfillExitDateFromTimeframe(row: SnapshotRow): void {
  if (row["Exit Date"]) return;
  const tf = row["Timeframe"];
  if (tf === null || tf === undefined) return;
  const s = String(tf).trim();
  if (!s) return;

  const asDate = parseEntryDate(s);
  if (asDate) {
    row["Exit Date"] = formatExitDate(asDate);
    return;
  }

  const dayMatch = /^(\d+)\s*(?:d|days?)$/i.exec(s);
  if (dayMatch) {
    const days = Number(dayMatch[1]);
    const entry = parseEntryDate(row["Entry Date"]);
    if (entry && Number.isFinite(days)) {
      const exit = new Date(entry.getTime() + days * 24 * 60 * 60 * 1000);
      row["Exit Date"] = formatExitDate(exit);
    }
  }
}

/**
 * Idempotent normalization: fills all auto-calculated fields if missing.
 * Safe to call on every read, write, and migration.
 */
function normalizeComputed(row: SnapshotRow, opts?: { now?: Date }): void {
  computeTargetStoplossPercents(row);
  if (!isBuyPrediction(row)) {
    row["Exit Date"] = null;
    row["Traded Timeframe"] = null;
    return;
  }
  if (isClosed(row["Position Status"])) {
    backfillExitDateFromTimeframe(row);
    if (!row["Exit Date"] && opts?.now) {
      row["Exit Date"] = formatExitDate(opts.now);
    }
    computeWinLossFromExit(row);
    computeTradedTimeframe(row);
  }
}

/**
 * If current price has hit Target or Stoploss on an open position, capture
 * exit details and close the row. Mutates `data` in place. Returns true if
 * the row was closed by this call.
 */
function maybeCloseOnTrigger(data: SnapshotRow): boolean {
  if (isClosed(data["Position Status"])) return false;
  const entry = toNumber(data["Entry Price"]);
  const current = toNumber(data["Current Price"]);
  const target = toNumber(data["P_Target"]);
  const stoploss = toNumber(data["P_Stoploss"]);
  if (entry === null || current === null) return false;

  const prediction = String(data["Prediction"] ?? "").trim().toLowerCase();
  const isShort = prediction === "sell" || prediction === "short";

  const targetHit =
    target !== null && (isShort ? current <= target : current >= target);
  const stoplossHit =
    stoploss !== null && (isShort ? current >= stoploss : current <= stoploss);

  if (!targetHit && !stoplossHit) return false;

  const win = targetHit;
  const exitPrice = win ? (target as number) : (stoploss as number);
  const points = isShort ? entry - exitPrice : exitPrice - entry;
  const pct = entry !== 0 ? (points / entry) * 100 : null;

  const entryDate = parseEntryDate(data["Entry Date"]);
  const exitDate = new Date();
  const days =
    entryDate === null
      ? null
      : Math.max(
          0,
          Math.floor(
            (exitDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24)
          )
        );

  let outcome: string;
  if (isShort) outcome = win ? "TrueNegative" : "FalseNegative";
  else outcome = win ? "TruePositive" : "FalsePositive";

  data["Exit Price"] = Number(exitPrice.toFixed(2));
  data["Exit Date"] = formatExitDate(exitDate);
  data["+/- Points"] = Number(points.toFixed(2));
  data["Win/Loss %"] = pct === null ? null : Number(pct.toFixed(2));
  data["Win/Loss"] = win ? "Win" : "Loss";
  data["Outcome"] = outcome;
  data["Traded Timeframe"] = days === null ? data["Traded Timeframe"] ?? null : `${days} days`;
  data["Position Status"] = "Close";
  return true;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function seedFromCsv(): Promise<StoreFile> {
  const csvPath = liveValidationCsvPath();
  const rows: StoredRow[] = [];
  try {
    const text = await fs.readFile(csvPath, "utf8");
    const parsed = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
    });
    for (const raw of parsed.data || []) {
      if (!raw) continue;
      const data: SnapshotRow = {};
      for (const col of BASE_COLUMNS) {
        const v = raw[col];
        data[col] = normalizeValue(v);
      }
      // Skip rows that are entirely empty
      if (BASE_COLUMNS.every((c) => data[c] === null)) continue;
      rows.push({ id: crypto.randomUUID(), data });
    }
  } catch {
    // CSV missing — start with an empty store
  }
  const file: StoreFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    rows,
  };
  await writeStore(file);
  return file;
}

async function readStore(): Promise<StoreFile> {
  const p = storePath();
  if (!(await fileExists(p))) {
    return seedFromCsv();
  }
  const text = await fs.readFile(p, "utf8");
  let parsed: StoreFile;
  try {
    parsed = JSON.parse(text) as StoreFile;
    if (!parsed.rows) throw new Error("bad shape");
  } catch {
    return seedFromCsv();
  }
  if (await ensureColumnsAndBackfill(parsed)) {
    await writeStore(parsed);
  }
  return parsed;
}

/**
 * Ensures every stored row has the full BASE_COLUMNS shape and runs the
 * idempotent computed-field backfill (% Target, % Stoploss, Exit Date,
 * Traded Timeframe, Win/Loss flags). Returns true if anything changed.
 */
async function ensureColumnsAndBackfill(store: StoreFile): Promise<boolean> {
  let changed = false;
  for (const row of store.rows) {
    for (const col of BASE_COLUMNS) {
      if (!(col in row.data)) {
        row.data[col] = null;
        changed = true;
      }
    }
    const before = JSON.stringify(row.data);
    normalizeComputed(row.data);
    if (JSON.stringify(row.data) !== before) changed = true;
  }
  if (changed) store.updatedAt = new Date().toISOString();
  return changed;
}

async function writeStore(file: StoreFile): Promise<void> {
  const p = storePath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(file, null, 2), "utf8");
}

export interface LiveValidationDataset {
  columns: string[];
  rows: SnapshotRow[];
  updatedAt: string | null;
  exists: boolean;
}

export async function loadDataset(): Promise<LiveValidationDataset> {
  const store = await readStore();
  return {
    columns: [...ALL_COLUMNS],
    rows: store.rows.map((r) => ({ id: r.id, ...withDerived(r.data) })),
    updatedAt: store.updatedAt,
    exists: true,
  };
}

export async function addRow(input: SnapshotRow): Promise<StoredRow> {
  const store = await readStore();
  const data: SnapshotRow = {};
  for (const col of BASE_COLUMNS) {
    data[col] = normalizeValue(input[col]);
  }
  computeTargetStoplossPercents(data);
  maybeCloseOnTrigger(data);
  normalizeComputed(data, { now: new Date() });
  const row: StoredRow = { id: crypto.randomUUID(), data };
  store.rows.unshift(row);
  store.updatedAt = new Date().toISOString();
  await writeStore(store);
  return row;
}

export async function updateRow(
  id: string,
  patch: SnapshotRow
): Promise<StoredRow | null> {
  const store = await readStore();
  const idx = store.rows.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const next: SnapshotRow = { ...store.rows[idx].data };
  for (const key of Object.keys(patch)) {
    if (!BASE_COLUMNS.includes(key as (typeof BASE_COLUMNS)[number])) continue;
    next[key] = normalizeValue(patch[key]);
  }
  computeTargetStoplossPercents(next);
  maybeCloseOnTrigger(next);
  normalizeComputed(next, { now: new Date() });
  store.rows[idx] = { id, data: next };
  store.updatedAt = new Date().toISOString();
  await writeStore(store);
  return store.rows[idx];
}

/**
 * Apply a ticker → price map to all rows whose Ticker matches. Returns the
 * count of rows updated.
 */
export async function applyPricesByTicker(
  prices: Record<string, number | null>
): Promise<number> {
  const store = await readStore();
  let updated = 0;
  const norm = (s: unknown) =>
    typeof s === "string" ? s.trim().toUpperCase() : "";
  const lookup = new Map<string, number | null>();
  for (const [k, v] of Object.entries(prices)) lookup.set(norm(k), v);

  for (const row of store.rows) {
    const t = norm(row.data["Ticker"]);
    if (!t) continue;
    if (!lookup.has(t)) continue;
    const price = lookup.get(t);
    if (price === null || price === undefined) continue;
    if (isClosed(row.data["Position Status"])) continue;
    row.data["Current Price"] = price;
    computeTargetStoplossPercents(row.data);
    maybeCloseOnTrigger(row.data);
    normalizeComputed(row.data, { now: new Date() });
    updated++;
  }

  if (updated > 0) {
    store.updatedAt = new Date().toISOString();
    await writeStore(store);
  }
  return updated;
}

/**
 * Apply a ticker → sector map. Only fills rows where Sector is currently
 * missing — manual edits are preserved. Returns the count of rows updated.
 */
export async function applySectorsByTicker(
  sectors: Record<string, string | null>
): Promise<number> {
  const store = await readStore();
  let updated = 0;
  const norm = (s: unknown) =>
    typeof s === "string" ? s.trim().toUpperCase() : "";
  const lookup = new Map<string, string | null>();
  for (const [k, v] of Object.entries(sectors)) lookup.set(norm(k), v);

  for (const row of store.rows) {
    const t = norm(row.data["Ticker"]);
    if (!t || !lookup.has(t)) continue;
    const sector = lookup.get(t);
    if (!sector) continue;
    const existing = row.data["Sector"];
    if (existing !== null && existing !== undefined && existing !== "") continue;
    row.data["Sector"] = sector;
    updated++;
  }

  if (updated > 0) {
    store.updatedAt = new Date().toISOString();
    await writeStore(store);
  }
  return updated;
}

/**
 * Returns every distinct ticker currently stored whose Sector is missing.
 */
export async function tickersMissingSector(): Promise<string[]> {
  const store = await readStore();
  const out = new Set<string>();
  for (const row of store.rows) {
    const t = row.data["Ticker"];
    if (typeof t !== "string" || t.trim() === "") continue;
    const s = row.data["Sector"];
    if (s !== null && s !== undefined && s !== "") continue;
    out.add(t.trim().toUpperCase());
  }
  return Array.from(out);
}

export async function deleteRow(id: string): Promise<boolean> {
  const store = await readStore();
  const idx = store.rows.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  store.rows.splice(idx, 1);
  store.updatedAt = new Date().toISOString();
  await writeStore(store);
  return true;
}
