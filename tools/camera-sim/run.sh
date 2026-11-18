#!/usr/bin/env bash
# Runs camera-sim headless: its dev server, then a headless Google Chrome that
# opens the page. Ctrl-C stops both, and so does either one exiting.
#
# Chrome is CAMERA_SIM_CHROME (default: Google Chrome in /Applications), the
# port CAMERA_SIM_PORT (default 5174). Chrome gets a fresh profile in TMPDIR,
# removed on exit. Of Chrome's output only the page's console lines (as
# `page: …`) and Chrome's fatal errors are printed.
#
# macOS's bash 3.2: no `wait -n`, so the script polls its two PIDs instead.
# The polls' sleeps send bash's stderr to /dev/null: when a stop signal kills
# one, bash would print `Terminated: 15` there on every stop.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHROME="${CAMERA_SIM_CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
PORT="${CAMERA_SIM_PORT:-5174}"

if [[ ! -x "${CHROME}" ]]; then
  echo "ERROR: Google Chrome missing: ${CHROME}. Install it from https://www.google.com/chrome/, or set CAMERA_SIM_CHROME to a Chrome binary." >&2
  exit 1
fi

# A port already in use stops it here: the wait for Vite below could not tell
# the holder from Vite. Vite's --strictPort covers the race until it binds.
if nc -z localhost "${PORT}" 2>/dev/null; then
  echo "ERROR: something already listens on TCP ${PORT} (another camera-sim?). Stop it first, or set CAMERA_SIM_PORT to another port." >&2
  exit 1
fi

PROFILE=""
VITE_PID=""
CHROME_PID=""

# Stops what this script started, by the PIDs it recorded, then removes the
# profile once Chrome is done writing to it. Further signals wait for this.
cleanup() {
  trap '' INT TERM HUP
  local pid
  for pid in ${CHROME_PID} ${VITE_PID}; do kill "${pid}" 2>/dev/null || true; done
  for pid in ${CHROME_PID} ${VITE_PID}; do wait "${pid}" 2>/dev/null || true; done
  [[ -z "${PROFILE}" ]] || rm -rf "${PROFILE}"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

PROFILE="$(mktemp -d "${TMPDIR:-/tmp}/camera-sim-chrome.XXXXXX")"

# Prints why one of the two exited, and exits 1.
exited() {
  local code=0
  wait "$2" || code=$?
  echo "ERROR: $1 exited (code ${code})." >&2
  exit 1
}

cd "${SCRIPT_DIR}"
pnpm --silent exec vite --port "${PORT}" --strictPort &
VITE_PID=$!

# Vite binds `localhost` as ::1 only, which 127.0.0.1 never reaches.
until nc -z localhost "${PORT}" 2>/dev/null; do
  kill -0 "${VITE_PID}" 2>/dev/null || exited "camera-sim's dev server" "${VITE_PID}"
  { sleep 0.5; } 2>/dev/null
done

# Only the page's console lines and Chrome's fatal errors get through.
"${CHROME}" --headless=new --user-data-dir="${PROFILE}" \
  --enable-logging=stderr --log-level=0 \
  "http://localhost:${PORT}/?publisher=headless" \
  2> >(sed -l -n -e 's/^\[[^]]*:CONSOLE[^]]*\] "\(.*\)", source: .*/page: \1/p' -e '/:FATAL:/p' >&2) &
CHROME_PID=$!

while true; do
  kill -0 "${CHROME_PID}" 2>/dev/null || exited Chrome "${CHROME_PID}"
  kill -0 "${VITE_PID}" 2>/dev/null || exited "camera-sim's dev server" "${VITE_PID}"
  { sleep 0.5; } 2>/dev/null
done
