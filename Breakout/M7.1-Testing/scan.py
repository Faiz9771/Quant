"""
scan.py  --  M7.1-Long opportunity scanner + locked-capital simulator
=====================================================================
What it does, end to end:
  1. Pulls the current Nifty 50 constituent list from Wikipedia.
  2. Downloads daily OHLCV for every constituent + the ^NSEI index for SCAN_YEAR
     (plus ~1 year of lead-in so SMA200/RS have history) via yfinance.
  3. Pulls daily FII cash-flow data (Step 13 H1 layer). Two sources are attempted;
     if both fail it falls back to a clearly-labelled neutral FII feed so the run
     still completes (and tells you the FII layer was not live).
  4. For EACH trading day in SCAN_YEAR, runs ALL 50 stocks through the full M7.1
     checklist (m71_checklist.evaluate). Every 'BUY' / 'BUY STARTER' verdict is
     logged as a trade with entry, stop, targets.
  5. Simulates the resulting trade log with the EXACT money-management rule you
     specified: capital committed to a position is LOCKED until that position hits
     its own exit (target, stop, or time-stop), then released for the next signal.
  6. Writes:
        - signals_<year>.csv   (your CSV schema: every Buy verdict, Step-19 fields)
        - simulation_<year>.csv (per-trade P&L with locked/freed capital + equity)
        - summary_<year>.txt    (confusion-style summary + equity/CAGR/drawdown)

HOW TO RUN
----------
  pip install -r requirements.txt
  python scan.py                 # uses SCAN_YEAR below
  python scan.py --year 2023     # override on the command line

Edit the CONFIG block to change capital, slots, and sizing.
"""
from __future__ import annotations
import argparse, os, sys, time, io
from datetime import datetime, timedelta
import numpy as np
import pandas as pd

import m71_checklist as cl

# ============================== CONFIG ==============================
# Scan a single year OR a span of years. Set START_YEAR == END_YEAR for one year.
START_YEAR       = 2021         # first year to scan (inclusive)
END_YEAR         = 2023         # last year to scan (inclusive); == START_YEAR for one year
START_CAPITAL    = 1_000_000     # Rs (compounded continuously across the whole span)
SLOTS            = 5             # max concurrent positions (O'Neil 4-5 concentration)
SIZING           = "equal"      # "equal" or "risk"
RISK_PCT         = 1.0          # used if SIZING == "risk" (% equity risked to stop)
TIME_STOP_DAYS   = 28           # Step 7-8 time stop: no new high in ~3-4 weeks -> exit
INDEX_TICKER     = "^NSEI"
MIN_VERDICTS     = ("BUY", "BUY STARTER")
ONE_TRADE_PER_STOCK_AT_A_TIME = True
# ===================================================================


def log(*a):
    print(*a, file=sys.stderr, flush=True)


# ----------------------------- data: Nifty 50 list -----------------------------
def get_nifty50_symbols() -> list[str]:
    """Nifty 50 constituents as yfinance tickers (.NS).

    Cached to disk for 30 days: Wikipedia 403s from cloud IPs, so hitting it on
    every scan added latency and flakiness. We reuse a fresh cache, only refetch
    when stale, and cache even the bundled fallback so a 403 doesn't re-fire each
    scan for a month.
    """
    import json as _json
    cache = Path(__file__).parent / ".scan_cache" / "nifty50_list.json"
    try:
        if cache.exists():
            obj = _json.loads(cache.read_text())
            age_days = (pd.Timestamp.now() - pd.Timestamp(obj["ts"])).days
            if age_days < 30 and obj.get("symbols"):
                return obj["symbols"]
    except Exception:
        pass

    syms = None
    try:
        for t in pd.read_html("https://en.wikipedia.org/wiki/NIFTY_50"):
            sym_col = next((c for c in t.columns if "symbol" in str(c).lower()), None)
            if sym_col is not None:
                s = [str(x).strip().upper() for x in t[sym_col].dropna()]
                s = [x for x in s if x.isalnum() or "&" in x]
                if 40 <= len(s) <= 55:
                    syms = [f"{x}.NS" for x in s]
                    break
    except Exception as e:
        log(f"[WARN] Wikipedia fetch failed ({e}); using bundled fallback list.")

    if not syms:
        from nifty_fallback import NIFTY50
        syms = [f"{s}.NS" for s in NIFTY50]

    try:
        cache.parent.mkdir(exist_ok=True)
        cache.write_text(_json.dumps({"ts": str(pd.Timestamp.now()), "symbols": syms}))
    except Exception:
        pass
    return syms


# ----------------------------- data: OHLCV -----------------------------
def download_prices(tickers, start, end, min_rows=250):
    """
    Robust OHLCV download. Yahoo rate-limits big threaded batches (yfinance then throws
    "'NoneType' object is not subscriptable" for the dropped names), so we download in
    small NON-threaded chunks, retry empty ones, and finally fall back to per-ticker
    Ticker.history() for anything still missing.
    """
    import yfinance as yf
    tickers = list(dict.fromkeys(tickers))
    log(f"[INFO] downloading {len(tickers)} tickers {start}..{end} via yfinance")
    out = {}

    def _store(tk, df):
        if df is None or len(df) == 0:
            return False
        df = df.dropna()
        if getattr(df.index, "tz", None) is not None:   # normalise tz-aware -> naive dates
            df = df.copy()
            df.index = df.index.tz_localize(None)
        if not all(c in df.columns for c in ("Open", "High", "Low", "Close", "Volume")):
            return False
        if len(df) > min_rows:
            out[tk] = df[["Open", "High", "Low", "Close", "Volume"]].copy()
            return True
        return False

    # Small NON-threaded chunks: measured faster here than big threaded batches,
    # which trip Yahoo rate-limiting from the cloud IP and fall into slow retries.
    CHUNK = 8
    remaining = list(tickers)
    for attempt in range(3):
        if not remaining:
            break
        still = []
        for i in range(0, len(remaining), CHUNK):
            chunk = remaining[i:i + CHUNK]
            try:
                data = yf.download(chunk, start=start, end=end, group_by="ticker",
                                   auto_adjust=True, progress=False, threads=False)
            except Exception as e:
                log(f"[WARN] chunk download failed ({e}); will retry per-ticker")
                data = None
            for tk in chunk:
                got = False
                if data is not None and len(data):
                    try:
                        sub = data[tk] if len(chunk) > 1 else data
                        got = _store(tk, sub)
                    except Exception:
                        got = False
                if not got:
                    still.append(tk)
            time.sleep(0.6)  # be gentle with Yahoo between chunks
        remaining = still
        if remaining and attempt < 2:
            log(f"[WARN] {len(remaining)} tickers empty; retry pass {attempt + 2} ...")
            time.sleep(2.0)

    # per-ticker fallback for stubborn names
    for tk in list(remaining):
        for _ in range(2):
            try:
                h = yf.Ticker(tk).history(start=start, end=end, auto_adjust=True)
                if _store(tk, h):
                    remaining.remove(tk)
                    break
            except Exception:
                pass
            time.sleep(1.0)

    missing = [t for t in tickers if t not in out]
    if missing:
        log(f"[WARN] no usable data for {len(missing)}: {missing}")
    log(f"[INFO] usable price series: {len(out)}/{len(tickers)}")
    return out


# ----------------------------- data: FII flows (Step 13) -----------------------------
from pathlib import Path
_FII_CACHE = Path(__file__).parent / ".fii_cache"
MONEYCONTROL_FII_URL = "https://www.moneycontrol.com/techmvc/responsive/fiidii/monthly"
_FII_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://www.moneycontrol.com/stocks/marketstats/fii_dii_activity/index.php",
    "X-Requested-With": "XMLHttpRequest",
}


def _fetch_fii_month(session, y: int, m: int) -> pd.DataFrame:
    """One month of FII cash activity from MoneyControl -> DataFrame[Date, fii_net_cr].

    Fully-past months are cached to .fii_cache/ (they never change); the current month
    is always re-fetched since today's row updates intraday.
    """
    cache = _FII_CACHE / f"fii_{y}-{m:02d}.csv"
    today = pd.Timestamp.today()
    is_past = (y, m) < (today.year, today.month)
    if cache.exists() and is_past:
        return pd.read_csv(cache, parse_dates=["Date"])

    r = session.get(MONEYCONTROL_FII_URL,
                    params={"month": m, "year": y, "section": "cash", "sub_section": "cash"},
                    timeout=25)
    r.raise_for_status()
    df = pd.read_html(io.StringIO(r.text))[0]
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [c[-1] if c[-1] != c[0] else c[0] for c in df.columns]
    df.columns = ["Date", "FII_GP", "FII_GS", "FII_Net", "DII_GP", "DII_GS", "DII_Net"]
    df = df[~df["Date"].astype(str).str.contains("Total", case=False, na=False)]
    df["Date"] = df["Date"].astype(str).str.replace(r"</a>", "", regex=False).str.strip()
    df["Date"] = pd.to_datetime(df["Date"], format="%d-%b-%Y")
    df["fii_net_cr"] = pd.to_numeric(df["FII_Net"].astype(str).str.replace(",", ""), errors="coerce")
    out = df[["Date", "fii_net_cr"]].dropna()
    if is_past and len(out):
        _FII_CACHE.mkdir(exist_ok=True)
        out.to_csv(cache, index=False)
    return out


def get_fii_daily(start, end) -> pd.DataFrame:
    """
    Daily FII net cash flow in Rs crore, indexed by date, scraped from MoneyControl's
    monthly FII/DII cash dataset (the same source as Data-Fetch/FII-DII/fetch-fii-dii.py).
    Iterates month by month across [start, end] and caches each past month on disk.
    If the site is unreachable for the whole span, returns a neutral (zeros) feed flagged
    via .attrs['live']=False so the summary can disclose that Step-13 ran H1-Neutral.
    """
    import requests
    start_ts, end_ts = pd.Timestamp(start), pd.Timestamp(end)
    session = requests.Session()
    session.headers.update(_FII_HEADERS)

    rows, y, m = [], start_ts.year, start_ts.month
    while (y, m) <= (end_ts.year, end_ts.month):
        try:
            dfm = _fetch_fii_month(session, y, m)
            if dfm is not None and len(dfm):
                rows.append(dfm)
        except Exception as e:
            log(f"[WARN] FII {m:02d}/{y} failed: {e}")
        m += 1
        if m > 12:
            m, y = 1, y + 1

    if rows:
        allf = pd.concat(rows, ignore_index=True).dropna()
        allf = allf[(allf["Date"] >= start_ts) & (allf["Date"] <= end_ts)]
        out = allf.set_index("Date")[["fii_net_cr"]].sort_index()
        out = out[~out.index.duplicated(keep="last")]
        out.attrs["live"] = True
        log(f"[INFO] FII live from MoneyControl: {len(out)} sessions {start}..{end}")
        return out

    idx = pd.bdate_range(start, end)
    out = pd.DataFrame({"fii_net_cr": np.zeros(len(idx))}, index=idx)
    out.attrs["live"] = False
    log("[WARN] FII layer NOT live -- MoneyControl unreachable; using neutral feed (H1-Neutral).")
    return out


def fii_features(fii_df: pd.DataFrame, date) -> dict:
    """Step 13 inputs as of 'date': consecutive positive sessions + 5-day inflow."""
    hist = fii_df[fii_df.index <= pd.Timestamp(date)]["fii_net_cr"]
    if len(hist) == 0:
        return dict(consec_pos_sessions=0, inflow_5d_cr=0.0, market_score=0.0)
    consec = 0
    for v in reversed(hist.values):
        if v > 0:
            consec += 1
        else:
            break
    inflow5 = float(hist.iloc[-5:].sum())
    # crude market score from 5-day flow direction, clamped to [-10, +10]
    mkt = float(np.clip(inflow5 / 1000.0, -10, 10))
    return dict(consec_pos_sessions=consec, inflow_5d_cr=inflow5, market_score=round(mkt, 1))


# ----------------------------- scan -----------------------------
def _resolve_exit(df, i, entry, stop, t1):
    """Walk forward prices from entry bar i to find the exit (stop / target / time-stop)."""
    last_high = entry; bars_since_high = 0
    for j in range(i + 1, min(i + 1 + 120, len(df))):
        hi = float(df["High"].iloc[j]); lo = float(df["Low"].iloc[j]); cpx = float(df["Close"].iloc[j])
        if hi > last_high:
            last_high = hi; bars_since_high = 0
        else:
            bars_since_high += 1
        if lo <= stop:
            return stop, df.index[j], "stop"
        if hi >= t1:
            return t1, df.index[j], "target"
        if bars_since_high >= TIME_STOP_DAYS:
            return cpx, df.index[j], "time-stop"
    j = min(i + 120, len(df) - 1)
    return float(df["Close"].iloc[j]), df.index[j], "horizon"


def scan_and_simulate(start_year: int, end_year: int):
    """
    Single chronological pass across one OR many years, scan + locked-capital sim fused.

    Multi-year behaviour:
      - Prices/FII are downloaded ONCE for the whole span (start_year-1 lead-in through
        end_year), so SMA200/RS stay continuous across year boundaries.
      - Capital compounds CONTINUOUSLY: a position open at a year-end carries into the
        next year; equity is never reset per year.
      - Per-year contribution is tracked for the summary (entry-year basis).

    OPTIMISATION (capital-aware scanning): on any day where, after releasing positions
    whose exit has arrived, ALL slots are occupied AND no cash is free, the 50-stock scan
    is skipped (no Buy could be booked). Days that could book a trade are always scanned.
    """
    scan_start = f"{start_year}-01-01"
    scan_end   = f"{end_year}-12-31"
    lead_start = f"{start_year-1}-01-01"   # lead-in for SMA200/RS before the first year

    tickers = get_nifty50_symbols()
    prices = download_prices(tickers, lead_start, scan_end)
    if INDEX_TICKER not in prices:
        prices.update(download_prices([INDEX_TICKER], lead_start, scan_end))
    index_close = prices[INDEX_TICKER]["Close"]
    fii_df = get_fii_daily(lead_start, scan_end)

    cal = index_close[(index_close.index >= pd.Timestamp(scan_start)) &
                      (index_close.index <= pd.Timestamp(scan_end))].index

    # portfolio state (continuous across the whole span)
    cash = START_CAPITAL; realized = START_CAPITAL
    open_pos = []; held_syms = set(); peak = START_CAPITAL; dd = 0.0
    signals = []      # every BUY/STARTER verdict found (for signals CSV)
    ledger = []       # booked + blocked trades (for simulation CSV)
    days_scanned = 0; days_skipped = 0
    year_pnl = {y: 0.0 for y in range(start_year, end_year + 1)}  # realized P&L per entry-year

    stock_items = [(tk, df) for tk, df in prices.items() if tk != INDEX_TICKER]
    span = f"{start_year}" if start_year == end_year else f"{start_year}-{end_year}"
    log(f"[INFO] span {span}: {len(cal)} trading days x {len(stock_items)} stocks "
        f"(capital-aware skipping ON)")

    for d in cal:
        # 1) release positions whose exit has arrived on/before today
        still = []
        for p in open_pos:
            if p["exit_date"] <= d:
                cash += p["locked"] + p["pnl"]; realized += p["pnl"]
                year_pnl[p["entry_year"]] = year_pnl.get(p["entry_year"], 0.0) + p["pnl"]
                held_syms.discard(p["sym"])
            else:
                still.append(p)
        open_pos = still

        # 2) OPTIMISATION: if no slot and no cash, skip the whole-day scan
        slot_free = len(open_pos) < SLOTS
        cash_free = cash > 1.0
        if not (slot_free and cash_free):
            days_skipped += 1
            continue
        days_scanned += 1

        # 3) scan all 50 stocks for today
        ff = fii_features(fii_df, d)
        todays_buys = []
        for tk, df in stock_items:
            if d not in df.index:
                continue
            i = df.index.get_loc(d)
            if isinstance(i, slice) or i < 220:
                continue
            sn = cl.Snapshot(df, i, index_close, ff)
            res = cl.evaluate(sn)
            res["Symbol"] = tk.replace(".NS", "")
            if res["Verdict"] in MIN_VERDICTS:
                signals.append(res)
                todays_buys.append((tk, df, i, res))

        # 4) book today's buys (best score first) until slots / cash run out
        todays_buys.sort(key=lambda x: x[3]["Score"], reverse=True)
        for tk, df, i, res in todays_buys:
            if len(open_pos) >= SLOTS:
                _log_block(ledger, res, d, "BLOCK-slots", realized); continue
            if ONE_TRADE_PER_STOCK_AT_A_TIME and res["Symbol"] in held_syms:
                _log_block(ledger, res, d, "BLOCK-dup", realized); continue
            entry, stop, t1 = res["Entry"], res["Stop"], res["T1"]
            exit_px, exit_date, reason = _resolve_exit(df, i, entry, stop, t1)
            pct = (exit_px / entry - 1) * 100
            equity_basis = realized + sum(p["locked"] for p in open_pos)
            if SIZING == "equal":
                want = equity_basis / SLOTS
            else:
                stop_dist = max(0.005, (entry - stop) / entry)
                want = equity_basis * (RISK_PCT / 100) / stop_dist
            if res["Verdict"] == "BUY STARTER":
                want *= 0.4
            locked = min(want, cash)
            if locked <= 0:
                _log_block(ledger, res, d, "BLOCK-cash", realized); continue
            cash -= locked
            pnl = locked * pct / 100
            open_pos.append(dict(sym=res["Symbol"], exit_date=pd.Timestamp(exit_date),
                                 locked=locked, pnl=pnl, entry_year=d.year))
            held_syms.add(res["Symbol"])
            ledger.append(dict(sym=res["Symbol"], entry_date=d, exit_date=pd.Timestamp(exit_date),
                               entry=entry, exit=exit_px, stop=stop, t1=t1, pct=pct,
                               verdict=res["Verdict"], score=res["Score"], reason=reason,
                               status=("WIN" if pct > 0 else "LOSS"),
                               locked=locked, freed=locked + pnl, equity=realized))
            mtm = cash + sum(p["locked"] + p["pnl"] for p in open_pos)
            peak = max(peak, mtm); dd = min(dd, (mtm - peak) / peak)

    # close any still-open positions at horizon
    for p in open_pos:
        cash += p["locked"] + p["pnl"]; realized += p["pnl"]
        year_pnl[p["entry_year"]] = year_pnl.get(p["entry_year"], 0.0) + p["pnl"]
    peak = max(peak, cash); dd = min(dd, (cash - peak) / peak)

    sig_df = pd.DataFrame(signals)
    led = pd.DataFrame(ledger)
    log(f"[INFO] signals: {len(sig_df)} | days scanned: {days_scanned} | "
        f"days skipped (capital blocked): {days_skipped}")
    n_years = end_year - start_year + 1
    stats_extra = dict(days_scanned=days_scanned, days_skipped=days_skipped,
                       scan_days_saved_pct=round(100*days_skipped/max(1,len(cal)), 1),
                       years=n_years, year_pnl={y: round(v) for y, v in year_pnl.items()})
    return sig_df, led, prices, index_close, fii_df, cash, dd, stats_extra


_PAR: dict = {}   # shared read-only state for parallel per-stock scanning


def _scan_one_stock(tk):
    """Scan ONE stock over the range using the shared _PAR state. Pure CPU, so it
    runs in a worker process (one stock = one independent task). Returns
    (ticker, [signal dicts]) — identical output to the old inline loop."""
    P = _PAR
    df = P["dfs"][tk]
    index_close = P["index_close"]; cal_set = P["cal_set"]; ff_cache = P["ff_cache"]
    nifty_ema9 = P["e9"]; nifty_ema25 = P["e25"]; nifty_ema50 = P["e50"]; largecap = P["largecap"]
    rows = []
    active_until = None
    positions = {ts: pos for pos, ts in enumerate(df.index)}
    for ts in df.index:
        if ts not in cal_set:
            continue
        if active_until is not None and ts <= active_until:
            continue
        i = positions[ts]
        if i < 220:
            continue
        sn = cl.Snapshot(df, i, index_close, ff_cache[ts])
        res = cl.evaluate(sn)
        if res["Verdict"] not in MIN_VERDICTS:
            continue
        entry, stop, t1 = res["Entry"], res["Stop"], res["T1"]
        exit_px, exit_date, reason = _resolve_exit(df, i, entry, stop, t1)
        exit_ts = pd.Timestamp(exit_date)
        pct = (exit_px / entry - 1) * 100
        tdays = positions.get(exit_ts, i) - i
        nclose = float(index_close.loc[ts])
        e9 = float(nifty_ema9.loc[ts]); e25 = float(nifty_ema25.loc[ts]); e50 = float(nifty_ema50.loc[ts])
        above9 = bool(nclose > e9) if e9 == e9 else None
        above25 = bool(nclose > e25) if e25 == e25 else None
        above50 = bool(nclose > e50) if e50 == e50 else None
        rows.append(dict(
            sym=res["Symbol"] or tk.replace(".NS", ""),
            entry_date=str(ts.date()), exit_date=str(exit_ts.date()),
            entry=round(entry, 2), exit=round(exit_px, 2), pct=round(pct, 3),
            reason=reason, verdict=res["Verdict"], score=res["Score"],
            stop_pct=res.get("StopPct"), t1_pct=res.get("T1Pct"),
            rs=res.get("RS"), confidence=res.get("Confidence"),
            fii_status=res.get("FIIstatus"), base_height=res.get("BaseHeight"),
            mkt=("LARGECAP" if tk in largecap else "MIDCAP"),
            whip=bool(reason == "stop" and pct < 0 and tdays <= 7),
            days_held=int(tdays),
            nifty_above_9ema=above9, nifty_above_25ema=above25, nifty_above_50ema=above50,
            atr_pct=(round(sn.atr / entry, 4) if (sn.atr == sn.atr and entry) else None),
        ))
        active_until = exit_ts
    return tk, rows


def scan_signals(start_date: str, end_date: str, progress=None):
    """
    Pure opportunity scan, DECOUPLED from money-management.

    Runs the full M7.1 checklist on every Nifty 50 constituent for every trading day
    in the EXACT date range [start_date, end_date] (YYYY-MM-DD) and returns one record
    per DISTINCT trade opportunity (BUY / BUY STARTER), with its forward-resolved exit
    already computed. Unlike scan_and_simulate(), it does NOT apply slots / capital /
    skipping — so the caller (the dashboard) can run any locked-capital config on top.

    Per stock, once a Buy fires its exit date is known, so the stock is not re-signalled
    until that trade would have closed (mirrors one-trade-per-stock-at-a-time).

    Returns (signals: list[dict], meta: dict). `progress`, if given, is called with each
    ticker as it finishes (for streaming a progress bar).
    """
    scan_start = str(start_date)
    scan_end   = str(end_date)
    # ~1 year lead-in so SMA200 / RS have history before the first scanned day
    lead_start = (pd.Timestamp(scan_start) - pd.DateOffset(years=1)).strftime("%Y-%m-%d")

    tickers = get_nifty50_symbols()
    prices = download_prices(tickers, lead_start, scan_end)
    if INDEX_TICKER not in prices:
        prices.update(download_prices([INDEX_TICKER], lead_start, scan_end))
    index_close = prices[INDEX_TICKER]["Close"]
    fii_df = get_fii_daily(lead_start, scan_end)

    cal = index_close[(index_close.index >= pd.Timestamp(scan_start)) &
                      (index_close.index <= pd.Timestamp(scan_end))].index
    cal_set = set(cal)

    # NIFTY 50 market-regime filter: index vs its 9 / 25 / 50 EMA on the entry date
    nifty_ema9 = cl.ema(index_close, 9)
    nifty_ema25 = cl.ema(index_close, 25)
    nifty_ema50 = cl.ema(index_close, 50)

    stock_items = [(tk, df) for tk, df in prices.items() if tk != INDEX_TICKER]

    # market-cap proxy via median daily turnover over the span: top half = LARGECAP
    turnover = {}
    for tk, df in stock_items:
        sub = df[(df.index >= pd.Timestamp(scan_start)) & (df.index <= pd.Timestamp(scan_end))]
        turnover[tk] = float((sub["Close"] * sub["Volume"]).median()) if len(sub) else 0.0
    ranked = sorted(turnover, key=turnover.get, reverse=True)
    largecap = set(ranked[: max(1, len(ranked) // 2)])

    # Precompute FII features for every scan day ONCE (cheap), so the per-stock
    # work below is pure CPU and can be split across cores.
    ff_cache = {ts: fii_features(fii_df, ts) for ts in cal}

    # Shared read-only state for the per-stock workers (inherited via fork — no
    # pickling of the big price frames; only ticker strings cross the boundary).
    global _PAR
    _PAR = dict(dfs={tk: df for tk, df in stock_items}, index_close=index_close,
                cal_set=cal_set, ff_cache=ff_cache, e9=nifty_ema9, e25=nifty_ema25,
                e50=nifty_ema50, largecap=largecap)

    out = []
    # Serial by default: on the throttled micro VM (burstable vCPUs + 498MB)
    # multiprocessing is SLOWER (CPU steal + memory contention). Set
    # M71_SCAN_WORKERS=2+ only on a box with real, dedicated cores and RAM.
    workers = int(os.environ.get("M71_SCAN_WORKERS", "1"))
    use_par = workers > 1 and len(stock_items) > 1
    if use_par:
        try:
            import concurrent.futures as cf, multiprocessing as mp
            ctx = mp.get_context("fork")
            with cf.ProcessPoolExecutor(max_workers=workers, mp_context=ctx) as ex:
                futs = {ex.submit(_scan_one_stock, tk): tk for tk, _ in stock_items}
                for fut in cf.as_completed(futs):
                    _tk, rows = fut.result()
                    out.extend(rows)
                    if progress:
                        progress(_tk)
        except Exception as e:
            log(f"[WARN] parallel scan failed ({e}); falling back to serial")
            use_par = False
            out = []
    if not use_par:
        for tk, _ in stock_items:
            _tk, rows = _scan_one_stock(tk)
            out.extend(rows)
            if progress:
                progress(_tk)

    out.sort(key=lambda r: r["entry_date"])
    # NIFTY 50 index closes over the scan range, for a rebased buy-&-hold benchmark line
    nifty = [[str(ts.date()), round(float(index_close.loc[ts]), 2)] for ts in cal]
    meta = dict(
        span=f"{scan_start}_{scan_end}",
        start_date=scan_start, end_date=scan_end, n_stocks=len(stock_items),
        n_signals=len(out), trading_days=len(cal),
        fii_live=bool(fii_df.attrs.get("live", False)),
        nifty=nifty,
    )
    return out, meta


def live_scan(asof: str | None = None, progress=None):
    """
    LIVE watchlist: run the M7.1 checklist on the MOST RECENT available bar of every
    Nifty 50 constituent and return the stocks that fire BUY / BUY STARTER *right now*
    (as of `asof`, default today). These are OPEN signals — no forward exit is resolved,
    since the trade hasn't happened yet — so each row is an actionable entry/stop/targets
    plan plus the live NIFTY regime and FII context.
    """
    asof = asof or pd.Timestamp.today().normalize().strftime("%Y-%m-%d")
    end_dl = (pd.Timestamp(asof) + pd.Timedelta(days=2)).strftime("%Y-%m-%d")  # yf end is exclusive
    lead_start = (pd.Timestamp(asof) - pd.DateOffset(months=18)).strftime("%Y-%m-%d")

    tickers = get_nifty50_symbols()
    prices = download_prices(tickers, lead_start, end_dl)
    if INDEX_TICKER not in prices:
        prices.update(download_prices([INDEX_TICKER], lead_start, end_dl))
    index_close = prices[INDEX_TICKER]["Close"]
    fii_df = get_fii_daily(lead_start, end_dl)
    e9, e25, e50 = cl.ema(index_close, 9), cl.ema(index_close, 25), cl.ema(index_close, 50)

    stock_items = [(tk, df) for tk, df in prices.items() if tk != INDEX_TICKER]
    turnover = {tk: float((df["Close"] * df["Volume"]).tail(250).median()) for tk, df in stock_items}
    ranked = sorted(turnover, key=turnover.get, reverse=True)
    largecap = set(ranked[: max(1, len(ranked) // 2)])

    def _regime_at(ts):
        pos = index_close.index.get_indexer([pd.Timestamp(ts)], method="ffill")[0]
        if pos < 0:
            return None, None, None
        nc = float(index_close.iloc[pos])
        a9 = bool(nc > e9.iloc[pos]) if e9.iloc[pos] == e9.iloc[pos] else None
        a25 = bool(nc > e25.iloc[pos]) if e25.iloc[pos] == e25.iloc[pos] else None
        a50 = bool(nc > e50.iloc[pos]) if e50.iloc[pos] == e50.iloc[pos] else None
        return a9, a25, a50

    out = []
    for tk, df in stock_items:
        i = len(df) - 1
        if i < 220:
            if progress: progress(tk)
            continue
        ts = df.index[i]
        sn = cl.Snapshot(df, i, index_close, fii_features(fii_df, ts))
        res = cl.evaluate(sn)
        if res["Verdict"] in MIN_VERDICTS:
            a9, a25, a50 = _regime_at(ts)
            out.append(dict(
                sym=res["Symbol"] or tk.replace(".NS", ""), date=str(ts.date()),
                entry=res["Entry"], stop=res["Stop"], t1=res["T1"], t2=res["T2"],
                stop_pct=res.get("StopPct"), t1_pct=res.get("T1Pct"),
                verdict=res["Verdict"], score=res["Score"], rs=res.get("RS"),
                confidence=res.get("Confidence"), fii_status=res.get("FIIstatus"),
                base_height=res.get("BaseHeight"),
                mkt=("LARGECAP" if tk in largecap else "MIDCAP"),
                atr_pct=(round(sn.atr / res["Entry"], 4) if (sn.atr == sn.atr and res["Entry"]) else None),
                nifty_above_9ema=a9, nifty_above_25ema=a25, nifty_above_50ema=a50,
            ))
        if progress:
            progress(tk)

    out.sort(key=lambda r: r["score"], reverse=True)
    last_ts = index_close.index[-1]
    a9, a25, a50 = _regime_at(last_ts)
    meta = dict(
        asof=str(last_ts.date()), requested=asof, n_stocks=len(stock_items),
        n_signals=len(out), fii_live=bool(fii_df.attrs.get("live", False)),
        nifty_close=round(float(index_close.iloc[-1]), 2),
        nifty_above_9ema=a9, nifty_above_25ema=a25, nifty_above_50ema=a50,
    )
    return out, meta


def backfill_cache_days(cache_dir=None):
    """
    Add exact `days_held` (trading days between entry & exit) to every cached signals_*.json
    WITHOUT re-running the 50-stock scan. Builds the real NSE trading calendar from a single
    ^NSEI download covering the whole span, then counts sessions between each signal's dates.
    """
    import glob
    cdir = Path(cache_dir or (Path(__file__).parent / ".scan_cache"))
    files = sorted(glob.glob(str(cdir / "signals_*.json")))
    if not files:
        log("[backfill] no signals cache files found"); return

    lo = hi = None
    payloads = {}
    for f in files:
        p = json.load(open(f)); payloads[f] = p
        for s in p.get("signals", []):
            for k in ("entry_date", "exit_date"):
                d = s.get(k)
                if d:
                    lo = d if (lo is None or d < lo) else lo
                    hi = d if (hi is None or d > hi) else hi
    if lo is None:
        log("[backfill] no dated signals"); return

    end_dl = (pd.Timestamp(hi) + pd.Timedelta(days=4)).strftime("%Y-%m-%d")
    idx = download_prices([INDEX_TICKER], lo, end_dl, min_rows=5)[INDEX_TICKER].index
    cal = np.array([d.strftime("%Y-%m-%d") for d in idx])
    log(f"[backfill] NSE calendar {cal[0]}..{cal[-1]} ({len(cal)} sessions)")

    def tdays(a, b):
        return int(np.searchsorted(cal, b) - np.searchsorted(cal, a))

    for f, p in payloads.items():
        changed = 0
        for s in p.get("signals", []):
            if s.get("days_held") is None and s.get("entry_date") and s.get("exit_date"):
                s["days_held"] = tdays(s["entry_date"], s["exit_date"]); changed += 1
        if changed:
            with open(f, "w") as fh:
                json.dump(p, fh)
            log(f"[backfill] {f.split('/')[-1]}: filled {changed} signals")
    log("[backfill] done")


import json  # used by backfill (kept local-friendly)


def live_quotes(syms):
    """Latest close + ATR(14) for a small set of tickers (for tracking locked positions)."""
    if not syms:
        return {}
    tickers = [s if s.endswith(".NS") else f"{s}.NS" for s in syms]
    end_dl = (pd.Timestamp.today() + pd.Timedelta(days=2)).strftime("%Y-%m-%d")
    start = (pd.Timestamp.today() - pd.DateOffset(months=6)).strftime("%Y-%m-%d")
    prices = download_prices(tickers, start, end_dl, min_rows=20)
    out = {}
    for tk, df in prices.items():
        if len(df) < 15:
            continue
        a = cl.atr(df, 14)
        close = float(df["Close"].iloc[-1]); atrv = float(a.iloc[-1])
        out[tk.replace(".NS", "")] = dict(
            price=round(close, 2), atr=round(atrv, 2),
            atr_pct=(round(atrv / close, 4) if close else None),
            date=str(df.index[-1].date()),
        )
    return out


def _run_job(out_path, status_path, fn, *args):
    """Run a heavy scan `fn(*args, progress=...)` in THIS (child) process, writing
    incremental progress to status_path and the final {meta,signals} payload to
    out_path. app.py spawns this as a subprocess so the web worker never blocks on
    the CPU-bound checklist. Status file lifecycle: running -> (out_path written) ->
    done, or -> error with a message."""
    from pathlib import Path as _P
    state = {"n": 0}

    def _wp(status, **extra):
        try:
            _P(status_path).write_text(json.dumps(
                {"status": status, "done": state["n"], "total": 50, **extra}))
        except Exception:
            pass

    def progress(_tk):
        state["n"] += 1
        if state["n"] % 2 == 0 or state["n"] >= 49:   # throttle disk writes
            _wp("running")

    try:
        _wp("running")
        signals, meta = fn(*args, progress=progress)
        _P(out_path).write_text(json.dumps({"meta": meta, "signals": signals}))
        _wp("done")
    except Exception as e:
        log(f"[scanjob] FAILED: {e}")
        _wp("error", error=str(e))


def run_range_job(start, end, out_path, status_path):
    """Subprocess entry: full date-range opportunity scan -> out_path."""
    _run_job(out_path, status_path, scan_signals, start, end)


def run_live_job(asof, out_path, status_path):
    """Subprocess entry: live 'today' watchlist scan -> out_path."""
    _run_job(out_path, status_path, live_scan, asof)


def _log_block(ledger, res, d, status, realized):
    ledger.append(dict(sym=res["Symbol"], entry_date=d, exit_date=pd.NaT,
                       entry=res["Entry"], exit=np.nan, stop=res["Stop"], t1=res["T1"],
                       pct=np.nan, verdict=res["Verdict"], score=res["Score"],
                       reason="", status=status, locked=0, freed=0, equity=realized))


def finalize_stats(led: pd.DataFrame, end_cash, dd, stats_extra):
    n_years = max(1, stats_extra.get("years", 1))
    cagr = round(((end_cash / START_CAPITAL) ** (1 / n_years) - 1) * 100, 1)
    if led.empty:
        return dict(start=START_CAPITAL, end=round(end_cash), ret_pct=0.0, cagr=cagr,
                    max_dd=round(dd*100, 1), signals=0, taken=0, blocked=0, wins=0, losses=0,
                    win_rate=0.0, avg_win=0, avg_loss=0, slots=SLOTS, sizing=SIZING, **stats_extra)
    taken = led[led["status"].isin(["WIN", "LOSS"])]
    wins = int((taken["pct"] > 0).sum()) if not taken.empty else 0
    losses = int((taken["pct"] <= 0).sum()) if not taken.empty else 0
    return dict(
        start=START_CAPITAL, end=round(end_cash), ret_pct=round((end_cash/START_CAPITAL-1)*100, 1),
        cagr=cagr, max_dd=round(dd*100, 1), signals=int((led["status"] != "").sum()), taken=len(taken),
        blocked=int(led["status"].str.startswith("BLOCK").sum()),
        wins=wins, losses=losses,
        win_rate=round(wins/max(1, wins+losses)*100, 1),
        avg_win=round(taken[taken.pct > 0]["pct"].mean(), 2) if wins else 0,
        avg_loss=round(taken[taken.pct <= 0]["pct"].mean(), 2) if losses else 0,
        slots=SLOTS, sizing=SIZING, **stats_extra,
    )


def main():
    ap = argparse.ArgumentParser(description="M7.1-Long multi-year Nifty 50 scanner + simulator")
    ap.add_argument("--start-year", type=int, default=START_YEAR, help="first year (inclusive)")
    ap.add_argument("--end-year", type=int, default=END_YEAR, help="last year (inclusive)")
    ap.add_argument("--year", type=int, default=None, help="shortcut: scan a single year")
    args = ap.parse_args()
    if args.year is not None:
        sy = ey = args.year
    else:
        sy, ey = args.start_year, args.end_year
    if ey < sy:
        sy, ey = ey, sy
    span = f"{sy}" if sy == ey else f"{sy}-{ey}"

    sig_df, led, prices, index_close, fii_df, end_cash, dd, stats_extra = scan_and_simulate(sy, ey)

    sig_path = f"signals_{span}.csv"
    sig_df.to_csv(sig_path, index=False)
    log(f"[OK] wrote {sig_path}")

    sim_path = f"simulation_{span}.csv"
    led.to_csv(sim_path, index=False)
    log(f"[OK] wrote {sim_path}")

    stats = finalize_stats(led, end_cash, dd, stats_extra)
    year_pnl = stats.pop("year_pnl", {})

    fii_live = fii_df.attrs.get("live", False)
    with open(f"summary_{span}.txt", "w") as f:
        f.write(f"M7.1-LONG SCAN SUMMARY  ·  YEARS {span}\n")
        f.write("=" * 48 + "\n")
        f.write(f"FII layer live: {fii_live}\n")
        for k, v in stats.items():
            f.write(f"{k:18}: {v}\n")
        f.write("\nRealized P&L by entry-year (Rs):\n")
        for y in sorted(year_pnl):
            f.write(f"  {y}: {year_pnl[y]:>14,}\n")
    log(f"[OK] wrote summary_{span}.txt")

    print(f"\n=== SUMMARY · YEARS {span} ===")
    for k, v in stats.items():
        print(f"{k:18}: {v}")
    print("\nRealized P&L by entry-year (Rs):")
    for y in sorted(year_pnl):
        print(f"  {y}: {year_pnl[y]:>14,}")
    if not fii_live:
        print("\nNOTE: FII feed was not live -> Step-13 ran as H1-Neutral. "
              "Wire in Kite/NSE FII data for the real layer.")


if __name__ == "__main__":
    main()
