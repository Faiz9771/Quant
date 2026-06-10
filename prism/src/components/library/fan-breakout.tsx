"use client";

import * as React from "react";
import {
  CheckCircle2,
  Download,
  Info,
  Loader2,
  Play,
  Radar,
  RefreshCw,
  Square,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LibraryTile, TileModal } from "./library-tile";
import type {
  BreakoutEvent,
  BreakoutJobState,
} from "@/lib/breakout-runner";

const FILTERS: { name: string; detail: string }[] = [
  {
    name: "Long flat base on EMA200",
    detail:
      "Change of the 200-EMA over the last 20 bars is within [-0.5%, +100%] — the long-term trend is no longer falling.",
  },
  {
    name: "EMA50 turning up",
    detail:
      "Last 5 day-over-day diffs of the 50-EMA are all positive — the medium-term trend is curling upward.",
  },
  {
    name: "EMA20 sharp slope",
    detail:
      "Linear-fit slope of the last 5 EMA20 values yields an angle of ≥ 20° — short-term trend is accelerating.",
  },
  {
    name: "Active 8% price surge",
    detail:
      "3-bar rate of change ≥ 8% — there's a visible momentum thrust, not just a quiet drift.",
  },
  {
    name: "Full EMA fan alignment",
    detail:
      "Close > EMA5 > EMA20 > EMA50 > EMA200 — every average is stacked in trend order with price leading.",
  },
];

interface ResultRow {
  ticker: string;
  signalDate: string;
  closePrice: number | null;
  marketCap: number | null;
  classification: string;
}

interface ResultsResponse {
  rows: ResultRow[];
  updatedAt: string | null;
  message?: string;
}

interface StatusResponse {
  state: BreakoutJobState;
  events: BreakoutEvent[];
}

export function FanBreakout() {
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [runOpen, setRunOpen] = React.useState(false);
  return (
    <>
      <LibraryTile
        icon={<Radar className="h-4 w-4" />}
        title="Fan Breakout"
        description="Scans NSE EQ universe for stocks with full EMA fan alignment and an active 8% momentum surge."
        buttonLabel="Run scan"
        meta="5 filters"
        onClick={() => setRunOpen(true)}
        secondary={{
          label: "View filters",
          icon: <Info className="h-3 w-3" />,
          onClick: () => setFiltersOpen(true),
        }}
      />
      {filtersOpen && <FiltersModal onClose={() => setFiltersOpen(false)} />}
      {runOpen && <RunDialog onClose={() => setRunOpen(false)} />}
    </>
  );
}

function FiltersModal({ onClose }: { onClose: () => void }) {
  return (
    <TileModal
      title="Fan Breakout · filter stack"
      description="A stock has to satisfy all five conditions on the latest daily bar to be flagged."
      onClose={onClose}
      size="lg"
    >
      <ol className="flex flex-col gap-3">
        {FILTERS.map((f, i) => (
          <li
            key={f.name}
            className="flex gap-3 rounded-xl border border-border/60 bg-muted/30 px-3.5 py-3"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-soft/60 text-[11px] font-semibold text-brand ring-1 ring-inset ring-brand/20">
              {i + 1}
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px] font-semibold text-foreground">
                {f.name}
              </span>
              <span className="text-[12px] leading-relaxed text-muted-foreground">
                {f.detail}
              </span>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
        Universe: NSE EQ tickers from the live NSE master list. Bars: daily,
        2024-01-01 → today (Yahoo Finance). Market cap classification follows
        SEBI INR thresholds (Large &gt; ₹20,000 Cr, Mid ₹5,000-20,000 Cr,
        Small &lt; ₹5,000 Cr).
      </p>
    </TileModal>
  );
}

function RunDialog({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = React.useState<StatusResponse | null>(null);
  const [results, setResults] = React.useState<ResultsResponse | null>(null);
  const [submitting, setSubmitting] = React.useState<null | "refresh" | "cached">(
    null
  );
  const [stopping, setStopping] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isRunning = status?.state.running ?? false;
  const justFinished =
    status !== null &&
    !status.state.running &&
    status.state.endedAt !== null &&
    status.state.startedAt !== null;

  // Poll status while dialog is open; also reload results on every transition.
  React.useEffect(() => {
    let cancelled = false;
    async function fetchStatus() {
      try {
        const res = await fetch("/api/library/breakout/status", {
          cache: "no-store",
        });
        const j = (await res.json()) as StatusResponse;
        if (!cancelled) setStatus(j);
      } catch {
        /* ignore transient errors */
      }
    }
    async function fetchResults() {
      try {
        const res = await fetch("/api/library/breakout/results", {
          cache: "no-store",
        });
        const j = (await res.json()) as ResultsResponse;
        if (!cancelled) setResults(j);
      } catch {
        /* ignore */
      }
    }

    fetchStatus();
    fetchResults();
    const id = setInterval(() => {
      fetchStatus();
    }, 2_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // When the job transitions from running → idle, refresh results once more.
  const wasRunning = React.useRef(false);
  React.useEffect(() => {
    if (wasRunning.current && !isRunning) {
      fetch("/api/library/breakout/results", { cache: "no-store" })
        .then((r) => r.json())
        .then((j: ResultsResponse) => setResults(j))
        .catch(() => {});
    }
    wasRunning.current = isRunning;
  }, [isRunning]);

  async function handleRun(refreshUniverse: boolean) {
    setError(null);
    setSubmitting(refreshUniverse ? "refresh" : "cached");
    try {
      const res = await fetch("/api/library/breakout/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshUniverse }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Failed to start (${res.status})`);
      }
      const state = (await res.json()) as BreakoutJobState;
      setStatus((prev) => ({
        state,
        events: prev?.events ?? [],
      }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(null);
    }
  }

  async function handleStop() {
    setStopping(true);
    try {
      await fetch("/api/library/breakout/stop", { method: "POST" });
    } finally {
      setStopping(false);
    }
  }

  return (
    <TileModal
      title="Fan Breakout · scan"
      description="Live scan of NSE EQ universe. Logs are streamed as structured events."
      onClose={onClose}
      size="xl"
    >
      <div className="flex flex-col gap-4">
        {isRunning ? (
          <RunningPanel stopping={stopping} onStop={handleStop} />
        ) : (
          <PrescanQuestion
            submitting={submitting}
            onChoose={handleRun}
          />
        )}

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive-soft px-3 py-2 text-[12px] text-destructive">
            {error}
          </div>
        )}

        {status && (
          <StatusPanel
            state={status.state}
            justFinished={justFinished}
          />
        )}

        {status && status.events.length > 0 && (
          <EventFeed events={status.events} />
        )}

        <ResultsTable results={results} />
      </div>
    </TileModal>
  );
}

function PrescanQuestion({
  submitting,
  onChoose,
}: {
  submitting: null | "refresh" | "cached";
  onChoose: (refreshUniverse: boolean) => void;
}) {
  const isBusy = submitting !== null;
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border/60 bg-muted/30 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft/60 text-brand ring-1 ring-inset ring-brand/20">
          <Info className="h-4 w-4" />
        </span>
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-semibold text-foreground">
            Fetch the latest 2200+ NSE tickers from source before scanning?
          </span>
          <span className="text-[11.5px] leading-relaxed text-muted-foreground">
            The cached universe is fine for daily scans. Refresh only if NSE
            listings have changed or this is the first run on this machine.
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <ChoiceCard
          tone="outline"
          icon={
            submitting === "cached" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )
          }
          title={submitting === "cached" ? "Launching…" : "No, use cached"}
          subtitle="Start scan immediately with the local ticker list"
          onClick={() => onChoose(false)}
          disabled={isBusy}
        />
        <ChoiceCard
          tone="brand"
          icon={
            submitting === "refresh" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )
          }
          title={
            submitting === "refresh" ? "Launching…" : "Yes, refresh tickers"
          }
          subtitle="Fetch fresh NSE list, then start the scan"
          onClick={() => onChoose(true)}
          disabled={isBusy}
        />
      </div>
    </div>
  );
}

function ChoiceCard({
  tone,
  icon,
  title,
  subtitle,
  onClick,
  disabled,
}: {
  tone: "outline" | "brand";
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "press group flex w-full items-start gap-3 rounded-xl px-3.5 py-3 text-left transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:pointer-events-none disabled:opacity-60",
        tone === "outline" &&
          "bg-card text-foreground ring-1 ring-inset ring-border/80 shadow-e1 hover:bg-accent/50 hover:ring-border",
        tone === "brand" &&
          "bg-[#b3b788] text-[#2a2a1f] ring-1 ring-inset ring-black/[0.08] shadow-e1 edge-highlight hover:bg-[#a1a57a] hover:shadow-e2"
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
          tone === "outline" &&
            "bg-muted/70 text-foreground ring-1 ring-inset ring-border/60",
          tone === "brand" && "bg-[#2a2a1f]/10 text-[#2a2a1f]"
        )}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[13px] font-semibold leading-tight">{title}</span>
        <span
          className={cn(
            "text-[11px] leading-snug",
            tone === "outline" && "text-muted-foreground",
            tone === "brand" && "text-[#2a2a1f]/70"
          )}
        >
          {subtitle}
        </span>
      </span>
    </button>
  );
}

function RunningPanel({
  stopping,
  onStop,
}: {
  stopping: boolean;
  onStop: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-amber-200/60 bg-amber-50/40 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="mt-1 flex h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-500" />
        <div className="flex flex-col">
          <span className="text-[12.5px] font-semibold text-foreground">
            Scan in progress
          </span>
          <span className="text-[10.5px] leading-relaxed text-muted-foreground">
            Live events stream below. You can close this dialog and come back —
            the scan keeps running.
          </span>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onStop}
        disabled={stopping}
        className="shrink-0 whitespace-nowrap text-rose-600 ring-rose-200 hover:bg-rose-50 hover:text-rose-700"
      >
        {stopping ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Stopping…
          </>
        ) : (
          <>
            <Square className="h-3.5 w-3.5" />
            Stop scan
          </>
        )}
      </Button>
    </div>
  );
}

function StatusPanel({
  state,
  justFinished,
}: {
  state: BreakoutJobState;
  justFinished: boolean;
}) {
  const elapsedMs =
    state.startedAt === null
      ? 0
      : (state.endedAt ?? Date.now()) - state.startedAt;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatusStat
        label="Status"
        value={
          state.running
            ? "Scanning"
            : justFinished
              ? state.exitCode === 0
                ? "Done"
                : `Exited (${state.exitCode ?? "?"})`
              : "Idle"
        }
        tone={
          state.running ? "active" : justFinished && state.exitCode === 0 ? "ok" : "neutral"
        }
        pulse={state.running}
      />
      <StatusStat
        label="Matches"
        value={String(state.matches)}
        tone={state.matches > 0 ? "ok" : "neutral"}
      />
      <StatusStat
        label="Universe"
        value={
          state.totalTickers !== null
            ? `${state.totalTickers.toLocaleString()} tickers`
            : "—"
        }
      />
      <StatusStat
        label="Elapsed"
        value={state.startedAt ? formatDuration(elapsedMs) : "—"}
      />
    </div>
  );
}

function StatusStat({
  label,
  value,
  tone = "neutral",
  pulse,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "active" | "ok";
  pulse?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border/60 bg-card px-3 py-2.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-[13px] font-semibold tabular-nums",
          tone === "active" && "text-amber-600",
          tone === "ok" && "text-emerald-600"
        )}
      >
        {tone === "active" && pulse && (
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
        )}
        {tone === "ok" && <CheckCircle2 className="h-3.5 w-3.5" />}
        {value}
      </span>
    </div>
  );
}

function EventFeed({ events }: { events: BreakoutEvent[] }) {
  const recent = events.slice(-80);
  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Live feed
        </span>
        <span className="font-mono text-[10.5px] text-muted-foreground">
          {events.length} events
        </span>
      </div>
      <div className="max-h-[280px] overflow-y-auto p-2">
        <ul className="flex flex-col gap-1">
          {recent.map((ev, i) => (
            <EventRow key={i} ev={ev} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function EventRow({ ev }: { ev: BreakoutEvent }) {
  const time = formatTime(ev.ts);
  if (ev.kind === "match") {
    return (
      <li className="flex items-center gap-2.5 rounded-md bg-emerald-50/40 px-2.5 py-1.5 ring-1 ring-emerald-100">
        <TrendingUp className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
        <span className="font-mono text-[10.5px] text-muted-foreground">
          {time}
        </span>
        <span className="font-mono text-[12px] font-semibold text-foreground">
          {ev.ticker}
        </span>
        <span className="inline-flex items-center rounded-full bg-card px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-inset ring-border/60">
          {ev.classification}
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {formatMarketCap(ev.marketCap)}
        </span>
        <span className="ml-auto font-mono text-[10.5px] text-muted-foreground">
          signal {ev.signalDate}
        </span>
      </li>
    );
  }
  if (ev.kind === "started") {
    return (
      <li className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[11.5px] text-foreground">
        <span className="font-mono text-[10.5px] text-muted-foreground">
          {time}
        </span>
        <span>
          Scanning{" "}
          <span className="font-semibold">
            {ev.totalTickers?.toLocaleString() ?? "?"}
          </span>{" "}
          tickers ({ev.startDate} → {ev.endDate})
        </span>
      </li>
    );
  }
  if (ev.kind === "completed") {
    return (
      <li className="flex items-center gap-2 rounded-md bg-brand-soft/30 px-2.5 py-1.5 text-[11.5px] text-foreground">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
        <span className="font-mono text-[10.5px] text-muted-foreground">
          {time}
        </span>
        <span>
          Scan complete · {ev.matches} breakout
          {ev.matches === 1 ? "" : "s"} found
          {ev.outputPath ? ` · written to ${ev.outputPath}` : ""}
        </span>
      </li>
    );
  }
  if (ev.kind === "system") {
    return (
      <li className="flex items-center gap-2 px-2.5 py-1 text-[11px] text-muted-foreground">
        <span className="font-mono text-[10.5px]">{time}</span>
        <span>{ev.message}</span>
      </li>
    );
  }
  if (ev.kind === "error") {
    return (
      <li className="flex items-start gap-2 rounded-md bg-rose-50/40 px-2.5 py-1.5 ring-1 ring-rose-100">
        <span className="font-mono text-[10.5px] text-muted-foreground">
          {time}
        </span>
        <span className="break-words text-[11.5px] text-rose-700">
          {ev.message}
        </span>
      </li>
    );
  }
  return (
    <li className="flex items-start gap-2 px-2.5 py-1 text-[11.5px] text-muted-foreground">
      <span className="font-mono text-[10.5px]">{time}</span>
      <span className="break-words">{ev.message}</span>
    </li>
  );
}

function ResultsTable({ results }: { results: ResultsResponse | null }) {
  const [reloading, setReloading] = React.useState(false);
  const [localResults, setLocalResults] = React.useState<ResultsResponse | null>(
    null
  );
  const effective = localResults ?? results;

  async function reload() {
    setReloading(true);
    try {
      const res = await fetch("/api/library/breakout/results", {
        cache: "no-store",
      });
      const j = (await res.json()) as ResultsResponse;
      setLocalResults(j);
    } finally {
      setReloading(false);
    }
  }

  if (!effective) {
    return (
      <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-4 text-[12px] text-muted-foreground">
        Loading results…
      </div>
    );
  }

  const rows = effective.rows;
  const hasResults = rows.length > 0;

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
        <div className="flex flex-col">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Latest results
          </span>
          <span className="text-[11px] text-muted-foreground">
            {effective.updatedAt
              ? `Saved ${formatDate(effective.updatedAt)} · ${rows.length} match${rows.length === 1 ? "" : "es"}`
              : "No saved results yet."}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={reload}
            disabled={reloading}
            title="Reload results from disk"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", reloading && "animate-spin")}
            />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!hasResults}
            onClick={() => {
              window.open(
                "/api/library/breakout/results?download=1",
                "_blank"
              );
            }}
          >
            <Download className="h-3.5 w-3.5" />
            Download CSV
          </Button>
        </div>
      </div>
      <div className="max-h-[320px] overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-[12.5px] tnum">
          <thead>
            <tr>
              {["Ticker", "Signal date", "Close", "Market cap", "Class"].map(
                (h) => (
                  <th
                    key={h}
                    className={cn(
                      "sticky top-0 z-10 border-b border-border/60 bg-card px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground",
                      (h === "Close" || h === "Market cap") && "text-right"
                    )}
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {!hasResults && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-[12px] text-muted-foreground"
                >
                  No matches yet — run a scan to populate this table.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={`${r.ticker}-${r.signalDate}`}
                className="hover:bg-muted/30"
              >
                <td className="border-b border-border-soft px-3 py-1.5 font-mono text-[12px] font-semibold text-foreground">
                  {r.ticker}
                </td>
                <td className="border-b border-border-soft px-3 py-1.5 font-mono text-[11.5px] text-muted-foreground">
                  {r.signalDate}
                </td>
                <td className="border-b border-border-soft px-3 py-1.5 text-right font-mono tabular-nums">
                  {r.closePrice === null
                    ? "—"
                    : r.closePrice.toLocaleString("en-IN", {
                        maximumFractionDigits: 2,
                      })}
                </td>
                <td className="border-b border-border-soft px-3 py-1.5 text-right font-mono tabular-nums">
                  {formatMarketCap(r.marketCap)}
                </td>
                <td className="border-b border-border-soft px-3 py-1.5">
                  <ClassChip value={r.classification} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ClassChip({ value }: { value: string }) {
  const k = value.toLowerCase();
  const tone =
    k === "largecap"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : k === "midcap"
        ? "bg-amber-50 text-amber-700 ring-amber-200"
        : k === "smallcap"
          ? "bg-sky-50 text-sky-700 ring-sky-200"
          : "bg-muted text-muted-foreground ring-border/60";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10.5px] font-medium ring-1 ring-inset",
        tone
      )}
    >
      {value || "—"}
    </span>
  );
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatMarketCap(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  if (v >= 1e12) return `₹${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e10) return `₹${(v / 1e7).toLocaleString("en-IN", { maximumFractionDigits: 0 })} Cr`;
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}
