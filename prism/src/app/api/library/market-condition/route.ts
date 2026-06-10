import { NextRequest, NextResponse } from "next/server";
import { fetchMarketConditionOn } from "@/lib/data/market-condition";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const date = (url.searchParams.get("date") ?? "").trim();
    if (!date) {
      return NextResponse.json(
        { error: "date is required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }
    const emaRaw = (url.searchParams.get("ema") ?? "9").trim();
    const emaPeriod = emaRaw === "25" ? 25 : 9;
    const snapshot = await fetchMarketConditionOn(date, emaPeriod);
    if (!snapshot) {
      return NextResponse.json(
        { error: "No data available for that date (insufficient history)." },
        { status: 404 }
      );
    }
    return NextResponse.json(snapshot);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
