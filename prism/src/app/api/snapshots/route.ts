import { NextResponse } from "next/server";
import { listSnapshots } from "@/lib/data/snapshots";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshots = await listSnapshots();
    return NextResponse.json({ snapshots });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
