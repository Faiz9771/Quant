import Papa from "papaparse";

export type NiftyUniverseId = "nifty50" | "niftyMidcap50";

export interface NiftyUniverseConstituent {
  companyName: string;
  industry: string;
  symbol: string;
  series: string;
  isinCode: string;
}

export interface NiftyUniversePayload {
  universe: NiftyUniverseId;
  label: string;
  source: string;
  fetchedAt: string;
  count: number;
  constituents: NiftyUniverseConstituent[];
}

interface NseCsvRow {
  "Company Name"?: string;
  Industry?: string;
  Symbol?: string;
  Series?: string;
  "ISIN Code"?: string;
}

interface UniverseDefinition {
  label: string;
  urls: string[];
}

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const UNIVERSES: Record<NiftyUniverseId, UniverseDefinition> = {
  nifty50: {
    label: "Nifty 50 (Largecap)",
    urls: ["https://www.niftyindices.com/IndexConstituent/ind_nifty50list.csv"],
  },
  niftyMidcap50: {
    label: "Nifty Midcap 50",
    urls: [
      "https://www.niftyindices.com/IndexConstituent/ind_niftymidcap50list.csv",
      "https://www.niftyindices.com/IndexConstituent/ind_nifty_midcap50list.csv",
    ],
  },
};

const universeCache = new Map<NiftyUniverseId, NiftyUniversePayload>();

function clean(v: unknown): string {
  return String(v ?? "").trim();
}

function parseConstituents(text: string): NiftyUniverseConstituent[] {
  const parsed = Papa.parse<NseCsvRow>(text, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    throw new Error(parsed.errors[0]?.message ?? "Unable to parse Nifty CSV");
  }

  return parsed.data
    .map((row) => ({
      companyName: clean(row["Company Name"]),
      industry: clean(row.Industry),
      symbol: clean(row.Symbol).toUpperCase(),
      series: clean(row.Series),
      isinCode: clean(row["ISIN Code"]),
    }))
    .filter((row) => row.symbol && row.companyName);
}

async function fetchCsvFromCandidates(urls: string[]): Promise<{
  source: string;
  text: string;
}> {
  let lastError: Error | null = null;

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        cache: "no-store",
        headers: {
          accept: "text/csv,*/*",
          "accept-language": "en-US,en;q=0.9",
          "user-agent": USER_AGENT,
        },
      });
      if (!res.ok) {
        throw new Error(`source returned ${res.status}`);
      }
      return { source: url, text: await res.text() };
    } catch (error) {
      lastError = error as Error;
    }
  }

  throw lastError ?? new Error("Unable to fetch Nifty constituents");
}

export function getUniverseDefinition(universe: NiftyUniverseId): UniverseDefinition {
  return UNIVERSES[universe];
}

export function getCachedUniverse(
  universe: NiftyUniverseId
): NiftyUniversePayload | null {
  return universeCache.get(universe) ?? null;
}

export async function fetchUniverseConstituents(
  universe: NiftyUniverseId
): Promise<NiftyUniversePayload> {
  const definition = UNIVERSES[universe];
  const { source, text } = await fetchCsvFromCandidates(definition.urls);
  const constituents = parseConstituents(text);

  const payload: NiftyUniversePayload = {
    universe,
    label: definition.label,
    source,
    fetchedAt: new Date().toISOString(),
    count: constituents.length,
    constituents,
  };

  universeCache.set(universe, payload);
  return payload;
}

export async function getUniverseConstituents(
  universe: NiftyUniverseId,
  options?: { forceRefresh?: boolean }
): Promise<NiftyUniversePayload> {
  if (!options?.forceRefresh) {
    const cached = universeCache.get(universe);
    if (cached) return cached;
  }
  return fetchUniverseConstituents(universe);
}
