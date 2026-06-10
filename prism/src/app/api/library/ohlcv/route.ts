import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

export const dynamic = "force-dynamic";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

function toYahooSymbol(raw: string): string {
  const t = raw.trim().toUpperCase();
  if (!t) return t;
  if (t.includes(".")) return t;
  return `${t}.NS`;
}

function fmtDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const tickerRaw = (url.searchParams.get("ticker") ?? "").trim();
    const intervalRaw = (url.searchParams.get("interval") ?? "1d").trim();
    const start = (url.searchParams.get("start") ?? "").trim();
    const end = (url.searchParams.get("end") ?? "").trim();

    if (!tickerRaw) {
      return NextResponse.json({ error: "ticker is required" }, { status: 400 });
    }
    if (!start || !end) {
      return NextResponse.json(
        { error: "start and end are required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }
    const interval = intervalRaw === "1wk" ? "1wk" : "1d";
    const symbol = toYahooSymbol(tickerRaw);

    const result = await yahooFinance.chart(symbol, {
      period1: start,
      period2: end,
      interval,
    });

    const rows = (result.quotes ?? []).filter(
      (q) => q && q.date && q.open !== null && q.close !== null
    );

    const header = ["Date", "Open", "High", "Low", "Close", "Adj Close", "Volume"];
    const lines: string[] = [header.join(",")];
    for (const q of rows) {
      const date = q.date instanceof Date ? fmtDate(q.date) : String(q.date);
      lines.push(
        [
          csvEscape(date),
          csvEscape(q.open),
          csvEscape(q.high),
          csvEscape(q.low),
          csvEscape(q.close),
          csvEscape(q.adjclose),
          csvEscape(q.volume),
        ].join(",")
      );
    }
    const csv = lines.join("\n") + "\n";

    const suffix = interval === "1wk" ? "weekly" : "daily";
    const fname = `${symbol.replace(/\./g, "_")}_${suffix}_${start}_${end}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${fname}"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
