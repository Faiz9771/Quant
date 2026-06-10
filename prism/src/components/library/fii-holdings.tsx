"use client";

import * as React from "react";
import { Loader2, PieChart, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LibraryTile, TileModal } from "./library-tile";

interface ShareholdingSnapshot {
  quarter: string;
  promoter: number | null;
  fii: number | null;
  dii: number | null;
  government: number | null;
  publicAndOthers: number | null;
}
interface StockResp {
  symbol: string;
  name: string | null;
  source: string;
  cachedAt?: string;
  ageDays?: number;
  history: ShareholdingSnapshot[];
}

function fmtPct(v: number | null): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${v.toFixed(2)}%`;
}

export function FiiHoldings() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <LibraryTile
        icon={<PieChart className="h-4 w-4" />}
        title="FII / DII holdings"
        description="Quarterly shareholding patterns by ownership category, sourced from Screener.in."
        buttonLabel="Lookup symbol"
        meta="Quarterly"
        onClick={() => setOpen(true)}
      />
      {open && <FiiHoldingsDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function FiiHoldingsDialog({ onClose }: { onClose: () => void }) {
  const [symbol, setSymbol] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [stockData, setStockData] = React.useState<StockResp | null>(null);

  async function onLookup(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const sym = symbol.trim().toUpperCase();
      if (!sym) throw new Error("Enter a symbol (e.g. RELIANCE).");
      const r = await fetch(
        `/api/library/fii-holdings/stock?symbol=${encodeURIComponent(sym)}`
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
      setStockData(j as StockResp);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TileModal
        title="FII / DII holdings"
        description="Source: Screener.in shareholding pattern (quarterly)."
        onClose={onClose}
        size="md"
      >
        <form onSubmit={onLookup} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Symbol
            </label>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="RELIANCE"
              autoFocus
              className="h-9 w-full rounded-lg bg-muted/60 px-3 text-[13px] font-mono uppercase tracking-wide text-foreground ring-1 ring-inset ring-border focus:bg-card focus:outline-none focus:ring-2 focus:ring-brand/40"
            />
          </div>

          {err && (
            <div className="rounded-lg border border-destructive/30 bg-destructive-soft px-3 py-2 text-[12px] text-destructive">
              {err}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="brand" size="sm" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Looking up…
                </>
              ) : (
                <>
                  <Search className="h-3.5 w-3.5" />
                  Lookup
                </>
              )}
            </Button>
          </div>
        </form>
      </TileModal>

      {stockData && (
        <StockModal data={stockData} onClose={() => setStockData(null)} />
      )}
    </>
  );
}

interface StockModalProps {
  data: StockResp;
  onClose: () => void;
}
function StockModal({ data, onClose }: StockModalProps) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-foreground/30 p-6 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="my-8 flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-card shadow-pop ring-1 ring-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-3.5">
          <div>
            <h2 className="text-[14px] font-semibold text-foreground">
              {data.symbol}
              {data.name ? ` · ${data.name}` : ""}
            </h2>
            <p className="text-[11px] text-muted-foreground">
              {data.history.length} quarters · {data.source}
              {typeof data.ageDays === "number" && data.ageDays > 0
                ? ` · cached ${data.ageDays}d ago`
                : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full border-separate border-spacing-0 text-[12.5px] tnum">
            <thead>
              <tr>
                {["Quarter", "Promoter", "FII", "DII", "Public+Others"].map(
                  (h) => (
                    <th
                      key={h}
                      className={cn(
                        "sticky top-0 z-10 border-b border-border/60 bg-card px-4 py-2 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
                      )}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {data.history.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-[12.5px] text-muted-foreground"
                  >
                    No shareholding data published.
                  </td>
                </tr>
              )}
              {data.history.map((q) => (
                <tr key={q.quarter} className="hover:bg-accent/40">
                  <td className="border-b border-border-soft px-4 py-1.5 text-foreground/90">
                    {q.quarter}
                  </td>
                  <td className="border-b border-border-soft px-4 py-1.5 text-right font-mono tabular-nums">
                    {fmtPct(q.promoter)}
                  </td>
                  <td className="border-b border-border-soft px-4 py-1.5 text-right font-mono tabular-nums text-emerald-600">
                    {fmtPct(q.fii)}
                  </td>
                  <td className="border-b border-border-soft px-4 py-1.5 text-right font-mono tabular-nums text-sky-600">
                    {fmtPct(q.dii)}
                  </td>
                  <td className="border-b border-border-soft px-4 py-1.5 text-right font-mono tabular-nums">
                    {fmtPct(q.publicAndOthers)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
