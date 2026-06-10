"use client";

import * as React from "react";
import { ArrowLeft, Loader2, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LibraryTile, TileModal } from "./library-tile";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

type EmaPeriod = 9 | 25;

interface Snapshot {
  asOf: string;
  barDate: string;
  close: number;
  ema9: number;
  ema25: number;
  emaPeriod: EmaPeriod;
  condition: "UP" | "DOWN";
}

export function MarketConditionDownloader() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <LibraryTile
        icon={<TrendingUp className="h-4 w-4" />}
        title="Market condition"
        description="NIFTY50 weekly trend snapshot — close vs. EMA9/EMA25 to flag UP or DOWN regime."
        buttonLabel="Check regime"
        meta="^NSEI"
        onClick={() => setOpen(true)}
      />
      {open && <MarketConditionDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function MarketConditionDialog({ onClose }: { onClose: () => void }) {
  const [date, setDate] = React.useState(today());
  const [ema, setEma] = React.useState<EmaPeriod>(9);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [snap, setSnap] = React.useState<Snapshot | null>(null);

  async function onCheck(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSnap(null);
    if (!date) {
      setErr("Pick a date.");
      return;
    }
    setBusy(true);
    try {
      const qs = new URLSearchParams({ date, ema: String(ema) }).toString();
      const res = await fetch(`/api/library/market-condition?${qs}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `Request failed (${res.status})`);
      setSnap(j as Snapshot);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <TileModal
      title="Market condition · NIFTY50"
      description="Rule: weekly close > EMA ⇒ UP, else DOWN. Source: Yahoo ^NSEI weekly candles."
      onClose={onClose}
      size="md"
    >
      {snap ? (
        <ResultPanel
          snap={snap}
          onBack={() => {
            setSnap(null);
            setErr(null);
          }}
        />
      ) : (
        <form onSubmit={onCheck} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Date">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-9 w-full rounded-lg bg-muted/60 px-3 text-[13px] text-foreground ring-1 ring-inset ring-border focus:bg-card focus:outline-none focus:ring-2 focus:ring-brand/40"
              />
            </Field>
            <Field label="EMA period">
              <div
                role="tablist"
                aria-label="EMA period"
                className="flex h-9 rounded-lg bg-muted/60 p-0.5 ring-1 ring-inset ring-border"
              >
                {([9, 25] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="tab"
                    aria-selected={ema === p}
                    onClick={() => setEma(p)}
                    className={cn(
                      "flex-1 rounded-md px-3 text-[12px] font-semibold transition",
                      ema === p
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    EMA{p}
                  </button>
                ))}
              </div>
            </Field>
          </div>

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
                  Checking…
                </>
              ) : (
                <>
                  <TrendingUp className="h-3.5 w-3.5" />
                  Check
                </>
              )}
            </Button>
          </div>
        </form>
      )}
    </TileModal>
  );
}

function ResultPanel({
  snap,
  onBack,
}: {
  snap: Snapshot;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" />
          New check
        </Button>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] ring-1 ring-inset",
            snap.condition === "UP"
              ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
              : "bg-rose-50 text-rose-700 ring-rose-200"
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              snap.condition === "UP" ? "bg-emerald-500" : "bg-rose-500"
            )}
          />
          {snap.condition}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:grid-cols-4">
        <Stat label="Weekly bar" value={snap.barDate} />
        <Stat label="Close" value={String(snap.close)} mono />
        <Stat
          label={`EMA${snap.emaPeriod}`}
          value={String(snap.emaPeriod === 9 ? snap.ema9 : snap.ema25)}
          mono
        />
        <Stat
          label="Gap to EMA"
          value={String(
            (
              snap.close - (snap.emaPeriod === 9 ? snap.ema9 : snap.ema25)
            ).toFixed(2)
          )}
          mono
          tone={snap.condition === "UP" ? "pos" : "neg"}
        />
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Rule: weekly close &gt; EMA{snap.emaPeriod} ⇒ UP, else DOWN. Source:
        Yahoo ^NSEI weekly candles.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "pos" | "neg";
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "text-[13px] font-semibold tabular-nums",
          mono && "font-mono",
          tone === "pos" && "text-emerald-600",
          tone === "neg" && "text-rose-600"
        )}
      >
        {value}
      </span>
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
