# ADR-0009: Agentic-actor registry

**Date:** 2026-05-16
**Status:** Accepted
**Supersedes:** [ADR-0008 (Reviewer-role registry)](ADR-0008-reviewer-role-registry.md)

## Context

ADR-0008 (2026-05-14) introduced a **reviewer-role registry** as the source-of-truth for reviewer subagent role definitions: a flat 11-column table where each row was a reviewer role, all sharing the single `gcscode-reviewer[bot]` GitHub App identity. The registry's framing assumed all rows were **reviewer roles** — subagents that post reviews under reviewer voice.

Two subsequent iterations stretched that framing:

- **PR #11 (effort-max-custom-reviewers, 2026-05-16):** introduced `.claude/agents/<name>.md` dispatch wrappers for reviewers, with `effort: max` and per-role `model` defaults. Added a 12th column (`secondary model`) for the multi-model red-team experiment. Still strictly reviewer-shaped.
- **PR #12 (review-discussion-loop-v1, 2026-05-16):** introduced a new GitHub App identity `gcscode-respondent[bot]` that posts the controller's per-finding dispositions on spec/ADR PRs after each `Code-review-followup:` commit. The respondent is **not a reviewer**: it has no verdict, no model dispatch (controller-direct in v1), no `targets`-as-a-reviewer-role semantics. Yet it shares structural needs with reviewers — identity, header convention, trigger, prompt template, audit-trail attribution.

After PR #12, the project has two **actor classes** posting on PRs: reviewer roles (existing, under `gcscode-reviewer[bot]`) and a respondent (new, under `gcscode-respondent[bot]`). ADR-0008's "reviewer-role registry" framing no longer covers the full set of agentic actors the architecture supports.

The agentic-team-debt-clearing iteration ([`docs/specs/2026-05-16-agentic-team-debt-clearing-v1.md`](../specs/2026-05-16-agentic-team-debt-clearing-v1.md), 2026-05-16) called for ADR-0008's supersession to broaden the registry's scope to agentic actors in general. This ADR makes that call concrete.

## Decision

We supersede ADR-0008 with an **agentic-actor registry**. The registry has the same source-of-truth role as ADR-0008's reviewer-role registry, with three changes:

**1. Concept introduction.** An **agentic actor** is any GitHub App identity (or future identity class) that posts on PRs under an autonomous-or-semi-autonomous flow. v1 defines two **actor classes**:

- `reviewer` — the existing reviewer roles (spec-compliance, code-quality, final cross-cutting, red-team, spec-quality). Posts reviews with verdicts; reads artifact + priors; produces structured critique.
- `respondent` — the new controller-voice actor introduced by PR #12. Posts per-finding dispositions after `Code-review-followup:` commits; no verdict beyond `--comment`; documents what was addressed, deferred, or routed.

Future iterations may add more actor classes (e.g., devil's advocate v2 may be its own class if its dispatch shape differs structurally from reviewer).

**When to add a new actor-class vs a new row under an existing class.** A new actor-class is warranted when the structural fields the actor needs differ enough from existing classes that more than one cell carries a "doesn't apply" or category-stretched value. If a new actor fits the existing reviewer or respondent column semantics (model is a Claude model, verdicts come from the existing set, trigger uses existing vocabulary), it gets a new row under an existing class. If multiple cells stretch (a controller-action-bot with no model, no verdict, no character — only identity + trigger + prompt template apply), it warrants a new actor-class. Borderline cases get brainstormed in the iteration that introduces the new actor; this ADR establishes the framing, not a closed taxonomy.

**Applied to respondent:** Two cells genuinely stretch under the criterion above — `model` (annotated as column-value stretch awaiting v2; carries a "doesn't apply" value where a Claude model identifier is expected) and `re-review header` (annotated as "—" with explicit note that respondent doesn't re-review; the column's semantic doesn't apply since respondent posts a new comment per followup, not a re-review). Two stretches > one → warrants a new actor-class. (Separately, the `kind` cell carries a new enum value `per-followup-commit` — that's a vocabulary extension of the column's enum, not a "doesn't apply" stretch; it's noted here for completeness but is not part of the boundary test's count.) Hence: `actor-class: respondent`, not a new row under `reviewer`. The test's application to the respondent is the v1 worked example for future actor authors.

**2. Registry schema: one combined table, one new column.** The registry table keeps all 12 existing columns from PR #11's evolution of ADR-0008. One new column is prepended:

| Field          | Purpose                                                                                            |
| -------------- | -------------------------------------------------------------------------------------------------- |
| `actor-class`  | **NEW.** Classifies the row: `reviewer` / `respondent` / future. First column of the table.        |

The 12 existing columns (`name`, `kind`, `identity`, `model`, `secondary model`, `targets`, `trigger`, `verdicts`, `character`, `header`, `re-review header`, `prompt template`) stay verbatim. Reviewer-class rows keep their existing values unchanged.

**3. Respondent row added.** The registry gains a 6th row for the respondent actor with these values:

| Column            | Value                                                                                                |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| `actor-class`     | `respondent`                                                                                         |
| `name`            | Respondent                                                                                           |
| `kind`            | `per-followup-commit` (new enum value; extends the existing `{per-task, cross-cutting, per-artifact}` set) |
| `identity`        | `gcscode-respondent[bot]`                                                                            |
| `model`           | `n/a — controller-direct` (column-value stretch; v1 limitation; respondent subagent v2 will populate with an actual Claude model)|
| `secondary model` | —                                                                                                    |
| `targets`         | `spec-PR, ADR-PR` (v1 scope; review-discussion-loop-v1's Future iterations contemplates feature-PR extension which would expand this cell) |
| `trigger`         | `After each Code-review-followup commit`                                                             |
| `verdicts`        | `--comment` only (advisory; respondent has no review verdict)                                        |
| `character`       | Controller's per-finding dispositions; documents what was addressed, deferred, routed, or noted      |
| `header`          | `## Respondent — re commit <SHA> — to <reviewer role> review by <reviewer model>`                    |
| `re-review header` | — (the respondent does NOT re-review its own prior posts; each followup commit triggers a new respondent post with the standard header above, NOT a re-review of a prior respondent post) |
| `prompt template` | `.claude/reviewer-prompts/respondent.md`                                                             |

The respondent's role definition (the response format, disposition vocabulary, per-followup cadence, initial-review-round exclusion) lives in `.claude/reviewer-prompts/respondent.md`, identical convention to reviewer prompts.

**4. Migration.** All five existing reviewer-role rows in CLAUDE.md gain `actor-class: reviewer` as their first column value. No other field changes. Zero behavior change at runtime — the existing rows describe the same roles, dispatched the same way, by the same controllers.

**5. Supersession mechanics.** Standard Nygard supersession:

- ADR-0008's filename and content stay; its `**Status:**` field flips from `Accepted` to `Superseded by ADR-0009` with a one-line breadcrumb to this ADR.
- This ADR (ADR-0009) opens with `**Supersedes:**` pointing back to ADR-0008.
- No filename variants. No `ADR-0008-a` patterns. Industry-standard supersession only.

**Why supersession rather than extension-in-place.** Extension-in-place (editing ADR-0008 to broaden its scope) is the alternative. We chose supersession because:

1. **ADR-0008's framing is genuinely outdated, not just narrower.** Its title is "Reviewer-role registry"; its prose repeatedly says "reviewer role" as the unit of registry content. Editing it to mean "agentic actor" makes the historical record ambiguous about what the 2026-05-14 iteration actually decided.
2. **Supersession is the standard pattern for a scope-broadening change.** Extension-in-place is appropriate for clarifications, factual corrections, or adding rows to an existing class. ADR-0009 introduces a new actor class (respondent), a new column (`actor-class`), and changes the registry's conceptual root (reviewer roles → agentic actors). That's an architectural pivot, not a clarification.
3. **First-supersession precedent matters.** This is the first ADR supersession in gcscode. Setting the bar at "scope-broadening change" rather than "any change" keeps the supersession machinery available for cases that genuinely need a fresh historical record, and avoids it becoming a tool for routine clarifications.

The specs-as-historical-record convention (CLAUDE.md "Planning conventions and long-term alignment > Specs as historical record") applies the same logic at the spec level: substantive revisions get successor specs; factual corrections get inline edits. Supersession is the ADR-level expression of the same principle.

## Post-merge implementation

Per the post-merge implementation convention, four direct-master commits. All content fully specified verbatim below; no judgment required during implementation (the Commit 3 occurrence-by-occurrence dispositions remove the implementer-judgment risk red-team Sonnet flagged in re-review of 392b972).

- **Commit 1: Replace the "Reviewer-role registry" header + table in CLAUDE.md** with the agentic-actor registry header + 13-column table (prepended `actor-class` column; existing 5 rows gain `reviewer` value; new respondent row added). Verbatim text below.
- **Commit 2: Update the denormalized verdict-permission table in CLAUDE.md** to add a respondent row. Verbatim text below.
- **Commit 3: Update CLAUDE.md prose references** to the registry's name and the ADR-0008 reference. Per-occurrence dispositions specified verbatim below (rename / keep / replace, per the table).
- **Commit 4: Add path-naming-rename Considering entry to roadmap.md** — honors the routing disposition documented in the prior round's respondent post for the `.claude/reviewer-prompts/` directory-name-vs-content drift (the directory carries `reviewer-prompts` but now houses the respondent prompt too). Verbatim text below.

### Verbatim — Commit 1 (replace the registry header + table)

Replace the existing "Reviewer-role registry" header + table at lines 111-119 of CLAUDE.md (the line numbers verified at implementation time; locate via `grep "Reviewer-role registry\." shell/CLAUDE.md`) with the content below.

**Cell-value convention note for the respondent row:** the Decision section's Respondent row (above in this ADR) carries inline annotations like `(column-value stretch; v1 limitation; respondent subagent v2 will populate with an actual Claude model)`. The Commit 1 verbatim below keeps the SAME cell values but with the annotations preserved. The CLAUDE.md table is wider as a result, but this preserves the architectural information in the operational reference; truncating it at implementation time would lose the "why" of the column-value stretches.

````md
**Agentic-actor registry.** Source of truth for agentic-actor definitions (reviewers + non-reviewer controller-voice actors). The verdict table below is a denormalized quick-reference view of the registry. Architectural rationale: [`docs/decisions/ADR-0009-agentic-actor-registry.md`](docs/decisions/ADR-0009-agentic-actor-registry.md) (supersedes [ADR-0008](docs/decisions/ADR-0008-reviewer-role-registry.md)). Prompt templates: `.claude/reviewer-prompts/<name>.md`.

| Actor class | Role                | Kind                  | Identity                  | Model                                          | Secondary model   | Targets         | Trigger                              | Verdicts                         | Character                                                          | Header                                                       | Re-review header                                                                | Prompt template                                                           |
| ----------- | ------------------- | --------------------- | ------------------------- | ---------------------------------------------- | ----------------- | --------------- | ------------------------------------ | -------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| reviewer    | Spec-compliance     | per-task              | `gcscode-reviewer[bot]`   | Claude Sonnet 4.6                              | —                 | feature-PR      | After each task commit               | `--comment`, `--request-changes` | Verify implementation matches the task's spec slice                | `## Spec-compliance review — task <N> — Claude Sonnet 4.6`   | `## Spec-compliance review — task <N> (re-review of <SHA>) — Claude Sonnet 4.6` | `superpowers:subagent-driven-development/spec-reviewer-prompt.md`         |
| reviewer    | Code-quality        | per-task              | `gcscode-reviewer[bot]`   | Claude Sonnet 4.6                              | —                 | feature-PR      | After spec-compliance passes         | `--comment`, `--request-changes` | Code quality, idioms, edge cases                                   | `## Code-quality review — task <N> — Claude Sonnet 4.6`      | `## Code-quality review — task <N> (re-review of <SHA>) — Claude Sonnet 4.6`    | `superpowers:subagent-driven-development/code-quality-reviewer-prompt.md` |
| reviewer    | Final cross-cutting | cross-cutting         | `gcscode-reviewer[bot]`   | Claude Opus 4.7                                | —                 | feature-PR      | End of iteration                     | `--request-changes`, `--approve` | Cross-cutting concerns missed at per-task level                    | `## Final cross-cutting review — Claude Opus 4.7`            | `## Final cross-cutting review (re-review of <SHA>) — Claude Opus 4.7`          | `superpowers:requesting-code-review/code-reviewer.md`                     |
| reviewer    | Red-team            | per-artifact          | `gcscode-reviewer[bot]`   | Claude Opus 4.7                                | Claude Sonnet 4.6 | spec-PR, ADR-PR | Automatic on PR open                 | `--comment` only (v1)            | Premise challenger + consistency reviewer                          | `## Red-team review — <spec or ADR> — Claude Opus 4.7`       | `## Red-team review — <spec or ADR> (re-review of <SHA>) — Claude Opus 4.7`     | `.claude/reviewer-prompts/red-team.md`                                    |
| reviewer    | Spec-quality        | per-artifact          | `gcscode-reviewer[bot]`   | Claude Sonnet 4.6                              | —                 | spec-PR, ADR-PR | Automatic on PR open                 | `--comment` only (v1)            | Document structure + within-document consistency + link mechanics  | `## Spec-quality review — <spec or ADR> — Claude Sonnet 4.6` | `## Spec-quality review — <spec or ADR> (re-review of <SHA>) — Claude Sonnet 4.6` | `.claude/reviewer-prompts/spec-quality.md`                                |
| respondent  | Respondent          | per-followup-commit (new enum value; extends `{per-task, cross-cutting, per-artifact}`) | `gcscode-respondent[bot]` | n/a — controller-direct (column-value stretch; v1 limitation; respondent subagent v2 will populate with an actual Claude model) | — | spec-PR, ADR-PR (v1 scope; review-discussion-loop-v1's Future iterations contemplates feature-PR extension) | After each Code-review-followup commit | `--comment` only (advisory; not a review verdict) | Documents controller's per-finding dispositions; documents what was addressed, deferred, routed, or noted | `## Respondent — re commit <SHA> — to <reviewer role> review by <reviewer model>` | — (the respondent does NOT re-review its own prior posts; each followup commit triggers a new respondent post with the standard header above, NOT a re-review of a prior respondent post) | `.claude/reviewer-prompts/respondent.md` |
````

### Verbatim — Commit 2 (verdict-permission table addition)

Append the following row to the verdict-permission table in CLAUDE.md (locate via `grep "Spec-quality (per-artifact" shell/CLAUDE.md`, append immediately after that row):

````md
| Respondent (per-followup-commit, spec/ADR-PRs) |      ✓      |          ✗          |      ✗      |
````

### Verbatim — Commit 3 (prose reference updates)

Prose-only updates in CLAUDE.md. `grep "reviewer-role registry\|Reviewer-role registry" shell/CLAUDE.md` surfaces SEVEN occurrences. The following per-occurrence dispositions are mechanical (no implementer judgment):

| Approx line | Context | Disposition |
| --- | --- | --- |
| 81 | "...receive a red-team auto-dispatched review per the reviewer-role registry. Plans continue to land on master directly." | **Rename** to "agentic-actor registry" (registry-as-a-whole reference) |
| 111 | Registry table header `**Reviewer-role registry.**` | **Already covered by Commit 1** (the full header + table is replaced) |
| 199 | "Red-team auto-dispatches on PR open per the reviewer-role registry." | **Rename** to "agentic-actor registry" (registry-as-a-whole reference) |
| 250 | "When designing a new reviewer role (devil's advocate v2, expert reviewers, future expansions of the reviewer-role registry), apply these conventions." | **Keep as-is** — the section is specifically about reviewer-role design (one actor-class); the "reviewer-role registry" reference here is to the reviewer subset of the registry, not the registry-as-a-whole |
| 256 | "**`identity` field in the registry, even when all roles share one bot.** Every entry in the reviewer-role registry carries an `identity` field." | **Keep as-is** — the surrounding section is reviewer-role-specific (talks about "all roles share `gcscode-reviewer[bot]`"); the reference is to the reviewer subset |
| 262 | "The reviewer-role registry's `trigger` field declares WHEN a role fires..." | **Rename** to "agentic-actor registry's" (registry-as-a-whole field reference) |
| 301 | Further reading entry: "second iteration of the agentic-team-architecture track: red-team reviewer on spec/ADR PRs + reviewer-role registry." | **Keep as-is** — historical reference to what the 2026-05-14 red-team-reviewer iteration introduced; renaming would falsify the historical record per the specs-as-historical-record convention |

**Edit B: Further reading section update (CLAUDE.md ~line 302).** The existing Further reading entry `docs/decisions/ADR-0008-reviewer-role-registry.md — registry pattern decision; source of truth for reviewer role definitions.` is **replaced** with:

````md
- `docs/decisions/ADR-0009-agentic-actor-registry.md` — registry pattern decision; source of truth for agentic-actor definitions (reviewers + non-reviewer controller-voice actors). Supersedes ADR-0008 (which remains in `docs/decisions/` as the historical record).
````

**Edit C.** Add an explicit cross-link inside the new "Agentic-actor registry" section (the one Commit 1 replaces the old reviewer-role header with): append the following sentence to the end of the **note paragraph** that introduces the registry table (the prose paragraph immediately above the table itself, which Commit 1 verbatim updates):

````md
The respondent row's dispatch mechanics + posting discipline are documented in the "Respondent posting discipline" subsection (located below this section in CLAUDE.md); the registry row is the source of truth for the respondent's structural fields (identity, trigger, header, prompt template), while the posting discipline subsection covers the controller's operational obligation to post after each `Code-review-followup:` commit.
````

**Edit D.** No changes to existing reviewer prompt files (`.claude/reviewer-prompts/red-team.md`, `.claude/reviewer-prompts/spec-quality.md`, `.claude/reviewer-prompts/respondent.md`) — those documents are role-specific, and the registry rename doesn't affect their content.

### Verbatim — Commit 4 (roadmap.md path-naming-rename Considering entry)

Append the following Considering entry to `shell/docs/roadmap.md` under the agentic-team-architecture Considering section, immediately after the existing "Tripwire condition (iii) compliance" entry:

````md
- [ ] **`.claude/reviewer-prompts/` directory rename** — micro-iteration. The directory carries `reviewer-prompts` but now houses non-reviewer prompts too (`.claude/reviewer-prompts/respondent.md` was added by PR #12). Either rename `.claude/reviewer-prompts/` → `.claude/agentic-actor-prompts/` (or similar) and update all references (CLAUDE.md, the registry's `prompt template` column, ADR-0009's prompt-template path references, plus the `.claude/agents/*-reviewer.md` files' `prompt template` body references), OR accept the directory-name-vs-content drift as cosmetic. Trigger: ready to address as a quick micro-iteration; no external prerequisite. Routed here from ADR-0009's red-team Opus review (PR #15 initial review, 2026-05-16).
````

## Alternatives considered

**Split the registry into two tables (one per actor class).** Maintain `reviewer-role registry` and `non-reviewer actor registry` as separate tables in CLAUDE.md, each with columns shaped for that class. Pro: each table is tight; no empty cells. Con: two registries to maintain; future readers need to know which actors live where; cross-class consistency (header convention, identity, trigger) is harder to enforce. Rejected: single source of truth is more legible at the current scale (2 actor classes); future iterations can split if class divergence makes one table unwieldy.

**Conditional-column markup (some columns marked `(reviewer-only)`).** Keep one table; mark columns like `verdicts`, `character`, `model` as `(reviewer-only)` in the header. Hybrid between full-shared and full-split. Rejected: most columns DO apply to both classes (identity, kind, header, prompt template); the `model` column is the only true reviewer-specific concept and we resolved it inline (`n/a — controller-direct` for v1). A hybrid signaling scheme would be ceremony without value.

**Sidebar / separate section for respondent instead of registry inclusion.** Keep the existing 12-column reviewer table exactly as-is; document respondent as a parallel actor in a separate CLAUDE.md section. Rejected: violates the source-of-truth purpose of the registry. A reader looking for "what agentic actors post on PRs?" should find one enumeration, not multiple. The cost of one new column to keep one table comprehensive is small.

**Pre-emptively design dispatch-mechanism column (anticipating respondent subagent v2).** Add a new column for "dispatch mechanism" (`subagent` / `controller-direct` / future) now, so v2 doesn't need a schema change. Rejected per the "comfortable tempo, small focused iterations" preference: v1 has only `n/a — controller-direct` as the value, and v2 hasn't been designed. Adding a column now without a real range of values is YAGNI. v2's iteration adds the column if needed.

**Bundle per-role-bot-identities into ADR-0009.** Decide here that future agentic-actor identities should be per-role (not shared like the existing `gcscode-reviewer[bot]`). Rejected: the per-role-bot-identities iteration is a separate queued item (`Per-role bot identities for reviewers` on roadmap.md Considering, post-respondent-v2-trigger). ADR-0009 stays strictly about registry shape; identity-per-role is its own brainstorm with its own trade-offs.

## Consequences

**Positive:**

- Single registry covers all actors that post on PRs. A reader/controller asking "what agentic identities does gcscode use?" finds the complete list in one table.
- The `actor-class` column makes class boundaries explicit. Future iterations adding new actor classes (e.g., a domain-expert reviewer if its dispatch shape needs new fields, or a future controller-action-bot) extend the column's enum value space rather than restructuring the table.
- Respondent's structural commonality with reviewers (identity, header, trigger, prompt template) is captured by reusing the registry's existing columns. The architecture has one pattern for "agentic actor on PRs," not two.
- ADR-0008's positive consequences (single-place-to-look, denormalized-view-from-registry, identity field-in-place) all extend to non-reviewer actors.

**Negative:**

- Respondent's `model` cell carries a non-model value (`n/a — controller-direct`). The cell uses a workaround until respondent subagent v2 lands with a real model. Mitigation: the value is explicit and references the future iteration; not silently empty.
- The `re-review header` field is `—` for respondent because the respondent re-posts per followup commit (a new post, not a re-review). A reader has to understand this from the `kind: per-followup-commit` + the response-template documentation. Mitigation: documented in the prompt template.
- Existing reviewer rows must all gain a new column value (`actor-class: reviewer`). Mechanical edit; zero behavior change but a non-trivial CLAUDE.md diff.

**Neutral:**

- This is the first supersession of an ADR in gcscode. Establishes the Nygard supersession pattern as the convention (Status field flip + new-ADR `Supersedes` line; no filename variants; no `-a` suffixes). Future ADR supersessions follow the same shape.
- ADR-0008 stays in `docs/decisions/` as the historical record. A reader curious about how the registry was scoped before this ADR can read ADR-0008 directly.

## Related

- Supersedes: [ADR-0008 (Reviewer-role registry)](ADR-0008-reviewer-role-registry.md) — the predecessor this ADR broadens.
- Spec that called for this supersession: [`docs/specs/2026-05-16-agentic-team-debt-clearing-v1.md`](../specs/2026-05-16-agentic-team-debt-clearing-v1.md) Decision 1.
- Iterations that surfaced the need:
  - [`docs/specs/2026-05-16-effort-max-custom-reviewers.md`](../specs/2026-05-16-effort-max-custom-reviewers.md) — added `.claude/agents/<name>.md` structural layer (still reviewer-only).
  - [`docs/specs/2026-05-16-review-discussion-loop-v1.md`](../specs/2026-05-16-review-discussion-loop-v1.md) — added the respondent actor with a distinct App identity.
- Queued follow-up iterations enabled by this ADR (in priority order from the debt-clearing roadmap):
  - **Respondent subagent v2** (queued #2): will populate the respondent's `model` and `secondary model` columns; addresses cross-session limitation.
  - **Per-role bot identities for reviewers** (queued #3): splits `gcscode-reviewer[bot]` into per-role App identities (`gcscode-red-team[bot]`, etc.); the `identity` column gets per-row distinct values instead of the uniform v1 value.
  - **Reviewer routing layer** (queued #4): may need to query the registry's `targets` column for "which actors fire on this PR class?"; the registry's source-of-truth role becomes operational.
