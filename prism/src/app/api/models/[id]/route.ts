import { NextRequest, NextResponse } from "next/server";
import { deleteModel, updateModel } from "@/lib/data/models-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ok = await deleteModel(id);
  if (!ok) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const form = await req.formData();
    const title = form.get("title");
    const description = form.get("description");
    const file = form.get("pdf") as unknown as
      | (Blob & { type?: string })
      | null;

    let pdfBytes: Uint8Array | null = null;
    if (file && typeof (file as Blob).arrayBuffer === "function") {
      if (file.type && file.type !== "application/pdf") {
        return NextResponse.json(
          { error: "file must be a PDF" },
          { status: 400 }
        );
      }
      pdfBytes = new Uint8Array(await file.arrayBuffer());
    }

    const updated = await updateModel(id, {
      title: title !== null ? String(title) : undefined,
      description: description !== null ? String(description) : undefined,
      pdfBytes,
    });
    if (!updated) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
