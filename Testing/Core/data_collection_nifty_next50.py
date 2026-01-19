import os
import pandas as pd
import yfinance as yf
from datetime import datetime, timedelta

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

# INPUT_CSV = os.path.join(
#     PROJECT_ROOT,
#     "data",
#     "nifty50_new_entries_2020-12-01_to_2025-12-23.csv"
# )

INPUT_CSV = os.path.join(
    PROJECT_ROOT,
    "data",
    "nifty_next_50_tickers.csv"
)

# OUTPUT_DIR = os.path.join(PROJECT_ROOT, "data", "prices")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "data", "prices", "nifty_next_50")


START_DATE = (datetime.today() - timedelta(days=5 * 365)).strftime("%Y-%m-%d")
END_DATE = datetime.today().strftime("%Y-%m-%d")

os.makedirs(OUTPUT_DIR, exist_ok=True)


def fetch_and_save_stock_data(ticker: str):
    yahoo_ticker = f"{ticker}.NS"
    print(f"Fetching data for {ticker}...")

    df = yf.download(
        yahoo_ticker,
        start=START_DATE,
        end=END_DATE,
        interval="1d",
        progress=False,
        auto_adjust=False
    )

    if df.empty:
        print(f" No data found for {ticker}")
        return

    df.reset_index(inplace=True)

    output_path = os.path.join(OUTPUT_DIR, f"{ticker}.csv")
    df.to_csv(output_path, index=False)

    print(f"Saved: {output_path}")


if __name__ == "__main__":
    tickers_df = pd.read_csv(INPUT_CSV)
    tickers = tickers_df["Ticker"].astype(str).str.upper().tolist()

    print(f"Total tickers to process: {len(tickers)}")
    print(f"Date range: {START_DATE} to {END_DATE}\n")

    for ticker in tickers:
        try:
            fetch_and_save_stock_data(ticker)
        except Exception as e:
            print(f" Error fetching {ticker}: {e}")

    print("\n Data collection complete.")
