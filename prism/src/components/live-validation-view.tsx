"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Filter, Pencil, Plus, RefreshCw, Trash2, TrendingUp, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { cn, humanizeColumnName, normKey } from "@/lib/utils";
import type { LiveValidationDataset } from "@/lib/data/live-validation";
import type { SnapshotRow, SnapshotValue } from "@/lib/data/types";

const POSITION_KEYS = new Set([
  "openpositions",
  "openposition",
  "positionstatus",
  "positionsstatus",
  "posstatus",
]);

const ENTRY_DATE_KEYS = new Set([
  "entrydate",
  "entrydt",
  "entrydatetime",
  "entry",
]);

interface LiveValidationViewProps {
  initialDataset: LiveValidationDataset;
}

export function LiveValidationView({ initialDataset }: LiveValidationViewProps) {
  const [dataset, setDataset] =
    React.useState<LiveValidationDataset>(initialDataset);
  const [loading, setLoading] = React.useState(false);
  const [filters, setFilters] = React.useState<Record<string, string[]>>({});
  const [showFilters, setShowFilters] = React.useState(false);
  const [editing, setEditing] = React.useState<null | {
    id: string | null;
    draft: SnapshotRow;
  }>(null);
  const [saving, setSaving] = React.useState(false);
  const [refreshingPrices, setRefreshingPrices] = React.useState(false);
  const [modelFilter, setModelFilter] = React.useState<"all" | "M7" | "M7.1">("all");

  // Identify special columns
  const predictionCol = React.useMemo(
    () => dataset.columns.find((c) => normKey(c) === "prediction") ?? null,
    [dataset.columns]
  );
  const positionCol = React.useMemo(
    () => dataset.columns.find((c) => POSITION_KEYS.has(normKey(c))) ?? null,
    [dataset.columns]
  );
  const entryDateCol = React.useMemo(
    () => dataset.columns.find((c) => ENTRY_DATE_KEYS.has(normKey(c))) ?? null,
    [dataset.columns]
  );
  const modelCol = React.useMemo(
    () => dataset.columns.find((c) => normKey(c) === "model") ?? null,
    [dataset.columns]
  );

  // Rows filtered by model selector (applied before column filters)
  const modelFilteredRows = React.useMemo(() => {
    if (modelFilter === "all" || !modelCol) return dataset.rows;
    return dataset.rows.filter((r) => {
      const v = String(r[modelCol] ?? "").trim();
      return v === modelFilter;
    });
  }, [dataset.rows, modelFilter, modelCol]);

  // Reload from API
  const reload = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/live-validation", { cache: "no-store" });
      const json = (await res.json()) as LiveValidationDataset;
      setDataset(json);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Background poll so the summary reflects newly closed positions without
  // a manual refresh (e.g. when a price update auto-closes a row).
  React.useEffect(() => {
    const id = setInterval(() => {
      reload(true).catch(() => {});
    }, 30_000);
    const onFocus = () => reload(true).catch(() => {});
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [reload]);

  async function handleDelete(id: string) {
    await fetch(`/api/live-validation?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    reload();
  }

  async function refreshPrices() {
    setRefreshingPrices(true);
    try {
      const res = await fetch("/api/live-validation/prices", {
        method: "POST",
        cache: "no-store",
      });
      const json = await res.json();
      if (json.dataset) setDataset(json.dataset as LiveValidationDataset);
    } finally {
      setRefreshingPrices(false);
    }
  }

  async function handleSave() {
    if (!editing) return;
    setSaving(true);
    try {
      if (editing.id) {
        await fetch("/api/live-validation", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: editing.id, patch: editing.draft }),
        });
      } else {
        await fetch("/api/live-validation", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(editing.draft),
        });
      }
      setEditing(null);
      await reload();
    } finally {
      setSaving(false);
    }
  }

  // Filter options per column (scoped to model-filtered rows)
  const filterableColumns = React.useMemo(() => {
    const out: { column: string; options: { label: string; value: string }[] }[] =
      [];
    for (const col of dataset.columns) {
      const seen = new Set<string>();
      for (const row of modelFilteredRows) {
        const v = row[col];
        if (v === null || v === undefined || v === "") continue;
        seen.add(String(v));
      }
      if (seen.size === 0) continue;
      const options = Array.from(seen)
        .sort((a, b) => {
          const na = Number(a);
          const nb = Number(b);
          if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
          return a.localeCompare(b);
        })
        .map((v) => ({ value: v, label: v }));
      out.push({ column: col, options });
    }
    return out;
  }, [dataset.columns, modelFilteredRows]);

  // Default filter values: position = open, prediction = buy.
  React.useEffect(() => {
    if (filterableColumns.length === 0) return;
    const init: Record<string, string[]> = {};
    if (positionCol) {
      const opts = filterableColumns.find((c) => c.column === positionCol);
      if (opts) {
        const open = opts.options.find((o) => {
          const k = o.value.trim().toLowerCase();
          return k === "open" || k === "ope" || k === "yes" || k === "y" || k === "1";
        });
        if (open) init[positionCol] = [open.value];
      }
    }
    if (predictionCol) {
      const opts = filterableColumns.find((c) => c.column === predictionCol);
      if (opts) {
        const buy = opts.options.find((o) => o.value.trim().toLowerCase() === "buy");
        if (buy) init[predictionCol] = [buy.value];
      }
    }
    setFilters(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset.updatedAt]);

  // Apply filters
  const visibleRows = React.useMemo(() => {
    let rows = modelFilteredRows;
    for (const [col, vals] of Object.entries(filters)) {
      if (!vals || vals.length === 0) continue;
      const set = new Set(vals);
      rows = rows.filter((r) => {
        const v = r[col];
        if (v === null || v === undefined) return false;
        return set.has(String(v));
      });
    }
    if (entryDateCol) {
      rows = [...rows].sort((a, b) => {
        const da = parseDate(a[entryDateCol]);
        const db = parseDate(b[entryDateCol]);
        if (da === null && db === null) return 0;
        if (da === null) return 1;
        if (db === null) return -1;
        return db - da;
      });
    }
    return rows;
  }, [modelFilteredRows, filters, entryDateCol]);

  if (!dataset.exists) {
    return (
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 py-8 animate-fade-in-up">
        <PageHeader
          eyebrow="Live"
          title="Live validation"
          description="Track open M7-Long predictions against the live tape."
        />
        <Card>
          <CardContent className="py-16 text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                <RefreshCw className="h-5 w-5 text-muted-foreground/50" />
              </div>
              <p className="text-[13px] text-muted-foreground">
                <code className="rounded-md bg-muted px-2 py-0.5 font-mono text-[12px] text-foreground/70">
                  live_validation.csv
                </code>{" "}
                not found in the Dash data directory.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const updatedFull = dataset.updatedAt
    ? new Date(dataset.updatedAt).toLocaleString()
    : "Unknown";

  return (
    <div className="mx-auto max-w-[1440px] px-4 sm:px-6 py-8 animate-fade-in-up">
      <PageHeader
        eyebrow="Live"
        title="Live Validation"
        description="Track open predictions against the live tape. Filters default to open Buy positions."
        actions={
          <>
            <Badge
              tone="success"
              dot
              pulse
              title={`Last snapshot: ${updatedFull}`}
            >
              Live · updated <RelativeTime iso={dataset.updatedAt ?? null} />
            </Badge>
            {loading && (
              <Badge tone="info" dot pulse>
                Loading…
              </Badge>
            )}
          </>
        }
      />

      {(() => {
        const activeEntries = Object.entries(filters).filter(
          ([, vals]) => vals && vals.length > 0
        );
        const hasActiveFilters = activeEntries.length > 0;

        function clearAll() {
          setFilters({});
        }

        function clearOne(col: string) {
          setFilters((prev) => {
            const next = { ...prev };
            delete next[col];
            return next;
          });
        }

        return (
          <div className="flex flex-col gap-4">
            <LivePnLPanel
              rows={dataset.rows}
              modelCol={modelCol}
              modelFilter={modelFilter}
              refreshing={refreshingPrices}
            />

            {/* Compact toolbar */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Model selector */}
              {modelCol && (
                <div className="inline-flex rounded-lg border border-border/70 bg-muted/40 p-0.5">
                  {(["all", "M7", "M7.1"] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setModelFilter(opt)}
                      className={cn(
                        "rounded-md px-3 py-1 text-[11.5px] font-medium transition-all",
                        modelFilter === opt
                          ? "bg-card text-foreground shadow-sm ring-1 ring-border/60"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {opt === "all" ? "All Models" : opt}
                    </button>
                  ))}
                </div>
              )}

              <Badge tone="neutral" className="font-mono text-[10px]">
                {visibleRows.length} / {modelFilteredRows.length}
              </Badge>

              {/* Active filter chips */}
              {activeEntries.map(([col, vals]) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => clearOne(col)}
                  className="group inline-flex items-center gap-1 rounded-full bg-brand-soft/60 px-2.5 py-1 text-[11px] font-medium text-foreground ring-1 ring-inset ring-brand/20 transition-colors hover:bg-brand-soft"
                  title="Remove filter"
                >
                  <span className="text-muted-foreground">
                    {humanizeColumnName(col)}:
                  </span>
                  <span className="truncate max-w-[140px]">
                    {vals.length > 1 ? `${vals.length} selected` : vals[0]}
                  </span>
                  <X className="h-2.5 w-2.5 opacity-60 group-hover:opacity-100" />
                </button>
              ))}

              <div className="ml-auto flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowFilters((v) => !v)}
                >
                  <Filter className="h-3.5 w-3.5" />
                  Filters
                  <ChevronsUpDown className="h-3 w-3" />
                </Button>
                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAll}
                    title="Clear all filters"
                  >
                    <X className="h-3.5 w-3.5" />
                    Clear
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={refreshPrices}
                  disabled={refreshingPrices}
                  title="Fetch latest prices from Yahoo Finance"
                >
                  <TrendingUp
                    className={cn(
                      "h-3.5 w-3.5",
                      refreshingPrices && "animate-pulse"
                    )}
                  />
                  {refreshingPrices ? "Fetching…" : "Refresh prices"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setEditing({ id: null, draft: blankDraft() })
                  }
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add row
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => reload()}
                  disabled={loading}
                >
                  <RefreshCw
                    className={cn("h-3.5 w-3.5", loading && "animate-spin")}
                  />
                  Reload
                </Button>
              </div>
            </div>

            {/* Collapsible filter grid — dense, chip-sized */}
            {showFilters && filterableColumns.length > 0 && (
              <div className="rounded-xl border border-border/50 bg-card/40 px-3 py-2.5">
                <div className="flex flex-wrap gap-1.5">
                  {filterableColumns.map(({ column, options }) => (
                    <CompactFilter
                      key={column}
                      label={humanizeColumnName(column)}
                      options={options}
                      value={filters[column] ?? []}
                      onChange={(vals) =>
                        setFilters((prev) => ({
                          ...prev,
                          [column]: vals,
                        }))
                      }
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Table */}
            <Card
              flat
              className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[0_1px_2px_rgba(0,0,0,0.03),0_8px_24px_-12px_rgba(0,0,0,0.08)] ring-0"
            >
              <CardHeader className="flex-row items-center justify-between gap-3 border-b border-border/50 bg-gradient-to-b from-muted/30 to-transparent pb-3">
                <div className="flex items-center gap-2.5">
                  <CardTitle className="text-[13.5px] font-semibold tracking-tight">
                    Predictions
                  </CardTitle>
                  <Badge tone="neutral" className="font-mono text-[10px]">
                    {visibleRows.length} / {modelFilteredRows.length}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Win
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                    Loss
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                    Open
                  </span>
                </div>
              </CardHeader>
              <CardContent className="px-0 pt-0 pb-0">
                <div className="max-h-[calc(100vh-280px)] min-h-[60vh] overflow-auto">
                  <table className="w-full border-separate border-spacing-0 text-[12.5px] tnum">
                    <thead>
                      <tr>
                        <th className="sticky top-0 z-20 w-[64px] border-b border-border/60 bg-gradient-to-b from-card to-card/95 px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80 backdrop-blur-sm">
                          {""}
                        </th>
                        {dataset.columns.map((c) => (
                          <th
                            key={c}
                            className={cn(
                              "sticky top-0 z-20 whitespace-nowrap border-b border-border/60 bg-gradient-to-b from-card to-card/95 px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80 backdrop-blur-sm",
                              NUMERIC_HEADERS.has(c) && "text-right"
                            )}
                          >
                            {humanizeColumnName(c)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.length === 0 && (
                        <tr>
                          <td
                            colSpan={(dataset.columns.length || 1) + 1}
                            className="px-4 py-20 text-center"
                          >
                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/60 ring-1 ring-border/50">
                                <Filter className="h-4 w-4 opacity-60" />
                              </div>
                              <div className="text-[13px] font-medium text-foreground/80">
                                No predictions match the current filters
                              </div>
                              <div className="text-[11.5px] text-muted-foreground">
                                Try clearing filters or switching model selection.
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                      {visibleRows.map((row, i) => {
                        const rowId = String(row["id"] ?? "");
                        const winLoss = String(row["Win/Loss"] ?? "").trim().toLowerCase();
                        const posStatus = String(row["Position Status"] ?? "").trim().toLowerCase();
                        const dotTone =
                          winLoss === "win"
                            ? "bg-emerald-500"
                            : winLoss === "loss"
                              ? "bg-rose-500"
                              : posStatus === "open"
                                ? "bg-sky-500"
                                : "bg-muted-foreground/25";
                        const dotTitle =
                          winLoss === "win"
                            ? "Win"
                            : winLoss === "loss"
                              ? "Loss"
                              : posStatus === "open"
                                ? "Open"
                                : "";
                        return (
                          <tr
                            key={rowId}
                            className={cn(
                              "group relative animate-row-in transition-colors duration-100",
                              "hover:bg-accent/50",
                              i % 2 === 1 && "bg-muted/20"
                            )}
                            style={{
                              animationDelay: `${Math.min(i * 14, 280)}ms`,
                            }}
                          >
                            <td className="border-b border-border-soft px-2 py-1.5 align-middle">
                              <div className="flex items-center gap-1">
                                <span
                                  title={dotTitle}
                                  className={cn(
                                    "h-1.5 w-1.5 shrink-0 rounded-full",
                                    dotTone,
                                    posStatus === "open" &&
                                      winLoss !== "win" &&
                                      winLoss !== "loss" &&
                                      "animate-pulse"
                                  )}
                                />
                                <div className="flex items-center gap-0.5 opacity-40 transition-opacity group-hover:opacity-100">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditing({
                                      id: rowId,
                                      draft: draftFromRow(row),
                                    })
                                  }
                                  className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-brand-soft/70 hover:text-brand"
                                  title="Edit"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (
                                      confirm(
                                        `Delete row${row["Ticker"] ? ` for ${row["Ticker"]}` : ""}?`
                                      )
                                    ) {
                                      handleDelete(rowId);
                                    }
                                  }}
                                  className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                                  title="Delete"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                                </div>
                              </div>
                            </td>
                            {dataset.columns.map((c) => {
                              const v = row[c];
                              const isNumeric = typeof v === "number";
                              return (
                                <td
                                  key={c}
                                  className={cn(
                                    "border-b border-border-soft px-3 py-2 align-middle text-foreground/90",
                                    isNumeric
                                      ? "whitespace-nowrap text-right font-mono tabular-nums"
                                      : "break-words",
                                    c === "Ticker" && "font-mono font-semibold text-foreground"
                                  )}
                                  title={
                                    v === null || v === undefined
                                      ? undefined
                                      : String(v)
                                  }
                                >
                                  {FLASH_COLS.has(c) ? (
                                    <FlashNumericCell value={v} col={c} />
                                  ) : (
                                    renderCell(v, c)
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
            <SummaryFooter rows={modelFilteredRows} />
          </div>
        );
      })()}

      {editing && (
        <RowEditor
          draft={editing.draft}
          isNew={editing.id === null}
          saving={saving}
          onChange={(next) =>
            setEditing((cur) => (cur ? { ...cur, draft: next } : cur))
          }
          onCancel={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

const EDITABLE_COLUMNS = [
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

const NUMERIC_FIELDS = new Set([
  "Entry Price",
  "P_Target",
  "% Target",
  "P_Stoploss",
  "% Stoploss",
  "+/- Points",
  "Exit Price",
  "Current Price",
]);

const PROBABILITY_OPTIONS: { value: string; range: string }[] = [
  { value: "Low", range: "75 – 83.3" },
  { value: "Mid", range: "83.4 – 91.6" },
  { value: "High", range: "91.7 – 100" },
];

const MODEL_OPTIONS = ["M7", "M7.1"] as const;

function blankDraft(): SnapshotRow {
  const d: SnapshotRow = {};
  for (const c of EDITABLE_COLUMNS) d[c] = null;
  return d;
}

function draftFromRow(row: SnapshotRow): SnapshotRow {
  const d: SnapshotRow = {};
  for (const c of EDITABLE_COLUMNS) d[c] = row[c] ?? null;
  return d;
}

interface RowEditorProps {
  draft: SnapshotRow;
  isNew: boolean;
  saving: boolean;
  onChange: (next: SnapshotRow) => void;
  onCancel: () => void;
  onSave: () => void;
}

function RowEditor({
  draft,
  isNew,
  saving,
  onChange,
  onCancel,
  onSave,
}: RowEditorProps) {
  function set(col: string, raw: string) {
    const next = { ...draft };
    if (raw === "") {
      next[col] = null;
    } else if (NUMERIC_FIELDS.has(col)) {
      const n = Number(raw);
      next[col] = Number.isFinite(n) ? n : raw;
    } else {
      next[col] = raw;
    }
    onChange(next);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="my-8 w-full max-w-3xl rounded-2xl bg-card shadow-xl ring-1 ring-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-foreground">
              {isNew ? "Add prediction" : "Edit prediction"}
            </h2>
            <p className="text-[11.5px] text-muted-foreground">
              Derived columns (Current PL, % PL, Point To Target, Target Met,
              Stoploss Met) are computed automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-2">
          {EDITABLE_COLUMNS.map((col) => {
            const v = draft[col];
            const isNum = NUMERIC_FIELDS.has(col);
            const isProb = col === "Probability";
            const isModel = col === "Model";
            return (
              <div key={col} className="flex flex-col gap-1">
                <label className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  {col}
                </label>
                {isProb ? (
                  <ProbabilityDropdown
                    value={v === null || v === undefined ? "" : String(v)}
                    onChange={(val) => set(col, val)}
                  />
                ) : isModel ? (
                  <ModelDropdown
                    value={v === null || v === undefined ? "" : String(v)}
                    onChange={(val) => set(col, val)}
                  />
                ) : (
                  <input
                    type={isNum ? "number" : "text"}
                    step={isNum ? "any" : undefined}
                    value={v === null || v === undefined ? "" : String(v)}
                    onChange={(e) => set(col, e.target.value)}
                    className="h-8 rounded-md bg-muted/60 px-2.5 text-[12.5px] text-foreground ring-1 ring-inset ring-border focus:bg-card focus:outline-none focus:ring-2 focus:ring-brand/40"
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border/60 px-5 py-3.5">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button variant="outline" size="sm" onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : isNew ? "Add" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface ProbabilityDropdownProps {
  value: string;
  onChange: (val: string) => void;
}

function ProbabilityDropdown({ value, onChange }: ProbabilityDropdownProps) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current || !open) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const selected = PROBABILITY_OPTIONS.find((o) => o.value === value);

  const toneFor = (v: string) =>
    v === "High"
      ? "bg-emerald-100 text-emerald-700"
      : v === "Mid"
        ? "bg-amber-100 text-amber-700"
        : v === "Low"
          ? "bg-rose-100 text-rose-700"
          : "bg-muted text-muted-foreground";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-full items-center justify-between rounded-md bg-muted/60 px-2.5 text-[12.5px] text-foreground ring-1 ring-inset ring-border transition-colors hover:bg-card focus:bg-card focus:outline-none focus:ring-2 focus:ring-brand/40"
      >
        {selected ? (
          <span className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
                toneFor(selected.value)
              )}
            >
              {selected.value}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {selected.range}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">Select probability…</span>
        )}
        <ChevronsUpDown className="h-3 w-3 text-muted-foreground/70" />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-[60] w-full overflow-hidden rounded-lg bg-popover shadow-pop ring-1 ring-black/[0.06] animate-scale-in">
          <div className="py-1">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] text-muted-foreground hover:bg-accent"
            >
              Clear
            </button>
            {PROBABILITY_OPTIONS.map((o) => {
              const sel = o.value === value;
              return (
                <button
                  type="button"
                  key={o.value}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[12px]",
                    sel ? "bg-brand-soft/60 text-foreground" : "hover:bg-accent"
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
                      toneFor(o.value)
                    )}
                  >
                    {o.value}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {o.range}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface ModelDropdownProps {
  value: string;
  onChange: (val: string) => void;
}

function ModelDropdown({ value, onChange }: ModelDropdownProps) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current || !open) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-full items-center justify-between rounded-md bg-muted/60 px-2.5 text-[12.5px] text-foreground ring-1 ring-inset ring-border transition-colors hover:bg-card focus:bg-card focus:outline-none focus:ring-2 focus:ring-brand/40"
      >
        {value ? (
          <span className="font-mono text-[12px] text-foreground">{value}</span>
        ) : (
          <span className="text-muted-foreground">Select model…</span>
        )}
        <ChevronsUpDown className="h-3 w-3 text-muted-foreground/70" />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-[60] w-full overflow-hidden rounded-lg bg-popover shadow-pop ring-1 ring-black/[0.06] animate-scale-in">
          <div className="py-1">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] text-muted-foreground hover:bg-accent"
            >
              Clear
            </button>
            {MODEL_OPTIONS.map((m) => {
              const sel = m === value;
              return (
                <button
                  type="button"
                  key={m}
                  onClick={() => {
                    onChange(m);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[12px]",
                    sel ? "bg-brand-soft/60 text-foreground" : "hover:bg-accent"
                  )}
                >
                  <span className="font-mono text-[12px]">{m}</span>
                  {sel && <Check className="h-3 w-3 text-brand" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface CompactFilterProps {
  label: string;
  options: { label: string; value: string }[];
  value: string[];
  onChange: (vals: string[]) => void;
  disabled?: boolean;
}

function CompactFilter({
  label,
  options,
  value,
  onChange,
  disabled,
}: CompactFilterProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current || !open) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const filtered = React.useMemo(() => {
    if (!query) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const valueSet = React.useMemo(() => new Set(value), [value]);
  const hasValue = value.length > 0;

  function toggle(v: string) {
    if (valueSet.has(v)) onChange(value.filter((x) => x !== v));
    else onChange([...value, v]);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex h-7 items-center gap-1 rounded-full border border-border/70 bg-card px-2.5 text-[11px] transition-colors",
          "hover:bg-accent/60 hover:border-border",
          "disabled:cursor-not-allowed disabled:opacity-50",
          hasValue && "border-brand/40 bg-brand-soft/40 text-foreground"
        )}
      >
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">
          {value.length === 0
            ? "All"
            : value.length === 1
              ? options.find((o) => o.value === value[0])?.label || value[0]
              : `${value.length}`}
        </span>
        {hasValue && !disabled ? (
          <span
            role="button"
            className="ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onChange([]);
            }}
          >
            <X className="h-2.5 w-2.5" strokeWidth={3} />
          </span>
        ) : (
          <ChevronsUpDown className="h-2.5 w-2.5 text-muted-foreground/70" />
        )}
      </button>

      {open && !disabled && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-56 overflow-hidden rounded-lg bg-popover shadow-pop ring-1 ring-black/[0.06] animate-scale-in">
          <div className="border-b border-border/60 p-1.5">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="h-7 w-full rounded-md bg-muted px-2 text-[12px] text-foreground placeholder:text-muted-foreground focus:bg-card focus:outline-none focus:ring-2 focus:ring-brand/30"
              autoFocus
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-center text-[12px] text-muted-foreground">
                No matches
              </div>
            )}
            {filtered.map((o) => {
              const sel = valueSet.has(o.value);
              return (
                <button
                  type="button"
                  key={o.value}
                  onClick={() => toggle(o.value)}
                  className={cn(
                    "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px]",
                    sel
                      ? "bg-brand-soft/60 text-foreground"
                      : "hover:bg-accent"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] ring-1 ring-inset",
                      sel
                        ? "bg-brand text-white ring-brand"
                        : "bg-card ring-border"
                    )}
                  >
                    {sel && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
                  </span>
                  <span className="truncate">{o.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function RelativeTime({ iso }: { iso: string | null }) {
  const [, force] = React.useReducer((n: number) => (n + 1) % 1_000_000, 0);
  React.useEffect(() => {
    const id = setInterval(force, 30_000);
    return () => clearInterval(id);
  }, []);
  if (!iso) return <span>never</span>;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return <span>just now</span>;
  if (ms < 15_000) return <span>just now</span>;
  if (ms < 60_000) return <span>{Math.floor(ms / 1000)}s ago</span>;
  if (ms < 3_600_000) return <span>{Math.floor(ms / 60_000)}m ago</span>;
  if (ms < 86_400_000) return <span>{Math.floor(ms / 3_600_000)}h ago</span>;
  return <span>{Math.floor(ms / 86_400_000)}d ago</span>;
}

function AnimatedNumber({
  value,
  format,
  duration = 600,
}: {
  value: number | null;
  format: (n: number) => string;
  duration?: number;
}) {
  const [animated, setAnimated] = React.useState<number>(value ?? 0);
  const prev = React.useRef<number | null>(value);

  React.useEffect(() => {
    if (value === null) {
      prev.current = null;
      return;
    }
    if (prev.current === null) {
      setAnimated(value);
      prev.current = value;
      return;
    }
    if (prev.current === value) return;
    const start = performance.now();
    const from = animated;
    const target = value;
    prev.current = value;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min((t - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setAnimated(from + (target - from) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  if (value === null) return <>—</>;
  return <>{format(animated)}</>;
}

const FLASH_COLS = new Set([
  "Current Price",
  "Current PL",
  "% Current PL",
  "Point To Target",
]);

const NUMERIC_HEADERS = new Set([
  "Entry Price",
  "P_Target",
  "% Target",
  "P_Stoploss",
  "% Stoploss",
  "+/- Points",
  "Exit Price",
  "Win/Loss %",
  "Current Price",
  "Current PL",
  "% Current PL",
  "Point To Target",
]);

function FlashNumericCell({
  value,
  col,
}: {
  value: SnapshotValue | undefined;
  col: string;
}) {
  const prev = React.useRef(value);
  const [flash, setFlash] = React.useState<"up" | "down" | null>(null);

  React.useEffect(() => {
    if (
      typeof value === "number" &&
      typeof prev.current === "number" &&
      value !== prev.current
    ) {
      const dir = value > prev.current ? "up" : "down";
      setFlash(dir);
      const t = setTimeout(() => setFlash(null), 950);
      prev.current = value;
      return () => clearTimeout(t);
    }
    prev.current = value;
  }, [value]);

  return (
    <span
      className={cn(
        "-mx-1 inline-block rounded px-1",
        flash === "up" && "flash-up",
        flash === "down" && "flash-down"
      )}
    >
      {renderCell(value, col)}
    </span>
  );
}

function renderCell(v: SnapshotValue | undefined, col?: string): React.ReactNode {
  if (v === null || v === undefined || v === "")
    return <span className="text-muted-foreground/40">—</span>;
  if (col === "Probability" && typeof v === "string") {
    const k = v.trim().toLowerCase();
    const tone =
      k === "high"
        ? "bg-emerald-100 text-emerald-700"
        : k === "mid"
          ? "bg-amber-100 text-amber-700"
          : k === "low"
            ? "bg-rose-100 text-rose-700"
            : "bg-muted text-muted-foreground";
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
          tone
        )}
      >
        {v}
      </span>
    );
  }
  if (col === "Win/Loss" && typeof v === "string") {
    const k = v.trim().toLowerCase();
    const tone =
      k === "win"
        ? "bg-emerald-100 text-emerald-700"
        : k === "loss"
          ? "bg-rose-100 text-rose-700"
          : "bg-muted text-muted-foreground";
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
          tone
        )}
      >
        {v}
      </span>
    );
  }
  if (col === "Prediction" && typeof v === "string") {
    const k = v.trim().toLowerCase();
    const tone =
      k === "buy" || k === "long"
        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
        : k === "sell" || k === "short"
          ? "bg-rose-50 text-rose-700 ring-rose-200"
          : k === "nb"
            ? "bg-muted text-muted-foreground ring-border/60"
            : "bg-sky-50 text-sky-700 ring-sky-200";
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset",
          tone
        )}
      >
        {v}
      </span>
    );
  }
  if (col === "Position Status" && typeof v === "string") {
    const k = v.trim().toLowerCase();
    const isOpen = k === "open";
    const isClosed =
      k === "close" || k === "closed" || k === "exit" || k === "exited";
    const tone = isOpen
      ? "bg-sky-50 text-sky-700 ring-sky-200"
      : isClosed
        ? "bg-muted text-muted-foreground ring-border/60"
        : "bg-amber-50 text-amber-700 ring-amber-200";
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium ring-1 ring-inset",
          tone
        )}
      >
        {isOpen && (
          <span className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-pulse" />
        )}
        {v}
      </span>
    );
  }
  if (col === "Model" && typeof v === "string") {
    return (
      <span className="inline-flex items-center rounded-md bg-brand-soft/60 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-foreground ring-1 ring-inset ring-brand/20">
        {v}
      </span>
    );
  }
  if (col === "Outcome" && typeof v === "string") {
    const k = v.trim().toLowerCase();
    const isTrue = k === "truepositive" || k === "truenegative";
    const isFalse = k === "falsepositive" || k === "falsenegative";
    const tone = isTrue
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : isFalse
        ? "bg-rose-50 text-rose-700 ring-rose-200"
        : "bg-muted text-muted-foreground ring-border/60";
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10.5px] font-medium ring-1 ring-inset",
          tone
        )}
      >
        {v}
      </span>
    );
  }
  if (col === "Tested" && typeof v === "string") {
    return (
      <span className="inline-flex items-center rounded-md bg-muted/70 px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-foreground/80 ring-1 ring-inset ring-border/60">
        {v}
      </span>
    );
  }
  if (typeof v === "boolean") {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
          v
            ? "bg-emerald-100 text-emerald-700"
            : "bg-muted text-muted-foreground"
        )}
      >
        {v ? "Yes" : "No"}
      </span>
    );
  }
  if (typeof v === "number") {
    const pctCol = col === "% Current PL" || col === "Win/Loss %";
    const signed =
      col === "Current PL" ||
      col === "% Current PL" ||
      col === "Point To Target" ||
      col === "+/- Points" ||
      col === "Win/Loss %";
    const formatted = Number.isInteger(v) ? v.toString() : v.toFixed(2);
    if (signed) {
      const cls = v > 0 ? "text-emerald-600" : v < 0 ? "text-red-600" : "";
      return (
        <span className={cls}>
          {v > 0 ? "+" : ""}
          {formatted}
          {pctCol ? "%" : ""}
        </span>
      );
    }
    return `${formatted}${pctCol ? "%" : ""}`;
  }
  return String(v);
}

function parseDate(v: SnapshotValue | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  // Try a few common Indian-style formats first
  const formats = [
    /^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/, // 13-Feb-2026 / 13-Feb-26
    /^(\d{4})-(\d{2})-(\d{2})$/, // 2026-02-13
    /^(\d{1,2})-(\d{1,2})-(\d{2,4})$/, // 13-02-2026
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/, // 13/02/2026
  ];
  const months: Record<string, number> = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };
  for (const re of formats) {
    const m = re.exec(s);
    if (!m) continue;
    if (re === formats[0]) {
      const day = Number(m[1]);
      const monIdx = months[m[2].toLowerCase()];
      if (monIdx === undefined) continue;
      let year = Number(m[3]);
      if (year < 100) year += 2000;
      return new Date(year, monIdx, day).getTime();
    }
    if (re === formats[1]) {
      return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
    }
    if (re === formats[2] || re === formats[3]) {
      let year = Number(m[3]);
      if (year < 100) year += 2000;
      return new Date(year, Number(m[2]) - 1, Number(m[1])).getTime();
    }
  }
  // Last resort: native Date parse
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

function toNum(v: SnapshotValue | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[,%]/g, ""));
  return Number.isFinite(n) ? n : null;
}

interface LivePnLPanelProps {
  rows: SnapshotRow[];
  modelCol: string | null;
  modelFilter: "all" | "M7" | "M7.1";
  refreshing: boolean;
}

interface LivePnLBucket {
  label: string;
  count: number;
  totalPl: number;
  avgPctPl: number | null;
  hasPlData: boolean;
}

function isOpenPosition(row: SnapshotRow): boolean {
  const pos = String(row["Position Status"] ?? "").trim().toLowerCase();
  if (!pos) return false;
  return !(
    pos === "close" ||
    pos === "closed" ||
    pos === "exit" ||
    pos === "exited"
  );
}

function bucketPnL(rows: SnapshotRow[], label: string): LivePnLBucket {
  let count = 0;
  let totalPl = 0;
  let pctSum = 0;
  let pctN = 0;
  let hasPlData = false;
  for (const r of rows) {
    if (!isOpenPosition(r)) continue;
    count++;
    const pl = toNum(r["Current PL"]);
    if (pl !== null) {
      totalPl += pl;
      hasPlData = true;
    }
    const pct = toNum(r["% Current PL"]);
    if (pct !== null) {
      pctSum += pct;
      pctN++;
    }
  }
  return {
    label,
    count,
    totalPl,
    avgPctPl: pctN ? pctSum / pctN : null,
    hasPlData,
  };
}

function LivePnLPanel({
  rows,
  modelCol,
  modelFilter,
  refreshing,
}: LivePnLPanelProps) {
  const buckets = React.useMemo<LivePnLBucket[]>(() => {
    if (modelFilter !== "all") {
      const scoped = modelCol
        ? rows.filter(
            (r) => String(r[modelCol] ?? "").trim() === modelFilter
          )
        : rows;
      return [bucketPnL(scoped, modelFilter)];
    }
    const list: LivePnLBucket[] = [bucketPnL(rows, "Overall")];
    if (modelCol) {
      for (const m of MODEL_OPTIONS) {
        const scoped = rows.filter(
          (r) => String(r[modelCol] ?? "").trim() === m
        );
        list.push(bucketPnL(scoped, m));
      }
    }
    return list;
  }, [rows, modelCol, modelFilter]);

  const fmtSigned = (n: number) => {
    const rounded =
      Math.abs(n - Math.round(n)) < 0.005 ? Math.round(n).toString() : n.toFixed(2);
    return `${n > 0 ? "+" : ""}${rounded}`;
  };
  const fmtPct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;

  return (
    <Card
      flat
      className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[0_1px_2px_rgba(0,0,0,0.03),0_8px_24px_-12px_rgba(0,0,0,0.08)] ring-0"
    >
      <CardHeader className="flex-row items-center justify-between gap-3 border-b border-border/50 bg-gradient-to-b from-muted/30 to-transparent pb-3">
        <div className="flex items-center gap-2.5">
          <CardTitle className="text-[13.5px] font-semibold tracking-tight">
            Live P&amp;L · open positions
          </CardTitle>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.08em]",
              refreshing ? "text-amber-600" : "text-muted-foreground"
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                refreshing ? "bg-amber-500 animate-pulse" : "bg-emerald-500"
              )}
            />
            {refreshing ? "Updating…" : "Live"}
          </span>
        </div>
        <span className="text-[11px] text-muted-foreground">
          Refresh prices to recompute
        </span>
      </CardHeader>
      <CardContent className="pt-3 pb-3.5">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3">
          {buckets.map((b) => {
            const tone =
              !b.hasPlData
                ? "neutral"
                : b.totalPl > 0
                  ? "pos"
                  : b.totalPl < 0
                    ? "neg"
                    : "neutral";
            return (
              <div
                key={b.label}
                className={cn(
                  "flex flex-col gap-1 rounded-xl border px-3.5 py-2.5 transition-colors",
                  tone === "pos" &&
                    "border-emerald-200/70 bg-emerald-50/40",
                  tone === "neg" && "border-rose-200/70 bg-rose-50/40",
                  tone === "neutral" && "border-border/60 bg-muted/30"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    {b.label}
                  </span>
                  <span className="font-mono text-[10.5px] text-muted-foreground">
                    {b.count} open
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      "font-mono text-[18px] font-semibold tabular-nums",
                      tone === "pos" && "text-emerald-600",
                      tone === "neg" && "text-rose-600",
                      tone === "neutral" && "text-foreground"
                    )}
                  >
                    {b.hasPlData ? fmtSigned(b.totalPl) : "—"}
                  </span>
                  <span className="text-[10.5px] text-muted-foreground">
                    pts
                  </span>
                </div>
                <span
                  className={cn(
                    "font-mono text-[11px] tabular-nums",
                    b.avgPctPl === null
                      ? "text-muted-foreground/70"
                      : b.avgPctPl > 0
                        ? "text-emerald-600"
                        : b.avgPctPl < 0
                          ? "text-rose-600"
                          : "text-muted-foreground"
                  )}
                >
                  {b.avgPctPl === null
                    ? "avg —"
                    : `avg ${fmtPct(b.avgPctPl)}`}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

interface SummaryFooterProps {
  rows: SnapshotRow[];
}

function SummaryFooter({ rows }: SummaryFooterProps) {
  const s = React.useMemo(() => {
    let buys = 0;
    let wins = 0;
    let losses = 0;
    let totalPts = 0;
    let posPts = 0;
    let negPts = 0;
    let totalPct = 0;
    let winPctSum = 0;
    let winPctN = 0;
    let lossPctSum = 0;
    let lossPctN = 0;

    for (const r of rows) {
      const pred = String(r["Prediction"] ?? "").trim().toLowerCase();
      const pos = String(r["Position Status"] ?? "").trim().toLowerCase();
      const isClosed =
        pos === "close" || pos === "closed" || pos === "exit" || pos === "exited";
      if (pred === "buy" && isClosed) buys++;

      const wl = String(r["Win/Loss"] ?? "").trim().toLowerCase();
      const isWin = wl === "win";
      const isLoss = wl === "loss";
      if (isWin) wins++;
      if (isLoss) losses++;

      const pts = toNum(r["+/- Points"]);
      if (pts !== null) {
        totalPts += pts;
        if (pts > 0) posPts += pts;
        else if (pts < 0) negPts += pts;
      }

      const pct = toNum(r["Win/Loss %"]);
      if (pct !== null) {
        totalPct += pct;
        if (isWin || (pct > 0 && !isLoss)) {
          winPctSum += pct;
          winPctN++;
        } else if (isLoss || (pct < 0 && !isWin)) {
          lossPctSum += pct;
          lossPctN++;
        }
      }
    }

    const avgWinPct = winPctN ? winPctSum / winPctN : null;
    const avgLossPct = lossPctN ? lossPctSum / lossPctN : null;
    const winRate = buys > 0 ? (wins / buys) * 100 : null;
    const lossRate = buys > 0 ? (losses / buys) * 100 : null;
    const expectancyR =
      buys > 0
        ? ((losses / buys) * (avgLossPct ?? 0)) +
          ((wins / buys) * (avgWinPct ?? 0))
        : null;
    return {
      buys,
      wins,
      losses,
      totalPts,
      posPts,
      negPts,
      totalPct,
      avgWinPct,
      avgLossPct,
      winRate,
      lossRate,
      expectancyR,
    };
  }, [rows]);

  const fmtInt = (n: number) => Math.round(n).toString();
  const fmtN = (n: number) =>
    Math.abs(n - Math.round(n)) < 0.005 ? Math.round(n).toString() : n.toFixed(2);
  const fmtPct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
  const fmtSigned = (n: number) => `${n > 0 ? "+" : ""}${fmtN(n)}`;

  const items: {
    label: string;
    value: number | null;
    format: (n: number) => string;
    tone?: "pos" | "neg";
  }[] = [
    { label: "Buys", value: s.buys, format: fmtInt },
    { label: "Wins", value: s.wins, format: fmtInt, tone: s.wins > 0 ? "pos" : undefined },
    { label: "Losses", value: s.losses, format: fmtInt, tone: s.losses > 0 ? "neg" : undefined },
    {
      label: "Total +/- pts",
      value: s.totalPts,
      format: fmtSigned,
      tone: s.totalPts > 0 ? "pos" : s.totalPts < 0 ? "neg" : undefined,
    },
    { label: "Total + pts", value: s.posPts, format: fmtSigned, tone: "pos" },
    { label: "Total − pts", value: s.negPts, format: fmtSigned, tone: "neg" },
    {
      label: "Total W/L %",
      value: s.totalPct,
      format: fmtPct,
      tone: s.totalPct > 0 ? "pos" : s.totalPct < 0 ? "neg" : undefined,
    },
    {
      label: "Avg Win %",
      value: s.avgWinPct,
      format: fmtPct,
      tone: s.avgWinPct !== null && s.avgWinPct > 0 ? "pos" : undefined,
    },
    {
      label: "Avg Loss %",
      value: s.avgLossPct,
      format: fmtPct,
      tone: s.avgLossPct !== null && s.avgLossPct < 0 ? "neg" : undefined,
    },
    {
      label: "Win Rate",
      value: s.winRate,
      format: fmtPct,
      tone: s.winRate !== null && s.winRate >= 50 ? "pos" : undefined,
    },
    {
      label: "Loss Rate",
      value: s.lossRate,
      format: fmtPct,
      tone: s.lossRate !== null && s.lossRate > 0 ? "neg" : undefined,
    },
    {
      label: "Expectancy R",
      value: s.expectancyR,
      format: fmtPct,
      tone:
        s.expectancyR === null
          ? undefined
          : s.expectancyR > 0
            ? "pos"
            : s.expectancyR < 0
              ? "neg"
              : undefined,
    },
  ];

  return (
    <Card flat className="mt-2">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-[12px] uppercase tracking-[0.08em] text-muted-foreground">
          Closed positions summary · {s.buys} closed buys / {rows.length} total rows
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 gap-x-10 gap-y-4 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-9">
          {items.map((it) => (
            <div key={it.label} className="flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                {it.label}
              </span>
              <span
                className={cn(
                  "font-mono text-[13px] tabular-nums",
                  it.tone === "pos" && "text-emerald-600",
                  it.tone === "neg" && "text-rose-600"
                )}
              >
                <AnimatedNumber value={it.value} format={it.format} />
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

