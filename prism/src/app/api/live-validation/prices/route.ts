import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import {
  applyPricesByTicker,
  applySectorsByTicker,
  loadDataset,
  tickersMissingSector,
} from "@/lib/data/live-validation-store";
import { resolveSectors } from "@/lib/data/ticker-sectors";
import type { SnapshotValue } from "@/lib/data/types";

export const dynamic = "force-dynamic";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

function toYahooSymbol(raw: string): string {
  const t = raw.trim().toUpperCase();
  if (!t) return t;
  // Already qualified (e.g. AAPL, RELIANCE.NS, TSLA.NS, FOO.BO) — leave alone.
  if (t.includes(".")) return t;
  // Default Indian equity suffix. Callers can override by including a dot.
  return `${t}.NS`;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const raw = url.searchParams.get("tickers") ?? "";
    const tickers = Array.from(
      new Set(
        raw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      )
    );
    if (tickers.length === 0) {
      return NextResponse.json({ prices: {} });
    }

    const symbolMap = new Map<string, string>();
    for (const t of tickers) symbolMap.set(t, toYahooSymbol(t));

    const symbols = Array.from(new Set(symbolMap.values()));
    const quotes = await yahooFinance.quote(symbols);
    const list = Array.isArray(quotes) ? quotes : [quotes];

    const bySymbol = new Map<string, number | null>();
    for (const q of list) {
      if (!q || !q.symbol) continue;
      const price =
        typeof q.regularMarketPrice === "number" ? q.regularMarketPrice : null;
      bySymbol.set(q.symbol, price);
    }

    const out: Record<string, number | null> = {};
    for (const [orig, sym] of symbolMap) {
      out[orig] = bySymbol.get(sym) ?? null;
    }

    return NextResponse.json({
      prices: out,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

/**
 * Refresh prices for all tickers in the store and persist them. Returns the
 * updated dataset in one round-trip.
 */
export async function POST() {
  try {
    const ds = await loadDataset();
    const tickers = Array.from(
      new Set(
        ds.rows
          .map((r) => r["Ticker"])
          .filter((v): v is string => typeof v === "string" && v.trim() !== "")
          .map((s) => s.trim().toUpperCase())
      )
    );
    if (tickers.length === 0) {
      return NextResponse.json({ updated: 0, prices: {}, dataset: ds });
    }

    const symbolMap = new Map<string, string>();
    for (const t of tickers) symbolMap.set(t, toYahooSymbol(t));

    const symbols = Array.from(new Set(symbolMap.values()));
    const quotes = await yahooFinance.quote(symbols);
    const list = Array.isArray(quotes) ? quotes : [quotes];

    const bySymbol = new Map<string, number | null>();
    for (const q of list) {
      if (!q || !q.symbol) continue;
      bySymbol.set(
        q.symbol,
        typeof q.regularMarketPrice === "number" ? q.regularMarketPrice : null
      );
    }

    const prices: Record<string, number | null> = {};
    for (const [orig, sym] of symbolMap) {
      prices[orig] = bySymbol.get(sym) ?? null;
    }

    const updated = await applyPricesByTicker(prices);

    // Fill Sector for any rows that don't yet have one.
    const missingSectorTickers = await tickersMissingSector();
    let sectorsUpdated = 0;
    if (missingSectorTickers.length > 0) {
      const sectors = await resolveSectors(missingSectorTickers);
      sectorsUpdated = await applySectorsByTicker(sectors);
    }

    const next = await loadDataset();

    // Silence unused import
    void (null as unknown as SnapshotValue);

    return NextResponse.json({
      updated,
      sectorsUpdated,
      prices,
      dataset: next,
      refreshedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
