import YahooFinance from "yahoo-finance2";
import {
  getUniverseConstituents,
  type NiftyUniverseId,
  type NiftyUniversePayload,
} from "@/lib/data/nifty-universes";

const MAX_EVENTS = 1000;
const CONCURRENCY = 4;
const BREAKOUT_FACTOR = 0.4;
const EXCHANGE_TIMEZONE = "Asia/Kolkata";
const yahooFinance = new YahooFinance();

export type VolatilityBreakoutEvent =
  | {
      kind: "system";
      ts: number;
      message: string;
    }
  | {
      kind: "universe";
      ts: number;
      universe: NiftyUniverseId;
      label: string;
      count: number;
      fetchedAt: string;
    }
  | {
      kind: "started";
      ts: number;
      universe: NiftyUniverseId;
      label: string;
      totalTickers: number;
    }
  | {
      kind: "progress";
      ts: number;
      completed: number;
      total: number;
      ticker: string;
    }
  | {
      kind: "match";
      ts: number;
      ticker: string;
      direction: "LONG" | "SHORT";
      signalDate: string;
      breakoutAt: string;
      breakoutLevel: number;
      trueRange: number;
    }
  | {
      kind: "completed";
      ts: number;
      matches: number;
      scanned: number;
      totalTickers: number;
    }
  | {
      kind: "error";
      ts: number;
      message: string;
    };

export interface VolatilityBreakoutJobState {
  running: boolean;
  startedAt: number | null;
  endedAt: number | null;
  exitCode: number | null;
  universe: NiftyUniverseId | null;
  universeLabel: string | null;
  totalTickers: number;
  scanned: number;
  matches: number;
  refreshUniverse: boolean;
}

export interface VolatilityBreakoutResultRow {
  ticker: string;
  companyName: string;
  industry: string;
  universe: NiftyUniverseId;
  universeLabel: string;
  signalDate: string;
  direction: "LONG" | "SHORT";
  breakoutAt: string;
  openPrice: number;
  breakoutLevel: number;
  buyLevel: number;
  shortLevel: number;
  trueRange: number;
  atr14: number | null;
  stopPrice: number | null;
  stopPct: number | null;
  targetPrice: number | null;
  targetPct: number | null;
  trComponent: number;
  prevClose: number;
  yesterdayHigh: number;
  yesterdayLow: number;
  livePrice: number | null;
  livePriceUpdatedAt: string | null;
}

export interface VolatilityBreakoutRunArgs {
  universe: NiftyUniverseId;
  refreshUniverse?: boolean;
}

interface ScanContext {
  universe: NiftyUniversePayload;
  constituent: NiftyUniversePayload["constituents"][number];
}

interface ScanMatch {
  ticker: string;
  companyName: string;
  industry: string;
  universe: NiftyUniverseId;
  universeLabel: string;
  signalDate: string;
  direction: "LONG" | "SHORT";
  breakoutAt: string;
  openPrice: number;
  breakoutLevel: number;
  buyLevel: number;
  shortLevel: number;
  trueRange: number;
  atr14: number | null;
  stopPrice: number | null;
  stopPct: number | null;
  targetPrice: number | null;
  targetPct: number | null;
  trComponent: number;
  prevClose: number;
  yesterdayHigh: number;
  yesterdayLow: number;
  livePrice: number | null;
  livePriceUpdatedAt: string | null;
}

interface QuoteRow {
  date: Date;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume?: number | null;
}

interface NormalizedQuoteRow {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
}

function dateKey(date: Date): string {
  return date.toLocaleDateString("en-CA", {
    timeZone: EXCHANGE_TIMEZONE,
  });
}

function formatTs(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: EXCHANGE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(date)
    .replace(",", "");
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function deriveAtrRiskFields(row: Partial<VolatilityBreakoutResultRow>) {
  const atr14 = isFiniteNumber(row.atr14) ? row.atr14 : null;
  const breakoutLevel = isFiniteNumber(row.breakoutLevel) ? row.breakoutLevel : null;
  const direction = row.direction;

  if (atr14 === null || breakoutLevel === null || !direction) {
    return {
      atr14: atr14 ?? null,
      stopPrice: null,
      stopPct: null,
      targetPrice: null,
      targetPct: null,
    };
  }

  const stopPrice =
    direction === "LONG"
      ? breakoutLevel - atr14
      : breakoutLevel + atr14;
  const targetPrice =
    direction === "LONG"
      ? breakoutLevel + atr14 * 2
      : breakoutLevel - atr14 * 2;
  const stopPct = (Math.abs(breakoutLevel - stopPrice) / breakoutLevel) * 100;
  const targetPct = (Math.abs(targetPrice - breakoutLevel) / breakoutLevel) * 100;

  return {
    atr14: round2(atr14),
    stopPrice: round2(stopPrice),
    stopPct: round2(stopPct),
    targetPrice: round2(targetPrice),
    targetPct: round2(targetPct),
  };
}

function normalizeQuoteRow(row: QuoteRow): NormalizedQuoteRow | null {
  if (
    !isFiniteNumber(row.open) ||
    !isFiniteNumber(row.high) ||
    !isFiniteNumber(row.low) ||
    !isFiniteNumber(row.close)
  ) {
    return null;
  }
  return {
    date: row.date,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume,
  };
}

async function runPool(
  items: ScanContext[],
  worker: (item: ScanContext) => Promise<void>
): Promise<void> {
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const current = items[nextIndex++];
      await worker(current);
    }
  }

  const workers = Array.from(
    { length: Math.min(CONCURRENCY, items.length) },
    () => runWorker()
  );
  await Promise.all(workers);
}

class VolatilityBreakoutRunner {
  private events: VolatilityBreakoutEvent[] = [];
  private results: VolatilityBreakoutResultRow[] = [];
  private state: VolatilityBreakoutJobState = {
    running: false,
    startedAt: null,
    endedAt: null,
    exitCode: null,
    universe: null,
    universeLabel: null,
    totalTickers: 0,
    scanned: 0,
    matches: 0,
    refreshUniverse: false,
  };
  private abortRequested = false;

  getState(): VolatilityBreakoutJobState {
    return { ...this.state };
  }

  getEvents(): VolatilityBreakoutEvent[] {
    return [...this.events];
  }

  getResults(): { rows: VolatilityBreakoutResultRow[]; updatedAt: string | null } {
    return {
      rows: this.results.map((row) => ({
        ...row,
        ...deriveAtrRiskFields(row),
      })),
      updatedAt:
        this.state.endedAt === null ? null : new Date(this.state.endedAt).toISOString(),
    };
  }

  private push(event: VolatilityBreakoutEvent) {
    this.events.push(event);
    if (this.events.length > MAX_EVENTS) {
      this.events.splice(0, this.events.length - MAX_EVENTS);
    }
  }

  private system(message: string) {
    this.push({ kind: "system", ts: Date.now(), message });
  }

  start(args: VolatilityBreakoutRunArgs): VolatilityBreakoutJobState {
    if (this.state.running) return this.getState();

    this.abortRequested = false;
    this.events = [];
    this.results = [];
    this.state = {
      running: true,
      startedAt: Date.now(),
      endedAt: null,
      exitCode: null,
      universe: args.universe,
      universeLabel: null,
      totalTickers: 0,
      scanned: 0,
      matches: 0,
      refreshUniverse: args.refreshUniverse === true,
    };

    this.system(
      `Launching Volatility Breakout scan for ${args.universe}${args.refreshUniverse ? " with universe refresh" : ""}.`
    );

    void this.run(args);
    return this.getState();
  }

  stop(): boolean {
    if (!this.state.running) return false;
    this.abortRequested = true;
    this.system("Stop requested. Finishing in-flight symbols before exiting.");
    return true;
  }

  private async run(args: VolatilityBreakoutRunArgs) {
    try {
      const universe = await getUniverseConstituents(args.universe, {
        forceRefresh: args.refreshUniverse === true,
      });

      this.state.universeLabel = universe.label;
      this.state.totalTickers = universe.count;
      this.push({
        kind: "universe",
        ts: Date.now(),
        universe: universe.universe,
        label: universe.label,
        count: universe.count,
        fetchedAt: universe.fetchedAt,
      });
      this.push({
        kind: "started",
        ts: Date.now(),
        universe: universe.universe,
        label: universe.label,
        totalTickers: universe.count,
      });

      const items = universe.constituents.map((constituent) => ({
        universe,
        constituent,
      }));

      await runPool(items, async (item) => {
        if (this.abortRequested) return;
        await this.scanTicker(item);
      });

      this.state.running = false;
      this.state.endedAt = Date.now();
      this.state.exitCode = this.abortRequested ? 130 : 0;
      this.push({
        kind: "completed",
        ts: Date.now(),
        matches: this.state.matches,
        scanned: this.state.scanned,
        totalTickers: this.state.totalTickers,
      });
      this.system(
        this.abortRequested
          ? `Stopped after scanning ${this.state.scanned} of ${this.state.totalTickers} symbols.`
          : `Completed ${this.state.scanned} symbols with ${this.state.matches} breakout match${this.state.matches === 1 ? "" : "es"}.`
      );
    } catch (error) {
      this.state.running = false;
      this.state.endedAt = Date.now();
      this.state.exitCode = 1;
      this.push({
        kind: "error",
        ts: Date.now(),
        message: (error as Error).message,
      });
    }
  }

  private async scanTicker({ universe, constituent }: ScanContext) {
    const ticker = `${constituent.symbol}.NS`;

    try {
      const daily = await yahooFinance.chart(ticker, {
        period1: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
        interval: "1d",
      });
      const intraday = await yahooFinance.chart(ticker, {
        period1: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        interval: "5m",
      });

      const match = this.computeSignal({
        universe,
        constituent,
        dailyQuotes: daily.quotes
          .map(normalizeQuoteRow)
          .filter((row): row is NormalizedQuoteRow => row !== null),
        intradayQuotes: intraday.quotes
          .map(normalizeQuoteRow)
          .filter((row): row is NormalizedQuoteRow => row !== null),
      });

      if (match) {
        const row: VolatilityBreakoutResultRow = { ...match };
        this.results.push(row);
        this.state.matches += 1;
        this.push({
          kind: "match",
          ts: Date.now(),
          ticker: row.ticker,
          direction: row.direction,
          signalDate: row.signalDate,
          breakoutAt: row.breakoutAt,
          breakoutLevel: row.breakoutLevel,
          trueRange: row.trueRange,
        });
      }
    } catch (error) {
      this.push({
        kind: "error",
        ts: Date.now(),
        message: `${ticker}: ${(error as Error).message}`,
      });
    } finally {
      this.state.scanned += 1;
      if (
        this.state.scanned <= 5 ||
        this.state.scanned === this.state.totalTickers ||
        this.state.scanned % 10 === 0
      ) {
        this.push({
          kind: "progress",
          ts: Date.now(),
          completed: this.state.scanned,
          total: this.state.totalTickers,
          ticker,
        });
      }
    }
  }

  private computeSignal(args: {
    universe: NiftyUniversePayload;
    constituent: NiftyUniversePayload["constituents"][number];
    dailyQuotes: NormalizedQuoteRow[];
    intradayQuotes: NormalizedQuoteRow[];
  }): ScanMatch | null {
    const today = dateKey(new Date());

    const dailyQuotes = [...args.dailyQuotes].sort(
      (a, b) => a.date.getTime() - b.date.getTime()
    );
    const intradayQuotes = [...args.intradayQuotes]
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .filter((row) => dateKey(row.date) === today);

    const todayDailyBars = dailyQuotes.filter((row) => dateKey(row.date) === today);
    const priorDailyBars = dailyQuotes.filter((row) => dateKey(row.date) < today);
    if (
      intradayQuotes.length === 0 ||
      todayDailyBars.length === 0 ||
      priorDailyBars.length < 15
    ) {
      return null;
    }

    const yesterday = priorDailyBars[priorDailyBars.length - 1];
    const prevDay = priorDailyBars[priorDailyBars.length - 2];
    const todayOpen = intradayQuotes[0]?.open ?? todayDailyBars[0]?.open;
    if (!isFiniteNumber(todayOpen)) return null;

    const range = yesterday.high - yesterday.low;
    const highGap = Math.abs(yesterday.high - prevDay.close);
    const lowGap = Math.abs(yesterday.low - prevDay.close);
    const trueRange = Math.max(range, highGap, lowGap);
    const trComponent = trueRange * BREAKOUT_FACTOR;
    const buyLevel = todayOpen + trComponent;
    const shortLevel = todayOpen - trComponent;
    const atrWindow = priorDailyBars.slice(-15);
    const atrTrValues = atrWindow.slice(1).map((bar, index) => {
      const priorClose = atrWindow[index].close;
      return Math.max(
        bar.high - bar.low,
        Math.abs(bar.high - priorClose),
        Math.abs(bar.low - priorClose)
      );
    });
    const atr14 =
      atrTrValues.reduce((sum, value) => sum + value, 0) / atrTrValues.length;

    let firstBreakout:
      | { direction: "LONG" | "SHORT"; at: string; level: number }
      | null = null;

    for (const bar of intradayQuotes) {
      const hitLong = bar.high >= buyLevel;
      const hitShort = bar.low <= shortLevel;
      if (hitLong && hitShort) {
        return null;
      }
      if (hitLong) {
        firstBreakout = {
          direction: "LONG",
          at: formatTs(bar.date),
          level: buyLevel,
        };
        break;
      }
      if (hitShort) {
        firstBreakout = {
          direction: "SHORT",
          at: formatTs(bar.date),
          level: shortLevel,
        };
        break;
      }
    }

    if (!firstBreakout) return null;

    const stopPrice =
      firstBreakout.direction === "LONG"
        ? firstBreakout.level - atr14
        : firstBreakout.level + atr14;
    const targetPrice =
      firstBreakout.direction === "LONG"
        ? firstBreakout.level + atr14 * 2
        : firstBreakout.level - atr14 * 2;
    const stopPct = (Math.abs(firstBreakout.level - stopPrice) / firstBreakout.level) * 100;
    const targetPct =
      (Math.abs(targetPrice - firstBreakout.level) / firstBreakout.level) * 100;

    return {
      ticker: `${args.constituent.symbol}.NS`,
      companyName: args.constituent.companyName,
      industry: args.constituent.industry,
      universe: args.universe.universe,
      universeLabel: args.universe.label,
      signalDate: today,
      direction: firstBreakout.direction,
      breakoutAt: firstBreakout.at,
      breakoutLevel: firstBreakout.level,
      openPrice: todayOpen,
      buyLevel: round2(buyLevel),
      shortLevel: round2(shortLevel),
      trueRange: round2(trueRange),
      atr14: round2(atr14),
      stopPrice: round2(stopPrice),
      stopPct: round2(stopPct),
      targetPrice: round2(targetPrice),
      targetPct: round2(targetPct),
      trComponent: round2(trComponent),
      prevClose: prevDay.close,
      yesterdayHigh: yesterday.high,
      yesterdayLow: yesterday.low,
      livePrice: null,
      livePriceUpdatedAt: null,
    };
  }

  async refreshLivePrices(): Promise<{
    updated: number;
    updatedAt: string;
    prices: Record<string, number | null>;
  }> {
    const tickers = Array.from(new Set(this.results.map((row) => row.ticker)));
    const updatedAt = new Date().toISOString();
    if (tickers.length === 0) {
      return { updated: 0, updatedAt, prices: {} };
    }

    const quotes = await yahooFinance.quote(tickers);
    const list = Array.isArray(quotes) ? quotes : [quotes];
    const byTicker = new Map<string, number | null>();

    for (const quote of list) {
      if (!quote?.symbol) continue;
      byTicker.set(
        quote.symbol,
        typeof quote.regularMarketPrice === "number"
          ? quote.regularMarketPrice
          : null
      );
    }

    const prices: Record<string, number | null> = {};
    let updated = 0;
    this.results = this.results.map((row) => {
      const livePrice = byTicker.get(row.ticker) ?? null;
      prices[row.ticker] = livePrice;
      updated += 1;
      return {
        ...row,
        livePrice,
        livePriceUpdatedAt: updatedAt,
      };
    });

    this.system(`Refreshed live prices for ${updated} result row${updated === 1 ? "" : "s"}.`);

    return {
      updated,
      updatedAt,
      prices,
    };
  }
}

declare global {
  var __prism_volatility_breakout_runner_v1__:
    | VolatilityBreakoutRunner
    | undefined;
}

export function getVolatilityBreakoutRunner(): VolatilityBreakoutRunner {
  let runner = globalThis.__prism_volatility_breakout_runner_v1__;
  if (!runner || typeof runner.refreshLivePrices !== "function") {
    globalThis.__prism_volatility_breakout_runner_v1__ =
      new VolatilityBreakoutRunner();
    runner = globalThis.__prism_volatility_breakout_runner_v1__;
  }
  return runner;
}
