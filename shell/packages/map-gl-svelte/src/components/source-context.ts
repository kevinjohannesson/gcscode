import { getContext, setContext } from 'svelte';

export const SOURCE_CONTEXT_KEY = Symbol('map-gl-svelte:source-context');

/**
 * Gives a `<Source>`'s descendants its id, which a `<Layer>` takes as its default `source`. Only
 * the id: a Layer finds its source through the map, never through the Source component.
 */
export function setSourceId(id: string): void {
  setContext(SOURCE_CONTEXT_KEY, id);
}

/** The id of the nearest enclosing `<Source>`, or `undefined` outside one. */
export function getSourceId(): string | undefined {
  return getContext<string | undefined>(SOURCE_CONTEXT_KEY);
}
