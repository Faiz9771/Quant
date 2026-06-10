# syntax=docker/dockerfile:1

# ──────────────────────────────────────────────────────────────────────────
# Prism production image
#
# The app is Node-primary (Next.js standalone server) but it SHELLS OUT to
# Python for two features:
#   • /scraper            → ../Dash/run_and_archive.py  (Playwright + Chromium)
#   • /library breakout   → ../Data-Fetch/shivam.py     (yfinance + pandas)
#
# So the runtime image carries BOTH Node and a Python venv with Playwright
# Chromium pre-installed. The Python *scripts* and data are NOT baked in —
# they are bind-mounted at runtime (see docker-compose.yml) so secrets like
# Dash/auth.json never enter the image layers.
# ──────────────────────────────────────────────────────────────────────────

# ── 1. Install JS dependencies ────────────────────────────────────────────
FROM node:22-bookworm-slim AS deps
WORKDIR /app
# better-sqlite3 is native; install build tools in case no prebuilt matches.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# ── 2. Build the Next.js standalone bundle ────────────────────────────────
FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── 3. Runtime: Node server + Python venv + Chromium ──────────────────────
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    # Point the app at the in-image Python venv (overridable via .env).
    PRISM_PYTHON=/opt/venv/bin/python \
    PRISM_FAN_BREAKOUT_PYTHON=/opt/venv/bin/python \
    PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright

# Python + the venv used by the Dash scraper and the breakout tool.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-venv python3-pip ca-certificates \
    && python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/venv/bin/pip install --no-cache-dir \
         playwright pandas pyarrow requests numpy yfinance \
    # Installs Chromium AND its OS-level libraries (the --with-deps half).
    && /opt/venv/bin/playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /app/data /app/external

# Standalone server output: server.js + traced node_modules (incl. better-sqlite3).
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
