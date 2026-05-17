# Phase C3 — Configuration system v1

**Status:** Approved (2026-05-18)

## Context

Phase A landed contribution kinds (status bar, commands, keybindings). Phase B landed lifecycle (deactivate, enable/disable, per-extension manifest). Phase C1/C2 landed `ExtensionHost` namespacing and a discoverability surface (command palette). The roadmap's remaining `C3+` line lists "events, settings, themes, i18n — TBD. Each lands as a new namespace under `host.*` when a feature extension pulls on it."

A real consumer pulls on settings now. `@gcscode/extension-sitl` hardcodes its mavlink2rest WebSocket URL (`ws://localhost:8088/mavlink2rest/ws/mavlink`). Operators running a non-default bridge cannot point gcscode at it without editing source and rebuilding. That is the first concrete trigger; this iteration ships the substrate to remove the hardcode.

C3 v1 adds a new `host.configuration.*` namespace exposing the runtime read/write/observe API for typed, persisted, schema-validated settings. The surface mirrors VS Code's `vscode.workspace.getConfiguration` / `onDidChangeConfiguration` at the call site; the schema-declaration shape diverges to imperative `registerConfiguration` inside `activate(context)` (per ADR-0002, ADR-0003). The settings editor UI is deliberately out of v1 — the substrate lands first; the editor follows when a second consumer or operator UX feedback pulls on it.

This iteration is also the first non-synthetic exercise of the **Extension architect** reviewer role (`gcscode-extension-architect[bot]`) introduced in [`specs/2026-05-17-reviewer-routing-and-domain-expert.md`](2026-05-17-reviewer-routing-and-domain-expert.md). The spec is in-scope by the routing heuristic (extension API surface, host↔extension boundary, lifecycle, conflicts) and should auto-dispatch on PR open.

## VS Code alignment

GCScode mirrors VS Code's extension architecture **in spirit, not by byte**. The C3 v1 cut keeps call-site shape aligned and diverges on schema declaration (forced by ADR-0002) and scope (forced by gcscode being a single-tenant browser app today).

| VS Code feature                                                                                       | C3 v1 in GCScode                                                                                                                            | Status                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vscode.workspace.getConfiguration(section?)` returning a `WorkspaceConfiguration`                    | `host.configuration.getConfiguration(section?)` returning a `WorkspaceConfiguration` with the same `get`/`has`/`inspect`/`update` shape     | Aligned (call-site identical).                                                                                                                                                                                  |
| `WorkspaceConfiguration.get<T>(key, defaultValue?)`                                                   | Same                                                                                                                                        | Aligned.                                                                                                                                                                                                        |
| `WorkspaceConfiguration.has(key)`                                                                     | Same                                                                                                                                        | Aligned.                                                                                                                                                                                                        |
| `WorkspaceConfiguration.inspect<T>(key)` returning `{ defaultValue, globalValue, workspaceValue, … }` | `inspect<T>(key)` returning `{ key, defaultValue?, globalValue? }`                                                                          | Aligned shape; workspace/folder fields land additively when scope expands.                                                                                                                                      |
| `WorkspaceConfiguration.update(key, value, target?)` returning `Thenable<void>`                       | `update(key, value, target?)` returning `Promise<void>`                                                                                     | Aligned.                                                                                                                                                                                                        |
| `ConfigurationTarget.Global` / `Workspace` / `WorkspaceFolder`                                        | Enum exposed; only `Global` functional in v1. `update` with `Workspace` / `WorkspaceFolder` throws `Error('Target not supported in v1')`    | Stubbed (per the "in-progress stubs" precedent from agent memory `feedback_in_progress_stubs.md`). Workspace lands additively when the workspace concept itself lands.                                          |
| `onDidChangeConfiguration(e)` + `e.affectsConfiguration(section)`                                     | Same shape, returning `Disposable`                                                                                                          | Aligned.                                                                                                                                                                                                        |
| Schema declaration shape                                                                              | Imperative `host.configuration.registerConfiguration({ key, schema, default? })` inside `activate(context)`                                 | **Divergent — by design**. VS Code declares schemas in `package.json#contributes.configuration`. gcscode is imperative (ADR-0002); the `contributes` manifest stays deferred (ADR-0003).                        |
| Schema language                                                                                       | JSON Schema Draft 2020-12, validated by `ajv`                                                                                               | Aligned in spirit (VS Code's schema is JSON-Schema-ish with extensions). gcscode commits to a standard draft so the substrate doesn't ship a custom dialect.                                                    |
| User vs Workspace vs Folder scopes with cascading override                                            | Single Global scope (localStorage). Cascading is a no-op in v1                                                                              | Stubbed.                                                                                                                                                                                                        |
| `settings.json` text-file editing                                                                     | None — localStorage blob only; flipped via devtools in v1                                                                                   | **Divergent — forced**. Browser app, no file backing. A future settings editor iteration will provide a UX surface; raw-JSON-view is one candidate shape.                                                       |
| Cross-extension reads                                                                                 | Permitted (any extension can read any registered key)                                                                                       | Aligned.                                                                                                                                                                                                        |
| Cross-extension writes / writes to unregistered keys                                                  | Throws `Error('No schema registered for "<key>"')`                                                                                          | **Stricter than VS Code**. VS Code lets you write arbitrary keys. gcscode prefers explicit-failure-at-the-source over silent persistence (matches command/keybinding registration discipline).                  |
| Setting key prefix-must-equal-registering-extension-id                                                | Enforced at registration (`Error('Setting key "<key>" must start with "<extension-id>."')`)                                                 | **Stricter than VS Code**. VS Code's prefix convention is opt-in; gcscode enforces it to prevent cross-extension squatting.                                                                                     |
| Reactive auto-tracking inside framework templates                                                     | `get()` reads inside Svelte `$derived` / template contexts auto-track via the shell's `SvelteMap`-backed store                              | **gcscode addition**. Mirrors ADR-0005's cross-extension exports pattern. No equivalent in VS Code.                                                                                                             |
| Settings editor UI (search, type widgets, JSON view)                                                  | None in v1. Operators flip values via browser devtools                                                                                      | **Deferred**. Trigger to revisit: operator UX feedback OR a second real setting consumer landing.                                                                                                               |
| Schema validation on write                                                                            | `update(key, value, …)` rejects the returned Promise with the ajv error when value violates schema; in-memory and persisted state unchanged | Aligned in spirit (VS Code's editor surfaces schema violations; the underlying API also rejects malformed writes through the editor flow). gcscode applies the same constraint at the API surface universally. |
| Schema validation on read of persisted values at boot                                                 | Validate each persisted value against its schema at `registerConfiguration` time. Mismatch → log warning, fall back to schema default       | gcscode addition over VS Code's looser behavior (VS Code keeps the bad value in `settings.json` and lets the editor render it as-is).                                                                           |
| `package.json#contributes.configuration` declarative schema discovery                                 | None — schemas registered at runtime only                                                                                                   | **Deferred**. Same `contributes` manifest deferral as every other contribution kind (ADR-0003).                                                                                                                 |

## In-scope

### API additions to `@gcscode/extension-api`

```ts
// JSON Schema reference — re-export of a narrowed alias so extensions don't
// need to add `@types/json-schema` themselves.
export type JSONSchemaType = Record<string, unknown>;

export const ConfigurationTarget = {
  Global: 1,
  Workspace: 2, // throws in v1
  WorkspaceFolder: 3, // throws in v1
} as const;
export type ConfigurationTarget = (typeof ConfigurationTarget)[keyof typeof ConfigurationTarget];

/**
 * A configuration contribution registers a single setting key with its JSON
 * Schema and default value. The full key must start with the registering
 * extension's id (e.g. extension `gcscode.sitl` may register
 * `gcscode.sitl.connectionUrl`). Registration is enforced exactly-once: a
 * second `registerConfiguration` for the same key throws.
 */
export interface ConfigurationContribution<T = unknown> {
  /** Full setting key. Must start with `<extension-id>.`. */
  key: string;
  /** JSON Schema (Draft 2020-12) describing valid values. */
  schema: JSONSchemaType;
  /** Default value. Validated against schema at registration; throws if invalid. */
  default?: T;
}

/**
 * Fired by `onDidChangeConfiguration` after one or more setting values change.
 * `affectsConfiguration(section)` returns true if any changed key starts with
 * `<section>.` or equals `<section>` literally.
 */
export interface ConfigurationChangeEvent {
  affectsConfiguration(section: string): boolean;
}

/**
 * Section-scoped reader/writer over the configuration store. Returned by
 * `host.configuration.getConfiguration(section?)`. With a section, keys are
 * implicitly prefixed (e.g. `getConfiguration('gcscode.sitl').get('connectionUrl')`
 * reads the full key `'gcscode.sitl.connectionUrl'`).
 */
export interface WorkspaceConfiguration {
  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  has(key: string): boolean;
  inspect<T>(key: string):
    | {
        key: string;
        defaultValue?: T;
        globalValue?: T;
      }
    | undefined;
  update(key: string, value: unknown, target?: ConfigurationTarget): Promise<void>;
}
```

### `ExtensionHost` gains a `configuration` namespace

```ts
readonly configuration: {
  /**
   * Register a setting's schema and default. Returns a Disposable; on dispose
   * the schema is removed from the active registry. The persisted value (if any)
   * stays in localStorage so a re-activated extension finds it on next register.
   *
   * Throws if:
   *   - `key` does not start with `<extension-id>.`
   *   - a contribution for `key` is already registered
   *   - `default` (if provided) does not validate against `schema`
   *
   * Also: any persisted value for `key` in localStorage that fails to validate
   * against `schema` is logged (`console.warn`) and treated as absent for read
   * purposes (so `get(key)` returns the schema default). The bad value is NOT
   * overwritten in localStorage — re-validation will succeed if the schema
   * later loosens.
   */
  registerConfiguration(contribution: ConfigurationContribution): Disposable;

  /**
   * Return a section-scoped reader/writer. `section` is an optional prefix
   * (e.g. 'gcscode.sitl'); the returned object's `get('foo')` reads the full
   * key `'gcscode.sitl.foo'`.
   */
  getConfiguration(section?: string): WorkspaceConfiguration;

  /**
   * Subscribe to setting changes. Listener fires after one or more `update`
   * calls have committed. Does NOT fire for the initial registration sweep at
   * boot. Returns a Disposable.
   */
  onDidChangeConfiguration(listener: (e: ConfigurationChangeEvent) => void): Disposable;
};
```

The namespace placement follows ADR-0006: settings is a cross-cutting capability, so it gets its own top-level namespace under `host.*` rather than slotting into `host.window` / `host.commands` / `host.keybindings` / `host.extensions`.

### Host implementation — configuration store

A new module `packages/shell/src/configuration/configuration-store.svelte.ts` implements the store. Follows the project class-style convention from agent memory `feedback_svelte_class_wrappers.md`: explicit `private`/`public`, `_backingField` underscore convention, get/set accessors, business logic in the class.

```ts
// Sketch — full implementation lands in the plan.
class ConfigurationStore {
  private _schemas = new SvelteMap<string, CompiledSchemaEntry>();
  private _values = new SvelteMap<string, unknown>();
  private _listeners = new Set<(e: ConfigurationChangeEvent) => void>();

  public registerConfiguration(contribution: ConfigurationContribution, extensionId: string): Disposable {
    /* validate prefix, validate default, compile schema via ajv,
       re-validate persisted value if present */
  }

  public getConfiguration(section: string | undefined): WorkspaceConfiguration {
    /* return a WorkspaceConfiguration wrapper that closes over `section` */
  }

  public onDidChangeConfiguration(listener: (e: ConfigurationChangeEvent) => void): Disposable {
    /* add to _listeners; return Disposable */
  }

  // Used by WorkspaceConfiguration.update().
  public async update(fullKey: string, value: unknown, target: ConfigurationTarget): Promise<void> {
    /* validate schema present + value matches schema; throw on Workspace/WorkspaceFolder;
       mutate _values; persist blob; fire listeners */
  }
}
```

The store is instantiated once at shell boot, before extension activation. The shell's `ExtensionHost` factory (`createHost(extensionId)`) wires `host.configuration` to this single shared store, passing `extensionId` into `registerConfiguration` for prefix enforcement.

### Persistence

- **Backend:** `window.localStorage`.
- **Key:** `gcscode.configuration` (single key).
- **Value:** JSON-serialized object `{ [fullKey: string]: unknown }`.
- **Write semantics:** `update()` validates, mutates the in-memory `SvelteMap`, fires listeners, then asynchronously executes a **read-modify-write** of the blob: (a) read the current localStorage blob, (b) merge in the updated key, (c) write the blob back. The read-modify-write preserves orphaned values from removed extensions and any validation-failed persisted values for keys this `update` doesn't touch. The Promise resolves after the write.
- **Read semantics at boot:** the store loads the blob into `_values` before any extension activates. Schemas register later; per-key re-validation happens at each `registerConfiguration` call. Bad or orphan values stay in the persisted blob but are not exposed via `get` (see Validation below).

### Validation

- **Library:** `ajv@8.x` (Draft 2020-12 support) plus `ajv-formats` for `format` keywords like `uri` and `email`. Added to `packages/shell/package.json` only — `@gcscode/extension-api` does not import ajv. Extension authors hand the host a plain JSON Schema object (`Record<string, unknown>`).
- **At `registerConfiguration`:** compile the schema once (ajv caches). Validate the `default` (if provided); throw on failure. Validate any persisted value for the same key; on failure, `console.warn(\`[configuration] persisted value for "${key}" violates schema; falling back to default\`)` and remove the key from the in-memory `_values` map (so subsequent `get(key)` returns the schema default). The persisted blob in localStorage is **not** modified — the bad value stays in storage until the next `update(key, ...)` overwrites it.
- **At `update`:** validate the incoming value against the schema; on failure, reject the Promise with `Error('Value for "<key>" does not match schema: <ajv-error-summary>')`. In-memory and persisted state unchanged.
- **At `get`:** no validation. Reads are O(1) lookups against the in-memory map; the values have already been validated at write or registration time. Keys whose persisted value failed validation are absent from the in-memory map, so `get(key)` falls back through the default-from-schema → defaultValue-arg → undefined chain.

### Reactive integration

Reads via the `WorkspaceConfiguration` returned by `getConfiguration(...)` route to the store's `SvelteMap`-backed `_values`. Reads inside Svelte `$derived` / template contexts auto-track and re-render when `update()` mutates the map. This matches the existing pattern from ADR-0005 (cross-extension exports auto-track via SvelteMap). Non-Svelte consumers use `onDidChangeConfiguration` + manual re-read.

### Lifecycle

- **Boot order:** (1) shell creates the configuration store and loads the localStorage blob into `_values`. (2) Built-in extensions (`workbench` etc.) activate. (3) Bundled extensions activate in `bundledExtensions` order. Each calls `registerConfiguration` as needed; persisted values are re-validated at that point.
- **Extension disable:** `registry.deactivate(extensionId)` disposes all of the extension's subscriptions. The configuration-Disposable returned by `registerConfiguration` removes the schema entry from `_schemas`. **The persisted value in `_values` and in localStorage stays.** Re-enable re-registers the schema; persisted value re-validates.
- **Schema mismatch across re-registers:** if a re-registered extension's schema is incompatible with the persisted value, the warning-and-fall-back-to-default path fires (same as boot-time). No migration hooks in v1.
- **Cross-extension write before producer activates:** `update()` throws `No schema registered for "<key>"`. The writer must order activation via the same pattern as `host.extensions.getExtension(id)?.exports` (defensive undefined-handling) — but for settings the natural pattern is "wait for `onDidChangeConfiguration` to fire after the producer activates," not "poll for schema presence."

### First consumer — `@gcscode/extension-sitl`

The SITL listener extension's WebSocket URL becomes a configuration read. The single hardcoded string in `packages/extension-sitl/src/index.ts` is replaced:

```ts
// inside activate(context):
context.subscriptions.push(
  context.host.configuration.registerConfiguration({
    key: 'gcscode.sitl.connectionUrl',
    schema: {
      type: 'string',
      format: 'uri',
      description: 'WebSocket URL of the mavlink2rest bridge.',
    },
    default: 'ws://localhost:8088/mavlink2rest/ws/mavlink',
  }),
);

const cfg = context.host.configuration.getConfiguration('gcscode.sitl');
const url = cfg.get<string>('connectionUrl')!; // schema-default ensures non-undefined
// open WebSocket to `url`...

// React to changes — tear down + reconnect:
context.subscriptions.push(
  context.host.configuration.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('gcscode.sitl.connectionUrl')) {
      // close existing WebSocket; reopen with cfg.get<string>('connectionUrl')!
    }
  }),
);
```

The reconnect-on-change wiring is part of v1 — without it, the substrate is half-validated. A unit test asserts the reconnect path fires when `update` lands a new URL.

### Operator UX in v1

No settings editor. Operators flip `gcscode.sitl.connectionUrl` via the browser devtools console:

```js
const cfg = JSON.parse(localStorage.getItem('gcscode.configuration') ?? '{}');
cfg['gcscode.sitl.connectionUrl'] = 'ws://192.168.1.42:8088/mavlink2rest/ws/mavlink';
localStorage.setItem('gcscode.configuration', JSON.stringify(cfg));
location.reload(); // settings store reads blob at boot; no live-reload of localStorage in v1
```

This is awkward by design. The awkwardness is the trigger for the follow-up settings-editor iteration. Documented in the README and in `docs/out-of-scope.md` propagation below.

Note that the operator's edit bypasses the in-memory store. `update()` is the in-app path; devtools edits require a reload to take effect (no `storage` event listener in v1). A future iteration may add the listener; the substrate doesn't preclude it.

### Implementation surface summary

Files touched / added:

- `packages/extension-api/src/index.ts` — add `ConfigurationTarget` const + type; `ConfigurationContribution`, `ConfigurationChangeEvent`, `WorkspaceConfiguration` interfaces; add `configuration` namespace to `ExtensionHost`.
- `packages/shell/src/configuration/configuration-store.svelte.ts` — new (class wrapper for the store + schema map + values map + listeners).
- `packages/shell/src/configuration/workspace-configuration.ts` — new (the `WorkspaceConfiguration` wrapper closure factory).
- `packages/shell/src/configuration/persistence.ts` — new (localStorage read/write helpers; isolated for future backend swap).
- `packages/shell/src/extension-host/registry.ts` — wire `host.configuration` into `createHost(extensionId)`.
- `packages/extension-sitl/src/index.ts` — register `gcscode.sitl.connectionUrl`, read at activate, wire reconnect on `onDidChangeConfiguration`.
- `packages/shell/package.json` — add `ajv@^8` + `ajv-formats@^3`.
- `packages/extension-api/README.md` — document the `host.configuration` namespace.

## Out-of-scope (this iteration)

| Surface                                                            | Status     | Notes                                                                                                                                                                                                                                |
| ------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Settings editor UI (search, widgets, JSON view, categories)        | ✗ Deferred | Trigger: operator UX feedback OR a second real setting consumer.                                                                                                                                                                     |
| Workspace + WorkspaceFolder configuration targets                  | ✗ Stubbed  | Enum exposed; `update` with non-`Global` targets throws. Lands when the workspace concept lands.                                                                                                                                     |
| Cascading override resolution (`globalValue` overridden by `workspaceValue`) | ✗ Deferred | No second tier yet.                                                                                                                                                                                                                  |
| `settings.json` file-backed editing                                | ✗ Deferred | Browser app. A future iteration may add an import/export-JSON path through the editor.                                                                                                                                               |
| Declarative `package.json#contributes.configuration`               | ✗ Deferred | Same `contributes` deferral as every other kind (ADR-0003).                                                                                                                                                                          |
| Settings cleanup for uninstalled extensions                        | ✗ Deferred | Orphaned persisted values accumulate. Trigger: orphan accumulation causes observable issue, OR an "uninstall extension" UX is built.                                                                                                 |
| Migration hooks for schema changes                                 | ✗ Deferred | Schema-incompatible persisted values fall back to default + warn. Trigger: a real consumer's schema change loses user state in a way that warrants a hook.                                                                           |
| Capability declarations for settings reads/writes                  | ✗ Deferred | All extensions can read all settings; only owning extension can register schema. Trigger: rolls in with the broader capability-declaration iteration (ADR-0003).                                                                     |
| `storage` event listener for cross-tab / devtools live-sync        | ✗ Deferred | Devtools edits require reload to take effect. Trigger: cross-tab use surfaces, OR operator workflow needs live-reload.                                                                                                               |
| `enumDescriptions`, `markdownDescription`, `order`, `tags`, `deprecationMessage` | ✗ Deferred | All UI-rendering metadata; no editor consumer in v1. Add per-field with the editor iteration.                                                                                                                                        |
| Multi-key transactional `update`                                   | ✗ Deferred | Single-key `update` only; multi-key writes are sequential. Trigger: a consumer needs atomic multi-update semantics (rare).                                                                                                           |
| Settings synchronization (cloud sync, profiles)                    | ✗ Deferred | Far future. Same scope as VS Code's Settings Sync.                                                                                                                                                                                   |

## Testing

**`@gcscode/extension-api`:** type-only — no runtime tests; types compile-checked by `pnpm check`.

**`@gcscode/shell` unit tests** (Vitest, no DOM unless noted):

- **Configuration store happy path** (5 tests):
  - `registerConfiguration` adds schema; `get(key)` returns default before any update.
  - `update(key, value)` persists to localStorage and `get(key)` reflects the new value.
  - `onDidChangeConfiguration` listener fires on `update`; receives event with `affectsConfiguration(section)` returning true for the changed key's prefix.
  - `affectsConfiguration` returns true for exact key, true for prefix-match, false for unrelated section.
  - `has(key)` returns true when persisted, false otherwise; `inspect(key)` returns `{ defaultValue, globalValue }` correctly.
- **Schema validation** (5 tests):
  - `registerConfiguration` with invalid `default` throws.
  - `registerConfiguration` with valid `default` succeeds.
  - `update(key, invalid-value)` rejects with ajv error.
  - Boot-time: persisted value violating schema → `console.warn` fired and `get(key)` returns schema default (does not return the bad persisted value).
  - Boot-time: persisted value matching schema → `get(key)` returns the persisted value.
- **Registration discipline** (3 tests):
  - Duplicate `registerConfiguration` for same key throws.
  - `registerConfiguration` with key not starting with `<extension-id>.` throws.
  - Disposing the `registerConfiguration` Disposable removes the schema but leaves the persisted value (re-register sees it).
- **Cross-extension behavior** (2 tests):
  - Extension A registers `a.foo`; extension B can read `a.foo` via `getConfiguration().get('a.foo')`.
  - Extension B's `update('a.foo', ...)` succeeds (cross-extension writes are permitted as long as the schema exists).
- **`update` with unregistered key** (1 test):
  - Throws `No schema registered for "<key>"`.
- **`update` with Workspace / WorkspaceFolder target** (2 tests):
  - Each throws `Target not supported in v1`.
- **Persistence roundtrip** (2 tests):
  - `update` mutates `localStorage['gcscode.configuration']`; reading the blob gives the expected JSON.
  - Boot reads the blob; values are available immediately to `get` before any `registerConfiguration` (returns `undefined` until schema registers, then returns the persisted value).

**Component-level tests** (`@testing-library/svelte` + jsdom — already configured):

- Reactive read: a Svelte component reads `host.configuration.getConfiguration('test').get('value')` inside a `$derived`. Update the value via the store; assert re-render with new value (1 test).

**`@gcscode/extension-sitl` tests:**

- `activate` registers `gcscode.sitl.connectionUrl` with the expected schema + default (1 test).
- On `onDidChangeConfiguration` event matching `gcscode.sitl.connectionUrl`, the reconnect path is invoked with the new URL (1 test).

## `docs/out-of-scope.md` propagation

When this iteration ships, the docs commit makes these exact edits:

- **Update the existing "Event bus, settings, themes, i18n" row.** Today it reads "Extensions have six verbs today: `host.window.registerView`, `host.window.registerStatusBarItem`, `host.commands.registerCommand`, `host.keybindings.registerKeybinding`, `host.commands.executeCommand`, and `host.extensions.getExtension`. The remaining items are deferred until there is a real consumer (e.g. settings UI, theme switcher, command-fired event, localized string lookup)." Update to reflect that settings (the substrate) has landed; the row now lists "events, themes, i18n" as remaining; verb count grows (add `host.configuration.registerConfiguration`, `host.configuration.getConfiguration`, `host.configuration.onDidChangeConfiguration`); the "settings UI" example becomes "events bus, theme switcher, localized string lookup."
- **Update the existing "User-overridable keybindings" row.** Today it reads "No `keybindings.json`-equivalent override file or settings UI. Extension-registered keybindings are the only source. _Trigger to revisit:_ users complain about extension keybinding conflicts, or a settings system lands." Append a status note: "**Status note:** the settings substrate landed in `specs/2026-05-18-configuration-system-v1.md`; the second half of the trigger has fired. The user-overridable-keybindings concept still needs its own design — this status note marks the row as ready-for-re-evaluation, not auto-in-scope."
- **Add a new "Settings editor UI" row** under "Extension machinery": "No overlay, no widgets, no JSON view. Operators flip values via browser devtools (`localStorage` blob + reload). _Trigger to revisit:_ operator UX feedback OR a second real setting consumer landing. Substrate: `specs/2026-05-18-configuration-system-v1.md`."
- **Add a new "Workspace + WorkspaceFolder configuration targets" row**: "`ConfigurationTarget.Workspace` and `WorkspaceFolder` are exposed in the enum but throw on `update`/`inspect`. _Trigger to revisit:_ a workspace or workspace-folder concept lands in gcscode."
- **Add a new "Settings cleanup for uninstalled extensions" row**: "Persisted values for removed extensions accumulate as orphans in the configuration blob. _Trigger to revisit:_ orphan count becomes observable, OR an extension-uninstall UX is built."
- **Add a new "Settings schema migration hooks" row**: "Schema-incompatible persisted values fall back to the new default + log a warning. No declared migration path. _Trigger to revisit:_ a real consumer's schema change loses user state in a way that warrants a hook."
- **Add a new "Live-sync of devtools-edited localStorage" row**: "No `window.addEventListener('storage', …)` listener; devtools edits require a reload to take effect. _Trigger to revisit:_ cross-tab use surfaces OR operator workflow needs live-reload."
- **Leave the existing "Per-extension persistent state (`globalState` / `workspaceState`)" row in place.** Settings ≠ extension-owned key/value storage; that concept stays deferred independently.

## `docs/vs-code-alignment.md` propagation

Append the rows from the VS Code alignment table above to the cumulative ledger when the iteration ships.

## `docs/roadmap.md` propagation

- Add a new line under Phase C: **`C3: Configuration system v1`** — checked, linked to this spec.
- Update the existing `C3+: events, settings, themes, i18n — TBD` line to read `C4+: events, themes, i18n — TBD` (settings dropped from the list).
- Under "Feature extensions / Considering", consider adding a new entry for the settings editor UI as "Considering". Default to **Considering** per the agent-memory convention `feedback_capture_chat_ideas_in_roadmap.md`.

## Known unknowns

- **Whether the JSON-Schema-only-no-DSL choice will feel ergonomic once a real second consumer lands.** The substrate doesn't constrain a future ergonomic helper; an `defineSetting<T>({ ... })` builder could be added additively in `@gcscode/extension-api` if hand-writing JSON Schema becomes a friction point. Re-evaluate when the second consumer ships.
- **Whether `update`'s `Promise<void>` return is correct forward-compat or just ceremony.** localStorage is synchronous; the Promise resolves on next microtask. The forward-compat bet is that future backends (workspace storage, remote sync) are async. Re-evaluable when workspace storage lands; making it sync later would be a non-breaking shape change (callers using `.then()` continue to work).
- **Whether "fall back to default on schema mismatch at boot" loses too much user state in practice.** The trade-off is "app boots cleanly" vs "user's intentional value is silently dropped." For a single string URL it's clearly safe; for a complex object schema it could be lossy. Re-evaluable when a real consumer ships a schema change that breaks an existing persisted value.
- **Whether the `<extension-id>.` prefix enforcement is too strict.** VS Code lets the `editor` namespace span multiple registrations across the built-in workbench. gcscode's strict-prefix rule means an extension can only register settings under its own id. If a "shared" namespace becomes desirable (e.g., a `gcscode` prefix that multiple built-in extensions contribute to), we'd need a relaxation. Re-evaluable when the workbench extension wants to share a `gcscode.workbench.*` namespace with another built-in.

## Open questions

None at spec-write time. All settled in brainstorm transcript (2026-05-18).
