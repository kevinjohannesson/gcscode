# sitl

ArduCopter SITL (software in the loop): a simulated drone to develop and test gcscode against. It is a tool, not part of the GCS. gcscode reaches it only over MAVLink, through mavlink2rest, the way it would reach a real vehicle.

## How it fits together

```
arducopter (TCP 5760) <-> MAVProxy --> UDP 14550 --> Python client (client/)
                                   --> UDP 14551 --> mavlink2rest --> ws://localhost:8088/v1/ws/mavlink
                                                                      (gcscode's MAVLink extension)
```

With several vehicles (`SITL_VEHICLES`, below), vehicle _k_ is SITL instance _k_ − 1 on TCP 5760 + 10(_k_ − 1), with system ID _k_ and a MAVProxy of its own that sends to UDP 14551 only. mavlink2rest sees them all, by system ID; the Python client on 14550 sees vehicle 1 alone.

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

or `./run_sitl.sh` from this folder, which forwards its arguments to MAVProxy (`./run_sitl.sh --console`). Ctrl-C stops SITL, MAVProxy and mavlink2rest together. In a second terminal, start gcscode with `pnpm dev` from the repo root. `pnpm dev:sitl` at the repo root runs this, MediaMTX and the dev server together.

Environment overrides: `SITL_MODEL` (frame, default `+`), `SITL_DEFAULTS` (parameter file), `PRIMARY_OUT` (the Python client's UDP output) and `SITL_VEHICLES` (how many vehicles, 1 to 5, default 1). The ports gcscode depends on are fixed: SITL instance 0 on TCP 5760, mavlink2rest on UDP 14551 and HTTP 8088. `run_sitl.sh` stops if any vehicle's TCP port or 8088 is already taken.

### Several vehicles

`SITL_VEHICLES=3 pnpm --filter sitl start`, or `pnpm dev:sitl --vehicles 3` for the whole stack, runs vehicles 1 to 3 on system IDs 1 to 3. They all start at the same home. MAVProxy's prompt belongs to vehicle 1; the others run without one, their lines prefixed `vehicle <k>: `, and the arguments given to `run_sitl.sh` go to every MAVProxy. `pnpm fly-sitl` flies vehicle 1 only. camera-sim publishes one stream per vehicle, `drone-<k>`.

Known limits: a MAVProxy of vehicle 2 or up that exits does not stop the others. mavlink2rest answers whichever vehicle's MAVProxy sent to it last, so it is for reading only with several vehicles; nothing in gcscode sends to vehicles yet.

## Where things live

The repo holds only scripts. Everything else lives outside it, in `GCSCODE_SITL_HOME` (an absolute path, default `~/.gcscode/sitl`), so every worktree shares one build:

- `ardupilot/` — the ArduPilot checkout and its build. SITL runs from here, so the terrain files it downloads land in `ardupilot/terrain/` and its own flight logs (`.BIN`) in `ardupilot/logs/`.
- `venv/` — Python with MAVProxy, pymavlink and ArduPilot's build tools.
- `bin/mavlink2rest` — the pinned mavlink2rest release (`MAVLINK2REST_VERSION`, default 1.0.2). `run_sitl.sh` runs this copy, whatever else is on `PATH`.
- `logs/` — MAVProxy's telemetry logs (`mav.tlog`). They grow by gigabytes over a long run; delete them freely.

- `vehicles/<k>/` — the folder vehicle _k_ (2 and up) runs from, with its own parameters (`eeprom.bin`) and flight logs; its `terrain` links to `ardupilot/terrain/`, so every vehicle and camera-sim share one terrain database. Vehicle 1 runs from `ardupilot/`, as it always has. MAVProxy's logs for vehicle _k_ go to `logs/vehicle-<k>/`.

SITL's own output goes to `/tmp/ArduCopter-sitl.log` (vehicle _k_ ≥ 2: `/tmp/ArduCopter-sitl-<k>.log`), mavlink2rest's to `/tmp/mavlink2rest.log`.

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
