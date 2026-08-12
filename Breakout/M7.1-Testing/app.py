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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{--bg:#000;--panel:#0a0d12;--sunk:#10151c;--head:#05070a;
--border:#1b212a;--border2:#2a323e;--ink:#e9ecf1;--ink2:#b7bfca;--mut:#7b838f;--mut2:#525a66;
--accent:#2f81f7;--accentSoft:#0b1930;--cyan:#39bdf8;--green:#26d07c;--red:#ff4d4d;--redSoft:#210f10;
--mono:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
--sans:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
*{box-sizing:border-box}
html{color-scheme:dark;-webkit-text-size-adjust:100%}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:var(--bg);color:var(--ink);font-family:var(--sans);font-size:13.5px;line-height:1.42;
-webkit-font-smoothing:antialiased;padding:24px}
::selection{background:rgba(47,129,247,.28);color:#fff}
.card{width:100%;max-width:390px;background:var(--panel);border:1px solid var(--border);
border-top:2px solid var(--accent);border-radius:3px;padding:26px 26px 22px}
.brand{display:flex;align-items:center;gap:11px;margin:0 0 6px}
.mark{width:32px;height:32px;border-radius:2px;background:var(--accent);color:#fff;display:grid;
place-items:center;font-family:var(--mono);font-size:11px;font-weight:700;flex:none}
.brandtxt{display:flex;flex-direction:column;gap:1px;line-height:1.18}
.brandtxt b{font-family:var(--mono);font-size:14.5px;font-weight:700;letter-spacing:.2px;
color:var(--accent);text-transform:uppercase}
.brandtxt small{font-size:11px;color:var(--mut);font-family:var(--mono);letter-spacing:.3px}
h1{font-family:var(--mono);font-size:12px;font-weight:700;color:var(--cyan);text-transform:uppercase;
letter-spacing:1px;margin:22px 0 6px;display:flex;align-items:center;gap:9px}
h1::before{content:"";width:3px;height:12px;background:var(--accent);flex:none}
.sub{color:var(--mut);font-size:11.5px;margin:0 0 22px;font-family:var(--mono)}
label{display:block;color:var(--accent);font-size:10px;font-weight:600;text-transform:uppercase;
letter-spacing:.6px;font-family:var(--mono);margin:0 0 5px}
input{width:100%;background:var(--sunk);border:1px solid var(--border2);color:var(--ink);
border-radius:2px;padding:9px 11px;font-size:13px;font-family:var(--mono);margin-bottom:16px;
transition:border-color .12s,box-shadow .12s}
input:hover{border-color:#3a434f}
input:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 2px rgba(47,129,247,.4)}
button{width:100%;background:var(--accent);color:#fff;border:0;border-radius:2px;padding:10px 20px;
font-family:var(--mono);font-size:12.5px;font-weight:700;cursor:pointer;letter-spacing:.4px;
text-transform:uppercase;margin-top:4px;transition:background .12s,transform .05s}
button:hover{background:#58a6ff}
button:active{transform:translateY(1px)}
.err{color:#ff7a72;background:var(--redSoft);border:1px solid #4a1c1c;border-radius:2px;
padding:11px 13px;font-size:12px;margin-bottom:16px;font-family:var(--mono)}
.foot{margin-top:20px;padding-top:14px;border-top:1px solid var(--border);font-size:10px;
color:var(--mut2);text-align:center;font-family:var(--mono);letter-spacing:.6px;text-transform:uppercase}
</style></head><body>
<form class="card" method="post" action="/login" autocomplete="off">
  <div class="brand">
    <span class="mark" aria-hidden="true">M7</span>
    <span class="brandtxt"><b>M7.1 Long</b><small>Strategy desk</small></span>
  </div>
  <h1>Authenticate</h1>
  <p class="sub">Strategy scanner &amp; locked-capital simulator.</p>
  {% if err %}<div class="err">{{ err }}</div>{% endif %}
  <label for="u">Username</label>
  <input id="u" name="username" type="text" autocapitalize="off" autocorrect="off" autofocus>
  <label for="p">Password</label>
  <input id="p" name="password" type="password">
  <button type="submit">Sign in</button>
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


def _universe() -> str:
    """Selected index universe for this request (defaults to nifty50)."""
    return scanner.normalize_universe(request.args.get("universe"))


def _uni_prefix(universe: str) -> str:
    """Cache-file/job-key infix per universe. Nifty 50 stays UNPREFIXED so every
    pre-existing signals_/live_ cache file keeps working unchanged."""
    universe = scanner.normalize_universe(universe)
    return "" if universe == scanner.DEFAULT_UNIVERSE else f"{universe}_"


def _range_key(sd: str, ed: str, universe: str = scanner.DEFAULT_UNIVERSE) -> str:
    return f"{_uni_prefix(universe)}{sd}_{ed}"


def _cache_path(sd: str, ed: str, universe: str = scanner.DEFAULT_UNIVERSE) -> Path:
    return CACHE_DIR / f"signals_{_range_key(sd, ed, universe)}.json"


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
        uni = _universe()
        refresh = request.args.get("refresh", "0") in ("1", "true", "yes")
        path = _cache_path(sd, ed, uni)
        if path.exists() and not refresh:
            payload = json.loads(path.read_text())
            return jsonify({"status": "done", "cached": True, **payload})
        if refresh and path.exists():
            path.unlink()
        key = _range_key(sd, ed, uni)
        _spawn_scan(key, f"scan.run_range_job({sd!r}, {ed!r}, {str(path)!r}, "
                         f"{str(_job_status_path(key))!r}, {uni!r})")
        return jsonify({"status": "running", "key": key, "done": 0, "total": 50})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"status": "error", "error": str(e)}), 500


@app.route("/api/status")
def api_status():
    """Poll a running scan. Returns progress, or the payload when finished."""
    try:
        sd, ed = _parse_range()
        uni = _universe()
        return jsonify(_read_job_status(_range_key(sd, ed, uni), _cache_path(sd, ed, uni)))
    except Exception as e:
        traceback.print_exc()
        return jsonify({"status": "error", "error": str(e)}), 500


@app.route("/api/live")
def api_live():
    """Kick off (or return cached) LIVE watchlist scan for `asof` (default today)."""
    try:
        asof = _norm_date(request.args.get("asof", pd.Timestamp.today().strftime("%Y-%m-%d")))
        uni = _universe()
        refresh = request.args.get("refresh", "0") in ("1", "true", "yes")
        path = CACHE_DIR / f"live_{_uni_prefix(uni)}{asof}.json"
        if path.exists() and not refresh:
            return jsonify({"status": "done", "cached": True, **json.loads(path.read_text())})
        if refresh and path.exists():
            path.unlink()
        key = f"live_{_uni_prefix(uni)}{asof}"
        _spawn_scan(key, f"scan.run_live_job({asof!r}, {str(path)!r}, "
                         f"{str(_job_status_path(key))!r}, {uni!r})")
        return jsonify({"status": "running", "key": key, "done": 0, "total": 50})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"status": "error", "error": str(e)}), 500


@app.route("/api/live_status")
def api_live_status():
    """Poll a running live scan."""
    try:
        asof = _norm_date(request.args.get("asof", pd.Timestamp.today().strftime("%Y-%m-%d")))
        uni = _universe()
        path = CACHE_DIR / f"live_{_uni_prefix(uni)}{asof}.json"
        return jsonify(_read_job_status(f"live_{_uni_prefix(uni)}{asof}", path))
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
    """List date ranges already scanned & cached for the selected universe (instant to load)."""
    uni = _universe()
    prefix = _uni_prefix(uni)                       # "" for nifty50, "next50_" otherwise
    out = []
    for p in sorted(CACHE_DIR.glob(f"signals_{prefix}*.json")):
        stem = p.stem[len("signals_"):]
        # Nifty 50 files are unprefixed, so skip any that belong to a prefixed
        # universe (e.g. "next50_...") when listing the default universe.
        if not prefix and any(stem.startswith(f"{u}_") for u in scanner.UNIVERSES
                              if u != scanner.DEFAULT_UNIVERSE):
            continue
        if prefix:
            stem = stem[len(prefix):]
        if "_" in stem:
            sd, ed = stem.split("_", 1)
            out.append({"start": sd, "end": ed})
    return jsonify({"ranges": out, "universe": uni})


if __name__ == "__main__":
    # 5000/7000 are hijacked by macOS AirPlay Receiver (Control Center) -> use 5050
    port = int(os.environ.get("PORT", 5050))
    print(f"\n  M7.1-Long dashboard  ->  http://127.0.0.1:{port}\n")
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
