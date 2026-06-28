"""
m71_checklist.py
================
Faithful implementation of the Model M7.1-Long checklist (Model 7 + Hypothesis 1: FII).
Every step S0 .. S19 from the checklist is encoded here as a pure function over a
price/indicator snapshot. The scanner (scan.py) feeds one (stock, date) snapshot at a
time and receives the full Step-19 output dict.

The thresholds below are taken verbatim from the M7.1-Long checklist pages and the
India Market / Quant Indicator framework documents. Where the checklist is qualitative
(e.g. "no sloppy violent moves"), it is operationalised with an explicit, documented rule
so the scan is reproducible. Each such choice is marked  # OPERATIONALISED.
"""
from __future__ import annotations
import numpy as np
import pandas as pd

# ----------------------------------------------------------------------------------
# Indicator helpers (formulas per Quant_Indicators framework)
# ----------------------------------------------------------------------------------
def sma(s: pd.Series, n: int) -> pd.Series:
    return s.rolling(n).mean()

def ema(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(span=n, adjust=False).mean()

def atr(df: pd.DataFrame, n: int = 14) -> pd.Series:
    h, l, c = df["High"], df["Low"], df["Close"]
    pc = c.shift(1)
    tr = pd.concat([(h - l), (h - pc).abs(), (l - pc).abs()], axis=1).max(axis=1)
    return tr.rolling(n).mean()

def rsi(s: pd.Series, n: int = 14) -> pd.Series:
    d = s.diff()
    up = d.clip(lower=0).rolling(n).mean()
    dn = (-d.clip(upper=0)).rolling(n).mean()
    rs = up / dn.replace(0, np.nan)
    return 100 - 100 / (1 + rs)

# Relative strength vs index: ratio line, then its slope over 6 weeks (30 trading days)
def rs_line(stock_close: pd.Series, index_close: pd.Series) -> pd.Series:
    return (stock_close / index_close) * 100

def slope_pct_per_week(series: pd.Series, weeks: int = 6) -> float:
    """% change per week of the RS line over the lookback window."""
    n = weeks * 5
    if len(series.dropna()) < n + 1:
        return np.nan
    seg = series.dropna().iloc[-n:]
    if seg.iloc[0] == 0:
        return np.nan
    total_pct = (seg.iloc[-1] / seg.iloc[0] - 1) * 100
    return total_pct / weeks


# ----------------------------------------------------------------------------------
# Snapshot builder: given daily df up to 'i', produce all fields S0..S12 need
# ----------------------------------------------------------------------------------
class Snapshot:
    """All measurements the checklist needs for one stock on one decision day."""
    def __init__(self, df: pd.DataFrame, i: int, index_close: pd.Series, fii: dict):
        self.df = df
        self.i = i
        self.date = df.index[i]
        self.close = float(df["Close"].iloc[i])
        self.fii = fii  # dict with keys: consec_pos_sessions, inflow_5d_cr, market_score

        c = df["Close"]
        self.sma50 = float(sma(c, 50).iloc[i]) if i >= 50 else np.nan
        self.sma200 = float(sma(c, 200).iloc[i]) if i >= 200 else np.nan
        self.sma50_slope = (float(sma(c, 50).iloc[i] - sma(c, 50).iloc[i - 10]) if i >= 60 else np.nan)
        self.sma200_slope = (float(sma(c, 200).iloc[i] - sma(c, 200).iloc[i - 20]) if i >= 220 else np.nan)

        # ATR ratios
        a = atr(df, 14)
        self.atr = float(a.iloc[i]) if i >= 14 else np.nan
        self.atr_3m_ago = float(a.iloc[i - 63]) if i >= 63 + 14 else np.nan

        # weeks above SMA200 (consecutive)
        self.weeks_above_sma200 = self._weeks_above_sma200(c, i)

        # extension % above SMA50
        self.extension_pct = ((self.close / self.sma50 - 1) * 100) if self.sma50 == self.sma50 else np.nan

        # RS line + slope vs index
        idx = index_close.reindex(df.index).ffill()
        self.rs = rs_line(c, idx)
        self.rs_slope_6w = slope_pct_per_week(self.rs.iloc[: i + 1], 6)
        self.rs_new_high_8_12w = self._rs_new_high(self.rs.iloc[: i + 1], 60)  # 12 weeks
        self.rs_rising_6_8w = (self.rs_slope_6w is not None and self.rs_slope_6w > 0.5)

        # base detection over daily window (reuses the full-series ATR computed above)
        self.base = self._detect_base(df, i, a)

        # volume ratios
        v = df["Volume"]
        self.vol_20d = float(v.rolling(20).mean().iloc[i]) if i >= 20 else np.nan
        self.vol_12w = float(v.rolling(60).mean().iloc[i]) if i >= 60 else np.nan
        self.breakout_vol_ratio = (self.close and self.vol_20d and float(v.iloc[i]) / self.vol_20d) or np.nan

        # distribution: clustered heavy red candles in last 10 days  # OPERATIONALISED
        self.distribution = self._distribution(df, i)

        # RSI for momentum confirmation
        self.rsi14 = float(rsi(c, 14).iloc[i]) if i >= 15 else np.nan

    # --- helpers ---
    def _weeks_above_sma200(self, c, i):
        if i < 200:
            return 0
        s200 = sma(c, 200)
        cnt = 0
        j = i
        while j > 200 and c.iloc[j] > s200.iloc[j]:
            cnt += 1
            j -= 1
        return cnt // 5  # trading days -> weeks

    def _rs_new_high(self, rs_series, lookback):
        s = rs_series.dropna()
        if len(s) < lookback:
            return False
        return s.iloc[-1] >= s.iloc[-lookback:].max() * 0.999

    def _detect_base(self, df, i, a):
        """Step 4: fresh base over 10-60 trading days. Return dict of measurements.

        PERF: the per-window ATR(14) is, for any window longer than 14 bars, identical to
        the full-series ATR(14) at a fixed offset (the trailing 14 bars never include the
        window's gap-less first bar). So we reuse the precomputed series `a` instead of
        recomputing ATR ~100x per day. The dur==14 case still computes the exact window
        ATR (its first bar IS in the trailing 14), so results are bit-for-bit unchanged.
        """
        best = None
        c = df["Close"]; h = df["High"]; l = df["Low"]
        for dur in range(10, 61):
            if i - dur < 1:
                continue
            window = df.iloc[i - dur : i]
            hi = float(window["High"].max())
            lo = float(window["Low"].min())
            if lo <= 0:
                continue
            height = (hi - lo) / lo * 100
            if dur < 14:
                base_atr = np.nan
            elif dur == 14:
                base_atr = float(atr(window, 14).iloc[-1])
            else:
                base_atr = float(a.iloc[i - 1])
            prior_start = max(0, i - dur - 63)
            prior_len = (i - dur) - prior_start
            prior_atr = float(a.iloc[i - dur - 1]) if (prior_len >= 14 and i - dur - 1 >= 0) else np.nan
            atr_ratio = (base_atr / prior_atr) if (prior_atr and prior_atr == prior_atr) else np.nan
            base_vol = float(window["Volume"].mean())
            prior12 = df.iloc[max(0, i - dur - 60) : i - dur]["Volume"]
            vol_ratio = (base_vol / prior12.mean()) if len(prior12) else np.nan
            # candidate base must satisfy all conditions
            ok = (height <= 12 and
                  (atr_ratio != atr_ratio or atr_ratio <= 0.8) and
                  (vol_ratio != vol_ratio or vol_ratio <= 1.0))
            cand = dict(dur=dur, hi=hi, lo=lo, height=height,
                        atr_ratio=atr_ratio, vol_ratio=vol_ratio, valid=ok)
            # prefer the tightest valid base (lowest height)
            if ok and (best is None or height < best["height"]):
                best = cand
        if best is None:
            # return the shortest window stats anyway for logging
            return dict(dur=np.nan, hi=np.nan, lo=np.nan, height=np.nan,
                        atr_ratio=np.nan, vol_ratio=np.nan, valid=False)
        return best

    def _distribution(self, df, i):
        if i < 11:
            return False
        win = df.iloc[i - 10 : i]
        red = win["Close"] < win["Open"]
        body = (win["Open"] - win["Close"]).abs()
        heavy = body > body.rolling(5).mean()  # OPERATIONALISED: heavy = above its own avg
        flags = (red & heavy).astype(int).values
        # 2-3 clustered heavy red candles
        run = 0
        for f in flags:
            run = run + 1 if f else 0
            if run >= 2:
                return True
        return False


# ----------------------------------------------------------------------------------
# The checklist itself, step by step
# ----------------------------------------------------------------------------------
def evaluate(sn: Snapshot) -> dict:
    fails = []

    # ---- Step 0: Trend State Engine ----
    state, why = _trend_state(sn)
    if state == 4:
        return _reject(sn, state, "STATE-4 distribution/downtrend", fails + ["S0:State4"])

    # ---- Step 0.5: Late-stage risk ----
    late_stage = (
        (sn.weeks_above_sma200 >= 30) and
        (_impulse_legs(sn) >= 2) and
        (sn.extension_pct == sn.extension_pct and sn.extension_pct >= 15)
    )
    base_reset = bool(sn.base["valid"] and sn.base["dur"] <= 60)

    # ---- Steps 1-3: liquidity, volatility, distribution ----
    if sn.distribution:
        fails.append("S3:distribution")
    # liquidity: traded value proxy
    liquid = (sn.vol_20d == sn.vol_20d and sn.close * sn.vol_20d > 5e7)  # OPERATIONALISED ~Rs5cr/day
    if not liquid:
        return _reject(sn, state, "illiquid", fails + ["S1:illiquid"])

    # ---- Step 3.5: Relative strength grade ----
    if sn.rs_new_high_8_12w:
        rs_grade = "Leadership"
    elif sn.rs_rising_6_8w:
        rs_grade = "Recovery"
    else:
        rs_grade = "Weak"

    # ---- Step 3.75: Extension penalty ----
    ext = sn.extension_pct if sn.extension_pct == sn.extension_pct else 0
    if ext < 12:
        ext_penalty = 0
    elif ext < 18:
        ext_penalty = -10 if not base_reset else -5
    else:
        ext_penalty = -20 if not base_reset else -10

    # ---- Step 4: fresh base + breakout confirmation ----
    base_ok = sn.base["valid"]
    breakout = base_ok and sn.close > sn.base["hi"]
    bo_vol_ok = (sn.breakout_vol_ratio == sn.breakout_vol_ratio and sn.breakout_vol_ratio >= 0.9)

    # ---- Steps 5-6: setup type + volume ----
    setup_type = "B" if state == 3 else "A"
    if sn.breakout_vol_ratio == sn.breakout_vol_ratio:
        if sn.breakout_vol_ratio >= 1.5:
            vol_grade = "strong"
        elif sn.breakout_vol_ratio >= 0.9:
            vol_grade = "acceptable"
        else:
            vol_grade = "weak"
    else:
        vol_grade = "weak"

    # ---- Step 10 / 16: Base Score then Final Score ----
    base_quality = 30 * _base_quality_frac(sn)            # +30
    rs_pts = {"Leadership": 25, "Recovery": 16, "Weak": 6}[rs_grade]   # +25
    vol_pts = {"strong": 15, "acceptable": 10, "weak": 4}[vol_grade]   # +15
    volliq_pts = 10 if liquid else 0                                  # +10
    sector_pts = 10                                                   # +10  # OPERATIONALISED neutral sector
    base_score = base_quality + rs_pts + vol_pts + volliq_pts + sector_pts + ext_penalty
    base_score = max(0, min(100, base_score))

    # ---- Step 13: FII H1 module ----
    fii_score, fii_status = _fii_module(sn.fii)

    # ---- Step 16: Final Score ----
    market_score = float(sn.fii.get("market_score", 0))  # -10..+10
    final_score = base_score + fii_score + market_score

    # ---- Step 14: combined confidence ----
    chart_bull = breakout and rs_grade in ("Leadership", "Recovery")
    fii_bull = fii_score > 0
    if chart_bull and fii_bull:
        confidence = "Aligned"
    elif chart_bull and not fii_bull and fii_status != "H1-Negative":
        confidence = "Partial"
    elif chart_bull and fii_status == "H1-Negative":
        confidence = "Conflicted"
    else:
        confidence = "Strongly conflicted" if (not chart_bull and fii_status == "H1-Negative") else "Partial"

    # ---- Step 17: Final verdict ----
    if not breakout:
        verdict = "WAIT"; fails.append("S4:no-breakout")
    elif final_score >= 75:
        verdict = "BUY"
    elif final_score >= 60:
        verdict = "BUY STARTER"
    elif final_score >= 50:
        verdict = "WAIT"
    else:
        verdict = "NOT BUY"

    if late_stage and not base_reset:
        verdict = "WAIT" if verdict.startswith("BUY") else verdict
        fails.append("S0.5:late-stage")

    # ---- Step 18: daily confirmation -> entry/stop/targets ----
    entry = sn.close
    if setup_type == "B" and base_ok:
        stop = sn.base["lo"] * 0.985  # base low - 1.5% buffer
    else:
        stop = sn.sma50 if sn.sma50 == sn.sma50 else sn.close * 0.92
    risk = entry - stop
    t1 = entry + (sn.base["hi"] - sn.base["lo"]) if base_ok else entry * 1.10  # measured move
    t2 = entry + 2 * (sn.base["hi"] - sn.base["lo"]) if base_ok else entry * 1.20
    size_band = ("Full 80-100%" if verdict == "BUY"
                 else "Starter 30-50%" if verdict == "BUY STARTER"
                 else "0%")

    return dict(
        Symbol=None, Date=str(sn.date.date()), State=state, LateStage=late_stage,
        BaseReset=base_reset, Extension=round(ext, 2), RS=rs_grade,
        RSslope6w=(round(sn.rs_slope_6w, 3) if sn.rs_slope_6w == sn.rs_slope_6w else None),
        VolumeRatio=(round(sn.breakout_vol_ratio, 2) if sn.breakout_vol_ratio == sn.breakout_vol_ratio else None),
        FIIstatus=fii_status, Confidence=confidence,
        BaseScore=round(base_score, 1), FIIscore=fii_score, MarketScore=market_score,
        Score=round(final_score, 1), Verdict=verdict,
        Entry=round(entry, 2), Stop=round(stop, 2),
        T1=round(t1, 2), T2=round(t2, 2),
        StopPct=round((stop / entry - 1) * 100, 2),
        T1Pct=round((t1 / entry - 1) * 100, 2),
        SizeBand=size_band, Timeframe="3-8 weeks",
        BaseHeight=(round(sn.base["height"], 2) if sn.base["height"] == sn.base["height"] else None),
        FailReasons=";".join(fails) if fails else "",
        Reason=f"State{state}/{rs_grade}/score{round(final_score)}/{confidence}",
        Setup=setup_type, Why=why,
    )


def _trend_state(sn: Snapshot):
    if sn.sma50 != sn.sma50 or sn.sma200 != sn.sma200:
        return 1, "insufficient history -> treat as accumulation"
    above50 = sn.close > sn.sma50
    s50_rising = sn.sma50_slope == sn.sma50_slope and sn.sma50_slope > 0
    s50_gt_s200 = sn.sma50 > sn.sma200
    s50_rolling = sn.sma50_slope == sn.sma50_slope and sn.sma50_slope < 0
    if s50_rolling and sn.close < sn.sma50 and (sn.rs_slope_6w == sn.rs_slope_6w and sn.rs_slope_6w < 0):
        return 4, "SMA50 rolling over + price below + RS breakdown"
    if s50_rising and s50_gt_s200 and above50:
        return 3, "SMA50 rising > SMA200, price above, active trend"
    if above50 and (sn.rs_slope_6w == sn.rs_slope_6w and sn.rs_slope_6w > 0):
        return 2, "above SMA50, curling up, RS rising"
    return 1, "near SMA50, flat -> accumulation"


def _impulse_legs(sn: Snapshot) -> int:
    """Count completed up-legs in last 12 months. OPERATIONALISED: >=8% rallies separated by pullbacks."""
    c = sn.df["Close"].iloc[max(0, sn.i - 252): sn.i + 1]
    if len(c) < 30:
        return 0
    legs, trough = 0, c.iloc[0]
    for px in c:
        if px <= trough:
            trough = px
        elif (px / trough - 1) >= 0.08:
            legs += 1
            trough = px
    return legs


def _base_quality_frac(sn: Snapshot) -> float:
    if not sn.base["valid"]:
        return 0.2
    h = sn.base["height"]
    if h <= 8:
        return 1.0
    if h <= 12:
        return 0.7
    return 0.4


def _fii_module(fii: dict):
    consec = fii.get("consec_pos_sessions", 0)
    inflow = fii.get("inflow_5d_cr", 0.0)
    cond1 = consec >= 5
    cond2 = inflow > 5000
    if cond1 and cond2:
        return 10, "H1-Strong"
    if cond1 or cond2:
        return 5, "H1-Moderate"
    if inflow < 0:
        return -5, "H1-Negative"
    return 0, "H1-Neutral"


def _reject(sn, state, reason, fails):
    return dict(
        Symbol=None, Date=str(sn.date.date()), State=state, LateStage=None,
        BaseReset=None, Extension=None, RS=None, RSslope6w=None, VolumeRatio=None,
        FIIstatus=None, Confidence="Strongly conflicted", BaseScore=0, FIIscore=0,
        MarketScore=0, Score=0, Verdict="NOT BUY", Entry=None, Stop=None, T1=None,
        T2=None, StopPct=None, T1Pct=None, SizeBand="0%", Timeframe=None,
        BaseHeight=None, FailReasons=";".join(fails), Reason=reason, Setup=None, Why=reason,
    )
