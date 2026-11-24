#!/usr/bin/env bash
# Runs the gcscode-station that setup built, so `pnpm dev:sitl` starts it
# without building anything. Arguments pass through (`--allow-origin <origin>`).
# Ctrl-C or SIGTERM stops it.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATION_BIN="${SCRIPT_DIR}/target/release/gcscode-station"

if [[ ! -x "${STATION_BIN}" ]]; then
  echo "ERROR: the station is not built: ${STATION_BIN#"${SCRIPT_DIR}/"} is missing. Build it from the repo root with:  pnpm --filter mavlink-station run setup" >&2
  exit 1
fi

# A binary older than its source still runs, but it is not this checkout's code.
if [[ -n "$(find "${SCRIPT_DIR}/src" "${SCRIPT_DIR}/Cargo.toml" "${SCRIPT_DIR}/Cargo.lock" "${SCRIPT_DIR}/../../libs/radio-input/src" "${SCRIPT_DIR}/../../libs/radio-input/profiles" "${SCRIPT_DIR}/../../libs/radio-input/Cargo.toml" -newer "${STATION_BIN}" -print -quit)" ]]; then
  echo "WARNING: the station's source changed since it was built. Rebuild it with:  pnpm --filter mavlink-station run setup" >&2
fi

exec "${STATION_BIN}" "$@"
