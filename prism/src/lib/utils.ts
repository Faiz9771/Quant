import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "EPS_Strength_Rating" → "EPS Strength Rating" */
export function humanizeColumnName(name: string): string {
  const parts = name.replace(/-/g, " ").split("_");
  const out: string[] = [];
  for (const p of parts) {
    if (!p) continue;
    if (p === p.toUpperCase() && p.length <= 4) {
      out.push(p);
    } else {
      out.push(p[0].toUpperCase() + p.slice(1));
    }
  }
  return out.join(" ");
}

/** Normalize column names to a comparable key (alphanumeric lowercase). */
export function normKey(x: unknown): string {
  return String(x ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function detectKeyColumn(columns: string[]): string | null {
  const candidates = [
    "Symbol",
    "SYMBOL",
    "symbol",
    "Ticker",
    "TICKER",
    "ticker",
    "NSE_Symbol",
    "nse_symbol",
    "Stock",
  ];
  for (const c of candidates) {
    if (columns.includes(c)) return c;
  }
  for (const c of columns) {
    const k = c.trim().toLowerCase();
    if (k === "symbol" || k === "ticker") return c;
  }
  return null;
}
