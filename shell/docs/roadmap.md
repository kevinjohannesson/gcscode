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
- [x] **B4: Extension manifest + persistence** — `bundledExtensions` array; localStorage-backed disabled-id set; `ExtensionManager.register` grows `{ enabled? }`; `createExtensionManager` grows `{ onEnabledChanged }`. Spec: [`specs/2026-04-27-phase-b4-extension-manifest.md`](specs/2026-04-27-phase-b4-extension-manifest.md)
- [x] **`Extension.deactivate?()` hook** — optional `deactivate?(): void | Promise<void>` on `Extension`; `registry.deactivate(id)` and `manager.setEnabled(id, ...)` become async. Spec: [`specs/2026-04-27-extension-deactivate-hook.md`](specs/2026-04-27-extension-deactivate-hook.md)

### Phase C — Cross-cutting capabilities

- [x] **C1: ExtensionHost namespacing** — host API moves from flat (`registerCommand`, `registerStatusBarItem`, ...) to topic-namespaced (`host.commands.registerCommand`, `host.window.registerStatusBarItem`, ...). Spec: [`specs/2026-05-01-extensionhost-namespacing.md`](specs/2026-05-01-extensionhost-namespacing.md). ADR: [`decisions/ADR-0006-extensionhost-namespacing.md`](decisions/ADR-0006-extensionhost-namespacing.md).
- [ ] **C2+: events, settings, themes, i18n** — TBD. Each lands as a new namespace under `host.*` when a feature extension pulls on it. Re-scope per-capability when triggered.

## Feature extensions

The first-party extensions planned for the app. Each is a future consumer of the extension architecture; some are named triggers for deferred phase work.

### Coming (committed — will ship)

- [x] **SITL stub** — placeholder view + `gcscode.sitl.getLocation` command, hardcoded coordinates, no connection. Spec: [`specs/2026-04-27-extension-sitl-stub.md`](specs/2026-04-27-extension-sitl-stub.md)
- [x] **SITL listener** — live ArduCopter telemetry via mavlink2rest WebSocket bridge; `gcscode.sitl` extension consumes HEARTBEAT + GLOBAL_POSITION_INT; first consumer of `Extension.deactivate?()` hook. Spec: [`specs/2026-04-27-extension-sitl-listener.md`](specs/2026-04-27-extension-sitl-listener.md)
- [ ] **Map** — geographical view + selection state. Likely fits the existing view contribution kind; may surface a need for shared map state.
- [ ] **Video feed** — live video stream display. Likely a Phase C streaming-source consumer alongside SITL.
- [x] **Vehicle status** — first consumer of cross-extension exports. `@gcscode/extension-vehicle-status` registers a footer status bar item that reads SITL telemetry via `host.getExtension('gcscode.sitl').exports`. Spec: [`specs/2026-04-29-iteration-a-extension-exports.md`](specs/2026-04-29-iteration-a-extension-exports.md)
- [ ] **Webview wing + Preact battery widget** — escape hatch validation per [ADR-0005](decisions/ADR-0005-extension-boundaries.md). Sandboxed iframes, postMessage protocol, JSON-RPC, structured-clone snapshots, vanilla + Preact adapters. Real consumer: `@gcscode/extension-battery-widget` in Preact, sandboxed, consuming SITL telemetry.

### Considering (not yet committed)

- [ ] **Road scanning** — _description TBD_

## Maintenance

This doc is updated alongside other per-iteration docs propagation (`out-of-scope.md`, ADR-0003 retrospective):

- **Iteration ships** → flip its checkbox, link the spec, and (optionally) reference the merge SHA.
- **Iteration deferred or rescoped** → update its line + trigger, leave checkbox unchecked.
- **New deferral surfaces during a spec** → add an unchecked item with its trigger.
- **User mentions a feature idea offhand during planning chat** → propose adding it here. Default to **Considering**; escalate to **Coming** when the user signals commitment ("we'll need", "100% in", "definitely going to be").

The doc is a manually-maintained list, not a generated artifact. When in doubt about whether something belongs here, prefer the lighter touch — a one-line entry that links somewhere richer is better than re-stating that richer source.
