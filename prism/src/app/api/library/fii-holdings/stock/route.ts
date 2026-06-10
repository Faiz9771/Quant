import { NextRequest, NextResponse } from "next/server";
import { fetchStockHoldings } from "@/lib/data/fii-holdings";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const symbol = (url.searchParams.get("symbol") ?? "").trim();
    if (!symbol) {
      return NextResponse.json(
        { error: "symbol is required (e.g. RELIANCE)" },
        { status: 400 }
      );
    }
    const data = await fetchStockHoldings(symbol);
    return NextResponse.json(data, {
      headers: { "cache-control": "no-store" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
