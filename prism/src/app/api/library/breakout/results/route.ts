import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import Papa from "papaparse";
import { fanBreakoutResultsPath } from "@/lib/env";

export const dynamic = "force-dynamic";

interface BreakoutRow {
  ticker: string;
  signalDate: string;
  closePrice: number | null;
  marketCap: number | null;
  classification: string;
}

function normalizeRow(r: Record<string, unknown>): BreakoutRow | null {
  const ticker = String(r["TICKER"] ?? "").trim();
  if (!ticker) return null;
  return {
    ticker,
    signalDate: String(r["SIGNAL_DATE"] ?? ""),
    closePrice:
      r["CLOSE_PRICE"] === null || r["CLOSE_PRICE"] === undefined
        ? null
        : Number(r["CLOSE_PRICE"]),
    marketCap:
      r["market_cap"] === null || r["market_cap"] === undefined
        ? null
        : Number(r["market_cap"]),
    classification: String(r["classification"] ?? ""),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const wantDownload = url.searchParams.get("download") === "1";
  const csvPath = fanBreakoutResultsPath();

  let stat: { mtimeMs: number };
  try {
    stat = await fs.stat(csvPath);
  } catch {
    if (wantDownload) {
      return NextResponse.json(
        { error: "No results yet — run a scan first." },
        { status: 404 }
      );
    }
    return NextResponse.json({
      rows: [],
      updatedAt: null,
      message: "No results yet — run a scan first.",
    });
  }

  const text = await fs.readFile(csvPath, "utf8");

  if (wantDownload) {
    return new NextResponse(text, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="fan-breakout-${new Date(stat.mtimeMs).toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  });

  const rows = (parsed.data || [])
    .map(normalizeRow)
    .filter((r): r is BreakoutRow => r !== null);

  return NextResponse.json({
    rows,
    updatedAt: new Date(stat.mtimeMs).toISOString(),
  });
}
