import { NextResponse } from "next/server";
import { getVolatilityBreakoutRunner } from "@/lib/volatility-breakout-runner";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const payload = await getVolatilityBreakoutRunner().refreshLivePrices();
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
