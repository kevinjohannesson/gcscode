# camera-sim

A fake camera payload for gcscode. It renders what each SITL vehicle's camera would see and streams that view the way a real camera does, so the GCS has a video source to build and test against.

SITL is a fake autopilot; camera-sim is a fake camera. The GCS should not be able to tell either from the real thing, so camera-sim speaks only the protocols real hardware uses: MAVLink in (through mavlink2rest), H.264 video out (through a MediaMTX media server). It is part of the gcscode [Ecosystem](../../docs/roadmap.md#ecosystem): the GCS never imports it, and it runs outside the spec/ADR review loop.

**Guiding principle: SITL owns the truth, camera-sim renders it.** Positions use ArduPilot's own lat/lon-to-metres convention, the ground is where SITL thinks it is, and nothing appears in the video that the autopilot doesn't also believe.

## Status: spike

- Flat ground at home altitude with satellite imagery, matching SITL run with `SIM_TERRAIN 0`.
- One camera per vehicle (keyed by MAVLink system ID), stabilized at a fixed pitch, turning with the vehicle's heading.
- Burned into every frame: system ID, UTC time, frame number, the pose rendered, and the imagery attribution. A banner appears when telemetry goes stale.
- Each vehicle publishes H.264 over WebRTC (WHIP) to MediaMTX as `drone-<sysid>`, readable as RTSP.
- Three ground markers to check the video against the GCS map.

Next: elevation from SITL's own terrain files (v0), then link-quality impairments, gimbal and zoom through SITL's simulated gimbals, scenarios, thermal and night modes, per-frame KLV metadata. See the roadmap entry.

## Running it (all on one machine)

1. **SITL.** Flatten SITL's world for the spike, and raise the telemetry rate from MAVProxy's default 4 Hz so the video moves smoothly:

   ```sh
   ./run_sitl.sh --streamrate 25
   # then, at the MAVProxy prompt:
   param set SIM_TERRAIN 0
   ```

2. **MediaMTX.** Download the binary for your platform from the [MediaMTX releases](https://github.com/bluenviron/mediamtx/releases) and run `./mediamtx`. The defaults are what camera-sim expects: WebRTC (WHIP) on 8889, RTSP on 8554, any stream path allowed.

3. **camera-sim.** From the repo root:

   ```sh
   pnpm install
   pnpm --filter camera-sim dev
   ```

   Open <http://localhost:5174>. Keep the window visible: browsers slow down hidden tabs, which freezes the video.

4. **Fly** (MAVProxy): `mode guided`, `arm throttle`, `takeoff 50`. A view appears as soon as the vehicle reports its position.

5. **Watch the stream** like any camera: `vlc rtsp://localhost:8554/drone-1`.

### The marker check

With the default settings the camera points straight down, and three markers are drawn on the ground:

| Marker  | Where               | Lat, lon (default origin) |
| ------- | ------------------- | ------------------------- |
| Magenta | Home (the origin)   | -35.363262, 149.165237    |
| Cyan    | 100 m north of home | -35.36236368, 149.165237  |
| Yellow  | 100 m east of home  | -35.363262, 149.16633856  |

Fly over each (`guided -35.36236368 149.165237 50`) and the marker should sit in the middle of the frame at the moment the GCS map shows the drone on top of it.

## Settings

Everything is set from the page URL, so pointing the sim somewhere else is a link, not a rebuild. Bad values are ignored with a warning on the page.

| Parameter                | Default                             | Meaning                                                     |
| ------------------------ | ----------------------------------- | ----------------------------------------------------------- |
| `mavlink`                | `ws://localhost:8088/v1/ws/mavlink` | mavlink2rest WebSocket                                      |
| `media`                  | `http://localhost:8889`             | MediaMTX WebRTC base; streams go to `<media>/<stream>/whip` |
| `rtsp`                   | same host as `media`, port 8554     | Only used to show where to point VLC                        |
| `origin`                 | `-35.363262,149.165237` (CMAC)      | Centre of the rendered world, `lat,lon`                     |
| `markers`                | home, 100 m N, 100 m E              | `lat,lon;lat,lon;…`                                         |
| `pitch`                  | `-90`                               | Gimbal pitch in degrees, -90 is straight down               |
| `hfov`                   | `70`                                | Horizontal field of view, degrees                           |
| `width`, `height`, `fps` | `1280`, `720`, `30`                 | Output video                                                |
| `zoom`                   | `18`                                | Imagery tile zoom level                                     |
| `extent`                 | `2000`                              | Side of the imagery square around the origin, metres        |
| `imagery`, `attribution` | Esri World Imagery                  | XYZ template with `{z}`, `{x}`, `{y}`, and its credit line  |

Example: `http://localhost:5174/?pitch=-45&hfov=90`.

### Imagery terms

The default imagery is Esri World Imagery. Esri allows free use only with attribution (camera-sim burns it into every frame), a free ArcGIS account, no revenue, and no use for the benefit of a business or government agency. That fits a personal hobby project. For anything else, switch providers with `imagery` and `attribution`. Never commit an API key: this repository is public.

When tiles can't be loaded, the ground shows a grey grid instead, and the page says how many tiles failed.

## Running it across machines

The sim can run on a stronger machine than SITL and the GCS:

1. In `run_sitl.sh`, bind mavlink2rest to all interfaces: `--server "0.0.0.0:8088"` (it is `127.0.0.1` today).
2. Serve camera-sim to the LAN: `pnpm --filter camera-sim dev --host`.
3. On the other machine, open `http://<mac-ip>:5174/?mavlink=ws://<mac-ip>:8088/v1/ws/mavlink&media=http://<sim-machine-ip>:8889`, with MediaMTX running on that machine.
4. On Windows, allow MediaMTX through the firewall: TCP 8554 and 8889, UDP 8189.

## Known limits

- The world is flat. With `SIM_TERRAIN 1`, SITL's ground follows terrain and will drift from the video.
- Imagery is one zoom level over a fixed square; no detail that follows the camera yet.
- Each vehicle has its own WebGL renderer, so imagery uploads once per vehicle. Fine for a handful of drones.
- The browser's WebRTC encoder sets the bitrate; resolution is held constant.

## Layout

| Path                            | What it does                                              |
| ------------------------------- | --------------------------------------------------------- |
| `src/main.ts`                   | Wires everything together and draws the status page       |
| `src/config.ts`                 | Defaults and URL overrides                                |
| `src/geo/local-frame.ts`        | Lat/lon ↔ metres, ArduPilot's convention                  |
| `src/geo/web-mercator-tiles.ts` | Which imagery tiles cover an area                         |
| `src/telemetry/`                | mavlink2rest socket and GLOBAL_POSITION_INT parsing       |
| `src/vehicles/`                 | One track per system ID; pose prediction between samples  |
| `src/camera/gimbal-camera.ts`   | Where the camera is and which way it points               |
| `src/world/`                    | The scene: imagery tiles, markers, sky                    |
| `src/output/`                   | Per-vehicle rendering, burned-in overlay, WHIP publishing |
