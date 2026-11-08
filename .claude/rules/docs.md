---
paths:
  - 'docs/**'
---

# Specs, ADRs, plans and other docs

## Writing them

- **Required headings** for a new spec: Context, Goals, Non-goals, VS Code alignment, Known unknowns. For a new ADR: Status (a heading or a `**Status:**` line), Context, Decision, Consequences. `pnpm lint:docs` checks these, plus relative links, heading anchors and leaked local paths, on the lines a branch changes. Run it before opening a spec or ADR PR.
- **Plans** list, as checklist items, the spec's findings left for implementation (Known unknowns, review findings deferred to the plan); the final cross-cutting review verifies each. For a docs-only iteration whose edits the spec fully specifies, the plan is optional.
- **Parallel ADR PRs** that decide two halves of one question may link each other by filename before either has merged. Say so in both PR bodies so the reviewer reports it as a known forward reference; `pnpm lint:docs` flags the link until both merge.
- **Architecture notes** (`docs/architecture/`) are background: use them as vocabulary, never as requirements. Decisions live in specs and ADRs.
- **`docs/brainfarts.md`** is the owner's scratch pad. Nothing in it is a requirement or a design input unless the owner says so.

## VS Code alignment, in spirit, not by byte

gcscode adopts VS Code's load-bearing extension patterns — disposables, activation contexts, named and disposable contributions, register-then-execute, commands as the integration backbone — and diverges on syntax, style and ergonomics when the local context warrants. Extension-code portability is not a goal.

When brainstorming or planning, surface every API divergence from VS Code as a labelled decision with its trade-off, never as a default, and record the choice in the spec or ADR. Every spec has a "VS Code alignment" section listing what aligns, what diverges and why, and what is deferred (`docs/specs/2026-04-26-phase-a2-commands.md` is the table-format example). When the iteration ships, copy each new row into `docs/vs-code-alignment.md`, the cumulative ledger.

## Specs and ADRs are the historical record

A merged spec records what its iteration decided. A later spec that revises those decisions adds a one-line breadcrumb to the earlier one instead of rewriting it; substantive corrections go in the successor.

Mechanical fixes to an earlier spec are allowed in place — typos, broken links, a renamed file, a moved section anchor — in a commit prefixed `fix(spec):` with a one-sentence reason. The test: changing what the spec _said_ (goals, non-goals, architecture, decisions) needs a successor; changing how it _refers_ to something that has since moved is a fix.

ADRs are superseded, not edited: the new ADR opens with `**Supersedes:**`, and the old one's Status line flips to "Superseded by" with a link.

## Non-goals propagate to `docs/out-of-scope.md`

A spec's non-goals that defer a concept for the whole architecture — not just a scope cut for this iteration — land in `docs/out-of-scope.md` when the iteration ships, each with a trigger to revisit. The spec lists the exact edits in a "`docs/out-of-scope.md` propagation" section (`docs/specs/2026-04-26-phase-a2-commands.md` is the example). Per-iteration omissions stay in the spec only.
