"use client";

import * as React from "react";
import { ArrowRight, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { humanizeColumnName, cn } from "@/lib/utils";
import type {
  DiffRow,
  SnapshotDataset,
  SnapshotFile,
  SnapshotRow,
  SnapshotValue,
} from "@/lib/data/types";

interface CompareResponse {
  left: SnapshotDataset;
  right: SnapshotDataset;
  changes: DiffRow[];
}

interface CompareViewProps {
  snapshots: SnapshotFile[];
}

const FIELD_OPTIONS = [
  "Master_Rating",
  "EPS_Strength_Rating",
  "EPS_Strength_Score",
  "Price_Strength_Rating",
  "Price_Strength_Score",
  "Buyer_Demand_Rating",
  "Buyer_Demand_Score",
  "Group_Rank_Rating",
  "Group_Rank_Score",
  "William_J_ONeil",
  "Benjamin_Graham",
  "James_P_OShaughnessy",
  "Warren_Buffett",
  "Peter_Lynch",
];

export function CompareView({ snapshots }: CompareViewProps) {
  const newest = snapshots[0]?.name ?? "";
  const second = snapshots[1]?.name ?? newest;

  const [leftName, setLeftName] = React.useState<string>(second);
  const [rightName, setRightName] = React.useState<string>(newest);
  const [data, setData] = React.useState<CompareResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [fieldFilter, setFieldFilter] = React.useState<string>("Master_Rating");
  const [changeFilter, setChangeFilter] = React.useState<string>("All");

  React.useEffect(() => {
    if (!leftName || !rightName) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const url = `/api/compare?left=${encodeURIComponent(
          leftName
        )}&right=${encodeURIComponent(rightName)}`;
        const res = await fetch(url, { cache: "no-store" });
        const json = (await res.json()) as CompareResponse;
        if (cancelled) return;
        setData(json);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [leftName, rightName]);

  const allFieldOptions = React.useMemo(() => {
    const fromData = new Set<string>();
    if (data?.changes) {
      for (const c of data.changes) fromData.add(c.Field);
    }
    const merged = new Set<string>([...FIELD_OPTIONS, ...fromData]);
    merged.delete("__row__");
    return Array.from(merged).sort();
  }, [data]);

  const filteredChanges = React.useMemo(() => {
    if (!data) return [];
    return data.changes.filter((c) => {
      if (fieldFilter !== "All" && c.Field !== fieldFilter) return false;
      if (changeFilter !== "All" && c.Change !== changeFilter) return false;
      return true;
    });
  }, [data, fieldFilter, changeFilter]);

  const summary = React.useMemo(() => {
    if (!data) return { added: 0, removed: 0, changed: 0 };
    const visible = filteredChanges;
    const added = visible.filter((c) => c.Change === "Added").length;
    const removed = visible.filter((c) => c.Change === "Removed").length;
    const changed = visible.filter((c) => c.Change === "Changed").length;
    return { added, removed, changed };
  }, [filteredChanges, data]);

  return (
    <div className="mx-auto max-w-[1440px] px-4 sm:px-6 py-8 animate-fade-in-up">
      <PageHeader
        eyebrow="Diff"
        title="Compare snapshots"
        description="Pick any two snapshots to inspect added tickers, removed tickers, and rating changes side-by-side."
        actions={
          loading && (
            <Badge tone="info" dot pulse>
              Loading…
            </Badge>
          )
        }
      />

      <div className="flex flex-col gap-6">
        {/* Snapshot picker */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 items-end gap-5 md:grid-cols-[1fr_auto_1fr]">
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Old snapshot
                </label>
                <Select
                  value={leftName}
                  onChange={(e) => setLeftName(e.target.value)}
                >
                  {snapshots.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="hidden self-end pb-1.5 md:block">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft">
                  <ArrowRight className="h-4 w-4 text-brand" />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  New snapshot
                </label>
                <Select
                  value={rightName}
                  onChange={(e) => setRightName(e.target.value)}
                >
                  {snapshots.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Side-by-side previews */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <PreviewTable label="Old" dataset={data?.left} />
          <PreviewTable label="New" dataset={data?.right} />
        </div>

        {/* Diff table */}
        <Card flat className="overflow-hidden">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>Changes</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="warning">Changed · {summary.changed}</Badge>
                <Badge tone="success">Added · {summary.added}</Badge>
                <Badge tone="danger">Removed · {summary.removed}</Badge>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-end gap-4">
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Field
                </label>
                <Select
                  value={fieldFilter}
                  onChange={(e) => setFieldFilter(e.target.value)}
                  className="w-56"
                >
                  <option value="All">All fields</option>
                  {allFieldOptions.map((f) => (
                    <option key={f} value={f}>
                      {humanizeColumnName(f)}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Change type
                </label>
                <Select
                  value={changeFilter}
                  onChange={(e) => setChangeFilter(e.target.value)}
                  className="w-40"
                >
                  <option value="All">All</option>
                  <option value="Changed">Changed</option>
                  <option value="Added">Added</option>
                  <option value="Removed">Removed</option>
                </Select>
              </div>
            </div>
          </CardHeader>

          <CardContent className="px-0 pt-0 pb-0">
            <div className="max-h-[55vh] overflow-auto border-t border-border/50">
              <table className="w-full border-separate border-spacing-0 text-[13px] tnum">
                <thead className="sticky top-0 z-10 glass">
                  <tr>
                    {["Symbol", "Change", "Field", "Old", "New"].map((h) => (
                      <th
                        key={h}
                        className="border-b border-border/60 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredChanges.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-16 text-center text-[13px] text-muted-foreground"
                      >
                        {data
                          ? "No changes match the current filters."
                          : "Select two snapshots to compare."}
                      </td>
                    </tr>
                  )}
                  {filteredChanges.map((c, i) => (
                    <tr
                      key={`${c.Symbol}-${c.Field}-${i}`}
                      className={cn(
                        "transition-colors duration-100 hover:bg-accent/40",
                        c.Change === "Changed" && "bg-warning-soft/30",
                        c.Change === "Added" && "bg-success-soft/30",
                        c.Change === "Removed" && "bg-destructive-soft/30"
                      )}
                    >
                      <td className="border-b border-border-soft px-4 py-3 font-semibold text-foreground">
                        {c.Symbol}
                      </td>
                      <td className="border-b border-border-soft px-4 py-3">
                        <Badge
                          tone={
                            c.Change === "Changed"
                              ? "warning"
                              : c.Change === "Added"
                                ? "success"
                                : "danger"
                          }
                        >
                          {c.Change}
                        </Badge>
                      </td>
                      <td className="border-b border-border-soft px-4 py-3 text-foreground/80">
                        {c.Field === "__row__"
                          ? "(row)"
                          : humanizeColumnName(c.Field)}
                      </td>
                      <td className="border-b border-border-soft px-4 py-3 font-mono text-[12px] text-muted-foreground">
                        {c.Old || "—"}
                      </td>
                      <td className="border-b border-border-soft px-4 py-3 font-mono text-[12px] font-semibold text-foreground">
                        {c.New || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PreviewTable({
  label,
  dataset,
}: {
  label: string;
  dataset: SnapshotDataset | undefined;
}) {
  if (!dataset) {
    return (
      <Card className="flex min-h-[200px] items-center justify-center ring-dashed">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
            <RefreshCw className="h-4 w-4 text-muted-foreground/50" />
          </div>
          <p className="text-[12.5px] text-muted-foreground">
            {label}: select a snapshot
          </p>
        </div>
      </Card>
    );
  }
  const cols = dataset.columns.slice(0, 6);
  const rows = dataset.rows.slice(0, 8);
  return (
    <Card flat className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/50 bg-muted/40 px-5 py-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          {label}
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {dataset.name} · {dataset.rows.length} rows
        </span>
      </div>
      <div className="max-h-60 overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-[12px] tnum">
          <thead className="sticky top-0 z-10 glass">
            <tr>
              {cols.map((c) => (
                <th
                  key={c}
                  className="border-b border-border/60 px-3.5 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
                >
                  {humanizeColumnName(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={i}
                className="transition-colors duration-100 hover:bg-accent/40"
              >
                {cols.map((c) => (
                  <td
                    key={c}
                    className="border-b border-border-soft px-3.5 py-2.5 text-foreground/85"
                  >
                    {fmt(r[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function fmt(v: SnapshotValue | undefined): React.ReactNode {
  if (v === null || v === undefined)
    return <span className="text-muted-foreground/40">—</span>;
  if (typeof v === "number")
    return Number.isInteger(v) ? v.toString() : v.toFixed(2);
  return String(v);
}

// Reference unused import to keep the type imported.
void (null as unknown as SnapshotRow);
