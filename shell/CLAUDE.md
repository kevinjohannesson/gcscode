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
- **Post-merge implementation conventions.** When a spec-PR or ADR-PR merges, implementation follows the same conventions as any other change: feat branches (with the subagent-driven plan execution pipeline) for code or for changes that require judgment during implementation (decomposition, integration, file structure beyond what the spec specifies); direct master commits for purely mechanical CLAUDE.md or docs edits whose exact text is fully specified in the spec. The spec-PR's red-team review serves as the cross-cutting review of the behavioral change; the post-merge mechanical commit is execution-only. If you find yourself making decisions during the post-merge commit that the spec didn't make, stop and use a feat branch.
- **Merge via `gh pr merge --merge <num>`.** Produces the merge-commit boundary equivalent to local `--no-ff` — matches the `f448ddc Merge branch 'feat/plugin-architecture-mvp'` precedent.
- **Auto-merge on user approval.** The user opts a PR into automatic merging by adding the `auto-merge` label. The `.github/workflows/auto-merge.yml` workflow merges the PR when (a) the PR is not draft, (b) the label is present, (c) the head branch matches `feat/*`, `spec/*`, or `adr/*`, (d) the class-aware bot signal passes — for `feat/*` PRs the PR's `reviewDecision` is `APPROVED`; for `spec/*` or `adr/*` PRs both red-team AND spec-quality have posted at least one review (enforcing the auto-dispatch obligation), and (e) the PR is mergeable. Test branches (`test/*`) and other branches stay manual. Removing the label removes the auto-merge intent for any subsequent trigger. The fallback `gh pr merge --merge <num>` (the prior bullet) is always available. Spec: [`docs/specs/2026-05-14-auto-merge-on-user-approval.md`](docs/specs/2026-05-14-auto-merge-on-user-approval.md).
- **Never `--no-verify`.** Don't bypass commit hooks. If a hook fails, fix the underlying issue. (The repo currently has no commit hooks; the rule is in place for when it does.)
- **No force pushes to master.** Even with explicit user consent, prefer fixing the underlying issue over force-pushing.
- **No force pushes to PR branches once they have review comments.** Review threads anchor to commit SHAs; force-pushing breaks the audit trail.

## Extension shape

An extension module exports a named `const` of type `Extension` with `{ manifest: { id, displayName, version, description? }, activate(context) }`. The `manifest: ExtensionManifest` carries declarative identity + presentation metadata; runtime registration stays imperative. Inside `activate`, call `context.host.<namespace>.register*` (e.g. `context.host.window.registerView`, `context.host.commands.registerCommand`) (each returns a `Disposable`) and push every disposable to `context.subscriptions`. Long-form contract: `packages/extension-api/README.md`. Manifest growth conventions: [ADR-0007](docs/decisions/ADR-0007-extension-manifest.md).

## Planning conventions and long-term alignment

### VS Code alignment (in spirit, not by byte)

GCScode mirrors VS Code's extension architecture in spirit, not by byte. Adopt VS Code's load-bearing patterns — disposables, activation contexts, named/disposable contributions, register-then-execute, commands as the integration backbone — but feel free to diverge on syntax/style/ergonomics when the local context warrants. Extension-code portability is **not** a goal.

During brainstorming and planning, surface every API divergence from VS Code as a labeled decision (with the trade-off articulated), not as a default. When picking a divergence, capture it in the spec or ADR explicitly. Specs should include a "VS Code alignment" section that lists what is aligned, what diverges (and why), and what is deferred — see `docs/specs/2026-04-26-phase-a2-commands.md` for the canonical table-format example. When an iteration ships, propagate each new row from the spec's "VS Code alignment" section to `docs/vs-code-alignment.md` — that file is the cumulative ledger; per-spec tables stay as snapshots.

### Specs as historical record

A spec that ships via spec-PR + merges to master becomes the historical record for that iteration. Subsequent specs that need to revise the predecessor's decisions add a **one-line cross-reference breadcrumb** to the predecessor (per the PR #11 N=5 counter-reset precedent); they do NOT deeply edit the predecessor's content. Substantive corrections happen via successor specs.

**Exception — factual corrections allowed.** Deep edits to a predecessor spec are permitted for **mechanical fixes**: typos, broken links, file renames that affect references, or other corrections that don't revise the predecessor's substantive decisions. When making such an edit, commit with a `fix(spec):` prefix and a one-sentence rationale in the commit message.

The substantive-vs-factual line is a judgment call, but the test is concrete: if you're changing what the predecessor SAID (its goals, non-goals, architecture, decisions), that's substantive — write a successor spec. If you're changing how the predecessor REFERS to something that has since moved (link path, filename, section anchor), that's factual — edit in place.

**Why the convention:** legibility. A reader (human or future agent) reading a merged spec should be able to trust the content is the historical record of what the iteration decided. Substantive revisions surfacing as silent edits to old specs makes the historical record unreliable.

Codified during the agentic-team debt-clearing iteration (`docs/specs/2026-05-16-agentic-team-debt-clearing-v1.md`) as a **forward-looking guardrail**. The breadcrumb pattern emerged in practice (PR #11's N=5 counter-reset breadcrumb is the canonical example) but the deep-edit-of-predecessor problem the convention prevents has not happened yet. The convention codifies the breadcrumb pattern as the default + the substantive-vs-factual line as the test for when to use it.

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

**Agentic-actor registry.** Source of truth for agentic-actor definitions (reviewers + non-reviewer controller-voice actors). The verdict table below is a denormalized quick-reference view of the registry. Architectural rationale: [`docs/decisions/ADR-0009-agentic-actor-registry.md`](docs/decisions/ADR-0009-agentic-actor-registry.md) (supersedes [ADR-0008](docs/decisions/ADR-0008-reviewer-role-registry.md)). Prompt templates: `.claude/reviewer-prompts/<name>.md`.

The respondent row's dispatch mechanics + posting discipline are documented in the "Respondent posting discipline" subsection (located below this section in CLAUDE.md); the registry row is the source of truth for the respondent's structural fields (identity, trigger, header, prompt template), while the posting discipline subsection covers the controller's operational obligation to post after each `Code-review-followup:` commit.

| Actor class | Role                | Kind                  | Identity                  | Model                                          | Secondary model   | Targets         | Trigger                              | Verdicts                         | Character                                                          | Header                                                       | Re-review header                                                                | Prompt template                                                           |
| ----------- | ------------------- | --------------------- | ------------------------- | ---------------------------------------------- | ----------------- | --------------- | ------------------------------------ | -------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| reviewer    | Spec-compliance     | per-task              | `gcscode-reviewer[bot]`   | Claude Sonnet 4.6                              | —                 | feature-PR      | After each task commit               | `--comment`, `--request-changes` | Verify implementation matches the task's spec slice                | `## Spec-compliance review — task <N> — Claude Sonnet 4.6`   | `## Spec-compliance review — task <N> (re-review of <SHA>) — Claude Sonnet 4.6` | `superpowers:subagent-driven-development/spec-reviewer-prompt.md`         |
| reviewer    | Code-quality        | per-task              | `gcscode-reviewer[bot]`   | Claude Sonnet 4.6                              | —                 | feature-PR      | After spec-compliance passes         | `--comment`, `--request-changes` | Code quality, idioms, edge cases                                   | `## Code-quality review — task <N> — Claude Sonnet 4.6`      | `## Code-quality review — task <N> (re-review of <SHA>) — Claude Sonnet 4.6`    | `superpowers:subagent-driven-development/code-quality-reviewer-prompt.md` |
| reviewer    | Final cross-cutting | cross-cutting         | `gcscode-reviewer[bot]`   | Claude Opus 4.7                                | —                 | feature-PR      | End of iteration                     | `--request-changes`, `--approve` | Cross-cutting concerns missed at per-task level                    | `## Final cross-cutting review — Claude Opus 4.7`            | `## Final cross-cutting review (re-review of <SHA>) — Claude Opus 4.7`          | `superpowers:requesting-code-review/code-reviewer.md`                     |
| reviewer    | Red-team            | per-artifact          | `gcscode-reviewer[bot]`   | Claude Opus 4.7                                | Claude Sonnet 4.6 | spec-PR, ADR-PR | Automatic on PR open                 | `--comment` only (v1)            | Premise challenger + consistency reviewer                          | `## Red-team review — <spec or ADR> — Claude Opus 4.7`       | `## Red-team review — <spec or ADR> (re-review of <SHA>) — Claude Opus 4.7`     | `.claude/reviewer-prompts/red-team.md`                                    |
| reviewer    | Spec-quality        | per-artifact          | `gcscode-reviewer[bot]`   | Claude Sonnet 4.6                              | —                 | spec-PR, ADR-PR | Automatic on PR open                 | `--comment` only (v1)            | Document structure + within-document consistency + link mechanics  | `## Spec-quality review — <spec or ADR> — Claude Sonnet 4.6` | `## Spec-quality review — <spec or ADR> (re-review of <SHA>) — Claude Sonnet 4.6` | `.claude/reviewer-prompts/spec-quality.md`                                |
| respondent  | Respondent          | per-followup-commit (new enum value; extends `{per-task, cross-cutting, per-artifact}`) | `gcscode-respondent[bot]` | n/a — controller-direct (column-value stretch; v1 limitation; respondent subagent v2 will populate with an actual Claude model) | — | spec-PR, ADR-PR (v1 scope; review-discussion-loop-v1's Future iterations contemplates feature-PR extension) | After each Code-review-followup commit | `--comment` only (advisory; not a review verdict) | Documents controller's per-finding dispositions; documents what was addressed, deferred, routed, or noted | `## Respondent — re commit <SHA> — to <reviewer role> review by <reviewer model>` | — (the respondent does NOT re-review its own prior posts; each followup commit triggers a new respondent post with the standard header above, NOT a re-review of a prior respondent post) | `.claude/reviewer-prompts/respondent.md` |

The `Secondary model` field is OPTIONAL. When populated, the controller dispatches BOTH this model AND the `Model` field's value in parallel for this role (multi-model heterogeneous reviewers per [`docs/specs/2026-05-16-multi-model-red-team-v1.md`](docs/specs/2026-05-16-multi-model-red-team-v1.md)). When empty (`—`), the controller dispatches only the `Model` field's value (single-model behavior, unchanged). The `Header` and `Re-review header` columns show the form for the PRIMARY model only; the secondary dispatch uses the same header structure with the secondary model name substituted.

`<SHA>` in re-review headers refers to the **followup commit that prompted the re-review** (the new commit added since the prior review), matching the empirical convention from PR #1's validation.

**Verdict table:**

| Reviewer kind                          | `--comment` | `--request-changes` | `--approve` |
| -------------------------------------- | :---------: | :-----------------: | :---------: |
| Per-task spec-compliance               |      ✓      |          ✓          |      ✗      |
| Per-task code-quality                  |      ✓      |          ✓          |      ✗      |
| Final cross-cutting (end of iteration) |      ✗      |          ✓          |      ✓      |
| Red-team (per-artifact, spec/ADR-PRs)  |      ✓      |          ✗          |      ✗      |
| Spec-quality (per-artifact, spec/ADR-PRs) |      ✓      |          ✗          |      ✗      |

Per-task reviewers may post `--comment` (clean or informational) or `--request-changes` (blocking), never `--approve`. The final cross-cutting reviewer is the only review allowed to flip the PR into approved state; it posts `--approve` or `--request-changes`, never `--comment`.

**Re-review after a Code-review-followup commit:** controller re-dispatches the same reviewer role + model after the followup commit lands. The re-review posts a **new** review (`--comment` "addressed in `<SHA>`" or another `--request-changes`). Prior reviews stay in the PR timeline — reviewers never dismiss their own prior reviews.

**Auto-dispatch on spec/ADR PRs.** When a `spec/<topic>` or `adr/<slug>` PR is opened, the controller automatically dispatches THREE reviewer subagents in parallel: red-team Opus 4.7 (primary), red-team Sonnet 4.6 (secondary, from the registry's `Secondary model` field for red-team), and spec-quality Sonnet 4.6. Dispatch identifiers: `subagent_type: red-team-reviewer` for the primary Opus dispatch, `subagent_type: red-team-reviewer, model: sonnet` for the secondary dispatch (model overridden at dispatch; `effort: max` still inherited from the agent file frontmatter), and `subagent_type: spec-quality-reviewer` for spec-quality. The three subagents dispatch as independent calls; none blocks any other; each posts an independent review under the `gcscode-reviewer[bot]` identity. The two red-team dispatches use the same prompt template (`.claude/reviewer-prompts/red-team.md`) and the same context; only the `model` parameter differs. All three subagents run with `effort: max` per the `effort` field in their agent files (`.claude/agents/red-team-reviewer.md` and `.claude/agents/spec-quality-reviewer.md`). The multi-model pair is an independence-of-opinion experiment from [`docs/specs/2026-05-16-multi-model-red-team-v1.md`](docs/specs/2026-05-16-multi-model-red-team-v1.md) and runs for N=5 spec/ADR PRs before an evaluation iteration decides whether to keep both, revert to single-model, or extend the experiment. All three verdicts are `--comment` only in v1 (advisory). On a `Code-review-followup:` commit to the spec/ADR branch, the controller re-dispatches ALL THREE roles in parallel. Each re-review header includes `(re-review of <SHA>)` where `<SHA>` is the followup commit.

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
- `## Red-team review — spec — Claude Sonnet 4.6`
- `## Red-team review — ADR — Claude Opus 4.7`
- `## Red-team review — ADR — Claude Sonnet 4.6`
- `## Red-team review — spec (re-review of def5678) — Claude Opus 4.7`
- `## Red-team review — spec (re-review of def5678) — Claude Sonnet 4.6`
- `## Spec-quality review — spec — Claude Sonnet 4.6`
- `## Spec-quality review — ADR — Claude Sonnet 4.6`
- `## Spec-quality review — spec (re-review of def5678) — Claude Sonnet 4.6`

**Merge gate (controller does NOT merge — the user does):** convention is "do not merge unless the final cross-cutting review is `--approve`." Human override allowed; if user merges despite open `--request-changes` reviews, leave a PR comment explaining why. The override is itself an artifact.

**Feature-PR template for `gh pr create --draft --body "..."`:**

```md
## Iteration

<one-line summary matching the spec's first line>

## Links

- Spec: [`docs/specs/YYYY-MM-DD-<topic>.md`](../blob/master/shell/docs/specs/YYYY-MM-DD-<topic>.md)
- Plan: [`docs/plans/YYYY-MM-DD-<topic>.md`](../blob/master/shell/docs/plans/YYYY-MM-DD-<topic>.md)
- ADRs (if any): …

## Reviewer instructions

Per-task reviewers post under task-headers. Final cross-cutting review posts at end of iteration.

🤖 Reviews authored by `gcscode-reviewer[bot]` — see [docs/specs/2026-05-12-reviews-as-artifacts.md](../blob/master/shell/docs/specs/2026-05-12-reviews-as-artifacts.md) for the workflow.
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

**Agent file discovery is session-bound.** Newly-created `.claude/agents/*.md` files are NOT discoverable via `subagent_type: <name>` in the same Claude Code session that creates them — the Agent tool loads its `subagent_type` registry at session start. Post-merge implementations that introduce new agent files (the effort-max iteration's `red-team-reviewer.md` and `spec-quality-reviewer.md`; future agent-file additions) cannot validate the new dispatch identifier in the session that lands the files. **Workaround:** dispatch with `subagent_type: general-purpose` + the full prompt template inline (the pre-effort-max dispatch pattern) for the rest of that session. Plan 1 mechanics smoke tests for new agent files must run in a fresh session, post-merge. The harness-level fix (agent-file hot-reload) is out of scope per `docs/out-of-scope.md`.

### Respondent posting discipline

After each `Code-review-followup:` commit on a spec/ADR PR, the controller posts a **respondent response** for each reviewer that posted on the PR. The respondent voice is a distinct GitHub App identity (`gcscode-respondent[bot]`) that documents the controller's per-finding dispositions for the round. The respondent is NOT a reviewer; it has no verdict; it carries the controller's voice for response purposes.

**Dispatch sequence** (controller obligation, integrates with the auto-dispatch obligation):

1. Push the `Code-review-followup:` commit to the PR's branch.
2. For each reviewer's most recent review on the PR (red-team Opus, red-team Sonnet, spec-quality — three responses total), post a respondent comment using the template at `.claude/reviewer-prompts/respondent.md`. Token: `export GH_TOKEN=$(.claude/scripts/gh-app-token-respondent)`. Verdict: `--comment`.
3. Re-dispatch the three reviewer subagents per the existing auto-dispatch obligation. Re-reviewers may engage with the respondent posts (optional engagement; see updated reviewer prompts).

**Response header convention** (mandatory):

```
## Respondent — re commit <SHA> — to <reviewer role> review by <reviewer model>
```

Where `<SHA>` is the followup commit, `<reviewer role>` is `red-team` or `spec-quality`, and `<reviewer model>` is the model that posted the review being responded to.

**Token + posting:**

```bash
GH_TOKEN=$(.claude/scripts/gh-app-token-respondent) gh pr review <PR> --comment --body "..."
```

**Identity:** `gcscode-respondent[bot]`. Distinct from `gcscode-reviewer[bot]`. Same posting permissions on PRs; different audit-trail attribution.

**Config:** App ID and installation ID live in `.claude/agent-config.json` under the `respondentApp` key (additive; reviewer's `githubApp` key untouched). Private key path is read from the `GH_RESPONDENT_APP_PRIVATE_KEY_PATH` env var; the PEM file never enters git.

**Open-question routing:** the respondent's response documents each open question's destination. The actual edit to `docs/roadmap.md` or `docs/out-of-scope.md` lands post-merge per the existing propagation pattern. Spec known-unknowns are edited inline as part of the followup commit (existing pattern). There is no dedicated open-question ledger file in v1; route to existing files via documented disposition.

**Initial-review round:** the respondent does NOT post on the initial-review round (before any followup commit). Initial reviews have nothing to dispose of yet. Respondent enters after the first followup commit.

**Discipline note:** the respondent's response is the controller's documented disposition. Skipping the respondent step on a followup commit makes the iteration's per-finding dispositions invisible — exactly the gap this iteration addresses. Treat the respondent post as required, not optional, on spec/ADR PRs.

**Out of scope for v1:** respondent subagent dispatch (controller writes directly), threaded inline replies on specific review comments (uses review-level comments), required re-reviewer engagement (engagement is optional in v1), and a dedicated open-question ledger file (routes to existing files). Each has its own future-iteration trigger in [`docs/specs/2026-05-16-review-discussion-loop-v1.md`](docs/specs/2026-05-16-review-discussion-loop-v1.md).

**Public repo note:** as with reviewer posts, respondent posts are world-readable. Keep them professional. Don't paste credentials, internal URLs, or sensitive context.

### Reviewer-role design conventions

When designing a new reviewer role (devil's advocate v2, expert reviewers, future expansions of the reviewer-role registry), apply these conventions. They emerged from the red-team v1 user-review pass and the reviews-as-artifacts mechanics validation (PR #1 + PR #3 on 2026-05-14). The four patterns generalize from one data point (red-team v1); the generalization is a forward-looking bet. Known unknown: which patterns hold up across the future expert-reviewer track. Adjust as evidence accumulates.

**Audit trail of priors inspected.** Any review section that compares the artifact against existing artifacts (CLAUDE.md, prior specs, ADRs, roadmap, out-of-scope) must require an explicit `Checked against:` enumeration with **specific anchors** — file + section heading, ADR slug, spec filename. Bare `CLAUDE.md` doesn't satisfy. Required even when no drift is flagged: without the audit trail, "nothing flagged" is indistinguishable from "didn't read the priors" — exactly the failure mode this discipline surfaces. The red-team prompt template (`.claude/reviewer-prompts/red-team.md`) is the canonical implementation.

**Mechanical / judgment split in live validation.** Live-validation pass criteria for a new reviewer role must require BOTH (a) mechanical compliance — header form, sections present, identity, verdict, audit-trail line populated — algorithmically verifiable, AND (b) judgment that the critique reflects engagement with the artifact, not engagement-theater. A reviewer that posts the mechanically-compliant structure but says "Nothing flagged" across every section fails (b) by default unless the artifact is genuinely so trivial that nothing of substance could be flagged. **v1: the user is the judge of (b).** Whether algorithmic alternatives, delegated agents, or sampled-spot-checks could substitute for user-as-judge is a known unknown; user-as-judge is the v1 default, not a permanent state-of-the-art claim.

**`identity` field in the registry, even when all roles share one bot.** Every entry in the reviewer-role registry carries an `identity` field. In v1 all roles share `gcscode-reviewer[bot]`, so the column is uniform — but it's there. Adding the field early is cheap; retrofitting when the future distinct-App-identities-per-reviewer-role iteration lands would mean editing every row.

**Tripwires for known-quality concerns.** Validation plans should include explicit detection mechanisms for concerns that are otherwise vibes-checks. Tripwire-worthy concerns are those (i) tied to a specific failure mode of the role (not generic critique-quality worries), (ii) observable in the review's structured output rather than requiring artifact-level human judgment, and (iii) detectable as a pattern across N PRs rather than per-PR. Example from the red-team spec's Plan 2: "if N consecutive ADR-PRs return all-silent red-team reviews, consider pulling ADR-PR from red-team's `targets` registry field." Tripwires are manual review items, not automated checks; they live in the spec's validation section.

#### Auto-dispatch controller obligations

The reviewer-role registry's `trigger` field declares WHEN a role fires (e.g., red-team's `trigger` is "Automatic on PR open"). In v1 there is no automated dispatcher; the controller (human or LLM session) honors the trigger. This checklist makes the controller's action points legible **for roles whose `trigger` is `Automatic on PR open`**. Other trigger forms (`After each task commit` for per-task reviewers; `End of iteration` for final cross-cutting) have their own existing dispatch patterns documented in "Subagent-driven plan execution" and "Subagent reviewer PR-posting discipline":

- **Before opening a `spec/<topic>` or `adr/<slug>` PR:** plan to dispatch THREE subagents immediately after `gh pr create`: `subagent_type: red-team-reviewer` (Opus 4.7, effort: max from agent file), `subagent_type: red-team-reviewer` with `model: sonnet` override (Sonnet 4.6, effort: max from agent file), and `subagent_type: spec-quality-reviewer` (Sonnet 4.6, effort: max from agent file). They dispatch in parallel (independent subagents). Do not consider the PR-open step complete until all three have posted their reviews.
- **After every `Code-review-followup:` commit on a spec/ADR branch:** (a) push the commit, (b) post respondent responses per the Respondent posting discipline subsection above — one per reviewer that has posted on the PR (three posts total for spec/ADR PRs with the current three reviewers), then (c) re-dispatch ALL THREE reviewer roles in parallel. Each role's re-review header includes `(re-review of <SHA>)` where `<SHA>` is the followup commit (existing convention). For the red-team multi-model pair, both Opus and Sonnet re-review independently. Note: a followup that does not touch content any reviewer commented on will still trigger all three re-dispatches AND all three respondent posts. v1 accepts the duplicative-review-and-response cost; if the pattern produces material noise, a future iteration can condition the obligations on whether the followup touches reviewed content for each role.
- **No automated enforcement in v1.** Convention-based; the obligation is the controller's. Detection of a skip is by user observation — a merged spec/ADR PR with no red-team review is the failure signature. Trigger to add automated enforcement: first observed silent skip on a real spec/ADR PR.

When new reviewer roles join the registry whose `trigger` is also `Automatic on PR open` (e.g., devil's advocate v2), append their obligations to this checklist alongside red-team's. Other trigger forms get their own checklist if/when they're added.

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
