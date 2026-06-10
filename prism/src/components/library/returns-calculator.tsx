"use client";

import * as React from "react";
import {
  Download,
  Loader2,
  PiggyBank,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LibraryTile } from "./library-tile";
import type { LiveValidationDataset } from "@/lib/data/live-validation";
import type { SnapshotRow, SnapshotValue } from "@/lib/data/types";

const STORAGE_KEY = "prism.returns-calculator.trades.v1";

type TradeSource = "manual" | "lv";

interface Trade {
  id: string;
  ticker: string;
  invested: number;
  returnPct: number | null;
  entryDate: string;
  exitDate: string | null;
  source: TradeSource;
}

interface TradeDraft {
  ticker: string;
  invested: string;
  returnPct: string;
  entryDate: string;
  exitDate: string;
}

function computeReceived(t: Trade): number | null {
  if (t.returnPct === null) return null;
  return t.invested * (1 + t.returnPct / 100);
}

function computePnL(t: Trade): number | null {
  if (t.returnPct === null) return null;
  return (t.invested * t.returnPct) / 100;
}

function blankDraft(): TradeDraft {
  return {
    ticker: "",
    invested: "",
    returnPct: "",
    entryDate: new Date().toISOString().slice(0, 10),
    exitDate: "",
  };
}

function draftFromTrade(t: Trade): TradeDraft {
  return {
    ticker: t.ticker,
    invested: String(t.invested),
    returnPct: t.returnPct === null ? "" : String(t.returnPct),
    entryDate: t.entryDate,
    exitDate: t.exitDate ?? "",
  };
}

function parseNumber(s: string): number | null {
  const cleaned = s.replace(/[, ₹$]/g, "").trim();
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function snapshotNumber(v: SnapshotValue | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[, %₹]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function snapshotString(v: SnapshotValue | undefined): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function normalizeDate(raw: string): string | null {
  if (!raw) return null;
  const t = Date.parse(raw);
  if (Number.isFinite(t)) {
    return new Date(t).toISOString().slice(0, 10);
  }
  const m = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    const dd = m[1].padStart(2, "0");
    const mm = m[2].padStart(2, "0");
    let yy = m[3];
    if (yy.length === 2) yy = (Number(yy) > 50 ? "19" : "20") + yy;
    return `${yy}-${mm}-${dd}`;
  }
  return null;
}

function isBuyPrediction(v: string): boolean {
  const k = v.toLowerCase();
  return k === "buy" || k === "long";
}

function isClosedStatus(v: string): boolean {
  const k = v.toLowerCase();
  return k === "close" || k === "closed" || k === "exit" || k === "exited";
}

function genId(): string {
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function loadTrades(): Trade[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((r) => {
      const row = r as Partial<Trade> & { received?: number | null };
      const source: TradeSource = row.source === "lv" ? "lv" : "manual";
      if (typeof row.returnPct === "number" || row.returnPct === null) {
        return { ...(row as Trade), source };
      }
      const invested = Number(row.invested ?? 0);
      const received = row.received;
      const returnPct =
        received === null || received === undefined || invested <= 0
          ? null
          : ((received - invested) / invested) * 100;
      return {
        id: String(row.id ?? genId()),
        ticker: String(row.ticker ?? ""),
        invested,
        returnPct,
        entryDate: String(row.entryDate ?? ""),
        exitDate: row.exitDate ?? null,
        source,
      } satisfies Trade;
    });
  } catch {
    return [];
  }
}

function saveTrades(trades: Trade[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
  } catch {
    // ignore quota errors
  }
}

export function ReturnsCalculator() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <LibraryTile
        icon={<PiggyBank className="h-4 w-4" />}
        title="Returns calculator"
        description="Track per-stock invested capital and realised returns. Filter by period for cash-in vs. cash-out."
        buttonLabel="Open calculator"
        meta="Local · per trade"
        onClick={() => setOpen(true)}
      />
      {open && <ReturnsDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function ReturnsDialog({ onClose }: { onClose: () => void }) {
  const [trades, setTrades] = React.useState<Trade[]>([]);
  const [hydrated, setHydrated] = React.useState(false);
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [editing, setEditing] = React.useState<null | {
    id: string | null;
    draft: TradeDraft;
  }>(null);
  const [fetching, setFetching] = React.useState(false);

  function applyFetchedTrades(fetched: Trade[], mode: "replace" | "append") {
    setTrades((prev) => {
      if (mode === "replace") {
        const manual = prev.filter((t) => t.source !== "lv");
        return [...manual, ...fetched];
      }
      const seen = new Set(
        prev.map((t) => `${t.ticker}__${t.entryDate}__${t.exitDate ?? ""}`)
      );
      const additions = fetched.filter(
        (t) => !seen.has(`${t.ticker}__${t.entryDate}__${t.exitDate ?? ""}`)
      );
      return [...prev, ...additions];
    });
    setFetching(false);
  }

  React.useEffect(() => {
    setTrades(loadTrades());
    setHydrated(true);
  }, []);

  React.useEffect(() => {
    if (hydrated) saveTrades(trades);
  }, [trades, hydrated]);

  const totals = React.useMemo(() => {
    let invested = 0;
    let receivedClosed = 0;
    let investedClosed = 0;
    let closed = 0;
    let openCount = 0;
    for (const t of trades) {
      invested += t.invested;
      const rec = computeReceived(t);
      if (rec !== null) {
        receivedClosed += rec;
        investedClosed += t.invested;
        closed++;
      } else {
        openCount++;
      }
    }
    const net = receivedClosed - investedClosed;
    return {
      invested,
      received: receivedClosed,
      net,
      roi: investedClosed > 0 ? net / investedClosed : null,
      closed,
      openCount,
      total: trades.length,
    };
  }, [trades]);

  const periodTotals = React.useMemo(() => {
    if (!from && !to) return null;
    const fromMs = from ? Date.parse(`${from}T00:00:00Z`) : -Infinity;
    const toMs = to ? Date.parse(`${to}T23:59:59Z`) : Infinity;
    let invested = 0;
    let received = 0;
    let invTrades = 0;
    let recTrades = 0;
    for (const t of trades) {
      const ent = Date.parse(`${t.entryDate}T00:00:00Z`);
      if (Number.isFinite(ent) && ent >= fromMs && ent <= toMs) {
        invested += t.invested;
        invTrades++;
      }
      const rec = computeReceived(t);
      if (t.exitDate && rec !== null) {
        const ex = Date.parse(`${t.exitDate}T00:00:00Z`);
        if (Number.isFinite(ex) && ex >= fromMs && ex <= toMs) {
          received += rec;
          recTrades++;
        }
      }
    }
    return {
      invested,
      received,
      net: received - invested,
      roi: invested > 0 ? (received - invested) / invested : null,
      invTrades,
      recTrades,
    };
  }, [trades, from, to]);

  function handleSave() {
    if (!editing) return;
    const { draft, id } = editing;
    const invested = parseNumber(draft.invested);
    const returnPct = parseNumber(draft.returnPct);
    const ticker = draft.ticker.trim().toUpperCase();
    if (!ticker || invested === null || invested <= 0) return;
    if (!draft.entryDate) return;
    const next: Trade = {
      id: id ?? genId(),
      ticker,
      invested,
      returnPct,
      entryDate: draft.entryDate,
      exitDate: draft.exitDate || null,
      source: "manual",
    };
    setTrades((prev) => {
      if (id) return prev.map((t) => (t.id === id ? next : t));
      return [...prev, next];
    });
    setEditing(null);
  }

  function handleDelete(id: string) {
    setTrades((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-5xl rounded-2xl bg-card shadow-xl ring-1 ring-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-foreground">
              Returns calculator
            </h2>
            <p className="text-[11.5px] text-muted-foreground">
              Per-stock invested capital and realised returns with date-range
              cash-flow view.
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

        <div className="flex flex-col gap-4 px-5 py-4">
          <SummaryCard title="All time" totals={totals} />

          <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  From
                </label>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="h-8 rounded-md bg-card px-2.5 text-[12.5px] text-foreground ring-1 ring-inset ring-border focus:outline-none focus:ring-2 focus:ring-brand/40"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  To
                </label>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="h-8 rounded-md bg-card px-2.5 text-[12.5px] text-foreground ring-1 ring-inset ring-border focus:outline-none focus:ring-2 focus:ring-brand/40"
                />
              </div>
              {(from || to) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFrom("");
                    setTo("");
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                  Clear range
                </Button>
              )}
              <p className="ml-auto max-w-[260px] text-[10.5px] leading-relaxed text-muted-foreground">
                Invested counts entries in range; Received counts exits in
                range — the realised cash flow during the window.
              </p>
            </div>
            {periodTotals && (
              <div className="mt-3">
                <PeriodSummary totals={periodTotals} from={from} to={to} />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              Trades · {trades.length}
              {trades.some((t) => t.source === "lv") && (
                <span className="ml-2 inline-flex items-center rounded-full bg-brand-soft/60 px-2 py-0.5 text-[10px] font-medium text-foreground ring-1 ring-inset ring-brand/20">
                  {trades.filter((t) => t.source === "lv").length} from LV
                </span>
              )}
            </span>
            <div className="flex items-center gap-2">
              {trades.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Delete all ${trades.length} trade${trades.length === 1 ? "" : "s"}? This cannot be undone.`
                      )
                    ) {
                      setTrades([]);
                    }
                  }}
                  className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                  title="Delete all trades"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFetching(true)}
              >
                <Download className="h-3.5 w-3.5" />
                Fetch from LV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing({ id: null, draft: blankDraft() })}
              >
                <Plus className="h-3.5 w-3.5" />
                Add trade
              </Button>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border/60">
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full border-separate border-spacing-0 text-[12px] tnum">
                <thead>
                  <tr>
                    {[
                      "Ticker",
                      "Invested",
                      "Return %",
                      "Received",
                      "P&L",
                      "Entry",
                      "Exit",
                      "",
                    ].map((h, i) => (
                      <th
                        key={h + i}
                        className={cn(
                          "sticky top-0 z-10 whitespace-nowrap border-b border-border/60 bg-gradient-to-b from-card to-card/95 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80",
                          (h === "Invested" ||
                            h === "Return %" ||
                            h === "Received" ||
                            h === "P&L") &&
                            "text-right"
                        )}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {trades.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-4 py-10 text-center text-[12px] text-muted-foreground"
                      >
                        No trades yet. Add one to start tracking.
                      </td>
                    </tr>
                  ) : (
                    trades.map((t) => {
                      const received = computeReceived(t);
                      const pnl = computePnL(t);
                      const tone =
                        pnl === null
                          ? "neutral"
                          : pnl > 0
                            ? "pos"
                            : pnl < 0
                              ? "neg"
                              : "neutral";
                      return (
                        <tr
                          key={t.id}
                          className="border-b border-border/40 last:border-b-0 hover:bg-muted/30"
                        >
                          <td className="px-3 py-2 font-mono text-[12px] font-semibold">
                            {t.ticker}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">
                            {fmtMoney(t.invested)}
                          </td>
                          <td
                            className={cn(
                              "px-3 py-2 text-right font-mono tabular-nums",
                              tone === "pos" && "text-emerald-600",
                              tone === "neg" && "text-rose-600"
                            )}
                          >
                            {t.returnPct === null ? (
                              <span className="text-muted-foreground">
                                Open
                              </span>
                            ) : (
                              fmtPct(t.returnPct / 100)
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">
                            {received === null ? (
                              <span className="text-muted-foreground/60">
                                —
                              </span>
                            ) : (
                              fmtMoney(received)
                            )}
                          </td>
                          <td
                            className={cn(
                              "px-3 py-2 text-right font-mono tabular-nums",
                              tone === "pos" && "text-emerald-600",
                              tone === "neg" && "text-rose-600"
                            )}
                          >
                            {pnl === null ? (
                              <span className="text-muted-foreground/60">
                                —
                              </span>
                            ) : (
                              fmtSignedMoney(pnl)
                            )}
                          </td>
                          <td className="px-3 py-2 font-mono text-[11.5px] text-muted-foreground">
                            {t.entryDate}
                          </td>
                          <td className="px-3 py-2 font-mono text-[11.5px] text-muted-foreground">
                            {t.exitDate ?? (
                              <span className="text-muted-foreground/60">
                                —
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  setEditing({
                                    id: t.id,
                                    draft: draftFromTrade(t),
                                  })
                                }
                                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                                title="Edit"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(t.id)}
                                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
                                title="Delete"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border/60 px-5 py-3.5">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      {editing && (
        <TradeEditor
          draft={editing.draft}
          isNew={editing.id === null}
          onChange={(next) =>
            setEditing((prev) => (prev ? { ...prev, draft: next } : prev))
          }
          onCancel={() => setEditing(null)}
          onSave={handleSave}
        />
      )}

      {fetching && (
        <FetchFromLvDialog
          existingLvCount={trades.filter((t) => t.source === "lv").length}
          onCancel={() => setFetching(false)}
          onApply={applyFetchedTrades}
        />
      )}
    </div>
  );
}

interface SummaryCardProps {
  title: string;
  totals: {
    invested: number;
    received: number;
    net: number;
    roi: number | null;
    closed: number;
    openCount: number;
    total: number;
  };
}

function SummaryCard({ title, totals }: SummaryCardProps) {
  const tone =
    totals.net > 0 ? "pos" : totals.net < 0 ? "neg" : "neutral";
  return (
    <div className="rounded-xl border border-border/60 bg-card px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {title}
        </span>
        <span className="font-mono text-[10.5px] text-muted-foreground">
          {totals.total} trades · {totals.closed} closed · {totals.openCount}{" "}
          open
        </span>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Invested" value={fmtMoney(totals.invested)} />
        <Stat label="Received" value={fmtMoney(totals.received)} />
        <Stat
          label="Net P&L"
          value={fmtSignedMoney(totals.net)}
          tone={tone}
          big
        />
        <Stat
          label="Net ROI"
          value={totals.roi === null ? "—" : fmtPct(totals.roi)}
          tone={tone}
          big
        />
      </div>
    </div>
  );
}

interface PeriodSummaryProps {
  totals: {
    invested: number;
    received: number;
    net: number;
    roi: number | null;
    invTrades: number;
    recTrades: number;
  };
  from: string;
  to: string;
}

function PeriodSummary({ totals, from, to }: PeriodSummaryProps) {
  const tone =
    totals.net > 0 ? "pos" : totals.net < 0 ? "neg" : "neutral";
  const rangeLabel =
    from && to
      ? `${from} → ${to}`
      : from
        ? `${from} →`
        : `→ ${to}`;
  return (
    <div className="rounded-lg border border-brand/20 bg-brand-soft/40 px-3.5 py-2.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-foreground">
          In period · {rangeLabel}
        </span>
        <span className="font-mono text-[10.5px] text-muted-foreground">
          {totals.invTrades} entries · {totals.recTrades} exits
        </span>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat
          label="Invested"
          value={fmtMoney(totals.invested)}
          hint="entries in range"
        />
        <Stat
          label="Received"
          value={fmtMoney(totals.received)}
          hint="exits in range"
        />
        <Stat
          label="Net cash flow"
          value={fmtSignedMoney(totals.net)}
          tone={tone}
        />
        <Stat
          label="ROI"
          value={totals.roi === null ? "—" : fmtPct(totals.roi)}
          tone={tone}
        />
      </div>
    </div>
  );
}

interface TradeEditorProps {
  draft: TradeDraft;
  isNew: boolean;
  onChange: (next: TradeDraft) => void;
  onCancel: () => void;
  onSave: () => void;
}

function TradeEditor({
  draft,
  isNew,
  onChange,
  onCancel,
  onSave,
}: TradeEditorProps) {
  function set<K extends keyof TradeDraft>(key: K, value: TradeDraft[K]) {
    onChange({ ...draft, [key]: value });
  }

  const investedNum = parseNumber(draft.invested);
  const canSave =
    draft.ticker.trim() !== "" &&
    investedNum !== null &&
    investedNum > 0 &&
    !!draft.entryDate;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-6 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="my-8 w-full max-w-xl rounded-2xl bg-card shadow-xl ring-1 ring-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
          <h3 className="text-[14px] font-semibold text-foreground">
            {isNew ? "Add trade" : "Edit trade"}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-2">
          <EditorField
            label="Ticker"
            value={draft.ticker}
            onChange={(v) => set("ticker", v)}
            placeholder="e.g. RELIANCE"
          />
          <EditorField
            label="Invested (₹)"
            value={draft.invested}
            onChange={(v) => set("invested", v)}
            placeholder="e.g. 50000"
            inputMode="decimal"
          />
          <EditorField
            label="Return %"
            hint="e.g. 25 for +25%, -10 for −10%. Blank = open position."
            value={draft.returnPct}
            onChange={(v) => set("returnPct", v)}
            placeholder="e.g. 25"
            inputMode="decimal"
          />
          <EditorField
            label="Entry date"
            value={draft.entryDate}
            onChange={(v) => set("entryDate", v)}
            type="date"
          />
          <EditorField
            label="Exit date"
            hint="Leave blank for open position"
            value={draft.exitDate}
            onChange={(v) => set("exitDate", v)}
            type="date"
          />
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border/60 px-5 py-3.5">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onSave}
            disabled={!canSave}
          >
            {isNew ? "Add" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface FetchFromLvDialogProps {
  existingLvCount: number;
  onCancel: () => void;
  onApply: (trades: Trade[], mode: "replace" | "append") => void;
}

type LvModelChoice = "all" | "M7" | "M7.1";

function mapLvRowsToTrades(
  rows: SnapshotRow[],
  model: LvModelChoice,
  investedPerTrade: number
): { trades: Trade[]; skipped: number } {
  const out: Trade[] = [];
  let skipped = 0;
  for (const r of rows) {
    const m = snapshotString(r["Model"]);
    if (model !== "all" && m !== model) continue;
    const pred = snapshotString(r["Prediction"]).toLowerCase();
    if (!isBuyPrediction(pred)) continue;
    const status = snapshotString(r["Position Status"]).toLowerCase();
    if (!isClosedStatus(status)) continue;

    const ticker = snapshotString(r["Ticker"]).toUpperCase();
    const entryRaw = snapshotString(r["Entry Date"]);
    const exitRaw = snapshotString(r["Exit Date"]);
    const pct = snapshotNumber(r["Win/Loss %"]);
    const entryDate = normalizeDate(entryRaw);
    const exitDate = normalizeDate(exitRaw);

    if (!ticker || !entryDate || !exitDate || pct === null) {
      skipped++;
      continue;
    }
    out.push({
      id: genId(),
      ticker,
      invested: investedPerTrade,
      returnPct: pct,
      entryDate,
      exitDate,
      source: "lv",
    });
  }
  return { trades: out, skipped };
}

function FetchFromLvDialog({
  existingLvCount,
  onCancel,
  onApply,
}: FetchFromLvDialogProps) {
  const [model, setModel] = React.useState<LvModelChoice>("all");
  const [investedStr, setInvestedStr] = React.useState("10000");
  const [mode, setMode] = React.useState<"replace" | "append">("replace");
  const [dataset, setDataset] = React.useState<LiveValidationDataset | null>(
    null
  );
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/live-validation", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as LiveValidationDataset;
        if (!cancelled) setDataset(json);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to fetch");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const invested = parseNumber(investedStr);

  const preview = React.useMemo(() => {
    if (!dataset || invested === null || invested <= 0) {
      return { trades: [] as Trade[], skipped: 0 };
    }
    return mapLvRowsToTrades(dataset.rows, model, invested);
  }, [dataset, model, invested]);

  const canApply =
    !loading && !error && invested !== null && invested > 0 && preview.trades.length > 0;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-6 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="my-8 w-full max-w-xl rounded-2xl bg-card shadow-xl ring-1 ring-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
          <div>
            <h3 className="text-[14px] font-semibold text-foreground">
              Fetch from Live Validation
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Imports buy predictions whose positions are closed, with their
              entry/exit dates and Win/Loss % as the return.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          <div className="flex flex-col gap-1">
            <label className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              Model
            </label>
            <div className="inline-flex rounded-lg border border-border/70 bg-muted/40 p-0.5">
              {(["all", "M7", "M7.1"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setModel(m)}
                  className={cn(
                    "rounded-md px-3 py-1 text-[11.5px] font-medium transition-all",
                    model === m
                      ? "bg-card text-foreground shadow-sm ring-1 ring-border/60"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {m === "all" ? "All models" : m}
                </button>
              ))}
            </div>
          </div>

          <EditorField
            label="Invested per trade (₹)"
            hint="Applied uniformly to every imported trade."
            value={investedStr}
            onChange={setInvestedStr}
            placeholder="10000"
            inputMode="decimal"
          />

          <div className="flex flex-col gap-1">
            <label className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              On apply
            </label>
            <div className="flex flex-col gap-1.5 rounded-lg border border-border/70 bg-muted/30 p-2.5">
              <RadioRow
                checked={mode === "replace"}
                onChange={() => setMode("replace")}
                label="Replace existing LV trades"
                hint={`Removes the ${existingLvCount} LV-sourced trade${existingLvCount === 1 ? "" : "s"} currently in the table. Manual trades are kept.`}
              />
              <RadioRow
                checked={mode === "append"}
                onChange={() => setMode("append")}
                label="Append (skip duplicates)"
                hint="Adds new trades; rows with the same ticker + entry + exit dates are skipped."
              />
            </div>
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/30 px-3.5 py-2.5 text-[11.5px]">
            {loading && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading Live Validation dataset…
              </div>
            )}
            {error && (
              <div className="text-rose-600">
                Failed to load LV: {error}
              </div>
            )}
            {!loading && !error && (
              <div className="flex flex-col gap-1">
                <div>
                  <span className="font-mono text-foreground">
                    {preview.trades.length}
                  </span>{" "}
                  buy-closed trade{preview.trades.length === 1 ? "" : "s"} ready
                  to import
                  {model !== "all" && (
                    <span className="text-muted-foreground">
                      {" "}
                      ({model} only)
                    </span>
                  )}
                  .
                </div>
                {preview.skipped > 0 && (
                  <div className="text-muted-foreground">
                    {preview.skipped} row{preview.skipped === 1 ? "" : "s"}{" "}
                    skipped (missing ticker, dates, or Win/Loss %).
                  </div>
                )}
                {invested !== null && invested > 0 && preview.trades.length > 0 && (
                  <div className="text-muted-foreground">
                    Total capital deployed:{" "}
                    <span className="font-mono text-foreground">
                      {fmtMoney(invested * preview.trades.length)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border/60 px-5 py-3.5">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="brand"
            size="sm"
            disabled={!canApply}
            onClick={() => onApply(preview.trades, mode)}
          >
            <Download className="h-3.5 w-3.5" />
            Import {preview.trades.length || ""}
          </Button>
        </div>
      </div>
    </div>
  );
}

function RadioRow({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-md px-1 py-1 hover:bg-accent/40">
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 h-3.5 w-3.5 accent-brand"
      />
      <span className="flex flex-col">
        <span className="text-[12px] font-medium text-foreground">{label}</span>
        {hint && (
          <span className="text-[10.5px] text-muted-foreground">{hint}</span>
        )}
      </span>
    </label>
  );
}

interface EditorFieldProps {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "date";
  inputMode?: "decimal" | "text";
}

function EditorField({
  label,
  hint,
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
}: EditorFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </label>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 rounded-md bg-muted/60 px-2.5 text-[12.5px] text-foreground ring-1 ring-inset ring-border focus:bg-card focus:outline-none focus:ring-2 focus:ring-brand/40"
      />
      {hint && (
        <span className="text-[10.5px] text-muted-foreground/80">{hint}</span>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  big,
  hint,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg" | "neutral";
  big?: boolean;
  hint?: string;
}) {
  const cls =
    tone === "pos"
      ? "text-emerald-600"
      : tone === "neg"
        ? "text-rose-600"
        : "text-foreground";
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "font-mono tabular-nums",
          big ? "text-[16px] font-semibold" : "text-[13px]",
          cls
        )}
      >
        {value}
      </span>
      {hint && (
        <span className="text-[10px] text-muted-foreground/80">{hint}</span>
      )}
    </div>
  );
}

function fmtMoney(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function fmtSignedMoney(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}₹${Math.abs(n).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;
}

function fmtPct(n: number): string {
  return `${n > 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;
}
