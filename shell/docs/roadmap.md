# Roadmap

Single-page status: where the gcscode extension architecture is and what's planned. Iteration detail lives in `docs/specs/`, plans in `docs/plans/`, rationale in `docs/decisions/`, deferral detail (organized by topic) in `docs/out-of-scope.md`. This file is the start-here "where are we now / what's next" view.

## Phase plan

The extension architecture grows in phases: **A** (contribution kinds), **B** (lifecycle and cleanup), **C** (cross-cutting capabilities). Each phase contains numbered iterations.

### Phase A — Contribution kinds

- [x] **A1: Status bar item** — `host.registerStatusBarItem` + footer rendering. Spec: [`specs/2026-04-26-phase-a1-status-bar.md`](specs/2026-04-26-phase-a1-status-bar.md)
- [x] **A2: Commands** — `host.registerCommand` + `executeCommand` (host- and registry-side). Spec: [`specs/2026-04-26-phase-a2-commands.md`](specs/2026-04-26-phase-a2-commands.md)
- [x] **A3: Keybindings** — `host.registerKeybinding` + a shell-level keyboard dispatcher. Spec: [`specs/2026-04-26-phase-a3-keybindings.md`](specs/2026-04-26-phase-a3-keybindings.md)
- [ ] **A4+: more contribution kinds** — menus, palette entries, sidebar tree views all candidates. Trigger: a real consumer needs the surface. See [`out-of-scope.md`](out-of-scope.md).

### Phase B — Lifecycle and cleanup

- [x] **B1: Deactivate orchestration** — `registry.deactivate(extensionId)` iterates subscriptions LIFO with error resilience. Spec: [`specs/2026-04-26-phase-b1-deactivate-orchestration.md`](specs/2026-04-26-phase-b1-deactivate-orchestration.md)
- [x] **B2a: Reactive plumbing** — registry mutations propagate to mounted UI via `SvelteMap`. Spec: [`specs/2026-04-27-phase-b2a-reactive-plumbing.md`](specs/2026-04-27-phase-b2a-reactive-plumbing.md)
- [x] **B2b: Extension enable/disable** — `ExtensionManager` layer above the registry; `manager.register` / `setEnabled` / `listExtensions`. Spec: [`specs/2026-04-27-phase-b2b-extension-enable-disable.md`](specs/2026-04-27-phase-b2b-extension-enable-disable.md)
- [ ] **B3: Dev-time hot module reload** — Vite HMR boundary that re-imports an extension module on edit and replays activate. Trigger: extension-author iteration friction.
- [x] **B4: Bundled extensions list + persistence** — host-side `bundledExtensions` array (file renamed to `bundled-extensions.ts` in B5; see ADR-0007); localStorage-backed disabled-id set; `ExtensionManager.register` grows `{ enabled? }`; `createExtensionManager` grows `{ onEnabledChanged }`. Spec: [`specs/2026-04-27-phase-b4-extension-manifest.md`](specs/2026-04-27-phase-b4-extension-manifest.md). NOTE: the original B4 title used "Extension manifest" for the host-side bundling list; the public per-extension manifest is a different concept landed in B5.
- [x] **`Extension.deactivate?()` hook** — optional `deactivate?(): void | Promise<void>` on `Extension`; `registry.deactivate(id)` and `manager.setEnabled(id, ...)` become async. Spec: [`specs/2026-04-27-extension-deactivate-hook.md`](specs/2026-04-27-extension-deactivate-hook.md)
- [x] **B5: Per-extension manifest metadata** — public `ExtensionManifest` type in `@gcscode/extension-api`; `Extension.manifest: ExtensionManifest` replaces flat identity fields; first descriptive field is `description?`. Host-side `extension-manifest.ts` renames to `bundled-extensions.ts` to free the term. Spec: [`specs/2026-05-02-extension-manifest.md`](specs/2026-05-02-extension-manifest.md). ADR: [`decisions/ADR-0007-extension-manifest.md`](decisions/ADR-0007-extension-manifest.md).
- [x] **B6: Extensions panel** — centered overlay opened via `Ctrl+Shift+X` or palette; lists bundled extensions with displayName, version, description, Enable/Disable button; first marketplace UI consumer of `Extension.manifest.description`. Spec: [`specs/2026-05-02-extensions-panel.md`](specs/2026-05-02-extensions-panel.md).

### Phase C — Cross-cutting capabilities

- [x] **C1: ExtensionHost namespacing** — host API moves from flat (`registerCommand`, `registerStatusBarItem`, ...) to topic-namespaced (`host.commands.registerCommand`, `host.window.registerStatusBarItem`, ...). Spec: [`specs/2026-05-01-extensionhost-namespacing.md`](specs/2026-05-01-extensionhost-namespacing.md). ADR: [`decisions/ADR-0006-extensionhost-namespacing.md`](decisions/ADR-0006-extensionhost-namespacing.md).
- [x] **C2: Command palette + `window.showQuickPick`** — `host.window.showQuickPick<T>(items, options): Promise<T | undefined>` + built-in `workbench` extension registering `workbench.action.showCommands` + `Ctrl+Shift+P`. Spec: [`specs/2026-05-02-command-palette.md`](specs/2026-05-02-command-palette.md).
- [ ] **C3+: events, settings, themes, i18n** — TBD. Each lands as a new namespace under `host.*` when a feature extension pulls on it. Re-scope per-capability when triggered.

## Feature extensions

The first-party extensions planned for the app. Each is a future consumer of the extension architecture; some are named triggers for deferred phase work.

### Coming (committed — will ship)

- [x] **SITL stub** — placeholder view + `gcscode.sitl.getLocation` command, hardcoded coordinates, no connection. Spec: [`specs/2026-04-27-extension-sitl-stub.md`](specs/2026-04-27-extension-sitl-stub.md)
- [x] **SITL listener** — live ArduCopter telemetry via mavlink2rest WebSocket bridge; `gcscode.sitl` extension consumes HEARTBEAT + GLOBAL_POSITION_INT; first consumer of `Extension.deactivate?()` hook. Spec: [`specs/2026-04-27-extension-sitl-listener.md`](specs/2026-04-27-extension-sitl-listener.md)
- [x] **Map (demo)** — throwaway scaffold: `@gcscode/extension-map-demo` renders a maplibre map with a drone marker driven by SITL telemetry. Validates maplibre integration + consumer-side cross-extension pattern. Removed when the real Map iteration ships. Spec: [`specs/2026-05-03-map-demo.md`](specs/2026-05-03-map-demo.md).
- [x] **Map** — geographical view + map contribution API for layer registration. First service-style extension. Selection state deferred to a later iteration. Spec: [`specs/2026-05-03-map-and-flight-overlay.md`](specs/2026-05-03-map-and-flight-overlay.md).
- [x] **Map controls** — `MapApi.registerControl` adds a declarative property-bag contribution surface (with Svelte component escape hatch); first consumer is `flight-overlay`'s recenter button. First declarative property-bag contribution kind in gcscode. Spec: [`specs/2026-05-03-map-controls.md`](specs/2026-05-03-map-controls.md).
- [x] **Flight overlay** — first consumer of the `gcscode.map` contribution API. `@gcscode/extension-flight-overlay` registers drone-icon (live SITL, heading-rotated, armed-state styled), heading-line (live SITL, screen-space 400px), home-location (hardcoded), and max-distance-circle (hardcoded) layers. Validates the service-style extension pattern. Specs: [`specs/2026-05-03-map-and-flight-overlay.md`](specs/2026-05-03-map-and-flight-overlay.md), [`specs/2026-05-05-flight-overlay-drone-icon.md`](specs/2026-05-05-flight-overlay-drone-icon.md).
- [ ] **Video feed** — live video stream display. Likely a Phase C streaming-source consumer alongside SITL.
- [x] **Vehicle status** — first consumer of cross-extension exports. `@gcscode/extension-vehicle-status` registers a footer status bar item that reads SITL telemetry via `host.extensions.getExtension('gcscode.sitl').exports`. Spec: [`specs/2026-04-29-iteration-a-extension-exports.md`](specs/2026-04-29-iteration-a-extension-exports.md)
- [ ] **Webview wing + Preact battery widget** — escape hatch validation per [ADR-0005](decisions/ADR-0005-extension-boundaries.md). Sandboxed iframes, postMessage protocol, JSON-RPC, structured-clone snapshots, vanilla + Preact adapters. Real consumer: `@gcscode/extension-battery-widget` in Preact, sandboxed, consuming SITL telemetry.

### Considering (not yet committed)

- [ ] **Road scanning** — _description TBD_
- [ ] **Sidebar / activity-bar chrome** — persistent UI region that would host the extensions panel (sidebar-mounted variant alongside the existing overlay), settings, output, search, etc. Trigger: a second sidebar tenant emerges (settings, output, search), OR operator UX feedback says the overlay is insufficient for longer browsing tasks. Operator-UX framing: floating/disappearing UI is the default; persistent chrome must justify its viewport cost.
- [ ] **Map filter extension** — registry where extensions contributing map elements expose user-toggleable visibility (e.g., heading line, max-distance circle, future tracks/breadcrumbs). Trigger: second consumer wants opt-out of a sibling extension's layer. Surfaced during the drone-icon brainstorm (`docs/specs/2026-05-05-flight-overlay-drone-icon.md`).
- [ ] **Map viewport constraints** — `maxBounds` + minimum zoom in `extension-map` so panning doesn't escape useful bounds and zoom-out doesn't reveal world-wrapping. Trigger: operator UX feedback or first integration test that surfaces an antimeridian artifact. Surfaced during the drone-icon brainstorm (`docs/specs/2026-05-05-flight-overlay-drone-icon.md`).

## Agentic team architecture

A workflow track that runs alongside feature iterations. Makes the implicit meta-project (Claude-driven extension architecture) explicit by investing in agent orchestration, reviewer durability, and traceability.

### Shipped

- [x] **Reviews as artifacts** — GitHub PR workflow + `gcscode-reviewer` GitHub App identity for agentic reviewer posts. Spec: [`specs/2026-05-12-reviews-as-artifacts.md`](specs/2026-05-12-reviews-as-artifacts.md).
- [x] **Red-team reviewer for specs/ADRs** — introduces spec-PR + ADR-PR workflow + reviewer-role registry + advisory red-team role critiquing spec/ADR commits before they accept. Plans continue to land on master directly. Spec: [`specs/2026-05-14-red-team-reviewer.md`](specs/2026-05-14-red-team-reviewer.md). ADR: [`decisions/ADR-0008-reviewer-role-registry.md`](decisions/ADR-0008-reviewer-role-registry.md).
- [x] **Reviewer-role design conventions** — articulates four design patterns for future reviewer roles (audit trail, mechanical/judgment split, identity field, tripwires) + auto-dispatch controller obligations + post-merge implementation convention. First non-synthetic spec-PR exercise. Spec: [`specs/2026-05-14-reviewer-role-design-conventions.md`](specs/2026-05-14-reviewer-role-design-conventions.md).
- [x] **Spec-quality reviewer** — adds the prose-analog of code-quality for spec/ADR PRs. Surgically narrowed mandate (structure + within-document consistency + link mechanics) distinct from red-team's premise + consistency-with-priors. First role to fully exercise the design conventions; first iteration where red-team's organic critique materially narrowed the iteration's scope (broad mandate → document-internal only). Spec: [`specs/2026-05-14-spec-quality-reviewer.md`](specs/2026-05-14-spec-quality-reviewer.md).

### Queued (each needs its own brainstorm + spec cycle)

- [x] **Auto-merge on user approval** — `.github/workflows/auto-merge.yml` triggered on `pull_request_review.submitted` and `pull_request.labeled`. Merges when (a) `auto-merge` label is present (user's opt-in signal — chosen over `--approve` because GitHub blocks PR authors from self-approving their own PRs), (b) class-aware bot signal passes (`reviewDecision==APPROVED` for feat/, both reviewers posted for spec/adr/), (c) PR is mergeable. Spec: [`specs/2026-05-14-auto-merge-on-user-approval.md`](specs/2026-05-14-auto-merge-on-user-approval.md).
- [ ] **Multi-model heterogeneous reviewers** — validates the independence-of-opinion premise concretely now that reviews are durable. Runs Opus + Sonnet (or one Claude + one non-Claude) on the same PR; chooses steady-state model assignment per reviewer role based on findings.

### Considering (not yet committed)

- [ ] **Linear integration** — work tracking outside GitHub. Trigger: ticket volume.
- [ ] **Webhook router for off-session triggers** — event-driven dispatch when no Claude session is live.
- [ ] **Override semantics** — formal ADR supersession by reviewer, `blocked-on-adr` labels, counter-proposal PRs.
- [ ] **Per-role bot identities** — multiple GitHub Apps for distinct reviewer accounts (currently single App, role disambiguation via review-text headers).
- [ ] **Reviewer routing layer** — once there is more than one non-baseline reviewer role (red-team + devil's advocate, or red-team + a first expert reviewer), the controller needs explicit routing for "which reviewer roles fire on which PRs." Surfaced during the red-team-reviewer brainstorm (2026-05-14).
- [ ] **Retroactive ADR for reviews-as-artifacts** — the reviews-as-artifacts iteration (2026-05-12) didn't get a dedicated ADR — its rationale lives in the spec. Worth extracting to an ADR-NNNN entry as a housekeeping exercise; nice candidate for an autonomous Claude session that reads the spec + CLAUDE.md updates + the agentic-team-architecture brainstorm transcript and produces the ADR. Decision date 2026-05-12; creation date deferred.
- [x] **Superpowers baseline reviewers on spec/ADR PRs?** **Resolved 2026-05-14** by building the spec-PR-appropriate analog as a NEW reviewer role (Spec-quality) rather than extending the existing code-specific superpowers reviewers to spec/ADR PRs — the existing prompts were judged too code-specific to apply to prose. Spec-quality's mandate (document-internal: structure + within-document consistency + link mechanics) was surgically narrowed to NOT overlap with red-team's consistency-with-priors mandate. See [`specs/2026-05-14-spec-quality-reviewer.md`](specs/2026-05-14-spec-quality-reviewer.md).

## Maintenance

This doc is updated alongside other per-iteration docs propagation (`out-of-scope.md`, ADR-0003 retrospective):

- **Iteration ships** → flip its checkbox, link the spec, and (optionally) reference the merge SHA.
- **Iteration deferred or rescoped** → update its line + trigger, leave checkbox unchecked.
- **New deferral surfaces during a spec** → add an unchecked item with its trigger.
- **User mentions a feature idea offhand during planning chat** → propose adding it here. Default to **Considering**; escalate to **Coming** when the user signals commitment ("we'll need", "100% in", "definitely going to be").

The doc is a manually-maintained list, not a generated artifact. When in doubt about whether something belongs here, prefer the lighter touch — a one-line entry that links somewhere richer is better than re-stating that richer source.
