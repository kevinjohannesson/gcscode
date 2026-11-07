import { PerspectiveCamera, Vector3 } from 'three';

/**
 * The scene uses three.js's y-up convention with x = east and z = south
 * (so north is -z). A camera at rest looks along -z, i.e. north.
 */
export function toScenePosition(east: number, north: number, up: number): Vector3 {
  return new Vector3(east, up, -north);
}

export interface CameraSettings {
  /** Horizontal field of view, degrees. */
  readonly hfovDeg: number;
  readonly width: number;
  readonly height: number;
}

/** three.js takes a vertical field of view; cameras are specified horizontally. */
export function verticalFovDeg(hfovDeg: number, aspect: number): number {
  const half = (hfovDeg * Math.PI) / 360;
  return (2 * Math.atan(Math.tan(half) / aspect) * 180) / Math.PI;
}

export function createGimbalCamera(settings: CameraSettings): PerspectiveCamera {
  const aspect = settings.width / settings.height;
  return new PerspectiveCamera(verticalFovDeg(settings.hfovDeg, aspect), aspect, 0.5, 20000);
}

export interface GimbalPose {
  readonly east: number;
  readonly north: number;
  readonly up: number;
  /** Degrees clockwise from north. */
  readonly headingDeg: number;
}

/**
 * Points the camera the way a stabilized gimbal at rest does: roll level,
 * a fixed pitch below the horizon (-90 is straight down), and yaw following
 * the vehicle's heading. At -90 the top of the image faces the heading.
 */
export function applyGimbalPose(
  camera: PerspectiveCamera,
  pose: GimbalPose,
  pitchDeg: number,
): void {
  camera.position.copy(toScenePosition(pose.east, pose.north, pose.up));
  // Heading is clockwise from north; a positive rotation about +y is
  // counter-clockwise seen from above, hence the minus.
  camera.rotation.set((pitchDeg * Math.PI) / 180, (-pose.headingDeg * Math.PI) / 180, 0, 'YXZ');
  camera.updateMatrixWorld(true);
}
