import { NextResponse } from "next/server";
import { getScraperRunner } from "@/lib/scraper-runner";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {
      /* empty body OK */
    }
    const runner = getScraperRunner();
    const state = runner.start({
      scrapeOnly: body.scrapeOnly === true,
      skipScrape: body.skipScrape === true,
      noHeadless: body.noHeadless === true,
      resume: typeof body.resume === "number" ? body.resume : undefined,
    });
    return NextResponse.json(state);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
