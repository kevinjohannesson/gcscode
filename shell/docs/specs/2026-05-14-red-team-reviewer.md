# Red-team reviewer — first iteration

**Slug:** red-team-reviewer
**Iteration on the agentic-team track:** second, after [`docs/specs/2026-05-12-reviews-as-artifacts.md`](2026-05-12-reviews-as-artifacts.md).
**Bootstrap:** this iteration's spec, plan, and ADR-0008 land directly on master per current convention. Future specs and ADRs ship via the workflow this iteration introduces. Plans continue to land on master directly per "Non-goals" below.

## Context

The reviews-as-artifacts iteration shipped reviewer subagents posting to feature-PRs under a single `gcscode-reviewer[bot]` identity. That iteration covered three baseline reviewer roles (spec-compliance, code-quality, final cross-cutting) — all of which review CODE against a SPEC. They critique implementation. They do not critique the spec or ADR itself.

This iteration adds the first reviewer role that critiques the **artifact, not the implementation**: red-team. Red-team reviews spec PRs and ADR PRs and surfaces premise issues + drift from existing decisions. It is the first reviewer in what we expect will become a broader research / expert reviewer track (future domain expert, security reviewer, etc.).

To support red-team and its future siblings, this iteration also introduces a **reviewer-role registry** in CLAUDE.md — a flat enumeration of reviewer roles with their metadata. Adding a future role becomes "append a registry entry + drop a prompt template file under `.claude/reviewer-prompts/`," not "edit N scattered sections of CLAUDE.md consistently."

## Why not the bigger version

The expansive version would include:

- Red-team with three angles in one prompt (premise + devil's advocate + consistency)
- Red-team verdicts that can block (`--request-changes` with an override path)
- Plan-PR workflow alongside spec-PR and ADR-PR
- Reviewer routing layer for "which reviewers fire on which PRs"
- Branch protection enforcing the new workflow

That is a multi-iteration roadmap, not a single spec. This iteration is the smallest concrete wedge that:

1. Establishes spec-PR and ADR-PR workflows.
2. Introduces the registry substrate for the future expert-reviewer track.
3. Ships red-team in a constrained form (premise + consistency, one agent) so we learn what it actually catches before piling more on it.
4. Stays advisory in verdict, so no override mechanism is needed yet.

Devil's advocate as a separate agent is the next iteration (v2). Verdict promotion is a follow-up after we see what advisory red-team produces.

## Goals

1. Add **red-team** as a new advisory reviewer role on spec and ADR PRs.
2. Establish **spec-PR and ADR-PR workflows** — specs and ADRs ship via PR going forward, not direct commits to master.
3. Introduce **reviewer-role registry** in CLAUDE.md as substrate for the future expert-reviewer track.

## Non-goals (this iteration)

Each has its own future trigger.

- **Plan-PR workflow.** Plans continue to land on master directly. Trigger: a plan-level reviewer is added.
- **Devil's advocate angle.** Deferred to v2 as a _separate agent_ with its own registry entry and prompt template (not as an angle inside red-team). Trigger: v2 brainstorm.
- **Red-team blocking verdicts** (`--request-changes`). Advisory `--comment` only in v1. Trigger: verdict-promotion iteration that designs the override path for intentional-drift vs broken-premise distinction.
- **Override mechanism** for blocking reviewers. Not needed in v1 (no blockers). Trigger: same as above.
- **Multi-model red-team.** Single Opus 4.7 for v1. Trigger: future iteration #3 "Multi-model heterogeneous reviewers" from [`docs/specs/2026-05-12-reviews-as-artifacts.md`](2026-05-12-reviews-as-artifacts.md).
- **Reviewer routing** (which reviewers fire on which PRs). Trigger: a second non-baseline reviewer role is added.
- **Branch protection** enforcing spec/ADR-PR workflow. Convention-based for v1. Trigger: actual unintentional bypass occurs.

## Architecture and branching

Two structural shifts.

### Spec-PR and ADR-PR workflows

Specs and ADRs ship via PR, mirroring `feat/<topic>`:

- **Specs.** Branch `spec/<topic>` off master → spec file commit → push → draft PR → red-team auto-dispatches on PR open → user reads + approves → `gh pr merge --merge` to preserve merge-commit boundary.
- **ADRs.** Branch `adr/<slug>` → ADR file commit (ID picked at branch creation, file named `ADR-NNNN-<slug>.md` as today) → same flow.
- **ADRs needed mid-feature-iteration** ship as their own PR first; the feat branch then references the merged ADR. Specs already work this way for feature iterations.

No new branch protection in v1. The workflow is a CLAUDE.md convention; enforcement comes only if accidental bypass actually occurs.

### Reviewer-role registry

A new section in CLAUDE.md. Each role is an entry with these fields:

| Field              | Purpose                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| `name`             | Role identifier                                                                                        |
| `kind`             | `per-task` / `cross-cutting` / `per-artifact`                                                          |
| `identity`         | GitHub App identity that posts reviews under this role (all roles share `gcscode-reviewer[bot]` in v1) |
| `model`            | Claude Opus 4.7 / Sonnet 4.6 / etc.                                                                    |
| `targets`          | PR kinds it fires on (`feature-PR` / `spec-PR` / `ADR-PR`)                                             |
| `trigger`          | When in the PR lifecycle                                                                               |
| `verdicts`         | Subset of `{--comment, --request-changes, --approve}` allowed                                          |
| `character`        | Critique focus (short)                                                                                 |
| `header`           | The markdown header for posted reviews                                                                 |
| `re-review header` | Header form for re-reviews after `Code-review-followup:` commits                                       |
| `prompt template`  | Path to the per-role prompt template file                                                              |

Existing roles populate entries 1–3 (Spec-compliance, Code-quality, Final cross-cutting). Red-team is entry 4. Future expert/domain/security reviewers append new entries; they do not edit existing sections.

The existing verdict-permission table (currently in CLAUDE.md "Subagent reviewer PR-posting discipline") is kept as a denormalized quick-reference view. **The registry is the source of truth.**

The architectural rationale for the registry pattern (registry over inline / project-local skill / upstream contribution) lives in ADR-0008 — see [`docs/decisions/ADR-0008-reviewer-role-registry.md`](../decisions/ADR-0008-reviewer-role-registry.md).

## Red-team role definition

### Registry entry

| Field              | Value                                                                       |
| ------------------ | --------------------------------------------------------------------------- |
| `name`             | Red-team                                                                    |
| `kind`             | per-artifact                                                                |
| `identity`         | `gcscode-reviewer[bot]`                                                     |
| `model`            | Claude Opus 4.7                                                             |
| `targets`          | spec-PR, ADR-PR                                                             |
| `trigger`          | Automatic on PR open                                                        |
| `verdicts`         | `--comment` only (v1)                                                       |
| `character`        | Premise challenger + consistency reviewer                                   |
| `header`           | `## Red-team review — <spec or ADR> — Claude Opus 4.7`                      |
| `re-review header` | `## Red-team review — <spec or ADR> (re-review of <SHA>) — Claude Opus 4.7` |
| `prompt template`  | `.claude/reviewer-prompts/red-team.md`                                      |

### Prompt template at `.claude/reviewer-prompts/red-team.md`

The file contains, in order:

1. **Role framing.** Two angles of attack:
   - _Premise challenger._ Assumptions the artifact treats as given. Are they true? Are they unstated dependencies that should be explicit? Would the argument collapse if any one were wrong?
   - _Consistency reviewer._ Drift from CLAUDE.md, prior specs in `shell/docs/specs/`, ADRs in `shell/docs/decisions/`, roadmap, and out-of-scope. Drift can be intentional — surface it, do not call it a mistake.

2. **Tone instructions.** Verbosity WITHIN a finding (depth, specificity, citations) is not a failure mode. Verbosity by EXPANDING SCOPE outside the four output sections IS a failure mode — stay inside premises / drift / open questions / summary. Politeness is not a virtue. Under-critical is the only way to fail. Specific. Cite line numbers. Cite which existing doc you are comparing against. Not adversarial for sport — thorough, not hostile.

3. **Context the reviewer has access to.** PR diff (the artifact under review), CLAUDE.md, prior specs, ADRs, roadmap, out-of-scope, and the VS Code alignment ledger. The reviewer reads what it needs.

4. **Output structure** (sections in the posted review):
   - _Premises challenged_
   - _Drift from existing decisions_ — this section always opens with a **`Checked against:`** line that enumerates the prior documents the reviewer actually inspected, with specific section names or specific ADR/spec slugs (e.g., `Checked against: CLAUDE.md "Subagent reviewer PR-posting discipline", ADR-0005, docs/specs/2026-05-12-reviews-as-artifacts.md`). Bare `CLAUDE.md` without a section anchor does not satisfy this requirement. The `Checked against:` line is required even when no drift is flagged — otherwise "no drift" is indistinguishable from "didn't read the priors," which is the failure mode this audit trail is designed to surface.
   - _Open questions_
   - _Summary_

   Each section: include explicit "Nothing flagged" rather than silently dropping if nothing to say. Silence-without-justification is a failure mode.

5. **Return to controller.** Brief summary under 150 words after posting — count of premises challenged, drift items flagged, open questions surfaced.

6. **Re-review note.** If dispatched as a re-review (controller will indicate this in the prompt), include `(re-review of <SHA>)` in the header, where `<SHA>` is the **followup commit that prompted the re-review** — i.e., the new commit added since the prior review, not the commit the prior review last saw. Matches the empirical convention used in PR #1's validation. Verdict in v1 is always `--comment` for re-reviews too.

### What red-team explicitly does NOT do

- Verify the artifact compiles / lints / tests (not applicable to specs/ADRs)
- Approve the artifact (`--approve` not in v1 verdict set)
- Judge whether to merge (user's call)
- Read the brainstorm transcript that produced the spec (only repo access)
- Devil's-advocate critique (deferred to v2 as a separate agent)

## Data flow — spec/ADR PR end-to-end

1. **Pre-decision** (unchanged for feature iterations): brainstorm → produces a spec or ADR.
2. **Spec/ADR ships via PR** (new): controller creates `spec/<topic>` or `adr/<slug>` branch off master, commits the file, pushes, opens draft PR with the spec/ADR-PR template (below).
3. **Auto-dispatch:** as part of opening the PR, the controller dispatches red-team per its registry entry. Red-team:
   - Reads PR diff and project context per its prompt template
   - Posts a `--comment` review with the four sections
   - Returns a brief summary to the controller
4. **If red-team finds anything the user wants to address:** user makes a `Code-review-followup: …` commit on the spec/ADR branch. Controller **re-dispatches red-team automatically** after the followup commit lands (same pattern as per-task reviewer re-reviews from reviews-as-artifacts). Re-review posts (still `--comment` in v1) with `(re-review of <SHA>)` in the header. Prior red-team review stays in the PR timeline — reviewers never dismiss their own prior reviews (existing rule from reviews-as-artifacts).
5. **User approves and merges** via `gh pr merge --merge`. Preserves merge-commit boundary in master's git log.

## Spec/ADR PR template

```md
## <Spec or ADR title>

<one-line summary matching the artifact's first line>

## Links

- Related spec/ADR: …
- Related iteration (if any): …

## Reviewer instructions

Red-team auto-dispatches on PR open. Future reviewer roles (e.g., domain expert, when they exist) follow per the reviewer-role registry in CLAUDE.md.

🤖 Reviews authored by `gcscode-reviewer[bot]` — see [`docs/specs/2026-05-12-reviews-as-artifacts.md`](../blob/master/shell/docs/specs/2026-05-12-reviews-as-artifacts.md) for the workflow.
```

## CLAUDE.md changes

Specific edits, by section.

### "Subagent reviewer PR-posting discipline"

- Add a **"Reviewer-role registry"** subsection with the table fields from "Architecture and branching > Reviewer-role registry" above. Populate rows 1–3 from existing roles; row 4 is red-team.
- Update the existing verdict-permission table (the quick-reference view) to include the red-team row.
- Update header-convention examples to include red-team's form and its re-review variant.
- Add a paragraph: "Red-team is dispatched automatically when a spec-PR or ADR-PR is opened. The dispatch uses the same boilerplate as per-task reviewers (token helper, PR posting requirement) and reads its review template from `.claude/reviewer-prompts/red-team.md`."

### "Branching and merging"

- Add paragraphs for **spec-PR workflow** and **ADR-PR workflow** (per "Architecture and branching" above).
- Update the existing language saying spec/plan commits land on master directly: → "Plan commits can land on master directly. Spec and ADR commits land via PR (see workflow above)."

### "Planning conventions and long-term alignment > Subagent-driven plan execution"

- One sentence acknowledging that specs and ADRs now ship via PR going forward, with a forward reference to the new branching section.

### "Further reading"

- Add a bullet for `.claude/reviewer-prompts/red-team.md`.
- Add a bullet for this spec at `docs/specs/2026-05-14-red-team-reviewer.md`.
- Add a bullet for ADR-0008.

## New files (this iteration)

- **`shell/docs/decisions/ADR-0008-reviewer-role-registry.md`** — captures the registry pattern decision (context, decision, alternatives considered, consequences). First ADR in the agentic-team track.
- **`.claude/reviewer-prompts/red-team.md`** — red-team's prompt template (full content per "Red-team role definition > Prompt template" above).

## Validation

Two plans, both explicit. One tests mechanics; one tests critique quality. They are not substitutes — both run.

### Plan 1: Mechanics smoke test (synthetic, scripted) — PR #2

Same approach as PR #1 (reviews-as-artifacts validation). Becomes the second permanent worked-example artifact.

- **Branch:** `test/red-team-iteration-validation` off master.
- **Content:** a throwaway spec at `shell/docs/specs/test-red-team-validation.md` — deliberately trivial (one paragraph: "test artifact for red-team mechanics validation, will be deleted with the branch"). We do not care what red-team would actually say about it.
- **PR:** opened with the new spec-PR template; controller auto-dispatches red-team on PR open.
- **Scripted dispatches:** the dispatched red-team subagent receives a SCRIPTED verdict + body in its prompt (just like PR #1's reviewers). Body has the four expected sections, each saying "Nothing flagged" plus a sentinel string for section-parsing verification.
- **Followup + re-review:**
  - A scripted `Code-review-followup: …` commit (a small spec edit).
  - Re-review dispatch with a scripted `--comment` body; header includes `(re-review of <SHA>)`.
- **Verifications** (from controller side via `gh pr view --json reviews,reviewDecision`):
  - Both reviews appear under `gcscode-reviewer` author (login form; bot suffix renders in UI only — confirmed in PR #1).
  - Initial-review header matches `## Red-team review — spec — Claude Opus 4.7`.
  - Re-review header includes `(re-review of <SHA>)`.
  - Both reviews are present in the PR timeline (re-review does not dismiss the prior review).
  - `reviewDecision` stays empty throughout (advisory `--comment` does not gate).
  - The spec-PR template renders correctly with all required sections.
- **Disposition:** kept open in draft state as a permanent reference artifact, NOT merged. A PR-level comment from the user identity explains the disposition + findings. Branch stays; test spec stays. Mirrors PR #1's final disposition.

### Plan 2: Critique quality (live, real artifact)

Runs on the first genuine spec PR after this iteration ships. Tests what red-team actually produces in real critique.

**Pass criteria — Plan 2 requires BOTH (a) and (b):**

**(a) Mechanical compliance.**

- Red-team posts under `gcscode-reviewer[bot]`.
- Header matches the convention.
- Verdict is `--comment` (advisory only in v1).
- Review body has all four sections (silent omissions fail — explicit "Nothing flagged" required where there are no findings).
- The Drift section's `Checked against:` enumeration is present AND concrete (specific section names / specific ADR slugs / specific spec filenames — not bare `CLAUDE.md`).

**(b) User judgment — the critique reflects engagement with the artifact, not engagement-theater.**

A review that posts the mechanically-compliant structure but says "Nothing flagged" across every section fails (b) by default — UNLESS the artifact is genuinely so trivial that nothing of substance could be flagged, AND the `Checked against:` enumeration is rich enough to verify the reviewer actually read the priors. The user is the judge of (b); there is no algorithmic check.

**Tripwire for ADR-PRs specifically.** If `N` consecutive ADR-PRs return all-silent red-team reviews (no premises challenged, no drift, no open questions), consider pulling `ADR-PR` from red-team's `targets` registry field. This directly addresses the known unknown about ADRs being too short for red-team to chew on. `N ≥ 3` is a reasonable initial threshold; tune in practice. The tripwire is a manual review item, not an automated check.

**Failure response:** if the prompt produces sprawling / unfocused / over-cautious / silent output → refine `.claude/reviewer-prompts/red-team.md` in a followup commit. Treat the prompt as iteratively tunable, not locked.

## VS Code alignment

This iteration has **no VS Code alignment implications**. Red-team, the reviewer-role registry, and the spec/ADR-PR workflow are gcscode-specific agentic-team mechanisms. VS Code has no analogous review-by-bot mechanism for spec/ADR artifacts. Future expert/domain reviewers similarly have no VS Code analogue.

Propagation to `shell/docs/vs-code-alignment.md`: **none**. The ledger is structured per-concern (Concern / VS Code / gcscode / Source / Trigger), not per-iteration, and this iteration introduces no extension-architecture concerns that map onto a VS Code feature. The Maintenance section of `vs-code-alignment.md` describes the row-addition triggers — none fire for this iteration.

## `docs/out-of-scope.md` propagation

Three cross-cutting deferrals (architectural-concept level) propagate to `shell/docs/out-of-scope.md`:

- **Plan-PR workflow.** Plans continue to land directly on master. Trigger to revisit: a plan-level reviewer is added.
- **Verdict promotion + override mechanism.** Bundled as one concept. Red-team's verdict is advisory only in v1; promotion to `--request-changes` and the matching override path for intentional drift are out of scope. Trigger: v2 brainstorm of the verdict-promotion iteration.
- **Reviewer routing layer.** Which reviewer roles fire on which PRs. Out of scope until a second non-baseline reviewer role exists. Trigger: a second non-baseline role is added (e.g., devil's advocate or first expert reviewer).

Per-iteration-only deferrals (stay in spec, do not propagate): multi-model red-team, branch protection enforcement.

## `docs/roadmap.md` propagation

Two new entries under "Considering":

- **Reviewer routing layer** — "which reviewer roles fire on which PRs" once there is more than one non-baseline role. Surfaced during this iteration's brainstorm.
- **Retroactive ADR for reviews-as-artifacts** — autonomous documentation-cleanup task; nice agentic-team use case. The original decision date is 2026-05-12 (when the spec landed); creation date deferred to housekeeping.

## Known unknowns

- Does the broad-character prompt produce focused or sprawling output? Only learned live.
- Will red-team actually read CLAUDE.md / prior specs / ADRs when checking consistency, or will it skim? The prompt says "read what you need" — depends on Opus following through.
- ADRs are short; does red-team have enough to chew on? Specs are richer artifacts; ADRs may yield fewer findings. Plan 2's tripwire ("`N` consecutive all-silent ADR reviews → consider pulling ADR-PR from red-team's `targets`") provides a detection mechanism for the worst case.
- Will the user engage with red-team's notes versus skim them? Advisory-only design lets this play out; the signal informs the v2 verdict-promotion decision.

## Future iterations

Each gets its own brainstorm when triggered.

1. **Devil's advocate as a separate agent.** New registry entry; new prompt template at `.claude/reviewer-prompts/devils-advocate.md`. Dispatched alongside red-team on spec/ADR PRs. Same single-bot identity, distinct header. This iteration is the first rehearsal of "add a sibling reviewer role" — important muscle for the future expert track.
2. **Verdict promotion (advisory → blocking).** Red-team can `--request-changes` on broken-premise issues. Designs the override path for intentional drift.
3. **Reviewer routing.** Once there is a second non-baseline role.
4. **Expert / domain / security reviewer track.** The broader follow-on; this iteration's registry is the substrate.
5. **Plan-PR workflow.** Triggered when a plan-level reviewer is added.
6. **Branch protection** enforcing spec/ADR-PR workflow.

Beyond these: see also future iterations in [`docs/specs/2026-05-12-reviews-as-artifacts.md`](2026-05-12-reviews-as-artifacts.md) (auto-merge, multi-model heterogeneous reviewers, Linear integration, distinct App identities per reviewer role, etc.).

## Origin

Brainstormed in the same session that completed the reviews-as-artifacts mechanics validation in PR #1 (2026-05-14). The brainstorm itself produced a meta-finding worth recording: the user initially scoped red-team as one agent doing three angles (premise + devil's advocate + consistency). Mid-brainstorm we surfaced that those are really three roles, with premise + consistency blending naturally and devil's advocate being genuinely separate. That bundling-into-one is exactly the kind of premise/structure issue a future domain-expert reviewer would catch — i.e., this iteration's brainstorm illustrated its own motivation. The constrained v1 (premise + consistency only, deferring devil's advocate to v2 as a separate agent) is the resulting scope.
