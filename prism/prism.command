#!/usr/bin/env bash
#
# prism.command — double-clickable macOS launcher for the Prism dashboard.
#
# Boots the Next.js dev server in this directory, waits for it to come up,
# then opens http://localhost:3000 in the default browser. Logs are written
# to .prism-launcher.log so the Terminal window stays clean.
#
# To install on the Dock or Desktop: drag this file out, or right-click →
# "Make Alias" and place the alias wherever you like.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PORT="${PRISM_PORT:-3000}"
URL="http://localhost:${PORT}"
LOG="${SCRIPT_DIR}/.prism-launcher.log"

echo "── Prism launcher ──────────────────────────────────────"
echo "  cwd : ${SCRIPT_DIR}"
echo "  port: ${PORT}"
echo "  log : ${LOG}"
echo "────────────────────────────────────────────────────────"

# Make sure node + npm are on PATH when launched from Finder.
# Finder-launched .command files don't inherit your shell rc, so we add
# the common Homebrew + nvm locations explicitly.
export PATH="/opt/homebrew/bin:/usr/local/bin:${PATH}"
if [ -s "${HOME}/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "${HOME}/.nvm/nvm.sh"
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm not found on PATH. Install Node.js (brew install node) and retry."
  read -r -p "Press return to close..." _
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "[prism] node_modules missing — running 'npm install' (one-time)..."
  npm install
fi

# If something is already serving on the port, just open the browser.
if lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "[prism] something is already listening on :${PORT} — opening browser."
  open "${URL}"
  exit 0
fi

echo "[prism] starting 'npm run dev' (logs → ${LOG})"
: > "${LOG}"
npm run dev >>"${LOG}" 2>&1 &
DEV_PID=$!
echo "[prism] dev server pid=${DEV_PID}"

cleanup() {
  echo
  echo "[prism] stopping dev server (pid=${DEV_PID})..."
  kill "${DEV_PID}" 2>/dev/null || true
  wait "${DEV_PID}" 2>/dev/null || true
  echo "[prism] stopped."
}
trap cleanup EXIT INT TERM

# Wait up to ~30s for the port to come up.
echo -n "[prism] waiting for ${URL}"
for _ in $(seq 1 60); do
  if lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
    echo " — up."
    break
  fi
  echo -n "."
  sleep 0.5
done

if ! lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo
  echo "[prism] dev server did not come up in time. Tail of ${LOG}:"
  tail -n 40 "${LOG}" || true
  read -r -p "Press return to close..." _
  exit 1
fi

open "${URL}"

echo
echo "[prism] dashboard is live at ${URL}"
echo "[prism] close this Terminal window or press Ctrl-C to stop the server."
# Block on the dev server so cleanup runs when the user closes the window.
wait "${DEV_PID}"
