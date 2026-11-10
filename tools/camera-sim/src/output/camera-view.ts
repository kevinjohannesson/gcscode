import { WebGLRenderer, type PerspectiveCamera } from 'three';

import { applyGimbalPose, createGimbalCamera } from '../camera/gimbal-camera';
import type { VehicleTrack } from '../vehicles/vehicle-track';
import type { SimWorld } from '../world/sim-world';
import { FrameCompositor } from './frame-overlay';

export interface CameraViewSettings {
  readonly hfovDeg: number;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly pitchDeg: number;
}

/** Frames come from requestAnimationFrame; allow this much early so 30 fps isn't 20. */
const FRAME_TOLERANCE_MS = 2;

/**
 * One vehicle's camera: renders the shared world from the vehicle's pose at
 * the configured frame rate, burns in the overlay, and exposes the result as
 * a canvas to show and a MediaStream to publish.
 *
 * Each view owns its own WebGL renderer, so textures upload once per vehicle.
 * Fine for a handful of drones; a shared renderer is the fix if that ever hurts.
 */
export class CameraView {
  public readonly track: VehicleTrack;
  private readonly _world: SimWorld;
  private readonly _settings: CameraViewSettings;
  private readonly _renderer: WebGLRenderer;
  private readonly _camera: PerspectiveCamera;
  private readonly _compositor: FrameCompositor;
  private _frameNumber = 0;
  private _lastRenderMs = Number.NEGATIVE_INFINITY;
  private _stream: MediaStream | undefined;

  public constructor(
    track: VehicleTrack,
    world: SimWorld,
    settings: CameraViewSettings,
    attribution: string,
  ) {
    this.track = track;
    this._world = world;
    this._settings = settings;
    this._renderer = new WebGLRenderer({ antialias: true });
    this._renderer.setPixelRatio(1);
    this._renderer.setSize(settings.width, settings.height, false);
    this._camera = createGimbalCamera(settings);
    this._compositor = new FrameCompositor(settings.width, settings.height, attribution);
  }

  /** The finished frames, overlay included. */
  public get canvas(): HTMLCanvasElement {
    return this._compositor.canvas;
  }

  public get frameNumber(): number {
    return this._frameNumber;
  }

  public captureStream(): MediaStream {
    if (this._stream === undefined) {
      this._stream = this._compositor.canvas.captureStream(this._settings.fps);
      // A real camera keeps its resolution and lets quality vary. 'detail'
      // tells the WebRTC encoder to do the same instead of scaling down while
      // its bandwidth estimate ramps up; RTSP readers dislike mid-stream size changes.
      for (const track of this._stream.getVideoTracks()) track.contentHint = 'detail';
    }
    return this._stream;
  }

  /** Renders a frame if one is due. Returns whether it did. */
  public renderIfDue(nowMs: number, utc: Date): boolean {
    if (nowMs - this._lastRenderMs < 1000 / this._settings.fps - FRAME_TOLERANCE_MS) return false;
    this._lastRenderMs = nowMs;
    const pose = this.track.predict(nowMs);
    if (pose !== undefined) applyGimbalPose(this._camera, pose, this._settings.pitchDeg);
    const aglM =
      pose === undefined
        ? undefined
        : pose.up - this._world.groundHeightLocal(pose.east, pose.north);
    this._renderer.render(this._world.scene, this._camera);
    // Copy straight after rendering, in the same task, so the WebGL buffer is still intact.
    this._compositor.compose(this._renderer.domElement, {
      systemId: this.track.systemId,
      utc,
      frameNumber: this._frameNumber,
      pose,
      aglM,
      pitchDeg: this._settings.pitchDeg,
    });
    this._frameNumber++;
    return true;
  }

  public dispose(): void {
    this._stream?.getTracks().forEach((t) => t.stop());
    this._renderer.dispose();
  }
}
