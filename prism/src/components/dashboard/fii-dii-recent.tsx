"use client";

import * as React from "react";
import { Loader2, RefreshCw, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrbitingDots } from "@/components/ui/orbiting-dots";
import { cn } from "@/lib/utils";

interface Row {
  date: string;
  grossPurchase: number | null;
  grossSales: number | null;
  net: number | null;
}

const REFRESH_MS = 60_000 * 15; // 15 min

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function monthsAgoIso(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}
function fmtCr(v: number | null): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  const body = abs >= 1000 ? abs.toFixed(0) : abs.toFixed(1);
  return `${v < 0 ? "-" : ""}${body}`;
}
function fmtShortDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
  });
}

export function FiiDiiRecent() {
  const [fii, setFii] = React.useState<Row[] | null>(null);
  const [dii, setDii] = React.useState<Row[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setErr(null);
    try {
      const start = monthsAgoIso(2);
      const end = todayIso();
      const qs = new URLSearchParams({
        kind: "both",
        start,
        end,
        format: "json",
      }).toString();
      const res = await fetch(`/api/library/fii-dii?${qs}`, {
        cache: "no-store",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(j?.error || `Fetch failed (${res.status})`);
      }
      setFii(((j.fii as Row[]) ?? []).slice(0, 5));
      setDii(((j.dii as Row[]) ?? []).slice(0, 5));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    // Fire a refresh just after local midnight so the window advances to today.
    const now = new Date();
    const nextMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0,
      0,
      5
    );
    const mid = setTimeout(load, nextMidnight.getTime() - now.getTime());
    return () => {
      clearInterval(t);
      clearTimeout(mid);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const dates = React.useMemo(() => {
    const set = new Set<string>();
    (fii ?? []).forEach((r) => set.add(r.date));
    (dii ?? []).forEach((r) => set.add(r.date));
    return Array.from(set).sort((a, b) => (a < b ? 1 : -1)).slice(0, 5);
  }, [fii, dii]);

  const fiiMap = React.useMemo(
    () => new Map((fii ?? []).map((r) => [r.date, r])),
    [fii]
  );
  const diiMap = React.useMemo(
    () => new Map((dii ?? []).map((r) => [r.date, r])),
    [dii]
  );

  return (
    <Card className="flex h-[260px] w-[500px] flex-col overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-[13px]">
          <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
          FII / DII — last 5 sessions
        </CardTitle>
        {loading ? (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        ) : (
          <button
            type="button"
            onClick={load}
            className="text-muted-foreground hover:text-foreground"
            title="Refresh"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        {loading && dates.length === 0 && (
          <div className="flex h-[160px] items-center justify-center">
            <OrbitingDots />
          </div>
        )}
        {err && <p className="text-[11px] text-destructive">{err}</p>}
        {!err && dates.length === 0 && !loading && (
          <p className="text-[11.5px] text-muted-foreground">No data.</p>
        )}
        {dates.length > 0 && (
          <>
            <div className="flex items-center justify-between gap-3 border-b border-border-soft pb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              <span>Date</span>
              <div className="flex items-center gap-3 font-mono">
                <span className="min-w-[60px] text-right">FII Net</span>
                <span className="min-w-[60px] text-right">DII Net</span>
                <span className="min-w-[70px] text-right">Net</span>
              </div>
            </div>
            <ul className="flex flex-col divide-y divide-border-soft">
              {dates.map((d) => {
                const f = fiiMap.get(d)?.net ?? null;
                const di = diiMap.get(d)?.net ?? null;
                const combined =
                  f === null && di === null ? null : (f ?? 0) + (di ?? 0);
                return (
                  <li
                    key={d}
                    className="flex items-center justify-between gap-3 py-1.5 text-[11.5px]"
                  >
                    <span className="font-medium text-foreground">
                      {fmtShortDate(d)}
                    </span>
                    <div className="flex items-center gap-3 font-mono tabular-nums">
                      <span
                        className={cn(
                          "min-w-[60px] text-right",
                          f === null
                            ? "text-muted-foreground"
                            : f >= 0
                              ? "text-emerald-600"
                              : "text-rose-600"
                        )}
                      >
                        {fmtCr(f)}
                      </span>
                      <span
                        className={cn(
                          "min-w-[60px] text-right",
                          di === null
                            ? "text-muted-foreground"
                            : di >= 0
                              ? "text-emerald-600"
                              : "text-rose-600"
                        )}
                      >
                        {fmtCr(di)}
                      </span>
                      <span
                        className={cn(
                          "min-w-[70px] text-right font-semibold",
                          combined === null
                            ? "text-muted-foreground"
                            : combined >= 0
                              ? "text-emerald-600"
                              : "text-rose-600"
                        )}
                      >
                        {fmtCr(combined)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="pt-3 text-[10px] text-muted-foreground">
              ₹ Crore · Source: Moneycontrol cash segment
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
