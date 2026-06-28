# M7.1-Long · Nifty 50 Opportunity Scanner + Locked-Capital Simulator

## NEW: Live dashboard (`app.py` + `dashboard_live.html`) — no CSV upload
A full-fledged interactive app that runs the **real M7.1 scan on demand** over an **exact date
range**. Pick the start/end dates, capital, slots and sizing in the browser; the backend runs the
checklist across all Nifty 50 names (with the **live MoneyControl FII layer**) and the simulator
recomputes live. No manual `scan.py` run, no CSV upload.

```bash
pip install -r requirements.txt
python app.py
# open http://127.0.0.1:5050
```

How it works:
- **The date range drives a fresh scan.** Changing the dates (or pressing *Run scan*) starts a
  background job via `GET /api/scan?start=YYYY-MM-DD&end=YYYY-MM-DD`, which runs
  `scan.scan_signals(start_date, end_date)` — the full S0–S19 checklist on every constituent, every
  trading day in the range (with a 1-year lead-in so SMA200/RS have history) — and returns every
  distinct `BUY`/`BUY STARTER` with its forward-resolved exit. Scans run **asynchronously** and the
  browser **polls `GET /api/status`** with a live progress bar, so a multi-minute scan never drops
  the connection. Results are **cached** under `.scan_cache/` so re-loading a range is instant
  (cached ranges appear as one-click chips).
- **Live FII (Step 13).** `get_fii_daily()` scrapes MoneyControl's monthly FII/DII cash dataset
  (same source as `Data-Fetch/FII-DII/fetch-fii-dii.py`), month by month across the span, caching
  each past month under `.fii_cache/`. The H1 layer (consecutive positive sessions + 5-day inflow)
  now actually moves the scores — the dashboard's status line shows **FII live (MoneyControl)**.
- **Capital / slots / sizing recompute instantly** in the browser — the locked-capital
  money-management sim runs client-side on the scanned signals, so sliders are immediate and
  never re-download anything. CAGR uses the exact fractional length of the chosen range.
- The old upload-based `dashboard.html` is still here and untouched if you want the offline,
  CSV-fed version.

> macOS note: ports **5000/7000** are taken by AirPlay Receiver (Control Center), so the app
> defaults to **5050**. Override with `PORT=8000 python app.py` if needed.

## Legacy: Integrated dashboard (`dashboard.html`)
Open `dashboard.html` in any browser — no install, fully offline. Five tabs:
1. **Simulator** — live locked-capital engine (capital / slots / sizing). Switch between your
   36 tested trades and uploaded scanner output. Equity curve, drawdown, ledger update live.
2. **Loose-end fixes** — toggle book-grounded adjustments (ATR stop, half-size midcaps,
   losing-streak de-risking, pyramid winners, false-negative recovery) and re-simulate. Each
   carries the book citation it came from.
3. **Scanner output** — drop a `simulation_<span>.csv` produced by `scan.py`; the Simulator
   can then run on those real scanned trades.
4. **Reference digest** — the key principles from your uploaded books (Tharp, O'Neil, Schwager,
   Beyond Technical Analysis, Encyclopedia of Trading Strategies), each mapped to a dashboard lever.
5. **Diagnostics** — the confusion-matrix chart + ranked loose-end findings from your tested data.

The dashboard ships with your 36 tested trades embedded, so it works standalone; to fold in the
scanner's results, run `scan.py` and upload the CSV on the Scanner output tab.

---


This is the **separate** tool you asked for (your existing simulator is untouched). It finds
the trades you may have *missed* during a year: it runs the full **Model M7.1-Long checklist**
against **all 50 Nifty constituents, every trading day** of a chosen year, logs every `BUY` /
`BUY STARTER` verdict, and simulates those trades under your money-management rule — **capital
stays locked in a position until that position's own exit, then frees up for the next signal.**

## Files
| File | What it is |
|---|---|
| `scan.py` | Main runner: fetches data, scans every day, simulates, writes outputs. |
| `m71_checklist.py` | Faithful encoding of every checklist step S0–S19 (trend state, late-stage filter, RS grading, extension penalty, fresh-base detection, volume rules, Base Score, **FII H1 layer**, Combined Confidence, Final Score, entry/stop/targets). |
| `nifty_fallback.py` | Backup constituent list if Wikipedia is unreachable. |
| `requirements.txt` | Python deps. |

## Setup
```bash
python -m venv venv && source venv/bin/activate     # optional
pip install -r requirements.txt
```

## Run
```bash
python -m venv venv && source venv/bin/activate     # optional
pip install -r requirements.txt
```

### Single year
```bash
python scan.py --year 2023
```

### Multiple years together (consecutive or any range)
```bash
python scan.py --start-year 2021 --end-year 2023    # scans 2021, 2022, 2023 as ONE run
```
Or set `START_YEAR` / `END_YEAR` in the CONFIG block and just run `python scan.py`.

**How multi-year works (important):**
- Prices and FII are downloaded **once** for the whole span (first year minus a 1-year
  lead-in, through the last year), so SMA200 / RS stay continuous across year boundaries —
  no artificial reset every January.
- **Capital compounds continuously.** A position open at a year-end carries into the next
  year with its capital still locked; equity is never reset per year. The reported CAGR is
  the true multi-year compounded rate, and max drawdown spans the entire period.
- The summary adds a **per-year P&L breakdown** (by entry-year) plus `cagr` and `years`,
  so you can see which years carried the run. The per-year figures sum exactly to total P&L.
- Output files are named by span, e.g. `signals_2021-2023.csv`, `simulation_2021-2023.csv`,
  `summary_2021-2023.txt` (single year stays `signals_2023.csv`, etc.).

### Capital-aware scanning (optimization)
The scan and the locked-capital simulation run as a **single chronological pass**, so the
portfolio state is known on every day. On any day where — after releasing positions that
exited that day — **all slots are still occupied and no cash is free**, the 50-stock scan is
**skipped**, because no Buy could be booked anyway. The engine only ever skips days that are
*provably* un-actionable: if a single slot opens or any cash frees, the day is scanned in full,
so no bookable signal is ever missed. The summary reports `days_scanned`, `days_skipped`, and
`scan_days_saved_pct`.

**The payoff scales inversely with slot count.** With 1 slot (all-in) a large share of days are
skippable; with 5 slots, your capital is rarely fully committed, so very little is skipped. This
is expected — it's a speed-up for tight-slot configs, not a universal one, and it never changes
which trades get booked.

### Outputs (written to the working folder)
- **`signals_<year>.csv`** — every Buy verdict in the Step-19 schema: Symbol, Date, State,
  LateStage, BaseReset, Extension, RS, RSslope6w, VolumeRatio, FIIstatus, Confidence, BaseScore,
  FIIscore, MarketScore, Score, Verdict, Entry, Stop, T1, T2, SizeBand, BaseHeight, FailReasons, Reason.
- **`simulation_<year>.csv`** — per-trade ledger: entry/exit dates & prices, P&L %, exit reason
  (target / stop / time-stop), **locked** and **freed** capital, running equity, and BLOCK rows
  for signals that couldn't be taken (slots full, cash locked, or duplicate name).
- **`summary_<year>.txt`** — start/end capital, return %, max drawdown, signals vs taken vs blocked,
  win rate, avg win/loss, **days_scanned / days_skipped / scan_days_saved_pct**, and whether the
  FII layer ran live.

## Configure (top of `scan.py`)
```python
START_YEAR     = 2021        # first year to scan (inclusive)
END_YEAR       = 2023        # last year to scan (inclusive); set == START_YEAR for one year
START_CAPITAL  = 1_000_000   # Rs (compounded continuously across the whole span)
SLOTS          = 5           # max concurrent positions (O'Neil 4–5 concentration rule)
SIZING         = "equal"     # "equal" cash slots, or "risk" (Van Tharp % risk-to-stop)
RISK_PCT       = 1.0         # used when SIZING="risk"
TIME_STOP_DAYS = 28          # Step 7-8 time stop: no new high in ~3–4 weeks -> exit
```

## Data sources
- **Nifty 50 list:** scraped live from Wikipedia (`NIFTY_50`); falls back to `nifty_fallback.py`.
- **Prices:** `yfinance` (`<SYMBOL>.NS`, plus `^NSEI` for the index / RS line).
- **FII flows (Step 13):** the scanner tries a public FII/DII CSV mirror. **Edit the `candidates`
  URL in `get_fii_daily()` to point at your real source** (Kite Connect, NSE daily FII/FPI report,
  or your own CSV with `date` + `fii_net` columns). If no live feed is reachable, it runs the
  FII layer as **H1-Neutral** and says so in the summary — the chart side still works, you just
  don't get the Step-13 score boost until you wire in real FII data.

## Honesty notes (read these)
- **The list is *today's* Nifty 50.** yfinance gives current constituents, so scanning an old
  year has mild survivorship bias (names added/removed since aren't perfectly reconstructed). For
  a strict historical run, supply a point-in-time constituent list for that year.
- **Qualitative checklist rules are operationalised** with explicit thresholds (marked
  `# OPERATIONALISED` in `m71_checklist.py`) so the scan is reproducible. Tune them to match how
  you read the charts by hand — e.g. the "distribution" cluster rule and the liquidity floor.
- **This finds candidates, not certainties.** Treat the signal list as the set of setups M7.1
  *would* have flagged, then eyeball the charts the way you did for your original 100 tests.
