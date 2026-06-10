"""
Prism MarketSmith authenticator.

Launches a non-headless Chromium pointed at marketsmithindia.com. While the
browser is open, the current storage_state is written to <Dash>/auth.json
every few seconds. The script exits when the user closes the browser, so the
last saved state reflects whatever the final logged-in session looked like.

Dash directory is passed as argv[1] so we do NOT overwrite an unrelated file.
"""
from __future__ import annotations

import os
import sys
import time

from playwright.sync_api import sync_playwright


def main() -> int:
    if len(sys.argv) < 2:
        print("❌ usage: prism_save_auth.py <dash_dir>", flush=True)
        return 2
    dash_dir = sys.argv[1]
    auth_file = os.path.join(dash_dir, "auth.json")

    print(f"[prism-auth] saving to: {auth_file}", flush=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()
        try:
            page.goto("https://marketsmithindia.com", timeout=60_000)
        except Exception as exc:
            print(f"[prism-auth] navigation warning: {exc}", flush=True)

        print(
            "👉 Sign in to MarketSmith in the opened window.",
            flush=True,
        )
        print(
            "👉 When you are fully logged in, CLOSE the browser window — "
            "Prism will use the last-saved cookies.",
            flush=True,
        )

        stopped = {"v": False}

        def _on_disconnect(_b) -> None:
            stopped["v"] = True

        browser.on("disconnected", _on_disconnect)

        last_save = 0.0
        while not stopped["v"]:
            now = time.time()
            if now - last_save >= 3.0:
                try:
                    context.storage_state(path=auth_file)
                    last_save = now
                except Exception as exc:
                    # Browser may have been closed mid-call.
                    print(f"[prism-auth] save warning: {exc}", flush=True)
            time.sleep(0.25)

    if os.path.exists(auth_file) and os.path.getsize(auth_file) > 0:
        print("✅ auth.json refreshed", flush=True)
        return 0
    print("❌ auth.json missing or empty after session", flush=True)
    return 1


if __name__ == "__main__":
    sys.exit(main())
