# VS Code alignment ledger + post-iteration-A drift fixes

**Status:** Approved (2026-05-01)

## Context

Iteration A (cross-extension exports — ADR-0005) shipped 2026-04-29. The post-A housekeeping pass surfaced two classes of work that don't fit a single feature iteration but are worth doing now while context is fresh:

1. **A structural gap.** Per-spec "VS Code alignment" sections (the deactivate-hook spec is the canonical example) record one iteration's snapshot. No document holds the cumulative cross-iteration view. A reader asking "what have we deliberately diverged on, cumulatively, from VS Code?" today has to assemble it from ~14 specs and 5 ADRs. Given that VS Code alignment is the long-term goal "in spirit, not by byte" (`CLAUDE.md`), this matters: silent drifts are exactly what get missed.

2. **Three stale doc references.** Iterations shipped without propagating updates back to peripheral docs that describe the current contract or capabilities.

This iteration adds the cumulative ledger, refreshes the three stale docs, and codifies the propagation rule in `CLAUDE.md` so future iterations keep the ledger current.

This is best-practice housekeeping, not a feature or architectural change.

## Goals

- A new `docs/vs-code-alignment.md` covering:
  - **Alignments** (8 rows) — load-bearing matches; not exhaustive.
  - **Divergences** (7 rows) — deliberate differences from VS Code; trigger optional (some are permanent).
  - **Deferrals** (19 rows) — capabilities VS Code has that we don't yet; trigger required.
  - Maintenance section with the four propagation rules.
- Three drift-fix file updates:
  - `packages/extension-sitl/README.md` — stub-era description replaced with current live-telemetry content.
  - `packages/extension-api/README.md` — comprehensive refresh covering `getExtension`, the `activate()` return value (cross-extension exports), `Extension.deactivate?()`, and the softened sibling type-import boundary rule.
  - `docs/out-of-scope.md` — refresh one bullet ("Activation events / lazy activation") whose description is a half-step behind post-B2b reality.
- `CLAUDE.md` edits:
  - One sentence appended to `### VS Code alignment (in spirit, not by byte)` codifying the propagation rule.
  - One bullet added to `## Further reading` pointing at the ledger.
- Two new bullets in `docs/out-of-scope.md` for currently-unarticulated deferrals (`globalState`/`workspaceState`, numeric `priority` for status bar items). These also appear as Deferrals rows in the ledger.

## Non-goals

- **No code changes.** This iteration is docs-only.
- **No new ADRs.** The `Extension.deactivate?()` spec and `B4: Extension manifest + persistence` spec stay as they are; promoting either to an ADR is deferred to a future judgment call.
- **No namespacing decision** for the six methods on `ExtensionHost`. That's the next housekeeping iteration (its own brainstorm-then-spec cycle).
- **No phase label** for cross-extension exports / iteration A.
- **No wide audit of VS Code's full API surface.** The ledger lists what's been decided (shipped or deferred); it is not a wishlist of every VS Code namespace we don't have. Granularity is "Medium" — every divergence and deferral I can articulate today, including currently-unarticulated ones.
- **No restructuring of per-spec "VS Code alignment" tables.** Existing snapshots stay as written; the ledger is the new cumulative view alongside.
- **No changes to existing ADRs or shipped specs.** Each remains a historical record per ADR-0004's posture on past docs.

## `docs/vs-code-alignment.md` content

The complete intended content of the new file. The implementer creates it verbatim, then validates link targets exist.

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

Note on the fenced block above: the ledger uses pipe-table syntax. The implementer copies the inner content (between the outer ` ```md ` fences) directly into `docs/vs-code-alignment.md`. Prettier will re-flow whitespace inside table rows — that is expected and fine.

## `packages/extension-sitl/README.md` content (replacement)

The complete intended content of the file (replaces all current content):

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

## `packages/extension-api/README.md` content (replacement)

The complete intended content of the file (replaces all current content):

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

## `docs/out-of-scope.md` edits

Three edits, all under the `## Extension machinery` section.

### Edit 1 — refresh the "Activation events / lazy activation" bullet

Find the existing bullet:

```md
- **Activation events / lazy activation.** No `activationEvents: ["onCommand:..."]`. Extensions activate once at bootstrap, eagerly. _Trigger to revisit:_ cold-start time becomes a problem (~50+ extensions). (ADR-0003)
```

Replace with:

```md
- **Activation events / lazy activation.** No `activationEvents: ["onCommand:..."]`. Extensions activate eagerly — at boot, or when re-enabled at runtime via `manager.setEnabled(id, true)` post-B2b. Never lazily on event. _Trigger to revisit:_ cold-start time becomes a problem (~50+ extensions). (ADR-0003)
```

### Edit 2 — add a new bullet for numeric `priority`

Insert immediately after the existing bullet that starts `- **Additional contribution kinds beyond views, status bar items, commands, and keybindings.**` — and before the bullet that starts `- **Event bus, settings, themes, i18n.**`:

```md
- **Numeric `priority` for status bar items.** No `priority` field on `StatusBarItemContribution`; ordering within an alignment side follows registration order. _Trigger to revisit:_ a third-party extension wants to insert between two first-party items.
```

### Edit 3 — add a new bullet for per-extension persistent state

Insert immediately after the existing bullet that starts `- **Event bus, settings, themes, i18n.**` — and before the bullet that starts `- **Third-party sandboxing.**`:

```md
- **Per-extension persistent state (`globalState` / `workspaceState`).** No host-provided storage on `ExtensionContext` for extension-owned key/value persistence. Extensions can reach for `localStorage` directly today; none have. _Trigger to revisit:_ first extension needing persistent state, or a settings system that should also expose extension-scoped storage.
```

No other bullets in `out-of-scope.md` change.

## `CLAUDE.md` edits

### Edit 1 — propagation rule under `### VS Code alignment (in spirit, not by byte)`

Find the second paragraph of that subsection (the one beginning `During brainstorming and planning, surface every API divergence...`). Append one new sentence to the END of that paragraph:

> When an iteration ships, propagate each new row from the spec's "VS Code alignment" section to `docs/vs-code-alignment.md` — that file is the cumulative ledger; per-spec tables stay as snapshots.

The full final paragraph becomes:

> During brainstorming and planning, surface every API divergence from VS Code as a labeled decision (with the trade-off articulated), not as a default. When picking a divergence, capture it in the spec or ADR explicitly. Specs should include a "VS Code alignment" section that lists what is aligned, what diverges (and why), and what is deferred — see `docs/specs/2026-04-26-phase-a2-commands.md` for the canonical table-format example. When an iteration ships, propagate each new row from the spec's "VS Code alignment" section to `docs/vs-code-alignment.md` — that file is the cumulative ledger; per-spec tables stay as snapshots.

### Edit 2 — pointer in `## Further reading`

Insert one new bullet between the existing `docs/out-of-scope.md` bullet and the existing `docs/decisions/` bullet:

```md
- `docs/vs-code-alignment.md` — cumulative ledger of where gcscode aligns with and diverges from VS Code's extension architecture. Read alongside per-spec "VS Code alignment" tables.
```

The final list (with the new bullet positioned third) becomes:

```md
- `docs/roadmap.md` — phase plan + iteration status + planned feature extensions. Start here for "where are we now / what's next".
- `docs/out-of-scope.md` — canonical list of what is intentionally NOT built yet. Check here before building anything new.
- `docs/vs-code-alignment.md` — cumulative ledger of where gcscode aligns with and diverges from VS Code's extension architecture. Read alongside per-spec "VS Code alignment" tables.
- `docs/decisions/` — architecture decision records.
- `packages/extension-api/README.md` — how to write an extension.
- `packages/extension-example/README.md` — the worked example to mirror.
```

No other parts of `CLAUDE.md` change.

## Files modified / added

| Path                                | Change                                                                                                                                                                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/vs-code-alignment.md`         | NEW. Cumulative ledger with three sections (Alignments, Divergences, Deferrals) plus maintenance protocol. ~50 lines of prose + ~34 table rows.                                                                                                   |
| `packages/extension-sitl/README.md` | REPLACED. Stub-era 2-paragraph description replaced with current live-telemetry description. ~22 lines.                                                                                                                                           |
| `packages/extension-api/README.md`  | REPLACED. Comprehensive refresh — activation-context bullet covers `getExtension`; new "Cross-extension exports" section; new "Lifecycle (`deactivate?()`)" section; Conventions boundary rule softened to allow sibling type-imports. ~95 lines. |
| `docs/out-of-scope.md`              | THREE edits under `## Extension machinery`: refresh "Activation events / lazy activation" bullet; add new bullet "Numeric `priority` for status bar items"; add new bullet "Per-extension persistent state (`globalState`/`workspaceState`)".     |
| `CLAUDE.md`                         | TWO edits: append one sentence to `### VS Code alignment (in spirit, not by byte)` codifying the propagation rule; insert one bullet into `## Further reading` pointing at the ledger.                                                            |

## Branching and commit

This iteration is docs-only — no code, no tests, no extension-API change. Per `CLAUDE.md` ("Spec/plan commits can land on master directly") and per the precedent of [`2026-04-27-roadmap.md`](2026-04-27-roadmap.md) (the prior docs-only consolidation that created `docs/roadmap.md`), the implementation lands on master directly without a feature branch and without a `--no-ff` merge.

Commits split into two on master, in order:

1. **`docs: refresh stale references in extension READMEs and out-of-scope.md`** — touches `packages/extension-sitl/README.md`, `packages/extension-api/README.md`, and the drift-fix bullet in `docs/out-of-scope.md` (Edit 1 only). Independent of the ledger work; revertable on its own.

2. **`docs: add VS Code alignment ledger + CLAUDE.md propagation rule`** — touches `docs/vs-code-alignment.md` (new), the two new bullets in `docs/out-of-scope.md` (Edits 2 and 3), and `CLAUDE.md`. The ledger itself plus its maintenance machinery.

The split commit shape lets either piece be reverted independently if a follow-up reveals a problem.

## Verification

- `pnpm format && pnpm lint` clean across the workspace.
- `pnpm test` and `pnpm check` run as a sanity check (this iteration touches no code, so neither output should differ from baseline).
- Manual: open `docs/vs-code-alignment.md`; confirm the three section headings render, the tables render, and the cross-doc links (to `decisions/ADR-NNNN-...md`, `specs/...md`, `roadmap.md`, `out-of-scope.md`) resolve.
- Manual: open `packages/extension-sitl/README.md` and `packages/extension-api/README.md` in the rendered view; confirm the new sections render and the inline links resolve.
- Manual: open `CLAUDE.md`; confirm the new bullet sits at position 3 of `## Further reading`, and the new sentence sits at the end of the second paragraph of `### VS Code alignment (in spirit, not by byte)`.
- Manual: open `docs/out-of-scope.md`; confirm the refreshed "Activation events / lazy activation" line, the new "Numeric `priority`" bullet (after "Additional contribution kinds beyond..."), and the new "Per-extension persistent state" bullet (after "Event bus, settings, themes, i18n.").
- `git log --oneline -2` shows the two new docs commits at HEAD on master — ledger commit at HEAD, drift commit immediately below.

## VS Code alignment

This iteration is itself the meta-iteration about VS Code alignment — the ledger is the artifact. No new alignments / divergences / deferrals are introduced by the iteration's own design choices (as opposed to the rows the ledger backfills from prior iterations).

The two new `out-of-scope.md` bullets (`globalState`/`workspaceState`, numeric `priority`) record currently-unarticulated deferrals that existed before this iteration; the iteration surfaces them, it does not create them.

## `docs/out-of-scope.md` propagation

Already covered exhaustively in the `## docs/out-of-scope.md edits` section above. Three edits total: one refresh (drift fix #4), two additions (the deferrals also recorded in the ledger).

## Follow-ups (out of scope for this iteration)

- **Iteration 2 of housekeeping option C — namespacing pre-decision.** Its own brainstorm-then-spec cycle. Decides whether to pre-decide a namespacing scheme (e.g., `host.commands.register(...)`) before the next add to `ExtensionHost` tips us over the 5–7 method threshold (ADR-0003 / ADR-0005 follow-up), or to re-affirm "still defer until the seventh add forces it."
- **Phase label for cross-extension exports / iteration A.** Whether the cross-extension-exports seam belongs under Phase A (contribution kind), Phase B (lifecycle), Phase C (cross-cutting), or its own labeled axis. Deferred per non-goals; would land as a roadmap edit, not a ledger row.
- **Promoting the deactivate-hook spec or the B4 manifest spec to ADRs.** Style choice, not a real gap. The specs are thorough. Trigger to revisit: a future ADR cluster wants to reference them as foundations.
- **Cross-link from `docs/out-of-scope.md` back to the ledger.** Skipped here to keep the change minimal; can land alongside the next out-of-scope edit if it feels worth it.
- **Backfilling per-spec "VS Code alignment" sections for older specs that don't have them.** The deactivate-hook spec is the canonical example; A1, A2, A3, B1, B2a, B2b, B4, sitl-stub, sitl-listener, sitl-listener-fields, and iteration A all have either alignment tables or alignment prose, but the consistency varies. Out of scope for this iteration; the ledger is now the primary cumulative surface, so per-spec tables can be added going forward without backfilling.
