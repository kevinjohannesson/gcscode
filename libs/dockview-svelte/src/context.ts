import { getContext } from 'svelte';
import type {
  DockviewApi,
  DockviewPanelApi,
  GridviewApi,
  GridviewPanelApi,
  PaneviewApi,
  PaneviewPanelApi,
  SplitviewApi,
  SplitviewPanelApi,
} from 'dockview-core';

/**
 * Distinct symbol keys per view flavor — gives us per-flavor type safety in
 * `getXxxContext()` helpers (a Splitview panel shouldn't compile against a
 * Dockview context type, etc.).
 */
export const DOCKVIEW_CONTEXT_KEY = Symbol('dockview-svelte:dockview-context');
export const SPLITVIEW_CONTEXT_KEY = Symbol('dockview-svelte:splitview-context');
export const GRIDVIEW_CONTEXT_KEY = Symbol('dockview-svelte:gridview-context');
export const PANEVIEW_CONTEXT_KEY = Symbol('dockview-svelte:paneview-context');

export interface DockviewSvelteContext {
  api: DockviewPanelApi;
  containerApi: DockviewApi;
}

export interface SplitviewSvelteContext {
  api: SplitviewPanelApi;
  containerApi: SplitviewApi;
}

export interface GridviewSvelteContext {
  api: GridviewPanelApi;
  containerApi: GridviewApi;
}

export interface PaneviewSvelteContext {
  api: PaneviewPanelApi;
  containerApi: PaneviewApi;
}

function readContext<T>(key: symbol, callerName: string): T {
  const ctx = getContext<T | undefined>(key);
  if (!ctx) {
    throw new Error(`${callerName}() called outside a dockview-svelte panel subtree`);
  }
  return ctx;
}

export function getDockviewContext(): DockviewSvelteContext {
  return readContext<DockviewSvelteContext>(DOCKVIEW_CONTEXT_KEY, 'getDockviewContext');
}

export function getSplitviewContext(): SplitviewSvelteContext {
  return readContext<SplitviewSvelteContext>(SPLITVIEW_CONTEXT_KEY, 'getSplitviewContext');
}

export function getGridviewContext(): GridviewSvelteContext {
  return readContext<GridviewSvelteContext>(GRIDVIEW_CONTEXT_KEY, 'getGridviewContext');
}

export function getPaneviewContext(): PaneviewSvelteContext {
  return readContext<PaneviewSvelteContext>(PANEVIEW_CONTEXT_KEY, 'getPaneviewContext');
}
