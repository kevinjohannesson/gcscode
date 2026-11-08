import {
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RingGeometry,
  type BufferGeometry,
} from 'three';

import type { GeoPoint, LocalFrame } from '../geo/local-frame';
import type { GroundModel } from '../terrain/sitl-ground';

/** Home first, then the others; colours are easy to tell apart on imagery. */
export const MARKER_COLOURS = [0xff00ff, 0x00e5ff, 0xffd400, 0xff5a00] as const;

export const MARKER_RING_OUTER_M = 10;
export const MARKER_RING_INNER_M = 8;
export const MARKER_ARM_LENGTH_M = 24;
export const MARKER_ARM_WIDTH_M = 1.5;
/**
 * How far a marker floats above the ground. The ground tiles near a camera
 * follow SITL's terrain to within millimetres; this keeps the marker clear of
 * that and of depth-buffer rounding, and is invisible from flying height.
 */
export const MARKER_LIFT_M = 0.15;

/**
 * Lays a flat shape (in the x/z plane, centred on the origin) over the
 * ground: each vertex moves to `centre` and takes SITL's ground height there,
 * plus the lift. Finely divided shapes follow slopes without cutting into them.
 */
export function drapeOntoGround(
  geometry: BufferGeometry,
  frame: LocalFrame,
  ground: GroundModel,
  centre: { east: number; north: number },
): BufferGeometry {
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const east = centre.east + position.getX(i);
    const north = centre.north - position.getZ(i);
    const height = ground.heightAt(frame.toGeo({ east, north })) + MARKER_LIFT_M;
    position.setXYZ(i, east, height, -north);
  }
  position.needsUpdate = true;
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * A ground target: a ring with a cross through its centre, draped over the
 * terrain. Fly over one with the camera pointing straight down and the cross
 * should sit in the middle of the frame when the GCS map shows the drone on
 * top of it.
 */
export function createMarker(
  frame: LocalFrame,
  ground: GroundModel,
  point: GeoPoint,
  colour: number,
): Group {
  const material = new MeshBasicMaterial({
    color: colour,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  const marker = new Group();
  marker.name = `marker ${point.lat.toFixed(6)},${point.lon.toFixed(6)}`;
  const centre = frame.toLocal(point);

  // Divided finely enough (≤ 1 m) that each piece follows the slope under it.
  const shapes = [
    new RingGeometry(MARKER_RING_INNER_M, MARKER_RING_OUTER_M, 96, 2),
    new PlaneGeometry(MARKER_ARM_WIDTH_M, MARKER_ARM_LENGTH_M, 1, MARKER_ARM_LENGTH_M),
    new PlaneGeometry(MARKER_ARM_LENGTH_M, MARKER_ARM_WIDTH_M, MARKER_ARM_LENGTH_M, 1),
  ];
  for (const shape of shapes) {
    shape.rotateX(-Math.PI / 2); // lay flat, facing up
    marker.add(new Mesh(drapeOntoGround(shape, frame, ground, centre), material));
  }
  return marker;
}

export function createMarkers(
  frame: LocalFrame,
  ground: GroundModel,
  points: readonly GeoPoint[],
): Group {
  const group = new Group();
  group.name = 'markers';
  points.forEach((point, i) => {
    group.add(createMarker(frame, ground, point, MARKER_COLOURS[i % MARKER_COLOURS.length]!));
  });
  return group;
}
