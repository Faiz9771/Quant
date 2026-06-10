"use client";

import * as React from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LibraryTile, TileModal } from "./library-tile";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function yearsAgo(n: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return d.toISOString().slice(0, 10);
}

function sanitizeFilename(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, "_").trim();
}

export function OhlcvDownloader() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <LibraryTile
        icon={<Download className="h-4 w-4" />}
        title="OHLCV download"
        description="Daily or weekly OHLCV CSVs sourced from Yahoo Finance for any NSE, BSE, or US ticker."
        buttonLabel="Open downloader"
        meta="CSV"
        onClick={() => setOpen(true)}
      />
      {open && <OhlcvDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function OhlcvDialog({ onClose }: { onClose: () => void }) {
  const [ticker, setTicker] = React.useState("");
  const [interval, setInterval] = React.useState<"1d" | "1wk">("1d");
  const [start, setStart] = React.useState(yearsAgo(1));
  const [end, setEnd] = React.useState(today());
  const [filename, setFilename] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function onDownload(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const t = ticker.trim();
    if (!t) {
      setErr("Enter a ticker.");
      return;
    }
    if (!start || !end || start > end) {
      setErr("Pick a valid date range.");
      return;
    }
    setBusy(true);
    try {
      const qs = new URLSearchParams({
        ticker: t,
        interval,
        start,
        end,
      }).toString();
      const res = await fetch(`/api/library/ohlcv?${qs}`);
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
          : `${t}_${interval}_${start}_${end}.csv`;
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
    <TileModal
      title="OHLCV download"
      description="Daily or weekly bars. Non-suffixed tickers default to NSE (e.g. RELIANCE → RELIANCE.NS)."
      onClose={onClose}
      size="md"
    >
      <form onSubmit={onDownload} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
          <Field label="Ticker">
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="RELIANCE"
              autoFocus
              className="h-9 w-full rounded-lg bg-muted/60 px-3 text-[13px] font-mono uppercase tracking-wide text-foreground ring-1 ring-inset ring-border focus:bg-card focus:outline-none focus:ring-2 focus:ring-brand/40"
            />
          </Field>
          <Field label="Interval">
            <div className="flex h-9 divide-x divide-border overflow-hidden rounded-lg ring-1 ring-inset ring-border">
              {(["1d", "1wk"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setInterval(v)}
                  className={cn(
                    "h-full px-4 text-[12px] font-medium transition-colors",
                    interval === v
                      ? "bg-brand-soft text-foreground"
                      : "bg-card text-muted-foreground hover:bg-muted/60"
                  )}
                >
                  {v === "1d" ? "Daily" : "Weekly"}
                </button>
              ))}
            </div>
          </Field>
        </div>

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

        <Field
          label="Filename"
          hint="Defaults to TICKER_INTERVAL_START_END.csv"
        >
          <input
            type="text"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            placeholder={
              ticker
                ? `${ticker.trim().toUpperCase()}_${interval}_${start}_${end}.csv`
                : "my-file.csv"
            }
            className="h-9 w-full rounded-lg bg-muted/60 px-3 text-[13px] text-foreground ring-1 ring-inset ring-border focus:bg-card focus:outline-none focus:ring-2 focus:ring-brand/40"
          />
        </Field>

        {err && (
          <div className="rounded-lg border border-destructive/30 bg-destructive-soft px-3 py-2 text-[12px] text-destructive">
            {err}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="brand" size="sm" disabled={busy}>
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
