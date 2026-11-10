#!/usr/bin/env bash
# MediaMTX setup for macOS (Apple Silicon + Intel).
# Idempotent — safe to re-run.
#
# The repo holds only scripts and the config. The MediaMTX binary lives outside
# it, shared by every worktree: GCSCODE_MEDIAMTX_HOME, default ~/.gcscode/mediamtx.
set -euo pipefail

MEDIAMTX_HOME="${GCSCODE_MEDIAMTX_HOME:-${HOME}/.gcscode/mediamtx}"
MEDIAMTX_BIN="${MEDIAMTX_HOME}/mediamtx"
# The MediaMTX release camera-sim and the Video panel were built and tested
# against, with the sha256 digests from that release's checksums.sha256. They
# are committed here so the commit, not the download, is the trust anchor.
MEDIAMTX_VERSION="1.21.3"
SHA256_DARWIN_ARM64="bc1a0762fd18ffb413bcd81dcb9a072ac159fbd1f27e79ac6f14598aaac5ed3f"
SHA256_DARWIN_AMD64="8a8416ee2ff5d17d9366498b6d88b76ab6d3afcda50b6d7321ccddb349bdbaf2"

log() { printf "\n\033[1;34m==>\033[0m %s\n" "$*"; }
err() { printf "\n\033[1;31mERROR:\033[0m %s\n" "$*" >&2; }

if [[ "${MEDIAMTX_HOME}" != /* ]]; then
  err "GCSCODE_MEDIAMTX_HOME must be an absolute path, got: ${MEDIAMTX_HOME}"
  exit 1
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  err "This script is for macOS. Detected: $(uname -s)"
  exit 1
fi

# `mediamtx --version` prints the tag, for example v1.21.3.
HAVE="$("${MEDIAMTX_BIN}" --version 2>/dev/null || true)"
if [[ "${HAVE}" == "v${MEDIAMTX_VERSION}" ]]; then
  log "MediaMTX ${HAVE} already installed: ${MEDIAMTX_BIN}"
  exit 0
fi

case "$(uname -m)" in
  arm64) ARCH="darwin_arm64"; SHA256="${SHA256_DARWIN_ARM64}" ;;
  x86_64) ARCH="darwin_amd64"; SHA256="${SHA256_DARWIN_AMD64}" ;;
  *) err "No MediaMTX release for $(uname -m)"; exit 1 ;;
esac
ARCHIVE="mediamtx_v${MEDIAMTX_VERSION}_${ARCH}.tar.gz"
URL="https://github.com/bluenviron/mediamtx/releases/download/v${MEDIAMTX_VERSION}/${ARCHIVE}"

# Download and unpack beside the binary's final place, so the last step is a
# rename on one filesystem; an interrupted run leaves nothing behind.
mkdir -p "${MEDIAMTX_HOME}"
WORK_DIR="$(mktemp -d "${MEDIAMTX_HOME}/.setup.XXXXXX")"
trap 'rm -rf "${WORK_DIR:-}"' EXIT

log "Downloading MediaMTX v${MEDIAMTX_VERSION} (${ARCH}, about 30 MB) to ${MEDIAMTX_HOME}"
if ! curl -fsSL -o "${WORK_DIR}/${ARCHIVE}" "${URL}"; then
  err "Download failed: ${URL}"
  exit 1
fi
if ! echo "${SHA256}  ${WORK_DIR}/${ARCHIVE}" | shasum -a 256 -c --status; then
  err "${ARCHIVE} does not match its published sha256; not installed."
  exit 1
fi
# The archive also holds a sample mediamtx.yml and the LICENSE; run.sh uses
# this folder's mediamtx.yml, so only the binary is kept.
tar -xzf "${WORK_DIR}/${ARCHIVE}" -C "${WORK_DIR}" mediamtx
mv "${WORK_DIR}/mediamtx" "${MEDIAMTX_BIN}"

cat <<DONE

Setup complete.

  MediaMTX : ${MEDIAMTX_BIN} ($("${MEDIAMTX_BIN}" --version))

Start it from the repo root:

  pnpm --filter mediamtx start

DONE
