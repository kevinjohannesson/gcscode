import type { Component } from 'svelte';

/**
 * The named surface a contribution targets. One kind today; the union is the
 * extension point for adding more (e.g. 'status-bar', 'sidebar') in later
 * steps without reshaping the API.
 */
export type ContributionKind = 'content';

export interface Contribution {
  kind: ContributionKind;
  component: Component;
}

/**
 * The per-plugin gate. Today it only exposes registration; future steps will
 * wrap this object with permission scopes so each plugin's capabilities can
 * be limited without changing the plugin-facing API.
 */
export interface PluginHost {
  registerContribution(contribution: Contribution): void;
}

export interface Plugin {
  activate(host: PluginHost): void;
}
