import { NextResponse } from "next/server";
import { getVolatilityBreakoutRunner } from "@/lib/volatility-breakout-runner";

export const dynamic = "force-dynamic";

function csvEscape(value: string | number | null): string {
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const wantDownload = url.searchParams.get("download") === "1";
  const payload = getVolatilityBreakoutRunner().getResults();

  if (wantDownload) {
    const headers = [
      "ticker",
      "companyName",
      "industry",
      "universe",
      "universeLabel",
      "signalDate",
      "direction",
      "breakoutAt",
      "openPrice",
      "breakoutLevel",
      "buyLevel",
      "shortLevel",
      "trueRange",
      "trComponent",
      "prevClose",
      "yesterdayHigh",
      "yesterdayLow",
      "livePrice",
      "livePriceUpdatedAt",
    ];

    const lines = [
      headers.join(","),
      ...payload.rows.map((row) =>
        headers.map((header) => csvEscape(row[header as keyof typeof row])).join(",")
      ),
    ];

    return new NextResponse(lines.join("\n"), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="volatility-breakout-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  return NextResponse.json(payload);
}
