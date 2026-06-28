# syntax=docker/dockerfile:1

# ──────────────────────────────────────────────────────────────────────────
# M7.1-Long scanner — full backend + frontend, deployed exactly as it runs
# locally (`python app.py`).
#
# This is a long-running Flask app, NOT a serverless function: it kicks scans
# off in background threads, keeps an in-process job queue (`_jobs`), polls via
# /api/status, scrapes MoneyControl for FII, and caches to disk. That is why it
# runs as a container on an always-on host (the Oracle VM, beside Prism) rather
# than on Vercel.
#
# Fidelity notes baked into this image:
#   • gunicorn runs ONE worker with threads and no request timeout, so the
#     shared in-memory job state + multi-minute background scans behave exactly
#     like the local `app.run(threaded=True)` dev server.
#   • The existing .scan_cache (18 ranges) and .fii_cache (FII history) are
#     baked in as /seed and copied into the runtime volumes on first boot, so
#     the deployed app is instantly populated, just like your local copy.
# ──────────────────────────────────────────────────────────────────────────

FROM python:3.11-slim AS runner
WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=5050 \
    PIP_NO_CACHE_DIR=1

# lxml/html5lib (Wikipedia + MoneyControl parsing) need libxml2/libxslt at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates libxml2 libxslt1.1 \
    && rm -rf /var/lib/apt/lists/*

# Python deps first for layer caching.
COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

# Application code.
COPY app.py scan.py m71_checklist.py nifty_fallback.py ./
COPY dashboard_live.html dashboard.html ./
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Bake the existing caches in as immutable seed data. The entrypoint copies
# them into the (possibly empty, volume-backed) runtime cache dirs on boot.
COPY .scan_cache /seed/.scan_cache
COPY .fii_cache  /seed/.fii_cache

EXPOSE 5050

ENTRYPOINT ["docker-entrypoint.sh"]
# One worker (shared in-memory job queue), threaded (serve polls while a scan
# runs), no timeout (scans can take minutes). Mirrors local app.run(threaded=True).
CMD ["gunicorn", "-w", "1", "-k", "gthread", "--threads", "16", "-t", "0", \
     "-b", "0.0.0.0:5050", "app:app"]
