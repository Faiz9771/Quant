import { NextResponse } from "next/server";
import { getScraperRunner } from "@/lib/scraper-runner";

export const dynamic = "force-dynamic";

export async function GET() {
  const runner = getScraperRunner();
  return NextResponse.json({
    state: runner.getState(),
    logs: runner.getRecentLogs(),
  });
}
