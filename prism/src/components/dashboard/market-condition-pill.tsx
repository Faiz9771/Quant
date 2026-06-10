"use client";

import * as React from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  Loader2,
  RefreshCw,
  Search,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

interface Nifty50Constituent {
  companyName: string;
  industry: string;
  symbol: string;
  series: string;
  isinCode: string;
}

interface Nifty50Payload {
  source: string;
  fetchedAt: string;
  count: number;
  constituents: Nifty50Constituent[];
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function MarketConditionPill() {
  const [ema, setEma] = React.useState<EmaPeriod>(9);
  const [snap, setSnap] = React.useState<Snapshot | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [list, setList] = React.useState<Nifty50Payload | null>(null);
  const [listLoading, setListLoading] = React.useState(false);
  const [listErr, setListErr] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const popRef = React.useRef<HTMLDivElement | null>(null);

  const load = React.useCallback(async (period: EmaPeriod) => {
    setLoading(true);
    setErr(null);
    try {
      const qs = new URLSearchParams({
        date: todayIso(),
        ema: String(period),
      }).toString();
      const res = await fetch(`/api/library/market-condition?${qs}`, {
        cache: "no-store",
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
      setSnap(j as Snapshot);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load(ema);
    // Refresh at local midnight so "today" stays current.
    const now = new Date();
    const nextMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0,
      0,
      5
    );
    const ms = nextMidnight.getTime() - now.getTime();
    const t = setTimeout(() => load(ema), ms);
    return () => clearTimeout(t);
  }, [load, ema]);

  const loadNifty50 = React.useCallback(async () => {
    setListLoading(true);
    setListErr(null);
    try {
      const res = await fetch("/api/dashboard/nifty50", {
        cache: "no-store",
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
      setList(j as Nifty50Payload);
    } catch (e) {
      setListErr((e as Error).message);
    } finally {
      setListLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!open) return;
    if (!list && !listLoading) void loadNifty50();
    function onDown(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, list, listLoading, loadNifty50]);

  const up = snap?.condition === "UP";
  const filteredList = React.useMemo(() => {
    const rows = list?.constituents ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.symbol, row.companyName, row.industry, row.isinCode]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [list, query]);

  const industryCount = React.useMemo(() => {
    const set = new Set((list?.constituents ?? []).map((row) => row.industry));
    set.delete("");
    return set.size;
  }, [list]);

  return (
    <div ref={popRef} className="relative flex flex-col items-end gap-1">
    <div className="flex items-center gap-2">
      <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Market trend · EMA{ema} (weekly)
      </span>
      <div
        role="tablist"
        aria-label="EMA period"
        className="inline-flex rounded-full bg-muted p-0.5 ring-1 ring-inset ring-border"
      >
        {([9, 25] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={ema === p}
            onClick={() => setEma(p)}
            className={cn(
              "px-2 py-[2px] text-[9.5px] font-semibold tracking-[0.04em] rounded-full transition",
              ema === p
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
    <div className="relative self-end">
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
      aria-haspopup="dialog"
      className={cn(
        "inline-flex w-full items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-[11.5px] ring-1 ring-inset transition-all duration-200",
        up
          ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/30"
          : snap
            ? "bg-rose-500/10 text-rose-600 ring-rose-500/30"
            : "bg-muted text-muted-foreground ring-border"
      )}
      title={
        snap
          ? `As of ${snap.asOf} · weekly bar ${snap.barDate} · close ${snap.close} · EMA${snap.emaPeriod} ${snap.emaPeriod === 9 ? snap.ema9 : snap.ema25}`
          : undefined
      }
    >
      <TrendingUp className="h-3.5 w-3.5 opacity-70" />
      <span className="font-medium uppercase tracking-[0.06em]">
        Nifty50
      </span>
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : err ? (
        <span className="text-muted-foreground">—</span>
      ) : snap ? (
        <>
          <span className="flex items-center gap-0.5 font-semibold">
            {up ? (
              <ArrowUpRight className="h-3.5 w-3.5" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5" />
            )}
            {snap.condition}
          </span>
          <span className="font-mono text-muted-foreground">
            {snap.close}
          </span>
        </>
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
      <ChevronDown
        className={cn(
          "h-3.5 w-3.5 opacity-60 transition-transform duration-200",
          open && "rotate-180"
        )}
      />
    </button>

    <div
      className={cn(
        "absolute right-0 top-full z-50 mt-2 w-full min-w-full origin-top-right overflow-hidden rounded-lg border border-border bg-card text-foreground shadow-e4 ring-1 ring-black/[0.03]",
        "transition-all duration-200 ease-out-soft",
        open
          ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
          : "pointer-events-none -translate-y-1 scale-[0.98] opacity-0"
      )}
      role="dialog"
      aria-label="Current Nifty 50 constituents"
    >
      <div className="border-b border-border/70 p-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[12px] font-semibold">Nifty 50</div>
            <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
              NSE{industryCount ? ` · ${industryCount} groups` : ""}
            </div>
            <div className="mt-0.5 text-[10px] font-semibold text-[hsl(90_35%_28%)]">
              {list?.count ?? 50} stocks
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void loadNifty50();
            }}
            disabled={listLoading}
            aria-label="Refresh Nifty 50 list"
            title="Refresh from NSE"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", listLoading && "animate-spin")} />
          </button>
        </div>

        <div className="mt-2 flex h-7 items-center gap-1.5 rounded-md border border-border bg-background/60 px-2">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find"
            className="h-full min-w-0 flex-1 bg-transparent text-[11px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <div className="max-h-[320px] overflow-y-auto p-1.5">
        {listLoading && !list ? (
          <div className="flex h-[180px] items-center justify-center gap-2 text-[12px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading
          </div>
        ) : listErr ? (
          <div className="rounded-md bg-destructive-soft px-3 py-2 text-[12px] text-[hsl(0_65%_42%)]">
            {listErr}
          </div>
        ) : filteredList.length === 0 ? (
          <div className="px-3 py-8 text-center text-[12px] text-muted-foreground">
            No match.
          </div>
        ) : (
          <div className="grid gap-0.5">
            {filteredList.map((row, index) => (
              <div
                key={row.isinCode || row.symbol}
                className="grid grid-cols-[24px_minmax(0,1fr)] items-center gap-1.5 rounded-md px-1.5 py-1.5 transition hover:bg-muted/70"
              >
                <span className="font-mono text-[9.5px] text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-baseline gap-1.5">
                    <span className="font-mono text-[11px] font-semibold text-foreground">
                      {row.symbol}
                    </span>
                    <span className="truncate text-[10px] text-muted-foreground">
                      {row.companyName}
                    </span>
                  </div>
                  <div className="truncate text-[9px] text-muted-foreground/80">
                    {row.industry || "Unclassified"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border/70 px-2 py-1.5 text-[9.5px] text-muted-foreground">
        <span className="block truncate">
          {list ? `Updated ${new Date(list.fetchedAt).toLocaleTimeString()}` : "Refresh for latest"}
        </span>
      </div>
    </div>
    </div>
    </div>
  );
}
