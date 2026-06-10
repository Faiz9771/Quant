import { NextResponse } from "next/server";
import { loadLatest } from "@/lib/data/snapshots";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const dataset = await loadLatest();
    return NextResponse.json(dataset);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
