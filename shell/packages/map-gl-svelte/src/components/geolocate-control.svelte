<script lang="ts">
  import { untrack } from 'svelte';
  import type { GeolocateErrorEvent, GeolocateEvent, GeolocateResultEvent } from '../types/events';
  import type { GeolocateControlInstance } from '../types/lib';
  import { applyStyle } from '../utils/apply-style';
  import type { GeolocateControlProps } from './control-props';
  import { useControl } from './use-control';

  let props: GeolocateControlProps = $props();

  // Created once, from the props as they are now. A copy: MapLibre may keep what it is given.
  const ctrl = useControl(
    ({ mapLib }) => {
      const gc = new mapLib.GeolocateControl({ ...props });

      // Each listener reads the callback when the event fires, so a changed one is called.
      gc.on('geolocate', (e) => {
        props.onGeolocate?.(e as GeolocateResultEvent);
      });
      gc.on('error', (e) => {
        props.onError?.(e as GeolocateErrorEvent);
      });
      gc.on('outofmaxbounds', (e) => {
        props.onOutOfMaxBounds?.(e as GeolocateResultEvent);
      });
      gc.on('trackuserlocationstart', (e) => {
        props.onTrackUserLocationStart?.(e as GeolocateEvent);
      });
      gc.on('trackuserlocationend', (e) => {
        props.onTrackUserLocationEnd?.(e as GeolocateEvent);
      });

      return gc;
    },
    { position: untrack(() => props.position) },
  );

  /** The MapLibre control, as upstream's ref holds it. */
  export function getControl(): GeolocateControlInstance {
    return ctrl;
  }

  // After `useControl`'s `onMount` has added the control, which is when its container exists.
  $effect(() => {
    const style = props.style;
    untrack(() => applyStyle(ctrl._container, style));
  });
</script>
