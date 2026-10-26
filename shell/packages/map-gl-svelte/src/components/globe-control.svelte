<script lang="ts">
  import { untrack } from 'svelte';
  import { applyStyle } from '../utils/apply-style';
  import type { GlobeControlProps } from './control-props';
  import { useControl } from './use-control';

  let props: GlobeControlProps = $props();

  // Created once, from the props as they are now.
  const ctrl = useControl(
    ({ mapLib }) => {
      // Older MapLibre versions have no globe control.
      const GlobeControl = mapLib.GlobeControl;
      if (!GlobeControl) {
        throw new Error('GlobeControl is not supported by this version of MapLibre GL JS');
      }
      return new GlobeControl({ ...props });
    },
    { position: untrack(() => props.position) },
  );

  // After `useControl`'s `onMount` has added the control, which is when its container exists.
  $effect(() => {
    const style = props.style;
    untrack(() => applyStyle(ctrl._container, style));
  });
</script>
