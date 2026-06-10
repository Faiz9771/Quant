import { NextResponse } from "next/server";
import {
  computeSectorBreakdown,
  readBreakdownCache,
  writeBreakdownCache,
} from "@/lib/data/fii-holdings";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

let inFlight: Promise<unknown> | null = null;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const force = url.searchParams.get("refresh") === "1";

  const cached = await readBreakdownCache();
  if (cached && !force) {
    return NextResponse.json(cached, {
      headers: { "cache-control": "no-store" },
    });
  }

  // No cache (or forced refresh) — compute now. Single-flight so concurrent
  // dashboard loads don't trigger N parallel scrapes.
  if (!inFlight) {
    inFlight = (async () => {
      try {
        const data = await computeSectorBreakdown(Infinity, 1500);
        await writeBreakdownCache(data);
        return data;
      } finally {
        inFlight = null;
      }
    })();
  }
  try {
    const data = (await inFlight) as Awaited<
      ReturnType<typeof computeSectorBreakdown>
    >;
    return NextResponse.json(data, {
      headers: { "cache-control": "no-store" },
    });
  } catch (e) {
    if (cached) {
      return NextResponse.json(cached, {
        headers: { "cache-control": "no-store" },
      });
    }
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
