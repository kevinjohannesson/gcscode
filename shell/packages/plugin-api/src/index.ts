import type { Component } from 'svelte';

/**
 * Standard cleanup primitive. `dispose()` must be idempotent — calling it a
 * second time is a no-op.
 */
export interface Disposable {
  dispose(): void;
}

/**
 * A view contribution renders a Svelte component into the shell's main
 * content surface. `id` is a stable identifier (usually
 * `<plugin-id>.<local-name>`) used for diagnostics, lookups, and disposal.
 */
export interface ViewContribution {
  id: string;
  component: Component;
}

/**
 * A status bar item contribution renders a Svelte component into one side of
 * the shell's footer status bar. `id` is a stable identifier (usually
 * `<plugin-id>.<local-name>`) used for diagnostics, lookups, and disposal.
 * `alignment` decides which side of the bar the item sits on; ordering within
 * a side follows registration order.
 */
export interface StatusBarItemContribution {
  id: string;
  component: Component;
  alignment: 'left' | 'right';
}

/**
 * A command contribution registers a callable handler under a stable string
 * id. Commands are the integration backbone for future kinds (keybindings,
 * menu items, palette entries) which reference commands by id rather than
 * carrying their own handlers. Cross-plugin execute is intentional — any
 * plugin can fire any registered command.
 */
export interface CommandContribution {
  id: string;
  run: (...args: unknown[]) => unknown;
}

/**
 * Identity metadata for a plugin — stable across activations; used by the
 * host for logs, errors, and (later) per-plugin permission scoping.
 */
export interface PluginIdentity {
  readonly id: string;
  readonly displayName: string;
  readonly version: string;
}

/**
 * The per-plugin gate. Each `register*` method returns a `Disposable` whose
 * `dispose()` removes the registration. New contribution kinds slot in as
 * further `register*` methods. Future steps will wrap this object to enforce
 * per-plugin permission scopes without changing the plugin-facing API.
 */
export interface PluginHost {
  registerView(view: ViewContribution): Disposable;
  registerStatusBarItem(item: StatusBarItemContribution): Disposable;
  registerCommand(command: CommandContribution): Disposable;
}

/**
 * The activation context — mirrors VS Code's `ExtensionContext`:
 *   - `host` is the registration gate.
 *   - `subscriptions` is a sink for disposables; the host disposes them when
 *     the plugin is (eventually) deactivated.
 *   - `plugin` is read-only identity for the activating plugin.
 */
export interface PluginContext {
  host: PluginHost;
  subscriptions: Disposable[];
  plugin: PluginIdentity;
}

/**
 * A plugin module's named export. Identity fields give the host plugin
 * identity for diagnostics; `activate(context)` is the single entry point.
 */
export interface Plugin extends PluginIdentity {
  activate(context: PluginContext): void;
}
