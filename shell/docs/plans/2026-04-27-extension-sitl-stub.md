# SITL stub extension implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a new `@gcscode/extension-sitl` package — the first feature extension — exporting `sitlExtension` with a placeholder view, a `getLocation` command, and an `Alt+Shift+L` keybinding, all backed by a hardcoded `SITL_LOCATION` constant. Wire the new extension into the shell's `bundledExtensions` manifest.

**Architecture:** A new pnpm workspace package mirroring `@gcscode/extension-example`'s layout. Module structure: `index.ts` exports the extension (3 contributions); `location.ts` exports the shared `SITL_LOCATION` constant; `sitl-view.svelte` is a presentational component reading the constant. Three tests in `index.test.ts` mirror the example extension's test pattern. The shell consumes the new extension transitively through one new `ManifestEntry` in `extension-manifest.ts` plus one new `dependencies` line in `packages/shell/package.json`. Registry, manager, persistence layer, and `main.ts` are unchanged.

**Tech Stack:** TypeScript, Svelte 5, Vitest (no DOM testing for the view; mocked `host.register*` calls follow `extension-example`'s pattern), pnpm workspaces.

**Spec:** `docs/specs/2026-04-27-extension-sitl-stub.md` (commit `21286bb`). The spec is the canonical reference for code shapes, test descriptions, and implementation sketches. This plan sequences the work, gives exact commands, and points at spec sections rather than re-pasting their contents.

**Reference module:** `packages/extension-example/` is the canonical pattern. Every new file in this iteration is a near-clone with `example` → `sitl` substitutions. Read it before starting.

---

## File structure

| Path                                                      | Responsibility                                                                                                                           |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/extension-sitl/package.json`                    | **New.** Mirrors `extension-example/package.json` with `@gcscode/extension-sitl` as the name. (Task 2.)                                  |
| `packages/extension-sitl/tsconfig.json`                   | **New.** Identical to `extension-example/tsconfig.json`. (Task 2.)                                                                       |
| `packages/extension-sitl/vitest.config.ts`                | **New.** Identical to `extension-example/vitest.config.ts`. (Task 2.)                                                                    |
| `packages/extension-sitl/README.md`                       | **New.** Short, mirrors `extension-example/README.md` style. (Task 2.)                                                                   |
| `packages/extension-sitl/src/location.ts`                 | **New.** Single-export module with `SITL_LOCATION`. (Task 2.)                                                                            |
| `packages/extension-sitl/src/sitl-view.svelte`            | **New.** Presentational component reading `SITL_LOCATION`. (Task 2.)                                                                     |
| `packages/extension-sitl/src/index.ts`                    | **New.** Exports `sitlExtension`. Three `host.register*` calls per the spec. (Task 2.)                                                   |
| `packages/extension-sitl/src/index.test.ts`               | **New.** Three tests mirroring `extension-example/src/index.test.ts`. (Task 2.)                                                          |
| `packages/shell/src/extension-host/extension-manifest.ts` | Add `sitlExtension` import + new `ManifestEntry`. (Task 3.)                                                                              |
| `packages/shell/package.json`                             | Add `@gcscode/extension-sitl: workspace:*` to `dependencies`. (Task 3.)                                                                  |
| `docs/roadmap.md`                                         | Add a checked "SITL stub" entry under "Feature extensions → Coming", immediately above the existing unchecked "SITL listener". (Task 4.) |

No changes to `@gcscode/extension-api`, `@gcscode/extension-example`, `packages/shell/src/extension-host/registry.ts` or any other shell-internal source file (registry, manager, persistence, `app.svelte`, `main.ts`, keybinding-dispatcher), `docs/out-of-scope.md`, or any ADR.

---

### Task 1: Establish green baseline

**Files:** none

- [ ] **Step 1: Verify clean working tree on the feature branch**

Run: `git status && git branch --show-current`
Expected: `nothing to commit, working tree clean`. Branch is `feat/extension-sitl-stub`. If branch is `master`, stop and ask the controller.

- [ ] **Step 2: Verify all tests pass before changes**

Run: `pnpm test`
Expected: 105 tests pass — 102 in `@gcscode/shell` (44 in `registry.test.ts`, 8 in `app.test.ts`, 27 in `keybinding-dispatcher.test.ts`, 13 in `extension-manager.test.ts`, 8 in `extension-persistence.test.ts`, 2 in `extension-manifest.test.ts`), 3 in `@gcscode/extension-example`. (`@gcscode/extension-api` reports no test files, exits 0.)

- [ ] **Step 3: Verify check + lint clean**

Run: `pnpm check && pnpm lint`
Expected: both exit 0 with no errors.

---

### Task 2: Create the `@gcscode/extension-sitl` package

**Files:**

- Create: `packages/extension-sitl/package.json`
- Create: `packages/extension-sitl/tsconfig.json`
- Create: `packages/extension-sitl/vitest.config.ts`
- Create: `packages/extension-sitl/README.md`
- Create: `packages/extension-sitl/src/location.ts`
- Create: `packages/extension-sitl/src/sitl-view.svelte`
- Create: `packages/extension-sitl/src/index.ts`
- Create: `packages/extension-sitl/src/index.test.ts`

This task ships the entire new package as one commit. Order matters: scaffolding (config files) before source (so vitest can discover tests), source before tests is fine because we'll write the failing test first inside the same file as a TDD pass. The whole package lands as one atomic addition.

- [ ] **Step 1: Create the package scaffolding**

Mirror `packages/extension-example/{package.json,tsconfig.json,vitest.config.ts}` exactly with `example` → `sitl` swapped in the name field. The `tsconfig.json` and `vitest.config.ts` are identical (no name to swap). For `README.md`, write a 2–3 sentence summary using the same heading + one-paragraph format as `packages/extension-example/README.md`; phrase it around "SITL stub: placeholder view + getLocation command, hardcoded coordinates, real telemetry pending."

The `package.json` exports must match `extension-example/package.json` byte-for-byte except for the `name` field (`@gcscode/extension-sitl`). Specifically: `private: true`, `version: 0.0.0`, `type: module`, `main`/`types`/`exports` pointing at `./src/index.ts`, `scripts.check` and `scripts.test` identical, `dependencies: { "@gcscode/extension-api": "workspace:*" }`, `peerDependencies: { "svelte": "^5.0.0" }`.

- [ ] **Step 2: Run `pnpm install` to register the new workspace package**

Run: `pnpm install`
Expected: Pnpm picks up the new package via the workspace glob `packages/*`. The output reports the workspace links resolving without errors. The new `packages/extension-sitl/node_modules` directory is created (or symlinked from the workspace root). The shell's existing dependencies are unchanged at this step (the shell does not yet depend on `@gcscode/extension-sitl`).

- [ ] **Step 3: Create `src/location.ts` per spec**

Implement per spec section "Public API → The internal shared constant". The module exports a single `SITL_LOCATION` constant with `lat` and `lng` literal values, declared `as const`. The full file is in the spec.

- [ ] **Step 4: Create `src/sitl-view.svelte` per spec**

Implement per spec section "Implementation sketches → `src/sitl-view.svelte`". The component imports `SITL_LOCATION` from `./location`, renders a `<section>` with an `<h2>` and a `<dl>` showing `lat.toFixed(6)°` and `lng.toFixed(6)°`, plus a `<p>` noting the placeholder status. No `<style>` block. The full file is in the spec.

- [ ] **Step 5: Write the failing tests in `src/index.test.ts`**

Implement per spec section "Implementation sketches → `src/index.test.ts`" using the testing pattern in `packages/extension-example/src/index.test.ts`. Three tests:

1. `declares stable identity metadata` — assert `sitlExtension.id === 'gcscode.sitl'`, `sitlExtension.displayName === 'SITL Stub'`, `typeof sitlExtension.version === 'string'`.
2. `registers a view, a command, and a keybinding, pushing all three disposables` — set up three `vi.fn()` register stubs returning unique disposable mocks, plus stubs for `registerStatusBarItem` and `executeCommand` on the host (the contract requires the full `ExtensionHost` object even if these methods are not invoked). Call `sitlExtension.activate(context)`. Assert each register call was made with the exact arguments listed in the spec's "Public API" section. Assert `subscriptions` equals the three disposables in registration order (view, command, keybinding).
3. `getLocation command returns the SITL_LOCATION constant and logs it` — extract the command contribution from `registerCommand.mock.calls[0][0]`. Spy on `console.log` via `vi.spyOn`. Call `run()`, assert it returns the same value as `SITL_LOCATION` (use `expect(run()).toEqual(SITL_LOCATION)`), assert `console.log` was called with `'SITL location:'` and `SITL_LOCATION` as separate arguments. Restore the spy at the end.

The test file's import structure must match `extension-example/src/index.test.ts`: `vitest` first, then `import type { ExtensionContext } from '@gcscode/extension-api'`, then `./index` and `./sitl-view.svelte` and `./location`.

- [ ] **Step 6: Run tests, expect failures**

Run: `pnpm --filter @gcscode/extension-sitl test`
Expected: tests fail with import resolution errors — `index.ts` does not yet exist, so `import { sitlExtension } from './index'` cannot resolve.

- [ ] **Step 7: Create `src/index.ts` per spec**

Implement per spec section "Implementation sketches → `src/index.ts`". The full file is in the spec. Three contributions in one `activate(context)` call: `registerView` (id `gcscode.sitl.location`, component `SitlView`), `registerCommand` (id `gcscode.sitl.getLocation`, `run` logs and returns `SITL_LOCATION`), `registerKeybinding` (key `Alt+Shift+L`, command `gcscode.sitl.getLocation`). All three disposables pushed to `context.subscriptions` in that order.

Imports follow `extension-example/src/index.ts`'s convention: type-only `Extension` from `@gcscode/extension-api`, blank line, value imports from `./location` and `./sitl-view.svelte`.

- [ ] **Step 8: Run tests, expect pass**

Run: `pnpm --filter @gcscode/extension-sitl test`
Expected: 3 tests pass.

- [ ] **Step 9: Run check + lint**

Run: `pnpm check && pnpm lint`
Expected: both clean. svelte-check reports the new package's files included with 0 errors / 0 warnings. ESLint and Prettier clean.

- [ ] **Step 10: Run the full workspace test suite**

Run: `pnpm test`
Expected: 108 tests pass (105 prior + 3 new). The `@gcscode/extension-sitl` row reports `Test Files 1 passed (1)`, `Tests 3 passed (3)`.

- [ ] **Step 11: Commit**

```bash
git add packages/extension-sitl
git commit -m "$(cat <<'EOF'
feat(sitl): add @gcscode/extension-sitl stub package

First feature extension. Mirrors @gcscode/extension-example's package
layout. Contributes a placeholder view (gcscode.sitl.location), a
getLocation command (gcscode.sitl.getLocation) returning the shared
SITL_LOCATION constant, and an Alt+Shift+L keybinding bound to the
command.

SITL_LOCATION lives in src/location.ts as a single-export module
(as const) so the view component and the command's run() share the
exact same value with no drift risk. Hardcoded to ArduPilot SITL's
default home (-35.363261, 149.165230 — Canberra Model Aircraft Club);
real telemetry pending the SITL listener iteration.

Three tests in index.test.ts mirror extension-example's pattern:
identity metadata, contribution registration with disposable order,
and command run() behavior with console.log side effect.

Manifest entry + shell package.json dependency land in the next
commit.

Spec: docs/specs/2026-04-27-extension-sitl-stub.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Wire the SITL extension into the shell

**Files:**

- Modify: `packages/shell/src/extension-host/extension-manifest.ts`
- Modify: `packages/shell/package.json`

- [ ] **Step 1: Update `extension-manifest.ts`**

Apply the manifest edit per spec section "Bootstrap / manifest changes". Add `import { sitlExtension } from '@gcscode/extension-sitl'` (alphabetically after the existing `exampleExtension` import) and append a second `ManifestEntry` to the `bundledExtensions` array. The full target shape is in the spec.

The new array reads:

```ts
export const bundledExtensions: readonly ManifestEntry[] = [
  { id: exampleExtension.id, extension: exampleExtension },
  { id: sitlExtension.id, extension: sitlExtension },
];
```

- [ ] **Step 2: Update `packages/shell/package.json`**

Add `"@gcscode/extension-sitl": "workspace:*"` to the `dependencies` object. Place it alphabetically — the resulting order is `@gcscode/extension-api`, `@gcscode/extension-example`, `@gcscode/extension-sitl`.

- [ ] **Step 3: Re-link workspace dependencies**

Run: `pnpm install`
Expected: pnpm registers the new workspace dependency from shell to extension-sitl. No new external packages are downloaded.

- [ ] **Step 4: Run the full test suite**

Run: `pnpm test`
Expected: 108 tests pass. The two existing manifest tests in `extension-manifest.test.ts` (non-empty + id consistency) now iterate over two entries instead of one; both still pass.

- [ ] **Step 5: Run check + lint**

Run: `pnpm check && pnpm lint`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add packages/shell/src/extension-host/extension-manifest.ts packages/shell/package.json
git commit -m "$(cat <<'EOF'
feat(shell): bundle @gcscode/extension-sitl in the manifest

Add a second ManifestEntry for the SITL stub. main.ts iterates the
manifest and now activates two extensions at boot: the example and
SITL. The keybinding dispatcher and App mount continue to receive
the registry; no Svelte component consumes the manifest directly.

Spec: docs/specs/2026-04-27-extension-sitl-stub.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Roadmap propagation

**Files:**

- Modify: `docs/roadmap.md`

- [ ] **Step 1: Add the SITL stub line per spec**

Apply the edit per spec section "`docs/roadmap.md` propagation". Insert ONE new line in the "Feature extensions → Coming" section, immediately ABOVE the existing unchecked "SITL listener" line. The exact line content is in the spec's propagation section. Do NOT modify the existing SITL listener line — it represents the future connection iteration. Do NOT modify the Map line, the Video feed line, the Considering section, or the Maintenance section.

- [ ] **Step 2: Format and lint**

Run: `pnpm format && pnpm lint`
Expected: both clean. Prettier may rewrap the long line; benign.

- [ ] **Step 3: Commit**

```bash
git add docs/roadmap.md
git commit -m "$(cat <<'EOF'
docs: roadmap entry for SITL stub

Adds a checked "SITL stub" entry under Feature extensions → Coming,
immediately above the existing unchecked "SITL listener" line. The
listener line stays as-is and represents the future connection +
Extension.deactivate?() hook iteration.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: End-to-end verification

**Files:** none

- [ ] **Step 1: Run the full check suite**

Run: `pnpm check && pnpm test && pnpm lint`
Expected: all clean. Workspace test count: 108 (102 shell + 3 example + 3 sitl).

- [ ] **Step 2: Production build smoke test**

Run: `pnpm --filter @gcscode/shell build`
Expected: build succeeds. Bundle size delta is small (a few hundred bytes for the new view component and module).

- [ ] **Step 3: Optional dev server smoke test**

Run: `pnpm dev` (in the background) and open `http://localhost:5173/` in a browser (or via chrome-devtools-mcp). Confirm:

- Header reads `GCScode`.
- Two views render in the content area: the existing example extension's view AND the new SITL Stub view (with `Latitude -35.363261°` and `Longitude 149.165230°`).
- The status bar footer still shows the example extension's `Example` item on the right.
- No errors or warnings in the browser console.
- Press `Alt+Shift+G` — console shows `Hello from gcscode.example` (existing keybinding).
- Press `Alt+Shift+L` — console shows `SITL location:` followed by the location object (new keybinding).

If browser unavailable, the test suites cover the substantive paths; the dev-server check is a regression guard against accidental coupling.

Stop the background `pnpm dev` process when done.

- [ ] **Step 4: Confirm clean tree and feature commits**

Run: `git status && git log --oneline master..HEAD`
Expected: `nothing to commit, working tree clean`. Branch contains 3 new commits beyond master (Tasks 2, 3, 4), plus any `Code-review-followup:` commits the controller adds during the per-task review loop.

---

## Out of scope reminders

These are intentionally NOT part of this iteration (see the spec):

- **Real telemetry connection.** Static `SITL_LOCATION` only; no WebSocket, fetch, polling.
- **Reactive / ticking lat/lng.** No `$state`, no setInterval.
- **`Extension.deactivate?()` hook.** No async cleanup; Disposables are sufficient.
- **Map view contribution kind.** Plain `<dl>` only.
- **Status bar item.** Skipped.
- **Command palette UI.** Out-of-scope.
- **Tests for the rendered view DOM.** Smoke test only via the dev server.
- **Changes to `@gcscode/extension-api`, `@gcscode/extension-example`, the registry, the manager, the persistence layer, `main.ts`, `app.svelte`, the keybinding dispatcher, or any ADR.**

If a step tempts you toward any of those, stop and re-read the spec.

## Cross-cutting note on package mirroring

`packages/extension-sitl/` is a near-clone of `packages/extension-example/`. Mirror the layout faithfully — same `package.json` keys in the same order (with only the `name` field changed), same `tsconfig.json` content (identical), same `vitest.config.ts` content (identical), same test fixture pattern. Diverging from the precedent here makes the codebase harder to scan.

If a future review thinks the duplication should become a generator or a shared template, that's a separate refactor. Don't pre-emptively factor it.

## Cross-cutting note on the shared `SITL_LOCATION` module

The constant lives in its own `src/location.ts` module — not inlined in `index.ts` and re-imported in the view, which would create a circular import. The dedicated module is more file surface than the value warrants in isolation, but the alternative is worse. When the real telemetry iteration lands, `location.ts` likely grows from a constant into a Svelte store (or `$state`-backed module) consumed by the same two callers; the file boundary stays the same.

## Cross-cutting note on the `console.log` side effect in the command

The command's `run()` logs `'SITL location:'` followed by the location object before returning. This mirrors `gcscode.example.greet`'s `console.log + return` pattern. The log is the only user-visible signal that the keybinding fired (no UI consumer of `executeCommand`'s return value yet). When a real consumer surfaces (palette UI, settings page), the log can stay or go — that's a future-iteration call.
