import os
import pandas as pd
import numpy as np

# ===============================
# PATH SETUP
# ===============================
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA_DIR = os.path.join(PROJECT_ROOT, "data")

PERF_FILE = os.path.join(DATA_DIR, "stock_vs_nifty_performance.csv")
TREND_FILE = os.path.join(DATA_DIR, "trend_structure_summary.csv")
MOM_FILE = os.path.join(DATA_DIR, "momentum_strength_summary.csv")

PROFILE_OUT = os.path.join(DATA_DIR, "pattern_profile.csv")
SCORES_OUT = os.path.join(DATA_DIR, "screening_scores.csv")

# ===============================
# LOAD & MERGE DATA
# ===============================
perf = pd.read_csv(PERF_FILE)
trend = pd.read_csv(TREND_FILE)
momentum = pd.read_csv(MOM_FILE)

# Remove index row if present
perf = perf[perf["Ticker"] != "NIFTY50"]

df = perf.merge(trend, on="Ticker").merge(momentum, on="Ticker")

# ===============================
# SELECT KEY METRICS
# ===============================
key_metrics = [
    "CAGR",
    "Pct Time Above 200EMA",
    "Longest Uptrend (Days)",
    "Trend Breaks",
    "MACD_Positive_%",
    "ADX_Mean",
    "RSI_Floor_10pct",
]

df = df[["Ticker"] + key_metrics]

# ===============================
# PATTERN EXTRACTION
# ===============================
pattern_summary = []

for metric in key_metrics:
    pattern_summary.append({
        "Metric": metric,
        "Median": df[metric].median(),
        "25th Percentile": df[metric].quantile(0.25),
        "75th Percentile": df[metric].quantile(0.75),
        "Min": df[metric].min(),
        "Max": df[metric].max()
    })

pattern_df = pd.DataFrame(pattern_summary)
pattern_df.to_csv(PROFILE_OUT, index=False)

# ===============================
# STRATEGY LOGIC (SCREENING RULES)
# ===============================
rules = {
    "CAGR": df["CAGR"].median(),
    "Pct Time Above 200EMA": df["Pct Time Above 200EMA"].quantile(0.6),
    "MACD_Positive_%": df["MACD_Positive_%"].quantile(0.6),
    "ADX_Mean": 25,
    "RSI_Floor_10pct": 40,
}

# ===============================
# SCORING SYSTEM
# ===============================
def score_stock(row):
    score = 0
    total = len(rules)

    for metric, threshold in rules.items():
        if row[metric] >= threshold:
            score += 1

    return score / total


df["Screening_Score"] = df.apply(score_stock, axis=1)

df.sort_values("Screening_Score", ascending=False, inplace=True)

df.to_csv(SCORES_OUT, index=False)

# ===============================
# OUTPUT SUMMARY
# ===============================
print("\n STEP 5 — PATTERN PROFILE")
print(pattern_df)

print("\n STEP 5 — SCREENING RESULTS")
print(df[["Ticker", "Screening_Score"]])
print(f"\n Pattern profile saved to: {PROFILE_OUT}")
print(f" Screening scores saved to: {SCORES_OUT}")
