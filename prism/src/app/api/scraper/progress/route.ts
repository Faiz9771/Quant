import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import { scraperProgressCsvPath } from "@/lib/env";

export const dynamic = "force-dynamic";

type Row = Record<string, string | number | null>;

function parseCsv(text: string): { columns: string[]; rows: Row[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return { columns: [], rows: [] };
  const columns = splitCsvLine(lines[0]);
  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i]);
    const row: Row = {};
    for (let j = 0; j < columns.length; j++) {
      const raw = values[j] ?? "";
      if (raw === "") {
        row[columns[j]] = null;
        continue;
      }
      const n = Number(raw);
      row[columns[j]] = Number.isFinite(n) && raw.trim() !== "" ? n : raw;
    }
    rows.push(row);
  }
  return { columns, rows };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export async function GET() {
  const csvPath = scraperProgressCsvPath();
  try {
    const [stat, text] = await Promise.all([
      fs.stat(csvPath),
      fs.readFile(csvPath, "utf8"),
    ]);
    const { columns, rows } = parseCsv(text);
    return NextResponse.json({
      exists: true,
      columns,
      rows,
      updatedAt: new Date(stat.mtimeMs).toISOString(),
    });
  } catch {
    return NextResponse.json({
      exists: false,
      columns: [],
      rows: [],
      updatedAt: null,
    });
  }
}
