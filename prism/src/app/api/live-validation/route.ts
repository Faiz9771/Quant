import { NextRequest, NextResponse } from "next/server";
import {
  addRow,
  deleteRow,
  loadDataset,
  updateRow,
} from "@/lib/data/live-validation-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const dataset = await loadDataset();
    return NextResponse.json(dataset);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const row = await addRow(body ?? {});
    return NextResponse.json({ row });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const id = body?.id;
    const patch = body?.patch ?? {};
    if (!id) {
      return NextResponse.json({ error: "missing id" }, { status: 400 });
    }
    const row = await updateRow(id, patch);
    if (!row) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json({ row });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "missing id" }, { status: 400 });
    }
    const ok = await deleteRow(id);
    if (!ok) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
