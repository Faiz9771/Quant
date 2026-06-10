import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { historyDir, latestParquetPath } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await context.params;
    const decoded = decodeURIComponent(name);
    const safe = path.basename(decoded);

    const target =
      safe === "latest.parquet"
        ? latestParquetPath()
        : path.join(historyDir(), safe);

    const data = await fs.readFile(target);
    const ext = path.extname(target).toLowerCase();
    const contentType =
      ext === ".csv"
        ? "text/csv"
        : ext === ".parquet"
          ? "application/vnd.apache.parquet"
          : "application/octet-stream";

    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${safe}"`,
        "Content-Length": String(data.length),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 404 }
    );
  }
}
