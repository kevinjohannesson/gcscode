# ADR-0012: Domain concerns are service extensions; platform concerns are host namespaces

**Date:** 2026-10-16
**Status:** Accepted

## Context

[ADR-0006](ADR-0006-extensionhost-namespacing.md) made `ExtensionHost` topic-namespaced (`host.commands.*`, `host.window.*`, `host.keybindings.*`, `host.extensions.*`, `host.configuration.*`) and said that future cross-cutting capabilities land as new namespaces. `CLAUDE.md`'s boundary-rule corollary says the same thing in operational form: if an extension needs a capability the host does not expose, add it to `@gcscode/extension-api` first — as a method on an existing namespace, or as a new namespace if the capability is cross-cutting.

That guidance is right for platform capabilities and wrong for domain capabilities, and nothing has written down the difference. `@gcscode/extension-map` already took the other path: it exposes `MapApi.registerLayer` and `MapApi.registerControl` through its `activate()` return value, consumed by `extension-flight-overlay` via `host.extensions.getExtension('gcscode.map')?.exports` and a type-only import ([ADR-0005](ADR-0005-extension-boundaries.md)). That was an implicit choice made in passing. No rule justified it, and no rule stopped it from being `host.map.*` instead.

The asset abstraction forces the question explicitly: should the asset registry be `host.assets.*` or an extension exporting an `AssetsApi`? And the ports that follow it — an adapter-neutral live-state contract, video, commands to assets — each ask the same question again. Without a rule, every iteration re-litigates it, and the host wins by default: a namespace needs no new package, no `getExtension` call, and no undefined handling at the call site. The host surface would then accumulate domain knowledge one convenient decision at a time, which is precisely the outcome [ADR-0011](ADR-0011-asset-vocabulary-and-registry.md) is trying to avoid at the vocabulary level.

## Decision

**Platform concerns are host namespaces. Domain concerns are service extensions.**

A **platform concern** is a capability about _being an extension host_: registering contributions, executing commands, keybindings, looking up extensions, configuration — and, when they land, events, themes, i18n, per-extension storage. It is available to every extension, meaningless outside the host, and the host must implement it because it owns the surface the capability mutates. It lands as a method on an existing `host.*` namespace, or as a new namespace per ADR-0006.

A **domain concern** is a capability about _what gcscode controls or displays_: maps, assets, live state, video, missions. It encodes knowledge of a problem domain, it mutates nothing the host owns, and a different extension could plausibly implement the same contract instead. It ships as a **service extension**: its own package, exporting its vocabulary types and its API.

The mechanics of a service extension are the existing ones, not new ones:

- Vocabulary types and the API interface live in the service extension's package; consumers reach them with `import type` from the sibling package, per ADR-0005 and the ESLint `allowTypeImports` carve-out.
- The live API is the `activate()` return value, looked up with `host.extensions.getExtension<T>(id)?.exports`.
- The service's registry is a module-level singleton that survives enable/disable cycles, mirroring `mapApi`.
- Consumers handle `undefined` — the service may be disabled or not yet activated. Lazy lookup at use time rather than capture at `activate()` makes this self-healing.

**The test when a capability is ambiguous:** could a third party plausibly ship a competing implementation of this contract? If yes, it is a domain concern — service extension. Second test: does every extension need it regardless of what gcscode is controlling? If yes, it is a platform concern — host namespace. When both tests are unclear, the iteration's spec records the call and its reasoning.

## Consequences

**Positive.**

- **The host stays domain-agnostic.** It does not know what a drone is, what an airframe is, or that assets exist. Its surface grows only when platform capabilities grow.
- **Domain capabilities are replaceable and removable.** An asset registry that turns out wrong can be replaced by a different extension implementing the same contract; a map that is not wanted in a build is simply not bundled. Neither is true of a host namespace.
- **First-party features are forced through the public seam.** The project's stated goal is that first-party features are built against the same API third parties use. Domain-as-service-extension is what makes that true in practice rather than aspirationally — `extension-assets` has no privileges `extension-map` lacks.
- **It retro-justifies `extension-map`** and gives the next port (live state) a decision it can cite instead of re-deriving.

**Negative.**

- **Service extensions pay an ergonomic tax.** `getExtension` plus undefined handling at every call site, against a host namespace that is simply always there. Activation order is insertion order in `bundledExtensions` with an ordering comment — there is no `extensionDependencies` declaration (deferred in `docs/out-of-scope.md`), so a consumer that resolves its service during its own `activate()` depends on bundle order being right.
- **Consumers must handle "service not active".** Lazy per-use lookup reduces this to a skipped operation rather than a crash, but the branch exists in every consumer.
- **A migration cost exists if the line was drawn wrong.** A domain capability that turns out to be universal (selection state is the likeliest candidate) would move from extension to host, breaking its consumers. Cheap while everything is in-tree and `workspace:*` — ADR-0005's existing posture — and expensive once extensions ship independently.
- **The line is a judgment call at the margin.** Selection state, unit and formatting preferences, and coordinate-system conversion are each arguably either.

**VS Code alignment.** The split is aligned in spirit: `vscode.*` is platform, and VS Code's own Git extension publishes its API for other extensions through `getExtension('vscode.git').exports.getAPI(1)` rather than through a `vscode.git` namespace. The divergence worth naming is that VS Code does host domain-ish registries in core (debug, SCM, tasks) because its domain — editing code — _is_ the product. gcscode's domain is what it flies and sees, which is the thing extensions contribute, so the line sits further toward extensions than VS Code's does.

## Known limitations

- **No capability or permission scoping.** Any extension can look up any service extension's exports, and the exports may include mutable `$state`. Same posture as ADR-0005; the untrusted-extension iteration is where it changes.
- **No dependency declaration or versioning between a service and its consumers.** Ordering is convention, and the service's API type is an unversioned contract shared through `workspace:*`.
- **The rule says nothing about granularity.** Whether one service extension exposes several related ports (assets plus live state) or each port gets its own extension is left to the iteration that lands them.

## Alternatives considered

- **Everything on the host** (`host.assets.*`, `host.map.*`). Simplest call sites, always available, no ordering problem. Rejected: it makes the host know the domain, makes each domain capability un-removable, grows an unbounded host surface, and contradicts the goal of first-party features using the same API as third-party ones.
- **Everything as extensions, platform concerns included.** Rejected as incoherent: the host owns the surfaces contributions mutate, so `registerView` cannot live anywhere else.
- **Case-by-case, no rule.** Rejected: that is today's state. It re-litigates the question per iteration, and the convenient answer (host namespace) wins by default.
- **A third tier — a service locator on the host** (`host.services.get('assets')`). Rejected as ceremony: `host.extensions.getExtension` already is the service locator, and a second lookup path would need its own registration story.
- **A `contributes`-style declarative service registry.** Rejected: declarative contribution manifests are deferred at the architecture level (ADR-0003, ADR-0007), and nothing here needs static parseability.

## Follow-ups

- [ADR-0011](ADR-0011-asset-vocabulary-and-registry.md)'s asset registry lands as the service extension `@gcscode/extension-assets` per this rule; the asset abstraction v0 spec cites both ADRs.
- The next expected application is the adapter-neutral live-state contract, which this rule places in an extension rather than `host.telemetry.*`.
- `docs/vs-code-alignment.md` gains an Alignments row for a registry exposed through a service extension's exports, alongside the divergence note about where the line sits relative to VS Code's core registries.
- When a capability's classification is genuinely ambiguous, the iteration's spec records the call — if that happens repeatedly, this ADR gets a successor with sharper tests.
