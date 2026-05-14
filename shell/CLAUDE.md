# GCScode — agent guide

## What this repo is

A Svelte 5 SPA scaffolded as the shell for a VS Code–style ground control station (GCS). Extensions contribute UI fragments into named extension surfaces. First-party features will be built as extensions against the same public API used by third-party extensions later.

## Layout

pnpm workspace with three packages:

- `@gcscode/shell` — the app. Owns bootstrapping and the extension registry.
- `@gcscode/extension-api` — the **only** import path for extensions. Types and contracts.
- `@gcscode/extension-example` — the first extension. Canonical worked example.

Package root is the repo root. Shared tooling at the root: ESLint flat config, Prettier, and `tsconfig.base.json`. Each package extends these. `svelte.config.js` and `vite.config.ts` live in `packages/shell/` (Vite looks for them at its config's directory).

## Boundary rule — load bearing

**Extension packages import RUNTIME only from `@gcscode/extension-api`.** No runtime imports from `@gcscode/shell` or sibling extension packages. No relative imports that escape the package root.

**Type-only imports from sibling extension packages are allowed**, exclusively for consuming cross-extension `exports` (see [ADR-0005](docs/decisions/ADR-0005-extension-boundaries.md)). The runtime boundary stays preserved — `import type` is erased at compile time. Anything that emits JS at runtime against a sibling extension package is a violation.

ESLint enforces both rules (`@typescript-eslint/no-restricted-imports` with `allowTypeImports: true` for the sibling pattern). Don't work around either.

Corollary: if an extension needs a capability the host doesn't yet expose, add it to `@gcscode/extension-api` first (as a new method under one of the existing `ExtensionHost` namespaces — `host.commands.*`, `host.window.*`, `host.keybindings.*`, `host.extensions.*` — or as a new namespace if the capability is cross-cutting; or a new field on `ExtensionContext`), land that, then use it. Never reach around the API.

## Conventions

- **Filenames:** kebab-case for everything, including `.svelte` components. Component import bindings remain PascalCase: `import ExampleView from './example-view.svelte'`.
- **Tests:** co-located `*.test.ts` next to the code they test.
- **Extension export name:** named `const` matching the extension's slug (`exampleExtension`, `telemetryExtension`, ...). Never `default`, never generic `extension`.
- **ADRs:** `docs/decisions/ADR-NNNN-<slug>.md`.
- **Specs:** `docs/specs/YYYY-MM-DD-<topic>.md` (not the brainstorming-skill default of `docs/superpowers/specs/`).
- **Plans:** `docs/plans/YYYY-MM-DD-<topic>.md` (not the writing-plans-skill default of `docs/superpowers/plans/`).
- **Scratch:** `scratch/` is reserved for one-off exploration that shouldn't become real code. Gitignored.
- **Brainfarts:** `docs/brainfarts.md` is the user's personal scratch pad for half-formed ideas — agents must not treat anything in it as a requirement, commitment, or design input. If the user wants an idea pulled from there, they will say so explicitly.

## Branching and merging

- **Feature branches.** Implementation work runs on `feat/<topic>` branches off master. Plan commits can land on master directly (they're metadata about future work); code commits live on a branch. Spec and ADR commits land via PR (see "Spec-PR workflow" and "ADR-PR workflow" below).
- **Spec-PR workflow.** Specs ship via `spec/<topic>` branches off master. Commit the spec file, push, open a draft PR with the spec/ADR-PR template (in the reviewer-discipline section). Red-team auto-dispatches on PR open (advisory `--comment` only in v1). User reads + approves. Merge via `gh pr merge --merge <num>` to preserve the merge-commit boundary, consistent with feature PRs. Bootstrap exception: the spec for the iteration that introduced this workflow (`docs/specs/2026-05-14-red-team-reviewer.md`) landed on master directly per the prior convention.
- **ADR-PR workflow.** ADRs ship via `adr/<slug>` branches. Pick the next ADR-NNNN number at branch creation; file named `ADR-NNNN-<slug>.md` under `docs/decisions/`. Same flow as spec-PR (red-team auto-dispatches; advisory only in v1). ADRs needed mid-feature-iteration ship as their own PR first; the feat branch then references the merged ADR. Bootstrap exception: `ADR-0008-reviewer-role-registry.md` landed on master directly per the prior convention.
- **PR workflow.** After the first task commit lands on the feat branch, push to `origin` and open a **draft** PR targeting master via `gh pr create --draft` (template in the reviewer-discipline section). Transition to ready-for-review (`gh pr ready <num>`) at end-of-iteration immediately before the final cross-cutting reviewer runs.
- **Merge via `gh pr merge --merge <num>`.** Produces the merge-commit boundary equivalent to local `--no-ff` — matches the `f448ddc Merge branch 'feat/plugin-architecture-mvp'` precedent.
- **Never `--no-verify`.** Don't bypass commit hooks. If a hook fails, fix the underlying issue. (The repo currently has no commit hooks; the rule is in place for when it does.)
- **No force pushes to master.** Even with explicit user consent, prefer fixing the underlying issue over force-pushing.
- **No force pushes to PR branches once they have review comments.** Review threads anchor to commit SHAs; force-pushing breaks the audit trail.

## Extension shape

An extension module exports a named `const` of type `Extension` with `{ manifest: { id, displayName, version, description? }, activate(context) }`. The `manifest: ExtensionManifest` carries declarative identity + presentation metadata; runtime registration stays imperative. Inside `activate`, call `context.host.<namespace>.register*` (e.g. `context.host.window.registerView`, `context.host.commands.registerCommand`) (each returns a `Disposable`) and push every disposable to `context.subscriptions`. Long-form contract: `packages/extension-api/README.md`. Manifest growth conventions: [ADR-0007](docs/decisions/ADR-0007-extension-manifest.md).

## Planning conventions and long-term alignment

### VS Code alignment (in spirit, not by byte)

GCScode mirrors VS Code's extension architecture in spirit, not by byte. Adopt VS Code's load-bearing patterns — disposables, activation contexts, named/disposable contributions, register-then-execute, commands as the integration backbone — but feel free to diverge on syntax/style/ergonomics when the local context warrants. Extension-code portability is **not** a goal.

During brainstorming and planning, surface every API divergence from VS Code as a labeled decision (with the trade-off articulated), not as a default. When picking a divergence, capture it in the spec or ADR explicitly. Specs should include a "VS Code alignment" section that lists what is aligned, what diverges (and why), and what is deferred — see `docs/specs/2026-04-26-phase-a2-commands.md` for the canonical table-format example. When an iteration ships, propagate each new row from the spec's "VS Code alignment" section to `docs/vs-code-alignment.md` — that file is the cumulative ledger; per-spec tables stay as snapshots.

### Subagent-driven plan execution

When executing a plan, use the `superpowers:subagent-driven-development` skill: dispatch a fresh implementer subagent per task, follow with a spec compliance review then a code quality review, and address review feedback in separate `Code-review-followup:` commits on the same branch (not amends). After all tasks land, dispatch a final cross-cutting code review over the full branch before merging via `superpowers:finishing-a-development-branch`.

This pattern surfaces the same class of issues at three different points (implementer self-review, per-task spec/quality review, final cross-cutting review), and produces a legible `git log` where every followup is traced to the review note that prompted it. Don't squash followups into the originating commit — the review trail is part of the history.

Specs and ADRs now ship via their own PRs (see "Spec-PR workflow" and "ADR-PR workflow" in the Branching and merging section above) and receive a red-team auto-dispatched review per the reviewer-role registry. Plans continue to land on master directly.

### Subagent worktree discipline

When a subagent is dispatched to work in a feature worktree (e.g. `.worktrees/feat-foo/`), the bash tool **resets cwd between calls**. A single `cd <worktree>` does NOT persist across subsequent bash calls — the next call defaults back to the controller's original cwd, which is typically the main checkout (where `master` is checked out).

Two real failure modes have been observed:

- **Commits land on master instead of the feat branch.** The subagent runs `cd <worktree> && edit && pnpm test` (works), then a separate `git add && git commit` call (runs on the main checkout, lands on master).
- **Main checkout's working tree drifts.** The subagent runs `pnpm format` from the main checkout's path; Prettier rewrites docs files that should have been edited in the worktree only.

**Discipline (required for every subagent dispatched to a worktree):**

1. **Prepend `cd <worktree-path>/<package-root> &&` to every bash command.** Don't rely on cwd persistence.
2. **Before every `git commit`, chain `git branch --show-current`** and verify the output matches the expected feat branch. If it reads `master`, STOP — the cwd is wrong.
3. **Run `pnpm format`, `pnpm test`, `pnpm check`, `pnpm lint` only with the `cd <worktree>/<package-root> &&` prefix.** Otherwise these commands modify or read from the main checkout.

Controllers dispatching subagents to worktrees should restate these rules in the prompt explicitly when the iteration involves git commits — the discipline is project-wide policy but the subagent has no automatic awareness of which worktree it's in.

### Subagent reviewer PR-posting discipline

Every reviewer subagent dispatched during an iteration — per-task spec-compliance, per-task code-quality, final cross-cutting — posts its review to the iteration's GitHub PR in addition to returning a summary to the controller. The PR is the durable artifact; the summary preserves the existing followup-loop. Spec: [`docs/specs/2026-05-12-reviews-as-artifacts.md`](docs/specs/2026-05-12-reviews-as-artifacts.md).

**Dispatch prompt requirements (controller MUST include in every reviewer's prompt):**

- The PR number to post to.
- The token-helper invocation as a first step: `export GH_TOKEN=$(.claude/scripts/gh-app-token)`. Subsequent `gh` calls run under the `gcscode-reviewer[bot]` identity.
- The verdict the reviewer is allowed to use (see table below).
- The header convention.

**Reviewer-role registry.** Source of truth for reviewer role definitions. The verdict table below is a denormalized quick-reference view of the registry. Architectural rationale: [`docs/decisions/ADR-0008-reviewer-role-registry.md`](docs/decisions/ADR-0008-reviewer-role-registry.md). Prompt templates: `.claude/reviewer-prompts/<role>.md`.

| Role                | Kind          | Identity                | Model             | Targets         | Trigger                      | Verdicts                         | Character                                           | Header                                                     | Re-review header                                                                | Prompt template                                                           |
| ------------------- | ------------- | ----------------------- | ----------------- | --------------- | ---------------------------- | -------------------------------- | --------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Spec-compliance     | per-task      | `gcscode-reviewer[bot]` | Claude Sonnet 4.6 | feature-PR      | After each task commit       | `--comment`, `--request-changes` | Verify implementation matches the task's spec slice | `## Spec-compliance review — task <N> — Claude Sonnet 4.6` | `## Spec-compliance review — task <N> (re-review of <SHA>) — Claude Sonnet 4.6` | `superpowers:subagent-driven-development/spec-reviewer-prompt.md`         |
| Code-quality        | per-task      | `gcscode-reviewer[bot]` | Claude Sonnet 4.6 | feature-PR      | After spec-compliance passes | `--comment`, `--request-changes` | Code quality, idioms, edge cases                    | `## Code-quality review — task <N> — Claude Sonnet 4.6`    | `## Code-quality review — task <N> (re-review of <SHA>) — Claude Sonnet 4.6`    | `superpowers:subagent-driven-development/code-quality-reviewer-prompt.md` |
| Final cross-cutting | cross-cutting | `gcscode-reviewer[bot]` | Claude Opus 4.7   | feature-PR      | End of iteration             | `--request-changes`, `--approve` | Cross-cutting concerns missed at per-task level     | `## Final cross-cutting review — Claude Opus 4.7`          | `## Final cross-cutting review (re-review of <SHA>) — Claude Opus 4.7`          | `superpowers:requesting-code-review/code-reviewer.md`                     |
| Red-team            | per-artifact  | `gcscode-reviewer[bot]` | Claude Opus 4.7   | spec-PR, ADR-PR | Automatic on PR open         | `--comment` only (v1)            | Premise challenger + consistency reviewer           | `## Red-team review — <spec or ADR> — Claude Opus 4.7`     | `## Red-team review — <spec or ADR> (re-review of <SHA>) — Claude Opus 4.7`     | `.claude/reviewer-prompts/red-team.md`                                    |

`<SHA>` in re-review headers refers to the **followup commit that prompted the re-review** (the new commit added since the prior review), matching the empirical convention from PR #1's validation.

**Verdict table:**

| Reviewer kind                          | `--comment` | `--request-changes` | `--approve` |
| -------------------------------------- | :---------: | :-----------------: | :---------: |
| Per-task spec-compliance               |      ✓      |          ✓          |      ✗      |
| Per-task code-quality                  |      ✓      |          ✓          |      ✗      |
| Final cross-cutting (end of iteration) |      ✗      |          ✓          |      ✓      |
| Red-team (per-artifact, spec/ADR-PRs)  |      ✓      |          ✗          |      ✗      |

Per-task reviewers may post `--comment` (clean or informational) or `--request-changes` (blocking), never `--approve`. The final cross-cutting reviewer is the only review allowed to flip the PR into approved state; it posts `--approve` or `--request-changes`, never `--comment`.

**Re-review after a Code-review-followup commit:** controller re-dispatches the same reviewer role + model after the followup commit lands. The re-review posts a **new** review (`--comment` "addressed in `<SHA>`" or another `--request-changes`). Prior reviews stay in the PR timeline — reviewers never dismiss their own prior reviews.

**Red-team auto-dispatch (spec/ADR PRs).** When a `spec/<topic>` or `adr/<slug>` PR is opened, the controller automatically dispatches the red-team reviewer per its registry entry. The dispatch uses the same boilerplate as per-task reviewers (token helper, PR posting requirement) and reads its review template from [`.claude/reviewer-prompts/red-team.md`](.claude/reviewer-prompts/red-team.md). Red-team's verdict is `--comment` only in v1 (advisory). On a `Code-review-followup:` commit to the spec/ADR branch, the controller re-dispatches red-team and the re-review header includes `(re-review of <SHA>)` where `<SHA>` is the followup commit (matches the existing re-review convention).

**Review header convention** (mandatory so the single bot identity remains role-legible):

```
## <Review kind> — task <N> (if per-task) — <reviewer model>
```

Examples:

- `## Spec-compliance review — task 3 — Claude Sonnet 4.6`
- `## Code-quality review — task 7 — Claude Sonnet 4.6`
- `## Final cross-cutting review — Claude Opus 4.7`
- `## Spec-compliance review — task 3 (re-review of abc1234) — Claude Sonnet 4.6`
- `## Red-team review — spec — Claude Opus 4.7`
- `## Red-team review — ADR — Claude Opus 4.7`
- `## Red-team review — spec (re-review of def5678) — Claude Opus 4.7`

**Merge gate (controller does NOT merge — the user does):** convention is "do not merge unless the final cross-cutting review is `--approve`." Human override allowed; if user merges despite open `--request-changes` reviews, leave a PR comment explaining why. The override is itself an artifact.

**Feature-PR template for `gh pr create --draft --body "..."`:**

```md
## Iteration

<one-line summary matching the spec's first line>

## Links

- Spec: [`docs/specs/YYYY-MM-DD-<topic>.md`](../blob/master/docs/specs/YYYY-MM-DD-<topic>.md)
- Plan: [`docs/plans/YYYY-MM-DD-<topic>.md`](../blob/master/docs/plans/YYYY-MM-DD-<topic>.md)
- ADRs (if any): …

## Reviewer instructions

Per-task reviewers post under task-headers. Final cross-cutting review posts at end of iteration.

🤖 Reviews authored by `gcscode-reviewer[bot]` — see [docs/specs/2026-05-12-reviews-as-artifacts.md](../blob/master/docs/specs/2026-05-12-reviews-as-artifacts.md) for the workflow.
```

**Spec/ADR-PR template** (used for `spec/<topic>` and `adr/<slug>` PRs that ship via the spec-PR / ADR-PR workflows from "Branching and merging"):

```md
## <Spec or ADR title>

<one-line summary matching the artifact's first line>

## Links

- Related spec/ADR: …
- Related iteration (if any): …

## Reviewer instructions

Red-team auto-dispatches on PR open per the reviewer-role registry. Future reviewer roles (e.g., domain expert, when they exist) follow per the registry.

🤖 Reviews authored by `gcscode-reviewer[bot]` — see [docs/specs/2026-05-12-reviews-as-artifacts.md](../blob/master/shell/docs/specs/2026-05-12-reviews-as-artifacts.md) for the workflow.
```

**Public repo note.** gcscode is public on GitHub. Reviewer comments are world-readable. Keep reviews professional. Don't paste sensitive context (credentials, internal URLs).

**Config locations:** App ID and installation ID live in `.claude/agent-config.json` (versioned). Private key path is read from `GH_APP_PRIVATE_KEY_PATH` env var; the PEM file never enters git.

### Non-goals propagate to `docs/out-of-scope.md`

When a spec lists cross-cutting deferrals — concepts the architecture is deliberately deferring, not just per-iteration scope cuts — those deferrals must land in `docs/out-of-scope.md` when the iteration ships, with an explicit trigger to revisit. Per-iteration scope omissions stay in the spec only; cross-cutting deferrals are the canonical list in `out-of-scope.md`.

The judgment: does this non-goal apply only to this iteration, or is it a deliberate "we're deferring this concept" decision affecting the whole architecture? Cross-cutting → propagate to `out-of-scope.md`. Specs should include a `docs/out-of-scope.md` propagation section listing the exact edits the iteration's docs commit will make — see the `## docs/out-of-scope.md propagation` section in `docs/specs/2026-04-26-phase-a2-commands.md` for the canonical bullet-list-of-edits format.

### Periodic housekeeping

After 2–3 feature iterations have shipped, run a housekeeping pass: open survey across alignment / sharpening / gaps, surface findings ordered by leverage, offer A/B/C cuts (smallest / medium / largest), then brainstorm + spec + plan + execute the chosen cut. The full procedure lives at `.claude/commands/housekeeping.md` (invoke via `/housekeeping`). Codified during the 2026-05-01 / 2026-05-02 sequence (`docs/specs/2026-05-01-vs-code-alignment-ledger.md` + `docs/specs/2026-05-01-extensionhost-namespacing.md`).

The pattern catches silent drift (stale READMEs, out-of-date out-of-scope language, unarticulated divergences from VS Code) before it accumulates, and surfaces decisions whose triggers are approaching (e.g., the namespacing 5–7 method threshold) so they get a focused brainstorm rather than a hurried call mid-feature. Don't run this for one-off questions or active feature work — periodic discipline only.

## Commands

- `pnpm dev` — run the shell's dev server
- `pnpm build` — build all packages
- `pnpm test` — run all tests in all packages
- `pnpm check` — svelte-check + tsc across all packages
- `pnpm lint` — ESLint + Prettier
- `pnpm format` — Prettier write

## Further reading

- `docs/roadmap.md` — phase plan + iteration status + planned feature extensions. Start here for "where are we now / what's next".
- `docs/out-of-scope.md` — canonical list of what is intentionally NOT built yet. Check here before building anything new.
- `docs/vs-code-alignment.md` — cumulative ledger of where gcscode aligns with and diverges from VS Code's extension architecture. Read alongside per-spec "VS Code alignment" tables.
- `docs/decisions/` — architecture decision records.
- `packages/extension-api/README.md` — how to write an extension.
- `packages/extension-example/README.md` — the worked example to mirror.
- `.claude/commands/housekeeping.md` — `/housekeeping` slash command. Run periodically (every 2–3 iterations) to sweep for drift, sharpen rough edges, fill articulation gaps.
- `docs/specs/2026-05-12-reviews-as-artifacts.md` — first iteration of the agentic-team-architecture track: GitHub PR workflow + reviewer subagents posting under a GitHub App identity.
- `docs/specs/2026-05-14-red-team-reviewer.md` — second iteration of the agentic-team-architecture track: red-team reviewer on spec/ADR PRs + reviewer-role registry.
- `docs/decisions/ADR-0008-reviewer-role-registry.md` — registry pattern decision; source of truth for reviewer role definitions.
- `.claude/reviewer-prompts/red-team.md` — red-team reviewer prompt template (review behavior, tone, output structure).
- `.claude/agent-config.json` — App ID and installation ID for the `gcscode-reviewer` GitHub App. Private key path lives in `GH_APP_PRIVATE_KEY_PATH` env var, not in repo.
- `.claude/scripts/gh-app-token` — helper that generates short-lived installation tokens. Reviewer subagents call `export GH_TOKEN=$(.claude/scripts/gh-app-token)` before `gh pr review`.

---

## Working with Svelte code

You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5 and SvelteKit documentation. Here's how to use the available tools effectively:

### Available Svelte MCP Tools:

#### 1. list-sections

Use this FIRST to discover all available documentation sections. Returns a structured list with titles, use_cases, and paths.
When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

#### 2. get-documentation

Retrieves full documentation content for specific sections. Accepts single or multiple sections.
After calling the list-sections tool, you MUST analyze the returned documentation sections (especially the use_cases field) and then use the get-documentation tool to fetch ALL documentation sections that are relevant for the user's task.

#### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions.
You MUST use this tool whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.

#### 4. playground-link

Generates a Svelte Playground link with the provided code.
After completing the code, ask the user if they want a playground link. Only call this tool after user confirmation and NEVER if code was written to files in their project.
