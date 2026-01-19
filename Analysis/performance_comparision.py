# We performed a baseline performance comparison of all new Nifty 50 entrants against the Nifty index using return, 
# risk, and drawdown metrics to establish whether index inclusion was justified by sustained outperformance.


import os
import pandas as pd
import yfinance as yf
import numpy as np
from datetime import datetime

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

PRICES_DIR = os.path.join(PROJECT_ROOT, "data", "prices")
INDEX_DIR = os.path.join(PROJECT_ROOT, "data", "index")
os.makedirs(INDEX_DIR, exist_ok=True)

NIFTY_INDEX_CSV = os.path.join(INDEX_DIR, "NIFTY50.csv")

# ===============================
# METRIC FUNCTIONS
# ===============================
def compute_metrics(df: pd.DataFrame) -> dict:
    """
    Compute baseline performance metrics using Adjusted Close.
    """

    if "Adj Close" not in df.columns:
        raise ValueError("Adj Close column not found")

    prices = pd.to_numeric(df["Adj Close"], errors="coerce").dropna()

    returns = prices.pct_change().dropna()

    total_return = (prices.iloc[-1] / prices.iloc[0]) - 1

    years = (prices.index[-1] - prices.index[0]).days / 365.25
    cagr = (prices.iloc[-1] / prices.iloc[0]) ** (1 / years) - 1

    volatility = returns.std() * np.sqrt(252)

    cumulative = (1 + returns).cumprod()
    peak = cumulative.cummax()
    drawdown = (cumulative - peak) / peak
    max_drawdown = drawdown.min()

    return {
        "Total Return": total_return,
        "CAGR": cagr,
        "Volatility": volatility,
        "Max Drawdown": max_drawdown
    }


# ===============================
# FETCH NIFTY 50 INDEX DATA
# ===============================
def fetch_nifty_index():
    if os.path.exists(NIFTY_INDEX_CSV):
        print("NIFTY 50 index data already exists.")
        return

    print("Fetching NIFTY 50 index data...")

    df = yf.download(
        "^NSEI",
        period="5y",
        interval="1d",
        auto_adjust=False,
        progress=False
    )

    df.reset_index(inplace=True)
    df.to_csv(NIFTY_INDEX_CSV, index=False)

    print("Saved NIFTY 50 index data.")

# ===============================
# MAIN STEP 2 LOGIC
# ===============================
if __name__ == "__main__":

    # Step 2.1 — Ensure index data exists
    fetch_nifty_index()

    # Step 2.2 — Load NIFTY index
    nifty_df = pd.read_csv(NIFTY_INDEX_CSV, parse_dates=["Date"])
    nifty_df.set_index("Date", inplace=True)

    nifty_metrics = compute_metrics(nifty_df)
    nifty_metrics["Ticker"] = "NIFTY50"

    results = []

    # Step 2.3 — Process each stock
    for file in os.listdir(PRICES_DIR):
        if not file.endswith(".csv"):
            continue

        ticker = file.replace(".csv", "")
        file_path = os.path.join(PRICES_DIR, file)

        df = pd.read_csv(file_path, parse_dates=["Date"])
        df.set_index("Date", inplace=True)

        metrics = compute_metrics(df)
        metrics["Ticker"] = ticker

        results.append(metrics)

    # Step 2.4 — Build summary DataFrame
    performance_df = pd.DataFrame(results)
    performance_df = performance_df[[
        "Ticker", "Total Return", "CAGR", "Volatility", "Max Drawdown"
    ]]

    # Add NIFTY row for comparison
    performance_df = pd.concat(
        [performance_df, pd.DataFrame([nifty_metrics])],
        ignore_index=True
    )

    performance_df.sort_values("CAGR", ascending=False, inplace=True)

    print("\n BASELINE PERFORMANCE SUMMARY")
    print(performance_df)

    # Save output
    output_path = os.path.join(PROJECT_ROOT, "data", "stock_vs_nifty_performance.csv")
    performance_df.to_csv(output_path, index=False)

    print(f"\n Saved performance summary to:\n{output_path}")
