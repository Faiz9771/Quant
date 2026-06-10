import { NextResponse } from "next/server";
import { loadSnapshotByName } from "@/lib/data/snapshots";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await context.params;
    const dataset = await loadSnapshotByName(decodeURIComponent(name));
    return NextResponse.json(dataset);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
