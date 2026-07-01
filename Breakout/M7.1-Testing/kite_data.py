"""
Zerodha Kite Connect data layer (DATA ONLY — no order execution).

Drop-in replacement for scan.py's yfinance `download_prices(...)`: same call
signature, same return shape ({ticker: DataFrame[Open,High,Low,Close,Volume]}),
same ticker conventions ("RELIANCE.NS" for stocks, "^NSEI" for the NIFTY 50 index).

Credentials & session
---------------------
  - api_key / api_secret: from env KITE_API_KEY / KITE_API_SECRET, else
    .kite/credentials.json  ({"api_key": "...", "api_secret": "..."}).
  - access_token (expires daily ~6am IST): env KITE_ACCESS_TOKEN, else
    .kite/access_token.txt. Refresh it with:  python kite_data.py login

Nothing here can place, modify or cancel orders — only historical_data / ltp /
quote / instruments are ever called.
"""
from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd

_DIR = Path(__file__).parent / ".kite"
_CREDS = _DIR / "credentials.json"
_TOKEN = _DIR / "access_token.txt"
_INSTR = _DIR / "instruments_NSE.csv"

# NIFTY 50 spot index — fixed Kite instrument_token (segment INDICES, no volume).
_INDEX_TOKEN = 256265
_INDEX_TICKER = "^NSEI"

# Kite historical 'day' candles are capped per request; chunk long spans.
_MAX_DAYS_PER_CALL = 1800
# Historical API allows ~3 req/s; keep a gentle floor between calls.
_REQ_GAP = 0.34


def log(*a):
    print(*a, file=sys.stderr, flush=True)


# --------------------------------------------------------------------------- creds
def _load_creds() -> tuple[str, str]:
    api_key = os.environ.get("KITE_API_KEY")
    api_secret = os.environ.get("KITE_API_SECRET")
    if api_key and api_secret:
        return api_key, api_secret
    if _CREDS.exists():
        obj = json.loads(_CREDS.read_text())
        return obj["api_key"], obj["api_secret"]
    raise RuntimeError(
        "Kite credentials missing: set KITE_API_KEY/KITE_API_SECRET or create "
        f"{_CREDS} with {{'api_key':..., 'api_secret':...}}")


def _load_access_token() -> str | None:
    tok = os.environ.get("KITE_ACCESS_TOKEN")
    if tok:
        return tok.strip()
    if _TOKEN.exists():
        return _TOKEN.read_text().strip() or None
    return None


def is_configured() -> bool:
    """True if creds + a (possibly stale) access token are present — i.e. worth trying."""
    try:
        _load_creds()
    except Exception:
        return False
    return _load_access_token() is not None


_KITE = None  # cached authenticated client


def _kite():
    global _KITE
    if _KITE is not None:
        return _KITE
    from kiteconnect import KiteConnect
    api_key, _ = _load_creds()
    token = _load_access_token()
    if not token:
        raise RuntimeError("No Kite access_token — run: python kite_data.py login")
    k = KiteConnect(api_key=api_key)
    k.set_access_token(token)
    _KITE = k
    return k


# ---------------------------------------------------------------------- instruments
def _instruments_df() -> pd.DataFrame:
    """NSE instrument dump (tradingsymbol -> instrument_token), cached for the day."""
    fresh = (
        _INSTR.exists()
        and datetime.fromtimestamp(_INSTR.stat().st_mtime).date() == datetime.now().date()
    )
    if not fresh:
        rows = _kite().instruments("NSE")
        df = pd.DataFrame(rows)
        _DIR.mkdir(exist_ok=True)
        df.to_csv(_INSTR, index=False)
    else:
        df = pd.read_csv(_INSTR)
    return df


_TOKEN_MAP: dict[str, int] | None = None


def _token_for(ticker: str) -> int | None:
    """Resolve an internal ticker ('RELIANCE.NS', '^NSEI') to a Kite instrument_token."""
    global _TOKEN_MAP
    if ticker == _INDEX_TICKER:
        return _INDEX_TOKEN
    tsym = ticker[:-3] if ticker.endswith(".NS") else ticker
    if _TOKEN_MAP is None:
        df = _instruments_df()
        eq = df[df.get("instrument_type", "EQ") == "EQ"] if "instrument_type" in df else df
        _TOKEN_MAP = dict(zip(eq["tradingsymbol"].astype(str), eq["instrument_token"].astype(int)))
    return _TOKEN_MAP.get(tsym)


# ------------------------------------------------------------------------ historical
def _hist_one(token: int, start: str, end: str) -> pd.DataFrame | None:
    """One instrument's day candles over [start, end], chunked under the API day cap."""
    k = _kite()
    s = pd.Timestamp(start).to_pydatetime()
    e = pd.Timestamp(end).to_pydatetime()
    frames = []
    cur = s
    while cur <= e:
        seg_end = min(cur + timedelta(days=_MAX_DAYS_PER_CALL), e)
        for attempt in range(3):
            try:
                data = k.historical_data(token, cur, seg_end, interval="day")
                if data:
                    frames.append(pd.DataFrame(data))
                break
            except Exception as ex:
                if attempt == 2:
                    log(f"[kite] historical failed token={token} {cur.date()}..{seg_end.date()}: {ex}")
                else:
                    time.sleep(1.0 + attempt)
            finally:
                time.sleep(_REQ_GAP)
        cur = seg_end + timedelta(days=1)
    if not frames:
        return None
    df = pd.concat(frames, ignore_index=True)
    if df.empty or "date" not in df:
        return None
    df["date"] = pd.to_datetime(df["date"])
    if getattr(df["date"].dt, "tz", None) is not None:
        df["date"] = df["date"].dt.tz_localize(None)
    df = df.drop_duplicates(subset="date").set_index("date").sort_index()
    out = pd.DataFrame({
        "Open": df["open"], "High": df["high"], "Low": df["low"],
        "Close": df["close"], "Volume": df.get("volume", 0),
    })
    return out.dropna(subset=["Open", "High", "Low", "Close"])


def download_prices(tickers, start, end, min_rows=250):
    """Drop-in for scan.download_prices, sourced from Kite historical_data.

    Returns {ticker: DataFrame[Open,High,Low,Close,Volume]} keyed by the SAME
    ticker strings passed in (e.g. 'RELIANCE.NS', '^NSEI'); series shorter than
    min_rows are dropped, matching the yfinance path's contract.
    """
    tickers = list(dict.fromkeys(tickers))
    log(f"[INFO] downloading {len(tickers)} tickers {start}..{end} via Kite")
    out = {}
    for tk in tickers:
        token = _token_for(tk)
        if token is None:
            log(f"[kite] no instrument_token for {tk}; skipping")
            continue
        df = _hist_one(token, start, end)
        if df is None or len(df) <= min_rows:
            continue
        out[tk] = df
    missing = [t for t in tickers if t not in out]
    if missing:
        log(f"[WARN] no usable Kite data for {len(missing)}: {missing}")
    log(f"[INFO] usable price series: {len(out)}/{len(tickers)}")
    return out


# ------------------------------------------------------------------------------ login
def _do_login():
    """Interactive one-time-per-day login: prints URL, exchanges request_token."""
    from kiteconnect import KiteConnect
    api_key, api_secret = _load_creds()
    k = KiteConnect(api_key=api_key)
    print("\n1) Open this URL, log in, and copy the `request_token` from the redirect URL:\n")
    print("   " + k.login_url() + "\n")
    req = input("2) Paste request_token here: ").strip()
    sess = k.generate_session(req, api_secret=api_secret)
    _DIR.mkdir(exist_ok=True)
    _TOKEN.write_text(sess["access_token"])
    print(f"\n[OK] access_token saved to {_TOKEN}")
    print("     (valid until ~6am IST tomorrow; re-run `login` to refresh)")


def _do_test():
    syms = ["RELIANCE.NS", "^NSEI"]
    end = (pd.Timestamp.today() + pd.Timedelta(days=1)).strftime("%Y-%m-%d")
    start = (pd.Timestamp.today() - pd.DateOffset(months=2)).strftime("%Y-%m-%d")
    px = download_prices(syms, start, end, min_rows=5)
    for tk, df in px.items():
        print(f"{tk:14s} rows={len(df):4d}  last={df['Close'].iloc[-1]:.2f}  on {df.index[-1].date()}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "login"
    if cmd == "login":
        _do_login()
    elif cmd == "test":
        _do_test()
    else:
        print("usage: python kite_data.py [login|test]")
