"use client";

import * as React from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Loader2,
  Target,
  TrendingUp,
  Wallet2,
} from "lucide-react";
import { cn, normKey } from "@/lib/utils";
import type { LiveValidationDataset } from "@/lib/data/live-validation";
import type { SnapshotValue } from "@/lib/data/types";

const POSITION_KEYS = new Set([
  "openpositions",
  "openposition",
  "positionstatus",
  "positionsstatus",
  "posstatus",
]);

function toNum(v: SnapshotValue | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[,%]/g, ""));
  return Number.isFinite(n) ? n : null;
}

interface Stats {
  openCount: number;
  closedBuys: number;
  wins: number;
  losses: number;
  winRate: number | null;
  totalPts: number;
  expectancy: number | null;
}

export function KpiStats() {
  const [stats, setStats] = React.useState<Stats | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/live-validation", { cache: "no-store" });
      if (!res.ok) return;
      const ds = (await res.json()) as LiveValidationDataset;
      const posCol =
        ds.columns.find((c) => POSITION_KEYS.has(normKey(c))) ?? null;
      const predCol =
        ds.columns.find((c) => normKey(c) === "prediction") ?? null;

      let openCount = 0;
      let closedBuys = 0;
      let wins = 0;
      let losses = 0;
      let totalPts = 0;
      let winPctSum = 0;
      let winN = 0;
      let lossPctSum = 0;
      let lossN = 0;

      for (const r of ds.rows) {
        const pos = posCol
          ? String(r[posCol] ?? "").trim().toLowerCase()
          : "";
        const pred = predCol
          ? String(r[predCol] ?? "").trim().toLowerCase()
          : "";
        const isOpen =
          pos === "open" || pos === "ope" || pos === "yes" || pos === "y" || pos === "1";
        const isClosed =
          pos === "close" || pos === "closed" || pos === "exit" || pos === "exited";
        if (isOpen) openCount++;
        if (pred === "buy" && isClosed) closedBuys++;

        const wl = String(r["Win/Loss"] ?? "").trim().toLowerCase();
        const pts = toNum(r["+/- Points"]);
        const pct = toNum(r["Win/Loss %"]);
        if (pts !== null) totalPts += pts;
        if (wl === "win") {
          wins++;
          if (pct !== null) {
            winPctSum += pct;
            winN++;
          }
        } else if (wl === "loss") {
          losses++;
          if (pct !== null) {
            lossPctSum += pct;
            lossN++;
          }
        }
      }

      const winRate = closedBuys > 0 ? (wins / closedBuys) * 100 : null;
      const avgWin = winN ? winPctSum / winN : 0;
      const avgLoss = lossN ? lossPctSum / lossN : 0;
      const expectancy =
        closedBuys > 0
          ? (losses / closedBuys) * avgLoss + (wins / closedBuys) * avgWin
          : null;

      setStats({
        openCount,
        closedBuys,
        wins,
        losses,
        winRate,
        totalPts,
        expectancy,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const tiles: {
    label: string;
    value: string;
    sub?: string;
    tone?: "pos" | "neg" | "neutral";
    icon: React.ReactNode;
    accent: string; // tailwind classes for the gradient background
  }[] = [
    {
      label: "Open positions",
      value: stats ? String(stats.openCount) : "—",
      sub: stats ? `${stats.closedBuys} closed buys` : undefined,
      tone: "neutral",
      icon: <Activity className="h-4 w-4" />,
      accent: "from-indigo-500/15 via-indigo-500/5 to-transparent ring-indigo-500/20",
    },
    {
      label: "Win rate",
      value:
        stats?.winRate === null || stats?.winRate === undefined
          ? "—"
          : `${stats.winRate.toFixed(1)}%`,
      sub: stats ? `${stats.wins}W · ${stats.losses}L` : undefined,
      tone:
        stats?.winRate === null || stats?.winRate === undefined
          ? "neutral"
          : stats.winRate >= 50
            ? "pos"
            : "neg",
      icon: <Target className="h-4 w-4" />,
      accent: "from-emerald-500/15 via-emerald-500/5 to-transparent ring-emerald-500/20",
    },
    {
      label: "Net points",
      value: stats
        ? `${stats.totalPts > 0 ? "+" : ""}${stats.totalPts.toFixed(2)}`
        : "—",
      sub: "Across all closed trades",
      tone:
        stats === null
          ? "neutral"
          : stats.totalPts > 0
            ? "pos"
            : stats.totalPts < 0
              ? "neg"
              : "neutral",
      icon: <Wallet2 className="h-4 w-4" />,
      accent: "from-amber-500/15 via-amber-500/5 to-transparent ring-amber-500/20",
    },
    {
      label: "Expectancy",
      value:
        stats?.expectancy === null || stats?.expectancy === undefined
          ? "—"
          : `${stats.expectancy > 0 ? "+" : ""}${stats.expectancy.toFixed(2)}%`,
      sub: "Per-trade expected return",
      tone:
        stats?.expectancy === null || stats?.expectancy === undefined
          ? "neutral"
          : stats.expectancy > 0
            ? "pos"
            : "neg",
      icon: <TrendingUp className="h-4 w-4" />,
      accent: "from-violet-500/15 via-violet-500/5 to-transparent ring-violet-500/20",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((t) => (
        <div
          key={t.label}
          className={cn(
            "group relative overflow-hidden rounded-2xl bg-gradient-to-br p-4 ring-1 ring-inset transition-all hover:-translate-y-[1px] hover:shadow-md",
            t.accent
          )}
        >
          <div className="flex items-start justify-between">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              {t.label}
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-card/70 text-muted-foreground ring-1 ring-inset ring-border/60">
              {t.icon}
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span
              className={cn(
                "font-mono text-[22px] font-semibold tabular-nums tracking-tight",
                t.tone === "pos" && "text-emerald-600",
                t.tone === "neg" && "text-rose-600",
                (!t.tone || t.tone === "neutral") && "text-foreground"
              )}
            >
              {loading && !stats ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                t.value
              )}
            </span>
            {t.tone === "pos" && stats && (
              <ArrowUpRight className="h-4 w-4 text-emerald-500" />
            )}
            {t.tone === "neg" && stats && (
              <ArrowDownRight className="h-4 w-4 text-rose-500" />
            )}
          </div>
          {t.sub && (
            <div className="mt-1 text-[11px] text-muted-foreground">
              {t.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
