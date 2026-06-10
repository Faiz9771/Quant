import "./_node-polyfills";
import * as cheerio from "cheerio";

const MONTHLY_URL =
  "https://www.moneycontrol.com/techmvc/responsive/fiidii/monthly";

const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Referer:
    "https://www.moneycontrol.com/stocks/marketstats/fii_dii_activity/index.php",
  "X-Requested-With": "XMLHttpRequest",
};

export interface FiiDiiRow {
  date: string; // YYYY-MM-DD
  grossPurchase: number | null;
  grossSales: number | null;
  net: number | null;
}

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

function parseIndianDate(raw: string): string | null {
  const s = raw.replace(/<\/?a[^>]*>/g, "").trim();
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/.exec(s);
  if (!m) return null;
  const day = Number(m[1]);
  const monIdx = MONTHS[m[2].toLowerCase()];
  if (monIdx === undefined) return null;
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  const d = new Date(Date.UTC(year, monIdx, day));
  return d.toISOString().slice(0, 10);
}

function parseNumber(raw: string): number | null {
  const s = raw.replace(/,/g, "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function fetchMonth(
  year: number,
  month: number
): Promise<{ fii: FiiDiiRow[]; dii: FiiDiiRow[] }> {
  const url = `${MONTHLY_URL}?month=${month}&year=${year}&section=cash&sub_section=cash`;
  const r = await fetch(url, { headers: HEADERS, cache: "no-store" });
  if (!r.ok) throw new Error(`Moneycontrol ${month}/${year}: ${r.status}`);
  const html = await r.text();
  const $ = cheerio.load(html);

  const fii: FiiDiiRow[] = [];
  const dii: FiiDiiRow[] = [];

  $("table tr").each((_, tr) => {
    const cells = $(tr)
      .find("td,th")
      .map((_, c) => $(c).text().trim())
      .get();
    if (cells.length < 7) return;
    const date = parseIndianDate(cells[0]);
    if (!date) return; // header or "Total" row
    const [, fGP, fGS, fNet, dGP, dGS, dNet] = cells;
    fii.push({
      date,
      grossPurchase: parseNumber(fGP),
      grossSales: parseNumber(fGS),
      net: parseNumber(fNet),
    });
    dii.push({
      date,
      grossPurchase: parseNumber(dGP),
      grossSales: parseNumber(dGS),
      net: parseNumber(dNet),
    });
  });

  return { fii, dii };
}

/** Fetch FII/DII rows between inclusive start/end dates (YYYY-MM-DD). */
export async function fetchFiiDiiRange(
  startIso: string,
  endIso: string
): Promise<{ fii: FiiDiiRow[]; dii: FiiDiiRow[] }> {
  const start = new Date(startIso + "T00:00:00Z");
  const end = new Date(endIso + "T00:00:00Z");
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    throw new Error("Invalid date range");
  }
  if (start > end) throw new Error("start must be on/before end");

  const months: { y: number; m: number }[] = [];
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth() + 1;
  const endY = end.getUTCFullYear();
  const endM = end.getUTCMonth() + 1;
  while (y < endY || (y === endY && m <= endM)) {
    months.push({ y, m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    if (months.length > 120) break; // safety cap: 10 years
  }

  const fii: FiiDiiRow[] = [];
  const dii: FiiDiiRow[] = [];
  for (const { y, m } of months) {
    try {
      const res = await fetchMonth(y, m);
      fii.push(...res.fii);
      dii.push(...res.dii);
    } catch {
      // Skip unavailable month, continue.
    }
  }

  const within = (r: FiiDiiRow) =>
    r.date >= startIso && r.date <= endIso;
  const sortDesc = (a: FiiDiiRow, b: FiiDiiRow) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
  return {
    fii: fii.filter(within).sort(sortDesc),
    dii: dii.filter(within).sort(sortDesc),
  };
}

export function rowsToCsv(rows: FiiDiiRow[]): string {
  const header = ["Date", "Gross_Purchase", "Gross_Sales", "Net"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [r.date, r.grossPurchase ?? "", r.grossSales ?? "", r.net ?? ""].join(",")
    );
  }
  return lines.join("\n") + "\n";
}
