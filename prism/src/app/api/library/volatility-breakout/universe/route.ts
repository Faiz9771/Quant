import { NextResponse } from "next/server";
import {
  fetchUniverseConstituents,
  getCachedUniverse,
  getUniverseDefinition,
  type NiftyUniverseId,
} from "@/lib/data/nifty-universes";

export const dynamic = "force-dynamic";

function isUniverse(value: unknown): value is NiftyUniverseId {
  return value === "nifty50" || value === "niftyMidcap50";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const universe = url.searchParams.get("universe");

  if (!isUniverse(universe)) {
    return NextResponse.json(
      { error: "Universe must be 'nifty50' or 'niftyMidcap50'." },
      { status: 400 }
    );
  }

  const cached = getCachedUniverse(universe);
  const definition = getUniverseDefinition(universe);

  return NextResponse.json({
    universe,
    label: definition.label,
    source: cached?.source ?? definition.urls[0],
    fetchedAt: cached?.fetchedAt ?? null,
    count: cached?.count ?? 0,
    hasCache: cached !== null,
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { universe?: unknown };
    if (!isUniverse(body.universe)) {
      return NextResponse.json(
        { error: "Universe must be 'nifty50' or 'niftyMidcap50'." },
        { status: 400 }
      );
    }

    const payload = await fetchUniverseConstituents(body.universe);
    return NextResponse.json({
      universe: payload.universe,
      label: payload.label,
      source: payload.source,
      fetchedAt: payload.fetchedAt,
      count: payload.count,
      hasCache: true,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
