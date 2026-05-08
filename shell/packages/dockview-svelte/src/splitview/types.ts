import type { Component } from 'svelte';
import type { SplitviewApi, SplitviewOptions, SplitviewPanelApi } from 'dockview-core';

export interface SplitviewReadyEvent {
  api: SplitviewApi;
}

export interface ISplitviewPanelProps<
  T extends { [index: string]: unknown } = Record<string, unknown>,
> {
  params: T;
  api: SplitviewPanelApi;
  containerApi: SplitviewApi;
}

export interface ISplitviewSvelteProps extends SplitviewOptions {
  components: Record<string, Component<ISplitviewPanelProps>>;
  onReady: (event: SplitviewReadyEvent) => void;
}
