import Papa from "papaparse";

const NIFTY50_CSV_URL =
  "https://www.niftyindices.com/IndexConstituent/ind_nifty50list.csv";

export interface Nifty50Constituent {
  companyName: string;
  industry: string;
  symbol: string;
  series: string;
  isinCode: string;
}

export interface Nifty50ConstituentsPayload {
  source: string;
  fetchedAt: string;
  count: number;
  constituents: Nifty50Constituent[];
}

interface NseCsvRow {
  "Company Name"?: string;
  Industry?: string;
  Symbol?: string;
  Series?: string;
  "ISIN Code"?: string;
}

function clean(v: unknown): string {
  return String(v ?? "").trim();
}

export async function fetchNifty50Constituents(): Promise<Nifty50ConstituentsPayload> {
  const res = await fetch(NIFTY50_CSV_URL, {
    cache: "no-store",
    headers: {
      accept: "text/csv,*/*",
      "accept-language": "en-US,en;q=0.9",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    },
  });

  if (!res.ok) {
    throw new Error(`NSE returned ${res.status}`);
  }

  const text = await res.text();
  const parsed = Papa.parse<NseCsvRow>(text, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    throw new Error(parsed.errors[0]?.message ?? "Unable to parse NSE CSV");
  }

  const constituents = parsed.data
    .map((row) => ({
      companyName: clean(row["Company Name"]),
      industry: clean(row.Industry),
      symbol: clean(row.Symbol).toUpperCase(),
      series: clean(row.Series),
      isinCode: clean(row["ISIN Code"]),
    }))
    .filter((row) => row.symbol && row.companyName);

  return {
    source: NIFTY50_CSV_URL,
    fetchedAt: new Date().toISOString(),
    count: constituents.length,
    constituents,
  };
}
