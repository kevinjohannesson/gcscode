#!/usr/bin/env bash
# Launch ArduCopter SITL via sim_vehicle.py with two MAVLink fan-out ports.
# Args are forwarded — e.g.:
#   ./run_sitl.sh --console --map        # open MAVProxy console + map
#   ./run_sitl.sh -L AVALON              # different start location
#   ./run_sitl.sh -w                     # wipe EEPROM (fresh params)
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARDUPILOT_DIR="${PROJECT_ROOT}/ardupilot"
VENV_DIR="${PROJECT_ROOT}/venv"
SIM_VEHICLE="${ARDUPILOT_DIR}/Tools/autotest/sim_vehicle.py"

if [[ ! -f "${SIM_VEHICLE}" ]]; then
  echo "ERROR: sim_vehicle.py not found at ${SIM_VEHICLE}" >&2
  echo "       Run ./setup.sh first." >&2
  exit 1
fi

if [[ ! -d "${VENV_DIR}" ]]; then
  echo "ERROR: venv missing at ${VENV_DIR}. Run ./setup.sh first." >&2
  exit 1
fi

# Activate venv so MAVProxy + pymavlink are on PATH for sim_vehicle.py.
# shellcheck disable=SC1091
source "${VENV_DIR}/bin/activate"
export PATH="${VENV_DIR}/bin:${PATH}"

cd "${ARDUPILOT_DIR}"

# MAVLink fan-out:
#   udp:127.0.0.1:14550  -> primary  (this project's Python client)
#   udp:127.0.0.1:14551  -> reserved (your future ground-station app)
#
# MAVProxy itself remains as a router/console attached to SITL (TCP 5760).
exec python "${SIM_VEHICLE}" \
  -v ArduCopter \
  --out=udp:127.0.0.1:14550 \
  --out=udp:127.0.0.1:14551 \
  "$@"
