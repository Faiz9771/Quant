import { promises as fs } from "node:fs";
import path from "node:path";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

interface SectorCache {
  version: 1;
  updatedAt: string;
  // Keyed by uppercase ticker (without suffix, e.g. "RELIANCE")
  entries: Record<string, { sector: string | null; fetchedAt: string }>;
}

function cachePath(): string {
  return path.join(process.cwd(), "data", "ticker-sectors.json");
}

async function readCache(): Promise<SectorCache> {
  try {
    const text = await fs.readFile(cachePath(), "utf8");
    const parsed = JSON.parse(text) as SectorCache;
    if (parsed && parsed.entries) return parsed;
  } catch {
    // miss — fall through
  }
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    entries: {},
  };
}

async function writeCache(cache: SectorCache): Promise<void> {
  const p = cachePath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(cache, null, 2), "utf8");
}

function toYahooSymbol(raw: string): string {
  const t = raw.trim().toUpperCase();
  if (!t) return t;
  if (t.includes(".")) return t;
  return `${t}.NS`;
}

async function fetchSector(ticker: string): Promise<string | null> {
  const symbol = toYahooSymbol(ticker);
  try {
    const res = await yahooFinance.quoteSummary(symbol, {
      modules: ["assetProfile"],
    });
    const sector = res?.assetProfile?.sector;
    if (typeof sector === "string" && sector.trim()) return sector.trim();
  } catch {
    // Some tickers (indices, unusual symbols) don't have assetProfile — treat as null
  }
  return null;
}

/**
 * Resolves sector for each ticker. Uses the local cache first and only hits
 * Yahoo for cache misses. Returns `ticker → sector|null`.
 */
export async function resolveSectors(
  tickers: string[]
): Promise<Record<string, string | null>> {
  const unique = Array.from(
    new Set(
      tickers
        .map((t) => (typeof t === "string" ? t.trim().toUpperCase() : ""))
        .filter(Boolean)
    )
  );
  if (unique.length === 0) return {};

  const cache = await readCache();
  const out: Record<string, string | null> = {};
  const toFetch: string[] = [];

  for (const t of unique) {
    const hit = cache.entries[t];
    if (hit) {
      out[t] = hit.sector;
    } else {
      toFetch.push(t);
    }
  }

  if (toFetch.length > 0) {
    const CONCURRENCY = 4;
    for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
      const batch = toFetch.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (t) => [t, await fetchSector(t)] as const)
      );
      for (const [t, sector] of results) {
        out[t] = sector;
        cache.entries[t] = { sector, fetchedAt: new Date().toISOString() };
      }
    }
    cache.updatedAt = new Date().toISOString();
    await writeCache(cache);
  }

  return out;
}
