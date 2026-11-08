import { onMount, untrack } from 'svelte';
import type { ControlPosition, IControl } from '../types/lib';
import { getMapContext, type MapContextValue } from './map-context';

type ControlOptions = {
  position?: ControlPosition;
};

// Call during a component's initialisation: it reads the map from the context and registers the
// control with `onMount`. Not a rune module (a plain `.ts` file), for it needs no runes.

export function useControl<T extends IControl>(
  onCreate: (context: MapContextValue) => T,
  opts?: ControlOptions,
): T;

export function useControl<T extends IControl>(
  onCreate: (context: MapContextValue) => T,
  onRemove: (context: MapContextValue) => void,
  opts?: ControlOptions,
): T;

export function useControl<T extends IControl>(
  onCreate: (context: MapContextValue) => T,
  onAdd: (context: MapContextValue) => void,
  onRemove: (context: MapContextValue) => void,
  opts?: ControlOptions,
): T;

export function useControl<T extends IControl>(
  onCreate: (context: MapContextValue) => T,
  arg1?: ((context: MapContextValue) => void) | ControlOptions,
  arg2?: ((context: MapContextValue) => void) | ControlOptions,
  arg3?: ControlOptions,
): T {
  const context = getMapContext();
  // Created once, whatever it reads. Untracked: the component may be rendered inside an effect.
  const ctrl = untrack(() => onCreate(context));

  onMount(() => {
    const opts = (arg3 || arg2 || arg1) as ControlOptions | undefined;
    const onAdd = typeof arg1 === 'function' && typeof arg2 === 'function' ? arg1 : null;
    const onRemove = typeof arg2 === 'function' ? arg2 : typeof arg1 === 'function' ? arg1 : null;

    const { map } = context;
    if (!map.hasControl(ctrl)) {
      map.addControl(ctrl, opts?.position);
      if (onAdd) {
        onAdd(context);
      }
    }

    return () => {
      if (onRemove) {
        onRemove(context);
      }
      // The map may be gone already, or the control taken off it. Svelte tears the children
      // down before the map, unlike React, but the guard is cheap and upstream has it.
      if (map.hasControl(ctrl)) {
        map.removeControl(ctrl);
      }
    };
  });

  return ctrl;
}
