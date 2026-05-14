# Auto-merge on user approval

**Slug:** auto-merge-on-user-approval
**Iteration on the agentic-team track:** fifth, after [`docs/specs/2026-05-12-reviews-as-artifacts.md`](2026-05-12-reviews-as-artifacts.md), [`docs/specs/2026-05-14-red-team-reviewer.md`](2026-05-14-red-team-reviewer.md), [`docs/specs/2026-05-14-reviewer-role-design-conventions.md`](2026-05-14-reviewer-role-design-conventions.md), and [`docs/specs/2026-05-14-spec-quality-reviewer.md`](2026-05-14-spec-quality-reviewer.md).
**Type:** new GitHub Action workflow; small CLAUDE.md update.
**No bootstrap exceptions.** Spec ships via spec-PR workflow (first iteration with both red-team AND spec-quality auto-dispatching in parallel on a real spec PR); implementation lands per the post-merge implementation convention.

## Context

The reviews-as-artifacts iteration spec (2026-05-12) listed auto-merge on user approval as the "Immediate follow-up": "a single `.github/workflows/auto-merge.yml` triggered on `pull_request_review.submitted` … merges when user approves AND the final cross-cutting reviewer's last review is `--approve`." That iteration's roadmap entry remained on the agentic-team track's "Queued" list while the red-team-reviewer + reviewer-role-design-conventions + spec-quality-reviewer iterations shipped first. The architecture has matured significantly in the interim — there are now four reviewer roles, two PR classes (feature-PR and spec/ADR-PR), and a clearer post-merge implementation convention. This iteration finally lands auto-merge with that mature architecture as its base.

Currently every merge in gcscode is manual: after the final cross-cutting reviewer `--approves` (or after the user approves a spec/ADR PR's red-team + spec-quality reviews), the user runs `gh pr merge --merge <num>` to land the work on master. The manual step is small but adds friction at the end of every iteration. Auto-merge removes that step: the user signals "merge when ready" via a label; the workflow handles the rest.

**Constraint shaping the design:** the user is the PR author on every gcscode PR. GitHub blocks PR authors from submitting `--approve` reviews on their own PRs. So "user approves" can't be a GitHub review action — it has to be a non-review signal. This iteration uses an `auto-merge` label as the signal.

## Why not the bigger version

The bigger version would include:

- **Branch protection rules** that require status checks before merge.
- **CI integration** so the workflow waits on green checks (no CI exists yet in gcscode).
- **Override mechanism** for force-merging despite failed gates.
- **Configurable per-PR-class gates** (e.g., per-role required-approvals on spec/ADR PRs once verdict promotion lands).
- **Auto-merge for non-`feat`/`spec`/`adr` branches** (test/*, fix/*, etc.).

That's a multi-iteration roadmap, not a single spec. This iteration ships the smallest concrete wedge: a workflow that handles the two existing PR classes with their existing gates. CI integration, override semantics, and branch protection happen in their own iterations when triggered.

## Goals

1. Add `.github/workflows/auto-merge.yml` that merges a PR when:
   - The `auto-merge` label is present on the PR (user's opt-in signal), AND
   - The PR's `headRefName` matches a recognized class (`feat/*`, `spec/*`, or `adr/*`), AND
   - For feature PRs only: the `gcscode-reviewer` bot's latest review state is `APPROVED`, AND
   - The PR is mergeable (no conflicts).
2. Workflow uses `gh pr merge --merge --delete-branch` (preserves merge-commit boundary per CLAUDE.md "Branching and merging"; deletes the branch on origin as tidy-up).
3. Workflow is **uniform across both PR classes** (label gate applies to both; bot gate is class-aware).
4. Update CLAUDE.md "Branching and merging" with a one-bullet note documenting the auto-merge convention.

## Non-goals (this iteration)

Each has its own future trigger.

- **Branch protection rules.** This is a workflow, not a GitHub-native gate. Branch protection (requiring status checks before merge, restricting force-push, etc.) is a separate decision worth its own brainstorm. Trigger: first observed bypass of the workflow's intent (e.g., user merges without the label and regrets it).
- **CI integration.** No CI exists yet; auto-merge doesn't wait on any status check. Trigger: when CI lands (per the out-of-scope.md entry).
- **Override mechanism.** No "force-merge despite failed gates" path. If a user wants to merge without auto-merge, they remove the label and run `gh pr merge` manually — the existing fallback is preserved. Trigger: a real case where manual fallback is insufficient.
- **Per-role required-approvals on spec/ADR PRs.** Spec/ADR PRs currently have no required bot gate (red-team + spec-quality are advisory `--comment` only). When verdict promotion happens, the workflow's class-aware gate logic extends to require bot `--approve` on spec/ADR PRs too. Trigger: verdict-promotion iteration ships.
- **Auto-merge for non-`feat`/`spec`/`adr` branches.** Test branches (e.g., the permanent reference artifacts `test/reviews-as-artifacts-validation`, `test/red-team-iteration-validation`, `test/spec-quality-iteration-validation`) and ad-hoc branches stay manual. Workflow exits cleanly if `headRefName` doesn't match. Trigger: a real use case for auto-merging another branch class.
- **Auto-delete-branch override.** Workflow always uses `--delete-branch`. If the user wants to keep a branch alive post-merge (e.g., for reference), they don't add the `auto-merge` label and merge manually instead. Trigger: a recurring desire to keep merged branches.

## Architecture

One new workflow file at `.github/workflows/auto-merge.yml`. One small bullet added to `shell/CLAUDE.md` "Branching and merging" describing the auto-merge convention.

### Trigger events

The workflow listens on TWO events so it fires after either signal change:

- `pull_request_review` with `types: [submitted]` — fires when any review is submitted (bot or user). Re-checks all gates; merges if satisfied.
- `pull_request` with `types: [labeled]` — fires when any label is added (including `auto-merge`). Re-checks all gates; merges if satisfied.

Both events have `github.event.pull_request.number` (for `pull_request.labeled`) or `github.event.review.pull_request.number` (for `pull_request_review.submitted`). The workflow handles both via `${{ github.event.pull_request.number || github.event.review.pull_request.number }}`.

### Gates (must ALL pass for merge)

The workflow checks gates sequentially. Any gate failure → exit cleanly with a log line; no merge.

**Gate 1: `auto-merge` label present.** Reads the PR's labels; checks for an entry named `auto-merge`. Absent → exit. Present → continue.

**Gate 2: PR class is recognized.** Reads `headRefName`. If it matches `feat/*` → feature PR (bot gate required); `spec/*` or `adr/*` → spec/ADR PR (no bot gate); anything else → exit. This filter explicitly keeps `test/*`, ad-hoc branches, and any future patterns out of auto-merge.

**Gate 3: Bot approval (feature PRs only).** For feature PRs, looks at the `gcscode-reviewer` bot's latest review on the PR. If its state is `APPROVED` → continue. Otherwise → exit. Per the latest-review-per-user GitHub semantics confirmed in PR #1's validation, this `APPROVED` state overrides any earlier `--request-changes` from the bot during per-task reviews.

For spec/ADR PRs, this gate is skipped (red-team and spec-quality are advisory `--comment` only in v1; neither can `--approve`).

**Gate 4: PR is mergeable.** Reads `mergeable`. If `MERGEABLE` → proceed. Otherwise → exit (likely a merge conflict; user resolves manually).

### Merge action

If all four gates pass:

```bash
gh pr merge "$PR_NUMBER" --merge --delete-branch
```

`--merge` preserves the merge-commit boundary per CLAUDE.md "Branching and merging" convention. `--delete-branch` removes the source branch from origin after merge.

### Permissions

The workflow uses the default `GITHUB_TOKEN` provided by GitHub Actions, with explicit permissions:

- `contents: write` — required for the merge to write to the base branch.
- `pull-requests: write` — required to merge via the PR API.

No GitHub App token needed — this workflow doesn't post reviews; it just executes the merge. The default token's write scope on the runner has the auth needed.

### Edge cases

- **Bot hasn't approved yet (feature PR), label is present.** Gate 1 + 2 pass; gate 3 fails. Workflow exits. When bot subsequently `--approves`, the `pull_request_review.submitted` event fires; workflow re-runs; gate 3 now passes; merge.
- **Label added AFTER bot has already approved.** Workflow fires on `pull_request.labeled` event; all gates pass on this run; merges immediately.
- **Label removed mid-flight.** No event triggers in our subscription (`labeled` only, not `unlabeled`). The label-removal itself doesn't fire the workflow. If a subsequent review event fires, the workflow re-checks and finds no label → exits cleanly. No accidental merges.
- **PR is in draft state.** `gh pr merge` refuses to merge a draft PR; workflow logs the failure and exits. User must mark the PR ready-for-review first (also part of the existing convention).
- **PR has merge conflicts.** Gate 4 fails (`mergeable` is `CONFLICTING` or similar); workflow exits cleanly. User resolves conflicts and either re-pushes (triggering the gate logic via subsequent review/label events) or merges manually.
- **Workflow itself fails (e.g., YAML syntax error, runner outage).** No merge happens; user can still run `gh pr merge` manually. The fallback path is always preserved.

## The workflow file verbatim

Per the post-merge implementation convention, the implementation lands as a direct-master commit; the full workflow content is specified here verbatim:

````yaml
name: Auto-merge

# Auto-merges PRs when:
# 1. The `auto-merge` label is present (user's opt-in signal).
# 2. The PR's headRefName is `feat/*`, `spec/*`, or `adr/*`.
# 3. For `feat/*` PRs only: the `gcscode-reviewer` bot's latest review state is APPROVED.
# 4. The PR is mergeable (no conflicts).
#
# Spec: docs/specs/2026-05-14-auto-merge-on-user-approval.md

on:
  pull_request_review:
    types: [submitted]
  pull_request:
    types: [labeled]

permissions:
  contents: write
  pull-requests: write

jobs:
  auto-merge:
    runs-on: ubuntu-latest
    steps:
      - name: Check gates and merge
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          PR_NUMBER: ${{ github.event.pull_request.number || github.event.review.pull_request.number }}
        run: |
          set -euo pipefail

          if [[ -z "${PR_NUMBER:-}" ]]; then
            echo "Could not determine PR number from event payload. Exiting."
            exit 0
          fi
          echo "Evaluating PR #${PR_NUMBER}"

          PR_JSON=$(gh pr view "$PR_NUMBER" --json headRefName,labels,reviews,mergeable,isDraft)
          HEAD_REF=$(echo "$PR_JSON" | jq -r .headRefName)
          IS_DRAFT=$(echo "$PR_JSON" | jq -r .isDraft)
          MERGEABLE=$(echo "$PR_JSON" | jq -r .mergeable)
          HAS_LABEL=$(echo "$PR_JSON" | jq -r '[.labels[] | select(.name == "auto-merge")] | length')

          # Gate 1: auto-merge label present
          if [[ "$HAS_LABEL" == "0" ]]; then
            echo "Gate 1 FAILED: auto-merge label not present. Exiting cleanly."
            exit 0
          fi
          echo "Gate 1 OK: auto-merge label present"

          # PR must not be draft (gh pr merge refuses drafts, but check explicitly for clearer log)
          if [[ "$IS_DRAFT" == "true" ]]; then
            echo "Pre-gate FAILED: PR is in draft state. Exiting cleanly."
            exit 0
          fi

          # Gate 2: PR class detection
          case "$HEAD_REF" in
            feat/*)
              echo "Gate 2 OK: feature PR (head=${HEAD_REF}); bot gate required"
              NEED_BOT_APPROVE=true
              ;;
            spec/*|adr/*)
              echo "Gate 2 OK: spec/ADR PR (head=${HEAD_REF}); no bot gate"
              NEED_BOT_APPROVE=false
              ;;
            *)
              echo "Gate 2 FAILED: head '${HEAD_REF}' is not feat/, spec/, or adr/. Exiting cleanly."
              exit 0
              ;;
          esac

          # Gate 3: bot approval (feature PRs only)
          if [[ "$NEED_BOT_APPROVE" == "true" ]]; then
            LATEST_BOT_REVIEW=$(echo "$PR_JSON" | jq -r '[.reviews[] | select(.author.login == "gcscode-reviewer")] | last | .state // "none"')
            if [[ "$LATEST_BOT_REVIEW" != "APPROVED" ]]; then
              echo "Gate 3 FAILED: bot's latest review state is '${LATEST_BOT_REVIEW}' (expected APPROVED). Exiting cleanly."
              exit 0
            fi
            echo "Gate 3 OK: bot's latest review is APPROVED"
          else
            echo "Gate 3 SKIPPED (spec/ADR PR; no bot gate)"
          fi

          # Gate 4: PR is mergeable
          if [[ "$MERGEABLE" != "MERGEABLE" ]]; then
            echo "Gate 4 FAILED: PR mergeable state is '${MERGEABLE}' (expected MERGEABLE). Exiting cleanly."
            exit 0
          fi
          echo "Gate 4 OK: PR is mergeable"

          # All gates pass — merge
          echo "All gates passed; merging PR #${PR_NUMBER} via --merge --delete-branch"
          gh pr merge "$PR_NUMBER" --merge --delete-branch
````

## CLAUDE.md changes

One small bullet added to "Branching and merging", immediately after the existing "Post-merge implementation conventions" bullet (so all the merge-related conventions sit together):

```
- **Auto-merge on user approval.** The user opts a PR into automatic merging by adding the `auto-merge` label. The `.github/workflows/auto-merge.yml` workflow merges the PR when (a) the label is present, (b) the head branch matches `feat/*`, `spec/*`, or `adr/*`, (c) for `feat/*` PRs the `gcscode-reviewer` bot's latest review state is `APPROVED`, and (d) the PR is mergeable. Test branches (`test/*`) and other branches stay manual. Removing the label removes the auto-merge intent for any subsequent trigger. The fallback (`gh pr merge --merge <num>` manually) is always available. Spec: [`docs/specs/2026-05-14-auto-merge-on-user-approval.md`](docs/specs/2026-05-14-auto-merge-on-user-approval.md).
```

## Post-merge implementation

Per the post-merge implementation convention, two direct-master commits after merge of this spec-PR:

- **Commit 1: Create `.github/workflows/auto-merge.yml`** with the verbatim content shown above.
- **Commit 2: Add the "Auto-merge on user approval" bullet** to `shell/CLAUDE.md` "Branching and merging" section, immediately after the existing "Post-merge implementation conventions" bullet (verbatim text specified above).

## Data flow — how this iteration ships

1. Brainstorm → spec → spec-PR. **Third iteration shipping via the spec-PR workflow** (after reviewer-role-design-conventions and spec-quality-reviewer).
2. **On PR open: BOTH red-team AND spec-quality auto-dispatch in parallel** per the canonical convention. This is the **first run of the parallel-dispatch obligation on a real spec PR** with both reviewers actually existing. (Prior parallel-dispatch was the mechanics smoke test PR #6.) Plan 2 live validation for spec-quality fires automatically here.
3. User reads both reviews + approves the spec. If either reviewer flags anything substantive, controller does Code-review-followup commit and re-dispatches BOTH roles per the obligation.
4. User merges via `gh pr merge --merge` (manually — auto-merge doesn't exist yet for THIS PR, since it's the iteration introducing auto-merge; bootstrap exception is implicit in "this PR predates its own machinery"). Post-merge of THIS PR, future PRs can use the `auto-merge` label.
5. Post-merge implementation: two direct-master commits per the post-merge implementation convention (verbatim content specified above).
6. The first PR opened after this iteration ships that gets the `auto-merge` label is the live validation (Plan 2 below).

## Validation

Two plans, both light.

### Plan 1: Mechanics smoke test (scripted)

A throwaway test branch deliberately chosen to NOT match `feat/*`, `spec/*`, or `adr/*` — verifies the class-check gate (gate 2) correctly excludes non-matching branches.

- **Branch:** `test/auto-merge-validation` off master.
- **Content:** a trivial file change.
- **PR opened** with the spec/ADR-PR template (so red-team + spec-quality auto-dispatch fires; document is reviewed).
- **Test action:** add the `auto-merge` label.
- **Expected:** workflow fires on the `labeled` event; gate 1 passes (label present); gate 2 FAILS (head is `test/auto-merge-validation`, not feat/spec/adr); workflow exits cleanly without merging. Verify in the workflow run logs that gate 2 logged the rejection.
- **Disposition:** keep PR open as the **fourth permanent reference artifact** (PR #1, #3, #6, this new one). NOT merged. Remove the `auto-merge` label after the smoke test (so the workflow doesn't keep firing).

### Plan 2: Live validation on the next real PR

The next genuine PR after this iteration ships (could be a feat PR for a feature iteration, or another spec/ADR PR for an agentic-team iteration) uses the `auto-merge` label. Verify:

- (Feature PR case) After final cross-cutting bot `--approve` posts, workflow fires, merges automatically. Branch deleted from origin.
- (Spec/ADR PR case) Add label after user is ready; workflow fires, merges automatically. Branch deleted from origin.

**Failure response:** if the workflow doesn't merge when expected, check the workflow run logs (Gate 1-4 each log their pass/fail). Most likely failure modes: (a) PR is still in draft state, (b) bot's review is `CHANGES_REQUESTED`, (c) merge conflict — all of which are real issues the user needs to address before merge. The workflow exiting cleanly without merging is **correct behavior** in all these cases.

## VS Code alignment

No VS Code alignment implications. Auto-merge is a gcscode-specific agentic-team mechanism; VS Code has no analogous merge-automation.

Propagation to `shell/docs/vs-code-alignment.md`: none (ledger is per-concern, not per-iteration; this iteration introduces no extension-architecture concerns).

## `docs/out-of-scope.md` propagation

Two cross-cutting deferrals propagate:

- **CI integration in auto-merge.** The workflow doesn't wait on any status check; no CI exists yet. Trigger: when CI lands, the workflow grows a `needs:` clause that requires CI green before merging.
- **Branch protection rules.** No GitHub-native branch protection; auto-merge here is convention-only. Trigger: first observed bypass of the workflow's intent (e.g., merge happens without the label and the user regrets it).

Per-iteration-only deferrals (stay in spec): override mechanism for force-merge, auto-merge for non-feat/spec/adr branches, configurable per-PR-class gates, branch-keep-alive option.

## `docs/roadmap.md` propagation

Two updates:

1. **Flip "Auto-merge on user approval" from Queued to Shipped** when this iteration merges. Spec link goes in the Shipped entry.
2. No new Considering entries from this iteration's brainstorm.

## Known unknowns

- **GitHub Action permission edge cases.** The workflow uses `GITHUB_TOKEN` with `contents: write` + `pull-requests: write`. Whether merge events triggered by the workflow itself can in turn fire OTHER workflows is governed by GitHub's "default token cannot trigger workflows" rule. We don't currently have other workflows to trigger, but if we add CI workflows later, the auto-merge might silently not trigger them. Live observation will reveal if this is an issue.
- **Race conditions between multiple events firing close together.** If a bot `--approves` and the user adds the label within seconds, two workflow runs fire roughly simultaneously. Both will try to merge. The second will fail (PR already merged). No harm beyond a red workflow run in the UI.
- **Bot identity check assumes `gcscode-reviewer` (no `[bot]` suffix in the API).** Per PR #1's validation, GitHub's API returns the login as `gcscode-reviewer` even though the UI displays `gcscode-reviewer[bot]`. The workflow checks against the API form. If GitHub ever changes this, the gate would silently fail (treat all bot reviews as non-bot). Worth keeping in mind.

## Future iterations

Each gets its own brainstorm when triggered.

1. **CI integration.** When CI lands in gcscode, the auto-merge workflow grows a `needs:` clause or pre-merge wait-for-checks step. Trigger: CI iteration ships.
2. **Branch protection rules.** Add GitHub-native branch protection that requires the auto-merge workflow to have run successfully (or status checks to pass). Trigger: observed bypass.
3. **Per-PR-class gates for spec/ADR PRs.** When verdict promotion lands (red-team + spec-quality can `--request-changes`), the workflow's gate 3 logic extends to require bot `--approve` on spec/ADR PRs too. Bundles with the verdict-promotion iteration.
4. **Override mechanism.** A `force-merge` label or comment that bypasses gates 2-4 (but not gate 1 — must still have `auto-merge` label). For edge cases where the user is confident bypassing gates is correct. Trigger: first real need.
5. **Auto-merge for other branch classes.** If we ever want test/* or fix/* to auto-merge under different gate logic. Trigger: real use case.

## Origin

Listed in the reviews-as-artifacts spec (2026-05-12) as the immediate follow-up iteration on the agentic-team track. Sat in the roadmap "Queued" section through the red-team-reviewer, reviewer-role-design-conventions, and spec-quality-reviewer iterations as those provided the architectural substrate (PR classes, reviewer roles, post-merge convention) that auto-merge now builds on.

User initiated this iteration after the spec-quality-reviewer iteration shipped (2026-05-14), as the next natural step on the agentic-team track per the roadmap's "Queued" list. The brainstorm surfaced an architectural constraint that shaped the design: the user is the PR author on every gcscode PR, and GitHub blocks PR authors from submitting `--approve` reviews on their own PRs. So "user approves" had to be a non-review signal — label, comment, or GitHub's native enable-auto-merge button. Label was chosen for being native, opt-in, and one-click (no parsing, no branch-protection setup).

This iteration is also the **first to exercise the parallel-dispatch auto-dispatch obligation on a real spec PR** with both red-team and spec-quality existing and reviewing organically. Plan 2 live validation for spec-quality fires here. Whether spec-quality's narrow document-internal mandate produces distinct findings from red-team's premise + consistency mandate gets its first non-synthetic test.
