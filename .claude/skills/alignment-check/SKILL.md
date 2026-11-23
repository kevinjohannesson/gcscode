---
name: alignment-check
description: Use before recommending an option or a design that touches the extension API, the host↔extension boundary, a provider contract, a protocol mapping or anything the VS Code alignment ledger covers, and again when the owner accepts such a recommendation.
---

# Alignment check

gcscode's architectural goal is VS Code's extension architecture: its load-bearing patterns, adopted in spirit, not by byte (`.claude/rules/docs.md` § VS Code alignment, in spirit, not by byte; the ledger, `docs/vs-code-alignment.md`). That is the yardstick for every recommendation this skill covers. Earlier gcscode decisions are evidence of how the goal was applied, not a second yardstick: some were made before this check existed and may be wrong.

The owner relies on your recommendations and is not a VS Code architecture expert. Two failures follow from that, and this skill guards against both: a recommendation that drifts from VS Code without saying so, and one that quietly undoes a choice the owner accepted in another session.

## When

- **Before you recommend** an option, in chat, a decision card, a brainstorm, a spec or a plan, whenever it touches the extension API, the host↔extension boundary, a provider contract, a protocol mapping ([ADR-0014](../../../docs/decisions/ADR-0014-protocols-as-languages.md)) or a concern the ledger has a row for.
- **When the owner accepts** one: record it (§ Record).

Skip it for choices no architecture decision covers: naming inside one file, test layout, tooling.

## Check

### 1. What VS Code does

Start here, before reading any gcscode decision, so earlier choices don't anchor the answer. Name the concern in a few words and state how VS Code handles it: the API, the contribution point, the lifecycle or the process boundary, and why VS Code does it that way. Cite VS Code's API documentation or source, or a ledger row's VS Code column. A claim that rests only on your memory is marked "unverified". When VS Code has no counterpart (a drone, a protocol, a video link), say so and name the nearest VS Code pattern, such as languages for protocols (ADR-0014), instead of inventing one.

Separate VS Code's load-bearing reason from its syntax. The goal is the reason: disposables, activation, named contributions, register-then-execute, commands as the backbone. Extension-code portability is not a goal.

### 2. What gcscode has decided

Then read what is already decided about the concern, newest first, searching by the concern's words and API names (`grep -n -i`), not by reading everything:

1. **Pending choices**: `/mnt/project-files/decisions/pending-alignment.md`, when that folder exists. These are accepted but not yet merged, so no other source shows them.
2. **Open spec and ADR PRs**: `spec/*` and `adr/*` branches with an open PR whose title or files touch the concern (`gh pr list --state open --json number,title,headRefName,files`, then filter by branch prefix and the concern's words).
3. **The ledger**: `docs/vs-code-alignment.md`, all three tables.
4. **ADRs**: `docs/decisions/`. One whose Status says "Superseded by" no longer counts; follow the link.
5. **Specs**: the "VS Code alignment" sections of the specs the ledger rows link. A breadcrumb to a later spec means the later one wins.

### 3. Judge the earlier decisions against VS Code

For each relevant decision, place it:

- **Aligned**: it matches VS Code's load-bearing pattern.
- **Justified divergence**: it diverges, and its spec or ADR records a trade-off rooted in gcscode's own context (in-process Svelte host, a GCS rather than an editor, operators rather than developers) that still holds.
- **Unjustified divergence**: it diverges with no recorded trade-off, with one that only says it is simpler, or with one whose premise no longer holds. Treat it as suspect, not as precedent.

### 4. Place the recommendation

- **Aligns with VS Code** and with every earlier decision: say so.
- **Aligns with VS Code but reverses an earlier decision**: recommend it when that decision is an unjustified divergence. Say what it reverses and that the earlier choice had no reason that survives.
- **Diverges from VS Code**: it needs a trade-off rooted in gcscode's context, stated as a labelled decision with the aligned option offered alongside it. Following an earlier divergence is not a reason by itself: if that one is unjustified, recommend realigning instead, or offer both.

When two gcscode sources disagree with each other, say so and recommend the one closer to VS Code.

## Report

Add at most three lines to the recommendation, in plain words:

```
VS Code: contributes.views plus a view provider; the host owns the view's chrome.
gcscode: justified divergence (ledger Divergences, ADR-0005): a view is a Svelte component and the extension owns its chrome; the declarative contributes manifest is a Deferral (ADR-0007).
Flag: none; the in-process Svelte host the divergence rests on still holds.
```

The third line names anything the owner should look at: a divergence and its trade-off, a reversal, or an earlier decision this check found unjustified. A reversal or a new divergence also goes first in the recommendation, never only in these lines. A reversal the owner accepts needs a successor spec or a superseding ADR (`.claude/rules/docs.md` § Specs and ADRs are the historical record).

## Record

When the owner accepts a choice that diverges from VS Code, or reverses an earlier decision, append one line to `/mnt/project-files/decisions/pending-alignment.md` in the same turn. Create the folder and the file if needed. Read the file again just before you write, since other sessions write to it, and only append:

```
- <YYYY-MM-DD> · <concern> · <the choice, one sentence> · <aligns | diverges: trade-off | reverses <source>> · <where it was accepted: thread link> · <the spec or ADR PR that carries it, once one is open>
```

When the check finds an earlier decision unjustified and the owner doesn't act on it there, append it too, marked `suspect <source>`, so a later session or `/housekeeping` can take it up.

When the spec or ADR that carries a pending choice merges, its ledger propagation (the ledger's Maintenance section) adds the row there. The pending line is then stale, but the author of that commit is usually a local session that cannot see the file, so the cleanup belongs to whoever reads it next: each time you read the file in step 2.1, check the PR each line names (`gh pr view <n> --json state`), treat a merged one as recorded in the ledger or the ADR instead, and remove its line. When a spec or ADR PR for a pending line opens and you can see the file, add the PR to that line.

`/mnt/project-files/` is where a Claude Projects session sees the project's shared files. Without it (a local session), you cannot see or write pending choices. Say so in a line above the report, check the other sources, and put the accepted choice in the handoff note.
