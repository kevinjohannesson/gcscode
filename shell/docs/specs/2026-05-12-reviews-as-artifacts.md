# Reviews as artifacts — GitHub PR workflow + agentic reviewer posting

**Status:** Approved (2026-05-12)

## Context

gcscode has dual purpose: it is the GCS extension architecture, and it is the substrate on which the user has been quietly experimenting with an agentic-team workflow. The dense docs, the slow paced iterations, the spec → plan → execute discipline, the per-task spec-compliance + code-quality reviewers in `superpowers:subagent-driven-development` — all of that has been the implicit meta-project. This iteration is the first deliberately-named step of that meta-project: making the workflow explicit and starting to invest in the team-of-agents architecture as work in its own right alongside feature iterations.

The triggering pain point: when subagent reviewers (spec-compliance + code-quality) review a per-task implementation today, their output is consumed by the controller and compressed into a short summary the user sees in chat. Across roughly 10 tasks per iteration, ~1–3 reviewer findings reach the user. The user has no direct visibility into what reviewers said that didn't make the summary, whether reviewers agreed with each other, or what was dismissed. The reviews exist, but they're not durable enough to inspect — they're filtered through the parent's compression. That is itself a "smoke-break" problem: the canonical record (controller summary) does not capture the underlying reasoning (full reviewer output).

The fix this iteration ships: make reviewer output land as a PR review on GitHub, alongside the controller's existing in-context summary. The PR becomes the durable artifact layer for code review. The controller's existing followup-loop is preserved — reviewers still return summaries — but the _record_ moves from chat transcript into the repo's GitHub state.

This is the first iteration of a multi-iteration arc. Earlier brainstorming via Claude cowork (Anthropic's chat product with local computer access) explored the broader vision — webhook routers, Linear integration, multi-model reviewers, override semantics — and that transcript informed the scoping decisions in this spec. Subsequent iterations on this track include auto-merge on user approval, a red-team reviewer for specs/plans/ADRs, and multi-model heterogeneous reviewers — each as its own brainstorm + spec + plan cycle.

## Why not the bigger version

The "cowork" arc as initially scoped on claude.ai included a webhook router, a queue, Linear integration, model heterogeneity, override semantics (ADR supersession by reviewer), and a multi-agent dispatcher. That is a multi-iteration roadmap, not a single spec. This iteration is the smallest concrete wedge that earns its keep: GitHub PRs become the artifact substrate, reviews become durable, and we learn what reviewers are actually saying before deciding whether the next problem to attack is independence-of-opinion (multi-model), event-driven dispatch (webhooks), or external work-tracking (Linear).

## Goals

- GitHub PR workflow replaces the existing local `git merge --no-ff feat/<topic>` integration step.
- Every reviewer subagent (per-task spec-compliance, per-task code-quality, final cross-cutting) posts its review to the PR as a structured GitHub PR review, in addition to returning a summary to the controller.
- Reviewer verdicts are honest: negative reviews use `--request-changes`, informational or clean reviews use `--comment`, and only the final cross-cutting reviewer may use `--approve`.
- Reviewer identity is a GitHub App (`gcscode-reviewer`), not the user's account — this is what lets the agent legitimately `--request-changes` on a PR the user authored.
- The end-to-end workflow is encoded in `CLAUDE.md` instructions plus a small token helper script; no new TypeScript code, no new slash commands.

## Non-goals

- **No Linear integration**, in any form, in this iteration.
- **No webhook routers / event-driven dispatch.** The controller (Claude session) remains the orchestrator; reviewers are spawned inline during the iteration.
- **No multi-model heterogeneous reviewers.** Reviewers continue to run as whatever model the controller picks (typically Sonnet). The "independence by model diversity" payoff is deferred to its own future iteration; this iteration is about making review _output_ durable so we can later measure independence honestly.
- **No override semantics.** ADR supersession by reviewer, `blocked-on-adr` labels, formal disagreement mechanisms (the "good mechanism" patterns in the prior cowork chat) are not built here.
- **No auto-merge on user approval.** Merge stays manual in this iteration; the small `pull_request_review` GitHub Action is its own follow-up iteration.
- **No spec/plan/ADR PRs.** Spec, plan, and ADR commits continue to land directly on `master` per existing `CLAUDE.md` convention. A future "red-team reviewer" iteration introduces spec-PR workflow.
- **No multiple GitHub Apps** for distinct reviewer identities per role. Single App, role/model disambiguated via review-text headers.
- **No `/open-iteration-pr` slash command.** Controller follows `CLAUDE.md` instructions and runs `gh pr create` directly. Add a command only if friction emerges.
- **No required CI checks / branch protection rules.** Merge gating is the user's judgment (informed by the final cross-cutting review verdict and any open `--request-changes` reviews).
- **No code changes to the gcscode source tree.** This iteration is workflow + tooling.

## Architecture and branching

The branching topology is unchanged from existing `CLAUDE.md` conventions:

- Spec, plan, and ADR commits land directly on `master`. They are NOT part of the PR.
- Code commits live on `feat/<topic>` branches off `master`.
- The PR targets `master` and is merged via `gh pr merge --merge <num>`, which produces a merge commit equivalent to the existing local `git merge --no-ff` precedent (preserves the feature boundary in `git log`).

What changes:

- After the **first** task commit lands on `feat/<topic>`, the controller pushes the branch to `origin` and opens a **draft** PR. Draft state signals "in progress," doesn't auto-request reviewers, and minimizes notification noise.
- The controller transitions the draft to "ready for review" immediately before dispatching the final cross-cutting reviewer at end-of-iteration.
- The user is the only human merger. Convention is "do not merge unless the final cross-cutting review is `--approve`," with the human override escape valve: if you merge despite open `--request-changes` reviews, leave a PR comment explaining why. The override is itself an artifact.

The "no force push to master" rule extends: **no force-pushing a PR branch once it has review comments.** Review comments anchor to commit SHAs; force-pushing breaks the audit trail.

## Reviewer identity — GitHub App

The agentic reviewers post under a dedicated GitHub App identity, not the user's account. Reason: GitHub prohibits PR authors from submitting `--approve` or `--request-changes` reviews on their own PR. Since the user pushes the feat branch, the user is the PR author; reviewing under the user's PAT would force every review to be `--comment` only, defeating the verdict-handling design.

A GitHub App is a non-author identity, can use `--request-changes` legitimately, satisfies GitHub's "no bots-only accounts" policy, and is the canonical answer for this use case.

### Setup (one-time, manual)

1. Create the App at `github.com/settings/apps/new`.
   - Name: `gcscode-reviewer` (or user-chosen).
   - Homepage URL: link to the gcscode repo.
   - Webhook: **deactivate** (no webhooks needed for this iteration).
   - Permissions (repository):
     - `pull_requests`: read & write
     - `contents`: read
     - `metadata`: read
   - Where can this GitHub App be installed: **Only on this account**.
2. Generate a private key. Download the PEM file. Store it locally **outside the repo** — e.g. `~/.config/gcscode/gcscode-reviewer.pem`. The PEM must never enter git.
3. Install the App on the gcscode repo. Record the installation ID from the URL after install.
4. Note the App ID from the App settings page.

### Versioned configuration

A single config file lives in repo at `.claude/agent-config.json`:

```json
{
  "githubApp": {
    "appId": "<App ID>",
    "installationId": "<installation ID>"
  }
}
```

App ID and installation ID are not secrets — they appear in the App's public URL and the install URL. Versioning them in the repo is fine.

### Private key path

The path to the PEM file is read from the `GH_APP_PRIVATE_KEY_PATH` environment variable. The user sets it in their shell rc / session env. Not in repo.

### Token helper

A small script at `.claude/scripts/gh-app-token`:

1. Reads `appId` + `installationId` from `.claude/agent-config.json`.
2. Reads private key path from `GH_APP_PRIVATE_KEY_PATH`.
3. Generates a JWT signed with the private key (10-minute expiry per GitHub docs).
4. Calls `POST /app/installations/<id>/access_tokens` to exchange the JWT for an installation token.
5. Prints the installation token to stdout.

Implementation language is a plan-phase detail. Two reasonable choices:

- **Bash + `openssl` + `jq` + `curl`**: minimal deps, fragile JWT signing in shell.
- **Small Python script** (~40 lines): more robust JWT handling via `cryptography` or `PyJWT`, requires Python with the dep available.

The plan should pick one and justify briefly. Either works.

### Usage in reviewer dispatch

Every reviewer subagent's dispatch prompt starts with the equivalent of:

```bash
export GH_TOKEN=$(.claude/scripts/gh-app-token)
```

Subsequent `gh` calls within the subagent run under the App's identity. The token's 1-hour lifetime is more than enough for a single review.

## Reviewer verdict handling

| Reviewer kind                          | `--comment` | `--request-changes` | `--approve` |
| -------------------------------------- | :---------: | :-----------------: | :---------: |
| Per-task spec-compliance               |      ✓      |          ✓          |      ✗      |
| Per-task code-quality                  |      ✓      |          ✓          |      ✗      |
| Final cross-cutting (end of iteration) |      ✗      |          ✓          |      ✓      |

Rationale:

- Per-task reviewers see a slice of the PR and should not approve the whole. Negative verdicts use `--request-changes`; clean or informational verdicts use `--comment`.
- The final cross-cutting reviewer is the only review allowed to flip the PR into "approved" state. It either approves or requests changes — pure verdict semantics, no `--comment`.

### Re-review after a Code-review-followup commit

When a per-task reviewer posts `--request-changes`, the controller dispatches a Code-review-followup implementer per the existing pattern. After the followup commit lands, the controller re-dispatches the **same reviewer role + model** to re-review the followup. The re-review posts a **new** review:

- A `--comment` saying "addressed in `<SHA>`" if the followup resolved the issue.
- Another `--request-changes` if it's still broken.

The prior `--request-changes` review **stays in the PR timeline** — reviewers never dismiss their own prior reviews. Empirically validated on PR #1 + PR #2 (2026-05-14): GitHub's `reviewDecision` does NOT use strict latest-review-per-user semantics. A subsequent `--comment` from the same user does NOT clear an earlier non-dismissed `--request-changes`. Only `--approve` from the same user clears it. So:

- Per-task reviewers (`spec-compliance`, `code-quality`) cannot self-clear their own blocking reviews via a `--comment` "addressed" re-review — the PR stays in `CHANGES_REQUESTED` until the final cross-cutting reviewer posts `--approve` at end-of-iteration.
- This is acceptable: the per-task `--comment` re-review is for the **audit trail** ("flagged X, addressed by SHA Y"), not for unblocking. The final cross-cutting reviewer is the only role with the verdict (`--approve`) that mechanically clears the PR.
- Important consequence for any future multi-bot extension: if a second bot identity is introduced, its un-dismissed `--request-changes` would gate independently — needs explicit dismissal semantics or different merge gate. (See `docs/specs/2026-05-14-red-team-reviewer.md` Future iterations.)

### Review header convention

Every review starts with a header that names the kind, the task (if per-task), and the model. This makes reviews self-describing on the PR, since the App identity alone can't distinguish reviewer roles.

```
## <Review kind> — task <N> (if per-task) — <reviewer model>
```

Examples:

- `## Spec-compliance review — task 3 — Claude Sonnet 4.6`
- `## Code-quality review — task 7 — Claude Sonnet 4.6`
- `## Final cross-cutting review — Claude Opus 4.7`

Re-reviews after followup commits include `(re-review of <prior SHA>)`:

- `## Spec-compliance review — task 3 (re-review of abc1234) — Claude Sonnet 4.6`

## Data flow — one iteration end-to-end

Per-iteration sequence with the new flow:

1. **Pre-iteration (unchanged):** brainstorm → spec commit on master → plan commit on master.
2. **Iteration start:** create `feat/<topic>` off master. Dispatch the first task's implementer per existing `superpowers:subagent-driven-development` pattern.
3. **First task commit lands on feat branch.** Controller:
   - Pushes `feat/<topic>` to `origin`.
   - Runs `gh pr create --draft --title "<spec slug>" --body "<templated body>"`.
   - Captures the PR number into working memory for subsequent dispatches.
4. **Per-task review pass.** Controller dispatches the spec-compliance reviewer with prompt including PR number and token-helper invocation. Reviewer:
   - Generates a token (`export GH_TOKEN=$(.claude/scripts/gh-app-token)`).
   - Reads the task spec section + diff.
   - Posts review via `gh pr review <num> --comment …` (clean) or `gh pr review <num> --request-changes …` (blocking).
   - Returns summary to controller.
   - Same flow for the code-quality reviewer.
5. **Followup loop (existing).** If any reviewer flagged blocking issues, controller dispatches a Code-review-followup implementer. After the followup commit lands, controller re-dispatches the same reviewers — they post fresh reviews. Prior `--request-changes` reviews stay in PR timeline.
6. **Tasks 2..N:** same per-task pattern.
7. **End of iteration:** controller marks PR as ready-for-review (`gh pr ready <num>`), then dispatches the final cross-cutting reviewer with PR number. Final reviewer reviews the whole branch diff, posts `--approve` or `--request-changes`.
8. **Merge gate:** user reads the PR on GitHub, decides to merge. Convention: only merge if final review is `--approve`. Human override allowed with explanatory PR comment.
9. **Merge:** `gh pr merge --merge <num>` (preserves the merge-commit boundary). PR closes; feat branch can be deleted (manually or via PR setting).

## PR template

The `gh pr create --body "..."` body for an iteration follows this shape:

```md
## Iteration

<one-line summary matching the spec's first line>

## Links

- Spec: [`docs/specs/YYYY-MM-DD-<topic>.md`](../blob/master/docs/specs/YYYY-MM-DD-<topic>.md)
- Plan: [`docs/plans/YYYY-MM-DD-<topic>.md`](../blob/master/docs/plans/YYYY-MM-DD-<topic>.md)
- ADRs (if any): …

## Reviewer instructions

Per-task reviewers post under task-headers. Final cross-cutting review posts at end of iteration.

🤖 Reviews authored by `gcscode-reviewer[bot]` — see [docs/specs/2026-05-12-reviews-as-artifacts.md](../blob/master/docs/specs/2026-05-12-reviews-as-artifacts.md) for the workflow that produced them.
```

The controller fills in the spec slug, the actual links, and the one-line summary. The reviewer-instructions footer is constant.

## `CLAUDE.md` changes

The following edits land alongside the App setup and helper script. Each is described as a target state rather than a diff; the plan-phase produces the actual diffs.

### Update "Branching and merging"

Replace the current bullets with:

- **Feature branches.** Implementation work runs on `feat/<topic>` branches off master. Spec/plan/ADR commits land on master directly (metadata about future work); code commits live on a branch.
- **PR workflow.** After the first task commit lands on the feat branch, push to `origin` and open a **draft** PR targeting master via `gh pr create --draft` (see the spec for the template). Transition to ready-for-review at end-of-iteration immediately before the final cross-cutting reviewer runs.
- **Merge via `gh pr merge --merge <num>`.** Produces the merge-commit boundary equivalent to local `--no-ff` (matches the `f448ddc Merge branch 'feat/plugin-architecture-mvp'` precedent).
- **No force push to master.** No force-push to PR branches once they have review comments either — review threads anchor to commit SHAs.
- **Never `--no-verify`.** Same rule as before.

### Add "Subagent reviewer PR-posting discipline"

A new section under the existing subagent-driven-development guidance. Content:

- Every reviewer subagent dispatched during an iteration (per-task spec-compliance, per-task code-quality, final cross-cutting) receives the PR number in its prompt.
- Every reviewer's prompt includes the token-helper invocation as a first step: `export GH_TOKEN=$(.claude/scripts/gh-app-token)`. Subsequent `gh` calls run under the `gcscode-reviewer[bot]` identity.
- Per-task reviewers may post `--comment` or `--request-changes`, never `--approve`. The final cross-cutting reviewer posts `--approve` or `--request-changes`, never `--comment`.
- Every review uses the standard header convention (see Reviewer verdict handling).
- Reviewer subagents **also** return a textual summary to the controller. PR posting is purely additive; the existing followup loop is preserved by the summary.
- Reviewers never dismiss their own prior reviews; re-reviews post fresh.

### Add "Public repo note"

gcscode is public on GitHub. Reviewer comments are world-readable. Keep reviews professional. Don't paste sensitive context (credentials, internal URLs, etc.) — for a Svelte SPA this is unlikely but worth the standing reminder.

### Add `.claude/agent-config.json` reference

One sentence under "Further reading" or as part of the reviewer discipline: `.claude/agent-config.json` holds the App ID and installation ID for the reviewer GitHub App. Private key path is read from `GH_APP_PRIVATE_KEY_PATH`.

## VS Code alignment

Mostly N/A — this iteration touches workflow tooling, not the gcscode extension API. No new contribution kinds, no namespace changes, no behavioral changes for extensions. The VS Code alignment ledger (`docs/vs-code-alignment.md`) is not affected.

For completeness: VS Code's own development uses GitHub PRs with bot-authored CI/review comments. Our pattern is similar in spirit (agentic reviewer as a bot identity on PRs), which is incidental rather than load-bearing.

## `docs/out-of-scope.md` propagation

The following cross-cutting deferrals propagate to `docs/out-of-scope.md` when this iteration ships. Per-iteration deferrals stay in this spec only.

- **Linear integration** — work tracking outside GitHub is deferred. Trigger to revisit: gcscode iterations start spawning enough tickets that GitHub Issues alone is painful.
- **Webhook routers / event-driven dispatch** — beyond the narrow auto-merge GitHub Action (its own follow-up iteration), there is no off-session event handling. Trigger: the user wants agents to react to events while no Claude session is live.
- **Multi-model heterogeneous reviewers** — single-model reviewers per role for now. Trigger: durable reviews (this iteration) accumulate enough evidence to evaluate independence-of-opinion concretely; its own brainstorm iteration follows.
- **Override semantics for agentic reviewers** — no formal "reviewer supersedes ADR" patterns (`blocked-on-adr` labels, counter-proposal ADR PRs, etc.). Trigger: a reviewer actually wants to block an iteration on architectural disagreement.
- **Spec/plan/ADR PR workflow** — these continue to land on master directly. Trigger: the planned red-team-reviewer iteration introduces spec-PR workflow.

## Validation

Not code tests — this iteration is a workflow change.

**Live validation on the _next_ gcscode iteration, not on this one.** Implementing this iteration itself uses the old flow (local feat branch + in-context reviews) because the GitHub App, token helper, and `CLAUDE.md` updates do not exist until this iteration ships. The first iteration to use the new flow is whichever roadmap item ships next (likely a small feature extension iteration from `docs/roadmap.md`).

Pass criteria for the first iteration that uses the new flow:

- PR exists with all per-task reviews + final cross-cutting review visibly attached as PR reviews.
- `--request-changes` reviews posted by the App show as blocking in PR UI (verifies App-as-non-author works as expected — this is the known unknown).
- Followup re-reviews supersede the prior blocking state in PR status while leaving the prior review intact in the timeline.
- Final review can `--approve` and that approval is visible in PR UI.
- Merge via `gh pr merge --merge` (or GitHub UI's "Create a merge commit" option) preserves the merge-commit boundary in master's git log.

**Rollback plan.** The new flow is encoded in `CLAUDE.md` updates + a config file + a helper script + a GitHub App. If something blocks mid-iteration, revert by skipping the PR step and merging locally per the old `--no-ff` convention. Reverting `CLAUDE.md` is one commit; the App remains installed harmlessly until next use.

## Known unknowns

- **App-as-reviewer `--request-changes` semantics.** GitHub's documented behavior is that any non-author identity can submit a blocking review. We've not tested this from a GitHub App on a public repo with the user as PR author. The first review of the first iteration that uses the new flow validates this. Fallback if it doesn't work as expected: revise the verdict-handling table to use `--comment` with a header-text severity convention (`**BLOCKING**`) for the verdict that doesn't render correctly. Tracked in the validation plan above.
- **Token helper implementation language.** Bash+openssl vs small Python script — to be decided in the plan phase. Either works; choice affects only the script's robustness and the user's machine setup.
- **Review noise volume.** Roughly 10 tasks × 2 per-task reviewers + 1 final = ~21 review-comment events per iteration in the steady state. PRs handle this volume gracefully (review threads collapse, timelines scroll), but if the noise feels excessive, a future iteration could batch per-task reviews into fewer aggregate posts. Not addressing here.

## Future iterations on the agentic-team track

Each gets its own brainstorm + spec cycle. Listed here for legibility, not as commitments.

1. **Auto-merge on user approval** — a single `.github/workflows/auto-merge.yml` triggered on `pull_request_review.submitted`. Checks that the approving review is the user's AND the final cross-cutting reviewer's last review is `--approve`. Calls `gh pr merge --merge`. ~20 lines. Immediate follow-up.
2. **Red-team reviewer for specs/plans/ADRs** — introduces spec-PR workflow + a new "red-team" agent role that critiques spec/plan/ADR commits before they're accepted to master. Implies specs no longer land directly on master.
3. **Multi-model heterogeneous reviewers** — first iteration to validate the independence-of-opinion premise concretely now that reviews are durable. Runs Opus + Sonnet (or one Claude + one non-Claude) on the same PR; compares outputs. Chooses steady-state model assignment per reviewer role based on findings.

Beyond these: Linear integration, webhook routing, formal override semantics, distinct App identities per reviewer role. Each is its own brainstorm when triggered.

Note on distinct App identities: the current single-bot workflow reaches `APPROVED` end-state without dismissing prior `--request-changes` reviews because GitHub's `reviewDecision` uses latest-review-per-user semantics. Validated empirically on PR #1 (2026-05-14). A future multi-bot extension loses this property — a second identity's un-dismissed `--request-changes` gates the PR independently. That branch needs explicit dismissal semantics, branch-protection tuning, or a different merge gate.

## Origin

Earlier brainstorming via Claude cowork explored the broader agentic-team vision (event-driven dispatch, Linear, multi-model reviewers, override semantics). That transcript informed both the scoping decisions in this spec — what to defer, what to ship first — and the planned follow-up iterations listed above. The transcript itself is not committed to the repo; it lives in the user's claude.ai chat history.
