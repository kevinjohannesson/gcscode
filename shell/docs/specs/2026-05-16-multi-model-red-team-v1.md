# Multi-model heterogeneous reviewers — red-team v1

**Slug:** multi-model-red-team-v1
**Iteration on the agentic-team track:** sixth, after [`docs/specs/2026-05-14-auto-merge-on-user-approval.md`](2026-05-14-auto-merge-on-user-approval.md).
**Type:** registry change + dispatch behavior change + small CLAUDE.md edits. No new code or workflow.
**No bootstrap exceptions.** Spec ships via spec-PR workflow; implementation lands per the post-merge implementation convention.

## Context

The reviewer-role registry currently assigns one model per role: red-team and final cross-cutting use Claude Opus 4.7; spec-compliance, code-quality, and spec-quality use Claude Sonnet 4.6. Each role-instance dispatches a single subagent of its assigned model.

The roadmap's queued "Multi-model heterogeneous reviewers" item asks: **does running two different models on the same role-instance produce meaningfully different findings?** If yes, multi-model dispatch is worth the doubled cost. If no, single-model is sufficient and the second dispatch is waste.

This iteration tests the question on **red-team** specifically — the broadest-mandate, highest-critique-value role, and the role that consistently produced substantive findings across PRs #4, #5, #7 (the agentic-team track's organic spec reviews). If multi-model isn't valuable for red-team, it's probably not valuable elsewhere. If it IS valuable for red-team, the next iteration can extend the experiment.

The mechanism: red-team auto-dispatches as TWO independent subagents (Opus 4.7 AND Sonnet 4.6) in parallel. Each posts its own review. Each is dispatched with the same prompt template and the same context; neither sees the other's output. Reviews are distinguished by the model name already encoded in the header convention (`## Red-team review — <kind> — Claude Opus 4.7` vs `... Claude Sonnet 4.6`). The experiment runs for N=5 spec/ADR PRs, after which a follow-up iteration decides KEEP-BOTH / KEEP-OPUS / KEEP-SONNET / EXTEND-TO-10.

## Why not the bigger version

The bigger version would include:

- Multi-model on all 5 reviewer roles, not just red-team.
- Cross-vendor pairs (Claude + GPT or Claude + Gemini), not just within-Claude.
- Independent effort-level variation (thinking_budget), not just default-per-model.
- Sequential dispatch where the second model sees the first's review (different experiment shape).
- Aggregation of two reviews into one synthesized output.

That's a multi-iteration roadmap. This iteration is the smallest concrete wedge: one role, one model pair (within-Claude), parallel dispatch, separate reviews, N=5 evaluation trigger. The result of v1 (KEEP-BOTH / KEEP-OPUS-ONLY / KEEP-SONNET-ONLY / EXTEND) directly informs whether bigger versions are worth pursuing.

## Goals

1. Add a `model_pair_secondary` field to the reviewer-role registry. Populated for red-team only in v1; empty/`—` for other roles.
2. Update the auto-dispatch behavior on spec/ADR PRs: red-team dispatches as TWO parallel subagents (one Opus 4.7 + one Sonnet 4.6) when `model_pair_secondary` is set. Spec-quality continues as single-model Sonnet. Total: three parallel dispatches per spec/ADR PR.
3. Both red-team reviews post under `gcscode-reviewer[bot]` with the existing header convention (model name in header naturally distinguishes the two).
4. Document the N=5 evaluation methodology and the four possible outcomes so the next iteration has clear criteria to act on.
5. Update CLAUDE.md "Subagent reviewer PR-posting discipline" (registry, header examples, auto-dispatch paragraph) and "Auto-dispatch controller obligations" checklist to reflect three-dispatch behavior.

## Non-goals (this iteration)

Each has its own future trigger.

- **Multi-model on other roles** (spec-compliance, code-quality, final cross-cutting, spec-quality). Deferred pending v1 evaluation outcome.
- **Cross-vendor pairs** (Claude + non-Claude). Different infra; separate iteration.
- **Effort-level control** (thinking_budget per dispatch). The Agent tool currently used for subagent dispatch does NOT expose effort; subagents run at the harness's default depth per model. Effort variation requires a custom dispatcher hitting the Anthropic API directly. Out of scope for this iteration; queued as future.
- **Sequential dispatch / cross-model awareness.** The two models dispatch in parallel with no shared context. They cannot see or reference each other's output. Pure independence-of-opinion test.
- **Aggregation of the two reviews.** Two separate reviews on the PR; aggregation would defeat the test.
- **Automated counting of "N=5 PRs reached."** The counter is human-tracked; user notes when N=5 hits and triggers the evaluation iteration.
- **Auto-merge gate-3b strictness change.** Currently the gate requires `red-team count >= 1`. With multi-model, count is 2 (both Opus and Sonnet); gate still satisfies. No change in v1. A stricter version (require both model variants) is a future refinement if the experiment outcome is KEEP-BOTH.

## Architecture

Three small changes: registry-field addition, dispatch-behavior change, evaluation criteria documentation.

### Registry change: add `model_pair_secondary` field

The reviewer-role registry currently has these fields per row: `name`, `kind`, `identity`, `model`, `targets`, `trigger`, `verdicts`, `character`, `header`, `re-review header`, `prompt template`. Add a 12th field:

| Field                   | Purpose                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `model_pair_secondary`  | Optional. If set, controller dispatches BOTH this model AND the `model` field's value in parallel for this role. |

Populated for red-team only in v1; empty/`—` for the other four roles.

### Dispatch behavior: parallel triple-dispatch on spec/ADR PRs

When a spec/ADR PR opens (or a `Code-review-followup:` commit lands), the controller dispatches THREE subagents in parallel:

1. **Red-team Opus 4.7** — primary model from `model` field.
2. **Red-team Sonnet 4.6** — secondary model from `model_pair_secondary` field.
3. **Spec-quality Sonnet 4.6** — single model from `model` field (no secondary).

Both red-team dispatches use the same prompt template (`.claude/reviewer-prompts/red-team.md`); the only difference is the `model` parameter passed to the Agent tool. Same PR context, same priors-access; neither sees the other's review until both have posted (independence preserved).

The three dispatches are parallel-safe — they fetch tokens independently (validated on PR #6's parallel-dispatch smoke test) and post independent reviews. Total review count on a clean spec/ADR PR rises from 2 (red-team + spec-quality) to 3 (Opus red-team + Sonnet red-team + spec-quality).

### Header distinguishes the two red-team reviews

The existing header convention already encodes the model name:

- `## Red-team review — spec — Claude Opus 4.7`
- `## Red-team review — spec — Claude Sonnet 4.6`

Same prefix (`## Red-team review`), different model strings. No new header form needed.

Re-review headers follow the same pattern:

- `## Red-team review — spec (re-review of <SHA>) — Claude Opus 4.7`
- `## Red-team review — spec (re-review of <SHA>) — Claude Sonnet 4.6`

### Auto-merge gate-3b: unchanged

The auto-merge workflow's gate-3b for spec/ADR PRs counts reviews matching `body | startswith("## Red-team review")`. With multi-model red-team, the count is 2 (or 4 with both initial + re-reviews). Gate's threshold is `>= 1`, so multi-model satisfies it cleanly. No change to `.github/workflows/auto-merge.yml` in this iteration.

### Evaluation methodology (load-bearing for v1's value)

After the **5th spec/ADR PR** with multi-model red-team has merged, run the evaluation:

**Across the 5 PR-pairs (10 red-team reviews total), the user qualitatively assesses:**

1. **Distinct-finding rate** — count findings that appear in Opus's review but NOT Sonnet's, and vice versa. What fraction of findings is unique to one model? Substantively-equivalent findings phrased differently count as overlapping (the question is whether two minds see different things, not whether they word things differently).
2. **Quality where they differ** — when each model surfaces something the other missed, which model's finding is more useful in retrospect? Track per-PR-pair: Opus-better / Sonnet-better / both-useful / both-unimportant.
3. **Cost vs benefit** — the extra dispatch costs tokens and a bit of latency. Is the diversity worth that?

**Four possible outcomes for the evaluation iteration:**

- **KEEP-BOTH** — Distinct-finding rate is meaningful (rough threshold: ≥30% of findings per PR are unique to one model); both models surface things the other misses; multi-model is permanent for red-team. Triggers v3-style iteration: consider extending to spec-quality.
- **KEEP-OPUS-ONLY** — Sonnet's findings are largely a subset of Opus's, or Sonnet's unique findings are not useful. Revert red-team to single-model Opus 4.7 (current state pre-iteration). Document why Sonnet didn't add value.
- **KEEP-SONNET-ONLY** — Sonnet's findings are competitive with Opus's (high overlap; Opus's unique findings rarely useful enough to justify cost). Switch red-team primary to Sonnet 4.6 (cheaper, faster). Document why Opus's depth didn't justify cost.
- **EXTEND-TO-10** — Indeterminate: signal is mixed or PRs were atypical. Extend the experiment to N=10 PRs and re-evaluate.

The evaluation is NOT this iteration. This iteration ships the **mechanism** to run the experiment. The evaluation iteration (small decision-spec) ships when the 5th multi-model spec/ADR PR is observed.

### Effort dimension: known limitation

The Agent tool currently used for subagent dispatch exposes a `model` parameter (`opus`/`sonnet`/`haiku`) but does NOT expose effort/thinking-budget. Subagents run at whatever default thinking depth the harness assigns per model. This iteration's experiment therefore tests **bundled (model size + default effort)**, not pure model-size variation.

Concretely: Opus 4.7's "default effort" and Sonnet 4.6's "default effort" may differ in thinking depth in addition to differing in model capacity. The Opus-vs-Sonnet finding diff includes both axes.

Independent effort control would require a custom dispatcher hitting the Anthropic API directly with `thinking: { type: "enabled", budget_tokens: N }`. Substantial new infra. Queued as future iteration "Custom subagent dispatch for effort-level control."

The N=5 evaluation should be read as "Opus-at-defaults vs Sonnet-at-defaults" — useful signal but not a pure model-size test.

## The CLAUDE.md edits verbatim (for post-merge implementation)

Per the post-merge implementation convention, the implementation lands as a direct-master commit. The verbatim text for each edit:

### Edit A: Registry table gets a new column

Currently the registry table has 11 columns. Add `Secondary model` as a 12th column (between `Model` and `Targets`), populate red-team's row with `Claude Sonnet 4.6`, others with `—`.

The updated registry table (replacing the existing one in CLAUDE.md):

````md
| Role                | Kind          | Identity                | Model            | Secondary model    | Targets             | Trigger                      | Verdicts                         | Character                                                         | Header                                                              | Re-review header                                                                  | Prompt template                                                              |
| ------------------- | ------------- | ----------------------- | ---------------- | ------------------ | ------------------- | ---------------------------- | -------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Spec-compliance     | per-task      | `gcscode-reviewer[bot]` | Claude Sonnet 4.6 | —                  | feature-PR          | After each task commit       | `--comment`, `--request-changes` | Verify implementation matches the task's spec slice                | `## Spec-compliance review — task <N> — Claude Sonnet 4.6`          | `## Spec-compliance review — task <N> (re-review of <SHA>) — Claude Sonnet 4.6`   | `superpowers:subagent-driven-development/spec-reviewer-prompt.md`            |
| Code-quality        | per-task      | `gcscode-reviewer[bot]` | Claude Sonnet 4.6 | —                  | feature-PR          | After spec-compliance passes | `--comment`, `--request-changes` | Code quality, idioms, edge cases                                   | `## Code-quality review — task <N> — Claude Sonnet 4.6`             | `## Code-quality review — task <N> (re-review of <SHA>) — Claude Sonnet 4.6`      | `superpowers:subagent-driven-development/code-quality-reviewer-prompt.md`    |
| Final cross-cutting | cross-cutting | `gcscode-reviewer[bot]` | Claude Opus 4.7   | —                  | feature-PR          | End of iteration             | `--request-changes`, `--approve` | Cross-cutting concerns missed at per-task level                    | `## Final cross-cutting review — Claude Opus 4.7`                   | `## Final cross-cutting review (re-review of <SHA>) — Claude Opus 4.7`            | `superpowers:requesting-code-review/code-reviewer.md`                        |
| Red-team            | per-artifact  | `gcscode-reviewer[bot]` | Claude Opus 4.7   | Claude Sonnet 4.6 | spec-PR, ADR-PR     | Automatic on PR open         | `--comment` only (v1)            | Premise challenger + consistency reviewer                          | `## Red-team review — <spec or ADR> — Claude Opus 4.7`              | `## Red-team review — <spec or ADR> (re-review of <SHA>) — Claude Opus 4.7`       | `.claude/reviewer-prompts/red-team.md`                                       |
| Spec-quality        | per-artifact  | `gcscode-reviewer[bot]` | Claude Sonnet 4.6 | —                  | spec-PR, ADR-PR     | Automatic on PR open         | `--comment` only (v1)            | Document structure + within-document consistency + link mechanics  | `## Spec-quality review — <spec or ADR> — Claude Sonnet 4.6`        | `## Spec-quality review — <spec or ADR> (re-review of <SHA>) — Claude Sonnet 4.6` | `.claude/reviewer-prompts/spec-quality.md`                                   |

The `Secondary model` field is OPTIONAL. When populated, the controller dispatches BOTH this model AND the `Model` field's value in parallel for this role. When empty (`—`), the controller dispatches only the `Model` field's value (single-model behavior, unchanged from prior iterations).

The `Header` and `Re-review header` columns show the form for the PRIMARY model only. The secondary dispatch uses the same header structure with the secondary model name substituted (e.g., `## Red-team review — spec — Claude Sonnet 4.6` for red-team's Sonnet dispatch).

`<SHA>` in re-review headers refers to the **followup commit that prompted the re-review** (the new commit added since the prior review), matching the empirical convention from PR #1's validation.
````

### Edit B: Header convention examples list gets Sonnet variants for red-team

The existing example list currently has Opus-only red-team examples. Add Sonnet variants alongside:

````md
- `## Spec-compliance review — task 3 — Claude Sonnet 4.6`
- `## Code-quality review — task 7 — Claude Sonnet 4.6`
- `## Final cross-cutting review — Claude Opus 4.7`
- `## Spec-compliance review — task 3 (re-review of abc1234) — Claude Sonnet 4.6`
- `## Red-team review — spec — Claude Opus 4.7`
- `## Red-team review — spec — Claude Sonnet 4.6`
- `## Red-team review — ADR — Claude Opus 4.7`
- `## Red-team review — ADR — Claude Sonnet 4.6`
- `## Red-team review — spec (re-review of def5678) — Claude Opus 4.7`
- `## Red-team review — spec (re-review of def5678) — Claude Sonnet 4.6`
- `## Spec-quality review — spec — Claude Sonnet 4.6`
- `## Spec-quality review — ADR — Claude Sonnet 4.6`
- `## Spec-quality review — spec (re-review of def5678) — Claude Sonnet 4.6`
````

### Edit C: "Auto-dispatch on spec/ADR PRs" paragraph

Replace the existing paragraph with text that mentions the triple-dispatch:

````md
**Auto-dispatch on spec/ADR PRs.** When a `spec/<topic>` or `adr/<slug>` PR is opened, the controller automatically dispatches THREE reviewer subagents in parallel: red-team Opus 4.7 (primary), red-team Sonnet 4.6 (secondary, from the registry's `Secondary model` field for red-team), and spec-quality Sonnet 4.6. The three subagents dispatch as independent calls; none blocks any other; each posts an independent review under the `gcscode-reviewer[bot]` identity. The two red-team dispatches use the same prompt template (`.claude/reviewer-prompts/red-team.md`) and the same context; only the `model` parameter differs. The pair is an independence-of-opinion experiment from `docs/specs/2026-05-16-multi-model-red-team-v1.md` and runs for N=5 spec/ADR PRs before an evaluation iteration decides whether to keep both, revert to single-model, or extend the experiment. Both red-team verdicts and spec-quality's verdict are `--comment` only in v1 (advisory). On a `Code-review-followup:` commit to the spec/ADR branch, the controller re-dispatches ALL THREE roles in parallel. Each re-review header includes `(re-review of <SHA>)` where `<SHA>` is the followup commit.
````

### Edit D: "Auto-dispatch controller obligations" checklist

Replace the existing bullets with text reflecting three dispatches:

````md
- **Before opening a `spec/<topic>` or `adr/<slug>` PR:** plan to dispatch THREE subagents immediately after `gh pr create`: red-team Opus 4.7, red-team Sonnet 4.6 (the registry's `Secondary model` for red-team), and spec-quality Sonnet 4.6. They dispatch in parallel (independent subagents). Do not consider the PR-open step complete until all three have posted their reviews.
- **After every `Code-review-followup:` commit on a spec/ADR branch:** re-dispatch ALL THREE (in parallel). Each role's re-review header includes `(re-review of <SHA>)` where `<SHA>` is the followup commit (existing convention). For the red-team multi-model pair, both Opus and Sonnet re-review independently. Note: a followup that does not touch content any reviewer commented on will still trigger all three re-dispatches. v1 accepts the duplicative-review cost; if the pattern produces material noise, a future iteration can condition the obligations on whether the followup touches reviewed content for each role.
````

## Post-merge implementation

Per the post-merge implementation convention, two direct-master commits:

- **Commit 1: Registry table replacement.** Replace the existing reviewer-role registry table in `shell/CLAUDE.md` "Subagent reviewer PR-posting discipline > Reviewer-role registry" with the new 12-column version specified above (Edit A).
- **Commit 2: Three coordinated text edits.** Update the header convention example list (Edit B), the "Auto-dispatch on spec/ADR PRs" paragraph (Edit C), and the "Auto-dispatch controller obligations" checklist bullets (Edit D). These three edits are logically coupled (all describe the new triple-dispatch behavior), so one commit covers them.

## Data flow — how this iteration ships

1. Brainstorm → spec → spec-PR. **Sixth iteration shipping via the spec-PR workflow.**
2. **On PR open: red-team (Opus only) + spec-quality auto-dispatch in parallel** per the current registry (the multi-model behavior isn't enabled until this iteration ships). This PR is reviewed in single-model-red-team mode.
3. User reads both reviews + approves the spec. Code-review-followup commits trigger re-dispatch of both reviewers per the existing obligation.
4. User merges via `gh pr merge --merge` (or auto-merge label).
5. Post-merge implementation: two direct-master commits per the convention.
6. **First spec/ADR PR after merge** is the first multi-model red-team dispatch (live experiment begins).
7. **At N=5 spec/ADR PRs** (counting from the first post-merge PR), trigger the evaluation iteration.

## Validation

Two plans.

### Plan 1: Mechanics smoke test (PR #9)

A throwaway test branch verifies triple-dispatch mechanics. Same shape as PR #1, #3, #6, #8.

- **Branch:** `test/multi-model-red-team-validation` off master (post-merge).
- **Content:** a trivial throwaway spec at `shell/docs/specs/test-multi-model-red-team-validation.md`.
- **PR opened** with the spec/ADR-PR template. Controller dispatches THREE scripted subagents in parallel: red-team Opus, red-team Sonnet, spec-quality Sonnet.
- **Scripted dispatches** for all three roles. Verify:
  - All three reviews post under `gcscode-reviewer[bot]`.
  - Headers match the conventions: `## Red-team review — spec — Claude Opus 4.7`, `## Red-team review — spec — Claude Sonnet 4.6`, `## Spec-quality review — spec — Claude Sonnet 4.6`.
  - All three reviews appear independently in the PR timeline.
  - `reviewDecision` stays empty throughout (all advisory).
  - Re-review pattern works for all three roles in parallel.
  - No token-helper collisions under triple-parallel dispatch (extends PR #6's two-parallel evidence).
- **Disposition:** kept open in draft state as the fifth permanent reference artifact (joining PR #1, #3, #6, #8). NOT merged.

### Plan 2: Live evaluation (next 5 spec/ADR PRs)

Multi-model red-team runs organically on the next 5 spec/ADR PRs after this iteration ships. User keeps an informal tally of:

- Findings unique to Opus vs Sonnet (per PR-pair).
- Quality-where-they-differ judgment (per PR-pair).
- Subjective cost-vs-benefit sense.

After the 5th PR, trigger the evaluation iteration (a small decision-spec). Evaluation outcomes per "Architecture > Evaluation methodology" above.

**Failure response:** if Plan 1 fails on triple-parallel mechanics (e.g., token collision, missing review, malformed header), refine the dispatch obligation or prompt template via Code-review-followup before merging this iteration's spec.

## VS Code alignment

No VS Code alignment implications. Multi-model reviewer dispatch is a gcscode-specific agentic-team mechanism; VS Code has no analogous review-by-bot.

Propagation to `shell/docs/vs-code-alignment.md`: none (ledger is per-concern, not per-iteration).

## `docs/out-of-scope.md` propagation

Two cross-cutting deferrals propagate:

- **Effort-level control in reviewer dispatch.** The Agent tool used for subagent dispatch does not expose effort/thinking-budget; reviewers run at the harness's default depth per model. Independent effort control requires a custom dispatcher hitting the Anthropic API directly. Trigger to revisit: this iteration's evaluation suggests effort variation is a meaningful dimension separate from model-size, OR a future iteration explicitly wants to test effort experiments.
- **Multi-model on roles other than red-team.** Spec-compliance, code-quality, final cross-cutting, spec-quality stay single-model in v1. Trigger: this iteration's evaluation outcome is KEEP-BOTH (multi-model proves valuable for red-team), suggesting the experiment is worth extending.

Per-iteration-only deferrals (stay in spec): cross-vendor pairs, sequential dispatch, review aggregation, automated N=5 counting, auto-merge gate-3b strictness change.

## `docs/roadmap.md` propagation

Three updates:

1. **Flip "Multi-model heterogeneous reviewers" from Queued to Shipped** when this iteration merges. Note that v1 is scoped to red-team only.
2. **Update description text** to match the actual mechanism: "v1 scope: red-team only; Opus 4.7 + Sonnet 4.6 within-Claude; parallel dispatch; N=5 PR evaluation."
3. **Add two new Considering entries:**
   - "Multi-model evaluation iteration (triggered at N=5 spec/ADR PRs)" — small decision-spec to decide KEEP-BOTH / KEEP-OPUS / KEEP-SONNET / EXTEND.
   - "Custom subagent dispatch for effort-level control" — independent dimension; substantial new infra (custom dispatcher hitting Anthropic API directly with `thinking_budget`).

## Known unknowns

- **Will the two models' reviews on the same artifact be meaningfully distinct?** This is the experiment's central question. Answered by Plan 2's live evaluation. v1 ships without an answer.
- **Effort dimension is bundled into model defaults.** Documented above. v1's results conflate "model size" with "default thinking depth." Future custom-dispatch iteration could disentangle.
- **Sonnet may produce findings that simply repeat Opus's in different words.** "Substantively-equivalent findings phrased differently" is hard to count objectively; the evaluation is qualitative.
- **The user's effort budget on the evaluation.** Reading 5 PR-pairs (10 red-team reviews) side-by-side and judging quality is non-trivial work. If the experiment ends because the user lacks bandwidth to evaluate rather than because evidence converged, that's a process failure worth flagging.
- **Triple-parallel dispatch may stress the token helper.** PR #6 validated dual-parallel; PR #9 (Plan 1 smoke test) validates triple-parallel. Probably fine but worth observing.

## Future iterations

Each gets its own brainstorm when triggered.

1. **Multi-model evaluation iteration** (triggered at N=5 spec/ADR PRs). Decides KEEP-BOTH / KEEP-OPUS / KEEP-SONNET / EXTEND-TO-10. Small decision-spec.
2. **Multi-model on spec-quality** (triggered by v1 evaluation outcome KEEP-BOTH). Extends the experiment to the other spec/ADR-PR-class role.
3. **Multi-model on feature-PR reviewers** (triggered by sufficient evidence from spec/ADR-PR-class results). Spec-compliance, code-quality, final cross-cutting evaluated.
4. **Cross-vendor multi-model** (Claude + non-Claude). Different infra: API keys, dispatch script, cost tracking. Standalone iteration.
5. **Custom subagent dispatch for effort-level control.** Build a dispatcher hitting the Anthropic API directly with `thinking_budget`. Enables pure effort experiments (same model, different thinking depth) and pure model-size experiments (different models, same effort). Bigger infra change; potentially valuable for many future agentic-team experiments.
6. **Auto-merge gate-3b strictness for multi-model red-team.** If v1 outcome is KEEP-BOTH, the gate could require BOTH model variants posted (not just `>= 1 red-team review`). Refinement; not blocking.
7. **Sequential multi-model dispatch** (one model sees the other's review and reacts). Different experiment shape — tests "second opinion" patterns rather than independence. Separate iteration.

## Origin

Listed in the reviews-as-artifacts spec (2026-05-12) and red-team-reviewer spec (2026-05-14) as the third iteration on the agentic-team track's "Queued" list. Sat there through the reviewer-role-design-conventions, spec-quality-reviewer, and auto-merge-on-user-approval iterations, which built the substrate (registry pattern, prompt templates, post-merge convention, auto-merge workflow) this iteration builds on.

User initiated this iteration after the auto-merge iteration shipped (2026-05-14, with smoke test PR #8 keeping the workflow live). Brainstorm narrowed quickly on the scope axes: red-team only (most-leveraged single role), Opus + Sonnet within-Claude (smallest infra step), N=5 PR evaluation (clean exit shape).

**Effort dimension surfaced during brainstorm** as a key architectural finding: the current Agent dispatch tool doesn't expose thinking_budget, so this iteration's "Opus vs Sonnet" test conflates model size with default effort. Documented as a known limitation and added as a future iteration (custom dispatch for effort control). The user's question that surfaced this — "we also give an effort level with the model, do we do this for our reviewers as well?" — is the kind of architectural insight the iteration captures explicitly rather than papering over.

This is the **sixth iteration on the agentic-team track** and the first to introduce a multi-axis experiment (one role × two models) rather than a structural addition (a new role, a new workflow). Sets a precedent for experiment-shaped iterations vs build-shaped iterations.
