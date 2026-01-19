import os
import pandas as pd

# ===============================
# PATH SETUP
# ===============================
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA_DIR = os.path.join(PROJECT_ROOT, "data")

PATTERN_FILE = os.path.join(DATA_DIR, "pattern_profile.csv")

HISTORICAL_METRICS_FILE = os.path.join(
    DATA_DIR,
    "derived",
    "nifty50_pre_inclusion_all_metrics.csv"
)

OUTPUT_FILE = os.path.join(
    DATA_DIR,
    "derived",
    "nifty50_pre_inclusion_validation_scores.csv"
)

# ===============================
# LOAD DATA
# ===============================
pattern_df = pd.read_csv(PATTERN_FILE)
historical_df = pd.read_csv(HISTORICAL_METRICS_FILE)

# ===============================
# SELECT METRICS USED FOR VALIDATION
# (must match Step 5 logic)
# ===============================
validation_metrics = [
    "CAGR",
    "Pct_Time_Above_200EMA",
    "MACD_Positive_%",
    "ADX_Mean",
    "RSI_Floor_10pct",
]

# Build threshold dictionary using NIFTY 50 medians
thresholds = {
    row["Metric"]: row["Median"]
    for _, row in pattern_df.iterrows()
    if row["Metric"] in validation_metrics
}

# ===============================
# SCORING FUNCTION
# ===============================
def compute_validation_score(row):
    score = 0
    for metric, threshold in thresholds.items():
        if row[metric] >= threshold:
            score += 1
    return score / len(thresholds)

# ===============================
# APPLY VALIDATION
# ===============================
historical_df["Validation_Score"] = historical_df.apply(
    compute_validation_score, axis=1
)

historical_df.sort_values(
    "Validation_Score",
    ascending=False,
    inplace=True
)

# ===============================
# SAVE OUTPUT
# ===============================
historical_df.to_csv(OUTPUT_FILE, index=False)

print("\n STEP 6 (PART 2) COMPLETE — PRE-INCLUSION VALIDATION RESULTS")
print(historical_df[["Ticker", "Validation_Score"]].head(10))
print(f"\n Saved to: {OUTPUT_FILE}")
