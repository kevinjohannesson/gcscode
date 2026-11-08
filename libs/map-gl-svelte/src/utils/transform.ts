import type { LngLat, ViewState } from '../types/common';
import type { TransformLike } from '../types/internal';
import type { MapInstance } from '../types/lib';
import { deepEqual } from './deep-equal';

/**
 * Camera props, as the map component receives them: each field of `ViewState`, or all of them
 * together in `viewState`. A field counts as controlled when its value is not `undefined`.
 */
export type CameraProps = Partial<ViewState> & { viewState?: Partial<ViewState> };

/** One end of a map constraint. `null` or `undefined` resets it to MapLibre's own default. */
export type ConstraintValue = number | null | undefined;

/** A `{ min, max }` pair of a map constraint such as zoom or pitch limits. */
export type ConstraintRange = { min: ConstraintValue; max: ConstraintValue };

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

function isConstraintReset(value: ConstraintValue): value is null | undefined {
  return value === null || value === undefined;
}

function sameConstraintValue(a: ConstraintValue, b: ConstraintValue): boolean {
  return (isConstraintReset(a) && isConstraintReset(b)) || a === b;
}

/**
 * Update a min/max constraint pair in the right order to avoid
 * temporarily setting min > max (which maplibre rejects).
 * A nullish end is passed to MapLibre's setter as is, which resets it to MapLibre's default.
 * @param nextRange - the desired constraint range
 * @param currentRange - the current constraint range
 * @param getCurrentMin - getter for the map's current minimum
 * @param setMin - setter for the minimum value
 * @param setMax - setter for the maximum value
 */
function updateConstraint(
  nextRange: ConstraintRange,
  currentRange: ConstraintRange,
  getCurrentMin: () => number,
  setMin: (v?: number | null) => void,
  setMax: (v?: number | null) => void,
): boolean {
  const minChanged = !sameConstraintValue(nextRange.min, currentRange.min);
  const maxChanged = !sameConstraintValue(nextRange.max, currentRange.max);

  if (!minChanged && !maxChanged) {
    return false;
  }

  // When lowering or resetting min, update it first to make room.
  // Otherwise update max first before raising min.
  if (isConstraintReset(nextRange.min) || nextRange.min < getCurrentMin()) {
    if (minChanged) {
      setMin(nextRange.min);
    }
    if (maxChanged) {
      setMax(nextRange.max);
    }
  } else {
    if (maxChanged) {
      setMax(nextRange.max);
    }
    if (minChanged) {
      setMin(nextRange.min);
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
    () => map.getMinZoom(),
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
    () => map.getMinPitch(),
    (v) => map.setMinPitch(v),
    (v) => map.setMaxPitch(v),
  );
}
