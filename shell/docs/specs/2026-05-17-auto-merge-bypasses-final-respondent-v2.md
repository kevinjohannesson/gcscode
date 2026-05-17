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

**The race fired on the spec that documented it.** v1 codified an operational discipline ("don't apply the `auto-merge` label until all current-round re-reviews have posted") but the controller violated the discipline by applying the label at PR-open. The result: PR #19 merged with 2 of 3 reviewers posted, on the same iteration that's supposed to address this exact race.

v2 supersedes v1 to (a) rebuild the case for accept-asymmetry from honest premises (responding to Opus's substantive critique), and (b) **add a workflow gate fix** so the race cannot recur — manual discipline failed empirically; the gate must enforce the invariant the spec relies on.

## Why not the bigger version

The bigger version would design a "final wrap" respondent post that fires when a PR reaches merge-ready state. Three structural options for the trigger, in order from heaviest to smallest infrastructure cost:

- **(1) Trigger on PR merge event.** A GitHub Actions workflow listens for `pull_request.closed && merged == true` and dispatches a respondent. Bigger wedge: new workflow file, new dispatch path outside the controller's session, new infrastructure. Also: posting AFTER merge means the post lands on a closed PR — readers must look at a closed PR to find the final wrap.
- **(2) Trigger on "all re-reviews are clean" detection.** Controller detects merge-ready state (all 3 re-reviews are `--comment` clean) and dispatches a wrap respondent before the user merges. Bigger wedge: detection logic is non-trivial; the "strong with residuals" case is clean-by-verdict-but-has-undisposed-items, so detection on verdict alone misses the cost-bearing case.
- **(3) Trigger on the controller's `ready-for-review` + `labeled auto-merge` step.** Surfaced by red-team Opus's review of v1's PR. The controller's deliberate two-step IS the merge authorization (PR #18 and PR #19 both confirm: the actions happened deliberately, not as a side-effect of any other flow). Adding a respondent dispatch at this exact moment captures the controller-voice acknowledgment in the natural place: as a deliberate authorization post, on an OPEN PR, before merge. Smaller infrastructure than (1); more precise than (2). **This is the leading future-iteration design candidate.**

The bigger versions add infrastructure for a wrap post whose information value is the **controller-voice per-finding disposition for the final re-reviews' undisposed items**. That value is low when final re-reviews are truly clean (no new findings) and meaningful when they're "strong with residuals" (the cost-bearing case Opus surfaced).

**Counter-argument for designing it now:** symmetry. If every initial-review round gets a respondent post, the final round should too. The symmetry argument has real weight — the respondent's purpose is to document **controller-voice dispositions**, and when a final re-review surfaces new items, those items genuinely need disposing of. The absence makes them invisible from a controller-voice perspective, exactly the gap respondent v1 was introduced to close.

**Why v2 still accepts the asymmetry:** two narrower premises hold even after Opus's critique:

- The respondent has **already** disposed of the load-bearing findings (the initial reviews, via the per-followup-commit dispatch).
- Net-new findings in re-reviews are bounded by construction — re-reviewers focus on whether the followup addressed prior findings; net-new items are second-order critiques of HOW the followup addressed prior findings, not first-order critiques the respondent didn't already dispose of.

Net: the cost of the asymmetry is bounded (limited to second-order undisposed items); the cost of filling it (any of options 1, 2, 3) is real new infrastructure. YAGNI says wait until the cost-bearing case earns its own evidence — and the v2 tripwire below provides observable instrumentation for that evidence.

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

**v2's fix:** require **REDTEAM_COUNT >= 2** on spec/ADR PRs while multi-model red-team dispatch is in effect (per [`docs/specs/2026-05-16-multi-model-red-team-v1.md`](2026-05-16-multi-model-red-team-v1.md)). Both Opus and Sonnet post under `gcscode-red-team[bot]`, so requiring count >= 2 implicitly requires both models to have posted. spec-quality stays at >= 1 (single-model dispatch).

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

**Coupling note:** this fix couples Gate 3b to the multi-model dispatch shape. If the multi-model v1 evaluation iteration (queued #5) resolves to KEEP-OPUS-ONLY or KEEP-SONNET-ONLY, that iteration must revert Gate 3b's red-team threshold to >= 1. The coupling is explicit by design — the alternative (counting distinct model headers from review bodies) is more robust but adds parsing complexity unjustified at v1's small-cut tempo.

**Why not the bigger workflow fix:** I considered three alternatives:

- **F1 — Parse model from review header.** More robust; doesn't couple to identity counts. But: complex header-parsing inside jq + the gate must know the expected (model × role) tuples for each PR class. Punt to a future iteration if the multi-model evaluation lands KEEP-BOTH and the gate needs richer semantics.
- **F3 — Fixed wait window.** Wait N seconds after gates pass before merging, then re-check. Simple. But: delays every merge by N seconds even when no extra reviewer is expected; coupling to "expected" reviewer count is implicit (relies on timing alone).
- **F4 — Per-PR reviewer manifest.** PR author declares which reviewers are expected; gate waits for all. Cleanest semantics. But: invasive; requires manifest format + maintenance.

v2 ships F2 (the `>= 2` threshold) as the smallest cut. The other options are documented here so the future iteration starts from this analysis.

### Decision (v2)

Accept the asymmetry at the respondent level, with three honest caveats:

1. The controller-voice audit trail has a real gap at the final round when re-reviews are "strong with residuals" (clean by verdict but containing new items).
2. The bound on the gap is the typology of net-new re-review findings — by construction, second-order critiques not first-order.
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

- **The v2 workflow fix is validated by THIS PR.** PR #19 (v1) merged before Opus posted because Gate 3b required only count=1 for red-team. Under v2's Gate 3b, this PR (v2) cannot merge until red-team count >= 2 (both Opus and Sonnet posted) AND spec-quality count >= 1. The test is structural: if v2 merges with all 3 reviewers posted, the fix works.
- **The substantive reasoning is validated by the spec-PR's red-team + spec-quality reviews under v2's gate.** Both red-team models will get to post on v2 before any merge.
- **Tripwire instrumentation** (strong-with-residuals at N=2) is encoded in this spec for observation on future PRs.

## VS Code alignment

No VS Code alignment implications. Respondent dispatch + auto-merge gates are gcscode-specific. VS Code's extension architecture has neither.

Propagation to `shell/docs/vs-code-alignment.md`: none.

## `docs/out-of-scope.md` propagation

**No edit.** This iteration is per-iteration scope (accept asymmetry + fix workflow gate). The Future iterations are documented inline. Out-of-scope.md is for cross-cutting deferrals.

## `docs/roadmap.md` propagation

Update the existing v1 Queued/Shipped `[x]` entry (added by v1's post-merge implementation — which actually didn't land yet since v1's post-merge was skipped due to the race). v2's post-merge implementation will:

- ADD a NEW `[x]` entry for v2 immediately after v1's entry (if v1's entry exists from any other source — it doesn't currently, but the original Considering entry should be flipped).
- Flip the original "Auto-merge-bypasses-final-respondent design" Considering entry to Queued/Shipped `[x]` — the v1 spec doesn't have a roadmap entry because v1's post-merge Commit 2 didn't land before v1 was superseded. v2 lands ONE entry that supersedes v1's intended entry.

Verbatim edit content in Post-merge implementation > Commit 3.

## Known unknowns

- **Empirical sample size of two (PRs #18 and #19).** The cost-bearing case (strong-with-residuals + no followup) appeared on PR #18 (Opus's residuals went undisposed); the race appeared on PR #19. v2's tripwire and gate fix together close both gaps for future PRs.
- **Gate 3b coupling to multi-model dispatch.** Documented in Architecture > Auto-merge workflow gate fix. Future multi-model evaluation iteration must revert if it drops Sonnet from the red-team dispatch.
- **Option (3) is preferred for the future final-wrap iteration.** Documented in Why not the bigger version.

## Tripwires for known-quality concerns

- **Strong-with-residuals tripwire.** If a spec/ADR PR's final re-review verdict is "strong" but the body surfaces ≥3 net-new items AND the controller chooses no followup, that's a single-PR signal that the asymmetry is producing meaningful undisposed-residuals. **Fires at N=2 consecutive PRs** matching this pattern. Response: a future iteration designs option (3).
- **Gate 3b false-positive tripwire (NEW for v2).** If v2's Gate 3b causes legitimate merges to be blocked (e.g., a PR where only one red-team model was dispatched intentionally) or fails to block illegitimate ones, flag the gate's coupling to multi-model dispatch as having semantic-mismatch with the actual dispatch shape. Response: revisit the gate's threshold logic (consider F1 or F4 from "Why not the bigger version").

Tripwires are manual review items, not automated checks. They live in this spec and migrate to a future iteration's brainstorm input if any fires.

## Future iterations

1. **Final-wrap respondent post design — option (3) preferred.** Trigger: strong-with-residuals at N=2, OR authorization-trail audit need, OR process change. Per "Trigger to revisit" above. Implements option (3) (the `ready+label` two-step as a respondent dispatch trigger).
2. **Gate 3b refinement.** Trigger: Gate 3b false-positive tripwire OR multi-model evaluation iteration (queued #5) lands and changes the dispatch shape. Either revisit the threshold or replace F2 with F1/F4.

## Origin

v1 of this iteration was opened, reviewed by 2 of 3 expected reviewers, and merged at 07:28:54Z on 2026-05-17 BEFORE red-team Opus's review at 07:32:04Z. The auto-merge mid-round race fired on v1's own PR. Red-team Opus's post-merge review surfaced premise corrections that landed on the orphaned `spec/auto-merge-bypasses-final-respondent` branch as a followup commit but never made it to master (the PR was already merged).

v2 supersedes v1 by integrating Opus's substantive corrections AND closing the race that prevented v1 from being properly reviewed in the first place. Per CLAUDE.md "Specs as historical record," v2 ships as a successor spec; v1 stays as the historical record of the initial decision (with a one-line forward-breadcrumb added by v2's Commit 3 pointing to this file).

Operational lesson for future spec-PRs: the v1 controller violated the discipline v1 was codifying (don't label until all reviews posted). v2 closes this by moving the discipline into the workflow gate itself. Manual discipline failed empirically; the gate enforces.

## Post-merge implementation

Per the post-merge implementation convention, **three direct-master commits**. All content fully specified verbatim below.

- **Commit 1:** Update `.github/workflows/auto-merge.yml` Gate 3b to require `REDTEAM_COUNT >= 2`.
- **Commit 2:** Add the v2 CLAUDE.md paragraph (supersedes v1's Commit 1 which never landed).
- **Commit 3:** Documentation propagation — roadmap.md flip (single Queued/Shipped entry for v2; original Considering entry deleted); v1 forward-breadcrumb appended to v1 spec; CLAUDE.md auto-merge gate reference if any.

### Verbatim — Commit 1 (`.github/workflows/auto-merge.yml` Gate 3b)

Locate the Gate 3b block in `.github/workflows/auto-merge.yml` (around lines 95–102, the block beginning with `# spec/* and adr/* PRs: spec-PR gate (Gate 3b)`).

**Before:**

```bash
REDTEAM_COUNT=$(echo "$PR_JSON" | jq -r '[.reviews[] | select(.author.login == "gcscode-red-team")] | length')
SPECQUALITY_COUNT=$(echo "$PR_JSON" | jq -r '[.reviews[] | select(.author.login == "gcscode-spec-quality")] | length')
if [[ "$REDTEAM_COUNT" == "0" || "$SPECQUALITY_COUNT" == "0" ]]; then
  echo "Gate 3b FAILED: red-team count=${REDTEAM_COUNT}, spec-quality count=${SPECQUALITY_COUNT} (both required > 0). Exiting cleanly."
  exit 0
fi
echo "Gate 3b OK: red-team count=${REDTEAM_COUNT}, spec-quality count=${SPECQUALITY_COUNT}"
```

**After:**

```bash
REDTEAM_COUNT=$(echo "$PR_JSON" | jq -r '[.reviews[] | select(.author.login == "gcscode-red-team")] | length')
SPECQUALITY_COUNT=$(echo "$PR_JSON" | jq -r '[.reviews[] | select(.author.login == "gcscode-spec-quality")] | length')
# v2: red-team is multi-model (Opus + Sonnet) per multi-model-red-team-v1; both must have posted.
# spec-quality is single-model; >=1 suffices. Revisit when multi-model evaluation lands.
if [[ "$REDTEAM_COUNT" -lt 2 || "$SPECQUALITY_COUNT" -lt 1 ]]; then
  echo "Gate 3b FAILED: red-team count=${REDTEAM_COUNT} (need >=2 for multi-model dispatch), spec-quality count=${SPECQUALITY_COUNT} (need >=1). Exiting cleanly."
  exit 0
fi
echo "Gate 3b OK: red-team count=${REDTEAM_COUNT}, spec-quality count=${SPECQUALITY_COUNT}"
```

Also update the workflow's leading comment block (around line 9) — the spec/* or adr/* gate description:

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

### Verbatim — Commit 2 (CLAUDE.md edit)

Locate the "Respondent posting discipline" subsection in `shell/CLAUDE.md` (around line 214). Locate the "Initial-review round" paragraph that begins `**Initial-review round:**` (around line 252). Locate the next paragraph that begins `**Discipline note:**` (around line 254). Insert the following NEW paragraph between them:

> **Final-round asymmetry (intentional, paired with the initial-round asymmetry above).** The respondent dispatches **only after a `Code-review-followup:` commit**. The initial-round skip (above) and this final-round skip are **bookends of one rule**: the respondent fires only when the controller has produced a followup commit containing dispositions to document. The opening side has nothing to dispose; the closing side has the controller's implicit "no further followup" judgment. When final re-reviews are "strong with residuals" (clean verdict but containing net-new items), the controller-voice acknowledgment of those residuals stays implicit. Under auto-merge, the controller's merge-authorization step is the `ready-for-review` + `labeled auto-merge` two-step, not the workflow's `gh pr merge` call. v2 keeps this gap but closes the auto-merge mid-round race that exposed it: Gate 3b now requires `gcscode-red-team` count >= 2 (both Opus and Sonnet posted under multi-model dispatch) AND `gcscode-spec-quality` count >= 1 before merge. Option (3) — making the `ready+label` two-step a respondent dispatch trigger — is the leading future-iteration design. Triggers to revisit: (a) strong-with-residuals pattern at **N=2 consecutive spec/ADR PRs** (final re-review verdict "strong" with ≥3 net-new items and no followup) — observable from PR timelines; (b) authorization-trail audit need; (c) process change requiring explicit per-finding acknowledgment before merge. Spec: [`docs/specs/2026-05-17-auto-merge-bypasses-final-respondent-v2.md`](docs/specs/2026-05-17-auto-merge-bypasses-final-respondent-v2.md) (supersedes [v1](docs/specs/2026-05-17-auto-merge-bypasses-final-respondent.md)).

### Verbatim — Commit 3 (docs propagation + v1 forward-breadcrumb)

**3a — roadmap.md flip.**

Pre-edit verification: `grep -n "Auto-merge-bypasses-final-respondent" shell/docs/roadmap.md`.

**Before (in the Considering section):**

```md
- [ ] **Auto-merge-bypasses-final-respondent design** — small design call. The respondent posts after each Code-review-followup commit, but the FINAL round (clean reviews → user merges) has no followup commit and therefore no respondent post. Either accept this asymmetry, or design a "final wrap" respondent post for the merge-ready state. Trigger: after respondent v1 ships and the asymmetry is operational (per `review-discussion-loop-v1` carry-forward).
```

DELETE the above from Considering. ADD the following to the Queued section of the agentic-team architecture track, immediately after the existing "Per-role bot identities for reviewers" `[x]`-marked entry:

```md
- [x] **Auto-merge-bypasses-final-respondent design (v2)** — accepted-asymmetry decision + auto-merge workflow gate fix (Gate 3b now requires `gcscode-red-team` count >= 2 + `gcscode-spec-quality` count >= 1, enforcing the multi-model dispatch shape). v2 supersedes v1 ([`specs/2026-05-17-auto-merge-bypasses-final-respondent.md`](specs/2026-05-17-auto-merge-bypasses-final-respondent.md)) which merged with only 2 of 3 reviewers posted (the workflow mid-round race fired on the spec that documented it). v2 closes the race; v1's accept-asymmetry decision survives the corrected reasoning. Option (3) — making the `ready+label` two-step a respondent dispatch trigger — is named as the leading future-iteration design. Spec: [`specs/2026-05-17-auto-merge-bypasses-final-respondent-v2.md`](specs/2026-05-17-auto-merge-bypasses-final-respondent-v2.md).
```

**3b — v1 forward-breadcrumb.**

Append the following one-line blockquote to the end of `shell/docs/specs/2026-05-17-auto-merge-bypasses-final-respondent.md`:

```md
> **v2 supersession breadcrumb (added 2026-05-17):** This spec was superseded by [`2026-05-17-auto-merge-bypasses-final-respondent-v2.md`](2026-05-17-auto-merge-bypasses-final-respondent-v2.md) on the same day. v2 rebuilds the case for accept-asymmetry from honest premises (per red-team Opus's post-merge review of v1's PR #19) AND adds an auto-merge workflow Gate 3b fix to prevent the mid-round race that merged v1 with only 2 of 3 reviewers posted. v1's accept-asymmetry decision survives v2 unchanged; only the supporting reasoning + the workflow gate change.
```

Per CLAUDE.md "Specs as historical record," this breadcrumb is a one-line cross-reference (the convention's explicit pattern), not a deep substantive edit to v1's content.
