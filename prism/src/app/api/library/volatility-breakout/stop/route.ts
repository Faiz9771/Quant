import { NextResponse } from "next/server";
import { getVolatilityBreakoutRunner } from "@/lib/volatility-breakout-runner";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json({
    ok: getVolatilityBreakoutRunner().stop(),
  });
}
