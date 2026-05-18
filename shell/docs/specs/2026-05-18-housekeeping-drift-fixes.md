# Housekeeping drift-fixes (post-C3 sweep)

**Slug:** housekeeping-drift-fixes
**Type:** docs-only housekeeping iteration. Sweeps four stale-text findings plus three small articulation gaps surfaced during the 2026-05-18 `/housekeeping` survey. No code, no agent files, no workflow changes.
**No bootstrap exceptions.** Spec ships via spec-PR workflow; implementation lands per the post-merge implementation convention (single mechanical docs commit on master).

## Context

The last housekeeping pass landed 2026-05-01 / 2026-05-02 (`docs/specs/2026-05-01-vs-code-alignment-ledger.md` + `docs/specs/2026-05-01-extensionhost-namespacing.md`). Since then ~8 feature iterations and ~12 agentic-team-architecture iterations have shipped. The 2026-05-18 `/housekeeping` survey surfaced:

- Stale counts in three places (CLAUDE.md, the extension-api README, `out-of-scope.md`) that claim "four namespaces" or "four `register*` methods" — the configuration namespace landed 2026-05-18 in C3 making the actual count five.
- A stale "three packages" line at the top of CLAUDE.md (`CLAUDE.md` lines 9-13) — the workspace now contains nine packages.
- The `host.commands.* / host.window.* / host.keybindings.* / host.extensions.*` namespace enumeration in CLAUDE.md's "Boundary rule — load bearing" corollary omits `host.configuration.*`.
- The dockview-svelte experiment (per `docs/specs/2026-05-13-shell-dockview-host.md`) shipped 5 days ago and is in production in `packages/shell/src/app.svelte`, but has zero presence in `roadmap.md`, `out-of-scope.md`, or `vs-code-alignment.md`. The user has explicitly flagged dockview as experimental and possibly transient — full alignment-ledger treatment would over-commit. A one-line acknowledgment on the roadmap is the right size.
- `docs/dockview-svelte-manual-checklist.md` sits at the docs root with no index entry, currently orphaned.
- The roadmap "Settings editor UI" Considering row doesn't note that one of the two trigger halves is already satisfied (the substrate landed in C3); the second half ("second real setting consumer") hasn't fired yet — there's only one registered setting today (`gcscode.sitl.connectionUrl`).
- CLAUDE.md never explicitly says "the plan step is optional when the spec is purely-mechanical docs edits." The practice is established (the 2026-04-27-roadmap precedent; most agentic-team-architecture iterations skip plans), but a new agent reading CLAUDE.md's "Subagent-driven plan execution" subsection would assume plans are universal.

## Why not the bigger version

The bigger versions considered (and YAGNI'd):

- **Add 2-3 dockview rows to `docs/vs-code-alignment.md`** (alignment: tabbed dockview hosts views; divergence: no named view regions like VS Code's sidebar/panel/secondary-sidebar; deferral: layout persistence). **Smaller wedge:** one roadmap line linking the spec, flagged experimental. **YAGNI:** the dockview iteration is explicitly an experiment that may be ripped out before the operator-UX direction settles; locking its non-goals into the cumulative alignment ledger would either lie if removed, or accrete maintenance burden if iterated on. The roadmap is the right home — it's the "where are we now / what's next" view; experiments belong there, not in the cumulative cross-iteration ledger.
- **Propagate the dockview spec's non-goals to `docs/out-of-scope.md`** (no layout persistence, no view-container concept, no popout panels). Same reasoning: experimental scope cuts shouldn't become canonical deferrals until the experiment graduates.
- **Add "user-overridable keybindings" to the roadmap Considering section** (finding #6 from the survey). The `docs/out-of-scope.md` row already received the 2026-05-18 status note when C3 shipped ("the second half of the trigger has fired"). The roadmap is not the right home for half-fired triggers — out-of-scope already tracks them.
- **Pull anything from `docs/brainfarts.md`.** Per CLAUDE.md, agents must not treat brainfarts content as requirements or design input. Out of scope.
- **Move `docs/dockview-svelte-manual-checklist.md`** to a `docs/manual-tests/` folder or co-locate near the spec. **Smaller wedge:** leave the file in place; add a link from the roadmap Experiments bullet so it stops being orphaned. **YAGNI:** moving the file requires updating any external bookmarks (the spec, any agent's working notes) and the file's location is fine for a single-experiment checklist.
- **Audit ALL `register*` count claims and namespace counts across all docs.** **Smaller wedge:** fix the three known stale-count locations surfaced by the survey. **YAGNI:** if additional stale-count locations exist they'll surface in the next housekeeping pass; sweeping every doc now is over-spend for a low-leverage class of edit.

This iteration ships seven targeted edits across four files. Each edit is one paragraph or less. Total docs delta is small.

## Goals

1. CLAUDE.md "Layout" section (lines 9-13): replace the stale "three packages" enumeration with an auto-current paragraph that names the three load-bearing roles (shell, extension-api, extension packages) and points to `packages/` for the current set.
2. CLAUDE.md "Boundary rule — load bearing" Corollary (line 25): add `host.configuration.*` to the namespace enumeration.
3. CLAUDE.md "Subagent-driven plan execution" subsection: add one sentence noting the plan step is optional for docs-only iterations whose edits are fully specified by the spec.
4. `packages/extension-api/README.md` "The activation context" section (lines 72-77): update "four topic namespaces" to "five", add the `host.configuration` bullet to the high-level list, update the trailing "four namespaces" reference to "five".
5. `docs/out-of-scope.md` "Additional contribution kinds" row (line 16): update the parenthetical count from "four `register*` methods" to "five", add `registerConfiguration` to the parenthetical list. The row's bold heading ("Additional contribution kinds beyond views, status bar items, commands, and keybindings") stays — configuration is a cross-cutting capability, not a contribution kind, so the heading's framing remains accurate.
6. `docs/roadmap.md`: add a new tiny "Experiments" subsection at the end (before Maintenance) with a single bullet acknowledging the dockview-svelte iteration as an explicit experiment, linking the spec and the manual-test checklist, and flagging "may be removed — not committed UX direction."
7. `docs/roadmap.md` "Settings editor UI" Considering row: add a parenthetical noting "(substrate landed 2026-05-18 in C3; second-consumer half not yet fired — only one setting registered today.)"

## Non-goals (this iteration)

- **`docs/vs-code-alignment.md` updates for dockview.** Experiments don't get alignment-ledger rows until they graduate. Trigger to revisit: dockview survives the operator-UX decision and ships as a load-bearing UI choice.
- **`docs/out-of-scope.md` propagation of dockview spec non-goals** (no layout persistence, no view-container concept, no popout panels). Same trigger as above.
- **Moving `docs/dockview-svelte-manual-checklist.md`.** Stays in place; the roadmap Experiments bullet links it.
- **Roadmap entry for the user-overridable-keybindings half-trigger.** Out-of-scope.md already tracks the 2026-05-18 status note; not roadmap territory.
- **Pulling brainfarts items into the roadmap.** Per CLAUDE.md, agents must not act on brainfarts content; user-initiated only.
- **Sweeping all docs for additional stale counts beyond the three locations surfaced by the survey.** If more drift exists it surfaces in the next housekeeping pass.
- **Updating the CLAUDE.md package-list paragraph to enumerate the nine packages.** The auto-current paragraph is the deliberate choice (per the user's answer in brainstorming); enumeration would re-introduce the drift class this iteration is closing.
- **Code changes of any kind.** Docs-only iteration.

## Architecture

### Edit 1 — CLAUDE.md "Layout" (lines 9-13)

Replace:

```markdown
## Layout

pnpm workspace with three packages:

- `@gcscode/shell` — the app. Owns bootstrapping and the extension registry.
- `@gcscode/extension-api` — the **only** import path for extensions. Types and contracts.
- `@gcscode/extension-example` — the first extension. Canonical worked example.

Package root is the repo root. Shared tooling at the root: ESLint flat config, Prettier, and `tsconfig.base.json`. Each package extends these. `svelte.config.js` and `vite.config.ts` live in `packages/shell/` (Vite looks for them at its config's directory).
```

With:

```markdown
## Layout

pnpm workspace organized into three roles: `@gcscode/shell` (the app — owns bootstrapping and the extension registry), `@gcscode/extension-api` (the **only** import path for extensions — types and contracts), and a set of extension packages (the canonical `@gcscode/extension-example` plus each first-party extension). See `packages/` for the current set.

Package root is the repo root. Shared tooling at the root: ESLint flat config, Prettier, and `tsconfig.base.json`. Each package extends these. `svelte.config.js` and `vite.config.ts` live in `packages/shell/` (Vite looks for them at its config's directory).
```

### Edit 2 — CLAUDE.md "Boundary rule" Corollary (line 25)

Replace:

```markdown
Corollary: if an extension needs a capability the host doesn't yet expose, add it to `@gcscode/extension-api` first (as a new method under one of the existing `ExtensionHost` namespaces — `host.commands.*`, `host.window.*`, `host.keybindings.*`, `host.extensions.*` — or as a new namespace if the capability is cross-cutting; or a new field on `ExtensionContext`), land that, then use it. Never reach around the API.
```

With:

```markdown
Corollary: if an extension needs a capability the host doesn't yet expose, add it to `@gcscode/extension-api` first (as a new method under one of the existing `ExtensionHost` namespaces — `host.commands.*`, `host.window.*`, `host.keybindings.*`, `host.extensions.*`, `host.configuration.*` — or as a new namespace if the capability is cross-cutting; or a new field on `ExtensionContext`), land that, then use it. Never reach around the API.
```

### Edit 3 — CLAUDE.md "Subagent-driven plan execution" subsection

Add a new fourth paragraph immediately after the existing third paragraph ("Specs and ADRs now ship via their own PRs ... Plans continue to land on master directly.") and immediately before the `### Subagent worktree discipline` heading. The new paragraph:

```markdown
For docs-only iterations whose edits are fully specified by the spec (the 2026-04-27-roadmap precedent, most agentic-team-architecture iterations), the plan step is optional — the spec itself serves as the implementation guide and the post-merge mechanical commit lands directly on master per the existing post-merge convention.
```

### Edit 4 — `packages/extension-api/README.md` "The activation context" section (lines 72-77)

Replace:

```markdown
- **`context.host`** — the per-extension gate. Methods are organized into four topic namespaces:
  - **`host.commands`** — `registerCommand(command): Disposable` registers a command; `executeCommand<T>(id, ...args): Promise<T>` fires any registered command by id (cross-extension execute is intentional). The `run` callback on a command is variadic (`(...args: unknown[]) => unknown`); arguments threaded through `executeCommand(id, ...args)` arrive there. The shell's keyboard dispatcher fires keybindings by calling `executeCommand` from the host side directly (it isn't an extension), via the same shared implementation.
  - **`host.window`** — `registerView(view): Disposable` and `registerStatusBarItem(item): Disposable` register UI contributions.
  - **`host.keybindings`** — `registerKeybinding(keybinding): Disposable` maps a key combo to a command id.
  - **`host.extensions`** — `getExtension<T>(id): { id; exports: T } | undefined` looks up another extension's published exports.
    Each `register*` call returns a `Disposable`. The host exposes no verbs at the top level — every method lives under one of the four namespaces. See ADR-0006.
```

With:

```markdown
- **`context.host`** — the per-extension gate. Methods are organized into five topic namespaces:
  - **`host.commands`** — `registerCommand(command): Disposable` registers a command; `executeCommand<T>(id, ...args): Promise<T>` fires any registered command by id (cross-extension execute is intentional). The `run` callback on a command is variadic (`(...args: unknown[]) => unknown`); arguments threaded through `executeCommand(id, ...args)` arrive there. The shell's keyboard dispatcher fires keybindings by calling `executeCommand` from the host side directly (it isn't an extension), via the same shared implementation.
  - **`host.window`** — `registerView(view): Disposable` and `registerStatusBarItem(item): Disposable` register UI contributions.
  - **`host.keybindings`** — `registerKeybinding(keybinding): Disposable` maps a key combo to a command id.
  - **`host.extensions`** — `getExtension<T>(id): { id; exports: T } | undefined` looks up another extension's published exports.
  - **`host.configuration`** — `registerConfiguration(contribution): Disposable` registers a setting's schema and default; `getConfiguration(section?): WorkspaceConfiguration` returns a section-scoped reader/writer; `onDidChangeConfiguration(listener): Disposable` subscribes to setting changes. See the "Configuration (`host.configuration`)" section below for the full usage.
    Each `register*` call returns a `Disposable`. The host exposes no verbs at the top level — every method lives under one of the five namespaces. See ADR-0006.
```

(The `host.window` bullet's `showQuickPick` omission from the high-level list is NOT fixed by this iteration — it's a separate articulation gap, not a stale-text drift. Surface in the next housekeeping pass.)

### Edit 5 — `docs/out-of-scope.md` "Additional contribution kinds" row (line 16)

Replace:

```markdown
- **Additional contribution kinds beyond views, status bar items, commands, and keybindings.** Today: four `register*` methods on `ExtensionHost` (`registerView`, `registerStatusBarItem`, `registerCommand`, `registerKeybinding`) plus the verb `executeCommand`. Add another (e.g. `registerMenuItem`, `registerPaletteEntry`) when there is a real consumer; do not pre-declare surfaces that have no contributor.
```

With:

```markdown
- **Additional contribution kinds beyond views, status bar items, commands, and keybindings.** Today: five `register*` methods on `ExtensionHost` (`registerView`, `registerStatusBarItem`, `registerCommand`, `registerKeybinding`, `registerConfiguration`) plus the verb `executeCommand`. Add another contribution kind (e.g. `registerMenuItem`, `registerPaletteEntry`) when there is a real consumer; do not pre-declare surfaces that have no contributor. Note: `registerConfiguration` is a cross-cutting capability rather than a contribution kind in the UI-surface sense; the bold heading's framing intentionally enumerates UI-surface kinds only. The full verb list lives in the row below ("Event bus, themes, i18n").
```

### Edit 6 — `docs/roadmap.md` Experiments subsection (new, before Maintenance)

Insert immediately before the existing `## Maintenance` heading:

```markdown
## Experiments

These are iterations explicitly framed as experiments — landed in the codebase but not yet committed as the going-forward direction. Tracked here so a reader of the roadmap is not surprised to find them in production; flagged so a reader of the codebase is not surprised to find them missing tomorrow.

- **Dockview-svelte shell content host** — `packages/shell/src/app.svelte` hosts registered views in a tabbed `DockviewSvelte` instance instead of stacking them as siblings. Spec: [`specs/2026-05-13-shell-dockview-host.md`](specs/2026-05-13-shell-dockview-host.md). Manual-test checklist: [`dockview-svelte-manual-checklist.md`](dockview-svelte-manual-checklist.md). **May be removed — not committed UX direction.** The eventual operator-UX iteration that this experiment may inform is the trigger for either graduating dockview (alignment-ledger rows, out-of-scope.md non-goals) or removing it.
```

### Edit 7 — `docs/roadmap.md` "Settings editor UI" Considering row

Replace (in the `### Considering (not yet committed)` subsection of `## Feature extensions`):

```markdown
- [ ] **Settings editor UI** — overlay (likely mirroring the extensions panel shape), search across keys + descriptions, type-aware widgets (text input, checkbox, number, enum dropdown), reset-to-default, JSON view as escape hatch. Trigger: operator UX feedback (specifically: a silent-schema-rejection failure causes confusion) OR a second real setting consumer landing. Substrate: [`specs/2026-05-18-configuration-system-v1.md`](specs/2026-05-18-configuration-system-v1.md).
```

With:

```markdown
- [ ] **Settings editor UI** — overlay (likely mirroring the extensions panel shape), search across keys + descriptions, type-aware widgets (text input, checkbox, number, enum dropdown), reset-to-default, JSON view as escape hatch. Trigger: operator UX feedback (specifically: a silent-schema-rejection failure causes confusion) OR a second real setting consumer landing. Substrate landed 2026-05-18 in C3 (the substrate-half of the trigger is satisfied); second-consumer half not yet fired — `gcscode.sitl.connectionUrl` is the only setting registered today. Substrate: [`specs/2026-05-18-configuration-system-v1.md`](specs/2026-05-18-configuration-system-v1.md).
```

## Validation

- After post-merge implementation lands, `grep -i "three packages"` on CLAUDE.md returns no matches.
- After post-merge implementation lands, `grep -E "four (topic )?namespaces"` on CLAUDE.md and `packages/extension-api/README.md` returns no matches.
- After post-merge implementation lands, `grep -E "four \`register\*\`"` on `docs/out-of-scope.md` returns no matches.
- After post-merge implementation lands, `docs/roadmap.md` contains a `## Experiments` heading and the dockview bullet links both the spec and the manual-test checklist.
- After post-merge implementation lands, `docs/roadmap.md` "Settings editor UI" Considering row contains the parenthetical noting the half-trigger state.
- After post-merge implementation lands, CLAUDE.md "Subagent-driven plan execution" subsection contains the new sentence about plans being optional for docs-only iterations.

No automated test coverage; this is a docs iteration. Manual `grep` is the verification mechanism per the pattern from `2026-05-17-tripwire-condition-iii-compliance.md` Validation.

## VS Code alignment

No changes to alignments, divergences, or deferrals. This iteration is internal docs hygiene; it does not introduce, remove, or modify any API surface or convention that aligns with or diverges from VS Code.

## `docs/out-of-scope.md` propagation

Edit 5 (in this spec) IS the `out-of-scope.md` propagation. No additional propagation beyond what's in the Architecture section.

## `docs/roadmap.md` propagation

Edits 6 and 7 (in this spec) ARE the `roadmap.md` propagation. No additional propagation beyond what's in the Architecture section.

## Known unknowns

- **Does the auto-current paragraph in CLAUDE.md Edit 1 lose load-bearing information that the enumeration was carrying?** The original three-package list named `@gcscode/extension-example` specifically as "the first extension. Canonical worked example." That status (canonical worked example) is recoverable from `packages/extension-example/README.md` and the iteration history; the auto-current paragraph names it as "the canonical `@gcscode/extension-example`" to preserve the load-bearing pointer. If a new agent finds the auto-current paragraph leaves them confused about where to start ("which package is the canonical worked example?"), the next housekeeping pass can add a one-sentence pointer. Risk is low.
- **Will the dockview Experiments bullet in roadmap need maintenance as the experiment evolves?** Yes — if dockview is removed, the bullet is removed; if it graduates, the bullet is replaced by full alignment-ledger / out-of-scope.md / roadmap-feature-extensions treatment. The bullet is intentionally cheap to remove or replace; its existence is the documentation-debt buffer that prevents the codebase from surprising future readers.
- **Could the "plans optional for docs-only" sentence in CLAUDE.md Edit 3 invite agents to skip plans inappropriately?** The sentence is qualified ("whose edits are fully specified by the spec") and references the 2026-04-27-roadmap precedent. If a future iteration's spec is NOT fully mechanical and an agent skips the plan citing this convention, the failure mode is recoverable mid-iteration (re-invoke `superpowers:writing-plans` once the gap is observed). Low risk.

## Tripwires for known-quality concerns

This iteration is docs-only convention/drift maintenance; it does not introduce a new reviewer role or capability whose failure modes need tripwire detection. No new tripwires are added.

The "across N PRs" guard from CLAUDE.md condition (iii) — the per-iteration housekeeping pattern itself is the indirect tripwire for drift accumulation. If the next housekeeping pass surfaces similar count/list drift in three or more places, the trigger to revisit is to consider auto-current phrasing as the default convention (this iteration applies it to one place; if drift recurs, generalize).

## Future iterations

- **Dockview operator-UX iteration** — when triggered, decides whether dockview graduates (alignment-ledger rows, out-of-scope.md non-goals, feature-extensions roadmap entry) or is removed. Until then, the Experiments bullet is the only doc-level acknowledgment.
- **Settings editor UI** — when the second-consumer half-trigger fires (per the parenthetical added by Edit 7) or operator-UX feedback surfaces, brainstorm the editor.
- **Next periodic housekeeping pass** — per CLAUDE.md, after 2-3 feature iterations have shipped. The natural next surfacings are likely the dockview operator-UX decision and any drift accumulated during further C-phase iterations.

## Origin

Surfaced during the 2026-05-18 `/housekeeping` pass. Survey identified seven discrete findings ordered by leverage; the user picked cut A' (drift fixes + one-line dockview mention; explicitly NOT vs-code-alignment rows for dockview, NOT out-of-scope propagation of dockview non-goals). The user's "experimental, might remove dockview" guidance shaped the dockview treatment.

## Post-merge implementation

Single mechanical commit on master per the post-merge implementation convention ("purely mechanical CLAUDE.md or docs edits whose exact text is fully specified in the spec"). Commit message:

```
docs: housekeeping drift-fixes (post-C3 sweep)

Per docs/specs/2026-05-18-housekeeping-drift-fixes.md.

- CLAUDE.md: auto-current package paragraph (was "three packages")
- CLAUDE.md: add host.configuration.* to namespace corollary
- CLAUDE.md: note plan step optional for docs-only iterations
- extension-api/README.md: "four namespaces" -> "five" + add host.configuration bullet (and showQuickPick on host.window)
- out-of-scope.md: "four register*" -> "five" + registerConfiguration in parenthetical
- roadmap.md: new Experiments subsection with dockview bullet
- roadmap.md: Settings editor UI half-trigger annotation
```

If during implementation any of the seven edits surfaces judgment-requiring nuance (the edit's exact text in the spec does not match the actual file's content because the file shifted between spec-writing and post-merge implementation, or the spec missed a load-bearing surrounding sentence), STOP the master-direct commit and open a `feat/housekeeping-drift-fixes` branch instead, per the CLAUDE.md guardrail.
