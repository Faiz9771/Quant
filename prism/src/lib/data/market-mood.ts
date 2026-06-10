import "./_node-polyfills";

const API_URL = "https://api.tickertape.in/mmi/now";
const PAGE_URL = "https://www.tickertape.in/market-mood-index";

const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Referer: PAGE_URL,
  Accept: "application/json, text/plain, */*",
};

export type MoodZone =
  | "Extreme Fear"
  | "Fear"
  | "Greed"
  | "Extreme Greed";

export interface MarketMoodSnapshot {
  value: number;
  zone: MoodZone;
  asOf: string;
  fetchedAt: string;
}

function classifyZone(v: number): MoodZone {
  if (v < 30) return "Extreme Fear";
  if (v < 50) return "Fear";
  if (v < 70) return "Greed";
  return "Extreme Greed";
}

function normalizeZone(raw: unknown, value: number): MoodZone {
  const s = String(raw ?? "").toLowerCase().replace(/[_-]/g, " ").trim();
  if (s.includes("extreme") && s.includes("fear")) return "Extreme Fear";
  if (s.includes("extreme") && s.includes("greed")) return "Extreme Greed";
  if (s === "fear") return "Fear";
  if (s === "greed") return "Greed";
  return classifyZone(value);
}

async function tryApi(): Promise<MarketMoodSnapshot | null> {
  try {
    const res = await fetch(API_URL, {
      headers: HEADERS,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    const root = (json ?? {}) as Record<string, unknown>;
    const data = (root.data ?? root) as Record<string, unknown>;
    const value = Number(
      (data.currentValue as number) ??
        (data.value as number) ??
        (data.mmi as number) ??
        NaN
    );
    if (!Number.isFinite(value)) return null;
    const rawZone =
      (data.indicator as string) ??
      (data.zone as string) ??
      (data.currentZone as string) ??
      "";
    const zone = normalizeZone(rawZone, value);
    const asOf = String(
      (data.lastUpdated as string) ??
        (data.date as string) ??
        (data.updatedAt as string) ??
        new Date().toISOString()
    );
    return {
      value,
      zone,
      asOf,
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

async function tryHtml(): Promise<MarketMoodSnapshot> {
  const res = await fetch(PAGE_URL, {
    headers: HEADERS,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Tickertape MMI page: ${res.status}`);
  const html = await res.text();

  const valueMatch =
    /"currentValue"\s*:\s*([\d.]+)/i.exec(html) ||
    /"mmi"\s*:\s*([\d.]+)/i.exec(html);
  if (!valueMatch) throw new Error("Could not extract MMI value from page");
  const value = Number(valueMatch[1]);

  const zoneMatch =
    /"indicator"\s*:\s*"([^"]+)"/i.exec(html) ||
    /"zone"\s*:\s*"([^"]+)"/i.exec(html) ||
    /"currentZone"\s*:\s*"([^"]+)"/i.exec(html);
  const zone = normalizeZone(zoneMatch?.[1], value);

  const asOfMatch = /"lastUpdated"\s*:\s*"([^"]+)"/i.exec(html);
  const asOf = asOfMatch?.[1] ?? new Date().toISOString();

  return {
    value,
    zone,
    asOf,
    fetchedAt: new Date().toISOString(),
  };
}

export async function fetchMarketMood(): Promise<MarketMoodSnapshot> {
  const api = await tryApi();
  if (api) return api;
  return tryHtml();
}
