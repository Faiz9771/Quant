"""
app.py  --  Flask backend for the M7.1-Long interactive dashboard
=================================================================
Serves the full-fledged dashboard (no CSV upload) and runs the real M7.1 scan
on demand for an EXACT date range. The heavy work (yfinance download + the
checklist scan over every stock/day) depends only on the chosen range, so results
are cached per range on disk; tweaking capital / slots / sizing is instant in the
browser. The Step-13 FII layer is fetched live from MoneyControl.

Scans run ASYNCHRONOUSLY in a background thread: the browser kicks one off and
then polls /api/status, so a multi-minute scan never holds an HTTP connection
open (which is what caused "Failed to fetch"). A live progress count is exposed.

Run:
    pip install -r requirements.txt
    python app.py
    # open http://127.0.0.1:5050
"""
from __future__ import annotations
import json, os, re, threading, time, traceback
from pathlib import Path
import pandas as pd
from flask import Flask, jsonify, request, send_from_directory

import scan as scanner

HERE = Path(__file__).parent
CACHE_DIR = HERE / ".scan_cache"
CACHE_DIR.mkdir(exist_ok=True)

app = Flask(__name__)

# background scan jobs, keyed by range ("2023-01-01_2023-12-31")
_jobs: dict[str, dict] = {}
_jobs_guard = threading.Lock()

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _norm_date(s: str) -> str:
    """Validate/normalise a YYYY-MM-DD string (raises on garbage)."""
    s = str(s).strip()
    if not _DATE_RE.match(s):
        s = pd.Timestamp(s).strftime("%Y-%m-%d")  # tolerate other parseable forms
    else:
        pd.Timestamp(s)  # validate it's a real date
    return s


def _range_key(sd: str, ed: str) -> str:
    return f"{sd}_{ed}"


def _cache_path(sd: str, ed: str) -> Path:
    return CACHE_DIR / f"signals_{_range_key(sd, ed)}.json"


def _worker(sd: str, ed: str, key: str):
    job = _jobs[key]
    try:
        def progress(_tk):
            job["done"] += 1
        signals, meta = scanner.scan_signals(sd, ed, progress=progress)
        payload = {"meta": meta, "signals": signals}
        _cache_path(sd, ed).write_text(json.dumps(payload))
        job["payload"] = payload
        job["status"] = "done"
    except Exception as e:
        traceback.print_exc()
        job["status"] = "error"
        job["error"] = str(e)


def _start_job(sd: str, ed: str) -> dict:
    key = _range_key(sd, ed)
    with _jobs_guard:
        existing = _jobs.get(key)
        if existing and existing["status"] == "running":
            return existing
        job = {"status": "running", "done": 0, "total": 50,
               "key": key, "started": time.time(), "payload": None, "error": None}
        _jobs[key] = job
    threading.Thread(target=_worker, args=(sd, ed, key), daemon=True).start()
    return job


def _parse_range():
    sd = _norm_date(request.args.get("start", "2023-01-01"))
    ed = _norm_date(request.args.get("end", "2023-12-31"))
    if pd.Timestamp(ed) < pd.Timestamp(sd):
        sd, ed = ed, sd
    return sd, ed


@app.route("/")
def index():
    return send_from_directory(HERE, "dashboard_live.html")


@app.route("/api/scan")
def api_scan():
    """Kick off (or return cached) scan for a date range. Never blocks for the full scan."""
    try:
        sd, ed = _parse_range()
        refresh = request.args.get("refresh", "0") in ("1", "true", "yes")
        path = _cache_path(sd, ed)
        if path.exists() and not refresh:
            payload = json.loads(path.read_text())
            return jsonify({"status": "done", "cached": True, **payload})
        if refresh and path.exists():
            path.unlink()
        job = _start_job(sd, ed)
        return jsonify({"status": job["status"], "key": job["key"],
                        "done": job["done"], "total": job["total"]})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"status": "error", "error": str(e)}), 500


@app.route("/api/status")
def api_status():
    """Poll a running scan. Returns progress, or the payload when finished."""
    try:
        sd, ed = _parse_range()
        key = _range_key(sd, ed)
        path = _cache_path(sd, ed)
        job = _jobs.get(key)
        if job and job["status"] == "done" and job["payload"]:
            return jsonify({"status": "done", "cached": False, **job["payload"]})
        if path.exists() and (not job or job["status"] != "running"):
            return jsonify({"status": "done", "cached": True, **json.loads(path.read_text())})
        if job and job["status"] == "error":
            return jsonify({"status": "error", "error": job["error"]})
        if job and job["status"] == "running":
            return jsonify({"status": "running", "done": job["done"], "total": job["total"]})
        return jsonify({"status": "idle"})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"status": "error", "error": str(e)}), 500


def _live_worker(asof: str, key: str):
    job = _jobs[key]
    try:
        def progress(_tk):
            job["done"] += 1
        signals, meta = scanner.live_scan(asof, progress=progress)
        payload = {"meta": meta, "signals": signals}
        (CACHE_DIR / f"live_{asof}.json").write_text(json.dumps(payload))
        job["payload"] = payload
        job["status"] = "done"
    except Exception as e:
        traceback.print_exc()
        job["status"] = "error"
        job["error"] = str(e)


@app.route("/api/live")
def api_live():
    """Kick off (or return cached) LIVE watchlist scan for `asof` (default today)."""
    try:
        asof = _norm_date(request.args.get("asof", pd.Timestamp.today().strftime("%Y-%m-%d")))
        refresh = request.args.get("refresh", "0") in ("1", "true", "yes")
        path = CACHE_DIR / f"live_{asof}.json"
        if path.exists() and not refresh:
            return jsonify({"status": "done", "cached": True, **json.loads(path.read_text())})
        if refresh and path.exists():
            path.unlink()
        key = f"live_{asof}"
        with _jobs_guard:
            existing = _jobs.get(key)
            if not (existing and existing["status"] == "running"):
                _jobs[key] = {"status": "running", "done": 0, "total": 50,
                              "key": key, "started": time.time(), "payload": None, "error": None}
                threading.Thread(target=_live_worker, args=(asof, key), daemon=True).start()
        j = _jobs[key]
        return jsonify({"status": j["status"], "key": key, "done": j["done"], "total": j["total"]})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"status": "error", "error": str(e)}), 500


@app.route("/api/live_status")
def api_live_status():
    """Poll a running live scan."""
    try:
        asof = _norm_date(request.args.get("asof", pd.Timestamp.today().strftime("%Y-%m-%d")))
        key = f"live_{asof}"
        path = CACHE_DIR / f"live_{asof}.json"
        job = _jobs.get(key)
        if job and job["status"] == "done" and job["payload"]:
            return jsonify({"status": "done", "cached": False, **job["payload"]})
        if path.exists() and (not job or job["status"] != "running"):
            return jsonify({"status": "done", "cached": True, **json.loads(path.read_text())})
        if job and job["status"] == "error":
            return jsonify({"status": "error", "error": job["error"]})
        if job and job["status"] == "running":
            return jsonify({"status": "running", "done": job["done"], "total": job["total"]})
        return jsonify({"status": "idle"})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"status": "error", "error": str(e)}), 500


# Persisted to M71_DATA_DIR if set (a volume in the container), else the app
# root — so local `python app.py` behaviour is unchanged.
_DATA_DIR = Path(os.environ.get("M71_DATA_DIR", HERE))
_DATA_DIR.mkdir(parents=True, exist_ok=True)
TRACKED_FILE = _DATA_DIR / "tracked_positions.json"


@app.route("/api/tracked", methods=["GET", "POST"])
def api_tracked():
    """Persist the user's locked/tracked positions to disk so they survive everything."""
    try:
        if request.method == "POST":
            data = request.get_json(force=True)
            TRACKED_FILE.write_text(json.dumps(data, indent=2))
            return jsonify({"ok": True, "count": len(data) if isinstance(data, list) else 0})
        if TRACKED_FILE.exists():
            return jsonify(json.loads(TRACKED_FILE.read_text()))
        return jsonify([])
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/quote")
def api_quote():
    """Latest price + ATR(14) for a comma-separated list of symbols (tracked positions)."""
    try:
        syms = [s.strip() for s in request.args.get("syms", "").split(",") if s.strip()]
        return jsonify({"quotes": scanner.live_quotes(syms),
                        "asof": pd.Timestamp.today().strftime("%Y-%m-%d")})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/cached")
def api_cached():
    """List date ranges already scanned & cached (instant to load)."""
    out = []
    for p in sorted(CACHE_DIR.glob("signals_*.json")):
        stem = p.stem.replace("signals_", "")
        if "_" in stem:
            sd, ed = stem.split("_", 1)
            out.append({"start": sd, "end": ed})
    return jsonify({"ranges": out})


if __name__ == "__main__":
    # 5000/7000 are hijacked by macOS AirPlay Receiver (Control Center) -> use 5050
    port = int(os.environ.get("PORT", 5050))
    print(f"\n  M7.1-Long dashboard  ->  http://127.0.0.1:{port}\n")
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
