import { NextResponse } from "next/server";
import { getScraperRunner } from "@/lib/scraper-runner";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const runner = getScraperRunner();
    const ok = runner.stop();
    return NextResponse.json({ stopped: ok, state: runner.getState() });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
