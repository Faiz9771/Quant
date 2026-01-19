import os
import requests
import pandas as pd
import yfinance as yf
from bs4 import BeautifulSoup
from datetime import datetime, timedelta
import numpy as np

# ===============================
# PATH SETUP
# ===============================
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
os.makedirs(DATA_DIR, exist_ok=True)

OUTPUT_CSV = os.path.join(DATA_DIR, "nifty50_current_listing_factors.csv")

# ===============================
# CONFIG
# ===============================
WIKI_URL = "https://en.wikipedia.org/wiki/NIFTY_50"
HEADERS = {"User-Agent": "Nifty50Research/1.0"}

END_DATE = datetime.today()
START_DATE = END_DATE - timedelta(days=365)

# ===============================
# STEP 1: FETCH CURRENT NIFTY 50 TICKERS
# ===============================
def fetch_nifty50_tickers():
    response = requests.get(WIKI_URL, headers=HEADERS)
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")
    table = soup.find("table", class_="wikitable")
    df = pd.read_html(str(table))[0]

    symbol_col = next(col for col in df.columns if "Symbol" in col)
    company_col = df.columns[0]

    return pd.DataFrame({
        "Ticker": df[symbol_col].astype(str).str.upper().str.strip(),
        "Company": df[company_col].astype(str).str.strip()
    })

# ===============================
# STEP 2: FETCH MARKET CAP
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
# STEP 3: FETCH PRICE DATA & LIQUIDITY (FIXED)
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

    #  FLATTEN MULTIINDEX COLUMNS (CRITICAL FIX)
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)

    df = df[["Close", "Volume"]].dropna()

    #  FORCE NUMERIC (CRITICAL FIX)
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

    print(" Fetching current NIFTY 50 constituents...")
    nifty_df = fetch_nifty50_tickers()

    records = []

    print("\n Fetching market cap & liquidity factors...\n")

    for _, row in nifty_df.iterrows():
        ticker = row["Ticker"]
        company = row["Company"]

        print(f"Processing {ticker}...")

        cap_info = fetch_market_cap_metadata(ticker)
        liquidity_info = compute_liquidity_metrics(ticker)

        records.append({
            "Ticker": ticker,
            "Company": company,
            **cap_info,
            **liquidity_info
        })

    final_df = pd.DataFrame(records)

    # ===============================
    # HUMAN-READABLE UNITS
    # ===============================
    final_df["MarketCap_Cr"] = final_df["MarketCap_INR"] / 1e7
    final_df["Avg_Traded_Value_Cr"] = final_df["Avg_Traded_Value_INR"] / 1e7
    final_df["Median_Traded_Value_Cr"] = final_df["Median_Traded_Value_INR"] / 1e7

    final_df.sort_values("MarketCap_INR", ascending=False, inplace=True)

    final_df.to_csv(OUTPUT_CSV, index=False)

    print("\n NIFTY 50 LISTING FACTORS SNAPSHOT SAVED")
    print(f" File: {OUTPUT_CSV}")
    print("\nPreview:")
    print(final_df.head())
