import os
import pandas as pd
import yfinance as yf
from datetime import datetime, timedelta
import numpy as np

# ===============================
# PATH SETUP
# ===============================
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
os.makedirs(DATA_DIR, exist_ok=True)

INPUT_TICKERS = os.path.join(DATA_DIR, "nifty_next_50_tickers.csv")
OUTPUT_CSV = os.path.join(DATA_DIR, "derived", "nifty_next50_listing_factors_snapshot.csv")

END_DATE = datetime.today()
START_DATE = END_DATE - timedelta(days=365)

# ===============================
# FETCH MARKET CAP
# ===============================
def fetch_market_cap_metadata(ticker):
    try:
        info = yf.Ticker(f"{ticker}.NS").info
        return {
            "MarketCap_INR": info.get("marketCap"),
            "Sector": info.get("sector"),
            "Industry": info.get("industry"),
        }
    except Exception:
        return {
            "MarketCap_INR": np.nan,
            "Sector": None,
            "Industry": None,
        }

# ===============================
# FETCH PRICE DATA & LIQUIDITY
# ===============================
def compute_liquidity_metrics(ticker):
    df = yf.download(
        f"{ticker}.NS",
        start=START_DATE.strftime("%Y-%m-%d"),
        end=END_DATE.strftime("%Y-%m-%d"),
        interval="1d",
        progress=False,
        group_by="column",
        auto_adjust=False
    )

    if df.empty:
        return {
            "Avg_Daily_Volume": np.nan,
            "Avg_Traded_Value_INR": np.nan,
            "Median_Traded_Value_INR": np.nan,
            "Liquidity_StdDev": np.nan,
            "Trading_Frequency": np.nan
        }

    # Flatten columns (critical)
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)

    df = df[["Close", "Volume"]].dropna()

    close = pd.to_numeric(df["Close"], errors="coerce")
    volume = pd.to_numeric(df["Volume"], errors="coerce")

    traded_value = close * volume

    return {
        "Avg_Daily_Volume": volume.mean(),
        "Avg_Traded_Value_INR": traded_value.mean(),
        "Median_Traded_Value_INR": traded_value.median(),
        "Liquidity_StdDev": traded_value.std(),
        "Trading_Frequency": len(df) / 252
    }

# ===============================
# MAIN EXECUTION
# ===============================
if __name__ == "__main__":

    tickers_df = pd.read_csv(INPUT_TICKERS)

    if "Ticker" not in tickers_df.columns:
        raise RuntimeError("Input CSV must contain a 'Ticker' column")

    records = []

    print("\n Fetching NIFTY NEXT 50 listing factors...\n")

    for _, row in tickers_df.iterrows():
        ticker = row["Ticker"].strip().upper()
        print(f"Processing {ticker}...")

        cap_info = fetch_market_cap_metadata(ticker)
        liquidity_info = compute_liquidity_metrics(ticker)

        records.append({
            "Ticker": ticker,
            **cap_info,
            **liquidity_info
        })

    final_df = pd.DataFrame(records)

    # Human-readable units
    final_df["MarketCap_Cr"] = final_df["MarketCap_INR"] / 1e7
    final_df["Avg_Traded_Value_Cr"] = final_df["Avg_Traded_Value_INR"] / 1e7
    final_df["Median_Traded_Value_Cr"] = final_df["Median_Traded_Value_INR"] / 1e7

    final_df.sort_values("MarketCap_INR", ascending=False, inplace=True)

    final_df.to_csv(OUTPUT_CSV, index=False)

    print("\n NIFTY NEXT 50 LISTING FACTORS SNAPSHOT SAVED")
    print(f" File: {OUTPUT_CSV}")
    print("\nPreview:")
    print(final_df.head())
