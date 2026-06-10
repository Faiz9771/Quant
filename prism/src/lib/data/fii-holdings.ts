import "./_node-polyfills";
import { promises as fs } from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";
import { NSE_SECTOR_CONSTITUENTS } from "./nse-sector-constituents";

const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "en-US,en;q=0.9",
};

export interface ShareholdingSnapshot {
  quarter: string;
  promoter: number | null;
  fii: number | null;
  dii: number | null;
  government: number | null;
  publicAndOthers: number | null;
}

export interface StockHoldings {
  symbol: string;
  name: string | null;
  source: string;
  cachedAt?: string; // when this came from disk cache
  ageDays?: number;
  history: ShareholdingSnapshot[]; // most recent first
}

export interface SectorStockHolding {
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

export interface SectorHoldings {
  sector: string;
  asOf: string;
  stocks: SectorStockHolding[];
}

function pct(s: string): number | null {
  const n = Number(s.replace(/[,%\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function classifyRow(label: string): keyof ShareholdingSnapshot | null {
  const t = label.toLowerCase();
  if (t.includes("promoter")) return "promoter";
  if (t.startsWith("fii") || t.includes("foreign")) return "fii";
  if (t.startsWith("dii") || t.includes("domestic")) return "dii";
  if (t.includes("government")) return "government";
  if (t.includes("public")) return "publicAndOthers";
  return null;
}

// ---------- Source 1: Screener.in -----------------------------------------

async function fetchFromScreener(symbol: string): Promise<StockHoldings | null> {
  let html: string | null = null;
  for (const url of [
    `https://www.screener.in/company/${symbol}/consolidated/`,
    `https://www.screener.in/company/${symbol}/`,
  ]) {
    try {
      const r = await fetch(url, { headers: HEADERS, cache: "no-store" });
      if (r.ok) {
        html = await r.text();
        break;
      }
    } catch {
      // network/IP block — try next URL
    }
  }
  if (!html) return null;

  const $ = cheerio.load(html);
  const name =
    $("h1").first().text().trim() ||
    $("title").text().split("|")[0].trim() ||
    null;
  const $section = $("#quarterly-shp");
  if ($section.length === 0) return null;
  const $table = $section.find("table.data-table").first();
  const quarters: string[] = [];
  $table.find("thead th").each((i, el) => {
    if (i === 0) return;
    quarters.push($(el).text().trim());
  });
  const snapshots: ShareholdingSnapshot[] = quarters.map((q) => ({
    quarter: q,
    promoter: null,
    fii: null,
    dii: null,
    government: null,
    publicAndOthers: null,
  }));
  $table.find("tbody tr").each((_, tr) => {
    const $cells = $(tr).find("td");
    if ($cells.length === 0) return;
    const label = $cells.eq(0).text().replace(/\s+/g, " ").trim();
    const key = classifyRow(label);
    if (!key) return;
    for (let i = 1; i < $cells.length && i - 1 < snapshots.length; i++) {
      const v = pct($cells.eq(i).text());
      (snapshots[i - 1] as unknown as Record<string, number | null>)[key] = v;
    }
  });
  snapshots.reverse();
  if (snapshots.length === 0) return null;
  return { symbol, name, source: "screener.in", history: snapshots };
}

// ---------- Source 2: Tickertape ------------------------------------------

interface TickertapeSearchHit {
  ticker?: string;
  name?: string;
  sid?: string;
  match?: string;
}
interface TickertapeHolding {
  date: string;
  data: Record<string, number | null | undefined>;
}

async function tickertapeSidForSymbol(symbol: string): Promise<{
  sid: string;
  name: string | null;
  slug: string | null;
} | null> {
  try {
    const r = await fetch(
      `https://api.tickertape.in/search?text=${encodeURIComponent(
        symbol
      )}&types=stock&pageNumber=0`,
      { headers: HEADERS, cache: "no-store" }
    );
    if (!r.ok) return null;
    const j = (await r.json()) as {
      data?: { stocks?: (TickertapeSearchHit & { slug?: string })[] };
    };
    const stocks = j.data?.stocks ?? [];
    const upper = symbol.toUpperCase();
    const exact =
      stocks.find((s) => (s.ticker ?? "").toUpperCase() === upper) ??
      stocks[0];
    if (!exact?.sid) return null;
    return {
      sid: exact.sid,
      name: exact.name ?? null,
      slug: exact.slug ?? null,
    };
  } catch {
    return null;
  }
}

async function fetchFromTickertape(symbol: string): Promise<StockHoldings | null> {
  const meta = await tickertapeSidForSymbol(symbol);
  if (!meta) return null;
  const slugPath = meta.slug ?? `/stocks/${symbol.toLowerCase()}-${meta.sid}`;
  let html: string;
  try {
    const r = await fetch(`https://www.tickertape.in${slugPath}`, {
      headers: HEADERS,
      cache: "no-store",
    });
    if (!r.ok) return null;
    html = await r.text();
  } catch {
    return null;
  }
  const m = /<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]+?)<\/script>/.exec(html);
  if (!m) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(m[1]);
  } catch {
    return null;
  }
  const holdings = findHoldingsArray(parsed);
  if (!holdings || holdings.length === 0) return null;

  type DatedSnapshot = ShareholdingSnapshot & { date: string };
  const snapshots: DatedSnapshot[] = holdings
    .map((h): DatedSnapshot | null => {
      const d = h.data ?? {};
      const num = (k: string): number | null => {
        const v = d[k];
        return typeof v === "number" && Number.isFinite(v) ? v : null;
      };
      const fii = num("fiPctT") ?? num("fpiPctT");
      const dii = num("diPctT");
      const prom = num("pmPctT");
      const gov = num("govPctT");
      // Tickertape doesn't surface public% directly — derive as residual.
      const sum =
        (prom ?? 0) + (fii ?? 0) + (dii ?? 0) + (gov ?? 0);
      const pub = prom !== null && fii !== null && dii !== null
        ? Math.max(0, Math.round((100 - sum) * 100) / 100)
        : null;
      return {
        date: h.date,
        quarter: quarterFromIso(h.date),
        promoter: prom,
        fii,
        dii,
        government: gov,
        publicAndOthers: pub,
      };
    })
    .filter(
      (s): s is DatedSnapshot =>
        s !== null &&
        (s.promoter !== null ||
          s.fii !== null ||
          s.dii !== null ||
          s.publicAndOthers !== null)
    );

  // Newest first by actual ISO date.
  snapshots.sort(
    (a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  if (snapshots.length === 0) return null;
  const cleaned: ShareholdingSnapshot[] = snapshots.map((s) => ({
    quarter: s.quarter,
    promoter: s.promoter,
    fii: s.fii,
    dii: s.dii,
    government: s.government,
    publicAndOthers: s.publicAndOthers,
  }));
  return {
    symbol,
    name: meta.name,
    source: "tickertape.in",
    history: cleaned,
  };
}

function findHoldingsArray(node: unknown): TickertapeHolding[] | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findHoldingsArray(item);
      if (found) return found;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  for (const [k, v] of Object.entries(obj)) {
    if (k === "holdings" && Array.isArray(v)) {
      const arr = v as unknown[];
      const isHoldingArray = arr.every(
        (x) =>
          x !== null &&
          typeof x === "object" &&
          "date" in (x as Record<string, unknown>) &&
          "data" in (x as Record<string, unknown>)
      );
      if (isHoldingArray) return arr as TickertapeHolding[];
    }
    const found = findHoldingsArray(v);
    if (found) return found;
  }
  return null;
}

function quarterFromIso(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  const month = d.getUTCMonth() + 1;
  const map: Record<number, string> = { 3: "Mar", 6: "Jun", 9: "Sep", 12: "Dec" };
  const label = map[month] ?? d.toISOString().slice(0, 7);
  return `${label} ${d.getUTCFullYear()}`;
}

// ---------- Per-stock disk cache ------------------------------------------

interface CachedStock {
  cachedAt: string;
  data: StockHoldings;
}
interface StockCacheFile {
  version: 1;
  entries: Record<string, CachedStock>;
}

function stockCachePath(): string {
  return path.join(process.cwd(), "data", "fii-holdings-cache.json");
}

async function readStockCache(): Promise<StockCacheFile> {
  try {
    const text = await fs.readFile(stockCachePath(), "utf8");
    const parsed = JSON.parse(text) as StockCacheFile;
    if (parsed?.entries) return parsed;
  } catch {
    // no cache yet
  }
  return { version: 1, entries: {} };
}

async function writeStockCache(cache: StockCacheFile): Promise<void> {
  const p = stockCachePath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(cache, null, 2), "utf8");
}

function ageDays(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

// ---------- Public API ----------------------------------------------------

const FRESH_TTL_MS = 24 * 60 * 60 * 1000; // 24h cache hit window

export async function fetchStockHoldings(symbol: string): Promise<StockHoldings> {
  const sym = symbol.trim().toUpperCase();
  const cache = await readStockCache();
  const cached = cache.entries[sym];

  // Serve fresh cache without network call.
  if (cached && Date.now() - new Date(cached.cachedAt).getTime() < FRESH_TTL_MS) {
    return {
      ...cached.data,
      cachedAt: cached.cachedAt,
      ageDays: ageDays(cached.cachedAt),
    };
  }

  // Try sources in order.
  const sources: Array<(s: string) => Promise<StockHoldings | null>> = [
    fetchFromScreener,
    fetchFromTickertape,
  ];
  for (const src of sources) {
    try {
      const data = await src(sym);
      if (data) {
        cache.entries[sym] = { cachedAt: new Date().toISOString(), data };
        await writeStockCache(cache);
        return { ...data, cachedAt: cache.entries[sym].cachedAt, ageDays: 0 };
      }
    } catch {
      // try next source
    }
  }

  // All live sources failed — serve stale if we have any.
  if (cached) {
    return {
      ...cached.data,
      cachedAt: cached.cachedAt,
      ageDays: ageDays(cached.cachedAt),
    };
  }

  throw new Error(
    `Could not fetch shareholding for ${sym} from any source and no cache exists.`
  );
}

export function listSectors(): string[] {
  return Object.keys(NSE_SECTOR_CONSTITUENTS).sort();
}

export function listSectorTickers(sector: string): string[] {
  const key = Object.keys(NSE_SECTOR_CONSTITUENTS).find(
    (k) => k.toLowerCase() === sector.toLowerCase()
  );
  return key ? [...NSE_SECTOR_CONSTITUENTS[key]] : [];
}

export interface SectorAverage {
  sector: string;
  avgFii: number | null;
  avgDii: number | null;
  avgPromoter: number | null;
  sampleSize: number;
}

export interface SectorBreakdown {
  asOf: string;
  sectors: SectorAverage[];
}

function breakdownPath(): string {
  return path.join(process.cwd(), "data", "fii-dii-sectors.json");
}

export async function readBreakdownCache(): Promise<SectorBreakdown | null> {
  try {
    const text = await fs.readFile(breakdownPath(), "utf8");
    return JSON.parse(text) as SectorBreakdown;
  } catch {
    return null;
  }
}

export async function writeBreakdownCache(data: SectorBreakdown): Promise<void> {
  const p = breakdownPath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(data, null, 2), "utf8");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Compute the breakdown by hitting Screener sequentially with a throttle.
 * Designed for offline / scripted refresh, not for serving hot requests.
 */
export async function computeSectorBreakdown(
  perSector = Infinity,
  delayMs = 1500
): Promise<SectorBreakdown> {
  const sectors = listSectors();
  const results: SectorAverage[] = [];
  for (const sector of sectors) {
    const all = listSectorTickers(sector);
    const tickers = Number.isFinite(perSector)
      ? all.slice(0, perSector)
      : all;
    const stocks: SectorStockHolding[] = [];
    for (const sym of tickers) {
      try {
        const h = await fetchStockHoldings(sym);
        const latest = h.history[0];
        stocks.push({
          symbol: sym,
          fii: latest?.fii ?? null,
          dii: latest?.dii ?? null,
          promoter: latest?.promoter ?? null,
          publicAndOthers: latest?.publicAndOthers ?? null,
          quarter: latest?.quarter ?? null,
          source: h.source,
          ageDays: h.ageDays,
        });
      } catch (e) {
        stocks.push({
          symbol: sym,
          fii: null,
          dii: null,
          promoter: null,
          publicAndOthers: null,
          quarter: null,
          error: (e as Error).message,
        });
      }
      await sleep(delayMs);
    }
    const valid = stocks.filter((s) => s.fii !== null || s.dii !== null);
    const avg = (k: "fii" | "dii" | "promoter"): number | null => {
      const xs = valid
        .map((s) => s[k])
        .filter((v): v is number => v !== null && Number.isFinite(v));
      return xs.length === 0
        ? null
        : Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100;
    };
    results.push({
      sector,
      avgFii: avg("fii"),
      avgDii: avg("dii"),
      avgPromoter: avg("promoter"),
      sampleSize: valid.length,
    });
  }
  return { asOf: new Date().toISOString(), sectors: results };
}

export async function fetchSectorHoldings(
  sector: string,
  limit = 12
): Promise<SectorHoldings> {
  const tickers = listSectorTickers(sector).slice(0, limit);
  const stocks: SectorStockHolding[] = await Promise.all(
    tickers.map(async (sym): Promise<SectorStockHolding> => {
      try {
        const h = await fetchStockHoldings(sym);
        const latest = h.history[0];
        return {
          symbol: sym,
          fii: latest?.fii ?? null,
          dii: latest?.dii ?? null,
          promoter: latest?.promoter ?? null,
          publicAndOthers: latest?.publicAndOthers ?? null,
          quarter: latest?.quarter ?? null,
          source: h.source,
          ageDays: h.ageDays,
        };
      } catch (e) {
        return {
          symbol: sym,
          fii: null,
          dii: null,
          promoter: null,
          publicAndOthers: null,
          quarter: null,
          error: (e as Error).message,
        };
      }
    })
  );
  stocks.sort((a, b) => (b.fii ?? -1) - (a.fii ?? -1));
  return { sector, asOf: new Date().toISOString(), stocks };
}
