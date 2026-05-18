# `effort: max` for our custom-dispatched reviewers

**Slug:** effort-max-custom-reviewers
**Iteration on the agentic-team track:** seventh, after [`docs/specs/2026-05-16-multi-model-red-team-v1.md`](2026-05-16-multi-model-red-team-v1.md).
**Type:** two new `.claude/agents/*.md` files + small CLAUDE.md edits. No new logic.
**No bootstrap exceptions.** Spec ships via spec-PR workflow; implementation lands per the post-merge implementation convention.

## Context

The multi-model red-team v1 spec (2026-05-16) named "effort dimension bundled with model defaults" as a known v1 limitation: the `Agent` tool we use for subagent dispatch exposes `model` (opus/sonnet/haiku) but not `thinking_budget` or any direct effort knob. The spec queued "Custom subagent dispatch for effort-level control" as a future iteration that would build a dispatcher hitting the Anthropic API directly — substantial new infrastructure. The current dispatch path doesn't set `subagent_type` explicitly — the controller dispatches via the Agent tool with the full prompt template as the user message, defaulting to `general-purpose`. CLAUDE.md doesn't currently mention `subagent_type: general-purpose` as a stated default; the prior behavior is "no subagent_type specified."

Subsequent investigation surfaced a cleaner path: **Claude Code's `AgentDefinition` supports an `effort` field** in `.claude/agents/<name>.md` frontmatter, with values `low | medium | high | xhigh | max | number`. When a subagent is dispatched via `subagent_type: "<name>"`, the agent file's `effort` field propagates to the dispatched subagent. **No custom dispatcher needed.** This is a much smaller wedge than the queued infra iteration: define custom `subagent_type`s for our reviewer roles with `effort: max` in frontmatter; change the dispatch identifier; done.

This iteration applies `effort: max` to the two roles **we dispatch** via the auto-dispatch obligation in CLAUDE.md: **red-team** and **spec-quality**. The other three reviewer roles (spec-compliance, code-quality, final cross-cutting) are dispatched by `superpowers:subagent-driven-development`, which we don't own. Applying `effort: max` to those is a separate iteration with bigger scope (fork or replace the superpowers dispatch); deferred.

## Why not the bigger version

The bigger version would include:

- `effort: max` on the three feature-PR reviewer roles (spec-compliance, code-quality, final cross-cutting). Requires either patching `superpowers:subagent-driven-development` (we don't own it) or building our own dispatch logic for those roles. Substantial.
- Consolidating prompt template content from `.claude/reviewer-prompts/<role>.md` into the agent file body. Reasonable refactor; deferred to keep this iteration small.
- Tools restriction on reviewer subagents (lock down to read-only). Mild safety improvement; not central to "enable max effort"; deferred.
- Configurable effort per-role (registry column). User explicitly chose "just put it on max" — not configurable. YAGNI.

This iteration ships the smallest concrete wedge: two new agent files with `effort: max`, one tiny dispatch-identifier change in the auto-dispatch obligation prose. Five-minute migration.

## Goals

1. Create `.claude/agents/red-team-reviewer.md` with frontmatter `effort: max`, `model: opus`, and a thin body pointing at the existing `.claude/reviewer-prompts/red-team.md` template.
2. Create `.claude/agents/spec-quality-reviewer.md` with frontmatter `effort: max`, `model: sonnet`, and a thin body pointing at the existing `.claude/reviewer-prompts/spec-quality.md` template.
3. Update CLAUDE.md's auto-dispatch paragraph + controller-obligations checklist to specify the new `subagent_type` names (`red-team-reviewer` and `spec-quality-reviewer`) instead of `subagent_type: general-purpose` with full inline prompt.
4. Multi-model red-team's secondary (Sonnet) dispatch uses `subagent_type: red-team-reviewer, model: sonnet` — the `model` parameter on the Agent tool overrides the agent file's `model` while `effort: max` is inherited.

## Non-goals (this iteration)

Each has its own future trigger.

- **`effort: max` on feature-PR reviewers** (spec-compliance, code-quality, final cross-cutting). These are dispatched by `superpowers:subagent-driven-development`, not by us. Applying `effort: max` requires either forking the superpowers dispatch or replacing it. Trigger: dedicated iteration ("Custom dispatch for feature-PR reviewers") when value is shown.
- **Consolidating prompt templates into agent file bodies.** Agent files stay thin wrappers; prompt templates stay where they are. Trigger: a future cleanup pass.
- **Tools restriction on reviewer subagents.** Agent files omit the `tools:` field; subagents inherit the harness's defaults. Trigger: observed unwanted behavior (reviewer modifying files when it shouldn't).
- **Per-role configurable effort.** v1 is `max` for both red-team and spec-quality, hard-coded in the agent files. No registry column for effort. Trigger: a future iteration concludes per-role effort tuning matters.
- **`effort` field on the reviewer-role registry table.** The existing registry table doesn't gain an `Effort` column; the effort setting lives in the agent file frontmatter, NOT the registry. Rationale: the registry is the source-of-truth for role _behavior_ (what the reviewer does); the agent file is the dispatch _wrapper_ (how the subagent is configured). These are different concerns at different layers. Trigger: enough roles with custom effort settings that a registry column adds clarity.

## Effect on multi-model red-team v1 evaluation (N=5 counter reset)

The multi-model v1 spec (`2026-05-16-multi-model-red-team-v1.md`) defined an N=5 spec/ADR-PR evaluation comparing Opus and Sonnet red-team output. Before this iteration: PR #9 (multi-model v1 spec) and PR #11 (this spec) are both reviewed at **default** effort. After this iteration merges: PRs #12+ are reviewed at **`effort: max`** for both red-team subagents. That's two variables shifting mid-experiment (model dimension × effort dimension) and would compromise the comparability of v1's N=5 evidence if blindly counted across the boundary.

**Resolution: reset the N=5 counter.** Multi-model v1's official N=5 evaluation counts the first FIVE spec/ADR PRs **after this iteration merges**. PR #9 and PR #11 are pre-`effort: max` baseline observations — kept as informal evidence (and useful for the "did effort: max change anything?" question in Plan 2 below), but excluded from the formal N=5 multi-model comparison.

This section is the authoritative reference for the counter reset. To make the reset discoverable from the multi-model v1 spec (the natural starting point for a future evaluation), the post-merge implementation adds a one-line cross-reference pointer to the end of multi-model v1's `Evaluation methodology` subsection (under Architecture) — small editorial pointer, not a content amendment. The substantive evaluation methodology in multi-model v1 stays as the historical record; only a discoverability breadcrumb is added.

## Architecture

Three small changes: two new agent files, two CLAUDE.md edits.

### The two new agent files (verbatim)

The agent body includes a defensive backstop: if the dispatching controller forgets to include the template content in the user message, the subagent should refuse and report rather than improvise role behavior. The body is otherwise a thin wrapper — the prompt template at `.claude/reviewer-prompts/<role>.md` stays the source of truth for role behavior.

**`.claude/agents/red-team-reviewer.md`:**

```md
---
name: red-team-reviewer
description: Dispatch wrapper for the red-team reviewer role. Role behavior is defined in `.claude/reviewer-prompts/red-team.md`; see the registry in CLAUDE.md for context.
model: opus
effort: max
---

You are the red-team reviewer for gcscode. Your role and full instructions are in the prompt template at `.claude/reviewer-prompts/red-team.md`. The dispatching controller MUST include the full template content in the user message at dispatch time.

If the user message does NOT contain the template content (you cannot see the role's checklist, audit-trail format, or verdict instructions), STOP. Respond exactly: `ERROR: dispatching controller did not include the red-team prompt template content. Aborting.` Do nothing else — do not improvise the role, do not post a PR review.

Otherwise: follow the template precisely.
```

**`.claude/agents/spec-quality-reviewer.md`:**

```md
---
name: spec-quality-reviewer
description: Dispatch wrapper for the spec-quality reviewer role. Role behavior is defined in `.claude/reviewer-prompts/spec-quality.md`; see the registry in CLAUDE.md for context.
model: sonnet
effort: max
---

You are the spec-quality reviewer for gcscode. Your role and full instructions are in the prompt template at `.claude/reviewer-prompts/spec-quality.md`. The dispatching controller MUST include the full template content in the user message at dispatch time.

If the user message does NOT contain the template content (you cannot see the structure/link/consistency checklists or verdict instructions), STOP. Respond exactly: `ERROR: dispatching controller did not include the spec-quality prompt template content. Aborting.` Do nothing else — do not improvise the role, do not post a PR review.

Otherwise: follow the template precisely.
```

### Dispatch identifier change

Auto-dispatch on a spec/ADR PR currently dispatches via the Agent tool without specifying `subagent_type` (defaulting to `general-purpose`), with the full prompt template as the user message. After this iteration, it uses the custom subagent_types:

- **Red-team Opus (primary):** `subagent_type: "red-team-reviewer"` — model and effort inherited from frontmatter (`opus`, `max`).
- **Red-team Sonnet (secondary):** `subagent_type: "red-team-reviewer", model: "sonnet"` — model overridden at dispatch; effort still inherited (`max`).
- **Spec-quality:** `subagent_type: "spec-quality-reviewer"` — model and effort inherited from frontmatter (`sonnet`, `max`).

The user-message content (the full prompt template + variable substitutions) does NOT change — the prompt template is still the source of truth for role behavior. Only the dispatch identifier and the implicit effort/model inheritance change.

### CLAUDE.md changes

Two text edits in the "Subagent reviewer PR-posting discipline" subsection (verbatim text below in Post-merge implementation).

**Edit A: "Auto-dispatch on spec/ADR PRs" paragraph.** Update to mention the custom `subagent_type` names. Otherwise unchanged.

**Edit B: "Auto-dispatch controller obligations" checklist bullets.** Update bullet 1 to mention dispatching via the custom subagent_types. Otherwise unchanged.

The reviewer-role registry table stays exactly as-is. The `Prompt template` column still points at `.claude/reviewer-prompts/<role>.md` — those files remain the source-of-truth for role behavior. The agent files are thin dispatch wrappers, not role definitions.

## Post-merge implementation

Per the post-merge implementation convention, four direct-master commits. All content fully specified verbatim above (or below for Commit 4); no judgment required during implementation.

- **Commit 1: Create `.claude/agents/red-team-reviewer.md`** with the verbatim content shown above.
- **Commit 2: Create `.claude/agents/spec-quality-reviewer.md`** with the verbatim content shown above.
- **Commit 3: Two CLAUDE.md edits** — replace the "Auto-dispatch on spec/ADR PRs" paragraph and the **first bullet** of the "Auto-dispatch controller obligations" checklist with the verbatim text below. Bullet 2 of that checklist (`Code-review-followup:` re-dispatch) stays unchanged.
- **Commit 4: Cross-reference pointer in `shell/docs/specs/2026-05-16-multi-model-red-team-v1.md`** — append one footnote-style sentence to the end of the `### Evaluation methodology (load-bearing for v1's value)` subsection (currently at line 102 of the multi-model v1 spec, under `## Architecture`). Verbatim text to append: `> **N=5 counter reset (added 2026-05-16):** Effort-max iteration ([2026-05-16-effort-max-custom-reviewers.md](2026-05-16-effort-max-custom-reviewers.md)) resets this counter at its merge. PR #9 and PR #11 are pre-effort:max baseline observations; the formal N=5 count starts from the first spec/ADR PR after that iteration's merge.`

### Verbatim text — Edit A (Auto-dispatch on spec/ADR PRs paragraph)

```md
**Auto-dispatch on spec/ADR PRs.** When a `spec/<topic>` or `adr/<slug>` PR is opened, the controller automatically dispatches THREE reviewer subagents in parallel: red-team Opus 4.7 (primary), red-team Sonnet 4.6 (secondary, from the registry's `Secondary model` field for red-team), and spec-quality Sonnet 4.6. Dispatch identifiers: `subagent_type: red-team-reviewer` for the primary Opus dispatch, `subagent_type: red-team-reviewer, model: sonnet` for the secondary dispatch (model overridden at dispatch; `effort: max` still inherited from the agent file frontmatter), and `subagent_type: spec-quality-reviewer` for spec-quality. The three subagents dispatch as independent calls; none blocks any other; each posts an independent review under the `gcscode-reviewer[bot]` identity. The two red-team dispatches use the same prompt template (`.claude/reviewer-prompts/red-team.md`) and the same context; only the `model` parameter differs. All three subagents run with `effort: max` per the `effort` field in their agent files (`.claude/agents/red-team-reviewer.md` and `.claude/agents/spec-quality-reviewer.md`). The multi-model pair is an independence-of-opinion experiment from [`docs/specs/2026-05-16-multi-model-red-team-v1.md`](docs/specs/2026-05-16-multi-model-red-team-v1.md) and runs for N=5 spec/ADR PRs before an evaluation iteration decides whether to keep both, revert to single-model, or extend the experiment. All three verdicts are `--comment` only in v1 (advisory). On a `Code-review-followup:` commit to the spec/ADR branch, the controller re-dispatches ALL THREE roles in parallel. Each re-review header includes `(re-review of <SHA>)` where `<SHA>` is the followup commit.
```

### Verbatim text — Edit B (controller obligations bullet 1)

```md
- **Before opening a `spec/<topic>` or `adr/<slug>` PR:** plan to dispatch THREE subagents immediately after `gh pr create`: `subagent_type: red-team-reviewer` (Opus 4.7, effort: max from agent file), `subagent_type: red-team-reviewer` with `model: sonnet` override (Sonnet 4.6, effort: max from agent file), and `subagent_type: spec-quality-reviewer` (Sonnet 4.6, effort: max from agent file). They dispatch in parallel (independent subagents). Do not consider the PR-open step complete until all three have posted their reviews.
```

(Bullet 2 — `Code-review-followup:` re-dispatch — stays exactly as it is; it doesn't mention `subagent_type` specifically.)

## Data flow — how this iteration ships

1. Brainstorm → spec → spec-PR. **Seventh iteration shipping via the spec-PR workflow.**
2. **On PR open: red-team Opus + red-team Sonnet + spec-quality auto-dispatch in parallel** per the current obligation. This PR is reviewed at default effort (the new custom subagent_types don't exist yet — they're what this iteration introduces).
3. User reads reviews + approves. Code-review-followup commits trigger re-dispatch of all three per the existing obligation.
4. User merges via `gh pr merge --merge` or `auto-merge` label.
5. Post-merge implementation: four direct-master commits per the post-merge convention (two agent files, one CLAUDE.md edit, one cross-reference pointer in the multi-model v1 spec).
6. **First spec/ADR PR after merge** uses the new `subagent_type`s and runs at `effort: max`.

## Validation

Two plans, both light.

### Plan 1: Mechanics smoke test (next test/\* PR after merge)

A throwaway test branch verifies the dispatch identifier change works, including the model-override path that multi-model v1 depends on.

- **Branch:** `test/effort-max-validation` off master (post-merge).
- **Content:** a trivial throwaway file.
- **Test actions (three dispatches):**
  1. Dispatch `subagent_type: red-team-reviewer` (primary, Opus inherited from frontmatter, effort: max inherited). Verify (a) the dispatch is accepted by the Agent tool (no "unknown subagent_type" error), (b) the review posts under `gcscode-reviewer[bot]` with the correct header.
  2. Dispatch `subagent_type: red-team-reviewer, model: sonnet` (secondary, model overridden at dispatch time). Verify the dispatch is accepted and the review posts. This is the multi-model-secondary dispatch path; the empirical question is whether `effort: max` survives the model override or gets reset to Sonnet's default. The review's depth/thoroughness (qualitative) is the available signal; the harness does not surface effort directly in the review output.
  3. Dispatch `subagent_type: spec-quality-reviewer`. Verify the dispatch is accepted and the review posts.
- **Note:** confirming `effort: max` actually took effect at runtime is harder than confirming the dispatch succeeded — the subagent's thinking-depth isn't directly observable in the review output. v1 trusts the agent file frontmatter is honored as documented and validates the dispatch identifier mechanics; deep effort verification comes from Plan 2's qualitative observation across multiple real PRs.
- **Disposition:** kept open as the sixth permanent reference artifact (PR #1, #3, #6, #8, #10, this new one). NOT merged.

### Plan 2: Live qualitative observation

Next several spec/ADR PRs after this iteration ships. Qualitative gut-check: do reviews seem deeper, more thorough, more rigorous than the pre-iteration default-effort reviews? Compare against the recent PRs #4, #5, #7, #9, #11 (default effort) as informal baseline.

This dovetails with the multi-model v1 evaluation, whose N=5 counter resets at this iteration's merge (see "Effect on multi-model red-team v1 evaluation" above). Both questions answered by the same set of observations across the first five post-merge spec/ADR PRs:

- (multi-model v1, N=5 post-reset) Do Opus and Sonnet produce distinct findings at `effort: max`?
- (effort v1) Do max-effort reviews seem materially deeper than the pre-iteration default-effort baseline (PRs #9 and #11 being the closest comparables — same iteration shape, default effort)?

**Failure response:** if `effort: max` reviews are NOT noticeably better than default-effort, document the finding. The agent file frontmatter is the source of the setting; future iterations could investigate whether the harness honors `effort: max` correctly or whether the doc's claims about effort propagation hold in practice. If the frontmatter `effort` field is confirmed to be a no-op (reviews unchanged AND no harness log signal that effort took effect), open a dedicated investigation iteration: the shipped agent files would need a different mechanism, and the out-of-scope/roadmap reframing ("rationale invalidated by smaller wedge") would need to be revised — the wedge didn't actually do anything.

## VS Code alignment

No VS Code alignment implications. Subagent effort tuning is a gcscode-specific agentic-team mechanism.

Propagation to `shell/docs/vs-code-alignment.md`: none.

## `docs/out-of-scope.md` propagation

The existing "Effort-level control in reviewer dispatch" deferral (added by the multi-model v1 spec) is now **partially resolved** for our custom-dispatched roles (red-team + spec-quality). Update its text to reflect:

- What ships now: red-team and spec-quality reviewers run at `effort: max` via `.claude/agents/<name>.md` frontmatter — a much smaller wedge than the originally-deferred "build a custom Anthropic API dispatcher" item. The original deferral's rationale (custom-API-dispatcher infra needed) is **invalidated**, not just deferred — agent-file frontmatter does the job without new infrastructure.
- What remains deferred: effort control on feature-PR reviewers (spec-compliance, code-quality, final cross-cutting), which are dispatched by `superpowers:subagent-driven-development` and not under our control. Trigger to revisit: dedicated iteration when we choose to fork/replace the superpowers dispatch.

## `docs/roadmap.md` propagation

Three updates:

1. **Add a Shipped entry for this iteration** — `effort: max for custom-dispatched reviewers` under the agentic-team track's Shipped list (consistent with the other shipped iterations on that track).
2. **Update the "Custom subagent dispatch for effort-level control" Considering entry** — the original entry was framed around building a custom Anthropic API dispatcher (much bigger scope); the smaller wedge (using `.claude/agents/` frontmatter `effort: max` for our custom-dispatched roles) shipped via this iteration. The remaining open question is effort control on feature-PR reviewers (superpowers-dispatched), which is now its own queued candidate. Reframe the entry as "partially resolved: red-team and spec-quality now have `effort: max` via agent-file frontmatter; feature-PR reviewers (spec-compliance, code-quality, final cross-cutting) remain at default effort". The original entry's rationale (Anthropic-API-direct dispatcher) is **invalidated** — the small wedge made it unnecessary — not just "superseded".
3. **Add a new Considering entry: "Custom dispatch for feature-PR reviewers"** — separate iteration to bring `effort: max` (or other custom configuration) to spec-compliance, code-quality, and final cross-cutting reviewers, which are currently dispatched by `superpowers:subagent-driven-development` and not under our control.

## Known unknowns

- **Does `.claude/agents/<name>.md` frontmatter actually honor `effort: max` end-to-end?** Investigation confirmed it's documented to work; v1 trusts the documentation. Plan 1's smoke test validates the dispatch identifier; Plan 2's qualitative observation across post-merge PRs validates whether reviews actually deepen.
- **Does `effort: max` produce noticeably better reviews?** Subjective question; Plan 2's qualitative observation answers it. Could be that the harness's default effort is already "max" in practice for the models we use (Opus 4.7's deprecated-manual-thinking note hints at this), in which case `effort: max` is a no-op.
- **Does the `model` override at dispatch time correctly preserve `effort` from the agent file?** Specifically: when we dispatch `subagent_type: red-team-reviewer, model: sonnet`, does the Sonnet subagent run with `effort: max` (from the agent file) or does the model override reset to defaults? Plan 1's three-dispatch smoke test exercises this path explicitly. The multi-model red-team Sonnet dispatch on the first real spec/ADR PR fully answers it through qualitative review-depth observation.
- **Cost increase.** `effort: max` likely increases per-dispatch cost (more thinking tokens). Across red-team-Opus + red-team-Sonnet + spec-quality on every spec/ADR PR, the increase compounds. Worth monitoring; future iteration could refine to per-role effort if cost becomes a concern.
- **Pre-merge verification is structurally skipped.** The spec-PR workflow puts the new agent files into the world only after merge (verbatim spec → post-merge implementation convention). Pre-merge dispatch of `subagent_type: red-team-reviewer` is impossible because the agent file doesn't exist until Commit 1 of post-merge lands. Plan 1's smoke test therefore runs post-merge. Accepted trade-off; if Plan 1 surfaces a frontmatter no-op, the rollback work is non-trivial (revert all four post-merge commits; restore the prior out-of-scope and roadmap framing). Future iterations could explore a different shipping shape (e.g., land agent files in a feat branch with a smoke test before the verbatim-spec wedge) if this trade-off becomes painful.

## Why no ADR for `.claude/agents/` structural layer

[`ADR-0008`](../decisions/ADR-0008-reviewer-role-registry.md) covered the reviewer-role registry as the source-of-truth for role behavior. The agent files this iteration adds are dispatch wrappers around that registry — they don't introduce a new architectural concept, just use Claude Code's own subagent-definition mechanism to set `effort` and `model` defaults at dispatch identifier level. The prompt template remains the source-of-truth for role behavior; the agent body is a thin defensive shim and the `description` frontmatter field is kept short (dispatch-wrapper language only) to minimize the coordinated-text surface. No new ADR needed; if the agent files ever grow to carry role behavior (e.g., the deferred "consolidate prompt templates into agent file bodies" future iteration), THAT iteration would warrant an ADR update or supersede.

## Future iterations

Each gets its own brainstorm when triggered.

1. **Custom dispatch for feature-PR reviewers** — apply `effort: max` (and any other customizations) to spec-compliance / code-quality / final cross-cutting reviewers. Requires forking or replacing the `superpowers:subagent-driven-development` dispatch logic. Substantial.
2. **Consolidate prompt templates into agent file bodies** — single-file-per-role refactor. `.claude/reviewer-prompts/` directory retires. Cleaner long-term.
3. **Tools restriction on reviewer subagents** — lock down agent files' `tools:` field to a read-only set (Bash, Read, Grep, Glob; exclude Edit/Write). Mild safety improvement.
4. **Per-role configurable effort** — registry column or per-agent-file effort tuning if max-everywhere proves too expensive or non-uniform tuning produces better results.
5. **Convert spec-quality's mechanical checks to a script** (already queued from the spec-quality spec) — orthogonal to effort but related architectural direction.

## Origin

Surfaced during the multi-model red-team v1 brainstorm (2026-05-16): the user asked "we also give an effort level with the model, do we do this for our reviewers as well?" The answer at the time was no — the Agent tool doesn't expose `thinking_budget` directly. Multi-model v1 documented "effort dimension bundled with model defaults" as a known limitation and queued a future iteration ("Custom subagent dispatch for effort-level control") for it. That queued iteration was framed as "build a custom dispatcher hitting the Anthropic API directly" — substantial new infrastructure.

After multi-model v1 shipped (2026-05-16), the user asked "what do we need to do to get the effort level in? I don't need it configurable, i think it'd make sense to just put it on max." Follow-up investigation via `claude-code-guide` surfaced that Claude Code's `AgentDefinition` supports an `effort` field in `.claude/agents/<name>.md` frontmatter, propagated via `subagent_type`. This is a **much smaller wedge** than the queued infra iteration — no custom dispatcher needed. This iteration takes the smaller path.

The investigation's findings also confirmed that:

- The Agent tool itself doesn't expose `effort` directly as a parameter; you set it via the agent file frontmatter that the subagent_type references.
- Opus 4.7 deprecated manual thinking control in favor of adaptive thinking. So even if we hit the Anthropic API directly, "max effort" is a different thing now than it would have been a few model generations ago.
- The `effort` field is Claude Code's own behavior dial — depth of reasoning, possibly extended thinking, possibly token allocation — not strictly equivalent to the Anthropic API's `thinking_budget`. So this iteration ships Claude-Code-effort-max for our custom-dispatched roles, which is what we have access to.
