import { NextResponse } from "next/server";
import { deleteDocRow, getDoc, upsertDoc } from "@/lib/office/db";
import type { OfficeDoc } from "@/lib/office/types";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const doc = getDoc(id);
    if (!doc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ doc });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = (await req.json()) as Partial<OfficeDoc>;
    if (!body || typeof body !== "object" || body.id !== id) {
      return NextResponse.json(
        { error: "Body id must match route id" },
        { status: 400 }
      );
    }
    if (
      body.kind !== "spreadsheet" &&
      body.kind !== "document" &&
      body.kind !== "pdf" &&
      body.kind !== "file"
    ) {
      return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
    }
    upsertDoc(body as OfficeDoc);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    deleteDocRow(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
