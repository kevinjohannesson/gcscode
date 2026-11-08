# camera-sim

A fake camera payload for gcscode. It renders what each SITL vehicle's camera would see and streams that view the way a real camera does, so the GCS has a video source to build and test against.

SITL is a fake autopilot; camera-sim is a fake camera. The GCS should not be able to tell either from the real thing, so camera-sim speaks only the protocols real hardware uses: MAVLink in (through mavlink2rest), H.264 video out (through a MediaMTX media server). It is part of the gcscode [Ecosystem](../../docs/roadmap.md#ecosystem): the GCS never imports it, and it runs outside the spec/ADR review loop.

**Guiding principle: SITL owns the truth, camera-sim renders it.** Positions use ArduPilot's own lat/lon-to-metres convention, the ground is read from SITL's own terrain files with SITL's own formula, and nothing appears in the video that the autopilot doesn't also believe.

## Status: v0

- **SITL's ground.** camera-sim reads SITL's terrain database (`ardupilot/terrain/*.DAT`) and places the ground exactly where SITL simulates it: `home altitude + terrain(here) − terrain(home)`, flat wherever SITL has no data. Checked against the terrain heights ArduPilot itself reported in a flight log.
- **Satellite imagery that sharpens near the camera.** Tiles are finer close to each drone and coarser far away, up to zoom 19 (about 0.25 m per pixel) by default.
- **One camera per vehicle** (keyed by MAVLink system ID), stabilized at a fixed pitch, turning with the vehicle's heading.
- **A ground check** on the status page: whenever a drone sits disarmed, camera-sim checks it is resting on the rendered ground, and says so if SITL and the sim disagree.
- **Burned into every frame:** system ID, UTC time, frame number, height above ground, heading, pitch and the imagery attribution; a banner when telemetry goes stale.
- **H.264 over WebRTC (WHIP)** to MediaMTX as `drone-<sysid>`, readable as RTSP, at a fixed resolution.
- **Ground markers** to check the video against the GCS map.

Next, roughly in order: link-quality impairments, gimbal and zoom through SITL's simulated gimbals, scenarios, thermal and night modes, per-frame KLV metadata. See the roadmap entry.

## Running it (all on one machine)

1. **SITL.** Raise the telemetry rate from MAVProxy's default 4 Hz so the video moves smoothly:

   ```sh
   ./run_sitl.sh --streamrate 25
   ```

   Keep `SIM_TERRAIN` at 1, ArduPilot's default (if you set it to 0 for the spike, type `param set SIM_TERRAIN 1` at the MAVProxy prompt: the terminal where `run_sitl.sh` runs).

2. **Point camera-sim at SITL's terrain folder.** Create `packages/camera-sim/.env.local` (gitignored) with the folder that holds SITL's `.DAT` files:

   ```sh
   CAMERA_SIM_TERRAIN_DIR="/path/to/Drone SITL/ardupilot/terrain"
   ```

3. **MediaMTX.** Download the binary for your platform from the [MediaMTX releases](https://github.com/bluenviron/mediamtx/releases) and run `./mediamtx`. The defaults are what camera-sim expects: WebRTC (WHIP) on 8889, RTSP on 8554, any stream path allowed.

4. **camera-sim.** From the repo root:

   ```sh
   pnpm install
   pnpm --filter camera-sim dev
   ```

   Open <http://localhost:5174>. The status page should list the terrain file, for example `S36E149.DAT (9 blocks with data)`. Keep the window visible: browsers slow down hidden tabs, which freezes the video.

5. **Fly** (MAVProxy): `mode guided`, `arm throttle`, `takeoff 50`. A view appears as soon as the vehicle reports its position. Before you arm, the ground check should already say OK.

6. **Watch the stream** like any camera: `vlc rtsp://localhost:8554/drone-1`.

### The marker check

With the default settings the camera points straight down, and three markers are draped over the ground:

| Marker  | Where               | Lat, lon (default origin) |
| ------- | ------------------- | ------------------------- |
| Magenta | Home (the origin)   | -35.363262, 149.165237    |
| Cyan    | 100 m north of home | -35.36236368, 149.165237  |
| Yellow  | 100 m east of home  | -35.363262, 149.16633856  |

Fly over each (`guided -35.36236368 149.165237 50`) and the marker should sit in the middle of the frame at the moment the GCS map shows the drone on top of it.

### The ground check

A landed drone sits exactly on SITL's ground, so its height above the rendered ground should be about zero. Whenever a drone is disarmed and still, the status page shows the result:

- **OK**: the sim and SITL agree on where the ground is.
- **MISMATCH**: they don't. Usually `terrain=on/off` doesn't match SITL's `SIM_TERRAIN`, or the origin doesn't match SITL's start location (`SIM_OPOS_LAT/LNG/ALT`). At home the two always agree, so the check only catches a terrain mismatch once a drone lands somewhere else.

## Settings

Everything is set from the page URL, so pointing the sim somewhere else is a link, not a rebuild. Bad values are ignored with a warning on the page.

| Parameter                | Default                             | Meaning                                                                         |
| ------------------------ | ----------------------------------- | ------------------------------------------------------------------------------- |
| `mavlink`                | `ws://localhost:8088/v1/ws/mavlink` | mavlink2rest WebSocket                                                          |
| `media`                  | `http://localhost:8889`             | MediaMTX WebRTC base; streams go to `<media>/<stream>/whip`                     |
| `rtsp`                   | same host as `media`, port 8554     | Only used to show where to point VLC                                            |
| `origin`                 | `-35.363262,149.165237,584` (CMAC)  | SITL's start location, `lat,lon` or `lat,lon,alt` (`SIM_OPOS_*`)                |
| `terrain`                | `on`                                | `off` renders a flat world, for SITL with `SIM_TERRAIN 0`                       |
| `terrainUrl`             | `/terrain`                          | Where the `.DAT` files are served; the dev server maps it to the terrain folder |
| `markers`                | home, 100 m N, 100 m E              | `lat,lon;lat,lon;…`                                                             |
| `pitch`                  | `-90`                               | Gimbal pitch in degrees, -90 is straight down                                   |
| `hfov`                   | `70`                                | Horizontal field of view, degrees                                               |
| `width`, `height`, `fps` | `1280`, `720`, `30`                 | Output video                                                                    |
| `zoom`                   | `19`                                | Finest imagery zoom level near a camera (13–21)                                 |
| `extent`                 | `8000`                              | Side of the world square around the origin, metres                              |
| `imagery`, `attribution` | Esri World Imagery                  | XYZ template with `{z}`, `{x}`, `{y}`, and its credit line                      |

Example: `http://localhost:5174/?pitch=-45&hfov=90`.

### Imagery terms

The default imagery is Esri World Imagery. Esri allows free use only with attribution (camera-sim burns it into every frame), a free ArcGIS account, no revenue, and no use for the benefit of a business or government agency. That fits a personal hobby project. For anything else, switch providers with `imagery` and `attribution`. Never commit an API key: this repository is public.

Where tiles can't be loaded, the ground shows a grey grid instead, and the status page counts the failures.

## Running it across machines

The sim can run on a stronger machine than SITL and the GCS:

1. In `run_sitl.sh`, bind mavlink2rest to all interfaces: `--server "0.0.0.0:8088"` (it is `127.0.0.1` today).
2. Serve camera-sim to the LAN: `pnpm --filter camera-sim dev --host`. The terrain files are served by this same dev server, so they travel with the page.
3. On the other machine, open `http://<mac-ip>:5174/?mavlink=ws://<mac-ip>:8088/v1/ws/mavlink&media=http://<sim-machine-ip>:8889`, with MediaMTX running on that machine.
4. On Windows, allow MediaMTX through the firewall: TCP 8554 and 8889, UDP 8189.

## Known limits

- **One SITL frame of reference.** The origin must be SITL's start location. Several SITL instances started at different places each have their own ground reference; camera-sim renders one.
- **Terrain is read at page load.** If SITL downloads terrain for new areas during a flight (it asks MAVProxy for blocks near the vehicle), reload the page to see them.
- **Where SITL has no terrain, its ground is flat at home altitude,** and so is camera-sim's. At the edge of the data this shows as a step, in both.
- **SITL's terrain grid is 100 m,** so the ground is smoother than the imagery suggests. That's accurate to SITL, which is the point.
- **Each vehicle has its own WebGL renderer,** so imagery uploads once per vehicle. Fine for a handful of drones.
- **The browser's WebRTC encoder sets the bitrate;** resolution is held constant.

## Layout

| Path                          | What it does                                                         |
| ----------------------------- | -------------------------------------------------------------------- |
| `src/main.ts`                 | Wires everything together and draws the status page                  |
| `src/config.ts`               | Defaults and URL overrides                                           |
| `src/status-text.ts`          | The status page's terrain, imagery and ground-check lines            |
| `src/geo/`                    | Lat/lon ↔ metres (ArduPilot's convention), imagery tile arithmetic   |
| `src/terrain/`                | SITL's terrain files: reading them, SITL's ground, serving, loading  |
| `src/telemetry/`              | mavlink2rest socket, GLOBAL_POSITION_INT and HEARTBEAT parsing       |
| `src/vehicles/`               | One track per system ID; pose prediction; the ground check           |
| `src/camera/gimbal-camera.ts` | Where the camera is and which way it points                          |
| `src/world/`                  | The scene: imagery detail levels, terrain-shaped tiles, markers, sky |
| `src/output/`                 | Per-vehicle rendering, burned-in overlay, WHIP publishing            |
