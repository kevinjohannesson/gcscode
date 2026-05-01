# VS Code alignment ledger + post-iteration-A drift fixes — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `docs/vs-code-alignment.md` (the cumulative VS Code alignment / divergence / deferral ledger) and refresh three stale doc references — `packages/extension-sitl/README.md` (replaced), `packages/extension-api/README.md` (comprehensive refresh), and one bullet in `docs/out-of-scope.md`. Codify the propagation rule in `CLAUDE.md` and surface two currently-unarticulated deferrals into `out-of-scope.md` as new bullets.

**Architecture:** Pure docs change — one new file, four modified files, two commits on master directly (no feature branch, no `--no-ff`), per `CLAUDE.md` ("Spec/plan commits can land on master directly") and per the 2026-04-27-roadmap precedent (the prior docs-only consolidation that created `docs/roadmap.md`).

**Tech Stack:** Markdown. Validated by `pnpm format` (Prettier on `.md` files) and `pnpm lint` (ESLint + `prettier --check`). No test runner involved in the change itself; existing tests run only as a sanity check.

**Spec:** [`docs/specs/2026-05-01-vs-code-alignment-ledger.md`](../specs/2026-05-01-vs-code-alignment-ledger.md)

---

## File structure

| Path                                | Responsibility                                                                                                                                                                                                                                                 |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/vs-code-alignment.md`         | NEW. Cumulative ledger with three sections (Alignments, Divergences, Deferrals) plus maintenance protocol. (Task 3 Step 1.)                                                                                                                                    |
| `packages/extension-sitl/README.md` | REPLACED. Stub-era 2-paragraph description replaced with current live-telemetry description. (Task 2 Step 1.)                                                                                                                                                  |
| `packages/extension-api/README.md`  | REPLACED. Comprehensive refresh covering `getExtension`, the `activate()` return value (cross-extension exports), `Extension.deactivate?()`, and the softened sibling type-import boundary rule. (Task 2 Step 2.)                                              |
| `docs/out-of-scope.md`              | THREE edits under `## Extension machinery`: refresh "Activation events / lazy activation" bullet (Task 2 Step 3); add new bullet "Numeric `priority` for status bar items" (Task 3 Step 2a); add new bullet "Per-extension persistent state" (Task 3 Step 2b). |
| `CLAUDE.md`                         | TWO edits: append one sentence under `### VS Code alignment (in spirit, not by byte)` (Task 3 Step 3); insert one bullet into `## Further reading` (Task 3 Step 4).                                                                                            |

---

### Task 1: Establish green baseline

**Files:** none

- [ ] **Step 1: Verify on master with clean working tree**

Run: `git status && git branch --show-current`
Expected: `nothing to commit, working tree clean`. Branch is `master`. (This iteration commits directly to master — no feature branch, per the spec's `## Branching and commit` section.)

- [ ] **Step 2: Verify lint clean**

Run: `pnpm lint`
Expected: ESLint passes; `Checking formatting...` followed by `All matched files use Prettier code style!`. Exit code 0.

(Skip `pnpm test` and `pnpm check` at baseline — this iteration touches no code or test files; sanity-check both at the end of Task 4 instead.)

---

### Task 2: Drift fixes (commit 1)

**Files:**

- Modify: `packages/extension-sitl/README.md`
- Modify: `packages/extension-api/README.md`
- Modify: `docs/out-of-scope.md`

This task replaces stale doc references and lands a single commit. There is no failing-test-first cycle (this is docs).

- [ ] **Step 1: Replace `packages/extension-sitl/README.md` with current content**

Replace ALL existing content of `packages/extension-sitl/README.md` with exactly:

```md
# @gcscode/extension-sitl

Live ArduPilot SITL telemetry via a mavlink2rest WebSocket bridge.

Connects to `ws://localhost:8088/v1/ws/mavlink`, subscribes to `HEARTBEAT`, `GLOBAL_POSITION_INT`, `ATTITUDE`, `VFR_HUD`, and `SYS_STATUS`, and folds incoming messages into a reactive `$state` store.

## Contributions

- **View** — `gcscode.sitl.location`, renders live telemetry.
- **Command** — `gcscode.sitl.getLocation`, returns `{lat, lng, alt}` or `null` if no fix yet, and logs it.
- **Keybinding** — `Alt+Shift+L` → `gcscode.sitl.getLocation`.

## Cross-extension exports

Exports `SitlExports = { telemetry: Readonly<TelemetryState> }`. Consumers read live telemetry via `host.getExtension<SitlExports>('gcscode.sitl')?.exports.telemetry`. The `telemetry` field is a Svelte `$state` proxy — reads in `$derived` / template contexts auto-track. See [ADR-0005](../../docs/decisions/ADR-0005-extension-boundaries.md).

`@gcscode/extension-vehicle-status` is the canonical consumer.

## Lifecycle

`deactivate()` closes the WebSocket and resets the telemetry store. First consumer of `Extension.deactivate?()`.
```

- [ ] **Step 2: Replace `packages/extension-api/README.md` with comprehensive refresh**

Replace ALL existing content of `packages/extension-api/README.md` with exactly:

````md
# @gcscode/extension-api

The only import path for extensions. Everything an extension is allowed to do flows through the types in this package.

## Stability

Experimental. The surface is expected to change as permissions, lifecycle, and additional contribution kinds are added. The current version exposes a small, deliberately minimal set of contribution kinds.

## Usage

```ts
import type { Extension } from '@gcscode/extension-api';
import View from './view.svelte';
import StatusBadge from './status-badge.svelte';

export const myExtension: Extension = {
  id: 'my-namespace.my-extension',
  displayName: 'My Extension',
  version: '0.0.0',
  activate(context) {
    context.subscriptions.push(
      context.host.registerView({
        id: 'my-namespace.my-extension.main',
        component: View,
      }),
      context.host.registerStatusBarItem({
        id: 'my-namespace.my-extension.status',
        component: StatusBadge,
        alignment: 'right',
      }),
      context.host.registerCommand({
        id: 'my-namespace.my-extension.greet',
        run: () => 'Hello',
      }),
      context.host.registerKeybinding({
        key: 'Alt+Shift+G',
        command: 'my-namespace.my-extension.greet',
      }),
    );

    // Commands can be invoked by id from anywhere on the host:
    //   context.host.executeCommand('my-namespace.my-extension.greet')
    // — or fired by a registered keybinding when the user presses Alt+Shift+G.
  },
};
```

See `packages/extension-example/` for the canonical worked example.

## The activation context

`activate(context)` receives an `ExtensionContext`:

- **`context.host`** — the per-extension gate. Exposes one `register*` method per contribution kind (today: `registerView`, `registerStatusBarItem`, `registerCommand`, `registerKeybinding`); the verb `executeCommand<T>(id, ...args): Promise<T>` for firing any registered command by id; and `getExtension<T>(id): { id; exports: T } | undefined` for looking up another extension's published exports. Each `register*` call returns a `Disposable`. The `run` callback on a command is variadic (`(...args: unknown[]) => unknown`); arguments threaded through `executeCommand(id, ...args)` arrive there. The shell's keyboard dispatcher fires keybindings by calling `executeCommand` from the host side directly (it isn't an extension), via the same shared implementation.
- **`context.subscriptions`** — push every `Disposable` here. The host disposes them when the extension is (eventually) deactivated. See ADR-0003.
- **`context.extension`** — read-only identity (`id`, `displayName`, `version`) for the activating extension, in case you need it for log prefixes or error messages.

## Cross-extension exports

`activate(context)` may return a value that becomes the extension's published exports. Other extensions look it up via `context.host.getExtension<T>(id)?.exports`. Producers that don't expose an API may return nothing.

```ts
export interface MyExports {
  readonly thing: Thing;
}

export const myExtension: Extension = {
  id: 'my-namespace.my-extension',
  displayName: 'My Extension',
  version: '0.0.0',
  activate(context): MyExports {
    // ...
    return { thing };
  },
};
```

Consumers `import type { MyExports } from '@my-namespace/extension-my-extension'` and read the live value at runtime via `getExtension`. The `T` generic on `getExtension` is unsafe sugar — producers and consumers commit to a shared type contract via the producer's exported `*Exports` type. Reads inside Svelte `$derived` / template contexts auto-track the underlying registry: consumers re-render when the producer enables / disables.

See [ADR-0005](../../docs/decisions/ADR-0005-extension-boundaries.md) for the full design and `@gcscode/extension-vehicle-status` for the canonical consumer.

## Lifecycle (`deactivate?()`)

`Extension` may declare an optional `deactivate?(): void | Promise<void>` method for non-disposable / async cleanup (closing connections, flushing queues, awaiting workers). The host:

- runs the hook **before** disposing `context.subscriptions`,
- catches and logs hook errors (sync throw or async rejection); subscription teardown still proceeds,
- awaits the returned Promise (if any).

Use `subscriptions` for everything that fits the `Disposable` shape; reach for `deactivate?()` only when teardown does not. See [`docs/specs/2026-04-27-extension-deactivate-hook.md`](../../docs/specs/2026-04-27-extension-deactivate-hook.md).

## Conventions for extension authors

- Your package's main export must be a named `const` matching your extension's slug (e.g. `exampleExtension`, not `extension` or `default`).
- Provide stable, namespaced ids: `<extension-id>.<local-name>` (e.g. `gcscode.example.main`). Duplicate ids throw at registration; one id can be reused across the three id-keyed kinds (a view, a status bar item, and a command may all share the same id). Keybindings are keyed by their `key` field instead — duplicate keys throw separately.
- Your package must list `@gcscode/extension-api` as a dependency (`workspace:*` inside this monorepo; `peerDependency` once extensions are published externally).
- Never import RUNTIME code from `@gcscode/shell` or sibling extension packages. Never use relative paths that escape your package root. Type-only imports from sibling extension packages ARE allowed for consuming cross-extension `*Exports` types — see [ADR-0005](../../docs/decisions/ADR-0005-extension-boundaries.md). ESLint enforces both rules (see root `eslint.config.ts`).
````

- [ ] **Step 3: Edit `docs/out-of-scope.md` — refresh the "Activation events / lazy activation" bullet**

Find this bullet in `docs/out-of-scope.md` (under `## Extension machinery`):

```md
- **Activation events / lazy activation.** No `activationEvents: ["onCommand:..."]`. Extensions activate once at bootstrap, eagerly. _Trigger to revisit:_ cold-start time becomes a problem (~50+ extensions). (ADR-0003)
```

Replace it with exactly:

```md
- **Activation events / lazy activation.** No `activationEvents: ["onCommand:..."]`. Extensions activate eagerly — at boot, or when re-enabled at runtime via `manager.setEnabled(id, true)` post-B2b. Never lazily on event. _Trigger to revisit:_ cold-start time becomes a problem (~50+ extensions). (ADR-0003)
```

This is the ONLY edit to `docs/out-of-scope.md` in Task 2. The two new bullets land in Task 3 Step 2.

- [ ] **Step 4: Run format and lint**

Run: `pnpm format && pnpm lint`
Expected: Prettier may rewrite minor formatting (likely a no-op for content authored to spec-quoted form, but possible if line lengths or list spacing diverge); `pnpm lint` then reports `All matched files use Prettier code style!` and exits 0.

If `pnpm lint` flags anything other than the three files this task touched, stop and investigate before staging — `pnpm format` should only have rewritten the three files this task touched (or none of them).

- [ ] **Step 5: Verify only the intended files are pending changes**

Run: `git status`
Expected: modified files: `packages/extension-sitl/README.md`, `packages/extension-api/README.md`, `docs/out-of-scope.md`. No untracked files. No other modified files.

If any other file appears in the output, stop and investigate before proceeding — the change should be exactly three files.

- [ ] **Step 6: Commit**

```bash
git add packages/extension-sitl/README.md packages/extension-api/README.md docs/out-of-scope.md
git commit -m "$(cat <<'EOF'
docs: refresh stale references in extension READMEs and out-of-scope.md

Updates packages/extension-sitl/README.md from the stub-era description
("hardcoded coordinates, real telemetry pending") to the current live
mavlink listener with cross-extension SitlExports.

Comprehensive refresh of packages/extension-api/README.md: the
activation-context bullet now mentions getExtension; new sections cover
cross-extension exports (with the activate() return value) and the
optional Extension.deactivate?() hook; the Conventions boundary rule is
softened to allow type-only sibling imports per ADR-0005.

Refreshes the "Activation events / lazy activation" bullet in
docs/out-of-scope.md so the description acknowledges that extensions
also re-activate at runtime via manager.setEnabled(id, true) post-B2b
— the deferral itself is unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Verify commit landed**

Run: `git log --oneline -2 && git status`
Expected: HEAD = the new commit with subject `docs: refresh stale references in extension READMEs and out-of-scope.md`; HEAD~1 = `7b5f661 docs: spec for VS Code alignment ledger + post-iteration-A drift fixes`. `nothing to commit, working tree clean`.

---

### Task 3: VS Code alignment ledger + maintenance rule (commit 2)

**Files:**

- Create: `docs/vs-code-alignment.md`
- Modify: `docs/out-of-scope.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Create `docs/vs-code-alignment.md` with the verbatim content**

Create the new file `docs/vs-code-alignment.md` at the repo root (i.e. `<workspace>/docs/vs-code-alignment.md`) with exactly this content:

```md
# VS Code alignment ledger

This document records gcscode's cumulative alignments with and divergences from VS Code's extension architecture. Per `CLAUDE.md`, alignment with VS Code is the long-term goal "in spirit, not by byte" — we adopt VS Code's load-bearing patterns and diverge on syntax / style / ergonomics when local context warrants.

Per-spec "VS Code alignment" sections (see e.g. [`specs/2026-04-27-extension-deactivate-hook.md`](specs/2026-04-27-extension-deactivate-hook.md)) record one iteration's snapshot. This ledger is the cross-iteration cumulative view.

## Status conventions

- **Alignments** — VS Code does X; we do X. Recorded as load-bearing matches only. Anything not listed below is unaddressed, not necessarily different.
- **Divergences** — VS Code does X; we do Y, deliberately. Trigger column is "—" for divergences that are permanent.
- **Deferrals** — VS Code does X; we don't yet. Trigger column tells you when to revisit.

## Alignments

| Concern                                                                                       | VS Code                                                   | gcscode                              | Source                                                                                                     |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Disposable contract on every `register*`                                                      | ✓                                                         | ✓                                    | [ADR-0003](decisions/ADR-0003-plugin-api-refinements.md)                                                   |
| Imperative `activate(context)`                                                                | ✓                                                         | ✓                                    | [ADR-0002](decisions/ADR-0002-imperative-activate-api.md)                                                  |
| `ExtensionContext` shape (host, subscriptions, identity)                                      | ✓                                                         | ✓                                    | [ADR-0003](decisions/ADR-0003-plugin-api-refinements.md)                                                   |
| Cross-extension exports via `getExtension(id).exports`                                        | ✓                                                         | ✓                                    | [ADR-0005](decisions/ADR-0005-extension-boundaries.md)                                                     |
| `Extension.deactivate?()` semantics — runs before subscriptions, errors caught, async awaited | ✓                                                         | ✓                                    | [spec 2026-04-27-extension-deactivate-hook](specs/2026-04-27-extension-deactivate-hook.md)                 |
| `executeCommand` cross-extension (any extension can fire any registered command)              | ✓                                                         | ✓                                    | [spec 2026-04-26-phase-a2-commands](specs/2026-04-26-phase-a2-commands.md)                                 |
| LIFO subscription disposal with per-disposable error resilience                               | close enough (VS Code: registration order, errors caught) | ✓                                    | [spec 2026-04-26-phase-b1-deactivate-orchestration](specs/2026-04-26-phase-b1-deactivate-orchestration.md) |
| Vocabulary — "extension" everywhere in code and docs                                          | ✓                                                         | ✓ (renamed from "plugin" 2026-04-27) | [ADR-0004](decisions/ADR-0004-rename-plugin-to-extension.md)                                               |

## Divergences

| Concern                           | VS Code                                                         | gcscode                                                                    | Source                                                                                                                                                   | Trigger to revisit                                        |
| --------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Extension shape                   | `activate()` exported from module; metadata in `package.json`   | object with `activate()` method; metadata as identity fields on the object | [ADR-0002](decisions/ADR-0002-imperative-activate-api.md), [ADR-0004](decisions/ADR-0004-rename-plugin-to-extension.md)                                  | Manifest deferral lands → re-evaluate                     |
| `deactivate` hook position        | top-level export from the extension module                      | method on the `Extension` object                                           | [ADR-0004](decisions/ADR-0004-rename-plugin-to-extension.md), [spec 2026-04-27-extension-deactivate-hook](specs/2026-04-27-extension-deactivate-hook.md) | Same as Extension shape                                   |
| View / status-bar contributions   | property bag (text/tooltip/command/priority); shell owns chrome | Svelte `Component`; extension owns chrome                                  | [ADR-0005](decisions/ADR-0005-extension-boundaries.md) (consequence)                                                                                     | Non-Svelte consumer that doesn't fit the webview wing     |
| Status bar item ordering          | numeric `priority`                                              | registration order within an alignment side                                | [spec 2026-04-26-phase-a1-status-bar](specs/2026-04-26-phase-a1-status-bar.md)                                                                           | Third-party wants to insert between two first-party items |
| Keybinding registration           | declared in `package.json` `contributes.keybindings`            | programmatic via `host.registerKeybinding`                                 | [spec 2026-04-26-phase-a3-keybindings](specs/2026-04-26-phase-a3-keybindings.md)                                                                         | Manifest deferral lands                                   |
| Extension boundary mechanism      | filesystem-based discovery + manifest scanning                  | pnpm workspace packages                                                    | [ADR-0001](decisions/ADR-0001-monorepo-plugin-boundary.md)                                                                                               | —                                                         |
| `extensionPath` / filesystem APIs | ✓                                                               | N/A — browser SPA, no filesystem access                                    | (this ledger)                                                                                                                                            | —                                                         |

## Deferrals

| Concern                                                           | VS Code                            | gcscode                                        | Source                                                                                                | Trigger to revisit                                                                               |
| ----------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Declarative `contributes` manifest                                | ✓                                  | ✗                                              | [ADR-0003](decisions/ADR-0003-plugin-api-refinements.md), [out-of-scope.md](out-of-scope.md)          | Settings UI / marketplace / first untrusted extension module                                     |
| Activation events / lazy activation                               | ✓                                  | ✗ (eager)                                      | [ADR-0003](decisions/ADR-0003-plugin-api-refinements.md), [out-of-scope.md](out-of-scope.md)          | Cold-start time becomes a problem (~50+ extensions)                                              |
| `extensionDependencies` declaration                               | ✓                                  | ✗                                              | [ADR-0005](decisions/ADR-0005-extension-boundaries.md), [out-of-scope.md](out-of-scope.md)            | First ordering bug / third-party producer-consumer pair / manifest-driven enable persistence     |
| Capability / permission declarations                              | ✓                                  | ✗                                              | [ADR-0003](decisions/ADR-0003-plugin-api-refinements.md), [out-of-scope.md](out-of-scope.md)          | First untrusted extension module                                                                 |
| Sandboxed (untrusted) extensions                                  | webviews                           | ✗ today; webview wing on roadmap               | [ADR-0005](decisions/ADR-0005-extension-boundaries.md) follow-up, [roadmap.md](roadmap.md)            | Already triggered (webview wing committed); spec to follow                                       |
| `Mod` key abstraction (`Cmd` on Mac, `Ctrl` elsewhere)            | ✓                                  | ✗ (literal `Ctrl`/`Cmd` only)                  | [out-of-scope.md](out-of-scope.md)                                                                    | First Mac user reports an extension keybinding doesn't work as expected                          |
| `when` clauses for visibility/enablement                          | ✓                                  | ✗                                              | [out-of-scope.md](out-of-scope.md)                                                                    | First contribution wanting conditional visibility                                                |
| User-overridable keybindings (`keybindings.json`)                 | ✓                                  | ✗                                              | [out-of-scope.md](out-of-scope.md)                                                                    | Conflicts surface / settings system lands                                                        |
| Host-registered commands                                          | ✓ (built-ins like "open settings") | ✗                                              | [out-of-scope.md](out-of-scope.md)                                                                    | Shell needs to expose a host-level capability via the same command system extensions use         |
| Per-extension persistent state (`globalState` / `workspaceState`) | ✓                                  | ✗                                              | [out-of-scope.md](out-of-scope.md) (added 2026-05-01)                                                 | First extension needing persistent state, or a settings system exposing extension-scoped storage |
| `CancellationToken` for long-running commands                     | ✓                                  | ✗                                              | [out-of-scope.md](out-of-scope.md)                                                                    | First command worth cancelling                                                                   |
| Sequential / chord keybindings (`Ctrl+K Ctrl+S`)                  | ✓                                  | ✗                                              | [out-of-scope.md](out-of-scope.md)                                                                    | Real consumer (typically a palette)                                                              |
| Focus-aware keybinding suppression                                | ✓                                  | ✗                                              | [out-of-scope.md](out-of-scope.md)                                                                    | First text input or modal where a binding fires unintentionally                                  |
| Hot module reload for extensions                                  | ✓                                  | ✗ (Phase B3)                                   | [out-of-scope.md](out-of-scope.md), [roadmap.md](roadmap.md)                                          | Extension-author iteration friction                                                              |
| Bulk `deactivateAll()` / shutdown orchestration                   | ✓                                  | ✗                                              | [out-of-scope.md](out-of-scope.md)                                                                    | Host-driven shutdown / test harness needing ordered teardown                                     |
| Async `activate` / async `register`                               | ✓ (`activate` is async)            | ✗                                              | [spec 2026-04-27-extension-deactivate-hook](specs/2026-04-27-extension-deactivate-hook.md) follow-ups | Extension needing async work at registration time                                                |
| Returning data from deactivate hook                               | ✓                                  | ✗ (`void \| Promise<void>`)                    | [spec 2026-04-27-extension-deactivate-hook](specs/2026-04-27-extension-deactivate-hook.md) follow-ups | Telemetry from deactivate path becomes useful                                                    |
| Numeric `priority` API for status bar items                       | ✓                                  | ✗ — registration order today (see Divergences) | [out-of-scope.md](out-of-scope.md) (added 2026-05-01)                                                 | Third-party wants to insert between two first-party items                                        |
| Versioning / dependency resolution / peer-compat checks           | ✓                                  | N/A while everything is `workspace:*`          | [out-of-scope.md](out-of-scope.md)                                                                    | First externally-published extension                                                             |

## Maintenance

Updated alongside other per-iteration docs propagation (`roadmap.md`, `out-of-scope.md`):

- **Iteration ships with a new alignment** → add an Alignments row; link the spec/ADR.
- **Iteration ships with a new divergence** → add a Divergences row.
- **New deferral surfaces during a spec** → add a Deferrals row + propagate to `out-of-scope.md`.
- **Deferral trigger fires and the capability ships** → flip the row from Deferrals to Alignments or Divergences.

Per-spec "VS Code alignment" tables stay as snapshots of what was decided that iteration; this ledger is the cumulative cross-iteration view.
```

- [ ] **Step 2: Edit `docs/out-of-scope.md` — add two new bullets under `## Extension machinery`**

**Step 2a — insert "Numeric `priority` for status bar items":**

In `docs/out-of-scope.md`, locate the existing bullet that starts:

```md
- **Additional contribution kinds beyond views, status bar items, commands, and keybindings.**
```

(That bullet's full text continues `Today: four \`register\*\` methods on \`ExtensionHost\` ... do not pre-declare surfaces that have no contributor.`)

Locate the existing bullet immediately after it:

```md
- **Event bus, settings, themes, i18n.**
```

Insert the following NEW bullet between those two existing bullets (i.e. immediately after the "Additional contribution kinds" bullet and immediately before the "Event bus, settings, themes, i18n" bullet):

```md
- **Numeric `priority` for status bar items.** No `priority` field on `StatusBarItemContribution`; ordering within an alignment side follows registration order. _Trigger to revisit:_ a third-party extension wants to insert between two first-party items.
```

**Step 2b — insert "Per-extension persistent state":**

Locate the existing bullet:

```md
- **Event bus, settings, themes, i18n.**
```

(That bullet's full text continues `Extensions have five verbs today ... localized string lookup).`.)

Locate the existing bullet immediately after it:

```md
- **Third-party sandboxing.**
```

Insert the following NEW bullet between those two existing bullets (i.e. immediately after the "Event bus, settings, themes, i18n" bullet and immediately before the "Third-party sandboxing" bullet):

```md
- **Per-extension persistent state (`globalState` / `workspaceState`).** No host-provided storage on `ExtensionContext` for extension-owned key/value persistence. Extensions can reach for `localStorage` directly today; none have. _Trigger to revisit:_ first extension needing persistent state, or a settings system that should also expose extension-scoped storage.
```

These are the only two edits to `docs/out-of-scope.md` in Task 3. The Task 2 refresh of "Activation events / lazy activation" is already in place from Task 2 Step 3.

- [ ] **Step 3: Edit `CLAUDE.md` — append propagation rule sentence**

In `CLAUDE.md`, locate the subsection `### VS Code alignment (in spirit, not by byte)` (it sits under `## Planning conventions and long-term alignment`). Find its second paragraph (the one beginning `During brainstorming and planning, surface every API divergence...`).

Append one new sentence to the END of that paragraph (no blank line — same paragraph). The existing paragraph today is:

```md
During brainstorming and planning, surface every API divergence from VS Code as a labeled decision (with the trade-off articulated), not as a default. When picking a divergence, capture it in the spec or ADR explicitly. Specs should include a "VS Code alignment" section that lists what is aligned, what diverges (and why), and what is deferred — see `docs/specs/2026-04-26-phase-a2-commands.md` for the canonical table-format example.
```

After the edit, the paragraph reads:

```md
During brainstorming and planning, surface every API divergence from VS Code as a labeled decision (with the trade-off articulated), not as a default. When picking a divergence, capture it in the spec or ADR explicitly. Specs should include a "VS Code alignment" section that lists what is aligned, what diverges (and why), and what is deferred — see `docs/specs/2026-04-26-phase-a2-commands.md` for the canonical table-format example. When an iteration ships, propagate each new row from the spec's "VS Code alignment" section to `docs/vs-code-alignment.md` — that file is the cumulative ledger; per-spec tables stay as snapshots.
```

The edit adds exactly one sentence; everything before and after is unchanged.

- [ ] **Step 4: Edit `CLAUDE.md` — insert ledger pointer in `## Further reading`**

In `CLAUDE.md`, locate the `## Further reading` section near the bottom of the file. The existing bullets are:

```md
- `docs/roadmap.md` — phase plan + iteration status + planned feature extensions. Start here for "where are we now / what's next".
- `docs/out-of-scope.md` — canonical list of what is intentionally NOT built yet. Check here before building anything new.
- `docs/decisions/` — architecture decision records.
- `packages/extension-api/README.md` — how to write an extension.
- `packages/extension-example/README.md` — the worked example to mirror.
```

Insert ONE new bullet between the existing `docs/out-of-scope.md` bullet and the existing `docs/decisions/` bullet, so the section becomes:

```md
- `docs/roadmap.md` — phase plan + iteration status + planned feature extensions. Start here for "where are we now / what's next".
- `docs/out-of-scope.md` — canonical list of what is intentionally NOT built yet. Check here before building anything new.
- `docs/vs-code-alignment.md` — cumulative ledger of where gcscode aligns with and diverges from VS Code's extension architecture. Read alongside per-spec "VS Code alignment" tables.
- `docs/decisions/` — architecture decision records.
- `packages/extension-api/README.md` — how to write an extension.
- `packages/extension-example/README.md` — the worked example to mirror.
```

Don't modify any other bullet — only add the one new bullet at position 3.

- [ ] **Step 5: Run format and lint**

Run: `pnpm format && pnpm lint`
Expected: Prettier may rewrite the new ledger's table whitespace (column padding inside table rows) — that is expected and does not change the rendered output. `pnpm lint` then reports `All matched files use Prettier code style!` and exits 0.

If `pnpm lint` flags anything other than the three files this task touched (`docs/vs-code-alignment.md`, `docs/out-of-scope.md`, `CLAUDE.md`), stop and investigate before staging.

- [ ] **Step 6: Verify only the intended files are pending changes**

Run: `git status`
Expected: untracked file: `docs/vs-code-alignment.md`. modified files: `docs/out-of-scope.md`, `CLAUDE.md`. No other files changed.

If any other file appears in the output, stop and investigate before proceeding — the change should be exactly three files.

- [ ] **Step 7: Commit**

```bash
git add docs/vs-code-alignment.md docs/out-of-scope.md CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: add VS Code alignment ledger + CLAUDE.md propagation rule

Adds docs/vs-code-alignment.md as the cumulative cross-iteration view
of where gcscode aligns with and diverges from VS Code's extension
architecture. Three sections: Alignments (8 load-bearing matches),
Divergences (7 deliberate differences), Deferrals (19 capabilities not
yet built). Backfills from existing ADRs / specs / out-of-scope.md;
going forward each iteration propagates only its own new rows.

Surfaces two currently-unarticulated deferrals into out-of-scope.md as
new bullets: numeric priority for status bar items (today: registration
order), and per-extension persistent state (globalState/workspaceState).

Codifies the propagation rule in CLAUDE.md under the existing VS Code
alignment subsection, and adds a Further reading pointer at the new
ledger.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Verify commit landed**

Run: `git log --oneline -4 && git status`
Expected (top to bottom):

- `<sha> docs: add VS Code alignment ledger + CLAUDE.md propagation rule`
- `<sha> docs: refresh stale references in extension READMEs and out-of-scope.md`
- `7b5f661 docs: spec for VS Code alignment ledger + post-iteration-A drift fixes`
- `97cbe3c Merge branch 'feat/iteration-a-extension-exports'`

`nothing to commit, working tree clean`.

---

### Task 4: End-to-end verification

**Files:** none

- [ ] **Step 1: Re-verify lint clean**

Run: `pnpm lint`
Expected: clean.

- [ ] **Step 2: Re-verify check (sanity — should be unchanged)**

Run: `pnpm check`
Expected: clean across all four packages — same baseline state as Task 1.

- [ ] **Step 3: Re-verify tests pass (sanity — should be unchanged)**

Run: `pnpm test`
Expected: workspace-total test count is unchanged from baseline (~108 tests across `@gcscode/shell`, `@gcscode/extension-example`, `@gcscode/extension-sitl`, and `@gcscode/extension-vehicle-status`).

- [ ] **Step 4: Manual link-target check on `docs/vs-code-alignment.md`**

The new ledger references twelve external paths (five ADRs, five specs, plus `roadmap.md` and `out-of-scope.md`). Confirm each resolves:

```bash
ls docs/decisions/ADR-0001-monorepo-plugin-boundary.md \
   docs/decisions/ADR-0002-imperative-activate-api.md \
   docs/decisions/ADR-0003-plugin-api-refinements.md \
   docs/decisions/ADR-0004-rename-plugin-to-extension.md \
   docs/decisions/ADR-0005-extension-boundaries.md \
   docs/specs/2026-04-26-phase-a1-status-bar.md \
   docs/specs/2026-04-26-phase-a2-commands.md \
   docs/specs/2026-04-26-phase-a3-keybindings.md \
   docs/specs/2026-04-26-phase-b1-deactivate-orchestration.md \
   docs/specs/2026-04-27-extension-deactivate-hook.md \
   docs/out-of-scope.md \
   docs/roadmap.md
```

Expected: all twelve paths listed without "No such file or directory" errors.

- [ ] **Step 5: Manual link-target check on the refreshed READMEs**

Both `packages/extension-sitl/README.md` and `packages/extension-api/README.md` reference `../../docs/decisions/ADR-0005-extension-boundaries.md`; the api README also references `../../docs/specs/2026-04-27-extension-deactivate-hook.md`.

```bash
ls docs/decisions/ADR-0005-extension-boundaries.md \
   docs/specs/2026-04-27-extension-deactivate-hook.md
```

Expected: both paths listed.

- [ ] **Step 6: Manual visual check (optional, only if a markdown renderer is available)**

If a markdown renderer is available (a browser viewing github.com, VS Code's preview, or chrome-devtools-mcp pointed at a markdown server), open each modified file and confirm:

- `docs/vs-code-alignment.md`: three section headings (Alignments / Divergences / Deferrals) render; tables render with the expected column counts (4, 5, 5); the cross-doc links resolve.
- `packages/extension-sitl/README.md`: three section headings (Contributions / Cross-extension exports / Lifecycle); inline ADR-0005 link resolves.
- `packages/extension-api/README.md`: five section headings (Stability / Usage / The activation context / Cross-extension exports / Lifecycle (`deactivate?()`) / Conventions for extension authors — six counting Stability, depending on enumeration); inline ADR-0005 and deactivate-hook spec links resolve; the two TS code blocks render with syntax highlighting.
- `CLAUDE.md`: the new sentence sits at the END of the second paragraph of `### VS Code alignment (in spirit, not by byte)` (not as a new paragraph); the new bullet sits at position 3 of `## Further reading`.
- `docs/out-of-scope.md`: the refreshed "Activation events / lazy activation" bullet has the post-B2b language; the new "Numeric `priority`" bullet sits between "Additional contribution kinds beyond..." and "Event bus, settings, themes, i18n."; the new "Per-extension persistent state" bullet sits between "Event bus, settings, themes, i18n." and "Third-party sandboxing.".

If no renderer is available, skip — the syntax is plain text and renders correctly on github.com by default.

---

## Out of scope reminders

These are intentionally NOT part of this iteration (see the spec's `## Non-goals`):

- No code changes; no extension-API changes.
- No new ADRs (the deactivate-hook and B4 manifest specs stay as-is).
- No namespacing decision for `ExtensionHost` — that's the next iteration of housekeeping option C.
- No phase label for cross-extension exports / iteration A.
- No wide audit of VS Code's full API surface.
- No restructuring of per-spec "VS Code alignment" tables.
- No changes to existing ADRs or shipped specs.
- No restructuring of `roadmap.md` or any other doc not explicitly listed in the file structure table.

If a step tempts you toward any of those, stop and re-read the spec.

## Cross-cutting note

This is a docs-only iteration with no test surface, so the plan deliberately omits TDD steps (no failing-test-first cycle) and the feature-branch + per-task reviewer machinery used by code iterations. It mirrors the precedent of the 2026-04-27-roadmap iteration (the prior docs-only consolidation that created `docs/roadmap.md`). Future maintenance updates to `docs/vs-code-alignment.md` happen alongside their owning iteration's docs commit, not as standalone iterations of their own.

The two-commit shape (drift fixes first, ledger second) is deliberate: the two commits are conceptually independent, and either can be reverted alone if a follow-up reveals a problem. They land in order on master.
