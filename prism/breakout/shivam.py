import os
import sys
import logging
import requests
import io
import numpy as np
import pandas as pd
import yfinance as yf
from typing import Dict, List

# ─────────────────────────────────────────────────────────────
# 1. Logger Setup
# ─────────────────────────────────────────────────────────────
def setup_logging():
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

setup_logging()
logging.getLogger('yfinance').setLevel(logging.CRITICAL)
log = logging.getLogger(__name__)

pd.set_option('display.max_rows', None)
pd.set_option('display.max_columns', None)

# ─────────────────────────────────────────────────────────────
# 2. Dynamic NSE Ticker Fetch Engine
# ─────────────────────────────────────────────────────────────
def update_nse_ticker_csv(file_path: str):
    """Fetches the live corporate listings master file from the NSE database."""
    log.info("Connecting to National Stock Exchange database to sync latest tickers...")
    url = "https://nsearchives.nseindia.com/content/equities/sec_list.csv"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    }
    try:
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        df_nse = pd.read_csv(io.BytesIO(response.content))
        df_nse.columns = [col.strip() for col in df_nse.columns]
        
        if 'SERIES' in df_nse.columns and 'SYMBOL' in df_nse.columns:
            df_nse = df_nse[df_nse['SERIES'].str.strip() == 'EQ']
            symbol_col = 'SYMBOL'
        else:
            symbol_col = df_nse.columns[0]
            
        tickers = df_nse[symbol_col].dropna().astype(str).str.strip().unique()
        yf_tickers = [f"{ticker}.NS" for ticker in tickers if ticker and not ticker.startswith('Series')]
        
        df_out = pd.DataFrame({"TICKER": yf_tickers})
        df_out.to_csv(file_path, index=False)
        log.info(f"Successfully synchronized {len(yf_tickers)} EQ tickers to: {file_path}")
    except Exception as e:
        log.error(f"Failed to fetch live tickers from NSE due to Error: {e}")
        if not os.path.exists(file_path):
            sys.exit(1)

# ─────────────────────────────────────────────────────────────
# 3. Strategy Core Logic & Math Engines
# ─────────────────────────────────────────────────────────────
def get_ema(series: pd.Series, length: int) -> pd.Series:
    return series.ewm(span=length, adjust=False).mean()

def fetch_prices(ticker: str, start: str, end: str, interval: str) -> pd.DataFrame:
    df = yf.download(ticker, start=start, end=end, interval=interval, auto_adjust=False, progress=False)
    if df.empty: return None
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [c[0] for c in df.columns]
    required_cols = ["Open", "High", "Low", "Close", "Volume"]
    for col in required_cols:
        if col not in df.columns: return None
    return df

def fetch_market_cap(ticker: str) -> float:
    try:
        info = yf.Ticker(ticker).info
        mcap = info.get("marketCap")
        return float(mcap) if mcap else np.nan
    except Exception:
        return np.nan

def classify_market_cap(mcap: float) -> str:
    # SEBI INR thresholds: Large > ₹20,000cr, Mid ₹5,000-20,000cr, Small < ₹5,000cr
    if pd.isna(mcap):
        return "Unknown"
    if mcap >= 2e11:
        return "Largecap"
    if mcap >= 5e10:
        return "Midcap"
    return "Smallcap"

def is_ema_200_flat_or_neutral(ema_200: pd.Series) -> bool:
    if len(ema_200) < 200: return False
    recent_ema = ema_200.tail(20)
    overall_change = (recent_ema.iloc[-1] - recent_ema.iloc[0]) / recent_ema.iloc[0]
    return -0.005 <= overall_change <= 1.0

def is_ema_50_trending_up(ema_50: pd.Series) -> bool:
    if len(ema_50) < 55: return False 
    diffs = ema_50.diff().tail(5)
    return (diffs > 0).all()

def has_sharp_ema_20_slope(ema_20: pd.Series, min_angle: float = 20.0) -> bool:
    if len(ema_20) < 25: return False
    y = ema_20.tail(5).values
    x = np.arange(len(y))
    slope, _ = np.polyfit(x, y, 1)
    norm_slope = slope / y.mean()
    angle_deg = np.degrees(np.arctan(norm_slope * 100))
    return angle_deg >= min_angle

def is_momentum_surge_active(df: pd.DataFrame, threshold: float = 0.08) -> bool:
    if len(df) < 4: return False
    roc_3 = (df["Close"].iloc[-1] - df["Close"].iloc[-4]) / df["Close"].iloc[-4]
    return roc_3 >= threshold

def is_ema_fan_aligned(df: pd.DataFrame, ema_5: pd.Series, ema_20: pd.Series, ema_50: pd.Series, ema_200: pd.Series) -> bool:
    if len(df) < 200: return False
    close = df["Close"].iloc[-1]
    return close > ema_5.iloc[-1] > ema_20.iloc[-1] > ema_50.iloc[-1] > ema_200.iloc[-1]

def check_all_swing_conditions(df: pd.DataFrame) -> Dict[str, bool]:
    df_calc = df.copy()
    df_calc.columns = [c.capitalize() for c in df_calc.columns]
    if len(df_calc) < 200: return {"Error": "Not enough data"}

    close_series = df_calc["Close"]
    ema_5 = get_ema(close_series, 5)
    ema_20 = get_ema(close_series, 20)
    ema_50 = get_ema(close_series, 50)
    ema_200 = get_ema(close_series, 200)

    results = {
        "EMA_200_Base_Flat": bool(is_ema_200_flat_or_neutral(ema_200)),
        "EMA_50_Turning_Up": bool(is_ema_50_trending_up(ema_50)),
        "EMA_20_Sharp_Slope": bool(has_sharp_ema_20_slope(ema_20)),
        "Price_Momentum_8pct": bool(is_momentum_surge_active(df_calc)),
        "Full_EMA_Fan_Align": bool(is_ema_fan_aligned(df_calc, ema_5, ema_20, ema_50, ema_200))
    }
    results["ENTRY_SIGNAL"] = all(results.values())
    return results

# ─────────────────────────────────────────────────────────────
# 4. Execution Framework Pipeline
# ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    csv_path = "hello.csv"
    output_csv_path = "breakout_results.csv"
    
    if os.path.exists(csv_path):
        user_choice = input("Would you like to fetch and update the latest 2200+ NSE Tickers from source? [y/N]: ").strip().lower()
        if user_choice in ['y', 'yes']:
            update_nse_ticker_csv(csv_path)
    else:
        update_nse_ticker_csv(csv_path)

    df1 = pd.read_csv(csv_path)
    start_date = '2024-01-01'
    end_date = (pd.Timestamp.now() + pd.Timedelta(days=1)).strftime('%Y-%m-%d')
    
    log.info(f"Scanning {len(df1)} companies from {start_date} to {end_date}")

    # Track matches dynamically
    matched_stocks: List[Dict] = []

    for j in range(len(df1)):
        ticker = df1["TICKER"].iat[j]
        df = fetch_prices(ticker, start_date, end_date, '1d')
        if df is None or len(df) < 500: continue

        stock_input = df.reset_index().rename(columns={df.index.name: "Date"})
        if isinstance(stock_input.columns, pd.MultiIndex):
            stock_input.columns = stock_input.columns.get_level_values(0)

        stock_input = stock_input.loc[:, ~stock_input.columns.duplicated()]
        cols = ["Date", "Open", "High", "Low", "Close", "Volume"]
        stock_input = stock_input[[c for c in cols if c in stock_input.columns]]

        current_date = pd.to_datetime(stock_input["Date"].iloc[-1])
        if current_date < pd.Timestamp("2022-01-01"): continue

        result = check_all_swing_conditions(stock_input)
        
        if result.get('ENTRY_SIGNAL') is True:
            market_cap = fetch_market_cap(ticker)
            classification = classify_market_cap(market_cap)
            log.info(f"🚀 BREAKOUT DETECTED -> {ticker} | Target Close Date: {current_date.strftime('%Y-%m-%d')} | Market Cap: {market_cap} | {classification}")

            matched_stocks.append({
                "TICKER": ticker,
                "SIGNAL_DATE": current_date.strftime('%Y-%m-%d'),
                "CLOSE_PRICE": float(stock_input["Close"].iloc[-1]),
                "market_cap": market_cap,
                "classification": classification
            })

    # Save to CSV if tracking arrays caught elements
    if matched_stocks:
        df_results = pd.DataFrame(matched_stocks)
        df_results.to_csv(output_csv_path, index=False)
        log.info(f"📊 Processing complete. {len(df_results)} targets written to: {output_csv_path}")
    else:
        log.info("Processing complete. No actionable breakout structures found today.")