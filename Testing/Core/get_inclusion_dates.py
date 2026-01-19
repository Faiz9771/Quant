import os
import pandas as pd
import requests
from bs4 import BeautifulSoup
import re

# ===============================
# PATH SETUP
# ===============================
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

NEW_ENTRANTS_FILE = os.path.join(
    PROJECT_ROOT,
    "data",
    "nifty50_new_entries_2020-12-01_to_2025-12-23.csv"
)

OUTPUT_FILE = os.path.join(
    PROJECT_ROOT,
    "data",
    "derived",
    "nifty50_new_entrants_inclusion_dates.csv"
)

os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)

WIKI_URL = "https://en.wikipedia.org/wiki/NIFTY_50"
HEADERS = {"User-Agent": "Mozilla/5.0"}

# ===============================
# GENERALIZED CLEANERS
# ===============================
def clean_text(x):
    """
    Removes Wikipedia footnotes and normalizes whitespace
    """
    x = str(x)
    x = re.sub(r"\[.*?\]", "", x)   # remove [a], [g], [16], etc.
    x = re.sub(r"\s+", " ", x)
    return x.strip()

def clean_ticker(x):
    """
    Normalizes ticker symbols
    """
    x = clean_text(x).upper()
    x = re.sub(r"[^A-Z0-9]", "", x)
    return x

def clean_date(x):
    """
    Converts '31 March 2021[g]' → '31 March 2021'
    """
    return clean_text(x)

def normalize_column_name(x):
    """
    Normalizes column headers
    """
    return clean_text(x).lower()

# ===============================
# LOAD NEW ENTRANTS
# ===============================
new_df = pd.read_csv(NEW_ENTRANTS_FILE)
new_df["Ticker"] = new_df["Ticker"].apply(clean_ticker)

# ===============================
# SCRAPE CURRENT NIFTY 50 TABLE
# ===============================
response = requests.get(WIKI_URL, headers=HEADERS)
response.raise_for_status()

soup = BeautifulSoup(response.text, "html.parser")
tables = soup.find_all("table", class_="wikitable")

nifty_df = None

for table in tables:
    df = pd.read_html(str(table))[0]
    normalized_cols = [normalize_column_name(c) for c in df.columns]

    if (
        any("symbol" in c for c in normalized_cols) and
        any("date added" in c for c in normalized_cols)
    ):
        # Rename columns safely
        col_map = dict(zip(df.columns, normalized_cols))
        df.rename(columns=col_map, inplace=True)

        symbol_col = next(c for c in df.columns if "symbol" in c)
        date_col = next(c for c in df.columns if "date added" in c)
        company_col = next(
            (c for c in df.columns if "company" in c),
            None
        )

        nifty_df = df[[company_col, symbol_col, date_col]].copy()
        nifty_df.columns = ["Company", "Ticker", "Inclusion_Date"]
        break

if nifty_df is None:
    raise RuntimeError("Could not locate NIFTY 50 constituents table")

# ===============================
# CLEAN & NORMALIZE DATA
# ===============================
nifty_df["Ticker"] = nifty_df["Ticker"].apply(clean_ticker)
nifty_df["Inclusion_Date"] = nifty_df["Inclusion_Date"].apply(clean_date)
nifty_df["Inclusion_Date"] = pd.to_datetime(
    nifty_df["Inclusion_Date"], errors="coerce"
)

# ===============================
# MERGE (CORE LOGIC)
# ===============================
result = pd.merge(
    new_df,
    nifty_df,
    on="Ticker",
    how="inner"
)

result = result[["Company", "Ticker", "Inclusion_Date"]]
result.sort_values("Inclusion_Date", inplace=True)
result.reset_index(drop=True, inplace=True)

# ===============================
# SAVE OUTPUT
# ===============================
result.to_csv(OUTPUT_FILE, index=False)

print(" Inclusion dates extracted for ALL new entrants")
print(f" Saved to: {OUTPUT_FILE}\n")
print(result)
