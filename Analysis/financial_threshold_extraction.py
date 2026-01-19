import os
import pandas as pd
import numpy as np

# ===============================
# PATH SETUP
# ===============================
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA_DIR = os.path.join(PROJECT_ROOT, "data")

INPUT_FILE = os.path.join(DATA_DIR, "nifty50_current_listing_factors.csv")
OUTPUT_FILE = os.path.join(DATA_DIR, "nifty50_relative_thresholds.csv")

# ===============================
# LOAD DATA
# ===============================
df = pd.read_csv(INPUT_FILE)

# Drop rows with missing critical data
df = df.dropna(subset=[
    "MarketCap_INR",
    "Avg_Traded_Value_INR",
    "Liquidity_StdDev"
])

# ===============================
# RELATIVE MARKET CAP METRICS
# ===============================
total_index_market_cap = df["MarketCap_INR"].sum()

df["MarketCap_Share"] = df["MarketCap_INR"] / total_index_market_cap
df["MarketCap_Percentile"] = df["MarketCap_INR"].rank(pct=True)

# ===============================
# RELATIVE LIQUIDITY METRICS
# ===============================
total_index_liquidity = df["Avg_Traded_Value_INR"].sum()

df["Liquidity_Share"] = df["Avg_Traded_Value_INR"] / total_index_liquidity
df["Liquidity_Percentile"] = df["Avg_Traded_Value_INR"].rank(pct=True)

# Liquidity stability (quality of liquidity)
df["Liquidity_Stability"] = df["Liquidity_StdDev"] / df["Avg_Traded_Value_INR"]

# ===============================
# DERIVE THRESHOLDS (PERCENTILES)
# ===============================
thresholds = {
    "MarketCap_Share_25pct": df["MarketCap_Share"].quantile(0.25),
    "MarketCap_Percentile_25pct": df["MarketCap_Percentile"].quantile(0.25),
    "Liquidity_Share_25pct": df["Liquidity_Share"].quantile(0.25),
    "Liquidity_Percentile_25pct": df["Liquidity_Percentile"].quantile(0.25),
    "Liquidity_Stability_75pct": df["Liquidity_Stability"].quantile(0.75),
}

threshold_df = pd.DataFrame.from_dict(thresholds, orient="index", columns=["Threshold"])
threshold_df.index.name = "Metric"

# ===============================
# SAVE OUTPUTS
# ===============================
df.to_csv(os.path.join(DATA_DIR, "nifty50_relative_metrics.csv"), index=False)
threshold_df.to_csv(OUTPUT_FILE)

# ===============================
# DISPLAY SUMMARY
# ===============================
print("\n RELATIVE METRICS PREVIEW")
print(df[[
    "Ticker",
    "MarketCap_Share",
    "MarketCap_Percentile",
    "Liquidity_Share",
    "Liquidity_Percentile",
    "Liquidity_Stability"
]].head())

print("\n DERIVED ADAPTIVE THRESHOLDS")
print(threshold_df)
print(f"\n Thresholds saved to: {OUTPUT_FILE}")
