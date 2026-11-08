# PX4 SITL — research notes (2026-10-15)

Parked for later. Nothing built yet; ArduPilot setup untouched.
Revisit trigger: **when video streaming becomes part of the goal** — that
decides the backend on its own (see "Video" below).

## 1. The thing that tripped us up

PX4 has **no built-in flight dynamics** the way ArduPilot SITL does.
ArduPilot's `arducopter` binary simulates the airframe itself; PX4 expects an
external simulator to connect on **TCP 4560** and feed it sensor data.

So `make px4_sitl none_iris` is _not_ "headless PX4" — `none` literally means
"start PX4 with no simulator, I'll bring my own". Nothing flies, no sensor
data arrives, the EKF never initialises, arming is refused. Dead end unless
we write our own sim.

## 2. The three real backends

| Backend         | Target                                 | Deps                                 | Dynamics            | Cameras/video |
| --------------- | -------------------------------------- | ------------------------------------ | ------------------- | ------------- |
| **SIH**         | `make px4_sitl sihsim_quadx`           | none beyond PX4 toolchain            | yes, built into PX4 | no            |
| **jMAVSim**     | `make px4_sitl jmavsim` (`HEADLESS=1`) | Java + ant                           | yes, simple         | no            |
| **Gazebo (gz)** | `make px4_sitl gz_x500` (`HEADLESS=1`) | pixi/conda-forge + XQuartz, multi-GB | yes, full physics   | **yes**       |

### SIH (Simulation-In-Hardware, run as SITL)

Closest thing to the ArduPilot experience: dynamics compiled into PX4, no
external process, no Java, no Gazebo. Since PX4 v1.14 it runs as plain SITL
with no flight-controller hardware. Models: quadx, hex (v1.17+), airplane,
xvert tailsitter, `standard_vtol`. Airframe tuned via `SIH_*` params.
Caveat: community-supported; docs say "may not work with current PX4
versions, known to work with v1.14". Needs a smoke test on v1.17.0 before
committing to it.
**This is the pick if the goal stays telemetry-only.**

### jMAVSim

Light, works headless (`HEADLESS=1` appends `-no-gui`), talks to PX4 over TCP 4560. **Removed from PX4 main** — `make px4_sitl jmavsim` now fails with
`ninja: error: unknown target 'jmavsim'`. Submodule still present in the
v1.17.0 and v1.16.2 tags, so it'd mean pinning the clone to a tag. Given SIH
exists and needs no Java, jMAVSim is probably the worst of the three for us.

### Gazebo (gz Harmonic)

The only officially supported path on main, and the only one with camera
sensors. Heavy: PX4's `Tools/setup/macos.sh --sim-tools` installs Gazebo from
a locked conda-forge env via **pixi** (not brew) plus **XQuartz** (may need a
logout/login after first install). Smoke test: `make px4_sitl gz_x500`.

## 3. Video — the reason to revisit

Gazebo is the only backend with simulated cameras. PX4's gz integration ships
camera-equipped airframes (`x500_mono_cam`, `x500_depth` and similar) and the
frames can be pushed out as a real video stream for a GCS to consume.
**Not yet verified** — confirm the current streaming path (GStreamer plugin /
RTSP endpoint, and what QGroundControl expects) before planning around it.

If video is in scope, the backend question answers itself: Gazebo, and the
"light and headless" preference goes out the window.

## 4. Decisions already made (still stand)

- **Separate PX4 client**, e.g. `client_px4/`, mirroring the existing scripts.
  ArduPilot client code stays untouched — no shared-helper refactor, no
  regression risk.
- **pymavlink, not MAVSDK.** Learning a second API isn't the point right now;
  the SITLs are a tool for a different goal. Keep the style of the existing
  `mav_helpers.py`.
- **One autopilot at a time.** PX4 reuses 14550/14551/8088; no port-offset
  juggling.

## 5. Port topology for a PX4 `run_px4_sitl.sh`

PX4 SITL's MAVLink links (from `ROMFS/px4fmu_common/init.d-posix/px4-rc.mavlink`,
v1.17.0; `i` = instance number, 0 for us):

| Link                   | Local UDP | Remote UDP |
| ---------------------- | --------- | ---------- |
| GCS                    | 18570 + i | 14550 + i  |
| Offboard / onboard API | 14580 + i | 14540 + i  |
| Camera payload         | 14280 + i | 14030 + i  |
| Gimbal                 | 13030 + i | 13280 + i  |

Proposed mirror of the ArduPilot topology:

    PX4 SITL ──(udp 14540, onboard API link)──> MAVProxy ──> udp 14560  (PX4 python client)
                                                         └─> udp 14551  (mavlink2rest :8088)
    14550 left free for QGroundControl

Rationale: 14540 is PX4's purpose-built onboard/API link, and leaving 14550
alone means QGC can attach the way it expects. MAVProxy master would be
`udp:127.0.0.1:14540` (pymavlink `udp:` binds; `udpout:` connects).

Open question: whether to reuse `run_sitl.sh`'s mavlink2rest block verbatim
(port 8088) — fine given one-at-a-time.

## 6. Version landscape (Oct 2026)

- Latest stable: **v1.17.0**. Also v1.16.2 on the old line. v1.18.0-rc1 in flight.
- macOS: Intel and Apple Silicon both documented, but PX4 CI only tests
  Apple Silicon.
- Add `ulimit -S -n 2048` to `~/.zshrc` before building — the macOS default of
  256 file descriptors causes `LD: too many open files` partway through.
- `Tools/setup/macos.sh` creates a `.venv` in the PX4 repo root. That's a
  _second_ venv alongside SITL's own venv (`$GCSCODE_SITL_HOME/venv`) — keep them straight,
  or have the PX4 script activate the right one explicitly.

## 7. Sources

- https://docs.px4.io/main/en/simulation/
- https://docs.px4.io/main/en/sim_sih/
- https://docs.px4.io/main/en/dev_setup/dev_env_mac
- https://discuss.px4.io/t/make-px4-sitl-jmavsim-ninja-error-unknown-target-jmavsim-make-px4-sitl-error-1/45323/2
- https://raw.githubusercontent.com/PX4/PX4-Autopilot/v1.17.0/ROMFS/px4fmu_common/init.d-posix/px4-rc.mavlink
