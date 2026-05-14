# Spec-quality reviewer

**Slug:** spec-quality-reviewer
**Iteration on the agentic-team track:** fourth, after [`docs/specs/2026-05-12-reviews-as-artifacts.md`](2026-05-12-reviews-as-artifacts.md), [`docs/specs/2026-05-14-red-team-reviewer.md`](2026-05-14-red-team-reviewer.md), and [`docs/specs/2026-05-14-reviewer-role-design-conventions.md`](2026-05-14-reviewer-role-design-conventions.md).
**Type:** new reviewer role; dogfoods the reviewer-role design conventions.
**No bootstrap exceptions.** Spec ships via spec-PR workflow; implementation lands per the post-merge implementation conventions just established.

## Context

The reviewer-role registry currently has four roles. Three of them (Spec-compliance, Code-quality, Final cross-cutting) target `feature-PR` exclusively — they review **code** during implementation, with the spec as the reference document. The fourth, Red-team, is the first and only reviewer that reviews **specs/ADRs themselves**; its `targets` is `spec-PR, ADR-PR`.

The asymmetry: feature-PRs get three reviewers covering implementation-matches-spec, code-quality, and cross-cutting concerns. Spec/ADR-PRs get one reviewer (red-team) with a specific mandate (premise challenger + consistency reviewer). The spec/ADR class has no equivalent of code-quality — no reviewer that checks the **document itself** for structural integrity.

PR #4 (the reviewer-role-design-conventions spec, the first non-synthetic spec-PR) made this concrete: red-team did substantial premise + drift work, but the user observed that "we now not really a 'superset' on superpowers, but have replaced a part of the workflow" — the implicit gap is that spec PRs receive less reviewer attention than feature PRs, and what's missing is the analog of code-quality.

This iteration adds **Spec-quality** as the prose-analog of code-quality: reviews specs/ADRs as documents (structure, internal consistency, cross-reference correctness, convention adherence), distinct from red-team's premise-and-drift mandate.

## Why not the bigger version

The bigger version would also add a "final spec-cross-cutting" reviewer with `--approve` power to gate merge on spec/ADR PRs (analog to final cross-cutting on feature PRs). That introduces approval-by-bot for specs, which is a separate architectural decision worth its own brainstorm. This iteration ships just the structural-quality reviewer; the approval-gating question is deferred.

The bigger-bigger version would extend the existing superpowers reviewer targets to include spec/ADR PRs (so spec-compliance, code-quality, final cross-cutting ALSO fire on specs). That doesn't work because the existing prompts are code-specific — applying them to prose would produce confusing output. Adding a new prose-specific role is the right shape.

## Goals

1. Add **Spec-quality** as a new reviewer role to the registry, targeting spec-PRs and ADR-PRs.
2. Define a mandate distinct from red-team: review the **document itself** (structure, internal consistency, cross-references, convention adherence) rather than challenging premises.
3. Dogfood the reviewer-role design conventions established by the previous iteration: audit trail, mechanical/judgment validation split, identity field, tripwires.
4. Keep verdict consistent with red-team v1: advisory `--comment` only.

## Non-goals (this iteration)

Each has its own future trigger.

- **Final spec-cross-cutting reviewer with `--approve` power.** No reviewer on spec/ADR PRs can gate merge by verdict alone in v1; user approval + merge is the only gate. Trigger: a future iteration that designs approval-by-bot for specs (likely bundled with the verdict-promotion iteration for red-team + spec-quality together).
- **Verdict promotion (`--request-changes`).** Spec-quality is advisory `--comment` only in v1, matching red-team. Trigger: same as red-team's planned verdict-promotion iteration; the two roles' verdict promotion happens together.
- **Retroactively running spec-quality on already-merged specs.** No value; the goal is to catch issues before merge. Already-merged specs are immutable.
- **Spec-quality checking the design conventions on role-adding specs.** The red-team-reviewer spec listed this as a future iteration (red-team enforcing patterns when a spec adds a new role). Spec-quality could naturally take that role, but adding it would expand mandate beyond document-quality. Trigger: first new-reviewer-role iteration after this one ships.
- **Extending superpowers baseline reviewer targets to include spec/ADR-PRs.** The existing prompts are code-specific; reframing them for prose is out of scope. The roadmap "Considering" entry for "Superpowers baseline reviewers on spec/ADR PRs" remains a separate open question (probably resolved by saying "we built the spec-PR-appropriate analog instead").

## Architecture

One new reviewer role in the registry; small CLAUDE.md updates; one new prompt template file. No ADR (the registry pattern itself doesn't change; this is adding a row).

### Registry entry

| Field              | Value                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------- |
| `name`             | Spec-quality                                                                           |
| `kind`             | per-artifact                                                                           |
| `identity`         | `gcscode-reviewer[bot]`                                                                |
| `model`            | Claude Sonnet 4.6                                                                      |
| `targets`          | spec-PR, ADR-PR                                                                        |
| `trigger`          | Automatic on PR open                                                                   |
| `verdicts`         | `--comment` only (v1)                                                                  |
| `character`        | Document structure + internal consistency + cross-reference + convention adherence     |
| `header`           | `## Spec-quality review — <spec or ADR> — Claude Sonnet 4.6`                           |
| `re-review header` | `## Spec-quality review — <spec or ADR> (re-review of <SHA>) — Claude Sonnet 4.6`      |
| `prompt template`  | `.claude/reviewer-prompts/spec-quality.md`                                             |

### Mandate (distinct from red-team)

Red-team challenges **premises** (is what this spec assumes true? does it drift from prior decisions?). Spec-quality reviews **the spec as a document**:

1. **Structure** — does the spec have its expected sections (Context, Why-not-bigger, Goals, Non-goals, Architecture, Validation, etc. per gcscode's spec template)? Are any sections empty, missing, or thin in a way that suggests something was punted?
2. **Internal consistency** — do Goals contradict Non-goals? Does Architecture cover everything Goals require? Are introduced terms defined? Does the narrative flow without contradicting itself?
3. **Cross-references** — referenced specs, ADRs, and files exist? Markdown links resolve? Any `[[wikilink]]`-style references pointing at things public-repo readers can't resolve (the bug PR #4 surfaced)?
4. **Convention adherence** — spec follows project conventions per CLAUDE.md "Conventions" section + structural patterns from prior specs (Origin sections, Future iterations sections, propagation sections for out-of-scope/roadmap)?

What spec-quality is **not**:

- Not premise-challenging — that's red-team.
- Not drift-checking against prior decisions — red-team's mandate.
- Not surfacing open questions — red-team's mandate.
- Not adversarial — engagement is "is the document sound?" not "is the argument right?".

### Prompt template at `.claude/reviewer-prompts/spec-quality.md`

Mirrors red-team's template structure (substitutions block, role framing, tone, how-to-post, header, output structure, return-to-controller) but with mandate adapted. Key sections:

**Role framing:**

> You are the spec-quality reviewer for a `{{ARTIFACT_KIND}}` PR (#{{PR_NUMBER}}) in the gcscode repo. Your job is to review the spec **as a document** — its structure, internal consistency, cross-references, and adherence to gcscode's spec conventions. You are NOT the premise challenger; that's red-team's role. Stay in document-quality territory.

**Tone:**

Same character notes as red-team's prompt: verbosity within a finding is fine; verbosity by expanding scope outside the four sections is not. Politeness not a virtue; under-critical is the only way to fail. Be specific; cite line numbers.

**Output structure:**

- **Structure** — section-by-section check; opens with a `Checked against:` line enumerating the section names you verified (e.g., `Checked against: Context, Why-not-bigger, Goals, Non-goals, Architecture, Validation, Future iterations`). Required even when no issues — without the enumeration, "nothing flagged" is indistinguishable from "didn't read the structure."
- **Internal consistency** — contradictions, undefined terms, narrative flow. Includes a `Cross-checked:` line listing the section-pairs you compared (e.g., `Cross-checked: Goals × Non-goals, Architecture × Goals`).
- **Cross-references** — link/wikilink/sibling-spec resolution. Includes a `Checked against:` line listing the referenced documents you tried to resolve.
- **Conventions** — adherence to project conventions. Includes a `Checked against:` line listing which conventions/templates you compared against (e.g., `CLAUDE.md "Conventions" > Specs bullet, prior spec template from docs/specs/2026-05-12-reviews-as-artifacts.md`).
- **Summary** — one paragraph; overall document quality (strong / has-gaps / fundamentally-suspect-as-document).

Every section: explicit "Nothing flagged" with justification rather than silent omission.

**Tripwire:** if N consecutive spec/ADR PRs return all-silent spec-quality reviews, consider whether the mandate is too narrow OR whether gcscode's spec template is so prescriptive that there's no room for spec-quality findings. N≥3 is a reasonable initial threshold.

### CLAUDE.md changes

Per the design conventions just shipped:

1. **Registry table:** add Spec-quality row (5th row).
2. **Verdict-permissions table:** add Spec-quality row (`✓` / `✗` / `✗`).
3. **Header convention examples:** add three Spec-quality examples (spec form, ADR form, re-review form).
4. **Red-team auto-dispatch paragraph:** rename to "Auto-dispatch on spec/ADR PRs" and update to mention BOTH red-team and spec-quality fire automatically on PR open. They dispatch in parallel — neither blocks the other; both post independent reviews.
5. **Auto-dispatch controller obligations checklist** (in "Reviewer-role design conventions" subsection): update the bullets to reference BOTH roles. Bullet text becomes "dispatch BOTH red-team AND spec-quality immediately after `gh pr create`."

No new ADR — registry pattern is unchanged. No new file beyond `.claude/reviewer-prompts/spec-quality.md`.

### Auto-dispatch ordering

Red-team and spec-quality both have `trigger: Automatic on PR open`. The controller dispatches both immediately after `gh pr create`. They run **in parallel as separate subagent dispatches** — neither blocks the other; each posts its own review independently.

If the controller dispatches both subagents simultaneously, there's a token-collision risk (both subagents call `.claude/scripts/gh-app-token` close together; the helper produces fresh JWTs per invocation, so this is fine). Each subagent re-fetches the token for each `gh` call, per the existing convention.

Re-review on `Code-review-followup:` commit re-dispatches BOTH roles — same parallel pattern. The re-review header for each role includes `(re-review of <SHA>)` per the existing convention.

## Data flow — how this iteration ships

1. Brainstorm → spec → spec-PR. This is the second iteration shipping via the spec-PR workflow.
2. **On PR open: red-team auto-dispatches** (spec-quality doesn't exist yet — it's what this PR introduces, so it can't review its own introduction). Partial-first-dispatch is expected.
3. User reads red-team's review + approves. If red-team flags anything substantive, controller does Code-review-followup commit and re-dispatches red-team.
4. User merges via `gh pr merge --merge`.
5. Post-merge implementation: per the post-merge implementation convention, direct-master commits since this spec specifies verbatim text. Two logical commits:
   - **Commit 1:** new file `.claude/reviewer-prompts/spec-quality.md` (verbatim content from this spec).
   - **Commit 2:** CLAUDE.md edits (registry row + verdict table row + header examples + renamed auto-dispatch paragraph + updated checklist) — verbatim text in this spec.

## Validation

Two plans, both light.

### Plan 1: Mechanics smoke test (PR #5)

Same shape as PR #3 (red-team mechanics smoke test). Becomes the third permanent reference artifact PR.

- **Branch:** `test/spec-quality-iteration-validation` off master (post-merge).
- **Content:** throwaway spec at `shell/docs/specs/test-spec-quality-validation.md` — deliberately trivial.
- **PR opened with the spec/ADR-PR template.** Controller auto-dispatches BOTH red-team AND spec-quality (now that spec-quality exists).
- **Scripted dispatches** for both roles. Verify:
  - Both reviews post under `gcscode-reviewer[bot]`.
  - Headers match the conventions (red-team form + spec-quality form).
  - Both reviews appear independently in the PR timeline.
  - `reviewDecision` stays empty throughout (both advisory).
  - Re-review pattern works for both roles.
- **Disposition:** kept open in draft state as permanent reference artifact (same as PR #1, PR #3). NOT merged.

### Plan 2: Critique quality (live, real artifact)

Next genuine spec/ADR PR after this iteration ships exercises spec-quality's organic critique alongside red-team's. Pass criteria from the design conventions apply:

- (a) Mechanical compliance — headers correct, sections present, `Checked against:` / `Cross-checked:` lines populated with concrete anchors.
- (b) User judgment — spec-quality's critique reflects engagement with the document, not engagement-theater. The two reviewers (red-team + spec-quality) should produce **distinct findings** — substantial overlap between them suggests one role's mandate is poorly scoped.

**Failure response:** if spec-quality and red-team consistently produce overlapping findings, refine spec-quality's prompt template to sharpen the document-quality / premise-challenge boundary. If spec-quality produces sprawling output or empty silence, follow the existing failure-response pattern (refine the prompt template in a followup).

## VS Code alignment

No VS Code alignment implications. Spec-quality is a gcscode-specific agentic-team mechanism; VS Code has no analogous spec-review-by-bot.

Propagation to `shell/docs/vs-code-alignment.md`: none (ledger is per-concern, not per-iteration; this iteration introduces no extension-architecture concerns).

## `docs/out-of-scope.md` propagation

One cross-cutting deferral propagates:

- **Final spec-cross-cutting reviewer with `--approve` power.** No reviewer on spec/ADR PRs has approval-gating authority in v1. User approval + merge is the gate. Trigger: future iteration that designs approval-by-bot for specs (likely bundled with red-team + spec-quality verdict-promotion iteration).

Per-iteration-only deferrals (stay in spec, do not propagate): retroactive scans of already-merged specs.

## `docs/roadmap.md` propagation

Two updates:

1. **Flip the "Superpowers baseline reviewers on spec/ADR PRs?" Considering entry to resolved** — the resolution is "we built the spec-PR-appropriate analog (spec-quality) instead of extending the code-specific superpowers reviewers to specs." Note this in the entry rather than removing it, so the question's history is legible.
2. **Add Spec-quality to "Shipped"** when this iteration merges.

## Known unknowns

- **Will spec-quality's critique meaningfully overlap with red-team's?** Both touch internal consistency / cross-references in different ways. The boundary (spec-quality: as document; red-team: as argument) is sharp on paper but might be soft in practice.
- **Will the project's spec template prove too prescriptive for spec-quality to find anything?** Specs already follow a strong template (Context, Goals, Non-goals, Architecture, etc.). If specs reliably conform, spec-quality may have little to flag. The tripwire ("N consecutive all-silent reviews") detects this case.
- **Token-helper collision under parallel dispatch.** Red-team + spec-quality fire simultaneously after PR open; both call `gh-app-token`. Each invocation generates a fresh JWT, so this should be fine. First parallel dispatch will validate empirically.

## Future iterations

Each gets its own brainstorm when triggered.

1. **Verdict promotion for red-team AND spec-quality (bundled).** Both advisory in v1; both promote to `--request-changes` capability together with shared override-path design. Same as the red-team-reviewer spec's planned verdict promotion, expanded to cover both.
2. **Final spec-cross-cutting reviewer with `--approve` power.** Approval-gating authority on spec/ADR PRs. Bundles with verdict-promotion above.
3. **Spec-quality enforces design conventions on role-adding specs.** When a future iteration adds a new reviewer role (e.g., domain expert), spec-quality's prompt could include a directive: "if this spec adds a new reviewer role, verify the four design patterns are present." Alternative to red-team taking that role (see red-team-reviewer spec's Future iteration #2).
4. **Devil's advocate v2** (already on roadmap). Will be the third per-artifact reviewer on spec/ADR PRs; the auto-dispatch checklist grows another bullet.
5. **Extending superpowers baseline reviewer targets.** Currently no plans to extend; this iteration's spec-quality is the prose-PR-appropriate analog. Trigger to revisit: an iteration where spec-quality's mandate proves too narrow and we want to bring in code-quality-style prose review (unlikely; same role, more overhead).

## Origin

Surfaced during a post-PR-#4 conversation (2026-05-14). The user observed that PR #4 had only red-team reviewing, not the superpowers baseline reviewers, and asked to discuss the architecture. The conversation clarified that superpowers baseline reviewers are code-specific (review implementations, not specs), and that spec/ADR PRs accordingly had only red-team — a real asymmetry vs feature PRs. This iteration's response: add the spec-PR-appropriate analog of code-quality, rather than extending code-specific reviewers to specs.

This is also the **first iteration that fully exercises the reviewer-role design conventions** shipped by the previous iteration: it's the first role added under the conventions and the first chance to dogfood the patterns (audit trail, mechanical/judgment split, identity field, tripwires).
