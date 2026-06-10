"use client";

import * as React from "react";
import { Gauge, Info, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type Zone = "Extreme Fear" | "Fear" | "Greed" | "Extreme Greed";

interface Snapshot {
  value: number;
  zone: Zone;
  asOf: string;
  fetchedAt: string;
}

const ZONE_STYLE: Record<Zone, string> = {
  "Extreme Fear": "bg-rose-500/10 text-rose-600 ring-rose-500/30",
  Fear: "bg-amber-500/10 text-amber-600 ring-amber-500/30",
  Greed: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/30",
  "Extreme Greed": "bg-emerald-600/15 text-emerald-700 ring-emerald-600/40",
};

const ZONE_DOT: Record<Zone, string> = {
  "Extreme Fear": "bg-rose-600",
  Fear: "bg-amber-500",
  Greed: "bg-emerald-500",
  "Extreme Greed": "bg-emerald-700",
};

const ZONE_INFO: { name: Zone; range: string; text: string; text2: string }[] = [
  {
    name: "Extreme Fear",
    range: "below 30",
    text: "Investors are very worried.",
    text2: "Historically a buying window.",
  },
  {
    name: "Fear",
    range: "30 – 50",
    text: "Cautious sentiment.",
    text2: "Market may be oversold.",
  },
  {
    name: "Greed",
    range: "50 – 70",
    text: "Optimism building.",
    text2: "Market may be heating up.",
  },
  {
    name: "Extreme Greed",
    range: "above 70",
    text: "Very bullish sentiment.",
    text2: "Historically a signal to book profits.",
  },
];

export function MarketMoodPill() {
  const [snap, setSnap] = React.useState<Snapshot | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [showInfo, setShowInfo] = React.useState(false);
  const popRef = React.useRef<HTMLDivElement | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/library/market-mood", {
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
    load();
  }, [load]);

  React.useEffect(() => {
    if (!showInfo) return;
    function onDown(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setShowInfo(false);
      }
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [showInfo]);

  const zoneStyle = snap
    ? ZONE_STYLE[snap.zone]
    : "bg-muted text-muted-foreground ring-border";

  return (
    <div className="relative flex flex-col items-end gap-1">
      <span className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        MMI · Market Mood Index
      </span>
      <div
        className={cn(
          "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11.5px] ring-1 ring-inset",
          zoneStyle
        )}
        title={
          snap
            ? `As of ${snap.asOf} · updated ${new Date(snap.fetchedAt).toLocaleTimeString()}`
            : undefined
        }
      >
        <Gauge className="h-3.5 w-3.5 opacity-70" />
        <span className="font-medium uppercase tracking-[0.06em]">
          Market zone
        </span>
        {loading && !snap ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : err ? (
          <span className="text-muted-foreground">—</span>
        ) : snap ? (
          <>
            <span className="font-semibold">{snap.zone}</span>
            <span className="font-mono text-muted-foreground">
              {snap.value.toFixed(1)}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
        <button
          type="button"
          onClick={load}
          disabled={loading}
          aria-label="Refresh market zone"
          className="ml-0.5 rounded-full p-0.5 text-current opacity-70 transition hover:bg-foreground/5 hover:opacity-100 disabled:opacity-40"
        >
          <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
        </button>
        <button
          type="button"
          onClick={() => setShowInfo((v) => !v)}
          aria-label="Zone definitions"
          className={cn(
            "rounded-full p-0.5 text-current opacity-70 transition hover:bg-foreground/5 hover:opacity-100",
            showInfo && "opacity-100"
          )}
        >
          <Info className="h-3 w-3" />
        </button>
      </div>

      {showInfo && (
        <div
          ref={popRef}
          className="absolute right-0 top-full z-50 mt-1.5 w-[280px] rounded-md border border-border bg-card p-3 text-[11px] leading-relaxed text-foreground shadow-lg"
        >
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Market Mood zones (0 – 100)
          </div>
          <div className="flex flex-col gap-1.5">
            {ZONE_INFO.map((z) => (
              <div key={z.name} className="flex items-start gap-2">
                <span
                  className={cn(
                    "mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                    ZONE_DOT[z.name]
                  )}
                />
                <div className="flex-1">
                  <div>
                    <span className="font-semibold">{z.name}</span>
                    <span className="text-muted-foreground">
                      {" · "}
                      {z.range}
                    </span>
                  </div>
                  <div className="text-muted-foreground">
                    {z.text} {z.text2}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 border-t border-border/60 pt-2 text-[10px] text-muted-foreground">
            Source: Tickertape Market Mood Index.
          </div>
        </div>
      )}
    </div>
  );
}
