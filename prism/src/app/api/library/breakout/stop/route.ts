import { NextResponse } from "next/server";
import { getBreakoutRunner } from "@/lib/breakout-runner";

export const dynamic = "force-dynamic";

export async function POST() {
  const runner = getBreakoutRunner();
  const stopped = runner.stop();
  return NextResponse.json({ stopped, state: runner.getState() });
}
