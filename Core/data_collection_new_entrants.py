import requests
import pandas as pd
from bs4 import BeautifulSoup
from datetime import datetime

WIKI_API_URL = "https://en.wikipedia.org/w/api.php"
PAGE_TITLE = "NIFTY 50"


def get_wikipedia_revision_html(target_date: str) -> str:
    """
    Fetch Wikipedia page HTML closest to the given date.
    target_date format: YYYY-MM-DD
    """
    params = {
        "action": "query",
        "format": "json",
        "prop": "revisions",
        "titles": PAGE_TITLE,
        "rvlimit": 1,
        "rvstart": f"{target_date}T23:59:59Z",
        "rvdir": "older",
        "rvprop": "content",
        "rvparse": True,
    }

    headers = {
        "User-Agent": (
            "Nifty50ComparisonScript/1.0 "
            "(https://example.com/; contact: your_email@example.com)"
        )
    }

    response = requests.get(WIKI_API_URL, params=params, headers=headers)
    try:
        response.raise_for_status()
    except requests.HTTPError as e:
        if response.status_code == 403:
            raise RuntimeError(
                "Received 403 Forbidden from Wikipedia API. "
                "This usually means the User-Agent or request pattern "
                "is being blocked. Try updating the User-Agent string "
                "to your own contact info or slow down requests."
            ) from e
        raise

    pages = response.json()["query"]["pages"]
    page = next(iter(pages.values()))

    return page["revisions"][0]["*"]


def extract_nifty50_tickers(html: str) -> list:
    """
    Parse HTML and extract NSE ticker symbols from the Constituents table.
    """
    soup = BeautifulSoup(html, "html.parser")

    tables = soup.find_all("table", class_="wikitable")
    if not tables:
        raise ValueError("No tables found on Wikipedia page")

    df = pd.read_html(str(tables[0]))[0]

    possible_columns = ["Symbol", "NSE Symbol", "Ticker"]

    symbol_col = None
    for col in possible_columns:
        if col in df.columns:
            symbol_col = col
            break

    if symbol_col is None:
        raise ValueError("Ticker column not found")

    tickers = (
        df[symbol_col]
        .astype(str)
        .str.upper()
        .str.strip()
        .str.replace(r"\..*$", "", regex=True)
        .tolist()
    )

    return tickers


def get_nifty50_tickers_by_date(target_date: str) -> list:
    """
    Main function: given a date, return NIFTY 50 tickers for that date.
    """
    html = get_wikipedia_revision_html(target_date)
    tickers = extract_nifty50_tickers(html)

    if len(tickers) != 50:
        print(f" Warning: Found {len(tickers)} tickers instead of 50")

    return sorted(set(tickers))


if __name__ == "__main__":
    date_1 = "2020-12-01"
    date_2 = datetime.today().strftime("%Y-%m-%d")

    nifty_2020 = get_nifty50_tickers_by_date(date_1)
    nifty_today = get_nifty50_tickers_by_date(date_2)

    print("NIFTY 50 - December 2020:")
    print(nifty_2020)

    print("\nNIFTY 50 - Today:")
    print(nifty_today)

    new_entries = sorted(set(nifty_today) - set(nifty_2020))

    print("\nNew entries in NIFTY 50 since Dec 2020:")
    print(new_entries)

    # ===============================
    # NEW ADDITION (as requested)
    # ===============================
    new_entries_df = pd.DataFrame(new_entries, columns=["Ticker"])
    output_filename = f"nifty50_new_entries_{date_1}_to_{date_2}.csv"
    new_entries_df.to_csv(output_filename, index=False)
    print(f"\nCSV saved successfully at project root: {output_filename}")

    print("\nDataFrame of new NIFTY 50 entries:")
    print(new_entries_df)
