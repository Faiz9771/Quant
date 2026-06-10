import { NextResponse } from "next/server";
import { fetchMarketMood } from "@/lib/data/market-mood";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snap = await fetchMarketMood();
    return NextResponse.json(snap);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 }
    );
  }
}
