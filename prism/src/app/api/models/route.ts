import { NextRequest, NextResponse } from "next/server";
import { addModel, listModels } from "@/lib/data/models-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const models = await listModels();
  return NextResponse.json({ models });
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const title = String(form.get("title") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    const file = form.get("pdf") as unknown as
      | (Blob & { name?: string; type?: string })
      | null;
    if (!title) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }
    if (!file || typeof (file as Blob).arrayBuffer !== "function") {
      return NextResponse.json(
        { error: "pdf file is required" },
        { status: 400 }
      );
    }
    if (file.type && file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "file must be a PDF" },
        { status: 400 }
      );
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const record = await addModel(title, description, bytes);
    return NextResponse.json(record, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
