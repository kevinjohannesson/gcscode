#!/usr/bin/env bash
# `pnpm fly-sitl` (the root package.json) runs this: it starts client/fly.py
# with the SITL venv's Python, so the venv never needs activating. fly.py's
# arguments pick what to fly; without any, it lists them.
#
#   pnpm fly-sitl --circle 3
set -euo pipefail

CLIENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/client"
SITL_HOME="${GCSCODE_SITL_HOME:-${HOME}/.gcscode/sitl}"
VENV_PYTHON="${SITL_HOME}/venv/bin/python"

# pnpm passes on a -- typed before the arguments.
[[ "${1:-}" == "--" ]] && shift

[[ "${SITL_HOME}" == /* ]] || { echo "ERROR: GCSCODE_SITL_HOME must be an absolute path, got: ${SITL_HOME}" >&2; exit 1; }

if ! "${VENV_PYTHON}" -c "import pymavlink" >/dev/null 2>&1; then
  echo "ERROR: no SITL venv with pymavlink at ${SITL_HOME}/venv. Run setup: pnpm --filter sitl run setup" >&2
  exit 1
fi

# Relative paths the user types resolve against the folder they typed the
# command in (pnpm runs scripts from the package folder and passes the original
# one as INIT_CWD).
cd "${INIT_CWD:-${PWD}}"
exec "${VENV_PYTHON}" "${CLIENT_DIR}/fly.py" "$@"
