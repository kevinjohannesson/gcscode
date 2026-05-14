# Reviewer-role design conventions — articulation pass

**Slug:** reviewer-role-design-conventions
**Iteration on the agentic-team track:** third, after [`docs/specs/2026-05-12-reviews-as-artifacts.md`](2026-05-12-reviews-as-artifacts.md) and [`docs/specs/2026-05-14-red-team-reviewer.md`](2026-05-14-red-team-reviewer.md).
**Type:** housekeeping articulation; docs-only.
**This spec ships via the new spec-PR workflow** introduced by the red-team-reviewer iteration. First genuine spec-PR after that workflow shipped.

## Context

Two articulation gaps surfaced during the 2026-05-14 housekeeping pass and are not currently captured in repo docs:

1. **Reviewer-role design patterns.** Four patterns emerged from the red-team v1 user-review pass and the reviews-as-artifacts mechanics validation (PR #1 + PR #3 on 2026-05-14). They live in agent memory only; future agents designing devil's advocate v2 or the broader expert-reviewer track don't carry that memory and would re-discover the same patterns the hard way.
2. **Red-team auto-dispatch obligation.** The new spec-PR / ADR-PR workflow specifies that red-team "auto-dispatches on PR open." That sentence is in CLAUDE.md's "Subagent reviewer PR-posting discipline" subsection — it tells the reader the *rule*, but it doesn't make the *controller's action point* legible (when exactly does the controller need to fire the dispatch?). v1 of the workflow has no automated enforcement; the controller (human or LLM, in a fresh-context session) must remember.

Both gaps are silent-failure modes that compound as the agentic-team track grows: more reviewer roles, more spec/ADR PRs, more situations where pattern-misalignment or skipped auto-dispatch could slip through.

This iteration adds one new subsection to CLAUDE.md that closes both gaps. The content is brief; the value is making it readable in CLAUDE.md without dipping into agent memory.

## Goals

1. Articulate the four reviewer-role design patterns (audit trail, mechanical/judgment validation split, identity field, tripwires) as **conventions** for designing future reviewer roles.
2. Make red-team's auto-dispatch obligation legible to controllers as an **action checklist**, not just a buried convention sentence.
3. Position the new subsection so that future reviewer-role iterations (devil's advocate v2, expert reviewers) naturally consult it during their brainstorms.

## Non-goals

- **Automated enforcement of auto-dispatch.** No pre-PR-open script or git hook. The checklist is convention; enforcement is a future iteration. Trigger: first observed silent skip.
- **Restructuring of CLAUDE.md's reviewer sections.** This is an additive subsection, not a refactor. Existing "Subagent reviewer PR-posting discipline" + "Reviewer-role registry" stay as-is.
- **Articulating other agentic-team memory items beyond the four design patterns.** Memory entries like [[project-shell-nesting-legacy]] or [[project-agent-artifact-location]] stay in memory; they don't generalize to "conventions to follow when designing reviewer roles."

## Architecture

One new subsection in `shell/CLAUDE.md`. Location: under "Planning conventions and long-term alignment", placed **immediately after** the existing "Subagent reviewer PR-posting discipline" subsection. The new subsection builds on PR-posting discipline by saying "here's how to design new reviewer roles that fit this discipline."

Subsection title: **"Reviewer-role design conventions"**.

The subsection has two parts:

1. **Four design patterns** for new reviewer roles (one paragraph each).
2. **Auto-dispatch controller obligations** — a short checklist of the actions the controller must take at specific decision points for the spec/ADR-PR workflow to function.

Cross-references back to the registry table (source of truth for role metadata) and to the prompt template convention (`.claude/reviewer-prompts/<role>.md`).

## The new subsection (exact text to add)

````md
### Reviewer-role design conventions

When designing a new reviewer role (devil's advocate v2, expert reviewers, future expansions of the reviewer-role registry), apply these conventions. They emerged from the red-team v1 user-review pass and the reviews-as-artifacts mechanics validation (PR #1 + PR #3 on 2026-05-14).

**Audit trail of priors inspected.** Any review section that compares the artifact against existing artifacts (CLAUDE.md, prior specs, ADRs, roadmap, out-of-scope) must require an explicit `Checked against:` enumeration with **specific anchors** — file + section heading, ADR slug, spec filename. Bare `CLAUDE.md` doesn't satisfy. Required even when no drift is flagged: without the audit trail, "nothing flagged" is indistinguishable from "didn't read the priors" — exactly the failure mode this discipline surfaces. The red-team prompt template (`.claude/reviewer-prompts/red-team.md`) is the canonical implementation.

**Mechanical / judgment split in live validation.** Live-validation pass criteria for a new reviewer role must require BOTH (a) mechanical compliance — header form, sections present, identity, verdict, audit-trail line populated — algorithmically verifiable, AND (b) user judgment that the critique reflects engagement with the artifact, not engagement-theater. A reviewer that posts the mechanically-compliant structure but says "Nothing flagged" across every section fails (b) by default unless the artifact is genuinely so trivial that nothing of substance could be flagged. The user is the judge of (b); no algorithmic check substitutes.

**`identity` field in the registry, even when all roles share one bot.** Every entry in the reviewer-role registry carries an `identity` field. In v1 all roles share `gcscode-reviewer[bot]`, so the column is uniform — but it's there. Adding the field early is cheap; retrofitting when the future distinct-App-identities-per-reviewer-role iteration lands would mean editing every row.

**Tripwires for known-quality concerns.** Validation plans should include explicit detection mechanisms for fuzzy worries ("does this work on short artifacts?"). Example from the red-team spec's Plan 2: "if N consecutive ADR-PRs return all-silent red-team reviews, consider pulling ADR-PR from red-team's `targets` registry field." Tripwires are manual review items, not automated checks; they live in the spec's validation section.

#### Auto-dispatch controller obligations

The reviewer-role registry's `trigger` field declares WHEN a role fires (e.g., red-team's `trigger` is "Automatic on PR open"). In v1 there is no automated dispatcher; the controller (human or LLM session) honors the trigger. This checklist makes the controller's action points legible:

- **Before opening a `spec/<topic>` or `adr/<slug>` PR:** plan to dispatch the red-team subagent immediately after `gh pr create`. Do not consider the PR-open step complete until red-team has posted its review.
- **After every `Code-review-followup:` commit on a spec/ADR branch:** re-dispatch red-team. Re-review header includes `(re-review of <SHA>)` where `<SHA>` is the followup commit (existing convention).
- **No automated enforcement in v1.** Convention-based; the obligation is the controller's. Trigger to add enforcement: first observed silent skip on a real spec/ADR PR.

When new reviewer roles join the registry (devil's advocate v2, expert reviewers), append their auto-dispatch obligations here alongside red-team's, keyed off their `trigger` field.
````

## Data flow — how this iteration ships

1. **Spec lands via the new spec-PR workflow.** Branch `spec/reviewer-role-design-conventions` off master, this spec file commits, PR opens with the spec/ADR-PR template.
2. **Red-team auto-dispatches on PR open.** First live test of Plan 2 (organic critique quality) from the red-team-reviewer spec. Controller dispatches red-team subagent per the auto-dispatch obligation; subagent reads the prompt template, the PR diff, and the priors enumerated in `Checked against:`; posts `--comment` review.
3. **User reads red-team's review + approves the spec.** If red-team flags anything substantive, controller addresses via `Code-review-followup:` commit and re-dispatches red-team (still `--comment`).
4. **Merge via `gh pr merge --merge`.** User does the merge, not the controller. Merge-commit boundary preserved.
5. **CLAUDE.md edit lands as a separate change** after merge. Since the CLAUDE.md edit is mechanical (insert the subsection from above verbatim), it can land as a direct commit on master from the controller — no separate feat branch needed for a no-judgment doc insert. This matches the housekeeping convention for docs-only iterations.

## VS Code alignment

No VS Code alignment implications. Reviewer-role design conventions are gcscode-specific agentic-team mechanisms; VS Code has no analogous reviewer-bot architecture. Propagation to `shell/docs/vs-code-alignment.md`: none (ledger is per-concern, not per-iteration; this iteration introduces no concerns).

## `docs/out-of-scope.md` propagation

One cross-cutting deferral propagates:

- **Automated enforcement of reviewer auto-dispatch.** The new auto-dispatch obligations are convention-based; no pre-PR-open script or hook enforces them. Trigger to revisit: first observed silent skip of red-team auto-dispatch on a real spec/ADR PR.

Per-iteration-only deferrals (stay in spec): none.

## `docs/roadmap.md` propagation

No new entries. The existing roadmap already lists "Reviewer routing layer" and "Retroactive ADR for reviews-as-artifacts" under Agentic team architecture > Considering, both of which remain relevant.

## Validation

Two plans, both light. This is a small articulation iteration; full validation is the spec-PR workflow exercise itself.

### Plan 1: Spec-PR mechanics (this PR is itself the test)

PR mechanics validation comes for free with this iteration: opening this PR exercises the new `spec/<topic>` branch + spec/ADR-PR template + red-team auto-dispatch obligation in real conditions. Pass criteria:

- Spec lands on `spec/reviewer-role-design-conventions` branch (not master directly).
- PR opens with the new spec/ADR-PR template fields populated.
- Red-team auto-dispatches per the convention; review posts under `gcscode-reviewer[bot]` with the correct header.
- Re-review pattern works if any `Code-review-followup:` commit lands.
- `gh pr merge --merge` produces a merge-commit boundary on master.

These are the **first observation of the workflow in non-synthetic use**. If any pass criterion fails, the spec-PR workflow itself needs amendment — surface the failure in the merge commit message and a CLAUDE.md note rather than papering over.

### Plan 2: Critique quality (live red-team review on this PR)

Plan 2 of the red-team-reviewer spec specifies that the first genuine spec PR after that iteration ships exercises red-team's organic critique judgment. **This is that PR.** Pass criteria from the red-team spec apply:

- (a) Mechanical compliance — header form, sections present, `Checked against:` line populated with concrete anchors.
- (b) User judgment — the critique reflects engagement with the artifact, not engagement-theater.

If red-team produces sprawling or under-critical output, the prompt template (`.claude/reviewer-prompts/red-team.md`) gets refined in a followup commit per the red-team spec's failure-response section.

## Known unknowns

- **Will red-team actually read the priors when reviewing this spec?** The audit-trail mandate exists; whether Opus 4.7 follows through on inspecting CLAUDE.md / prior specs / ADRs is the live unknown that the red-team v1 spec identified.
- **Will the controller (this session, then future sessions) actually auto-dispatch?** This iteration's checklist articulates the obligation; whether session-fresh controllers honor it in future iterations is the obligation's own validation. First-skip would trigger the move to automated enforcement.

## Future iterations

Each gets its own brainstorm when triggered.

1. **Automated auto-dispatch enforcement.** Pre-PR-open script or git hook that fires red-team for `spec/*` and `adr/*` PRs without controller intervention. Trigger: first observed silent skip OR more than one reviewer role with auto-dispatch obligations.
2. **Devil's advocate v2** (already on roadmap; from red-team spec). Will be the first new reviewer role to consult these conventions.
3. **Expert / domain / security reviewer track** (already on roadmap; from red-team spec). Each new role appends an `auto-dispatch obligation` row to the controller checklist.

## Origin

Surfaced during the 2026-05-14 housekeeping pass after the red-team-reviewer iteration shipped. Item 3 (auto-dispatch articulation) and item 8 (design patterns articulation) were both findings in cut B; the user approved combining them into one CLAUDE.md addition. Brainstorm was brief (one clarifying question) because the design space was narrow and the patterns were already crystallized in agent memory.
