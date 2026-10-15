# Architecture notes

**Slug:** architecture-notes
**Type:** docs-convention iteration. Adds a `docs/architecture/` folder for dated, informative architecture notes, a README with the folder's conventions and index, three `CLAUDE.md` edits (two insertions and one replacement), two one-line additions to `shell/.claude/commands/housekeeping.md`, and one `docs/out-of-scope.md` entry. No code, no agent files, no CI or `.github/workflows/` changes, and no change to the Spec-PR, ADR-PR, or PR workflows. It does add one category to `CLAUDE.md`'s master-landing list under "Branching and merging" (Commit 1b).
**No bootstrap exceptions.** Spec ships via the spec-PR workflow; implementation lands per the post-merge implementation convention. The first note is deliberately _not_ part of the mechanical implementation: it lands last, after the `CLAUDE.md` edit that authorizes notes to land on master, in its own commit — see Post-merge implementation.

## Context

Brainstorming a vehicle capability model (2026-10-15) produced a run of architecture discussions that were valuable beyond the iteration that prompted them: which established patterns the design follows, where they come from, and how they map onto gcscode. Examples: ports and adapters (Cockburn) versus the GoF Adapter versus the anti-corruption layer (Evans); prior art for capability APIs; STANAG 4586 as a reference architecture.

Out of that came a new meta goal: **use established patterns where applicable, and learn software architecture along the way.** Meeting it needs somewhere durable to record what each pattern is, its source, and how it maps onto the codebase.

None of the existing doc types fits:

| Doc type                        | Role                                           | Why it doesn't fit pattern discussions                                                                                                                                         |
| ------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Specs                           | normative decisions for one iteration          | Pattern background bloats specs, and anything written in a spec reads as a commitment.                                                                                         |
| ADRs                            | normative architectural decisions              | Same problem; an explanation is not a decision.                                                                                                                                |
| Plans                           | execution steps                                | Wrong purpose.                                                                                                                                                                 |
| `docs/brainfarts.md`            | the user's scratch pad                         | Agents must not use it as design input, so vocabulary recorded there is invisible to the agentic team.                                                                         |
| `docs/vs-code-alignment.md`     | cumulative, explicitly-informative ledger      | Closest existing artifact in kind, but its scope is VS Code alignment specifically, and its row-per-claim shape cannot hold prose explaining a pattern's source and mechanics. |
| `docs/roadmap.md` > Experiments | informative framing, but tracks in-flight work | Tracks what is running in production, not what a pattern is or where it comes from.                                                                                            |

There is also a staleness problem. Explanations of how a pattern maps onto the code go stale as the code changes.

**Labeled decision — dated snapshots over a cumulative ledger.** `docs/vs-code-alignment.md` solves staleness the other way: one living document whose `## Maintenance` section prescribes flipping rows as reality changes. That shape is rejected here because a pattern's explanation is prose — source, mechanics, how three patterns relate — and prose does not survive being compressed into ledger rows. The cost accepted in exchange: a dated snapshot does not know it is stale, so the date plus the index's `Superseded by` column are the only staleness signals, and both depend on a reader noticing them. The patterns _ledger_ deferred below is the cumulative-shape option, kept available for the claims that do fit rows.

## Why not the bigger version

- **A patterns ledger plus a "Patterns" section in the spec template**, mirroring `docs/vs-code-alignment.md`. Each spec would state which established pattern it applies or deliberately doesn't, and those rows would propagate into a cumulative `docs/patterns.md` when the iteration ships. That would make the meta goal checkable by reviewers. **Smaller wedge:** notes only, no template change. **Bigger wedge:** touches the spec template, spec-quality's structure expectations, and per-iteration propagation duties. One note is not enough evidence that the ledger would earn its upkeep. Trigger to revisit: the third architecture note that names a pattern actually applied in gcscode code, not only discussed.
- **Reviewer awareness of notes** (red-team or extension-architect consulting notes, or checking pattern claims against them). **Smaller wedge:** reviewers ignore notes; notes cannot carry decisions anyway. Trigger to revisit: the note-as-justification tripwire fires (defined under Tripwires below).
- **Structured metadata for notes** (frontmatter with `status`, `supersedes`, `patterns` fields). **Smaller wedge:** a few prose header lines plus the README index. Trigger to revisit: tooling needs to parse notes.

This iteration ships: a folder, a README, three `CLAUDE.md` lines, two `housekeeping.md` lines, one out-of-scope entry, and the first note.

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
- Open questions may carry dated _Direction_ lines. A direction is a lean, not a commitment; commitments go to `docs/roadmap.md`. A direction that names a concrete change to shipped code (renaming a package, splitting an API) has crossed into commitment territory and belongs in the roadmap as a "Considering" entry instead.
- **Identifiers in a note are illustrative.** Type, method, and package names sketched in a note carry no naming commitment. API surface still arrives only via `@gcscode/extension-api` per `CLAUDE.md`'s Boundary-rule corollary — a note is not a route to an API name.
- Recommended shape (not mandatory): why the note exists, the patterns, how they relate, the mapping onto gcscode, open questions, references. A note may also open with a short header block (date, status, origin). Where the two disagree, the README's conventions are canonical.

### Snapshot semantics

Once committed, a note is not rewritten. When understanding changes, a successor note is written and the predecessor gets a one-line pointer to it. This mirrors the breadcrumb convention for specs in `CLAUDE.md` ("Specs as historical record"), including its substantive-versus-factual test: changing what a note _said_ needs a successor note; fixing how it _refers_ to something that has moved (a path, a link) is edited in place.

That test is two-way, and the successor pointer is neither branch — it is not changing what the note said, and it is not fixing a moved reference. So notes have **three** permitted edit classes, and the repo already has a prefix for each of the two edit acts: a factual fix in place commits as `fix(docs):`, mirroring the `fix(spec):` discipline `CLAUDE.md` attaches to the same exception; a successor pointer commits as `docs(architecture):`, mirroring the existing `docs(spec):` breadcrumb practice. Both carry a one-sentence rationale. Using the factual-fix prefix for the pointer would contradict this section's own argument that the pointer is a third class, distinct from the factual fix.

### Status relative to other docs

| Doc type             | Agents may…                                | Commits gcscode to anything?    |
| -------------------- | ------------------------------------------ | ------------------------------- |
| `docs/brainfarts.md` | not use it at all, unless the user says so | no                              |
| Architecture notes   | use as vocabulary and background           | no                              |
| Plans                | execute                                    | no (metadata about future work) |
| Specs, ADRs          | treat as requirements                      | yes                             |

**Citing rule:** specs and ADRs may link a note for background, but must state any decision they take in their own text. A note is never the sole justification for a decision. This keeps the informative/normative boundary intact even when a spec builds on a note's vocabulary.

The rule binds **every** reader, not only spec and ADR authors: plans and implementer subagents may take vocabulary from a note, but may not take a requirement, an API shape, or an identifier from one. Anything load-bearing must trace to a spec, an ADR, or the extension API itself.

### Landing

Notes, and README updates that add them to the index, land on master directly, like plans: no spec-PR, no review gate. No branch prefix is needed. A note is landed from the main checkout, on master. An agent working inside a `feat/*` worktree does not land one: `CLAUDE.md`'s "Subagent worktree discipline" rule 2 is a hard STOP when `git branch --show-current` reads `master`, and nothing here amends that rule. Combined with the authorship rule below, a note written during feature work waits for the user rather than creating an exception to the worktree discipline.

**What the exemption rests on, precisely.** Notes carry no _binding_ decisions, because the citing rule forbids a note being the sole justification for one. That is narrower than "notes contain no decisions," and it is worth stating narrowly, because notes combine two properties that no existing doc class combines: unreviewed **and** offered to agents as explanatory vocabulary. Each comparable class is safe for a reason that does not transfer — a plan is derivative of a spec that _was_ reviewed; `docs/brainfarts.md` is walled off from agents entirely; and `docs/roadmap.md`, which also lands unreviewed and is read by agents, carries commitments and status rather than explanation, so there is nothing in it for an agent to mistake for reasoning. Two risks therefore stay live and uncovered: a note's factual claims about the codebase are never checked by anyone (see Known unknowns), and a _Direction_ line can read as a commitment. The "like plans" posture is itself an acknowledged deferral in `docs/out-of-scope.md` ("Plan-PR workflow"), which carries a revisit trigger; notes now get their own, below.

**Who may author a note.** The user, or an agent at the user's request. An agent does not land a note unprompted — that would make notes a self-feeding channel, where one agent writes background that a later agent reads as sanctioned vocabulary with no review anywhere in the loop.

**Trigger to bring notes under a review gate:** a note's factual claim about the codebase is found wrong after an agent has already used it as vocabulary, OR a _Direction_ line is cited as justification for a code change. **Owner: the user.** The first disjunct has no detector by design (see Known unknowns — nothing checks a note's accuracy), so it fires on incidental discovery, most plausibly at code-review time when an agent's reasoning traces back to a note; the second is covered by the note-as-justification tripwire's owner, below. Naming the owner here is the round-1 lesson — a trigger assigned to no one is unowned — applied to the trigger as well as to the tripwire.

### README

The README states the folder's status, its conventions, an index table (date, note, patterns, superseded-by), and a `## Maintenance` section stating who owns index rows and what happens when a note is superseded or goes stale. Full verbatim content is in Post-merge implementation > Commit 4.

### `CLAUDE.md` additions

Three one-line edits: two insertions — the folder in the "Conventions" list (with its informative-not-normative status) and an entry under "Further reading" — plus one replacement of the **Feature branches** bullet, which adds notes to the "can land on master directly" rule. Full verbatim content is in Post-merge implementation > Commit 1.

## Validation

- **Mechanical (post-merge).** `pnpm lint` passes; Prettier covers the new Markdown files. The README's relative links (`../specs/`, `../decisions/`, `../roadmap.md`, the first note) resolve. The note's own internal links are not validated here: Commit 3 places the note outside this spec's coverage, so asserting a mechanical property of its text would contradict that.
- **First real use.** The next architecture note (expected: capability APIs and their prior art) lands on master directly without a spec-PR, and gets an index row in the same commit.
- **Direction rule's first test is Commit 3.** The note landing in Commit 3 predates the Direction rule this spec adds, and carries dated _Direction_ lines naming concrete changes to shipped code. Whether those lines stay as directions or become `docs/roadmap.md` "Considering" entries is the user's call at Commit 3 time; the rule applies to notes written after it.
- **Citing rule in practice.** The vehicle capability-model spec is the first spec likely to build on a note. It should link the note for vocabulary and restate every decision in its own text.
- **Index-drift mitigation is real, and bounded.** After Commit 5, `shell/.claude/commands/housekeeping.md` Stage 1 item 11 reads `docs/architecture/README.md` and checks every note has a row — so the claim under Known unknowns names a step that actually exists. Stage 1 is the mechanism that catches the drift scenario (a note landing ad hoc between passes); the Stage 5 line (5b) only covers notes landed as part of a housekeeping cut, because Stage 5's preamble is "After the cut ships:". Detection latency is therefore one housekeeping pass — per `CLAUDE.md` "Periodic housekeeping", every 2–3 feature iterations.

## VS Code alignment

No VS Code alignment implications. The convention concerns gcscode's documentation, not its extension architecture.

Propagation to `shell/docs/vs-code-alignment.md`: none.

## `docs/out-of-scope.md` propagation

The patterns ledger is a deliberate deferral of a concept that would affect every future spec, so it is cross-cutting. One entry under "Tooling / process". Verbatim content in Post-merge implementation > Commit 2.

**Placement is deliberate.** "Agentic team architecture deferrals" was considered and rejected: that section's preamble scopes it to deferrals stemming from `docs/specs/2026-05-12-reviews-as-artifacts.md` and the broader agentic-team arc, and a documentation convention does not stem from it. "Tooling / process" covers process, which is what this is — its three current entries happen to be engineering infrastructure, but the section name is not limited to that. The one agentic-team-shaped consequence (a spec-quality citing-rule check) is tracked separately as Future iterations > 2.

The reviewer-awareness non-goal stays in this spec only: its revisit path is the tripwire, not a class of future iterations.

## `docs/roadmap.md` propagation

None. The roadmap tracks the extension-architecture phases, feature extensions, and the agentic-team track. A docs-folder convention belongs to none of them, and `CLAUDE.md`'s "Further reading" is where the docs layout is discoverable.

The call is also a judgment about the **deferrals** this spec surfaces, not only about the convention. `docs/roadmap.md`'s "Maintenance" says a new deferral surfacing during a spec gets an unchecked roadmap item with its trigger. That rule is applied selectively in practice, in both directions: most "Agentic team architecture deferrals" entries in `docs/out-of-scope.md` have no roadmap row (verdict promotion, branch protection, the script-based linter, agent-file hot-reload), while `Linear integration` carries one. The closest analogous docs-convention iteration, `docs/specs/2026-05-01-vs-code-alignment-ledger.md`, produced no roadmap row at all. So the rule was considered rather than skipped, and the deferral's trigger lives in `out-of-scope.md` alone.

## Known unknowns

- **Whether snapshot semantics hold up.** Notes describe code that will change. The first stale mapping will show whether successor notes are cheap enough, or whether the pull to edit in place wins.
- **Whether agents keep notes informative.** Direction lines are the most likely place for a lean to be mistaken for a commitment.
- **Index drift.** The README index is maintained by hand. A note added without an index row is caught at the next housekeeping pass — every 2–3 feature iterations, per `CLAUDE.md` "Periodic housekeeping" — not by tooling, and not at the time the note lands. Commit 5 adds the Stage 1 reading target that does the catching.
- **Whether a note is accurate when written.** "Informative, not normative" answers the _commitment_ risk; it says nothing about the _accuracy_ risk. A note's characterization of the codebase can simply be wrong, and under this convention nothing ever checks it — not a spec-PR, not a reviewer, not tooling. This is accepted as the cost of an unreviewed doc class; the Landing section's revisit trigger is what converts a realized instance into a review gate.

## Tripwires for known-quality concerns

- **Note-as-justification tripwire.** A spec or ADR takes a decision whose only stated justification is an architecture note, without restating the decision in its own text. This is a judgment about the artifact's argument, not a grep-able rule, so it stays under the default "across N PRs" guard: **fires at N=2 spec/ADR PRs**. N=2 follows existing precedent for judgment-dependent tripwires rather than being a new threshold: `docs/specs/2026-05-17-reviewer-routing-and-domain-expert.md` already sets N=2 for both the silent-disposition-pattern and architectural-intent-tagging tripwires. Response: tighten the `CLAUDE.md` wording, or add a citing-rule check to spec-quality's structure section (Future iterations > 2).

**Owner: the user, reading the PR.** Not a reviewer. `CLAUDE.md`'s tripwire conditions live under "Reviewer-role design conventions" and are role-side — condition (i) ties a tripwire to a failure mode of _the role_, condition (ii) wants it observable in _the review's structured output_. This concern is author-side and satisfies neither, so it borrows the convention's vocabulary without claiming its framework. That matters because Non-goals rules out reviewer-prompt changes: no reviewer is instructed to perform this check, and naming one as the owner would make the tripwire unowned. Consistent with `CLAUDE.md` making the user the judge of the judgment half, and with "Tripwires are manual review items, not automated checks."

## Future iterations

1. **Patterns ledger and spec-template "Patterns" section.** Trigger: the third note naming a pattern applied in gcscode code.
2. **Spec-quality citing-rule check.** Trigger: the note-as-justification tripwire fires.
3. **Structured frontmatter for notes** (`status`, `supersedes`, `patterns` fields). Trigger: tooling needs to parse notes. Until then the prose header plus the README index carry the same information by hand.

Expected next notes (not iterations; they land directly under this convention): capability APIs and their prior art; STANAG 4586 as a reference architecture.

## Origin

Surfaced 2026-10-15 during a brainstorm on a vehicle capability model, held in a Claude chat session outside Claude Code. The user proposed the meta goal of using established patterns where applicable, and recording architecture discussions as dated docs entries. The first note and the `CLAUDE.md` lines were drafted in that session and held back from master. The user asked for this spec so the convention goes through the repo's own process rather than landing ad hoc.

## Post-merge implementation

Per the post-merge implementation convention, **five direct-master commits**, in this order.

The ordering is load-bearing, and the rule is that no commit may reference a file a later commit creates. The `CLAUDE.md` edit authorizing notes to land on master comes **first**, so no commit relies on a convention the repo does not yet carry. The note is its own commit — it is the only artifact here whose text this spec does not specify, and keeping it separate leaves "what this spec-PR's review actually covered" legible in `git log`, not only in this spec's prose. The note precedes the README so the index never links to a missing file, and the README precedes the `housekeeping.md` additions because Stage 1 item 11 points at the README.

- **Commit 1:** three `CLAUDE.md` edits (verbatim below) — 1a, 1b, 1c.
- **Commit 2:** one `docs/out-of-scope.md` entry (verbatim below).
- **Commit 3:** the first note, `shell/docs/architecture/2026-10-15-ports-and-adapters.md`. **Not reproduced in this spec, and not part of the mechanical implementation.** Under the convention Commit 1 establishes, notes land on master directly without spec coverage; this note is the convention's first exercise. It is listed here only to fix its position in the sequence.
- **Commit 4:** add `shell/docs/architecture/README.md` (verbatim below), whose index row points at the note landed in Commit 3.
- **Commit 5:** two one-line additions to `shell/.claude/commands/housekeeping.md` (verbatim below), making the index-drift mitigation real.

**The verbatim blocks below, as merged, are authoritative.** Drafts of the `CLAUDE.md` edits, the README, and the first note already exist uncommitted in the author's working tree (disclosed under Origin). Where review on this PR changed any verbatim text, the merged spec wins and the working-tree draft is updated to match before the commit lands — the pre-drafted text does not land as-is by virtue of having been written first. The first note is the one exception, and only because this spec never specified its text: review feedback on the note is routed, not applied verbatim.

**Commit 0 — reconcile the drafts (owns the above).** Reconciliation is real work, not a disclaimer, so it gets an explicit step before Commit 1. Review on this PR changed the README verbatim block in five ways the working-tree draft does not have: the `## Maintenance` section, the `Superseded by` index column, the split `fix(docs):` / `docs(architecture):` commit prefixes, the `**Shape**` conventions bullet, and the `an API shape` clause in the Citing bullet. The `CLAUDE.md` 1a/1b/1c text is unchanged from the draft and needs no reconciliation. Procedure: diff each working-tree draft against this spec's verbatim block, overwrite the draft with the block, and confirm `git diff` on the draft is empty against the block before Commit 1 proceeds.

### Verbatim — Commit 1 (`CLAUDE.md` edits)

**1a.** In `shell/CLAUDE.md`, in the "Conventions" section, immediately after the `**Plans:**` bullet, insert:

> - **Architecture notes:** `docs/architecture/YYYY-MM-DD-<topic>.md`, indexed in `docs/architecture/README.md`. Informative, not normative: agents may use them as vocabulary and background, but never as requirements or design commitments. Decisions live in specs and ADRs.

**1b.** In the "Branching and merging" section, in the **Feature branches** bullet, replace

> Plan commits can land on master directly (they're metadata about future work); code commits live on a branch.

with

> Plan commits can land on master directly (they're metadata about future work), as can architecture notes (informative background, not decisions); code commits live on a branch.

**1c.** In the "Further reading" section, immediately after the `docs/decisions/` entry, insert:

> - `docs/architecture/` — dated architecture notes: established patterns and how they map onto gcscode. Informative background, not decisions.

### Verbatim — Commit 2 (`docs/out-of-scope.md` propagation)

In `shell/docs/out-of-scope.md`, append the following entry to the end of the "Tooling / process" section:

```md
- **Patterns ledger for architecture notes.** No cumulative `docs/patterns.md` ledger and no "Patterns" section in the spec template. Architecture notes (per [`specs/2026-10-15-architecture-notes.md`](specs/2026-10-15-architecture-notes.md)) name established patterns, but nothing tracks which ones gcscode actually applies. Trigger to revisit: the third architecture note that names a pattern applied in gcscode code, not only discussed.
```

### Verbatim — Commit 5 (`shell/.claude/commands/housekeeping.md` additions)

> **Note on the file class.** `CLAUDE.md` "Post-merge implementation conventions" names "`CLAUDE.md` or docs edits" for the direct-master path, and a slash-command file is neither. The direct-master path is appropriate here per the precedent in [`docs/specs/2026-05-17-robust-default-paths-in-token-helpers.md`](2026-05-17-robust-default-paths-in-token-helpers.md), which landed helper-script edits via direct master because the content was fully specified verbatim with no implementation judgment required. Both additions below are verbatim one-liners; the convention's spirit — fully specified content requiring no judgment — is satisfied.

**5a.** In Stage 1 — Survey, append to the numbered reading list (after item 10, `docs/brainfarts.md`):

> 11. `docs/architecture/README.md` — the architecture-note index. Check that every note in the folder has an index row.

**5b.** In Stage 5 — Propagate to ledger and indices, append to the bullet list:

> - New architecture note landed → confirm its row exists in `docs/architecture/README.md`'s index.

### Verbatim — Commit 4 (`shell/docs/architecture/README.md`)

```md
# Architecture notes

Dated notes on established software-architecture patterns and how they map onto gcscode.

**Status: informative, not normative.** Use these notes as vocabulary and background. They commit to nothing: decisions live in [specs](../specs/) and [ADRs](../decisions/), and commitments in the [roadmap](../roadmap.md).

## Conventions

- **Filename:** `YYYY-MM-DD-<topic>.md`, the same as specs and plans.
- **Snapshots:** each note captures understanding on its date. Once committed, a note isn't rewritten. A later note supersedes it, and the earlier note gets a one-line pointer to its successor, the same breadcrumb convention specs use. Factual fixes (a moved path, a broken link) are edited in place and commit as `fix(docs):`; successor pointers commit as `docs(architecture):`. Both carry a one-sentence rationale.
- **Shape** (recommended, not mandatory): why the note exists, the patterns, how they relate, the mapping onto gcscode, open questions, references. A note may open with a short header block (date, status, origin). These conventions are canonical where a note's own shape disagrees with them.
- **Sources:** name each established pattern with where it comes from (book, article, author), so it can be looked up.
- **Open questions** may carry dated _Direction_ lines. A direction is a lean, not a commitment; commitments go to the roadmap. A direction naming a concrete change to shipped code belongs in the roadmap instead.
- **Identifiers are illustrative.** Type, method, and package names sketched in a note carry no naming commitment. API surface arrives only via `@gcscode/extension-api`.
- **Citing:** specs and ADRs may link a note for background, but state any decision they take in their own text. A note is never the sole justification for a decision. Plans and implementer subagents may take vocabulary from a note, never a requirement, an API shape, or an identifier.
- **Landing:** notes land on master directly, like plans — including when written mid-iteration from a `feat/*` worktree. Authored by the user, or by an agent at the user's request; an agent does not land a note unprompted.

## Index

| Date       | Note                                                                                                | Patterns                                                                    | Superseded by |
| ---------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------- |
| 2026-10-15 | [Ports and adapters, anti-corruption layers, and the GoF Adapter](2026-10-15-ports-and-adapters.md) | Adapter (GoF), Ports and Adapters (Cockburn), Anti-corruption layer (Evans) | —             |

## Maintenance

- **New note** → add its row here in the same commit. Nothing enforces this at commit time; `/housekeeping` Stage 1 checks it afterwards.
- **Superseded note** → fill its `Superseded by` cell with a link to the successor, and add the one-line pointer inside the superseded note itself. Rows are never deleted; the index is the folder's history.
- **Detection is periodic, not immediate.** A missing row surfaces at the next `/housekeeping` pass (every 2–3 feature iterations), not when the note lands.
- **Stale mapping** → a note's mapping onto gcscode going stale is expected and is not a defect. Write a successor note; leave the predecessor as the dated record.
```
