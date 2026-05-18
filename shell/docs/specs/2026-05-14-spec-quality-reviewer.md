# Spec-quality reviewer

**Slug:** spec-quality-reviewer
**Iteration on the agentic-team track:** fourth, after [`docs/specs/2026-05-12-reviews-as-artifacts.md`](2026-05-12-reviews-as-artifacts.md), [`docs/specs/2026-05-14-red-team-reviewer.md`](2026-05-14-red-team-reviewer.md), and [`docs/specs/2026-05-14-reviewer-role-design-conventions.md`](2026-05-14-reviewer-role-design-conventions.md).
**Type:** new reviewer role; dogfoods the reviewer-role design conventions.
**No bootstrap exceptions.** Spec ships via spec-PR workflow; implementation lands per the post-merge implementation conventions just established.

## Context

The reviewer-role registry currently has four roles. Three of them (Spec-compliance, Code-quality, Final cross-cutting) target `feature-PR` exclusively — they review **code** during implementation, with the spec as the reference document. The fourth, Red-team, is the first and only reviewer that reviews **specs/ADRs themselves**; its `targets` is `spec-PR, ADR-PR`.

The architectural observation: feature-PRs get three reviewers covering distinct mandates (implementation-matches-spec, code-quality, cross-cutting concerns). Spec/ADR-PRs get one reviewer (red-team) with a focused mandate (premise challenger + consistency reviewer). The two PR classes have asymmetric review shape — not because spec/ADR PRs have a coverage gap red-team is failing to catch (red-team's coverage on PR #4 was substantive), but because **architectural symmetry between PR classes is itself worth dogfooding**: it surfaces what reviewer-role decompositions actually mean.

This iteration adds **Spec-quality** as a narrow-mandate reviewer for spec/ADR PRs, sitting alongside red-team. Its mandate is **document-internal** — structure, within-document consistency, link mechanics — and explicitly **excludes** anything red-team already covers (consistency with priors, premise challenging, drift detection). The narrowing is the load-bearing design choice; without it, two reviewers reading the same artifact with overlapping prompts would produce overlapping findings and dilute the value of either.

A genuine architectural tension worth surfacing: roughly half of the narrowed mandate (structure + link mechanics) is mechanically checkable — a linter could do it cheaper, faster, more reliably than an LLM. The within-document consistency piece needs LLM judgment. Shipping an LLM-only spec-quality means overspending on the mechanical half. That's accepted for v1 (the substrate for LLM reviewers is ready; a script-based linter is a new architectural shape needing its own iteration). The "extract mechanical checks to a script" iteration is queued as future work.

PR #5 (this PR) red-team review demonstrated that adding a reviewer role can be done thoughtfully even when red-team itself challenges the addition: the iteration's spec went through substantial narrowing in response to red-team's mandate-overlap critique. The narrowed form is what survives.

## Why not the bigger version

The bigger version (initially proposed) had spec-quality checking **all** of: structure, internal consistency, cross-references with priors, AND convention adherence vs CLAUDE.md / prior specs. Red-team's review of this spec surfaced that cross-references-with-priors and convention-adherence-vs-elsewhere are red-team's existing mandate — two reviewers checking the same priors against the same artifact produces overlap. The narrowed version (this spec, post-followup) cuts those concerns: spec-quality is **document-internal** only.

A bigger-bigger version would also add a "final spec-cross-cutting" reviewer with `--approve` power to gate merge on spec/ADR PRs (analog to final cross-cutting on feature PRs). That introduces approval-by-bot for specs, which is a separate architectural decision worth its own brainstorm. Deferred.

A bigger-bigger-bigger version would extend the existing superpowers reviewer targets to include spec/ADR PRs. Doesn't work because the existing prompts are code-specific. Spec-quality is the spec-PR-appropriate analog, not a retargeted code reviewer.

## Goals

1. Add **Spec-quality** as a new reviewer role to the registry, targeting spec-PRs and ADR-PRs, with a **narrowed document-internal mandate** that does not overlap with red-team.
2. The mandate covers exactly three concerns: (i) **structure** (sections present, non-empty, in expected order); (ii) **within-document consistency** (Goals vs Non-goals contradictions; undefined terms; narrative flow); (iii) **link mechanics** (broken links, unresolvable wikilinks).
3. Dogfood the reviewer-role design conventions established by the previous iteration: audit trail, mechanical/judgment validation split, identity field, tripwires.
4. Keep verdict consistent with red-team v1: advisory `--comment` only.

## Non-goals (this iteration)

Each has its own future trigger.

- **Cross-references / convention adherence vs priors.** Spec-quality does NOT check consistency with CLAUDE.md, prior specs, ADRs, roadmap, or out-of-scope. That mandate is red-team's. Trigger to revisit: if red-team's coverage of priors-consistency proves insufficient on a future iteration (no current evidence of this).
- **Premise challenging.** Red-team's mandate. Spec-quality stays out.
- **Final spec-cross-cutting reviewer with `--approve` power.** No reviewer on spec/ADR PRs has approval-gating authority in v1; user approval + merge is the gate. Trigger: future iteration designing approval-by-bot for specs.
- **Verdict promotion (`--request-changes`).** Spec-quality is advisory `--comment` only in v1. Some of spec-quality's findings (missing required section, broken link) are mechanically unambiguous and would support blocking verdicts without the override-path complexity red-team faces. Bundling spec-quality's verdict promotion with red-team's is a v1 choice: introducing `--request-changes` on spec/ADR PRs at all is the architectural question, and a uniform advisory-only v1 across both roles is cleaner UX while that question waits. Trigger: bundled with red-team's verdict-promotion iteration.
- **Spec-quality enforcing design conventions on role-adding specs.** The reviewer-role-design-conventions spec assigned this future role to **red-team** (its Future iteration #2). This iteration confirms that assignment — red-team owns pattern-enforcement on role-adding specs, not spec-quality. Surfaced empirically: red-team's review of this very spec ran the test "does organic critique surface pattern-misalignment naturally?" — answer was yes, no explicit directive needed.
- **Retroactively running spec-quality on already-merged specs.** No value; the goal is to catch issues before merge.
- **Script-based linter for mechanical checks.** ~Half of spec-quality's narrowed mandate (structure + link mechanics) is algorithmically checkable. v1 ships an LLM-only spec-quality; extracting the mechanical checks to a script is a queued future iteration that splits the role: script handles structure + link mechanics, smaller LLM reviewer handles within-document consistency only.
- **Extending superpowers baseline reviewer targets to include spec/ADR PRs.** Existing prompts are code-specific; reframing them for prose is out of scope. Spec-quality replaces this option.

## Architecture

One new reviewer role in the registry; small CLAUDE.md updates; one new prompt template file with verbatim content specified in this spec (per the post-merge implementation convention). No ADR (the registry pattern itself doesn't change; this is adding a row).

### Registry entry

| Field              | Value                                                                             |
| ------------------ | --------------------------------------------------------------------------------- |
| `name`             | Spec-quality                                                                      |
| `kind`             | per-artifact                                                                      |
| `identity`         | `gcscode-reviewer[bot]`                                                           |
| `model`            | Claude Sonnet 4.6                                                                 |
| `targets`          | spec-PR, ADR-PR                                                                   |
| `trigger`          | Automatic on PR open                                                              |
| `verdicts`         | `--comment` only (v1)                                                             |
| `character`        | Document structure + within-document consistency + link mechanics                 |
| `header`           | `## Spec-quality review — <spec or ADR> — Claude Sonnet 4.6`                      |
| `re-review header` | `## Spec-quality review — <spec or ADR> (re-review of <SHA>) — Claude Sonnet 4.6` |
| `prompt template`  | `.claude/reviewer-prompts/spec-quality.md`                                        |

### Mandate — surgically narrow

Red-team challenges **premises** AND checks **consistency against priors** (CLAUDE.md, prior specs, ADRs, roadmap, out-of-scope). Spec-quality reviews the spec **as a document, in isolation**:

1. **Structure** — does the spec have its expected sections per gcscode's spec template (Context, Why-not-bigger, Goals, Non-goals, Architecture, Validation, Future iterations, Origin)? Are any sections empty, missing, or thin in a way that suggests something was punted? Mechanically checkable in principle.

2. **Within-document consistency** — do Goals contradict Non-goals? Does Architecture cover everything Goals require? Are introduced terms defined within the document? Does the narrative flow without contradicting itself? **Requires LLM judgment**; not mechanically checkable.

3. **Link mechanics** — markdown links resolve to existing files in the repo? Wikilinks (`[[name]]`) point at things public readers can resolve (i.e., NOT private agent memory)? Mechanically checkable in principle.

What spec-quality is **NOT** (these belong to red-team; spec-quality MUST stay out):

- Not consistency-with-priors. Red-team checks drift from CLAUDE.md / prior specs / ADRs. Spec-quality does not.
- Not premise-challenging. Red-team's mandate.
- Not surfacing open questions about the artifact's correctness. Red-team's mandate.
- Not adversarial — the character is "is this document sound on its own?" not "is the argument right?".

### Prompt template at `.claude/reviewer-prompts/spec-quality.md` (verbatim)

The post-merge implementation convention requires "spec specifies verbatim text" for direct-master commits. The full prompt template content is specified here:

````md
# Spec-quality reviewer prompt template

This file defines the **review behavior** for the spec-quality reviewer role on gcscode spec-PRs and ADR-PRs. The controller dispatching a spec-quality subagent passes this content (with placeholders substituted) as part of the subagent's prompt. Layer 1 plumbing (token helper, PR posting requirement, header convention quick reference) is documented separately in `shell/CLAUDE.md` under "Subagent reviewer PR-posting discipline" and in the Reviewer-role registry.

## Dispatch substitutions

The controller substitutes:

- `{{ARTIFACT_KIND}}` — `spec` or `ADR` (the kind of artifact the PR contains).
- `{{PR_NUMBER}}` — the GitHub PR number to post on.
- `{{REREVIEW_OF_SHA}}` — **re-reviews only**, the SHA of the followup commit that prompted the re-review. The controller substitutes this placeholder with the SHA for re-reviews; **for initial reviews the controller does not substitute it at all**, and the prompt body uses the initial-review header form below (which does not reference `{{REREVIEW_OF_SHA}}`). If a substitution renders `(re-review of )` with empty parens, that is a controller bug — fix the controller's dispatch, not the prompt template.

## Dispatch prompt body

The controller passes everything below this line (with the substitutions above applied) as the subagent's prompt.

---

You are the spec-quality reviewer for a `{{ARTIFACT_KIND}}` PR (#{{PR_NUMBER}}) in the gcscode repo.

## Your role

You review the `{{ARTIFACT_KIND}}` **as a document, in isolation**. Three concerns, all document-internal:

**1. Structure.** Does the `{{ARTIFACT_KIND}}` have its expected sections per gcscode's spec template (Context, Why-not-bigger, Goals, Non-goals, Architecture, Validation, Future iterations, Origin — exact set depends on `{{ARTIFACT_KIND}}`)? Are any sections empty, missing, or thin in a way that suggests something was punted?

**2. Within-document consistency.** Do Goals contradict Non-goals? Does Architecture cover everything Goals require? Are introduced terms defined within the document? Does the narrative flow without contradicting itself? This is the half of your mandate that needs your judgment — the rest is mechanical.

**3. Link mechanics.** Do markdown links resolve to existing files in the repo? Do wikilinks (`[[name]]`) point at things public readers can resolve? gcscode is a public repo; references to private agent memory (e.g., `[[project-shell-nesting-legacy]]`) are unresolvable to world-readable audiences and should be flagged.

**Explicitly OUT OF SCOPE for you (these are red-team's mandate):**

- Consistency with priors (drift from CLAUDE.md, prior specs, ADRs, roadmap, out-of-scope). Red-team checks this; you do not. If you notice something that looks like drift, note it in your Summary as "this looks like red-team territory" rather than flagging it as a finding.
- Premise challenging ("is this assumption true?"). Red-team's mandate.
- Surfacing open questions about the artifact's correctness. Red-team's mandate.
- Adversarial critique. Your character is "is this document sound on its own?" — not "is the argument right?".

The boundary between you and red-team is sharp and important. If you find yourself wanting to check the artifact against CLAUDE.md or prior specs, STOP — that's red-team's job. Read only the artifact itself; the repo structure for verifying link mechanics is the only repo-reading you do.

## Tone

- **Verbosity WITHIN a finding** — depth, specificity, citations — is not a failure mode. Be thorough on what you raise.
- **Verbosity by EXPANDING SCOPE** outside the four output sections (structure / consistency / links / summary) IS a failure mode. Stay inside the sections.
- **Politeness is not a virtue.** Under-critical is the only way to fail.
- **Be specific.** Quote the artifact. Cite line numbers when they exist. For broken links, cite the source line and the target path.
- If you have nothing of substance to flag, say so explicitly — but only after you have genuinely looked.
- **Not adversarial for sport.** Thorough, not hostile.

## What you have access to

You have read access to the repo, but you should read only:

- The PR diff (the artifact under review) — this is your primary input.
- Repo file paths referenced by markdown links in the artifact — only to verify the link resolves (file exists), not to check the content.
- No CLAUDE.md, prior specs, ADRs, roadmap, or out-of-scope. Reading those is red-team's mandate.

## How to post

Post your review to PR #{{PR_NUMBER}} using:

```bash
GH_TOKEN=$(.claude/scripts/gh-app-token) gh pr review {{PR_NUMBER}} --comment --body "$(cat <<'EOF'
<your review body here, starting with the header below>
EOF
)"
```

Re-fetch the token via the helper for each invocation; don't rely on environment persistence across bash calls.

**Verdict is `--comment` only** for spec-quality in v1, by design. Spec-quality is **advisory** at this stage — see [`docs/specs/2026-05-14-spec-quality-reviewer.md`](../../shell/docs/specs/2026-05-14-spec-quality-reviewer.md). Verdict promotion (`--request-changes` for objective findings like missing sections or broken links) is a planned future iteration bundled with red-team's verdict promotion. Until that ships, post `--comment` regardless of severity.

## Header

The review body must begin with the appropriate header.

- Initial review: `## Spec-quality review — {{ARTIFACT_KIND}} — Claude Sonnet 4.6`
- Re-review (only when `{{REREVIEW_OF_SHA}}` is provided): `## Spec-quality review — {{ARTIFACT_KIND}} (re-review of {{REREVIEW_OF_SHA}}) — Claude Sonnet 4.6`

The `{{REREVIEW_OF_SHA}}` value is the **followup commit that prompted the re-review** — i.e., the new commit added since the prior review.

## Output structure

The body has four sections, in order. **Include every section every time.** If a section has nothing of substance to report, write the section header followed by an explicit "Nothing flagged" with justification. Silence-without-justification is a failure mode.

### Section 1: Structure

Opens with a `Checked against:` line listing the sections the artifact has, in order (e.g., `Checked against sections present: Context, Goals, Non-goals, Architecture, Validation, Future iterations, Origin`). For each missing, empty, or suspiciously thin section: name it, note what's expected, suggest what's missing.

If nothing to flag:

```
### Structure

Checked against sections present: <enumerated list>

All expected sections present with substantive content.
```

The `Checked against:` enumeration is required even when nothing is flagged — without it, "structure looks good" is indistinguishable from "didn't look at the structure."

### Section 2: Within-document consistency

Opens with a `Cross-checked:` line listing the section-pairs (or section-sets) you compared (e.g., `Cross-checked: Goals × Non-goals, Architecture × Goals, terms defined-vs-used`). For each contradiction, undefined-term issue, or narrative-flow break: cite both sides, explain the inconsistency.

If nothing to flag:

```
### Within-document consistency

Cross-checked: <enumerated pairs/sets>

No contradictions, undefined terms, or flow-breaks identified.
```

### Section 3: Link mechanics

Opens with a `Tested:` line listing every link/reference you tried to resolve (e.g., `Tested: 7 markdown links to repo files; 0 wikilinks`). For each broken link or unresolvable wikilink: cite the source line, the target, and why it doesn't resolve.

If nothing to flag:

```
### Link mechanics

Tested: <count and form of references>

All links resolve. No private-memory wikilinks.
```

### Section 4: Summary

One paragraph. Your overall assessment: _strong_ / _has-gaps_ / _fundamentally-suspect-as-document_. Your honest read.

If you noticed something that looked like red-team territory (priors-consistency, premise issues), note it here as "this looks like red-team territory" — do not duplicate red-team's likely findings.

## Return to controller

After posting the review, return a brief summary to the controller. Under 150 words. Include:

- Whether the review posted successfully (yes/no + any error)
- Count of structure findings
- Count of consistency findings
- Count of link findings
- The verified `Checked against:` / `Cross-checked:` / `Tested:` lines you used (so the controller can confirm the audit trail is concrete)
- One-line overall assessment

Do not include the full review text in your return — it's already on the PR.
````

### CLAUDE.md changes

Per the post-merge implementation convention this spec inherits:

1. **Registry table:** add Spec-quality row (5th row).
2. **Verdict-permissions table:** add Spec-quality row (`✓` / `✗` / `✗`).
3. **Header convention examples:** add three Spec-quality examples (spec form, ADR form, re-review form).
4. **Red-team auto-dispatch paragraph:** rename to **"Auto-dispatch on spec/ADR PRs"** and update to describe BOTH red-team and spec-quality firing automatically on PR open. They dispatch in parallel — neither blocks the other; both post independent reviews.
5. **Auto-dispatch controller obligations checklist** (in "Reviewer-role design conventions" subsection): update bullets to reference BOTH roles. "Dispatch BOTH red-team AND spec-quality immediately after `gh pr create`."

The verbatim text for each CLAUDE.md edit is specified in the "Post-merge implementation" section below.

#### Naming-collision note

The CLAUDE.md edits create two adjacent constructs about auto-dispatch: the renamed paragraph "Auto-dispatch on spec/ADR PRs" (in "Subagent reviewer PR-posting discipline" subsection) and the "Auto-dispatch controller obligations" subsection (in "Reviewer-role design conventions" subsection). They serve different audiences: the paragraph is the rule (what happens when a PR opens); the checklist is the controller's action obligations. Keeping them separate per the registry-as-source-of-truth pattern (paragraph denormalizes the rule, checklist denormalizes the controller actions). A future consolidation iteration could collapse them — but only after a third reviewer role with auto-dispatch lands (devil's advocate v2), which would stress the duplication.

### Auto-dispatch ordering

Red-team and spec-quality both have `trigger: Automatic on PR open`. The controller dispatches both immediately after `gh pr create`. They run **in parallel as separate subagent dispatches** — neither blocks the other; each posts its own review independently.

Token-helper collision under parallel dispatch: each subagent calls `.claude/scripts/gh-app-token` independently; the helper produces a fresh JWT per invocation. The first parallel dispatch (mechanics smoke test) will validate empirically that this doesn't produce token-rate-limit issues. Expected to be fine.

Re-review on `Code-review-followup:` commit re-dispatches BOTH roles in parallel — same pattern. Each role's re-review header includes `(re-review of <SHA>)`.

**Parallel-vs-sequential design choice:** chose parallel because the two roles have non-overlapping mandates (post-narrowing); there's no information one role needs from the other before reviewing. Sequential dispatch would serialize unnecessarily. A future iteration could revisit if overlap is discovered in practice.

## Post-merge implementation

Per the post-merge implementation convention, the implementation lands as two direct-master commits. Both content blocks are fully specified verbatim in this spec.

**Commit 1: Create `.claude/reviewer-prompts/spec-quality.md`** with the content shown above (the entire fenced block under "Prompt template at `.claude/reviewer-prompts/spec-quality.md` (verbatim)").

**Commit 2: Five edits to `shell/CLAUDE.md`** specified verbatim:

(2a) Add Spec-quality row to the Reviewer-role registry table:

```
| Spec-quality               | per-artifact  | `gcscode-reviewer[bot]`   | Claude Sonnet 4.6 | spec-PR, ADR-PR     | Automatic on PR open              | `--comment` only (v1)                 | Document structure + within-document consistency + link mechanics | `## Spec-quality review — <spec or ADR> — Claude Sonnet 4.6`                    | `## Spec-quality review — <spec or ADR> (re-review of <SHA>) — Claude Sonnet 4.6`                      | `.claude/reviewer-prompts/spec-quality.md`        |
```

(2b) Add Spec-quality row to the verdict-permissions table:

```
| Spec-quality (per-artifact, spec/ADR-PRs) |      ✓      |          ✗          |      ✗      |
```

(2c) Add three Spec-quality header examples to the header-convention example list:

```
- `## Spec-quality review — spec — Claude Sonnet 4.6`
- `## Spec-quality review — ADR — Claude Sonnet 4.6`
- `## Spec-quality review — spec (re-review of def5678) — Claude Sonnet 4.6`
```

(2d) Rename the "Red-team auto-dispatch (spec/ADR PRs)" paragraph to **"Auto-dispatch on spec/ADR PRs"** and rewrite the body:

```
**Auto-dispatch on spec/ADR PRs.** When a `spec/<topic>` or `adr/<slug>` PR is opened, the controller automatically dispatches BOTH the red-team reviewer AND the spec-quality reviewer per their registry entries. The two roles dispatch in parallel as independent subagents — neither blocks the other; both post independent reviews. The dispatches use the same boilerplate (token helper, PR posting requirement) and each reads its own prompt template from `.claude/reviewer-prompts/`. Both roles' verdicts are `--comment` only in v1 (advisory). On a `Code-review-followup:` commit to the spec/ADR branch, the controller re-dispatches BOTH roles. Each re-review header includes `(re-review of <SHA>)` where `<SHA>` is the followup commit.
```

(2e) Update the "Auto-dispatch controller obligations" bullets in the "Reviewer-role design conventions" subsection. Replace the first two bullets:

```
- **Before opening a `spec/<topic>` or `adr/<slug>` PR:** plan to dispatch BOTH the red-team subagent AND the spec-quality subagent immediately after `gh pr create`. They dispatch in parallel (independent subagents). Do not consider the PR-open step complete until both have posted their reviews.
- **After every `Code-review-followup:` commit on a spec/ADR branch:** re-dispatch BOTH red-team AND spec-quality (in parallel). Each role's re-review header includes `(re-review of <SHA>)` where `<SHA>` is the followup commit (existing convention). Note: a followup that does not touch content either reviewer commented on will still trigger both re-dispatches. v1 accepts the duplicative-review cost; if the pattern produces material noise, a future iteration can condition the obligation on whether the followup touches reviewed content for each role.
```

## Validation

Two plans, both light.

### Plan 1: Mechanics smoke test (a future test-branch PR; not this PR)

Same shape as PR #3 (red-team mechanics smoke test). Will become the third permanent reference artifact PR (PR #1 = reviews-as-artifacts mechanics; PR #3 = red-team mechanics; the smoke test PR for this iteration = both-reviewers-firing-in-parallel mechanics).

- **Branch:** `test/spec-quality-iteration-validation` off master (post-merge of this spec).
- **Content:** throwaway spec at `shell/docs/specs/test-spec-quality-validation.md` — deliberately trivial.
- **PR opened with the spec/ADR-PR template.** Controller auto-dispatches BOTH red-team AND spec-quality in parallel.
- **Scripted dispatches** for both roles. Verify:
  - Both reviews post under `gcscode-reviewer[bot]`.
  - Headers match the conventions (red-team form + spec-quality form).
  - Both reviews appear independently in the PR timeline.
  - `reviewDecision` stays empty throughout (both advisory).
  - Re-review pattern works for both roles in parallel.
  - No token-helper collision issues under parallel dispatch.
- **Disposition:** kept open in draft state as permanent reference artifact. NOT merged.

### Plan 2: Critique quality (live, real artifact)

Next genuine spec/ADR PR after this iteration ships exercises spec-quality's organic critique alongside red-team's. Pass criteria from the reviewer-role design conventions apply:

- (a) Mechanical compliance — headers correct, sections present, `Checked against:` / `Cross-checked:` / `Tested:` lines populated with concrete enumerations.
- (b) User judgment — spec-quality's critique reflects engagement with the document, **and the two reviewers produce distinct findings** with minimal overlap. Substantial overlap between red-team and spec-quality on the same spec is the signal that the mandate boundary is soft in practice.

**Failure response (overlap):** if spec-quality and red-team consistently produce overlapping findings on real spec PRs, refine spec-quality's prompt template to sharpen the document-internal-only boundary. The prompt as written includes explicit "OUT OF SCOPE for you" instructions; if those aren't enough, the next refinement step is to remove spec-quality's access to anything beyond the PR diff (it currently reads repo file paths to verify link mechanics; that could be pulled).

## VS Code alignment

No VS Code alignment implications. Spec-quality is a gcscode-specific agentic-team mechanism; VS Code has no analogous spec-review-by-bot.

Propagation to `shell/docs/vs-code-alignment.md`: none (ledger is per-concern, not per-iteration; this iteration introduces no extension-architecture concerns).

## `docs/out-of-scope.md` propagation

Two cross-cutting deferrals propagate:

- **Final spec-cross-cutting reviewer with `--approve` power.** No reviewer on spec/ADR PRs has approval-gating authority in v1. User approval + merge is the gate. Trigger: future iteration that designs approval-by-bot for specs.
- **Script-based linter for mechanical spec-quality checks.** ~Half of spec-quality's mandate (structure + link mechanics) is algorithmically checkable. An LLM doing these checks is overspend. Trigger: spec-quality has shipped enough iterations to characterize which mechanical findings are most common; that's the input for designing the script.

Per-iteration-only deferrals (stay in spec): retroactive scans of already-merged specs, parallel-vs-sequential dispatch revisit (the choice is named in Architecture).

## `docs/roadmap.md` propagation

Two updates:

1. **Resolve the "Superpowers baseline reviewers on spec/ADR PRs?" Considering entry.** Note the resolution: "Built the spec-PR-appropriate analog as a NEW reviewer role (spec-quality) rather than extending the existing code-specific superpowers reviewers to spec/ADR PRs — the existing prompts were judged too code-specific to apply to prose."
2. **Add Spec-quality to "Shipped"** when this iteration merges.

## Known unknowns

- **Will the mandate boundary hold in practice?** The prompt instructs spec-quality to stay out of red-team's territory; whether Sonnet honors that instruction consistently is the live unknown. Plan 2 evaluates this on the first real spec PR after merge.
- **Will spec-quality's narrowed mandate produce meaningful findings on real specs?** Structure + link mechanics are easy to satisfy; gcscode specs already follow strong conventions. Tripwire: if N consecutive spec/ADR PRs return all-silent spec-quality reviews, the role's value-add is questioned.
- **Token-helper collision under parallel dispatch.** First parallel dispatch will validate empirically.
- **Will controllers (especially fresh-context sessions) honor the parallel-dispatch obligation?** This iteration doubles the controller's auto-dispatch obligation from one role to two. The articulated checklist makes it legible; whether the controller actually dispatches both reliably is the obligation's own validation.

## Future iterations

Each gets its own brainstorm when triggered.

1. **Verdict promotion for red-team AND spec-quality (bundled).** Both advisory in v1; both promote to `--request-changes` capability together. Spec-quality has stronger case for unbundling (mechanical findings could block without override-path complexity), but v1 keeps them coupled for UX uniformity. Trigger: same as red-team's planned verdict promotion.
2. **Final spec-cross-cutting reviewer with `--approve` power.** Approval-gating authority on spec/ADR PRs. Bundles with verdict promotion above.
3. **Script-based linter extracts spec-quality's mechanical checks.** Splits spec-quality: a `spec-lint.sh` (or equivalent) runs pre-PR-open and handles structure + link mechanics; the LLM spec-quality reviewer narrows further to within-document consistency only. Cleaner allocation of mechanical-vs-judgment work.
4. **Devil's advocate v2** (on roadmap from red-team spec). Will be the third per-artifact reviewer on spec/ADR PRs; the parallel-dispatch checklist grows another bullet. The auto-dispatch paragraph + checklist consolidation question gets stress-tested.
5. **Consolidation of "Auto-dispatch on spec/ADR PRs" paragraph and "Auto-dispatch controller obligations" subsection.** Currently kept separate (paragraph = rule; checklist = controller action). When a third reviewer role with auto-dispatch lands (devil's advocate v2), the duplication may be worth collapsing.

### Devil's-advocate-v2 territory surfaced by red-team's review of this spec

Red-team's review on PR #5 flagged questions for the future devil's advocate agent; noting here:

- **Structural alternative: extend red-team's prompt instead of adding spec-quality.** Red-team's prompt could absorb document-quality checks without a new role. Cost: red-team's prompt grows longer and broader. Payoff: one less role in the registry, one less subagent dispatch per PR. Worth devil's-advocate examination once spec-quality has shipped a few iterations of evidence.
- **LLM-prose-vs-script-hybrid for mechanical checks.** Listed above as Future iteration #3. Devil's advocate would steel-man the "skip the LLM reviewer entirely; just ship the script" position.

## Origin

Surfaced during a post-PR-#4 conversation (2026-05-14). The user observed that PR #4 had only red-team reviewing, not the superpowers baseline reviewers, and asked to discuss the architecture. The conversation clarified that superpowers baseline reviewers are code-specific (review implementations, not specs), and that spec/ADR PRs accordingly had only red-team — an asymmetry vs feature PRs that the user wanted to address by adding a spec-PR-appropriate analog of code-quality.

The initial spec proposed a 4-concern mandate (structure, internal consistency, cross-references, convention adherence). **Red-team's review on PR #5 surfaced that two of those concerns — cross-references with priors and convention adherence vs CLAUDE.md / prior specs — overlap with red-team's existing consistency-reviewer mandate.** Red-team's specific suggestion: narrow spec-quality to document-internal-only. This spec (post-followup) implements that narrowing: structure + within-document consistency + link mechanics, with explicit "this is red-team's job" exclusions in the prompt.

The iteration is therefore the **first concrete test of "does red-team's organic critique surface pattern-misalignment naturally?"** (the empirical question the reviewer-role-design-conventions spec posed for the next role-adding iteration). The answer was yes: red-team flagged the mandate-overlap problem without an explicit "check the design patterns" directive. Recorded as evidence that the design-conventions spec's bet (organic critique > explicit directive) is paying off.

A meta-observation worth recording: this iteration's spec went from "add reviewer with broad mandate" to "add reviewer with surgically narrow mandate" in one red-team round. The narrowing is the load-bearing design choice — and it came from the very mechanism this iteration is reinforcing. The architecture is, modestly, working on itself.
