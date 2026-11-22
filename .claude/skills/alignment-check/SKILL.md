---
name: alignment-check
description: Use before recommending an option or a design that touches the extension API, the host↔extension boundary, a provider contract, a protocol mapping or anything the VS Code alignment ledger covers, and again when the owner accepts such a recommendation.
---

# Alignment check

The owner relies on your recommendations and is not a VS Code architecture expert, so they cannot see when a recommendation quietly undoes one they accepted in another session. Your job is to make that visible: check every such recommendation against what is already decided, cite what it rests on, and record each accepted choice where the next session will find it.

What alignment means, and how a divergence is surfaced, is `.claude/rules/docs.md` § VS Code alignment, in spirit, not by byte. This skill is how you check against it.

## When

- **Before you recommend** an option, in chat, a decision card, a brainstorm, a spec or a plan, whenever it touches the extension API, the host↔extension boundary, a provider contract, a protocol mapping ([ADR-0014](../../../docs/decisions/ADR-0014-protocols-as-languages.md)) or a concern the ledger has a row for.
- **When the owner accepts** one: record it (§ Record).

Skip it for choices no decision covers: naming inside one file, test layout, tooling.

## Check

Name the concern in a few words, then read what has already been decided about it, newest first:

1. **Pending choices**: `/mnt/project-files/decisions/pending-alignment.md`, when that folder exists. These are accepted but not yet merged, so no other source shows them.
2. **Open spec and ADR PRs**: `spec/*` and `adr/*` branches with an open PR. Read the diff of any whose title or files touch the concern.
3. **The ledger**: `docs/vs-code-alignment.md`, all three tables.
4. **ADRs**: `docs/decisions/`. An ADR whose Status says "Superseded by" no longer counts; follow the link.
5. **Specs**: the "VS Code alignment" sections of the specs the ledger rows link. A breadcrumb to a later spec means the later one wins.

Search by the concern's words and its API names (`grep -n -i` across these), not by reading everything.

Then classify the recommendation:

- **Consistent**: it follows what is decided.
- **New**: nothing decides this concern yet. Say whether it aligns with VS Code or diverges, per the rule above.
- **Reverses**: it contradicts a decision in sources 1 to 5.

About VS Code itself, cite a ledger row or VS Code's API documentation. A claim about VS Code that rests only on your memory is marked "unverified". When VS Code has no counterpart, say so instead of inventing one.

## Report

Add at most three lines to the recommendation, in plain words:

```
Rests on: ADR-0012 (domain concerns are service extensions), ledger row "Extension shape".
VS Code: aligns, contributes.views plus registerWebviewViewProvider.
Reverses: nothing.
```

A **reversal** is never the default and never silent:

- Open with it: "This reverses <decision> from <source>, because <what that decision missed>."
- Offer keeping the earlier decision as an option of its own.
- Recommend the reversal only when you can name the new fact or the flaw the earlier decision did not account for. "This is cleaner" is not one. A reversal the owner accepts needs a successor spec or a superseding ADR (`.claude/rules/docs.md` § Specs and ADRs are the historical record).

When two sources disagree with each other, say so and ask the owner which stands. Do not pick one quietly.

## Record

When the owner accepts a choice that is **new** or **reverses**, append one line to `/mnt/project-files/decisions/pending-alignment.md` in the same turn. Create the folder and the file if needed. Read the file again just before you write, since other sessions write to it, and only append:

```
- 2026-11-23 · <concern> · <the choice, one sentence> · <aligns | diverges | defers | reverses <source>> · <where it was accepted: thread link or PR>
```

When the spec or ADR that carries a pending choice merges, its ledger propagation (the ledger's Maintenance section) adds the row there, and the same commit's author removes the line from the pending file.

Without `/mnt/project-files/` (a local session), you cannot see or write pending choices. Say so in the report's first line, check sources 2 to 5, and put the accepted choice in the handoff note.
