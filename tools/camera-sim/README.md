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

What comes next is on the [roadmap](../../docs/roadmap.md#tools--coming-committed--will-ship), in the entry "Camera sim, after v0".

## Running it (all on one machine)

`pnpm dev:sitl`, from the repo root, starts camera-sim with the rest of the stack, headless. To run the parts by hand:

1. **SITL** ([`tools/sitl`](../sitl/README.md)). Raise the telemetry rate from MAVProxy's default 4 Hz so the video moves smoothly. From `tools/sitl`:

   ```sh
   ./run_sitl.sh --streamrate 25
   ```

   Keep `SIM_TERRAIN` at 1, ArduPilot's default (if you set it to 0 for the spike, type `param set SIM_TERRAIN 1` at the MAVProxy prompt: the terminal where `run_sitl.sh` runs).

2. **Optional: another terrain folder.** camera-sim serves SITL's own terrain folder, `<GCSCODE_SITL_HOME>/ardupilot/terrain`, with `GCSCODE_SITL_HOME` defaulting to `~/.gcscode/sitl` as in `run_sitl.sh`. Only for another folder, create `tools/camera-sim/.env.local` (gitignored) with the folder that holds SITL's `.DAT` files:

   ```sh
   CAMERA_SIM_TERRAIN_DIR="/path/to/terrain"
   ```

3. **MediaMTX** ([`tools/mediamtx`](../mediamtx/README.md)). From the repo root, install it once with `pnpm --filter mediamtx run setup`, then start it:

   ```sh
   pnpm --filter mediamtx start
   ```

   Its config is what camera-sim expects: WebRTC (WHIP) on 8889, RTSP on 8554, any stream path allowed.

4. **camera-sim**, after `pnpm install`, from the repo root. Either:
   - **Headless:** `pnpm --filter camera-sim start`. It needs Google Chrome, and runs the dev server and a headless Chrome until Ctrl-C. The page's console lines print as `page: …`: telemetry's state, the terrain line, and each stream's WHIP state.
   - **In a visible tab,** the way to see the status page and the ground check: `pnpm --filter camera-sim dev`, then open <http://localhost:5174>. The status page should list the terrain file, for example `S36E149.DAT (9 blocks with data)`. Keep the window visible: browsers slow down hidden tabs, which freezes the video.

   Never open the page while a headless camera-sim runs: two pages take `drone-1` from each other in turn.

5. **Fly** (MAVProxy): `mode guided`, `arm throttle`, `takeoff 50`. A view appears as soon as the vehicle reports its position. Before you arm, the ground check should already say OK. In SITL's first seconds, before it has a position, ArduPilot reports the vehicle at 0°, 0°: until the real position arrives, the view is empty and the check may say MISMATCH.

6. **Watch the stream** like any camera: `vlc rtsp://localhost:8554/drone-1`. In gcscode (`pnpm dev`), the Video panel plays vehicle 1's stream by default: its `gcscode.video.whepUrl` setting is `http://localhost:8889/drone-1/whep` (see [`extension-video`](../../packages/extension-video/README.md)).

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

Everything is set from the page URL, so pointing the sim somewhere else is a link, not a rebuild. A bad number, coordinate or `terrain` value is ignored with a warning on the page; addresses, the imagery template and its credit line are used as given.

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

The dev server and `pnpm --filter camera-sim start` read the environment:

| Variable                 | Default                                                        | Meaning                                                                                                                                 |
| ------------------------ | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `CAMERA_SIM_TERRAIN_DIR` | `<GCSCODE_SITL_HOME>/ardupilot/terrain`                        | The folder of SITL's `.DAT` files. `GCSCODE_SITL_HOME` defaults to `~/.gcscode/sitl`. `.env.local` can set it too; the environment wins |
| `CAMERA_SIM_CHROME`      | `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` | The Chrome that `start` runs headless                                                                                                   |
| `CAMERA_SIM_PORT`        | `5174`                                                         | The port `start` serves the page on, to run it beside something else on 5174                                                            |

### Imagery terms

The default imagery is Esri World Imagery. Esri allows free use only with attribution (camera-sim burns it into every frame), a free ArcGIS account, no revenue, and no use for the benefit of a business or government agency. That fits a personal hobby project. For anything else, switch providers with `imagery` and `attribution`, and set both: with `imagery` alone, Esri's credit line stays in the frames. Never commit an API key: this repository is public.

Where tiles can't be loaded, the ground shows a grey grid instead, and the status page counts the failures. A failed tile is not retried while it stays cached, and the coarsest tiles always stay: reload the page once the network is back.

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
- **A visible tab must stay visible.** Browsers slow down hidden tabs, which freezes the video. Headless holds 30 fps.
- **Headless costs about 55% of one core and 500 MB,** measured on an Intel Mac whose GPU (UHD 630) ran the WebGL.
- **The frame rate follows the display.** Frames are drawn on the browser's animation frames, so a rate that doesn't divide the display's refresh rate comes out lower: `fps=25` on a 60 Hz display gives 20.
- **One camera-sim page at a time.** A page publishes every vehicle it hears from. MediaMTX lets a new publisher take over a stream path, and a page that loses its path reconnects, so two pages hearing the same vehicle take `drone-<sysid>` from each other in turn.

## Layout

| Path                          | What it does                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------- |
| `run.sh`                      | Runs the dev server and a headless Chrome (`pnpm --filter camera-sim start`) |
| `src/main.ts`                 | Wires everything together, draws the status page, logs its state             |
| `src/config.ts`               | Defaults and URL overrides                                                   |
| `src/status-text.ts`          | The status page's terrain, imagery, ground-check and WHIP lines              |
| `src/geo/`                    | Lat/lon ↔ metres (ArduPilot's convention), imagery tile arithmetic           |
| `src/terrain/`                | SITL's terrain files: reading them, SITL's ground, serving, loading          |
| `src/telemetry/`              | mavlink2rest socket, GLOBAL_POSITION_INT and HEARTBEAT parsing               |
| `src/vehicles/`               | One track per system ID; pose prediction; the ground check                   |
| `src/camera/gimbal-camera.ts` | Where the camera is and which way it points                                  |
| `src/world/`                  | The scene: imagery detail levels, terrain-shaped tiles, markers, sky         |
| `src/output/`                 | Per-vehicle rendering, burned-in overlay, WHIP publishing                    |
