#!/usr/bin/env bash
# Runs the MediaMTX that setup.sh installed, with this folder's mediamtx.yml.
# Ctrl-C stops it.
#
# The binary lives in GCSCODE_MEDIAMTX_HOME (default ~/.gcscode/mediamtx).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEDIAMTX_HOME="${GCSCODE_MEDIAMTX_HOME:-${HOME}/.gcscode/mediamtx}"
MEDIAMTX_BIN="${MEDIAMTX_HOME}/mediamtx"

[[ "${MEDIAMTX_HOME}" == /* ]] || { echo "ERROR: GCSCODE_MEDIAMTX_HOME must be an absolute path, got: ${MEDIAMTX_HOME}" >&2; exit 1; }

if [[ ! -x "${MEDIAMTX_BIN}" ]]; then
  echo "ERROR: MediaMTX missing: ${MEDIAMTX_BIN}. Install it from the repo root with:  pnpm --filter mediamtx run setup" >&2
  exit 1
fi

exec "${MEDIAMTX_BIN}" "${SCRIPT_DIR}/mediamtx.yml"
