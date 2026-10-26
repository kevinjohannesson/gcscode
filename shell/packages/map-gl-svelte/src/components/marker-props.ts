import type { Snippet } from 'svelte';
import type { MarkerDragEvent, MarkerEvent } from '../types/events';
import type { MarkerOptions, PopupInstance } from '../types/lib';
import type { CSSProperties } from '../utils/apply-style';

// In a `.ts` file rather than `marker.svelte`, so `tsc` can see it.

export type MarkerProps = MarkerOptions & {
  /** Longitude of the anchor location */
  longitude: number;
  /** Latitude of the anchor location */
  latitude: number;

  popup?: PopupInstance;

  /** CSS style override, applied to the marker's element one property at a time */
  style?: CSSProperties;
  onClick?: (e: MarkerEvent<MouseEvent>) => void;
  onDragStart?: (e: MarkerDragEvent) => void;
  onDrag?: (e: MarkerDragEvent) => void;
  onDragEnd?: (e: MarkerDragEvent) => void;
  /** Rendered into the marker's element, which then replaces MapLibre's default pin */
  children?: Snippet;
};
