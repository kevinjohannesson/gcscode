# Phase B4 — Extension manifest + persistence

**Status:** Approved (2026-04-27)

## Context

Phase B's "lifecycle and cleanup" arc grows by one: a code-defined manifest of bundled extensions plus a localStorage-backed persistence layer for `enabled` state. After this iteration, `main.ts` no longer hardcodes individual `manager.register(...)` calls; it iterates the manifest and applies persisted state per extension. The arc beyond this is `Extension.deactivate?()` hook → SITL stub.

This iteration is the "light manifest" — a list of installed extensions plus per-entry config — distinct from the still-deferred "declarative contributes manifest" (statically-parseable contributions, anchored by ADR-0003 + `out-of-scope.md`). The two answer different questions ("what is installed" versus "what does each extension declare it contributes"). None of the heavy manifest's triggers are met today; that bullet stays in `out-of-scope.md` as-is.

B2b's follow-up bullet listed manifest as the owner of (a) persistence of disabled state, (b) `unregister(id)` / uninstall, (c) initial-disabled flag on register. This iteration ships (a) and (c). `unregister(id)` is deferred — its triggering consumer is dynamic extension loading, also still deferred — so shipping `unregister(id)` now is dead code.

Persistence anchors on the manifest because the manifest is the canonical "what is installed" list keyed by id. The boot flow becomes: persistence reads localStorage, manifest provides bundled `Extension` references, and the manager registers each with its effective initial enabled state (manifest default unless overridden by localStorage).

## Decisions deliberately out of this iteration

- **`unregister(id)` / uninstall.** Same justification as B2b: no consumer until dynamic loading lands. Dynamic loading is deferred per `out-of-scope.md` ("Dynamic / runtime extension loading"), so `unregister(id)` rides with that iteration.

- **JSON-file manifest.** Bundled extensions are imported by package name at build time. A separate JSON file would indirect through string keys with no runtime benefit. Code-defined is the right cut for first-party + in-tree extensions; revisit when third-party / out-of-tree extensions land.

- **Toggle UI.** No view, palette entry, command, or keybinding that calls `manager.setEnabled(...)`. Persistence makes a future toggle UI useful (changes survive reload), but B4 only ships the substrate. Trigger to revisit: a real consumer (settings page, marketplace UI, in-shell debug view).

- **Multi-subscriber `onDidChangeExtensions`-style events on the manager.** B4 grows ONE construction-time callback (`onEnabledChanged`) consumed by ONE subscriber (persistence). VS Code's event-bus shape is YAGNI until a second consumer pulls. Trigger: a third concern (telemetry, a second persistence backend) wants to subscribe.

- **Storage backend abstraction.** The persistence module accepts a `Storage`-shaped object (defaults to `localStorage`) for testability. No abstract `IStorage` interface, no swappable backends, no IndexedDB / file / remote storage. Trigger to revisit: a second backend ships.

## VS Code alignment

GCScode mirrors VS Code's extension architecture **in spirit, not by byte**. B4 preserves the load-bearing patterns:

| VS Code feature                                                           | B4 in GCScode                                                                                           | Status                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manifest as canonical store of "what is installed"                        | ✓ — `bundledExtensions` array in `extension-manifest.ts`                                                | Aligned in spirit. VS Code reads each extension's `package.json`; we read a code-defined array of bundled imports. Both are authoritative for "what is installed."                                                                                                                                    |
| Per-extension persisted enablement state                                  | ✓ — localStorage key `gcscode.extensions.disabled` stores a JSON array of disabled ids                  | Aligned in spirit. VS Code keys by id at workspace + global scope; we key by id at a single global scope (no workspace concept exists in gcscode yet).                                                                                                                                                |
| Disabled extensions skip activation                                       | ✓ — `manager.register(ext, { enabled: false })` stores the record but does NOT call `registry.activate` | Aligned. Both VS Code and gcscode skip activation when an extension is registered as disabled.                                                                                                                                                                                                        |
| Lifecycle event surface (`onDidChangeExtensions`, `onDidEnableExtension`) | ➤ Ours — single construction-time callback `onEnabledChanged` on `createExtensionManager`               | Deliberate divergence. One consumer (persistence) means one callback is YAGNI-correct. Multi-subscriber lifecycle, event types, and payload schemas wait for the second consumer.                                                                                                                     |
| Persisted state schema                                                    | ➤ Ours — disabled-ids set, not a full state map                                                         | Deliberate divergence. VS Code persists per-extension records (timestamps, scopes, etc.). We persist only the exceptions: anything not in the disabled set is enabled. Adding a new manifest entry just works — no migration. Revisit if persisted state grows beyond a single boolean per extension. |
| Declarative `contributes` manifest (per-extension `package.json`)         | ✗ Deferred (per ADR-0003 + `out-of-scope.md`)                                                           | Triggering conditions ("settings UI that toggles individual contributions, marketplace preview, first untrusted extension module") not met. B4 ships the "what is installed" half; the "what does each extension contribute" half stays deferred.                                                     |
| Dynamic / runtime extension loading                                       | ✗ Deferred (per `out-of-scope.md`)                                                                      | Extensions still imported at build time. `unregister(id)` and runtime install couple to dynamic loading; shipping them now is dead code.                                                                                                                                                              |

## Goals

- A new `extension-manifest.ts` module (`packages/shell/src/extension-host/extension-manifest.ts`) exporting a `bundledExtensions` readonly array of `ManifestEntry` records (`{ id, extension, initialEnabled? }`). The example extension is the only entry today.

- A new `extension-persistence.ts` module (`packages/shell/src/extension-host/extension-persistence.ts`) exporting `createExtensionPersistence(storage?: Storage)`. Reads/writes a JSON-encoded array of disabled extension ids under the localStorage key `gcscode.extensions.disabled`. The factory accepts an optional `Storage`-shaped object (default: `localStorage`) for testability.

- Two additive, backwards-compatible API changes on `ExtensionManager`:
  - `register(extension, options?: { enabled?: boolean })`: optional second arg, defaults to `enabled: true`. When `enabled: false`, the manager stores the record but skips `registry.activate(extension)`.
  - `createExtensionManager(registry, options?: { onEnabledChanged?: (id, enabled) => void })`: optional second arg. The callback fires on `setEnabled` mutations that actually change state (not on no-ops); does NOT fire from `register`.

- `packages/shell/src/main.ts` rewrites to iterate `bundledExtensions`, applying `persistence.isInitiallyEnabled(id, initialEnabled)` per entry. The keybinding dispatcher and `App` mount continue to receive the registry.

- Co-located tests in `extension-manifest.test.ts` (light), `extension-persistence.test.ts` (behavioral), and additions to `extension-manager.test.ts` (new register option + onEnabledChanged callback).

- All existing tests pass without modification. Boot behavior is observably identical for the example extension (still enabled by default, still activates at boot) — the new code paths are additive.

- Doc propagation: add a B4 entry to `docs/roadmap.md`. No changes required to `docs/out-of-scope.md` (its manifest-shaped deferrals are about the heavy declarative `contributes` manifest, not the light list this iteration ships).

## Non-goals

- **`unregister(id)` / uninstall.** No removal verb on the manager.
- **JSON-file manifest.** Code-defined; no file IO.
- **Toggle UI / management view.** Substrate only.
- **Per-extension settings beyond `enabled`.** No `version-pinned`, `auto-update`, `sandboxed`, or other policy fields. The manifest entry's `initialEnabled` is the only configurable knob.
- **Multi-subscriber events on the manager.** Single callback at construction.
- **Workspace-vs-global scope split for persistence.** Single global scope.
- **Storage migration / versioning.** No prior schema; no migration.
- **Storage error handling beyond fallback-to-empty.** If localStorage throws on read or returns malformed JSON, fall back to "no extensions disabled" and continue. No retry, no telemetry, no error UI.
- **`Extension.deactivate?()` hook.** Still deferred — separate iteration.
- **Changes to `@gcscode/extension-api`.** The cross-package contract is unchanged; B4 is shell-internal.
- **Renaming `Registry.activate` → `register` / `Registry.deactivate` → `setEnabled`.** Same posture as B2b's spec: layered design over rename. Do not refactor registry method names.

## Public API

Three artifacts exposed by this iteration.

### `bundledExtensions` (`extension-manifest.ts`)

```ts
import type { Extension } from '@gcscode/extension-api';

import { exampleExtension } from '@gcscode/extension-example';

export interface ManifestEntry {
  id: string;
  extension: Extension;
  initialEnabled?: boolean;
}

export const bundledExtensions: readonly ManifestEntry[] = [
  { id: exampleExtension.id, extension: exampleExtension },
];
```

The `id` field is a separate field, not derived from `extension.id`. Today the two always match; the redundancy is intentional structural runway — a future dynamic-loading iteration can declare a manifest slot before the Extension module exists.

`initialEnabled` defaults to `true` when absent. Persisted localStorage state overrides this default.

### `ExtensionPersistence` (`extension-persistence.ts`)

```ts
export interface ExtensionPersistence {
  isInitiallyEnabled(id: string, fallback: boolean): boolean;
  recordEnabledChange(id: string, enabled: boolean): void;
}

export function createExtensionPersistence(storage?: Storage): ExtensionPersistence;
```

`isInitiallyEnabled(id, fallback)`: returns `false` if the id is in the disabled set; otherwise returns `fallback` (the manifest's `initialEnabled` default). An id absent from localStorage is the same as "not disabled."

`recordEnabledChange(id, enabled)`: writes localStorage. When `enabled` is `true`, removes the id from the disabled set. When `false`, adds it. Idempotent.

Storage key: `gcscode.extensions.disabled`. Value: JSON-encoded array of strings. Malformed JSON or storage exceptions fall back to an empty disabled set; failed writes are silently swallowed (in-memory state stays consistent for subsequent reads in the same session).

### `ExtensionManager` API additions

Backwards-compatible — both new args are optional.

```ts
export interface ExtensionManager {
  register(extension: Extension, options?: { enabled?: boolean }): void;
  setEnabled(id: string, enabled: boolean): void;
  listExtensions(): readonly ExtensionRecord[];
}

export function createExtensionManager(
  registry: Registry,
  options?: { onEnabledChanged?: (id: string, enabled: boolean) => void },
): ExtensionManager;
```

**`register(extension, options?)`:**

- `options.enabled === false`: store the record with `enabled: false`. Do NOT call `registry.activate`.
- `options.enabled === true` or `options` absent: store + call `registry.activate` (B2b behavior unchanged).
- The duplicate-id throw fires before any side effects, regardless of options.

**`createExtensionManager(registry, options?)`:**

- `options.onEnabledChanged`: invoked from `setEnabled` after the registry call returns and the SvelteMap update lands, but only when the enabled state actually changed (not on no-op same-value calls).
- `register` does NOT invoke the callback. Initial state is not a "change."

## Implementation sketches

### `extension-persistence.ts`

```ts
const STORAGE_KEY = 'gcscode.extensions.disabled';

export function createExtensionPersistence(storage: Storage = localStorage): ExtensionPersistence {
  const disabled = new Set<string>(loadDisabled(storage));
  return {
    isInitiallyEnabled(id, fallback) {
      if (disabled.has(id)) return false;
      return fallback;
    },
    recordEnabledChange(id, enabled) {
      if (enabled) disabled.delete(id);
      else disabled.add(id);
      saveDisabled(storage, disabled);
    },
  };
}

function loadDisabled(storage: Storage): string[] {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw == null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

function saveDisabled(storage: Storage, disabled: Set<string>): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(Array.from(disabled)));
  } catch {
    // localStorage may throw on quota exceeded or storage disabled.
    // In-memory state is still consistent for subsequent isInitiallyEnabled
    // calls; we just lose persistence across reload.
  }
}
```

### `extension-manager.ts` updates

Two additive changes; the rest of the file is unchanged from B2b.

```ts
export function createExtensionManager(
  registry: Registry,
  options: { onEnabledChanged?: (id: string, enabled: boolean) => void } = {},
): ExtensionManager {
  const extensions = new SvelteMap<string, ExtensionState>();
  const onEnabledChanged = options.onEnabledChanged;

  return {
    register(extension, registerOptions) {
      if (extensions.has(extension.id)) {
        throw new Error(`Extension id "${extension.id}" is already registered.`);
      }
      const enabled = registerOptions?.enabled ?? true;
      extensions.set(extension.id, { extension, enabled });
      if (enabled) {
        registry.activate(extension);
      }
    },
    setEnabled(id, enabled) {
      const state = extensions.get(id);
      if (state === undefined) {
        throw new Error(`Cannot set enabled state: extension id "${id}" is not registered.`);
      }
      if (state.enabled === enabled) {
        return;
      }
      if (enabled) {
        registry.activate(state.extension);
      } else {
        registry.deactivate(id);
      }
      extensions.set(id, { ...state, enabled });
      onEnabledChanged?.(id, enabled);
    },
    listExtensions() {
      return Array.from(extensions.values()).map(toRecord);
    },
  };
}
```

**Failure-handling notes carried forward from B2b:**

- `register(ext, { enabled: false })`: `extension.activate` is never called, so there is no partial-subscription concern. Clean store.
- `register(ext, { enabled: true })`: same as B2b. Store-first, then activate. Activate failure leaves the manager record as `enabled: true` and the registry partial.
- `setEnabled` failure path: same as B2b. The `onEnabledChanged` callback fires only after `extensions.set` lands, so a thrown registry call does not invoke the callback.

## Bootstrap (`packages/shell/src/main.ts`)

Today (post-B2b):

```ts
const registry = createRegistry();
const manager = createExtensionManager(registry);
manager.register(exampleExtension);

attachKeybindingDispatcher(registry, document);

mount(App, {
  target: document.getElementById('app')!,
  props: { registry },
});
```

After B4:

```ts
const registry = createRegistry();
const persistence = createExtensionPersistence();
const manager = createExtensionManager(registry, {
  onEnabledChanged: (id, enabled) => persistence.recordEnabledChange(id, enabled),
});

for (const { id, extension, initialEnabled = true } of bundledExtensions) {
  manager.register(extension, {
    enabled: persistence.isInitiallyEnabled(id, initialEnabled),
  });
}

attachKeybindingDispatcher(registry, document);

mount(App, {
  target: document.getElementById('app')!,
  props: { registry },
});
```

Boot order: construct registry; construct persistence (reads localStorage at construction); construct manager with the persistence-write callback wired; iterate manifest computing effective initial enabled per entry; wire keybinding dispatcher; mount App.

## Reactivity contract

Unchanged from B2b. `manager.listExtensions()` is reactive against the internal SvelteMap. The new `register(ext, { enabled: false })` path also goes through `extensions.set(...)`, so disabled-at-boot extensions show up in the reactive list with `enabled: false` from the start. No changes to consumers.

## Testing

### `extension-manifest.test.ts` (new)

Type-sanity. The manifest module is mostly declarative.

- `bundledExtensions` is non-empty.
- The example extension's id matches its entry's `id` field.

### `extension-persistence.test.ts` (new)

Tests use a `MemoryStorage` mock implementing the `Storage` interface (constructor sets up an internal `Map`; `getItem`/`setItem`/`removeItem`/`clear`/`key`/`length` delegate). Cases:

- Empty storage: `isInitiallyEnabled(id, true)` returns `true`; `isInitiallyEnabled(id, false)` returns `false`.
- Storage with `["ext.a"]`: `isInitiallyEnabled("ext.a", true)` returns `false`; `isInitiallyEnabled("ext.b", true)` returns `true`.
- `recordEnabledChange("ext.a", false)` writes `["ext.a"]` to storage.
- `recordEnabledChange("ext.a", true)` after a prior disable removes from storage; subsequent reads return empty.
- `recordEnabledChange("ext.a", true)` on an extension never previously disabled is a no-op (no exception, no spurious storage write changes the list).
- Malformed JSON in storage: fallback to empty disabled set; no throw.
- Storage `getItem` throws (e.g. SecurityError): fallback to empty; no throw.
- Storage `setItem` throws (e.g. QuotaExceededError): no throw; in-memory state still consistent for subsequent `isInitiallyEnabled` calls.

### `extension-manager.test.ts` (additions)

Existing 7 tests pass unchanged. New tests:

- `register(ext, { enabled: false })` stores the entry with `enabled: false` and does NOT call `registry.activate` (assert `registry.listViews()` is empty after registration; assert `manager.listExtensions()` shows `enabled: false`).
- `register(ext, { enabled: false })` followed by `setEnabled(id, true)` activates — fixture's activate spy was called exactly once; contributions appear in the registry.
- `onEnabledChanged` callback fires from `setEnabled` with `(id, enabled)` arguments matching the change.
- `onEnabledChanged` does NOT fire from same-value `setEnabled` (no-op path).
- `onEnabledChanged` does NOT fire from `register` (regardless of the enabled option).
- `register(ext, { enabled: true })` is equivalent to `register(ext)` — both store + activate; activate spy called exactly once.

### Unchanged test files

- `app.test.ts`, `registry.test.ts`, `keybinding-dispatcher.test.ts` — no changes. App, registry, and dispatcher are unaffected by manifest + persistence; they consume the registry directly.

## Files modified / added

| Path                                                              | Change                                                                                                                                                                                                                         |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/shell/src/extension-host/extension-manifest.ts`         | **New.** Exports `bundledExtensions` and the `ManifestEntry` interface.                                                                                                                                                        |
| `packages/shell/src/extension-host/extension-manifest.test.ts`    | **New.** Type-sanity assertions on the manifest contents.                                                                                                                                                                      |
| `packages/shell/src/extension-host/extension-persistence.ts`      | **New.** Exports `createExtensionPersistence` factory and `ExtensionPersistence` interface. localStorage-backed by default; `Storage`-injectable for tests.                                                                    |
| `packages/shell/src/extension-host/extension-persistence.test.ts` | **New.** `MemoryStorage` mock + behavioral tests covering empty / populated / malformed / throwing storage paths.                                                                                                              |
| `packages/shell/src/extension-host/extension-manager.ts`          | Two additive API changes: `register` grows an optional second arg `{ enabled?: boolean }`; `createExtensionManager` grows an optional second arg `{ onEnabledChanged? }`. Internal logic extended; existing surface unchanged. |
| `packages/shell/src/extension-host/extension-manager.test.ts`     | Add tests for the new register option and the onEnabledChanged callback. Existing tests untouched.                                                                                                                             |
| `packages/shell/src/main.ts`                                      | Replace the single `manager.register(exampleExtension)` call with the manifest-iterating bootstrap. Construct persistence; pass `onEnabledChanged` callback into the manager; iterate `bundledExtensions`.                     |
| `docs/roadmap.md`                                                 | Add a B4 entry under Phase B; flip checked. Detail in propagation section below.                                                                                                                                               |

No changes to:

- `@gcscode/extension-api` — cross-package contract.
- `@gcscode/extension-example` — worked example.
- `packages/shell/src/extension-host/registry.ts` or `registry.test.ts`.
- `packages/shell/src/app.svelte` or `app.test.ts`.
- `packages/shell/src/keybinding-dispatcher.ts` or its test.
- `docs/out-of-scope.md` — its deferrals (declarative `contributes` manifest, activation events, capability declarations, dynamic loading) are unaffected by B4. The "light manifest" this iteration ships does not pull on any of those triggers.
- Any ADR. ADR-0003's Phase B retrospective will be refreshed alongside the merge, mirroring the B1/B2a/B2b precedent.

## `docs/roadmap.md` propagation

Add a new line under "Phase B — Lifecycle and cleanup" between the existing B3 line and the unlettered `Extension.deactivate?()` hook line:

```md
- [x] **B4: Extension manifest + persistence** — `bundledExtensions` array; localStorage-backed disabled-id set; `ExtensionManager.register` grows `{ enabled? }`; `createExtensionManager` grows `{ onEnabledChanged }`. Spec: [`specs/2026-04-27-phase-b4-extension-manifest.md`](specs/2026-04-27-phase-b4-extension-manifest.md)
```

The B1, B2a, B2b lines stay unchanged. The B3 line stays unchanged. The `Extension.deactivate?()` hook line stays unchanged. Phase A and Phase C sections, the Feature extensions section, and the Maintenance section are unchanged.

## Verification

- `pnpm check` clean across all 3 packages.
- `pnpm test` — all existing tests pass; new tests in `extension-manifest.test.ts`, `extension-persistence.test.ts`, and additions in `extension-manager.test.ts` pass.
- `pnpm lint` clean.
- `pnpm build` (shell) succeeds.
- `pnpm dev` smoke test: app boots; example extension's view + status bar item + keybinding render and behave as before. localStorage's `gcscode.extensions.disabled` key is absent on a fresh start (no extensions have been disabled). The smoke test confirms the new bootstrap path does not break anything user-visible; runtime enable/disable end-to-end is not testable until a UI consumer lands.

If browser unavailable: rely on the test suites — `extension-manager.test.ts` covers the new register+callback surface end-to-end, `extension-persistence.test.ts` covers localStorage I/O, and `app.test.ts` continues to cover end-to-end UI.

## Follow-ups (out of scope for B4)

- **`Extension.deactivate?()` hook.** Optional extension-side hook for non-disposable / async teardown. Trigger: first extension that holds a connection (named on-deck consumer: SITL listener). When this lands, `setEnabled` and `register` may grow async signatures; the persistence callback's timing may need to interact with hook completion.
- **Toggle UI.** A view, palette entry, or settings page consuming `manager.listExtensions()` and calling `manager.setEnabled(...)`. Persistence is now in place, so toggle changes survive reload.
- **`unregister(id)` / uninstall + dynamic loading.** Coupled iteration. Replaces the static-import-driven `bundledExtensions` array with a dynamic discovery mechanism. Adds runtime install/uninstall to the manager. Trigger: a real third-party / out-of-tree extension consumer.
- **Workspace-vs-global persistence scopes.** When workspaces become a thing, persistence keying grows a workspace dimension.
- **Multi-subscriber events on manager.** A second consumer of enabled-state mutations triggers replacing the construction callback with a subscribe API returning a Disposable.
- **Per-extension settings beyond `enabled`.** When extensions need configuration knobs (e.g. SITL needs a connection URL), the persistence layer grows from a disabled-ids set to a richer per-id config map.
- **Phase B3 — dev-time hot module reload.** Independent of B4. Builds on B1 + B2a + (optionally) B2b's manager pattern.

## Cross-cutting notes

**Layered design holds.** B4 adds two layers without touching the registry. The shell now stacks: contributions (Registry) → lifecycle (ExtensionManager) → persistence (ExtensionPersistence) → boot configuration (extension-manifest.ts + main.ts). Each layer has one job.

**`registerN` duplication still remains.** A3's cross-cutting reviewer flagged the four `register*` blocks in `registry.ts` as a candidate for a `makeRegistrar<T>` factory. B1, B2a, B2b, B4 do not touch them. The duplication question is unchanged and remains a separate refactor independent of any phase iteration.

**Construction callback vs subscribe API.** The `onEnabledChanged` callback is a deliberate one-consumer minimum. The first time a second consumer lands (telemetry, debug overlay, second persistence backend), this becomes a `subscribe(callback): Disposable` API. The migration is mechanical — current callers wrap the callback in `manager.subscribe(callback)` — and is explicitly forecast as a follow-up trigger.

**Storage error handling philosophy.** The persistence module catches broadly on read AND write paths. localStorage can throw for reasons orthogonal to our code (Safari private mode, storage quota, browser security policy). The graceful fallback is "boot the app anyway, persistence becomes a no-op" — same observable behavior as a fresh install. Surfacing storage errors to the user requires UI we do not have. When a settings UI lands (Phase C), it can decide whether to expose persistence health.

**The `id` field on `ManifestEntry` is intentionally redundant with `extension.id`.** Today the two always match and a sanity-check test confirms it. The redundancy is structural runway for the dynamic-loading iteration: the manifest can declare a slot before the Extension module is loaded (the `extension` field becomes a lazy reference). Until then, the two stay equal and the duplication is documented.
