import { NextResponse } from "next/server";
import { loadSnapshotByName } from "@/lib/data/snapshots";
import { computeChanges } from "@/lib/data/diff";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const left = searchParams.get("left");
    const right = searchParams.get("right");
    if (!left || !right) {
      return NextResponse.json(
        { error: "left and right query params are required" },
        { status: 400 }
      );
    }

    const [leftDataset, rightDataset] = await Promise.all([
      loadSnapshotByName(left),
      loadSnapshotByName(right),
    ]);

    const changes = computeChanges(leftDataset, rightDataset);

    return NextResponse.json({
      left: leftDataset,
      right: rightDataset,
      changes,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
