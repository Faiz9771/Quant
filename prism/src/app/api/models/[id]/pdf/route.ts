import { NextRequest, NextResponse } from "next/server";
import { readModelPdf } from "@/lib/data/models-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const buf = await readModelPdf(id);
  if (!buf) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const body = new Uint8Array(buf);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${id}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
