import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

function projectSibling(name: string): string {
  return path.resolve(process.cwd(), "..", name);
}

function firstExistingPath(candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Absolute path to the existing Dash data directory.
 * Prism reads history/, latest.parquet, and live_validation.csv from here.
 */
export function dashDataDir(): string {
  const explicit = process.env.DASH_DATA_DIR;
  if (explicit) {
    return explicit;
  }

  const fallback = firstExistingPath([
    projectSibling("Dash"),
    path.join(process.cwd(), "Dash"),
  ]);
  if (fallback) return fallback;

  throw new Error(
    "DASH_DATA_DIR is not set and no local Dash folder was found. Set DASH_DATA_DIR to the directory that contains history/, latest.parquet, and live_validation.csv."
  );
}

export function historyDir(): string {
  return path.join(dashDataDir(), "history");
}

export function latestParquetPath(): string {
  return path.join(dashDataDir(), "latest.parquet");
}

export function latestCsvPath(): string {
  return path.join(dashDataDir(), "latest.csv");
}

export function liveValidationCsvPath(): string {
  return path.join(dashDataDir(), "live_validation.csv");
}

export function scraperProgressCsvPath(): string {
  return path.join(dashDataDir(), "marketsmith_scores_complete.csv");
}

export function pythonInterpreter(): string {
  return (
    process.env.PRISM_PYTHON ||
    firstExistingPath([
      path.join(dashDataDir(), ".venv", "bin", "python"),
      path.join(projectSibling("Dash"), ".venv", "bin", "python"),
    ]) ||
    "python3"
  );
}

export function scraperRunnerPath(): string {
  const p = process.env.PRISM_SCRAPER_RUNNER;
  if (p) return p;

  const fallback = firstExistingPath([
    path.join(dashDataDir(), "run_and_archive.py"),
    path.join(projectSibling("Dash"), "run_and_archive.py"),
  ]);
  if (fallback) return fallback;

  return path.join(dashDataDir(), "run_and_archive.py");
}

export function fanBreakoutScriptPath(): string {
  const explicit = process.env.PRISM_FAN_BREAKOUT_SCRIPT;
  if (explicit) return explicit;

  const fallback = firstExistingPath([
    path.join(projectSibling("Data-Fetch"), "shivam.py"),
    path.join(process.cwd(), "Data-Fetch", "shivam.py"),
  ]);
  if (fallback) return fallback;

  return path.join(projectSibling("Data-Fetch"), "shivam.py");
}

export function fanBreakoutResultsPath(): string {
  return path.join(path.dirname(fanBreakoutScriptPath()), "breakout_results.csv");
}

const FAN_BREAKOUT_REQUIRED = ["yfinance", "pandas", "numpy", "requests"];

function pythonHasFanBreakoutDeps(py: string): boolean {
  try {
    execFileSync(
      py,
      ["-c", `import ${FAN_BREAKOUT_REQUIRED.join(", ")}`],
      { stdio: "ignore", timeout: 5_000 }
    );
    return true;
  } catch {
    return false;
  }
}

let cachedFanBreakoutPython: string | null = null;

/**
 * Resolve a Python interpreter that ACTUALLY has yfinance, pandas, numpy, and
 * requests installed. Each candidate is probed with a fast `import` check —
 * existence on disk isn't enough since multiple venvs may share a name but
 * different package sets.
 *
 * Priority:
 *   1. PRISM_FAN_BREAKOUT_PYTHON env override (no probe — user asked for it)
 *   2. ~/.pyenv/versions/3.11.8/bin/python3 (verified to have the deps)
 *   3. <scriptDir>/.venv/bin/python (project-local venv)
 *   4. pythonInterpreter() (system default)
 * Result is cached for the lifetime of the Node process.
 */
export function fanBreakoutPython(): string {
  if (cachedFanBreakoutPython) return cachedFanBreakoutPython;

  const explicit = process.env.PRISM_FAN_BREAKOUT_PYTHON;
  if (explicit) {
    cachedFanBreakoutPython = explicit;
    return explicit;
  }

  const candidates: string[] = [];
  const home = process.env.HOME ?? "";
  if (home) {
    candidates.push(
      path.join(home, ".pyenv", "versions", "3.11.8", "bin", "python3")
    );
  }
  const scriptDir = path.dirname(fanBreakoutScriptPath());
  candidates.push(path.join(scriptDir, ".venv", "bin", "python"));
  candidates.push(pythonInterpreter());

  for (const py of candidates) {
    if (py !== pythonInterpreter() && !existsSync(py)) continue;
    if (pythonHasFanBreakoutDeps(py)) {
      cachedFanBreakoutPython = py;
      return py;
    }
  }

  // Last resort — return the system Python and let it fail with a clear error.
  cachedFanBreakoutPython = pythonInterpreter();
  return cachedFanBreakoutPython;
}
