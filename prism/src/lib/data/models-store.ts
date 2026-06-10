import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = path.join(process.cwd(), "data", "models");
const INDEX = path.join(ROOT, "index.json");

export interface ModelRecord {
  id: string;
  title: string;
  description: string;
  pdfFile: string; // relative file name inside data/models
  createdAt: string;
  updatedAt?: string;
}

async function ensure(): Promise<void> {
  await fs.mkdir(ROOT, { recursive: true });
  try {
    await fs.access(INDEX);
  } catch {
    await fs.writeFile(INDEX, "[]", "utf8");
  }
}

export async function listModels(): Promise<ModelRecord[]> {
  await ensure();
  const raw = await fs.readFile(INDEX, "utf8");
  try {
    const arr = JSON.parse(raw) as ModelRecord[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function writeIndex(records: ModelRecord[]): Promise<void> {
  await fs.writeFile(INDEX, JSON.stringify(records, null, 2), "utf8");
}

export async function addModel(
  title: string,
  description: string,
  pdfBytes: Uint8Array
): Promise<ModelRecord> {
  await ensure();
  const id = crypto.randomUUID();
  const pdfFile = `${id}.pdf`;
  await fs.writeFile(path.join(ROOT, pdfFile), pdfBytes);
  const records = await listModels();
  const record: ModelRecord = {
    id,
    title: title.trim(),
    description: description.trim(),
    pdfFile,
    createdAt: new Date().toISOString(),
  };
  records.unshift(record);
  await writeIndex(records);
  return record;
}

export async function updateModel(
  id: string,
  patch: { title?: string; description?: string; pdfBytes?: Uint8Array | null }
): Promise<ModelRecord | null> {
  const records = await listModels();
  const idx = records.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const current = records[idx];
  const next: ModelRecord = {
    ...current,
    title:
      patch.title !== undefined ? patch.title.trim() : current.title,
    description:
      patch.description !== undefined
        ? patch.description.trim()
        : current.description ?? "",
    updatedAt: new Date().toISOString(),
  };
  if (patch.pdfBytes && patch.pdfBytes.length > 0) {
    await fs.writeFile(path.join(ROOT, next.pdfFile), patch.pdfBytes);
  }
  records[idx] = next;
  await writeIndex(records);
  return next;
}

export async function deleteModel(id: string): Promise<boolean> {
  const records = await listModels();
  const idx = records.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  const [removed] = records.splice(idx, 1);
  await writeIndex(records);
  try {
    await fs.unlink(path.join(ROOT, removed.pdfFile));
  } catch {
    // file may already be gone; ignore
  }
  return true;
}

export async function readModelPdf(id: string): Promise<Buffer | null> {
  const records = await listModels();
  const rec = records.find((r) => r.id === id);
  if (!rec) return null;
  try {
    return await fs.readFile(path.join(ROOT, rec.pdfFile));
  } catch {
    return null;
  }
}
