# ADR-0006 — ExtensionHost namespacing

**Status:** Accepted (2026-05-01)

## Context

[ADR-0003](ADR-0003-plugin-api-refinements.md) forecast that the flat `ExtensionHost` API would benefit from namespacing once the surface exceeded 5–7 methods, and parked the call ("Decide then; not now"). [ADR-0005](ADR-0005-extension-boundaries.md)'s follow-up noted that adding `getExtension` brought the surface to six methods — under the trigger but approaching it.

The 2026-05-01 housekeeping iteration ([`specs/2026-05-01-vs-code-alignment-ledger.md`](../specs/2026-05-01-vs-code-alignment-ledger.md)) shipped `docs/vs-code-alignment.md`, the cumulative ledger of where gcscode aligns with and diverges from VS Code. That doc is now the canonical surface for surfacing silent drift; the explicit ledger reaffirms VS Code alignment as the long-term goal "in spirit, not by byte" and tightens the cost of introducing new divergences.

Following the ledger landing, the namespacing call is overdue. The trigger is approaching, the alignment goal is articulated, and three motivations combine:

1. **Topic-namespaced API is one of VS Code's load-bearing patterns.** `vscode.commands`, `vscode.window`, `vscode.extensions` group related verbs by topic. We adopt this directly — adds zero new ledger Divergences (and arguably closes some, by establishing a namespace-by-topic shape that future host additions inherit).
2. **Pre-decide while context is fresh.** ADR-0003's framing ("Phase C: probably namespace... Decide then; not now") creates hesitation each time a new method is added: "land it flat or namespace then?" Committing to the scheme now resolves the hesitation. The next host-surface add (any A4+ contribution kind, any Phase C verb) lands directly in its namespace.
3. **Cheap migration today.** Three first-party extensions, all in-repo. Deferring would mean a bigger surface to migrate later (more first-party extensions, more methods). Smaller now, bigger later.

This ADR commits to the scheme AND ships the migration in the same iteration.

## Decision

Adopt the topic-namespaced API. The new `ExtensionHost` interface in `@gcscode/extension-api`:

```ts
export interface ExtensionHost {
  readonly commands: {
    registerCommand(command: CommandContribution): Disposable;
    executeCommand<T = unknown>(id: string, ...args: unknown[]): Promise<T>;
  };
  readonly window: {
    registerView(view: ViewContribution): Disposable;
    registerStatusBarItem(item: StatusBarItemContribution): Disposable;
  };
  readonly keybindings: {
    registerKeybinding(keybinding: KeybindingContribution): Disposable;
  };
  readonly extensions: {
    getExtension<T = unknown>(id: string): { id: string; exports: T } | undefined;
  };
}
```

Method mapping:

| Old                                   | New                                            |
| ------------------------------------- | ---------------------------------------------- |
| `host.registerView(view)`             | `host.window.registerView(view)`               |
| `host.registerStatusBarItem(item)`    | `host.window.registerStatusBarItem(item)`      |
| `host.registerCommand(command)`       | `host.commands.registerCommand(command)`       |
| `host.registerKeybinding(kb)`         | `host.keybindings.registerKeybinding(kb)`      |
| `host.executeCommand<T>(id, ...args)` | `host.commands.executeCommand<T>(id, ...args)` |
| `host.getExtension<T>(id)`            | `host.extensions.getExtension<T>(id)`          |

**Migration shape: hard break, no deprecation period.** Three first-party extensions migrate in the same iteration. Deprecation cruft adds zero value with such a small consumer set.

**Scope: namespace only `ExtensionHost`; leave `Registry` flat.** The `Registry` interface (`activate`, `deactivate`, `list*`, host-side `executeCommand`) is shell-internal — not exposed via `@gcscode/extension-api`. Its `list*` methods serve the shell UI; its `executeCommand` is the host-side mirror used by the keyboard dispatcher. Internal consistency gain from namespacing isn't worth the churn.

**Type names unchanged.** `ViewContribution`, `StatusBarItemContribution`, `CommandContribution`, `KeybindingContribution`, `Extension`, `ExtensionContext`, `ExtensionIdentity`, `Disposable` keep their names. Renaming to VS Code-style (`StatusBarItem`, `TreeView`, …) is out of scope; future ledger row if it ever matters.

**Inline namespace types.** Namespaces are read-only properties on `ExtensionHost` with anonymous object types. Consumers always go through `host.commands.foo()`, never via the namespace type directly. If a named type ever surfaces a real need, refactor then.

**Verb suffix preserved where VS Code preserves it.** `host.commands.registerCommand` (not `host.commands.register`) matches `vscode.commands.registerCommand`; `host.commands.executeCommand` matches `vscode.commands.executeCommand`; `host.extensions.getExtension` matches `vscode.extensions.getExtension`. The redundancy is the price of byte alignment, and VS Code itself accepts it.

## Consequences

**Positive.**

- **VS Code byte-aligned where possible.** Five of six methods match VS Code's API names exactly (`commands.registerCommand`, `commands.executeCommand`, `window.registerView` — matches VS Code's `window.registerTreeDataProvider` style — `extensions.getExtension`). One has no VS Code precedent (`keybindings.registerKeybinding` — VS Code's keybindings are declarative).
- **Zero new divergences in the ledger.** The new Alignments row records the namespace adoption; no Divergences row is added.
- **Future-proof for new contribution kinds.** A4+ contribution kinds (menu items, palette entries, tree views, webviews) slot into `host.window.*` without crowding the host's top-level surface.
- **Future-proof for cross-cutting capabilities.** Phase C (events, settings, themes, i18n) lands as new namespaces (`host.events.*`, `host.settings.*`, …) rather than further crowding the flat surface.
- **Clearer mental model at the call site.** `host.extensions.getExtension(id)` reads "look up an extension's exports, in the extensions namespace." The namespace tells you the topic before you read the method name.

**Negative.**

- **One-time migration churn.** Three first-party extensions, ~70 tests across `registry.test.ts` / `extension-manager.test.ts` / `app.test.ts` / per-extension `index.test.ts` files, plus the registry's `createHost` factory. All mechanical; no logic changes.
- **`commands.registerCommand`-style verbose redundancy.** Same as VS Code; we accept the cost for byte alignment. Future readers might ask "why not just `commands.register`?" — the answer is in this ADR.
- **`keybindings.registerKeybinding` has no VS Code precedent.** The namespace name and verb suffix are our choice; reads slightly redundantly. Trigger to revisit: if `host.keybindings` ever grows additional verbs (e.g., `host.keybindings.dispatch(event)` or `host.keybindings.list()`), the redundancy gets diluted.

## Alternatives considered

- **Verb suffix dropped where namespace makes it redundant** (`commands.register`, `commands.execute`, `extensions.get`, `keybindings.register`; `window.registerView` and `window.registerStatusBarItem` kept because the namespace is heterogeneous). Cleaner reads but introduces a new ledger Divergence row ("method verb suffix dropped where namespace makes it unambiguous; VS Code keeps `registerCommand` / `executeCommand` / `getExtension` redundancies"). Rejected: byte alignment is more valuable here than ergonomics, especially while the alignment ledger is fresh.
- **Kind-per-namespace** (`host.views.register`, `host.statusBarItems.register`, `host.commands.register`, `host.commands.execute`, `host.keybindings.register`, `host.extensions.get`). Five namespaces, uniform `register` verb. Rejected: diverges from VS Code's `window` super-namespace (two new ledger Divergences).
- **Defer until 7th-method add fires the trigger.** Rejected: the per-add hesitation is itself a cost. Pre-deciding now eliminates it.
- **ADR-only pre-decision; ship the migration in a future iteration.** Rejected: creates a "decision exists but unimplemented" gap that future readers have to remember. The migration is small enough to ship together — three extensions, mechanical.

## Follow-ups

- ADR-0003's "Phase C: probably namespace the host (host.commands.register(...)) once the flat surface exceeds ~5–7 methods. Decide then; not now." follow-up is now obsolete. A pointer note added to ADR-0003's Follow-ups section references this ADR.
- ADR-0005's "Adding `getExtension` brings the flat surface on `ExtensionHost` to six methods. Still under the 5–7 trigger; defer namespacing per ADR-0003." follow-up is now obsolete. A pointer note added to ADR-0005's Follow-ups section references this ADR.
- `docs/vs-code-alignment.md` gains a new Alignments row.
- `docs/roadmap.md` Phase C section flips from "TBD" to "C1 shipped" + "C2+ TBD."
- Future contribution kinds (A4+) land under `host.window.*`. Future cross-cutting verbs (Phase C) land as new namespaces.
- Eventual rename of contribution interfaces to VS Code-style names (`StatusBarItem`, `TreeView`, …) is its own iteration if/when it matters; not driven by this ADR.
