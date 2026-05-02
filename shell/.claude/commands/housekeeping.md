---
description: Run a housekeeping iteration — survey for goal-alignment, sharpening opportunities, and gaps; surface findings; let the user pick a cut; brainstorm + spec + plan + execute.
---

# /housekeeping

A periodic alignment-and-cleanup pass on the gcscode codebase. Codified during the 2026-05-01 / 2026-05-02 sequence (`docs/specs/2026-05-01-vs-code-alignment-ledger.md` + `docs/specs/2026-05-01-extensionhost-namespacing.md`).

## When to use

Run after **2–3 feature iterations have shipped** since the last pass — not after every iteration, not less often than every ~5 iterations. Strong signals it's time:

- A feature iteration just merged and there's a natural gap before the next one.
- Stale doc references are accumulating (READMEs lag the code; out-of-scope.md descriptions lag shipped features).
- An ADR-deferred decision's trigger condition is approaching (e.g., the namespacing 5–7 method threshold).
- The user mentions wanting to "check alignment / find drift / sharpen / fill gaps" or similar.
- The user says it's been "a while" since the last pass.

DO NOT run /housekeeping for active feature work or single-iteration brainstorms. Use `/superpowers:brainstorming` for those.

## The procedure

This is a multi-stage flow; each stage gates the next. Don't jump ahead.

### Stage 1 — Survey

Read in this order, skim-not-deep-read, focused on what's changed since the last housekeeping pass:

1. `CLAUDE.md` — current conventions and the "Planning conventions" section.
2. `docs/roadmap.md` — what's shipped, what's planned, Phase status.
3. `docs/out-of-scope.md` — deferred items + their triggers.
4. `docs/vs-code-alignment.md` — the cumulative VS Code alignment ledger.
5. `docs/decisions/` — ADRs in order (latest is most relevant).
6. `docs/specs/` — last 2–3 specs.
7. `packages/extension-api/src/index.ts` — the public API contract.
8. Any package READMEs that have shipped iterations recently.
9. `git log --oneline -30` — recent commit history.
10. `docs/brainfarts.md` — read but treat as inert (per CLAUDE.md, agents must not pull requirements from here).

Optional: peek at the user's auto-memory at `~/.claude/projects/-Users-kevinkroon-Projects-gcscode-shell/memory/MEMORY.md` for current preferences and settled topics. Respect "settled" topics (e.g., Svelte coupling) — high bar to re-open.

### Stage 2 — Surface findings across three dimensions

Use the user's stated framing: **alignment with goals**, where to **sharpen**, where there are **gaps**.

Present findings as a single numbered list, ordered by leverage (1 = most leveraged). Group by sub-category headings inside the list:

- **Top-leverage** — 1–3 observations that are likely to address the user's stated concern (or, if no specific concern, the most consequential silent drifts).
- **Drift fixes** — stale doc references, out-of-date out-of-scope language, README descriptions that lag shipped features. Cheap to fix.
- **Approaching triggers** — deferred items whose conditions are close to firing. Heads-up class.
- **Lower-leverage** — flagged-but-not-urgent observations. Low priority but worth surfacing.

Each observation is one paragraph, max ~5 lines. State what the observation is, where it lives (file:line if applicable), and what acting on it would entail.

Skip tests/test-coverage as a separate dimension unless the user asks — bias toward what's articulated-vs-articulable, not what's covered-vs-coverable.

### Stage 3 — Offer three cuts

Present cuts ordered smallest-to-largest. The 2026-05-01 precedent is canonical:

- **A) Drift-fix only** — smallest. ~3 doc edits, single docs commit, lands on master directly. Mirrors the 2026-04-27-roadmap iteration shape.
- **B) Drift + structural articulation** — medium. Drift fixes plus a new doc that consolidates scattered information (e.g., a ledger, an ADR for a previously-undocumented decision). Two commits on master, still docs-only.
- **C) Drift + structural + a deferred decision pre-resolved** — largest. Includes a code-touching iteration (e.g., a migration). Spec + ADR on master, then a feature branch with multiple feat commits + Code-review-followups + `--no-ff` merge.

Recommend **B** as default unless something specific tips toward A (very little has happened) or C (an architecturally-meaningful decision has its trigger approaching). Let the user pick or define their own combination.

### Stage 4 — Brainstorm and execute

Once the cut is chosen:

- For each meaningful sub-decision in the chosen cut, invoke `superpowers:brainstorming`. Each brainstorm produces a spec at `docs/specs/YYYY-MM-DD-<topic>.md`. (NOT the brainstorming-skill default of `docs/superpowers/specs/`; project CLAUDE.md overrides.)
- After each spec is approved by the user and committed, invoke `superpowers:writing-plans`. Plans land at `docs/plans/YYYY-MM-DD-<topic>.md`. (Same override.)
- For docs-only iterations, execute inline (the 2026-04-27-roadmap precedent: spec/plan land on master, implementation commits land on master directly).
- For code iterations, follow CLAUDE.md's "Subagent-driven plan execution" section: invoke `superpowers:subagent-driven-development` with a worktree. Per-task implementer + spec-compliance review + code-quality review + `Code-review-followup:` commits + final cross-cutting review + `--no-ff` merge via `superpowers:finishing-a-development-branch`.

If multiple iterations are bundled into the cut, do them sequentially. Don't try to brainstorm all of them at once — each gets its own spec, plan, and (for code) feature branch.

### Stage 5 — Propagate to ledger and indices

After the cut ships:

- New alignments / divergences / deferrals → propagate to `docs/vs-code-alignment.md` per its Maintenance section.
- New deferrals → also propagate to `docs/out-of-scope.md` per its existing entries.
- Iteration ships → flip the roadmap checkbox per `docs/roadmap.md` Maintenance.
- Cross-cutting deferrals from per-iteration specs → propagate to `docs/out-of-scope.md` (per CLAUDE.md "Non-goals propagate" rule).

The propagation pass is part of the housekeeping itself — don't end the iteration without it.

## User preferences to respect

Per the user's auto-memory and stated preferences during the 2026-05-01 sequence:

- **Comfortable tempo, small focused iterations.** Default to the smallest cut. Lead with the YAGNI option.
- **VS Code alignment in spirit, not by byte.** Surface every divergence as a labeled decision. Don't introduce new divergences silently.
- **Svelte coupling is settled.** High bar to re-open; only flag if a genuinely new constraint surfaces.
- **Plugin → extension rename, imperative `activate()` API, disposable contract** are settled. Don't re-litigate.
- **Capture offhand feature ideas in `docs/roadmap.md`** — if the user mentions a feature idea in chat during housekeeping, propose adding it to roadmap.md (Considering by default).

## Anti-patterns

- **Asking narrow questions before surveying.** Survey first; surface findings broadly; let the user narrow. Asking "do you want to X?" pre-empts findings the user hasn't been shown yet.
- **Re-litigating settled topics.** Svelte, plugin/extension naming, ADR-0001/0002/0003/0004/0005 decisions are settled. If something genuinely needs re-opening, flag it explicitly with a "this re-opens X" framing — don't sneak it in as a finding.
- **Dumping all observations at the same priority.** Use the leverage hierarchy. The user's attention is finite; the top-leverage finding should be the first one they read.
- **Skipping the spec self-review or user review.** Even when the docs feel obvious, the spec gate exists to catch placeholder text, internal inconsistency, and scope drift. Don't skip.
- **Bundling code iterations onto master directly.** Anything code-touching goes on a feat branch with the subagent-driven flow.

## Reference

This procedure was codified during the 2026-05-01 / 2026-05-02 housekeeping sequence:

- **Iteration 1** (2026-05-01) — VS Code alignment ledger + post-iteration-A drift fixes. Spec: `docs/specs/2026-05-01-vs-code-alignment-ledger.md`. Output: `docs/vs-code-alignment.md` + 3 README/out-of-scope refreshes + CLAUDE.md propagation rule.
- **Iteration 2** (2026-05-01 / 2026-05-02) — Phase C1: ExtensionHost namespacing. Spec: `docs/specs/2026-05-01-extensionhost-namespacing.md`. ADR: `docs/decisions/ADR-0006-extensionhost-namespacing.md`. Output: hard-break API migration on `feat/extensionhost-namespacing` branch.

The "open survey → leverage-ordered findings → A/B/C cuts → brainstorm-the-chosen-cut" pattern is what makes this re-runnable. Stay disciplined about not asking narrow questions before the survey is shown.
