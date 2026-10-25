<script lang="ts">
  import { untrack } from 'svelte';
  import { applyStyle } from '../utils/apply-style';
  import type { FullscreenControlProps } from './control-props';
  import { useControl } from './use-control';

  let props: FullscreenControlProps = $props();

  // Created once, from the props as they are now. `containerId` is looked up in the document.
  // Upstream passes MapLibre nothing but `container`, so its typed `pseudo` option does nothing
  // there; here the options are passed on as well.
  const ctrl = useControl(
    ({ mapLib }) =>
      new mapLib.FullscreenControl({
        ...props,
        container: (props.containerId && document.getElementById(props.containerId)) || undefined,
      }),
    { position: untrack(() => props.position) },
  );

  // After `useControl`'s `onMount` has added the control, which is when its container exists.
  // Fullscreen's `_container` is the element it makes fullscreen, so this is another one.
  $effect(() => {
    const style = props.style;
    untrack(() => applyStyle(ctrl._controlContainer, style));
  });
</script>
