#!/usr/bin/env bash
# ArduPilot SITL setup for macOS (Apple Silicon + Intel).
# Idempotent — safe to re-run.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARDUPILOT_DIR="${PROJECT_ROOT}/ardupilot"
VENV_DIR="${PROJECT_ROOT}/venv"

log() { printf "\n\033[1;34m==>\033[0m %s\n" "$*"; }
err() { printf "\n\033[1;31mERROR:\033[0m %s\n" "$*" >&2; }

# ---------------------------------------------------------------------------
# 1. Platform & toolchain checks
# ---------------------------------------------------------------------------
if [[ "$(uname -s)" != "Darwin" ]]; then
  err "This script is for macOS. Detected: $(uname -s)"
  exit 1
fi

if ! xcode-select -p >/dev/null 2>&1; then
  err "Xcode Command Line Tools missing. Install with:  xcode-select --install"
  exit 1
fi

if ! command -v brew >/dev/null 2>&1; then
  err "Homebrew not found. Install from https://brew.sh and re-run."
  exit 1
fi
log "Homebrew $(brew --version | head -1 | awk '{print $2}')"

if ! command -v python3 >/dev/null 2>&1; then
  err "python3 not found. Install with:  brew install python"
  exit 1
fi
PYVER="$(python3 -c 'import sys; print("%d.%d" % sys.version_info[:2])')"
log "python3 ${PYVER}"

command -v git >/dev/null 2>&1 || { err "git not found."; exit 1; }

# ---------------------------------------------------------------------------
# 2. Brew packages
# ---------------------------------------------------------------------------
log "Installing brew packages (ccache, wget)"
brew install --quiet ccache wget || true

# ---------------------------------------------------------------------------
# 3. Clone ArduPilot
# ---------------------------------------------------------------------------
if [[ ! -d "${ARDUPILOT_DIR}/.git" ]]; then
  log "Cloning ArduPilot (~1.5 GB with submodules; 5-10 min on average wifi)"
  git clone --recurse-submodules \
    https://github.com/ArduPilot/ardupilot.git "${ARDUPILOT_DIR}"
else
  log "ArduPilot already cloned — refreshing submodules"
  git -C "${ARDUPILOT_DIR}" submodule update --init --recursive
fi

# ---------------------------------------------------------------------------
# 4. Python venv + dependencies
# ---------------------------------------------------------------------------
if [[ ! -d "${VENV_DIR}" ]]; then
  log "Creating Python venv at ${VENV_DIR}"
  python3 -m venv "${VENV_DIR}"
fi
# shellcheck disable=SC1091
source "${VENV_DIR}/bin/activate"

log "Upgrading pip + wheel"
pip install --quiet --upgrade pip wheel

log "Installing Python deps (MAVProxy, pymavlink, build helpers)"
# empy is pinned because ArduPilot's waf still uses the 3.x API; 4.x breaks the build.
pip install --quiet \
  "empy==3.3.4" \
  "pexpect" \
  "future" \
  "lxml" \
  "pymavlink" \
  "MAVProxy"

# ---------------------------------------------------------------------------
# 5. Build SITL
# ---------------------------------------------------------------------------
log "Configuring waf for SITL"
( cd "${ARDUPILOT_DIR}" && ./waf configure --board sitl )

log "Building ArduCopter SITL (5-10 min on first build)"
( cd "${ARDUPILOT_DIR}" && ./waf copter )

# ---------------------------------------------------------------------------
# 6. Summary
# ---------------------------------------------------------------------------
cat <<DONE

Setup complete.

  ArduPilot : ${ARDUPILOT_DIR}
  Venv      : ${VENV_DIR}
  Binary    : ${ARDUPILOT_DIR}/build/sitl/bin/arducopter

Run a flight in two terminals:

  Terminal A:   ./run_sitl.sh

  Terminal B:   source venv/bin/activate
                python client/connect.py        # heartbeat sanity check
                python client/telemetry.py      # live attitude/GPS stream
                python client/arm_takeoff.py    # arm, takeoff 10m, land

DONE
