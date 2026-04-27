# ADR-0003 — Disposables, plugin context, and identity metadata

_Note: The term "plugin" was renamed to "extension" in [ADR-0004](ADR-0004-rename-plugin-to-extension.md). This document records the original terminology._

**Status:** Accepted (2026-04-25)

## Context

ADR-0002 chose imperative `activate(host)` over a declarative manifest. The first iteration was deliberately minimal: one method (`registerContribution`), one contribution kind (`'content'`), no return value, no plugin metadata. Three concrete features are next:

- **A.** A second contribution kind (sidebar, status bar, or command palette).
- **B.** Lifecycle and cleanup (`deactivate`, plugin disable/enable, dev-time reload).
- **C.** Cross-cutting capabilities (commands, events, settings, services).

Each of those would force the same three API-shape changes. Reshaping with one consumer (`@gcscode/plugin-example`) is a small refactor; reshaping with five plugins is a coordinated migration. We do them now.

This ADR is a refinement _within_ the imperative-`activate` model from ADR-0002, not a reversal of it.

## Decisions adopted

1. **`Disposable` return on every `register*` method.** `Disposable = { dispose(): void }`. `dispose()` must be idempotent. Even though `deactivate` was out of scope at this ADR's writing, the _return type_ is the load-bearing change — when `deactivate` lands in phase B, plugin code already written keeps working. Today, calling `dispose()` actually removes the registration from the registry; only the host-driven _orchestration_ of disposing on deactivate is parked.

2. **`PluginContext` instead of bare `host`.** `activate(context: PluginContext)` where `context = { host, subscriptions, plugin }`. Mirrors VS Code's `ExtensionContext`:
   - `host` — the registration gate (per-plugin instance).
   - `subscriptions: Disposable[]` — sink for disposables; the host disposes them at deactivate (phase B).
   - `plugin: PluginIdentity` — read-only identity for the activating plugin (useful for self-introspection in logs).

3. **Identity metadata on `Plugin`.** `Plugin extends PluginIdentity` (`id`, `displayName`, `version`). Available from day one for logs, error attribution, and (later) per-plugin permission scoping. This is the only piece of the manifest space worth adopting now (see deferrals below).

4. **Kind-specific registration methods on `PluginHost`.** Today: `registerView(view: ViewContribution): Disposable`. Future: `registerCommand`, `registerStatusBarItem`, etc. — added as further `register*` methods. Replaces the generic `registerContribution({ kind, component })` and removes `ContributionKind`. The previous shape assumed every contribution is a Svelte `Component`, which breaks the moment a command (a function) or a status-bar item (alignment + priority, no component) is added. Per-kind methods give type safety with no discriminated-union pattern matching at the registry.
   - **Duplicate ids throw.** `registerView` rejects a view id already in the registry. Matches VS Code's "command already exists" semantics; loud errors during dev are preferable to silent last-write-wins.
   - **View ids are stable.** Convention: `<plugin-id>.<local-name>` (e.g. `gcscode.example.main`). Used as the React/Svelte key for the rendered list and for diagnostics.

## Decisions deferred

The single line "Manifests / plugin metadata" in the previous out-of-scope list bundled four distinct features. Splitting them out makes the trade-offs and re-visit triggers explicit.

- **Declarative `contributes`.** A statically-parseable list of contributions (e.g. `{ commands: [...], views: [...] }`) on the plugin module that the host can read _without_ executing `activate()`. Cost: schema, loader, validator, dual registry that reconciles declared vs. imperatively-registered entries. **Trigger to revisit:** a settings UI that toggles individual contributions on/off, a marketplace preview, or the first untrusted plugin module.

- **Activation events.** `activationEvents: ["onCommand:foo.bar"]` plus lazy `import()` of the plugin module on event. Cost: an event system + a lazy module loader. **Trigger to revisit:** cold-start time becomes a problem (~50+ plugins). Eager activation is fine for <20 trusted plugins.

- **Capability / permission declarations.** Manifest declares what APIs the plugin uses; host enforces before running plugin code. Cost: capability schema, permission model, runtime enforcement. **Trigger to revisit:** the first untrusted plugin module is loaded.

- **`deactivate` orchestration.** Shipped in Phase B1 (`docs/specs/2026-04-26-phase-b1-deactivate-orchestration.md`). The remaining deferred items from this cluster are the `Plugin.deactivate?()` plugin-side hook (non-disposable / async cleanup; trigger: first plugin needing it — named on-deck consumer is a future SITL listener), plugin enable/disable runtime state (Phase B2), and dev-time hot reload (Phase B3). See Follow-ups below.

## Consequences

- Phases A → B → C become additive instead of breaking. A new contribution kind is a new `register*` method; deactivate is iteration over already-collected `subscriptions`; cross-cutting capabilities are new methods on the host.
- `dispose()` is functional today (the registration really comes out), so the disposable contract is testable end-to-end without waiting for deactivate.
- Plugin identity is available immediately for logs and error messages — no awkward "some plugin failed" paths.
- The registry interface contracts ever-so-slightly: `createHost()` is no longer public; the host is created internally during `registry.activate(plugin)`. This is intentional — per-plugin permission scoping later wraps the host inside `activate`, not at the registry boundary.

## Alternatives considered

- **Minimal — keep one `registerContribution`, discriminate by `kind`, return `Disposable`.** Smaller diff. Rejected: discriminated unions get crowded past ~5 kinds and pattern-match in the registry instead of giving per-kind types; and `host` still needs to grow into a context during phase B.
- **Full VS Code parity — manifest + activation events + lazy loading now.** Rejected: ADR-0002 deferred this on purpose, plugins are first-party / in-tree, and there is no startup-time problem. The four-part deferral above documents exactly what triggers revisit.

## Follow-ups

- Phase A (in flight): adding more `register*` methods, one kind at a time. A1 added `registerStatusBarItem` (`docs/specs/2026-04-26-phase-a1-status-bar.md`); A2 added `registerCommand` plus the verb `executeCommand` (`docs/specs/2026-04-26-phase-a2-commands.md`); A3 adds `registerKeybinding` plus the host-side `registry.executeCommand` mirror and a shell keyboard dispatcher (`docs/specs/2026-04-26-phase-a3-keybindings.md`). Continue this pattern for future kinds; revisit naming conventions if the host surface starts to feel crowded (see also the Phase C bullet below on namespacing).
- Phase B: split into B1 (deactivate orchestration, shipped — `docs/specs/2026-04-26-phase-b1-deactivate-orchestration.md`), B2 (plugin enable/disable runtime state, deferred), B3 (dev-time hot module reload, deferred). B1 added `registry.deactivate(pluginId)`: iterates the plugin's recorded subscriptions in reverse registration order (LIFO, refining this ADR's original "registration order" framing) and calls `dispose()` on each, with per-disposable error resilience (caught + logged + continue). The optional `Plugin.deactivate?()` plugin-side hook (for non-disposable / async cleanup) is split off and still deferred — trigger to revisit: first plugin needing non-disposable cleanup (named on-deck consumer: a future SITL listener plugin).
- Phase C: probably namespace the host (`host.commands.register(...)`) once the flat surface exceeds ~5–7 methods. Decide then; not now.
