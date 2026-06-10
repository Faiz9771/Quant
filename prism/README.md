# Prism

A deployable Next.js dashboard over the **Dash** MarketSmith ratings dataset.
Prism reads the parquet snapshots produced by `Dash/run_and_archive.py`,
visualizes the latest scores, lets you compare any two snapshots, watches the
live-validation CSV in near real-time, and gives you a one-click control
panel for the scraper itself.

Everything runs against files on disk in `Dash/`. Nothing is uploaded; nothing
talks to the network except the scraper subprocess and the market-data helper
APIs already used by the app.

---

## Quick start

```bash
cd prism
npm install            # one-time
npm run dev            # http://localhost:3000
npm run build
npm start              # production server on :3000
```

…or just **double-click `prism.command`** in Finder. The launcher will:

1. `cd` into the prism directory.
2. `npm install` if `node_modules` is missing.
3. Boot `npm run dev` in the background, log to `.prism-launcher.log`.
4. Wait for the port, then open `http://localhost:3000` in your browser.
5. Keep the dev server alive until you close the Terminal window or hit Ctrl-C.

If port 3000 is already in use it will just open the browser. Override with
`PRISM_PORT=4000 ./prism.command`.

---

## Configuration

All paths live in `.env.local` or `.env` (kept out of git). Prism will
auto-detect sibling `../Dash` and `../Data-Fetch` folders when they exist, but
for deployment you should set them explicitly:

```bash
# Path to the existing Dash data directory.
# Prism reads history/, latest.parquet and live_validation.csv from here.
DASH_DATA_DIR=/Users/faizmemon/Documents/Quant/Dash

# Python interpreter used to launch the scraper. Use the venv that already
# has Playwright + the project's deps installed.
PRISM_PYTHON=/Users/faizmemon/Documents/Quant/Dash/.venv/bin/python

# Path to the entry script the scraper page should run.
PRISM_SCRAPER_RUNNER=/Users/faizmemon/Documents/Quant/Dash/run_and_archive.py

# Optional: Fan Breakout library tool
PRISM_FAN_BREAKOUT_SCRIPT=/Users/faizmemon/Documents/Quant/Data-Fetch/shivam.py
```

Resolved at runtime in `src/lib/env.ts`. If `DASH_DATA_DIR` is missing and no
local `Dash/` folder can be found, the data routes throw a clear error rather
than silently returning empty.

For a clean deployment, copy `.env.example` to `.env` and update the mounted
paths for your host.

## Deployment

### Recommended: Docker Compose

Prism now ships with a production Docker setup that builds the app in
standalone mode and mounts your existing `Dash/` and `Data-Fetch/` directories.

1. Copy `.env.example` to `.env`.
2. Update the env values if your folders are not mounted at `/app/external/...`.
3. Make sure `docker-compose.yml` volume paths point to the real host folders.
4. Start Prism:

```bash
docker compose up --build -d
```

5. Open `http://localhost:3000`.

The default compose file expects this host layout:

```text
Quant/
  Dash/
  Data-Fetch/
  prism/
```

### Without Docker

Use this when deploying directly onto a VM or your Mac:

```bash
cp .env.example .env
npm ci
npm run build
npm start
```

Important runtime requirements:

- Use Node 22+ in production. One dependency (`yahoo-finance2`) warns on older Node versions.
- `DASH_DATA_DIR` must point at the folder containing `history/`, `latest.parquet`, and `live_validation.csv`.
- `PRISM_PYTHON` and `PRISM_SCRAPER_RUNNER` are required if you want the `/scraper` control panel to work.
- `PRISM_FAN_BREAKOUT_SCRIPT` is required only for the Fan Breakout library feature.

---

## Pages

| Route | Purpose |
| --- | --- |
| `/` | Main dashboard. Sortable, filterable table over `latest.parquet`, with score histograms and per-symbol drill-down. |
| `/compare` | Pick any two snapshots from `history/*.parquet`, see additions / removals / score deltas side-by-side. |
| `/live-validation` | Read-only stream of `live_validation.csv` — refreshes on file change so you can watch the scraper's progress. |
| `/scraper` | Start/stop the scraper, with a live SSE-fed log console and the same flags the CLI accepts (`--scrape-only`, `--skip-scrape`, `--no-headless`, `--resume=N`). |

The nav bar (`src/components/nav-bar.tsx`) is the source of truth for which
pages exist; add an entry there when you add a route.

---

## Data layer

`src/lib/data/` contains the parquet + CSV readers used by every page:

- **Parquet** is read with [`hyparquet`](https://github.com/hyparam/hyparquet) — pure JS, no native deps, streams from disk into the request handler.
- **CSV** (`live_validation.csv`) is parsed with `papaparse` and watched via `fs.watch` so the live page can poll an `If-Modified-Since`-style endpoint cheaply.
- All file IO is gated through `src/lib/env.ts` so paths can be relocated by changing one env var.

API routes:

```
src/app/api/
  snapshots/         # list of history/*.parquet files (mtime, row count)
  download/          # signed download of a specific snapshot
  compare/           # diff between two snapshots
  live-validation/   # tail-style read of live_validation.csv
  scraper/
    run     POST     # spawn run_and_archive.py with the chosen flags
    stop    POST     # SIGTERM the running child
    status  GET      # current job state + buffered logs
    logs    GET      # SSE stream of new log lines
```

The scraper child process is owned by a single global singleton
(`src/lib/scraper-runner.ts`). It buffers the most recent 2 000 log lines
so the console can hydrate when you open the page mid-run, and broadcasts
new lines to all SSE subscribers. Killing the dev server kills the child;
the existing launchd schedule is independent and unaffected.

---

## Project layout

```
prism/
  prism.command           # double-clickable macOS launcher
  src/
    app/                  # Next.js App Router pages + API routes
    components/           # React components (one per page + shared UI)
    lib/
      data/               # parquet/csv readers
      env.ts              # all env-var lookups
      scraper-runner.ts   # subprocess singleton + log buffer
      utils.ts
  public/
  package.json
  tailwind.config.ts
  next.config.ts
```

---

## Development notes

- `npm run dev` uses Turbopack. `npm run build` uses the stable Next.js production builder; `npm start` serves the built bundle.
- `next.config.ts` enables `output: "standalone"` so production deployments can run from a compact server bundle.
- The whole app is `dynamic = "force-dynamic"` — every request reads from disk, so there is nothing to invalidate when the parquet files change.
- Tailwind v3 + a small `class-variance-authority` setup under `src/components/ui/` (Button, Card, Badge). Add new primitives there rather than reaching for a UI library.
- Type-only imports from `scraper-runner.ts` into client components are fine — `import type { ... }` is erased at build time so the `node:child_process` code never enters the client bundle. Don't import values from it in `"use client"` files.

---

## Troubleshooting

**`DASH_DATA_DIR is not set`** — create `.env.local` or `.env` from `.env.example` and restart Prism.

**Scraper page says "failed to spawn"** — check that `PRISM_PYTHON` points at a Python that has Playwright installed (typically `Dash/.venv/bin/python`) and that `PRISM_SCRAPER_RUNNER` exists.

**Fan Breakout says the script cannot be found** — set `PRISM_FAN_BREAKOUT_SCRIPT` to your `Data-Fetch/shivam.py` path.

**Launcher window closes immediately** — open `prism/.prism-launcher.log`; the dev server's stdout/stderr is captured there.

**Port already in use** — `PRISM_PORT=4000 ./prism.command`, or `lsof -nP -iTCP:3000 -sTCP:LISTEN` to find the offender.
