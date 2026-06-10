"use client";

import * as React from "react";
import { Label, Pie, PieChart, Sector } from "recharts";
import type { PieSectorDataItem } from "recharts/types/polar/Pie";

const PieAny = Pie as unknown as React.ComponentType<Record<string, unknown>>;
import { ArrowLeft, Loader2, PieChart as PieIcon, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrbitingDots } from "@/components/ui/orbiting-dots";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { cn, normKey } from "@/lib/utils";
import type { LiveValidationDataset } from "@/lib/data/live-validation";

const REFRESH_MS = 60_000;

const PALETTE = [
  "hsl(238 72% 58%)",
  "hsl(158 64% 42%)",
  "hsl(38 92% 50%)",
  "hsl(0 82% 58%)",
  "hsl(262 70% 60%)",
  "hsl(189 88% 44%)",
  "hsl(24 94% 54%)",
  "hsl(84 68% 46%)",
  "hsl(327 80% 62%)",
  "hsl(172 72% 40%)",
  "hsl(276 74% 62%)",
  "hsl(48 94% 52%)",
];

interface Datum {
  key: string;
  label: string;
  count: number;
  fill: string;
}

type ModelFilter = "all" | "M7" | "M7.1";

export function SectorRotation() {
  const [dataset, setDataset] = React.useState<LiveValidationDataset | null>(
    null
  );
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [activeKey, setActiveKey] = React.useState<string | null>(null);
  const [modelFilter, setModelFilter] = React.useState<ModelFilter>("all");
  const [openSector, setOpenSector] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/live-validation", { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const ds = (await res.json()) as LiveValidationDataset;
      setDataset(ds);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const { data, config } = React.useMemo<{
    data: Datum[];
    config: ChartConfig;
  }>(() => {
    if (!dataset) return { data: [], config: {} };
    const predictionCol =
      dataset.columns.find((c) => normKey(c) === "prediction") ?? null;
    const sectorCol =
      dataset.columns.find((c) => normKey(c) === "sector") ?? null;
    const modelCol =
      dataset.columns.find((c) => normKey(c) === "model") ?? null;

    const counts = new Map<string, number>();
    for (const r of dataset.rows) {
      const pred = predictionCol
        ? String(r[predictionCol] ?? "").trim().toLowerCase()
        : "";
      if (pred !== "buy" && pred !== "long") continue;
      if (modelFilter !== "all" && modelCol) {
        const m = String(r[modelCol] ?? "").trim();
        if (m !== modelFilter) continue;
      }
      const raw = sectorCol ? r[sectorCol] : null;
      const label =
        typeof raw === "string" && raw.trim() !== ""
          ? raw.trim()
          : "Unclassified";
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    const entries = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    const cfg: ChartConfig = { count: { label: "Buys" } };
    const next: Datum[] = entries.map(([label, count], i) => {
      const key = `sector-${i}`;
      const color = PALETTE[i % PALETTE.length];
      cfg[key] = { label, color };
      return { key, label, count, fill: color };
    });
    return { data: next, config: cfg };
  }, [dataset, modelFilter]);

  React.useEffect(() => {
    setActiveKey(data[0]?.key ?? null);
  }, [data]);

  React.useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const total = React.useMemo(
    () => (data ?? []).reduce((a, b) => a + b.count, 0),
    [data]
  );
  const active = React.useMemo(
    () => (data ?? []).find((d) => d.key === activeKey) ?? null,
    [data, activeKey]
  );
  const activeIndex = React.useMemo(
    () => (data ?? []).findIndex((d) => d.key === activeKey),
    [data, activeKey]
  );

  const sectorTickers = React.useMemo(() => {
    if (!dataset || !openSector) return [];
    const predictionCol =
      dataset.columns.find((c) => normKey(c) === "prediction") ?? null;
    const sectorCol =
      dataset.columns.find((c) => normKey(c) === "sector") ?? null;
    const modelCol =
      dataset.columns.find((c) => normKey(c) === "model") ?? null;
    const out: {
      ticker: string;
      entry: number | null;
      current: number | null;
      pct: number | null;
      model: string;
    }[] = [];
    for (const r of dataset.rows) {
      const pred = predictionCol
        ? String(r[predictionCol] ?? "").trim().toLowerCase()
        : "";
      if (pred !== "buy" && pred !== "long") continue;
      if (modelFilter !== "all" && modelCol) {
        const m = String(r[modelCol] ?? "").trim();
        if (m !== modelFilter) continue;
      }
      const raw = sectorCol ? r[sectorCol] : null;
      const label =
        typeof raw === "string" && raw.trim() !== ""
          ? raw.trim()
          : "Unclassified";
      if (label !== openSector) continue;
      const toNum = (v: unknown) => {
        if (typeof v === "number" && Number.isFinite(v)) return v;
        if (typeof v === "string") {
          const n = Number(v.replace(/[,%]/g, ""));
          return Number.isFinite(n) ? n : null;
        }
        return null;
      };
      out.push({
        ticker: String(r["Ticker"] ?? "—"),
        entry: toNum(r["Entry Price"]),
        current: toNum(r["Current Price"]),
        pct: toNum(r["% Current PL"]),
        model: modelCol ? String(r[modelCol] ?? "") : "",
      });
    }
    return out;
  }, [dataset, openSector, modelFilter]);

  const sectorFill = React.useMemo(() => {
    if (!openSector) return "hsl(var(--muted-foreground))";
    return (
      data.find((d) => d.label === openSector)?.fill ?? "hsl(var(--muted-foreground))"
    );
  }, [openSector, data]);

  const flipped = openSector !== null;

  return (
    <div className="h-[260px] w-[420px] [perspective:1400px]">
      <div
        className={cn(
          "grid h-full w-full grid-cols-1 grid-rows-1 transition-transform duration-500 ease-out [transform-style:preserve-3d]",
          flipped && "[transform:rotateY(180deg)]"
        )}
      >
      <Card className="col-start-1 row-start-1 flex h-full w-full flex-col overflow-hidden [backface-visibility:hidden]">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="flex items-center gap-2 text-[13px]">
            <PieIcon className="h-3.5 w-3.5 text-muted-foreground" />
            Sector rotation · Buys
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-md border border-border/70 bg-muted/40 p-[2px]">
              {(["all", "M7", "M7.1"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setModelFilter(opt)}
                  className={cn(
                    "rounded-[5px] px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-[0.04em] transition-all",
                    modelFilter === opt
                      ? "bg-card text-foreground shadow-sm ring-1 ring-border/60"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {opt === "all" ? "All" : opt}
                </button>
              ))}
            </div>
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
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {loading && data.length === 0 && (
            <div className="flex h-[180px] items-center justify-center">
              <OrbitingDots />
            </div>
          )}
          {err && <p className="text-[11px] text-destructive">{err}</p>}
          {!err && !loading && data.length === 0 && (
            <p className="text-[11.5px] text-muted-foreground">
              No buy predictions for this filter.
            </p>
          )}
          {data && data.length > 0 && (
            <div className="flex items-start gap-4">
              <ChartContainer
                config={config}
                className="mx-0 aspect-square h-[180px] w-[180px] shrink-0"
              >
                <PieChart>
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent hideLabel nameKey="label" />
                    }
                  />
                  <PieAny
                    data={data}
                    dataKey="count"
                    nameKey="label"
                    innerRadius={52}
                    outerRadius={78}
                    strokeWidth={2}
                    stroke="hsl(var(--background, 0 0% 100%))"
                    isAnimationActive={true}
                    animationBegin={0}
                    animationDuration={500}
                    animationEasing="ease-out"
                    activeIndex={activeIndex >= 0 ? activeIndex : undefined}
                    activeShape={({
                      outerRadius = 0,
                      ...props
                    }: PieSectorDataItem) => (
                      <g>
                        <Sector {...props} outerRadius={outerRadius + 5} />
                        <Sector
                          {...props}
                          outerRadius={outerRadius + 9}
                          innerRadius={outerRadius + 6}
                          opacity={0.35}
                        />
                      </g>
                    )}
                    onMouseEnter={(_: unknown, index: number) => {
                      const d = data[index];
                      if (d) setActiveKey(d.key);
                    }}
                  >
                    <Label
                      content={({ viewBox }) => {
                        if (
                          !viewBox ||
                          !("cx" in viewBox) ||
                          !("cy" in viewBox)
                        )
                          return null;
                        const display = active ?? { count: total, label: "Buys" };
                        return (
                          <text
                            x={viewBox.cx}
                            y={viewBox.cy}
                            textAnchor="middle"
                            dominantBaseline="middle"
                          >
                            <tspan
                              x={viewBox.cx}
                              y={viewBox.cy}
                              className="fill-foreground text-[17px] font-semibold"
                            >
                              {display.count.toLocaleString()}
                            </tspan>
                            <tspan
                              x={viewBox.cx}
                              y={(viewBox.cy ?? 0) + 14}
                              className="fill-muted-foreground text-[8.5px] uppercase tracking-[0.06em]"
                            >
                              {truncate(display.label, 18)}
                            </tspan>
                          </text>
                        );
                      }}
                    />
                  </PieAny>
                </PieChart>
              </ChartContainer>

              <ul className="flex min-w-0 flex-1 flex-col gap-1 pt-1">
                {data.slice(0, 7).map((d) => {
                  const isActive = d.key === activeKey;
                  const pct = total === 0 ? 0 : (d.count / total) * 100;
                  return (
                    <li
                      key={d.key}
                      onMouseEnter={() => setActiveKey(d.key)}
                      onClick={() => setOpenSector(d.label)}
                      className={cn(
                        "flex cursor-pointer items-center justify-between gap-2 rounded-md px-1.5 py-0.5 text-[10px] transition-colors",
                        isActive ? "bg-accent/60" : "hover:bg-accent/30"
                      )}
                      title={`View ${d.label} tickers`}
                    >
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-sm"
                          style={{ backgroundColor: d.fill }}
                        />
                        <span className="truncate text-foreground/90">
                          {d.label}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5 font-mono tabular-nums text-muted-foreground">
                        <span>{d.count}</span>
                        <span className="text-[9px] text-muted-foreground/70">
                          {pct.toFixed(0)}%
                        </span>
                      </div>
                    </li>
                  );
                })}
                {data.length > 7 && (
                  <li className="pt-0.5 text-[10px] text-muted-foreground">
                    +{data.length - 7} more
                  </li>
                )}
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
              title="Back to sector rotation"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
            <span
              className="h-2 w-2 shrink-0 rounded-sm"
              style={{ backgroundColor: sectorFill }}
            />
            <span className="truncate">{openSector ?? ""}</span>
          </CardTitle>
          <span className="shrink-0 rounded-full bg-muted/70 px-2 py-0.5 font-mono text-[10px] text-muted-foreground ring-1 ring-inset ring-border/60">
            {sectorTickers.length}
          </span>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-y-auto pt-0">
          {sectorTickers.length === 0 ? (
            <p className="text-[11.5px] text-muted-foreground">
              No tickers in this sector.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-border-soft pb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                <span>Ticker</span>
                <div className="flex items-center gap-3 font-mono">
                  <span className="min-w-[44px] text-right">Entry</span>
                  <span className="min-w-[44px] text-right">Now</span>
                  <span className="min-w-[54px] text-right">% PL</span>
                </div>
              </div>
              <ul className="flex flex-col divide-y divide-border-soft">
                {sectorTickers.map((t, i) => {
                  const pos = t.pct === null ? null : t.pct >= 0;
                  return (
                    <li
                      key={`${t.ticker}-${i}`}
                      className="flex items-center justify-between gap-3 py-1.5 text-[11.5px]"
                    >
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate font-mono font-semibold text-foreground">
                          {t.ticker}
                        </span>
                        {t.model && (
                          <span className="shrink-0 rounded bg-brand-soft/60 px-1 py-[1px] font-mono text-[9px] font-semibold text-foreground/80 ring-1 ring-inset ring-brand/20">
                            {t.model}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 font-mono tabular-nums">
                        <span className="min-w-[44px] text-right text-muted-foreground">
                          {t.entry !== null ? t.entry : "—"}
                        </span>
                        <span className="min-w-[44px] text-right text-muted-foreground">
                          {t.current !== null ? t.current : "—"}
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
                          {t.pct === null
                            ? "—"
                            : `${t.pct > 0 ? "+" : ""}${t.pct.toFixed(2)}%`}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}
