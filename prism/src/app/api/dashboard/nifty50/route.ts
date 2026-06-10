import { NextResponse } from "next/server";
import { fetchNifty50Constituents } from "@/lib/data/nifty50";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const payload = await fetchNifty50Constituents();
    return NextResponse.json(payload, {
      headers: {
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
