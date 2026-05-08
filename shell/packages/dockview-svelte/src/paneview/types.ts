import type { Component } from 'svelte';
import type {
  PaneviewApi,
  PaneviewDropEvent,
  PaneviewOptions,
  PaneviewPanelApi,
} from 'dockview-core';

export interface PaneviewReadyEvent {
  api: PaneviewApi;
}

export interface IPaneviewPanelProps<
  T extends { [index: string]: unknown } = Record<string, unknown>,
> {
  params: T;
  api: PaneviewPanelApi;
  containerApi: PaneviewApi;
  title: string;
}

export interface IPaneviewSvelteProps extends PaneviewOptions {
  components: Record<string, Component<IPaneviewPanelProps>>;
  headerComponents?: Record<string, Component<IPaneviewPanelProps>>;
  onReady: (event: PaneviewReadyEvent) => void;
  onDidDrop?: (event: PaneviewDropEvent) => void;
}
