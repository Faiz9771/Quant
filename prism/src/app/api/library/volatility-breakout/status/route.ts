import { NextResponse } from "next/server";
import { getVolatilityBreakoutRunner } from "@/lib/volatility-breakout-runner";

export const dynamic = "force-dynamic";

export async function GET() {
  const runner = getVolatilityBreakoutRunner();
  return NextResponse.json({
    state: runner.getState(),
    events: runner.getEvents(),
  });
}
