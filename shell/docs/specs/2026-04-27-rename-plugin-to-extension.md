# Rename: plugin → extension

**Status:** Draft (2026-04-27)

## Context

The codebase calls its extensibility unit a "plugin": the `Plugin` interface, `PluginHost`, `PluginContext`, `PluginIdentity`, the `@gcscode/plugin-api` package, the `@gcscode/plugin-example` package, and prose throughout `CLAUDE.md`, `docs/roadmap.md`, `docs/out-of-scope.md`, READMEs, and decision/spec/plan history. VS Code, our deliberate reference architecture, calls this concept an "extension." This spec is the iteration that aligns vocabulary with VS Code's, with no behavior or shape changes to the API.

The decision is recorded in ADR-0004; this spec is the work that lands the decision in code and active docs. It is intentionally a small, single-purpose iteration with one clean commit boundary.

**Why now.** Three reasons combined. First, cost-of-delay: the codebase will only grow, and renaming is mechanical-but-broad. The post-B2a / pre-B2b window is the cleanest cut available — B2b is a roadmap line with no spec yet, and is naturally born under whichever vocabulary we end on. Second, agent-comprehension: agents will reach for VS Code documentation patterns (CLAUDE.md is explicit about this), and matching terminology removes one layer of translation. Third, naming-for-trajectory: ADR-0003 frames the identity fields on the imperative `Plugin` interface as "the only piece of the manifest space worth adopting now." If the manifest deferral in `out-of-scope.md` lands per its trigger (settings UI / marketplace preview / first untrusted extension), the runtime interface naturally shrinks toward `{ activate, deactivate? }` — closer to VS Code's actual runtime model. The rename ages well into that future and is well-founded today regardless.

**Why not.** CLAUDE.md says alignment is "in spirit, not by byte" and that we should "feel free to diverge on syntax/style/ergonomics when the local context warrants." Vocabulary is closer to syntax than to load-bearing pattern, so the alignment-of-concepts argument does not by itself force vocabulary alignment. ADR-0004 records the rename as a deliberate vocabulary alignment choice, not as implied by ADR-0001/ADR-0002/ADR-0003.

**Honest framing.** In VS Code, there is no `Extension` interface that authors implement — extensions export `activate()` from a module and put metadata in `package.json`. Our `Plugin` interface (post-rename: `Extension`) is `{ id, displayName, version, activate(context) }` — a deliberate divergence dating to ADR-0002. We adopt VS Code's vocabulary for our adjacent-but-not-identical concept; we do not adopt VS Code's runtime shape. ADR-0004 records this honestly so a future reader does not mistake the rename for full parity.

## Decisions deliberately out of this iteration

Adjacent concepts that could plausibly land here, but do not:

- **Reshaping the imperative interface toward `export function activate()`.** ADR-0002 chose the imperative-object shape; ADR-0003 refined within it. ADR-0004 borrows VS Code's word, not its shape. No change to the interface's shape.
- **Adding a declarative `contributes` manifest.** Still deferred per `out-of-scope.md`; trigger conditions unchanged. The rename does not affect when the manifest becomes worth adopting.
- **Namespacing `host.register*` → `host.commands.register*` etc.** ADR-0003's Phase C trigger (~5–7 methods, currently five). No change.
- **Reshaping any other API.** No new types, no removed types, no changed signatures. Every change in this iteration is a mechanical name substitution, a directory rename, or a doc edit.
- **B2b enable/disable, B3 HMR, `Extension.deactivate?()` hook.** Unrelated; not mixed in. (The hook is currently named `Plugin.deactivate?()` in `out-of-scope.md`; that file is rewritten by this iteration to `Extension.deactivate?()`.)

## VS Code alignment

| VS Code feature | Rename iteration in GCScode | Status |
| --------------- | --------------------------- | ------ |
| Vocabulary "extension" for the unit of extensibility | ✓ — `Extension`, `ExtensionHost`, `ExtensionContext`, `ExtensionIdentity`; `@gcscode/extension-api`, `@gcscode/extension-example` | Aligned. |
| `ExtensionContext` name | ✓ — `ExtensionContext` mirrors `vscode.ExtensionContext` | Aligned in name. |
| `ExtensionContext` shape | ➤ Ours — `{ host, subscriptions, extension }` | Diverges. VS Code's `ExtensionContext` exposes `extensionPath`, `globalState`, `workspaceState`, etc. We expose only what the registry needs today. Per ADR-0003. |
| Extension authoring shape | ➤ Ours — named `const extensionFoo: Extension` with `activate(context)` | Diverges. VS Code authors export `activate()` from a module; we keep the imperative-object shape from ADR-0002. The rename adopts VS Code's vocabulary for an adjacent concept; it does not adopt VS Code's authoring model. Documented in ADR-0004. |
| `host.register*` flat surface | ➤ Ours — flat methods on `ExtensionHost` | Diverges (unchanged). VS Code namespaces (`vscode.commands.registerCommand`); ADR-0003 keeps flat until ~5–7 methods. |
| Manifest / `contributes` | ✗ Deferred | `out-of-scope.md` continues to track. Rename does not change deferral. |
| `package.json` extension manifest fields (`name`, `displayName`, `version`, `engines`, `contributes`) | ✗ Deferred | Same trigger as manifest above. |

## Goals

- Every code-level type, field, parameter, variable, error string, log string, and JSDoc / inline comment that says "plugin" is renamed to "extension," consistently across `@gcscode/extension-api`, `@gcscode/extension-example`, and `@gcscode/shell`. Corresponding filenames and directory names are renamed via `git mv` to preserve history.
- The two extension packages are renamed: `@gcscode/plugin-api` → `@gcscode/extension-api`; `@gcscode/plugin-example` → `@gcscode/extension-example`. Workspace dirs renamed accordingly. ESLint boundary rules updated (glob, ignore-glob, message text, package reference). `pnpm-lock.yaml` regenerated cleanly.
- Living docs that describe current state — `CLAUDE.md`, `packages/extension-api/README.md`, `packages/extension-example/README.md`, `packages/shell/README.md`, `docs/roadmap.md`, `docs/out-of-scope.md` — are rewritten in place to use "extension" terminology. Reading order, structure, and information content are preserved; only terms change. (Root `README.md` is a vestigial Vite/Svelte template README with no plugin/extension references; it is not touched.)
- Historical decision/spec/plan documents — `docs/decisions/ADR-000{1,2,3}-*.md`, every file under `docs/specs/`, every file under `docs/plans/` — are **not** rewritten. Each receives a single-line pointer note immediately after its H1, in italicized form, pointing to ADR-0004. File contents are otherwise byte-identical. Filenames are not changed (they are part of the historical record).
- A new `docs/decisions/ADR-0004-rename-plugin-to-extension.md` is added. It records the rename as a deliberate vocabulary alignment choice with VS Code, the load-bearing rationale (cost-of-delay + agent-comprehension + naming-for-trajectory), and the honest framing that we adopt VS Code's word for our adjacent-shaped concept (not for VS Code's runtime model).
- The full validation chain is clean: `pnpm install` (clean state) resolves the renamed packages and regenerates `pnpm-lock.yaml`; `pnpm check` passes (svelte-check + tsc) across all three packages; `pnpm test` passes every existing test (no test logic changes are needed because behavior is unchanged); `pnpm lint` passes (ESLint + Prettier); `pnpm dev` shows the example extension mounting with view, status bar item, command, and `Alt+Shift+G` keybinding all functional.

## Non-goals

- **No interface-shape changes.** `Extension` (post-rename) has the same fields and the same `activate(context)` signature as `Plugin` (pre-rename). No `deactivate?()` hook is added.
- **No new types or capabilities.** The rename is purely terminological. No new `register*` method, no new `host.executeCommand` overload, no new context fields.
- **No `ExtensionContext` shape expansion.** No `extensionPath`, `globalState`, `workspaceState`, `secrets`, etc. The current `{ host, subscriptions, extension }` shape is preserved.
- **No retconning of historical documents.** ADRs 0001–0003, all shipped specs under `docs/specs/`, and all shipped plans under `docs/plans/` keep their original "plugin" terminology in body text. Each gains a one-line pointer note. Filenames are unchanged.
- **No git-history rewrite.** Past merge commits and branch names that contain "plugin" (e.g. `Merge branch 'feat/plugin-architecture-mvp'`) stay as-written. They record what the project actually called things at those points in time.
- **No B2b, B3, manifest, or `Extension.deactivate?()` hook work.** Mixing those in would defeat the "single clean cut" rationale.
- **No version bumps to packages.** Both extension packages are `private` / `0.0.0` and have no published consumers. The package-name change is a workspace-internal event.
- **No memory-file persistence in the repo.** User-side memory at `~/.claude/.../memory/` is updated alongside this iteration but lives outside the repository.

## Code rename map

### Types (in `@gcscode/extension-api`)

| Old | New |
| --- | --- |
| `Plugin` | `Extension` |
| `PluginHost` | `ExtensionHost` |
| `PluginContext` | `ExtensionContext` |
| `PluginIdentity` | `ExtensionIdentity` |

Unchanged (already neutral): `Disposable`, `ViewContribution`, `StatusBarItemContribution`, `CommandContribution`, `KeybindingContribution`. The `host.register*` method names and `host.executeCommand` are unchanged.

### Fields, parameters, internal names

| Old | New | Where |
| --- | --- | --- |
| `PluginContext.plugin` | `ExtensionContext.extension` | `@gcscode/extension-api` interface; reads in `registry.ts`'s `activate` and in tests if any |
| parameter `plugin: Plugin` | `extension: Extension` | `Registry.activate(extension)` and any caller |
| parameter / variable `pluginId: string` | `extensionId: string` | `Registry.deactivate(extensionId)` and internal helpers |
| `subscriptionsByPlugin` | `subscriptionsByExtension` | `registry.ts` internal Map |
| `createHost(plugin: PluginIdentity)` | `createHost(extension: ExtensionIdentity)` | `registry.ts` internal helper |
| `examplePlugin` (named export) | `exampleExtension` | `@gcscode/extension-example` `src/index.ts`; consumer in `packages/shell/src/main.ts` |
| Error / log strings: `attempted by plugin "..."`, `Cannot deactivate plugin: id "..."`, `Error disposing subscription for plugin "..."` | `attempted by extension "..."`, `Cannot deactivate extension: id "..."`, `Error disposing subscription for extension "..."` | `registry.ts` (and any test that asserts on substring) |
| JSDoc / inline comments containing "plugin" | "extension" | All source files |

### Filenames and directories

| Old | New |
| --- | --- |
| `packages/plugin-api/` | `packages/extension-api/` |
| `packages/plugin-example/` | `packages/extension-example/` |
| `packages/shell/src/plugin-host/` | `packages/shell/src/extension-host/` |

`registry.ts` and `registry.test.ts` keep their filenames (they do not contain "plugin"). All renames performed via `git mv` so blame survives.

### Package names

| Old | New |
| --- | --- |
| `@gcscode/plugin-api` | `@gcscode/extension-api` |
| `@gcscode/plugin-example` | `@gcscode/extension-example` |

### Configuration touched

| File | Change |
| --- | --- |
| `package.json` (root) | Workspace deps and scripts referencing the two package names |
| `packages/shell/package.json` | `dependencies` for `@gcscode/extension-api`, `@gcscode/extension-example` |
| `packages/extension-api/package.json` | `name` field |
| `packages/extension-example/package.json` | `name` field; `dependencies` referencing `@gcscode/extension-api` |
| `eslint.config.ts` | The boundary block: glob `packages/plugin-*` → `packages/extension-*`; `ignores` glob `packages/plugin-api/**` → `packages/extension-api/**`; the message text `'Plugins must only import from @gcscode/plugin-api...'` → `'Extensions must only import from @gcscode/extension-api...'`; the second message `'Plugins must not use relative imports...'` → `'Extensions must not use relative imports...'` |
| `pnpm-lock.yaml` | Regenerated via `pnpm install` |
| `pnpm-workspace.yaml` | Already `packages/*` — no change needed |
| `tsconfig.json`, `tsconfig.base.json` | Verify no path mappings reference the old names; expected: no change |
| `packages/shell/vite.config.ts`, `svelte.config.js`, `vitest.config.ts`, `packages/extension-example/vitest.config.ts` | Verify no path refs; expected: no change |

## Doc strategy

### Living docs — rewrite in place

Files describing current state. "Plugin" → "extension" throughout, including section titles, code samples, glossary terms, and references to package names / type names. Reading order and information content are preserved.

- `CLAUDE.md`
- `packages/extension-api/README.md` (post-rename path)
- `packages/extension-example/README.md` (post-rename path)
- `packages/shell/README.md`
- `docs/roadmap.md`
- `docs/out-of-scope.md`

Root `README.md` is a vestigial Vite/Svelte template README with no plugin/extension references — explicitly **not** touched.

### Historical-record docs — pointer-note only

Files recording what was decided / specified / planned at a point in time. Body text is **not** modified. Filenames are **not** modified. Each gains a single line in italicized form, placed immediately after the H1 title and before the existing first content (typically the **Status:** line for ADRs/specs):

> _Note: The term "plugin" was renamed to "extension" in [ADR-0004](../decisions/ADR-0004-rename-plugin-to-extension.md). This document records the original terminology._

(Use the relative path matching the file's own location: from `docs/decisions/` it is `ADR-0004-rename-plugin-to-extension.md`; from `docs/specs/` or `docs/plans/` it is `../decisions/ADR-0004-rename-plugin-to-extension.md`.)

Pointer-note recipients:

- `docs/decisions/ADR-0001-monorepo-plugin-boundary.md`
- `docs/decisions/ADR-0002-imperative-activate-api.md`
- `docs/decisions/ADR-0003-plugin-api-refinements.md`
- Every file under `docs/specs/` extant at the time of this iteration (a1, a2, a3, b1, b2a status-bar / commands / keybindings / deactivate-orchestration / reactive-plumbing / roadmap)
- Every file under `docs/plans/` extant at the time of this iteration (matching the spec set)

### New ADR

`docs/decisions/ADR-0004-rename-plugin-to-extension.md` is added. Target length ~150 words. Sections (terse): **Status** (Accepted, 2026-04-27); **Context** (one paragraph: VS Code is the reference; we used "plugin" until now; ADR-0003 framed identity-on-interface as "manifest space"); **Decision** ("plugin" → "extension" across types, packages, living docs; historical decision/spec/plan docs receive a pointer note only); **Consequences** (rename is mechanical — no behavior change; we adopt VS Code's vocabulary for our adjacent-shaped concept, not VS Code's runtime model — that divergence is from ADR-0002 and persists); **Follow-ups** (B2b is born under new naming; future ADRs use the new vocabulary; manifest deferral and Phase C namespacing triggers unchanged).

## Files modified / added / renamed

| Path | Change |
| ---- | ------ |
| `docs/decisions/ADR-0004-rename-plugin-to-extension.md` | **Added.** New ADR. |
| `docs/decisions/ADR-0001-monorepo-plugin-boundary.md`, `ADR-0002-imperative-activate-api.md`, `ADR-0003-plugin-api-refinements.md` | Pointer-note added after H1; body unchanged. |
| All shipped specs under `docs/specs/` (date-prefixed `2026-04-26-*` and `2026-04-27-*`, **excluding** this rename spec itself) | Pointer-note added after H1; body unchanged. |
| All shipped plans under `docs/plans/` (date-prefixed `2026-04-26-*` and `2026-04-27-*`, **excluding** the rename plan added by the writing-plans phase) | Pointer-note added after H1; body unchanged. |
| `docs/specs/2026-04-27-rename-plugin-to-extension.md` | **Added.** This spec. (No pointer-note: this spec is the rename spec, not a historical record predating it.) |
| `docs/plans/2026-04-27-rename-plugin-to-extension.md` | **Added** by the writing-plans phase that follows this spec. (No pointer-note, same reason.) |
| `CLAUDE.md`, `docs/roadmap.md`, `docs/out-of-scope.md` | Rewritten in place. (Root `README.md` is untouched — see Doc strategy.) |
| `packages/extension-api/` | **Renamed** from `packages/plugin-api/` via `git mv`. Internals: `package.json` (`name`), `README.md`, `src/index.ts` (type renames, JSDoc), tests. |
| `packages/extension-example/` | **Renamed** from `packages/plugin-example/` via `git mv`. Internals: `package.json` (`name`, deps), `README.md`, `src/index.ts` (`examplePlugin` → `exampleExtension`, type imports), tests. |
| `packages/shell/src/extension-host/` | **Renamed** from `packages/shell/src/plugin-host/` via `git mv`. `registry.ts` and `registry.test.ts` keep filenames; rename the `Map` variable, error strings, JSDoc, type imports inside. |
| `packages/shell/src/main.ts` | Update import paths (`@gcscode/plugin-example` → `@gcscode/extension-example`; `./plugin-host/registry` → `./extension-host/registry`; `examplePlugin` → `exampleExtension`). |
| `packages/shell/src/app.svelte`, `packages/shell/src/app.test.ts`, `packages/shell/src/keybinding-dispatcher.ts`, `packages/shell/src/keybinding-dispatcher.test.ts`, `packages/shell/package.json`, `packages/shell/svelte.config.js`, `packages/shell/vite.config.ts` | Any "plugin" references updated (mostly in comments, JSDoc, import paths, deps). |
| Root `package.json`, `tsconfig.json`, `tsconfig.base.json`, `eslint.config.ts` | "Plugin" → "extension" wherever referenced (ESLint glob and message in particular). |
| `pnpm-lock.yaml` | Regenerated via `pnpm install`. |

## `docs/out-of-scope.md` propagation

Pure terminology pass — no entries added, removed, or restructured. Every "plugin" → "extension" inside the file. Notable cases (non-exhaustive):

- Section heading **"Plugin machinery"** → **"Extension machinery"**.
- Bullet "Declarative `contributes` manifest." — body text "the host can read without executing `activate()`" stays; "the TypeScript `Plugin` interface plus imperative `register*` calls" → "the TypeScript `Extension` interface plus imperative `register*` calls"; "first untrusted plugin module" → "first untrusted extension module".
- Bullet "Activation events / lazy activation." — "Plugins activate once at bootstrap" → "Extensions activate once at bootstrap"; "~50+ plugins" → "~50+ extensions".
- Bullet "Capability / permission declarations." — "first untrusted plugin module" → "first untrusted extension module"; "`PluginHost`" → "`ExtensionHost`".
- Bullet "`Plugin.deactivate?()` hook" — "`Plugin.deactivate?()`" → "`Extension.deactivate?()`"; "first plugin needing it" → "first extension needing it"; "SITL listener plugin" → "SITL listener extension"; "`@gcscode/plugin-example`" → "`@gcscode/extension-example`"; "Plugin enable/disable runtime state" → "Extension enable/disable runtime state".
- Bullet "Hot module reload for plugins." → "Hot module reload for extensions." Body: "Changing a plugin requires a full page refresh" → "Changing an extension requires a full page refresh".
- Bullet "`registry.deactivateAll()` / bulk teardown." — "single-plugin only" → "single-extension only"; "tear down every active plugin" → "tear down every active extension"; "across plugins" → "across extensions".
- Bullet "Additional contribution kinds beyond views, status bar items, commands, and keybindings." — "`PluginHost`" → "`ExtensionHost`".
- Bullet "Event bus, settings, themes, i18n." — "Plugins have five verbs" → "Extensions have five verbs".
- Bullet "Third-party sandboxing." — "All plugins currently execute" → "All extensions currently execute"; "Safe because all plugins are first-party + in-tree" → "Safe because all extensions are first-party + in-tree".
- Bullet "Dynamic / runtime plugin loading." → "Dynamic / runtime extension loading." — "Plugins are imported by package name" → "Extensions are imported by package name"; "plugin marketplaces" → "extension marketplaces".
- Bullet "User-overridable keybindings." — "Plugin-registered keybindings" → "Extension-registered keybindings"; "plugin keybinding conflicts" → "extension keybinding conflicts".
- Bullet "Cross-platform key aliasing" — "first Mac user reports a plugin keybinding" → "first Mac user reports an extension keybinding".
- Footer "Why this list exists" — no plugin references; no change.

The trigger conditions, reasoning, and structure are preserved. This is a vocabulary update, not a content update.

## `docs/roadmap.md` propagation

Pure terminology pass on body text. The phase plan retains its A / B / C structure and individual entries.

- Top-of-file prose: "the gcscode plugin architecture" → "the gcscode extension architecture"; "The plugin architecture grows in phases" → "The extension architecture grows in phases". The phrase "plugin architecture" is treated as a vocabulary term, not a frozen architectural-pattern phrase — full consistency is the cleaner answer here, and matches VS Code's "extension architecture" framing.
- Heading "Phase A — Contribution kinds", "Phase B — Lifecycle and cleanup", "Phase C — Cross-cutting capabilities": no change (no "plugin" references).
- B2b line: **"Plugin enable/disable"** → **"Extension enable/disable"**. Trigger text: "a 'disable plugin' UI" → "a 'disable extension' UI".
- B3 line: **"Dev-time hot module reload"** body — "re-imports a plugin module" → "re-imports an extension module"; "plugin-author iteration friction" → "extension-author iteration friction".
- `Plugin.deactivate?()` hook line: **"`Plugin.deactivate?()` hook"** → **"`Extension.deactivate?()` hook"**; "optional plugin-side hook" → "optional extension-side hook"; "first plugin needing it" → "first extension needing it"; "SITL listener" reference unchanged.
- Phase C line: "ADR-0003 sketches host namespacing" stays; "5–7 methods, plus events, settings, themes, and i18n as real consumers pull on them" stays. "Re-scope when a feature plugin pulls on it" → "Re-scope when a feature extension pulls on it".
- Feature plugins section: heading **"Feature plugins"** → **"Feature extensions"**. Subheadings "Coming (committed — will ship)", "Considering (not yet committed)" unchanged. Body text: "first-party plugins" → "first-party extensions"; "future consumer of the plugin architecture" → "future consumer of the extension architecture"; "first consumer of `Plugin.deactivate?()` hook" → "first consumer of `Extension.deactivate?()` hook"; "Phase C streaming/connection service" stays. "Phase C streaming-source consumer alongside SITL" stays.
- Maintenance section: "alongside other per-iteration docs propagation" stays. Bullet "User mentions a feature idea offhand during planning chat" → no change (no "plugin" reference).

## Verification

- `pnpm install` from a clean state: lockfile resolves, both renamed packages link correctly, `node_modules` symlinks under `packages/*/node_modules/@gcscode/` reflect the new names.
- `pnpm check`: svelte-check + tsc clean across `@gcscode/extension-api`, `@gcscode/extension-example`, `@gcscode/shell`.
- `pnpm test`: every existing test passes. The renames touch test bodies (imports, `examplePlugin` → `exampleExtension`, error-substring assertions if any) but no test logic changes. No new tests are needed because no behavior changes.
- `pnpm lint`: ESLint + Prettier clean. The boundary rule still rejects shell imports from extension packages (verified by attempting an offending import in an ad-hoc check, then reverting).
- `pnpm dev`: app boots; the example extension mounts. The view renders, the status bar item renders on the right, the registered command logs `'Hello from gcscode.example'`, and `Alt+Shift+G` fires the keybinding.

## Follow-ups (out of scope for this iteration)

- **B2b — Extension enable/disable.** The roadmap line is born under new naming. Spec authoring follows once the trigger lands.
- **`Extension.deactivate?()` hook.** Deferred per `out-of-scope.md`. Trigger unchanged (named on-deck consumer: SITL listener extension).
- **Manifest / `contributes`.** Deferred per `out-of-scope.md`. Trigger unchanged (settings UI / marketplace preview / first untrusted extension module).
- **Phase C host namespacing.** Trigger unchanged (~5–7 flat methods on `ExtensionHost`).

## Cross-cutting notes

**The rename is mechanical, but its blast radius is wide.** Every package, every doc, the lockfile, and the ESLint config are touched. The implementation plan should split the work into small focused commits (pointer-notes, mechanical code rename, living-doc rewrites) so each diff is reviewable against a single concern.

**Memory files are updated alongside.** User-side auto-memory at `~/.claude/.../memory/project_plugin_phases.md` (and any other entries containing "plugin") are renamed and their contents updated to reflect the new vocabulary. These live outside the repository and are not part of any commit; they are mentioned here because the spec's reader is the agent that will perform the rename, and drift between memory and code becomes immediately wrong post-rename.

**ADR-0003's "manifest space" framing remains accurate post-rename.** Identity metadata is still on the runtime interface (now `Extension`) until the manifest deferral lands. The trajectory toward a future shape that more closely matches VS Code's runtime model is unchanged; the rename merely names the destination.

**Git history is not retconned.** The ADR-0004 + pointer-note approach is the architectural answer to "the codebase calls them extensions but the merge log says plugins." Past commits, branch names, and merge messages are facts of project history; they record the project's actual vocabulary at those points in time.
