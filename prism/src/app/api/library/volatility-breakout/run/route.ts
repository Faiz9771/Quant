import { NextResponse } from "next/server";
import { getVolatilityBreakoutRunner } from "@/lib/volatility-breakout-runner";
import type { NiftyUniverseId } from "@/lib/data/nifty-universes";

export const dynamic = "force-dynamic";

function isUniverse(value: unknown): value is NiftyUniverseId {
  return value === "nifty50" || value === "niftyMidcap50";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      universe?: unknown;
      refreshUniverse?: boolean;
    };

    if (!isUniverse(body.universe)) {
      return NextResponse.json(
        { error: "Universe must be 'nifty50' or 'niftyMidcap50'." },
        { status: 400 }
      );
    }

    const state = getVolatilityBreakoutRunner().start({
      universe: body.universe,
      refreshUniverse: body.refreshUniverse === true,
    });

    return NextResponse.json(state);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
