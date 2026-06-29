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
import json, os, re, sys, subprocess, threading, time, traceback
from datetime import timedelta
from functools import wraps
from pathlib import Path
import pandas as pd
from flask import (Flask, jsonify, request, send_from_directory, session,
                   redirect, render_template_string, Response)
from werkzeug.security import check_password_hash

import scan as scanner

HERE = Path(__file__).parent
CACHE_DIR = HERE / ".scan_cache"
CACHE_DIR.mkdir(exist_ok=True)

app = Flask(__name__)

# ----------------------------- auth -----------------------------
# A branded login page (styled like the dashboard) guards every route. Enabled
# only when M71_AUTH_PASS_HASH is set (a werkzeug hash), so local `python app.py`
# stays open. Generate a hash with:
#   python -c "from werkzeug.security import generate_password_hash as g; print(g('pw'))"
AUTH_USER = os.environ.get("M71_AUTH_USER", "Faiz")
AUTH_PASS_HASH = os.environ.get("M71_AUTH_PASS_HASH", "")
app.secret_key = os.environ.get("M71_SECRET_KEY", "dev-insecure-key")
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("M71_SECURE_COOKIE", "0") in ("1", "true", "yes"),
    PERMANENT_SESSION_LIFETIME=timedelta(days=14),
)
_OPEN_PATHS = {"/login", "/logout"}


@app.before_request
def _require_login():
    if not AUTH_PASS_HASH:                      # auth disabled (local dev)
        return
    if session.get("auth") or request.path in _OPEN_PATHS:
        return
    if request.path.startswith("/api/"):        # APIs answer 401, not a redirect
        return Response("Unauthorized", 401)
    return redirect("/login")


LOGIN_HTML = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>M7.1-Long · Sign in</title>
<style>
:root{--ink:#10221c;--paper:#f3efe6;--panel:#fbf9f3;--line:#d8d2c2;--green:#1f7a52;
--green-d:#0f5236;--red:#b03a2e;--mid:#7a8f86}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:var(--paper);color:var(--ink);
font-family:"Iowan Old Style","Palatino Linotype",Georgia,serif;line-height:1.5;
-webkit-font-smoothing:antialiased;padding:24px}
.card{width:100%;max-width:380px;background:var(--panel);border:1px solid var(--line);
border-radius:6px;padding:30px 30px 26px;box-shadow:0 14px 40px rgba(16,34,28,.08)}
.eyebrow{font-family:"SF Mono",ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.28em;
text-transform:uppercase;color:var(--green-d);margin:0 0 8px}
h1{font-size:24px;font-weight:600;margin:0 0 4px;letter-spacing:-.01em}
.sub{color:#5a6b63;font-size:14px;margin:0 0 22px}
label{display:block;font-size:12px;font-family:"SF Mono",monospace;letter-spacing:.12em;
text-transform:uppercase;color:#8a9189;margin:0 0 5px}
input{width:100%;font:inherit;font-size:15px;background:#fff;border:1px solid var(--line);
border-radius:4px;padding:10px 12px;margin-bottom:16px;color:var(--ink)}
input:focus{outline:none;border-color:var(--green);box-shadow:0 0 0 3px rgba(31,122,82,.12)}
button{width:100%;background:var(--green-d);color:#fff;border:none;border-radius:4px;
padding:11px 18px;font:inherit;font-size:15px;font-weight:600;cursor:pointer;margin-top:2px}
button:hover{background:#0a3d28}
.err{background:#f6e3df;color:var(--red);border:1px solid #e3c4bd;border-radius:4px;
padding:9px 12px;font-size:13px;margin-bottom:16px}
.foot{margin-top:18px;font-size:11.5px;color:#8a9189;text-align:center;
font-family:"SF Mono",monospace;letter-spacing:.04em}
</style></head><body>
<form class="card" method="post" action="/login" autocomplete="off">
  <p class="eyebrow">Model M7.1 · Long · Live</p>
  <h1>Sign in</h1>
  <p class="sub">Strategy scanner &amp; locked-capital simulator.</p>
  {% if err %}<div class="err">{{ err }}</div>{% endif %}
  <label for="u">Username</label>
  <input id="u" name="username" type="text" autocapitalize="off" autocorrect="off" autofocus>
  <label for="p">Password</label>
  <input id="p" name="password" type="password">
  <button type="submit">Enter dashboard →</button>
  <p class="foot">Private deployment · authorized access only</p>
</form></body></html>"""


@app.route("/login", methods=["GET", "POST"])
def login():
    if not AUTH_PASS_HASH:
        return redirect("/")
    err = ""
    if request.method == "POST":
        u = request.form.get("username", "")
        p = request.form.get("password", "")
        if u == AUTH_USER and check_password_hash(AUTH_PASS_HASH, p):
            session.permanent = True
            session["auth"] = True
            return redirect("/")
        err = "Invalid username or password."
    return render_template_string(LOGIN_HTML, err=err)


@app.route("/logout")
def logout():
    session.clear()
    return redirect("/login")

# Heavy scans run in a SEPARATE PROCESS (not a thread): the M7.1 checklist is
# CPU/GIL-bound, so a background thread would block every other request on this
# small single-worker box (logins, status polls, loading cached ranges all died
# while a scan ran). The child writes progress + result to disk; the web worker
# only spawns it and reads small status files, so it stays responsive.
_procs: dict[str, subprocess.Popen] = {}   # job key -> running child process
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


def _job_status_path(key: str) -> Path:
    return CACHE_DIR / f"_job_{key}.json"


def _spawn_scan(key: str, runner_call: str):
    """Start the heavy scan in a child process (idempotent per key). `runner_call`
    is a scan.* call that writes the result to the cache file and progress to the
    job-status file. Re-spawning while one is alive is a no-op."""
    with _jobs_guard:
        p = _procs.get(key)
        if p and p.poll() is None:
            return
        _job_status_path(key).write_text(json.dumps({"status": "running", "done": 0, "total": 50}))
        _procs[key] = subprocess.Popen([sys.executable, "-c", f"import scan; {runner_call}"],
                                       cwd=str(HERE))


def _read_job_status(key: str, cache_path: Path) -> dict:
    """Resolve job state from disk so any worker can report it: a present cache
    file means done; otherwise the job-status file (running/error); else idle."""
    if cache_path.exists():
        p = _procs.get(key)
        if p is not None:
            p.poll()                 # reap the finished child (no zombies)
        return {"status": "done", "cached": True, **json.loads(cache_path.read_text())}
    sp = _job_status_path(key)
    if sp.exists():
        try:
            st = json.loads(sp.read_text())
        except Exception:
            return {"status": "running", "done": 0, "total": 50}
        if st.get("status") == "running":
            p = _procs.get(key)
            if p is not None and p.poll() is not None:   # child died without writing a result
                return {"status": "error", "error": "scan process exited unexpectedly"}
        return st
    return {"status": "idle"}


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
        key = _range_key(sd, ed)
        _spawn_scan(key, f"scan.run_range_job({sd!r}, {ed!r}, {str(path)!r}, "
                         f"{str(_job_status_path(key))!r})")
        return jsonify({"status": "running", "key": key, "done": 0, "total": 50})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"status": "error", "error": str(e)}), 500


@app.route("/api/status")
def api_status():
    """Poll a running scan. Returns progress, or the payload when finished."""
    try:
        sd, ed = _parse_range()
        return jsonify(_read_job_status(_range_key(sd, ed), _cache_path(sd, ed)))
    except Exception as e:
        traceback.print_exc()
        return jsonify({"status": "error", "error": str(e)}), 500


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
        _spawn_scan(key, f"scan.run_live_job({asof!r}, {str(path)!r}, "
                         f"{str(_job_status_path(key))!r})")
        return jsonify({"status": "running", "key": key, "done": 0, "total": 50})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"status": "error", "error": str(e)}), 500


@app.route("/api/live_status")
def api_live_status():
    """Poll a running live scan."""
    try:
        asof = _norm_date(request.args.get("asof", pd.Timestamp.today().strftime("%Y-%m-%d")))
        path = CACHE_DIR / f"live_{asof}.json"
        return jsonify(_read_job_status(f"live_{asof}", path))
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
