# sitl

ArduCopter SITL (software in the loop): a simulated drone to develop and test gcscode against. It is a tool, not part of the GCS. gcscode reaches it only over MAVLink, through mavlink2rest, the way it would reach a real vehicle.

## How it fits together

```
arducopter (TCP 5760) <-> MAVProxy --> UDP 14550 --> Python client (client/)
                                   --> UDP 14551 --> mavlink2rest --> ws://localhost:8088/v1/ws/mavlink
                                                                      (gcscode's SITL extension)
```

## Setup (macOS)

Needs the Xcode Command Line Tools, Homebrew and `python3`. From the repo root:

```sh
pnpm --filter sitl run setup
```

or `./setup.sh` from this folder. The first run clones ArduPilot (about 1.5 GB with submodules) and builds ArduCopter SITL (5–10 minutes). It is safe to re-run: it skips the build when the binary exists (`SITL_REBUILD=1` forces it) and installs mavlink2rest only when it is not on `PATH` already.

## Running it

```sh
pnpm --filter sitl start
```

or `./run_sitl.sh` from this folder, which forwards its arguments to MAVProxy (`./run_sitl.sh --console`). Ctrl-C stops SITL, MAVProxy and mavlink2rest together. Then start gcscode with `pnpm dev` from the repo root.

Environment overrides: `SITL_MODEL` (frame, default `+`), `SITL_DEFAULTS` (parameter file), `SITL_INSTANCE`, `PRIMARY_OUT` and `GCS_OUT` (MAVProxy outputs).

## Where things live

The repo holds only scripts. Everything else lives outside it, in `GCSCODE_SITL_HOME` (default `~/.gcscode/sitl`), so every worktree shares one build:

- `ardupilot/` — the ArduPilot checkout and its build. SITL runs from here, so the terrain files it downloads land in `ardupilot/terrain/`.
- `venv/` — Python with MAVProxy, pymavlink and ArduPilot's build tools.
- `bin/mavlink2rest` — the pinned mavlink2rest release (`MAVLINK2REST_VERSION`, default 1.0.2), when setup had to download it.
- `logs/` — MAVProxy's telemetry logs (`mav.tlog`). They grow by gigabytes over a long run; delete them freely.

SITL's own output goes to `/tmp/ArduCopter-sitl.log`, mavlink2rest's to `/tmp/mavlink2rest.log`.

## Python client

Small scripts for poking at SITL without the GCS:

```sh
source ~/.gcscode/sitl/venv/bin/activate
python client/connect.py       # first heartbeat, then exit
python client/telemetry.py     # live attitude and position
python client/arm_takeoff.py   # arm, take off to 10 m, land
python client/fly_circle.py    # fly a circle around home, then RTL
```

## PX4

[`PX4_NOTES.md`](PX4_NOTES.md) holds parked research on PX4 SITL backends.
