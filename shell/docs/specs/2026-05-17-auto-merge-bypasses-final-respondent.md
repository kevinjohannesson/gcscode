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

The asymmetry: **the FINAL reviewer round (the last re-review before merge, whether truly clean or "strong with residuals") has no `Code-review-followup:` commit after it, so no respondent post dispositions its findings.** The reviewer's body is the **reviewer's** voice ("strong", "Nothing flagged", or "strong with minor residual tensions"). The audit trail therefore has no **controller**-voice acknowledgment that the reviewer's final verdict was read and that any residual findings were judged not to require a further followup. These are two different speech acts — collapsing them was the original premise this spec leaned on; the followup commit on this PR rewrites that premise honestly.

PR #18 (per-role-bot-identities, merged 2026-05-16) exercised this asymmetry empirically, but the empirical record is more nuanced than a "clean termination" claim. Verifiable via `gh pr view 18 --json reviews` and `gh api repos/.../issues/18/events`:

- Red-team Opus's final re-review verdict was "**strong with minor residual tensions**" — it surfaced 3 new premises, 2 new drifts, and 4 new open questions that received NO disposition (there was no followup commit; respondent never dispatched on the re-reviews).
- The merge was triggered by a deliberate **two-step user action**: `ready_for_review` at 17:22:45 + `labeled auto-merge` at 17:22:47, both AFTER all 3 final re-reviews landed at 17:18:55 or earlier. The user explicitly judged the residuals acceptable and authorized merge via these two actions. The auto-merge workflow then fired at 17:22:55 and merged at 17:22:57.

So "the loop terminates cleanly → auto-merge fires" is not what happened on PR #18. The user's ready+label step IS the controller-voice merge authorization — the workflow merely executes once it's labeled and gates pass. Under auto-merge, the controller's "merge action" is the **labeling moment**, not the actual `gh pr merge` call (which happens inside the workflow). This iteration treats that labeling-moment-as-merge-action explicitly.

This iteration is the small design call deferred from review-discussion-loop-v1 ([`docs/specs/2026-05-16-review-discussion-loop-v1.md`](2026-05-16-review-discussion-loop-v1.md)) and queued as item #6 in the debt-clearing list. The followup commit on this PR (responding to red-team Opus's review) expands the design space to three options: accept the asymmetry, design a workflow-triggered final-wrap respondent, or design a respondent that dispatches on the **ready-for-review + auto-merge label** moment (the third option Opus surfaced — the controller's actual merge-authorization step under auto-merge, observable on the PR before merge). Spec accepts the asymmetry for v1 but names option 3 as the leading future-iteration candidate, replacing the original "binary choice" framing.

## Why not the bigger version

The bigger version would design a "final wrap" respondent post that fires when a PR reaches merge-ready state. Three structural options for the trigger, in order from heaviest to smallest infrastructure cost:

- **(1) Trigger on PR merge event.** A GitHub Actions workflow listens for `pull_request.closed && merged == true` and dispatches a respondent. **Smaller wedge:** no trigger; accept asymmetry. **Bigger wedge:** new workflow file, new dispatch path outside the controller's session, new infrastructure to maintain. Also: posting a respondent AFTER merge means the post lands on a closed PR — readers must look at a closed PR to find the final wrap.
- **(2) Trigger on "all re-reviews are clean" detection.** Controller detects the merge-ready state (all 3 re-reviews are `--comment` clean) and dispatches a wrap respondent before the user merges. **Smaller wedge:** no detection; accept asymmetry. **Bigger wedge:** "all clean" detection is non-trivial (clean = no `--request-changes`, body says "addressed" or "Nothing flagged", but reviewers can use different wording, AND the "strong with residuals" case is the actual cost-bearing case — it's clean by verdict but has undisposed new findings). Adds branching to the controller's flow.
- **(3) Trigger on the controller's `ready-for-review` + `labeled auto-merge` step.** Surfaced by red-team Opus's review of this PR. The controller's deliberate two-step action IS the merge authorization (PR #18's empirical timeline confirms this — the actions happened deliberately, not as a side-effect of any other flow). Adding a respondent dispatch at this exact moment captures the controller-voice acknowledgment in the natural place: as a deliberate authorization post, on an OPEN PR, before merge. **Smaller wedge:** no trigger; accept asymmetry. **Bigger wedge than (2):** requires identifying the dispatch moment unambiguously (the existing CLAUDE.md text already mandates this two-step as the auto-merge handoff for queued debt-clearing iterations — see CLAUDE.md "Auto-merge on user approval" — so the trigger condition is already structurally present). Less infrastructure than (1); more thoughtful than (2). **This is the leading future-iteration design candidate per the followup commit on this PR.**

The bigger versions add infrastructure for a wrap post whose information value is the **controller-voice per-finding disposition for the final re-reviews' undisposed items**. That value is low when the final re-reviews are truly clean (no new findings) and meaningful when they're "strong with residuals" (the cost-bearing case Opus surfaced).

Counter-argument for designing it anyway: symmetry. If every initial-review round gets a respondent post (via the followup commit), arguably the final round should too. **This is a substantive argument the original spec dismissed too quickly.** The respondent's purpose is to document **controller-voice dispositions** (what was addressed, deferred, routed, noted). When a final re-review surfaces new items, those items genuinely need disposing of — the absence of a respondent makes them invisible from a controller-voice perspective, exactly the gap respondent v1 was introduced to close. So the symmetry argument has real weight.

The judgment for v1: **accept the asymmetry, but acknowledge it has a real cost in the "strong with residuals" case, and name option (3) as the leading future-iteration design.** The accept call rests on two narrower premises than the original spec claimed:

- The respondent has **already** disposed of the load-bearing findings (the initial reviews, via the per-followup-commit dispatch).
- "New findings" in re-reviews are bounded by construction — re-reviewers focus on whether the followup addressed prior findings; net-new items are minor by typology (the spec-quality reviewer can only flag structure/consistency/link issues that survived the followup; red-team's net-new findings are second-order critiques of how the followup addressed prior findings).

Net: the cost of the asymmetry is bounded (limited to second-order undisposed items); the cost of filling it (any of options 1, 2, 3) is real new infrastructure. YAGNI says wait until the cost-bearing case earns its own evidence.

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

The respondent's dispatch cadence is **per-`Code-review-followup`-commit**. The reviewer's dispatch cadence is **per-PR-open + per-followup-commit**. Reviewer rounds outpace respondent rounds by one when the loop terminates without a further followup:

```
Round 1: 3 reviewers post (initial)
         ↓ controller addresses; pushes Code-review-followup commit
         ↓ 3 respondents dispatch (re initial reviews)
Round 2: 3 reviewers post (re-review of followup)
         ↓ re-reviews may be: truly clean, strong-with-residuals, or surface new findings
         ↓ if controller chooses no further followup
         ↓ NO followup commit
         ↓ NO respondent dispatch
         ↓ controller flips ready-for-review + applies auto-merge label
         ↓ workflow merges
```

The "missing" respondent post is the **controller-voice dispositional acknowledgment of the Round 2 re-reviews**. Its absence is not a bug — it's the natural consequence of the respondent's trigger condition (`Code-review-followup:` commit) being unmet. But it IS a real gap in the controller-voice audit trail, because the reviewer's body (the only thing present) is the **reviewer's** voice, not the controller's.

### Bookend asymmetries

CLAUDE.md "Respondent posting discipline > Initial-review round" already documents an asymmetry on the OPENING side: the respondent is NOT dispatched on the initial-review round because "there is nothing to dispose of yet." The final-round asymmetry codified by this spec is the **closing-side counterpart**: the respondent is NOT dispatched on the final-round re-reviews when no followup follows because the controller has chosen not to dispose of any new items.

Both asymmetries share a single underlying principle: **the respondent fires only when the controller has produced a `Code-review-followup:` commit that contains the dispositions to document.** The opening asymmetry skips because no followup has happened yet; the closing asymmetry skips because no further followup will happen. This is a coherent rule, not two ad-hoc skips.

The closing-side cost is asymmetrically larger than the opening-side cost, however: at the opening, there is genuinely nothing to dispose; at the closing, there may be "strong with residuals" items that the controller has implicitly judged not-worth-a-followup. That implicit judgment is invisible from a controller-voice audit perspective. v1 accepts this cost; future iterations may design option (3) above to close it.

### Decision

Accept the asymmetry for v1, with three honest caveats:

1. The controller-voice audit trail has a real gap at the final round when the re-reviews are "strong with residuals" (i.e., clean by verdict but containing new items).
2. The bound on that gap is the typology of net-new re-review findings — by construction these are second-order critiques of how the followup addressed prior findings, not first-order critiques the respondent didn't already dispose of in the per-followup-commit round.
3. Under auto-merge, the controller's "merge action" is the `ready-for-review` + `labeled auto-merge` two-step (not the workflow's `gh pr merge` call). That two-step IS the controller-voice merge authorization. Option (3) above proposes capturing it as a respondent post; v1 accepts that it stays implicit.

### CLAUDE.md edit

Add one paragraph to the "Respondent posting discipline" subsection, between the "Initial-review round" paragraph and the "Discipline note" paragraph. The new paragraph names the asymmetry as intentional, cross-references the initial-round bookend, names option (3) as the leading future-iteration design, and acknowledges the strong-with-residuals cost case.

Full verbatim content in Post-merge implementation > Commit 1.

### Trigger to revisit

A future iteration designs a final-wrap respondent post (preferring option (3) above) if:

- **Strong-with-residuals pattern.** Observable from a single PR's timeline: a final re-review verdict is "strong" but the review surfaces ≥3 new items (new premises, drift items, or open questions) AND the controller chooses no followup. If this pattern appears on **N=2** consecutive spec/ADR PRs, the asymmetry is producing meaningful undisposed-residuals and the trigger fires.
- **Authorization-trail audit need.** A future audit (regulatory, postmortem on a bad merge, or agentic verification check) needs the controller-voice "I read the final re-review and authorize merge" record explicitly. The absence costs something concrete.
- **Process change.** A future iteration redesigns the reviewer dispatch flow such that re-reviews don't end the loop cleanly (e.g., re-reviews require explicit acknowledgment before merge), forcing the asymmetry to close structurally.

The original spec's trigger ("controller wants to write but has no respondent") is removed — it required controller-introspection at merge time, which is a per-session subjective signal CLAUDE.md "Reviewer-role design conventions > Tripwires" condition (iii) discourages (tripwires should be observable across PRs from the timeline, not from session experience).

### Auto-merge mid-round race (Known Unknown surfaced by red-team Opus)

The auto-merge workflow listens on `pull_request_review.submitted`. If a PR is already labeled `auto-merge` AND already `ready-for-review` AND `pull_request.opened` is past, every reviewer post fires the workflow. Gate 3b counts red-team + spec-quality reviews across all rounds (not "latest round"), so an earlier round's red-team review + the latest round's spec-quality review could together satisfy the gate — the workflow could merge BEFORE all re-reviews in the current round finish posting.

This isn't introduced by this spec — it's a pre-existing race in the auto-merge workflow. But the asymmetry's clean-termination framing assumes the controller (not the workflow) controls the merge moment. PR #18 avoided the race because the PR was draft until the user's ready+label step. For future PRs that are already ready+labeled by the time re-reviews start posting, the "final round" the asymmetry refers to may not be a coherent endpoint.

**v1 operational discipline:** don't apply the `auto-merge` label until all current-round re-reviews have posted. This is a manual rule; encoding it as a workflow gate is a future iteration's concern.

## Validation

This iteration is decision-only; no behavioral change to validate. The CLAUDE.md edit is validated by the spec-PR's red-team + spec-quality reviews and the post-merge mechanical commit's review.

The asymmetry itself was exercised empirically on PR #18, with the caveats from Context: the re-reviews were "strong with residuals" (not truly clean), and the merge was a deliberate two-step user action (not an automatic loop termination). The undisposed residuals from PR #18's final Opus re-review are the empirical demonstration of the cost-bearing case this spec accepts. Nothing structurally broke — the PR merged, the auto-merge workflow fired as designed, and the residual items are visible in the PR timeline for any future reader who needs them — but the controller-voice acknowledgment for those residuals is absent.

Plan 1's tripwire (N=2 consecutive PRs with strong-with-residuals + no followup) will fire if PR #19 (this PR) ALSO terminates as strong-with-residuals + no followup. The instrumentation is built into this spec's own validation flow.

## VS Code alignment

No VS Code alignment implications. The respondent dispatch cadence is a gcscode-specific agentic-team mechanism. VS Code's extension architecture has no respondent concept.

Propagation to `shell/docs/vs-code-alignment.md`: none.

## `docs/out-of-scope.md` propagation

**No edit.** This iteration is not a cross-cutting deferral; it's a per-iteration scope cut documenting an intentional asymmetry. The "designing a final-wrap respondent post" non-goal has its own trigger to revisit (operational pain) and stays in this spec only. Adding it to `out-of-scope.md` would over-promote a small design call to a load-bearing architectural deferral.

## `docs/roadmap.md` propagation

Flip the existing Considering entry for "Auto-merge-bypasses-final-respondent design" to Queued/Shipped `[x]`. The entry text is updated to reflect the shipped decision (accepted asymmetry; CLAUDE.md edit; trigger to revisit documented).

Verbatim edit content in Post-merge implementation > Commit 2.

## Known unknowns

- **Empirical sample size of two (after this PR ships).** PR #18 was the first spec/ADR PR to exercise the asymmetry end-to-end since respondent-v2 shipped. This PR (#19) is the second. The "feels fine" verdict for v1 is based on two data points. The N=2 strong-with-residuals tripwire in Validation depends on whether PR #19 itself terminates strong-with-residuals; if yes, the tripwire fires self-referentially and a future iteration is warranted.
- **Auto-merge mid-round race.** Documented in Architecture > Auto-merge mid-round race subsection. v1 operational discipline (don't label until current-round re-reviews have posted) mitigates; encoding as a workflow gate is a future iteration.
- **Option (3) — the ready+label respondent trigger — is the leading future-iteration design candidate but unimplemented.** Architecture explicitly names option (3) as the smallest infrastructure path to closing the asymmetry. If the trigger to revisit fires, the iteration starts from option (3), not from a blank slate.
- **Spec-quality reviewer asymmetry scope.** The asymmetry applies to all three reviewer roles (red-team Opus, red-team Sonnet, spec-quality), not just red-team. The wording in Architecture and CLAUDE.md edit treats the three uniformly.

## Tripwires for known-quality concerns

- **Strong-with-residuals tripwire.** If a spec/ADR PR's final re-review verdict is "strong" but the body surfaces ≥3 net-new items (new premises, drift items, or open questions) AND the controller chooses no followup, that's a single-PR signal that the asymmetry is producing meaningful undisposed-residuals. **Fires at N=2 consecutive PRs** matching this pattern. Response: a future iteration designs option (3) above.
- **Auto-merge mid-round race tripwire.** If a single PR experiences the workflow firing mid-round (i.e., the workflow merges on the FIRST passing re-review event in a round rather than after all 3 reviewers have re-posted), flag it. Response: the iteration that addresses this either revises the workflow gates (e.g., Gate 3b counts latest-round reviews only) OR moves the v1 operational discipline (don't-label-until-all-reviews-posted) into a workflow gate.

These tripwires are manual review items, not automated checks. They live in this spec and migrate to a future iteration's brainstorm input if any fires.

## Future iterations

1. **Final-wrap respondent post design — option (3) preferred.** Trigger: per the revised "Trigger to revisit" list in Architecture (strong-with-residuals pattern at N=2 OR authorization-trail audit need OR process change). If fired, the iteration designs the `ready-for-review + auto-merge label` two-step as a respondent dispatch trigger (the option (3) shape from "Why not the bigger version"), NOT the workflow-event or all-clean-detection alternatives.
2. **Auto-merge workflow Gate 3b refinement.** If the mid-round race tripwire fires, refine the gate to count latest-round reviews only OR add a workflow-side wait-for-all-reviewers gate.

## Origin

Surfaced as queued item #6 in [`docs/specs/2026-05-16-agentic-team-debt-clearing-v1.md`](2026-05-16-agentic-team-debt-clearing-v1.md), carried forward from [`docs/specs/2026-05-16-review-discussion-loop-v1.md`](2026-05-16-review-discussion-loop-v1.md)'s "Future iterations" section. The "small design call" framing in those specs is preserved here: this iteration is intentionally lightweight (decision + documentation only) because the YAGNI default for v1 is clear after the design space is properly enumerated.

Designed 2026-05-17, immediately after [`docs/specs/2026-05-16-per-role-bot-identities-for-reviewers.md`](2026-05-16-per-role-bot-identities-for-reviewers.md) (queued item #3) merged. Per the agentic-team debt-clearing v1 commitment, queued items drain sequentially without interleaving; this is queued item #6 (items #4 and #5 are blocked on external triggers — 4th reviewer role added / N=5 multi-model spec/ADR PR observations).

**Followup commit on PR #19** (this iteration's own PR) substantially revised the spec in response to red-team Opus's review, which surfaced (a) that the original "binary choice" framing missed a third design option (the `ready-for-review + auto-merge label` trigger), (b) that the original "controller's merge action = acknowledgment" premise breaks under auto-merge (the workflow merges, not the controller), (c) that PR #18's empirical record was "strong with residuals" not "clean termination", and (d) that the original "controller wants to write" tripwire required per-session introspection (against the tripwire-condition-(iii) convention). The followup preserves the accept-asymmetry decision but rebuilds the supporting case from honest premises and explicitly names option (3) as the leading future-iteration design. The premise corrections are the substantive followup; the decision survives them.

## Post-merge implementation

Per the post-merge implementation convention, **two direct-master commits**. Both content fully specified verbatim below.

- **Commit 1:** Add one paragraph to CLAUDE.md "Respondent posting discipline" subsection documenting the asymmetry as intentional.
- **Commit 2:** Flip roadmap.md Considering entry → Queued/Shipped `[x]`.

### Verbatim — Commit 1 (CLAUDE.md edit)

Locate the "Respondent posting discipline" subsection in `shell/CLAUDE.md` (around line 214). Locate the "Initial-review round" paragraph that begins `**Initial-review round:**` (around line 252). Locate the next paragraph that begins `**Discipline note:**` (around line 254). Insert the following NEW paragraph between them:

> **Final-round asymmetry (intentional, paired with the initial-round asymmetry above).** The respondent dispatches **only after a `Code-review-followup:` commit**. The initial-round skip (above) and this final-round skip are **bookends of one rule**: the respondent fires only when the controller has produced a followup commit containing dispositions to document. The opening side has nothing to dispose of yet; the closing side has the controller's implicit "no further followup" judgment that captures any net-new items from the final re-reviews. The final re-review's body is the **reviewer's** voice; the absence of a respondent leaves the controller-voice acknowledgment of those items implicit rather than explicit. Under auto-merge, the controller's merge-authorization step is the `ready-for-review` + `labeled auto-merge` two-step, not the workflow's `gh pr merge` call. v1 accepts this gap; option (3) in the spec (`ready+label` as a respondent dispatch trigger) is the leading future-iteration design. Triggers to revisit: (a) strong-with-residuals pattern at **N=2 consecutive spec/ADR PRs** (final re-review verdict "strong" with ≥3 net-new items and no followup) — observable from PR timelines without controller-session introspection; (b) authorization-trail audit need; (c) process change that requires explicit per-finding acknowledgment before merge. **Operational discipline (until option (3) ships):** don't apply the `auto-merge` label until all current-round re-reviews have posted — this avoids the workflow firing mid-round on an already-labeled + already-ready PR. Spec: [`docs/specs/2026-05-17-auto-merge-bypasses-final-respondent.md`](docs/specs/2026-05-17-auto-merge-bypasses-final-respondent.md).

### Verbatim — Commit 2 (roadmap.md flip)

In `shell/docs/roadmap.md`, **Pre-edit verification step:** before deleting, run `grep -n "Auto-merge-bypasses-final-respondent" shell/docs/roadmap.md` to locate the exact line.

**Before (in the Considering section):**

```md
- [ ] **Auto-merge-bypasses-final-respondent design** — small design call. The respondent posts after each Code-review-followup commit, but the FINAL round (clean reviews → user merges) has no followup commit and therefore no respondent post. Either accept this asymmetry, or design a "final wrap" respondent post for the merge-ready state. Trigger: after respondent v1 ships and the asymmetry is operational (per `review-discussion-loop-v1` carry-forward).
```

DELETE the above entry from the Considering section. ADD the following entry to the **Queued** section of the agentic-team architecture track, immediately after the existing "Per-role bot identities for reviewers" `[x]`-marked entry:

```md
- [x] **Auto-merge-bypasses-final-respondent design** — decision-only iteration. v1 accepts the asymmetry between the respondent's per-`Code-review-followup`-commit dispatch cadence and the spec/ADR PR's final-round flow, with the honest caveats that (a) the gap is real (the reviewer's voice is not the controller's voice), (b) the cost-bearing case is "strong with residuals" final re-reviews, and (c) option (3) — making the controller's `ready-for-review + labeled auto-merge` two-step a respondent dispatch trigger — is the leading future-iteration design (surfaced by red-team Opus's review on this iteration's PR). CLAUDE.md "Respondent posting discipline" subsection documents the asymmetry as the closing-side bookend of the existing initial-round asymmetry + names the strong-with-residuals tripwire (fires at N=2 PRs) + adds v1 operational discipline against the auto-merge mid-round race. Spec: [`specs/2026-05-17-auto-merge-bypasses-final-respondent.md`](specs/2026-05-17-auto-merge-bypasses-final-respondent.md).
```
