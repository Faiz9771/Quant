import os
import pandas as pd

# ===============================
# PATH SETUP
# ===============================
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA_DIR = os.path.join(PROJECT_ROOT, "data")

NEXT50_RELATIVE_FILE = os.path.join(DATA_DIR, "derived", "nifty_next50_relative_metrics.csv")
THRESHOLD_FILE = os.path.join(DATA_DIR, "nifty50_relative_thresholds.csv")

OUTPUT_FILE = os.path.join(DATA_DIR, "nifty_next50_screening_results.csv")

# ===============================
# LOAD DATA
# ===============================
next50_df = pd.read_csv(NEXT50_RELATIVE_FILE)
threshold_df = pd.read_csv(THRESHOLD_FILE)

# Convert thresholds CSV to dictionary
thresholds = dict(zip(threshold_df["Metric"], threshold_df["Threshold"]))

# ===============================
# REQUIRED COLUMNS CHECK
# ===============================
required_cols = [
    "MarketCap_Share",
    "MarketCap_Percentile",
    "Liquidity_Share",
    "Liquidity_Percentile",
    "Liquidity_Stability"
]

missing_cols = [c for c in required_cols if c not in next50_df.columns]
if missing_cols:
    raise RuntimeError(f"Missing required columns: {missing_cols}")

# ===============================
# SCREENING FUNCTION
# ===============================
def compute_screening_score(row, thresholds):
    checks = {
        "Pass_MarketCap_Share": row["MarketCap_Share"] >= thresholds["MarketCap_Share_25pct"],
        "Pass_MarketCap_Percentile": row["MarketCap_Percentile"] >= thresholds["MarketCap_Percentile_25pct"],
        "Pass_Liquidity_Share": row["Liquidity_Share"] >= thresholds["Liquidity_Share_25pct"],
        "Pass_Liquidity_Percentile": row["Liquidity_Percentile"] >= thresholds["Liquidity_Percentile_25pct"],
        "Pass_Liquidity_Stability": row["Liquidity_Stability"] <= thresholds["Liquidity_Stability_75pct"],
    }

    score = sum(checks.values()) / len(checks)

    return pd.Series({**checks, "Screening_Score": score})

# ===============================
# APPLY SCREENING
# ===============================
screening_results = next50_df.apply(
    compute_screening_score,
    axis=1,
    thresholds=thresholds
)

final_df = pd.concat([next50_df, screening_results], axis=1)

# Rank by screening score
final_df.sort_values("Screening_Score", ascending=False, inplace=True)

# ===============================
# SAVE OUTPUT
# ===============================
final_df.to_csv(OUTPUT_FILE, index=False)

# ===============================
# SUMMARY
# ===============================
print("\n NIFTY NEXT 50 — ELIGIBILITY SCREENING RESULTS (TOP 10)")
print(final_df[[
    "Ticker",
    "Screening_Score",
    "Pass_MarketCap_Share",
    "Pass_Liquidity_Share",
    "Pass_Liquidity_Stability"
]].head(10))

print(f"\n Screening results saved to:\n{OUTPUT_FILE}")
