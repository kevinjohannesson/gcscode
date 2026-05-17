# Tripwire condition (iii) compliance

**Slug:** tripwire-condition-iii-compliance
**Iteration on the agentic-team track:** sixteenth. Seventh and final of the seven queued items from [`docs/specs/2026-05-16-agentic-team-debt-clearing-v1.md`](2026-05-16-agentic-team-debt-clearing-v1.md), following queued #1 (ADR-0009), #2 (respondent-subagent-v2), #3 (per-role-bot-identities), #4 (reviewer routing layer — still blocked), #5 (multi-model v1 evaluation — still blocked), #6 (auto-merge-bypasses-final-respondent v2). Items #4 and #5 remain blocked on external triggers; this iteration closes the unblocked tail of the debt-clearing queue. **Interleaved iteration note:** an ad-hoc fifteenth iteration ([`docs/specs/2026-05-17-relative-paths-in-reviewer-output.md`](2026-05-17-relative-paths-in-reviewer-output.md)) shipped between #6 and this #7 — it surfaced as an operational-discipline cleanup mid-queue and explicitly queued the convention-revision question that THIS iteration resolves.
**Type:** convention-alignment iteration. Revises CLAUDE.md "Reviewer-role design conventions > Tripwires" condition (iii) wording + adds one inline supersession breadcrumb to a prior spec's tripwire that the convention rendered obsolete. No code, no agent files, no workflow changes.
**No bootstrap exceptions.** Spec ships via spec-PR workflow; implementation lands per the post-merge implementation convention.

## Context

CLAUDE.md "Reviewer-role design conventions > Tripwires for known-quality concerns" currently says (line 269):

> Tripwire-worthy concerns are those (i) tied to a specific failure mode of the role (not generic critique-quality worries), (ii) observable in the review's structured output rather than requiring artifact-level human judgment, and (iii) detectable as a pattern across N PRs rather than per-PR.

The "across N PRs rather than per-PR" framing in condition (iii) was written to guard against noise-prone vibes-check tripwires that fire on subjective per-session signals. In practice, two specs have demonstrated that the convention as-written is too strict:

1. **[`docs/specs/2026-05-16-review-discussion-loop-v1.md`](2026-05-16-review-discussion-loop-v1.md) "Cross-session reconstruction tripwire"** (line 427): "If during the first 2 multi-round spec/ADR PRs after this iteration ships, the controller (in a new session) spends >10 minutes reconstructing prior-session disposition intent before writing a response — pull the respondent subagent iteration forward." The detection mechanism is the controller's per-session experience (introspection on session log time). This is a per-session signal, not "across N PRs" in the convention's intended sense. It violates (iii) on the wording's strict reading.

2. **[`docs/specs/2026-05-17-relative-paths-in-reviewer-output.md`](2026-05-17-relative-paths-in-reviewer-output.md) "Leak-recurrence tripwire"** fires at N=1 PR for any absolute-path leak (not in code-block-flagged-as-leak per the carve-out). The spec explicitly acknowledged the divergence and queued the convention-revision question for this iteration. The rule is binary and grep-able from review bodies — there is no noise floor, so the convention's "across N PRs" guard is not load-bearing for this class of tripwire.

The two specs surface two different judgments about the convention:
- v1 of the review-discussion-loop's tripwire #1 is a **per-session signal** that doesn't fit "across N PRs" cleanly — but the underlying concern was structurally resolved by [`docs/specs/2026-05-16-respondent-subagent-v2.md`](2026-05-16-respondent-subagent-v2.md), making the tripwire itself obsolete regardless of (iii) compliance.
- The relative-paths tripwire is a **binary grep-able rule** where N=1 is the correct threshold — single observation, no noise. The convention as-written would force N=2 for a rule whose first observation is the entire failure mode.

The right resolution: **revise (iii) to distinguish noise-prone tripwires (which need N≥2 patterns) from binary grep-able tripwires (where N=1 is correct)**. The noise-floor guard stays — but binary rules get an explicit carve-out.

The two existing v1-of-review-discussion-loop tripwires that DO satisfy (iii) ("optional-engagement-never-fires" at N=5, "routing-evaporates" at N=3) are unaffected by this iteration.

## Why not the bigger version

The bigger version would include:

- **Audit ALL tripwires across all prior specs for (iii) compliance.** **Smaller wedge:** address the two known-non-compliant tripwires (one obsolete, one deliberate divergence). **Bigger wedge:** sweep every spec's "Tripwires" section across the agentic-team-architecture iteration history. YAGNI: the two known non-compliant tripwires are the only ones surfaced by review or known to be problematic. A sweeping audit can be triggered if a future review flags additional tripwires.
- **Revise all three conditions (i), (ii), (iii) for consistency.** **Smaller wedge:** revise (iii) only — the other two are well-formed. **Bigger wedge:** broader convention overhaul. YAGNI: condition (i) and (ii) work fine; only (iii) has surfaced friction.
- **Add a fourth condition for binary vs. noise-prone tripwires explicitly.** **Smaller wedge:** carve-out inside (iii). **Bigger wedge:** new top-level condition adds noise to the convention's structure. YAGNI: a single-sentence carve-out inside (iii) reads as a natural refinement; promoting to condition (iv) over-elevates the distinction.
- **Automate tripwire detection.** **Smaller wedge:** manual review, per existing convention. **Bigger wedge:** instrumentation infrastructure. Out of scope for this iteration.

This iteration ships: one CLAUDE.md sentence revision in condition (iii) + one inline supersession breadcrumb in `review-discussion-loop-v1` tripwire #1. Two minimal edits.

## Goals

1. Revise CLAUDE.md "Reviewer-role design conventions > Tripwires" condition (iii) to distinguish noise-prone tripwires (require N≥2 patterns) from binary grep-able tripwires (N=1 acceptable). The noise-floor guard stays.
2. Add an inline supersession breadcrumb to `docs/specs/2026-05-16-review-discussion-loop-v1.md`'s "Cross-session reconstruction tripwire" noting that the concern was structurally resolved by `2026-05-16-respondent-subagent-v2.md` and the tripwire is no longer applicable.
3. Resolve the queued convention-revision question from `docs/specs/2026-05-17-relative-paths-in-reviewer-output.md` ("Divergence from CLAUDE.md ... condition (iii)") — after this iteration ships, the relative-paths spec's leak-recurrence tripwire is no longer a divergence; it's the canonical example of the binary-rule carve-out.

## Non-goals (this iteration)

- **Audit beyond the two known non-compliant tripwires.** A sweeping audit of all prior specs' tripwires is out of scope. Trigger to revisit: a future review flags additional tripwires as non-compliant or ambiguous.
- **Revise conditions (i) and (ii).** Both work as-written. No surfaced friction.
- **Promote the binary-rule carve-out to a top-level condition (iv).** Stays inline within (iii) for now. Trigger to revisit: enough binary-rule tripwires accumulate that the carve-out is the dominant case in practice.
- **Automated tripwire detection / instrumentation.** Convention-only enforcement, consistent with all prior tripwire-related work.
- **Substantively edit the relative-paths spec's "Divergence" subsection.** Per CLAUDE.md "Specs as historical record," substantive edits to merged specs are out of scope. The spec's "divergence" framing was true at the time of writing; this iteration resolves the queued question by revising the convention. **A one-line mechanical forward-breadcrumb IS added by Commit 3** (per the convention's explicit allowance for one-line cross-references), parallel to Commit 2's breadcrumb on `review-discussion-loop-v1`. The breadcrumb does NOT edit the predecessor's substantive content; it just makes the resolution discoverable from the predecessor's location.

## Architecture

### The convention revision

Current condition (iii) wording (CLAUDE.md line 269):

> (iii) detectable as a pattern across N PRs rather than per-PR.

Revised wording adds one sentence after the existing text, clarifying the distinction:

> (iii) detectable as a pattern across N PRs rather than per-PR — with an explicit carve-out for **binary grep-able rules** where the failure is a single observable event (e.g., "any review body contains an absolute filesystem path"). For binary rules, N=1 is the correct threshold because the rule has no noise floor — a single observation IS the failure. The "across N PRs" guard applies to noise-prone signals (subjective judgments, vibes-checks, per-session experiences) where one observation could be coincidence. Canonical example of the binary-rule carve-out: the leak-recurrence tripwire in [`docs/specs/2026-05-17-relative-paths-in-reviewer-output.md`](2026-05-17-relative-paths-in-reviewer-output.md).

**Definition of "binary grep-able rule" (tightened per red-team Opus's review of this PR).** A tripwire qualifies for the N=1 carve-out only when it satisfies **all three** of these properties:

1. **Decidable in constant time on the review body's text** — a deterministic check (string contains, regex match, structural match) over the review's raw markdown, not a judgment about the review's argument or quality.
2. **No false-positive surface from legitimate use** — the rule's "failure" matches the rule's intent without ambiguity. The criterion is checked **before** the binary classification applies: a tripwire designer asks "does this rule, AS-WRITTEN, produce false positives on legitimate inputs?" If yes, the rule needs either (a) tightening or (b) an explicit carve-out for the legitimate cases. The leak-recurrence tripwire's "code-block-flagged-as-leak" carve-out is what brings the rule under this property — the unrefined "any absolute path in body" rule would NOT satisfy property (b), but the refined rule (with carve-out) does. The framing is "check property (b) on the final rule shape, not on the rule's bare-grep form."
3. **The failure-signature is the rule's whole semantics** — there's no implicit "but maybe it was OK in context" interpretation. The rule is what it says.

A tripwire that doesn't satisfy all three properties stays under the default "across N PRs" guard.

### The supersession breadcrumb

`docs/specs/2026-05-16-review-discussion-loop-v1.md`'s "Cross-session reconstruction tripwire" targeted the **controller's** reconstruction cost — the time a new-session controller spent reading prior-session PR state before writing a response. Respondent-subagent-v2 (per [`docs/specs/2026-05-16-respondent-subagent-v2.md`](2026-05-16-respondent-subagent-v2.md)) moved response composition into a dedicated subagent that receives structured-input pre-fetch. **This materially reduces the controller's reconstruction cost but does not eliminate it entirely** — the controller still pre-fetches the reviewer review + followup diff + spec content before dispatching the respondent subagent, and that pre-fetch retains some cross-session lookup cost. The tripwire's "10 minutes" threshold is no longer the principal cost-bearing case; the tripwire is effectively obsolete-in-practice even if not strictly mooted. Inline breadcrumb on the tripwire entry (per the CLAUDE.md "Specs as historical record" pattern of one-line cross-references) reflects this honestly.

### What about the relative-paths spec?

Per red-team Sonnet's review of this PR (asymmetric-breadcrumb finding), the relative-paths spec gets a one-line forward-breadcrumb parallel to the one Commit 2 adds to `review-discussion-loop-v1`. The breadcrumb pattern is mechanical (a cross-reference pointer, per CLAUDE.md "Specs as historical record" allowance for one-line breadcrumbs), not a substantive edit. The relative-paths spec's "Divergence from condition (iii)" subsection stays as historical record of the divergence-at-the-time; the breadcrumb just makes the resolution visible to readers who land on that spec without traversing the convention history forward. See Post-merge implementation > Commit 3 verbatim.

## Validation

- **Validation by review on this PR.** Reviewers reviewing this convention revision should confirm the carve-out reads as a natural refinement rather than a loophole. If any reviewer flags the wording as ambiguous, that signal IS the spec's validation failure.
- **Validation by use on future binary-rule tripwires.** Any future spec writing a binary-rule tripwire (e.g., new leak-class tripwires in the leak-class-generalization future iteration) should cite the carve-out directly rather than "deliberately diverging." If post-merge specs continue to frame as "divergence" instead of "carve-out," the convention text isn't doing its job.
- **No empirical test against current tripwires.** This iteration's job is convention text, not tripwire firing. Existing tripwires are unchanged in semantics; only the convention's framing of N=1-for-binary is.

## VS Code alignment

No VS Code alignment implications. The discipline is gcscode-specific agentic-team convention.

Propagation to `shell/docs/vs-code-alignment.md`: none.

## `docs/out-of-scope.md` propagation

**No edit.** This iteration is per-iteration scope (convention wording refinement). Future iterations (broader convention overhaul, sweeping audit, tripwire automation) have their own triggers documented above and don't rise to cross-cutting architectural deferrals.

## `docs/roadmap.md` propagation

This iteration's queued #7 entry exists in the "Considering" section. Post-merge implementation will flip it to Queued/Shipped `[x]`.

Verbatim edit content in Post-merge implementation > Commit 3.

## Known unknowns

- **The carve-out's enforceability is convention-only.** A future spec could in principle write a "binary rule" tripwire that's actually noise-prone (e.g., a regex that matches false positives). The convention permits the form; reviewers must call out misuse case-by-case. This is the same epistemological boundary as the original convention.
- **The three-property definition may not be tight enough at the edges.** v1 ships "decidable in constant time on the review body's text" as property (a) of the binary-rule definition (added in this iteration's followup). Future iterations may need even-more-rigorous criteria for borderline cases (e.g., regex-based tripwires with implicit context interpretation). Trigger to revisit: a tripwire whose binary-rule status is ambiguous and the controller can't tell which threshold to use despite the three-property check.
- **Sweeping audit deferred.** Other specs may have tripwires that don't satisfy (iii). This iteration addresses the known two; a future audit is the trigger for the rest.

## Tripwires for known-quality concerns

This iteration's accepted state has no behavior to instrument. The convention text either reads as a natural refinement or it doesn't; that's validated by the spec-PR's review, not by future PR data.

(Self-referentially, if the convention's carve-out reads ambiguously, the failure mode IS this spec's review verdict — captured as the spec's own validation, above.)

## Future iterations

1. **Sweeping tripwire audit.** Trigger: a future review flags additional tripwires across prior specs as non-compliant or ambiguous. Out of scope for this iteration; v1 of the convention revision is targeted at the two known cases.
2. **Promote the binary-rule carve-out to top-level condition (iv).** Trigger: binary-rule tripwires become the dominant case in practice, making the carve-out's inline-within-(iii) framing read as backwards (the special case becoming the general case).
3. **Tighten the "binary grep-able rule" criterion.** Trigger: an ambiguous case where the controller can't tell which threshold to use for a new tripwire.

## Origin

Queued #7 in [`docs/specs/2026-05-16-agentic-team-debt-clearing-v1.md`](2026-05-16-agentic-team-debt-clearing-v1.md): "Tripwire condition (iii) compliance — small alignment between `review-discussion-loop-v1`'s tripwires and the design convention in CLAUDE.md 'Reviewer-role design conventions > Tripwires' (condition iii). Some of v1's tripwires are per-session detection. Either revise the tripwires or revise the convention."

The "revise the tripwires or revise the convention" disjunction is resolved in this spec by doing **both**: revise the convention (to permit binary-rule N=1 tripwires) AND mark the one obsolete tripwire as superseded. The reason for the dual approach: tripwire #1 in v1 is genuinely obsolete (structurally resolved by respondent-v2); tripwires #2 and #3 are compliant; the relative-paths spec's N=1 tripwire is a legitimate use of binary-rule semantics that the convention as-written rejects too aggressively.

Designed 2026-05-17, immediately after [`docs/specs/2026-05-17-relative-paths-in-reviewer-output.md`](2026-05-17-relative-paths-in-reviewer-output.md) (an ad-hoc iteration that itself queued the convention-revision question explicitly). This iteration closes the queued tail of the debt-clearing v1 commitment (items #4 and #5 remain blocked on external triggers — 4th reviewer role added / N=5 multi-model spec/ADR PR observations).

## Post-merge implementation

Per the post-merge implementation convention, **four direct-master commits**. All content fully specified verbatim below.

- **Commit 1:** Revise CLAUDE.md "Reviewer-role design conventions > Tripwires" condition (iii) wording + add the "binary grep-able rule" tightened definition (three properties).
- **Commit 2:** Append an inline obsolete-in-practice breadcrumb to `docs/specs/2026-05-16-review-discussion-loop-v1.md`'s "Cross-session reconstruction tripwire" bullet.
- **Commit 3:** Append a parallel forward-breadcrumb to `docs/specs/2026-05-17-relative-paths-in-reviewer-output.md`'s "Divergence from condition (iii)" subsection (parity with Commit 2 per red-team Sonnet's review).
- **Commit 4:** roadmap.md flip (Considering → Queued/Shipped `[x]`).

### Verbatim — Commit 1 (CLAUDE.md condition (iii) revision)

Locate the "Tripwires for known-quality concerns" paragraph in `shell/CLAUDE.md` (around line 269). Find the sentence:

**Before:**

> Tripwire-worthy concerns are those (i) tied to a specific failure mode of the role (not generic critique-quality worries), (ii) observable in the review's structured output rather than requiring artifact-level human judgment, and (iii) detectable as a pattern across N PRs rather than per-PR.

**After:**

> Tripwire-worthy concerns are those (i) tied to a specific failure mode of the role (not generic critique-quality worries), (ii) observable in the review's structured output rather than requiring artifact-level human judgment, and (iii) detectable as a pattern across N PRs rather than per-PR — with an explicit carve-out for **binary grep-able rules** where the failure is a single observable event (e.g., "any review body contains an absolute filesystem path"). For binary rules, N=1 is the correct threshold because the rule has no noise floor — a single observation IS the failure. The "across N PRs" guard applies to noise-prone signals (subjective judgments, vibes-checks, per-session experiences) where one observation could be coincidence. **A tripwire qualifies for the N=1 carve-out only when its final rule shape (after any carve-outs the designer adds) satisfies all three of:** (a) decidable in constant time on the review body's text (deterministic check, not a judgment about the review's argument), (b) no false-positive surface from legitimate use — checked on the final rule shape, NOT on a bare-grep approximation; if the unrefined rule has false positives, the rule needs tightening or an explicit carve-out before it qualifies, (c) the failure-signature is the rule's whole semantics (no "but maybe it was OK in context" interpretation). Tripwires that don't satisfy all three stay under the default "across N PRs" guard. Canonical example of the binary-rule carve-out: the leak-recurrence tripwire in [`docs/specs/2026-05-17-relative-paths-in-reviewer-output.md`](docs/specs/2026-05-17-relative-paths-in-reviewer-output.md).

### Verbatim — Commit 2 (review-discussion-loop-v1 inline breadcrumb)

Locate the "Cross-session reconstruction tripwire" bullet in `shell/docs/specs/2026-05-16-review-discussion-loop-v1.md` (around line 427). Append the following blockquote on a new line **immediately after** the bullet's closing period (before the next bullet begins):

```md

  > **Effectively obsolete 2026-05-17 per [`2026-05-16-respondent-subagent-v2.md`](2026-05-16-respondent-subagent-v2.md) + [`2026-05-17-tripwire-condition-iii-compliance.md`](2026-05-17-tripwire-condition-iii-compliance.md):** respondent dispatch became subagent-driven with structured-input pre-fetch. The controller's reconstruction cost is materially reduced but not eliminated (the controller still pre-fetches reviewer review + diff + spec before dispatch). The tripwire's 10-minute threshold is no longer the principal cost-bearing case; the tripwire is left in place as historical record of the original concern rather than removed.
```

(Note: the breadcrumb is indented to align with the bullet's continuation per markdown nested-list convention.)

### Verbatim — Commit 3 (relative-paths spec forward-breadcrumb — parity with Commit 2)

Per red-team Sonnet's review of this PR (asymmetric-breadcrumb finding): the review-discussion-loop-v1 spec gets an inline breadcrumb noting its tripwire is now obsolete-in-practice; the relative-paths spec's "Divergence from condition (iii)" subsection should get a parallel one noting the queued question is now resolved.

Locate the "Divergence from CLAUDE.md ... condition (iii)" subsection within the "Leak-recurrence tripwire" section of `shell/docs/specs/2026-05-17-relative-paths-in-reviewer-output.md` (within the Tripwires section). Append the following blockquote on a new line at the END of the Divergence-from-condition-(iii) paragraph (after its closing period):

```md

  > **Resolved 2026-05-17 by [`2026-05-17-tripwire-condition-iii-compliance.md`](2026-05-17-tripwire-condition-iii-compliance.md):** condition (iii) was revised to permit binary grep-able tripwires at N=1. The leak-recurrence tripwire is no longer a divergence; it is the canonical example of the binary-rule carve-out cited in the convention.
```

(Note: the breadcrumb is indented to align with the section's continuation per markdown convention.)

### Verbatim — Commit 4 (roadmap.md flip)

**Pre-edit verification:** `grep -n "Tripwire condition (iii)" shell/docs/roadmap.md` to locate the existing Considering entry.

**Before (in the Considering section):**

```md
- [ ] **Tripwire condition (iii) compliance** — small alignment between `review-discussion-loop-v1`'s tripwires and the design convention in CLAUDE.md "Reviewer-role design conventions > Tripwires" (condition iii: detectable as a pattern across N PRs rather than per-PR). Some of v1's tripwires are per-session detection. Either revise the tripwires or revise the convention. Trigger: ready to address as a quick micro-iteration; no external prerequisite.
```

DELETE the above from Considering. ADD the following to the Queued section of the agentic-team architecture track, immediately after the existing "Relative paths in reviewer + respondent output" `[x]`-marked entry:

```md
- [x] **Tripwire condition (iii) compliance** — convention-alignment iteration. Revised CLAUDE.md "Reviewer-role design conventions > Tripwires" condition (iii) to add an explicit carve-out for binary grep-able rules (N=1 acceptable when the rule has no noise floor). The noise-floor guard against per-session vibes-check tripwires stays for noise-prone signals. Added an inline supersession breadcrumb to `review-discussion-loop-v1`'s "Cross-session reconstruction tripwire" (mooted by `respondent-subagent-v2`). Resolves the queued convention-revision question from `relative-paths-in-reviewer-output.md`. Closes the unblocked tail of the agentic-team-debt-clearing v1 queue (items #4 and #5 remain blocked on external triggers). Spec: [`specs/2026-05-17-tripwire-condition-iii-compliance.md`](specs/2026-05-17-tripwire-condition-iii-compliance.md).
```
