# Out of scope (for this step)

This is the canonical list of things intentionally NOT built in the current plugin-architecture iteration. When an agent or contributor is tempted to add one of these, the answer is "not yet — re-confirm before reopening." Add items here when you defer work; remove them when the work lands.

See `docs/decisions/ADR-0003-plugin-api-refinements.md` for the load-bearing reasoning behind the manifest-shaped deferrals.

## Plugin machinery

- **Declarative `contributes` manifest.** No statically-parseable list of contributions (commands, views, etc.) that the host can read without executing `activate()`. The TypeScript `Plugin` interface plus imperative `register*` calls are the contract. _Trigger to revisit:_ a settings UI that toggles individual contributions, a marketplace preview, or the first untrusted plugin module. (ADR-0003)
- **Activation events / lazy activation.** No `activationEvents: ["onCommand:..."]`. Plugins activate once at bootstrap, eagerly. _Trigger to revisit:_ cold-start time becomes a problem (~50+ plugins). (ADR-0003)
- **Capability / permission declarations.** No declared-capabilities schema and no runtime enforcement. The `PluginHost` is the seam where this will plug in (see ADR-0002); do not pre-build the schema. _Trigger to revisit:_ the first untrusted plugin module. (ADR-0003)
- **`deactivate` orchestration.** Disposables are in place (every `register*` returns a `Disposable`, plugins push to `context.subscriptions`), but the host does not yet iterate `subscriptions` to tear plugins down. No `Plugin.deactivate`, no enable/disable, no reload. _Trigger to revisit:_ dev-time hot reload, a "disable plugin" UI, or a teardown path needed for tests. (ADR-0003)
- **Hot module reload for plugins.** Changing a plugin requires a full page refresh (same as any Vite change to shell code).
- **Additional contribution kinds beyond views and status bar items.** Today: two `register*` methods on `PluginHost` (`registerView`, `registerStatusBarItem`). Add another (`registerCommand`, etc.) when there is a real consumer; do not pre-declare surfaces that have no contributor.
- **Command system, event bus, settings, themes, i18n.** Plugins have two verbs today: `host.registerView` and `host.registerStatusBarItem`.
- **Third-party sandboxing.** No iframe / worker isolation, CSP hardening, or trusted-types. All plugins currently execute in the shell's JS realm. Safe because all plugins are first-party + in-tree.
- **Dynamic / runtime plugin loading.** Plugins are imported by package name at shell build time. Filesystem discovery, plugin marketplaces, runtime `import(...)` are all deferred.
- **Versioning, dependency resolution, peer-compat checks.** Not applicable — everything is `workspace:*`.

## Tooling / process

- **Contributor-facing docs site.** No Storybook, no docs website. Per-package `README.md` is the contract.
- **Changelog / release tooling.** Nothing is published.
- **CI configuration.** Add when there is something to protect besides a local clean install + tests + lint.

## Why this list exists

Agents are biased toward completeness and "one more thing". Without a canonical deferral list, any of the above gets preemptively scaffolded on the first sighting of a near-by commit. This file answers "should I add X?" with a durable "not yet — and here's where it goes when it's time."
