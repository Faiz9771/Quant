import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export const NIFTY50_SYMBOL = "^NSEI";
export const FAST_EMA_PERIOD = 9;
export const SLOW_EMA_PERIOD = 25;

export type EmaPeriod = 9 | 25;

export interface MarketConditionSnapshot {
  symbol: string;
  interval: "1wk";
  asOf: string; // requested date (YYYY-MM-DD)
  barDate: string; // weekly bar date whose close is used (≤ asOf)
  close: number;
  ema9: number;
  ema25: number;
  /** EMA period used to decide the condition. */
  emaPeriod: EmaPeriod;
  condition: "UP" | "DOWN";
}

function fmtDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** Standard EMA on close prices: SMA seed for first `period` values, then recursive. */
export function computeEma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let ema = sum / period;
  out[period - 1] = ema;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}

/**
 * For a given date, compute 9- and 25-period EMAs on Nifty50 WEEKLY closes
 * up to and including the weekly bar covering that date. Market is UP if
 * the weekly close is greater than the chosen EMA (9 or 25), else DOWN.
 */
export async function fetchMarketConditionOn(
  dateIso: string,
  emaPeriod: EmaPeriod = 9
): Promise<MarketConditionSnapshot | null> {
  if (!dateIso) throw new Error("date is required (YYYY-MM-DD)");
  const asOf = new Date(dateIso + "T00:00:00Z");
  if (!Number.isFinite(asOf.getTime())) throw new Error("invalid date");

  // Pad lookback so EMA25 is well seeded on weekly candles (~2 years).
  const lookback = new Date(asOf);
  lookback.setUTCDate(lookback.getUTCDate() - 800);
  // Advance end by 1 day so Yahoo includes the asOf bar.
  const endExclusive = new Date(asOf);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

  const result = await yahooFinance.chart(NIFTY50_SYMBOL, {
    period1: fmtDate(lookback),
    period2: fmtDate(endExclusive),
    interval: "1wk",
  });

  const bars = (result.quotes ?? [])
    .filter(
      (q) =>
        q &&
        q.date &&
        typeof q.close === "number" &&
        Number.isFinite(q.close)
    )
    .map((q) => ({
      date: q.date instanceof Date ? fmtDate(q.date) : String(q.date),
      close: q.close as number,
    }))
    .filter((b) => b.date <= dateIso);

  if (bars.length === 0) return null;

  const closes = bars.map((b) => b.close);
  const ema9 = computeEma(closes, FAST_EMA_PERIOD);
  const ema25 = computeEma(closes, SLOW_EMA_PERIOD);
  const i = bars.length - 1;
  const e9 = ema9[i];
  const e25 = ema25[i];
  if (e9 === null || e25 === null) return null;

  const close = bars[i].close;
  const ref = emaPeriod === 9 ? e9 : e25;
  return {
    symbol: NIFTY50_SYMBOL,
    interval: "1wk",
    asOf: dateIso,
    barDate: bars[i].date,
    close: Number(close.toFixed(2)),
    ema9: Number(e9.toFixed(2)),
    ema25: Number(e25.toFixed(2)),
    emaPeriod,
    condition: close > ref ? "UP" : "DOWN",
  };
}
