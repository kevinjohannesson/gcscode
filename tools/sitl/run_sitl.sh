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
# SITL_VEHICLES=N (1 to 5, default 1) runs N vehicles on system IDs 1 to N.
# Vehicle k is SITL instance k-1, on TCP 5760 + 10*(k-1), with a MAVProxy of
# its own that sends to 14551 only, so mavlink2rest sees every vehicle and the
# Python client on 14550 sees vehicle 1 alone. Vehicle 1's MAVProxy is the one
# in the foreground; the others run non-interactive, their lines prefixed with
# `vehicle <k>: `.
#
# Args are forwarded to every MAVProxy. Examples:
#   ./run_sitl.sh                        # defaults
#   SITL_MODEL=quad ./run_sitl.sh        # different copter frame
#   SITL_VEHICLES=3 ./run_sitl.sh        # three vehicles, system IDs 1 to 3
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
M2R_BIN="${SITL_HOME}/bin/mavlink2rest"   # the pinned copy setup.sh installs

SITL_VEHICLES="${SITL_VEHICLES:-1}"

[[ "${SITL_HOME}" == /* ]] || { echo "ERROR: GCSCODE_SITL_HOME must be an absolute path, got: ${SITL_HOME}" >&2; exit 1; }
[[ "${SITL_VEHICLES}" =~ ^[1-5]$ ]] || { echo "ERROR: SITL_VEHICLES must be a whole number from 1 to 5, got: ${SITL_VEHICLES}" >&2; exit 1; }

[[ -x "${SITL_BIN}" ]]  || { echo "ERROR: SITL binary missing: ${SITL_BIN}. Build it from the repo root with:  pnpm --filter sitl run setup" >&2; exit 1; }
[[ -d "${VENV_DIR}" ]] || { echo "ERROR: venv missing: ${VENV_DIR}. Create it from the repo root with:  pnpm --filter sitl run setup" >&2; exit 1; }

if [[ ! -x "${M2R_BIN}" ]]; then
  echo "ERROR: mavlink2rest missing: ${M2R_BIN}. Install it from the repo root with:  pnpm --filter sitl run setup" >&2
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
  echo "    \"${VENV_DIR}/bin/python\" -m pip install --force-reinstall MAVProxy" >&2
  exit 1
fi

# Tunables (env-overridable)
SITL_MODEL="${SITL_MODEL:-+}"                                       # e.g. +, quad, X, octa
SITL_DEFAULTS="${SITL_DEFAULTS:-${ARDUPILOT_DIR}/Tools/autotest/default_params/copter.parm}"
PRIMARY_OUT="${PRIMARY_OUT:-udp:127.0.0.1:14550}"                     # Python client
# Fixed: instance k listens on TCP 5760 + 10*k, and mavlink2rest (and through
# it the GCS) reads UDP 14551.
GCS_OUT="udp:127.0.0.1:14551"
sitl_port() { echo $((5760 + 10 * ($1 - 1))); }   # of vehicle $1

# SITL runs from the ArduPilot folder, so resolve a relative path now, against
# the folder the command was typed in (pnpm runs scripts from the package folder
# and passes the original one as INIT_CWD).
[[ "${SITL_DEFAULTS}" == /* ]] || SITL_DEFAULTS="${INIT_CWD:-${PWD}}/${SITL_DEFAULTS}"
[[ -f "${SITL_DEFAULTS}" ]] || { echo "ERROR: SITL_DEFAULTS not found: ${SITL_DEFAULTS}" >&2; exit 1; }

PORTS=()
for vehicle in $(seq 1 "${SITL_VEHICLES}"); do
  PORTS+=("$(sitl_port "${vehicle}")")
done
for port in "${PORTS[@]}" 8088; do
  if nc -z 127.0.0.1 "${port}" 2>/dev/null; then
    echo "ERROR: something already listens on TCP ${port} (another SITL or mavlink2rest?). Stop it first." >&2
    exit 1
  fi
done

# Vehicle 1 runs from the ArduPilot folder, as it always has, so its parameters
# (eeprom.bin) and logs stay where they were. SITL keeps those in the folder it
# runs from, so every other vehicle gets a folder of its own, whose `terrain`
# links to vehicle 1's: one terrain database, the one camera-sim reads.
vehicle_dir() {
  if [[ "$1" == 1 ]]; then echo "${ARDUPILOT_DIR}"; else echo "${SITL_HOME}/vehicles/$1"; fi
}
sitl_log() {
  if [[ "$1" == 1 ]]; then echo "${SITL_LOG}"; else echo "/tmp/ArduCopter-sitl-$1.log"; fi
}

SITL_PIDS=()
MAVPROXY_PIDS=()

# Stops what this script started, by the PIDs it recorded.
cleanup() {
  local pid
  for pid in ${MAVPROXY_PIDS[@]+"${MAVPROXY_PIDS[@]}"}; do kill "${pid}" 2>/dev/null || true; done
  if [[ -n "${M2R_PID:-}" ]] && kill -0 "${M2R_PID}" 2>/dev/null; then
    printf "==> Stopping mavlink2rest (PID %s)\n" "${M2R_PID}"
    kill "${M2R_PID}" 2>/dev/null || true
    wait "${M2R_PID}" 2>/dev/null || true
  fi
  for pid in ${SITL_PIDS[@]+"${SITL_PIDS[@]}"}; do
    if kill -0 "${pid}" 2>/dev/null; then
      printf "==> Stopping SITL (PID %s)\n" "${pid}"
      kill "${pid}" 2>/dev/null || true
    fi
  done
  for pid in ${MAVPROXY_PIDS[@]+"${MAVPROXY_PIDS[@]}"} ${SITL_PIDS[@]+"${SITL_PIDS[@]}"}; do
    wait "${pid}" 2>/dev/null || true
  done
}
trap cleanup EXIT

echo "==> Launching ArduCopter SITL, ${SITL_VEHICLES} vehicle(s)"
echo "    binary   : ${SITL_BIN}"
echo "    model    : ${SITL_MODEL}"
echo "    defaults : ${SITL_DEFAULTS}"

for vehicle in $(seq 1 "${SITL_VEHICLES}"); do
  dir="$(vehicle_dir "${vehicle}")"
  if [[ "${vehicle}" != 1 ]]; then
    mkdir -p "${dir}"
    [[ -e "${dir}/terrain" ]] || ln -s "${ARDUPILOT_DIR}/terrain" "${dir}/terrain"
  fi
  ( cd "${dir}" && exec "${SITL_BIN}" \
      --model "${SITL_MODEL}" \
      -I"$((vehicle - 1))" \
      --sysid "${vehicle}" \
      --defaults "${SITL_DEFAULTS}" \
      >"$(sitl_log "${vehicle}")" 2>&1 ) &
  SITL_PIDS+=($!)
  echo "    vehicle ${vehicle}: system ID ${vehicle}, TCP $(sitl_port "${vehicle}"), pid $!, log $(sitl_log "${vehicle}")"
done

echo
echo "==> Waiting for SITL TCP ${PORTS[*]} to come up ..."
for vehicle in $(seq 1 "${SITL_VEHICLES}"); do
  port="$(sitl_port "${vehicle}")"
  SITL_READY=""
  for _ in $(seq 1 30); do
    if nc -z 127.0.0.1 "${port}" 2>/dev/null; then
      SITL_READY=1
      break
    fi
    sleep 0.5
  done
  if [[ -z "${SITL_READY}" ]]; then
    echo "ERROR: SITL vehicle ${vehicle} did not open TCP ${port} within 15s." >&2
    echo "       Check $(sitl_log "${vehicle}")" >&2
    exit 1
  fi
done

M2R_LOG="/tmp/mavlink2rest.log"
echo "==> Starting mavlink2rest"
echo "    listen   : udp 14551 (GCS port)"
echo "    serve    : http://127.0.0.1:8088 (REST + ws://.../v1/ws/mavlink)"
echo "    log      : ${M2R_LOG}"
"${M2R_BIN}" \
  --connect "udpin:127.0.0.1:14551" \
  --server "127.0.0.1:8088" \
  >"${M2R_LOG}" 2>&1 &
M2R_PID=$!
sleep 1
if ! kill -0 "${M2R_PID}" 2>/dev/null; then
  echo "ERROR: mavlink2rest exited at startup. Check ${M2R_LOG}" >&2
  exit 1
fi

# Vehicles 2 and up: a MAVProxy each, in the background, sending to mavlink2rest only.
for vehicle in $(seq 2 "${SITL_VEHICLES}"); do
  mkdir -p "${LOG_DIR}/vehicle-${vehicle}"
  python -m MAVProxy.mavproxy \
    --master "tcp:127.0.0.1:$(sitl_port "${vehicle}")" \
    --state-basedir "${LOG_DIR}/vehicle-${vehicle}" \
    --out    "${GCS_OUT}" \
    "$@" \
    --non-interactive \
    </dev/null > >(sed -l "s/^/vehicle ${vehicle}: /") 2>&1 &
  MAVPROXY_PIDS+=($!)
done

cat <<INFO
==> SITL up. Starting MAVProxy router for vehicle 1.
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
