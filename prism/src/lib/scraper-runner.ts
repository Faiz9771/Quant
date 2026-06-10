import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { dashDataDir, pythonInterpreter, scraperRunnerPath } from "@/lib/env";

const STOP_ESCALATE_MS = 5_000;

export interface ScraperLogLine {
  ts: number;
  stream: "stdout" | "stderr" | "system";
  text: string;
}

export interface ScraperJobState {
  running: boolean;
  startedAt: number | null;
  endedAt: number | null;
  exitCode: number | null;
  pid: number | null;
  args: string[];
}

interface RunArgs {
  scrapeOnly?: boolean;
  skipScrape?: boolean;
  resume?: number;
  noHeadless?: boolean;
}

export type ScraperMode = "run" | "authenticate";

interface LaunchSpec {
  argv: string[];
  label: string;
  cwd: string;
}

const MAX_BUFFER_LINES = 2000;

class ScraperRunner {
  private process: ChildProcess | null = null;
  private state: ScraperJobState = {
    running: false,
    startedAt: null,
    endedAt: null,
    exitCode: null,
    pid: null,
    args: [],
  };
  private buffer: ScraperLogLine[] = [];
  private subscribers = new Set<(line: ScraperLogLine) => void>();
  private stopEscalationTimer: NodeJS.Timeout | null = null;

  getState(): ScraperJobState {
    return { ...this.state };
  }

  getRecentLogs(): ScraperLogLine[] {
    return [...this.buffer];
  }

  subscribe(fn: (line: ScraperLogLine) => void): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  private push(line: ScraperLogLine) {
    this.buffer.push(line);
    if (this.buffer.length > MAX_BUFFER_LINES) {
      this.buffer.splice(0, this.buffer.length - MAX_BUFFER_LINES);
    }
    for (const fn of this.subscribers) {
      try {
        fn(line);
      } catch {
        /* ignore subscriber errors */
      }
    }
  }

  start(args: RunArgs = {}): ScraperJobState {
    if (this.state.running) return this.getState();
    const runner = scraperRunnerPath();
    const argv: string[] = [runner];
    if (args.scrapeOnly) argv.push("--scrape-only");
    if (args.skipScrape) argv.push("--skip-scrape");
    if (args.noHeadless) argv.push("--no-headless");
    if (typeof args.resume === "number") argv.push(`--resume=${args.resume}`);
    return this.launch({ argv, label: "scraper", cwd: dashDataDir() });
  }

  async authenticate(): Promise<ScraperJobState> {
    // If anything is running, stop it first so the user can always re-auth
    // (common case: scraper is stuck on an expired login).
    if (this.state.running) {
      this.push({
        ts: Date.now(),
        stream: "system",
        text: "[prism] stopping current process before authenticate",
      });
      await this.killAndWait();
    }
    const cwd = dashDataDir();
    // Prism-bundled helper: saves storage_state every few seconds and
    // exits when the user closes the browser, so the LAST cookies
    // (post-login) are what land in auth.json.
    const script = path.join(
      process.cwd(),
      "scripts",
      "prism_save_auth.py"
    );
    return this.launch({
      argv: [script, cwd],
      label: "auth",
      cwd,
    });
  }

  private async killAndWait(timeoutMs = 6_000): Promise<void> {
    const proc = this.process;
    if (!proc || proc.pid == null) return;
    const pid = proc.pid;
    const done = new Promise<void>((resolve) => {
      const onExit = () => resolve();
      proc.once("close", onExit);
      // Safety: resolve after timeout even if close never fires.
      setTimeout(resolve, timeoutMs);
    });
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      try {
        proc.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    }
    // Escalate to SIGKILL after 3s.
    const escalate = setTimeout(() => {
      if (!this.process || !this.state.running) return;
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        try {
          proc.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      }
    }, 3_000);
    await done;
    clearTimeout(escalate);
  }

  private launch(spec: LaunchSpec): ScraperJobState {
    const py = pythonInterpreter();
    this.buffer = [];
    this.state = {
      running: true,
      startedAt: Date.now(),
      endedAt: null,
      exitCode: null,
      pid: null,
      args: spec.argv,
    };

    this.push({
      ts: Date.now(),
      stream: "system",
      text: `[prism] launching ${spec.label}: ${py} ${spec.argv.join(" ")} (cwd=${spec.cwd})`,
    });

    let proc: ChildProcess;
    try {
      proc = spawn(py, spec.argv, {
        cwd: spec.cwd,
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
        // Detached so the child becomes its own process group leader —
        // killing -pid then reaches every descendant (Playwright browsers, etc.)
        detached: true,
      });
    } catch (err) {
      this.state.running = false;
      this.state.endedAt = Date.now();
      this.push({
        ts: Date.now(),
        stream: "system",
        text: `[prism] failed to spawn: ${(err as Error).message}`,
      });
      return this.getState();
    }

    this.process = proc;
    this.state.pid = proc.pid ?? null;

    proc.stdout?.setEncoding("utf8");
    proc.stderr?.setEncoding("utf8");

    proc.stdout?.on("data", (chunk: string) => {
      for (const line of chunk.split(/\r?\n/)) {
        if (line.length === 0) continue;
        this.push({ ts: Date.now(), stream: "stdout", text: line });
      }
    });
    proc.stderr?.on("data", (chunk: string) => {
      for (const line of chunk.split(/\r?\n/)) {
        if (line.length === 0) continue;
        this.push({ ts: Date.now(), stream: "stderr", text: line });
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
      this.push({
        ts: Date.now(),
        stream: "system",
        text: `[prism] exited with code ${code}${signal ? ` (signal ${signal})` : ""}`,
      });
      this.process = null;
    });

    proc.on("error", (err) => {
      this.push({
        ts: Date.now(),
        stream: "system",
        text: `[prism] process error: ${err.message}`,
      });
    });

    return this.getState();
  }

  stop(): boolean {
    const proc = this.process;
    if (!proc || !this.state.running || proc.pid == null) return false;
    const pid = proc.pid;

    const killGroup = (signal: NodeJS.Signals): boolean => {
      try {
        process.kill(-pid, signal); // negative pid = process group
        return true;
      } catch {
        try {
          proc.kill(signal); // fallback to direct process
          return true;
        } catch {
          return false;
        }
      }
    };

    const ok = killGroup("SIGTERM");
    this.push({
      ts: Date.now(),
      stream: "system",
      text: ok
        ? "[prism] SIGTERM sent to process group"
        : "[prism] failed to send SIGTERM",
    });

    if (this.stopEscalationTimer) clearTimeout(this.stopEscalationTimer);
    this.stopEscalationTimer = setTimeout(() => {
      if (this.process && this.state.running) {
        const killed = killGroup("SIGKILL");
        this.push({
          ts: Date.now(),
          stream: "system",
          text: killed
            ? "[prism] SIGKILL sent — process still alive after SIGTERM"
            : "[prism] SIGKILL failed",
        });
      }
      this.stopEscalationTimer = null;
    }, STOP_ESCALATE_MS);

    return ok;
  }
}

declare global {
  var __prism_scraper_runner_v2__: ScraperRunner | undefined;
}

export function getScraperRunner(): ScraperRunner {
  if (!globalThis.__prism_scraper_runner_v2__) {
    globalThis.__prism_scraper_runner_v2__ = new ScraperRunner();
  }
  return globalThis.__prism_scraper_runner_v2__;
}

// Reference unused import to keep TS happy when path import is unused at runtime.
void path;
