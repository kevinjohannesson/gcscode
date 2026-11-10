import { mavlinkSubscriptionUrl, readConfig, streamName, whipEndpoint } from './config';
import { LocalFrame } from './geo/local-frame';
import { CameraView } from './output/camera-view';
import { WhipPublisher } from './output/whip-publisher';
import { describeGroundCheck, describeImagery, describeTerrain } from './status-text';
import { MavlinkSocket } from './telemetry/mavlink-socket';
import { FLAT_GROUND, SitlGround, type GroundModel } from './terrain/sitl-ground';
import { loadTerrain } from './terrain/terrain-loader';
import { VehicleRegistry } from './vehicles/vehicle-registry';
import type { VehicleTrack } from './vehicles/vehicle-track';
import { groundBounds } from './world/ground-tiles';
import { SimWorld } from './world/sim-world';
import type { Viewpoint } from './world/tile-lod';

interface VehicleOutput {
  readonly view: CameraView;
  readonly publisher: WhipPublisher;
  readonly caption: HTMLElement;
  readonly whipUrl: string;
  readonly rtspUrl: string;
}

/** Re-pick imagery detail this often; the cameras move a few metres in between. */
const IMAGERY_UPDATE_MS = 250;

async function start(): Promise<void> {
  const config = readConfig(window.location.search);
  const frame = new LocalFrame(config.origin);

  const statusEl = document.querySelector<HTMLElement>('#status')!;
  const vehiclesEl = document.querySelector<HTMLElement>('#vehicles')!;
  const warningsEl = document.querySelector<HTMLElement>('#warnings')!;
  warningsEl.textContent = config.warnings.join('\n');
  warningsEl.hidden = config.warnings.length === 0;
  statusEl.textContent = 'Loading SITL terrain…';

  // SITL's ground first: everything else is placed on it.
  const terrain = config.terrain
    ? await loadTerrain(config.terrainUrl, groundBounds(frame, config.imagery.extentM))
    : undefined;
  const sitlGround =
    terrain === undefined ? undefined : new SitlGround(terrain.database, config.origin);
  const ground: GroundModel = sitlGround ?? FLAT_GROUND;
  const terrainLine = describeTerrain(config.terrain, terrain, sitlGround?.hasHomeTerrain ?? false);

  const world = new SimWorld(frame, config, ground);
  const outputs = new Map<number, VehicleOutput>();

  function addVehicle(track: VehicleTrack): void {
    const view = new CameraView(track, world, config.camera, config.imagery.attribution);
    const name = streamName(track.systemId);
    const whipUrl = whipEndpoint(config.mediaUrl, track.systemId);
    const rtspUrl = `${config.rtspUrl}/${name}`;
    const publisher = new WhipPublisher({
      endpointUrl: whipUrl,
      tracks: view.captureStream().getVideoTracks(),
    });

    const figure = document.createElement('figure');
    const caption = document.createElement('figcaption');
    figure.append(view.canvas, caption);
    vehiclesEl.append(figure);

    outputs.set(track.systemId, { view, publisher, caption, whipUrl, rtspUrl });
    publisher.start();
  }

  const registry = new VehicleRegistry(frame, config.originAltM, addVehicle);
  const socket = new MavlinkSocket({
    url: mavlinkSubscriptionUrl(config.mavlinkUrl),
    onMessage: (json, receivedAtMs) => registry.applyMessage(json, receivedAtMs),
  });
  socket.start();

  function viewpoints(nowMs: number): Viewpoint[] {
    const points: Viewpoint[] = [];
    for (const track of registry.tracks.values()) {
      const pose = track.predict(nowMs);
      if (pose !== undefined) points.push(pose);
    }
    // Before any vehicle shows up, prepare the ground around home.
    return points.length > 0 ? points : [{ east: 0, north: 0, up: 100 }];
  }

  let lastImageryUpdate = Number.NEGATIVE_INFINITY;
  function renderLoop(): void {
    const now = performance.now();
    if (now - lastImageryUpdate >= IMAGERY_UPDATE_MS) {
      world.update(viewpoints(now), now);
      lastImageryUpdate = now;
    }
    const utc = new Date();
    for (const output of outputs.values()) output.view.renderIfDue(now, utc);
    requestAnimationFrame(renderLoop);
  }
  requestAnimationFrame(renderLoop);

  function updateStatus(): void {
    statusEl.textContent = [
      `Telemetry  ${socket.state}  ${config.mavlinkUrl}`,
      `Terrain    ${terrainLine}`,
      `Imagery    ${describeImagery(world.imagery.status)}`,
      `Vehicles   ${outputs.size === 0 ? 'none yet: waiting for GLOBAL_POSITION_INT' : outputs.size}`,
    ].join('\n');

    const now = performance.now();
    const groundAt = (east: number, north: number) => world.groundHeightLocal(east, north);
    for (const output of outputs.values()) {
      const track = output.view.track;
      const pose = track.predict(now);
      const age = pose === undefined ? '-' : `${(pose.ageMs / 1000).toFixed(1)} s`;
      const error = output.publisher.lastError;
      output.caption.textContent = [
        `${streamName(track.systemId)}  position age ${age}  frame ${output.view.frameNumber}`,
        describeGroundCheck(track.checkGround(groundAt)),
        `WHIP ${output.publisher.state}${error ? ` (${error})` : ''}  ${output.whipUrl}`,
        `Watch: vlc ${output.rtspUrl}`,
      ].join('\n');
    }
  }
  setInterval(updateStatus, 250);
  updateStatus();

  window.addEventListener('beforeunload', () => {
    socket.stop();
    for (const output of outputs.values()) {
      output.publisher.stop();
      output.view.dispose();
    }
  });
}

void start().catch((error: unknown) => {
  const statusEl = document.querySelector<HTMLElement>('#status');
  if (statusEl) statusEl.textContent = `camera-sim failed to start: ${String(error)}`;
  throw error;
});
