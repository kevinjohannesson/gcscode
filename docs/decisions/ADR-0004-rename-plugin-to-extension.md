# ADR-0004 — Rename "plugin" to "extension"

**Status:** Accepted (2026-04-27)

## Context

The codebase used "plugin" for our extensibility unit (the `Plugin` interface, `@gcscode/plugin-api`, `@gcscode/plugin-example`, supporting types, prose throughout `CLAUDE.md`, `docs/roadmap.md`, `docs/out-of-scope.md`, and READMEs). VS Code, our deliberate reference architecture, calls the same concept an "extension."

Three reasons combine to make the rename worth doing now:

1. **Cost-of-delay.** The codebase will only grow; renaming is mechanical-but-broad. The post-B2a / pre-B2b window is the cleanest cut available — B2b is a roadmap line with no spec yet and is naturally born under whichever vocabulary we end on.
2. **Agent-comprehension.** Agents reach for VS Code documentation patterns (CLAUDE.md is explicit about this), and matching terminology removes one layer of translation between source and target.
3. **Naming-for-trajectory.** ADR-0003 frames identity fields on the imperative `Plugin` interface as "the only piece of the manifest space worth adopting now." If the manifest deferral in `out-of-scope.md` lands per its trigger (settings UI / marketplace preview / first untrusted extension), the runtime interface naturally shrinks toward `{ activate, deactivate? }` — closer to VS Code's actual runtime model. The rename ages well into that future and is well-founded today regardless.

CLAUDE.md says alignment with VS Code is "in spirit, not by byte" and that we should "feel free to diverge on syntax/style/ergonomics when the local context warrants." Vocabulary alignment is therefore a deliberate choice, not implied by the broader alignment-of-concepts framing. This ADR records the rename as that deliberate choice.

## Decision

Rename "plugin" → "extension" across:

- **Code** — types (`Plugin` → `Extension`, `PluginHost` → `ExtensionHost`, `PluginContext` → `ExtensionContext`, `PluginIdentity` → `ExtensionIdentity`), context fields (`context.plugin` → `context.extension`), filenames, package names (`@gcscode/plugin-api` → `@gcscode/extension-api`; `@gcscode/plugin-example` → `@gcscode/extension-example`), workspace directories, ESLint boundary rules.
- **Living docs** that describe current state — `CLAUDE.md`, package READMEs, `docs/roadmap.md`, `docs/out-of-scope.md`. Rewritten in place.
- **Historical-record docs** — ADRs 0001–0003, all shipped specs and plans under `docs/specs/` and `docs/plans/`. **Not** rewritten. Each receives a single-line pointer note immediately after its H1, referencing this ADR. Filenames are not changed.

The implementation iteration is `docs/specs/2026-04-27-rename-plugin-to-extension.md` + `docs/plans/2026-04-27-rename-plugin-to-extension.md`.

## Consequences

- **No behavior change.** Mechanical rename; tests pass without test-logic changes.
- **VS Code vocabulary alignment, not shape alignment.** In VS Code there is no `Extension` interface that authors implement — extensions export `activate()` from a module and put metadata in `package.json`. Our `Extension` interface persists the imperative-object shape from ADR-0002, refined within in ADR-0003. This ADR borrows VS Code's word for an adjacent-but-not-identical concept; it does not adopt VS Code's runtime model. Future readers should not mistake the rename for full parity.
- **Git history is not retconned.** Past merge commits and branch names that contain "plugin" (e.g. `Merge branch 'feat/plugin-architecture-mvp'`) record what the project actually called things at those points in time and stay as-written.

## Follow-ups

- Future ADRs use the new vocabulary.
- B2b is born under new naming ("Extension enable/disable").
- The optional `Extension.deactivate?()` hook (renamed from `Plugin.deactivate?()`) remains deferred. Named on-deck consumer: SITL listener extension.
- Manifest deferral in `docs/out-of-scope.md` keeps its trigger ("settings UI / marketplace preview / first untrusted extension module"). The rename does not change when the manifest becomes worth adopting.
- Phase C namespacing trigger (`host.commands.register*` once the flat surface on `ExtensionHost` exceeds ~5–7 methods) is unchanged.
