import os
import pandas as pd
import numpy as np

# ===============================
# PATH SETUP
# ===============================
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PRICES_DIR = os.path.join(PROJECT_ROOT, "data", "prices")
OUTPUT_PATH = os.path.join(PROJECT_ROOT, "data", "trend_structure_summary.csv")

EMA_PERIOD = 200


# ===============================
# TREND STRUCTURE FUNCTIONS
# ===============================
def compute_trend_metrics(df: pd.DataFrame) -> dict:
    prices = pd.to_numeric(df["Adj Close"], errors="coerce").dropna()

    # 200-day EMA
    ema_200 = prices.ewm(span=EMA_PERIOD, adjust=False).mean()

    # Price above EMA
    above_ema = prices > ema_200
    pct_time_above_ema = above_ema.mean()

    # Longest continuous uptrend (price > EMA)
    max_streak = 0
    current_streak = 0
    for val in above_ema:
        if val:
            current_streak += 1
            max_streak = max(max_streak, current_streak)
        else:
            current_streak = 0

    # Daily returns
    returns = prices.pct_change().dropna()

    # Drawdowns
    cumulative = (1 + returns).cumprod()
    peak = cumulative.cummax()
    drawdown = (cumulative - peak) / peak

    # Average correction during uptrend periods
    avg_correction = drawdown[drawdown < 0].mean()

    # Major trend breaks: price crossing below EMA
    trend_breaks = ((prices < ema_200) & (prices.shift(1) >= ema_200.shift(1))).sum()

    # Trend slope (EMA slope)
    ema_slope = np.polyfit(range(len(ema_200.dropna())), ema_200.dropna(), 1)[0]

    return {
        "Pct Time Above 200EMA": pct_time_above_ema,
        "Longest Uptrend (Days)": max_streak,
        "Avg Correction": avg_correction,
        "Trend Breaks": trend_breaks,
        "EMA 200 Slope": ema_slope
    }


# ===============================
# MAIN STEP 3 LOGIC
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

        metrics = compute_trend_metrics(df)
        metrics["Ticker"] = ticker

        results.append(metrics)

    trend_df = pd.DataFrame(results)

    trend_df = trend_df[
        [
            "Ticker",
            "Pct Time Above 200EMA",
            "Longest Uptrend (Days)",
            "Avg Correction",
            "Trend Breaks",
            "EMA 200 Slope",
        ]
    ]

    trend_df.sort_values("Pct Time Above 200EMA", ascending=False, inplace=True)

    print("\n TREND STRUCTURE SUMMARY")
    print(trend_df)

    trend_df.to_csv(OUTPUT_PATH, index=False)

    print(f"\n Saved trend structure analysis to:\n{OUTPUT_PATH}")
