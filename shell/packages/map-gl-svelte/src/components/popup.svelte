<script lang="ts">
  import { getAllContexts, mount, onMount, unmount, untrack } from 'svelte';
  import type { PopupEvent } from '../types/events';
  import type { PopupInstance } from '../types/lib';
  import { applyStyle } from '../utils/apply-style';
  import { compareClassNames } from '../utils/compare-class-names';
  import { deepEqual } from '../utils/deep-equal';
  import { getMapContext } from './map-context';
  import type { PopupProps } from './popup-props';
  import SnippetHost from './snippet-host.svelte';

  let props: PopupProps = $props();

  const { map: mapRef, mapLib } = getMapContext();
  const map = mapRef.getMap();
  // Taken now, for it only works during initialisation. Children are mounted with it, so they
  // see the same contexts as if they were rendered here.
  const context = getAllContexts();

  // The popup's content: MapLibre takes it as the DOM content, the children are mounted in it.
  const container = document.createElement('div');

  // Created once, from the props as they are now (M22).
  const popup: PopupInstance = untrack(() => {
    const pp = new mapLib.Popup({ ...props });
    pp.setLngLat([props.longitude, props.latitude]);
    // Once, as upstream: the first time the popup opens. The callback is read when it fires.
    pp.once('open', (e) => {
      props.onOpen?.(e as unknown as PopupEvent);
    });
    return pp;
  });

  /** The MapLibre popup, as upstream's ref holds it. */
  export function getPopup(): PopupInstance {
    return popup;
  }

  // Before the popup is added, which sizes itself and picks its anchor from the content.
  // The children are a separate root, which this component unmounts.
  $effect(() => {
    const children = props.children;
    if (!children) {
      return;
    }
    const host = untrack(() =>
      mount(SnippetHost, { target: container, props: { snippet: children }, context }),
    );
    return () => {
      void unmount(host);
    };
  });

  onMount(() => {
    const onClose = (e: unknown) => {
      props.onClose?.(e as PopupEvent);
    };
    popup.on('close', onClose);
    popup.setDOMContent(container).addTo(map);

    return () => {
      // https://github.com/visgl/react-map-gl/issues/1825
      // `onClose` is for the popup closing itself. Removing it because this component went
      // away is not that, so the listener goes first.
      popup.off('close', onClose);
      if (popup.isOpen()) {
        popup.remove();
      }
    };
  });

  // What the effects below last applied (upstream's previous props), moved only while the popup
  // is open: an update that arrives while it's closed is compared with the last one applied.
  const applied = untrack(() => ({
    offset: props.offset,
    anchor: props.anchor,
    maxWidth: props.maxWidth,
    className: props.className,
  }));

  // One effect per property, applying only while the popup is open (M22). MapLibre is called
  // untracked: only the props read outside `untrack` are dependencies.
  $effect(() => {
    const { longitude, latitude } = props;
    untrack(() => {
      if (!popup.isOpen()) {
        return;
      }
      const lngLat = popup.getLngLat();
      if (lngLat.lng !== longitude || lngLat.lat !== latitude) {
        popup.setLngLat([longitude, latitude]);
      }
    });
  });

  $effect(() => {
    const offset = props.offset;
    untrack(() => {
      if (!popup.isOpen()) {
        return;
      }
      if (offset && !deepEqual(applied.offset, offset)) {
        popup.setOffset(offset);
      }
      applied.offset = offset;
    });
  });

  // Together: setting the anchor alone doesn't redraw the popup, setting the max width does.
  $effect(() => {
    const { anchor, maxWidth } = props;
    untrack(() => {
      if (!popup.isOpen()) {
        return;
      }
      if (applied.anchor !== anchor || applied.maxWidth !== maxWidth) {
        popup.options.anchor = anchor;
        popup.setMaxWidth(maxWidth as string);
      }
      applied.anchor = anchor;
      applied.maxWidth = maxWidth;
    });
  });

  $effect(() => {
    const className = props.className;
    untrack(() => {
      if (!popup.isOpen()) {
        return;
      }
      for (const name of compareClassNames(applied.className, className) ?? []) {
        popup.toggleClassName(name);
      }
      applied.className = className;
    });
  });

  // After the popup is added, so it has an element and MapLibre's positioning is on it to keep.
  $effect(() => {
    const style = props.style;
    untrack(() => applyStyle(popup.getElement(), style));
  });
</script>
