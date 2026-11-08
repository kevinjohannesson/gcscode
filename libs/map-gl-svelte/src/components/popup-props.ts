import type { Snippet } from 'svelte';
import type { PopupEvent } from '../types/events';
import type { PopupOptions } from '../types/lib';
import type { CSSProperties } from '../utils/apply-style';

// In a `.ts` file rather than `popup.svelte`, so `tsc` can see it.

export type PopupProps = PopupOptions & {
  /** Longitude of the anchor location */
  longitude: number;
  /** Latitude of the anchor location */
  latitude: number;

  /** CSS style override, applied to the popup's element one property at a time */
  style?: CSSProperties;

  onOpen?: (e: PopupEvent) => void;
  onClose?: (e: PopupEvent) => void;
  /** Rendered as the popup's content */
  children?: Snippet;
};
