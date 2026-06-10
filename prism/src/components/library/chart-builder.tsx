"use client";

import * as React from "react";
import { BarChart3, Loader2, Upload, X } from "lucide-react";
import Papa from "papaparse";
import { cn } from "@/lib/utils";
import { LibraryTile } from "./library-tile";
import { MarketSmithChart, type Bar } from "./marketsmith-chart";

type ChartKind = "distribution" | "line" | "multi-line" | "marketsmith";
type InputMode = "upload" | "paste";

const CHART_TYPES: { v: ChartKind; label: string }[] = [
  { v: "distribution", label: "Distribution" },
  { v: "line", label: "Line" },
  { v: "multi-line", label: "Multiple line" },
  { v: "marketsmith", label: "MarketSmith (OHLCV)" },
];

const EMA_OPTIONS = [4, 10, 40];

function findCol(headers: string[], names: string[]): string | null {
  const lowered = headers.map((h) => h.trim().toLowerCase());
  for (const n of names) {
    const i = lowered.indexOf(n.toLowerCase());
    if (i !== -1) return headers[i];
  }
  return null;
}

function parseOhlcvBars(table: ParsedTable): Bar[] | null {
  const dateCol = findCol(table.headers, ["Date", "date", "Datetime", "timestamp"]);
  const openCol = findCol(table.headers, ["Open"]);
  const highCol = findCol(table.headers, ["High"]);
  const lowCol = findCol(table.headers, ["Low"]);
  const closeCol = findCol(table.headers, ["Close", "Adj Close"]);
  const volCol = findCol(table.headers, ["Volume", "Vol"]);
  if (!dateCol || !openCol || !highCol || !lowCol || !closeCol || !volCol) {
    return null;
  }
  const bars: Bar[] = [];
  for (const r of table.rows) {
    const t = Date.parse(String(r[dateCol]));
    const o = numeric(r[openCol]);
    const h = numeric(r[highCol]);
    const l = numeric(r[lowCol]);
    const c = numeric(r[closeCol]);
    const v = numeric(r[volCol]);
    if (
      !Number.isFinite(t) ||
      o === null ||
      h === null ||
      l === null ||
      c === null ||
      v === null
    )
      continue;
    bars.push({ t, o, h, l, c, v });
  }
  bars.sort((a, b) => a.t - b.t);
  return bars.length > 0 ? bars : null;
}

const SERIES_COLORS = [
  "rgb(37 99 235)",
  "rgb(185 28 28)",
  "rgb(22 163 74)",
  "rgb(234 88 12)",
  "rgb(147 51 234)",
  "rgb(202 138 4)",
  "rgb(8 145 178)",
  "rgb(219 39 119)",
];

interface ParsedTable {
  headers: string[];
  rows: Record<string, string>[];
}

export function ChartBuilder() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <LibraryTile
        icon={<BarChart3 className="h-4 w-4" />}
        title="Chart builder"
        description="Distributions, line, multi-line, and MarketSmith OHLCV charts from a CSV upload or paste."
        buttonLabel="Create chart"
        meta="CSV / Paste"
        onClick={() => setOpen(true)}
      />
      {open && <ChartDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function ChartDialog({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = React.useState<ChartKind>("distribution");
  const [mode, setMode] = React.useState<InputMode>("upload");
  const [paste, setPaste] = React.useState("");
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [table, setTable] = React.useState<ParsedTable | null>(null);
  const [yCol, setYCol] = React.useState<string>("");
  const [yCols, setYCols] = React.useState<string[]>([]);
  const [xCol, setXCol] = React.useState<string>("__index__");
  const [parsing, setParsing] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [msInterval, setMsInterval] = React.useState<"D" | "W">("D");
  const [msLog, setMsLog] = React.useState(true);
  const [msEmas, setMsEmas] = React.useState<number[]>([4, 10, 40]);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleFile(file: File) {
    setParsing(true);
    setErr(null);
    setFileName(file.name);
    try {
      const text = await file.text();
      ingestCsv(text);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setParsing(false);
    }
  }

  function ingestCsv(text: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      setErr("Input is empty.");
      setTable(null);
      return;
    }

    // If every non-empty line is a single token that parses as a number,
    // treat as a single-column "Value" series.
    const lines = trimmed.split(/\r?\n/).filter((l) => l.trim() !== "");
    const isSingleColNumbers = lines.every((l) => {
      const t = l.trim().replace(/[,%]/g, "");
      return t !== "" && Number.isFinite(Number(t));
    });
    if (isSingleColNumbers && lines.length > 1) {
      setTable({
        headers: ["Value"],
        rows: lines.map((l) => ({ Value: l.trim() })),
      });
      setYCol("Value");
      setYCols(["Value"]);
      setXCol("__index__");
      return;
    }

    const parsed = Papa.parse<Record<string, string>>(trimmed, {
      header: true,
      skipEmptyLines: true,
    });
    if (parsed.errors.length > 0) {
      setErr(parsed.errors[0].message);
      return;
    }
    const headers = parsed.meta.fields ?? [];
    if (headers.length === 0) {
      setErr("No columns detected.");
      return;
    }
    const rows = (parsed.data ?? []).filter((r) =>
      headers.some((h) => r[h] !== undefined && r[h] !== "")
    );
    if (rows.length === 0) {
      setErr("No data rows found.");
      return;
    }
    setTable({ headers, rows });
    // Auto-pick first numeric column as Y
    const numericCols = headers.filter((h) =>
      rows.some((r) => Number.isFinite(numeric(r[h])))
    );
    const firstNumeric = numericCols[0] ?? headers[0];
    setYCol(firstNumeric);
    setYCols(numericCols.slice(0, Math.min(3, numericCols.length)));
    setXCol("__index__");
  }

  function onPasteChange(v: string) {
    setPaste(v);
    setFileName(null);
    if (v.trim() === "") {
      setTable(null);
      return;
    }
    ingestCsv(v);
  }

  const series = React.useMemo<
    | { kind: "dist"; y: number[] }
    | { kind: "line"; x: number[]; y: number[]; xIsDate: boolean }
    | {
        kind: "multi";
        x: number[];
        xIsDate: boolean;
        lines: { name: string; y: (number | null)[] }[];
      }
    | { kind: "ms"; bars: Bar[] }
    | null
  >(() => {
    if (!table) return null;

    if (kind === "marketsmith") {
      const bars = parseOhlcvBars(table);
      if (!bars) return null;
      return { kind: "ms", bars };
    }

    if (kind === "distribution") {
      if (!yCol) return null;
      const yVals = table.rows
        .map((r) => numeric(r[yCol]))
        .filter((v): v is number => v !== null);
      if (yVals.length === 0) return null;
      return { kind: "dist", y: yVals };
    }

    const xIsDate =
      xCol !== "__index__" &&
      (() => {
        let dateHits = 0;
        let numericHits = 0;
        let total = 0;
        for (const r of table.rows) {
          const s = r[xCol];
          if (s === undefined || s === "") continue;
          total++;
          if (numeric(s) !== null) numericHits++;
          else if (Number.isFinite(Date.parse(String(s)))) dateHits++;
        }
        return total > 0 && dateHits > numericHits;
      })();

    const parseX = (r: Record<string, string>, i: number): number | null => {
      if (xCol === "__index__") return i;
      const raw = r[xCol];
      if (raw === undefined || raw === "") return null;
      const xn = xIsDate ? Date.parse(String(raw)) : numeric(raw);
      return xn === null || !Number.isFinite(xn) ? null : xn;
    };

    if (kind === "line") {
      if (!yCol) return null;
      const xs: number[] = [];
      const ys: number[] = [];
      table.rows.forEach((r, i) => {
        const yn = numeric(r[yCol]);
        if (yn === null) return;
        const xn = parseX(r, i);
        if (xn === null) return;
        xs.push(xn);
        ys.push(yn);
      });
      if (xs.length === 0) return null;
      return { kind: "line", x: xs, y: ys, xIsDate };
    }

    // Multi-line: align by row index, one y per selected column (nulls allowed).
    const picked = yCols.filter((c) => c && table.headers.includes(c));
    if (picked.length === 0) return null;
    const xs: number[] = [];
    const perLine: (number | null)[][] = picked.map(() => []);
    table.rows.forEach((r, i) => {
      const xn = parseX(r, i);
      if (xn === null) return;
      xs.push(xn);
      picked.forEach((col, ci) => {
        const yn = numeric(r[col]);
        perLine[ci].push(yn);
      });
    });
    if (xs.length === 0) return null;
    const lines = picked.map((name, ci) => ({ name, y: perLine[ci] }));
    const anyFinite = lines.some((l) => l.y.some((v) => v !== null));
    if (!anyFinite) return null;
    return { kind: "multi", x: xs, xIsDate, lines };
  }, [table, yCol, yCols, xCol, kind]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="my-8 flex w-full max-w-[1400px] flex-col overflow-hidden rounded-2xl bg-card shadow-xl ring-1 ring-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-3.5">
          <div>
            <h2 className="text-[14px] font-semibold text-foreground">
              Chart builder
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Upload a CSV or paste data. Pick a column, then render.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-0 md:grid-cols-[340px_1fr]">
          <div className="flex flex-col gap-3 border-r border-border/60 p-5">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Chart type
              </label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as ChartKind)}
                className="h-8 rounded-md bg-muted/60 px-2 text-[12px] text-foreground ring-1 ring-inset ring-border focus:bg-card focus:outline-none focus:ring-2 focus:ring-brand/40"
              >
                {CHART_TYPES.map(({ v, label }) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Data source
              </label>
              <div className="flex h-8 divide-x divide-border overflow-hidden rounded-md ring-1 ring-inset ring-border">
                {(
                  [
                    { v: "upload", label: "Upload" },
                    { v: "paste", label: "Paste" },
                  ] as const
                ).map(({ v, label }) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setMode(v)}
                    className={cn(
                      "h-full flex-1 px-2.5 text-[11.5px] font-medium uppercase tracking-wide transition-colors",
                      mode === v
                        ? "bg-brand-soft text-foreground"
                        : "bg-card text-muted-foreground hover:bg-muted/60"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {mode === "upload" ? (
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  CSV file
                </label>
                <label
                  className={cn(
                    "flex h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border bg-muted/30 text-[11.5px] text-muted-foreground transition-colors hover:bg-muted/60",
                    parsing && "opacity-60"
                  )}
                >
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFile(f);
                    }}
                  />
                  {parsing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  <span className="max-w-full truncate px-2 text-center">
                    {fileName ?? "Click to pick a .csv"}
                  </span>
                </label>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Paste data
                </label>
                <textarea
                  value={paste}
                  onChange={(e) => onPasteChange(e.target.value)}
                  rows={6}
                  placeholder="Header,Other&#10;1.23,A&#10;4.56,B&#10;&#10;or just one number per line"
                  className="resize-y rounded-md bg-muted/60 px-2.5 py-2 font-mono text-[11.5px] text-foreground ring-1 ring-inset ring-border focus:bg-card focus:outline-none focus:ring-2 focus:ring-brand/40"
                />
              </div>
            )}

            {table && kind === "marketsmith" && (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Interval
                  </label>
                  <div className="flex h-8 divide-x divide-border overflow-hidden rounded-md ring-1 ring-inset ring-border">
                    {(
                      [
                        { v: "D", label: "Daily" },
                        { v: "W", label: "Weekly" },
                      ] as const
                    ).map(({ v, label }) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setMsInterval(v)}
                        className={cn(
                          "h-full flex-1 px-2.5 text-[11.5px] font-medium uppercase tracking-wide transition-colors",
                          msInterval === v
                            ? "bg-brand-soft text-foreground"
                            : "bg-card text-muted-foreground hover:bg-muted/60"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Price scale
                  </label>
                  <div className="flex h-8 divide-x divide-border overflow-hidden rounded-md ring-1 ring-inset ring-border">
                    {(
                      [
                        { v: false, label: "Linear" },
                        { v: true, label: "Log" },
                      ] as const
                    ).map(({ v, label }) => (
                      <button
                        key={String(v)}
                        type="button"
                        onClick={() => setMsLog(v)}
                        className={cn(
                          "h-full flex-1 px-2.5 text-[11.5px] font-medium uppercase tracking-wide transition-colors",
                          msLog === v
                            ? "bg-brand-soft text-foreground"
                            : "bg-card text-muted-foreground hover:bg-muted/60"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Moving averages
                  </label>
                  <div className="flex flex-wrap gap-1.5 rounded-md bg-muted/40 p-1.5 ring-1 ring-inset ring-border">
                    {EMA_OPTIONS.map((p) => {
                      const active = msEmas.includes(p);
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() =>
                            setMsEmas((prev) =>
                              active
                                ? prev.filter((x) => x !== p)
                                : [...prev, p].sort((a, b) => a - b)
                            )
                          }
                          className={cn(
                            "h-7 rounded-md px-2 text-[11px] font-medium transition-colors",
                            active
                              ? "bg-brand-soft text-foreground ring-1 ring-inset ring-brand/30"
                              : "bg-card text-muted-foreground ring-1 ring-inset ring-border hover:bg-muted/60"
                          )}
                        >
                          {p} EMA
                        </button>
                      );
                    })}
                  </div>
                </div>

                <p className="text-[10.5px] text-muted-foreground">
                  {table.rows.length} rows · Needs Date, Open, High, Low, Close,
                  Volume columns.
                </p>
              </>
            )}

            {table && kind !== "marketsmith" && (
              <>
                {kind === "multi-line" ? (
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Y series (multiple)
                    </label>
                    <div className="max-h-40 overflow-auto rounded-md bg-muted/40 px-2 py-1.5 ring-1 ring-inset ring-border">
                      {table.headers
                        .filter((h) => h !== xCol)
                        .map((h) => {
                          const checked = yCols.includes(h);
                          return (
                            <label
                              key={h}
                              className="flex cursor-pointer items-center gap-2 py-0.5 text-[11.5px] text-foreground"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  setYCols((prev) =>
                                    e.target.checked
                                      ? [...prev.filter((c) => c !== h), h]
                                      : prev.filter((c) => c !== h)
                                  );
                                }}
                                className="h-3 w-3"
                              />
                              <span className="truncate">{h}</span>
                            </label>
                          );
                        })}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {yCols.length} selected · up to {SERIES_COLORS.length}{" "}
                      plotted
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Value column{kind === "line" ? " (Y)" : ""}
                    </label>
                    <select
                      value={yCol}
                      onChange={(e) => setYCol(e.target.value)}
                      className="h-8 rounded-md bg-muted/60 px-2 text-[12px] text-foreground ring-1 ring-inset ring-border focus:bg-card focus:outline-none focus:ring-2 focus:ring-brand/40"
                    >
                      {table.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {(kind === "line" || kind === "multi-line") && (
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      X axis
                    </label>
                    <select
                      value={xCol}
                      onChange={(e) => setXCol(e.target.value)}
                      className="h-8 rounded-md bg-muted/60 px-2 text-[12px] text-foreground ring-1 ring-inset ring-border focus:bg-card focus:outline-none focus:ring-2 focus:ring-brand/40"
                    >
                      <option value="__index__">Row index</option>
                      {table.headers
                        .filter((h) =>
                          kind === "line" ? h !== yCol : !yCols.includes(h)
                        )
                        .map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                <p className="text-[10.5px] text-muted-foreground">
                  {table.rows.length} rows · {table.headers.length} columns
                </p>
              </>
            )}

            {err && <p className="text-[11px] text-destructive">{err}</p>}
          </div>

          <div className="min-h-[620px] bg-muted/20 p-5">
            {!series ? (
              <div className="flex h-full items-center justify-center text-[12px] text-muted-foreground">
                {kind === "marketsmith"
                  ? "Provide OHLCV data (Date, Open, High, Low, Close, Volume)."
                  : "Provide data to render a chart."}
              </div>
            ) : series.kind === "ms" ? (
              <MarketSmithChart
                bars={series.bars}
                interval={msInterval}
                logScale={msLog}
                emas={msEmas}
                volAvg={msInterval === "W" ? 10 : 50}
              />
            ) : series.kind === "dist" ? (
              <DistributionChart values={series.y} />
            ) : series.kind === "line" ? (
              <LineChartView
                x={series.x}
                y={series.y}
                xIsDate={series.xIsDate}
                xLabel={xCol === "__index__" ? "Index" : xCol}
                yLabel={yCol}
              />
            ) : (
              <MultiLineChartView
                x={series.x}
                lines={series.lines}
                xIsDate={series.xIsDate}
                xLabel={xCol === "__index__" ? "Index" : xCol}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function numeric(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/[,%]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stdev(xs: number[], m?: number): number {
  if (xs.length < 2) return 0;
  const mu = m ?? mean(xs);
  const ss = xs.reduce((a, b) => a + (b - mu) * (b - mu), 0);
  return Math.sqrt(ss / (xs.length - 1));
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

function skewness(xs: number[], m: number, sd: number): number {
  if (sd === 0 || xs.length < 2) return 0;
  const n = xs.length;
  return (
    xs.reduce((acc, x) => acc + Math.pow((x - m) / sd, 3), 0) / n
  );
}

function kurtosis(xs: number[], m: number, sd: number): number {
  if (sd === 0 || xs.length < 2) return 0;
  const n = xs.length;
  return (
    xs.reduce((acc, x) => acc + Math.pow((x - m) / sd, 4), 0) / n - 3
  );
}

/** Student's t critical value for two-sided 95% CI. Good enough for display. */
function t95(df: number): number {
  if (df <= 0) return 1.96;
  // Fisher-Cornish style approximation around z=1.96.
  const z = 1.959964;
  const g1 = (z * z * z + z) / 4;
  const g2 = (5 * Math.pow(z, 5) + 16 * z * z * z + 3 * z) / 96;
  return z + g1 / df + g2 / (df * df);
}

function DistributionChart({ values }: { values: number[] }) {
  const sorted = React.useMemo(() => [...values].sort((a, b) => a - b), [values]);
  const n = values.length;
  const m = mean(values);
  const sd = stdev(values, m);
  const variance = sd * sd;
  const sk = skewness(values, m, sd);
  const kt = kurtosis(values, m, sd);
  const minV = sorted[0];
  const maxV = sorted[n - 1];
  const q1 = percentile(sorted, 25);
  const median = percentile(sorted, 50);
  const q3 = percentile(sorted, 75);
  const tCrit = t95(n - 1);
  const sem = n > 0 ? sd / Math.sqrt(n) : 0;
  const ciLo = m - tCrit * sem;
  const ciHi = m + tCrit * sem;

  // Histogram bins (Sturges)
  const bins = Math.max(5, Math.min(30, Math.ceil(Math.log2(n) + 1)));
  const binW = (maxV - minV) / bins || 1;
  const counts = new Array(bins).fill(0);
  for (const v of values) {
    let idx = Math.floor((v - minV) / binW);
    if (idx >= bins) idx = bins - 1;
    if (idx < 0) idx = 0;
    counts[idx]++;
  }
  // Density (so pdf overlay is comparable)
  const density = counts.map((c) => c / (n * binW));
  const normalPeak = sd > 0 ? 1 / (sd * Math.sqrt(2 * Math.PI)) : 0;
  const maxDensity = Math.max(...density, normalPeak, 1e-9) * 1.08;

  // SVG dimensions
  const W = 960;
  const padL = 56;
  const padR = 24;
  const padT = 28;
  const histH = 460;
  const boxH = 110;
  const gap = 36;
  const plotW = W - padL - padR;
  const innerW = plotW;

  const xScale = (v: number) =>
    padL + ((v - minV) / (maxV - minV || 1)) * innerW;
  const yScaleHist = (d: number) =>
    padT + histH - (d / maxDensity) * histH;

  // Normal curve path
  const curvePts: string[] = [];
  const steps = 100;
  for (let i = 0; i <= steps; i++) {
    const x = minV + ((maxV - minV) * i) / steps;
    const pdf =
      sd > 0
        ? (1 / (sd * Math.sqrt(2 * Math.PI))) *
          Math.exp(-0.5 * Math.pow((x - m) / sd, 2))
        : 0;
    curvePts.push(`${xScale(x)},${yScaleHist(pdf)}`);
  }

  // Boxplot geometry
  const boxTopY = padT + histH + gap;
  const boxMidY = boxTopY + boxH / 2;
  const boxTop = boxMidY - 24;
  const boxBot = boxMidY + 24;
  const whiskerLo = Math.max(minV, q1 - 1.5 * (q3 - q1));
  const whiskerHi = Math.min(maxV, q3 + 1.5 * (q3 - q1));

  const totalH = padT + histH + gap + boxH + 28;

  const fmt = (x: number, digits = 3) =>
    Number.isFinite(x) ? x.toFixed(digits) : "—";

  const [hoverBin, setHoverBin] = React.useState<number | null>(null);

  const tipW = 200;
  const tipH = 62;
  let tipX = 0;
  let tipY = 0;
  let binLo = 0;
  let binHi = 0;
  let binCount = 0;
  let binDensity = 0;
  let binPct = 0;
  if (hoverBin !== null) {
    binLo = minV + hoverBin * binW;
    binHi = minV + (hoverBin + 1) * binW;
    binCount = counts[hoverBin];
    binDensity = density[hoverBin];
    binPct = n > 0 ? (binCount / n) * 100 : 0;
    const cx = (xScale(binLo) + xScale(binHi)) / 2;
    tipX = cx + tipW / 2 + 8 > W - padR ? cx - tipW - 10 : cx + 10;
    tipX = Math.max(padL, Math.min(tipX, W - padR - tipW));
    tipY = Math.max(padT + 4, yScaleHist(binDensity) - tipH - 8);
  }

  return (
    <div className="flex h-full flex-col gap-3 lg:flex-row">
      <div className="flex-1 overflow-auto rounded-md bg-card ring-1 ring-border">
        <svg
          viewBox={`0 0 ${W} ${totalH}`}
          className="h-auto w-full"
          role="img"
          aria-label="Distribution chart"
          onPointerLeave={() => setHoverBin(null)}
        >
          {/* Axes baseline for histogram */}
          <line
            x1={padL}
            x2={W - padR}
            y1={padT + histH}
            y2={padT + histH}
            stroke="currentColor"
            strokeOpacity={0.3}
          />

          {/* Histogram bars */}
          {counts.map((c, i) => {
            if (c === 0) return null;
            const x0 = xScale(minV + i * binW);
            const x1 = xScale(minV + (i + 1) * binW);
            const d = density[i];
            const y = yScaleHist(d);
            const isHover = hoverBin === i;
            return (
              <rect
                key={i}
                x={x0 + 1}
                y={y}
                width={Math.max(1, x1 - x0 - 2)}
                height={padT + histH - y}
                fill="rgb(135 206 235)"
                opacity={isHover ? 1 : 0.75}
                stroke={isHover ? "rgb(37 99 235)" : "none"}
                strokeWidth={isHover ? 1.5 : 0}
                onPointerEnter={() => setHoverBin(i)}
                style={{ cursor: "crosshair" }}
              />
            );
          })}

          {/* Normal curve */}
          <polyline
            points={curvePts.join(" ")}
            fill="none"
            stroke="rgb(185 28 28)"
            strokeWidth={1.6}
          />

          {/* Axis labels (min/max) */}
          <text
            x={padL}
            y={padT + histH + 14}
            fontSize={10}
            fill="currentColor"
            opacity={0.7}
          >
            {fmt(minV)}
          </text>
          <text
            x={W - padR}
            y={padT + histH + 14}
            fontSize={10}
            textAnchor="end"
            fill="currentColor"
            opacity={0.7}
          >
            {fmt(maxV)}
          </text>
          <text
            x={padL - 6}
            y={padT + 10}
            fontSize={10}
            textAnchor="end"
            fill="currentColor"
            opacity={0.7}
          >
            {fmt(maxDensity, 2)}
          </text>
          <text
            x={padL - 6}
            y={padT + histH}
            fontSize={10}
            textAnchor="end"
            fill="currentColor"
            opacity={0.7}
          >
            0
          </text>

          {/* Boxplot */}
          <line
            x1={xScale(whiskerLo)}
            x2={xScale(whiskerHi)}
            y1={boxMidY}
            y2={boxMidY}
            stroke="currentColor"
            strokeOpacity={0.6}
          />
          <line
            x1={xScale(whiskerLo)}
            x2={xScale(whiskerLo)}
            y1={boxMidY - 8}
            y2={boxMidY + 8}
            stroke="currentColor"
            strokeOpacity={0.6}
          />
          <line
            x1={xScale(whiskerHi)}
            x2={xScale(whiskerHi)}
            y1={boxMidY - 8}
            y2={boxMidY + 8}
            stroke="currentColor"
            strokeOpacity={0.6}
          />
          <rect
            x={xScale(q1)}
            y={boxTop}
            width={Math.max(2, xScale(q3) - xScale(q1))}
            height={boxBot - boxTop}
            fill="rgb(135 206 235)"
            opacity={0.45}
            stroke="currentColor"
            strokeOpacity={0.6}
          />
          <line
            x1={xScale(median)}
            x2={xScale(median)}
            y1={boxTop}
            y2={boxBot}
            stroke="rgb(185 28 28)"
            strokeWidth={1.5}
          />

          <text
            x={padL}
            y={boxMidY - 28}
            fontSize={10}
            fill="currentColor"
            opacity={0.7}
          >
            Boxplot
          </text>

          {hoverBin !== null && (
            <g pointerEvents="none">
              <rect
                x={tipX}
                y={tipY}
                width={tipW}
                height={tipH}
                rx={5}
                fill="rgb(17 24 39)"
                fillOpacity={0.92}
                stroke="rgb(37 99 235)"
                strokeOpacity={0.5}
              />
              <text
                x={tipX + 10}
                y={tipY + 18}
                fontSize={11}
                fill="rgb(209 213 219)"
              >
                Range: {fmt(binLo, 2)} → {fmt(binHi, 2)}
              </text>
              <text
                x={tipX + 10}
                y={tipY + 35}
                fontSize={12}
                fontWeight={600}
                fill="white"
              >
                Count: {binCount} ({binPct.toFixed(1)}%)
              </text>
              <text
                x={tipX + 10}
                y={tipY + 51}
                fontSize={11}
                fill="rgb(209 213 219)"
              >
                Density: {fmt(binDensity, 4)}
              </text>
            </g>
          )}
        </svg>
      </div>

      <div className="w-full rounded-md bg-card p-4 font-mono text-[11.5px] leading-relaxed text-foreground ring-1 ring-border lg:w-[280px]">
        <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Summary Report
        </div>
        <StatLine label="N" value={String(n)} />
        <StatLine label="Mean" value={fmt(m)} />
        <StatLine label="StDev" value={fmt(sd)} />
        <StatLine label="Variance" value={fmt(variance)} />
        <StatLine label="Skewness" value={fmt(sk)} />
        <StatLine label="Kurtosis" value={fmt(kt)} />
        <div className="my-2 h-px bg-border/60" />
        <StatLine label="Minimum" value={fmt(minV)} />
        <StatLine label="1st Quartile" value={fmt(q1)} />
        <StatLine label="Median" value={fmt(median)} />
        <StatLine label="3rd Quartile" value={fmt(q3)} />
        <StatLine label="Maximum" value={fmt(maxV)} />
        <div className="my-2 h-px bg-border/60" />
        <div className="text-[10.5px] text-muted-foreground">
          95% CI for Mean
        </div>
        <div className="tabular-nums">
          {fmt(ciLo)} &nbsp;to&nbsp; {fmt(ciHi)}
        </div>
      </div>
    </div>
  );
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

interface LineChartProps {
  x: number[];
  y: number[];
  xIsDate: boolean;
  xLabel: string;
  yLabel: string;
}

function LineChartView({ x, y, xIsDate, xLabel, yLabel }: LineChartProps) {
  const W = 1040;
  const H = 700;
  const padL = 72;
  const padR = 24;
  const padT = 28;
  const padB = 56;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const clipId = React.useId();

  const [xRange, setXRange] = React.useState<[number, number] | null>(null);
  const [panStart, setPanStart] = React.useState<
    { vbX: number; range: [number, number] } | null
  >(null);

  React.useEffect(() => {
    setXRange(null);
  }, [x, y]);

  const fullXMin = Math.min(...x);
  const fullXMax = Math.max(...x);
  const xMin = xRange ? xRange[0] : fullXMin;
  const xMax = xRange ? xRange[1] : fullXMax;

  const yVisible: number[] = [];
  for (let i = 0; i < x.length; i++) {
    if (x[i] >= xMin && x[i] <= xMax) yVisible.push(y[i]);
  }
  const ySrc = yVisible.length > 0 ? yVisible : y;
  const rawYMin = Math.min(...ySrc);
  const rawYMax = Math.max(...ySrc);
  const yPad = (rawYMax - rawYMin) * 0.06 || Math.abs(rawYMax) * 0.06 || 1;
  const yMin = rawYMin - yPad;
  const yMax = rawYMax + yPad;
  const xSpan = xMax - xMin || 1;
  const ySpan = yMax - yMin || 1;

  const sx = (v: number) => padL + ((v - xMin) / xSpan) * innerW;
  const sy = (v: number) => padT + innerH - ((v - yMin) / ySpan) * innerH;

  const path = x
    .map((xv, i) => `${i === 0 ? "M" : "L"}${sx(xv)},${sy(y[i])}`)
    .join(" ");

  const yTickCount = 6;
  const yTicks = Array.from({ length: yTickCount + 1 }, (_, i) => {
    const v = yMin + (ySpan * i) / yTickCount;
    return { v, y: sy(v) };
  });

  const xTickCount = xIsDate ? 6 : 8;
  const xTicks = Array.from({ length: xTickCount + 1 }, (_, i) => {
    const v = xMin + (xSpan * i) / xTickCount;
    return { v, x: sx(v) };
  });

  const fmtNum = (v: number) =>
    Math.abs(v) >= 1000 || Number.isInteger(v)
      ? v.toLocaleString(undefined, { maximumFractionDigits: 2 })
      : v.toFixed(2);

  const fmtDate = (ms: number) => {
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return "";
    const spanDays = xSpan / (1000 * 60 * 60 * 24);
    const day = String(d.getDate()).padStart(2, "0");
    const mon = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ][d.getMonth()];
    const yr = String(d.getFullYear()).slice(-2);
    if (spanDays < 3) {
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      return `${day} ${mon} ${hh}:${mm}`;
    }
    if (spanDays < 400) return `${day} ${mon}`;
    return `${mon} '${yr}`;
  };

  const fmtX = (v: number) => (xIsDate ? fmtDate(v) : fmtNum(v));

  const fmtXFull = (v: number) => {
    if (!xIsDate) return fmtNum(v);
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "";
    const day = String(d.getDate()).padStart(2, "0");
    const mon = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ][d.getMonth()];
    const yr = d.getFullYear();
    const spanDays = xSpan / (1000 * 60 * 60 * 24);
    if (spanDays < 3) {
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      return `${day} ${mon} ${yr}, ${hh}:${mm}`;
    }
    return `${day} ${mon} ${yr}`;
  };

  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const [hoverIdx, setHoverIdx] = React.useState<number | null>(null);

  function clientToVbX(clientX: number): number | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return null;
    return ((clientX - rect.left) / rect.width) * W;
  }

  const isPanning = panStart !== null;

  function handleDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    const vbX = clientToVbX(e.clientX);
    if (vbX === null) return;
    if (vbX < padL || vbX > W - padR) return;
    svgRef.current?.setPointerCapture(e.pointerId);
    setPanStart({ vbX, range: [xMin, xMax] });
    setHoverIdx(null);
  }

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    const vbX = clientToVbX(e.clientX);
    if (vbX === null) return;
    if (panStart) {
      const [a0, b0] = panStart.range;
      const span = b0 - a0;
      const dataDelta = -((vbX - panStart.vbX) / innerW) * span;
      let newA = a0 + dataDelta;
      let newB = b0 + dataDelta;
      if (newA < fullXMin) {
        newB += fullXMin - newA;
        newA = fullXMin;
      }
      if (newB > fullXMax) {
        newA -= newB - fullXMax;
        newB = fullXMax;
      }
      if (newA < fullXMin) newA = fullXMin;
      if (Math.abs(newB - newA - (fullXMax - fullXMin)) < 1e-9) {
        setXRange(null);
      } else {
        setXRange([newA, newB]);
      }
      return;
    }
    if (vbX < padL - 4 || vbX > W - padR + 4) {
      setHoverIdx(null);
      return;
    }
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < x.length; i++) {
      const d = Math.abs(sx(x[i]) - vbX);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    setHoverIdx(best);
  }

  function handleUp(e: React.PointerEvent<SVGSVGElement>) {
    setPanStart(null);
    svgRef.current?.releasePointerCapture?.(e.pointerId);
  }

  React.useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handler = (e: WheelEvent) => {
      const vbX = clientToVbX(e.clientX);
      if (vbX === null) return;
      if (vbX < padL || vbX > W - padR) return;
      e.preventDefault();
      const a = xRange ? xRange[0] : fullXMin;
      const b = xRange ? xRange[1] : fullXMax;
      const span = b - a;
      const fullSpan = fullXMax - fullXMin;
      const cursorData = a + ((vbX - padL) / innerW) * span;
      const factor = e.deltaY > 0 ? 1.2 : 1 / 1.2;
      let newSpan = span * factor;
      const minSpan = fullSpan * 0.005;
      if (newSpan > fullSpan) newSpan = fullSpan;
      if (newSpan < minSpan) newSpan = minSpan;
      const leftFrac = span > 0 ? (cursorData - a) / span : 0.5;
      let newA = cursorData - leftFrac * newSpan;
      let newB = newA + newSpan;
      if (newA < fullXMin) {
        newA = fullXMin;
        newB = newA + newSpan;
      }
      if (newB > fullXMax) {
        newB = fullXMax;
        newA = newB - newSpan;
      }
      if (newA < fullXMin) newA = fullXMin;
      if (Math.abs(newSpan - fullSpan) < 1e-9) {
        setXRange(null);
      } else {
        setXRange([newA, newB]);
      }
    };
    svg.addEventListener("wheel", handler, { passive: false });
    return () => svg.removeEventListener("wheel", handler);
  }, [xRange, fullXMin, fullXMax, innerW, padL, padR, W]);

  const hoverX = hoverIdx !== null ? sx(x[hoverIdx]) : 0;
  const hoverY = hoverIdx !== null ? sy(y[hoverIdx]) : 0;
  const tipW = 180;
  const tipH = 54;
  const tipPad = 10;
  const tipX =
    hoverX + tipW + tipPad + 8 > W - padR
      ? hoverX - tipW - tipPad
      : hoverX + tipPad;
  const tipY = Math.max(padT, Math.min(hoverY - tipH / 2, padT + innerH - tipH));

  return (
    <div className="flex h-full items-stretch">
      <div className="relative flex-1 overflow-hidden rounded-md bg-card ring-1 ring-border">
        {xRange && (
          <button
            type="button"
            onClick={() => setXRange(null)}
            className="absolute right-3 top-3 z-10 rounded-md bg-foreground/90 px-2.5 py-1 text-[11px] font-medium text-background shadow hover:bg-foreground"
          >
            Reset zoom
          </button>
        )}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full select-none"
          style={{ cursor: isPanning ? "grabbing" : "grab" }}
          role="img"
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerLeave={() => setHoverIdx(null)}
          onDoubleClick={() => setXRange(null)}
        >
          <defs>
            <clipPath id={`clip-${clipId}`}>
              <rect
                x={padL}
                y={padT}
                width={innerW}
                height={innerH}
              />
            </clipPath>
          </defs>
          {yTicks.map((t, i) => (
            <g key={`y${i}`}>
              <line
                x1={padL}
                x2={W - padR}
                y1={t.y}
                y2={t.y}
                stroke="currentColor"
                strokeOpacity={0.08}
              />
              <text
                x={padL - 8}
                y={t.y + 3}
                fontSize={11}
                textAnchor="end"
                fill="currentColor"
                opacity={0.7}
              >
                {fmtNum(t.v)}
              </text>
            </g>
          ))}
          {xTicks.map((t, i) => (
            <g key={`x${i}`}>
              <line
                x1={t.x}
                x2={t.x}
                y1={padT + innerH}
                y2={padT + innerH + 4}
                stroke="currentColor"
                strokeOpacity={0.35}
              />
              <text
                x={t.x}
                y={padT + innerH + 18}
                fontSize={11}
                textAnchor="middle"
                fill="currentColor"
                opacity={0.75}
              >
                {fmtX(t.v)}
              </text>
            </g>
          ))}
          <line
            x1={padL}
            x2={padL}
            y1={padT}
            y2={padT + innerH}
            stroke="currentColor"
            strokeOpacity={0.3}
          />
          <line
            x1={padL}
            x2={W - padR}
            y1={padT + innerH}
            y2={padT + innerH}
            stroke="currentColor"
            strokeOpacity={0.3}
          />
          <path
            d={path}
            fill="none"
            stroke="rgb(37 99 235)"
            strokeWidth={1.8}
            clipPath={`url(#clip-${clipId})`}
          />
          <text
            x={padL}
            y={padT - 10}
            fontSize={11}
            fill="currentColor"
            opacity={0.6}
          >
            {yLabel}
          </text>
          <text
            x={W - padR}
            y={padT + innerH + 40}
            fontSize={11}
            textAnchor="end"
            fill="currentColor"
            opacity={0.6}
          >
            {xLabel}
          </text>

          {hoverIdx !== null && !isPanning && (
            <g pointerEvents="none">
              <line
                x1={hoverX}
                x2={hoverX}
                y1={padT}
                y2={padT + innerH}
                stroke="currentColor"
                strokeOpacity={0.35}
                strokeDasharray="4 3"
              />
              <circle
                cx={hoverX}
                cy={hoverY}
                r={4.5}
                fill="rgb(37 99 235)"
                stroke="white"
                strokeWidth={1.5}
              />
              <rect
                x={tipX}
                y={tipY}
                width={tipW}
                height={tipH}
                rx={5}
                fill="rgb(17 24 39)"
                fillOpacity={0.92}
                stroke="rgb(37 99 235)"
                strokeOpacity={0.5}
              />
              <text
                x={tipX + 10}
                y={tipY + 20}
                fontSize={11}
                fill="rgb(209 213 219)"
              >
                {xLabel}: {fmtXFull(x[hoverIdx])}
              </text>
              <text
                x={tipX + 10}
                y={tipY + 38}
                fontSize={12}
                fontWeight={600}
                fill="white"
              >
                {yLabel}: {fmtNum(y[hoverIdx])}
              </text>
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}

interface MultiLineChartProps {
  x: number[];
  lines: { name: string; y: (number | null)[] }[];
  xIsDate: boolean;
  xLabel: string;
}

function MultiLineChartView({
  x,
  lines,
  xIsDate,
  xLabel,
}: MultiLineChartProps) {
  const W = 1040;
  const H = 700;
  const padL = 72;
  const padR = 24;
  const padT = 48;
  const padB = 56;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const clipId = React.useId();

  const [xRange, setXRange] = React.useState<[number, number] | null>(null);
  const [panStart, setPanStart] = React.useState<
    { vbX: number; range: [number, number] } | null
  >(null);

  React.useEffect(() => {
    setXRange(null);
  }, [x, lines]);

  const visible = lines.slice(0, SERIES_COLORS.length);

  const fullXMin = Math.min(...x);
  const fullXMax = Math.max(...x);
  const xMin = xRange ? xRange[0] : fullXMin;
  const xMax = xRange ? xRange[1] : fullXMax;

  let yLo = Infinity;
  let yHi = -Infinity;
  for (const l of visible) {
    for (let i = 0; i < l.y.length; i++) {
      const v = l.y[i];
      if (v === null) continue;
      if (x[i] < xMin || x[i] > xMax) continue;
      if (v < yLo) yLo = v;
      if (v > yHi) yHi = v;
    }
  }
  if (!Number.isFinite(yLo) || !Number.isFinite(yHi)) {
    for (const l of visible) {
      for (const v of l.y) {
        if (v === null) continue;
        if (v < yLo) yLo = v;
        if (v > yHi) yHi = v;
      }
    }
  }
  if (!Number.isFinite(yLo) || !Number.isFinite(yHi)) {
    yLo = 0;
    yHi = 1;
  }
  const yPad = (yHi - yLo) * 0.06 || Math.abs(yHi) * 0.06 || 1;
  const yMin = yLo - yPad;
  const yMax = yHi + yPad;
  const xSpan = xMax - xMin || 1;
  const ySpan = yMax - yMin || 1;

  const sx = (v: number) => padL + ((v - xMin) / xSpan) * innerW;
  const sy = (v: number) => padT + innerH - ((v - yMin) / ySpan) * innerH;

  const paths = visible.map((l) => {
    let started = false;
    const parts: string[] = [];
    l.y.forEach((yv, i) => {
      if (yv === null) {
        started = false;
        return;
      }
      parts.push(`${started ? "L" : "M"}${sx(x[i])},${sy(yv)}`);
      started = true;
    });
    return parts.join(" ");
  });

  const yTickCount = 6;
  const yTicks = Array.from({ length: yTickCount + 1 }, (_, i) => {
    const v = yMin + (ySpan * i) / yTickCount;
    return { v, y: sy(v) };
  });

  const xTickCount = xIsDate ? 6 : 8;
  const xTicks = Array.from({ length: xTickCount + 1 }, (_, i) => {
    const v = xMin + (xSpan * i) / xTickCount;
    return { v, x: sx(v) };
  });

  const fmtNum = (v: number) =>
    Math.abs(v) >= 1000 || Number.isInteger(v)
      ? v.toLocaleString(undefined, { maximumFractionDigits: 2 })
      : v.toFixed(2);

  const fmtDate = (ms: number) => {
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return "";
    const spanDays = xSpan / (1000 * 60 * 60 * 24);
    const day = String(d.getDate()).padStart(2, "0");
    const mon = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ][d.getMonth()];
    const yr = String(d.getFullYear()).slice(-2);
    if (spanDays < 3) {
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      return `${day} ${mon} ${hh}:${mm}`;
    }
    if (spanDays < 400) return `${day} ${mon}`;
    return `${mon} '${yr}`;
  };

  const fmtX = (v: number) => (xIsDate ? fmtDate(v) : fmtNum(v));

  const fmtXFull = (v: number) => {
    if (!xIsDate) return fmtNum(v);
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "";
    const day = String(d.getDate()).padStart(2, "0");
    const mon = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ][d.getMonth()];
    const yr = d.getFullYear();
    const spanDays = xSpan / (1000 * 60 * 60 * 24);
    if (spanDays < 3) {
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      return `${day} ${mon} ${yr}, ${hh}:${mm}`;
    }
    return `${day} ${mon} ${yr}`;
  };

  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const [hoverIdx, setHoverIdx] = React.useState<number | null>(null);

  function clientToVbX(clientX: number): number | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return null;
    return ((clientX - rect.left) / rect.width) * W;
  }

  const isPanning = panStart !== null;

  function handleDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    const vbX = clientToVbX(e.clientX);
    if (vbX === null) return;
    if (vbX < padL || vbX > W - padR) return;
    svgRef.current?.setPointerCapture(e.pointerId);
    setPanStart({ vbX, range: [xMin, xMax] });
    setHoverIdx(null);
  }

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    const vbX = clientToVbX(e.clientX);
    if (vbX === null) return;
    if (panStart) {
      const [a0, b0] = panStart.range;
      const span = b0 - a0;
      const dataDelta = -((vbX - panStart.vbX) / innerW) * span;
      let newA = a0 + dataDelta;
      let newB = b0 + dataDelta;
      if (newA < fullXMin) {
        newB += fullXMin - newA;
        newA = fullXMin;
      }
      if (newB > fullXMax) {
        newA -= newB - fullXMax;
        newB = fullXMax;
      }
      if (newA < fullXMin) newA = fullXMin;
      if (Math.abs(newB - newA - (fullXMax - fullXMin)) < 1e-9) {
        setXRange(null);
      } else {
        setXRange([newA, newB]);
      }
      return;
    }
    if (vbX < padL - 4 || vbX > W - padR + 4) {
      setHoverIdx(null);
      return;
    }
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < x.length; i++) {
      const d = Math.abs(sx(x[i]) - vbX);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    setHoverIdx(best);
  }

  function handleUp(e: React.PointerEvent<SVGSVGElement>) {
    setPanStart(null);
    svgRef.current?.releasePointerCapture?.(e.pointerId);
  }

  React.useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handler = (e: WheelEvent) => {
      const vbX = clientToVbX(e.clientX);
      if (vbX === null) return;
      if (vbX < padL || vbX > W - padR) return;
      e.preventDefault();
      const a = xRange ? xRange[0] : fullXMin;
      const b = xRange ? xRange[1] : fullXMax;
      const span = b - a;
      const fullSpan = fullXMax - fullXMin;
      const cursorData = a + ((vbX - padL) / innerW) * span;
      const factor = e.deltaY > 0 ? 1.2 : 1 / 1.2;
      let newSpan = span * factor;
      const minSpan = fullSpan * 0.005;
      if (newSpan > fullSpan) newSpan = fullSpan;
      if (newSpan < minSpan) newSpan = minSpan;
      const leftFrac = span > 0 ? (cursorData - a) / span : 0.5;
      let newA = cursorData - leftFrac * newSpan;
      let newB = newA + newSpan;
      if (newA < fullXMin) {
        newA = fullXMin;
        newB = newA + newSpan;
      }
      if (newB > fullXMax) {
        newB = fullXMax;
        newA = newB - newSpan;
      }
      if (newA < fullXMin) newA = fullXMin;
      if (Math.abs(newSpan - fullSpan) < 1e-9) {
        setXRange(null);
      } else {
        setXRange([newA, newB]);
      }
    };
    svg.addEventListener("wheel", handler, { passive: false });
    return () => svg.removeEventListener("wheel", handler);
  }, [xRange, fullXMin, fullXMax, innerW, padL, padR, W]);

  const hoverX = hoverIdx !== null ? sx(x[hoverIdx]) : 0;
  const tipW = 220;
  const tipLineH = 16;
  const tipH = 24 + visible.length * tipLineH;
  const tipPad = 12;
  const tipX =
    hoverX + tipW + tipPad + 8 > W - padR
      ? hoverX - tipW - tipPad
      : hoverX + tipPad;
  const tipY = Math.max(
    padT,
    Math.min(padT + innerH / 2 - tipH / 2, padT + innerH - tipH)
  );

  return (
    <div className="flex h-full items-stretch">
      <div className="relative flex-1 overflow-hidden rounded-md bg-card ring-1 ring-border">
        {xRange && (
          <button
            type="button"
            onClick={() => setXRange(null)}
            className="absolute right-3 top-3 z-10 rounded-md bg-foreground/90 px-2.5 py-1 text-[11px] font-medium text-background shadow hover:bg-foreground"
          >
            Reset zoom
          </button>
        )}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full select-none"
          style={{ cursor: isPanning ? "grabbing" : "grab" }}
          role="img"
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerLeave={() => setHoverIdx(null)}
          onDoubleClick={() => setXRange(null)}
        >
          <defs>
            <clipPath id={`clip-${clipId}`}>
              <rect
                x={padL}
                y={padT}
                width={innerW}
                height={innerH}
              />
            </clipPath>
          </defs>
          {visible.map((l, li) => (
            <g key={`legend-${l.name}`}>
              <rect
                x={padL + li * 160}
                y={padT - 32}
                width={12}
                height={12}
                fill={SERIES_COLORS[li]}
                rx={2}
              />
              <text
                x={padL + li * 160 + 18}
                y={padT - 22}
                fontSize={11}
                fill="currentColor"
                opacity={0.85}
              >
                {l.name}
              </text>
            </g>
          ))}
          {yTicks.map((t, i) => (
            <g key={`y${i}`}>
              <line
                x1={padL}
                x2={W - padR}
                y1={t.y}
                y2={t.y}
                stroke="currentColor"
                strokeOpacity={0.08}
              />
              <text
                x={padL - 8}
                y={t.y + 3}
                fontSize={11}
                textAnchor="end"
                fill="currentColor"
                opacity={0.7}
              >
                {fmtNum(t.v)}
              </text>
            </g>
          ))}
          {xTicks.map((t, i) => (
            <g key={`x${i}`}>
              <line
                x1={t.x}
                x2={t.x}
                y1={padT + innerH}
                y2={padT + innerH + 4}
                stroke="currentColor"
                strokeOpacity={0.35}
              />
              <text
                x={t.x}
                y={padT + innerH + 18}
                fontSize={11}
                textAnchor="middle"
                fill="currentColor"
                opacity={0.75}
              >
                {fmtX(t.v)}
              </text>
            </g>
          ))}
          <line
            x1={padL}
            x2={padL}
            y1={padT}
            y2={padT + innerH}
            stroke="currentColor"
            strokeOpacity={0.3}
          />
          <line
            x1={padL}
            x2={W - padR}
            y1={padT + innerH}
            y2={padT + innerH}
            stroke="currentColor"
            strokeOpacity={0.3}
          />
          {paths.map((d, i) => (
            <path
              key={`line-${visible[i].name}`}
              d={d}
              fill="none"
              stroke={SERIES_COLORS[i]}
              strokeWidth={1.8}
              clipPath={`url(#clip-${clipId})`}
            />
          ))}
          <text
            x={W - padR}
            y={padT + innerH + 40}
            fontSize={11}
            textAnchor="end"
            fill="currentColor"
            opacity={0.6}
          >
            {xLabel}
          </text>

          {hoverIdx !== null && !isPanning && (
            <g pointerEvents="none">
              <line
                x1={hoverX}
                x2={hoverX}
                y1={padT}
                y2={padT + innerH}
                stroke="currentColor"
                strokeOpacity={0.35}
                strokeDasharray="4 3"
              />
              {visible.map((l, li) => {
                const yv = l.y[hoverIdx];
                if (yv === null) return null;
                return (
                  <circle
                    key={`dot-${l.name}`}
                    cx={hoverX}
                    cy={sy(yv)}
                    r={4}
                    fill={SERIES_COLORS[li]}
                    stroke="white"
                    strokeWidth={1.4}
                  />
                );
              })}
              <rect
                x={tipX}
                y={tipY}
                width={tipW}
                height={tipH}
                rx={5}
                fill="rgb(17 24 39)"
                fillOpacity={0.92}
                stroke="rgb(37 99 235)"
                strokeOpacity={0.5}
              />
              <text
                x={tipX + 10}
                y={tipY + 18}
                fontSize={11}
                fill="rgb(209 213 219)"
              >
                {xLabel}: {fmtXFull(x[hoverIdx])}
              </text>
              {visible.map((l, li) => {
                const yv = l.y[hoverIdx];
                const label =
                  yv === null ? "—" : fmtNum(yv);
                const rowY = tipY + 18 + (li + 1) * tipLineH;
                return (
                  <g key={`tip-${l.name}`}>
                    <rect
                      x={tipX + 10}
                      y={rowY - 9}
                      width={8}
                      height={8}
                      fill={SERIES_COLORS[li]}
                      rx={1.5}
                    />
                    <text
                      x={tipX + 22}
                      y={rowY}
                      fontSize={11}
                      fontWeight={500}
                      fill="white"
                    >
                      {l.name}: {label}
                    </text>
                  </g>
                );
              })}
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
