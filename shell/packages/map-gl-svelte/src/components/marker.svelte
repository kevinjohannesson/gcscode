<script lang="ts">
  import { getAllContexts, mount, onMount, unmount, untrack } from 'svelte';
  import type { MarkerDragEvent } from '../types/events';
  import type { MarkerInstance } from '../types/lib';
  import { applyStyle } from '../utils/apply-style';
  import { compareClassNames } from '../utils/compare-class-names';
  import { arePointsEqual } from '../utils/deep-equal';
  import { getMapContext } from './map-context';
  import type { MarkerProps } from './marker-props';
  import SnippetHost from './snippet-host.svelte';

  let props: MarkerProps = $props();

  const { map: mapRef, mapLib } = getMapContext();
  const map = mapRef.getMap();
  // Taken now, for it only works during initialisation. Children are mounted with it, so they
  // see the same contexts as if they were rendered here.
  const context = getAllContexts();

  // Created once, from the props as they are now (M21).
  const marker: MarkerInstance = untrack(() => {
    const options = {
      ...props,
      // Children replace MapLibre's default pin.
      element: props.children ? document.createElement('div') : undefined,
    };
    const mk = new mapLib.Marker(options);
    mk.setLngLat([props.longitude, props.latitude]);

    // Each listener reads the callback when the event fires, so a changed one is called.
    mk.getElement().addEventListener('click', (e: MouseEvent) => {
      props.onClick?.({ type: 'click', target: mk, originalEvent: e });
    });
    mk.on('dragstart', (e) => {
      const evt = e as unknown as MarkerDragEvent;
      evt.lngLat = mk.getLngLat();
      props.onDragStart?.(evt);
    });
    mk.on('drag', (e) => {
      const evt = e as unknown as MarkerDragEvent;
      evt.lngLat = mk.getLngLat();
      props.onDrag?.(evt);
    });
    mk.on('dragend', (e) => {
      const evt = e as unknown as MarkerDragEvent;
      evt.lngLat = mk.getLngLat();
      props.onDragEnd?.(evt);
    });
    return mk;
  });

  /** The MapLibre marker, as upstream's ref holds it. */
  export function getMarker(): MarkerInstance {
    return marker;
  }

  // The children go into the marker's element. A separate root, which this component unmounts.
  $effect(() => {
    const children = props.children;
    if (!children) {
      return;
    }
    const host = untrack(() =>
      mount(SnippetHost, { target: marker.getElement(), props: { snippet: children }, context }),
    );
    return () => {
      void unmount(host);
    };
  });

  onMount(() => {
    marker.addTo(map);
    return () => {
      marker.remove();
    };
  });

  // One effect per property, each comparing with the marker's own value, as upstream does.
  // MapLibre is called untracked: only the props read outside `untrack` are dependencies.
  $effect(() => {
    const { longitude, latitude } = props;
    untrack(() => {
      const lngLat = marker.getLngLat();
      if (lngLat.lng !== longitude || lngLat.lat !== latitude) {
        marker.setLngLat([longitude, latitude]);
      }
    });
  });

  $effect(() => {
    const offset = props.offset;
    untrack(() => {
      if (offset && !arePointsEqual(marker.getOffset(), offset)) {
        marker.setOffset(offset);
      }
    });
  });

  $effect(() => {
    const draggable = props.draggable ?? false;
    untrack(() => {
      if (marker.isDraggable() !== draggable) {
        marker.setDraggable(draggable);
      }
    });
  });

  $effect(() => {
    const rotation = props.rotation ?? 0;
    untrack(() => {
      if (marker.getRotation() !== rotation) {
        marker.setRotation(rotation);
      }
    });
  });

  // Before the pitch alignment, as upstream: `'auto'` pitch follows the rotation alignment.
  $effect(() => {
    const rotationAlignment = props.rotationAlignment ?? 'auto';
    untrack(() => {
      if (marker.getRotationAlignment() !== rotationAlignment) {
        marker.setRotationAlignment(rotationAlignment);
      }
    });
  });

  $effect(() => {
    const pitchAlignment = props.pitchAlignment ?? 'auto';
    untrack(() => {
      if (marker.getPitchAlignment() !== pitchAlignment) {
        marker.setPitchAlignment(pitchAlignment);
      }
    });
  });

  $effect(() => {
    const popup = props.popup ?? null;
    untrack(() => {
      if (marker.getPopup() !== popup) {
        marker.setPopup(popup);
      }
    });
  });

  // The class names the marker has been given: the ones it was made with, then each change.
  let appliedClassName = untrack(() => props.className);
  $effect(() => {
    const className = props.className;
    untrack(() => {
      for (const name of compareClassNames(appliedClassName, className) ?? []) {
        marker.toggleClassName(name);
      }
      appliedClassName = className;
    });
  });

  // After the marker is added, so MapLibre's positioning is on the element to keep.
  $effect(() => {
    const style = props.style;
    untrack(() => applyStyle(marker.getElement(), style));
  });
</script>
