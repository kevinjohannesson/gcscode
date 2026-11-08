#!/usr/bin/env bash
# Launch ArduCopter SITL + MAVProxy router, bypassing sim_vehicle.py.
#
# Why not sim_vehicle.py?
#   It uses osascript to open new Terminal.app windows, which fails outside
#   of Terminal.app (IDE shells, automation-permission denied, headless, etc.)
#   and can also struggle to find MAVProxy via PATH. This script keeps both
#   processes in the foreground of one shell — predictable and debuggable.
#
# Topology:
#   arducopter (TCP 5760)  <->  MAVProxy  -->  UDP 14550  (Python CLI client)
#                                          -->  UDP 14551  (reserved GCS)
#
#   mavlink2rest listens on UDP 14551 and serves http://127.0.0.1:8088
#
# Args are forwarded to MAVProxy. Examples:
#   ./run_sitl.sh                        # defaults
#   SITL_MODEL=quad ./run_sitl.sh        # different copter frame
#   ./run_sitl.sh --console              # MAVProxy console (needs wxPython)
#
# State lives outside the repo, in GCSCODE_SITL_HOME (default ~/.gcscode/sitl):
# the ArduPilot checkout, the venv, mavlink2rest and MAVProxy's logs (logs/).
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SITL_HOME="${GCSCODE_SITL_HOME:-${HOME}/.gcscode/sitl}"
ARDUPILOT_DIR="${SITL_HOME}/ardupilot"
VENV_DIR="${SITL_HOME}/venv"
LOG_DIR="${SITL_HOME}/logs"
SITL_BIN="${ARDUPILOT_DIR}/build/sitl/bin/arducopter"
SITL_LOG="/tmp/ArduCopter-sitl.log"
export PATH="${SITL_HOME}/bin:${PATH}"

[[ -x "${SITL_BIN}" ]]  || { echo "ERROR: SITL binary missing: ${SITL_BIN}"  >&2; exit 1; }
[[ -d "${VENV_DIR}" ]] || { echo "ERROR: venv missing. Run ./setup.sh."     >&2; exit 1; }

if ! command -v mavlink2rest >/dev/null 2>&1; then
  echo "ERROR: mavlink2rest not found. Run ./setup.sh, which installs it." >&2
  exit 1
fi
mkdir -p "${LOG_DIR}"

# shellcheck disable=SC1091
source "${VENV_DIR}/bin/activate"

# Verify MAVProxy is installed in the venv. We import the package rather than
# looking for `mavproxy.py` on PATH, because invoking Python scripts directly
# is unreliable when the venv path contains spaces (the kernel splits the
# shebang on whitespace). We launch MAVProxy via `python -m` below.
if ! python -c "import MAVProxy" >/dev/null 2>&1; then
  echo "ERROR: MAVProxy not installed in venv. Reinstall with:" >&2
  echo "    source \"${VENV_DIR}/bin/activate\""                 >&2
  echo "    pip install --force-reinstall MAVProxy"             >&2
  exit 1
fi

# Tunables (env-overridable)
SITL_MODEL="${SITL_MODEL:-+}"                                       # e.g. +, quad, X, octa
SITL_DEFAULTS="${SITL_DEFAULTS:-${ARDUPILOT_DIR}/Tools/autotest/default_params/copter.parm}"
SITL_INSTANCE="${SITL_INSTANCE:-0}"                                  # -I flag
PRIMARY_OUT="${PRIMARY_OUT:-udp:127.0.0.1:14550}"
GCS_OUT="${GCS_OUT:-udp:127.0.0.1:14551}"

cleanup() {
  if [[ -n "${M2R_PID:-}" ]] && kill -0 "${M2R_PID}" 2>/dev/null; then
    printf "==> Stopping mavlink2rest (PID %s)\n" "${M2R_PID}"
    kill "${M2R_PID}" 2>/dev/null || true
    wait "${M2R_PID}" 2>/dev/null || true
  fi
  if [[ -n "${SITL_PID:-}" ]] && kill -0 "${SITL_PID}" 2>/dev/null; then
    printf "\n==> Stopping SITL (PID %s)\n" "${SITL_PID}"
    kill "${SITL_PID}" 2>/dev/null || true
    wait "${SITL_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "==> Launching ArduCopter SITL"
echo "    binary   : ${SITL_BIN}"
echo "    model    : ${SITL_MODEL}"
echo "    defaults : ${SITL_DEFAULTS}"
echo "    log      : ${SITL_LOG}"

cd "${ARDUPILOT_DIR}"
"${SITL_BIN}" \
  --model "${SITL_MODEL}" \
  -I"${SITL_INSTANCE}" \
  --defaults "${SITL_DEFAULTS}" \
  >"${SITL_LOG}" 2>&1 &
SITL_PID=$!
cd "${PROJECT_ROOT}"

echo "    pid      : ${SITL_PID}"
echo
echo "==> Waiting for SITL TCP 5760 to come up ..."
for _ in $(seq 1 30); do
  if nc -z 127.0.0.1 5760 2>/dev/null; then
    SITL_READY=1
    break
  fi
  sleep 0.5
done

if [[ -z "${SITL_READY:-}" ]]; then
  echo "ERROR: SITL did not open TCP 5760 within 15s." >&2
  echo "       Check ${SITL_LOG}"                       >&2
  exit 1
fi

M2R_LOG="/tmp/mavlink2rest.log"
echo "==> Starting mavlink2rest"
echo "    listen   : udp 14551 (GCS port)"
echo "    serve    : http://127.0.0.1:8088 (REST + ws://.../v1/ws/mavlink)"
echo "    log      : ${M2R_LOG}"
mavlink2rest \
  --connect "udpin:127.0.0.1:14551" \
  --server "127.0.0.1:8088" \
  >"${M2R_LOG}" 2>&1 &
M2R_PID=$!

cat <<INFO
==> SITL up. Starting MAVProxy router.
    master : tcp:127.0.0.1:5760
    out    : ${PRIMARY_OUT}   (-> Python CLI client)
    out    : ${GCS_OUT}   (-> mavlink2rest, for the GCS)
    logs   : ${LOG_DIR}

    Tail SITL stdout in another terminal:  tail -f ${SITL_LOG}
    Stop everything: Ctrl-C  (or type 'exit' at the MAVProxy prompt)

INFO

# Launch MAVProxy as a Python module rather than executing mavproxy.py
# directly. This sidesteps the macOS kernel's shebang parser, which can't
# handle interpreter paths with spaces.
python -m MAVProxy.mavproxy \
  --master "tcp:127.0.0.1:5760" \
  --state-basedir "${LOG_DIR}" \
  --out    "${PRIMARY_OUT}" \
  --out    "${GCS_OUT}" \
  "$@"

# cleanup() runs on EXIT and tears down SITL.
