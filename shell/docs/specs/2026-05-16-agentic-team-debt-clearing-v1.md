# Agentic-team debt-clearing v1 (planning iteration)

**Slug:** agentic-team-debt-clearing-v1
**Iteration on the agentic-team track:** ninth, after [`docs/specs/2026-05-16-review-discussion-loop-v1.md`](2026-05-16-review-discussion-loop-v1.md).
**Type:** planning iteration. Makes three small in-spec decisions and queues seven follow-up iterations. No new logic in `shell/`.
**No bootstrap exceptions.** Spec ships via spec-PR workflow; small post-merge implementation per the convention.

## Context

The agentic-team track has shipped eight iterations (reviews-as-artifacts, red-team-reviewer, reviewer-role-design-conventions, spec-quality-reviewer, auto-merge-on-user-approval, multi-model-red-team-v1, effort-max-custom-reviewers, review-discussion-loop-v1). Each iteration has shipped a smaller wedge with explicitly-accepted limitations, with the deferred work named as "future iteration triggers."

The triggers are being met but not acted on. Across the most recent three iterations:

- **PR #11 (effort-max)** deferred: pre-merge mechanism verification (structural constraint), ADR for `.claude/agents/` structural layer, specs-as-historical-record convention status.
- **PR #11 mid-session discovery:** `.claude/agents/*.md` files are NOT discoverable mid-session — the Agent tool loads `subagent_type` registry at session start. Falls back to `subagent_type: general-purpose` if you create agent files in the same session. Undocumented in CLAUDE.md or out-of-scope.md.
- **PR #12 (review-discussion-loop-v1)** deferred: ADR for respondent-as-new-actor pattern, cross-session controller-direct premise as Day 1 limitation, auto-merge-bypasses-final-respondent structural contradiction, tripwire condition (iii) compliance, `gh pr review --comment` vs `gh pr comment` voice-separation premise.

The pattern: each spec routes its limitations to "future iteration with explicit trigger," but the queue never gets drained.

**User explicit intent (2026-05-16):**

> "Yes accept the limitation in this iteration. However we have chosen to accept limitations for the past 3 or 4 iterations, we are building up technical debt. Lets make a note to design a plan to tackle this in the next iteration. Example: We should have written an ADR for this, like you suggest. The next iteration will be a big one where we clear a lot of this tech debt."

This iteration is that designed plan. It is itself a planning spec, not a code-touching iteration: its deliverables are a small set of in-spec decisions + a queue of named follow-up iterations.

**Drain mechanism — the load-bearing commitment that distinguishes this iteration from "more deferral":**

The reviewers correctly flagged that adding seven Considering entries to roadmap.md is structurally identical to the queue-accumulation pattern that caused the debt. What makes this iteration different from "accept-and-defer-again" is the **explicit commitment that the NEXT iteration after this planning spec is the first queued item (ADR-0009), with no other iterations interleaved.** The queue is drained sequentially, in the priority order documented below, starting immediately after this spec merges. If a future iteration jumps the queue (e.g., adds a queued item to scope), that's a deliberate decision documented at that iteration's brainstorm, not a silent defer.

Without that commitment, this iteration would indeed be the same pattern with more ceremony. With it, the planning spec serves as the contract: the controller picks up the queue and starts draining.

## Why not the bigger version

The bigger version would include:

- **Execute all the queued items in this iteration.** Would land the seven follow-up iterations' content here. **Smaller wedge:** plan + queue; let each item ship as its own spec-PR. **Bigger wedge:** mass-execute, risks the same accept-limitations-and-defer pattern by trying to do too much in one go.
- **Write ADR-0009 in this iteration's PR.** Would bundle the ADR-PR with this planning PR. **Smaller wedge:** queue ADR-0009 as the next ADR-PR; this planning spec just makes the call to do it. **Bigger wedge:** bundled architectural rewrite + planning, harder to review independently.
- **Restructure the entire agentic-team docs surface.** A full sweep of CLAUDE.md, the registry, the reviewer prompts, the dispatch obligations. **Smaller wedge:** three targeted CLAUDE.md edits + a queued ADR-PR. **Bigger wedge:** open-ended restructure with unclear endpoint.
- **Address the multi-model v1 evaluation early.** The N=5 counter restarted at PR #11's merge; the evaluation iteration is on-deck but doesn't have data yet. **Smaller wedge:** queue the evaluation as one of the seven follow-ups; let it fire when N=5 hits. **Bigger wedge:** force the evaluation early on insufficient data.

This iteration ships: three small in-spec decisions (ADR supersession call, specs-as-historical-record convention, session-bound finding documentation) + a roadmap of seven follow-up iterations in priority order.

## Goals

1. **Make the ADR-0008-supersession call:** ADR-0009 is the next ADR-PR; it broadens ADR-0008's reviewer-role registry into a general agentic-actor registry covering reviewer roles AND non-reviewer controller-voice actors (respondent in v1; future variants in v2+).
2. **Formalize the specs-as-historical-record convention** in CLAUDE.md (hybrid: cross-reference breadcrumb default per the PR #11 N=5 precedent; deep edits allowed for factual corrections with explicit rationale).
3. **Document the session-bound agent-file discovery finding** in CLAUDE.md and out-of-scope.md so future post-merge implementations introducing new `.claude/agents/*.md` files don't hit it blindly.
4. **Queue seven follow-up iterations** in priority order: ADR-0009 → respondent subagent v2 → per-role bot identities → reviewer routing layer → multi-model v1 evaluation → auto-merge-bypasses-final-respondent design → tripwire condition (iii) compliance.

## Non-goals (this iteration)

Each item below is on the queued list; this planning spec names it but does not address it inline. Triggers for each are in Future iterations below.

- Writing ADR-0009 itself. The supersession call is made here; the ADR-0009 ADR-PR is queued iteration #1.
- Designing the respondent subagent. Queued iteration #2.
- Designing per-role bot identities. Queued iteration #3.
- Designing the reviewer routing layer. Queued iteration #4.
- Running the multi-model v1 evaluation. Queued iteration #5; passive trigger when N=5 spec/ADR PRs land.
- Auto-merge-bypasses-final-respondent design. Queued iteration #6.
- Tripwire condition (iii) compliance. Queued iteration #7.
- **Restructuring how follow-up iterations are sequenced operationally.** The seven follow-ups land as separate spec-PRs in the priority order below. No bundling, no worktree-parallelism for them. Standard tempo applies.
- **Addressing `gh pr review --comment` vs `gh pr comment` premise.** Low-leverage; remains as a carry-forward note. If it bites in operational use, it gets its own micro-iteration.
- **Solving the pre-merge mechanism verification structural constraint.** Long-standing; would require restructuring the spec-PR workflow itself. Not on the queue; revisit if it becomes painful.

## Architecture

The three in-spec decisions, in detail.

### Decision 1: ADR-0008 → ADR-0009 supersession (call made; ADR-0009 written as queued ADR-PR)

**The call:** ADR-0009 is the next ADR-PR. It broadens ADR-0008's "reviewer-role registry" into an "agentic-actor registry" that covers reviewer roles (existing) AND non-reviewer controller-voice actors (respondent in v1; future variants).

**ADR-0009 number-reservation note.** The multi-model-red-team-v1 spec (`docs/specs/2026-05-16-multi-model-red-team-v1.md`) predicted that if its evaluation returned KEEP-BOTH, an ADR titled "Reviewer-role registry secondary-model field" would be written and take ADR-0009. That prediction is now superseded: this iteration claims ADR-0009 for the agentic-actor registry (which is a higher-priority architectural change and is happening immediately, not contingent on a future evaluation). If the multi-model v1 evaluation returns KEEP-BOTH and an ADR is warranted, it gets the next available number at that time (likely ADR-0010 or later depending on intervening ADRs).

**Per Decision 2's convention** (specs-as-historical-record), this prediction-correction warrants a one-line breadcrumb in the multi-model v1 spec — the same pattern as PR #11's N=5 counter-reset breadcrumb. The breadcrumb is added as **Commit 5** of this iteration's post-merge implementation. This makes the very first use of the convention the same iteration that introduces it — a deliberate dogfooding moment.

**Mechanics (industry-standard ADR supersession):**

- ADR-0008's Status field changes from `Accepted` to `Superseded by ADR-0009`.
- ADR-0009 is a new file (`docs/decisions/ADR-0009-agentic-actor-registry.md`) with `Supersedes ADR-0008` noted in its body.
- Filenames stay put; only Status fields and body references change.
- No filename variants (no `ADR-0008-a` patterns).

**Why this rather than extending ADR-0008 in place:** the supersession + Status convention is the standard Nygard pattern (and the convention adopted by the broader ADR community); preserves ADR-0008's exact historical text; makes the architectural pivot legible as a pivot rather than a silent revision.

**Why this rather than no ADR at all:** the respondent-as-actor pattern (PR #12) and the `.claude/agents/` structural layer (PR #11) are real architectural additions. Two iterations in a row deferred the ADR work; this is the moment to close the debt. The user has explicitly signaled the deferred-ADR pattern is the load-bearing piece of the accumulated tech debt.

**Scope of ADR-0009 (specified here for the queued ADR-PR to follow):**

- Define "agentic actor" as any GitHub App identity (or future identity class) that posts on PRs under an autonomous-or-semi-autonomous flow.
- Reviewer-role registry table from ADR-0008 stays as one section; gains an "actor-class" classifier.
- New section for non-reviewer actors (controller-voice respondent in v1; v2 expansions to follow).
- Migration path: existing reviewer-role registry entries (red-team Opus + Sonnet, spec-quality, spec-compliance, code-quality, final cross-cutting) carry their `identity: gcscode-reviewer[bot]` field unchanged.
- Decision: whether per-role bot identities (long-standing Considering item) becomes a same-iteration concern of ADR-0009 or stays queued. **Recommendation: stays queued.** ADR-0009 documents the registry pattern; per-role identities use the pattern; the iteration that adds per-role identities is its own thing.

The actual ADR-0009 brainstorm happens when the queued ADR-PR is kicked off; this spec sets the direction, doesn't pre-write the ADR.

### Decision 2: Specs-as-historical-record convention (CLAUDE.md addition)

**The convention** (verbatim text below in Post-merge implementation > Commit 1):

> **Specs as historical record.** A spec that ships via spec-PR + merges to master becomes the historical record for that iteration. Subsequent specs that need to revise the predecessor's decisions add a one-line cross-reference breadcrumb to the predecessor (the PR #11 N=5 counter-reset pattern); they do NOT deeply edit the predecessor's content. Substantive corrections happen via successor specs.
>
> **Exception:** deep edits to a predecessor spec are allowed for **factual corrections** (typos, broken links, file renames that affect references in the predecessor, similar mechanical fixes) — never to revise the predecessor's substantive decisions. When making such an edit, the editor commits with a clear "fix(spec):" prefix and a one-sentence rationale in the commit message.
>
> **Why the convention:** legibility. A reader (human or future agent) reading a merged spec should be able to trust its content is the historical record of what the iteration decided. Substantive revisions surfacing as edits to old specs makes the historical record unreliable.

**Why hybrid rather than strict:** factual corrections must remain possible (broken links rot; file renames cascade). The "substantive vs factual" distinction is a judgment call; the convention provides the framing, not an algorithm. Concretely: if you find yourself changing what the predecessor SAID (its goals, non-goals, architecture, decisions), that's substantive and goes in a successor spec. If you find yourself changing how the predecessor refers to something that has since moved (link path, filename, section anchor), that's factual.

**On the cited precedents.** The PR #11 N=5 counter-reset example is an example of the convention's USAGE (breadcrumb added to predecessor without deep edits), not an example of the problem the convention prevents. The problem itself — silent deep-editing of merged specs — has not happened yet on this project; the convention is **forward-looking guardrail**, codifying a pattern that emerged in practice (PR #11) before someone decides to deep-edit a predecessor without realizing the implications. If the convention isn't followed and a future spec deep-edits a predecessor's substantive content, Plan 1 below catches it.

### Decision 3: Session-bound agent-file discovery (CLAUDE.md addition + out-of-scope.md entry)

**The finding** (from 2026-05-16's session that landed PR #11's post-merge): `.claude/agents/*.md` files are loaded into the Agent tool's `subagent_type` registry at session START. Creating a new agent file mid-session does NOT make it discoverable via the new `subagent_type` in that session. The fallback is `subagent_type: general-purpose` with the full prompt template inline.

**Practical impact:** any post-merge implementation that creates new `.claude/agents/*.md` files cannot validate the new dispatch identifier in the same session that lands the files. A fresh session is required for the new identifier to be discoverable. PR #11's Plan 1 was bitten by exactly this in the session that landed its post-merge commits.

**Documentation locations** (verbatim text below in Post-merge implementation > Commits 2 and 3):

- **CLAUDE.md:** new note added under "Subagent reviewer PR-posting discipline" subsection, near the "Config locations" paragraph, explaining the session-bound behavior + the fallback pattern.
- **docs/out-of-scope.md:** new entry naming "Agent file discovery hot-reload" as an out-of-scope harness behavior — fixing it would require Claude Code's harness to watch `.claude/agents/` and re-load the `subagent_type` registry, which is outside gcscode's scope.

## Post-merge implementation

Per the post-merge implementation convention, five direct-master commits. All content fully specified verbatim below; no judgment required during implementation.

- **Commit 1: Add the specs-as-historical-record convention** to CLAUDE.md under the existing "Planning conventions and long-term alignment" section. Verbatim text below.
- **Commit 2: Add the session-bound agent-file finding** to CLAUDE.md under the existing "Subagent reviewer PR-posting discipline" subsection (near "Config locations"). Verbatim text below.
- **Commit 3: Add the out-of-scope entry** for agent-file discovery hot-reload to `shell/docs/out-of-scope.md`. Verbatim text below.
- **Commit 4: Consolidate + add Considering entries in `shell/docs/roadmap.md`** per the seven queued follow-up iterations, in priority order, plus a Shipped entry for this planning iteration. Verbatim text below.
- **Commit 5: Add the ADR-0009 number-reservation breadcrumb** to `shell/docs/specs/2026-05-16-multi-model-red-team-v1.md` per Decision 1's note + Decision 2's convention. Verbatim text below.

The ADR-0009 work itself (writing the agentic-actor registry ADR) is the NEXT ADR-PR, not part of this iteration's post-merge.

### Verbatim — Commit 1 (specs-as-historical-record convention in CLAUDE.md)

Insert the following subsection inside the "Planning conventions and long-term alignment" section of CLAUDE.md, after the "VS Code alignment" subsection and before the "Subagent-driven plan execution" subsection:

````md
### Specs as historical record

A spec that ships via spec-PR + merges to master becomes the historical record for that iteration. Subsequent specs that need to revise the predecessor's decisions add a **one-line cross-reference breadcrumb** to the predecessor (per the PR #11 N=5 counter-reset precedent); they do NOT deeply edit the predecessor's content. Substantive corrections happen via successor specs.

**Exception — factual corrections allowed.** Deep edits to a predecessor spec are permitted for **mechanical fixes**: typos, broken links, file renames that affect references, or other corrections that don't revise the predecessor's substantive decisions. When making such an edit, commit with a `fix(spec):` prefix and a one-sentence rationale in the commit message.

The substantive-vs-factual line is a judgment call, but the test is concrete: if you're changing what the predecessor SAID (its goals, non-goals, architecture, decisions), that's substantive — write a successor spec. If you're changing how the predecessor REFERS to something that has since moved (link path, filename, section anchor), that's factual — edit in place.

**Why the convention:** legibility. A reader (human or future agent) reading a merged spec should be able to trust the content is the historical record of what the iteration decided. Substantive revisions surfacing as silent edits to old specs makes the historical record unreliable.

Codified during the agentic-team debt-clearing iteration (`docs/specs/2026-05-16-agentic-team-debt-clearing-v1.md`) as a **forward-looking guardrail**. The breadcrumb pattern emerged in practice (PR #11's N=5 counter-reset breadcrumb is the canonical example) but the deep-edit-of-predecessor problem the convention prevents has not happened yet. The convention codifies the breadcrumb pattern as the default + the substantive-vs-factual line as the test for when to use it.
````

### Verbatim — Commit 2 (session-bound agent-file finding in CLAUDE.md)

Insert the following paragraph inside the "Subagent reviewer PR-posting discipline" subsection of CLAUDE.md, immediately after the "Config locations" paragraph and before the next major subsection:

````md
**Agent file discovery is session-bound.** Newly-created `.claude/agents/*.md` files are NOT discoverable via `subagent_type: <name>` in the same Claude Code session that creates them — the Agent tool loads its `subagent_type` registry at session start. Post-merge implementations that introduce new agent files (the effort-max iteration's `red-team-reviewer.md` and `spec-quality-reviewer.md`; future agent-file additions) cannot validate the new dispatch identifier in the session that lands the files. **Workaround:** dispatch with `subagent_type: general-purpose` + the full prompt template inline (the pre-effort-max dispatch pattern) for the rest of that session. Plan 1 mechanics smoke tests for new agent files must run in a fresh session, post-merge. The harness-level fix (agent-file hot-reload) is out of scope per `docs/out-of-scope.md`.
````

### Verbatim — Commit 3 (out-of-scope entry for agent-file discovery hot-reload)

Add the following entry to `shell/docs/out-of-scope.md` under the "Agentic team architecture deferrals" section (or whichever section contains agentic-team out-of-scope items; the exact section header should be verified at implementation time):

````md
- **Agent file discovery hot-reload.** `.claude/agents/*.md` files are loaded into the Agent tool's `subagent_type` registry at session start only. Creating a new agent file mid-session does not make it discoverable in that session; a fresh session is required. **Observed evidence:** PR #11 (effort-max) and PR #12 (review-discussion-loop-v1) both were bitten by this — the dispatching session in each case fell back to `subagent_type: general-purpose` because the new agent files weren't discoverable. Fixing this would require Claude Code's harness to watch `.claude/agents/` and re-load the registry, which is a harness-level behavior outside gcscode's scope. Trigger to revisit: the harness gains hot-reload behavior, OR a future iteration finds the session-restart workaround painful enough to warrant a workaround (e.g., always create new agent files in a separate session before opening the spec-PR). The workaround pattern (`subagent_type: general-purpose` fallback with full prompt inline) is functionally adequate even when the harness behavior doesn't change.
````

### Verbatim — Commit 4 (roadmap.md consolidation + new entries)

Commit 4 **consolidates** existing Considering entries (which overlap with this iteration's queued items) AND adds new entries for queued items that didn't exist before. The result is one Considering section without duplicates.

**Existing Considering entries to UPDATE (not duplicate):**

- `Per-role bot identities` (currently line 78 of roadmap.md) — REPLACED with the richer entry from this iteration's queue (item #3 in the priority order below).
- `Reviewer routing layer` (currently line 79) — REPLACED with the richer entry from this iteration's queue (item #4).
- `Multi-model evaluation iteration` (currently line 81) — REPLACED with this iteration's queued item #5 entry. The existing entry's reference to "ADR-0009 ('Reviewer-role registry secondary-model field') gets written at the same time" is REMOVED because ADR-0009 is now claimed for the agentic-actor registry (see Architecture > Decision 1). If the multi-model evaluation returns KEEP-BOTH and an ADR is warranted, that ADR gets the next available number at that time.

**Existing Considering entries to LEAVE UNCHANGED:**

- All `Custom subagent dispatch for effort-level control` and `Custom dispatch for feature-PR reviewers` entries (currently lines 82-83). These don't overlap with this iteration's queue.
- All other existing Considering entries (Linear integration, webhook router, override semantics, retroactive ADR for reviews-as-artifacts, the resolved `Superpowers baseline reviewers on spec/ADR PRs?` entry).

**Net change:** three existing entries replaced + four new entries added (queued items #1, #2, #6, #7 from this iteration's queue) + one Shipped entry added. Total roadmap.md Considering section size grows by 4 entries, not 7.

**Update 1: Add a Shipped entry** for this planning iteration under the agentic-team track:

````md
- [x] **Agentic-team debt-clearing v1 (planning iteration)** — surfaced 2026-05-16 after the user observed that the past 3-4 iterations had each accepted limitations as "future iteration triggers" without draining the queue. Makes three in-spec decisions (ADR-0008 supersession call, specs-as-historical-record convention, session-bound agent-file finding documentation) and queues seven follow-up iterations in priority order. Spec: [`specs/2026-05-16-agentic-team-debt-clearing-v1.md`](specs/2026-05-16-agentic-team-debt-clearing-v1.md).
````

**Update 2: Add the seven queued follow-up iterations as Considering entries**, in priority order:

````md
- [ ] **ADR-0009: Agentic-actor registry (supersedes ADR-0008)** — broadens ADR-0008's reviewer-role registry into a general agentic-actor registry covering reviewer roles AND non-reviewer controller-voice actors (respondent in v1; future variants). Industry-standard ADR supersession mechanics: ADR-0008 Status flips to `Superseded by ADR-0009`; ADR-0009 is a new file noting `Supersedes ADR-0008`. Scope of ADR-0009 specified in `specs/2026-05-16-agentic-team-debt-clearing-v1.md` Architecture > Decision 1. Trigger: ready to kick off as soon as this planning spec merges; no external prerequisite.
- [ ] **Respondent subagent v2** — addresses the cross-session controller-direct premise accepted as a Day 1 limitation in `specs/2026-05-16-review-discussion-loop-v1.md`. Introduces a dedicated respondent subagent role that reads the followup commit + prior reviews and writes the response with session-independent context. Trigger: first real cross-session PR after `review-discussion-loop-v1` merges that shows reconstruction-cost is material (per that spec's cross-session tripwire).
- [ ] **Per-role bot identities for reviewers** — long-standing Considering item; becomes load-bearing once respondent v2 ships (then we have reviewer bot + respondent bot + respondent subagent variants). Splits `gcscode-reviewer[bot]` into per-role App identities (`gcscode-red-team[bot]`, `gcscode-spec-quality[bot]`, etc.). Trigger: after respondent v2 establishes the multi-actor pattern, OR when the first domain-expert reviewer is added (whichever first).
- [ ] **Reviewer routing layer** — long-standing Considering item; "which reviewer roles fire on which PRs." Becomes load-bearing when a 4th reviewer role arrives (domain expert, devil's-advocate v2, etc.). Trigger: 4th reviewer role is added.
- [ ] **Multi-model v1 evaluation** — passive trigger: when N=5 spec/ADR PRs have landed post-PR-11 (the N=5 counter reset point). Spec: `specs/2026-05-16-multi-model-red-team-v1.md` Evaluation methodology. Decides KEEP-BOTH / KEEP-OPUS-ONLY / KEEP-SONNET-ONLY / EXTEND-TO-10.
- [ ] **Auto-merge-bypasses-final-respondent design** — small design call. The respondent posts after each Code-review-followup commit, but the FINAL round (clean reviews → user merges) has no followup commit and therefore no respondent post. Either accept this asymmetry, or design a "final wrap" respondent post for the merge-ready state. Trigger: after respondent v1 ships and the asymmetry is operational (per `review-discussion-loop-v1` carry-forward).
- [ ] **Tripwire condition (iii) compliance** — small alignment between `review-discussion-loop-v1`'s tripwires and the design convention in CLAUDE.md "Reviewer-role design conventions > Tripwires" (condition iii: detectable as a pattern across N PRs rather than per-PR). Some of v1's tripwires are per-session detection. Either revise the tripwires or revise the convention. Trigger: ready to address as a quick micro-iteration; no external prerequisite.
````

**Update 3:** Existing entries `Per-role bot identities`, `Reviewer routing layer`, and `Multi-model evaluation iteration` are replaced (not duplicated) by the consolidated entries in Update 2. See the "Existing Considering entries to UPDATE" header above for the consolidation details.

### Verbatim — Commit 5 (ADR-0009 number-reservation breadcrumb in multi-model v1 spec)

Append the following one-line breadcrumb to the end of the `### Effort dimension: known limitation` subsection of `shell/docs/specs/2026-05-16-multi-model-red-team-v1.md` (currently lines 127-end of that subsection). Position chosen so the breadcrumb sits adjacent to the section where the ADR-0009 prediction lives without deep-editing it.

Verbatim text to append (as a blockquote, same shape as PR #11's N=5 counter-reset breadcrumb):

````md
> **ADR-0009 number-reservation update (added 2026-05-16):** The debt-clearing iteration ([2026-05-16-agentic-team-debt-clearing-v1.md](2026-05-16-agentic-team-debt-clearing-v1.md)) claims ADR-0009 for the agentic-actor registry (superseding ADR-0008). The prediction in this spec that ADR-0009 would carry "Reviewer-role registry secondary-model field" is invalidated; if the evaluation iteration returns KEEP-BOTH and an ADR is warranted, that ADR gets the next available number at that time (likely ADR-0010 or later).
````

The breadcrumb does NOT modify the original spec's substantive content (the decision to defer the ADR until KEEP-BOTH is intact; only the predicted number is corrected). This is the first application of the specs-as-historical-record convention introduced in Commit 1.

## Data flow — how this iteration ships

1. Brainstorm → spec → spec-PR. **Ninth iteration shipping via the spec-PR workflow.**
2. **On PR open: red-team Opus + red-team Sonnet + spec-quality auto-dispatch in parallel** per the current obligation. Reviewers run under the new `subagent_type: red-team-reviewer` / `subagent_type: spec-quality-reviewer` dispatch pattern IF this iteration runs in a fresh session (post-PR-11-merge); otherwise falls back to `subagent_type: general-purpose` per the session-bound finding documented in Decision 3.
3. User reads reviews + approves. Code-review-followup commits trigger re-dispatch per the existing obligation.
4. User merges via `gh pr merge --merge` or `auto-merge` label.
5. Post-merge implementation: five direct-master commits per the post-merge convention.
6. **Next iteration:** ADR-0009 ADR-PR (queued iteration #1) kicks off when ready; no external prerequisite.

## Validation

This is a planning iteration; validation is light.

### Plan 1: Convention adoption signals

After Commit 1 (specs-as-historical-record convention) lands, observe the next N=3 spec-PRs:

- Do successor specs use the cross-reference breadcrumb pattern when they need to revise predecessor decisions, rather than deep-editing predecessors?
- Do `fix(spec):` commits appear when predecessor specs need factual corrections?

**Failure response:** if the convention isn't followed by successor specs, either (a) the convention isn't sharp enough (revise the CLAUDE.md text) or (b) the pattern doesn't fit gcscode's tempo (consider deprecating the convention). After N=3, run a quick review.

### Plan 2: Session-bound finding effectiveness

After Commit 2 (session-bound finding in CLAUDE.md) lands, the next post-merge implementation that creates new `.claude/agents/*.md` files should reference the documented workaround (`subagent_type: general-purpose` fallback). If a future iteration's post-merge hits the session-bound issue blindly without referencing the documented workaround, the documentation isn't surfacing where it needs to.

**Failure response:** move the note to a more prominent location, OR add it as a checklist item in the post-merge implementation convention.

### Plan 3: Queue drain rate

Across the next 3-4 iterations, observe how many of the seven queued items ship. If the queue stays full or grows, the planning-iteration intervention isn't working and a different strategy is needed (more aggressive iteration cadence, bundled-execution iteration, or accepting the queue as permanent backlog).

**Failure response:** revisit the queue's structure and consider whether the smaller-wedge-per-iteration cadence is producing or fighting the debt accumulation.

## VS Code alignment

No VS Code alignment implications. The debt-clearing iteration is purely about the gcscode-specific agentic-team architecture.

Propagation to `shell/docs/vs-code-alignment.md`: none.

## `docs/out-of-scope.md` propagation

One new entry (Commit 3 above): "Agent file discovery hot-reload."

The other debt items are either (a) addressed in-spec via Decisions 1-3, or (b) queued as Considering follow-up iterations rather than out-of-scope deferrals. The distinction: out-of-scope.md entries are deferrals with NO planned iteration; the queued items have explicit planned iterations.

## `docs/roadmap.md` propagation

See Commit 4 verbatim above. Net change: 1 Shipped entry added + 4 net new Considering entries (7 queued follow-up iterations added, minus 3 existing entries consolidated into the new ones per the "Existing Considering entries to UPDATE" header in Commit 4). The total Considering section size grows by 4 entries, not 7.

## Known unknowns

- **Will the queue actually drain?** The whole point of this planning iteration is to address the accept-limitations-and-queue pattern. If the queued items themselves accumulate their own limitations and queue follow-ups, the debt grows recursively. Plan 3 observes this.
- **Are seven follow-ups too many or too few?** Seven is the size of the current debt list (top items only); some items may merge with each other naturally (e.g., per-role bot identities might land inside ADR-0009 if it's expanded). Some may turn out to be irrelevant if upstream changes obviate them. The priority order is a v1 guess based on operational pressure (cross-session premise likely-next) and architectural dependency (ADR-0009 before respondent v2 to establish the registry shape).
- **Does the specs-as-historical-record convention slow iteration?** The convention says "substantive revisions = successor spec" which adds a spec-PR cycle for what could have been an inline edit. For factual corrections, the convention allows in-place edits. The line between substantive and factual is a judgment call; if it slows us down (cycles spent debating "is this substantive?"), the convention needs revision.
- **Pre-merge verification structurally skipped (carry-forward).** Same constraint as PRs #11 and #12: this spec's post-merge implementation lands on master directly per the verbatim-spec convention; if any of the five commits' verbatim text has a bug, it surfaces post-merge. Rollback path: revert the five commits + restore prior CLAUDE.md / out-of-scope.md / roadmap.md / multi-model v1 spec state. Bounded but non-trivial.

## Future iterations

Already enumerated above as the seven queued items in Commit 4's Update 2. Reproduced briefly for navigation:

1. ADR-0009: Agentic-actor registry (supersedes ADR-0008) — ADR-PR.
2. Respondent subagent v2 — addresses cross-session premise.
3. Per-role bot identities for reviewers — load-bearing post-respondent-v2 or post-first-domain-expert.
4. Reviewer routing layer — load-bearing when 4th reviewer role arrives.
5. Multi-model v1 evaluation — passive trigger at N=5.
6. Auto-merge-bypasses-final-respondent design — small.
7. Tripwire condition (iii) compliance — small.

## Origin

User raised the debt-accumulation concern during PR #12's review pass on 2026-05-16, immediately after both red-teams flagged the cross-session controller-direct premise as a Day 1 issue rather than a future risk:

> "Yes accept the limitation in this iteration. However we have chosen to accept limitations for the past 3 or 4 iterations, we are building up technical debt. Lets make a note to design a plan to tackle this in the next iteration. Example: We should have written an ADR for this, like you suggest. The next iteration will be a big one where we clear a lot of this tech debt."

Design refined through three clarifying questions:

- **Iteration shape:** planning iteration (option B from `/housekeeping`-shaped survey). Deliverable is a plan + queue; execution lands as separate subsequent iterations.
- **ADR convention:** supersession via ADR-0009 + Status field changes on ADR-0008 (industry-standard Nygard pattern); no filename variants (no `ADR-0008-a` patterns).
- **Queue order:** ADR-0009 first, respondent subagent v2 second (architectural-first; v2 fits into the established framework as a respondent-class actor in the new registry).

The user's framing — "we have chosen to accept limitations for the past 3 or 4 iterations" — is the load-bearing observation that justifies this iteration's existence. Without it, the natural next iteration would be ADR-0009 directly. The planning step exists because the debt list extends beyond a single ADR-PR's scope; a roadmap is needed to attack the queue in order without re-introducing the same accept-and-defer pattern.
