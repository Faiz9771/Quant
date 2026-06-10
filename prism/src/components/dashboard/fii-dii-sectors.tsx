"use client";

import * as React from "react";
import { ArrowLeft, Layers, Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrbitingDots } from "@/components/ui/orbiting-dots";
import { cn } from "@/lib/utils";

interface SectorAverage {
  sector: string;
  avgFii: number | null;
  avgDii: number | null;
  avgPromoter: number | null;
  sampleSize: number;
}
interface BreakdownResp {
  asOf: string;
  sectors: SectorAverage[];
}

interface SectorStock {
  symbol: string;
  fii: number | null;
  dii: number | null;
  promoter: number | null;
  publicAndOthers: number | null;
  quarter: string | null;
  source?: string;
  ageDays?: number;
  error?: string;
}
interface SectorDetailResp {
  sector: string;
  asOf: string;
  stocks: SectorStock[];
}

type SortKey = "fii" | "dii" | "spread";

const REFRESH_MS = 60_000 * 60 * 6; // 6h

function fmt(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(1)}%`;
}

export function FiiDiiSectors() {
  const [data, setData] = React.useState<BreakdownResp | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [sortBy, setSortBy] = React.useState<SortKey>("fii");
  const [openSector, setOpenSector] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<SectorDetailResp | null>(null);
  const [detailBusy, setDetailBusy] = React.useState(false);
  const [detailErr, setDetailErr] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/dashboard/fii-dii-sectors");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
      setData(j as BreakdownResp);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  function ageDays(iso: string): number {
    return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  }

  const maxBar = React.useMemo(() => {
    if (!data) return 1;
    let m = 0;
    for (const s of data.sectors) {
      m = Math.max(m, s.avgFii ?? 0, s.avgDii ?? 0);
    }
    return Math.max(m, 1);
  }, [data]);

  React.useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  React.useEffect(() => {
    if (!openSector) return;
    let cancelled = false;
    setDetail(null);
    setDetailErr(null);
    setDetailBusy(true);
    (async () => {
      try {
        const r = await fetch(
          `/api/library/fii-holdings/sector?sector=${encodeURIComponent(
            openSector
          )}&limit=30`
        );
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
        if (!cancelled) setDetail(j as SectorDetailResp);
      } catch (e) {
        if (!cancelled) setDetailErr((e as Error).message);
      } finally {
        if (!cancelled) setDetailBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openSector]);

  const sorted = React.useMemo(() => {
    if (!data) return [];
    const rows = [...data.sectors];
    rows.sort((a, b) => {
      const av =
        sortBy === "fii"
          ? a.avgFii
          : sortBy === "dii"
            ? a.avgDii
            : (a.avgFii ?? 0) - (a.avgDii ?? 0);
      const bv =
        sortBy === "fii"
          ? b.avgFii
          : sortBy === "dii"
            ? b.avgDii
            : (b.avgFii ?? 0) - (b.avgDii ?? 0);
      return (bv ?? -1) - (av ?? -1);
    });
    return rows;
  }, [data, sortBy]);

  const flipped = openSector !== null;

  return (
    <div className="h-[280px] w-[420px] [perspective:1400px]">
      <div
        className={cn(
          "grid h-full w-full grid-cols-1 grid-rows-1 transition-transform duration-500 ease-out [transform-style:preserve-3d]",
          flipped && "[transform:rotateY(180deg)]"
        )}
      >
        <Card className="col-start-1 row-start-1 flex h-full w-full flex-col overflow-hidden [backface-visibility:hidden]">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="flex items-center gap-2 text-[13px]">
              <Layers className="h-3.5 w-3.5 text-muted-foreground" />
              Sector-wise FII / DII holdings
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-md border border-border/70 bg-muted/40 p-[2px]">
                {(["fii", "dii", "spread"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setSortBy(k)}
                    className={cn(
                      "rounded-[5px] px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-[0.04em] transition-all",
                      sortBy === k
                        ? "bg-card text-foreground shadow-sm ring-1 ring-border/60"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {k === "spread" ? "FII−DII" : k}
                  </button>
                ))}
              </div>
              {busy && (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              )}
              <button
                type="button"
                onClick={load}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Refresh"
              >
                <RefreshCw className="h-3 w-3" />
              </button>
            </div>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col pt-0">
            {!data && busy && (
              <div className="flex flex-1 items-center justify-center">
                <OrbitingDots />
              </div>
            )}
            {err && !data && (
              <div className="flex flex-1 flex-col items-center justify-center gap-1 px-4 text-center">
                <p className="text-[11.5px] text-muted-foreground">{err}</p>
                <p className="text-[10.5px] text-muted-foreground/80">
                  Then refresh this card.
                </p>
              </div>
            )}
            {data && (
              <div className="flex min-h-0 flex-1 flex-col">
                <p
                  className="pb-4 text-[10px] text-muted-foreground/80"
                  title="Simple average of latest-quarter FII/DII shareholding % across all index constituents per sector (snapshot, not a flow)."
                >
                  Latest-quarter avg · all constituents · as of{" "}
                  {data.asOf.slice(0, 10)} ({ageDays(data.asOf)}d old)
                </p>
                <div className="flex items-center justify-between gap-3 border-b border-border-soft pb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  <span>Sector</span>
                  <div className="flex items-center gap-3 font-mono">
                    <span className="min-w-[44px] text-right">FII</span>
                    <span className="min-w-[44px] text-right">DII</span>
                    <span className="min-w-[80px] text-right">Split</span>
                  </div>
                </div>
                <ul
                  className="min-h-0 flex-1 divide-y divide-border-soft overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable] [-webkit-overflow-scrolling:touch]"
                  onWheel={(e) => e.stopPropagation()}
                >
                  {sorted.map((s) => {
                    const fiiW = ((s.avgFii ?? 0) / maxBar) * 100;
                    const diiW = ((s.avgDii ?? 0) / maxBar) * 100;
                    return (
                      <li key={s.sector}>
                        <button
                          type="button"
                          onClick={() => setOpenSector(s.sector)}
                          className="flex w-full items-center justify-between gap-3 py-1.5 text-left text-[11.5px] transition-colors hover:bg-accent/40"
                        >
                          <span className="truncate text-foreground/90">
                            {s.sector.replace(/^Nifty\s+/, "")}
                          </span>
                          <div className="flex items-center gap-3 font-mono tabular-nums">
                            <span className="min-w-[44px] text-right text-emerald-600">
                              {fmt(s.avgFii)}
                            </span>
                            <span className="min-w-[44px] text-right text-sky-600">
                              {fmt(s.avgDii)}
                            </span>
                            <div className="flex h-2 min-w-[80px] items-center gap-0.5">
                              <div
                                className="h-2 rounded-sm bg-emerald-500/60"
                                style={{ width: `${fiiW * 0.4}px` }}
                              />
                              <div
                                className="h-2 rounded-sm bg-sky-500/60"
                                style={{ width: `${diiW * 0.4}px` }}
                              />
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="col-start-1 row-start-1 flex h-full w-full flex-col overflow-hidden [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="flex min-w-0 items-center gap-2 text-[13px]">
              <button
                type="button"
                onClick={() => setOpenSector(null)}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="Back to sector list"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
              <span className="truncate">{openSector ?? ""}</span>
            </CardTitle>
            <span className="shrink-0 rounded-full bg-muted/70 px-2 py-0.5 font-mono text-[10px] text-muted-foreground ring-1 ring-inset ring-border/60">
              {detail?.stocks.length ?? 0}
            </span>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col pt-0">
            {detailBusy && !detail && (
              <div className="flex flex-1 items-center justify-center">
                <OrbitingDots />
              </div>
            )}
            {detailErr && (
              <p className="text-[11.5px] text-destructive">{detailErr}</p>
            )}
            {detail && (
              <>
                <div className="flex items-center justify-between gap-3 border-b border-border-soft pb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  <span>Ticker</span>
                  <div className="flex items-center gap-3 font-mono">
                    <span className="min-w-[44px] text-right">FII</span>
                    <span className="min-w-[44px] text-right">DII</span>
                    <span className="min-w-[60px] text-right">Quarter</span>
                  </div>
                </div>
                <ul
                  className="min-h-0 flex-1 divide-y divide-border-soft overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable] [-webkit-overflow-scrolling:touch]"
                  onWheel={(e) => e.stopPropagation()}
                >
                  {detail.stocks.map((t) => (
                    <li
                      key={t.symbol}
                      className="flex items-center justify-between gap-3 py-1.5 text-[11.5px]"
                    >
                      <span className="truncate text-foreground/90">
                        {t.symbol}
                      </span>
                      <div className="flex items-center gap-3 font-mono tabular-nums">
                        <span className="min-w-[44px] text-right text-emerald-600">
                          {fmt(t.fii)}
                        </span>
                        <span className="min-w-[44px] text-right text-sky-600">
                          {fmt(t.dii)}
                        </span>
                        <span className="min-w-[60px] text-right text-muted-foreground">
                          {t.quarter ?? "—"}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
