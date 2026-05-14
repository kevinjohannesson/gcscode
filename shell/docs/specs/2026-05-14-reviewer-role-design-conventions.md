# Reviewer-role design conventions — articulation pass

**Slug:** reviewer-role-design-conventions
**Iteration on the agentic-team track:** third, after [`docs/specs/2026-05-12-reviews-as-artifacts.md`](2026-05-12-reviews-as-artifacts.md) and [`docs/specs/2026-05-14-red-team-reviewer.md`](2026-05-14-red-team-reviewer.md).
**Type:** housekeeping articulation; docs-only.
**This spec ships via the new spec-PR workflow** introduced by the red-team-reviewer iteration. First genuine spec-PR after that workflow shipped.

## Context

Two articulation gaps surfaced during the 2026-05-14 housekeeping pass and are not currently captured in repo docs:

1. **Reviewer-role design patterns.** Four patterns emerged from the red-team v1 user-review pass and the reviews-as-artifacts mechanics validation (PR #1 + PR #3 on 2026-05-14). They live in agent memory only; future agents designing devil's advocate v2 or the broader expert-reviewer track don't carry that memory and would re-discover the same patterns the hard way.
2. **Red-team auto-dispatch obligation.** The new spec-PR / ADR-PR workflow specifies that red-team "auto-dispatches on PR open." That sentence is in CLAUDE.md's "Subagent reviewer PR-posting discipline" subsection — it tells the reader the *rule*, but it doesn't make the *controller's action point* legible (when exactly does the controller need to fire the dispatch?). v1 of the workflow has no automated enforcement; the controller (human or LLM, in a fresh-context session) must remember.

Both gaps are silent-failure modes we **expect to compound** as the agentic-team track grows. The expectation is a forward-looking bet, not established failure-mode reasoning — the track has only run for two iterations (reviews-as-artifacts, red-team-reviewer) and the patterns crystallized organically in agent memory exactly when needed. v1 ships ahead of compounding-failure evidence on the bet that **articulation cost < re-discovery cost**; first observed skip or first new-reviewer-role that re-derives a pattern from scratch will be the empirical check on the bet.

This iteration adds one new subsection to CLAUDE.md that closes both gaps. The content is brief; the value is making it readable in CLAUDE.md without dipping into agent memory.

## Goals

1. Articulate the four reviewer-role design patterns (audit trail, mechanical/judgment validation split, identity field, tripwires) as **conventions** for designing future reviewer roles.
2. Make red-team's auto-dispatch obligation legible to controllers as an **action checklist**, not just a buried convention sentence.
3. Position the new subsection so that future reviewer-role iterations (devil's advocate v2, expert reviewers) naturally consult it during their brainstorms.

## Non-goals

- **Automated enforcement of auto-dispatch.** No pre-PR-open script or git hook. The checklist is convention; enforcement is a future iteration. Trigger: first observed silent skip.
- **Restructuring of CLAUDE.md's reviewer sections.** This is an additive subsection, not a refactor. Existing "Subagent reviewer PR-posting discipline" + "Reviewer-role registry" stay as-is.
- **Articulating other agentic-team memory items beyond the four design patterns.** Repo-layout memories (e.g., "the project content lives one level deeper inside `shell/` than it should") and agent-behavior-artifact-location memories (e.g., "`.claude/` houses agent tooling and `shell/docs/` houses project narrative") stay in agent memory; they describe how this specific repo is laid out, not conventions to follow when designing reviewer roles. Public-repo audience can't resolve agent-private memory references — they're excluded by category rather than name.

## Architecture

Two edits to `shell/CLAUDE.md`:

1. **One new subsection** under "Planning conventions and long-term alignment", placed immediately after the existing "Subagent reviewer PR-posting discipline" subsection. The new subsection builds on PR-posting discipline by saying "here's how to design new reviewer roles that fit this discipline." Subsection title: **"Reviewer-role design conventions"**.

2. **One named-convention addition to "Branching and merging"** (a new bullet alongside the existing Spec-PR / ADR-PR workflow bullets) covering the post-merge-implementation rule for docs-only iterations whose insert text is fully specified in the spec.

The new subsection has two parts:

1. **Four design patterns** for new reviewer roles (one paragraph each).
2. **Auto-dispatch controller obligations** — a short checklist of the actions the controller must take at specific decision points for the spec/ADR-PR workflow to function.

Cross-references back to the registry table (source of truth for role metadata) and to the prompt template convention (`.claude/reviewer-prompts/<role>.md`).

**Deliberate bundling of two-audience content.** The four design patterns are read at *brainstorm time* by someone designing a future reviewer role; the auto-dispatch checklist is read at *PR-open time* by a controller running an iteration. Different audiences, different read moments. v1 co-locates them under one subsection because both are agentic-team-track meta-conventions and clustering keeps the agentic-team substrate compact. Cost accepted: a reader landing on "Reviewer-role design conventions" sees content adjacent to but not immediately relevant to their current task. If the cost compounds, splitting is the obvious next-iteration refactor.

**Denormalization with existing CLAUDE.md auto-dispatch prose.** CLAUDE.md already has a "Red-team auto-dispatch" paragraph in the "Subagent reviewer PR-posting discipline" subsection that describes the rule. The new "Auto-dispatch controller obligations" checklist denormalizes that rule into actionable form — intentional duplication for legibility, similar to how the verdict-permissions table denormalizes the registry per ADR-0008's "registry is source of truth" framing. If the two drift on a future edit, consolidate by promoting the checklist form as canonical and shortening the existing paragraph to a registry pointer.

**Refusing to consolidate the line-121 prose now (rather than later) is a deliberate v1 choice.** The new subsection is purely additive. Consolidating in the same iteration would broaden scope from "articulation pass" to "CLAUDE.md restructure". Cost named: the two-source duplication can drift on next edit. Mitigation: the registry-as-source-of-truth pattern from ADR-0008 keeps the substantive rule anchored in the registry table; both the paragraph and the checklist are derived views.

## The new subsection (exact text to add)

````md
### Reviewer-role design conventions

When designing a new reviewer role (devil's advocate v2, expert reviewers, future expansions of the reviewer-role registry), apply these conventions. They emerged from the red-team v1 user-review pass and the reviews-as-artifacts mechanics validation (PR #1 + PR #3 on 2026-05-14). The four patterns generalize from one data point (red-team v1); the generalization is a forward-looking bet. Known unknown: which patterns hold up across the future expert-reviewer track. Adjust as evidence accumulates.

**Audit trail of priors inspected.** Any review section that compares the artifact against existing artifacts (CLAUDE.md, prior specs, ADRs, roadmap, out-of-scope) must require an explicit `Checked against:` enumeration with **specific anchors** — file + section heading, ADR slug, spec filename. Bare `CLAUDE.md` doesn't satisfy. Required even when no drift is flagged: without the audit trail, "nothing flagged" is indistinguishable from "didn't read the priors" — exactly the failure mode this discipline surfaces. The red-team prompt template (`.claude/reviewer-prompts/red-team.md`) is the canonical implementation.

**Mechanical / judgment split in live validation.** Live-validation pass criteria for a new reviewer role must require BOTH (a) mechanical compliance — header form, sections present, identity, verdict, audit-trail line populated — algorithmically verifiable, AND (b) judgment that the critique reflects engagement with the artifact, not engagement-theater. A reviewer that posts the mechanically-compliant structure but says "Nothing flagged" across every section fails (b) by default unless the artifact is genuinely so trivial that nothing of substance could be flagged. **v1: the user is the judge of (b).** Whether algorithmic alternatives, delegated agents, or sampled-spot-checks could substitute for user-as-judge is a known unknown; user-as-judge is the v1 default, not a permanent state-of-the-art claim.

**`identity` field in the registry, even when all roles share one bot.** Every entry in the reviewer-role registry carries an `identity` field. In v1 all roles share `gcscode-reviewer[bot]`, so the column is uniform — but it's there. Adding the field early is cheap; retrofitting when the future distinct-App-identities-per-reviewer-role iteration lands would mean editing every row.

**Tripwires for known-quality concerns.** Validation plans should include explicit detection mechanisms for concerns that are otherwise vibes-checks. Tripwire-worthy concerns are those (i) tied to a specific failure mode of the role (not generic critique-quality worries), (ii) observable in the review's structured output rather than requiring artifact-level human judgment, and (iii) detectable as a pattern across N PRs rather than per-PR. Example from the red-team spec's Plan 2: "if N consecutive ADR-PRs return all-silent red-team reviews, consider pulling ADR-PR from red-team's `targets` registry field." Tripwires are manual review items, not automated checks; they live in the spec's validation section.

#### Auto-dispatch controller obligations

The reviewer-role registry's `trigger` field declares WHEN a role fires (e.g., red-team's `trigger` is "Automatic on PR open"). In v1 there is no automated dispatcher; the controller (human or LLM session) honors the trigger. This checklist makes the controller's action points legible **for roles whose `trigger` is `Automatic on PR open`**. Other trigger forms (`After each task commit` for per-task reviewers; `End of iteration` for final cross-cutting) have their own existing dispatch patterns documented in "Subagent-driven plan execution" and "Subagent reviewer PR-posting discipline":

- **Before opening a `spec/<topic>` or `adr/<slug>` PR:** plan to dispatch the red-team subagent immediately after `gh pr create`. Do not consider the PR-open step complete until red-team has posted its review.
- **After every `Code-review-followup:` commit on a spec/ADR branch:** re-dispatch red-team. Re-review header includes `(re-review of <SHA>)` where `<SHA>` is the followup commit (existing convention). Note: a followup that does not touch content red-team reviewed will still trigger re-dispatch. v1 accepts the duplicative-review cost; if the pattern produces material noise, a future iteration can condition the obligation on whether the followup touches reviewed content.
- **No automated enforcement in v1.** Convention-based; the obligation is the controller's. Detection of a skip is by user observation — a merged spec/ADR PR with no red-team review is the failure signature. Trigger to add automated enforcement: first observed silent skip on a real spec/ADR PR.

When new reviewer roles join the registry whose `trigger` is also `Automatic on PR open` (e.g., devil's advocate v2), append their obligations to this checklist alongside red-team's. Other trigger forms get their own checklist if/when they're added.
````

## The second CLAUDE.md edit — "Branching and merging" addition

Add a new bullet to the "Branching and merging" section, immediately after the existing "ADR-PR workflow" bullet (so the post-merge-implementation rule sits adjacent to the workflows whose post-merge state it governs):

````md
- **Post-merge implementation conventions.** When a spec-PR or ADR-PR merges, implementation follows the same conventions as any other change: feat branches (with the subagent-driven plan execution pipeline) for code or for changes that require judgment during implementation (decomposition, integration, file structure beyond what the spec specifies); direct master commits for purely mechanical CLAUDE.md or docs edits whose exact text is fully specified in the spec. The spec-PR's red-team review serves as the cross-cutting review of the behavioral change; the post-merge mechanical commit is execution-only. If you find yourself making decisions during the post-merge commit that the spec didn't make, stop and use a feat branch.
````

This bullet generalizes the carve-out into a named convention, not a one-off. Future docs-only iterations (housekeeping passes, articulation passes) inherit it.

## Data flow — how this iteration ships

1. **Spec lands via the new spec-PR workflow.** Branch `spec/reviewer-role-design-conventions` off master, this spec file commits, PR opens with the spec/ADR-PR template.
2. **Red-team auto-dispatches on PR open.** First live test of Plan 2 (organic critique quality) from the red-team-reviewer spec. Controller dispatches red-team subagent per the auto-dispatch obligation; subagent reads the prompt template, the PR diff, and the priors enumerated in `Checked against:`; posts `--comment` review.
3. **User reads red-team's review + approves the spec.** If red-team flags anything substantive, controller addresses via `Code-review-followup:` commit and re-dispatches red-team (still `--comment`).
4. **Merge via `gh pr merge --merge`.** User does the merge, not the controller. Merge-commit boundary preserved.
5. **CLAUDE.md edits land as direct master commits** after merge, per the new "Post-merge implementation conventions" bullet this iteration adds to CLAUDE.md's "Branching and merging" section. The principle: when a spec specifies the verbatim insert text and implementation requires no judgment (no decomposition, no integration, no file-structure work beyond the spec), the post-merge insert lands as a direct master commit — the spec-PR's red-team review IS the cross-cutting review of the behavioral change. When implementation does require judgment, use a feat branch with the standard subagent-driven pipeline.

   For this iteration, both edits qualify as direct-master commits: the "Reviewer-role design conventions" subsection text is fully specified in the spec, and the "Post-merge implementation conventions" bullet for "Branching and merging" is too (defined in the next section). Naming this convention rather than leaving it as a one-off carve-out is what red-team's review surfaced as the highest-leverage missing piece.

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
2. **Red-team enforces design patterns on role-adding specs.** Extend the red-team prompt template with a directive: "if this spec adds a new reviewer role, verify the four design patterns from CLAUDE.md 'Reviewer-role design conventions' are present (audit trail, mechanical/judgment split, identity field, tripwires)." Trigger: devil's advocate v2 or first expert reviewer iteration — check first whether organic critique surfaces pattern-misalignment naturally before adding an explicit directive.
3. **Consolidate the line-121 auto-dispatch paragraph and the new checklist.** Promote the checklist form as canonical; shorten the paragraph to a registry pointer. Trigger: the two drift on a non-related edit, OR a third reviewer role joins the auto-dispatch checklist.
4. **Conditional re-dispatch on followups.** Condition the re-dispatch obligation on whether the followup touches content red-team reviewed. Trigger: duplicative-review noise becomes material.
5. **Devil's advocate v2** (already on roadmap; from red-team spec). Will be the first new reviewer role to consult these conventions.
6. **Expert / domain / security reviewer track** (already on roadmap; from red-team spec). Each new role appends an `auto-dispatch obligation` row to the controller checklist if its `trigger` is `Automatic on PR open`.

### Devil's-advocate-v2 questions surfaced by red-team's review of this spec

Red-team's review on PR #4 flagged two open questions that fall into devil's advocate territory (steel-man-the-opposite); noting here so v2 doesn't have to re-derive them:

- **Is there a structural alternative to encoding reviewer-role conventions in CLAUDE.md prose at all?** Machine-checkable schema, executable validation hooks, or generated artifact from a single source-of-truth file might be more durable. The current solution lives in prose.
- **Is the entire "reviewer-role registry + per-role prompt templates + meta-conventions in CLAUDE.md" architecture the right shape, or would project-local Claude Code skills per reviewer role be more natural now that there are multiple roles and meta-conventions to layer on top?** ADR-0008 marked project-local skills as "worth reconsidering after the registry pattern has lived for a few iterations" — devil's advocate v2 will be one full iteration past introduction; check whether two iterations is enough signal to revisit or whether the threshold should be more like five.

## Origin

Surfaced during the 2026-05-14 housekeeping pass after the red-team-reviewer iteration shipped. Item 3 (auto-dispatch articulation) and item 8 (design patterns articulation) were both findings in cut B; the user approved combining them into one CLAUDE.md addition. Brainstorm was brief (one clarifying question) because the design space was narrow and the patterns were already crystallized in agent memory.
