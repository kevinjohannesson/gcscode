# Phase C3 — Configuration system v1

**Status:** Approved (2026-05-18)

## Context

Phase A landed contribution kinds (status bar, commands, keybindings). Phase B landed lifecycle (deactivate, enable/disable, per-extension manifest). Phase C1/C2 landed `ExtensionHost` namespacing and a discoverability surface (command palette). The roadmap's remaining `C3+` line lists "events, settings, themes, i18n — TBD. Each lands as a new namespace under `host.*` when a feature extension pulls on it."

A real consumer pulls on settings now. `@gcscode/extension-sitl` hardcodes its mavlink2rest WebSocket base URL (`ws://localhost:8088/v1/ws/mavlink`, composed with a compile-time `FILTER` regex into the final URL — see `packages/extension-sitl/src/index.ts` lines 28-29). Operators running a non-default mavlink2rest bridge cannot point gcscode at it without editing source and rebuilding. That is the first concrete trigger; this iteration ships the substrate to remove the hardcode.

C3 v1 adds a new `host.configuration.*` namespace exposing the runtime read/write/observe API for typed, persisted, schema-validated settings. The surface mirrors VS Code's `vscode.workspace.getConfiguration` / `onDidChangeConfiguration` at the call site; the schema-declaration shape diverges to imperative `registerConfiguration` inside `activate(context)` (per ADR-0002, ADR-0003). The settings editor UI is deliberately out of v1 — the substrate lands first; the editor follows when a second consumer or operator UX feedback pulls on it.

This iteration touches extension API surface, host↔extension boundary, lifecycle, and conflict resolution. The Extension architect routing heuristic per [`docs/specs/2026-05-17-reviewer-routing-and-domain-expert.md`](2026-05-17-reviewer-routing-and-domain-expert.md) applies; controller dispatches per the auto-dispatch obligation.

## Why not the bigger version

Three larger versions of this iteration were considered and rejected:

1. **"Settings + editor in one iteration."** Rejected because the editor is a meaningful UI design effort in its own right (search, type-aware widgets, category grouping, JSON view, reset-to-default), and the substrate's correctness can be validated through one real consumer (`gcscode.sitl.connectionUrl`) plus devtools edits. Decoupling lets us learn from the substrate before committing UX choices.

2. **"Full VS Code parity: workspace + folder scopes, declarative `contributes.configuration`, settings.json file."** Rejected because gcscode has no workspace concept and no filesystem (browser SPA), and declarative `contributes` arrays are deferred at the architecture level per ADR-0003. Importing the full VS Code shape now would either fake those concepts (storing per-folder settings without a real folder concept) or ship dead-code shapes.

3. **"Defer settings until N=2 consumers pull."** Rejected because the first consumer (SITL URL) is concrete and operator-needed, and the architecture lays in cleanly per existing precedents (namespace + Disposable + reactive store). Waiting for a second consumer would force the SITL extension to ship a one-off localStorage read in the interim, which is the wrong direction.

The v1 cut also excludes a typed-helper DSL (`defineSetting<T>(...)`) on top of raw JSON Schema. That's strict YAGNI — the substrate hands extensions a `JSONSchema7` type from `@types/json-schema`, which is the standard shape. A DSL helper is additive when authors find friction.

## Goals

1. **`@gcscode/extension-sitl` reads its WebSocket base URL from `host.configuration`** with no rebuild required; operators flip the value via browser devtools + reload. The hardcoded `WS_URL` constant in `packages/extension-sitl/src/index.ts` is replaced by a configuration read.
2. **All writes validate at the API surface.** `update(key, value, target)` rejects the returned Promise on schema mismatch, on unregistered key, and on unsupported target.
3. **The substrate does not preclude a future editor.** JSON Schema is the registered shape; the schema's full expressive power (`type`, `enum`, `format`, `description`, etc.) is available for a future editor to render.
4. **Reads inside Svelte `$derived` / template contexts auto-track** via the shell's `SvelteMap`-backed store, so framework consumers don't need to wire `onDidChangeConfiguration` for the common case.
5. **VS Code call-site shape is preserved for the runtime API** (`getConfiguration`, `get/has/inspect/update`, `onDidChangeConfiguration`). Extension code reading or writing settings looks identical to VS Code's equivalent at the method-call layer; the namespace name differs (`host.configuration` vs `vscode.workspace`) and the schema-declaration shape differs (imperative vs declarative).
6. **Behavior of every stub-by-throw path is explicit.** `update` with `Workspace`/`WorkspaceFolder` rejects the Promise (not synchronous throw); the documented feature-detection pattern is "only pass `Global` in v1; the enum's other values cause `update()` to reject the Promise."

## Non-goals (this iteration)

- **Settings editor UI** (overlay, type-aware widgets, search, categories, JSON view). Operators flip values via browser devtools.
- **Functional `ConfigurationTarget.Workspace` / `WorkspaceFolder`.** Enum is exposed; the non-`Global` paths reject. No workspace concept exists in gcscode yet.
- **Cascading override resolution** across multiple targets. Single Global tier; no inheritance / override semantics.
- **Declarative `contributes.configuration` in `package.json`.** Same `contributes` deferral as every other contribution kind (ADR-0003).
- **Per-extension `globalState` / `workspaceState`.** Distinct concept (extension-owned opaque key/value, no schema). The existing `docs/out-of-scope.md` row's trigger fires here in part — "or a settings system that should also expose extension-scoped storage" — but v1 deliberately does NOT extend; settings is user-visible-schema'd state, not extension-private storage. See propagation section for the explicit decision.
- **Migration hooks** for schema changes. Schema-incompatible persisted values fall back to default + warn.
- **Capability declarations** gating which extension can read/write which settings. v1 trust model: any extension can read any registered key; any extension can write any registered key (the strict-prefix rule applies only at registration). This mirrors VS Code; the broader capability-declaration iteration (ADR-0003) revisits.
- **`storage` event listener** for cross-tab or devtools live-sync. Devtools edits require a reload.
- **Multi-key transactional `update`.** Single-key writes only.
- **Settings sync** across machines.
- **Generalized `Event<T>` primitive.** `onDidChangeConfiguration` ships with `(listener) => Disposable` signature; a future events-substrate iteration may introduce a shared `Event<T>` shape, at which point this signature is intentionally compatible. Commit-by-default: this signature stays.

## Architecture

### API additions to `@gcscode/extension-api`

```ts
import type { JSONSchema7 } from 'json-schema';

/**
 * Re-export of `JSONSchema7` from `@types/json-schema` (added to
 * `@gcscode/extension-api`'s dependencies). Extensions get compile-time help
 * on schema shape errors. ajv validates the runtime shape.
 */
export type { JSONSchema7 } from 'json-schema';

export const ConfigurationTarget = {
  Global: 1,
  Workspace: 2, // update() rejects in v1
  WorkspaceFolder: 3, // update() rejects in v1
} as const;
export type ConfigurationTarget =
  (typeof ConfigurationTarget)[keyof typeof ConfigurationTarget];

/**
 * A configuration contribution registers a single setting key with its JSON
 * Schema and default value. The full key must start with the registering
 * extension's id (e.g. extension `gcscode.sitl` may register
 * `gcscode.sitl.connectionUrl`). Registration is enforced exactly-once: a
 * second `registerConfiguration` for the same key throws.
 *
 * The numeric values of `ConfigurationTarget` are part of the API contract
 * and stable across versions: `Global = 1`, `Workspace = 2`, `WorkspaceFolder = 3`.
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
 * Section-scoped reader/writer over the configuration store. Returned by
 * `host.configuration.getConfiguration(section?)`. With a section, keys are
 * implicitly prefixed (e.g. `getConfiguration('gcscode.sitl').get('connectionUrl')`
 * reads the full key `'gcscode.sitl.connectionUrl'`).
 *
 * Cross-section / cross-extension reads are permitted: any extension can
 * read or write any registered key (registration enforces the prefix, but
 * post-registration access is open). This mirrors VS Code; the
 * capability-gating iteration (per ADR-0003) revisits.
 */
export interface WorkspaceConfiguration {
  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  has(key: string): boolean;
  /**
   * Returns the inspection record for `key` if a schema is registered, or
   * `undefined` if no schema is registered for that key. The record's
   * `defaultValue` and `globalValue` fields are each optional independently —
   * a registered key with no default and no persisted value returns
   * `{ key, defaultValue: undefined, globalValue: undefined }`. Workspace
   * and workspace-folder fields land additively when scope expands.
   */
  inspect<T>(key: string):
    | {
        key: string;
        defaultValue?: T;
        globalValue?: T;
      }
    | undefined;
  /**
   * Persists `value` against `key`.
   *
   * Rejection semantics:
   * - No schema registered for `key` → rejects with
   *   `Error('No schema registered for "<key>"')`.
   * - `value` violates the registered schema → rejects with
   *   `Error('Value for "<key>" does not match schema: <ajv-error-summary>')`.
   * - `target === ConfigurationTarget.Workspace` or `WorkspaceFolder` →
   *   rejects with `Error('Target not supported in v1')`. NOT a synchronous
   *   throw — async caller code using `.catch` or `await + try/catch` works.
   * - Persistence failure (localStorage quota / disabled / security context) →
   *   rejects with `Error('Persistence failed: <reason>')`. The in-memory
   *   value HAS been committed and listeners HAVE fired before this rejection
   *   (see "Write semantics rationale" below); a rejected Promise here means
   *   the change is not durable across reloads.
   */
  update(
    key: string,
    value: unknown,
    target?: ConfigurationTarget,
  ): Promise<void>;
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
   * Throws (synchronously) if:
   *   - `key` does not start with `<extension-id>.`
   *   - a contribution for `key` is already registered
   *   - `default` (if provided) does not validate against `schema`
   *
   * Any persisted value for `key` in localStorage that fails to validate
   * against `schema` is logged (`console.warn`) and treated as absent for read
   * purposes (so `get(key)` returns the schema default). The bad value is NOT
   * overwritten in localStorage — re-validation will succeed if the schema
   * later loosens. (See known sharp edges in Operator UX section.)
   */
  registerConfiguration(contribution: ConfigurationContribution): Disposable;

  /**
   * Return a section-scoped reader/writer. `section` is an optional prefix
   * (e.g. 'gcscode.sitl'); the returned object's `get('foo')` reads the full
   * key `'gcscode.sitl.foo'`.
   */
  getConfiguration(section?: string): WorkspaceConfiguration;

  /**
   * Subscribe to setting changes. Listener fires after each `update()`
   * resolves (one listener invocation per `update()` call; no coalescing in
   * v1). Does NOT fire for the initial boot-time registration sweep, nor on
   * `registerConfiguration`. Returns a Disposable.
   *
   * `(listener) => Disposable` is the gcscode event-shape convention.
   * A future events-substrate iteration may introduce a shared `Event<T>`
   * primitive; this signature is intentionally compatible.
   */
  onDidChangeConfiguration(
    listener: (e: ConfigurationChangeEvent) => void,
  ): Disposable;
};
```

The namespace placement follows ADR-0006: settings is a cross-cutting capability, so it gets its own top-level namespace under `host.*` rather than slotting into `host.window` / `host.commands` / `host.keybindings` / `host.extensions`. The namespace name `configuration` (rather than `workspace.configuration` like VS Code) is a deliberate v1 divergence — gcscode has no workspace concept, so `workspace.*` would be misleading. If the workspace concept lands later and gains its own namespace (e.g. workspace folders, FS APIs), the configuration verbs may be re-namespaced under it; this is a v2 question.

### Host implementation — configuration store

A new module `packages/shell/src/configuration/configuration-store.svelte.ts` implements the store, following the project class-style convention demonstrated in `packages/shell/src/quick-pick/quick-pick-state.svelte.ts` and similar `.svelte.ts` modules: explicit `private`/`public`, `_backingField` underscore convention, get/set accessors, business logic in the class. Components are renderers.

```ts
// Sketch — full implementation lands in the plan.
class ConfigurationStore {
  private _schemas = new SvelteMap<string, CompiledSchemaEntry>();
  private _values = new SvelteMap<string, unknown>();
  private _listeners = new Set<(e: ConfigurationChangeEvent) => void>();

  public registerConfiguration(
    contribution: ConfigurationContribution,
    extensionId: string,
  ): Disposable {
    /* validate prefix, validate default, compile schema via ajv,
       re-validate persisted value if present, store schema entry */
  }

  public getConfiguration(section: string | undefined): WorkspaceConfiguration {
    /* return a WorkspaceConfiguration wrapper that closes over `section`
       and reads the store via the SvelteMap reads, so reads inside
       reactive contexts auto-track */
  }

  public onDidChangeConfiguration(
    listener: (e: ConfigurationChangeEvent) => void,
  ): Disposable {
    /* add to _listeners; return Disposable */
  }

  // Used by WorkspaceConfiguration.update().
  public async update(
    fullKey: string,
    value: unknown,
    target: ConfigurationTarget,
  ): Promise<void> {
    /* see Write semantics below */
  }
}
```

The store is instantiated once at shell boot, before extension activation. The shell's `ExtensionHost` factory (`createHost(extensionId)`) wires `host.configuration` to this single shared store, passing `extensionId` into `registerConfiguration` for prefix enforcement.

### Reactive integration — mechanism

The `WorkspaceConfiguration` returned by `getConfiguration(...)` is a closure over the store. Its `get(key)` reads the store's `_values: SvelteMap<string, unknown>` directly inside the call body. When the read happens inside a Svelte `$derived` or template context, Svelte's reactivity captures the map-key dependency; subsequent mutations to that key (via `update()`) re-evaluate the derived / re-render the template.

**This mechanism is structurally distinct from ADR-0005's cross-extension exports.** ADR-0005 returns producer-owned `$state` proxies; reads of `exports.telemetry.lat` track because `telemetryState` is a `$state` proxy with property-level reactivity. Configuration is host-owned state; reads track because `SvelteMap` exposes map-key reactivity. Both surfaces present the same Svelte-consumer ergonomics but the underlying primitive differs. Documentation in `packages/extension-api/README.md` will be explicit on which mechanism applies where, so extension authors know whether caching a read into a local variable loses tracking (in both cases: yes — auto-tracking requires reading inside the reactive context).

Non-Svelte consumers (extension `activate` logic, command handlers, plain JS) use `onDidChangeConfiguration` + manual re-read. Both surfaces are documented; the table in `packages/extension-api/README.md` will note when to reach for each.

### Write semantics — listener-before-persist ordering

`update(key, value, target)` executes:

1. **Validate** — schema present check, schema-match check, target-Global check. On any failure, reject the Promise with the corresponding error. In-memory and persisted state unchanged.
2. **Commit in-memory** — mutate `_values` (the `SvelteMap`).
3. **Fire listeners synchronously** — invoke each listener in `_listeners` with a `ConfigurationChangeEvent` for the changed key. Listeners run before persistence completes.
4. **Persist via read-modify-write** — `JSON.parse(localStorage.getItem('gcscode.configuration') ?? '{}')`, merge the touched key, `localStorage.setItem(...)`. The R-M-W preserves orphan keys (from removed extensions) and bad-but-untouched persisted values. If the persist step throws (quota exceeded / storage disabled / security context — see the precedent in `packages/shell/src/extension-host/extension-persistence.ts` lines 36-43), the Promise rejects with `Error('Persistence failed: <reason>')`. The in-memory commit and the listener invocations are NOT rolled back.

**Why listeners fire before persistence:** persistence might reject; listeners must still run because the in-memory commit is what every reactive read sees. Rolling back the in-memory commit on persist failure would be more semantically clean but introduces re-entrancy risk (a listener fired before the rollback would have observed a state that no longer exists). The chosen ordering accepts the tradeoff: durability is best-effort, observable state is authoritative.

**If the boot-loaded blob is corrupted (JSON.parse fails):** the store starts with an empty `_values` and logs the parse error. Subsequent `update()` calls overwrite the blob via the same R-M-W path; the corrupted blob is replaced on first write. This is a known sharp edge — operators editing localStorage by hand can corrupt the blob; the failure mode is "all settings revert to defaults on reload" with a `console.warn`.

**Concurrent `update()` calls within a microtask:** the in-memory `SvelteMap` writes are serialized synchronously (JS is single-threaded). The persist path is queued via microtask — `update(a, 1)` and `update(b, 2)` issued back-to-back each go through their own R-M-W on `localStorage`. localStorage doesn't have a CAS primitive, so within a single tab a second R-M-W reads the first's already-written blob and merges correctly. **Cross-tab concurrent writes** can race; out-of-scope for v1 (single-tab assumed).

### Persistence

- **Backend:** `window.localStorage`.
- **Key:** `gcscode.configuration` (single key).
- **Value:** JSON-serialized object `{ [fullKey: string]: unknown }`.
- **Read semantics at boot:** the store loads the blob into `_values` before any extension activates. Schemas register later; per-key re-validation happens at each `registerConfiguration` call.
- **JSON-serializability:** the schema validator does NOT verify that a value is JSON-serializable. A schema that allows arbitrary objects could accept a value containing functions, BigInts, or circular refs; `JSON.stringify` would throw at persist time, rejecting the `update()` Promise. v1 documents this as a known constraint — schema authors should keep schemas to JSON-friendly types. Future iteration could add an explicit serializability check.
- **Bundle cost:** `ajv@8` plus `ajv-formats@3` adds ~37 KB gzipped to the shell SPA. Accepted; the schema validation is load-bearing for the substrate's correctness story.

### Validation rules

- **At `registerConfiguration`** — compile the schema once (ajv caches the compiled validator). Validate the `default` (if provided); throw on failure. Validate any persisted value for the same key; on failure, `console.warn` with `[configuration] persisted value for "<key>" violates schema; falling back to default` and remove the key from the in-memory `_values` map. The persisted blob in localStorage is NOT modified (so the bad value stays in storage until the next `update(key, ...)` overwrites it — a deliberate choice to allow recovery if the schema later loosens).
- **At `update`** — validate the incoming value against the schema. On failure, reject the Promise with the ajv error summary.
- **At `get`** — no validation. Reads are O(1) lookups against the in-memory map; values have already been validated at write time or rejected at registration time. Keys whose persisted value failed validation are absent from the in-memory map, so `get(key)` falls back through `schema-default → defaultValue-arg → undefined` in that order.

### Lifecycle

- **Boot order:** (1) shell creates the configuration store and loads the localStorage blob into `_values`. (2) Built-in `workbench` extension activates. (3) Bundled extensions activate in `bundledExtensions` array order. Each extension's `activate()` is currently synchronous (`activate(context: ExtensionContext): unknown`), so each `registerConfiguration` call completes before the next extension activates. Per-key re-validation happens at each `registerConfiguration`.

- **Extension disable** (`registry.deactivate(extensionId)`): the configuration `Disposable` returned by `registerConfiguration` removes the schema entry from `_schemas`. **The in-memory `_values` entry for the extension's registered key is cleared at this point**, so reads through `WorkspaceConfiguration.get(key)` between deactivate and re-activate return `undefined`. The localStorage blob is NOT modified — the persisted value stays, so re-activation re-validates it against the schema and either re-populates `_values` (validation passes) or falls back to default (validation fails). Listener Disposables returned by `onDidChangeConfiguration` follow the standard pattern — extensions push them to `context.subscriptions` and they're disposed during `deactivate`.

- **Schema mismatch across re-registers**: identical to the boot-time path — `console.warn` + fall back to default + persisted value stays untouched.

- **Cross-extension write before producer activates**: `update()` rejects with `No schema registered`. The recommended pattern is **bundled-activation-order reliance**: the `bundledExtensions` array is the canonical order; consumers of cross-extension settings ensure the producer is listed first (the same way `host.extensions.getExtension(id)?.exports` consumers handle activation order per ADR-0005). For consumers reading from a Svelte template, the `$derived` re-evaluates when the producer's schema landing populates the underlying `SvelteMap`; the wrapper's `has(key)` flips true on next read. For non-Svelte consumers, polling `has(key)` is the v1 escape hatch. A dedicated `onDidRegisterConfiguration` event is deferred (lands with the events-substrate iteration if/when it materializes).

### First consumer — `@gcscode/extension-sitl`

The SITL extension's WebSocket base URL becomes a configuration read. The hardcoded `WS_URL` in `packages/extension-sitl/src/index.ts` lines 28-29 is replaced. The setting is the **base URL only**; the compile-time `FILTER` regex stays in the extension and is composed into the final URL at use time. This decouples operator concerns (where to point) from developer concerns (which mavlink message types to subscribe to).

```ts
// inside extension-sitl's activate(context):
const FILTER = '^(HEARTBEAT|GLOBAL_POSITION_INT|ATTITUDE|VFR_HUD|SYS_STATUS)$';

context.subscriptions.push(
  context.host.configuration.registerConfiguration({
    key: 'gcscode.sitl.connectionUrl',
    schema: {
      type: 'string',
      format: 'uri',
      description:
        'WebSocket base URL of the mavlink2rest bridge. The extension appends a `?filter=…` query string from its compile-time message-type allowlist.',
    },
    default: 'ws://localhost:8088/v1/ws/mavlink',
  }),
);

const cfg = context.host.configuration.getConfiguration('gcscode.sitl');
const baseUrl = cfg.get<string>('connectionUrl', 'ws://localhost:8088/v1/ws/mavlink');
const url = `${baseUrl}?filter=${encodeURIComponent(FILTER)}`;
// open WebSocket to `url`...

// React to changes — tear down + reconnect:
context.subscriptions.push(
  context.host.configuration.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('gcscode.sitl.connectionUrl')) {
      const newBase = cfg.get<string>('connectionUrl', 'ws://localhost:8088/v1/ws/mavlink');
      const newUrl = `${newBase}?filter=${encodeURIComponent(FILTER)}`;
      // close existing WebSocket; reopen with newUrl
    }
  }),
);
```

Notes on the type signature: `cfg.get<string>('connectionUrl', defaultArg)` uses the two-arg form which returns `T` (not `T | undefined`), since a default is passed. The schema's `default` field is independent of the API's `defaultValue` parameter — the schema default is what `get(key)` without a default-arg returns when a registered key has no persisted value; the `defaultValue` arg is what `get(key, defaultValue)` returns when the key isn't registered or has no value. v1 documents both; later iterations could narrow the types so that `default` being required implies the no-default-arg form also returns `T`.

The reconnect-on-change wiring is part of v1 — without it, the substrate is half-validated. A unit test asserts the reconnect path fires when `update` lands a new URL.

### Operator UX in v1 — known sharp edges

No settings editor. Operators flip `gcscode.sitl.connectionUrl` via the browser devtools console:

```js
const cfg = JSON.parse(localStorage.getItem('gcscode.configuration') ?? '{}');
cfg['gcscode.sitl.connectionUrl'] = 'ws://192.168.1.42:8088/v1/ws/mavlink';
localStorage.setItem('gcscode.configuration', JSON.stringify(cfg));
location.reload(); // settings store reads blob at boot; no live-reload of localStorage in v1
```

**Known sharp edges of the devtools-only path:**

- **Silent validation failure on reload.** If an operator's devtools edit produces a value that violates the schema, the substrate logs `console.warn` at boot but otherwise behaves as if the edit didn't happen — `get(key)` returns the default. Operators not watching the console see "I changed it, it didn't take." There is no UI surface for this failure in v1. A status-bar boot banner is the candidate fix; routed to Future iterations.
- **Devtools edit + reload sequence is required.** No `window.addEventListener('storage', ...)` listener; in-page changes only land on reload. Cross-tab edits also don't propagate.
- **Persistence failure on `update()`.** When localStorage is unavailable (quota exceeded, storage disabled by policy, private-browsing restrictions, security context), `update()` rejects with `Error('Persistence failed: <reason>')`. In v1 there is no UI surface for this — operators discover the failure only through the rejected Promise (extension code that catches and logs) or via devtools. A status-bar / toast surface is the candidate fix; routed to Future iterations under "Visible boot-time signal" (the same fix-class as silent-schema-rejection).
- **`update()` from extension code is the in-app path** and validates synchronously; only the devtools path bypasses validation until the next reload.

Documented in the `@gcscode/extension-api` README and the extensions panel's settings section (the latter is the future editor's hook).

### Implementation surface summary

Files touched / added:

- `packages/extension-api/package.json` — add `@types/json-schema@^7` to `dependencies` (type-only; erases at compile).
- `packages/extension-api/src/index.ts` — add `JSONSchema7` re-export; `ConfigurationTarget` const + type; `ConfigurationContribution`, `ConfigurationChangeEvent`, `WorkspaceConfiguration` interfaces; add `configuration` namespace to `ExtensionHost`.
- `packages/shell/src/configuration/configuration-store.svelte.ts` — new (class wrapper for the store + schema map + values map + listeners).
- `packages/shell/src/configuration/workspace-configuration.ts` — new (the `WorkspaceConfiguration` wrapper closure factory).
- `packages/shell/src/configuration/persistence.ts` — new (localStorage read/write helpers, error-handling wrapped per the precedent in `extension-persistence.ts`).
- `packages/shell/src/extension-host/registry.ts` — wire `host.configuration` into `createHost(extensionId)`, passing `extensionId` for prefix enforcement.
- `packages/extension-sitl/src/index.ts` — register `gcscode.sitl.connectionUrl`, read at activate, wire reconnect on `onDidChangeConfiguration`.
- `packages/shell/package.json` — add `ajv@^8` + `ajv-formats@^3`.
- `packages/extension-api/README.md` — document the `host.configuration` namespace, the reactive-mechanism distinction from ADR-0005, the operator UX sharp edges, and the cross-extension write+read trust posture.

## Validation

**`@gcscode/extension-api`:** type-only — no runtime tests; types compile-checked by `pnpm check`. Specifically verify that `WorkspaceConfiguration.update`'s return type is `Promise<void>` and `inspect` returns `... | undefined`.

**`@gcscode/shell` unit tests** (Vitest, no DOM unless noted):

- **Configuration store happy path** (5 tests):
  - `registerConfiguration` adds schema; `get(key)` returns default before any update.
  - `update(key, value)` persists to localStorage and `get(key)` reflects the new value.
  - `onDidChangeConfiguration` listener fires on `update`; receives event with `affectsConfiguration(section)` returning true for the changed key's prefix.
  - `affectsConfiguration` returns true for exact key, true for prefix-match, false for unrelated section.
  - `has(key)` returns true when persisted, false otherwise; `inspect(key)` returns `{ key, defaultValue, globalValue }` correctly (each may be `undefined`).
- **Schema validation** (6 tests):
  - `registerConfiguration` with invalid `default` throws synchronously.
  - `registerConfiguration` with valid `default` succeeds.
  - `update(key, invalid-value)` rejects the Promise with ajv error.
  - `update` Promise rejection (not synchronous throw) for all error paths (verify via `await ... .catch(...)`).
  - Boot-time: persisted value violating schema → `console.warn` fired and `get(key)` returns schema default.
  - Boot-time: persisted value matching schema → `get(key)` returns the persisted value.
- **Registration discipline** (3 tests):
  - Duplicate `registerConfiguration` for same key throws synchronously.
  - `registerConfiguration` with key not starting with `<extension-id>.` throws synchronously.
  - Disposing the `registerConfiguration` Disposable removes the schema, clears the `_values` entry for that key, AND leaves the persisted value (re-register sees the persisted value).
- **Cross-extension behavior** (3 tests):
  - Extension A registers `a.foo`; extension B can read `a.foo` via `getConfiguration().get('a.foo')`.
  - Extension B's `update('a.foo', ...)` succeeds (cross-extension writes are permitted as long as the schema exists).
  - Reading `a.foo` from B before A activates returns the schema-default-fallback chain end (`undefined` if no defaultValue arg).
- **`update` error paths** (4 tests):
  - With unregistered key rejects `No schema registered`.
  - With Workspace target rejects `Target not supported in v1`.
  - With WorkspaceFolder target rejects `Target not supported in v1`.
  - With localStorage failure (mocked `setItem` throw) rejects `Persistence failed: ...`; verify the in-memory `_values` HAS been updated and listeners HAVE fired (per the documented write-semantics ordering).
- **Persistence roundtrip** (3 tests):
  - `update` mutates `localStorage['gcscode.configuration']`; reading the blob gives the expected JSON.
  - Boot reads the blob; values are available immediately to `get` before any `registerConfiguration` returns `undefined` (no schema → key not exposed); registration validates and exposes if pass.
  - Corrupted boot blob (invalid JSON): store starts empty, `console.warn` logged, subsequent `update` writes a clean blob.
- **Listener-before-persist ordering** (1 test):
  - `update` resolves only after persistence; but listeners observe the new value before the persist completes (using a microtask race assertion).

**Component-level tests** (`@testing-library/svelte` + jsdom — already configured):

- Reactive read: a Svelte component reads `host.configuration.getConfiguration('test').get('value')` inside a `$derived`. Update the value via the store; assert re-render with new value (1 test).

**`@gcscode/extension-sitl` tests** (Vitest):

- `activate` registers `gcscode.sitl.connectionUrl` with the expected schema + default (1 test).
- On `onDidChangeConfiguration` event matching `gcscode.sitl.connectionUrl`, the reconnect path is invoked with the new URL composed with `FILTER` (1 test).
- Without a persisted value, the initial WebSocket URL is the default `ws://localhost:8088/v1/ws/mavlink?filter=<encoded>` (1 test).

## VS Code alignment

GCScode mirrors VS Code's extension architecture **in spirit, not by byte**. The C3 v1 cut keeps the runtime call-site shape aligned and diverges on the schema declaration shape (forced by ADR-0002) and on namespace placement (forced by gcscode having no workspace concept).

| VS Code feature                                                                                                                       | C3 v1 in GCScode                                                                                                                            | Status                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vscode.workspace.getConfiguration(section?)` returning a `WorkspaceConfiguration`                                                    | `host.configuration.getConfiguration(section?)` returning a `WorkspaceConfiguration` with the same `get`/`has`/`inspect`/`update` shape     | **Aligned in spirit, namespace differs.** Method name identical; gcscode's namespace is `configuration` (vs VS Code's `workspace`) because gcscode has no workspace concept. May be re-namespaced under `host.workspace.*` when workspace concept lands. |
| `WorkspaceConfiguration.get<T>(key, defaultValue?)`                                                                                   | Same                                                                                                                                        | Aligned.                                                                                                                                                                                                        |
| `WorkspaceConfiguration.has(key)`                                                                                                     | Same                                                                                                                                        | Aligned.                                                                                                                                                                                                        |
| `WorkspaceConfiguration.inspect<T>(key)` returning `{ defaultValue, globalValue, workspaceValue, … }`                                 | `inspect<T>(key)` returning `{ key, defaultValue?, globalValue? } \| undefined`                                                             | Aligned shape; workspace/folder fields land additively when scope expands. Returns `undefined` when no schema is registered for `key` (vs VS Code's empty object for unknown keys — narrower).                  |
| `WorkspaceConfiguration.update(key, value, target?)` returning `Thenable<void>`                                                       | `update(key, value, target?)` returning `Promise<void>`. Rejects on schema mismatch / unregistered key / unsupported target / persist failure | Aligned.                                                                                                                                                                                                        |
| `ConfigurationTarget.Global` / `Workspace` / `WorkspaceFolder` — numeric values `1`/`2`/`3`                                            | Same numeric values; only `Global` functional in v1. `update` with `Workspace`/`WorkspaceFolder` **rejects the Promise** (not sync throw) with `Error('Target not supported in v1')` | Aligned numerically and shape-wise. Stubbed behaviorally (per the "in-progress stubs" precedent — partially-wired APIs with `NotImplemented`-style rejections are acceptable bridges to a future functional version). |
| `onDidChangeConfiguration(e)` + `e.affectsConfiguration(section)`                                                                     | Same shape, returning `Disposable`. Fires one event per `update()` (no coalescing in v1).                                                   | Aligned.                                                                                                                                                                                                        |
| Event signature `(listener) => Disposable`                                                                                            | Same                                                                                                                                        | Aligned in spirit. gcscode has no shared `Event<T>` substrate yet; the signature is the de-facto convention going forward.                                                                                      |
| Schema declaration shape                                                                                                              | Imperative `host.configuration.registerConfiguration({ key, schema, default? })` inside `activate(context)`                                 | **Divergent — by design.** VS Code declares schemas in `package.json#contributes.configuration`. gcscode is imperative (ADR-0002); the `contributes` manifest stays deferred (ADR-0003).                        |
| Schema language                                                                                                                       | JSON Schema Draft 07, validated by `ajv` (Draft-07 mode). Compile-time type: `JSONSchema7` from `@types/json-schema`.                       | Aligned in spirit. VS Code's schema is JSON-Schema-ish with extensions; gcscode commits to Draft 07 so the type and the validator agree on dialect. A future iteration could upgrade to Draft 2020-12 if a real consumer needs newer features (`unevaluatedProperties`, `if`/`then`/`else`, etc.).                                                                                                          |
| User vs Workspace vs Folder scopes with cascading override                                                                            | Single Global scope (localStorage). Cascading is a no-op in v1                                                                              | Stubbed.                                                                                                                                                                                                        |
| `settings.json` text-file editing                                                                                                     | None — localStorage blob only; flipped via devtools in v1                                                                                   | **Divergent — forced.** Browser app, no file backing. A future settings editor iteration provides a UX surface; raw-JSON-view is one candidate shape.                                                          |
| Cross-extension reads of registered keys                                                                                              | Permitted                                                                                                                                   | Aligned.                                                                                                                                                                                                        |
| Cross-extension writes to registered keys                                                                                             | Permitted (registration is strict-prefix; post-registration writes are open). The asymmetry is intentional and mirrors VS Code. Trust posture: ADR-0005 in-tree-mutually-trusting; future capability-gating iteration revisits. | **Aligned — but asymmetric with the prefix-enforcement-at-registration row. Asymmetry documented; capability scoping deferred.**                                                                                |
| Writes to unregistered keys                                                                                                           | Rejects Promise with `Error('No schema registered for "<key>"')`                                                                            | **Stricter than VS Code.** VS Code lets you write arbitrary keys. gcscode prefers explicit-failure-at-the-source.                                                                                              |
| Setting key prefix-must-equal-registering-extension-id (at registration only)                                                         | Enforced (`Error('Setting key "<key>" must start with "<extension-id>."')`)                                                                 | **Stricter than VS Code.** VS Code's prefix convention is opt-in; gcscode enforces it to prevent cross-extension squatting at registration time. Reads and writes after registration are open per the row above. |
| Reactive auto-tracking inside framework templates                                                                                     | `get()` reads inside Svelte `$derived` / template contexts auto-track via the shell's `SvelteMap`-backed store                              | **gcscode addition.** Mechanism distinct from ADR-0005's `$state`-proxy-property-reactivity (SvelteMap key-reactivity here vs property-reactivity there); ergonomics for the Svelte consumer are similar.       |
| Settings editor UI (search, type widgets, JSON view)                                                                                  | None in v1                                                                                                                                  | **Deferred.** Trigger: operator UX feedback OR a second real setting consumer landing.                                                                                                                          |
| Schema validation on write                                                                                                            | `update()` rejects on schema mismatch with ajv error                                                                                        | Aligned in spirit.                                                                                                                                                                                              |
| Schema validation on read of persisted values at boot                                                                                 | Validate each persisted value against its schema at `registerConfiguration` time. Mismatch → log warning, fall back to schema default       | gcscode addition over VS Code's looser behavior (VS Code keeps the bad value and renders it in the editor with a marker).                                                                                       |
| `package.json#contributes.configuration` declarative schema discovery                                                                 | None — schemas registered at runtime only                                                                                                   | **Deferred** (per ADR-0003).                                                                                                                                                                                    |

## `docs/out-of-scope.md` propagation

When this iteration ships, the docs commit makes these exact edits:

- **Update the existing "Event bus, settings, themes, i18n" row.** Today it reads "Extensions have six verbs today: `host.window.registerView`, `host.window.registerStatusBarItem`, `host.commands.registerCommand`, `host.keybindings.registerKeybinding`, `host.commands.executeCommand`, and `host.extensions.getExtension`. The remaining items are deferred until there is a real consumer (e.g. settings UI, theme switcher, command-fired event, localized string lookup)." Update to: "Extensions have nine verbs today: `host.window.registerView`, `host.window.registerStatusBarItem`, `host.commands.registerCommand`, `host.keybindings.registerKeybinding`, `host.commands.executeCommand`, `host.extensions.getExtension`, `host.configuration.registerConfiguration`, `host.configuration.getConfiguration`, and `host.configuration.onDidChangeConfiguration`. The remaining items are deferred until there is a real consumer (e.g. events bus, theme switcher, localized string lookup)." Row title becomes "**Event bus, themes, i18n.**" (settings dropped from the list since it's no longer deferred).
- **Update the existing "Per-extension persistent state (`globalState` / `workspaceState`)" row.** The trigger text "or a settings system that should also expose extension-scoped storage" partially fires: settings v1 shipped, but did NOT extend to extension-scoped opaque storage — they're distinct concepts (settings are user-visible schema'd state; globalState is extension-owned opaque key/value). Append a status note: "**Status note 2026-05-18:** the settings substrate landed in [`specs/2026-05-18-configuration-system-v1.md`](specs/2026-05-18-configuration-system-v1.md); the half-trigger about 'settings system that should also expose extension-scoped storage' did NOT fire — settings v1 is user-visible schema'd state, not extension-owned opaque storage. The row stays deferred."
- **Update the existing "User-overridable keybindings" row.** Today it reads "No `keybindings.json`-equivalent override file or settings UI. ... _Trigger to revisit:_ users complain about extension keybinding conflicts, or a settings system lands." Append a status note: "**Status note 2026-05-18:** the settings substrate landed in [`specs/2026-05-18-configuration-system-v1.md`](specs/2026-05-18-configuration-system-v1.md); the second half of the trigger has fired. The user-overridable-keybindings concept still needs its own design — this status note marks the row as ready-for-re-evaluation, not auto-in-scope."
- **Add a new "Settings editor UI" row** under "Extension machinery": "No overlay, no widgets, no JSON view. Operators flip values via browser devtools (`localStorage` blob + reload). _Trigger to revisit:_ operator UX feedback (specifically: a silent-schema-rejection failure causes confusion) OR a second real setting consumer landing. Substrate: [`specs/2026-05-18-configuration-system-v1.md`](specs/2026-05-18-configuration-system-v1.md)."
- **Add a new "Workspace + WorkspaceFolder configuration targets" row** under "Extension machinery": "`ConfigurationTarget.Workspace` and `WorkspaceFolder` are exposed in the enum but `update` rejects the Promise with `'Target not supported in v1'`. `inspect` does not take a target parameter; its return shape extends additively when workspace scope lands. _Trigger to revisit:_ a workspace or workspace-folder concept lands in gcscode."
- **Add a new "Settings cleanup for uninstalled extensions" row** under "Extension machinery": "Persisted values for removed extensions accumulate as orphans in the configuration blob. _Trigger to revisit:_ orphan count becomes observable, OR an extension-uninstall UX is built."
- **Add a new "Settings schema migration hooks" row** under "Extension machinery": "Schema-incompatible persisted values fall back to the new default + log a warning. No declared migration path. _Trigger to revisit:_ a real consumer's schema change loses user state in a way that warrants a hook."
- **Add a new "Live-sync of devtools-edited localStorage" row** under "Extension machinery": "No `window.addEventListener('storage', …)` listener; devtools edits require a reload to take effect. _Trigger to revisit:_ cross-tab use surfaces OR operator workflow needs live-reload."
- **Add a new "Visible boot-time signal for schema-validation rejection" row** under "Extension machinery": "When `registerConfiguration` finds a persisted value that violates the schema, it logs `console.warn` and falls back to default. No status-bar or boot-banner UI surface communicates this to the operator. _Trigger to revisit:_ first operator-confusion report from a silent-rejection event."
- **Add a new "Generalized `Event<T>` substrate" row** under "Extension machinery": "`onDidChangeConfiguration(listener: (e) => void): Disposable` is the gcscode event-shape convention. No shared `Event<T>` primitive yet. _Trigger to revisit:_ a second event-shaped API lands and either reuses the same signature (no substrate needed) or wants richer semantics (filtering, replay, priority — substrate iteration warranted)."
- **Add a new "Cross-extension settings write capability gating" row** under "Extension machinery": "Any extension can `update` any registered key in v1. No capability declaration / per-extension scoping. _Trigger to revisit:_ the broader capability-declaration iteration (ADR-0003) OR the first untrusted extension iteration."

## `docs/vs-code-alignment.md` propagation

Append the rows from the VS Code alignment table above to the cumulative ledger when the iteration ships. Each row gets one line in the table.

## `docs/roadmap.md` propagation

- Add a new line under Phase C: **`C3: Configuration system v1`** — checked, linked to this spec.
- Update the existing `C3+: events, settings, themes, i18n — TBD` line to read `C4+: events, themes, i18n — TBD` (settings dropped from the list).
- Under "Feature extensions / Considering", add a new entry **"Settings editor UI"** at "Considering" status with the trigger language from the corresponding out-of-scope row.

## Known unknowns

- **Whether `default` field on `ConfigurationContribution` should be required when callers want type-safe `get()` without `!`.** Currently `default?` is optional and `get<T>(key)` returns `T | undefined`. Authors who provide a `default` are forced to either pass it again as the second arg to `get()` (redundant) or use `!` to silence the optional. A future iteration could narrow the types: `default: T` (required) implies `get(key)` returns `T`. Out of scope for v1; revisit when a second consumer ships.
- **Whether the JSON-Schema-only-no-DSL choice will feel ergonomic once a real second consumer lands.** A `defineSetting<T>(...)` builder could be added additively. Re-evaluate when the second consumer ships.
- **Whether `update`'s `Promise<void>` return is correct forward-compat or just ceremony.** localStorage is synchronous; the Promise resolves on next microtask. The forward-compat bet is that future backends (workspace storage, remote sync) are async. Re-evaluable when workspace storage lands.
- **Whether "fall back to default on schema mismatch at boot" loses too much user state in practice.** Trade-off is "app boots cleanly" vs "user's intentional value is silently dropped." For a single string URL it's clearly safe; for a complex object schema it could be lossy. Re-evaluable when a real consumer ships a schema change that breaks an existing persisted value.
- **Whether the `<extension-id>.` prefix enforcement is too strict.** VS Code lets a logical namespace (e.g. `editor`) span multiple contributors. gcscode's strict-prefix rule means an extension can only register settings under its own id. If a shared namespace becomes desirable (e.g., multiple built-in extensions contributing to `gcscode.workbench.*`), the rule needs a documented relaxation.
- **Whether `host.configuration` should be re-namespaced under `host.workspace.*` when workspace lands.** Done now would be premature (no workspace concept); done later means a breaking rename. v1 commits to `host.configuration`; the workspace iteration decides whether to keep, rename, or alias.
- **Whether the listener-fires-before-persistence ordering is the right choice once persistence backends become async.** Listeners observing a not-yet-durable state is acceptable when persistence is localStorage (sync, near-instant). With a future remote sync backend (where persistence might take seconds), the asymmetry between observable-state and durable-state grows. Re-evaluable when a non-localStorage backend lands.
- **Async `activate()` interaction with configuration boot order.** v1's boot order assumes synchronous `activate()`. If `activate` becomes async (deferred per `docs/vs-code-alignment.md`), the cross-extension-read-before-producer race grows: producer's `registerConfiguration` may run far later in the activation flow. The recommended pattern (bundled-order reliance + `has()` polling + Svelte $derived auto-tracking) is async-compatible, but the spec doesn't explicitly verify this.

## Tripwires for known-quality concerns

- **Silent-schema-rejection tripwire.** If two operators within a single calendar quarter independently report "I changed the setting in devtools and it didn't take," the silent-failure mode has fired in production. Trigger: introduce a visible boot-time signal (status-bar item / boot banner). Tracked in the "Visible boot-time signal for schema-validation rejection" out-of-scope row.
- **Cross-extension write surprise tripwire.** If any extension other than `gcscode.sitl` calls `update('gcscode.sitl.connectionUrl', ...)` in shipped code without a documented reason, the cross-extension-write-permission has been used unexpectedly. Trigger: re-examine the capability-gating decision; consider adding a write-owner check before the broader capability-declaration iteration arrives.
- **Persistence-failure tripwire.** If `Persistence failed: ...` rejections appear in any user-observed error reporting (now or after telemetry exists), the localStorage path's quota or context restrictions are biting. Trigger: surface persistence failures in the UI; do not leave the operator blind to "your settings change didn't save."
- **JSON Schema typing escape tripwire.** If extension code in the repo writes `schema: { ...invalid-shape... }` and the TypeScript build does not catch it, the `JSONSchema7` re-export is not actually providing compile-time help. Trigger: investigate the toolchain (the type import may be erased or fall through to `unknown`).

## Future iterations

In priority order — none are committed; each needs its own brainstorm + spec cycle:

1. **Settings editor UI.** Overlay (mirroring the extensions panel shape), search across keys + descriptions, type-aware widgets (text input, checkbox, number, enum dropdown), reset-to-default, JSON view as escape hatch. Triggers: silent-schema-rejection tripwire OR second real setting consumer.
2. **Workspace + WorkspaceFolder configuration targets.** Requires workspace concept itself. Will likely re-namespace `host.configuration` under `host.workspace.configuration`.
3. **Visible boot-time signal for schema-validation rejection.** Status-bar item or boot banner when persisted values fail validation. Smaller iteration; could ship ahead of the full editor.
4. **Generalized `Event<T>` substrate.** Shared event primitive across cross-cutting capabilities (configuration, future events bus, future themes). May retrofit `onDidChangeConfiguration` to a richer shape if events need filtering / replay / priority.
5. **Cross-extension settings write capability gating.** Capability-declaration plumbing (per ADR-0003) gating which extensions can `update` which keys. Likely rolls in with the broader capability iteration.
6. **Schema migration hooks.** `migrateConfiguration({ from, to, fn })` or similar. Trigger: a real consumer's schema change loses user state.
7. **Settings cleanup for uninstalled extensions.** Orphan pruning UX.
8. **Declarative `package.json#contributes.configuration`.** Lands with the broader `contributes` manifest iteration if/when it materializes per ADR-0003.

## Origin

This iteration's design emerged from a 2026-05-18 brainstorm session that converged through six clarifying questions:

1. **First-iteration scope** → "Substrate only" (no editor UI in v1).
2. **Reactivity model** → "Both reactive read + event API" (Svelte-native auto-tracking AND `onDidChangeConfiguration` event).
3. **Schema shape** → "Full JSON Schema" (Draft 07 via ajv; the `JSONSchema7` type-and-validator agreement landed as a correction after the initial Sonnet red-team re-review on PR #25 flagged a draft-version inconsistency).
4. **Read/write API shape** → "Mirror VS Code's `WorkspaceConfiguration`" (section-scoped reader with `get/has/inspect/update`).
5. **Scope/target** → "Expose `ConfigurationTarget` enum, only `Global` supported in v1" (in-progress stub pattern; later expansion is additive).
6. **First consumer** → "SITL connection URL" (`gcscode.sitl.connectionUrl`).

The iteration is also the first non-synthetic exercise of the **Extension architect** reviewer role introduced in [`specs/2026-05-17-reviewer-routing-and-domain-expert.md`](2026-05-17-reviewer-routing-and-domain-expert.md). The Extension architect's review of this spec sharpened several v1 commitments: compile-time JSON Schema typing via `@types/json-schema`, the cross-extension-write trust-surface acknowledgment, the listener-vs-persistence ordering rationale, and the corrected SITL URL + base-URL-vs-full-URL decision.

## Post-merge implementation

After the spec PR merges:

- **Roadmap and out-of-scope edits** land as a single docs commit on master per the established post-merge implementation convention. The edits are fully specified in the propagation sections above; the commit is mechanical.
- **Implementation lands via a `feat/configuration-system-v1` branch** following the subagent-driven plan execution pipeline: spec-compliance reviewer + code-quality reviewer per task, final cross-cutting reviewer at end-of-iteration. The plan is the next deliverable (writing-plans skill after this spec merges).
- **The `@gcscode/extension-api` README update** lands as part of the implementation branch (one task: "Document `host.configuration` namespace in extension-api README").
