import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fanBreakoutPython, fanBreakoutScriptPath } from "@/lib/env";

const STOP_ESCALATE_MS = 5_000;
const MAX_EVENTS = 1000;

// ─────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────

/**
 * Structured event the dashboard consumes — log lines are parsed server-side
 * so the client renders a friendly feed instead of raw Python stdout.
 */
export type BreakoutEvent =
  | {
      kind: "system";
      ts: number;
      message: string;
    }
  | {
      kind: "started";
      ts: number;
      totalTickers: number | null;
      startDate: string | null;
      endDate: string | null;
    }
  | {
      kind: "match";
      ts: number;
      ticker: string;
      signalDate: string;
      marketCap: number | null;
      classification: string;
    }
  | {
      kind: "completed";
      ts: number;
      matches: number;
      outputPath: string | null;
    }
  | {
      kind: "info";
      ts: number;
      message: string;
    }
  | {
      kind: "error";
      ts: number;
      message: string;
    };

export interface BreakoutJobState {
  running: boolean;
  startedAt: number | null;
  endedAt: number | null;
  exitCode: number | null;
  pid: number | null;
  matches: number;
  totalTickers: number | null;
  refreshUniverse: boolean;
}

export interface BreakoutRunArgs {
  refreshUniverse?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────
// Log → event parsing
// ─────────────────────────────────────────────────────────────────────────

const LOGGER_RE = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2},\d+\s+-\s+\S+\s+-\s+(INFO|ERROR|WARNING|DEBUG)\s+-\s+(.*)$/;

function stripLoggerPrefix(line: string): { level: string | null; text: string } {
  const m = LOGGER_RE.exec(line);
  if (m) return { level: m[1], text: m[2] };
  return { level: null, text: line };
}

function parseStartedLine(text: string): BreakoutEvent | null {
  // "Scanning 2200 companies from 2024-01-01 to 2026-04-08"
  const m = /Scanning\s+(\d+)\s+companies\s+from\s+([\d-]+)\s+to\s+([\d-]+)/i.exec(
    text
  );
  if (!m) return null;
  return {
    kind: "started",
    ts: Date.now(),
    totalTickers: Number(m[1]),
    startDate: m[2],
    endDate: m[3],
  };
}

function parseMatchLine(text: string): BreakoutEvent | null {
  // "🚀 BREAKOUT DETECTED -> RELIANCE.NS | Target Close Date: 2026-04-08 | Market Cap: 12345.0 | Largecap"
  const m = /BREAKOUT DETECTED\s*->\s*(\S+)\s*\|\s*Target Close Date:\s*([\d-]+)\s*\|\s*Market Cap:\s*([^|]+)\s*\|\s*(\S+)/.exec(
    text
  );
  if (!m) return null;
  const mcapRaw = m[3].trim();
  const mcap = mcapRaw === "nan" || mcapRaw === "" ? null : Number(mcapRaw);
  return {
    kind: "match",
    ts: Date.now(),
    ticker: m[1],
    signalDate: m[2],
    marketCap: Number.isFinite(mcap as number) ? (mcap as number) : null,
    classification: m[4],
  };
}

function parseCompletedLine(text: string): BreakoutEvent | null {
  // "📊 Processing complete. 5 targets written to: breakout_results.csv"
  const m = /Processing complete\.\s+(\d+)\s+targets written to:\s*(\S+)/.exec(
    text
  );
  if (m) {
    return {
      kind: "completed",
      ts: Date.now(),
      matches: Number(m[1]),
      outputPath: m[2],
    };
  }
  if (/Processing complete\.\s+No actionable breakout structures/i.test(text)) {
    return {
      kind: "completed",
      ts: Date.now(),
      matches: 0,
      outputPath: null,
    };
  }
  return null;
}

function parseLine(line: string, stream: "stdout" | "stderr"): BreakoutEvent {
  const { level, text } = stripLoggerPrefix(line);

  const matchEvent = parseMatchLine(text);
  if (matchEvent) return matchEvent;

  const startedEvent = parseStartedLine(text);
  if (startedEvent) return startedEvent;

  const completedEvent = parseCompletedLine(text);
  if (completedEvent) return completedEvent;

  const kind: BreakoutEvent["kind"] =
    stream === "stderr" || level === "ERROR" ? "error" : "info";
  return { kind, ts: Date.now(), message: text };
}

// ─────────────────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────────────────

class BreakoutRunner {
  private process: ChildProcess | null = null;
  private events: BreakoutEvent[] = [];
  private state: BreakoutJobState = {
    running: false,
    startedAt: null,
    endedAt: null,
    exitCode: null,
    pid: null,
    matches: 0,
    totalTickers: null,
    refreshUniverse: false,
  };
  private stopEscalationTimer: NodeJS.Timeout | null = null;

  getState(): BreakoutJobState {
    return { ...this.state };
  }

  getEvents(): BreakoutEvent[] {
    return [...this.events];
  }

  private push(ev: BreakoutEvent) {
    this.events.push(ev);
    if (this.events.length > MAX_EVENTS) {
      this.events.splice(0, this.events.length - MAX_EVENTS);
    }
    if (ev.kind === "started" && ev.totalTickers !== null) {
      this.state.totalTickers = ev.totalTickers;
    }
    if (ev.kind === "match") {
      this.state.matches++;
    }
  }

  private system(message: string) {
    this.push({ kind: "system", ts: Date.now(), message });
  }

  start(args: BreakoutRunArgs = {}): BreakoutJobState {
    if (this.state.running) return this.getState();

    const refreshUniverse = !!args.refreshUniverse;
    const script = fanBreakoutScriptPath();
    const cwd = path.dirname(script);
    const py = fanBreakoutPython();

    this.events = [];
    this.state = {
      running: true,
      startedAt: Date.now(),
      endedAt: null,
      exitCode: null,
      pid: null,
      matches: 0,
      totalTickers: null,
      refreshUniverse,
    };

    this.system(
      `Launching Fan Breakout scan${refreshUniverse ? " (refreshing ticker universe)" : " (using cached ticker universe)"} — python: ${py}`
    );

    let proc: ChildProcess;
    try {
      proc = spawn(py, ["-u", script], {
        cwd,
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
        detached: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err) {
      this.state.running = false;
      this.state.endedAt = Date.now();
      this.push({
        kind: "error",
        ts: Date.now(),
        message: `Failed to launch python: ${(err as Error).message}`,
      });
      return this.getState();
    }

    this.process = proc;
    this.state.pid = proc.pid ?? null;

    proc.stdout?.setEncoding("utf8");
    proc.stderr?.setEncoding("utf8");

    proc.stdout?.on("data", (chunk: string) => {
      for (const line of chunk.split(/\r?\n/)) {
        if (!line) continue;
        this.push(parseLine(line, "stdout"));
      }
    });
    proc.stderr?.on("data", (chunk: string) => {
      for (const line of chunk.split(/\r?\n/)) {
        if (!line) continue;
        this.push(parseLine(line, "stderr"));
      }
    });

    proc.on("close", (code, signal) => {
      this.state.running = false;
      this.state.endedAt = Date.now();
      this.state.exitCode = code ?? null;
      if (this.stopEscalationTimer) {
        clearTimeout(this.stopEscalationTimer);
        this.stopEscalationTimer = null;
      }
      const haveCompletedEvent = this.events.some((e) => e.kind === "completed");
      if (code === 0 && !haveCompletedEvent) {
        this.push({
          kind: "completed",
          ts: Date.now(),
          matches: this.state.matches,
          outputPath: null,
        });
      }
      this.system(
        signal
          ? `Stopped (signal ${signal}).`
          : `Finished with exit code ${code}.`
      );
      this.process = null;
    });

    proc.on("error", (err) => {
      this.push({
        kind: "error",
        ts: Date.now(),
        message: `Process error: ${err.message}`,
      });
    });

    // Answer the script's interactive prompt:
    //   "Would you like to fetch and update the latest 2200+ NSE Tickers from source? [y/N]:"
    // Defaulting to "n" preserves the existing hello.csv and saves a long
    // round-trip to NSE.
    if (proc.stdin) {
      const answer = refreshUniverse ? "y\n" : "n\n";
      // The prompt only appears if hello.csv already exists. Either way, the
      // script tolerates extra stdin input, so we can write immediately.
      try {
        proc.stdin.write(answer);
        proc.stdin.end();
      } catch {
        /* ignore */
      }
    }

    return this.getState();
  }

  stop(): boolean {
    const proc = this.process;
    if (!proc || !this.state.running || proc.pid == null) return false;
    const pid = proc.pid;

    const killGroup = (signal: NodeJS.Signals): boolean => {
      try {
        process.kill(-pid, signal);
        return true;
      } catch {
        try {
          proc.kill(signal);
          return true;
        } catch {
          return false;
        }
      }
    };

    const ok = killGroup("SIGTERM");
    this.system(ok ? "Sent SIGTERM to scan process." : "SIGTERM failed.");

    if (this.stopEscalationTimer) clearTimeout(this.stopEscalationTimer);
    this.stopEscalationTimer = setTimeout(() => {
      if (this.process && this.state.running) {
        const killed = killGroup("SIGKILL");
        this.system(
          killed
            ? "Escalated to SIGKILL — process did not exit cleanly."
            : "SIGKILL failed."
        );
      }
      this.stopEscalationTimer = null;
    }, STOP_ESCALATE_MS);

    return ok;
  }
}

declare global {
  var __prism_fan_breakout_runner_v3__: BreakoutRunner | undefined;
}

export function getBreakoutRunner(): BreakoutRunner {
  if (!globalThis.__prism_fan_breakout_runner_v3__) {
    globalThis.__prism_fan_breakout_runner_v3__ = new BreakoutRunner();
  }
  return globalThis.__prism_fan_breakout_runner_v3__;
}
