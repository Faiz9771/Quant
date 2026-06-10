import { NextRequest, NextResponse } from "next/server";
import { fetchFiiDiiRange, rowsToCsv } from "@/lib/data/fii-dii";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const kind = (url.searchParams.get("kind") ?? "fii").toLowerCase();
    const start = (url.searchParams.get("start") ?? "").trim();
    const end = (url.searchParams.get("end") ?? "").trim();

    if (!start || !end) {
      return NextResponse.json(
        { error: "start and end are required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }
    if (kind !== "fii" && kind !== "dii" && kind !== "both") {
      return NextResponse.json(
        { error: "kind must be 'fii', 'dii', or 'both'" },
        { status: 400 }
      );
    }

    const format = (url.searchParams.get("format") ?? "csv").toLowerCase();
    const { fii, dii } = await fetchFiiDiiRange(start, end);

    if (format === "json") {
      if (kind === "both") {
        return NextResponse.json(
          { start, end, fii, dii },
          { headers: { "cache-control": "no-store" } }
        );
      }
      return NextResponse.json(
        { kind, start, end, rows: kind === "fii" ? fii : dii },
        { headers: { "cache-control": "no-store" } }
      );
    }

    const rows = kind === "fii" ? fii : dii;

    const csv = rowsToCsv(rows);
    const fname = `${kind.toUpperCase()}_activity_${start}_${end}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${fname}"`,
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
