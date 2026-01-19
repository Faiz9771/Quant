import requests
import pandas as pd
from bs4 import BeautifulSoup
from datetime import datetime

WIKI_API_URL = "https://en.wikipedia.org/w/api.php"
PAGE_TITLE = "NIFTY Next 50"


def get_wikipedia_page_html() -> str:
    params = {
        "action": "query",
        "format": "json",
        "prop": "revisions",
        "titles": PAGE_TITLE,
        "rvlimit": 1,
        "rvprop": "content",
        "rvparse": True,
    }

    headers = {
        "User-Agent": (
            "NiftyNext50Fetcher/1.0 "
            "(https://example.com/; contact: your_email@example.com)"
        )
    }

    response = requests.get(WIKI_API_URL, params=params, headers=headers)
    response.raise_for_status()

    pages = response.json()["query"]["pages"]
    page = next(iter(pages.values()))

    return page["revisions"][0]["*"]


def extract_nifty_next_50_tickers(html: str) -> list:
    soup = BeautifulSoup(html, "html.parser")
    tables = soup.find_all("table", class_="wikitable")

    if not tables:
        raise ValueError("No wikitable found on page")

    possible_columns = [
        "Symbol",
        "NSE Symbol",
        "NSE code",
        "Ticker",
        "Company",
    ]

    for table in tables:
        try:
            df = pd.read_html(str(table))[0]
        except ValueError:
            continue

        for col in df.columns:
            col_clean = col.strip().lower()

            if any(key.lower() in col_clean for key in possible_columns):
                tickers = (
                    df[col]
                    .astype(str)
                    .str.upper()
                    .str.strip()
                    .str.replace(r"\..*$", "", regex=True)
                    .tolist()
                )

                # Filter junk values
                tickers = [t for t in tickers if t.isalpha()]

                if len(tickers) >= 45:  # safety check
                    return sorted(set(tickers))

    raise ValueError(
        "Could not locate constituents table. "
        "Wikipedia page structure may have changed."
    )


def get_nifty_next_50_tickers() -> list:
    html = get_wikipedia_page_html()
    tickers = extract_nifty_next_50_tickers(html)

    if len(tickers) != 50:
        print(f" Warning: Found {len(tickers)} tickers instead of 50")

    return tickers


if __name__ == "__main__":
    nifty_next_50 = get_nifty_next_50_tickers()

    print("NIFTY NEXT 50 (Current Constituents):")
    print(nifty_next_50)

    output_file = "nifty_next_50_tickers.csv"
    df = pd.DataFrame(nifty_next_50, columns=["Ticker"])
    df.to_csv(output_file, index=False)

    print(f"\n CSV saved successfully: {output_file}")
