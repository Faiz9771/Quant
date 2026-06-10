/** A generic snapshot row — keys are column names, values are typed primitives. */
export type SnapshotValue = string | number | boolean | null;
export type SnapshotRow = Record<string, SnapshotValue>;

export interface SnapshotFile {
  name: string;
  /** Unix ms timestamp parsed from filename, or file mtime as fallback. */
  timestamp: number;
  /** Human-readable label like "Apr 8, 2026 13:27". */
  label: string;
}

export interface SnapshotDataset {
  name: string;
  columns: string[];
  rows: SnapshotRow[];
  /** mtime as ISO string. */
  updatedAt: string;
  /** Friendly "Loaded latest.parquet (300 rows) • Updated: …" */
  message: string;
}

export interface DiffRow {
  Symbol: string;
  Change: "Added" | "Removed" | "Changed";
  Field: string;
  Old: string;
  New: string;
}
