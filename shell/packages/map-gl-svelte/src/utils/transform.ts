import type { LngLat, ViewState } from '../types/common';
import type { TransformLike } from '../types/internal';
import type { MapInstance } from '../types/lib';
import { deepEqual } from './deep-equal';

/**
 * Camera props, as the map component receives them: each field of `ViewState`, or all of them
 * together in `viewState`. A field counts as controlled when its value is not `undefined`.
 */
export type CameraProps = Partial<ViewState> & { viewState?: Partial<ViewState> };

/** A `{ min, max }` pair of a map constraint such as zoom or pitch limits. */
export type ConstraintRange = { min: number; max: number };

/**
 * maplibre-gl v6 removed the public `map.transform` property in favor of
 * discrete getters. Reconstruct a TransformLike snapshot from those getters
 * so it works across maplibre-gl v5/v6.
 */
export function getTransformLike(map: MapInstance): TransformLike {
  return {
    center: map.getCenter(),
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    pitch: map.getPitch(),
    elevation: map.getCenterElevation(),
    padding: map.getPadding(),
  };
}

/**
 * Capture a transform's current state
 * @param transform
 * @returns descriptor of the view state
 */
export function transformToViewState(tr: TransformLike): ViewState {
  return {
    longitude: tr.center.lng,
    latitude: tr.center.lat,
    zoom: tr.zoom,
    pitch: tr.pitch,
    bearing: tr.bearing,
    // Optional on TransformLike because MapLibre's camera-update hook omits it;
    // getTransformLike always supplies it.
    padding: tr.padding as ViewState['padding'],
  };
}

/**
 * Applies requested view state to a transform
 * @returns an object containing detected changes
 */
export function applyViewStateToTransform(
  /** An object that describes Maplibre's camera state */
  tr: TransformLike,
  /** Props from Map component */
  props: CameraProps,
): Partial<TransformLike> {
  const v: Partial<ViewState> = props.viewState || props;
  const changes: Partial<TransformLike> = {};

  if (
    v.longitude !== undefined &&
    v.latitude !== undefined &&
    (v.longitude !== tr.center.lng || v.latitude !== tr.center.lat)
  ) {
    // We should not import the LngLat class from maplibre-gl because we don't know the source of mapLib
    const LngLatClass = tr.center.constructor as new (lng: number, lat: number) => LngLat;
    changes.center = new LngLatClass(v.longitude, v.latitude);
  }
  if (v.zoom !== undefined && v.zoom !== tr.zoom) {
    changes.zoom = v.zoom;
  }
  if (v.bearing !== undefined && v.bearing !== tr.bearing) {
    changes.bearing = v.bearing;
  }
  if (v.pitch !== undefined && v.pitch !== tr.pitch) {
    changes.pitch = v.pitch;
  }
  if (v.padding && tr.padding && !deepEqual(v.padding, tr.padding)) {
    changes.padding = v.padding;
  }
  return changes;
}

/**
 * Update a min/max constraint pair in the right order to avoid
 * temporarily setting min > max (which maplibre rejects).
 * @param nextRange - the desired constraint range
 * @param currentRange - the current constraint range
 * @param setMin - setter for the minimum value
 * @param setMax - setter for the maximum value
 */
function updateConstraint(
  nextRange: ConstraintRange,
  currentRange: ConstraintRange,
  setMin: (v: number) => void,
  setMax: (v: number) => void,
): boolean {
  if (nextRange.min === currentRange.min && nextRange.max === currentRange.max) {
    return false;
  }

  // When moving up (min increasing), update max first to make room
  if (nextRange.min >= currentRange.min) {
    if (nextRange.max !== currentRange.max) {
      setMax(nextRange.max);
    }
    if (nextRange.min !== currentRange.min) {
      setMin(nextRange.min);
    }
  } else {
    // When moving down (min decreasing), update min first to make room
    if (nextRange.min !== currentRange.min) {
      setMin(nextRange.min);
    }
    if (nextRange.max !== currentRange.max) {
      setMax(nextRange.max);
    }
  }

  return true;
}

export function updateZoomConstraint(
  map: MapInstance,
  nextRange: ConstraintRange,
  currentRange: ConstraintRange,
): boolean {
  return updateConstraint(
    nextRange,
    currentRange,
    (v) => map.setMinZoom(v),
    (v) => map.setMaxZoom(v),
  );
}

export function updatePitchConstraint(
  map: MapInstance,
  nextRange: ConstraintRange,
  currentRange: ConstraintRange,
): boolean {
  return updateConstraint(
    nextRange,
    currentRange,
    (v) => map.setMinPitch(v),
    (v) => map.setMaxPitch(v),
  );
}
