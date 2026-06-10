import { NextResponse } from "next/server";
import { getScraperRunner } from "@/lib/scraper-runner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    const runner = getScraperRunner();
    const state = await runner.authenticate();
    return NextResponse.json(state);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
