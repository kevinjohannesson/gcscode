# ADR-0002 — Plugin API is imperative `activate(host)`, not declarative

_Note: The term "plugin" was renamed to "extension" in [ADR-0004](ADR-0004-rename-plugin-to-extension.md). This document records the original terminology._

**Status:** Accepted (2026-04-25)

## Context

Plugins need a way to tell the shell "I contribute this UI fragment to this surface." Two broad shapes:

1. **Declarative.** Plugin exports an object like `{ id, contributions: { content: Component } }`. Shell reads it at load time. Simple, serializable, manifest-friendly.
2. **Imperative.** Plugin exports `{ activate(host) }`. Shell calls `activate`, passing a host object; the plugin calls `host.registerContribution(...)`. This is VS Code's model.

## Decision

Imperative `activate(host: PluginHost)`. Plugins export a named `const` of type `Plugin`.

## Consequences

**Positive.**

- The `host` object is the single gate for all future plugin capabilities. Permissions will be implemented by wrapping or substituting the host — no change to the plugin-facing API shape.
- Non-UI contributions (commands, services, subscriptions) naturally slot in as additional methods on `PluginHost`. A declarative shape would require a parallel non-UI branch.
- Each plugin gets its own `host` instance (`registry.createHost()`), so a per-plugin permission scope has a natural attach point.
- Testing is straightforward: pass a `vi.fn()` for `registerContribution` and assert on the call.

**Negative.**

- The contract is a function call, not data. Cannot be introspected statically without executing the plugin. Not a concern today (all plugins are trusted, in-repo); becomes relevant when building an untrusted-plugin discovery UI, at which point we add a declarative manifest _in addition to_ `activate` rather than replacing it.
- Slightly more code per plugin than the declarative form.

## Follow-ups

- Permissions land on `PluginHost`. Probably as two layers: a `HostCapabilities` interface shared with `@gcscode/plugin-api` (what a plugin can ask for) and the runtime enforcement inside `registry.createHost(permissions)`.
- Lifecycle: `Plugin` gains an optional `deactivate(host)` method. No current need.
