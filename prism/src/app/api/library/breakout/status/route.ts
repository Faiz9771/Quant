import { NextResponse } from "next/server";
import { getBreakoutRunner } from "@/lib/breakout-runner";

export const dynamic = "force-dynamic";

export async function GET() {
  const runner = getBreakoutRunner();
  return NextResponse.json({
    state: runner.getState(),
    events: runner.getEvents(),
  });
}
