# Respondent subagent v2

**Slug:** respondent-subagent-v2
**Iteration on the agentic-team track:** tenth, after the ADR-0009 ADR-PR (queued #1 of the debt-clearing list) shipped 2026-05-16. Second of the seven queued items from [`docs/specs/2026-05-16-agentic-team-debt-clearing-v1.md`](2026-05-16-agentic-team-debt-clearing-v1.md).
**Type:** new agent file, rewritten prompt template, two CLAUDE.md edits (Respondent posting discipline subsection rewrite; auto-dispatch obligations bullet 2 + agentic-actor registry respondent-row `model` cell), docs propagation. No new logic in `shell/`.
**No bootstrap exceptions.** Spec ships via spec-PR workflow; implementation lands per the post-merge implementation convention.

## Context

The review-discussion-loop-v1 iteration ([`docs/specs/2026-05-16-review-discussion-loop-v1.md`](2026-05-16-review-discussion-loop-v1.md), PR #12) introduced the respondent — a `gcscode-respondent[bot]` GitHub App identity that posts per-finding dispositions after each `Code-review-followup:` commit on spec/ADR PRs. v1 ships the response WRITING as **controller-direct**: the Claude Code session that orchestrates the iteration authors each response using session context.

v1 named this as a Day 1 limitation (not a future risk):

> v1 ships controller-direct with the load-bearing premise that "session context already contains the reasoning that needs to be captured." That premise is true within ONE session, but multi-session PRs are the norm — PR #11 ran four followup rounds across what was almost certainly multiple sessions. A new session picking up a mid-iteration PR has NO prior reasoning context: it must reconstruct intent from the followup commits, the diff, and prior reviews — which is exactly what a subagent dispatch would do.

The trigger v1 declared was "first real cross-session PR shows reconstruction-cost is material." The debt-clearing iteration ([`docs/specs/2026-05-16-agentic-team-debt-clearing-v1.md`](2026-05-16-agentic-team-debt-clearing-v1.md)) overrides that trigger with an unconditional drain commitment: queued items ship sequentially regardless of trigger firing. This is queued item #2; ADR-0009 (queued #1) merged earlier today.

**Explicit acknowledgment — the empirical trigger never fired.** v1 named "first real cross-session PR shows reconstruction-cost is material" as the trigger. That empirical signal was never observed: no log, no measured reconstruction time, no documented case where a controller-direct response was demonstrably impaired by session-boundedness. The "almost certainly multiple sessions" claim for PR #11 (in v1's Context) was inferential, not measured. v2 ships on the debt-clearing commitment, not on the trigger firing. If Plan 2's post-ship observations show controller-direct in fresh sessions was actually fine, v2's premise was wrong and partial rollback (keep the agent-file infrastructure; revert the dispatch flow to controller-direct) is the response. Stating this plainly because the alternative framing ("v1's limitation got bad enough to fix") is inaccurate and would mislead future readers about what evidence v2 was based on.

This iteration ships: one new agent file (`.claude/agents/respondent.md`), a rewritten prompt template (`.claude/reviewer-prompts/respondent.md`), two CLAUDE.md edits (Respondent posting discipline subsection rewrite; auto-dispatch obligations bullet 2 + agentic-actor registry respondent-row `model` cell), and standard propagation (roadmap.md, predecessor breadcrumb).

ADR-0009 (merged 2026-05-16) anticipated this iteration: the respondent row's `model` cell carries an annotation reading `n/a — controller-direct (column-value stretch; v1 limitation; respondent subagent v2 will populate with an actual Claude model)`. v2 fulfills that annotation — the cell flips to `Claude Sonnet 4.6` and the stretch annotation goes away.

## Why not the bigger version

The bigger version would include:

- **Bundle the auto-merge-bypasses-final-respondent fix** (queued #6 of the debt-clearing list). Would close the asymmetry where the final clean round has no followup commit and therefore no respondent post. **Smaller wedge:** stay scoped to the cross-session reconstruction problem; let queued #6 ship as its own iteration with its own design call (accept the asymmetry vs add a final-wrap respondent post). **Bigger wedge:** bundled. Bundling risks the same problem the debt-clearing iteration prevents — accepting limitations and queuing them — by closing one queued item with another queued item's scope creep.
- **Consolidate to 1 respondent post per round** (per v1's "are 3 posts per round noisy?" Known Unknown). Would address the density concern. **Smaller wedge:** keep 3 posts (one per reviewer); each reviewer gets its own targeted response. Consolidation is a different concern from cross-session, deferred. **Bigger wedge:** redesign the per-followup cadence. v1 hasn't accumulated enough operational data to know whether 3 posts per round is actually noisy in practice.
- **Add controller-direct as a documented fallback.** Would let any future emergency drop back to controller-direct mode. **Smaller wedge:** clean retire — CLAUDE.md after v2 says "respondent is dispatched as a subagent" and that's it. If a future emergency demands controller-direct, it can be done ad hoc without a documented blessed mode. **Bigger wedge:** documented dual-mode adds maintenance and decision-point ambiguity ("when do I use which?").
- **Pre-fetch even more context** (full git log of the PR, all prior commit messages, every ADR's full text). Would maximize the subagent's reconstruction inputs. **Smaller wedge:** pre-fetch the structured minimum — reviewer's review body, followup diff, spec/ADR content. Subagent self-fetches prior respondent posts via `gh pr view` (round-aware context only). **Bigger wedge:** front-load all context, balloon controller-side pre-fetch time and subagent prompt size for diminishing returns.

This iteration ships: subagent swap, structured minimum inputs, clean retire of controller-direct, no bundled fixes.

## Goals

1. Add `.claude/agents/respondent.md` agent-file dispatch wrapper with `model: sonnet` + `effort: max` matching the spec-quality-reviewer.md pattern.
2. Rewrite `.claude/reviewer-prompts/respondent.md` for subagent dispatch — structured inputs (review body, followup diff, spec content), self-fetched prior respondent posts, posting via the existing respondent token helper.
3. Update CLAUDE.md "Respondent posting discipline" subsection to specify the subagent dispatch flow (replacing the controller-direct flow).
4. Update CLAUDE.md "Auto-dispatch controller obligations" bullet 2 to incorporate the respondent subagent dispatch step (replacing the controller-direct posting step).
5. Update CLAUDE.md agentic-actor registry table — respondent row's `model` cell flips from `n/a — controller-direct (column-value stretch; v1 limitation; respondent subagent v2 will populate with an actual Claude model)` to `Claude Sonnet 4.6`. The "column-value stretch" annotation goes away because v2 unsticks the cell.
6. Documentation propagation: roadmap.md (move "Respondent subagent v2" from Considering to Queued, flip to `[x]`); review-discussion-loop-v1.md (one-line breadcrumb per the specs-as-historical-record convention).

## Non-goals (this iteration)

Each has its own queued item or established future trigger.

- **Required re-reviewer engagement with respondent posts.** v1 ships engagement as optional; v2 retains the optional setting. Queued separately as a Considering item carried forward from v1.
- **Inline threaded replies via `--reply-to`.** Respondent posts remain review-level comments (one per reviewer). Queued.
- **Open-question ledger file.** Dispositions still route to existing files (roadmap, out-of-scope, spec known-unknowns). Queued.
- **Per-role bot identities for reviewers.** Still queued (#3 in debt-clearing); orthogonal to respondent dispatch mechanics.
- **Auto-merge-bypasses-final-respondent design.** Still queued (#6 in debt-clearing list).
- **Consolidation of 3 posts to 1.** v2 retains 3 posts per round (one per reviewer). Future iteration if v1's "noisy?" Known Unknown becomes operational.
- **Documented controller-direct fallback mode.** Clean retire; no dual-mode documentation.
- **Backfill of v1's missed out-of-scope.md entries.** v1's spec planned two `docs/out-of-scope.md` additions ("Respondent subagent dispatch for cross-session consistency"; "Required re-reviewer engagement with respondent posts"); neither landed during v1's post-merge implementation (`grep` against the current `shell/docs/out-of-scope.md` finds no `respondent` references). Backfilling is not v2's job — see Known Unknowns.
- **Pre-merge mechanics validation.** Same structural constraint as PRs #11-#15. The new agent file + rewritten prompt don't exist until post-merge implementation lands; smoke test runs post-merge.

## Architecture

### New agent file `.claude/agents/respondent.md`

Dispatch wrapper, same structural pattern as `red-team-reviewer.md` and `spec-quality-reviewer.md`. Frontmatter does model + effort selection; body carries the "controller MUST include the full template content" contract that errors fast on misuse. Full verbatim content in Post-merge implementation > Commit 1.

### Rewritten `.claude/reviewer-prompts/respondent.md`

Subagent-shaped. v1's controller-direct template content is REPLACED end-to-end (not edited in place — the role's frame changes from "the controller writes" to "the subagent reads inputs, fetches round-aware context, posts, returns summary"). The new template specifies:

- **Dispatch substitutions:** placeholders the controller fills in (`{{PR_NUMBER}}`, `{{FOLLOWUP_SHA}}`, `{{REVIEWER_ROLE}}`, `{{REVIEWER_MODEL}}`, `{{ROLE_LABEL}}`).
- **Structured inputs (controller pre-fetches):** the reviewer's review body, the followup commit diff, the spec/ADR content. Subagent receives these inline; does NOT re-fetch.
- **Self-fetch:** prior respondent posts on the PR via `gh pr view {{PR_NUMBER}} --json reviews`. The only thing the subagent fetches itself.
- **How to post:** `gh-app-token-respondent` + `gh pr review --comment` (identical to v1).
- **Header convention:** identical to v1.
- **Response body structure:** identical to v1 disposition vocabulary, with one strengthening — `intentional, see <X>` requires the subagent to verify the citation exists before using it; fall back to the `noted, no current action — citation unverified: <one-sentence rationale>` disposition variant (a new entry added in Commit 2's vocabulary; the `citation unverified:` prefix is the discriminator). Do NOT use the bare `noted, no current action — <rationale>` form for citation-verification fallbacks — that's reserved for non-citation-related noted dispositions.
- **Closing line:** identical to v1.
- **Per-followup cadence + initial-review-round exclusion:** identical to v1.
- **Return-to-controller contract:** new (v1 didn't have this — controller-direct had no subagent to return from). One-line summary string the subagent emits after posting.

Full verbatim content in Post-merge implementation > Commit 2.

### CLAUDE.md "Respondent posting discipline" subsection (rewrite)

The v1 subsection describes controller-direct posting; the v2 rewrite describes subagent dispatch. New dispatch sequence:

1. Push the `Code-review-followup:` commit.
2. Controller pre-fetches: 3 most-recent reviewer reviews (`gh pr view --json reviews`); followup diff (`git show <SHA>`); spec/ADR content (Read).
3. Controller dispatches 3 `subagent_type: respondent` subagents in parallel — each receives one reviewer's review body + shared diff + spec content + the full prompt template inline. Each subagent fetches prior respondent posts (round-aware context) as its first step, then posts under `gcscode-respondent[bot]`, then returns a one-line summary.
4. Controller re-dispatches the 3 reviewer subagents per the existing obligation.

Other subsection content (header convention, identity, config, open-question routing, initial-review-round, discipline note, out-of-scope list, public-repo note) is preserved with minimal wording updates. The label "Out of scope for v1" is renamed to "Out of scope for v2" (Commit 3 verbatim), and the v1 entry "respondent subagent dispatch (controller writes directly)" is dropped from that list — resolved by v2 shipping.

Full verbatim content in Post-merge implementation > Commit 3.

### CLAUDE.md "Auto-dispatch controller obligations" bullet 2 (update)

v1's bullet 2 says "post respondent responses per the Respondent posting discipline subsection above — one per reviewer that has posted on the PR (three posts total for spec/ADR PRs with the current three reviewers)." v2 changes this to "dispatch 3 respondent subagents in parallel per the Respondent posting discipline subsection above" + retains the rest (the re-dispatch step, the duplicative-review acceptance, the multi-model pair note).

Full verbatim content in Post-merge implementation > Commit 4a.

### CLAUDE.md agentic-actor registry table (respondent-row `model` cell update)

ADR-0009's Commit 1 (merged earlier today) populated the respondent row's `Model` cell with:

```
n/a — controller-direct (column-value stretch; v1 limitation; respondent subagent v2 will populate with an actual Claude model)
```

v2 replaces with:

```
Claude Sonnet 4.6
```

The "column-value stretch" annotation goes away; the cell matches the other reviewer-row `Model` values shape-wise. No other cells in the respondent row change (`kind: per-followup-commit`, `identity: gcscode-respondent[bot]`, `secondary model: —`, `targets`, `trigger`, `verdicts`, `character`, `header`, `re-review header: —`, `prompt template` all unchanged).

**`secondary model` cell deliberately kept at `—`.** ADR-0009's "Related" section (under "Queued follow-up iterations enabled by this ADR") anticipated that respondent v2 "will populate the respondent's `model` and `secondary model` columns." v2 fills `model` only; `secondary model` stays `—`. The ADR-0009 anticipation was overreach: it presumed v2 would adopt the multi-model heterogeneous dispatch pattern that red-team uses (Opus 4.7 + Sonnet 4.6 in parallel). v2 explicitly rejects multi-model for the respondent — see Origin: "one model (no multi-model pair — independence-of-opinion is not the respondent's value proposition)." Independence-of-opinion is load-bearing for premise-challenging reviewers (red-team); the respondent's job is documenting controller dispositions, where independence-of-opinion is irrelevant or counterproductive. v2's narrower fill is intentional; the ADR-0009 anticipation was a forward-looking guess that v2 declines to honor.

Full verbatim content in Post-merge implementation > Commit 4b.

### `actor-class: respondent` retention (ADR-0009 boundary-test note)

ADR-0009 Decision 1 introduced a "two-cell-stretch" criterion for warranting a new actor-class: when more than one cell in a candidate row carries a "doesn't apply" or category-stretched value, the row warrants a new actor-class rather than a row under an existing class. ADR-0009's worked example applied this to the respondent: at v1-time the respondent's `model` cell stretched (carried `n/a — controller-direct (...)`) and the `re-review header` cell stretched (carried `—`). Two stretches → new actor-class. That justification was load-bearing on v1's controller-direct state.

After v2's Commit 4b, the `model` cell is filled with `Claude Sonnet 4.6`. Only the `re-review header` cell still carries `—`. Per ADR-0009's own boundary criterion, the respondent now has one cell stretching, which falls below the "two stretches" threshold the ADR set for warranting a separate actor-class.

**v2's call: keep `actor-class: respondent` regardless.** The reason:

**Conceptual distinction is real and orthogonal to cell-stretch count.** A respondent's voice (controller's documented dispositions) is conceptually distinct from a reviewer's voice (independent critique), regardless of whether the structural fields converge. Collapsing respondent into `actor-class: reviewer` with `verdicts: --comment only` would erase a meaningful distinction the registry exists to surface. The cell-stretch count is one signal among several; the conceptual distinction is the load-bearing one for keeping a separate actor-class.

**What v2 does not do.** v2 does NOT make a claim about how ADR-0009's boundary test was "designed" to behave across subsequent cell fills — that's a claim about ADR-0009's intent that ADR-0009 itself does not articulate, and asserting it in v2 would effectively extend ADR-0009 without amending it. v2 takes the narrower position: ADR-0009's test was correctly applied at the time it was written; v2 keeps `actor-class: respondent` on the conceptual-distinction basis above, independent of whether the cell-stretch count technically still satisfies the test. If a future iteration wants to revisit the boundary-test mechanics across cell-fill changes, that's a separate ADR-amendment or ADR-supersession question — not something v2 settles inline.

## Post-merge implementation

Per the post-merge implementation convention, five direct-master commits. All content fully specified verbatim below; no judgment required during implementation.

- **Commit 1:** Create `.claude/agents/respondent.md` with verbatim content below.
- **Commit 2:** Rewrite `.claude/reviewer-prompts/respondent.md` end-to-end with verbatim content below.
- **Commit 3:** Replace CLAUDE.md "Respondent posting discipline" subsection with verbatim content below.
- **Commit 4:** Two CLAUDE.md edits — (4a) "Auto-dispatch controller obligations" bullet 2 rewrite; (4b) agentic-actor registry table respondent-row `model` cell update. Both verbatim below.
- **Commit 5:** Documentation propagation — roadmap.md flip + v1-spec breadcrumb + roadmap.md "v1 propagation gap audit" Considering entry. Verbatim below (four sub-edits: 5a, 5b, 5c, 5d).

### Verbatim — Commit 1 (`.claude/agents/respondent.md`)

Create the new file with the following content:

```md
---
name: respondent
description: Dispatch wrapper for the respondent actor. Role behavior is defined in `.claude/reviewer-prompts/respondent.md`; see the agentic-actor registry in CLAUDE.md for context.
model: sonnet
effort: max
---

You are the respondent for gcscode. Your role and full instructions are in the prompt template at `.claude/reviewer-prompts/respondent.md`. The dispatching controller MUST include the full template content in the user message at dispatch time.

If the user message does NOT contain the template content (you cannot see the role's input format, response format, or posting instructions), STOP. Respond exactly: `ERROR: dispatching controller did not include the respondent prompt template content. Aborting.` Do nothing else — do not post to the PR.

Otherwise: follow the template precisely.
```

### Verbatim — Commit 2 (`.claude/reviewer-prompts/respondent.md` end-to-end rewrite)

Replace the entire current contents of the file with:

````md
# Respondent response template

This file defines the **role and response format** for the respondent subagent on gcscode spec-PRs and ADR-PRs. The respondent is dispatched as a subagent (`subagent_type: respondent`) by the controller after each `Code-review-followup:` commit. The subagent reads structured inputs + fetches prior respondent posts, classifies each finding in the reviewer's most-recent review, posts the response under `gcscode-respondent[bot]`, and returns a one-line summary to the controller.

The dispatching controller MUST include this template content in the user message at dispatch time. The agent-file frontmatter (`.claude/agents/respondent.md`) selects model + effort but does NOT carry the role's instructions — those live here.

## Dispatch substitutions

When dispatching, the controller substitutes:

- `{{PR_NUMBER}}` — the GitHub PR number.
- `{{FOLLOWUP_SHA}}` — the SHA of the `Code-review-followup:` commit this response covers.
- `{{REVIEWER_ROLE}}` — the reviewer role being responded to (`red-team` or `spec-quality`).
- `{{REVIEWER_MODEL}}` — the reviewer model that posted the review (`Claude Opus 4.7` or `Claude Sonnet 4.6`).
- `{{ROLE_LABEL}}` — the role's display form as it appears in review headers, derivable from `{{REVIEWER_ROLE}}`. Specifically: `Red-team` for `red-team`, `Spec-quality` for `spec-quality`. Used inside the "Structured inputs" section's filter regex (which is in the template body below); declared here so the dispatch contract is complete.

## Structured inputs (controller pre-fetches; received inline at dispatch)

The controller pre-fetches and packs the following into the dispatch prompt:

- **Reviewer's most-recent review body** — full markdown content of the review being responded to. Controller fetches via `gh pr view {{PR_NUMBER}} --json reviews` then filters by:

  ```jq
  .reviews[]
  | select(.author.login == "gcscode-reviewer")
  | select(.body | test("^## {{ROLE_LABEL}} review — (spec|ADR)( \\(re-review of [0-9a-f]+\\))? — {{REVIEWER_MODEL}}\\b"))
  ```

  where `{{ROLE_LABEL}}` is `Red-team` or `Spec-quality` (literally) and `{{REVIEWER_MODEL}}` is `Claude Opus 4.7` or `Claude Sonnet 4.6` (literally). The regex covers both spec-PR and ADR-PR artifact kinds AND both initial-review and re-review header forms (re-review headers carry `(re-review of <SHA>) — ` between the artifact-kind word and the model name, so a plain `startswith` of a model-suffix-inclusive prefix would not match re-reviews). When multiple matches exist (re-reviews across rounds), sort by `.submittedAt` descending and take the first. The GitHub reviews API returns reviews in chronological order, but explicit `.submittedAt` sorting is the authoritative selector. Note: `.author.login` for GitHub Apps is the App name without the `[bot]` suffix; the suffix is a UI rendering only.

- **Followup commit diff** — output of `git show {{FOLLOWUP_SHA}}` against the PR's branch.
- **Spec/ADR content** — full markdown content of the spec or ADR file being reviewed. Controller fetches via Read.

Do NOT re-fetch these three inputs via `gh` / `git` / Read — the controller's pre-fetch is authoritative.

## Tool surface (citation verification)

You have read access to the gcscode repo via the standard tool surface (Read, Grep, Bash). Use this access ONLY to verify citations for `intentional, see <X>` dispositions — confirm the cited CLAUDE.md section / ADR slug / spec section exists AND its content matches the disposition's claim. If a citation cannot be verified (cited section absent, or content doesn't match), fall back to the `noted, no current action — citation unverified: <rationale>` disposition variant defined in the Response body structure section below. The `citation unverified` prefix is a deliberate signal that the controller wanted to cite something but the subagent couldn't confirm; the controller (or a future audit) can revisit. Do not use the bare `noted, no current action — <rationale>` form when citation-verification was the reason; the `citation unverified` variant is the discriminator.

Do NOT use the tool surface for any other purpose: do not browse the repo for additional context beyond the structured inputs, do not produce dispositions that aren't grounded in the reviewer's review body, do not investigate alternate framings of the spec. The structured inputs are authoritative for what the response addresses; the tool surface is authoritative ONLY for citation verification.

## Self-fetch (round-aware context)

Before writing your response, fetch prior respondent posts on this PR via:

```bash
gh pr view {{PR_NUMBER}} --json reviews --jq '.reviews[] | select(.author.login == "gcscode-respondent")'
```

Use prior posts to:

- Avoid re-disposing findings already covered in a prior round's response.
- Maintain consistency with prior dispositions where the reviewer's finding spans multiple rounds.
- Detect the oversight pattern (a prior post said "oversight in `<X>`; will address in next followup" — this round's response should update that to `addressed`).

The respondent does NOT re-review its own prior posts. Each followup commit triggers a new, independent response that addresses only the findings raised in the reviewer's most-recent review.

## How to post

```bash
GH_TOKEN=$(.claude/scripts/gh-app-token-respondent) gh pr review {{PR_NUMBER}} --comment --body "$(cat <<'EOF'
<response body, starting with the header below>
EOF
)"
```

Note: although the action is `--comment`, this is the respondent's voice, not a reviewer verdict. The `--comment` verdict is the right plumbing here — there is no separate "post a PR-level non-review comment" subcommand that surfaces as prominently in the PR conversation.

Re-fetch the token via the helper for each invocation; don't rely on environment persistence across bash calls.

## Header (mandatory)

```
## Respondent — re commit {{FOLLOWUP_SHA}} — to {{REVIEWER_ROLE}} review by {{REVIEWER_MODEL}}
```

## Response body structure

Response is structured by finding, mirroring the reviewer's section structure. For each finding in the reviewer's most-recent review (premises, drift items, open questions, structure findings, consistency findings, link findings, etc.), write one disposition line:

```
**Re: <section> <number> — <first few words of the finding to anchor it>:** <disposition>.
```

Use the disposition verb that matches what the followup commit (or prior commits in this iteration) did with the finding:

- `addressed in {{FOLLOWUP_SHA}}` — the followup commit changed something to address this finding. Optionally name the specific change.
- `intentional, see <X>` — the spec/code intentionally does (or doesn't do) the thing; cite the rationale (CLAUDE.md section heading, ADR slug, spec section, prior reviewer's disposition, etc.). The citation MUST exist in the cited source; if you cannot verify the citation while writing the response (the cited section is absent, or its content doesn't match the disposition's claim), fall back to the `noted, no current action — citation unverified: <rationale>` variant below — NOT the bare `noted, no current action — <rationale>` form (the `citation unverified:` prefix is the discriminator that surfaces "wanted to cite but couldn't" for a future audit).
- `routed to docs/roadmap.md as Considering entry "<title>"` — for future-iteration candidates. The actual roadmap edit lands post-merge per the existing propagation pattern.
- `routed to docs/out-of-scope.md` — for cross-cutting architectural deferrals. Edit lands post-merge per propagation.
- `noted as known-unknown #N in spec line <L>` — the spec was updated inline (in this followup or a prior one) to acknowledge this as a known unknown.
- `noted, no current action — <one-sentence rationale>` — read, considered, not acting; rationale provided.
- `noted, no current action — citation unverified: <one-sentence rationale>` — variant of the above used SPECIFICALLY when an `intentional, see <X>` disposition was attempted but the citation could not be verified (cited section absent, or content doesn't match the claim). The `citation unverified:` prefix is mandatory in this variant.
- `accepted; re-review will pick up the diff` — already addressed elsewhere (e.g., another reviewer's followup, or a prior round).
- `oversight in {{FOLLOWUP_SHA}}; will address in next followup` — used when a finding was genuinely missed; the next followup commit's response will update this to `addressed`.

## Closing line

End the response with a one-line numeric summary:

```
Net: <A addressed, B intentional, C routed, D noted, E oversights>
```

Counts everything raised in the most-recent review the response addresses. Gives a numeric audit-trail of dispositions per round.

## Per-followup cadence

A respondent post is per-followup-commit. After the NEXT followup commit, the controller dispatches a NEW respondent subagent for that round, which produces a new response addressing only the items raised in the most recent re-review. Prior respondent posts stay in the PR timeline — they form the audit trail across rounds.

## Initial-review round

The respondent is NOT dispatched on the initial-review round (before any `Code-review-followup:` commit). There is nothing to dispose of yet. The respondent enters AFTER the first followup commit. If dispatched in error (e.g., before any followup commit exists), detect the absence of a `Code-review-followup:` commit in the PR's history (via `gh pr view {{PR_NUMBER}} --json commits` or `git log`) and respond exactly: `ERROR: respondent should not be dispatched on the initial-review round; no followup commit exists. Aborting.` Do not post to the PR.

## Return to controller

After posting the response, return a one-line summary to the dispatching controller:

```
Posted respondent response for {{REVIEWER_ROLE}} ({{REVIEWER_MODEL}}) re {{FOLLOWUP_SHA}}: <A addressed, B intentional, C routed, D noted, E oversights>. PR comment URL: <URL>.
```

This is the only output the controller needs; the response itself lives on the PR as the durable artifact.
````

### Verbatim — Commit 3 (CLAUDE.md "Respondent posting discipline" subsection replacement)

Replace the entire current "Respondent posting discipline" subsection of CLAUDE.md (locate via `grep -n "^### Respondent posting discipline$" shell/CLAUDE.md`; the subsection runs from that header through the line above the next `### ` heading — currently "Reviewer-role design conventions") with:

````md
### Respondent posting discipline

After each `Code-review-followup:` commit on a spec/ADR PR, the controller dispatches **respondent subagents** to post per-finding disposition responses for each reviewer that posted on the PR. The respondent is a distinct GitHub App identity (`gcscode-respondent[bot]`) that documents the controller's per-finding dispositions for the round. The respondent is NOT a reviewer; it has no verdict; it carries the controller's voice for response purposes.

**Dispatch sequence** (controller obligation, integrates with the auto-dispatch obligation):

1. Push the `Code-review-followup:` commit to the PR's branch.
2. Pre-fetch: (a) the 3 most-recent reviewer reviews via `gh pr view <PR> --json reviews` filtered by reviewer-role header prefix + `author.login == "gcscode-reviewer"` (the API returns the App name without the `[bot]` UI suffix; see `.claude/reviewer-prompts/respondent.md` "Structured inputs" for the full filter logic and re-review tie-breaking); (b) the followup commit diff via `git show <SHA>`; (c) the spec/ADR file content via the Read tool.
3. Dispatch 3 `subagent_type: respondent` subagents in parallel — one per reviewer role on the PR (red-team Opus, red-team Sonnet, spec-quality). Each subagent receives: its reviewer's review body + the shared followup diff + the spec/ADR content + the full respondent prompt template (`.claude/reviewer-prompts/respondent.md`) inline. Each subagent fetches prior respondent posts on the PR (round-aware context) as its first step, then posts under `gcscode-respondent[bot]` via the respondent token helper, then returns a one-line summary to the controller.
4. Re-dispatch the 3 reviewer subagents per the existing auto-dispatch obligation. Re-reviewers may engage with the respondent posts (optional engagement; see the reviewer prompts).

**Response header convention** (mandatory):

```
## Respondent — re commit <SHA> — to <reviewer role> review by <reviewer model>
```

Where `<SHA>` is the followup commit, `<reviewer role>` is `red-team` or `spec-quality`, and `<reviewer model>` is the model that posted the review being responded to.

**Token + posting** (the subagent runs this internally):

```bash
GH_TOKEN=$(.claude/scripts/gh-app-token-respondent) gh pr review <PR> --comment --body "..."
```

**Identity:** `gcscode-respondent[bot]`. Distinct from `gcscode-reviewer[bot]`. Same posting permissions on PRs; different audit-trail attribution.

**Subagent dispatch:** `subagent_type: respondent` with the prompt template content inline. The agent file at `.claude/agents/respondent.md` selects model (Claude Sonnet 4.6) + effort (max); the role's instructions live in `.claude/reviewer-prompts/respondent.md`. The subagent inherits the standard tool surface (Read, Grep, Bash) and uses it ONLY to verify citations for `intentional, see <X>` dispositions; structured inputs are authoritative for everything else (see the prompt template's "Tool surface" section). The session-bound agent-file discovery limitation (documented above) applies: the post-merge session that introduces this agent file falls back to `subagent_type: general-purpose` + the prompt template inline for the rest of that session.

**Config:** App ID and installation ID live in `.claude/agent-config.json` under the `respondentApp` key (additive; reviewer's `githubApp` key untouched). Private key path is read from the `GH_RESPONDENT_APP_PRIVATE_KEY_PATH` env var; the PEM file never enters git.

**Open-question routing:** the respondent's response documents each open question's destination. The actual edit to `docs/roadmap.md` or `docs/out-of-scope.md` lands post-merge per the existing propagation pattern. Spec known-unknowns are edited inline as part of the followup commit (existing pattern). There is no dedicated open-question ledger file in v2; route to existing files via documented disposition.

**Initial-review round:** the respondent is NOT dispatched on the initial-review round (before any followup commit). Initial reviews have nothing to dispose of yet. The respondent enters after the first followup commit.

**Discipline note:** dispatching the respondent subagents is the controller's documented disposition step. Skipping it on a followup commit makes the iteration's per-finding dispositions invisible — exactly the gap respondent v1 was introduced to close. Treat the respondent dispatch as required, not optional, on spec/ADR PRs after a followup commit.

**Out of scope for v2:** threaded inline replies on specific review comments (uses review-level comments), required re-reviewer engagement (engagement is optional in v2), a dedicated open-question ledger file (routes to existing files), and consolidation to fewer-than-3 posts per round. Each has its own future-iteration trigger in [`docs/specs/2026-05-16-respondent-subagent-v2.md`](docs/specs/2026-05-16-respondent-subagent-v2.md).

**Public repo note:** as with reviewer posts, respondent posts are world-readable. Keep them professional. Don't paste credentials, internal URLs, or sensitive context.
````

### Verbatim — Commit 4a (CLAUDE.md "Auto-dispatch controller obligations" bullet 2 rewrite)

Replace the existing "After every `Code-review-followup:` commit on a spec/ADR branch:" bullet of the "Auto-dispatch controller obligations" checklist with:

```md
- **After every `Code-review-followup:` commit on a spec/ADR branch:** (a) push the commit, (b) pre-fetch the 3 most-recent reviewer reviews + the followup commit diff + the spec/ADR content (per the filter logic in `.claude/reviewer-prompts/respondent.md` "Structured inputs"), then dispatch 3 `subagent_type: respondent` subagents in parallel per the Respondent posting discipline subsection above — one subagent per reviewer's most-recent review (each subagent posts one comment under `gcscode-respondent[bot]` about THAT reviewer's review), then (c) re-dispatch ALL THREE reviewer roles in parallel. Each role's re-review header includes `(re-review of <SHA>)` where `<SHA>` is the followup commit (existing convention). For the red-team multi-model pair, both Opus and Sonnet re-review independently. Note: a followup that does not touch content any reviewer commented on will still trigger all three re-dispatches AND all three respondent dispatches. v2 accepts the duplicative-review-and-response cost; if the pattern produces material noise, a future iteration can condition the obligations on whether the followup touches reviewed content for each role.
```

Bullets 1 and 3 of the same checklist stay unchanged.

### Verbatim — Commit 4b (agentic-actor registry respondent-row `model` cell update)

In CLAUDE.md's agentic-actor registry table (the 13-column table introduced by ADR-0009's Commit 1, locate via `grep -n "^| Actor class | Role" shell/CLAUDE.md`), replace the respondent row's `Model` cell content:

**Before:**

```
n/a — controller-direct (column-value stretch; v1 limitation; respondent subagent v2 will populate with an actual Claude model)
```

**After:**

```
Claude Sonnet 4.6
```

No other cells in the respondent row change. The mechanical edit: inside the table row beginning with `| respondent  | Respondent          | per-followup-commit...`, the 5th pipe-delimited column (`Model`) is the only edit target.

### Verbatim — Commit 5 (documentation propagation)

Four sub-edits:

**5a: roadmap.md flip.** In `shell/docs/roadmap.md`, move the existing Considering entry for "Respondent subagent v2":

**Pre-edit verification step.** Before deleting, run `grep -n "Respondent subagent v2" shell/docs/roadmap.md` to locate the exact line, and Read the surrounding context to confirm the entry's body still matches the "Before" text below. If the entry's wording has drifted (a prior commit modified it), reconcile manually rather than running a verbatim delete that may match the wrong line.

**Before (in the Considering section, currently around line 81):**

```md
- [ ] **Respondent subagent v2** — addresses the cross-session controller-direct premise accepted as a Day 1 limitation in `specs/2026-05-16-review-discussion-loop-v1.md`. Introduces a dedicated respondent subagent role that reads the followup commit + prior reviews and writes the response with session-independent context. Trigger: first real cross-session PR after `review-discussion-loop-v1` merges that shows reconstruction-cost is material (per that spec's cross-session tripwire).
```

DELETE the above entry from the Considering section, and ADD the following entry to the **Queued** section of the agentic-team architecture track, immediately after the existing "Agentic-team debt-clearing v1 (planning iteration)" `[x]`-marked entry (the entry lives in the "Queued (each needs its own brainstorm + spec cycle)" section despite the `[x]` checkbox; the Queued section's items become `[x]` once they ship). Approximate location: around line 73.

```md
- [x] **Respondent subagent v2** — swaps the controller-direct response writing introduced by `review-discussion-loop-v1` for a `subagent_type: respondent` dispatch (Sonnet 4.6 + effort:max). The controller pre-fetches each reviewer's review body + the followup diff + the spec/ADR content; 3 respondent subagents fire in parallel per followup commit. Closes the cross-session reconstruction-cost limitation accepted as Day 1 in v1. ADR-0009's "column-value stretch" annotation on the respondent row's `model` cell is removed. Spec: [`specs/2026-05-16-respondent-subagent-v2.md`](specs/2026-05-16-respondent-subagent-v2.md).
```

**5b: review-discussion-loop-v1 breadcrumb.** Per the specs-as-historical-record convention (CLAUDE.md "Planning conventions and long-term alignment > Specs as historical record"), append a one-line breadcrumb to the end of the "Cross-session controller-direct response writing is a Day 1 limitation, not a future risk." bullet in the Known Unknowns section of `shell/docs/specs/2026-05-16-review-discussion-loop-v1.md` (currently line 406). Append the following blockquote immediately after that bullet's existing content:

```md
> **respondent-subagent-v2 breadcrumb (added 2026-05-16):** Respondent subagent v2 ([2026-05-16-respondent-subagent-v2.md](2026-05-16-respondent-subagent-v2.md)) ships per the agentic-team debt-clearing v1 commitment ([2026-05-16-agentic-team-debt-clearing-v1.md](2026-05-16-agentic-team-debt-clearing-v1.md))'s queued-item-2 entry. v2 supersedes this bullet's architectural premise: the controller-direct dispatch is replaced by a `subagent_type: respondent` parallel-3 dispatch with controller pre-fetches. The "first real cross-session PR" trigger this bullet anticipated was not the firing signal; the debt-clearing iteration's unconditional drain commitment overrode it.
```

The breadcrumb does NOT modify v1's substantive content (the Day 1 limitation framing is intact; only the trigger anticipation is annotated as superseded). This is the second application of the specs-as-historical-record convention introduced in `2026-05-16-agentic-team-debt-clearing-v1.md` Commit 5 (the first was ADR-0009's number-reservation breadcrumb).

**5c: out-of-scope.md — NO EDIT.** v1's planned `docs/out-of-scope.md` entry ("Respondent subagent dispatch for cross-session consistency") was never landed during v1's post-merge implementation (verifiable: `grep "[Rr]espondent" shell/docs/out-of-scope.md` returns no matches as of this spec's writing). There is nothing to remove. Backfilling-then-removing is silly; v2 simply notes the v1 propagation gap in Known Unknowns and skips the out-of-scope.md edit.

**5d: roadmap.md — add "v1 propagation gap audit" Considering entry.** Append to the agentic-team architecture Considering section. Verbatim text:

```md
- [ ] **v1 propagation gap audit (review-discussion-loop-v1)** — v2's brainstorm surfaced that v1's planned `docs/out-of-scope.md` entries ("Respondent subagent dispatch for cross-session consistency"; "Required re-reviewer engagement with respondent posts") never landed during v1's post-merge implementation; the planned roadmap.md updates may have similar gaps. This audit verifies what v1 planned vs what actually landed across out-of-scope.md and roadmap.md, and backfills where the gap is still load-bearing post-v2. Trigger: ready to address as a quick micro-iteration; no external prerequisite. Surfaced by [`specs/2026-05-16-respondent-subagent-v2.md`](specs/2026-05-16-respondent-subagent-v2.md) Known Unknowns.
```

Pre-edit verification: `grep -n "v1 propagation gap" shell/docs/roadmap.md` should return no matches before the append; if it does, reconcile manually rather than appending a duplicate.

## Data flow — how this iteration ships

1. Brainstorm → spec → spec-PR. **Tenth iteration shipping via the spec-PR workflow.**
2. **On PR open:** red-team Opus + red-team Sonnet + spec-quality auto-dispatch in parallel per the existing obligation.
3. User reads reviews + approves. `Code-review-followup:` commits trigger re-dispatch under the existing pattern. Respondent posts during this PR's review rounds use the **v1 mechanism** (controller-direct) — the v2 agent file + rewritten prompt don't exist until post-merge.
4. User merges via `gh pr merge --merge` or `auto-merge` label (user has granted standing auto-merge permission for queued debt-clearing iterations).
5. Post-merge implementation: five direct-master commits per the post-merge convention.
6. **First spec/ADR PR after merge:** controller dispatches respondent subagents per the new discipline. Plan 1 mechanics smoke test runs first; Plan 2 live workflow exercises on the next real spec/ADR PR.

### In-flight PR transition handling

If a spec/ADR PR is mid-followup-loop when v2's post-merge implementation lands on master (i.e., the PR was opened pre-v2 and has v1-shaped respondent posts in its timeline), the controller's rule is:

- **Finish that PR with the v1 mechanism (controller-direct).** Do not switch dispatch modalities mid-PR. Mixing v1 controller-direct and v2 subagent-dispatched posts in the same PR's review timeline creates audit-trail ambiguity ("which mechanism wrote which post?") without operational benefit.
- **Apply v2 starting with the first PR opened AFTER v2's post-merge implementation lands.** That PR uses subagent dispatch from its first followup commit forward.

This iteration's own PR uses v1 (controller-direct) for its own review rounds, as stated in Data flow step 3 — the v2 agent file + rewritten prompt template don't exist until v2 ships. That precedent is the in-flight-transition rule generalized: PRs spanning the v2 merge boundary stay on whichever mechanism was deployed when they opened.

If a future iteration ships a different transition rule (e.g., "switch mid-PR if the followup commit comes after v2 merges"), it can revise this rule. v2's default is finish-with-what-you-started for legibility.

## Validation

Two plans.

### Plan 1: Mechanics smoke test (next `test/*` PR after merge)

A throwaway test branch validates the subagent dispatch end-to-end.

- **Branch:** `test/respondent-subagent-v2-mechanics` off master (post-merge).
- **Session:** must run in a fresh Claude Code session (post-merge), per the session-bound agent-file discovery limitation. The post-merge implementation session itself cannot dispatch `subagent_type: respondent` — fallback is `subagent_type: general-purpose` + the prompt template inline for that session only.
- **Test actions:**
  1. Open a throwaway PR with a placeholder spec file (e.g., a one-line markdown file).
  2. Push a `Code-review-followup: smoke test` commit to the branch.
  3. Dispatch a single `subagent_type: respondent` subagent with a synthetic reviewer review body + the followup diff + the placeholder spec content packed inline (per the new prompt template's structured-input format).
  4. Verify the subagent: (a) fetches prior respondent posts via gh CLI (none should exist); (b) posts a comment under `gcscode-respondent[bot]` with the header convention; (c) returns the expected one-line summary to the controller.
- **Disposition:** kept open as a permanent reference artifact alongside the existing test-mechanics PRs. NOT merged.

### Plan 2: Live workflow on the next real spec/ADR PR

The first real spec/ADR PR after this iteration ships exercises the new workflow end-to-end. Qualitative gut-check observations (compare to v1 behavior on PRs #11-#15):

- **Reconstruction quality.** Does the subagent's per-finding disposition classification look reasonable to a reader on the merits? Spot-check 3-5 dispositions per PR. **Counterfactual baseline caveat:** after v2 ships, controller-direct responses are no longer being written, so there is no live counterfactual to compare against; the validation is one-sided. A "v2 is meaningfully worse than controller-direct would have been" signal is hard to surface from spot-checks alone — the reviewer reads the respondent's disposition without a parallel "what would the controller have written?" to compare to. The reconstruction-quality tripwire (below) is the failure-detection mechanism v2 relies on; if it fires, the response is escalate-to-Opus or expand-pre-fetch, not "compare to a synthetic shadow baseline." v2 accepts the one-sided-validation cost as the tradeoff for not maintaining a parallel controller-direct artifact post-ship.
- **Citation accuracy.** For `intentional, see <X>` dispositions: does the cited CLAUDE.md section / ADR slug / spec section actually exist AND say what the disposition claims? Or does the subagent hallucinate citations?
- **Oversight identification.** Does the subagent correctly identify oversights (vs claiming `addressed` when the diff didn't actually address the finding)?
- **Round-awareness.** Does the subagent correctly use prior respondent posts? (Should only respond to findings raised in the most recent re-review, not previously-disposed ones.)
- **Token cost.** Roughly doubles per round (3 Sonnet+max subagents on top of 3 reviewer subagents). Acceptable in absolute terms; flagging for cumulative observation.

**Failure response:** if the subagent's reconstruction quality is materially worse than v1's controller-direct, revisit (a) what the controller pre-fetches — perhaps expand inputs to include the full PR commit history, prior round respondent posts as structured input rather than self-fetched, etc.; (b) the model — escalate to Opus 4.7 if Sonnet's reasoning depth is insufficient; (c) revert to controller-direct and reconsider the cross-session premise. Tripwire conditions in the Tripwires section below.

## VS Code alignment

No VS Code alignment implications. Subagent dispatch mechanics for the respondent are a gcscode-specific agentic-team mechanism.

Propagation to `shell/docs/vs-code-alignment.md`: none.

## `docs/out-of-scope.md` propagation

**No edit.** See Post-merge implementation > Commit 5c for the reasoning: v1's planned out-of-scope.md entry was never landed, so v2 has nothing to remove. The v1 propagation gap is noted in Known Unknowns.

## `docs/roadmap.md` propagation

See Post-merge implementation > Commit 5a verbatim. The Considering "Respondent subagent v2" entry is moved to the Queued section, flipped to `[x]`, and the entry text updated to reflect shipped-status (with a link to this spec).

**Additional roadmap.md addition — v1 propagation gap audit (Considering).** v2's brainstorm surfaced that v1's planned `docs/out-of-scope.md` propagation never landed (see Known Unknowns "v1's out-of-scope.md propagation gap"). The audit-the-gap task is in this spec's Future iterations #10, but Future iterations is spec-internal; cross-iteration tracking belongs on the roadmap. Commit 5 sub-edits gain a 5d: append to `docs/roadmap.md` Considering section under the agentic-team architecture track:

```md
- [ ] **v1 propagation gap audit (review-discussion-loop-v1)** — v2's brainstorm surfaced that v1's planned `docs/out-of-scope.md` entries ("Respondent subagent dispatch for cross-session consistency"; "Required re-reviewer engagement with respondent posts") never landed during v1's post-merge implementation; the planned roadmap.md updates may have similar gaps. This audit verifies what v1 planned vs what actually landed across out-of-scope.md and roadmap.md, and backfills where the gap is still load-bearing post-v2. Trigger: ready to address as a quick micro-iteration; no external prerequisite. Surfaced by [`specs/2026-05-16-respondent-subagent-v2.md`](specs/2026-05-16-respondent-subagent-v2.md) Known Unknowns.
```

Net change: 1 Shipped/Queued flip + 1 new Considering entry.

## Known unknowns

- **Cross-session reconstruction quality.** v1's premise was "controller writes from session context"; v2's premise is "subagent reconstructs from structured inputs + PR fetches." Plan 2 validates that v2's reconstruction is at least as good as v1's session-context approach. If not, v2 doesn't solve the cross-session problem — it just moves it. **Tripwire below.**
- **Token cost roughly doubles per round.** 3 Sonnet+max subagents (respondent) on top of 3 reviewer subagents per followup commit. Across a 4-round PR like #11 that's 24 subagent invocations instead of 12. Accepted; flagging.
- **Subagent loses controller's broader context.** The controller (in a live session) may know things the subagent doesn't: "I considered this but rejected it for reason X discussed in chat earlier." The subagent only sees what's structurally in the PR + spec + diff. Some dispositions may be less rich than v1 controller-direct produces. Plan 2 observes whether this matters.
- **Agent-file discovery is session-bound.** Plan 1 runs in a fresh session post-merge (per the limitation documented in CLAUDE.md "Subagent reviewer PR-posting discipline > Agent file discovery is session-bound"). Same constraint that bit PRs #11 and #12.
- **v1's out-of-scope.md propagation gap.** v1's spec planned two `docs/out-of-scope.md` additions ("Respondent subagent dispatch for cross-session consistency"; "Required re-reviewer engagement with respondent posts"); neither landed during v1's post-merge implementation. This is silent v1 tech debt that v2 surfaces but does not backfill. **Question for a future audit:** are there other v1 propagation gaps (e.g., the four planned roadmap.md updates in v1's spec — were all four landed)? Out of scope for v2; surfaced here for visibility.
- **Pre-merge verification structurally skipped.** Same constraint as PRs #11-#15. Five commits land verbatim post-merge. Rollback path: revert 5 commits + restore prior CLAUDE.md / `.claude/agents/` / `.claude/reviewer-prompts/respondent.md` / roadmap / v1-spec state. Bounded.
- **Sonnet 4.6 vs Opus 4.7 for citation accuracy.** v2 selects Sonnet 4.6 + effort:max on the "matches spec-quality pattern" + "independence-of-opinion isn't the value proposition" framing. That framing addresses model-selection-for-disposition-classification but sidesteps citation-verification specifically. Citation verification (read CLAUDE.md / ADRs / sibling specs; cross-check the cited content matches the disposition's claim) is multi-step retrieval-and-reasoning, exactly the kind of task where Opus's depth materially exceeds Sonnet's. The citation-hallucination tripwire fires after N=2 PRs of misuse — if it fires, the response is "escalate to Opus 4.7," not "strengthen the prompt." The model selection is not locked-in; v2 ships on the cheaper assumption with a tripwire-driven escalation path.
- **Token cost not quantified (asymmetric with multi-model v1 rigor).** v2's token-cost discussion is "roughly doubles per round" without prompt-size or response-size estimates. Multi-model v1's spec quantified its per-PR cost step. The asymmetry is acknowledged; v2 ships without the quantification because the cost-magnitude bracket (small per-PR, small per-iteration) is judged adequate. A future iteration could backfill the numbers if cost surveillance becomes operational.
- **v1 emergency fallback accessibility.** v2's Commit 2 rewrites `.claude/reviewer-prompts/respondent.md` end-to-end, overwriting the v1 controller-direct template. The "clean retire" framing in "Why not the bigger version" accepts this — if a future emergency demands controller-direct, it can be done ad hoc. The v1 template content remains accessible via v1's spec ([`2026-05-16-review-discussion-loop-v1.md`](2026-05-16-review-discussion-loop-v1.md) Post-merge implementation > Commit 3 verbatim) and via git history. Surfacing here for visibility: the v1 template is not lost, just not at its original `.claude/` path.
- **ADR-0009 boundary-test longevity across cell-fill changes.** v2's `model` cell fill drops the respondent row's stretch count from two to one. ADR-0009's "two-cell-stretch" test stands as written but its applicability to subsequent cell-fill changes is now an open question: does the test only apply at actor-class introduction, or does it re-fire when a class's cell-fills change later? v2 takes the narrower position (the test was correctly applied at v1-time; v2 keeps `actor-class: respondent` on conceptual-distinction grounds without claiming the test's intended scope), but a future iteration may want to revisit the test's mechanics — either as a clarification to ADR-0009 or as a separate ADR if the question recurs across other actor classes.

## Tripwires for known-quality concerns

Per the design conventions in CLAUDE.md (Reviewer-role design conventions > Tripwires), validation plans should include explicit tripwires for concerns tied to this iteration's specific failure modes:

- **Citation-hallucination tripwire.** If across the first N=2 real spec/ADR PRs the subagent's `intentional, see <X>` dispositions cite CLAUDE.md sections / ADR slugs / spec sections that DO NOT EXIST in the cited source (or whose content doesn't match the disposition's claim), flag that the citation-verification language in the prompt template is insufficient. Response: strengthen the verify-before-using instruction; consider requiring the subagent to quote the cited section in the disposition (forcing verification).
- **Reconstruction-quality tripwire.** If across the first N=2 PRs the subagent's response quality is qualitatively WORSE than a fresh-session-controller's response would be (e.g., generic dispositions where v1 had specific rationale; oversights that v1 controller-direct would have caught), v2's premise is wrong. Response: reconsider — perhaps v2 needs more pre-fetched context (full PR commit history? prior commit messages? all ADRs?), or perhaps the cross-session reconstruction-cost framing was off (controller-direct in fresh sessions is fine).
- **Round-awareness tripwire.** If across the first N=2 PRs the subagent re-disposes findings that were already addressed in a prior round (visible in the audit trail as a duplicate disposition for the same finding number), flag that the self-fetch step (prior respondent posts) isn't producing round-aware behavior. Response: tighten the prompt-template instruction; consider promoting prior-round respondent posts from self-fetch to structured input (controller pre-fetches them).

These tripwires are manual review items, not automated checks; they live in this spec and migrate to the next iteration's brainstorm input if any fires.

## Future iterations

Each gets its own brainstorm when triggered.

1. **Required re-reviewer engagement** with respondent posts — re-reviewer prompts require explicit accept/push-back on each disposition. Carry-forward from v1.
2. **Inline threaded replies via `--reply-to`** — thread responses to specific review comments instead of review-level comments. Carry-forward from v1.
3. **Open-question ledger file** (`docs/reviewer-open-questions.md`) — dedicated catalog for "noted, no current action" items. Carry-forward from v1.
4. **Per-role bot identities for reviewers** — queued #3 in debt-clearing list.
5. **Reviewer routing layer** — queued #4 in debt-clearing list.
6. **Auto-merge-bypasses-final-respondent design** — queued #6 in debt-clearing list.
7. **Initial-review-round respondent commentary** — controller may want to flag intent before writing the followup. Carry-forward from v1.
8. **Respondent posting on feature-PRs** — extend the discipline beyond spec/ADR PRs. Carry-forward from v1.
9. **Consolidation of 3 posts to 1** — if v2's per-round volume becomes operational noise. New trigger.
10. **v1 propagation gap audit** — verify v1's planned propagation (out-of-scope.md and roadmap.md) actually landed; backfill if needed. New, surfaced by v2's brainstorm.

## Origin

Designed in a single brainstorm session on 2026-05-16, immediately after ADR-0009 (queued item #1 of the debt-clearing list) merged. Per the agentic-team debt-clearing v1 commitment, queued items drain sequentially without interleaving; this is queued item #2.

Design refined through three clarifying questions:

- **Scope:** tight (subagent swap only; no bundled fixes). Smallest cut consistent with debt-clearing tempo.
- **Model + effort:** Sonnet 4.6 + effort:max. Matches spec-quality reviewer pattern; one model (no multi-model pair — independence-of-opinion is not the respondent's value proposition).
- **Dispatch shape:** parallel-3 with controller pre-fetches. Mirrors red-team / spec-quality dispatch pattern; subagent fetches only prior respondent posts (round-aware context only).

The v1 propagation gap (Known Unknowns) was an incidental discovery during this iteration's brainstorm — a `grep` against `shell/docs/out-of-scope.md` for v1's planned entry returned nothing, surfacing that v1's post-merge implementation skipped two planned propagation edits. Surfacing the gap is in scope; backfilling is not.
