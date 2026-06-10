"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ChevronsUpDown,
  Download,
  ExternalLink,
  Eraser,
  Filter,
  RefreshCw,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Percent,
} from "lucide-react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MultiSelect } from "@/components/ui/multi-select";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { cn, detectKeyColumn, humanizeColumnName, normKey } from "@/lib/utils";
import type {
  SnapshotDataset,
  SnapshotFile,
  SnapshotRow,
  SnapshotValue,
} from "@/lib/data/types";

const MARKETSMITH_URL =
  "https://marketsmithindia.com/mstool/eval/{symbol}/evaluation.jsp#/";

const PRESET_FILTERS: Record<string, string[]> = {
  masterrating: ["a", "b"],
  epsstrengthrating: ["good", "great"],
  pricestrengthrating: ["good", "great"],
  buyerdemandrating: ["good", "great"],
};

interface MainDashboardProps {
  initialSnapshots: SnapshotFile[];
  initialDataset: SnapshotDataset;
}

export function MainDashboard({
  initialSnapshots,
  initialDataset,
}: MainDashboardProps) {
  const router = useRouter();
  const [snapshots, setSnapshots] =
    React.useState<SnapshotFile[]>(initialSnapshots);
  const [dataset, setDataset] = React.useState<SnapshotDataset>(initialDataset);
  const [selectedName, setSelectedName] = React.useState<string>(
    initialDataset.name
  );
  const [loading, setLoading] = React.useState(false);
  const [showFilters, setShowFilters] = React.useState(true);
  const [filterValues, setFilterValues] = React.useState<
    Record<string, string[]>
  >(() => buildPresetFilters(initialDataset));
  const [sorting, setSorting] = React.useState<SortingState>([]);

  // Reload `latest.parquet` from the API. Keeps user-applied filter selections
  // intact across auto-refreshes so a new scrape doesn't blow away their state.
  const reloadLatest = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/snapshots/latest", { cache: "no-store" });
      const json = (await res.json()) as SnapshotDataset;
      setDataset(json);
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll for new snapshots every 30s. When a fresher scrape lands AND the user
  // is viewing "latest.parquet", auto-reload the dataset so the Updated date
  // and rows reflect the freshest scrape.
  const lastSeenTs = React.useRef<number>(
    new Date(initialDataset.updatedAt).getTime() || 0
  );
  React.useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/snapshots", { cache: "no-store" });
        const json = await res.json();
        if (cancelled || !Array.isArray(json.snapshots)) return;
        setSnapshots(json.snapshots);
        const newestTs =
          json.snapshots.length > 0 ? json.snapshots[0].timestamp : 0;
        if (
          newestTs > lastSeenTs.current &&
          selectedName === "latest.parquet"
        ) {
          lastSeenTs.current = newestTs;
          reloadLatest();
        } else if (newestTs > lastSeenTs.current) {
          lastSeenTs.current = newestTs;
        }
      } catch {
        /* ignore */
      }
    }
    const id = setInterval(poll, 30_000);
    // Run once immediately so a scrape that finished while the page was hidden
    // is picked up as soon as the user returns.
    poll();
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [selectedName, reloadLatest]);

  // Load a snapshot when selectedName changes (skip first render — initial dataset is already loaded).
  const firstRender = React.useRef(true);
  React.useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const url =
          selectedName === "latest.parquet"
            ? "/api/snapshots/latest"
            : `/api/snapshots/${encodeURIComponent(selectedName)}`;
        const res = await fetch(url, { cache: "no-store" });
        const json = (await res.json()) as SnapshotDataset;
        if (cancelled) return;
        setDataset(json);
        setFilterValues(buildPresetFilters(json));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [selectedName]);

  // Stats
  const stats = React.useMemo(() => computeStats(dataset.rows), [dataset.rows]);

  // Build filter option lists from the loaded dataset.
  const filterableColumns = React.useMemo(
    () => buildFilterableColumns(dataset),
    [dataset]
  );

  // Apply filters to produce visible rows.
  const filteredRows = React.useMemo(() => {
    let out = dataset.rows;
    for (const [col, vals] of Object.entries(filterValues)) {
      if (!vals || vals.length === 0) continue;
      const valSet = new Set(vals.map(String));
      out = out.filter((row) => {
        const v = row[col];
        if (v === null || v === undefined) return false;
        return valSet.has(String(v));
      });
    }
    return out;
  }, [dataset.rows, filterValues]);

  const keyColumn = React.useMemo(
    () => detectKeyColumn(dataset.columns),
    [dataset.columns]
  );

  // TanStack Table columns
  const columns = React.useMemo<ColumnDef<SnapshotRow>[]>(() => {
    return dataset.columns.map((col) => ({
      id: col,
      accessorFn: (row) => row[col],
      header: () => <span>{humanizeColumnName(col)}</span>,
      cell: (info) => {
        const value = info.getValue() as SnapshotValue;
        if (col === keyColumn) {
          const sym = String(value ?? "");
          if (!sym) return null;
          return (
            <a
              href={MARKETSMITH_URL.replace(
                "{symbol}",
                encodeURIComponent(sym.toLowerCase())
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-1 font-semibold text-foreground transition-colors hover:text-brand"
              title={`Open ${sym} on MarketSmith`}
            >
              {sym}
              <ExternalLink className="h-3 w-3 opacity-30 transition-opacity group-hover:opacity-100" />
            </a>
          );
        }
        return formatCell(value);
      },
      sortingFn: (a, b, columnId) => {
        const av = a.getValue<SnapshotValue>(columnId);
        const bv = b.getValue<SnapshotValue>(columnId);
        return compareValues(av, bv);
      },
    }));
  }, [dataset.columns, keyColumn]);

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  function clearFilters() {
    setFilterValues({});
  }

  function downloadSelected() {
    const name = selectedName || "latest.parquet";
    window.open(`/api/download/${encodeURIComponent(name)}`, "_blank");
  }

  return (
    <div className="mx-auto max-w-[1440px] px-4 sm:px-8 py-8 pr-8 animate-fade-in-up">
      <PageHeader
        eyebrow="Snapshot"
        title="Marketsmith Ratings"
        description={dataset.message}
        actions={
          loading && (
            <Badge tone="info" dot pulse>
              Loading…
            </Badge>
          )
        }
      />

      {/* Stat cards — colorful tone cards matching the warm dashboard palette */}
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Total tickers"
          value={String(stats.total)}
          tone="olive"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          label="Success"
          value={String(stats.success)}
          tone="amber"
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <StatCard
          label="Failed"
          value={String(stats.failed)}
          tone="cream"
          icon={<XCircle className="h-4 w-4" />}
        />
        <StatCard
          label="Success rate"
          value={`${stats.successPct}%`}
          tone="lavender"
          icon={<Percent className="h-4 w-4" />}
        />
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Sidebar */}
        <aside className="col-span-12 flex flex-col gap-5 md:col-span-3">
          {/* Snapshot picker */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                Snapshot
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Select
                value={selectedName}
                onChange={(e) => setSelectedName(e.target.value)}
                disabled={loading}
              >
                <option value="latest.parquet">latest.parquet</option>
                {snapshots.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.label}
                  </option>
                ))}
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={downloadSelected}
                className="w-full"
              >
                <Download className="h-3.5 w-3.5" />
                Download .parquet
              </Button>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                History rotates daily; up to 30 days kept.
              </p>
            </CardContent>
          </Card>

          {/* Filters */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                  Filters
                </CardTitle>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFilters}
                    title="Clear filters"
                  >
                    <Eraser className="h-3.5 w-3.5" />
                    Clear
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setShowFilters((v) => !v)}
                    title="Show / hide filters"
                  >
                    <ChevronsUpDown className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <ActiveFilterChips
                values={filterValues}
                onClear={(col) =>
                  setFilterValues((prev) => {
                    const next = { ...prev };
                    delete next[col];
                    return next;
                  })
                }
              />
              {showFilters && (
                <div className="flex max-h-[65vh] flex-col gap-3.5 overflow-y-auto pr-1">
                  {filterableColumns.map(({ column, options }) => (
                    <div key={column}>
                      <label className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        {humanizeColumnName(column)}
                      </label>
                      <MultiSelect
                        options={options}
                        value={filterValues[column] ?? []}
                        onChange={(vals) =>
                          setFilterValues((prev) => ({
                            ...prev,
                            [column]: vals,
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </aside>

        {/* Main table */}
        <section className="col-span-12 flex flex-col gap-6 md:col-span-9">
          <Card flat className="overflow-hidden">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2.5">
                  Ratings
                  <Badge tone="neutral" className="font-mono text-[10px]">
                    {filteredRows.length} / {dataset.rows.length}
                  </Badge>
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push("/compare")}
                  >
                    Compare
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push("/scraper")}
                  >
                    Scraper
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-0 pt-0 pb-0">
              <div className="max-h-[calc(100vh-360px)] min-h-[55vh] overflow-auto">
                <table className="w-full border-separate border-spacing-0 text-[13px] tnum">
                  <thead>
                    {table.getHeaderGroups().map((hg) => (
                      <tr key={hg.id}>
                        {hg.headers.map((header) => {
                          const sortDir = header.column.getIsSorted();
                          return (
                            <th
                              key={header.id}
                              onClick={header.column.getToggleSortingHandler()}
                              className="sticky top-0 z-20 cursor-pointer select-none border-b border-border/60 bg-card px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground transition-colors hover:text-foreground"
                            >
                              <div className="flex items-center gap-1.5">
                                {flexRender(
                                  header.column.columnDef.header,
                                  header.getContext()
                                )}
                                <span
                                  className={cn(
                                    "text-[10px] transition-opacity",
                                    sortDir
                                      ? "opacity-100 text-brand"
                                      : "opacity-0"
                                  )}
                                >
                                  {sortDir === "desc" ? "↓" : "↑"}
                                </span>
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {table.getRowModel().rows.map((row) => {
                      const status = row.original["Status"];
                      const isFailed =
                        status !== undefined && status !== "Success";
                      return (
                        <tr
                          key={row.id}
                          className={cn(
                            "transition-colors duration-100 hover:bg-accent/40",
                            isFailed && "bg-destructive-soft/40"
                          )}
                        >
                          {row.getVisibleCells().map((cell) => (
                            <td
                              key={cell.id}
                              className="border-b border-border-soft px-4 py-3 text-foreground/90"
                            >
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext()
                              )}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                    {table.getRowModel().rows.length === 0 && (
                      <tr>
                        <td
                          colSpan={dataset.columns.length || 1}
                          className="px-4 py-16 text-center text-[13px] text-muted-foreground"
                        >
                          No rows match the current filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Subcomponents
// ────────────────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  tone = "cream",
  icon,
}: {
  label: string;
  value: string;
  tone?: "cream" | "olive" | "amber" | "lavender";
  icon?: React.ReactNode;
}) {
  // Inner chip styling per tone — subtle darker/translucent accent that pops on the card.
  const chipStyle =
    tone === "olive"
      ? "bg-white/25 text-[#2a2a20]"
      : tone === "amber"
        ? "bg-white/35 text-[#3a2e14]"
        : tone === "lavender"
          ? "bg-white/35 text-[#1f1b3a]"
          : "bg-brand-soft text-[hsl(90_35%_28%)]";

  const labelStyle =
    tone === "olive"
      ? "text-[#2a2a20]/70"
      : tone === "amber"
        ? "text-[#3a2e14]/70"
        : tone === "lavender"
          ? "text-[#1f1b3a]/70"
          : "text-muted-foreground";

  const valueStyle =
    tone === "olive"
      ? "text-[#1f1f18]"
      : tone === "amber"
        ? "text-[#2a2010]"
        : tone === "lavender"
          ? "text-[#17142b]"
          : "text-foreground";

  return (
    <Card interactive tone={tone} className="overflow-hidden">
      <div className="flex items-center gap-4 p-5">
        {icon && (
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
              chipStyle
            )}
          >
            {icon}
          </div>
        )}
        <div className="flex flex-col gap-1">
          <span
            className={cn(
              "text-[11px] font-medium uppercase tracking-[0.06em]",
              labelStyle
            )}
          >
            {label}
          </span>
          <span
            className={cn(
              "display-num text-[26px] font-semibold",
              valueStyle
            )}
          >
            {value}
          </span>
        </div>
      </div>
    </Card>
  );
}

function ActiveFilterChips({
  values,
  onClear,
}: {
  values: Record<string, string[]>;
  onClear: (col: string) => void;
}) {
  const entries = Object.entries(values).filter(
    ([, v]) => Array.isArray(v) && v.length > 0
  );
  if (entries.length === 0)
    return (
      <p className="text-[12px] text-muted-foreground">
        No filters applied
      </p>
    );
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([col, vals]) => (
        <button
          key={col}
          onClick={() => onClear(col)}
          className="press group inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-[11px] font-semibold text-brand transform-gpu hover:bg-brand/10"
          title="Click to clear"
        >
          <span className="truncate max-w-[120px]">
            {humanizeColumnName(col)}: {vals.join(", ")}
          </span>
          <span className="text-brand/40 group-hover:text-brand transition-colors">×</span>
        </button>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function computeStats(rows: SnapshotRow[]) {
  const total = rows.length;
  const success = rows.filter(
    (r) => r["Master_Rating"] !== null && r["Master_Rating"] !== undefined
  ).length;
  const failed = total - success;
  const successPct = total > 0 ? Math.round((success / total) * 1000) / 10 : 0;
  return { total, success, failed, successPct };
}

function buildPresetFilters(dataset: SnapshotDataset): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!dataset.rows.length) return out;
  for (const col of dataset.columns) {
    const k = normKey(col);
    const desired = PRESET_FILTERS[k];
    if (!desired) continue;
    const desiredSet = new Set(desired);
    const present = new Set<string>();
    for (const row of dataset.rows) {
      const v = row[col];
      if (v === null || v === undefined) continue;
      const nv = normKey(v);
      if (desiredSet.has(nv)) present.add(String(v));
    }
    if (present.size > 0) out[col] = Array.from(present);
  }
  return out;
}

interface FilterableColumn {
  column: string;
  options: { label: string; value: string }[];
}

function buildFilterableColumns(dataset: SnapshotDataset): FilterableColumn[] {
  const out: FilterableColumn[] = [];
  for (const col of dataset.columns) {
    const seen = new Map<string, string>(); // value-as-string -> display label
    for (const row of dataset.rows) {
      const v = row[col];
      if (v === null || v === undefined || v === "") continue;
      const s = String(v);
      if (!seen.has(s)) seen.set(s, s);
    }
    if (seen.size === 0) continue;
    const options = Array.from(seen.entries())
      .sort(([a], [b]) => {
        const na = Number(a);
        const nb = Number(b);
        if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
        return a.localeCompare(b);
      })
      .map(([value, label]) => ({ value, label }));
    out.push({ column: col, options });
  }
  return out;
}

function compareValues(a: SnapshotValue, b: SnapshotValue): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  const sa = String(a);
  const sb = String(b);
  const na = Number(sa);
  const nb = Number(sb);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return sa.localeCompare(sb);
}

function formatCell(v: SnapshotValue): React.ReactNode {
  if (v === null || v === undefined)
    return <span className="text-muted-foreground/40">—</span>;
  if (typeof v === "number") {
    if (Number.isInteger(v)) return v.toString();
    return v.toFixed(2);
  }
  return String(v);
}
