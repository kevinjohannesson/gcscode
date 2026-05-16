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
| `kind`            | `per-followup-commit`                                                                                |
| `identity`        | `gcscode-respondent[bot]`                                                                            |
| `model`           | `n/a — controller-direct` (v1 limitation; respondent subagent v2 will set this)                       |
| `secondary model` | —                                                                                                    |
| `targets`         | `spec-PR, ADR-PR`                                                                                    |
| `trigger`         | `After each Code-review-followup commit`                                                             |
| `verdicts`        | `--comment` only (advisory; respondent has no review verdict)                                        |
| `character`       | Controller's per-finding dispositions; documents what was addressed, deferred, routed, or noted      |
| `header`          | `## Respondent — re commit <SHA> — to <reviewer role> review by <reviewer model>`                    |
| `re-review header` | — (respondent posts once per followup commit; no re-reviews from the respondent itself)              |
| `prompt template` | `.claude/reviewer-prompts/respondent.md`                                                             |

The respondent's role definition (the response format, disposition vocabulary, per-followup cadence, initial-review-round exclusion) lives in `.claude/reviewer-prompts/respondent.md`, identical convention to reviewer prompts.

**4. Migration.** All five existing reviewer-role rows in CLAUDE.md gain `actor-class: reviewer` as their first column value. No other field changes. Zero behavior change at runtime — the existing rows describe the same roles, dispatched the same way, by the same controllers.

**5. Supersession mechanics.** Standard Nygard supersession:

- ADR-0008's filename and content stay; its `**Status:**` field flips from `Accepted` to `Superseded by ADR-0009` with a one-line breadcrumb to this ADR.
- This ADR (ADR-0009) opens with `**Supersedes:**` pointing back to ADR-0008.
- No filename variants. No `ADR-0008-a` patterns. Industry-standard supersession only.

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
