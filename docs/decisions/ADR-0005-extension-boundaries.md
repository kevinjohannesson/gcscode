# ADR-0005 — Extension boundaries: deliberate Svelte coupling, cross-extension exports, webview escape hatch

**Status:** Accepted (2026-04-29)

## Context

The first feature extension (`@gcscode/extension-sitl`) shipped through the deactivate-hook + sitl-stub + sitl-listener + sitl-listener-fields iterations. Brainstorming the next iteration surfaced two architectural questions that resolve together:

1. **How do extensions share data with each other?** The Map extension (Coming on the roadmap) wants SITL telemetry to render the vehicle's location. A future battery-widget or vehicle-status extension wants the same telemetry. The naive answer ("each extension opens its own WebSocket") is wrong on every dimension. We need a cross-extension data-sharing seam.

2. **How tightly should extensions couple to Svelte?** Today extensions ship Svelte components via `host.registerView({ component: SvelteComponent })`. The contract literally `import type { Component } from 'svelte'`. The data-sharing seam in (1) raises the same question one layer down — would consumers reactively read `$state` from producers, or would the API be framework-neutral?

Four candidate framings were considered:

- **A — Imperative + framework-neutral.** Producers expose `{ getX(), onXChange(cb) }` style APIs; consumers in any framework subscribe and feed the result into their own reactivity. VS Code's actual posture (`extension.exports` + `EventEmitter`).
- **B — Reactive + Svelte-coupled.** Producers expose `$state` proxies directly via `activate()`'s return value; consumers read `proxy.field` reactively in their own Svelte templates. No bridging code; reactivity flows across the extension boundary because both sides share the same module graph in the shell's bundle.
- **C — Webviews.** Extensions run in sandboxed iframes; data crosses via `postMessage`; framework freedom inside the iframe; isolation at the boundary. VS Code's posture for third-party rich panels.
- **D — Built-in core panels.** UI is built into the shell; extensions provide data to a core renderer. VS Code's pattern for things like Source Control panel chrome. Not a real option for a GCS — there is no fixed "main view" we can build core renderers around (map for some users, video for others, configuration for ground crew).

Full-A costs us reactivity that Svelte already gives for free. Wrapping a `$state` proxy in `onChange` callbacks just to re-wrap it on the consumer side is reinventing the framework primitive — `$state` IS a Proxy that tracks reads in template / `$effect` contexts; the reactivity is tied to proxy identity, not to where the read happens. Full-B (Svelte at both boundaries with no escape) makes us framework-locked with no story for the work-project's likely future need to ship extensions in non-Svelte frameworks, or for an eventual marketplace with untrusted third-party code.

The right answer mixes B and C along the trust / framework-freedom axis: B for in-tree first-party (privileged realm); C for everything that needs isolation or framework choice.

The shell's UI boundary is already Svelte-locked at the contract type level (`ViewContribution.component: Component` from `svelte`). This ADR documents that lock as deliberate rather than implicit, and bounds it with a working escape hatch.

## Decision

**Two boundaries, two coupling levels:**

1. **In-tree first-party extensions live in the privileged realm.** They ship Svelte components via the existing `register*` contracts. They share data with each other by returning an exports value from `activate()`; consumers look up producer exports via `host.getExtension<T>(id): { id; exports: T } | undefined`. Exports may include `$state` proxies, plain methods, identity tokens, design-system components — anything the producer wants to expose. No framework neutrality is preserved at this boundary; we lean into Svelte's reactivity primitive intentionally.

2. **Untrusted third-party extensions run as webviews.** Sandboxed iframes; framework-of-choice inside; `postMessage` boundary to the host; structured-clone snapshots of producer state; JSON-RPC for callbacks. The host bridges between Svelte-land (privileged producers) and the webview's world. The webview wing is on the roadmap as **Coming**, named with its trigger ("validate non-Svelte escape hatch"), not deferred indefinitely.

**Concrete API for the privileged realm (cross-extension exports):**

- `Extension.activate(context: ExtensionContext): unknown` — was `: void`. Producer extensions may return an exports value; non-producer extensions return nothing (TypeScript permits omission because `void ⊆ unknown`). Stays synchronous this iteration.
- `ExtensionHost.getExtension<T = unknown>(id: string): { id: string; exports: T } | undefined` — returns the wrapper iff the extension is currently activated. Returns `undefined` otherwise. The generic on `T` is unsafe sugar; producers commit to their type contract via the exported `*Exports` type. (VS Code's `vscode.extensions.getExtension<T>(id)` does the same.)

**Consumer ergonomics — type sharing across extension packages:**

- Producer extensions export a named `*Exports` interface from their main entry point (`@gcscode/extension-sitl` exports `SitlExports = { telemetry: Readonly<TelemetryState> }`).
- Consumer extensions add the producer as a workspace dependency in `package.json` and import the type via `import type { SitlExports } from '@gcscode/extension-sitl'`. TypeScript erases the type-only import; no runtime dependency exists.
- The boundary rule in `CLAUDE.md` softens from "Extension packages import ONLY from `@gcscode/extension-api`" to "Extension packages import RUNTIME only from `@gcscode/extension-api`. Type-only imports from sibling extension packages are allowed for consuming cross-extension `exports`." ESLint enforces via `@typescript-eslint/no-restricted-imports` with `allowTypeImports: true`.

**Reactive flow across the boundary:**

The registry's per-extension exports storage is a `SvelteMap`, mirroring the existing reactive plumbing for contribution maps (phase B2a). Reading `host.getExtension(id)` inside a `$derived` / template context reactively tracks enable/disable transitions on the producer. The producer's `$state` proxy is the same object on both sides of the boundary (single bundle, single module graph), so reads of `exports.telemetry.field` from a consumer's template trigger Svelte's read-tracking exactly as they would inside the producer. No bridging code, no manual subscription.

## Consequences

- **Svelte coupling at both boundaries is now deliberate, not implicit.** The contract has always read `import type { Component } from 'svelte'`; this ADR makes the choice load-bearing. The cost is bounded (in-tree first-party extensions only); the escape hatch is webviews; the trigger to revisit the lock is a non-Svelte consumer that doesn't fit the webview shape.
- **The privileged-realm boundary is a trust boundary.** Privileged extensions can mutate each other's `$state` proxies. Today this is fine (everything is in-tree, first-party, mutually-trusting). When the marketplace / untrusted-third-party question lands, the answer is "they run as webviews, not in the privileged realm" — not "we add runtime guards around `$state`."
- **The webview wing is on the roadmap, not in `out-of-scope.md`.** Out-of-scope is for things deferred indefinitely or until a vague trigger. The webview wing has a concrete trigger ("validate the escape hatch") and a near-term slot. Treating it as a scheduled iteration (not a deferral) keeps the architecture honest about what it actually depends on.
- **Cross-extension activation order is not guaranteed.** Today extensions activate in `bundledExtensions` array order (B4). A consumer that runs `host.getExtension('gcscode.sitl')` during its own `activate()` will see undefined if SITL hasn't activated yet. Consumers handle the undefined case defensively — same posture as VS Code, where `vscode.extensions.getExtension(id)` can return undefined or have `isActive=false` until later.
- **Type sharing softens the package boundary by a small, documented amount.** ESLint's `allowTypeImports: true` is the enforcement; the runtime boundary (no value imports) is preserved. CI catches violations.

## Known limitations

- **No `extensionDependencies` declaration.** A consumer cannot say "I require SITL active before me." Today the order is `bundledExtensions` insertion order; consumers cope via undefined checks. Trigger to revisit: first ordering bug, OR a manifest-driven enable order, OR the first third-party that wants to declare a producer dependency. Likely lands together with the webview wing or the manifest iteration.
- **No versioning or compat checks for cross-extension exports.** Workspace:* everywhere; producers and consumers ship together. When extensions are published independently (marketplace, separate repos), the producer's `*Exports` type becomes a contract that needs explicit versioning. Trigger: marketplace lands, or first cross-repo third-party producer.
- **Producer mutation of consumer state is unconstrained.** A producer that exports a non-readonly `$state` proxy gives consumers write access to its state. The convention is "type the exports as `Readonly<...>` to communicate intent" — discipline + lint, not a hard wall. Trigger to revisit: a real bug from accidental mutation.

## Alternatives considered

- **A — fully framework-neutral data API** (`{ getX(), onXChange(cb) }` style). Rejected: forces producers to emit explicit change events, forces consumers to rebuild reactivity from those events. Strictly more plumbing for less reactivity than option B gives natively.
- **A' — framework-neutral data API + Svelte adapter** (wrap the producer API in a `$state` proxy on the consumer side). Rejected: wraps a proxy with a proxy. Svelte's `$state` already produces a Proxy that tracks reads; wrapping it in `onChange` callbacks and re-creating a `$state` from those events is reinventing the framework primitive.
- **D — built-in core panels** (shell renders core UI; extensions provide data only). Rejected: a GCS has no fixed "main view" the shell can build around. The renderer-as-host model assumes a dominant view that doesn't exist here.
- **Two ADRs split** ("Svelte coupling" + "exports API"). Considered. Rolled into one because the coupling decision is the load-bearing rationale for the exports API shape; splitting them would force forward references.

## Follow-ups

- **Iteration A — `vehicle-status` extension.** First consumer of cross-extension exports. Spec: [`docs/specs/2026-04-29-iteration-a-extension-exports.md`](../specs/2026-04-29-iteration-a-extension-exports.md). Adds the API change, the registry plumbing, the ESLint refinement, and a tiny consumer extension as proof.
- **Iteration B — webview wing + Preact widget.** Validates the escape hatch. Iframe host, manifest schema, postMessage protocol, JSON-RPC layer, structured-clone state snapshots, vanilla bootstrap, Preact adapter. Real consumer: `@gcscode/extension-battery-widget` written in Preact, sandboxed, consuming SITL telemetry. Roadmap entry; spec to follow after iteration A lands.
- **`extensionDependencies` and topological activation order.** Deferred per Known Limitations. Triggered when ordering bugs, third-party dependencies, or marketplace persistence pull on it.
- **Phase C namespacing trigger from ADR-0003.** Adding `getExtension` brings the flat surface on `ExtensionHost` to six methods (registerView, registerStatusBarItem, registerCommand, registerKeybinding, executeCommand, getExtension). Still under the 5–7 trigger; defer namespacing per ADR-0003.
- The "Phase C namespacing trigger from ADR-0003 — Adding `getExtension` brings the flat surface on `ExtensionHost` to six methods. Still under the 5–7 trigger; defer namespacing per ADR-0003." follow-up is now resolved by [ADR-0006](ADR-0006-extensionhost-namespacing.md) (2026-05-01), which adopts the topic-namespaced shape concretely rather than waiting for the seventh-method add.
