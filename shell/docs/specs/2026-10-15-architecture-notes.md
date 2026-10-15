# Architecture notes

**Slug:** architecture-notes
**Type:** docs-convention iteration. Adds a `docs/architecture/` folder for dated, informative architecture notes, a README with the folder's conventions and index, three one-line `CLAUDE.md` additions, and one `docs/out-of-scope.md` entry. No code, no agent files, no workflow changes.
**No bootstrap exceptions.** Spec ships via the spec-PR workflow; implementation lands per the post-merge implementation convention.

## Context

Brainstorming a vehicle capability model (2026-10-15) produced a run of architecture discussions that were valuable beyond the iteration that prompted them: which established patterns the design follows, where they come from, and how they map onto gcscode. Examples: ports and adapters (Cockburn) versus the GoF Adapter versus the anti-corruption layer (Evans); prior art for capability APIs; STANAG 4586 as a reference architecture.

Out of that came a new meta goal: **use established patterns where applicable, and learn software architecture along the way.** Meeting it needs somewhere durable to record what each pattern is, its source, and how it maps onto the codebase.

None of the existing doc types fits:

| Doc type             | Role                                  | Why it doesn't fit pattern discussions                                                                 |
| -------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Specs                | normative decisions for one iteration | Pattern background bloats specs, and anything written in a spec reads as a commitment.                 |
| ADRs                 | normative architectural decisions     | Same problem; an explanation is not a decision.                                                        |
| Plans                | execution steps                       | Wrong purpose.                                                                                         |
| `docs/brainfarts.md` | the user's scratch pad                | Agents must not use it as design input, so vocabulary recorded there is invisible to the agentic team. |

There is also a staleness problem. Explanations of how a pattern maps onto the code go stale as the code changes. A dated snapshot makes that visible; an undated living document hides it.

## Why not the bigger version

- **A patterns ledger plus a "Patterns" section in the spec template**, mirroring `docs/vs-code-alignment.md`. Each spec would state which established pattern it applies or deliberately doesn't, and those rows would propagate into a cumulative `docs/patterns.md` when the iteration ships. That would make the meta goal checkable by reviewers. **Smaller wedge:** notes only, no template change. **Bigger wedge:** touches the spec template, spec-quality's structure expectations, and per-iteration propagation duties. One note is not enough evidence that the ledger would earn its upkeep. Trigger to revisit: the third architecture note that names a pattern actually applied in gcscode code, not only discussed.
- **Reviewer awareness of notes** (red-team or extension-architect consulting notes, or checking pattern claims against them). **Smaller wedge:** reviewers ignore notes; notes cannot carry decisions anyway. Trigger to revisit: the note-as-justification tripwire fires.
- **Structured metadata for notes** (frontmatter with `status`, `supersedes`, `patterns` fields). **Smaller wedge:** a few prose header lines plus the README index. Trigger to revisit: tooling needs to parse notes.

This iteration ships: a folder, a README, three `CLAUDE.md` lines, one out-of-scope entry, and the first note.

## Goals

1. Establish `shell/docs/architecture/` as the home for dated architecture notes, with conventions and an index in `shell/docs/architecture/README.md`.
2. Codify the notes' status in `CLAUDE.md`: **informative, not normative.** Agents may use notes as vocabulary and background, never as requirements or design commitments.
3. Let notes land on master directly, like plans.
4. Land the first note, `2026-10-15-ports-and-adapters.md`, as the first instance of the convention.

## Non-goals (this iteration)

- **Patterns ledger and spec-template "Patterns" section.** Cross-cutting deferral; propagated to `docs/out-of-scope.md` (see below).
- **Reviewer prompt changes.** No reviewer is asked to read or check notes. Per-iteration scope; its revisit path is the tripwire below.
- **Capability-model decisions.** The first note describes a brainstorm in progress. Nothing in it commits gcscode to the vehicle capability model, which gets its own spec.
- **Retroactive notes** for patterns already in use (disposables, register-then-execute, provider registries). Not a deferral: under this convention such notes can be added at any time without an iteration.

## Architecture

### What a note is

- A Markdown file at `shell/docs/architecture/YYYY-MM-DD-<topic>.md`.
- A snapshot of understanding on its date. A note names established patterns with their sources (book, article, author), maps them onto gcscode as of that date, and lists open questions.
- Open questions may carry dated _Direction_ lines. A direction is a lean, not a commitment; commitments go to `docs/roadmap.md`.
- Recommended shape (not mandatory): why the note exists, the patterns, how they relate, the mapping onto gcscode, open questions, references.

### Snapshot semantics

Once committed, a note is not rewritten. When understanding changes, a successor note is written and the predecessor gets a one-line pointer to it. This mirrors the breadcrumb convention for specs in `CLAUDE.md` ("Specs as historical record"), including its substantive-versus-factual test: changing what a note _said_ needs a successor note; fixing how it _refers_ to something that has moved (a path, a link) is edited in place.

### Status relative to other docs

| Doc type             | Agents may…                                | Commits gcscode to anything?    |
| -------------------- | ------------------------------------------ | ------------------------------- |
| `docs/brainfarts.md` | not use it at all, unless the user says so | no                              |
| Architecture notes   | use as vocabulary and background           | no                              |
| Plans                | execute                                    | no (metadata about future work) |
| Specs, ADRs          | treat as requirements                      | yes                             |

**Citing rule:** specs and ADRs may link a note for background, but must state any decision they take in their own text. A note is never the sole justification for a decision. This keeps the informative/normative boundary intact even when a spec builds on a note's vocabulary.

### Landing

Notes, and README updates that add them to the index, land on master directly, like plans: no spec-PR, no review gate. The review gate exists for decisions, and notes contain none. No branch prefix is needed.

### README

The README states the folder's status, its conventions, and an index table (date, note, patterns). Full verbatim content is in Post-merge implementation > Commit 1.

### `CLAUDE.md` additions

Three one-line additions: the folder in the "Conventions" list (with its informative-not-normative status), notes added to the "can land on master directly" rule, and an entry under "Further reading". Full verbatim content is in Post-merge implementation > Commit 2.

## Validation

- **Mechanical (post-merge).** `pnpm lint` passes; Prettier covers the new Markdown files. The README's relative links (`../specs/`, `../decisions/`, `../roadmap.md`, the first note) resolve, and so does the first note's link to `ADR-0005`.
- **First real use.** The next architecture note (expected: capability APIs and their prior art) lands on master directly without a spec-PR, and gets an index row in the same commit.
- **Citing rule in practice.** The vehicle capability-model spec is the first spec likely to build on a note. It should link the note for vocabulary and restate every decision in its own text.

## VS Code alignment

No VS Code alignment implications. The convention concerns gcscode's documentation, not its extension architecture.

Propagation to `shell/docs/vs-code-alignment.md`: none.

## `docs/out-of-scope.md` propagation

The patterns ledger is a deliberate deferral of a concept that would affect every future spec, so it is cross-cutting. One entry under "Tooling / process". Verbatim content in Post-merge implementation > Commit 3.

The reviewer-awareness non-goal stays in this spec only: its revisit path is the tripwire, not a class of future iterations.

## `docs/roadmap.md` propagation

None. The roadmap tracks the extension-architecture phases, feature extensions, and the agentic-team track. A docs-folder convention belongs to none of them, and `CLAUDE.md`'s "Further reading" is where the docs layout is discoverable.

## Known unknowns

- **Whether snapshot semantics hold up.** Notes describe code that will change. The first stale mapping will show whether successor notes are cheap enough, or whether the pull to edit in place wins.
- **Whether agents keep notes informative.** Direction lines are the most likely place for a lean to be mistaken for a commitment.
- **Index drift.** The README index is maintained by hand. A note added without an index row is caught by housekeeping, not by tooling.

## Tripwires for known-quality concerns

- **Note-as-justification tripwire.** A spec or ADR takes a decision whose only stated justification is an architecture note, without restating the decision in its own text. This is a judgment about the artifact's argument, not a grep-able rule, so it stays under the default "across N PRs" guard: **fires at N=2 spec/ADR PRs**. Response: tighten the `CLAUDE.md` wording, or add a citing-rule check to spec-quality's structure section (Future iterations > 2).

This tripwire is a manual check during spec/ADR review.

## Future iterations

1. **Patterns ledger and spec-template "Patterns" section.** Trigger: the third note naming a pattern applied in gcscode code.
2. **Spec-quality citing-rule check.** Trigger: the note-as-justification tripwire fires.

Expected next notes (not iterations; they land directly under this convention): capability APIs and their prior art; STANAG 4586 as a reference architecture.

## Origin

Surfaced 2026-10-15 during a brainstorm on a vehicle capability model, held in a Claude chat session outside Claude Code. The user proposed the meta goal of using established patterns where applicable, and recording architecture discussions as dated docs entries. The first note and the `CLAUDE.md` lines were drafted in that session and held back from master. The user asked for this spec so the convention goes through the repo's own process rather than landing ad hoc.

## Post-merge implementation

Per the post-merge implementation convention, **three direct-master commits**.

- **Commit 1:** add `shell/docs/architecture/README.md` (verbatim below) together with the first note, `shell/docs/architecture/2026-10-15-ports-and-adapters.md`. The note is not reproduced here: under the convention this spec establishes, notes land on master directly without spec coverage, so the note is the convention's first exercise rather than part of the mechanical implementation. The README and the note land together so the index never links to a missing file.
- **Commit 2:** three `CLAUDE.md` additions (verbatim below).
- **Commit 3:** one `docs/out-of-scope.md` entry (verbatim below).

### Verbatim — Commit 1 (`shell/docs/architecture/README.md`)

```md
# Architecture notes

Dated notes on established software-architecture patterns and how they map onto gcscode.

**Status: informative, not normative.** Use these notes as vocabulary and background. They commit to nothing: decisions live in [specs](../specs/) and [ADRs](../decisions/), and commitments in the [roadmap](../roadmap.md).

## Conventions

- **Filename:** `YYYY-MM-DD-<topic>.md`, the same as specs and plans.
- **Snapshots:** each note captures understanding on its date. Once committed, a note isn't rewritten. A later note supersedes it, and the earlier note gets a one-line pointer to its successor, the same breadcrumb convention specs use. Factual fixes (a moved path, a broken link) are edited in place.
- **Sources:** name each established pattern with where it comes from (book, article, author), so it can be looked up.
- **Open questions** may carry dated _Direction_ lines. A direction is a lean, not a commitment; commitments go to the roadmap.
- **Citing:** specs and ADRs may link a note for background, but state any decision they take in their own text. A note is never the sole justification for a decision.
- **Landing:** notes land on master directly, like plans.

## Index

| Date       | Note                                                                                                | Patterns                                                                    |
| ---------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 2026-10-15 | [Ports and adapters, anti-corruption layers, and the GoF Adapter](2026-10-15-ports-and-adapters.md) | Adapter (GoF), Ports and Adapters (Cockburn), Anti-corruption layer (Evans) |
```

### Verbatim — Commit 2 (`CLAUDE.md` additions)

**2a.** In `shell/CLAUDE.md`, in the "Conventions" section, immediately after the `**Plans:**` bullet, insert:

> - **Architecture notes:** `docs/architecture/YYYY-MM-DD-<topic>.md`, indexed in `docs/architecture/README.md`. Informative, not normative: agents may use them as vocabulary and background, but never as requirements or design commitments. Decisions live in specs and ADRs.

**2b.** In the "Branching and merging" section, in the **Feature branches** bullet, replace

> Plan commits can land on master directly (they're metadata about future work); code commits live on a branch.

with

> Plan commits can land on master directly (they're metadata about future work), as can architecture notes (informative background, not decisions); code commits live on a branch.

**2c.** In the "Further reading" section, immediately after the `docs/decisions/` entry, insert:

> - `docs/architecture/` — dated architecture notes: established patterns and how they map onto gcscode. Informative background, not decisions.

### Verbatim — Commit 3 (`docs/out-of-scope.md` propagation)

In `shell/docs/out-of-scope.md`, append the following entry to the end of the "Tooling / process" section:

```md
- **Patterns ledger for architecture notes.** No cumulative `docs/patterns.md` ledger and no "Patterns" section in the spec template. Architecture notes (per [`specs/2026-10-15-architecture-notes.md`](specs/2026-10-15-architecture-notes.md)) name established patterns, but nothing tracks which ones gcscode actually applies. Trigger to revisit: the third architecture note that names a pattern applied in gcscode code, not only discussed.
```
