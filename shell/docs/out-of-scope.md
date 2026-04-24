# Out of scope (for this step)

This is the canonical list of things intentionally NOT built in the first plugin-architecture iteration. When an agent or contributor is tempted to add one of these, the answer is "not yet — re-confirm before reopening." Add items here when you defer work; remove them when the work lands.

## Plugin machinery

- **Manifests / plugin metadata.** No declarative `plugin.json` or similar. The TypeScript `Plugin` interface is the contract.
- **Permission model.** No capability scoping. The `PluginHost` is the seam where this will plug in; do not pre-build it.
- **Lifecycle.** No `deactivate`, no enable/disable, no reload. Plugins activate once at bootstrap.
- **Hot module reload for plugins.** Changing a plugin requires a full page refresh (same as any Vite change to shell code).
- **Multiple contribution kinds.** The `ContributionKind` union has exactly one member (`'content'`). Add members when there is a real second surface; do not pre-declare surfaces that have no consumer.
- **Command system, event bus, settings, themes, i18n.** Plugins have one verb: `registerContribution`.
- **Third-party sandboxing.** No iframe / worker isolation, CSP hardening, or trusted-types. All plugins currently execute in the shell's JS realm. Safe because all plugins are first-party + in-tree.
- **Dynamic / runtime plugin loading.** Plugins are imported by package name at shell build time. Filesystem discovery, plugin marketplaces, runtime `import(...)` are all deferred.
- **Versioning, dependency resolution, peer-compat checks.** Not applicable — everything is `workspace:*`.

## Tooling / process

- **Contributor-facing docs site.** No Storybook, no docs website. Per-package `README.md` is the contract.
- **Changelog / release tooling.** Nothing is published.
- **CI configuration.** Add when there is something to protect besides a local clean install + tests + lint.

## Why this list exists

Agents are biased toward completeness and "one more thing". Without a canonical deferral list, any of the above gets preemptively scaffolded on the first sighting of a near-by commit. This file answers "should I add X?" with a durable "not yet — and here's where it goes when it's time."
