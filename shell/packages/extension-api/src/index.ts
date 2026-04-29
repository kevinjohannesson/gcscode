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
 * `<extension-id>.<local-name>`) used for diagnostics, lookups, and disposal.
 */
export interface ViewContribution {
  id: string;
  component: Component;
}

/**
 * A status bar item contribution renders a Svelte component into one side of
 * the shell's footer status bar. `id` is a stable identifier (usually
 * `<extension-id>.<local-name>`) used for diagnostics, lookups, and disposal.
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
 * id. Commands are the integration backbone for kinds that reference commands
 * by id rather than carrying their own handlers (keybindings today; menu
 * items and palette entries to come). Cross-extension execute is intentional —
 * any extension can fire any registered command.
 */
export interface CommandContribution {
  id: string;
  run: (...args: unknown[]) => unknown;
}

/**
 * A keybinding contribution maps a key combo (e.g. 'Ctrl+Shift+G') to a
 * registered command id. Modifiers are 'Ctrl', 'Shift', 'Alt', 'Meta'
 * (case-insensitive at match time); the key portion is also case-insensitive.
 * One non-modifier key per binding. The shell's keyboard dispatcher fires
 * the referenced command on first match. The `command` field is resolved at
 * fire time, not at registration — cross-extension command references are
 * intentional.
 */
export interface KeybindingContribution {
  key: string;
  command: string;
}

/**
 * Identity metadata for an extension — stable across activations; used by the
 * host for logs, errors, and (later) per-extension permission scoping.
 */
export interface ExtensionIdentity {
  readonly id: string;
  readonly displayName: string;
  readonly version: string;
}

/**
 * The per-extension gate. Each `register*` method returns a `Disposable` whose
 * `dispose()` removes the registration. New contribution kinds slot in as
 * further `register*` methods. Future steps will wrap this object to enforce
 * per-extension permission scopes without changing the extension-facing API.
 */
export interface ExtensionHost {
  registerView(view: ViewContribution): Disposable;
  registerStatusBarItem(item: StatusBarItemContribution): Disposable;
  registerCommand(command: CommandContribution): Disposable;
  registerKeybinding(keybinding: KeybindingContribution): Disposable;
  executeCommand<T = unknown>(id: string, ...args: unknown[]): Promise<T>;
  /**
   * Look up a currently-activated extension's exports by id. Returns the
   * wrapper iff the extension is registered AND its `activate()` has been
   * called and not yet undone by `deactivate()`. Returns `undefined`
   * otherwise.
   *
   * The generic `T` is unsafe sugar — the host stores the activate() return
   * value as `unknown` and casts to `T` on return. Producers and consumers
   * commit to a shared type contract via `import type` from the producer's
   * package; runtime drift is caught by TypeScript at producer-side compile.
   *
   * Reads inside reactive contexts (`$derived`, template) auto-track the
   * underlying `SvelteMap`; consumers re-render when the producer enables /
   * disables. See ADR-0005 for the full design.
   */
  getExtension<T = unknown>(id: string): { id: string; exports: T } | undefined;
}

/**
 * The activation context — mirrors VS Code's `ExtensionContext`:
 *   - `host` is the registration gate.
 *   - `subscriptions` is a sink for disposables; the host disposes them when
 *     the extension is (eventually) deactivated.
 *   - `extension` is read-only identity for the activating extension.
 */
export interface ExtensionContext {
  host: ExtensionHost;
  subscriptions: Disposable[];
  extension: ExtensionIdentity;
}

/**
 * An extension module's named export. Identity fields give the host extension
 * identity for diagnostics; `activate(context)` is the single entry point.
 * Returning a value from `activate()` publishes that value as the extension's
 * exports — other extensions can look it up via `host.getExtension(id)` (see
 * ADR-0005). Producers that don't expose an API may return nothing.
 *
 * `deactivate?()` is an optional hook for non-disposable / async cleanup. The
 * host awaits the returned Promise (if any) before tearing down subscriptions.
 */
export interface Extension extends ExtensionIdentity {
  activate(context: ExtensionContext): unknown;
  deactivate?(): void | Promise<void>;
}
