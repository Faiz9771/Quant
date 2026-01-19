import os
import pandas as pd
import numpy as np
import yfinance as yf
from datetime import datetime, timedelta

# ===============================
# PATH SETUP
# ===============================
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

TICKERS_FILE = os.path.join(PROJECT_ROOT, "data", "nifty_next_50_tickers.csv")
PRICES_DIR = os.path.join(PROJECT_ROOT, "data", "prices", "nifty_next_50")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "data", "derived")

os.makedirs(PRICES_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

OUTPUT_FILE = os.path.join(OUTPUT_DIR, "nifty_next_50_all_metrics.csv")

START_DATE = (datetime.today() - timedelta(days=5 * 365)).strftime("%Y-%m-%d")
END_DATE = datetime.today().strftime("%Y-%m-%d")

# ===============================
# STEP 2 — PERFORMANCE
# ===============================
def compute_performance(prices):
    returns = prices.pct_change().dropna()

    total_return = prices.iloc[-1] / prices.iloc[0] - 1
    years = (prices.index[-1] - prices.index[0]).days / 365.25
    cagr = (prices.iloc[-1] / prices.iloc[0]) ** (1 / years) - 1
    volatility = returns.std() * np.sqrt(252)

    cumulative = (1 + returns).cumprod()
    peak = cumulative.cummax()
    max_drawdown = ((cumulative - peak) / peak).min()

    return total_return, cagr, volatility, max_drawdown

# ===============================
# STEP 3 — TREND STRUCTURE
# ===============================
def compute_trend_structure(prices):
    ema_200 = prices.ewm(span=200, adjust=False).mean()
    above_ema = prices > ema_200

    pct_above = above_ema.mean()

    longest_streak = 0
    streak = 0
    for v in above_ema:
        if v:
            streak += 1
            longest_streak = max(longest_streak, streak)
        else:
            streak = 0

    trend_breaks = ((prices < ema_200) & (prices.shift(1) >= ema_200.shift(1))).sum()
    slope = np.polyfit(range(len(ema_200.dropna())), ema_200.dropna(), 1)[0]

    return pct_above, longest_streak, trend_breaks, slope

# ===============================
# STEP 4 — MOMENTUM & STRENGTH
# ===============================
def compute_macd(prices):
    ema12 = prices.ewm(span=12, adjust=False).mean()
    ema26 = prices.ewm(span=26, adjust=False).mean()
    return ema12 - ema26

def compute_rsi(prices, period=14):
    delta = prices.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    rs = gain.ewm(alpha=1/period, adjust=False).mean() / loss.ewm(alpha=1/period, adjust=False).mean()
    return 100 - (100 / (1 + rs))

def compute_adx(df, period=14):
    high = pd.to_numeric(df["High"], errors="coerce")
    low = pd.to_numeric(df["Low"], errors="coerce")
    close = pd.to_numeric(df["Adj Close"], errors="coerce")

    data = pd.concat([high, low, close], axis=1).dropna()
    high, low, close = data.iloc[:,0], data.iloc[:,1], data.iloc[:,2]

    plus_dm = high.diff()
    minus_dm = low.diff().abs()
    plus_dm[plus_dm < 0] = 0
    minus_dm[minus_dm < 0] = 0

    tr = pd.concat([
        high - low,
        (high - close.shift()).abs(),
        (low - close.shift()).abs()
    ], axis=1).max(axis=1)

    atr = tr.ewm(alpha=1/period, adjust=False).mean()
    plus_di = 100 * (plus_dm.ewm(alpha=1/period, adjust=False).mean() / atr)
    minus_di = 100 * (minus_dm.ewm(alpha=1/period, adjust=False).mean() / atr)
    dx = (abs(plus_di - minus_di) / (plus_di + minus_di)) * 100
    adx = dx.ewm(alpha=1/period, adjust=False).mean()

    return adx

# ===============================
# MAIN PIPELINE
# ===============================
tickers = pd.read_csv(TICKERS_FILE)["Ticker"].tolist()
results = []

for ticker in tickers:
    print(f"Processing {ticker}...")

    yf_ticker = f"{ticker}.NS"
    price_file = os.path.join(PRICES_DIR, f"{ticker}.csv")

    if not os.path.exists(price_file):
        df = yf.download(yf_ticker, start=START_DATE, end=END_DATE, progress=False)
        if df.empty:
            print(f" No data for {ticker}")
            continue
        df.to_csv(price_file)

    df = pd.read_csv(price_file, parse_dates=["Date"])
    df.set_index("Date", inplace=True)

    prices = pd.to_numeric(df["Adj Close"], errors="coerce").dropna()

    # Step 2
    total_return, cagr, vol, mdd = compute_performance(prices)

    # Step 3
    pct_above, longest_trend, breaks, slope = compute_trend_structure(prices)

    # Step 4
    macd = compute_macd(prices)
    macd_pos_pct = (macd > 0).mean()

    rsi = compute_rsi(prices)
    rsi_mean = rsi.mean()
    rsi_floor = rsi.quantile(0.10)

    adx = compute_adx(df.loc[prices.index])
    adx_mean = adx.mean()
    adx_strong_pct = (adx > 25).mean()

    results.append({
        "Ticker": ticker,
        "Total_Return": total_return,
        "CAGR": cagr,
        "Volatility": vol,
        "Max_Drawdown": mdd,
        "Pct_Time_Above_200EMA": pct_above,
        "Longest_Uptrend_Days": longest_trend,
        "Trend_Breaks": breaks,
        "EMA200_Slope": slope,
        "MACD_Positive_%": macd_pos_pct,
        "RSI_Mean": rsi_mean,
        "RSI_Floor_10pct": rsi_floor,
        "ADX_Mean": adx_mean,
        "ADX_Strong_%": adx_strong_pct,
    })

# ===============================
# SAVE OUTPUT
# ===============================
final_df = pd.DataFrame(results)
final_df.to_csv(OUTPUT_FILE, index=False)

print(f"\n FINAL METRICS SAVED TO:\n{OUTPUT_FILE}")
