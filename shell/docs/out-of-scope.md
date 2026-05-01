# Out of scope (for this step)

This is the canonical list of things intentionally NOT built in the current extension-architecture iteration. When an agent or contributor is tempted to add one of these, the answer is "not yet — re-confirm before reopening." Add items here when you defer work; remove them when the work lands.

See `docs/decisions/ADR-0003-plugin-api-refinements.md` for the load-bearing reasoning behind the manifest-shaped deferrals.

## Extension machinery

- **Declarative `contributes` manifest.** No statically-parseable list of contributions (commands, views, status bar items, etc.) that the host can read without executing `activate()`. The TypeScript `Extension` interface plus imperative `register*` calls are the contract. The manifest would be where per-contribution metadata such as command titles, categories, icons, and descriptions eventually lives. _Trigger to revisit:_ a settings UI that toggles individual contributions, a marketplace preview, or the first untrusted extension module. (ADR-0003)
- **Activation events / lazy activation.** No `activationEvents: ["onCommand:..."]`. Extensions activate eagerly — at boot, or when re-enabled at runtime via `manager.setEnabled(id, true)` post-B2b. Never lazily on event. _Trigger to revisit:_ cold-start time becomes a problem (~50+ extensions). (ADR-0003)
- **Extension activation ordering / dependency declaration.** No `extensionDependencies` manifest field, no topological sort, no "I require X to be active before me" declaration. Today extensions activate in `bundledExtensions` array order; consumers of `host.getExtension(id)?.exports` handle undefined defensively. _Trigger to revisit:_ first ordering bug, OR third-party producer/consumer pair, OR manifest-driven enable persistence. (ADR-0005)
- **Capability / permission declarations.** No declared-capabilities schema and no runtime enforcement. The `ExtensionHost` is the seam where this will plug in (see ADR-0002); do not pre-build the schema. _Trigger to revisit:_ the first untrusted extension module. (ADR-0003)
- **Hot module reload for extensions.** Changing an extension requires a full page refresh (same as any Vite change to shell code).
- **`registry.deactivateAll()` / bulk teardown.** `deactivate(extensionId)` is single-extension only. Callers that want to tear down every active extension iterate per-extension. _Trigger to revisit:_ a host-driven shutdown path or a test harness that needs guaranteed reverse-activation order across extensions.
- **Additional contribution kinds beyond views, status bar items, commands, and keybindings.** Today: four `register*` methods on `ExtensionHost` (`registerView`, `registerStatusBarItem`, `registerCommand`, `registerKeybinding`) plus the verb `executeCommand`. Add another (e.g. `registerMenuItem`, `registerPaletteEntry`) when there is a real consumer; do not pre-declare surfaces that have no contributor.
- **Event bus, settings, themes, i18n.** Extensions have five verbs today: `host.registerView`, `host.registerStatusBarItem`, `host.registerCommand`, `host.registerKeybinding`, and `host.executeCommand`. The remaining items are deferred until there is a real consumer (e.g. settings UI, theme switcher, command-fired event, localized string lookup).
- **Third-party sandboxing.** No iframe / worker isolation, CSP hardening, or trusted-types. All extensions currently execute in the shell's JS realm. Safe because all extensions are first-party + in-tree.
- **Dynamic / runtime extension loading.** Extensions are imported by package name at shell build time. Filesystem discovery, extension marketplaces, runtime `import(...)` are all deferred.
- **`when` clauses (visibility / enablement of contributions).** No expression evaluator or evaluation context for conditionally showing or enabling commands in menus, palette entries, or status bar items. _Trigger to revisit:_ the first contribution that wants to hide or disable itself based on host state (file open, focus, settings value, etc.) — _not_ merely the first menu/palette landing.
- **Built-in / shell-registered commands.** No host-side command registration today — the shell exposes no actions to extensions. _Trigger to revisit:_ the shell needs to expose a host-level capability (e.g. "open settings", "reload window") via the same command system extensions use.
- **Async cancellation tokens.** No `CancellationToken` (or equivalent) for long-running command callbacks or future async APIs. _Trigger to revisit:_ the first command (or future async kind) that takes long enough to be worth cancelling.
- **Sequential / chord keybindings.** No support for `Ctrl+K Ctrl+S`-style two-step keybindings; one combo per registration. _Trigger to revisit:_ a real consumer wants chord shortcuts (typically a settings/file palette).
- **User-overridable keybindings.** No `keybindings.json`-equivalent override file or settings UI. Extension-registered keybindings are the only source. _Trigger to revisit:_ users complain about extension keybinding conflicts, or a settings system lands.
- **Cross-platform key aliasing (`Mod`, `mac:` overlay).** Literal `Ctrl` / `Cmd` only; no automatic platform mapping. _Trigger to revisit:_ first Mac user reports an extension keybinding doesn't work as expected (e.g. expecting `Cmd+S`, getting nothing because the registered binding is `Ctrl+S`).
- **Focus-aware keybinding suppression.** No mechanism to disable a keybinding while a text input is focused, a modal is open, or a `when` condition is false. _Trigger to revisit:_ first text input or modal where the dispatcher's keydown interception fires a command unintentionally (e.g. typing `Ctrl+G` in a search field accidentally invokes the bound command).
- **Versioning, dependency resolution, peer-compat checks.** Not applicable — everything is `workspace:*`.

## Tooling / process

- **Contributor-facing docs site.** No Storybook, no docs website. Per-package `README.md` is the contract.
- **Changelog / release tooling.** Nothing is published.
- **CI configuration.** Add when there is something to protect besides a local clean install + tests + lint.

## Why this list exists

Agents are biased toward completeness and "one more thing". Without a canonical deferral list, any of the above gets preemptively scaffolded on the first sighting of a near-by commit. This file answers "should I add X?" with a durable "not yet — and here's where it goes when it's time."
