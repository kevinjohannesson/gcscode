---
name: review-loop
description: How gcscode PRs are reviewed, from the first reviewer dispatch to the owner's report. Use when opening a PR, dispatching any reviewer subagent (spec-compliance, code-quality, final review, red-team, extension architect), handling review findings, writing a Code-review-followup commit or its disposition table, deciding whether the review loop stops, marking a PR ready, merging, or reporting to the owner at the end of a PR.
---

# Review loop

Who reviews what is in the registry, `.claude/agent-config.json`: each role's bot identity, App IDs, routing, verdicts, and the agent file or superpowers prompt it runs. This skill is how the controller uses it.

State each rule once, in the file it belongs to, and point to it. A summary that restates a rule drifts from it, and fixes that rewrite a rule tend to introduce new defects into it.

## Before any dispatch

- **The PR must contain HEAD before any dispatch.** Push each commit once it is final — a spec/ADR followup once `check-dispositions.mjs` passes (step 4) — and before dispatching check `git status -sb` and `gh pr view <n> --json commits` (the count can lag a push by a few seconds). Reviewers read the local tree, so a PR missing commits looks fine from inside the session.
- **Never name a model in a dispatch prompt.** A role's `model` alias goes in the Agent call's `model` parameter; the review header names the model the reviewer's own system prompt states.
- **No absolute paths in a dispatch prompt.** Reviewers echo them into PR comments, and gcscode is public: reviews, PR bodies and commit messages use repo-relative paths and carry no credentials or internal URLs. A reviewer reporting a leaked path quotes it in a code block and says it is a leak.
- **An agent file edited during a session does not reach a dispatch by name in that session.** The Claude Code docs say edits apply on the next dispatch, but on 2.1.309 a session started in `shell/` kept dispatching the session-start content of the git-root `.claude/agents/red-team-reviewer.md` after git replaced it and after an in-place change; a worktree's `.claude/agents/` is not seen at all. To use an edited agent file, start a fresh session, or dispatch the existing agent of the same role with the edited body inline.

## Feature PRs (`feat/*`)

1. Execute the plan with `superpowers:subagent-driven-development` in a worktree. Open a draft PR after the first task commit (template below).
2. After each task: spec-compliance review, then code-quality review once spec-compliance passes. At the end of the iteration: `gh pr ready <n>`, then the final cross-cutting review.
3. These roles run superpowers' prompts, so every dispatch carries:
   - the PR number;
   - the token step, in the same command as the post and by a path that works from any directory: `GH_TOKEN=$("$(git rev-parse --show-toplevel)/.claude/scripts/gh-app-token-reviewer" <role>) gh pr review <n> ...` (an empty token makes `gh` post as the owner);
   - the role's `verdicts`, `header` and `reReviewHeader` from the registry, with `<model>` explained as `Claude ` plus the model its system prompt names;
   - "repo-relative paths only";
   - **final review only:** confirm every per-task `--request-changes` on the PR was addressed before approving — `feat/*` auto-merge reads this role alone — and verify each item of the plan's checklist of spec findings.
4. **On `--request-changes`,** the same implementer fixes it in a `Code-review-followup:` commit (never an amend), and the dispatch carries the first two rules of "Fixing findings" below. The same role re-reviews, posting a new review. A per-task role cannot clear its own block — it may not `--approve`, and GitHub clears `CHANGES_REQUESTED` only on a later approval or a dismissal — so when its re-review comes back `--comment`, the controller dismisses the earlier block. "Clean" is the re-review's own verdict, not the controller's reading of it. The dismissal stays in the timeline.

   ```bash
   gh api "repos/{owner}/{repo}/pulls/<PR>/reviews" \
     --jq '.[] | select(.state=="CHANGES_REQUESTED") | "\(.id) \(.user.login) \(.submitted_at)"'
   gh api -X PUT "repos/{owner}/{repo}/pulls/<PR>/reviews/<review-id>/dismissals" \
     -f message="Superseded by this role's clean re-review of <SHA>. <What it verified.>"
   ```

5. The merge gate is the final review's `--approve`.

## Spec and ADR PRs (`spec/*`, `adr/*`)

A _product_ spec or ADR is about the app, its extensions or its API. An _agentic-process_ one is about how gcscode is built: reviewers, this loop, merge gates, agent prompts, the registry.

| PR kind         | Round 1                                                | Fix checks                                                                  |
| --------------- | ------------------------------------------------------ | --------------------------------------------------------------------------- |
| Product         | red-team; the extension architect when routing matches | red-team; the architect only while its latest review has `Blocking:` above 0 |
| Agentic-process | red-team                                               | red-team                                                                    |

**Extension-architect routing** is the controller's judgment: dispatch when a product PR touches the extension API surface, the host↔extension boundary, lifecycle, isolation, communication, discovery, conflicts or the extension performance floor (signal list: `shell/docs/specs/2026-05-17-reviewer-routing-and-domain-expert.md` § Extension architect's heuristic). When unsure, dispatch: a wrong dispatch costs one out-of-scope skip, which ends `Blocking: 0`. Re-evaluate when a followup brings extension architecture in. Never dispatch it on an agentic-process PR.

### Steps

1. **Lint.** Run `pnpm lint:docs` from `shell/` and fix what it reports.
2. **Open a draft PR** (template below) and push. It stays a draft until the loop's last review has posted: auto-merge refuses drafts, so no review can merge it ahead of a later commit, and no later commit can merge unreviewed.
3. **Round 1.** Dispatch in parallel `subagent_type: red-team-reviewer` and, when routed, `subagent_type: extension-architect-reviewer`. The message carries only variables: `PR`, `KIND` (`spec` or `ADR`) and `MODE: initial`. The agent file holds the instructions, the pinned model and the token slug. Each returns its review id and `Blocking: N`.
4. **Fix** in one `Code-review-followup:` commit per round, following "Fixing findings" below. Dispose of every finding still open in the reviewers' latest reviews in that commit, so the fix check sees the deferrals too. The message ends with the disposition table, one line per finding:

   ```
   RT-1 fixed: shell/docs/specs/2026-10-22-foo.md
   RT-2 kept: <why it does not apply or is not worth the change, with the evidence>
   EA-1 deferred: shell/docs/specs/2026-10-22-foo.md#known-unknowns
   ```

   A `deferred:` target names a file and a `#section` — a heading anchor that exists in it — and that section records the finding as `PR #<n> <ID>`, because IDs restart on every PR. After committing and before pushing, run `"$(git rev-parse --show-toplevel)/.claude/scripts/check-dispositions.mjs" <PR>` and amend the unpushed commit until it passes. A finding an earlier followup already disposed needs no new line until its reviewer reviews again. Disagreement goes in a `kept:` line, where the fix check can contest it.

5. **Push, then dispatch fix checks** per the table, with `MODE: fix-check`, `FIX_SHA` and `PREVIOUS_REVIEW_ID` (the id that reviewer returned). A fix check marks each earlier finding resolved, not resolved or partly resolved, and may raise new findings in the fix diff, or anywhere if they are blocking.
6. **Stop** when no finding needs a disposition, or once the second round of fix checks has posted, whichever comes first. No finding needs a disposition when either:
   - round 1 left nothing open, so there is no followup; or
   - every role due a fix check of the latest followup (per the table) has posted that fix check, each ending `Blocking: 0` with no finding open, and every finding of a role not due one has a disposition in a followup.

   If anything still needs a disposition when the loop stops — new findings, findings marked not or partly resolved, a `kept:` the fix check rejected — record it in one closing `Code-review-followup:` commit that changes nothing else: `deferred:` lines to the spec's Known unknowns (an ADR's Consequences), each entry carrying `PR #<n> <ID>`. Dispatch one closing fix check of that commit from each role whose findings it records. It is the loop's last review whatever it says: anything it raises goes to the owner in the end-of-PR report, and if it still counts blocking findings, auto-merge stays shut and the owner decides.

   Then `gh pr ready <n>`, report to the owner, and stop. Don't ask how to close out.

**Findings format** (the agent files are authoritative): a numbered list in which each finding has an ID (`RT-3`, `EA-2`), `[blocking]` or `[non-blocking]`, a location, a one-line problem and a one-line fix; reasoning for blocking findings only; a `Checked against:` line; and a last line `Blocking: N`. Blocking means it would cause a defect, a wrong decision or real rework if shipped as written. Drift from an earlier decision is non-blocking unless it contradicts an accepted ADR.

## Merging

The owner merges — `gh pr merge --merge <n>`, which keeps the merge commit — or applies the `auto-merge` label once the PR is ready. The gates are described once, in the header comment of `.github/workflows/auto-merge.yml`. Two of them shape the controller's work: a draft never merges, and a `spec/*` or `adr/*` PR that changes anything outside `shell/docs/` is refused by Gate 2, so say so in its PR body; the owner merges it by hand. If the owner merges despite an open `--request-changes` or a non-zero `Blocking:`, leave a PR comment saying why.

## Fixing findings

Every fix dispatch carries the first two rules.

- **Sweep before you fix.** Turn each finding into a search (`git grep -n`) across code, tests, specs, plans, ADRs, `CLAUDE.md`, rules, skills, agent files and READMEs. Fix or explicitly keep every hit, and list the hits in the disposition table or the commit message. A finding fixed in one of its three places comes back as a new finding.
- **Fix only what the findings ask.** Any new claim about the repo — "unreachable", "already handled", a count, "deviation from the spec", a deferral trigger — is checked with a command before committing. Unrequested improvements go in a separate commit or on the roadmap.
- **A grade is evidence, not a verdict.** When a finding names a bypassed, missing or too-narrow guard, list everything the guard protects before grading it: the symptom a reviewer names is usually the narrowest consequence.
- **The grade can be overruled in both directions.** A non-blocking finding that touches the iteration's central guarantee is mandatory. A blocking finding is never downgraded silently: the disagreement and its evidence go where the re-reviewer can contest them — the dispatch prompt, the commit message, a `kept:` line.
- **"Exotic", "theoretical" and "unreachable" are claims to measure.** Write the probe before deferring on them.
- **Every deferral carries a trigger,** and the trigger's reachability is checked when it is written; it may already have fired.
- **Declined findings are recorded with the reason** — in the plan, the spec's Known unknowns, the roadmap or `docs/out-of-scope.md` — never only in a review thread.
- **Spec findings left for implementation become checklist items in the plan,** and the final cross-cutting review verifies them.

## End-of-PR report

This report is the owner's main interface; PR comments are history. When the PR is ready, or the session stops for any other reason, report in this shape:

```
**<PR title> (#<n>)** — <ready for you | blocked on you | merged>
What changed: 3–5 bullets.
Blocking findings: each ID, one line, and the commit that resolved it — or that it is still open.
Deferred: each non-blocking finding not fixed, and where it is recorded.
Look at: the files or functions most worth your eyes, and why.
Open decisions: what only you can decide, including defaults taken while unattended.
```

Then write the handoff note (`shell/CLAUDE.md` § Sessions).

## PR templates

Feature PR (`gh pr create --draft --body ...`):

```md
## Iteration

<one-line summary matching the spec's first line>

## Links

- Spec: [`docs/specs/YYYY-MM-DD-<topic>.md`](../blob/master/shell/docs/specs/YYYY-MM-DD-<topic>.md)
- Plan: [`docs/plans/YYYY-MM-DD-<topic>.md`](../blob/master/shell/docs/plans/YYYY-MM-DD-<topic>.md)
- ADRs (if any): …

## Reviews

Per-task reviewers post under task headers; the final cross-cutting review posts at the end. Each role posts as its own bot (`.claude/agent-config.json`).
```

Spec or ADR PR:

```md
## <Spec or ADR title>

<one-line summary matching the artifact's first line>

## Links

- Related spec/ADR: …

## Reviews

Reviewed per `.claude/skills/review-loop/SKILL.md`: red-team, plus the extension architect on product PRs that touch extension architecture. Each review ends `Blocking: N`.

<If the PR changes anything outside `shell/docs/`: Gate 2 refuses auto-merge, so the owner merges it by hand.>
```

## Designing a reviewer role

Read [designing-a-reviewer-role.md](designing-a-reviewer-role.md) before adding or reshaping a role.
