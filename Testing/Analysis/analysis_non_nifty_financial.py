import os
import pandas as pd
import numpy as np

# ===============================
# PATH SETUP
# ===============================
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA_DIR = os.path.join(PROJECT_ROOT, "data")

# INPUT FILES
NIFTY50_FILE = os.path.join(DATA_DIR, "nifty50_current_listing_factors.csv")
NEXT50_FILE = os.path.join(DATA_DIR, "derived", "nifty_next50_listing_factors_snapshot.csv")

# OUTPUT FILE
OUTPUT_FILE = os.path.join(DATA_DIR, "derived", "nifty_next50_relative_metrics.csv")

# ===============================
# LOAD DATA
# ===============================
nifty50 = pd.read_csv(NIFTY50_FILE)
next50 = pd.read_csv(NEXT50_FILE)

# Drop rows with missing critical values
nifty50 = nifty50.dropna(subset=["MarketCap_INR", "Avg_Traded_Value_INR"])
next50 = next50.dropna(subset=["MarketCap_INR", "Avg_Traded_Value_INR"])

# ===============================
# COMPUTE NIFTY 50 REFERENCE TOTALS
# ===============================
total_nifty50_market_cap = nifty50["MarketCap_INR"].sum()
total_nifty50_liquidity = nifty50["Avg_Traded_Value_INR"].sum()

# ===============================
# COMPUTE RELATIVE METRICS FOR NEXT 50
# ===============================

# Market cap dominance
next50["MarketCap_Share"] = next50["MarketCap_INR"] / total_nifty50_market_cap

# Liquidity dominance
next50["Liquidity_Share"] = next50["Avg_Traded_Value_INR"] / total_nifty50_liquidity

# Percentile ranks (relative to NIFTY 50 distribution)
next50["MarketCap_Percentile"] = next50["MarketCap_INR"].apply(
    lambda x: (nifty50["MarketCap_INR"] < x).mean()
)

next50["Liquidity_Percentile"] = next50["Avg_Traded_Value_INR"].apply(
    lambda x: (nifty50["Avg_Traded_Value_INR"] < x).mean()
)

# Liquidity stability (quality)
next50["Liquidity_Stability"] = (
    next50["Liquidity_StdDev"] / next50["Avg_Traded_Value_INR"]
)

# ===============================
# SAVE OUTPUT
# ===============================
next50.to_csv(OUTPUT_FILE, index=False)

# ===============================
# PREVIEW
# ===============================
print("\n NIFTY NEXT 50 — RELATIVE METRICS COMPUTED")
print(next50[[
    "Ticker",
    "MarketCap_Share",
    "MarketCap_Percentile",
    "Liquidity_Share",
    "Liquidity_Percentile",
    "Liquidity_Stability"
]].head())

print(f"\n Saved relative metrics to:\n{OUTPUT_FILE}")
