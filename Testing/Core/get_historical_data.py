import os
import pandas as pd
import yfinance as yf
from datetime import timedelta

# ===============================
# PATH SETUP
# ===============================
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

INCLUSION_FILE = os.path.join(
    PROJECT_ROOT,
    "data",
    "derived",
    "nifty50_new_entrants_inclusion_dates.csv"
)

OUTPUT_DIR = os.path.join(
    PROJECT_ROOT,
    "data",
    "prices",
    "NIFTY50_HISTORICAL_PRE_INCLUSION"
)

os.makedirs(OUTPUT_DIR, exist_ok=True)

# ===============================
# LOAD INCLUSION DATES
# ===============================
df = pd.read_csv(INCLUSION_FILE, parse_dates=["Inclusion_Date"])

print(f"Loaded {len(df)} tickers with inclusion dates\n")

# ===============================
# MAIN LOOP
# ===============================
for _, row in df.iterrows():
    ticker = row["Ticker"].strip().upper()
    inclusion_date = row["Inclusion_Date"]

    start_date = inclusion_date - timedelta(days=2 * 365)
    end_date = inclusion_date

    yahoo_ticker = f"{ticker}.NS"

    print(
        f"Fetching {ticker}: "
        f"{start_date.date()} → {end_date.date()}"
    )

    try:
        price_df = yf.download(
            yahoo_ticker,
            start=start_date.strftime("%Y-%m-%d"),
            end=end_date.strftime("%Y-%m-%d"),
            interval="1d",
            auto_adjust=False,
            progress=False
        )
    except Exception as e:
        print(f"Error fetching {ticker}: {e}")
        continue

    if price_df.empty:
        print(f" No data found for {ticker}")
        continue

    price_df.reset_index(inplace=True)

    output_file = os.path.join(
        OUTPUT_DIR,
        f"{ticker}.csv"
    )

    price_df.to_csv(output_file, index=False)

    print(f" Saved: {output_file}\n")

print(" All 1-year pre-inclusion historical data fetched successfully.")
