import os
import pandas as pd
import numpy as np

# ===============================
# PATH SETUP
# ===============================
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PRICES_DIR = os.path.join(PROJECT_ROOT, "data", "prices")
OUTPUT_PATH = os.path.join(PROJECT_ROOT, "data", "momentum_strength_summary.csv")

# ===============================
# INDICATOR FUNCTIONS
# ===============================
def compute_macd(prices, fast=12, slow=26, signal=9):
    ema_fast = prices.ewm(span=fast, adjust=False).mean()
    ema_slow = prices.ewm(span=slow, adjust=False).mean()
    macd = ema_fast - ema_slow
    macd_signal = macd.ewm(span=signal, adjust=False).mean()
    macd_hist = macd - macd_signal
    return macd, macd_signal, macd_hist


def compute_rsi(prices, period=14):
    delta = prices.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)

    avg_gain = gain.ewm(alpha=1 / period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, adjust=False).mean()

    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))
    return rsi


def compute_adx(df, period=14):
    # Force numeric conversion (critical fix)
    high = pd.to_numeric(df["High"], errors="coerce")
    low = pd.to_numeric(df["Low"], errors="coerce")
    close = pd.to_numeric(df["Adj Close"], errors="coerce")

    df_numeric = pd.concat([high, low, close], axis=1).dropna()
    high, low, close = df_numeric.iloc[:, 0], df_numeric.iloc[:, 1], df_numeric.iloc[:, 2]

    plus_dm = high.diff()
    minus_dm = low.diff().abs()

    plus_dm[plus_dm < 0] = 0
    minus_dm[minus_dm < 0] = 0

    tr1 = high - low
    tr2 = (high - close.shift()).abs()
    tr3 = (low - close.shift()).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)

    atr = tr.ewm(alpha=1 / period, adjust=False).mean()

    plus_di = 100 * (plus_dm.ewm(alpha=1 / period, adjust=False).mean() / atr)
    minus_di = 100 * (minus_dm.ewm(alpha=1 / period, adjust=False).mean() / atr)

    dx = (abs(plus_di - minus_di) / (plus_di + minus_di)) * 100
    adx = dx.ewm(alpha=1 / period, adjust=False).mean()

    return adx



# ===============================
# STEP 4 METRICS
# ===============================
def compute_momentum_strength_metrics(df: pd.DataFrame) -> dict:
    prices = pd.to_numeric(df["Adj Close"], errors="coerce").dropna()

    # MACD
    macd, macd_signal, _ = compute_macd(prices)
    macd_positive_pct = (macd > 0).mean()

    # RSI
    rsi = compute_rsi(prices)
    rsi_mean = rsi.mean()
    rsi_floor = rsi.quantile(0.10)

    # ADX
    adx = compute_adx(df.loc[prices.index])
    adx_mean = adx.mean()
    adx_strong_pct = (adx > 25).mean()

    return {
        "MACD_Positive_%": macd_positive_pct,
        "RSI_Mean": rsi_mean,
        "RSI_Floor_10pct": rsi_floor,
        "ADX_Mean": adx_mean,
        "ADX_Strong_%": adx_strong_pct
    }


# ===============================
# MAIN STEP 4 LOGIC
# ===============================
if __name__ == "__main__":

    results = []

    for file in os.listdir(PRICES_DIR):
        if not file.endswith(".csv"):
            continue

        ticker = file.replace(".csv", "")
        file_path = os.path.join(PRICES_DIR, file)

        df = pd.read_csv(file_path, parse_dates=["Date"])
        df.set_index("Date", inplace=True)

        metrics = compute_momentum_strength_metrics(df)
        metrics["Ticker"] = ticker

        results.append(metrics)

    momentum_df = pd.DataFrame(results)

    momentum_df = momentum_df[
        [
            "Ticker",
            "MACD_Positive_%",
            "ADX_Mean",
            "ADX_Strong_%",
            "RSI_Mean",
            "RSI_Floor_10pct",
        ]
    ]

    momentum_df.sort_values("MACD_Positive_%", ascending=False, inplace=True)

    print("\n⚡ MOMENTUM & STRENGTH SUMMARY")
    print(momentum_df)

    momentum_df.to_csv(OUTPUT_PATH, index=False)

    print(f"\n Saved momentum & strength analysis to:\n{OUTPUT_PATH}")
