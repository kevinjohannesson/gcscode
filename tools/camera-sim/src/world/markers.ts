import { DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, RingGeometry } from 'three';

import type { GeoPoint, LocalFrame } from '../geo/local-frame';
import { toScenePosition } from '../camera/gimbal-camera';

/** Home first, then the others; colours are easy to tell apart on imagery. */
export const MARKER_COLOURS = [0xff00ff, 0x00e5ff, 0xffd400, 0xff5a00] as const;

export const MARKER_RING_OUTER_M = 10;
export const MARKER_RING_INNER_M = 8;
export const MARKER_ARM_LENGTH_M = 24;
export const MARKER_ARM_WIDTH_M = 1.5;

/**
 * A ground target: a ring with a cross through its centre, laid flat. Fly
 * over one with the camera pointing straight down and the cross should sit
 * in the middle of the frame when the GCS map shows the drone on top of it.
 */
export function createMarker(frame: LocalFrame, point: GeoPoint, colour: number): Group {
  const material = new MeshBasicMaterial({
    color: colour,
    side: DoubleSide,
    // Drawn just above the ground; the offset keeps it from flickering into it.
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  const marker = new Group();
  marker.name = `marker ${point.lat.toFixed(6)},${point.lon.toFixed(6)}`;

  const ring = new Mesh(new RingGeometry(MARKER_RING_INNER_M, MARKER_RING_OUTER_M, 64), material);
  const armNorthSouth = new Mesh(
    new PlaneGeometry(MARKER_ARM_WIDTH_M, MARKER_ARM_LENGTH_M),
    material,
  );
  const armEastWest = new Mesh(
    new PlaneGeometry(MARKER_ARM_LENGTH_M, MARKER_ARM_WIDTH_M),
    material,
  );
  for (const part of [ring, armNorthSouth, armEastWest]) {
    part.rotation.x = -Math.PI / 2; // lay flat, facing up
    marker.add(part);
  }

  const local = frame.toLocal(point);
  marker.position.copy(toScenePosition(local.east, local.north, 0.05));
  return marker;
}

export function createMarkers(frame: LocalFrame, points: readonly GeoPoint[]): Group {
  const group = new Group();
  group.name = 'markers';
  points.forEach((point, i) => {
    group.add(createMarker(frame, point, MARKER_COLOURS[i % MARKER_COLOURS.length]!));
  });
  return group;
}
