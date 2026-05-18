# Configuration System v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Per CLAUDE.md, each task gets a fresh implementer subagent followed by per-task spec-compliance + code-quality reviews; a final cross-cutting review runs at end-of-iteration before merging to master via `gh pr merge --merge <num>`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the `host.configuration.*` namespace per `shell/docs/specs/2026-05-18-configuration-system-v1.md` (PR #25, merged): imperative `registerConfiguration` + `WorkspaceConfiguration` (get/has/inspect/update) + `onDidChangeConfiguration`. JSON Schema Draft 07 via ajv. localStorage persistence (single blob). First consumer: `gcscode.sitl.connectionUrl` removes the hardcoded mavlink2rest URL.

**Architecture:** A single `ConfigurationStore` (in `packages/shell/src/configuration/configuration-store.svelte.ts`) backs the namespace. `createHost(extension)` in `packages/shell/src/extension-host/registry.ts` exposes the per-extension configuration façade by closing over the shared store with the activating extension's identity. Reads inside Svelte `$derived` / template contexts auto-track via SvelteMap-key reactivity. Writes validate (ajv) → mutate in-memory map → fire listeners synchronously → persist via read-modify-write of the localStorage blob.

**Tech Stack:** TypeScript, Svelte 5 (`$state`, `SvelteMap`), Vitest (jsdom + `@testing-library/svelte`), pnpm workspaces. New deps: `ajv@^8` + `ajv-formats@^3` (shell), `@types/json-schema@^7` (extension-api).

**Branch:** `feat/configuration-system-v1` off master. Open a draft PR after the first task lands and push commits as you go.

**Verification commands** (run from repo root unless noted; with the worktree pattern from CLAUDE.md, prefix `cd .worktrees/feat-configuration-system-v1/shell &&` to every bash call):

```bash
pnpm test     # vitest, all packages
pnpm check    # svelte-check + tsc, all packages
pnpm lint     # eslint + prettier --check
pnpm format   # prettier --write (run before commit if lint complains)
```

Per-package narrowing: `pnpm --filter @gcscode/shell test`, `pnpm --filter @gcscode/extension-api check`, etc.

---

## File structure

**Created:**

- `packages/shell/src/configuration/persistence.ts` — localStorage helpers (load / save blob; wrapped in try/catch for quota / disabled / security-context errors).
- `packages/shell/src/configuration/persistence.test.ts`
- `packages/shell/src/configuration/configuration-store.svelte.ts` — `ConfigurationStore` class wrapper following the `.svelte.ts` class-style convention. Owns `_schemas: SvelteMap`, `_values: SvelteMap`, `_listeners: Set`. Methods: `registerConfiguration`, `getConfiguration`, `onDidChangeConfiguration`, `update` (internal helper invoked by the WorkspaceConfiguration wrapper).
- `packages/shell/src/configuration/configuration-store.test.ts`
- `packages/shell/src/configuration/workspace-configuration.ts` — `createWorkspaceConfiguration(store, section?)` factory that closes over the store and an optional section prefix. Returns the `WorkspaceConfiguration` object (`get`, `has`, `inspect`, `update`).
- `packages/shell/src/configuration/workspace-configuration.test.ts`
- `packages/shell/src/configuration/reactive-read.test.ts` — Svelte component reactivity smoke test (jsdom).

**Modified:**

- `packages/extension-api/package.json` — add `"@types/json-schema": "^7.0.15"` to `dependencies`.
- `packages/extension-api/src/index.ts` — add `JSONSchema7` re-export, `ConfigurationTarget` const + type, `ConfigurationContribution`, `ConfigurationChangeEvent`, `WorkspaceConfiguration` interfaces, and the `configuration` namespace on `ExtensionHost`.
- `packages/shell/package.json` — add `"ajv": "^8.17.1"` and `"ajv-formats": "^3.0.1"` to `dependencies`.
- `packages/shell/src/extension-host/registry.ts` — instantiate the shared `ConfigurationStore` in `createRegistry`; wire the `configuration` namespace into `createHost(extension)`.
- `packages/shell/src/extension-host/registry.test.ts` — add tests for the configuration namespace plumbing.
- `packages/extension-sitl/src/index.ts` — register `gcscode.sitl.connectionUrl`; read the base URL inside `activate`; subscribe to `onDidChangeConfiguration` and reconnect on change.
- `packages/extension-sitl/src/index.test.ts` — add tests for configuration registration + reconnect-on-change + initial-URL composition with `FILTER`.
- `packages/extension-api/README.md` — document the `host.configuration` namespace (API shape, reactive mechanism, operator UX sharp edges).

**Existing test mock-host helpers** (touch only if a test fails for missing `host.configuration` after Task 8):

- `packages/extension-sitl/src/index.test.ts` `makeContext` helper (and any other mock-host construction site in any package) — extend the mock host with a `configuration` namespace stub (`vi.fn()` for the three verbs) so existing tests don't fail with "Cannot read properties of undefined." See Task 10.

---

## Task 1: Add `extension-api` types and namespace declaration

**Files:**
- Modify: `packages/extension-api/package.json`
- Modify: `packages/extension-api/src/index.ts`

**Goal:** Add the configuration types to `@gcscode/extension-api` and declare `configuration` on `ExtensionHost`. Type-check only — no runtime tests in this package.

- [ ] **Step 1: Add `@types/json-schema` to extension-api dependencies**

Edit `packages/extension-api/package.json` to add a `dependencies` field (the package currently only has `peerDependencies`):

```json
{
  "name": "@gcscode/extension-api",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts"
    }
  },
  "scripts": {
    "check": "tsc --noEmit",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": {
    "@types/json-schema": "^7.0.15"
  },
  "peerDependencies": {
    "svelte": "^5.0.0"
  }
}
```

- [ ] **Step 2: Install the new dep**

Run from repo root: `pnpm install`. Expected: a single dep added; lockfile updated.

- [ ] **Step 3: Append the configuration types to `extension-api/src/index.ts`**

Append below the existing `ExtensionHost` interface (BEFORE the `ExtensionContext` interface). Add the namespace inside `ExtensionHost` as a new readonly property.

```ts
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
```

Then add the `configuration` field to the existing `ExtensionHost` interface (insert as a new readonly property after `extensions`):

```ts
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
```

- [ ] **Step 4: Type-check**

Run: `pnpm --filter @gcscode/extension-api check`
Expected: PASS. The new types are syntactically valid.

Then run the broader: `pnpm check`
Expected: existing `@gcscode/shell` and other packages will FAIL because `ExtensionHost` now requires a `configuration` namespace they don't provide. That's expected; the rest of the plan wires it in.

- [ ] **Step 5: Commit**

```bash
git add packages/extension-api/package.json packages/extension-api/src/index.ts pnpm-lock.yaml
git commit -m "feat(extension-api): add host.configuration namespace types"
```

---

## Task 2: Configuration persistence helpers

**Files:**
- Create: `packages/shell/src/configuration/persistence.ts`
- Create: `packages/shell/src/configuration/persistence.test.ts`

**Goal:** A thin module that reads/writes the `gcscode.configuration` localStorage blob with error-handling wrapped per the precedent at `packages/shell/src/extension-host/extension-persistence.ts` lines 36-43.

- [ ] **Step 1: Write the failing test**

Create `packages/shell/src/configuration/persistence.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { loadConfigurationBlob, writeConfigurationBlob, STORAGE_KEY } from './persistence';

function makeStorage(initial: Record<string, string> = {}): Storage {
  const data: Record<string, string> = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
    clear: () => {
      for (const k of Object.keys(data)) delete data[k];
    },
    key: (i) => Object.keys(data)[i] ?? null,
    get length() {
      return Object.keys(data).length;
    },
  } as Storage;
}

describe('persistence', () => {
  it('loadConfigurationBlob returns an empty object when storage is empty', () => {
    expect(loadConfigurationBlob(makeStorage())).toEqual({});
  });

  it('loadConfigurationBlob returns the parsed blob when storage has valid JSON', () => {
    const storage = makeStorage({ [STORAGE_KEY]: JSON.stringify({ 'a.b': 1, 'c.d': 'two' }) });
    expect(loadConfigurationBlob(storage)).toEqual({ 'a.b': 1, 'c.d': 'two' });
  });

  it('loadConfigurationBlob returns an empty object on corrupted JSON and logs a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = makeStorage({ [STORAGE_KEY]: '{not json' });
    expect(loadConfigurationBlob(storage)).toEqual({});
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('loadConfigurationBlob returns an empty object when storage.getItem throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('storage disabled');
      },
    } as unknown as Storage;
    expect(loadConfigurationBlob(broken)).toEqual({});
  });

  it('writeConfigurationBlob round-trips through loadConfigurationBlob', () => {
    const storage = makeStorage();
    writeConfigurationBlob(storage, { 'a.b': 1, 'c.d': true });
    expect(loadConfigurationBlob(storage)).toEqual({ 'a.b': 1, 'c.d': true });
  });

  it('writeConfigurationBlob throws when storage.setItem throws', () => {
    const broken = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    } as unknown as Storage;
    expect(() => writeConfigurationBlob(broken, { 'a.b': 1 })).toThrow(/QuotaExceededError/);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `pnpm --filter @gcscode/shell test persistence`
Expected: FAIL — module `./persistence` does not exist.

- [ ] **Step 3: Implement `persistence.ts`**

Create `packages/shell/src/configuration/persistence.ts`:

```ts
/**
 * Single localStorage key holding the entire configuration map.
 * Schema: `{ [fullKey: string]: unknown }`.
 */
export const STORAGE_KEY = 'gcscode.configuration';

export type ConfigurationBlob = Record<string, unknown>;

/**
 * Load the persisted configuration blob. Returns `{}` on any failure — corrupted
 * JSON, storage disabled, quota errors, etc. A corrupted-JSON failure also
 * logs a warning so operators editing the blob by hand get a signal.
 */
export function loadConfigurationBlob(storage: Storage = localStorage): ConfigurationBlob {
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return {};
  }
  if (raw == null) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return parsed as ConfigurationBlob;
  } catch {
    console.warn(
      `[configuration] persisted blob at "${STORAGE_KEY}" is not valid JSON; starting from empty store`,
    );
    return {};
  }
}

/**
 * Write the full blob. Throws on storage failure (quota / disabled / security
 * context) — callers (the configuration store's `update()`) translate this into
 * a `Persistence failed` Promise rejection.
 */
export function writeConfigurationBlob(
  storage: Storage,
  blob: ConfigurationBlob,
): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(blob));
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @gcscode/shell test persistence`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shell/src/configuration/persistence.ts packages/shell/src/configuration/persistence.test.ts
git commit -m "feat(shell): add localStorage persistence helpers for configuration"
```

---

## Task 3: ConfigurationStore — schema registration with ajv validation

**Files:**
- Create: `packages/shell/src/configuration/configuration-store.svelte.ts`
- Create: `packages/shell/src/configuration/configuration-store.test.ts`
- Modify: `packages/shell/package.json`

**Goal:** Land the store class with `registerConfiguration` implemented. Prefix check, duplicate check, ajv-compile, default validation. No reads/writes yet — those come in Task 4 and Task 5. This task isolates schema lifecycle.

- [ ] **Step 1: Add ajv + ajv-formats to shell**

Edit `packages/shell/package.json` `dependencies`:

```json
    "ajv": "^8.17.1",
    "ajv-formats": "^3.0.1",
```

Run `pnpm install` from repo root. Expected: two deps added, lockfile updated.

- [ ] **Step 2: Write the failing test**

Create `packages/shell/src/configuration/configuration-store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';

import { ConfigurationStore } from './configuration-store.svelte';

function makeStorage(): Storage {
  const data: Record<string, string> = {};
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
    clear: () => {
      for (const k of Object.keys(data)) delete data[k];
    },
    key: (i) => Object.keys(data)[i] ?? null,
    get length() {
      return Object.keys(data).length;
    },
  } as Storage;
}

describe('ConfigurationStore.registerConfiguration', () => {
  let store: ConfigurationStore;

  beforeEach(() => {
    store = new ConfigurationStore(makeStorage());
  });

  it('accepts a valid registration', () => {
    expect(() =>
      store.registerConfiguration(
        {
          key: 'ext.a.foo',
          schema: { type: 'string' },
          default: 'hello',
        },
        'ext.a',
      ),
    ).not.toThrow();
  });

  it('throws when the key does not start with the extension id followed by a dot', () => {
    expect(() =>
      store.registerConfiguration(
        { key: 'other.foo', schema: { type: 'string' }, default: 'x' },
        'ext.a',
      ),
    ).toThrow(/must start with "ext\.a\."/);
  });

  it('throws when the same key is registered twice', () => {
    store.registerConfiguration(
      { key: 'ext.a.foo', schema: { type: 'string' }, default: 'x' },
      'ext.a',
    );
    expect(() =>
      store.registerConfiguration(
        { key: 'ext.a.foo', schema: { type: 'string' }, default: 'y' },
        'ext.a',
      ),
    ).toThrow(/already registered/);
  });

  it('throws when the default value violates the schema', () => {
    expect(() =>
      store.registerConfiguration(
        { key: 'ext.a.foo', schema: { type: 'string' }, default: 42 },
        'ext.a',
      ),
    ).toThrow(/default for "ext\.a\.foo"/);
  });

  it('accepts a registration with no default', () => {
    expect(() =>
      store.registerConfiguration({ key: 'ext.a.foo', schema: { type: 'string' } }, 'ext.a'),
    ).not.toThrow();
  });

  it('supports ajv-formats (uri format passes on a valid ws:// url)', () => {
    expect(() =>
      store.registerConfiguration(
        {
          key: 'ext.a.url',
          schema: { type: 'string', format: 'uri' },
          default: 'ws://localhost:8088/v1/ws/mavlink',
        },
        'ext.a',
      ),
    ).not.toThrow();
  });
});
```

- [ ] **Step 3: Run the failing test**

Run: `pnpm --filter @gcscode/shell test configuration-store`
Expected: FAIL — module does not exist.

- [ ] **Step 4: Implement the store skeleton + registerConfiguration**

Create `packages/shell/src/configuration/configuration-store.svelte.ts`:

```ts
import type {
  ConfigurationContribution,
  Disposable,
  JSONSchema7,
} from '@gcscode/extension-api';
import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { SvelteMap } from 'svelte/reactivity';

import { loadConfigurationBlob, type ConfigurationBlob } from './persistence';

interface CompiledSchemaEntry {
  contribution: ConfigurationContribution;
  validate: ValidateFunction;
}

const ajv = new Ajv({ strict: false, allErrors: false });
addFormats(ajv);

function summarizeAjvErrors(validate: ValidateFunction): string {
  return (validate.errors ?? [])
    .map((e) => `${e.instancePath || '/'} ${e.message ?? ''}`.trim())
    .join('; ');
}

/**
 * Owns the configuration registry, in-memory value map, and listener set.
 * `host.configuration.*` methods delegate to a single instance of this class
 * created by `createRegistry()` at shell boot.
 */
export class ConfigurationStore {
  private _schemas = new SvelteMap<string, CompiledSchemaEntry>();
  private _values = new SvelteMap<string, unknown>();
  private _storage: Storage;

  public constructor(storage: Storage = localStorage) {
    this._storage = storage;
    // Boot-time blob load lands in Task 6. For now, start empty so this task's
    // tests are isolated.
  }

  public registerConfiguration(
    contribution: ConfigurationContribution,
    extensionId: string,
  ): Disposable {
    const { key, schema, default: defaultValue } = contribution;

    const prefix = `${extensionId}.`;
    if (!key.startsWith(prefix)) {
      throw new Error(
        `Setting key "${key}" must start with "${prefix}" (registered by extension "${extensionId}").`,
      );
    }

    if (this._schemas.has(key)) {
      throw new Error(`Setting key "${key}" is already registered.`);
    }

    const validate = ajv.compile(schema);

    if (defaultValue !== undefined && !validate(defaultValue)) {
      throw new Error(
        `default for "${key}" does not match schema: ${summarizeAjvErrors(validate)}`,
      );
    }

    const entry: CompiledSchemaEntry = { contribution, validate };
    this._schemas.set(key, entry);

    return {
      dispose: () => {
        // Idempotent + safe under re-registration: only delete if the entry
        // in the map is the one this disposable owns.
        if (this._schemas.get(key) === entry) {
          this._schemas.delete(key);
          this._values.delete(key);
        }
      },
    };
  }

  // get / has / inspect / update / onDidChangeConfiguration land in later tasks.
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @gcscode/shell test configuration-store`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/shell/package.json pnpm-lock.yaml packages/shell/src/configuration/configuration-store.svelte.ts packages/shell/src/configuration/configuration-store.test.ts
git commit -m "feat(shell): ConfigurationStore.registerConfiguration with ajv schema validation"
```

---

## Task 4: WorkspaceConfiguration wrapper — get / has / inspect

**Files:**
- Create: `packages/shell/src/configuration/workspace-configuration.ts`
- Create: `packages/shell/src/configuration/workspace-configuration.test.ts`
- Modify: `packages/shell/src/configuration/configuration-store.svelte.ts`

**Goal:** The section-scoped reader wrapper. Reads go through `_values` (with schema-default fallback); `inspect` returns `undefined` for unregistered keys. No writes yet.

- [ ] **Step 1: Write the failing test**

Create `packages/shell/src/configuration/workspace-configuration.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';

import { ConfigurationStore } from './configuration-store.svelte';

function makeStorage(): Storage {
  const data: Record<string, string> = {};
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
    clear: () => {
      for (const k of Object.keys(data)) delete data[k];
    },
    key: (i) => Object.keys(data)[i] ?? null,
    get length() {
      return Object.keys(data).length;
    },
  } as Storage;
}

describe('WorkspaceConfiguration (via ConfigurationStore.getConfiguration)', () => {
  let store: ConfigurationStore;

  beforeEach(() => {
    store = new ConfigurationStore(makeStorage());
    store.registerConfiguration(
      { key: 'ext.a.foo', schema: { type: 'string' }, default: 'hello' },
      'ext.a',
    );
    store.registerConfiguration(
      { key: 'ext.a.count', schema: { type: 'number' }, default: 0 },
      'ext.a',
    );
  });

  it('get returns the schema default when no value has been written', () => {
    const cfg = store.getConfiguration('ext.a');
    expect(cfg.get<string>('foo')).toBe('hello');
    expect(cfg.get<number>('count')).toBe(0);
  });

  it('get with no section reads the full key', () => {
    const cfg = store.getConfiguration();
    expect(cfg.get<string>('ext.a.foo')).toBe('hello');
  });

  it('get with a defaultValue arg falls back when the key is unregistered', () => {
    const cfg = store.getConfiguration();
    expect(cfg.get<string>('unknown.key')).toBeUndefined();
    expect(cfg.get<string>('unknown.key', 'fallback')).toBe('fallback');
  });

  it('has returns true only when a value is persisted in the in-memory map', () => {
    const cfg = store.getConfiguration('ext.a');
    // No persisted value yet; schema-default-only.
    expect(cfg.has('foo')).toBe(false);
  });

  it('inspect returns { key, defaultValue, globalValue } for a registered key', () => {
    const cfg = store.getConfiguration();
    expect(cfg.inspect('ext.a.foo')).toEqual({
      key: 'ext.a.foo',
      defaultValue: 'hello',
      globalValue: undefined,
    });
  });

  it('inspect returns undefined for an unregistered key', () => {
    const cfg = store.getConfiguration();
    expect(cfg.inspect('unknown.key')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `pnpm --filter @gcscode/shell test workspace-configuration`
Expected: FAIL — `getConfiguration` does not exist on `ConfigurationStore`.

- [ ] **Step 3: Implement the wrapper factory + add `getConfiguration` to the store**

Create `packages/shell/src/configuration/workspace-configuration.ts`:

```ts
import type {
  ConfigurationTarget,
  WorkspaceConfiguration,
} from '@gcscode/extension-api';

/**
 * Internal contract the wrapper closes over. Lives in the store; the wrapper
 * is the public face that extensions read/write through.
 */
export interface ConfigurationStoreFacade {
  hasSchema(fullKey: string): boolean;
  getDefault(fullKey: string): unknown;
  getValue(fullKey: string): unknown | undefined;
  hasValue(fullKey: string): boolean;
  update(fullKey: string, value: unknown, target: ConfigurationTarget): Promise<void>;
}

export function createWorkspaceConfiguration(
  facade: ConfigurationStoreFacade,
  section: string | undefined,
): WorkspaceConfiguration {
  const fullKey = (key: string): string => (section ? `${section}.${key}` : key);

  return {
    get<T>(key: string, defaultValue?: T): T | undefined {
      const k = fullKey(key);
      if (!facade.hasSchema(k)) {
        return defaultValue;
      }
      if (facade.hasValue(k)) {
        return facade.getValue(k) as T;
      }
      const schemaDefault = facade.getDefault(k);
      if (schemaDefault !== undefined) {
        return schemaDefault as T;
      }
      return defaultValue;
    },

    has(key: string): boolean {
      return facade.hasValue(fullKey(key));
    },

    inspect<T>(key: string) {
      const k = fullKey(key);
      if (!facade.hasSchema(k)) return undefined;
      return {
        key: k,
        defaultValue: facade.getDefault(k) as T | undefined,
        globalValue: facade.hasValue(k) ? (facade.getValue(k) as T) : undefined,
      };
    },

    update(key: string, value: unknown, target?: ConfigurationTarget) {
      return facade.update(fullKey(key), value, target ?? 1); // 1 = ConfigurationTarget.Global
    },
  };
}
```

Add to `configuration-store.svelte.ts`:

```ts
// (add to imports)
import {
  createWorkspaceConfiguration,
  type ConfigurationStoreFacade,
} from './workspace-configuration';
import type { ConfigurationTarget, WorkspaceConfiguration } from '@gcscode/extension-api';

// (add inside the ConfigurationStore class)

  public getConfiguration(section?: string): WorkspaceConfiguration {
    return createWorkspaceConfiguration(this.facade, section);
  }

  private get facade(): ConfigurationStoreFacade {
    return {
      hasSchema: (k) => this._schemas.has(k),
      getDefault: (k) => this._schemas.get(k)?.contribution.default,
      getValue: (k) => this._values.get(k),
      hasValue: (k) => this._values.has(k),
      update: (k, v, t) => this.update(k, v, t),
    };
  }

  // Placeholder until Task 5 lands the real implementation. Reject everything
  // so any accidental call surfaces clearly during this task's tests.
  private update(_fullKey: string, _value: unknown, _target: ConfigurationTarget): Promise<void> {
    return Promise.reject(new Error('update() not yet implemented'));
  }
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @gcscode/shell test workspace-configuration configuration-store`
Expected: PASS (all 6 wrapper tests + the 6 from Task 3).

- [ ] **Step 5: Commit**

```bash
git add packages/shell/src/configuration/workspace-configuration.ts packages/shell/src/configuration/workspace-configuration.test.ts packages/shell/src/configuration/configuration-store.svelte.ts
git commit -m "feat(shell): WorkspaceConfiguration wrapper (get/has/inspect)"
```

---

## Task 5: ConfigurationStore — update + ConfigurationTarget rejection + listener-before-persist + RMW

**Files:**
- Modify: `packages/shell/src/configuration/configuration-store.svelte.ts`
- Modify: `packages/shell/src/configuration/configuration-store.test.ts`

**Goal:** Implement the write path with documented ordering: validate → in-memory mutate → fire listeners synchronously → persist via read-modify-write. Reject the Promise on no-schema, schema-mismatch, non-Global target, persistence failure.

- [ ] **Step 1: Write the failing tests**

Append to `packages/shell/src/configuration/configuration-store.test.ts`:

```ts
import { ConfigurationTarget } from '@gcscode/extension-api';

import { writeConfigurationBlob, loadConfigurationBlob } from './persistence';

describe('ConfigurationStore.update (via WorkspaceConfiguration)', () => {
  let storage: Storage;
  let store: ConfigurationStore;

  beforeEach(() => {
    storage = makeStorage();
    store = new ConfigurationStore(storage);
    store.registerConfiguration(
      { key: 'ext.a.foo', schema: { type: 'string' }, default: 'hello' },
      'ext.a',
    );
  });

  it('update resolves and the new value is readable via get()', async () => {
    const cfg = store.getConfiguration('ext.a');
    await cfg.update('foo', 'world');
    expect(cfg.get<string>('foo')).toBe('world');
  });

  it('update persists the value to localStorage via read-modify-write', async () => {
    // Pre-populate an orphan key to verify RMW preserves it.
    writeConfigurationBlob(storage, { 'orphan.key': 'still-here' });

    const cfg = store.getConfiguration('ext.a');
    await cfg.update('foo', 'world');

    expect(loadConfigurationBlob(storage)).toEqual({
      'orphan.key': 'still-here',
      'ext.a.foo': 'world',
    });
  });

  it('update rejects when no schema is registered for the key', async () => {
    const cfg = store.getConfiguration();
    await expect(cfg.update('unknown.key', 'x')).rejects.toThrow(/No schema registered/);
  });

  it('update rejects when the value violates the schema', async () => {
    const cfg = store.getConfiguration('ext.a');
    await expect(cfg.update('foo', 42)).rejects.toThrow(/does not match schema/);
  });

  it('update rejects (Promise rejection, not sync throw) on ConfigurationTarget.Workspace', async () => {
    const cfg = store.getConfiguration('ext.a');
    const result = cfg.update('foo', 'world', ConfigurationTarget.Workspace);
    expect(result).toBeInstanceOf(Promise);
    await expect(result).rejects.toThrow(/Target not supported in v1/);
  });

  it('update rejects (Promise rejection) on ConfigurationTarget.WorkspaceFolder', async () => {
    const cfg = store.getConfiguration('ext.a');
    await expect(cfg.update('foo', 'world', ConfigurationTarget.WorkspaceFolder)).rejects.toThrow(
      /Target not supported in v1/,
    );
  });

  it('listener-before-persist ordering: listeners observe new value before persistence resolves', async () => {
    const cfg = store.getConfiguration('ext.a');
    const observedDuringListener: string[] = [];

    store.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('ext.a.foo')) {
        observedDuringListener.push(cfg.get<string>('foo', '') as string);
      }
    });

    await cfg.update('foo', 'world');
    expect(observedDuringListener).toEqual(['world']);
  });

  it('update rejects with Persistence failed when storage.setItem throws; in-memory commit stays', async () => {
    const failingStorage = {
      ...storage,
      getItem: (k: string) => storage.getItem(k),
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    } as Storage;

    const s2 = new ConfigurationStore(failingStorage);
    s2.registerConfiguration(
      { key: 'ext.a.foo', schema: { type: 'string' }, default: 'hello' },
      'ext.a',
    );
    const cfg = s2.getConfiguration('ext.a');
    await expect(cfg.update('foo', 'world')).rejects.toThrow(/Persistence failed/);
    // In-memory commit stays (per the documented ordering).
    expect(cfg.get<string>('foo')).toBe('world');
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `pnpm --filter @gcscode/shell test configuration-store`
Expected: FAIL — `update()` placeholder rejects with "not yet implemented" + no `onDidChangeConfiguration` yet.

- [ ] **Step 3: Implement the real `update` + a temporary listener noop**

Replace the placeholder `update` in `configuration-store.svelte.ts` with:

```ts
// (add to imports at top of file)
import {
  ConfigurationTarget,
  type ConfigurationChangeEvent,
} from '@gcscode/extension-api';
import { writeConfigurationBlob, loadConfigurationBlob } from './persistence';

// (add a listeners set as a private field)
  private _listeners = new Set<(e: ConfigurationChangeEvent) => void>();

// (add the onDidChangeConfiguration method — full impl in Task 7's tests already; this lands now)
  public onDidChangeConfiguration(
    listener: (e: ConfigurationChangeEvent) => void,
  ): { dispose(): void } {
    this._listeners.add(listener);
    return {
      dispose: () => {
        this._listeners.delete(listener);
      },
    };
  }

// (replace the placeholder update with the real one)
  private async update(
    fullKey: string,
    value: unknown,
    target: ConfigurationTarget,
  ): Promise<void> {
    if (target !== ConfigurationTarget.Global) {
      throw new Error('Target not supported in v1');
    }
    const entry = this._schemas.get(fullKey);
    if (entry === undefined) {
      throw new Error(`No schema registered for "${fullKey}"`);
    }
    if (!entry.validate(value)) {
      throw new Error(
        `Value for "${fullKey}" does not match schema: ${summarizeAjvErrors(entry.validate)}`,
      );
    }

    // In-memory commit + listener fire BEFORE persistence (documented ordering;
    // listeners observe new state; persist failure rejects the Promise but does
    // not roll back in-memory state).
    this._values.set(fullKey, value);
    const event: ConfigurationChangeEvent = {
      affectsConfiguration(section: string): boolean {
        return fullKey === section || fullKey.startsWith(`${section}.`);
      },
    };
    for (const listener of this._listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[configuration] listener threw:', err);
      }
    }

    // Read-modify-write the blob (preserves orphan keys and validation-failed
    // persisted values for other keys).
    try {
      const blob = loadConfigurationBlob(this._storage);
      blob[fullKey] = value;
      writeConfigurationBlob(this._storage, blob);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`Persistence failed: ${reason}`);
    }
  }
```

Note: the method changes from synchronous `throw` to async error propagation. Because `update` is `async`, all `throw new Error(...)` inside it become `Promise.reject` automatically. The test asserts `result).toBeInstanceOf(Promise)` first — which passes because `async` functions always return a Promise.

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @gcscode/shell test configuration-store`
Expected: PASS (Task 3's 6 + Task 5's 8 = 14 tests in this file).

- [ ] **Step 5: Commit**

```bash
git add packages/shell/src/configuration/configuration-store.svelte.ts packages/shell/src/configuration/configuration-store.test.ts
git commit -m "feat(shell): ConfigurationStore.update with listener-before-persist ordering"
```

---

## Task 6: Boot-time blob load + per-key re-validation at register + Disposable dispose semantics

**Files:**
- Modify: `packages/shell/src/configuration/configuration-store.svelte.ts`
- Modify: `packages/shell/src/configuration/configuration-store.test.ts`

**Goal:** When the store boots, load the localStorage blob into a "pending" buffer; at each `registerConfiguration`, validate any pending value for the registered key against the schema; on pass, populate `_values`; on fail, `console.warn` and leave the blob untouched. Disposable's `dispose` clears the in-memory `_values` entry but leaves the persisted blob alone (which the existing Task 3 implementation already does — this task verifies it).

- [ ] **Step 1: Write the failing tests**

Append to `packages/shell/src/configuration/configuration-store.test.ts`:

```ts
describe('ConfigurationStore boot + re-validation', () => {
  it('a persisted value matching the schema is exposed via get() after registration', () => {
    const storage = makeStorage();
    writeConfigurationBlob(storage, { 'ext.a.foo': 'previously-set' });
    const store = new ConfigurationStore(storage);
    store.registerConfiguration(
      { key: 'ext.a.foo', schema: { type: 'string' }, default: 'hello' },
      'ext.a',
    );
    expect(store.getConfiguration('ext.a').get<string>('foo')).toBe('previously-set');
  });

  it('a persisted value violating the schema is dropped + console.warn fires; get() returns default', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = makeStorage();
    writeConfigurationBlob(storage, { 'ext.a.foo': 42 });
    const store = new ConfigurationStore(storage);
    store.registerConfiguration(
      { key: 'ext.a.foo', schema: { type: 'string' }, default: 'hello' },
      'ext.a',
    );
    expect(store.getConfiguration('ext.a').get<string>('foo')).toBe('hello');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/ext\.a\.foo.*violates schema/);
    // Bad value stays in localStorage (deliberate — re-validation succeeds if schema loosens).
    expect(loadConfigurationBlob(storage)).toEqual({ 'ext.a.foo': 42 });
    warn.mockRestore();
  });

  it('Disposable.dispose() removes the schema AND clears the in-memory value', () => {
    const storage = makeStorage();
    writeConfigurationBlob(storage, { 'ext.a.foo': 'preset' });
    const store = new ConfigurationStore(storage);
    const d = store.registerConfiguration(
      { key: 'ext.a.foo', schema: { type: 'string' }, default: 'hello' },
      'ext.a',
    );
    expect(store.getConfiguration('ext.a').get<string>('foo')).toBe('preset');

    d.dispose();
    // After dispose: no schema → get() with no defaultValue arg returns undefined.
    expect(store.getConfiguration('ext.a').get<string>('foo')).toBeUndefined();
    // The persisted blob is unchanged — re-registration recovers it.
    expect(loadConfigurationBlob(storage)).toEqual({ 'ext.a.foo': 'preset' });

    store.registerConfiguration(
      { key: 'ext.a.foo', schema: { type: 'string' }, default: 'hello' },
      'ext.a',
    );
    expect(store.getConfiguration('ext.a').get<string>('foo')).toBe('preset');
  });
});

// (import vi at the top of the file)
import { vi } from 'vitest';
```

- [ ] **Step 2: Run the failing tests**

Run: `pnpm --filter @gcscode/shell test configuration-store`
Expected: FAIL — boot-time blob is not loaded; re-validation isn't wired.

- [ ] **Step 3: Implement boot-load + re-validation**

In `configuration-store.svelte.ts`:

```ts
// (add a pending-values map alongside the existing private fields)
  private _pendingPersisted: Record<string, unknown>;

// (replace the constructor)
  public constructor(storage: Storage = localStorage) {
    this._storage = storage;
    this._pendingPersisted = loadConfigurationBlob(storage);
  }
```

Replace the `registerConfiguration` body's tail (where it currently stores the entry) with:

```ts
    const entry: CompiledSchemaEntry = { contribution, validate };
    this._schemas.set(key, entry);

    // Re-validate any persisted value for this key. Bad → warn + leave out of
    // _values; the persisted blob is NOT touched (so schema loosening recovers it).
    if (key in this._pendingPersisted) {
      const persisted = this._pendingPersisted[key];
      if (validate(persisted)) {
        this._values.set(key, persisted);
      } else {
        console.warn(
          `[configuration] persisted value for "${key}" violates schema; falling back to default (${summarizeAjvErrors(validate)})`,
        );
      }
    }

    return {
      dispose: () => {
        if (this._schemas.get(key) === entry) {
          this._schemas.delete(key);
          this._values.delete(key);
        }
      },
    };
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @gcscode/shell test configuration-store`
Expected: PASS (3 new + 14 existing = 17).

- [ ] **Step 5: Commit**

```bash
git add packages/shell/src/configuration/configuration-store.svelte.ts packages/shell/src/configuration/configuration-store.test.ts
git commit -m "feat(shell): boot-time blob load + per-key re-validation + dispose semantics"
```

---

## Task 7: onDidChangeConfiguration + affectsConfiguration

**Files:**
- Modify: `packages/shell/src/configuration/configuration-store.test.ts`

**Goal:** Verify the event semantics explicitly. The implementation already landed in Task 5 (as part of the listener-before-persist ordering); this task locks down the contract with dedicated tests.

- [ ] **Step 1: Write the tests**

Append to `packages/shell/src/configuration/configuration-store.test.ts`:

```ts
describe('ConfigurationStore.onDidChangeConfiguration', () => {
  let store: ConfigurationStore;

  beforeEach(() => {
    store = new ConfigurationStore(makeStorage());
    store.registerConfiguration(
      { key: 'ext.a.foo', schema: { type: 'string' }, default: 'hello' },
      'ext.a',
    );
    store.registerConfiguration(
      { key: 'ext.b.bar', schema: { type: 'number' }, default: 0 },
      'ext.b',
    );
  });

  it('does not fire during registerConfiguration', () => {
    const listener = vi.fn();
    store.onDidChangeConfiguration(listener);
    store.registerConfiguration(
      { key: 'ext.a.baz', schema: { type: 'string' }, default: 'x' },
      'ext.a',
    );
    expect(listener).not.toHaveBeenCalled();
  });

  it('fires once per update() call (no coalescing)', async () => {
    const listener = vi.fn();
    store.onDidChangeConfiguration(listener);
    await store.getConfiguration('ext.a').update('foo', '1');
    await store.getConfiguration('ext.a').update('foo', '2');
    await store.getConfiguration('ext.a').update('foo', '3');
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('affectsConfiguration returns true for exact key match', async () => {
    const events: boolean[] = [];
    store.onDidChangeConfiguration((e) => {
      events.push(e.affectsConfiguration('ext.a.foo'));
    });
    await store.getConfiguration('ext.a').update('foo', 'x');
    expect(events).toEqual([true]);
  });

  it('affectsConfiguration returns true for prefix-match', async () => {
    const events: boolean[] = [];
    store.onDidChangeConfiguration((e) => {
      events.push(e.affectsConfiguration('ext.a'));
    });
    await store.getConfiguration('ext.a').update('foo', 'x');
    expect(events).toEqual([true]);
  });

  it('affectsConfiguration returns false for unrelated section', async () => {
    const events: boolean[] = [];
    store.onDidChangeConfiguration((e) => {
      events.push(e.affectsConfiguration('ext.b'));
    });
    await store.getConfiguration('ext.a').update('foo', 'x');
    expect(events).toEqual([false]);
  });

  it('Disposable.dispose() unsubscribes the listener', async () => {
    const listener = vi.fn();
    const d = store.onDidChangeConfiguration(listener);
    await store.getConfiguration('ext.a').update('foo', '1');
    d.dispose();
    await store.getConfiguration('ext.a').update('foo', '2');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `pnpm --filter @gcscode/shell test configuration-store`
Expected: PASS (6 new + 17 existing = 23 tests in this file).

- [ ] **Step 3: Commit**

```bash
git add packages/shell/src/configuration/configuration-store.test.ts
git commit -m "test(shell): onDidChangeConfiguration semantics + affectsConfiguration prefix matching"
```

---

## Task 8: Wire `host.configuration` into createHost / registry

**Files:**
- Modify: `packages/shell/src/extension-host/registry.ts`
- Modify: `packages/shell/src/extension-host/registry.test.ts`

**Goal:** Instantiate a single `ConfigurationStore` in `createRegistry()`; wire the per-extension façade into `createHost(extension)`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/shell/src/extension-host/registry.test.ts`:

```ts
describe('createRegistry — configuration namespace', () => {
  it('exposes registerConfiguration / getConfiguration / onDidChangeConfiguration on host.configuration', () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.cfg', (ctx) => {
        expect(typeof ctx.host.configuration.registerConfiguration).toBe('function');
        expect(typeof ctx.host.configuration.getConfiguration).toBe('function');
        expect(typeof ctx.host.configuration.onDidChangeConfiguration).toBe('function');
      }),
    );
  });

  it('enforces the prefix using the activating extension id', () => {
    const registry = createRegistry();
    expect(() =>
      registry.activate(
        extension('ext.cfg', (ctx) => {
          ctx.host.configuration.registerConfiguration({
            key: 'other.id.foo',
            schema: { type: 'string' },
            default: 'x',
          });
        }),
      ),
    ).toThrow(/must start with "ext\.cfg\."/);
  });

  it('two extensions share the same configuration store (cross-extension reads work)', async () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.configuration.registerConfiguration({
          key: 'ext.a.foo',
          schema: { type: 'string' },
          default: 'hello',
        });
      }),
    );

    let readByB: string | undefined;
    registry.activate(
      extension('ext.b', (ctx) => {
        readByB = ctx.host.configuration.getConfiguration().get<string>('ext.a.foo');
      }),
    );
    expect(readByB).toBe('hello');
  });
});
```

(The test file already imports `createRegistry` and has the `extension()` helper at the top.)

- [ ] **Step 2: Run the failing tests**

Run: `pnpm --filter @gcscode/shell test registry`
Expected: FAIL — `host.configuration` is undefined.

- [ ] **Step 3: Wire the store into `createRegistry` and `createHost`**

In `packages/shell/src/extension-host/registry.ts`:

```ts
// (add to imports)
import { ConfigurationStore } from '../configuration/configuration-store.svelte';

// (inside createRegistry, alongside the existing maps)
  const configurationStore = new ConfigurationStore();

// (inside createHost, add the configuration namespace after `extensions`)
      configuration: {
        registerConfiguration(contribution) {
          return configurationStore.registerConfiguration(contribution, extension.id);
        },
        getConfiguration(section) {
          return configurationStore.getConfiguration(section);
        },
        onDidChangeConfiguration(listener) {
          return configurationStore.onDidChangeConfiguration(listener);
        },
      },
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @gcscode/shell test registry`
Expected: PASS (3 new tests). Existing registry tests still pass.

- [ ] **Step 5: Run the full shell suite**

Run: `pnpm --filter @gcscode/shell test`
Expected: PASS (all configuration + registry + existing tests).

- [ ] **Step 6: Commit**

```bash
git add packages/shell/src/extension-host/registry.ts packages/shell/src/extension-host/registry.test.ts
git commit -m "feat(shell): wire host.configuration namespace into createHost"
```

---

## Task 9: First consumer — extension-sitl wiring

**Files:**
- Modify: `packages/extension-sitl/src/index.ts`
- Modify: `packages/extension-sitl/src/index.test.ts`

**Goal:** Replace the hardcoded `WS_URL` constant with a configuration-backed read; subscribe to `onDidChangeConfiguration` and reconnect when the URL changes; tests assert the registration and the reconnect path.

- [ ] **Step 1: Write the failing tests**

Edit `packages/extension-sitl/src/index.test.ts`'s `makeContext()` helper to provide a configuration namespace, and add new tests at the bottom of the `describe('sitlExtension', ...)` block. The helper change:

```ts
// In makeContext():
  const registerConfiguration = vi.fn().mockReturnValue({ dispose: vi.fn() });
  const onDidChangeConfiguration = vi.fn().mockReturnValue({ dispose: vi.fn() });
  // Mock WorkspaceConfiguration that returns the schema default for connectionUrl.
  const getConfiguration = vi.fn().mockReturnValue({
    get: (key: string, defaultValue?: unknown) =>
      key === 'connectionUrl' ? 'ws://localhost:8088/v1/ws/mavlink' : defaultValue,
    has: vi.fn().mockReturnValue(false),
    inspect: vi.fn().mockReturnValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
  });

  const context: ExtensionContext = {
    host: {
      window: { registerView, registerStatusBarItem, showQuickPick: vi.fn() },
      commands: { registerCommand, executeCommand },
      keybindings: { registerKeybinding },
      extensions: { getExtension: vi.fn(() => undefined) },
      configuration: { registerConfiguration, getConfiguration, onDidChangeConfiguration },
    },
    subscriptions,
    extension: {
      id: sitlExtension.manifest.id,
      displayName: sitlExtension.manifest.displayName,
      version: sitlExtension.manifest.version,
    },
  };

  return {
    context,
    registerView,
    registerCommand,
    registerKeybinding,
    registerConfiguration,
    onDidChangeConfiguration,
    getConfiguration,
  };
```

Add the new tests at the end of `describe('sitlExtension', ...)`:

```ts
  it('registers gcscode.sitl.connectionUrl with the expected schema + default', () => {
    const { context, registerConfiguration } = makeContext();
    sitlExtension.activate(context);

    expect(registerConfiguration).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'gcscode.sitl.connectionUrl',
        default: 'ws://localhost:8088/v1/ws/mavlink',
        schema: expect.objectContaining({ type: 'string', format: 'uri' }),
      }),
    );
  });

  it('composes the WebSocket URL from the configured base URL + compile-time FILTER', () => {
    const { context } = makeContext();
    sitlExtension.activate(context);

    const mock = lastMock();
    expect(mock.url).toMatch(/^ws:\/\/localhost:8088\/v1\/ws\/mavlink\?filter=/);
  });

  it('reconnects when gcscode.sitl.connectionUrl changes', async () => {
    const { context, getConfiguration, onDidChangeConfiguration } = makeContext();
    sitlExtension.activate(context);

    // Grab the listener registered by activate().
    const listener = onDidChangeConfiguration.mock.calls[0][0];

    // Update the mock to return a new URL on the next read.
    getConfiguration.mockReturnValue({
      get: (key: string, defaultValue?: unknown) =>
        key === 'connectionUrl' ? 'ws://192.168.1.42:8088/v1/ws/mavlink' : defaultValue,
      has: vi.fn().mockReturnValue(true),
      inspect: vi.fn().mockReturnValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    });

    // Fire the event.
    listener({ affectsConfiguration: (s: string) => s === 'gcscode.sitl.connectionUrl' });

    // Allow the reconnect microtask to settle.
    await Promise.resolve();

    // A new mock WebSocket should have been constructed against the new URL.
    expect(mockInstances.length).toBeGreaterThanOrEqual(2);
    const latest = mockInstances[mockInstances.length - 1];
    expect(latest.url).toMatch(/^ws:\/\/192\.168\.1\.42:8088\/v1\/ws\/mavlink/);
  });
```

- [ ] **Step 2: Run the failing tests**

Run: `pnpm --filter @gcscode/extension-sitl test`
Expected: FAIL — `registerConfiguration` is not called by `activate`; the URL is still hardcoded.

- [ ] **Step 3: Wire configuration into extension-sitl**

Replace the body of `packages/extension-sitl/src/index.ts`:

```ts
import type { Disposable, Extension } from '@gcscode/extension-api';

import { createMavlinkClient, type MavlinkClient } from './mavlink-client';
import SitlView from './sitl-view.svelte';
import {
  applyMessage,
  reset,
  setConnectionState,
  telemetryState,
  type TelemetryState,
} from './telemetry-store.svelte';

export interface SitlExports {
  telemetry: Readonly<TelemetryState>;
}

const FILTER = '^(HEARTBEAT|GLOBAL_POSITION_INT|ATTITUDE|VFR_HUD|SYS_STATUS)$';
const DEFAULT_BASE_URL = 'ws://localhost:8088/v1/ws/mavlink';

function composeUrl(baseUrl: string): string {
  return `${baseUrl}?filter=${encodeURIComponent(FILTER)}`;
}

let client: MavlinkClient | null = null;

function openClient(baseUrl: string): void {
  client = createMavlinkClient({
    url: composeUrl(baseUrl),
    onMessage: applyMessage,
    onConnectionStateChange: setConnectionState,
  });
}

async function closeClient(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
  }
}

export const sitlExtension: Extension = {
  manifest: {
    id: 'gcscode.sitl',
    displayName: 'SITL Telemetry',
    version: '0.0.0',
    description:
      'Live ArduCopter telemetry via mavlink2rest WebSocket; publishes a telemetry export.',
  },
  activate(context): SitlExports {
    context.subscriptions.push(
      context.host.configuration.registerConfiguration({
        key: 'gcscode.sitl.connectionUrl',
        schema: {
          type: 'string',
          format: 'uri',
          description:
            'WebSocket base URL of the mavlink2rest bridge. The extension appends a `?filter=…` query string from its compile-time message-type allowlist.',
        },
        default: DEFAULT_BASE_URL,
      }),
    );

    const cfg = context.host.configuration.getConfiguration('gcscode.sitl');
    openClient(cfg.get<string>('connectionUrl', DEFAULT_BASE_URL));

    context.subscriptions.push(
      context.host.configuration.onDidChangeConfiguration((e) => {
        if (!e.affectsConfiguration('gcscode.sitl.connectionUrl')) return;
        const newBase = context.host.configuration
          .getConfiguration('gcscode.sitl')
          .get<string>('connectionUrl', DEFAULT_BASE_URL);
        // Fire-and-forget reconnect; errors propagate via the WebSocket's
        // onerror/onclose pathway already handled by createMavlinkClient.
        void closeClient().then(() => openClient(newBase));
      }),
    );

    context.subscriptions.push(
      context.host.window.registerView({
        id: 'gcscode.sitl.location',
        component: SitlView,
        title: 'SITL',
      }),
      context.host.commands.registerCommand({
        id: 'gcscode.sitl.getLocation',
        title: 'Get Location',
        category: 'SITL',
        run: () => {
          if (telemetryState.lat === null || telemetryState.lng === null) {
            console.log('SITL location: (no fix yet)');
            return null;
          }
          const loc = {
            lat: telemetryState.lat,
            lng: telemetryState.lng,
            alt: telemetryState.alt,
          };
          console.log('SITL location:', loc);
          return loc;
        },
      }),
      context.host.keybindings.registerKeybinding({
        key: 'Alt+Shift+L',
        command: 'gcscode.sitl.getLocation',
      }),
    );

    return { telemetry: telemetryState };
  },
  async deactivate() {
    await closeClient();
    reset();
  },
};
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @gcscode/extension-sitl test`
Expected: PASS — the new tests + existing SITL tests (the existing tests' subscription count now includes the configuration disposables; if a test asserts `subscriptions.toHaveLength(3)`, update it to `5` per the new disposable count: configuration register + onDidChange + view + command + keybinding).

- [ ] **Step 5: Adjust the existing length assertion**

If the existing test "registers a view, a command, and a keybinding, pushing all three disposables" still asserts `toHaveLength(3)`, change it to `toHaveLength(5)` and update the test title to reflect the new total: "registers a view, a command, a keybinding, and a configuration + change-listener; pushes all five disposables."

- [ ] **Step 6: Commit**

```bash
git add packages/extension-sitl/src/index.ts packages/extension-sitl/src/index.test.ts
git commit -m "feat(sitl): read connectionUrl from host.configuration + reconnect on change"
```

---

## Task 10: Update other mock-host helpers + reactive read smoke test

**Files:**
- Modify (as needed): any other test file with a mock host construction that now fails because `configuration` is missing.
- Create: `packages/shell/src/configuration/reactive-read.test.ts`

**Goal:** Sweep tests in the repo for "Cannot read properties of undefined (reading 'configuration')" failures and add a `configuration` stub to each mock host. Plus a Svelte component test asserting that a `$derived` over `get()` re-evaluates when `update()` fires.

- [ ] **Step 1: Discover failing tests**

Run: `pnpm test`
Expected: any tests in `packages/extension-vehicle-status`, `packages/extension-map`, `packages/extension-flight-overlay`, `packages/extension-example` etc. that construct a mock `ExtensionHost` may FAIL because their host objects don't include `configuration`. Inventory the failures.

- [ ] **Step 2: Fix each failing test's mock host**

For each failing test, add to the mock host:

```ts
configuration: {
  registerConfiguration: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  getConfiguration: vi.fn().mockReturnValue({
    get: vi.fn((_key: string, defaultValue?: unknown) => defaultValue),
    has: vi.fn().mockReturnValue(false),
    inspect: vi.fn().mockReturnValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
  }),
  onDidChangeConfiguration: vi.fn().mockReturnValue({ dispose: vi.fn() }),
},
```

- [ ] **Step 3: Write the reactive-read smoke test**

Create `packages/shell/src/configuration/reactive-read.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';

import { ConfigurationStore } from './configuration-store.svelte';
import ReactiveReadProbe from './__fixtures__/reactive-read-probe.svelte';

describe('reactive read', () => {
  it('a $derived over WorkspaceConfiguration.get() re-evaluates when update() fires', async () => {
    const store = new ConfigurationStore({
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    } as Storage);

    store.registerConfiguration(
      { key: 'ext.a.label', schema: { type: 'string' }, default: 'initial' },
      'ext.a',
    );

    render(ReactiveReadProbe, { props: { store } });
    expect(screen.getByTestId('label').textContent).toBe('initial');

    await store.getConfiguration('ext.a').update('label', 'updated');
    await tick();
    expect(screen.getByTestId('label').textContent).toBe('updated');
  });
});
```

Create `packages/shell/src/configuration/__fixtures__/reactive-read-probe.svelte`:

```svelte
<script lang="ts">
  import type { ConfigurationStore } from '../configuration-store.svelte';

  let { store }: { store: ConfigurationStore } = $props();

  const cfg = store.getConfiguration('ext.a');
  const label = $derived(cfg.get<string>('label', ''));
</script>

<span data-testid="label">{label}</span>
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test`
Expected: all packages PASS — mock helpers updated + reactive-read passes.

- [ ] **Step 5: Commit**

```bash
git add -A packages/
git commit -m "test: add configuration namespace stub to existing mock hosts + reactive read smoke test"
```

---

## Task 11: Update `@gcscode/extension-api` README

**Files:**
- Modify: `packages/extension-api/README.md`

**Goal:** Document the new namespace, the reactive-mechanism distinction from ADR-0005, the cross-extension read/write trust posture, and the operator UX sharp edges.

- [ ] **Step 1: Append a "Configuration" section to the README**

Add the following section after "Cross-extension exports" and before "Lifecycle (`deactivate?()`)" in `packages/extension-api/README.md`:

````markdown
## Configuration (`host.configuration`)

User-configurable settings live on `host.configuration`. The API mirrors VS Code's `vscode.workspace.getConfiguration` / `onDidChangeConfiguration` at the call site; the schema declaration shape is imperative per [ADR-0002](../../docs/decisions/ADR-0002-imperative-activate-api.md).

### Registering a setting

```ts
context.subscriptions.push(
  context.host.configuration.registerConfiguration({
    key: 'my-namespace.my-extension.refreshIntervalMs',
    schema: {
      type: 'number',
      minimum: 100,
      maximum: 60_000,
      description: 'How often to poll the upstream source, in milliseconds.',
    },
    default: 1000,
  }),
);
```

The `key` must start with your extension id; the `schema` is a JSON Schema Draft 07 object (TypeScript type: `JSONSchema7` re-exported from `@gcscode/extension-api`). The `default` is validated at registration; an invalid default throws synchronously.

### Reading a setting

```ts
const cfg = context.host.configuration.getConfiguration('my-namespace.my-extension');
const interval = cfg.get<number>('refreshIntervalMs');
// or with a fallback for unregistered keys:
const interval = cfg.get<number>('refreshIntervalMs', 1000);
```

### Observing changes

```ts
context.subscriptions.push(
  context.host.configuration.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('my-namespace.my-extension.refreshIntervalMs')) {
      // re-read and apply
    }
  }),
);
```

### Reactive reads in Svelte

`cfg.get(...)` reads from a `SvelteMap`-backed store inside the call body. Reads inside `$derived` / template contexts auto-track and re-render on `update()`. **This is a different mechanism from ADR-0005's `$state`-proxy cross-extension exports** (property reactivity vs. map-key reactivity); both produce equivalent ergonomics for Svelte consumers.

Reads cached into local variables outside a reactive context do NOT auto-track. Use `onDidChangeConfiguration` for non-Svelte consumers OR Svelte consumers caching reads.

### Writing a setting

```ts
await cfg.update('refreshIntervalMs', 2000);
```

`update` returns `Promise<void>` and rejects on schema mismatch, unregistered key, unsupported target (`ConfigurationTarget.Workspace`/`WorkspaceFolder` reject in v1 with `'Target not supported in v1'`), or persistence failure (`'Persistence failed: <reason>'`). In-memory commit and listener invocations happen BEFORE persistence — listeners observe the new value even if the persist step subsequently rejects.

### Trust posture

- Registration is **strict-prefix**: an extension can only register settings whose key starts with its own id.
- Reads are **open**: any extension can read any registered key.
- Writes are **open after registration**: any extension can write any registered key. The strict-prefix rule applies at registration only. Capability-gating for cross-extension writes is deferred per [ADR-0003](../../docs/decisions/ADR-0003-plugin-api-refinements.md).

### Operator UX in v1

There is no settings editor UI in v1. Operators flip values via browser devtools:

```js
const cfg = JSON.parse(localStorage.getItem('gcscode.configuration') ?? '{}');
cfg['my-namespace.my-extension.refreshIntervalMs'] = 2000;
localStorage.setItem('gcscode.configuration', JSON.stringify(cfg));
location.reload();
```

Known sharp edges of the devtools-only path: silent schema-validation failure on reload (the bad value stays in the blob, `get()` returns the default, no UI surface for the warning), no live-sync of devtools edits (reload required), and no UI surface for persistence-failure rejections from `update()`. A status-bar / boot-banner signal is a future iteration.

For the full design rationale see [`docs/specs/2026-05-18-configuration-system-v1.md`](../../docs/specs/2026-05-18-configuration-system-v1.md).
````

- [ ] **Step 2: Lint + format**

Run: `pnpm format && pnpm lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/extension-api/README.md
git commit -m "docs(extension-api): document host.configuration namespace"
```

---

## End-of-iteration verification

After Task 11, before opening the PR for ready-review:

- [ ] **Run the full suite:** `pnpm test` — every package's tests pass.
- [ ] **Type check:** `pnpm check` — svelte-check + tsc clean across the workspace.
- [ ] **Lint:** `pnpm lint` — eslint + prettier clean.
- [ ] **Manual smoke test:** `pnpm dev`, open the app, open browser devtools, edit `localStorage['gcscode.configuration']` to `'{"gcscode.sitl.connectionUrl":"ws://localhost:8088/v1/ws/mavlink"}'`, reload. SITL extension should connect to the configured URL. (If the value differs from default, the WebSocket frame in devtools confirms reconnect.)

The branch is now ready for the final cross-cutting review per `superpowers:subagent-driven-development`. After the final review approves, flip ready (`gh pr ready <num>`) and merge via `gh pr merge --merge <num>`.

Per CLAUDE.md "Post-merge implementation conventions", there's nothing further to propagate — the spec's docs propagation already landed in commit `796b50c`.
