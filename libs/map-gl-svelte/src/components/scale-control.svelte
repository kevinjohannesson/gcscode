<script lang="ts">
  import { untrack } from 'svelte';
  import { applyStyle } from '../utils/apply-style';
  import type { ScaleControlProps } from './control-props';
  import { useControl } from './use-control';

  let props: ScaleControlProps = $props();

  // Created once, from the props as they are now. A copy: MapLibre may keep what it is given.
  const ctrl = useControl(({ mapLib }) => new mapLib.ScaleControl({ ...props }), {
    position: untrack(() => props.position),
  });

  // The values the control has been given: the ones it was made with, then each change. As
  // upstream, a prop left `undefined` leaves the control's value as it is.
  let appliedMaxWidth = untrack(() => props.maxWidth);
  let appliedUnit = untrack(() => props.unit);

  // MapLibre draws the scale on its next `move`, so a new `maxWidth` shows then. `setUnit` draws.
  $effect(() => {
    const maxWidth = props.maxWidth;
    untrack(() => {
      if (maxWidth !== undefined && maxWidth !== appliedMaxWidth) {
        ctrl.options.maxWidth = maxWidth;
      }
      appliedMaxWidth = maxWidth;
    });
  });

  $effect(() => {
    const unit = props.unit;
    untrack(() => {
      if (unit !== undefined && unit !== appliedUnit) {
        ctrl.setUnit(unit);
      }
      appliedUnit = unit;
    });
  });

  // After `useControl`'s `onMount` has added the control, which is when its container exists.
  $effect(() => {
    const style = props.style;
    untrack(() => applyStyle(ctrl._container, style));
  });
</script>
