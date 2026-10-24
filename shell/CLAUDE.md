# GCScode — agent guide

## What this repo is

A Svelte 5 SPA scaffolded as the shell for a VS Code–style ground control station (GCS). Extensions contribute UI fragments into named extension surfaces. First-party features will be built as extensions against the same public API used by third-party extensions later.

## Layout

pnpm workspace organized into three roles: `@gcscode/shell` (the app — owns bootstrapping and the extension registry), `@gcscode/extension-api` (the **only** import path for extensions — types and contracts), and a set of extension packages. The canonical worked-example extension is `@gcscode/extension-example` (the first extension ever written; new extension authors should read it first); the rest are first-party feature extensions (`extension-sitl`, `extension-map`, `extension-flight-overlay`, `extension-vehicle-status`, and others). See `packages/` for the current set.

Package root is the repo root. Shared tooling at the root: ESLint flat config, Prettier, and `tsconfig.base.json`. Each package extends these. `svelte.config.js` and `vite.config.ts` live in `packages/shell/` (Vite looks for them at its config's directory).

## Boundary rule — load bearing

**Extension packages import RUNTIME only from `@gcscode/extension-api`.** No runtime imports from `@gcscode/shell` or sibling extension packages. No relative imports that escape the package root.

**Type-only imports from sibling extension packages are allowed**, exclusively for consuming cross-extension `exports` (see [ADR-0005](docs/decisions/ADR-0005-extension-boundaries.md)). The runtime boundary stays preserved — `import type` is erased at compile time. Anything that emits JS at runtime against a sibling extension package is a violation.

ESLint enforces both rules (`@typescript-eslint/no-restricted-imports` with `allowTypeImports: true` for the sibling pattern). Don't work around either.

Corollary: if an extension needs a capability the host doesn't yet expose, first ask **whether the host would have to own the surface that capability mutates** ([ADR-0012](docs/decisions/ADR-0012-service-extensions-vs-host-namespaces.md)).

- **Platform concern** (the host must own it — contributions, commands, keybindings, extension lookup, configuration, and later events/themes/i18n/storage): add it to `@gcscode/extension-api` first — as a new method under an existing `ExtensionHost` namespace (`host.commands.*`, `host.window.*`, `host.keybindings.*`, `host.extensions.*`, `host.configuration.*`), as a new namespace if the capability is cross-cutting, or as a new field on `ExtensionContext` where it is per-extension-scoped rather than shared — land that, then use it.
- **Domain concern** (about what gcscode controls or displays — maps, assets, live state, video): ship it as a **service extension**, not a host namespace. Its own package exports the vocabulary types and the API; consumers `import type` from the sibling package and look up the live API via `host.extensions.getExtension<T>(id)?.exports`. A service extension exports types from its entry point, never its live registry.

Either way: never reach around the API.

## Conventions

- **Filenames:** kebab-case for everything, including `.svelte` components. Component import bindings remain PascalCase: `import ExampleView from './example-view.svelte'`.
- **Tests:** co-located `*.test.ts` next to the code they test.
- **Extension export name:** named `const` matching the extension's slug (`exampleExtension`, `telemetryExtension`, ...). Never `default`, never generic `extension`.
- **ADRs:** `docs/decisions/ADR-NNNN-<slug>.md`.
- **Specs:** `docs/specs/YYYY-MM-DD-<topic>.md` (not the brainstorming-skill default of `docs/superpowers/specs/`).
- **Plans:** `docs/plans/YYYY-MM-DD-<topic>.md` (not the writing-plans-skill default of `docs/superpowers/plans/`).
- **Architecture notes:** `docs/architecture/YYYY-MM-DD-<topic>.md`, indexed in `docs/architecture/README.md`. Informative, not normative: agents may use them as vocabulary and background, but never as requirements or design commitments. Decisions live in specs and ADRs.
- **Scratch:** `scratch/` is reserved for one-off exploration that shouldn't become real code. Gitignored.
- **Brainfarts:** `docs/brainfarts.md` is the user's personal scratch pad for half-formed ideas — agents must not treat anything in it as a requirement, commitment, or design input. If the user wants an idea pulled from there, they will say so explicitly.

## Branching and merging

- **Feature branches.** Implementation work runs on `feat/<topic>` branches off master. Plan commits can land on master directly (they're metadata about future work), as can architecture notes (informative background, not decisions); code commits live on a branch. Spec and ADR commits land via PR (see "Spec-PR workflow" and "ADR-PR workflow" below).
- **Spec-PR workflow.** Specs ship via `spec/<topic>` branches off master. Commit the spec file, run `pnpm lint:docs`, push, open a draft PR with the spec/ADR-PR template (in the reviewer-discipline section), and run "Review loop for spec/ADR PRs". User reads + approves. Merge via `gh pr merge --merge <num>` to preserve the merge-commit boundary, consistent with feature PRs. Bootstrap exception: the spec for the iteration that introduced this workflow (`docs/specs/2026-05-14-red-team-reviewer.md`) landed on master directly per the prior convention.
- **ADR-PR workflow.** ADRs ship via `adr/<slug>` branches. Pick the next ADR-NNNN number at branch creation; file named `ADR-NNNN-<slug>.md` under `docs/decisions/`. Same flow as spec-PR. ADRs needed mid-feature-iteration ship as their own PR first; the feat branch then references the merged ADR. Bootstrap exception: `ADR-0008-reviewer-role-registry.md` landed on master directly per the prior convention. **Parallel ADR-PRs may reference each other.** When two ADRs decide halves of one question (the ADR-0011 / ADR-0012 pair, 2026-10-16), each may link the other by filename even though the target does not exist on master until both merge; disclose the forward reference in both PR bodies so the red-team reports it as a known forward reference rather than a broken link; `pnpm lint:docs` will flag the link as unresolved until both merge.
- **PR workflow.** After the first task commit lands on the feat branch, push to `origin` and open a **draft** PR targeting master via `gh pr create --draft` (template in the reviewer-discipline section). Transition to ready-for-review (`gh pr ready <num>`) at end-of-iteration immediately before the final cross-cutting reviewer runs.
- **Post-merge implementation conventions.** When a spec-PR or ADR-PR merges, implementation follows the same conventions as any other change: feat branches (with the subagent-driven plan execution pipeline) for code or for changes that require judgment during implementation (decomposition, integration, file structure beyond what the spec specifies); direct master commits for purely mechanical CLAUDE.md or docs edits whose exact text is fully specified in the spec. The spec-PR's red-team review serves as the cross-cutting review of the behavioral change; the post-merge mechanical commit is execution-only. If you find yourself making decisions during the post-merge commit that the spec didn't make, stop and use a feat branch.
- **Merge via `gh pr merge --merge <num>`.** Produces the merge-commit boundary equivalent to local `--no-ff` — matches the `f448ddc Merge branch 'feat/plugin-architecture-mvp'` precedent.
- **Auto-merge on user approval.** The user opts a PR into automatic merging by adding the `auto-merge` label. The `.github/workflows/auto-merge.yml` workflow merges the PR when (a) the PR is not draft, (b) the label is present, (c) the head branch matches `feat/*`, `spec/*`, or `adr/*`, (d) the class-aware bot signal passes — for `feat/*` PRs `gcscode-final-review`'s latest verdict-bearing review is `APPROVED` (latest-review-per-user; only `APPROVED` and `CHANGES_REQUESTED` count as verdict-bearing, so a later `COMMENTED` cannot mask an approval and a `DISMISSED` review is not one). This replaced a `reviewDecision == APPROVED` check on 2026-10-20, which could never pass: GitHub computes `reviewDecision` only when the base branch has review requirements, and `master` is unprotected. The gate reads only the final reviewer, because a per-task reviewer's `--request-changes` is structurally unclearable — those roles may never post `--approve`, and GitHub clears `CHANGES_REQUESTED` only on a later `APPROVED` or a dismissal; for `spec/*` or `adr/*` PRs the latest review by `gcscode-red-team` ends with the line `Blocking: 0`, and so does the latest review by `gcscode-extension-architect` if it posted any (if blocking findings remain after two fix checks the gate stays shut and the owner decides), and (e) the PR is mergeable. Test branches (`test/*`) and other branches stay manual. Removing the label removes the auto-merge intent for any subsequent trigger. The fallback `gh pr merge --merge <num>` (the prior bullet) is always available. Spec: [`docs/specs/2026-05-14-auto-merge-on-user-approval.md`](docs/specs/2026-05-14-auto-merge-on-user-approval.md).
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

This pattern surfaces the same class of issues at three different points (implementer self-review, per-task spec/quality review, final cross-cutting review), and produces a legible `git log` where every followup is traced to the review note that prompted it. Don't squash followups into the originating commit — the review trail is part of the history. What the controller does with the findings those three points produce is its own discipline — see "Handling review findings — controller discipline" below, which exists because this pattern catching an issue is not the same as the controller grading it correctly.

Specs and ADRs now ship via their own PRs (see "Spec-PR workflow" and "ADR-PR workflow" in the Branching and merging section above) and go through "Review loop for spec/ADR PRs" below. Plans continue to land on master directly.

For docs-only iterations whose edits are fully specified by the spec (the 2026-04-27-roadmap precedent, most agentic-team-architecture iterations), the plan step is optional — see "Post-merge implementation conventions" in "Branching and merging" above for the canonical rule.

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

Every reviewer subagent dispatched during an iteration posts its review to the iteration's GitHub PR in addition to returning a summary to the controller. The PR is the durable artifact; the summary preserves the followup loop. Spec: [`docs/specs/2026-05-12-reviews-as-artifacts.md`](docs/specs/2026-05-12-reviews-as-artifacts.md).

**Feature-PR reviewers — dispatch prompt requirements.** The per-task spec-compliance and code-quality reviewers and the final cross-cutting reviewer run superpowers' own prompts, so the controller MUST include in every such dispatch:

- The PR number to post to.
- The token-helper invocation as a first step: `export GH_TOKEN=$(.claude/scripts/gh-app-token-reviewer <role-slug>)` where `<role-slug>` is `spec-compliance`, `code-quality` or `final-review`. Subsequent `gh` calls run under the corresponding per-role identity (`gcscode-<role-slug>[bot]`).
- The verdict the reviewer is allowed to use (see table below).
- **For the final cross-cutting review only:** that it must confirm every per-task `--request-changes` on the PR was addressed before approving. `feat/*` auto-merge keys on this role alone (gate 3a), so an open per-task block no longer stops a merge by itself — and per-task roles cannot clear their own blocks. A rule stated only in this file never reaches a dispatched reviewer, which is why it belongs in the prompt.
- The header convention.

**Spec/ADR-PR reviewers** (red-team, extension architect) are agent files that carry their own instructions, pinned model, token slug and header; a dispatch passes only variables. See "Review loop for spec/ADR PRs" below.

**Agentic-actor registry.** Source of truth for agentic-actor definitions. The verdict table below is a denormalized quick-reference view of the registry. Architectural rationale: [`docs/decisions/ADR-0009-agentic-actor-registry.md`](docs/decisions/ADR-0009-agentic-actor-registry.md) (supersedes [ADR-0008](docs/decisions/ADR-0008-reviewer-role-registry.md)). The `Model` column is the model to dispatch: a family alias for superpowers' reviewers, the ID pinned in the agent file for ours. `<model>` in a header is the model that actually ran (see below).

| Actor class | Role                | Kind          | Identity                           | Model             | Targets                    | Trigger                                                   | Routing condition                                     | Verdicts                         | Character                                                                                                                                                          | Header                                                    | Re-review / fix-check header                                          | Instructions                                                              |
| ----------- | ------------------- | ------------- | ---------------------------------- | ----------------- | -------------------------- | --------------------------------------------------------- | ----------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| reviewer    | Spec-compliance     | per-task      | `gcscode-spec-compliance[bot]`     | `sonnet`          | feature-PR                 | After each task commit                                    | always                                                | `--comment`, `--request-changes` | Verify implementation matches the task's spec slice                                                                                                                | `## Spec-compliance review — task <N> — <model>`          | `## Spec-compliance review — task <N> (re-review of <SHA>) — <model>` | `superpowers:subagent-driven-development/spec-reviewer-prompt.md`         |
| reviewer    | Code-quality        | per-task      | `gcscode-code-quality[bot]`        | `sonnet`          | feature-PR                 | After spec-compliance passes                              | always                                                | `--comment`, `--request-changes` | Code quality, idioms, edge cases                                                                                                                                   | `## Code-quality review — task <N> — <model>`             | `## Code-quality review — task <N> (re-review of <SHA>) — <model>`    | `superpowers:subagent-driven-development/code-quality-reviewer-prompt.md` |
| reviewer    | Final cross-cutting | cross-cutting | `gcscode-final-review[bot]`        | `opus`            | feature-PR                 | End of iteration                                          | always                                                | `--request-changes`, `--approve` | Cross-cutting concerns missed at per-task level; also confirms every per-task `--request-changes` was addressed, since `feat/*` auto-merge keys on this role alone | `## Final cross-cutting review — <model>`                 | `## Final cross-cutting review (re-review of <SHA>) — <model>`        | `superpowers:requesting-code-review/code-reviewer.md`                     |
| reviewer    | Red-team            | per-artifact  | `gcscode-red-team[bot]`            | `claude-opus-5-5` | spec-PR, ADR-PR            | On PR open; fix check after each followup                 | always                                                | `--comment` + `Blocking: N`      | Premise challenger + consistency with accepted decisions                                                                                                           | `## Red-team review — <spec or ADR> — <model>`            | `## Red-team fix check of <SHA> — <model>`                            | `.claude/agents/red-team-reviewer.md`                                     |
| reviewer    | Extension architect | per-artifact  | `gcscode-extension-architect[bot]` | `claude-opus-5-5` | product spec-PR and ADR-PR | On PR open; fix check only while it has blocking findings | heuristic: PR touches extension-architecture concerns | `--comment` + `Blocking: N`      | Principal-level architect on extensible hosts; reviews host↔extension boundary, lifecycle, isolation, IPC, discovery, conflicts, performance                       | `## Extension-architect review — <spec or ADR> — <model>` | `## Extension-architect fix check of <SHA> — <model>`                 | `.claude/agents/extension-architect-reviewer.md`                          |

`<SHA>` in a re-review or fix-check header is the **followup commit** being checked (the new commit added since the prior review).

**Verdict table:**

| Reviewer kind                                                      | `--comment` | `--request-changes` | `--approve` |
| ------------------------------------------------------------------ | :---------: | :-----------------: | :---------: |
| Per-task spec-compliance                                           |      ✓      |          ✓          |      ✗      |
| Per-task code-quality                                              |      ✓      |          ✓          |      ✗      |
| Final cross-cutting (end of iteration)                             |      ✗      |          ✓          |      ✓      |
| Red-team (per-artifact, spec/ADR-PRs)                              |      ✓      |          ✗          |      ✗      |
| Extension-architect (per-artifact, spec/ADR-PRs, heuristic-routed) |      ✓      |          ✗          |      ✗      |

Per-task reviewers may post `--comment` (clean or informational) or `--request-changes` (blocking), never `--approve`. The final cross-cutting reviewer is the only review allowed to flip the PR into approved state; it posts `--approve` or `--request-changes`, never `--comment`. Red-team and extension-architect always post `--comment`; their `Blocking: N` last line is what gates spec/ADR merges.

**Clearing a per-task `--request-changes`.** A per-task reviewer cannot clear its own block: the verdict table forbids it `--approve`, and GitHub clears `CHANGES_REQUESTED` only on a later `APPROVED` or a dismissal, so a `--comment` re-review — however clean — leaves the PR showing requested changes forever. When a per-task role's re-review comes back clean, **the controller dismisses that role's prior `--request-changes`**, with a dismissal message naming the re-review and the commit that resolved it. **"Clean" means the re-review's verdict was `--comment` rather than `--request-changes`** — the role's own judgment that the finding is resolved, not the controller's reading of it. Invocation:

```bash
gh api -X PUT "repos/<owner>/<repo>/pulls/<PR>/reviews/<review-id>/dismissals" \
  -f message="Superseded by this role's clean re-review of <SHA> (<timestamp>). <one line on what it verified>."
```

Get `<review-id>` from `gh api repos/<owner>/<repo>/pulls/<PR>/reviews --jq '.[] | select(.state=="CHANGES_REQUESTED") | "\(.id) \(.user.login) \(.submitted_at)"'`. The dismissal is attributed to whoever runs it, so it is a controller action, not a reviewer one. Dismissal does not delete the review: it stays in the timeline marked dismissed, so the audit trail survives, which is what "prior reviews stay in the PR timeline" protects. First applied on PR #34, where task 2's block had been resolved and cleanly re-reviewed 21 minutes later and still stood at merge time.

**The final cross-cutting review carries the merge gate, so it owns the per-task blocks too.** Since `feat/*` auto-merge keys on this role alone, its review must confirm that every per-task `--request-changes` on the PR was actually addressed before it approves — an open per-task block no longer stops a merge by itself. Raised by the final reviewer on PR #35.

**Re-review after a Code-review-followup commit (feature PRs):** controller re-dispatches the same reviewer role + model after the followup commit lands. The re-review posts a **new** review (`--comment` "addressed in `<SHA>`" or another `--request-changes`). Prior reviews stay in the PR timeline — reviewers never dismiss their own prior reviews. Spec/ADR PRs use fix checks instead (see "Review loop for spec/ADR PRs").

**Repo-relative paths in reviewer output (mandatory).** Reviewer subagents writing to GitHub PR comments MUST use repo-relative paths. Paths reference files from the git root (e.g., `shell/docs/specs/foo.md`, `.claude/scripts/gh-app-token-reviewer`, `.github/workflows/auto-merge.yml`). Absolute paths (`/Users/...`, `/home/...`, `/private/tmp/...`, etc.) MUST NOT appear in PR-comment output — not in file references, finding locations, or `Checked against:` items. **Exception — "the leak IS the finding":** when a reviewer is REPORTING a leaked path, the leaked path MUST be quoted inside a fenced code block AND explicitly flagged as a leak. **Controller dispatch prompts MUST NOT include absolute paths as orientation** — subagents echo what the controller tells them. Rationale: privacy (gcscode is a public repo; absolute paths leak the user's filesystem layout) and portability. Committed docs get the same check mechanically from `pnpm lint:docs`. Spec: [`docs/specs/2026-05-17-relative-paths-in-reviewer-output.md`](docs/specs/2026-05-17-relative-paths-in-reviewer-output.md).

**The model in the header is the model that actually ran.** A reviewer takes it from its own system prompt, which states the model it is running as. A controller never puts a model name in a dispatch prompt and an agent file never hard-codes one in a header: prescribed names go stale silently (reviews on PR #34 and PR #37 carry model names that did not write them), and the header exists so later evaluations can tell models apart.

**Review header convention** (mandatory so each bot identity's reviews stay role-legible):

```
## <Review kind> — task <N> (if per-task) — <model>
```

`<model>` is `Claude ` followed by the model name from the reviewer's own system prompt. Examples of the forms:

- `## Spec-compliance review — task 3 — <model>`
- `## Spec-compliance review — task 3 (re-review of abc1234) — <model>`
- `## Final cross-cutting review — <model>`
- `## Red-team review — spec — <model>`
- `## Red-team fix check of def5678 — <model>`
- `## Extension-architect review — ADR — <model>`
- `## Extension-architect review — out-of-scope skip — <model>`

**Merge gate (controller does NOT merge — the user does):** for feature PRs the convention is "do not merge unless the final cross-cutting review is `--approve`"; for spec/ADR PRs it is the stop rule in "Review loop for spec/ADR PRs". Human override allowed; if user merges despite open `--request-changes` reviews or blocking findings, leave a PR comment explaining why. The override is itself an artifact.

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

🤖 Reviews authored by per-role bot identities (`gcscode-spec-compliance[bot]`, `gcscode-code-quality[bot]`, `gcscode-final-review[bot]`) — see [docs/specs/2026-05-12-reviews-as-artifacts.md](../blob/master/shell/docs/specs/2026-05-12-reviews-as-artifacts.md) and [docs/specs/2026-05-16-per-role-bot-identities-for-reviewers.md](../blob/master/shell/docs/specs/2026-05-16-per-role-bot-identities-for-reviewers.md) for the workflow.
```

**Spec/ADR-PR template** (used for `spec/<topic>` and `adr/<slug>` PRs that ship via the spec-PR / ADR-PR workflows from "Branching and merging"):

```md
## <Spec or ADR title>

<one-line summary matching the artifact's first line>

## Links

- Related spec/ADR: …
- Related iteration (if any): …

## Reviewer instructions

Red-team reviews on PR open; the extension architect too when a product PR touches extension architecture. Each review ends `Blocking: N`. Fix checks follow each `Code-review-followup:` commit, at most two.

🤖 Reviews authored by per-role bot identities (`gcscode-red-team[bot]`, `gcscode-extension-architect[bot]`) — see [docs/specs/2026-10-22-review-loop-v2.md](../blob/master/shell/docs/specs/2026-10-22-review-loop-v2.md) for the workflow.
```

**Public repo note.** gcscode is public on GitHub. Reviewer comments are world-readable. Keep reviews professional. Don't paste sensitive context (credentials, internal URLs).

**Config locations:** App IDs and installation IDs live in `.claude/agent-config.json` under `reviewerApps.<role-slug>` (versioned). Private keys live at `$HOME/.config/gcscode/gcscode-<role-slug>.pem` (default); `GH_REVIEWER_APP_PRIVATE_KEY_DIR` is an optional override. PEM files never enter git.

**Agent files reload mid-session, with one gap.** Per the Claude Code docs, edits to an existing `.claude/agents/` file apply on the next dispatch without a restart. A directory that did not exist when the session started is not watched — and that includes the `.claude/agents/` of a worktree created or entered mid-session, so an agent file edited there cannot be dispatched under its own name. **Workaround:** dispatch the existing agent of the same role (or `subagent_type: general-purpose`) with the edited file's body inline. Confirmed by probe on Claude Code 2.1.309 (2026-10-24).

### Handling review findings — controller discipline

Dispatch mechanics, verdicts and re-review are above; this is what the controller does with the findings. It is where the containment iteration (PR #34) lost the most time, and every rule here is a failure that actually happened.

**A reviewer's severity grade is evidence, not a verdict.** Re-derive it. Specifically: **when a finding names a bypassed, missing or too-narrow guard, enumerate everything that guard protects before grading the finding.** The symptom a reviewer names is usually the narrowest consequence, and the grade tends to follow the symptom. Worked example: task 3's code-quality review graded a throwing `then` getter sitting outside `registry.activate`'s `try` as **Minor — "escapes unwrapped"**, an error-_type_ concern, and the controller accepted that framing and routed it to a propagation note. That `catch` also covered teardown, host revocation, and both registry-map writes, so the real consequence was an extension's contributions left live with the host unrevoked — falsifying the iteration's primary goal. The final cross-cutting review returned it as the one blocking finding; fixed in `4fea632`.

**"Exotic", "theoretical" and "unreachable" are claims to measure, not reasons to defer.** Write the probe first. Two of three such judgments in that iteration were wrong: the `then` getter above, and two `failureMessage` branches documented as unreachable which measurement turned into three reachable ones (`da64751`), because `activate` builds its `identity` from the manifest _before_ the containment window opens. Deferring is legitimate; deferring without the probe is not.

**Every deferral carries a trigger, and the trigger's own reachability is checked when it is written.** Two were wrong on arrival: the degrade-surface trigger ("the first extension that degrades in the field") had **already fired** when it was filed, and the hostile-manifest trigger named third-party extension loading when manifest-driven enable persistence would fire it sooner. A trigger nobody checks is a deferral with no end.

**A finding graded non-blocking can still be mandatory.** Severity expresses the reviewer's confidence about the code; whether it touches the iteration's central guarantee is the controller's call, and that call outranks the grade in both directions.

**Findings the controller declines to fix are recorded with the reason** — in the plan's propagation list or the spec's Known unknowns, not left in the PR archive. A decision that exists only in a review thread is invisible to the next reader, and the reader who needs it most is the one implementing the follow-up iteration.

**New tests are demonstrated failing, not asserted to fail.** Mutate the implementation, watch the _specific_ test fail for the right reason, restore, and report the mutation in the task report. PR #34 shipped **eight** assertions that could not fail, found one at a time — one of them in the plan's own prescribed test code, and one that the controller "fixed" into a second vacuous form. The final review's mutation sweep (25 mutations, 22 killed) found five more. Treat any new test that passes on its first run as suspect until it has been seen to fail.

**An equivalence test between two paths that share an implementation cannot catch a wrong shared answer.** If path A and path B both delegate to the same lookup, asserting `A(x) === B(x)` verifies agreement, not correctness — both sides agree on the same mistake. A value covered _only_ by such a test is therefore untested, and the test still passes when the shared answer is wrong, so it does not register as vacuous under the demonstrated-failing rule above. **The test for legitimacy is whether the compared sides share the decision logic under test** — not whether a spec exists to quote from. Two call sites that reduce to one shared helper prove nothing about that helper; two _independently written_ implementations compared to show a refactor preserved behaviour are legitimate, which is why differencing an old and a new module across a wide input space is good evidence while asserting `A(x) === B(x)` over a shared lookup is not. Where the sides do share logic, give every value an **absolute** expected answer, sourced from the spec rather than the implementation so the table is not tautological — and better, make a missing expected answer a _type_ error rather than a convention, which is what closed it here. Found empirically in the asset-abstraction-v0 iteration: a `MAV_TYPE` mapping asserted that the string and numeric forms agree, and **nineteen** values had agreement coverage with no correctness coverage — deleting a whole family member from the mapping rule left the entire suite green. The fix makes equivalence-only coverage inexpressible by pairing every row with its expected answer.

**When a review returns `--request-changes`:** the same implementer fixes it in a `Code-review-followup:` commit on the same branch (never an amend), the same role + model re-reviews, and once that re-review is clean the controller dismisses the prior block per "Clearing a per-task `--request-changes`" above. **A blocking finding is never downgraded silently.** Disagreeing with a reviewer is allowed and sometimes correct, but the disagreement and its evidence go in the dispatch prompt and the followup commit message, where the re-reviewer can contest them — not into a judgment the controller makes alone and does not write down.

Codified 2026-10-20 from PR #34 (host activation-failure containment) and PR #35 (the auto-merge feature gate).

### Review loop for spec/ADR PRs

A spec or ADR PR gets one round of review, then fix checks until nothing blocks or two fix checks have run. Spec: [`docs/specs/2026-10-22-review-loop-v2.md`](docs/specs/2026-10-22-review-loop-v2.md).

**Two kinds of PR.** A _product_ spec or ADR is about the app, its extensions or its API. An _agentic-process_ spec or ADR is about how gcscode is built: reviewers, the review loop, merge gates, agent prompts, the agentic-actor registry.

| PR kind                  | Round 1                                                                          | Fix checks                                                                |
| ------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Product spec/ADR         | `pnpm lint:docs`, red-team, and the extension architect when its routing matches | Red-team; the architect only if its latest review has `Blocking:` above 0 |
| Agentic-process spec/ADR | `pnpm lint:docs`, red-team                                                       | Red-team                                                                  |

**Steps.**

1. **Before opening the PR,** run `pnpm lint:docs` (from `shell/`) and fix what it reports. It checks the markdown changed against `origin/master`: relative links and heading anchors resolve, no `/Users/<name>` or `/home/<name>` paths, and a new spec or ADR has the required headings. `pnpm lint:docs --all` sweeps every file, history included.
2. **Open the draft PR** with the spec/ADR-PR template above, and push.
3. **Dispatch round 1** in parallel: `subagent_type: red-team-reviewer`, plus `subagent_type: extension-architect-reviewer` when routing matches. The message carries only variables: `PR`, `KIND` (`spec` or `ADR`) and `MODE: initial`. Never pass a prompt template or a model name; the agent file holds the instructions, the pinned model and the token slug.
4. **Fix** in one `Code-review-followup:` commit per round, whose message ends with a disposition table: one line for every finding still open in the reviewers' latest reviews.

   ```
   RT-1 fixed: shell/docs/specs/2026-10-22-foo.md
   RT-2 kept: <why the finding does not apply, or is not worth the change>
   EA-1 deferred: shell/docs/roadmap.md#considering
   ```

   A `deferred:` target must mention the finding ID (for example `(PR #38 EA-1)`), so the deferral can be found again. After committing and before pushing, run `.claude/scripts/check-dispositions.mjs <PR>`: it fails when an open finding has no line, a `fixed:` file is not in the commit, or a `deferred:` target does not mention the ID. Amend the unpushed followup until it passes. Disagreeing with a finding is allowed — say so in a `kept:` line with the evidence, where the fix check can contest it.

5. **Push, then dispatch fix checks** per the table, with `MODE: fix-check`, `FIX_SHA` and `PREVIOUS_REVIEW_ID` (the review id each reviewer returned). A fix check marks each earlier finding resolved, not resolved, or partly resolved with the places still wrong, and may raise new findings: in the fix diff, or anywhere if blocking.
6. **Stop** when every dispatched role's latest review ends `Blocking: 0`, or after two fix checks. Findings still open then go into the spec's Known unknowns with their IDs, in one last `Code-review-followup:` commit (`deferred: <spec path>#known-unknowns`). Then report to the owner and stop; don't ask how to close out.

**Findings format** (the agent files are authoritative): a numbered list in which each finding has an ID (`RT-3`, `EA-2`), `[blocking]` or `[non-blocking]`, a location, a one-line problem and a one-line fix; short reasoning for blocking findings only; and a last line `Blocking: N`. Blocking means it would cause a defect, a wrong decision or real rework if shipped as written. Drift from an earlier decision is non-blocking unless it contradicts an accepted ADR.

**Extension-architect routing** is the controller's judgment: dispatch when a product PR touches the extension API surface, the host↔extension boundary, lifecycle, isolation, communication, discovery, conflicts or the extension performance floor (signal list: [`docs/specs/2026-05-17-reviewer-routing-and-domain-expert.md`](docs/specs/2026-05-17-reviewer-routing-and-domain-expert.md#extension-architects-heuristic)). When unsure, dispatch: a wrong dispatch costs one out-of-scope skip, which ends `Blocking: 0` and needs no fix check. Re-evaluate when a followup brings extension architecture into scope. Never dispatch it on agentic-process PRs.

**Merging.** The owner merges, or applies the `auto-merge` label. Gate 3b in `.github/workflows/auto-merge.yml` passes when the latest red-team review ends `Blocking: 0`, and so does the latest extension-architect review if there is one. The label goes on only once every round-1 reviewer has posted; otherwise a red-team `Blocking: 0` can merge the PR before a slower architect review lands.

### Reviewer-role design conventions

When designing a new reviewer role (the simplicity reviewer on the roadmap, expert reviewers, future expansions of the agentic-actor registry), apply these conventions. They emerged from the red-team v1 user-review pass and the reviews-as-artifacts mechanics validation (PR #1 + PR #3 on 2026-05-14). The four patterns generalize from one data point (red-team v1); the generalization is a forward-looking bet. Known unknown: which patterns hold up across the future expert-reviewer track. Adjust as evidence accumulates.

**Audit trail of priors inspected.** A review that compares the artifact against existing artifacts (CLAUDE.md, prior specs, ADRs, roadmap, out-of-scope) must carry an explicit `Checked against:` line with **specific anchors** — file + section heading, ADR slug, spec filename. Bare `CLAUDE.md` doesn't satisfy. Required even when no drift is flagged: without the audit trail, "nothing flagged" is indistinguishable from "didn't read the priors" — exactly the failure mode this discipline surfaces. The red-team agent (`.claude/agents/red-team-reviewer.md`) is the canonical implementation.

**Mechanical / judgment split in live validation.** Live-validation pass criteria for a new reviewer role must require BOTH (a) mechanical compliance — header form, findings format, `Blocking: N` trailer, identity, verdict, audit-trail line populated — algorithmically verifiable, AND (b) judgment that the critique reflects engagement with the artifact, not engagement-theater. A reviewer that posts the mechanically-compliant structure but reports nothing fails (b) by default unless the artifact is genuinely so trivial that nothing of substance could be flagged. **v1: the user is the judge of (b).** Whether algorithmic alternatives, delegated agents, or sampled-spot-checks could substitute for user-as-judge is a known unknown; user-as-judge is the v1 default, not a permanent state-of-the-art claim.

**`identity` field in the registry, even when all roles share one bot.** Every entry in the agentic-actor registry carries an `identity` field. The reviewer-role registry's v1 (ADR-0008, 2026-05-14) had all reviewer roles sharing `gcscode-reviewer[bot]`; the column existed as a forward-looking field even when uniform. The per-role bot identities iteration (2026-05-16, [`docs/specs/2026-05-16-per-role-bot-identities-for-reviewers.md`](docs/specs/2026-05-16-per-role-bot-identities-for-reviewers.md)) filled per-row distinct values. Lesson: adding a structural field early — even when its values are uniform — costs less than retrofitting when the divergence iteration lands. Future reviewer-role registry expansions should preserve this discipline (e.g., a future `permissions` column added before per-role permissions diverge).

**Tripwires for known-quality concerns.** Validation plans should include explicit detection mechanisms for concerns that are otherwise vibes-checks. Tripwire-worthy concerns are those (i) tied to a specific failure mode of the role (not generic critique-quality worries), (ii) observable in the review's structured output rather than requiring artifact-level human judgment, and (iii) detectable as a pattern across N PRs rather than per-PR — with an explicit carve-out for **binary grep-able rules** where the failure is a single observable event (e.g., "any review body contains an absolute filesystem path"). For binary rules, N=1 is the correct threshold because the rule has no noise floor — a single observation IS the failure. The "across N PRs" guard applies to noise-prone signals (subjective judgments, vibes-checks, per-session experiences) where one observation could be coincidence. **A tripwire qualifies for the N=1 carve-out only when its final rule shape (after any carve-outs the designer adds) satisfies all three of:** (a) decidable in constant time on the review body's text (deterministic check, not a judgment about the review's argument), (b) no false-positive surface from legitimate use — checked on the final rule shape, NOT on a bare-grep approximation; if the unrefined rule has false positives, the rule needs tightening or an explicit carve-out before it qualifies, (c) the failure-signature is the rule's whole semantics (no "but maybe it was OK in context" interpretation). Tripwires that don't satisfy all three stay under the default "across N PRs" guard. Canonical example of the binary-rule carve-out: the leak-recurrence tripwire in [`docs/specs/2026-05-17-relative-paths-in-reviewer-output.md`](docs/specs/2026-05-17-relative-paths-in-reviewer-output.md). Example from the red-team spec's Plan 2: "if N consecutive ADR-PRs return all-silent red-team reviews, consider pulling ADR-PR from red-team's `targets` registry field." Tripwires are manual review items, not automated checks; they live in the spec's validation section.

### Non-goals propagate to `docs/out-of-scope.md`

When a spec lists cross-cutting deferrals — concepts the architecture is deliberately deferring, not just per-iteration scope cuts — those deferrals must land in `docs/out-of-scope.md` when the iteration ships, with an explicit trigger to revisit. Per-iteration scope omissions stay in the spec only; cross-cutting deferrals are the canonical list in `out-of-scope.md`.

The judgment: does this non-goal apply only to this iteration, or is it a deliberate "we're deferring this concept" decision affecting the whole architecture? Cross-cutting → propagate to `out-of-scope.md`. Specs should include a `docs/out-of-scope.md` propagation section listing the exact edits the iteration's docs commit will make — see the `## docs/out-of-scope.md propagation` section in `docs/specs/2026-04-26-phase-a2-commands.md` for the canonical bullet-list-of-edits format.

### Periodic housekeeping

After 2–3 feature iterations have shipped, run a housekeeping pass: open survey across alignment / sharpening / gaps, surface findings ordered by leverage, offer A/B/C cuts (smallest / medium / largest), then brainstorm + spec + plan + execute the chosen cut. The full procedure lives at `.claude/commands/housekeeping.md` (invoke via `/housekeeping`). Codified during the 2026-05-01 / 2026-05-02 sequence (`docs/specs/2026-05-01-vs-code-alignment-ledger.md` + `docs/specs/2026-05-01-extensionhost-namespacing.md`).

The pattern catches silent drift (stale READMEs, out-of-date out-of-scope language, unarticulated divergences from VS Code) before it accumulates, and surfaces decisions whose triggers are approaching (e.g., the namespacing 5–7 method threshold) so they get a focused brainstorm rather than a hurried call mid-feature. Don't run this for one-off questions or active feature work — periodic discipline only.

## Commands

- `pnpm dev` — run the shell's dev server
- `pnpm build` — build all packages
- `pnpm test` — run all tests in all packages, then the repo scripts' tests (`pnpm test:scripts`)
- `pnpm check` — svelte-check + tsc across all packages
- `pnpm lint` — ESLint + Prettier
- `pnpm lint:docs` — link, anchor, absolute-path and required-heading checks on changed markdown; run before opening a spec/ADR PR
- `pnpm format` — Prettier write

## Further reading

- `docs/roadmap.md` — phase plan + iteration status + planned feature extensions. Start here for "where are we now / what's next".
- `docs/out-of-scope.md` — canonical list of what is intentionally NOT built yet. Check here before building anything new.
- `docs/vs-code-alignment.md` — cumulative ledger of where gcscode aligns with and diverges from VS Code's extension architecture. Read alongside per-spec "VS Code alignment" tables.
- `docs/decisions/` — architecture decision records.
- `docs/architecture/` — dated architecture notes: established patterns and how they map onto gcscode. Informative background, not decisions.
- `packages/extension-api/README.md` — how to write an extension.
- `packages/extension-example/README.md` — the worked example to mirror.
- `.claude/commands/housekeeping.md` — `/housekeeping` slash command. Run periodically (every 2–3 iterations) to sweep for drift, sharpen rough edges, fill articulation gaps.
- `docs/specs/2026-05-12-reviews-as-artifacts.md` — first iteration of the agentic-team-architecture track: GitHub PR workflow + reviewer subagents posting under a GitHub App identity.
- `docs/specs/2026-05-14-red-team-reviewer.md` — second iteration of the agentic-team-architecture track: red-team reviewer on spec/ADR PRs + reviewer-role registry.
- `docs/decisions/ADR-0009-agentic-actor-registry.md` — registry pattern decision; source of truth for agentic-actor definitions (reviewers + non-reviewer controller-voice actors). Supersedes ADR-0008 (which remains in `docs/decisions/` as the historical record).
- `docs/decisions/ADR-0010-reviews-as-artifacts.md` — retroactive ADR (created 2026-05-25 for the 2026-05-12 decision) extracting the load-bearing architectural commitments from the reviews-as-artifacts iteration: GitHub PRs as the review substrate, reviewer subagents posting to the PR additively, GitHub App identity for reviewer posts. The substrate that ADR-0008/ADR-0009 and the agentic-team-track iterations build on.
- [`docs/decisions/ADR-0011-asset-vocabulary-and-registry.md`](docs/decisions/ADR-0011-asset-vocabulary-and-registry.md) — the asset abstraction's vocabulary: gcscode owns the words inside the boundary, MAVLink and STANAG 4586 are adapters held to two-source expressibility, one registry for every asset kind with no `kind` field, and identity as per-source namespaces with opaque registry-minted keys. Read before adding any asset-facing type.
- [`docs/decisions/ADR-0012-service-extensions-vs-host-namespaces.md`](docs/decisions/ADR-0012-service-extensions-vs-host-namespaces.md) — where a new capability goes: platform concerns (the host would have to own the mutated surface) are host namespaces; domain concerns are service extensions. The operative rule is restated in the boundary-rule corollary above.
- [`docs/specs/2026-10-22-review-loop-v2.md`](docs/specs/2026-10-22-review-loop-v2.md) — the current spec/ADR review loop: findings graded blocking or not, fix checks, the stop rule, disposition tables, and Gate 3b reading `Blocking: 0`.
- `.claude/agents/red-team-reviewer.md`, `.claude/agents/extension-architect-reviewer.md` — the spec/ADR reviewers; each file is the role's complete instructions.
- `.claude/agent-config.json` — App IDs and installation IDs for the per-role reviewer GitHub Apps (under the `reviewerApps` key, one sub-object per role-slug). Private keys live at `$HOME/.config/gcscode/gcscode-<role-slug>.pem`; `GH_REVIEWER_APP_PRIVATE_KEY_DIR` is an optional override (per [`docs/specs/2026-05-17-robust-default-paths-in-token-helpers.md`](docs/specs/2026-05-17-robust-default-paths-in-token-helpers.md)). PEM files never enter git.
- `.claude/scripts/gh-app-token-reviewer` — helper that generates short-lived installation tokens for per-role reviewer identities. Takes a role-slug argument; reviewers run `GH_TOKEN=$(.claude/scripts/gh-app-token-reviewer <role-slug>) gh pr review ...`.
- `.claude/scripts/check-dispositions.mjs` — checks a `Code-review-followup:` commit's disposition table against the PR's latest reviews.

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
