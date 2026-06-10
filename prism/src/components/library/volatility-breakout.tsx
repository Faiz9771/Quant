"use client";

import * as React from "react";
import {
  ArrowUpDown,
  CheckCircle2,
  Download,
  Info,
  Loader2,
  RefreshCw,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { LibraryTile, TileModal } from "./library-tile";
import type {
  VolatilityBreakoutEvent,
  VolatilityBreakoutJobState,
  VolatilityBreakoutResultRow,
} from "@/lib/volatility-breakout-runner";
import type { NiftyUniverseId } from "@/lib/data/nifty-universes";

const UNIVERSE_OPTIONS: Array<{
  value: NiftyUniverseId;
  label: string;
}> = [
  { value: "nifty50", label: "Nifty 50 (Largecap)" },
  { value: "niftyMidcap50", label: "Nifty Midcap 50" },
];

interface UniverseResponse {
  universe: NiftyUniverseId;
  label: string;
  source: string;
  fetchedAt: string | null;
  count: number;
  hasCache: boolean;
  error?: string;
}

interface StatusResponse {
  state: VolatilityBreakoutJobState;
  events: VolatilityBreakoutEvent[];
}

interface ResultsResponse {
  rows: VolatilityBreakoutResultRow[];
  updatedAt: string | null;
}

export function VolatilityBreakout() {
  const [infoOpen, setInfoOpen] = React.useState(false);
  const [runOpen, setRunOpen] = React.useState(false);

  return (
    <>
      <LibraryTile
        icon={<ArrowUpDown className="h-4 w-4" />}
        title="Volatility Breakout"
        description="Larry Williams breakout scanner using 40% of yesterday's True Range from today's open, with standard gap-adjusted TR."
        buttonLabel="Open scanner"
        meta="Nifty 50 + Midcap 50"
        onClick={() => setRunOpen(true)}
        secondary={{
          label: "View rules",
          icon: <Info className="h-3 w-3" />,
          onClick: () => setInfoOpen(true),
        }}
      />
      {infoOpen && <RulesModal onClose={() => setInfoOpen(false)} />}
      {runOpen && <RunDialog onClose={() => setRunOpen(false)} />}
    </>
  );
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <TileModal
      title="Volatility Breakout · Larry Williams"
      description="Daily breakout levels are derived from yesterday's True Range and projected from today's open."
      onClose={onClose}
      size="lg"
    >
      <div className="flex flex-col gap-4 text-[12.5px] leading-relaxed text-muted-foreground">
        <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
          <p className="font-semibold text-foreground">Rule set</p>
          <p className="mt-1">
            1. Compute yesterday&apos;s True Range:
            <span className="font-mono text-foreground">
              {" "}
              max(high - low, |high - prevClose|, |low - prevClose|)
            </span>
          </p>
          <p>2. Take 40% of that True Range.</p>
          <p>3. Add/subtract it from today&apos;s open.</p>
          <p>4. Trade the first intraday breakout of those two levels.</p>
        </div>
        <div className="rounded-xl border border-amber-200/60 bg-amber-50/40 p-4 text-[12px]">
          Gap days are not required. The gap adjustment is already built into
          True Range, so no-gap sessions naturally collapse to the normal daily
          range, while gap sessions widen the trigger levels.
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <p className="font-semibold text-foreground">Implementation notes</p>
          <p className="mt-1">
            Universe is selectable between <strong>Nifty 50 (Largecap)</strong>{" "}
            and <strong>Nifty Midcap 50</strong>. The list refresh button pulls
            the latest constituent CSV from the official Nifty Indices source on
            demand. Intraday breakout order is evaluated using 5-minute Yahoo
            Finance bars; if both sides are hit in the same bar, the symbol is
            skipped because the &quot;first breakout&quot; cannot be known from
            OHLC alone.
          </p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <p className="font-semibold text-foreground">Common exit styles</p>
          <p className="mt-1">
            Traders usually pair this entry with one of four simple exits:
            next day&apos;s close for very short-term testing, a fixed
            risk-reward target like 2R or 3R, an ATR multiple such as 1 ATR or
            2 ATR from entry, or a trailing stop under the previous day&apos;s
            low for longs and above the previous day&apos;s high for shorts.
          </p>
        </div>
      </div>
    </TileModal>
  );
}

function RunDialog({ onClose }: { onClose: () => void }) {
  const [universe, setUniverse] = React.useState<NiftyUniverseId>("nifty50");
  const [universeInfo, setUniverseInfo] = React.useState<UniverseResponse | null>(
    null
  );
  const [status, setStatus] = React.useState<StatusResponse | null>(null);
  const [results, setResults] = React.useState<ResultsResponse | null>(null);
  const [loadingUniverse, setLoadingUniverse] = React.useState(false);
  const [refreshingUniverse, setRefreshingUniverse] = React.useState(false);
  const [submitting, setSubmitting] = React.useState<null | "cached" | "refresh">(
    null
  );
  const [stopping, setStopping] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isRunning = status?.state.running ?? false;
  const justFinished =
    status !== null &&
    !status.state.running &&
    status.state.startedAt !== null &&
    status.state.endedAt !== null;

  const loadUniverse = React.useCallback(async (selected: NiftyUniverseId) => {
    setLoadingUniverse(true);
    try {
      const res = await fetch(
        `/api/library/volatility-breakout/universe?universe=${selected}`,
        { cache: "no-store" }
      );
      const payload = (await res.json()) as UniverseResponse;
      setUniverseInfo(payload);
    } finally {
      setLoadingUniverse(false);
    }
  }, []);

  const loadResults = React.useCallback(async () => {
    const res = await fetch("/api/library/volatility-breakout/results", {
      cache: "no-store",
    });
    const payload = (await res.json()) as ResultsResponse;
    setResults(payload);
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      try {
        const res = await fetch("/api/library/volatility-breakout/status", {
          cache: "no-store",
        });
        const payload = (await res.json()) as StatusResponse;
        if (!cancelled) setStatus(payload);
      } catch {
        /* ignore */
      }
    }

    void loadStatus();
    void loadResults();
    void loadUniverse(universe);

    const id = setInterval(() => {
      void loadStatus();
      void loadResults();
    }, 2_000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [loadResults, loadUniverse, universe]);

  const wasRunning = React.useRef(false);
  React.useEffect(() => {
    if (wasRunning.current && !isRunning) {
      void loadResults();
    }
    wasRunning.current = isRunning;
  }, [isRunning, loadResults]);

  async function refreshUniverseOnly() {
    setError(null);
    setRefreshingUniverse(true);
    try {
      const res = await fetch("/api/library/volatility-breakout/universe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ universe }),
      });
      const payload = (await res.json()) as UniverseResponse & { error?: string };
      if (!res.ok) {
        throw new Error(payload.error || `Failed to refresh (${res.status})`);
      }
      setUniverseInfo(payload);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshingUniverse(false);
    }
  }

  async function handleRun(refreshUniverse: boolean) {
    setError(null);
    setSubmitting(refreshUniverse ? "refresh" : "cached");
    try {
      const res = await fetch("/api/library/volatility-breakout/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ universe, refreshUniverse }),
      });
      const payload = (await res.json()) as
        | VolatilityBreakoutJobState
        | { error?: string };
      if (!res.ok) {
        throw new Error(
          "error" in payload ? payload.error || `Failed to start (${res.status})` : `Failed to start (${res.status})`
        );
      }
      setStatus((prev) => ({
        state: payload as VolatilityBreakoutJobState,
        events: prev?.events ?? [],
      }));
      if (refreshUniverse) {
        await loadUniverse(universe);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(null);
    }
  }

  async function handleStop() {
    setStopping(true);
    try {
      await fetch("/api/library/volatility-breakout/stop", { method: "POST" });
    } finally {
      setStopping(false);
    }
  }

  return (
    <TileModal
      title="Volatility Breakout · scan"
      description="Run Larry Williams volatility breakout scans on Nifty 50 or Nifty Midcap 50."
      onClose={onClose}
      size="xl"
    >
      <div className="flex flex-col gap-4">
        <UniversePanel
          universe={universe}
          universeInfo={universeInfo}
          loading={loadingUniverse}
          refreshing={refreshingUniverse}
          disabled={isRunning || submitting !== null}
          onUniverseChange={setUniverse}
          onRefresh={refreshUniverseOnly}
        />

        {isRunning ? (
          <RunningPanel stopping={stopping} onStop={handleStop} />
        ) : (
          <RunChoices
            submitting={submitting}
            onChoose={handleRun}
            universeLabel={
              UNIVERSE_OPTIONS.find((option) => option.value === universe)?.label ??
              universe
            }
          />
        )}

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive-soft px-3 py-2 text-[12px] text-destructive">
            {error}
          </div>
        )}

        {status && <StatusPanel state={status.state} justFinished={justFinished} />}
        {status && status.events.length > 0 && <EventFeed events={status.events} />}
        <ResultsTable results={results} />
      </div>
    </TileModal>
  );
}

function UniversePanel({
  universe,
  universeInfo,
  loading,
  refreshing,
  disabled,
  onUniverseChange,
  onRefresh,
}: {
  universe: NiftyUniverseId;
  universeInfo: UniverseResponse | null;
  loading: boolean;
  refreshing: boolean;
  disabled: boolean;
  onUniverseChange: (value: NiftyUniverseId) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Universe
          </label>
          <Select
            value={universe}
            disabled={disabled}
            onChange={(e) => onUniverseChange(e.target.value as NiftyUniverseId)}
          >
            {UNIVERSE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || refreshing}
          onClick={onRefresh}
          className="sm:mb-[1px]"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          Update list
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <StatCard
          label="Constituents"
          value={
            loading
              ? "Loading…"
              : universeInfo?.hasCache
                ? String(universeInfo.count)
                : "Not cached"
          }
        />
        <StatCard
          label="Last refresh"
          value={
            loading
              ? "Loading…"
              : universeInfo?.fetchedAt
                ? formatDate(universeInfo.fetchedAt)
                : "Never"
          }
        />
        <StatCard
          label="Source"
          value={loading ? "Loading…" : universeInfo?.source ? "Official Nifty CSV" : "—"}
        />
      </div>
    </div>
  );
}

function RunChoices({
  submitting,
  universeLabel,
  onChoose,
}: {
  submitting: null | "cached" | "refresh";
  universeLabel: string;
  onChoose: (refreshUniverse: boolean) => void;
}) {
  const isBusy = submitting !== null;
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft/60 text-brand ring-1 ring-inset ring-brand/20">
          <Info className="h-4 w-4" />
        </span>
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-semibold text-foreground">
            Scan {universeLabel} now?
          </span>
          <span className="text-[11.5px] leading-relaxed text-muted-foreground">
            Use the cached list for the fastest run, or refresh the official
            constituent list first and scan the updated universe immediately.
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
              <ArrowUpDown className="h-4 w-4" />
            )
          }
          title={submitting === "cached" ? "Launching…" : "Run with cached list"}
          subtitle="Start scanning immediately using the local universe cache"
          disabled={isBusy}
          onClick={() => onChoose(false)}
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
          title={submitting === "refresh" ? "Launching…" : "Refresh and run"}
          subtitle="Fetch the latest index list first, then run the scan"
          disabled={isBusy}
          onClick={() => onChoose(true)}
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
  disabled,
  onClick,
}: {
  tone: "outline" | "brand";
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  disabled?: boolean;
  onClick: () => void;
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
            The scan runs in the background while this dialog stays open.
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
  state: VolatilityBreakoutJobState;
  justFinished: boolean;
}) {
  const elapsedMs =
    state.startedAt === null
      ? 0
      : (state.endedAt ?? Date.now()) - state.startedAt;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <StatCard
        label="Status"
        value={
          state.running
            ? "Scanning"
            : justFinished
              ? state.exitCode === 0
                ? "Done"
                : state.exitCode === 130
                  ? "Stopped"
                  : `Exited (${state.exitCode ?? "?"})`
              : "Idle"
        }
        tone={
          state.running ? "active" : justFinished && state.exitCode === 0 ? "ok" : "neutral"
        }
      />
      <StatCard label="Matches" value={String(state.matches)} tone={state.matches > 0 ? "ok" : "neutral"} />
      <StatCard label="Scanned" value={`${state.scanned}/${state.totalTickers || "—"}`} />
      <StatCard label="Universe" value={state.universeLabel ?? "—"} />
      <StatCard label="Elapsed" value={state.startedAt ? formatDuration(elapsedMs) : "—"} />
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "active" | "ok";
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border/60 bg-card px-3 py-2.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-[13px] font-semibold",
          tone === "active" && "text-amber-600",
          tone === "ok" && "text-emerald-600"
        )}
      >
        {tone === "active" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />}
        {tone === "ok" && <CheckCircle2 className="h-3.5 w-3.5" />}
        {value}
      </span>
    </div>
  );
}

function EventFeed({ events }: { events: VolatilityBreakoutEvent[] }) {
  const recent = events.slice(-80);

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
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
          {recent.map((event, index) => (
            <EventRow key={index} event={event} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function EventRow({ event }: { event: VolatilityBreakoutEvent }) {
  const time = formatTime(event.ts);

  if (event.kind === "match") {
    return (
      <li className="flex items-center gap-2.5 rounded-md bg-emerald-50/40 px-2.5 py-1.5 ring-1 ring-emerald-100">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
        <span className="font-mono text-[10.5px] text-muted-foreground">{time}</span>
        <span className="font-mono text-[12px] font-semibold text-foreground">
          {event.ticker}
        </span>
        <span className="rounded-full bg-card px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-inset ring-border/60">
          {event.direction}
        </span>
        <span className="ml-auto font-mono text-[10.5px] text-muted-foreground">
          {event.breakoutAt}
        </span>
      </li>
    );
  }

  if (event.kind === "started") {
    return (
      <li className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[11.5px] text-foreground">
        <span className="font-mono text-[10.5px] text-muted-foreground">{time}</span>
        <span>
          Scanning <span className="font-semibold">{event.label}</span> ·{" "}
          {event.totalTickers} symbols
        </span>
      </li>
    );
  }

  if (event.kind === "universe") {
    return (
      <li className="flex items-center gap-2 rounded-md bg-brand-soft/25 px-2.5 py-1.5 text-[11.5px] text-foreground">
        <span className="font-mono text-[10.5px] text-muted-foreground">{time}</span>
        <span>
          Universe ready · {event.label} · {event.count} constituents · refreshed{" "}
          {formatDate(event.fetchedAt)}
        </span>
      </li>
    );
  }

  if (event.kind === "progress") {
    return (
      <li className="flex items-center gap-2 px-2.5 py-1 text-[11px] text-muted-foreground">
        <span className="font-mono text-[10.5px]">{time}</span>
        <span>
          Progress {event.completed}/{event.total} · last {event.ticker}
        </span>
      </li>
    );
  }

  if (event.kind === "completed") {
    return (
      <li className="flex items-center gap-2 rounded-md bg-brand-soft/30 px-2.5 py-1.5 text-[11.5px] text-foreground">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
        <span className="font-mono text-[10.5px] text-muted-foreground">{time}</span>
        <span>
          Scan complete · {event.matches} match{event.matches === 1 ? "" : "es"} ·{" "}
          {event.scanned}/{event.totalTickers} scanned
        </span>
      </li>
    );
  }

  if (event.kind === "error") {
    return (
      <li className="flex items-start gap-2 rounded-md bg-rose-50/40 px-2.5 py-1.5 ring-1 ring-rose-100">
        <span className="font-mono text-[10.5px] text-muted-foreground">{time}</span>
        <span className="break-words text-[11.5px] text-rose-700">{event.message}</span>
      </li>
    );
  }

  return (
    <li className="flex items-start gap-2 px-2.5 py-1 text-[11.5px] text-muted-foreground">
      <span className="font-mono text-[10.5px]">{time}</span>
      <span className="break-words">{event.message}</span>
    </li>
  );
}

function ResultsTable({ results }: { results: ResultsResponse | null }) {
  const [reloading, setReloading] = React.useState(false);
  const [refreshingPrices, setRefreshingPrices] = React.useState(false);
  const [localResults, setLocalResults] = React.useState<ResultsResponse | null>(
    null
  );

  React.useEffect(() => {
    setLocalResults(results);
  }, [results]);

  const effective = localResults;

  async function reload() {
    setReloading(true);
    try {
      const res = await fetch("/api/library/volatility-breakout/results", {
        cache: "no-store",
      });
      const payload = (await res.json()) as ResultsResponse;
      setLocalResults(payload);
    } finally {
      setReloading(false);
    }
  }

  async function refreshPrices() {
    setRefreshingPrices(true);
    try {
      const res = await fetch("/api/library/volatility-breakout/prices", {
        method: "POST",
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || `Failed to refresh prices (${res.status})`);
      }
      const refreshed = await fetch("/api/library/volatility-breakout/results", {
        cache: "no-store",
      });
      const payload = (await refreshed.json()) as ResultsResponse;
      setLocalResults(payload);
    } finally {
      setRefreshingPrices(false);
    }
  }

  if (!effective) {
    return (
      <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-4 text-[12px] text-muted-foreground">
        Loading results…
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
        <div className="flex flex-col">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Latest results
          </span>
          <span className="text-[11px] text-muted-foreground">
            {effective.updatedAt
              ? `Saved ${formatDate(effective.updatedAt)} · ${effective.rows.length} match${effective.rows.length === 1 ? "" : "es"}`
              : "No saved results yet."}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={refreshPrices}
            disabled={refreshingPrices || effective.rows.length === 0}
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", refreshingPrices && "animate-spin")}
            />
            {refreshingPrices ? "Fetching…" : "Refresh prices"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={reload} disabled={reloading}>
            <RefreshCw className={cn("h-3.5 w-3.5", reloading && "animate-spin")} />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={effective.rows.length === 0}
            onClick={() =>
              window.open(
                "/api/library/volatility-breakout/results?download=1",
                "_blank"
              )
            }
          >
            <Download className="h-3.5 w-3.5" />
            Download CSV
          </Button>
        </div>
      </div>
      <div className="max-h-[340px] overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-[12.5px]">
          <thead>
            <tr>
              {[
                "Ticker",
                "Direction",
                "Signal date",
                "Breakout at",
                "Open",
                "Live",
                "Buy",
                "Short",
              ].map((heading) => (
                <th
                  key={heading}
                  className={cn(
                    "sticky top-0 z-10 border-b border-border/60 bg-card px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground",
                    [
                      "Open",
                      "Live",
                      "Buy",
                      "Short",
                    ].includes(heading) && "text-right"
                  )}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {effective.rows.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-10 text-center text-[12px] text-muted-foreground"
                >
                  No matches yet. Run a scan to populate this table.
                </td>
              </tr>
            )}
            {effective.rows.map((row) => (
              <tr key={`${row.ticker}-${row.breakoutAt}`} className="hover:bg-muted/30">
                <td className="border-b border-border-soft px-3 py-1.5 font-mono text-[12px] font-semibold text-foreground">
                  {row.ticker}
                </td>
                <td className="border-b border-border-soft px-3 py-1.5">
                  <DirectionChip value={row.direction} />
                </td>
                <td className="border-b border-border-soft px-3 py-1.5 font-mono text-[11.5px] text-muted-foreground">
                  {row.signalDate}
                </td>
                <td className="border-b border-border-soft px-3 py-1.5 font-mono text-[11.5px] text-muted-foreground">
                  {row.breakoutAt}
                </td>
                <td className="border-b border-border-soft px-3 py-1.5 text-right font-mono">
                  {formatNumber(row.openPrice)}
                </td>
                <td className="border-b border-border-soft px-3 py-1.5 text-right font-mono">
                  {row.livePrice === null ? "—" : formatNumber(row.livePrice)}
                </td>
                <td className="border-b border-border-soft px-3 py-1.5 text-right font-mono">
                  {formatNumber(row.buyLevel)}
                </td>
                <td className="border-b border-border-soft px-3 py-1.5 text-right font-mono">
                  {formatNumber(row.shortLevel)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DirectionChip({ value }: { value: "LONG" | "SHORT" }) {
  const isLong = value === "LONG";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset",
        isLong
          ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
          : "bg-rose-50 text-rose-700 ring-rose-200"
      )}
    >
      {value}
    </span>
  );
}

function formatNumber(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }
  return value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}
