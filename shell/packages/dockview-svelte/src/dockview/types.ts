import type { Component } from 'svelte';
import type {
  BuiltInChipContextMenuItem,
  BuiltInContextMenuItem,
  ContextMenuItemConfig,
  DockviewApi,
  DockviewDidDropEvent,
  DockviewOptions,
  DockviewReadyEvent,
  DockviewWillDropEvent,
  GetTabContextMenuItemsParams,
  GetTabGroupChipContextMenuItemsParams,
  IContextMenuItemComponentProps,
  IDockviewHeaderActionsProps,
  IDockviewPanelHeaderProps,
  IDockviewPanelProps,
  ITabGroup,
  IWatermarkPanelProps,
} from 'dockview-core';

/**
 * Tab group chip props — adapter-defined (not in dockview-core); copied from
 * upstream React (`reactTabGroupChipPart.ts`).
 */
export interface IDockviewTabGroupChipProps {
  tabGroup: ITabGroup;
  api: DockviewApi;
}

/**
 * Svelte-flavored variant of `ContextMenuItemConfig`. Replaces core's
 * `component?: unknown` with a typed Svelte component reference. The
 * `<DockviewSvelte>` component handles registration with dockview-core's
 * by-id factory under the hood.
 */
export interface SvelteContextMenuItemConfig extends Omit<ContextMenuItemConfig, 'component'> {
  component?: Component<IContextMenuItemComponentProps>;
}

export interface IDockviewSvelteProps extends DockviewOptions {
  components: Record<string, Component<IDockviewPanelProps>>;
  tabComponents?: Record<string, Component<IDockviewPanelHeaderProps>>;
  watermarkComponent?: Component<IWatermarkPanelProps>;
  defaultTabComponent?: Component<IDockviewPanelHeaderProps>;
  rightHeaderActionsComponent?: Component<IDockviewHeaderActionsProps>;
  leftHeaderActionsComponent?: Component<IDockviewHeaderActionsProps>;
  prefixHeaderActionsComponent?: Component<IDockviewHeaderActionsProps>;
  tabGroupChipComponent?: Component<IDockviewTabGroupChipProps>;
  getTabContextMenuItems?: (
    params: GetTabContextMenuItemsParams,
  ) => (BuiltInContextMenuItem | SvelteContextMenuItemConfig)[];
  getTabGroupChipContextMenuItems?: (
    params: GetTabGroupChipContextMenuItemsParams,
  ) => (BuiltInChipContextMenuItem | SvelteContextMenuItemConfig)[];
  onReady: (event: DockviewReadyEvent) => void;
  onDidDrop?: (event: DockviewDidDropEvent) => void;
  onWillDrop?: (event: DockviewWillDropEvent) => void;
}
