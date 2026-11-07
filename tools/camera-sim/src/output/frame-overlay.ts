import type { VehiclePose } from '../vehicles/vehicle-track';

export interface OverlayInfo {
  readonly systemId: number;
  readonly utc: Date;
  readonly frameNumber: number;
  readonly pose: VehiclePose | undefined;
  readonly pitchDeg: number;
}

/**
 * The text burned into the top-left of every frame, like a real camera's OSD:
 * which vehicle, when the frame was rendered, and the pose it was rendered at.
 * The timestamp is what later end-to-end latency measurement reads.
 */
export function overlayLines(info: OverlayInfo): string[] {
  const id = `SYS ${info.systemId}  ${info.utc.toISOString()}  #${String(info.frameNumber).padStart(6, '0')}`;
  if (info.pose === undefined) return [id, 'NO POSITION YET'];
  const heading = String(Math.round(info.pose.headingDeg) % 360).padStart(3, '0');
  const pitch = Math.round(info.pitchDeg);
  return [id, `ALT ${info.pose.up.toFixed(1)} m  HDG ${heading}°  PITCH ${pitch}°`];
}

/** A warning across the frame when the pose is too old to trust. */
export function staleBanner(pose: VehiclePose | undefined): string | undefined {
  if (pose === undefined || !pose.stale) return undefined;
  return `TELEMETRY STALE ${(pose.ageMs / 1000).toFixed(1)} s`;
}

/**
 * Draws a rendered frame plus its overlay onto a 2D canvas. The stream is
 * captured from this canvas, so everything drawn here is in the video.
 */
export class FrameCompositor {
  public readonly canvas: HTMLCanvasElement;
  private readonly _ctx: CanvasRenderingContext2D;
  private readonly _attribution: string;

  public constructor(width: number, height: number, attribution: string) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable.');
    this._ctx = ctx;
    this._attribution = attribution;
  }

  public compose(source: CanvasImageSource, info: OverlayInfo): void {
    const ctx = this._ctx;
    const { width, height } = this.canvas;
    ctx.drawImage(source, 0, 0, width, height);

    const size = Math.max(12, Math.round(height / 30));
    ctx.font = `600 ${size}px ui-monospace, Menlo, Consolas, monospace`;
    ctx.textBaseline = 'top';
    overlayLines(info).forEach((line, i) =>
      this._label(line, size * 0.6, size * 0.6 + i * size * 1.3, size),
    );

    const banner = staleBanner(info.pose);
    if (banner !== undefined) {
      ctx.save();
      ctx.font = `700 ${size * 1.5}px ui-monospace, Menlo, Consolas, monospace`;
      ctx.textAlign = 'center';
      this._label(banner, width / 2, height / 2 - size, size * 1.5, '#ff3b30');
      ctx.restore();
    }

    ctx.save();
    ctx.font = `${Math.max(10, Math.round(size * 0.55))}px system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    const w = ctx.measureText(this._attribution).width;
    ctx.fillRect(width - w - size * 0.8, height - size * 1.1, w + size * 0.8, size * 1.1);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(this._attribution, width - size * 0.4, height - size * 0.25);
    ctx.restore();
  }

  private _label(text: string, x: number, y: number, size: number, colour = '#ffffff'): void {
    const ctx = this._ctx;
    const w = ctx.measureText(text).width;
    const left = ctx.textAlign === 'center' ? x - w / 2 : x;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(left - size * 0.3, y - size * 0.15, w + size * 0.6, size * 1.25);
    ctx.fillStyle = colour;
    ctx.fillText(text, x, y);
  }
}
