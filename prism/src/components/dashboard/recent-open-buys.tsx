"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrbitingDots } from "@/components/ui/orbiting-dots";
import { cn, normKey } from "@/lib/utils";
import type { LiveValidationDataset } from "@/lib/data/live-validation";
import type { SnapshotRow, SnapshotValue } from "@/lib/data/types";

const POSITION_KEYS = new Set([
  "openpositions",
  "openposition",
  "positionstatus",
  "positionsstatus",
  "posstatus",
]);

const ENTRY_DATE_KEYS = new Set([
  "entrydate",
  "entrydt",
  "entrydatetime",
  "entry",
]);

const REFRESH_MS = 30_000;

function toNum(v: SnapshotValue | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[,%]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseDate(v: SnapshotValue | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  const months: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  let m = /^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/.exec(s);
  if (m) {
    const day = Number(m[1]);
    const monIdx = months[m[2].toLowerCase()];
    if (monIdx === undefined) return null;
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    return Date.UTC(year, monIdx, day);
  }
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = /^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})$/.exec(s);
  if (m) {
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    return Date.UTC(year, Number(m[2]) - 1, Number(m[1]));
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

export function RecentOpenBuys() {
  const [rows, setRows] = React.useState<SnapshotRow[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/live-validation", { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const ds = (await res.json()) as LiveValidationDataset;

      const posCol =
        ds.columns.find((c) => POSITION_KEYS.has(normKey(c))) ?? null;
      const entryDateCol =
        ds.columns.find((c) => ENTRY_DATE_KEYS.has(normKey(c))) ?? null;
      const predictionCol =
        ds.columns.find((c) => normKey(c) === "prediction") ?? null;

      const filtered = ds.rows.filter((r) => {
        const pos = posCol
          ? String(r[posCol] ?? "").trim().toLowerCase()
          : "";
        const pred = predictionCol
          ? String(r[predictionCol] ?? "").trim().toLowerCase()
          : "";
        const isOpen =
          pos === "open" || pos === "ope" || pos === "yes" || pos === "y" || pos === "1";
        const isBuy = pred === "buy";
        return isOpen && isBuy;
      });

      if (entryDateCol) {
        filtered.sort((a, b) => {
          const da = parseDate(a[entryDateCol]);
          const db = parseDate(b[entryDateCol]);
          if (da === null && db === null) return 0;
          if (da === null) return 1;
          if (db === null) return -1;
          return db - da;
        });
      }
      setRows(filtered.slice(0, 3));
      setErr(null);
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

  return (
    <Link
      href="/live-validation"
      className="block h-[260px] w-[420px] rounded-3xl transition-[transform,box-shadow] duration-300 ease-[var(--ease-soft)] hover:-translate-y-0.5 hover:shadow-e2 focus:outline-none focus:ring-2 focus:ring-brand/40"
      title="Open Live Validation"
    >
    <Card className="flex h-full w-full flex-col overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-[13px]">
          <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
          Recent open buys
        </CardTitle>
        {loading ? (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        ) : (
          <span
            role="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              load();
            }}
            className="text-muted-foreground hover:text-foreground"
            title="Refresh"
          >
            <RefreshCw className="h-3 w-3" />
          </span>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        {loading && !rows && (
          <div className="flex h-[160px] items-center justify-center">
            <OrbitingDots />
          </div>
        )}
        {err && <p className="text-[11px] text-destructive">{err}</p>}
        {!err && rows && rows.length === 0 && (
          <p className="text-[11.5px] text-muted-foreground">
            No open buy positions.
          </p>
        )}
        {rows && rows.length > 0 && (
          <>
          <div className="flex items-center justify-between gap-3 border-b border-border-soft pb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            <span>Ticker</span>
            <div className="flex items-center gap-3 font-mono">
              <span className="min-w-[44px] text-right">C</span>
              <span className="min-w-[44px] text-right">T</span>
              <span className="min-w-[44px] text-right">SL</span>
              <span className="min-w-[54px] text-right">% PL</span>
            </div>
          </div>
          <ul className="flex flex-col divide-y divide-border-soft">
            {rows.map((r, i) => {
              const ticker = String(r["Ticker"] ?? "—");
              const entry = toNum(r["Entry Price"]);
              const current = toNum(r["Current Price"]);
              const target = toNum(r["P_Target"]);
              const stoploss = toNum(r["P_Stoploss"]);
              const pct = toNum(r["% Current PL"]);
              const entryDate = r["Entry Date"];
              const pos = pct === null ? null : pct >= 0;
              return (
                <li
                  key={i}
                  className="flex items-center justify-between gap-3 py-1.5 text-[11.5px]"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium text-foreground">
                      {ticker}
                    </span>
                    <span className="text-[10.5px] text-muted-foreground">
                      {entryDate ? String(entryDate) : "—"}
                      {entry !== null ? ` · @ ${entry}` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 font-mono tabular-nums">
                    <span className="min-w-[44px] text-right text-muted-foreground">
                      {current !== null ? current : "—"}
                    </span>
                    <span className="min-w-[44px] text-right text-muted-foreground">
                      {target !== null ? target : "—"}
                    </span>
                    <span className="min-w-[44px] text-right text-muted-foreground">
                      {stoploss !== null ? stoploss : "—"}
                    </span>
                    <span
                      className={cn(
                        "min-w-[54px] text-right font-semibold",
                        pos === null
                          ? "text-muted-foreground"
                          : pos
                            ? "text-emerald-600"
                            : "text-rose-600"
                      )}
                    >
                      {pct === null
                        ? "—"
                        : `${pct > 0 ? "+" : ""}${pct.toFixed(2)}%`}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="pt-3 text-[10px] text-muted-foreground">
            Open buy positions · click to view full live validation
          </p>
          </>
        )}
      </CardContent>
    </Card>
    </Link>
  );
}
