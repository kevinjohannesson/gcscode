# Housekeeping drift-fixes (post-C3 sweep)

**Slug:** housekeeping-drift-fixes
**Type:** docs-only housekeeping iteration. Sweeps three stale-text findings plus three small articulation gaps plus one absolute-path leak surfaced during the 2026-05-18 `/housekeeping` survey and the initial-round red-team review. No code, no agent files, no workflow changes.
**No bootstrap exceptions.** Spec ships via spec-PR workflow; implementation lands per the post-merge implementation convention (single mechanical docs commit on master).

## Context

The last housekeeping pass landed 2026-05-01 / 2026-05-02 (`docs/specs/2026-05-01-vs-code-alignment-ledger.md` + `docs/specs/2026-05-01-extensionhost-namespacing.md`). Since then ~8 feature iterations and ~12 agentic-team-architecture iterations have shipped. The 2026-05-18 `/housekeeping` survey surfaced:

- Stale "four namespaces" counts in two places (CLAUDE.md's "Boundary rule" Corollary; `packages/extension-api/README.md` "The activation context" section) — the configuration namespace landed 2026-05-18 in C3 making the actual count five.
- A stale "three packages" line at the top of CLAUDE.md (`CLAUDE.md` lines 9-13) — the workspace now contains nine packages.
- The dockview-svelte experiment (per `docs/specs/2026-05-13-shell-dockview-host.md`) shipped 5 days ago and is in production in `packages/shell/src/app.svelte`, but has zero presence in `roadmap.md`, `out-of-scope.md`, or `vs-code-alignment.md`. The user has explicitly flagged dockview as experimental and possibly transient — full alignment-ledger treatment would over-commit. A one-line acknowledgment on the roadmap is the right size.
- `docs/dockview-svelte-manual-checklist.md` sits at the docs root with no index entry, currently orphaned.
- The roadmap "Settings editor UI" Considering row doesn't note that one of the two trigger halves is already satisfied (the substrate landed in C3); the second half ("second real setting consumer") hasn't fired yet — there's only one registered setting today (`gcscode.sitl.connectionUrl`).
- CLAUDE.md's "Subagent-driven plan execution" subsection doesn't say "the plan step is optional when the spec is purely-mechanical docs edits," even though CLAUDE.md "Branching and merging > Post-merge implementation conventions" (line 44) already addresses the case. A new agent reading only the Subagent-driven plan execution subsection would assume plans are universal; a cross-reference closes the gap.

The initial-round red-team review (PR #27) surfaced one additional drift not flagged in the survey:

- `docs/dockview-svelte-manual-checklist.md` line 10 contains an absolute filesystem path (`/Users/<...>/gcscode/.worktrees/dockview-svelte/shell`). The file is currently orphaned so the leak is hidden; Edit 6's roadmap link makes it discoverable. Fixing the leaked path in the same iteration that surfaces the file's existence is the right scope — leaving a known leak in a freshly-linked public file fights the iteration's hygiene framing.

**Stale-text finding deliberately NOT addressed** (corrected after initial-round review):

- `docs/out-of-scope.md` line 16 ("Additional contribution kinds beyond views, status bar items, commands, and keybindings ... four `register*` methods") was initially flagged in the survey as a stale count. Red-team Opus's drift analysis (PR #27 initial review) established that the row's bold heading enumerates UI-surface contribution kinds (views, status bar items, commands, keybindings — still four) and that `registerConfiguration` is a cross-cutting capability rather than a UI-surface contribution kind. The full nine-verb roster including `host.configuration.*` is already current at line 18 (the "Event bus, themes, i18n" row, updated by C3's post-merge propagation commit `796b50c`). Line 16's count is correct as-is under its bold-heading framing; no edit needed.

## Why not the bigger version

The bigger versions considered (and YAGNI'd):

- **Add 2-3 dockview rows to `docs/vs-code-alignment.md`** (alignment: tabbed dockview hosts views; divergence: no named view regions like VS Code's sidebar/panel/secondary-sidebar; deferral: layout persistence). **Smaller wedge:** one roadmap line linking the spec, flagged experimental. **YAGNI:** the dockview iteration is explicitly an experiment that may be ripped out before the operator-UX direction settles; locking its non-goals into the cumulative alignment ledger would either lie if removed, or accrete maintenance burden if iterated on. The roadmap is the right home — it's the "where are we now / what's next" view; experiments belong there, not in the cumulative cross-iteration ledger.
- **Propagate the dockview spec's non-goals to `docs/out-of-scope.md`** (no layout persistence, no view-container concept, no popout panels). Same reasoning: experimental scope cuts shouldn't become canonical deferrals until the experiment graduates.
- **Add "user-overridable keybindings" to the roadmap Considering section** (finding #6 from the survey). The `docs/out-of-scope.md` row already received the 2026-05-18 status note when C3 shipped ("the second half of the trigger has fired"). The roadmap is not the right home for half-fired triggers — out-of-scope already tracks them.
- **Pull anything from `docs/brainfarts.md`.** Per CLAUDE.md, agents must not treat brainfarts content as requirements or design input. Out of scope.
- **Move `docs/dockview-svelte-manual-checklist.md`** to a `docs/manual-tests/` folder or co-locate near the spec. **Smaller wedge:** leave the file in place; add a link from the roadmap Experiments bullet so it stops being orphaned; fix the absolute-path leak in-place. **YAGNI:** moving the file requires updating any external bookmarks (the spec, any agent's working notes) and the file's location is fine for a single-experiment checklist.
- **Audit ALL `register*` count claims and namespace counts across all docs.** **Smaller wedge:** fix the two known stale namespace-count locations surfaced by the survey. **YAGNI:** if additional stale-count locations exist they'll surface in the next housekeeping pass; sweeping every doc now is over-spend for a low-leverage class of edit.
- **Add a stale-text edit to `docs/out-of-scope.md` line 16** (the "Additional contribution kinds" row's "four `register*` methods" count). **Smaller wedge:** no edit — the row's bold-heading framing makes the count of four UI-surface contribution kinds correct as-is; the full nine-verb roster including `host.configuration.*` lives in the immediately-adjacent line 18 row, already updated by C3. **YAGNI/wrong-categorically:** adding `registerConfiguration` to a row that enumerates UI-surface kinds dilutes the row's framing and duplicates information already correctly placed at line 18.
- **Fix the duplicate-Opus-review identity issue surfaced on PR #27** (the Opus red-team subagent posted once under user identity, once under `gcscode-red-team[bot]`). **Smaller wedge:** note as a future-iterations item for reviewer-bot infrastructure. **YAGNI for this iteration:** it's reviewer-infrastructure tooling, not docs hygiene; tracking is appropriate, fixing is a separate iteration.

This iteration ships seven targeted edits across four files. Each edit is small. The validation step uses single-quoted greps (per red-team's shell-substitution fix) over each edit's observable outcome.

## Goals

1. CLAUDE.md "Layout" section (lines 9-13): replace the stale "three packages" enumeration with an auto-current paragraph that names the three load-bearing roles (shell, extension-api, extension packages) and points to `packages/` for the current set, while preserving the "first extension / canonical worked example" framing for `@gcscode/extension-example`.
2. CLAUDE.md "Boundary rule — load bearing" Corollary (line 25): add `host.configuration.*` to the namespace enumeration.
3. CLAUDE.md "Subagent-driven plan execution" subsection: add one short paragraph cross-referencing the existing "Post-merge implementation conventions" rule (line 44) so a reader who lands on the Subagent-driven plan execution subsection discovers the docs-only-iteration carve-out.
4. `packages/extension-api/README.md` "The activation context" section (lines 72-77): update "four topic namespaces" to "five", add the `host.configuration` bullet to the high-level list, update the trailing "four namespaces" reference to "five".
5. `docs/dockview-svelte-manual-checklist.md` line 10: replace the absolute filesystem path in the `Setup` block with a repo-relative form. Fixes the leak before Edit 6 makes the file discoverable from the roadmap.
6. `docs/roadmap.md`: add a new tiny "Experiments" subsection at the end (before Maintenance) with a single bullet acknowledging the dockview-svelte iteration as an explicit experiment, linking the spec and the manual-test checklist, and flagging "may be removed — not committed UX direction."
7. `docs/roadmap.md` "Settings editor UI" Considering row: add a parenthetical noting "(substrate landed 2026-05-18 in C3; second-consumer half not yet fired — only one setting registered today.)"

## Non-goals (this iteration)

- **`docs/vs-code-alignment.md` updates for dockview.** Experiments don't get alignment-ledger rows until they graduate. Trigger to revisit: dockview survives the operator-UX decision and ships as a load-bearing UI choice.
- **`docs/out-of-scope.md` propagation of dockview spec non-goals** (no layout persistence, no view-container concept, no popout panels). Same trigger as above.
- **`docs/out-of-scope.md` line 16 ("Additional contribution kinds") edit.** Correct as-is under its bold-heading framing (see Context). The full nine-verb roster lives at line 18 and is already current per C3's post-merge propagation.
- **Moving `docs/dockview-svelte-manual-checklist.md`.** Stays in place; the roadmap Experiments bullet links it after Edit 5 fixes the absolute-path leak.
- **Roadmap entry for the user-overridable-keybindings half-trigger.** Out-of-scope.md already tracks the 2026-05-18 status note; not roadmap territory.
- **Pulling brainfarts items into the roadmap.** Per CLAUDE.md, agents must not act on brainfarts content; user-initiated only.
- **Sweeping all docs for additional stale counts beyond the two locations surfaced by the survey.** If more drift exists it surfaces in the next housekeeping pass.
- **Updating the CLAUDE.md package-list paragraph to enumerate the nine packages.** The auto-current paragraph is the deliberate choice (per the user's answer in brainstorming); enumeration would re-introduce the drift class this iteration is closing.
- **Adding `showQuickPick` to the `host.window` bullet in `extension-api/README.md`.** Separate articulation gap, not a stale-text drift. Surface in the next housekeeping pass.
- **Investigating / fixing the duplicate-Opus-review identity issue on PR #27.** Tracked under Future iterations as a reviewer-infrastructure follow-up.
- **Auditing `docs/roadmap.md` "Considering" entries for stale items** (e.g., the ADR-0009 row which shipped per PR #15 and could be checked off). Out of scope; surface in the next housekeeping pass.
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

pnpm workspace organized into three roles: `@gcscode/shell` (the app — owns bootstrapping and the extension registry), `@gcscode/extension-api` (the **only** import path for extensions — types and contracts), and a set of extension packages. The canonical worked-example extension is `@gcscode/extension-example` (the first extension ever written; new extension authors should read it first); the rest are first-party feature extensions (`extension-sitl`, `extension-map`, `extension-flight-overlay`, `extension-vehicle-status`, and others). See `packages/` for the current set.

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

### Edit 3 — CLAUDE.md "Subagent-driven plan execution" subsection (cross-reference, not duplicate rule)

Add a new fourth paragraph immediately after the existing third paragraph ("Specs and ADRs now ship via their own PRs ... Plans continue to land on master directly.") and immediately before the `### Subagent worktree discipline` heading. The new paragraph (one sentence, cross-reference form so the rule remains canonical in one place):

```markdown
For docs-only iterations whose edits are fully specified by the spec (the 2026-04-27-roadmap precedent, most agentic-team-architecture iterations), the plan step is optional — see "Post-merge implementation conventions" in "Branching and merging" above for the canonical rule.
```

This is a discoverability fix, not a new rule. The substantive rule remains canonical at CLAUDE.md "Branching and merging > Post-merge implementation conventions" (line 44): "direct master commits for purely mechanical CLAUDE.md or docs edits whose exact text is fully specified in the spec." The cross-reference ensures a reader who lands on the Subagent-driven plan execution subsection finds the carve-out instead of assuming plans are universal.

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

### Edit 5 — `docs/dockview-svelte-manual-checklist.md` line 10 absolute-path leak

The `Setup` block currently contains an absolute filesystem path. Replace:

```markdown
## Setup

` ` `sh
cd /Users/<...>/gcscode/.worktrees/dockview-svelte/shell
pnpm --filter dockview-svelte demo
` ` `
```

(quoted-as-leak per the "leak IS the finding" carve-out from `docs/specs/2026-05-17-relative-paths-in-reviewer-output.md`; the actual file line 10 contains the unredacted absolute path)

With:

```markdown
## Setup

From the repo root (or any subdirectory):

` ` `sh
pnpm --filter dockview-svelte demo
` ` `
```

The `pnpm --filter` form resolves the package by workspace name regardless of cwd; the `cd` line was redundant. Net effect: the absolute filesystem path is gone, and the checklist still works for any reader from any cwd within the repo.

(Note: the three-backtick fences in the spec excerpt above are shown with single-spaced backticks to escape the spec's own code-block rendering; the actual edit uses standard ` ```sh ` fenced code blocks.)

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

All greps use single quotes to avoid shell-substitution surprises with backticks (per red-team Opus's fix on the initial round).

- After post-merge implementation lands, `grep -i 'three packages' CLAUDE.md` returns no matches.
- After post-merge implementation lands, `grep -E 'four (topic )?namespaces' CLAUDE.md packages/extension-api/README.md` returns no matches.
- After post-merge implementation lands, `grep -F '/Users/' docs/dockview-svelte-manual-checklist.md` returns no matches.
- After post-merge implementation lands, `docs/roadmap.md` contains a `## Experiments` heading and the dockview bullet links both the spec and the manual-test checklist (verify by `grep -n '^## Experiments' docs/roadmap.md` and inspect the surrounding lines).
- After post-merge implementation lands, `docs/roadmap.md` "Settings editor UI" Considering row contains the parenthetical noting the half-trigger state (verify by `grep -n 'Substrate landed 2026-05-18 in C3' docs/roadmap.md`).
- After post-merge implementation lands, CLAUDE.md "Subagent-driven plan execution" subsection contains the new cross-reference paragraph (verify by `grep -n 'For docs-only iterations whose edits are fully specified by the spec' CLAUDE.md`).
- After post-merge implementation lands, `grep -F 'showQuickPick' packages/extension-api/README.md` returns no matches in the high-level "Methods are organized into five topic namespaces" bullet list (confirming Edit 4's deferral of the `showQuickPick` articulation gap). The "Configuration (`host.configuration`)" section below the bullet list is unchanged; `showQuickPick` references elsewhere in the README (if any) are out of scope.

No automated test coverage; this is a docs iteration. Manual `grep` is the verification mechanism per the pattern from `2026-05-17-tripwire-condition-iii-compliance.md` Validation.

## VS Code alignment

No changes to alignments, divergences, or deferrals. One new docs-level acknowledgment: Edit 6 adds the dockview-svelte iteration to a new `docs/roadmap.md` Experiments subsection, deliberately scoped as an experiment rather than a committed direction; the corresponding alignment-ledger row lands when (and if) the experiment graduates per the Non-goals.

## `docs/out-of-scope.md` propagation

None. The initial-version's Edit 5 (an out-of-scope.md edit) was dropped after the initial-round red-team review established that line 16's count is correct as-is under its bold-heading framing.

## `docs/roadmap.md` propagation

Edits 6 and 7 (in this spec) ARE the `roadmap.md` propagation. No additional propagation beyond what's in the Architecture section.

## Known unknowns

- **Does the auto-current paragraph in CLAUDE.md Edit 1 lose load-bearing information that the original enumeration carried?** The original three-package list named `@gcscode/extension-example` specifically as "the first extension. Canonical worked example." Both facts (iteration provenance + tutorial function) are preserved verbatim in the revised paragraph ("the canonical worked-example extension is `@gcscode/extension-example` (the first extension ever written; new extension authors should read it first)"). The auto-current pointer to `packages/` is added on top. No information loss intended.
- **Will the dockview Experiments bullet in roadmap need maintenance as the experiment evolves?** Yes — if dockview is removed, the bullet is removed; if it graduates, the bullet is replaced by full alignment-ledger / out-of-scope.md / roadmap-feature-extensions treatment. The bullet is intentionally cheap to remove or replace; its existence is the documentation-debt buffer that prevents the codebase from surprising future readers.
- **Could the "plans optional for docs-only" cross-reference in CLAUDE.md Edit 3 invite agents to skip plans inappropriately?** The cross-reference points to CLAUDE.md line 44's existing canonical rule, which is qualified ("purely mechanical CLAUDE.md or docs edits whose exact text is fully specified in the spec"). If a future iteration's spec is NOT fully mechanical and an agent skips the plan citing this convention, the failure mode is recoverable mid-iteration (re-invoke `superpowers:writing-plans` once the gap is observed). Low risk.
- **Could the `pnpm --filter dockview-svelte demo` form in Edit 5 fail when the package script is invoked from outside the workspace root?** pnpm's `--filter` resolves by workspace name and walks up to find the nearest `pnpm-workspace.yaml`, so any cwd inside the repo works. If a reader runs the command from outside the repo entirely, pnpm errors with a workspace-not-found message — which is the same failure mode as the original `cd /Users/...` form (the hardcoded path would also fail on any other machine). Net behavior is no worse and the leak is closed.

## Tripwires for known-quality concerns

This iteration is docs-only convention/drift maintenance; it does not introduce a new reviewer role or capability whose failure modes need tripwire detection. No new tripwires are added.

The "across N PRs" guard from CLAUDE.md condition (iii) — the per-iteration housekeeping pattern itself is the indirect tripwire for drift accumulation. If the next housekeeping pass surfaces similar count/list drift in three or more places, the trigger to revisit is to consider auto-current phrasing as the default convention (this iteration applies it to one place; if drift recurs, generalize).

The initial-round red-team review of PR #27 surfaced a duplicate post pattern: the Opus red-team subagent posted its review once under the user identity (`kevinjohannesson`) and once under the bot identity (`gcscode-red-team[bot]`). This is a reviewer-bot infrastructure failure (the subagent's `gh pr review` invocation defaulted to user auth on the first attempt before the token helper succeeded). Tracked under Future iterations; not addressed in this iteration.

## Future iterations

- **Dockview operator-UX iteration** — when triggered, decides whether dockview graduates (alignment-ledger rows, out-of-scope.md non-goals, feature-extensions roadmap entry) or is removed. Until then, the Experiments bullet is the only doc-level acknowledgment.
- **Settings editor UI** — when the second-consumer half-trigger fires (per the parenthetical added by Edit 7) or operator-UX feedback surfaces, brainstorm the editor.
- **Next periodic housekeeping pass** — per CLAUDE.md, after 2-3 feature iterations have shipped. The natural next surfacings are likely the dockview operator-UX decision, any drift accumulated during further C-phase iterations, the `showQuickPick` README articulation gap deferred by Edit 4, and the stale `[ ] ADR-0009` Considering row in roadmap (shipped per PR #15; should flip to checked).
- **Reviewer-bot identity-fallback investigation** — root-cause why the Opus red-team subagent on PR #27 first posted under the user's GitHub identity before retrying under `gcscode-red-team[bot]`. Likely either a token-helper invocation race or a `gh` CLI auth-precedence rule that prefers cached user auth over `GH_TOKEN` env. Trigger to revisit: pattern repeats on another spec/ADR PR.

## Origin

Surfaced during the 2026-05-18 `/housekeeping` pass. Survey identified seven discrete findings ordered by leverage; the user picked cut A' (drift fixes + one-line dockview mention; explicitly NOT vs-code-alignment rows for dockview, NOT out-of-scope propagation of dockview non-goals). The user's "experimental, might remove dockview" guidance shaped the dockview treatment.

The initial-round red-team review (PR #27, 2026-05-18) materially sharpened the iteration: dropped one wrong-categorical edit (the original Edit 5 on out-of-scope.md line 16), added one new edit (the dockview-svelte-manual-checklist.md absolute-path fix), reshaped Edit 3 from duplicate-rule to cross-reference, and sharpened Edit 1 to preserve the "first extension / canonical worked example" framing. The spec's revised structure is the post-review consensus.

## Post-merge implementation

Single mechanical commit on master per the post-merge implementation convention ("purely mechanical CLAUDE.md or docs edits whose exact text is fully specified in the spec"). Commit message:

```
docs: housekeeping drift-fixes (post-C3 sweep)

Per docs/specs/2026-05-18-housekeeping-drift-fixes.md.

- CLAUDE.md: auto-current package paragraph (was "three packages") — preserves "canonical worked-example" framing
- CLAUDE.md: add host.configuration.* to namespace corollary
- CLAUDE.md: cross-reference plan-optional carve-out in Subagent-driven plan execution
- extension-api/README.md: "four namespaces" -> "five" + add host.configuration bullet
- dockview-svelte-manual-checklist.md: drop absolute-path cd line; rely on pnpm --filter
- roadmap.md: new Experiments subsection with dockview bullet
- roadmap.md: Settings editor UI half-trigger annotation
```

If during implementation any of the seven edits surfaces judgment-requiring nuance (the edit's exact text in the spec does not match the actual file's content because the file shifted between spec-writing and post-merge implementation, or the spec missed a load-bearing surrounding sentence), STOP the master-direct commit and open a `feat/housekeeping-drift-fixes` branch instead, per the CLAUDE.md guardrail.
