<script lang="ts">
  import { untrack } from 'svelte';
  import { applyStyle } from '../utils/apply-style';
  import type { LogoControlProps } from './control-props';
  import { useControl } from './use-control';

  let props: LogoControlProps = $props();

  // Created once, from the props as they are now. A copy: MapLibre may keep what it is given.
  const ctrl = useControl(({ mapLib }) => new mapLib.LogoControl({ ...props }), {
    position: untrack(() => props.position),
  });

  // After `useControl`'s `onMount` has added the control, which is when its container exists.
  $effect(() => {
    const style = props.style;
    untrack(() => applyStyle(ctrl._container, style));
  });
</script>
