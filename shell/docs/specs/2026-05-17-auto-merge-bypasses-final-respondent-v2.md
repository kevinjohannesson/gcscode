# Auto-merge bypasses final-respondent v2 — corrected reasoning + workflow gate fix

**Slug:** auto-merge-bypasses-final-respondent-v2
**Iteration on the agentic-team track:** fourteenth. Supersedes v1 ([`2026-05-17-auto-merge-bypasses-final-respondent.md`](2026-05-17-auto-merge-bypasses-final-respondent.md), merged 2026-05-17 at 07:28:54Z).
**Type:** substantive successor. Rebuilds v1's case for accept-asymmetry from honest premises AND adds an auto-merge workflow gate fix to prevent the mid-round race that triggered this supersession.
**No bootstrap exceptions.** Spec ships via spec-PR workflow; implementation lands per the post-merge implementation convention.

## Context

v1 of this iteration was merged at 07:28:54Z on 2026-05-17, **AFTER only 2 of 3 initial reviewers had posted**. Timeline (verifiable via `gh pr view 19 --json reviews` and `gh run list --workflow=auto-merge.yml`):

- 07:27:29Z — controller flips PR #19 ready-for-review + applies `auto-merge` label (same step, parallel commands)
- 07:28:43Z — red-team Sonnet posts initial review
- 07:28:46Z — auto-merge workflow fires on `pull_request_review.submitted` (red-team count=1, spec-quality count=0; Gate 3b fails; exits cleanly)
- 07:28:50Z — spec-quality posts initial review
- 07:28:54Z — auto-merge workflow fires again; red-team count=1, spec-quality count=1; Gate 3b passes; merges PR #19
- 07:32:04Z — red-team Opus posts initial review on an **already-merged** PR

Red-team Opus's review surfaced 6 premise challenges + 4 drift items + 4 open questions, including: (a) the "final re-review's body is the controller's acknowledgment" premise — v1 collapsed reviewer-voice and controller-voice as equivalent; (b) v1's "binary choice" framing missed a third design option (the `ready-for-review + labeled auto-merge` two-step as a respondent dispatch trigger — Opus-surfaced); (c) v1's PR-#18 empirical record was "clean termination" — actually strong-with-residuals with a deliberate two-step merge action; (d) v1's "N=3 controller-wants-to-write" trigger required per-session introspection, violating the tripwire-condition-(iii) convention in CLAUDE.md.

**The race fired on the spec that documented it — but not in the way originally framed.** The pre-existing Gate 3b threshold (`gcscode-red-team` count >= 1, inherited from pre-multi-model days) is structurally loose under multi-model red-team dispatch — any one of Opus or Sonnet plus spec-quality satisfies it. v1 did NOT codify a "don't label until reviews post" workflow gate; v1's only post-merge mechanic was a CLAUDE.md prose paragraph about respondent dispatch cadence. **There was no prior operational discipline for the controller to violate — v1 substituted prose for a gate change.** PR #19 was the first opportunity to test that substitution; it failed at the first opportunity.

v2 supersedes v1 to (a) rebuild the case for accept-asymmetry from honest premises (responding to Opus's substantive critique), and (b) **ship the gate change v1 declined**. The framing is not "manual discipline failed empirically and must be replaced by a gate." The framing is "the underlying gate threshold has always been loose; multi-model red-team dispatch made the looseness exploitable; v1 didn't fix it; v2 does." Cheap structural mitigation is available for a real failure mode that has been demonstrated once — the YAGNI counter-argument is "wait for a second observation," but the cost of adding the gate now is small enough to justify ahead of N=2.

## Why not the bigger version

The bigger version would design a "final wrap" respondent post that fires when a PR reaches merge-ready state. Three structural options for the trigger, in order from heaviest to smallest infrastructure cost:

- **(1) Trigger on PR merge event.** A GitHub Actions workflow listens for `pull_request.closed && merged == true` and dispatches a respondent. Bigger wedge: new workflow file, new dispatch path outside the controller's session, new infrastructure. Also: posting AFTER merge means the post lands on a closed PR — readers must look at a closed PR to find the final wrap.
- **(2) Trigger on "all re-reviews are clean" detection.** Controller detects merge-ready state (all 3 re-reviews are `--comment` clean) and dispatches a wrap respondent before the user merges. Bigger wedge: detection logic is non-trivial; the "strong with residuals" case is clean-by-verdict-but-has-undisposed-items, so detection on verdict alone misses the cost-bearing case.
- **(3) Trigger on the controller's `ready-for-review` + `labeled auto-merge` step.** Surfaced by red-team Opus's review of v1's PR. The controller's deliberate two-step IS the merge authorization (PR #18 and PR #19 both confirm: the actions happened deliberately, not as a side-effect of any other flow). Adding a respondent dispatch at this exact moment captures the controller-voice acknowledgment in the natural place: as a deliberate authorization post, on an OPEN PR, before merge. Smaller infrastructure than (1); more precise than (2). **This is the leading future-iteration design candidate.**

The bigger versions add infrastructure for a wrap post whose information value is the **controller-voice per-finding disposition for the final re-reviews' undisposed items**. That value is low when final re-reviews are truly clean (no new findings) and meaningful when they're "strong with residuals" (the cost-bearing case Opus surfaced).

**Counter-argument for designing it now:** symmetry. If every initial-review round gets a respondent post, the final round should too. The symmetry argument has real weight — the respondent's purpose is to document **controller-voice dispositions**, and when a final re-review surfaces new items, those items genuinely need disposing of. The absence makes them invisible from a controller-voice perspective, exactly the gap respondent v1 was introduced to close.

**Why v2 still accepts the asymmetry:** two narrower premises hold even after Opus's critique, with explicit caveats this followup adds:

- The respondent has **already** disposed of the **initial-round findings** (via the per-followup-commit dispatch). "Initial-round" here is a temporal criterion, not a load-bearing-ness judgment — initial-round findings get a respondent because the trigger fired (a followup commit landed); re-review findings don't get one because no second followup is being made. The asymmetry is in the trigger, not in importance ranking.
- Net-new findings in re-reviews fall into TWO shapes (per Opus's review of PR #20):
  - **Second-order critiques of HOW the followup addressed prior findings.** Bounded by construction — re-reviewers focus on the followup's diff.
  - **First-order observations on NEW content the followup introduced.** Empirically observed: PR #18's red-team Opus re-review surfaced three such items (credential-persistence premise; uninstall-vs-delete attribution claim; wildcard-vs-literal permission form), all triggered by NEW content the followup added (Operational prerequisite section; historical-attribution claim; settings.local.json subsection).

The bound on the asymmetry's cost is therefore narrower than v2's original framing claimed: the surface area of net-new re-review findings is **the followup's diff** (which can include new content), not the whole spec. This still supports the YAGNI argument — the surface is bounded by what the followup added — but does NOT support a "second-order critiques only" claim.

Net: the cost of the asymmetry is bounded by the followup-diff surface; the cost of filling it (any of options 1, 2, 3) is real new infrastructure. YAGNI says wait until the cost-bearing case earns its own evidence — and the v2 tripwire below provides observable instrumentation for that evidence.

## Goals

1. Codify the asymmetry as **intentional**, paired with the existing initial-round asymmetry as bookends of one rule (the respondent fires only when the controller has produced a followup commit containing dispositions to document).
2. Add a **workflow gate fix** to prevent the auto-merge mid-round race that triggered this supersession — the gate must enforce "all current-round reviewers have posted" before merging.
3. Name option (3) (the `ready+label` respondent dispatch trigger) as the leading future-iteration design candidate explicitly.
4. Add an observable tripwire (strong-with-residuals at N=2 PRs) replacing v1's per-session-introspection trigger.
5. Update CLAUDE.md "Respondent posting discipline" subsection with one paragraph documenting the bookend asymmetries + the v2 workflow gate + the leading future-iteration design.
6. Add a one-line forward-breadcrumb to v1 spec pointing to v2 (per CLAUDE.md "Specs as historical record").

## Non-goals (this iteration)

- **Implementing option (3) (the `ready+label` respondent trigger).** YAGNI per the analysis above. Future iteration if the strong-with-residuals tripwire fires.
- **Changing the respondent dispatch cadence.** Respondent stays per-`Code-review-followup`-commit.
- **Removing v1 from the historical record.** v1 stays as the historical record of the initial decision; v2 supersedes the substantive content but preserves v1 per the specs-as-historical-record convention.
- **Adding new reviewer roles or dispatch hooks.** Out of scope.
- **Bot permissions audit on the workflow.** Workflow gates can be revisited later; v2 only changes Gate 3b.

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
         ↓ workflow (with v2's gate fix) waits for all 3 reviewer posts before merging
```

The "missing" respondent post is the **controller-voice dispositional acknowledgment of the Round 2 re-reviews**. Its absence is not a bug — it's the natural consequence of the respondent's trigger condition being unmet. But it IS a real gap in the controller-voice audit trail.

### Bookend asymmetries

CLAUDE.md "Respondent posting discipline > Initial-review round" already documents an asymmetry on the OPENING side: the respondent is NOT dispatched on the initial-review round because "there is nothing to dispose of yet." v2's final-round asymmetry is the **closing-side counterpart**. Both share a single underlying principle: **the respondent fires only when the controller has produced a `Code-review-followup:` commit containing the dispositions to document.** The opening side has nothing to dispose; the closing side has the controller's implicit "no further followup" judgment.

The closing-side cost is asymmetrically larger than the opening-side cost: at the opening, nothing to dispose; at the closing, "strong with residuals" cases have undisposed items. v2 accepts this cost; future iterations may design option (3) to close it.

### Auto-merge workflow gate fix (Gate 3b)

The current Gate 3b (per [`docs/specs/2026-05-14-auto-merge-on-user-approval.md`](2026-05-14-auto-merge-on-user-approval.md), implemented in `.github/workflows/auto-merge.yml`) counts:

```bash
REDTEAM_COUNT=$(echo "$PR_JSON" | jq -r '[.reviews[] | select(.author.login == "gcscode-red-team")] | length')
SPECQUALITY_COUNT=$(echo "$PR_JSON" | jq -r '[.reviews[] | select(.author.login == "gcscode-spec-quality")] | length')
if [[ "$REDTEAM_COUNT" == "0" || "$SPECQUALITY_COUNT" == "0" ]]; then
  echo "Gate 3b FAILED: red-team count=${REDTEAM_COUNT}, spec-quality count=${SPECQUALITY_COUNT} (both required > 0). Exiting cleanly."
  exit 0
fi
```

This counts cumulative reviews across all rounds, treating any single red-team review + any single spec-quality review as sufficient. The race on PR #19: red-team Sonnet + spec-quality posted within 7 seconds; workflow fired on the second post; gate passed (count 1+1); merged before Opus posted.

**v2's fix (F2 in the option enumeration below):** require **REDTEAM_COUNT >= 2** on spec/ADR PRs while multi-model red-team dispatch is in effect (per [`docs/specs/2026-05-16-multi-model-red-team-v1.md`](2026-05-16-multi-model-red-team-v1.md), specifically its Future iterations item #6 "Auto-merge gate-3b strictness for multi-model red-team" — v2 ships that item early, motivated by PR #19's race rather than waiting for the multi-model evaluation's KEEP-BOTH gate). Both Opus and Sonnet post under `gcscode-red-team[bot]`, so requiring count >= 2 implicitly requires both models to have posted **on the initial-review round**. spec-quality stays at >= 1 (single-model dispatch).

```bash
REDTEAM_COUNT=$(echo "$PR_JSON" | jq -r '[.reviews[] | select(.author.login == "gcscode-red-team")] | length')
SPECQUALITY_COUNT=$(echo "$PR_JSON" | jq -r '[.reviews[] | select(.author.login == "gcscode-spec-quality")] | length')
# v2: require both red-team models (>=2) to have posted while multi-model dispatch is in effect.
# When multi-model v1 evaluation completes, this gate is revisited to match the dispatch shape.
if [[ "$REDTEAM_COUNT" -lt 2 || "$SPECQUALITY_COUNT" -lt 1 ]]; then
  echo "Gate 3b FAILED: red-team count=${REDTEAM_COUNT} (need >=2 for multi-model dispatch), spec-quality count=${SPECQUALITY_COUNT} (need >=1). Exiting cleanly."
  exit 0
fi
```

**Coupling note:** this fix couples Gate 3b to the multi-model dispatch shape. **Cross-iteration obligation:** if the multi-model v1 evaluation iteration (queued #5) resolves to KEEP-OPUS-ONLY or KEEP-SONNET-ONLY, **that iteration's post-merge implementation MUST revert Gate 3b's red-team threshold to >= 1 in the same post-merge commit batch as the evaluation's other changes.** This is not a soft "should revisit" — it is a hard cross-spec obligation that v2 imposes on the evaluation iteration. Until then, v2's gate is over-strict in the wrong direction if multi-model dispatch is removed; users would have to manually merge OR remember to revert. v2 records this as a documented forward dependency on the evaluation iteration's brainstorm.

**Known limitation — cumulative-count semantics in re-review rounds (Sonnet P1).** Gate 3b's count is cumulative across all rounds, not per-round. After the first `Code-review-followup:` commit, both Opus's re-review AND Sonnet's re-review fire. If Opus posts first, `REDTEAM_COUNT=3` (initial Opus + initial Sonnet + re-review Opus); gate passes immediately, before Sonnet's re-review has been seen. The same race that motivated v2 re-fires at the re-review round — v2's F2 closes the initial-round race but leaves the re-review-round race open. This is an **accepted limitation** of F2 in v1; the fix shape that closes both races is F1 (parse model + round from headers) or F4 (per-PR reviewer manifest), both rejected as too invasive for v2's small cut. **Operational mitigation while v2's F2 is in effect:** treat the `auto-merge` label as a per-round signal — remove the label after pushing each `Code-review-followup:` commit, re-apply it only after all expected reviewers have re-posted on that round. This restores the round-discipline the gate can't enforce cumulatively. **Tripwire for upgrading from F2 to F1/F4:** documented below in Tripwires.

**Why not the bigger workflow fix (the F-label enumeration):**

- **F1 — Parse model from review header.** More robust; doesn't couple to identity counts. Closes both initial-round and re-review-round races. But: complex header-parsing inside jq + the gate must know the expected (model × role) tuples for each PR class. **Punt to the future Gate 3b refinement iteration.**
- **F2 — `REDTEAM_COUNT >= 2` (this v2 ships).** Smallest cut. Closes the initial-round race. Leaves the re-review-round race per the known limitation above.
- **F3 — Fixed wait window.** Wait N seconds after gates pass before merging, then re-check. Simple. But: delays every merge by N seconds even when no extra reviewer is expected; coupling to "expected" reviewer count is implicit (relies on timing alone). Doesn't close the re-review-round race semantically.
- **F4 — Per-PR reviewer manifest.** PR author declares which reviewers are expected; gate waits for all. Cleanest semantics. Closes both races. But: invasive; requires manifest format + maintenance.

v2 ships F2 as the smallest cut. F1 and F4 are the structural answers; both are punted to the future Gate 3b refinement iteration triggered by the re-review-round race tripwire below.

### Decision (v2)

Accept the asymmetry at the respondent level, with three honest caveats:

1. The controller-voice audit trail has a real gap at the final round when re-reviews are "strong with residuals" (clean by verdict but containing new items).
2. The bound on the gap is the followup-diff surface — net-new re-review findings fall into two shapes: (a) second-order critiques of HOW the followup addressed prior findings, and (b) first-order observations on NEW content the followup introduced. Both are bounded by the diff (the surface area the followup added), NOT by "second-order only" (which would be a stronger and empirically-false claim). See "Why not the bigger version" for the empirical reasoning and PR #18's evidence of both shapes.
3. Under auto-merge, the controller's "merge action" is the `ready-for-review` + `labeled auto-merge` two-step, NOT the workflow's `gh pr merge` call. Option (3) above proposes capturing the two-step as a respondent post; v2 accepts that it stays implicit but commits the workflow-side gate fix so the two-step actually gates correctly.

### CLAUDE.md edit (v2 — replaces v1's never-landed Commit 1)

Add one paragraph to the "Respondent posting discipline" subsection, between the "Initial-review round" paragraph and the "Discipline note" paragraph. The paragraph names the bookend asymmetries, cites v2 (not v1), references the Gate 3b fix, names option (3) as leading future design.

Full verbatim content in Post-merge implementation > Commit 2.

### Trigger to revisit

A future iteration designs option (3) if:

- **Strong-with-residuals pattern at N=2.** Observable from a PR timeline: a final re-review verdict is "strong" but surfaces ≥3 new items (new premises, drift items, or open questions) AND the controller chooses no followup. If the pattern appears on **N=2 consecutive spec/ADR PRs**, the trigger fires.
- **Authorization-trail audit need.** A future audit (regulatory, postmortem, agentic verification check) needs the controller-voice "I read the final re-review and authorize merge" record explicitly.
- **Process change.** A future iteration redesigns the reviewer dispatch flow such that re-reviews don't end the loop cleanly.

v1's "controller wants to write" trigger is removed — per-session introspection violates CLAUDE.md "Reviewer-role design conventions > Tripwires" condition (iii).

## Validation

- **v2's workflow fix is NOT in effect during v2's own review phase.** Commit 1 (the workflow YAML edit) is a post-merge direct-master commit. PR #20 is gated by the OLD `>= 1` threshold, the same gate that produced PR #19's race. The "same race window that caused v1's merge is open for v2." There is therefore no structural validation of the fix from PR #20's own merge; the validation is **counterfactual**: under v2's proposed gate, PR #20 could not have merged without both red-team Opus and Sonnet posted + spec-quality.
- **Operational mitigation for PR #20 itself (recursive risk):** the controller deliberately did NOT apply the `auto-merge` label to PR #20 until after all 3 initial reviewers had posted, exercising manual discipline as the structural fix doesn't gate this PR. **This is the exact discipline v1 implicitly relied on without codifying as a gate;** the failure mode v2 closes structurally is the same one this PR mitigates manually for itself. If reviewers re-dispatch after a `Code-review-followup:` commit on PR #20, the same manual discipline applies — wait for all 3 re-reviewers before re-labeling.
- **Substantive reasoning** is validated by the spec-PR's red-team + spec-quality reviews under the OLD gate. Both red-team models posted (gcscode-red-team count=2: Sonnet 08:01:51Z + Opus 08:04:13Z) plus spec-quality (08:01:37Z). The reviewer outputs are the substantive validation.
- **Tripwire instrumentation** (strong-with-residuals at N=2; re-review-round race observation; Gate 3b false-positive pattern) is encoded in this spec for observation on future PRs. Post-merge implementation lands the gate change; the gate then validates structurally on the FIRST spec/ADR PR after v2 ships.

## VS Code alignment

No VS Code alignment implications. Respondent dispatch + auto-merge gates are gcscode-specific. VS Code's extension architecture has neither.

Propagation to `shell/docs/vs-code-alignment.md`: none.

## `docs/out-of-scope.md` propagation

**No edit.** This iteration is per-iteration scope (accept asymmetry + fix workflow gate). The Future iterations are documented inline. Out-of-scope.md is for cross-cutting deferrals.

## `docs/roadmap.md` propagation

The pre-existing Considering entry for "Auto-merge-bypasses-final-respondent design" still exists at `shell/docs/roadmap.md` (created when the item was queued, before v1 shipped). v1's post-merge Commit 2 was meant to flip this entry to Queued/Shipped `[x]` but never landed (v1's PR was merged before Opus's review, and the post-merge work was redirected into v2). v2 ships ONE Queued/Shipped `[x]` entry (for v2 itself, citing the v2 spec), deleting the pre-existing Considering entry.

Verbatim edit content in Post-merge implementation > Commit 3.

## Known unknowns

- **Empirical sample size of two (PRs #18 and #19).** The cost-bearing case (strong-with-residuals + no followup) appeared on PR #18 (Opus's residuals went undisposed); the race appeared on PR #19. v2's tripwire and gate fix together close both gaps for future PRs.
- **Gate 3b coupling to multi-model dispatch.** Documented in Architecture > Auto-merge workflow gate fix. Future multi-model evaluation iteration must revert if it drops Sonnet from the red-team dispatch.
- **Option (3) is preferred for the future final-wrap iteration.** Documented in Why not the bigger version.
- **`docs/specs/2026-05-14-auto-merge-on-user-approval.md` (the spec that originally introduced Gate 3b) drifts post-Commit 1.** That spec documents Gate 3b's original `>= 1` semantics. Per CLAUDE.md "Specs as historical record," merged specs are NOT deeply edited substantively; they stand as historical record of their iteration's decisions. v2's Commit 1 changes the workflow Gate 3b, which renders that spec's Gate 3b description historical. **No edit to `auto-merge-on-user-approval.md` planned.** v2 supersedes its Gate 3b semantics via this spec; readers of the auto-merge-on-user-approval spec who want the current gate semantics should follow the same forward-breadcrumb pattern v2 applies to v1 — by reading newer specs in the spec timeline. A future iteration may add a breadcrumb to the auto-merge spec if the forward-reference becomes load-bearing.
- **F2's operational mitigation (remove label after each Code-review-followup commit, re-apply after re-reviews post) is structurally the same shape as v1's "discipline-as-substitute-for-gate" pattern that v2 critiques.** Acknowledged: v2's mitigation is a smaller substitution (it applies only to the re-review-round race, not the initial-round race, which v2 closes structurally), and the re-review-round race tripwire instruments the escalation to F1/F4. The asymmetry is intentional: v2 ships F2 as the smallest cut; the structural answer (F1/F4) is queued.

## Tripwires for known-quality concerns

All tripwires below are formulated as pattern-across-N signals (per CLAUDE.md "Reviewer-role design conventions > Tripwires" condition iii); none requires per-PR introspection.

- **Strong-with-residuals tripwire.** If a spec/ADR PR's final re-review verdict is "strong" but the body surfaces ≥3 net-new items AND the controller chooses no followup, that's a single-PR signal that the asymmetry is producing meaningful undisposed-residuals. **Fires at N=2 consecutive PRs** matching this pattern. Response: a future iteration designs option (3).
- **Re-review-round race tripwire (NEW for v2 — addresses Sonnet P1).** If a spec/ADR PR merges on a Code-review-followup commit's re-review event with fewer than ALL expected reviewers having re-posted in that round (observable from the PR's `mergedAt` vs the timestamps of the latest reviews from each reviewer), F2's cumulative-count semantics has produced the gap. **Fires at N=2 PRs** to avoid noise. Response: replace F2 with F1 (parse model + round from headers) or F4 (per-PR reviewer manifest).
- **Gate 3b false-positive tripwire.** If F2 blocks legitimate merges (e.g., a PR where only one red-team model was dispatched intentionally — multi-model evaluation iteration lands KEEP-OPUS-ONLY/KEEP-SONNET-ONLY and the gate isn't reverted in the same iteration), the gate is over-strict. **Fires at N=2 PRs** matching this pattern. Response: enforce the cross-iteration obligation documented in Architecture > Auto-merge workflow gate fix > Coupling note (the multi-model evaluation iteration MUST revert Gate 3b in its post-merge implementation).

Tripwires are manual review items, not automated checks. They live in this spec and migrate to a future iteration's brainstorm input if any fires.

## Future iterations

1. **Final-wrap respondent post design — option (3) preferred.** Trigger: strong-with-residuals at N=2, OR authorization-trail audit need, OR process change. Per "Trigger to revisit" above. Implements option (3) (the `ready+label` two-step as a respondent dispatch trigger).
2. **Gate 3b refinement (F1 or F4).** Trigger: re-review-round race tripwire at N=2 OR multi-model evaluation iteration's revert obligation can't be discharged. Implements F1 (parse model + round from headers) or F4 (per-PR reviewer manifest). Closes both initial-round AND re-review-round races structurally.

## Origin

v1 of this iteration was opened, reviewed by 2 of 3 expected reviewers, and merged at 07:28:54Z on 2026-05-17 BEFORE red-team Opus's review at 07:32:04Z. The auto-merge mid-round race fired on v1's own PR. Red-team Opus's post-merge review surfaced premise corrections that landed on the orphaned `spec/auto-merge-bypasses-final-respondent` branch as a followup commit but never made it to master (the PR was already merged).

v2 supersedes v1 by integrating Opus's substantive corrections AND closing the race that prevented v1 from being properly reviewed in the first place. Per CLAUDE.md "Specs as historical record," v2 ships as a successor spec; v1 stays as the historical record of the initial decision (with a one-line forward-breadcrumb added by v2's Commit 3 pointing to this file).

Operational lesson for future spec-PRs: v1 substituted prose for a gate change. The underlying Gate 3b threshold has always been loose (`gcscode-red-team` count >= 1), and multi-model red-team dispatch made it exploitable. v1 documented the asymmetry but didn't tighten the gate. v2 ships the gate change v1 declined. Cross-iteration coupling with the multi-model evaluation iteration is a hard obligation (see Architecture > Auto-merge workflow gate fix > Coupling note), not a soft hand-off.

## Post-merge implementation

Per the post-merge implementation convention, **three direct-master commits**. All content fully specified verbatim below.

- **Commit 1:** Update `.github/workflows/auto-merge.yml` Gate 3b — replace leading comment block + threshold logic; update top-of-file comment block for spec/_ + adr/_ description.
- **Commit 2:** Two CLAUDE.md sub-edits: (2a) add v2 paragraph to "Respondent posting discipline" subsection; (2b) update the "Auto-merge on user approval" bullet in "Branching and merging" to match the new Gate 3b semantics.
- **Commit 3:** Documentation propagation — (3a) roadmap.md flip (delete pre-existing Considering entry; add single Queued/Shipped entry for v2); (3b) v1 forward-breadcrumb appended to v1 spec.

### Verbatim — Commit 1 (`.github/workflows/auto-merge.yml` Gate 3b)

Locate the Gate 3b block in `.github/workflows/auto-merge.yml` (around lines 92–103). The block includes a leading comment block followed by the gate logic. **Replace BOTH the leading comment AND the gate logic** with the After block — do not leave the old leading comment in place.

**Before** (includes leading comment block to be REPLACED):

```bash
# Gate 3b: BOTH red-team AND spec-quality must have posted at least one review.
# Enforces the auto-dispatch obligation from CLAUDE.md "Reviewer-role design
# conventions" — prevents an eager auto-merge label at PR-open time from racing
# past the auto-dispatch step.
REDTEAM_COUNT=$(echo "$PR_JSON" | jq -r '[.reviews[] | select(.author.login == "gcscode-red-team")] | length')
SPECQUALITY_COUNT=$(echo "$PR_JSON" | jq -r '[.reviews[] | select(.author.login == "gcscode-spec-quality")] | length')
if [[ "$REDTEAM_COUNT" == "0" || "$SPECQUALITY_COUNT" == "0" ]]; then
  echo "Gate 3b FAILED: red-team count=${REDTEAM_COUNT}, spec-quality count=${SPECQUALITY_COUNT} (both required > 0). Exiting cleanly."
  exit 0
fi
echo "Gate 3b OK: red-team count=${REDTEAM_COUNT}, spec-quality count=${SPECQUALITY_COUNT}"
```

**After** (replaces the entire block above, comment + logic):

```bash
# Gate 3b: gcscode-red-team count >= 2 (both Opus and Sonnet under multi-model
# dispatch per multi-model-red-team-v1) AND gcscode-spec-quality count >= 1.
# Enforces auto-dispatch obligation AND prevents the initial-round merge race
# documented in 2026-05-17-auto-merge-bypasses-final-respondent-v2.md. Known
# limitation: cumulative counting does not gate re-review-round races; see v2
# spec's "Known limitation — cumulative-count semantics in re-review rounds".
REDTEAM_COUNT=$(echo "$PR_JSON" | jq -r '[.reviews[] | select(.author.login == "gcscode-red-team")] | length')
SPECQUALITY_COUNT=$(echo "$PR_JSON" | jq -r '[.reviews[] | select(.author.login == "gcscode-spec-quality")] | length')
if [[ "$REDTEAM_COUNT" -lt 2 || "$SPECQUALITY_COUNT" -lt 1 ]]; then
  echo "Gate 3b FAILED: red-team count=${REDTEAM_COUNT} (need >=2 for multi-model dispatch), spec-quality count=${SPECQUALITY_COUNT} (need >=1). Exiting cleanly."
  exit 0
fi
echo "Gate 3b OK: red-team count=${REDTEAM_COUNT}, spec-quality count=${SPECQUALITY_COUNT}"
```

Also update the workflow's leading comment block (around line 9) — the spec/_ or adr/_ gate description:

**Before:**

```
#         - spec/* or adr/*: BOTH `gcscode-red-team` AND `gcscode-spec-quality`
#           have posted at least one review on the PR (enforces auto-dispatch
#           obligation from CLAUDE.md).
```

**After:**

```
#         - spec/* or adr/*: `gcscode-red-team` count >= 2 (both Opus and Sonnet
#           under multi-model dispatch) AND `gcscode-spec-quality` count >= 1.
#           Enforces auto-dispatch obligation AND prevents mid-round merge race.
#           Per spec: 2026-05-17-auto-merge-bypasses-final-respondent-v2.md.
```

### Verbatim — Commit 2 (CLAUDE.md edits — two sub-edits)

**2a — Respondent posting discipline paragraph.** Locate the "Respondent posting discipline" subsection in `shell/CLAUDE.md` (around line 214). Locate the "Initial-review round" paragraph that begins `**Initial-review round:**` (around line 252). Locate the next paragraph that begins `**Discipline note:**` (around line 254). Insert the following NEW paragraph between them:

> **Final-round asymmetry (intentional, paired with the initial-round asymmetry above).** The respondent dispatches **only after a `Code-review-followup:` commit**. The initial-round skip (above) and this final-round skip are **bookends of one rule**: the respondent fires only when the controller has produced a followup commit containing dispositions to document. The opening side has nothing to dispose; the closing side has the controller's implicit "no further followup" judgment. When final re-reviews are "strong with residuals" (clean verdict but containing net-new items), the controller-voice acknowledgment of those residuals stays implicit. Under auto-merge, the controller's merge-authorization step is the `ready-for-review` + `labeled auto-merge` two-step, not the workflow's `gh pr merge` call. v2 keeps this gap but closes the auto-merge initial-round merge race that exposed it: Gate 3b now requires `gcscode-red-team` count >= 2 (both Opus and Sonnet posted under multi-model dispatch) AND `gcscode-spec-quality` count >= 1 before merge. Cumulative-count semantics leave a known re-review-round race; operational mitigation while v2's F2 is in effect: remove the `auto-merge` label after each `Code-review-followup:` commit and re-apply only after all expected re-reviewers have posted. Option (3) — making the `ready+label` two-step a respondent dispatch trigger — is the leading future-iteration design. Triggers to revisit: (a) strong-with-residuals pattern at **N=2 consecutive spec/ADR PRs** (final re-review verdict "strong" with ≥3 net-new items and no followup) — observable from PR timelines; (b) authorization-trail audit need; (c) process change requiring explicit per-finding acknowledgment before merge. Spec: [`docs/specs/2026-05-17-auto-merge-bypasses-final-respondent-v2.md`](docs/specs/2026-05-17-auto-merge-bypasses-final-respondent-v2.md) (supersedes [v1](docs/specs/2026-05-17-auto-merge-bypasses-final-respondent.md)).

**2b — "Auto-merge on user approval" bullet (Branching and merging section).** Locate the bullet in `shell/CLAUDE.md` that begins `**Auto-merge on user approval.**` (around line 46). Within that bullet, locate the text describing the spec/ADR PR gate:

**Before:** `for \`spec/_\` or \`adr/_\` PRs both red-team AND spec-quality have posted at least one review`

**After:** `for \`spec/_\` or \`adr/_\` PRs \`gcscode-red-team\` has posted >=2 reviews (both Opus and Sonnet under multi-model dispatch) AND \`gcscode-spec-quality\` has posted >=1 review (enforcing the auto-dispatch obligation AND preventing the initial-round merge race)`

The rest of the bullet (auto-merge label semantics, branch-class scoping, etc.) is unchanged. The "enforcing the auto-dispatch obligation" phrase is preserved from the original wording (matches CLAUDE.md's existing rationale framing); the added clause names the v2 race-prevention purpose explicitly.

### Verbatim — Commit 3 (docs propagation + v1 forward-breadcrumb)

**3a — roadmap.md flip.**

Pre-edit verification: `grep -n "Auto-merge-bypasses-final-respondent" shell/docs/roadmap.md`.

**Before (in the Considering section):**

```md
- [ ] **Auto-merge-bypasses-final-respondent design** — small design call. The respondent posts after each Code-review-followup commit, but the FINAL round (clean reviews → user merges) has no followup commit and therefore no respondent post. Either accept this asymmetry, or design a "final wrap" respondent post for the merge-ready state. Trigger: after respondent v1 ships and the asymmetry is operational (per `review-discussion-loop-v1` carry-forward).
```

DELETE the above from Considering. ADD the following to the Queued section of the agentic-team architecture track, immediately after the existing "Per-role bot identities for reviewers" `[x]`-marked entry:

```md
- [x] **Auto-merge-bypasses-final-respondent design (v2)** — accepted-asymmetry decision + Gate 3b workflow fix shipping multi-model-red-team-v1's Future iteration #6 early. Gate 3b now requires `gcscode-red-team` count >= 2 (both Opus and Sonnet under multi-model dispatch) + `gcscode-spec-quality` count >= 1. Closes the initial-round merge race that produced PR #19's early merge; leaves a known re-review-round race (operational mitigation: remove the label after each Code-review-followup commit, re-apply only after all re-reviewers post). v2 supersedes v1 ([`specs/2026-05-17-auto-merge-bypasses-final-respondent.md`](specs/2026-05-17-auto-merge-bypasses-final-respondent.md)); v1's accept-asymmetry decision survives the corrected reasoning. Option (3) — making the `ready+label` two-step a respondent dispatch trigger — is named as the leading future-iteration design. Future iterations: F1/F4 (Gate 3b refinement closing the re-review race); option (3) (final-wrap respondent). Spec: [`specs/2026-05-17-auto-merge-bypasses-final-respondent-v2.md`](specs/2026-05-17-auto-merge-bypasses-final-respondent-v2.md).
```

**3b — v1 forward-breadcrumb.**

Append the following one-line blockquote to the end of `shell/docs/specs/2026-05-17-auto-merge-bypasses-final-respondent.md`:

```md
> **Superseded 2026-05-17 by [`2026-05-17-auto-merge-bypasses-final-respondent-v2.md`](2026-05-17-auto-merge-bypasses-final-respondent-v2.md):** v2 preserves the accept-asymmetry decision and rebuilds the supporting case + adds the Gate 3b fix v1 declined.
```

Per CLAUDE.md "Specs as historical record," this breadcrumb is a one-line cross-reference (the convention's explicit pattern), not a deep substantive edit to v1's content.
