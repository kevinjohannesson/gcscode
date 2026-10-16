# Architecture notes

Dated notes on established software-architecture patterns and how they map onto gcscode.

**Status: informative, not normative.** Use these notes as vocabulary and background. They commit to nothing: decisions live in [specs](../specs/) and [ADRs](../decisions/), and commitments in the [roadmap](../roadmap.md).

## Conventions

- **Filename:** `YYYY-MM-DD-<topic>.md`, the same as specs and plans.
- **Snapshots:** each note captures understanding on its date. Once committed, a note isn't rewritten. A later note supersedes it, and the earlier note gets a one-line pointer to its successor, the same breadcrumb convention specs use. Factual fixes (a moved path, a broken link) are edited in place and commit as `fix(architecture):`; successor pointers commit as `docs(architecture):`. Both carry a one-sentence rationale.
- **Shape** (recommended, not mandatory): why the note exists, the patterns, how they relate, the mapping onto gcscode, open questions, references. A note may open with a short header block (date, status, origin). These conventions are canonical where a note's own shape disagrees with them.
- **Sources:** name each established pattern with where it comes from (book, article, author), so it can be looked up.
- **Open questions** may carry dated _Direction_ lines. A direction is a lean, not a commitment; commitments go to the roadmap. A direction naming a concrete change to shipped code belongs in the roadmap instead.
- **Identifiers are illustrative.** Type, method, and package names sketched in a note carry no naming commitment. API surface arrives only via `@gcscode/extension-api`.
- **Citing:** specs and ADRs may link a note for background, but state any decision they take in their own text. A note is never the sole justification for a decision. Plans and implementer subagents may take vocabulary from a note, never a requirement, an API shape, or an identifier.
- **Landing:** notes land on master directly, like plans, from the main checkout. An agent working inside a `feat/*` worktree does not land one — `CLAUDE.md`'s "Subagent worktree discipline" rule 2 stops a commit when the branch reads `master`, and this convention does not amend it. Authored by the user, or by an agent at the user's request; an agent does not land a note unprompted.

## Index

| Date       | Note                                                                                                | Patterns                                                                    | Superseded by |
| ---------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------- |
| 2026-10-15 | [Ports and adapters, anti-corruption layers, and the GoF Adapter](2026-10-15-ports-and-adapters.md) | Adapter (GoF), Ports and Adapters (Cockburn), Anti-corruption layer (Evans) | —             |

## Maintenance

- **New note** → add its row here in the same commit. Nothing enforces this at commit time; `/housekeeping` Stage 1 checks it afterwards.
- **Superseded note** → fill its `Superseded by` cell with a link to the successor, and add the one-line pointer inside the superseded note itself. Rows are never deleted; the index is the folder's history.
- **Detection is periodic, not immediate.** A missing row surfaces at the next `/housekeeping` pass (every 2–3 feature iterations), not when the note lands.
- **Stale mapping** → a note's mapping onto gcscode going stale is expected and is not a defect. Write a successor note; leave the predecessor as the dated record.
- **The 2026-10-15 note predates the _Direction_ rule** above and is exempt from it: its directions were written before this folder had conventions. Every note after it follows the rule as stated.
