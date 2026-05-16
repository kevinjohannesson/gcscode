# ADR-0008: Reviewer-role registry

**Date:** 2026-05-14
**Status:** Superseded by [ADR-0009 (Agentic-actor registry)](ADR-0009-agentic-actor-registry.md)

## Context

The reviews-as-artifacts iteration (2026-05-12) introduced three reviewer subagent roles — spec-compliance, code-quality, and final cross-cutting — that post reviews to feature-PRs under a single `gcscode-reviewer[bot]` identity. Their behavior and verdict permissions are documented inline across several CLAUDE.md sections.

This iteration (2026-05-14, the red-team-reviewer iteration) adds a fourth role and anticipates a broader expert-reviewer track (domain expert, security reviewer, etc.) over subsequent iterations. Documenting each new role by editing N scattered CLAUDE.md sections has accumulating cost: harder to keep verdict permissions, header conventions, and dispatch rules consistent; harder for future agents/readers to know what roles exist; easier for inconsistencies to creep in.

We need a structural place where each reviewer role's complete definition lives — accessible to controllers dispatching reviewers, to readers learning the system, and to future iterations adding new roles.

## Decision

We introduce a **reviewer-role registry** in CLAUDE.md: a flat table with one row per role and the following columns:

| Field              | Purpose                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| `name`             | Role identifier                                                                                        |
| `kind`             | `per-task` / `cross-cutting` / `per-artifact`                                                          |
| `identity`         | GitHub App identity that posts reviews under this role (all roles share `gcscode-reviewer[bot]` in v1) |
| `model`            | Claude model used (Opus 4.7 / Sonnet 4.6 / etc.)                                                       |
| `targets`          | PR kinds this role fires on (`feature-PR` / `spec-PR` / `ADR-PR`)                                      |
| `trigger`          | When in the PR lifecycle this role dispatches                                                          |
| `verdicts`         | Subset of `{--comment, --request-changes, --approve}` this role may post                               |
| `character`        | Critique focus (short description)                                                                     |
| `header`           | Markdown header for posted reviews                                                                     |
| `re-review header` | Header form for re-reviews after `Code-review-followup:` commits                                       |
| `prompt template`  | Path to the per-role prompt template file                                                              |

The registry is the **source of truth** for reviewer role definitions. The existing verdict-permission table in CLAUDE.md is retained as a denormalized quick-reference view, but its content is logically derivable from the registry.

Per-role behavior (the actual prompt the subagent receives) lives in per-role files under `.claude/reviewer-prompts/<role>.md`. The registry's `prompt template` field references the path.

The registry rows for the current four roles (Spec-compliance, Code-quality, Final cross-cutting, Red-team) are populated in CLAUDE.md as part of the red-team-reviewer iteration.

## Alternatives considered

**Inline per-role definitions scattered through CLAUDE.md.** Each role's verdict permissions, header convention, and dispatch rules documented inline in the section they relate to. Rejected: adding a new role requires editing N sections consistently, with no central enumeration of roles. Inconsistencies are easy and silent.

**Project-local Claude Code skill.** Define each reviewer role as a project-local skill with its own SKILL.md and prompt templates, mirroring how the superpowers plugin works. Rejected for v1: Claude Code's project-local skill discovery mechanism is unverified and would add scope to this iteration. Worth reconsidering after the registry pattern has lived for a few iterations and the expert-reviewer track is concrete.

**Upstream contribution to the superpowers plugin.** Submit a `red-team-reviewer` skill upstream. Rejected: doesn't match the in-repo artifact preference; review context is gcscode-specific (CLAUDE.md, the spec/ADR-PR workflow); upstream review cycles are slow.

## Consequences

**Positive:**

- Adding a new reviewer role (devil's advocate v2, future expert/domain/security reviewers) becomes "append one row to the registry, drop one prompt template file" instead of "edit N CLAUDE.md sections consistently."
- The agent-behavior tree (`.claude/`) has a clear convention: reviewer prompts live in `.claude/reviewer-prompts/<role>.md`.
- The registry serves as documentation: readers/agents can enumerate all reviewer roles by reading one table.
- The `identity` field is in place before multi-identity is needed (per the multi-bot finding in PR #1's validation). When the distinct-App-identities-per-reviewer-role iteration lands, populating distinct identities is "edit cells" not "add a column."

**Negative:**

- The CLAUDE.md section grows: one more table to maintain.
- The denormalized verdict-permission table can drift from the registry if not updated together. Mitigation: convention is to treat the registry as source of truth and regenerate the denormalized view; the verdict table is small enough that manual sync is acceptable for now.

**Neutral:**

- This is the first ADR in the agentic-team track. Establishes that significant agentic-team architectural decisions get ADRs going forward, separate from the spec format (which captures rationale at the iteration level but not as a dedicated decision record).

## Related

- Spec: [`docs/specs/2026-05-14-red-team-reviewer.md`](../specs/2026-05-14-red-team-reviewer.md) — this ADR's iteration
- Predecessor iteration: [`docs/specs/2026-05-12-reviews-as-artifacts.md`](../specs/2026-05-12-reviews-as-artifacts.md) — established the three baseline reviewer roles
- Future iterations the registry enables: devil's advocate as separate agent (v2), expert/domain/security reviewer track, distinct App identities per reviewer role
