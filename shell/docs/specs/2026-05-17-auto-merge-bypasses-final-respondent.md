# Auto-merge bypasses final-respondent — decision

**Slug:** auto-merge-bypasses-final-respondent
**Iteration on the agentic-team track:** thirteenth. Fourth of the seven queued items from [`docs/specs/2026-05-16-agentic-team-debt-clearing-v1.md`](2026-05-16-agentic-team-debt-clearing-v1.md), following queued #1 (ADR-0009), queued #2 (respondent-subagent-v2), and queued #3 (per-role-bot-identities).
**Type:** decision-only iteration. Documents the accepted asymmetry between the respondent's per-followup-commit dispatch cadence and the spec/ADR PR's final-round flow. CLAUDE.md edit only. No new code, no agent files, no workflow changes.
**No bootstrap exceptions.** Spec ships via spec-PR workflow; implementation lands per the post-merge implementation convention.

## Context

The respondent subagent dispatches after each `Code-review-followup:` commit on a spec/ADR PR (per [`docs/specs/2026-05-16-respondent-subagent-v2.md`](2026-05-16-respondent-subagent-v2.md)). The respondent's purpose is to document the controller's per-finding dispositions for the most-recent reviewer reviews against the just-pushed followup.

The dispatch flow for a typical spec/ADR PR:

1. **Round 1 (initial):** 3 reviewer subagents auto-dispatch on PR open. Each posts an initial review.
2. **Round 1 → Round 2 transition (followup commit):** controller addresses initial findings, pushes a `Code-review-followup:` commit. The respondent dispatches (3 parallel subagents — one per reviewer's initial review). Each posts a disposition response under `gcscode-respondent[bot]`.
3. **Round 2 (re-reviews):** 3 reviewer subagents re-dispatch on the followup commit. Each posts a re-review.
4. **If re-reviews are clean:** no further followup commit. PR is merge-ready. User (or auto-merge workflow) merges.
5. **If re-reviews surface new findings:** controller addresses them via another `Code-review-followup:` commit. Loop continues: another respondent round + another re-review round.

The asymmetry: **the FINAL reviewer round (the last clean re-review before merge) has no `Code-review-followup:` commit after it, so no respondent post dispositions its findings.** The clean re-review is self-documenting ("addressed in `<SHA>`" or "Nothing flagged"), but the audit trail has no respondent-voice acknowledgment that the reviewer's final verdict was read by the controller before merging.

PR #18 (per-role-bot-identities, merged 2026-05-16) exercised this asymmetry empirically: 3 final re-reviews ("strong" verdict from all 3 reviewers) → no followup commit → auto-merge workflow fired → PR merged. No "final respondent" post existed.

This iteration is the small design call deferred from review-discussion-loop-v1 ([`docs/specs/2026-05-16-review-discussion-loop-v1.md`](2026-05-16-review-discussion-loop-v1.md)) and queued as item #6 in the debt-clearing list. The choice is binary: accept the asymmetry, or design a "final wrap" respondent post for the merge-ready state.

## Why not the bigger version

The bigger version would design a "final wrap" respondent post that fires when a PR reaches merge-ready state. Two structural options for the trigger:

- **Trigger on PR merge event.** A GitHub Actions workflow listens for `pull_request.closed && merged == true` and dispatches a respondent. **Smaller wedge:** no trigger; accept asymmetry. **Bigger wedge:** new workflow file, new dispatch path outside the controller's session, new infrastructure to maintain. Also: posting a respondent AFTER merge means the post lands on a closed PR — readers must look at a closed PR to find the final wrap.
- **Trigger when re-reviews are all clean.** Controller detects the merge-ready state (all 3 re-reviews are `--comment` clean) and dispatches a wrap respondent before the user merges. **Smaller wedge:** no detection; accept asymmetry. **Bigger wedge:** "all clean" detection is non-trivial (clean = no `--request-changes`, body says "addressed" or "Nothing flagged", but reviewers can use different wording). The controller already does this judgment when deciding to flip the PR ready-for-review + apply the auto-merge label, but encoding it as a discrete dispatch trigger adds branching to the controller's flow.

Both alternatives add infrastructure for a wrap post that mostly says "noted; nothing to dispose; merging." The information value is low because the absence of a followup commit + the presence of clean re-reviews already conveys the same content. A wrap respondent post is documentation theater unless the user wants the explicit acknowledgment in the audit trail.

Counter-argument for designing it anyway: symmetry. If every initial-review round gets a respondent post (via the followup commit), arguably the final round should too. The counter-counter: the respondent's purpose is to document **dispositions** (what was addressed, deferred, routed, noted). A clean final round has no dispositions to document.

The judgment: **accept the asymmetry.** The audit trail is complete enough — the final re-review's body itself is the acknowledgment of resolution. A wrap respondent would add ceremony without addressing a real gap.

## Goals

1. Codify the asymmetry as **intentional**, not a bug or an oversight. Document the controller's flow explicitly.
2. State the **trigger to revisit**: if real operational pain surfaces (e.g., a future audit needs to know "did the controller acknowledge the final re-review before merging?" and the absence of that record costs something), a future iteration designs a final-wrap respondent then.
3. Update CLAUDE.md's "Respondent posting discipline" subsection with one paragraph documenting the asymmetry.

## Non-goals (this iteration)

- **Designing a final-wrap respondent post.** Per the YAGNI default and the analysis above. Future iteration if operational pain surfaces.
- **Changing the respondent dispatch cadence.** Respondent stays per-`Code-review-followup`-commit, as designed in respondent-v2.
- **Changing the auto-merge workflow.** Workflow's existing gates (label, identity counts, mergeable) stay as-is.
- **Adding new reviewer roles or dispatch hooks.** Out of scope; future iterations.

## Architecture

### The asymmetry, named explicitly

The respondent's dispatch cadence is **per-`Code-review-followup`-commit**. The reviewer's dispatch cadence is **per-PR-open + per-followup-commit**. Reviewer rounds outpace respondent rounds by one when the loop terminates cleanly:

```
Round 1: 3 reviewers post (initial)
         ↓ controller addresses; pushes Code-review-followup commit
         ↓ 3 respondents dispatch (re initial reviews)
Round 2: 3 reviewers post (re-review of followup)
         ↓ re-reviews are clean
         ↓ NO followup commit needed
         ↓ NO respondent dispatch
         ↓ user/auto-merge merges
```

The "missing" respondent post is the dispositional acknowledgment of the Round 2 re-reviews. Its absence is not a bug — it's the natural consequence of the respondent's trigger condition (`Code-review-followup:` commit) being unmet.

### Decision

Accept the asymmetry. The final re-review's `--comment` body ("addressed in `<SHA>`" or equivalent) is the audit trail. The controller's merge action (manual `gh pr merge` or auto-merge label) is the final acknowledgment.

### CLAUDE.md edit

Add one paragraph to the "Respondent posting discipline" subsection, between the "Initial-review round" paragraph and the "Discipline note" paragraph. The new paragraph explicitly names the asymmetry as intentional and cites this spec.

Full verbatim content in Post-merge implementation > Commit 1.

### Trigger to revisit

A future iteration designs a final-wrap respondent post if:

- **Operational pain.** An audit (human or automated) needs to know "did the controller acknowledge the final re-review before merging?" and the absence of that record costs something concrete (e.g., a regulator asks; a postmortem on a bad merge needs the dispositional trail; a future agentic check wants to verify the controller READ the re-reviews).
- **Process change.** A future iteration redesigns the reviewer dispatch flow such that re-reviews don't end the loop cleanly (e.g., re-reviews require explicit acknowledgment before merge).
- **N=3 unacknowledged re-reviews.** If across 3 consecutive spec/ADR PRs the controller observes a clear pattern of "wanting to write something" at the merge point but having no respondent to do so, that's evidence the asymmetry is wrong.

## Validation

This iteration is decision-only; no behavioral change to validate. The CLAUDE.md edit is validated by the spec-PR's red-team + spec-quality reviews and the post-merge mechanical commit's review.

The asymmetry itself was already validated empirically by PR #18: the auto-merge workflow merged a spec/ADR PR with clean re-reviews and no final respondent post, and nothing broke.

## VS Code alignment

No VS Code alignment implications. The respondent dispatch cadence is a gcscode-specific agentic-team mechanism. VS Code's extension architecture has no respondent concept.

Propagation to `shell/docs/vs-code-alignment.md`: none.

## `docs/out-of-scope.md` propagation

**No edit.** This iteration is not a cross-cutting deferral; it's a per-iteration scope cut documenting an intentional asymmetry. The "designing a final-wrap respondent post" non-goal has its own trigger to revisit (operational pain) and stays in this spec only. Adding it to `out-of-scope.md` would over-promote a small design call to a load-bearing architectural deferral.

## `docs/roadmap.md` propagation

Flip the existing Considering entry for "Auto-merge-bypasses-final-respondent design" to Queued/Shipped `[x]`. The entry text is updated to reflect the shipped decision (accepted asymmetry; CLAUDE.md edit; trigger to revisit documented).

Verbatim edit content in Post-merge implementation > Commit 2.

## Known unknowns

- **Empirical sample size of one.** PR #18 is the only spec/ADR PR that has exercised the asymmetry end-to-end since respondent-v2 shipped. The asymmetry's "feels fine" verdict is based on one data point. If subsequent PRs surface operational pain, the trigger fires.
- **No tripwire.** This iteration's accepted state has no specific failure mode the tripwire convention (CLAUDE.md "Tripwires for known-quality concerns") could detect across N PRs. The trigger-to-revisit list above is the closest analog.

## Tripwires for known-quality concerns

None. This iteration's decision is "do nothing extra"; there is no behavior to instrument.

## Future iterations

1. **Final-wrap respondent post design.** Trigger: per the "Trigger to revisit" list in Architecture. If fired, the iteration would design (a) the trigger condition (PR merge event vs all-clean detection), (b) the respondent's content shape, (c) the dispatch infrastructure.

## Origin

Surfaced as queued item #6 in [`docs/specs/2026-05-16-agentic-team-debt-clearing-v1.md`](2026-05-16-agentic-team-debt-clearing-v1.md), carried forward from [`docs/specs/2026-05-16-review-discussion-loop-v1.md`](2026-05-16-review-discussion-loop-v1.md)'s "Future iterations" section. The "small design call" framing in those specs is preserved here: this iteration is intentionally lightweight (decision + documentation only) because the design space is binary and the YAGNI default is clear.

Designed 2026-05-17, immediately after [`docs/specs/2026-05-16-per-role-bot-identities-for-reviewers.md`](2026-05-16-per-role-bot-identities-for-reviewers.md) (queued item #3) merged. Per the agentic-team debt-clearing v1 commitment, queued items drain sequentially without interleaving; this is queued item #6 (items #4 and #5 are blocked on external triggers — 4th reviewer role added / N=5 multi-model spec/ADR PR observations).

## Post-merge implementation

Per the post-merge implementation convention, **two direct-master commits**. Both content fully specified verbatim below.

- **Commit 1:** Add one paragraph to CLAUDE.md "Respondent posting discipline" subsection documenting the asymmetry as intentional.
- **Commit 2:** Flip roadmap.md Considering entry → Queued/Shipped `[x]`.

### Verbatim — Commit 1 (CLAUDE.md edit)

Locate the "Respondent posting discipline" subsection in `shell/CLAUDE.md` (around line 214). Locate the "Initial-review round" paragraph that begins `**Initial-review round:**` (around line 252). Locate the next paragraph that begins `**Discipline note:**` (around line 254). Insert the following NEW paragraph between them:

> **Final-round asymmetry (intentional).** The respondent dispatches **only after a `Code-review-followup:` commit** — there is no respondent dispatch on the round of re-reviews that immediately precedes a clean merge. When all re-reviewers post clean verdicts and no further followup commit is needed, the loop terminates without a final respondent post. This is intentional: the respondent's purpose is to document dispositions (what was addressed, deferred, routed, noted), and a clean final round has no dispositions to document. The clean re-review's body + the controller's merge action together form the audit trail. Trigger to revisit (design a "final-wrap" respondent post): operational pain — an audit needs "did the controller acknowledge the final re-review before merging?" and the absence of that record costs something concrete, OR a process change makes the loop's clean termination non-clean, OR N=3 consecutive spec/ADR PRs surface a controller wanting-to-write at the merge point. Spec: [`docs/specs/2026-05-17-auto-merge-bypasses-final-respondent.md`](docs/specs/2026-05-17-auto-merge-bypasses-final-respondent.md).

### Verbatim — Commit 2 (roadmap.md flip)

In `shell/docs/roadmap.md`, **Pre-edit verification step:** before deleting, run `grep -n "Auto-merge-bypasses-final-respondent" shell/docs/roadmap.md` to locate the exact line.

**Before (in the Considering section):**

```md
- [ ] **Auto-merge-bypasses-final-respondent design** — small design call. The respondent posts after each Code-review-followup commit, but the FINAL round (clean reviews → user merges) has no followup commit and therefore no respondent post. Either accept this asymmetry, or design a "final wrap" respondent post for the merge-ready state. Trigger: after respondent v1 ships and the asymmetry is operational (per `review-discussion-loop-v1` carry-forward).
```

DELETE the above entry from the Considering section. ADD the following entry to the **Queued** section of the agentic-team architecture track, immediately after the existing "Per-role bot identities for reviewers" `[x]`-marked entry:

```md
- [x] **Auto-merge-bypasses-final-respondent design** — decision-only iteration. Accepts the asymmetry between the respondent's per-`Code-review-followup`-commit dispatch cadence and the spec/ADR PR's final-round flow (when re-reviews are clean and no followup commit is needed). The clean re-review's body + the controller's merge action are the audit trail. CLAUDE.md "Respondent posting discipline" subsection documents the asymmetry as intentional + trigger to revisit. Spec: [`specs/2026-05-17-auto-merge-bypasses-final-respondent.md`](specs/2026-05-17-auto-merge-bypasses-final-respondent.md).
```
