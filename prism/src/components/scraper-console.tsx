"use client";

import * as React from "react";
import {
  Eye,
  EyeOff,
  KeyRound,
  Play,
  Square,
  Trash2,
  Terminal as TerminalIcon,
  Settings2,
  TableIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type {
  ScraperJobState,
  ScraperLogLine,
} from "@/lib/scraper-runner";

type ProgressRow = Record<string, string | number | null>;

interface ProgressPayload {
  exists: boolean;
  columns: string[];
  rows: ProgressRow[];
  updatedAt: string | null;
}

export function ScraperConsole() {
  const [state, setState] = React.useState<ScraperJobState | null>(null);
  const [logs, setLogs] = React.useState<ScraperLogLine[]>([]);
  const [autoScroll, setAutoScroll] = React.useState(true);
  const [showStderr, setShowStderr] = React.useState(true);
  const [headless, setHeadless] = React.useState(true);
  const [scrapeOnly, setScrapeOnly] = React.useState(false);
  const [skipScrape, setSkipScrape] = React.useState(false);
  const [resume, setResume] = React.useState<string>("");
  const [progress, setProgress] = React.useState<ProgressPayload | null>(null);
  const consoleRef = React.useRef<HTMLDivElement>(null);
  const progressRef = React.useRef<HTMLDivElement>(null);

  // Subscribe to SSE log stream
  React.useEffect(() => {
    const es = new EventSource("/api/scraper/logs");
    es.addEventListener("log", (e) => {
      try {
        const line = JSON.parse((e as MessageEvent).data) as ScraperLogLine;
        setLogs((prev) => {
          const next = [...prev, line];
          if (next.length > 2000) next.splice(0, next.length - 2000);
          return next;
        });
      } catch {
        /* ignore */
      }
    });
    es.addEventListener("state", (e) => {
      try {
        const s = JSON.parse((e as MessageEvent).data) as ScraperJobState;
        setState(s);
      } catch {
        /* ignore */
      }
    });
    es.onerror = () => {
      // Browser will auto-reconnect.
    };
    return () => {
      es.close();
    };
  }, []);

  // Initial state fetch (in case SSE delivers state late)
  React.useEffect(() => {
    fetch("/api/scraper/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j?.state) setState(j.state);
        if (Array.isArray(j?.logs)) setLogs(j.logs);
      })
      .catch(() => {});
  }, []);

  // Auto-scroll bottom
  React.useEffect(() => {
    if (!autoScroll || !consoleRef.current) return;
    consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [logs, autoScroll]);

  // Poll the in-progress CSV. Fast while running (2s), slower when idle (10s).
  const running = state?.running ?? false;
  React.useEffect(() => {
    let cancelled = false;
    const fetchProgress = async () => {
      try {
        const r = await fetch("/api/scraper/progress", { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as ProgressPayload;
        if (!cancelled) setProgress(j);
      } catch {
        /* ignore */
      }
    };
    fetchProgress();
    const interval = running ? 2000 : 10000;
    const id = setInterval(fetchProgress, interval);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [running]);

  // Auto-scroll the progress table to show the latest row while running.
  React.useEffect(() => {
    if (!running || !progressRef.current) return;
    progressRef.current.scrollTop = progressRef.current.scrollHeight;
  }, [progress, running]);

  const visibleLogs = React.useMemo(
    () => (showStderr ? logs : logs.filter((l) => l.stream !== "stderr")),
    [logs, showStderr]
  );

  async function safeJson(res: Response): Promise<unknown> {
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return { error: text.slice(0, 500) };
    }
  }

  async function startScrape() {
    const body: Record<string, unknown> = {
      noHeadless: !headless,
      scrapeOnly,
      skipScrape,
    };
    const r = Number(resume);
    if (Number.isFinite(r) && r > 0) body.resume = r;
    const res = await fetch("/api/scraper/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await safeJson(res)) as ScraperJobState | null;
    if (j) setState(j);
  }

  async function stopScrape() {
    const res = await fetch("/api/scraper/stop", { method: "POST" });
    const j = (await safeJson(res)) as { state?: ScraperJobState } | null;
    if (j?.state) setState(j.state);
  }

  async function authenticate() {
    try {
      const res = await fetch("/api/scraper/authenticate", { method: "POST" });
      const j = (await safeJson(res)) as
        | (ScraperJobState & { error?: string })
        | null;
      if (j && "running" in j) setState(j as ScraperJobState);
      if (!res.ok) {
        const msg = (j as { error?: string } | null)?.error ?? res.statusText;
        alert(`Authenticate failed: ${msg}`);
      }
    } catch (err) {
      alert(`Authenticate failed: ${(err as Error).message}`);
    }
  }

  function clearLogs() {
    setLogs([]);
  }

  const startedAt = state?.startedAt
    ? new Date(state.startedAt).toLocaleTimeString()
    : null;
  const exitCode = state?.exitCode;

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-8 animate-fade-in-up">
      <PageHeader
        eyebrow="Operations"
        title="Scraper control"
        description="Launch, monitor, and pause the MarketSmith scraper. Streams stdout/stderr in real time. The launchd schedule continues to run independently."
        actions={
          <>
            {running ? (
              <Badge tone="success" dot pulse>
                Running{startedAt ? ` · ${startedAt}` : ""}
              </Badge>
            ) : (
              <Badge tone="neutral" dot>
                Idle
              </Badge>
            )}
            {exitCode !== null && exitCode !== undefined && (
              <Badge tone={exitCode === 0 ? "success" : "danger"}>
                Last exit: {exitCode}
              </Badge>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr]">
        {/* Options card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              Run options
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <ToggleRow
              label="Headless browser"
              hint="Run Playwright headless (recommended)"
              checked={headless}
              onChange={setHeadless}
            />
            <Divider />
            <ToggleRow
              label="Scrape only"
              hint="Skip the Parquet archive step"
              checked={scrapeOnly}
              onChange={(v) => {
                setScrapeOnly(v);
                if (v) setSkipScrape(false);
              }}
            />
            <Divider />
            <ToggleRow
              label="Skip scrape"
              hint="Use existing CSV, archive only"
              checked={skipScrape}
              onChange={(v) => {
                setSkipScrape(v);
                if (v) setScrapeOnly(false);
              }}
            />
            <Divider />
            <div className="py-3">
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Resume from #
              </label>
              <input
                type="number"
                min={0}
                value={resume}
                onChange={(e) => setResume(e.target.value)}
                placeholder="Start from beginning"
                className="h-9 w-full rounded-lg bg-card px-3 text-[13px] shadow-xs ring-1 ring-inset ring-border transition-all hover:ring-border focus:ring-2 focus:ring-brand/40 focus:outline-none"
              />
            </div>

            <div className="mt-2 flex flex-col gap-2 border-t border-border/60 pt-4">
              <Button
                onClick={startScrape}
                disabled={running}
                variant="default"
                size="md"
                className="w-full"
              >
                <Play className="h-4 w-4" strokeWidth={2.5} />
                Start scraper
              </Button>
              <Button
                onClick={stopScrape}
                disabled={!running}
                variant="danger"
                size="md"
                className="w-full"
              >
                <Square className="h-3.5 w-3.5" strokeWidth={2.5} />
                Stop
              </Button>
              <Button
                onClick={authenticate}
                variant="outline"
                size="md"
                className="w-full"
                title="Stop anything running, then launch a visible Chromium to sign in and refresh auth.json"
              >
                <KeyRound className="h-3.5 w-3.5" strokeWidth={2.5} />
                Authenticate MarketSmith
              </Button>
              <p className="px-0.5 text-[11px] leading-snug text-muted-foreground">
                Opens a browser window to sign in. Use this when
                <code className="ml-1 rounded bg-muted px-1 py-[1px] font-mono text-[10.5px] text-foreground/70">
                  auth.json
                </code>
                {" "}is missing or the session has expired. If the scraper is
                running, it will be stopped first.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Console card */}
        <Card flat className="overflow-hidden">
          <CardHeader className="border-b border-border/60 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <TerminalIcon className="h-4 w-4 text-muted-foreground" />
                Live output
                <span className="ml-1 rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {logs.length}
                </span>
              </CardTitle>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAutoScroll((v) => !v)}
                >
                  {autoScroll ? (
                    <>
                      <EyeOff className="h-3.5 w-3.5" />
                      Pause scroll
                    </>
                  ) : (
                    <>
                      <Eye className="h-3.5 w-3.5" />
                      Auto-scroll
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowStderr((v) => !v)}
                >
                  stderr · {showStderr ? "on" : "off"}
                </Button>
                <Button onClick={clearLogs} variant="ghost" size="sm">
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear
                </Button>
              </div>
            </div>
          </CardHeader>
          <div className="relative overflow-hidden rounded-b-2xl">
            {/* Terminal chrome — macOS window buttons */}
            <div className="flex items-center gap-2 border-b border-white/[0.06] bg-[#1a1b26] px-4 py-3">
              <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
              <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
              <span className="h-3 w-3 rounded-full bg-[#28c840]" />
              <span className="ml-4 font-mono text-[11px] tracking-wide text-white/30">
                run_and_archive.py
              </span>
            </div>
            <div
              ref={consoleRef}
              className="h-[64vh] overflow-auto bg-[#1a1b26] p-5 font-mono text-[12px] leading-[1.6] text-[#c0caf5]"
            >
              {visibleLogs.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-white/25">
                  <TerminalIcon className="h-10 w-10" />
                  <p className="text-[13px]">
                    No output yet. Click{" "}
                    <span className="text-white/60 font-medium">Start scraper</span> to launch.
                  </p>
                </div>
              ) : (
                visibleLogs.map((l, i) => (
                  <div
                    key={i}
                    className={cn(
                      "group flex items-start gap-3 whitespace-pre-wrap py-0.5 animate-fade-in",
                      l.stream === "stderr" && "text-[#f7768e]",
                      l.stream === "system" && "text-[#e0af68]"
                    )}
                  >
                    <span className="select-none text-[11px] text-white/20 group-hover:text-white/40">
                      {new Date(l.ts).toLocaleTimeString([], { hour12: false })}
                    </span>
                    <span className="flex-1">{l.text}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </Card>
      </div>

      <LiveProgressTable
        progress={progress}
        running={running}
        tableRef={progressRef}
      />

      <Card className="mt-6">
        <CardContent className="py-4 text-[12.5px] leading-relaxed text-muted-foreground">
          The scraper is launched via{" "}
          <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11.5px] text-foreground/70">
            {`{PRISM_PYTHON} run_and_archive.py`}
          </code>{" "}
          in the Dash directory. Output and archive go to{" "}
          <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11.5px] text-foreground/70">
            history/*.parquet
          </code>{" "}
          and{" "}
          <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11.5px] text-foreground/70">
            latest.parquet
          </code>{" "}
          exactly as the launchd job does.
        </CardContent>
      </Card>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      onClick={() => onChange(!checked)}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onChange(!checked);
        }
      }}
      role="button"
      tabIndex={0}
      aria-pressed={checked}
      className="press group -mx-2 flex cursor-pointer items-start justify-between gap-3 rounded-md px-2 py-3 text-left transform-gpu hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[13px] font-medium text-foreground">{label}</span>
        {hint && (
          <span className="text-[11.5px] leading-snug text-muted-foreground">
            {hint}
          </span>
        )}
      </div>
      <div
        className="pt-0.5"
        onClick={(e) => e.stopPropagation()}
      >
        <Switch checked={checked} onChange={onChange} aria-label={label} />
      </div>
    </div>
  );
}

function Divider() {
  return <div className="hairline" />;
}

const PREFERRED_PROGRESS_COLUMNS = [
  "Ticker",
  "Status",
  "Master_Rating",
  "EPS_Strength_Rating",
  "EPS_Strength_Score",
  "Price_Strength_Rating",
  "Price_Strength_Score",
  "Buyer_Demand_Rating",
  "Buyer_Demand_Score",
  "Group_Rank_Rating",
  "Group_Rank_Score",
];

function LiveProgressTable({
  progress,
  running,
  tableRef,
}: {
  progress: ProgressPayload | null;
  running: boolean;
  tableRef: React.RefObject<HTMLDivElement | null>;
}) {
  const columns = progress?.columns ?? [];
  const rows = progress?.rows ?? [];
  const present = new Set(columns);
  const ordered = PREFERRED_PROGRESS_COLUMNS.filter((c) => present.has(c));
  const rest = columns.filter((c) => !PREFERRED_PROGRESS_COLUMNS.includes(c));
  const cols = [...ordered, ...rest];

  if (!progress || !progress.exists) return null;

  const successCount = rows.filter(
    (r) => r["Master_Rating"] !== null && r["Master_Rating"] !== undefined && r["Master_Rating"] !== ""
  ).length;

  const updatedLabel = progress.updatedAt
    ? new Date(progress.updatedAt).toLocaleTimeString()
    : "—";

  return (
    <Card flat className="mt-6 overflow-hidden">
      <CardHeader className="border-b border-border/60 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <TableIcon className="h-4 w-4 text-muted-foreground" />
            Live output CSV
            <span className="ml-1 rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {progress.rows.length} rows · {successCount} ✓
            </span>
          </CardTitle>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            {running && (
              <Badge tone="success" dot pulse>
                Live
              </Badge>
            )}
            <span>Updated · {updatedLabel}</span>
          </div>
        </div>
      </CardHeader>
      <div
        ref={tableRef}
        className="max-h-[50vh] overflow-auto"
      >
        <table className="w-full border-separate border-spacing-0 text-[12px] tnum">
          <thead>
            <tr>
              {cols.map((c) => (
                <th
                  key={c}
                  className="sticky top-0 z-10 whitespace-nowrap border-b border-border/60 bg-card px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {progress.rows.map((row, i) => {
              const ok =
                row["Master_Rating"] !== null &&
                row["Master_Rating"] !== undefined &&
                row["Master_Rating"] !== "";
              return (
                <tr
                  key={`${row["Ticker"] ?? i}-${i}`}
                  className={cn(
                    "transition-colors hover:bg-accent/40",
                    !ok && "bg-rose-50/30"
                  )}
                >
                  {cols.map((c) => {
                    const v = row[c];
                    const isNum = typeof v === "number";
                    const display =
                      v === null || v === undefined || v === ""
                        ? "—"
                        : String(v);
                    return (
                      <td
                        key={c}
                        className={cn(
                          "whitespace-nowrap border-b border-border-soft px-3 py-1.5 align-middle",
                          isNum
                            ? "text-right font-mono tabular-nums"
                            : "text-foreground/90",
                          (v === null || v === undefined || v === "") &&
                            "text-muted-foreground/40"
                        )}
                      >
                        {display}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
