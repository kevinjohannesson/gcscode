// Re-export everything from dockview-core so consumers only need to depend
// on dockview-svelte (and dockview-core as a peer dep). Mirrors upstream
// dockview / dockview-vue / dockview-angular.
export * from 'dockview-core';

export { default as DockviewSvelte } from './dockview/dockview.svelte';
export { default as SplitviewSvelte } from './splitview/splitview.svelte';
export { default as GridviewSvelte } from './gridview/gridview.svelte';
export { default as PaneviewSvelte } from './paneview/paneview.svelte';
export { default as DefaultTab } from './dockview/default-tab.svelte';

export * from './dockview/types';
export * from './splitview/types';
export * from './gridview/types';
export * from './paneview/types';
export * from './context';
export {
  mountSvelteComponent,
  SvelteRenderer,
  SvelteWatermarkRenderer,
  SvelteHeaderActionsRenderer,
  SvelteContextMenuItemRenderer,
  SvelteTabGroupChipRenderer,
  SveltePart,
  type MountedComponent,
} from './utils.svelte';
