"use client";

import * as React from "react";
import { Calculator, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LibraryTile } from "./library-tile";

const DAYS_PER_YEAR = 365.2425;
const MS_PER_DAY = 86_400_000;

type Mode = "dates" | "duration";

export function CagrCalculator() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <LibraryTile
        icon={<Calculator className="h-4 w-4" />}
        title="CAGR calculator"
        description="Compound annual growth rate over any timeframe — exact dates or arbitrary durations, sub-year precise."
        buttonLabel="Open calculator"
        meta="365.2425 / yr"
        onClick={() => setOpen(true)}
      />
      {open && <CagrDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function yearsAgoIso(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

function parseIsoDate(s: string): number | null {
  if (!s) return null;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(t) ? t : null;
}

function parseNumber(s: string): number | null {
  if (s.trim() === "") return null;
  const cleaned = s.replace(/[, ]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function CagrDialog({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = React.useState<Mode>("dates");
  const [start, setStart] = React.useState("");
  const [end, setEnd] = React.useState("");
  const [startDate, setStartDate] = React.useState(yearsAgoIso(3));
  const [endDate, setEndDate] = React.useState(todayIso());
  const [years, setYears] = React.useState("3");
  const [months, setMonths] = React.useState("0");
  const [days, setDays] = React.useState("0");

  const result = React.useMemo(() => {
    const sv = parseNumber(start);
    const ev = parseNumber(end);
    if (sv === null || ev === null) {
      return { ok: false as const, reason: "Enter both values." };
    }
    if (sv <= 0 || ev <= 0) {
      return {
        ok: false as const,
        reason: "Values must be positive — CAGR is undefined for ≤ 0.",
      };
    }

    let fractionalYears: number | null = null;
    let span: { days: number; description: string } | null = null;

    if (mode === "dates") {
      const sd = parseIsoDate(startDate);
      const ed = parseIsoDate(endDate);
      if (sd === null || ed === null) {
        return { ok: false as const, reason: "Enter both dates." };
      }
      if (ed <= sd) {
        return {
          ok: false as const,
          reason: "End date must be after start date.",
        };
      }
      const dayDiff = (ed - sd) / MS_PER_DAY;
      fractionalYears = dayDiff / DAYS_PER_YEAR;
      span = {
        days: dayDiff,
        description: `${dayDiff.toLocaleString(undefined, {
          maximumFractionDigits: 0,
        })} days`,
      };
    } else {
      const y = parseNumber(years) ?? 0;
      const m = parseNumber(months) ?? 0;
      const d = parseNumber(days) ?? 0;
      const total = y + m / 12 + d / DAYS_PER_YEAR;
      if (total <= 0) {
        return {
          ok: false as const,
          reason: "Duration must be greater than zero.",
        };
      }
      fractionalYears = total;
      span = {
        days: total * DAYS_PER_YEAR,
        description: `${y} y · ${m} m · ${d} d`,
      };
    }

    const cagr = Math.pow(ev / sv, 1 / fractionalYears) - 1;
    const totalReturn = ev / sv - 1;
    const multiple = ev / sv;
    const monthly = Math.pow(1 + cagr, 1 / 12) - 1;
    const daily = Math.pow(1 + cagr, 1 / DAYS_PER_YEAR) - 1;
    const doublingYears =
      cagr > 0 ? Math.log(2) / Math.log(1 + cagr) : null;

    return {
      ok: true as const,
      cagr,
      totalReturn,
      multiple,
      monthly,
      daily,
      doublingYears,
      fractionalYears,
      span,
    };
  }, [mode, start, end, startDate, endDate, years, months, days]);

  function reset() {
    setStart("");
    setEnd("");
    setStartDate(yearsAgoIso(3));
    setEndDate(todayIso());
    setYears("3");
    setMonths("0");
    setDays("0");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-2xl rounded-2xl bg-card shadow-xl ring-1 ring-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-foreground">
              CAGR calculator
            </h2>
            <p className="text-[11.5px] text-muted-foreground">
              Compound annual growth rate with proper fractional-year handling.
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

        <div className="px-5 py-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field
              label="Initial value"
              hint="At start of period"
              value={start}
              onChange={setStart}
              placeholder="e.g. 10000"
            />
            <Field
              label="Final value"
              hint="At end of period"
              value={end}
              onChange={setEnd}
              placeholder="e.g. 18250"
            />
          </div>

          <div className="mt-4 flex items-center gap-1.5 rounded-lg border border-border/70 bg-muted/40 p-0.5">
            {(["dates", "duration"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "flex-1 rounded-md px-3 py-1 text-[11.5px] font-medium transition-all",
                  mode === m
                    ? "bg-card text-foreground shadow-sm ring-1 ring-border/60"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {m === "dates" ? "Date range" : "Duration"}
              </button>
            ))}
          </div>

          {mode === "dates" ? (
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field
                label="Start date"
                value={startDate}
                onChange={setStartDate}
                type="date"
              />
              <Field
                label="End date"
                value={endDate}
                onChange={setEndDate}
                type="date"
              />
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-3 gap-3">
              <Field
                label="Years"
                value={years}
                onChange={setYears}
                placeholder="0"
              />
              <Field
                label="Months"
                value={months}
                onChange={setMonths}
                placeholder="0"
              />
              <Field
                label="Days"
                value={days}
                onChange={setDays}
                placeholder="0"
              />
            </div>
          )}

          <div className="mt-5 rounded-xl border border-border/60 bg-muted/30 px-4 py-3.5">
            {result.ok ? (
              <ResultPanel r={result} />
            ) : (
              <p className="text-[12px] text-muted-foreground">
                {result.reason}
              </p>
            )}
          </div>

          <div className="mt-3 text-[10.5px] leading-relaxed text-muted-foreground">
            CAGR = (End / Start)<sup>1 / years</sup> − 1, where years is the
            actual day count divided by 365.2425 — the Gregorian mean year that
            absorbs leap years across long spans.
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border/60 px-5 py-3.5">
          <Button variant="ghost" size="sm" onClick={reset}>
            Reset
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

interface FieldProps {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "date";
}

function Field({ label, hint, value, onChange, placeholder, type = "text" }: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </label>
      <input
        type={type}
        inputMode={type === "text" ? "decimal" : undefined}
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

interface OkResult {
  ok: true;
  cagr: number;
  totalReturn: number;
  multiple: number;
  monthly: number;
  daily: number;
  doublingYears: number | null;
  fractionalYears: number;
  span: { days: number; description: string };
}

function ResultPanel({ r }: { r: OkResult }) {
  const fmtPct = (n: number) =>
    `${n > 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;
  const fmtPctSmall = (n: number) =>
    `${n > 0 ? "+" : ""}${(n * 100).toFixed(4)}%`;
  const fmtX = (n: number) => `${n.toFixed(3)}×`;

  const cagrTone =
    r.cagr > 0
      ? "text-emerald-600"
      : r.cagr < 0
        ? "text-rose-600"
        : "text-foreground";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            CAGR
          </span>
          <span
            className={cn(
              "font-mono text-[28px] font-semibold tabular-nums",
              cagrTone
            )}
          >
            {fmtPct(r.cagr)}
          </span>
        </div>
        <div className="text-right">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Period
          </div>
          <div className="font-mono text-[12px] text-foreground">
            {r.fractionalYears.toFixed(4)} years
          </div>
          <div className="font-mono text-[10.5px] text-muted-foreground">
            {r.span.description}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
        <Stat label="Total return" value={fmtPct(r.totalReturn)} tone={r.totalReturn} />
        <Stat label="Multiple" value={fmtX(r.multiple)} />
        <Stat
          label="Doubling time"
          value={
            r.doublingYears === null
              ? "—"
              : `${r.doublingYears.toFixed(2)} y`
          }
        />
        <Stat label="Monthly equiv." value={fmtPctSmall(r.monthly)} tone={r.monthly} />
        <Stat label="Daily equiv." value={fmtPctSmall(r.daily)} tone={r.daily} />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: number;
}) {
  const cls =
    tone === undefined
      ? "text-foreground"
      : tone > 0
        ? "text-emerald-600"
        : tone < 0
          ? "text-rose-600"
          : "text-foreground";
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </span>
      <span className={cn("font-mono text-[12.5px] tabular-nums", cls)}>
        {value}
      </span>
    </div>
  );
}
