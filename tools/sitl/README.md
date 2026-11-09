# sitl

ArduCopter SITL (software in the loop): a simulated drone to develop and test gcscode against. It is a tool, not part of the GCS. gcscode reaches it only over MAVLink, through mavlink2rest, the way it would reach a real vehicle.

## How it fits together

```
arducopter (TCP 5760) <-> MAVProxy --> UDP 14550 --> Python client (client/)
                                   --> UDP 14551 --> mavlink2rest --> ws://localhost:8088/v1/ws/mavlink
                                                                      (gcscode's MAVLink extension)
```

## Setup (macOS)

Needs the Xcode Command Line Tools, Homebrew and `python3`. From the repo root:

```sh
pnpm --filter sitl run setup
```

or `./setup.sh` from this folder. The first run clones ArduPilot (about 1.5 GB with submodules) and builds ArduCopter SITL (5–10 minutes). It is safe to re-run: it skips the build when the binary exists (`SITL_REBUILD=1` forces it), and it installs the pinned mavlink2rest release, checked against its published sha256, unless that version is already in place.

## Running it

```sh
pnpm --filter sitl start
```

or `./run_sitl.sh` from this folder, which forwards its arguments to MAVProxy (`./run_sitl.sh --console`). Ctrl-C stops SITL, MAVProxy and mavlink2rest together. In a second terminal, start gcscode with `pnpm dev` from the repo root.

Environment overrides: `SITL_MODEL` (frame, default `+`), `SITL_DEFAULTS` (parameter file) and `PRIMARY_OUT` (the Python client's UDP output). The ports gcscode depends on are fixed: SITL instance 0 on TCP 5760, mavlink2rest on UDP 14551 and HTTP 8088. The launcher stops if 5760 or 8088 is already taken.

## Where things live

The repo holds only scripts. Everything else lives outside it, in `GCSCODE_SITL_HOME` (an absolute path, default `~/.gcscode/sitl`), so every worktree shares one build:

- `ardupilot/` — the ArduPilot checkout and its build. SITL runs from here, so the terrain files it downloads land in `ardupilot/terrain/` and its own flight logs (`.BIN`) in `ardupilot/logs/`.
- `venv/` — Python with MAVProxy, pymavlink and ArduPilot's build tools.
- `bin/mavlink2rest` — the pinned mavlink2rest release (`MAVLINK2REST_VERSION`, default 1.0.2). `run_sitl.sh` runs this copy, whatever else is on `PATH`.
- `logs/` — MAVProxy's telemetry logs (`mav.tlog`). They grow by gigabytes over a long run; delete them freely.

SITL's own output goes to `/tmp/ArduCopter-sitl.log`, mavlink2rest's to `/tmp/mavlink2rest.log`.

## Flying it

With SITL running, from the repo root:

```sh
pnpm fly-sitl                # list what it can do
pnpm fly-sitl --circle 3     # fly three circles around home, then RTL
pnpm fly-sitl --takeoff 25   # arm, take off to 25 m, hover, land
pnpm fly-sitl --connect      # wait for one heartbeat; the drone does not move
pnpm fly-sitl --telemetry    # live attitude and position until Ctrl-C; the drone does not move
```

Arguments after the action go to the script that carries it out (`pnpm fly-sitl --circle 3 --radius 50`), and `pnpm fly-sitl --circle --help` lists that script's options. Inside a package folder pnpm looks for the script in that package, so use `pnpm -w fly-sitl` there.

`fly-sitl` runs `fly.sh`, which starts `client/fly.py` with the venv's Python, so there is nothing to activate; if the venv or its pymavlink is missing, it says to run setup. `fly.py` hands each action to one of the small Python scripts beside it, which talk MAVLink to SITL over UDP 14550. Starting SITL never moves the drone: only `--circle` and `--takeoff` do.

## PX4

[`PX4_NOTES.md`](PX4_NOTES.md) holds parked research on PX4 SITL backends.
