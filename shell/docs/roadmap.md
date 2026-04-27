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
- [ ] **`Extension.deactivate?()` hook** — optional extension-side hook for non-disposable / async cleanup. Split off from B1 by design. Trigger: first extension needing it (named on-deck consumer: SITL listener — see Feature extensions below).

### Phase C — Cross-cutting capabilities

- [ ] **Phase C scope** — TBD. ADR-0003 sketches host namespacing (`host.commands.register(...)`) once the flat surface exceeds 5–7 methods, plus events, settings, themes, and i18n as real consumers pull on them. Re-scope when a feature extension pulls on it.

## Feature extensions

The first-party extensions planned for the app. Each is a future consumer of the extension architecture; some are named triggers for deferred phase work.

### Coming (committed — will ship)

- [x] **SITL stub** — placeholder view + `gcscode.sitl.getLocation` command, hardcoded coordinates, no connection. Spec: [`specs/2026-04-27-extension-sitl-stub.md`](specs/2026-04-27-extension-sitl-stub.md)
- [ ] **SITL listener** — software-in-the-loop data-feed listener. First consumer of `Extension.deactivate?()` hook (will hold a connection that needs explicit close); likely first to want a Phase C streaming/connection service.
- [ ] **Map** — geographical view + selection state. Likely fits the existing view contribution kind; may surface a need for shared map state.
- [ ] **Video feed** — live video stream display. Likely a Phase C streaming-source consumer alongside SITL.

### Considering (not yet committed)

- [ ] **Road scanning** — _description TBD_

## Maintenance

This doc is updated alongside other per-iteration docs propagation (`out-of-scope.md`, ADR-0003 retrospective):

- **Iteration ships** → flip its checkbox, link the spec, and (optionally) reference the merge SHA.
- **Iteration deferred or rescoped** → update its line + trigger, leave checkbox unchecked.
- **New deferral surfaces during a spec** → add an unchecked item with its trigger.
- **User mentions a feature idea offhand during planning chat** → propose adding it here. Default to **Considering**; escalate to **Coming** when the user signals commitment ("we'll need", "100% in", "definitely going to be").

The doc is a manually-maintained list, not a generated artifact. When in doubt about whether something belongs here, prefer the lighter touch — a one-line entry that links somewhere richer is better than re-stating that richer source.
