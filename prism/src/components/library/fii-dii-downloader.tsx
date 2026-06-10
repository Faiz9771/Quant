"use client";

import * as React from "react";
import { Download, Eye, Loader2, TrendingUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LibraryTile, TileModal } from "./library-tile";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

interface PreviewRow {
  date: string;
  grossPurchase: number | null;
  grossSales: number | null;
  net: number | null;
}

function sanitizeFilename(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, "_").trim();
}

export function FiiDiiDownloader() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <LibraryTile
        icon={<TrendingUp className="h-4 w-4" />}
        title="FII / DII flows"
        description="Daily institutional cash-segment activity from Moneycontrol — gross buys, sells, and net flow."
        buttonLabel="Open downloader"
        meta="₹ Crore"
        onClick={() => setOpen(true)}
      />
      {open && <FiiDiiDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function FiiDiiDialog({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = React.useState<"fii" | "dii">("fii");
  const [start, setStart] = React.useState(monthsAgo(3));
  const [end, setEnd] = React.useState(today());
  const [filename, setFilename] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [viewing, setViewing] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<PreviewRow[] | null>(null);

  function validate(): boolean {
    if (!start || !end || start > end) {
      setErr("Pick a valid date range.");
      return false;
    }
    return true;
  }

  async function onView() {
    setErr(null);
    if (!validate()) return;
    setViewing(true);
    try {
      const qs = new URLSearchParams({
        kind,
        start,
        end,
        format: "json",
      }).toString();
      const res = await fetch(`/api/library/fii-dii?${qs}`);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Request failed (${res.status})`);
      setPreview((j.rows as PreviewRow[]) ?? []);
    } catch (e) {
      setErr((e as Error).message);
      setPreview(null);
    } finally {
      setViewing(false);
    }
  }

  async function onDownload(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!validate()) return;
    setBusy(true);
    try {
      const qs = new URLSearchParams({ kind, start, end }).toString();
      const res = await fetch(`/api/library/fii-dii?${qs}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Request failed (${res.status})`);
      }
      const blob = await res.blob();
      const disp = res.headers.get("content-disposition") ?? "";
      const m = /filename="([^"]+)"/.exec(disp);
      const custom = sanitizeFilename(filename);
      const fname = custom
        ? custom.toLowerCase().endsWith(".csv")
          ? custom
          : `${custom}.csv`
        : m
          ? m[1]
          : `${kind.toUpperCase()}_activity_${start}_${end}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TileModal
        title="FII / DII activity"
        description="Source: Moneycontrol cash-segment monthly activity. Values in ₹ Crore."
        onClose={onClose}
        size="md"
      >
        <form onSubmit={onDownload} className="flex flex-col gap-4">
          <Field label="Dataset">
            <div className="flex h-9 divide-x divide-border overflow-hidden rounded-lg ring-1 ring-inset ring-border">
              {(["fii", "dii"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setKind(v)}
                  className={cn(
                    "h-full flex-1 px-3 text-[12px] font-medium uppercase tracking-wide transition-colors",
                    kind === v
                      ? "bg-brand-soft text-foreground"
                      : "bg-card text-muted-foreground hover:bg-muted/60"
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Start">
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="h-9 w-full rounded-lg bg-muted/60 px-3 text-[13px] text-foreground ring-1 ring-inset ring-border focus:bg-card focus:outline-none focus:ring-2 focus:ring-brand/40"
              />
            </Field>
            <Field label="End">
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="h-9 w-full rounded-lg bg-muted/60 px-3 text-[13px] text-foreground ring-1 ring-inset ring-border focus:bg-card focus:outline-none focus:ring-2 focus:ring-brand/40"
              />
            </Field>
          </div>

          <Field label="Filename" hint="Optional — defaults to dataset_range.csv">
            <input
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder={`${kind.toUpperCase()}_activity_${start}_${end}.csv`}
              className="h-9 w-full rounded-lg bg-muted/60 px-3 text-[13px] text-foreground ring-1 ring-inset ring-border focus:bg-card focus:outline-none focus:ring-2 focus:ring-brand/40"
            />
          </Field>

          {err && (
            <div className="rounded-lg border border-destructive/30 bg-destructive-soft px-3 py-2 text-[12px] text-destructive">
              {err}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || viewing}
              onClick={onView}
            >
              {viewing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading…
                </>
              ) : (
                <>
                  <Eye className="h-3.5 w-3.5" />
                  Preview
                </>
              )}
            </Button>
            <Button
              type="submit"
              variant="brand"
              size="sm"
              disabled={busy || viewing}
            >
              {busy ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Fetching…
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" />
                  Download CSV
                </>
              )}
            </Button>
          </div>
        </form>
      </TileModal>

      {preview && (
        <PreviewModal
          title={`${kind.toUpperCase()} · ${start} → ${end}`}
          rows={preview}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}

interface PreviewModalProps {
  title: string;
  rows: PreviewRow[];
  onClose: () => void;
}

function PreviewModal({ title, rows, onClose }: PreviewModalProps) {
  const fmt = (n: number | null) =>
    n === null ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-foreground/30 p-6 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="my-8 flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-card shadow-pop ring-1 ring-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-3.5">
          <div>
            <h2 className="text-[14px] font-semibold text-foreground">
              {title}
            </h2>
            <p className="text-[11px] text-muted-foreground">
              {rows.length} rows · ₹ Crore
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
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full border-separate border-spacing-0 text-[12.5px] tnum">
            <thead>
              <tr>
                {["Date", "Gross Purchase", "Gross Sales", "Net"].map((h) => (
                  <th
                    key={h}
                    className="sticky top-0 z-10 border-b border-border/60 bg-card px-4 py-2 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-[12.5px] text-muted-foreground"
                  >
                    No rows in this range.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.date} className="hover:bg-accent/40">
                  <td className="border-b border-border-soft px-4 py-1.5 text-foreground/90">
                    {r.date}
                  </td>
                  <td className="border-b border-border-soft px-4 py-1.5 text-right font-mono tabular-nums">
                    {fmt(r.grossPurchase)}
                  </td>
                  <td className="border-b border-border-soft px-4 py-1.5 text-right font-mono tabular-nums">
                    {fmt(r.grossSales)}
                  </td>
                  <td
                    className={cn(
                      "border-b border-border-soft px-4 py-1.5 text-right font-mono tabular-nums",
                      r.net === null
                        ? "text-muted-foreground"
                        : r.net >= 0
                          ? "text-emerald-600"
                          : "text-rose-600"
                    )}
                  >
                    {r.net === null
                      ? "—"
                      : `${r.net > 0 ? "+" : ""}${fmt(r.net)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </label>
      {children}
      {hint && (
        <span className="text-[10.5px] text-muted-foreground/80">{hint}</span>
      )}
    </div>
  );
}
