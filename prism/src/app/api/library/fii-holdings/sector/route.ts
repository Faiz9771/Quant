import { NextRequest, NextResponse } from "next/server";
import { fetchSectorHoldings, listSectors } from "@/lib/data/fii-holdings";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const sector = (url.searchParams.get("sector") ?? "").trim();
    if (!sector) {
      const sectors = listSectors();
      return NextResponse.json(
        { sectors },
        { headers: { "cache-control": "no-store" } }
      );
    }
    const limit = Number(url.searchParams.get("limit") ?? "12") || 12;
    const data = await fetchSectorHoldings(sector, Math.min(Math.max(limit, 1), 30));
    return NextResponse.json(data, {
      headers: { "cache-control": "no-store" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
