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
  /**
   * Operator-visible label for the view, shown by the host wherever the
   * view's surface is presented. Required because the host always renders
   * a visible surface for each registered view; there is no sensible
   * fallback — the view's `id` is a developer string, not a label.
   *
   * Naming matches `CommandContribution.title` (same word, same semantics:
   * operator-visible label). Required here because a registered view is
   * always visible; optional in `CommandContribution` because a command
   * without a title is still callable via `executeCommand` and keybindings.
   */
  title: string;
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
 *
 * Optional `title` and `category` are the user-facing metadata used by the
 * command palette. Commands without `title` are still callable via
 * `executeCommand` and via keybindings, but do not appear in the palette.
 */
export interface CommandContribution {
  id: string;
  run: (...args: unknown[]) => unknown;
  title?: string;
  category?: string;
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
 * One row in a quick pick list. Extra fields beyond `label` (when the caller
 * passes a `T extends QuickPickItem` with extra fields) are preserved on the
 * resolved value so callers can dispatch on them.
 *
 * `description` and `detail` are typed but not searched in v1 (matches VS
 * Code defaults of `matchOnDescription: false` / `matchOnDetail: false`).
 */
export interface QuickPickItem {
  label: string;
  description?: string;
  detail?: string;
}

/**
 * Options that customize the quick pick presentation. Both fields are
 * advisory — the host is free to render them or ignore them.
 */
export interface QuickPickOptions {
  placeholder?: string;
  title?: string;
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
 * Per-extension declaration metadata. Extends `ExtensionIdentity` with
 * presentation fields used by host UI (e.g. the marketplace / extensions panel).
 *
 * Iteration scope is descriptive metadata only: identity (`id`, `displayName`,
 * `version`) and `description?`. Future descriptive fields (`category?`,
 * `icon?`, `categories?`) land per-field on this interface as real consumers
 * pull on them. Declarative `contributes` arrays (commands, views, keybindings
 * as static lists) are deferred under sharper trigger language; see ADR-0007.
 */
export interface ExtensionManifest extends ExtensionIdentity {
  /**
   * One-line user-facing description. Rendered by host UI (extensions panel
   * rows, marketplace previews) when present. No length cap; UIs may truncate.
   */
  readonly description?: string;
}

/**
 * The per-extension gate. Methods are organized into four topic namespaces:
 *
 * - `commands` — `registerCommand` (returns `Disposable`) and `executeCommand`
 *   (fires by id; cross-extension execute is intentional).
 * - `window` — `registerView` and `registerStatusBarItem` (UI contributions).
 * - `keybindings` — `registerKeybinding` (key combo → command id).
 * - `extensions` — `getExtension` (looks up another extension's published exports).
 *
 * The host exposes no methods at the top level — every verb lives under one of
 * the four namespaces. New contribution kinds slot in as further `register*`
 * methods on the appropriate namespace; new cross-cutting capabilities (events,
 * settings, themes, i18n) land as new namespaces. See ADR-0006.
 */
export interface ExtensionHost {
  readonly commands: {
    registerCommand(command: CommandContribution): Disposable;
    executeCommand<T = unknown>(id: string, ...args: unknown[]): Promise<T>;
  };
  readonly window: {
    registerView(view: ViewContribution): Disposable;
    registerStatusBarItem(item: StatusBarItemContribution): Disposable;
    /**
     * Present a filterable picker of `items` to the user. Resolves with the
     * picked item on selection (Enter / click), or `undefined` if the user
     * dismisses (Escape / click outside). Generic over `T` so extra fields on
     * the items survive the round trip.
     *
     * Calling while another quick pick is already open rejects with
     * `Error('Quick pick already open')`. No queueing in v1.
     */
    showQuickPick<T extends QuickPickItem>(
      items: T[],
      options?: QuickPickOptions,
    ): Promise<T | undefined>;
  };
  readonly keybindings: {
    registerKeybinding(keybinding: KeybindingContribution): Disposable;
  };
  readonly extensions: {
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
  };
  readonly configuration: {
    /**
     * Register a setting's schema and default. Returns a Disposable; on dispose
     * the schema is removed from the active registry AND the in-memory value
     * map entry is cleared (the persisted localStorage value stays so the next
     * `registerConfiguration` for the same key can recover it).
     *
     * Throws synchronously if:
     *   - `key` does not start with `<extension-id>.`
     *   - a contribution for `key` is already registered
     *   - `default` (if provided) does not validate against `schema`
     *
     * Any persisted value for `key` that fails to validate against `schema`
     * at registration time is logged (`console.warn`) and treated as absent
     * for read purposes; `get(key)` falls back to the schema default.
     */
    registerConfiguration(contribution: ConfigurationContribution): Disposable;

    /** Return a section-scoped reader/writer. */
    getConfiguration(section?: string): WorkspaceConfiguration;

    /**
     * Subscribe to setting changes. The listener fires after each `update()`
     * resolves (one listener invocation per `update()`; no coalescing in v1).
     * Does NOT fire during the boot-time registration sweep or on
     * `registerConfiguration`. Returns a Disposable.
     *
     * `(listener) => Disposable` is the gcscode event-shape convention; a
     * future `Event<T>` substrate iteration may retrofit if richer semantics
     * (filtering, replay, priority) become necessary.
     */
    onDidChangeConfiguration(
      listener: (e: ConfigurationChangeEvent) => void,
    ): Disposable;
  };
}

// === Configuration ===

/**
 * JSON Schema Draft 07 type, re-exported from `@types/json-schema`. Extension
 * authors get compile-time help on schema shape errors; ajv (in `@gcscode/shell`)
 * validates the runtime shape and the value at write time.
 */
export type { JSONSchema7 } from 'json-schema';

import type { JSONSchema7 } from 'json-schema';

/**
 * Numeric values are part of the API contract and stable across versions:
 * `Global = 1`, `Workspace = 2`, `WorkspaceFolder = 3`. Only `Global` is
 * functional in v1; `update()` with the other two rejects with
 * `Error('Target not supported in v1')`. Numeric stability matches VS Code's
 * `ConfigurationTarget`.
 */
export const ConfigurationTarget = {
  Global: 1,
  Workspace: 2,
  WorkspaceFolder: 3,
} as const;
export type ConfigurationTarget =
  (typeof ConfigurationTarget)[keyof typeof ConfigurationTarget];

/**
 * A configuration contribution registers a single setting key with its JSON
 * Schema and (optional) default value. The full `key` must start with the
 * registering extension's id (e.g. extension `gcscode.sitl` may register
 * `gcscode.sitl.connectionUrl`). Registration is enforced exactly-once:
 * a second `registerConfiguration` for the same key throws synchronously.
 */
export interface ConfigurationContribution<T = unknown> {
  /** Full setting key. Must start with `<extension-id>.`. */
  key: string;
  /** JSON Schema (Draft 07) describing valid values. */
  schema: JSONSchema7;
  /** Default value. Validated against schema at registration; throws if invalid. */
  default?: T;
}

/**
 * Fired by `onDidChangeConfiguration` after a single `update()` commits.
 * `affectsConfiguration(section)` returns true if the changed key starts
 * with `<section>.` or equals `<section>` literally. v1 fires one event
 * per `update()` call — no coalescing.
 */
export interface ConfigurationChangeEvent {
  affectsConfiguration(section: string): boolean;
}

/**
 * Section-scoped reader/writer. Returned by `host.configuration.getConfiguration(section?)`.
 * With a section, keys are implicitly prefixed (e.g.
 * `getConfiguration('gcscode.sitl').get('connectionUrl')` reads the full
 * key `'gcscode.sitl.connectionUrl'`).
 *
 * Cross-section / cross-extension reads are permitted: any extension can
 * read or write any registered key. Registration enforces the prefix; post-
 * registration access is open. Mirrors VS Code; capability-gating is deferred.
 */
export interface WorkspaceConfiguration {
  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  has(key: string): boolean;
  /**
   * Returns the inspection record if a schema is registered for `key`, or
   * `undefined` if no schema is registered. `defaultValue` and `globalValue`
   * are each optional independently. Workspace/folder fields land additively
   * when scope expands.
   */
  inspect<T>(
    key: string,
  ):
    | {
        key: string;
        defaultValue?: T;
        globalValue?: T;
      }
    | undefined;
  /**
   * Persists `value` against `key`. Rejection paths:
   * - No schema registered: `Error('No schema registered for "<key>"')`.
   * - Value violates schema: `Error('Value for "<key>" does not match schema: <reason>')`.
   * - `target === Workspace` or `WorkspaceFolder`: `Error('Target not supported in v1')`.
   * - Persistence failure (quota / disabled / security context):
   *   `Error('Persistence failed: <reason>')`. The in-memory commit and the
   *   listener invocations HAVE fired before this rejection.
   *
   * Rejection is via the returned Promise — not synchronous throw.
   */
  update(
    key: string,
    value: unknown,
    target?: ConfigurationTarget,
  ): Promise<void>;
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
 * An extension module's named export. The `manifest` carries identity and
 * descriptive metadata; `activate(context)` is the single entry point.
 *
 * Returning a value from `activate()` publishes that value as the extension's
 * exports — other extensions can look it up via
 * `host.extensions.getExtension(id)` (see ADR-0005). Producers that don't
 * expose an API may return nothing.
 *
 * `deactivate?()` is an optional hook for non-disposable / async cleanup. The
 * host awaits the returned Promise (if any) before tearing down subscriptions.
 *
 * See ADR-0007 for the manifest's shape and growth conventions.
 */
export interface Extension {
  readonly manifest: ExtensionManifest;
  activate(context: ExtensionContext): unknown;
  deactivate?(): void | Promise<void>;
}
