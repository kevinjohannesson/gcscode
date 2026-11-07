import { mavlinkSubscriptionUrl, readConfig, streamName } from './config';
import { LocalFrame } from './geo/local-frame';
import { CameraView } from './output/camera-view';
import { WhipPublisher } from './output/whip-publisher';
import { MavlinkSocket } from './telemetry/mavlink-socket';
import { VehicleRegistry } from './vehicles/vehicle-registry';
import type { VehicleTrack } from './vehicles/vehicle-track';
import { SimWorld } from './world/sim-world';

interface VehicleOutput {
  readonly view: CameraView;
  readonly publisher: WhipPublisher;
  readonly caption: HTMLElement;
  readonly whipUrl: string;
  readonly rtspUrl: string;
}

const config = readConfig(window.location.search);
const frame = new LocalFrame(config.origin);
const world = new SimWorld(frame, config);
const outputs = new Map<number, VehicleOutput>();

const statusEl = document.querySelector<HTMLElement>('#status')!;
const vehiclesEl = document.querySelector<HTMLElement>('#vehicles')!;
const warningsEl = document.querySelector<HTMLElement>('#warnings')!;
warningsEl.textContent = config.warnings.join('\n');
warningsEl.hidden = config.warnings.length === 0;

function addVehicle(track: VehicleTrack): void {
  const view = new CameraView(track, world, config.camera, config.imagery.attribution);
  const name = streamName(track.systemId);
  const whipUrl = `${config.mediaUrl}/${name}/whip`;
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

const registry = new VehicleRegistry(frame, addVehicle);
const socket = new MavlinkSocket({
  url: mavlinkSubscriptionUrl(config.mavlinkUrl),
  onMessage: (json, receivedAtMs) => registry.applyMessage(json, receivedAtMs),
});
socket.start();

function renderLoop(): void {
  const now = performance.now();
  const utc = new Date();
  for (const output of outputs.values()) output.view.renderIfDue(now, utc);
  requestAnimationFrame(renderLoop);
}
requestAnimationFrame(renderLoop);

function updateStatus(): void {
  const ground = world.ground.status;
  statusEl.textContent = [
    `Telemetry  ${socket.state}  ${config.mavlinkUrl}`,
    `Imagery    ${ground.loaded}/${ground.total} tiles` +
      (ground.failed > 0 ? `, ${ground.failed} failed (grid shown)` : ''),
    `Vehicles   ${outputs.size === 0 ? 'none yet: waiting for GLOBAL_POSITION_INT' : outputs.size}`,
  ].join('\n');

  const now = performance.now();
  for (const output of outputs.values()) {
    const pose = output.view.track.predict(now);
    const age = pose === undefined ? '-' : `${(pose.ageMs / 1000).toFixed(1)} s`;
    const error = output.publisher.lastError;
    output.caption.textContent = [
      `${streamName(output.view.track.systemId)}  position age ${age}  frame ${output.view.frameNumber}`,
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
