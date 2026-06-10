import { detectKeyColumn } from "@/lib/utils";
import type { DiffRow, SnapshotDataset, SnapshotRow, SnapshotValue } from "./types";

const COMPARE_KEYWORDS = [
  "rating",
  "strength",
  "demand",
  "rank",
  "score",
  "william",
  "graham",
  "oshaughnessy",
  "buffett",
  "lynch",
];

function toNumber(v: SnapshotValue): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string") {
    const cleaned = v.trim().replace(/,/g, "");
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function valuesEqual(a: SnapshotValue, b: SnapshotValue): boolean {
  if (a === null && b === null) return true;
  const na = toNumber(a);
  const nb = toNumber(b);
  if (na !== null && nb !== null) {
    return Math.abs(na - nb) <= 1e-9;
  }
  const sa = a === null ? "" : String(a).trim();
  const sb = b === null ? "" : String(b).trim();
  return sa === sb;
}

function asString(v: SnapshotValue): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

/** Port of compute_changes() from the Dash app. */
export function computeChanges(
  left: SnapshotDataset,
  right: SnapshotDataset
): DiffRow[] {
  if (left.rows.length === 0 || right.rows.length === 0) return [];

  const leftKey = detectKeyColumn(left.columns);
  const rightKey = detectKeyColumn(right.columns);
  if (!leftKey || !rightKey) return [];

  const renameKey = (
    rows: SnapshotRow[],
    fromKey: string
  ): SnapshotRow[] => {
    if (fromKey === "Symbol") return rows;
    return rows.map((r) => {
      const out: SnapshotRow = { ...r };
      out["Symbol"] = r[fromKey];
      delete out[fromKey];
      return out;
    });
  };

  const l = renameKey(left.rows, leftKey);
  const r = renameKey(right.rows, rightKey);

  const leftCols = new Set(
    Object.keys(l[0] || {}).concat("Symbol")
  );
  const rightCols = new Set(
    Object.keys(r[0] || {}).concat("Symbol")
  );

  const commonCols = [...leftCols].filter(
    (c) => c !== "Symbol" && rightCols.has(c)
  );

  let compareCols = commonCols.filter((c) => {
    const lc = c.toLowerCase();
    return COMPARE_KEYWORDS.some((kw) => lc.includes(kw));
  });
  if (compareCols.length === 0) compareCols = commonCols;

  const leftBySym = new Map<string, SnapshotRow>();
  for (const row of l) {
    const sym = row["Symbol"];
    if (sym !== null && sym !== undefined) leftBySym.set(String(sym), row);
  }
  const rightBySym = new Map<string, SnapshotRow>();
  for (const row of r) {
    const sym = row["Symbol"];
    if (sym !== null && sym !== undefined) rightBySym.set(String(sym), row);
  }

  const allSymbols = new Set([...leftBySym.keys(), ...rightBySym.keys()]);
  const out: DiffRow[] = [];

  for (const sym of allSymbols) {
    const lr = leftBySym.get(sym);
    const rr = rightBySym.get(sym);

    if (!lr && rr) {
      out.push({
        Symbol: sym,
        Change: "Added",
        Field: "__row__",
        Old: "Missing",
        New: "Present",
      });
      continue;
    }
    if (lr && !rr) {
      out.push({
        Symbol: sym,
        Change: "Removed",
        Field: "__row__",
        Old: "Present",
        New: "Missing",
      });
      continue;
    }
    if (!lr || !rr) continue;

    for (const c of compareCols) {
      const oldV = lr[c] ?? null;
      const newV = rr[c] ?? null;
      if (valuesEqual(oldV, newV)) continue;

      const oldS = asString(oldV);
      const newS = asString(newV);
      if (oldS !== newS) {
        out.push({
          Symbol: sym,
          Change: "Changed",
          Field: c,
          Old: oldS,
          New: newS,
        });
      }
    }
  }

  out.sort((a, b) => {
    if (a.Symbol !== b.Symbol) return a.Symbol.localeCompare(b.Symbol);
    return a.Field.localeCompare(b.Field);
  });
  return out;
}
