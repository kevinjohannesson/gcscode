import type { Component } from 'svelte';
import type { GridviewApi, GridviewOptions, GridviewPanelApi } from 'dockview-core';

export interface GridviewReadyEvent {
  api: GridviewApi;
}

export interface IGridviewPanelProps<
  T extends { [index: string]: unknown } = Record<string, unknown>,
> {
  params: T;
  api: GridviewPanelApi;
  containerApi: GridviewApi;
}

export interface IGridviewSvelteProps extends GridviewOptions {
  components: Record<string, Component<IGridviewPanelProps>>;
  onReady: (event: GridviewReadyEvent) => void;
}
