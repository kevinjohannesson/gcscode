# Red-team reviewer implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the red-team reviewer iteration described in [`docs/specs/2026-05-14-red-team-reviewer.md`](../specs/2026-05-14-red-team-reviewer.md). Adds an advisory red-team reviewer role on spec/ADR PRs, establishes spec-PR and ADR-PR workflows, and introduces a reviewer-role registry in CLAUDE.md as substrate for the future expert-reviewer track.

**Architecture:** Doc/workflow change — no application code. One new prompt template file under `.claude/reviewer-prompts/`, one new ADR, multiple CLAUDE.md section edits, and propagation to `docs/out-of-scope.md` / `docs/roadmap.md` / `docs/vs-code-alignment.md`. Bootstrap rule applies: this iteration's spec, plan, and ADR-0008 land on master directly; the feat branch carries the CLAUDE.md edits + prompt template + propagation.

**Tech Stack:** Markdown only. Verification via `pnpm format` (Prettier) and visual diff.

---

## File structure overview

**Already on master before plan execution begins:**

- `shell/docs/specs/2026-05-14-red-team-reviewer.md` — the spec (committed `1154e48` + `4648418`)
- `shell/docs/plans/2026-05-14-red-team-reviewer.md` — this file (will be committed before subagent execution starts)

**Lands on master via controller bootstrap (NOT via the feat branch):**

- `shell/docs/decisions/ADR-0008-reviewer-role-registry.md` — new

**Lands on master via the feat branch `feat/red-team-reviewer` (subagent-executed):**

- `.claude/reviewer-prompts/red-team.md` — new
- `shell/CLAUDE.md` — modified in four sections
- `shell/docs/out-of-scope.md` — propagation edit
- `shell/docs/roadmap.md` — propagation edit
- `shell/docs/vs-code-alignment.md` — propagation edit

**Post-merge validation artifact (controller-executed, separate throwaway PR):**

- `shell/docs/specs/test-red-team-validation.md` (on `test/red-team-iteration-validation` branch only) — new throwaway test doc; PR #2 kept open as permanent reference artifact

---

## Prerequisites (controller, before subagent execution)

These commits land on master directly per the spec's bootstrap rule. Run them before invoking `superpowers:subagent-driven-development`.

### P1: Commit ADR-0008 to master

**Files:**
- Create: `shell/docs/decisions/ADR-0008-reviewer-role-registry.md`

- [ ] **Step 1: Write the ADR file**

Content of `shell/docs/decisions/ADR-0008-reviewer-role-registry.md`:

```markdown
# ADR-0008: Reviewer-role registry

**Date:** 2026-05-14
**Status:** Accepted

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
```

- [ ] **Step 2: Verify the file is on master and clean**

Run from repo root: `cd /Users/kevinkroon/Projects/gcscode && git branch --show-current && git status`

Expected: branch is `master`, working tree shows the new ADR as untracked.

- [ ] **Step 3: Commit + push to master**

Run from repo root:

```bash
cd /Users/kevinkroon/Projects/gcscode && git add shell/docs/decisions/ADR-0008-reviewer-role-registry.md && git commit -m "$(cat <<'EOF'
docs(agentic-team): add ADR-0008 reviewer-role registry

Captures the registry-pattern decision (registry over inline / project-
local skill / upstream contribution) with context, alternatives, and
consequences. First ADR in the agentic-team track; establishes that
significant agentic-team architectural decisions get ADRs going forward
separately from the per-iteration spec format.

Lands on master directly per the red-team-reviewer spec's bootstrap rule
(the spec/ADR-PR workflow this iteration introduces does not yet exist
for its own merge).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)" && git push
```

Expected: commit lands on master, push succeeds.

### P2: Create feature branch `feat/red-team-reviewer` (subagent worktree optional)

- [ ] **Step 1: Create the feat branch off master**

Run from repo root: `cd /Users/kevinkroon/Projects/gcscode && git checkout -b feat/red-team-reviewer && git branch --show-current`

Expected: branch is `feat/red-team-reviewer`.

- [ ] **Step 2: (Optional) Set up worktree if executor prefers**

If using `superpowers:using-git-worktrees`, follow that skill. Otherwise, work directly in the main checkout on the `feat/red-team-reviewer` branch. Either path is fine for this iteration since there is no concurrent feat work.

If a worktree IS used, every bash command in the tasks below must be prefixed with `cd <worktree-path> &&` per the "Subagent worktree discipline" section of CLAUDE.md.

---

## Tasks (subagent-executed on `feat/red-team-reviewer`)

### Task 1: Create the red-team prompt template

**Files:**
- Create: `.claude/reviewer-prompts/red-team.md`

This file is the source of truth for red-team's review behavior. The controller passes its content (with placeholders substituted) into red-team subagent dispatches.

- [ ] **Step 1: Verify the directory does not yet exist and create the file**

Run from repo root: `cd /Users/kevinkroon/Projects/gcscode && ls -la .claude/reviewer-prompts/ 2>&1`

Expected: `ls: .claude/reviewer-prompts/: No such file or directory`. The Write tool will create the directory as part of writing the file.

- [ ] **Step 2: Write the prompt template**

Content of `.claude/reviewer-prompts/red-team.md`:

````markdown
# Red-team reviewer prompt template

This file defines the **review behavior** for the red-team reviewer role on gcscode spec-PRs and ADR-PRs. The controller dispatching a red-team subagent passes this content (with placeholders substituted) as part of the subagent's prompt. Layer 1 plumbing (token helper, PR posting requirement, header convention quick reference) is documented separately in `shell/CLAUDE.md` under "Subagent reviewer PR-posting discipline" and in the Reviewer-role registry.

## Dispatch substitutions

The controller substitutes:

- `{{ARTIFACT_KIND}}` — `spec` or `ADR` (the kind of artifact the PR contains).
- `{{PR_NUMBER}}` — the GitHub PR number to post on.
- `{{REREVIEW_OF_SHA}}` — for re-reviews only, the SHA of the followup commit that prompted the re-review. Omitted for initial reviews.

## Dispatch prompt body

The controller passes everything below this line (with the substitutions above applied) as the subagent's prompt.

---

You are the red-team reviewer for a `{{ARTIFACT_KIND}}` PR (#{{PR_NUMBER}}) in the gcscode repo.

## Your role

You take this job extremely seriously. Your job is to find what is wrong, weak, or under-articulated in the `{{ARTIFACT_KIND}}` under review — even when it looks reasonable on first read. You read the artifact line by line and challenge the premises it relies on.

Two angles of attack, both of which you cover:

**1. Premise challenger.** What assumptions does this `{{ARTIFACT_KIND}}` treat as given? Are those assumptions actually true? Are they unstated dependencies that should be explicit? What happens if any one of them is wrong — does the whole argument collapse?

**2. Consistency reviewer.** Does this `{{ARTIFACT_KIND}}` drift from any prior decision in the repo? Compare against:

- `shell/CLAUDE.md` (project conventions)
- Existing specs in `shell/docs/specs/`
- ADRs in `shell/docs/decisions/`
- `shell/docs/roadmap.md`
- `shell/docs/out-of-scope.md`
- `shell/docs/vs-code-alignment.md`

Drift can be intentional. If you find drift, NAME it explicitly, but do not assume it is a mistake — surface it as something the author should confirm is intentional.

**Out of scope for v1:** devil's advocate / steel-man-the-opposite critique. That is deferred to v2 as a separate agent. If you find yourself wanting to argue "the opposite case for not doing this at all," note it under Open questions for the future devil's-advocate agent, but do not write the opposing argument yourself.

## Tone

- **Verbosity WITHIN a finding** — depth, specificity, citations — is not a failure mode. Be thorough on what you raise.
- **Verbosity by EXPANDING SCOPE** outside the four output sections (premises / drift / open questions / summary) IS a failure mode. Stay inside the sections.
- **Politeness is not a virtue.** Under-critical is the only way to fail.
- **Be specific.** Quote the artifact. Cite line numbers when they exist. Cite which prior document (file + section anchor) you are comparing against.
- If you have nothing of substance to flag, say so explicitly — but only after you have genuinely looked. "I checked X, Y, Z and found nothing of substance to flag" is more useful than silence.
- **Not adversarial for sport.** The character is _thorough_ and _rigorous_, not _hostile_.

## What you have access to

You have read access to the repo. Read what you need to do the job. At minimum, read the PR diff (the artifact under review). Use the file paths listed under "Consistency reviewer" above as your starting points for consistency-checking.

## How to post

Post your review to PR #{{PR_NUMBER}} using:

```bash
GH_TOKEN=$(.claude/scripts/gh-app-token) gh pr review {{PR_NUMBER}} --comment --body "$(cat <<'EOF'
<your review body here, starting with the header below>
EOF
)"
```

Re-fetch the token via the helper for each invocation; don't rely on environment persistence across bash calls.

## Header

The review body must begin with the appropriate header.

- Initial review: `## Red-team review — {{ARTIFACT_KIND}} — Claude Opus 4.7`
- Re-review (only when `{{REREVIEW_OF_SHA}}` is provided): `## Red-team review — {{ARTIFACT_KIND}} (re-review of {{REREVIEW_OF_SHA}}) — Claude Opus 4.7`

The `{{REREVIEW_OF_SHA}}` value is the **followup commit that prompted the re-review** — i.e., the new commit added since the prior review, not the commit the prior review last saw. This matches the empirical convention used in PR #1's validation.

## Output structure

The body has four sections, in order. **Include every section every time.** If a section has nothing of substance to report, write the section header followed by an explicit "Nothing flagged" with justification (see Section 4 for what counts as adequate justification). Silence-without-justification (silent omission) is a failure mode.

### Section 1: Premises challenged

List each premise you challenged. For each:

- State the premise (quote the artifact).
- State the challenge.
- Suggest a way to make the premise explicit if the author wants to keep it.

If nothing to flag here, write:

```
### Premises challenged

Nothing flagged. The artifact's premises appear sound after [brief justification, e.g., "checking each assumption stated in the Context and Goals sections against current repo state"].
```

### Section 2: Drift from existing decisions

**This section always opens with a `Checked against:` line** enumerating the prior documents you actually inspected. Use specific section anchors or specific ADR/spec slugs — bare `CLAUDE.md` does not satisfy this requirement.

Acceptable forms (illustrative):

```
Checked against: CLAUDE.md "Subagent reviewer PR-posting discipline", ADR-0005-extension-boundaries, docs/specs/2026-05-12-reviews-as-artifacts.md
```

```
Checked against: CLAUDE.md "Branching and merging", docs/decisions/ADR-0008-reviewer-role-registry.md, docs/roadmap.md, docs/out-of-scope.md
```

After the `Checked against:` line, list each drift item:

- Name what drifts (quote the `{{ARTIFACT_KIND}}`).
- Cite the prior decision it appears to drift from (specific file + section anchor or ADR/spec slug).
- Note whether the drift appears intentional or accidental. Do not call it a "mistake" — call it "drift" and let the author confirm.

If no drift after checking:

```
### Drift from existing decisions

Checked against: <enumerated list as above>

No drift identified.
```

The `Checked against:` enumeration is required **even when no drift is flagged** — otherwise "no drift" is indistinguishable from "didn't read the priors," which is the failure mode this audit trail is designed to surface.

### Section 3: Open questions

Things the `{{ARTIFACT_KIND}}` doesn't address that you think it should. One bullet each. Brief.

This is also where you note things that belong to the future devil's-advocate agent (e.g., "v2 should examine: is there a structural alternative to PR-based reviewer dispatch — webhooks, mailing lists, async chat threads — that this artifact treats as out of scope?").

If nothing:

```
### Open questions

Nothing flagged.
```

### Section 4: Summary

One paragraph. Your overall assessment: _strong_ / _has-gaps_ / _fundamentally-suspect_. Your honest read.

If you flagged nothing in the prior three sections, this section justifies that — e.g., "Artifact is well-scoped, premises are explicit, no drift identified after checking the priors listed above, no open questions arise from the consistency check." A bare "Nothing flagged" here without explanation fails the silence-without-justification rule.

## Return to controller

After posting the review, return a brief summary to the controller. Under 150 words. Include:

- Whether the review posted successfully (yes/no + any error)
- Count of premises challenged
- Count of drift items flagged
- Count of open questions surfaced
- The verified `Checked against:` line you used (so the controller can confirm the audit trail is concrete)
- One-line overall assessment

Do not include the full review text in your return — it's already on the PR.
````

- [ ] **Step 3: Verify file was created with expected content**

Run from repo root: `cd /Users/kevinkroon/Projects/gcscode && ls -la .claude/reviewer-prompts/red-team.md && head -5 .claude/reviewer-prompts/red-team.md`

Expected: file exists, first line is `# Red-team reviewer prompt template`.

- [ ] **Step 4: Verify branch and commit**

Run from repo root:

```bash
cd /Users/kevinkroon/Projects/gcscode && git branch --show-current && git add .claude/reviewer-prompts/red-team.md && git commit -m "feat(agentic-team): add red-team reviewer prompt template

Per docs/specs/2026-05-14-red-team-reviewer.md. Defines red-team's
review behavior: two angles (premise challenger + consistency reviewer),
tone instructions, output structure with mandatory Checked against:
audit trail in the Drift section, and re-review SHA convention.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

Expected: branch is `feat/red-team-reviewer`; commit succeeds.

---

### Task 2: Add Reviewer-role registry subsection to CLAUDE.md

**Files:**
- Modify: `shell/CLAUDE.md` — insert new subsection inside the "Subagent reviewer PR-posting discipline" section, immediately before the existing "Verdict table:" line (currently around line 93).

The new subsection introduces the registry and populates it with the four current roles.

- [ ] **Step 1: Locate insertion point**

Run from repo root: `cd /Users/kevinkroon/Projects/gcscode && grep -n "^\*\*Verdict table:" shell/CLAUDE.md`

Expected: one match, around line 93. The new subsection inserts immediately ABOVE the `**Verdict table:**` line.

- [ ] **Step 2: Insert the new subsection**

Use the Edit tool to insert before the existing `**Verdict table:**` text.

Old (in `shell/CLAUDE.md`):

```
**Verdict table:**
```

New:

```
**Reviewer-role registry.** Source of truth for reviewer role definitions. The verdict table below is a denormalized quick-reference view of the registry. Architectural rationale: [`docs/decisions/ADR-0008-reviewer-role-registry.md`](docs/decisions/ADR-0008-reviewer-role-registry.md). Prompt templates: `.claude/reviewer-prompts/<role>.md`.

| Role                       | Kind          | Identity                  | Model            | Targets             | Trigger                          | Verdicts                              | Character                                                | Header                                                                          | Re-review header                                                                                       | Prompt template                                  |
| -------------------------- | ------------- | ------------------------- | ---------------- | ------------------- | -------------------------------- | ------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| Spec-compliance            | per-task      | `gcscode-reviewer[bot]`   | Claude Sonnet 4.6 | feature-PR          | After each task commit            | `--comment`, `--request-changes`      | Verify implementation matches the task's spec slice      | `## Spec-compliance review — task <N> — Claude Sonnet 4.6`                      | `## Spec-compliance review — task <N> (re-review of <SHA>) — Claude Sonnet 4.6`                        | (inherits superpowers:subagent-driven-development) |
| Code-quality               | per-task      | `gcscode-reviewer[bot]`   | Claude Sonnet 4.6 | feature-PR          | After spec-compliance passes      | `--comment`, `--request-changes`      | Code quality, idioms, edge cases                          | `## Code-quality review — task <N> — Claude Sonnet 4.6`                         | `## Code-quality review — task <N> (re-review of <SHA>) — Claude Sonnet 4.6`                           | (inherits superpowers:requesting-code-review)      |
| Final cross-cutting        | cross-cutting | `gcscode-reviewer[bot]`   | Claude Opus 4.7   | feature-PR          | End of iteration                  | `--request-changes`, `--approve`      | Cross-cutting concerns missed at per-task level          | `## Final cross-cutting review — Claude Opus 4.7`                               | `## Final cross-cutting review (re-review of <SHA>) — Claude Opus 4.7`                                 | (inherits superpowers:requesting-code-review)      |
| Red-team                   | per-artifact  | `gcscode-reviewer[bot]`   | Claude Opus 4.7   | spec-PR, ADR-PR     | Automatic on PR open              | `--comment` only (v1)                 | Premise challenger + consistency reviewer                | `## Red-team review — <spec or ADR> — Claude Opus 4.7`                          | `## Red-team review — <spec or ADR> (re-review of <SHA>) — Claude Opus 4.7`                            | `.claude/reviewer-prompts/red-team.md`             |

`<SHA>` in re-review headers refers to the **followup commit that prompted the re-review** (the new commit added since the prior review), matching the empirical convention from PR #1's validation.

**Verdict table:**
```

- [ ] **Step 3: Verify the registry inserted correctly**

Run from repo root: `cd /Users/kevinkroon/Projects/gcscode && grep -n "^\*\*Reviewer-role registry" shell/CLAUDE.md && grep -n "^\*\*Verdict table:" shell/CLAUDE.md`

Expected: registry line appears just above verdict table line.

- [ ] **Step 4: Commit**

```bash
cd /Users/kevinkroon/Projects/gcscode && git add shell/CLAUDE.md && git commit -m "feat(agentic-team): add reviewer-role registry to CLAUDE.md

Per docs/specs/2026-05-14-red-team-reviewer.md and
ADR-0008-reviewer-role-registry. The registry is the source of truth for
reviewer role definitions; the existing verdict table becomes a
denormalized quick-reference view.

Populates four rows: Spec-compliance, Code-quality, Final cross-cutting
(existing baseline), and Red-team (new this iteration).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Update verdict table + header examples + add red-team auto-dispatch paragraph

**Files:**
- Modify: `shell/CLAUDE.md` — three small edits inside "Subagent reviewer PR-posting discipline":
  - Add red-team row to verdict table
  - Add red-team examples to header convention example list
  - Add a red-team auto-dispatch paragraph

- [ ] **Step 1: Add red-team row to verdict table**

Use the Edit tool.

Old:

```
| Per-task spec-compliance               |      ✓      |          ✓          |      ✗      |
| Per-task code-quality                  |      ✓      |          ✓          |      ✗      |
| Final cross-cutting (end of iteration) |      ✗      |          ✓          |      ✓      |
```

New:

```
| Per-task spec-compliance               |      ✓      |          ✓          |      ✗      |
| Per-task code-quality                  |      ✓      |          ✓          |      ✗      |
| Final cross-cutting (end of iteration) |      ✗      |          ✓          |      ✓      |
| Red-team (per-artifact, spec/ADR-PRs)  |      ✓      |          ✗          |      ✗      |
```

- [ ] **Step 2: Add red-team examples to header convention example list**

Old:

```
- `## Spec-compliance review — task 3 — Claude Sonnet 4.6`
- `## Code-quality review — task 7 — Claude Sonnet 4.6`
- `## Final cross-cutting review — Claude Opus 4.7`
- `## Spec-compliance review — task 3 (re-review of abc1234) — Claude Sonnet 4.6`
```

New:

```
- `## Spec-compliance review — task 3 — Claude Sonnet 4.6`
- `## Code-quality review — task 7 — Claude Sonnet 4.6`
- `## Final cross-cutting review — Claude Opus 4.7`
- `## Spec-compliance review — task 3 (re-review of abc1234) — Claude Sonnet 4.6`
- `## Red-team review — spec — Claude Opus 4.7`
- `## Red-team review — ADR — Claude Opus 4.7`
- `## Red-team review — spec (re-review of def5678) — Claude Opus 4.7`
```

- [ ] **Step 3: Add red-team auto-dispatch paragraph**

Insert a new paragraph immediately AFTER the existing `**Re-review after a Code-review-followup commit:** ...` paragraph (currently around line 103) and BEFORE the `**Review header convention** ...` paragraph.

Old:

```
**Re-review after a Code-review-followup commit:** controller re-dispatches the same reviewer role + model after the followup commit lands. The re-review posts a **new** review (`--comment` "addressed in `<SHA>`" or another `--request-changes`). Prior reviews stay in the PR timeline — reviewers never dismiss their own prior reviews.

**Review header convention** (mandatory so the single bot identity remains role-legible):
```

New:

```
**Re-review after a Code-review-followup commit:** controller re-dispatches the same reviewer role + model after the followup commit lands. The re-review posts a **new** review (`--comment` "addressed in `<SHA>`" or another `--request-changes`). Prior reviews stay in the PR timeline — reviewers never dismiss their own prior reviews.

**Red-team auto-dispatch (spec/ADR PRs).** When a `spec/<topic>` or `adr/<slug>` PR is opened, the controller automatically dispatches the red-team reviewer per its registry entry. The dispatch uses the same boilerplate as per-task reviewers (token helper, PR posting requirement) and reads its review template from [`.claude/reviewer-prompts/red-team.md`](.claude/reviewer-prompts/red-team.md). Red-team's verdict is `--comment` only in v1 (advisory). On a `Code-review-followup:` commit to the spec/ADR branch, the controller re-dispatches red-team and the re-review header includes `(re-review of <SHA>)` where `<SHA>` is the followup commit (matches the existing re-review convention).

**Review header convention** (mandatory so the single bot identity remains role-legible):
```

- [ ] **Step 4: Add spec/ADR-PR template alongside the existing feature-PR template**

The existing CLAUDE.md has a feature-PR template block beginning with `**PR template for `gh pr create --draft --body "..."`:**` (currently around line 120). Locate it, then insert the spec/ADR-PR template block immediately after it.

First, rename the existing template's heading to make it explicit it's for feature PRs:

Old:

```
**PR template for `gh pr create --draft --body "..."`:**
```

New:

```
**Feature-PR template for `gh pr create --draft --body "..."`:**
```

Then, insert the spec/ADR-PR template block immediately AFTER the closing triple-backtick of the existing feature-PR template's markdown code block (currently around line 138, right before the `**Public repo note.**` paragraph).

Old (the anchor — the line immediately after the closing `````` of the existing template, and the line that follows):

```
**Public repo note.** gcscode is public on GitHub. Reviewer comments are world-readable. Keep reviews professional. Don't paste sensitive context (credentials, internal URLs).
```

New:

```
**Spec/ADR-PR template** (used for `spec/<topic>` and `adr/<slug>` PRs that ship via the spec-PR / ADR-PR workflows from "Branching and merging"):

```md
## <Spec or ADR title>

<one-line summary matching the artifact's first line>

## Links

- Related spec/ADR: …
- Related iteration (if any): …

## Reviewer instructions

Red-team auto-dispatches on PR open per the reviewer-role registry. Future reviewer roles (e.g., domain expert, when they exist) follow per the registry.

🤖 Reviews authored by `gcscode-reviewer[bot]` — see [docs/specs/2026-05-12-reviews-as-artifacts.md](../blob/master/shell/docs/specs/2026-05-12-reviews-as-artifacts.md) for the workflow.
```

**Public repo note.** gcscode is public on GitHub. Reviewer comments are world-readable. Keep reviews professional. Don't paste sensitive context (credentials, internal URLs).
```

- [ ] **Step 5: Verify all four edits landed**

Run from repo root:

```bash
cd /Users/kevinkroon/Projects/gcscode && grep -n "Red-team\|Feature-PR template\|Spec/ADR-PR template" shell/CLAUDE.md | head -15
```

Expected: matches for the verdict-table row, header examples, auto-dispatch paragraph, renamed Feature-PR template header, and new Spec/ADR-PR template heading.

- [ ] **Step 6: Commit**

```bash
cd /Users/kevinkroon/Projects/gcscode && git add shell/CLAUDE.md && git commit -m "feat(agentic-team): wire red-team into verdict table, headers, dispatch, PR templates

Extends the existing reviewer-discipline section with red-team's row in
the verdict-permissions quick reference, header convention examples
(spec / ADR / re-review variants), an auto-dispatch paragraph
describing when red-team fires on spec/ADR PRs, and a new spec/ADR-PR
template alongside the renamed feature-PR template.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Add spec/ADR-PR workflow paragraphs to Branching and merging

**Files:**
- Modify: `shell/CLAUDE.md` — three edits in the "Branching and merging" section (currently lines 38–45):
  - Update the existing "Spec/plan commits can land on master directly" bullet
  - Add a new spec-PR workflow bullet
  - Add a new ADR-PR workflow bullet

- [ ] **Step 1: Update the existing feature-branches bullet**

Old:

```
- **Feature branches.** Implementation work runs on `feat/<topic>` branches off master. Spec/plan commits can land on master directly (they're metadata about future work); code commits live on a branch.
```

New:

```
- **Feature branches.** Implementation work runs on `feat/<topic>` branches off master. Plan commits can land on master directly (they're metadata about future work); code commits live on a branch. Spec and ADR commits land via PR (see "Spec-PR workflow" and "ADR-PR workflow" below).
```

- [ ] **Step 2: Insert spec-PR workflow bullet**

Insert immediately AFTER the bullet above (the updated `**Feature branches.**` line) and BEFORE the `**PR workflow.**` bullet.

Old (the `**PR workflow.**` line, used as the anchor):

```
- **PR workflow.** After the first task commit lands on the feat branch, push to `origin` and open a **draft** PR targeting master via `gh pr create --draft` (template in the reviewer-discipline section). Transition to ready-for-review (`gh pr ready <num>`) at end-of-iteration immediately before the final cross-cutting reviewer runs.
```

New (insert two new bullets immediately before this anchor):

```
- **Spec-PR workflow.** Specs ship via `spec/<topic>` branches off master. Commit the spec file, push, open a draft PR with the spec/ADR-PR template (in the reviewer-discipline section). Red-team auto-dispatches on PR open (advisory `--comment` only in v1). User reads + approves. Merge via `gh pr merge --merge <num>` to preserve the merge-commit boundary, consistent with feature PRs. Bootstrap exception: the spec for the iteration that introduced this workflow (`docs/specs/2026-05-14-red-team-reviewer.md`) landed on master directly per the prior convention.
- **ADR-PR workflow.** ADRs ship via `adr/<slug>` branches. Pick the next ADR-NNNN number at branch creation; file named `ADR-NNNN-<slug>.md` under `docs/decisions/`. Same flow as spec-PR (red-team auto-dispatches; advisory only in v1). ADRs needed mid-feature-iteration ship as their own PR first; the feat branch then references the merged ADR. Bootstrap exception: `ADR-0008-reviewer-role-registry.md` landed on master directly per the prior convention.
- **PR workflow.** After the first task commit lands on the feat branch, push to `origin` and open a **draft** PR targeting master via `gh pr create --draft` (template in the reviewer-discipline section). Transition to ready-for-review (`gh pr ready <num>`) at end-of-iteration immediately before the final cross-cutting reviewer runs.
```

- [ ] **Step 3: Verify edits**

Run from repo root:

```bash
cd /Users/kevinkroon/Projects/gcscode && grep -n "^- \*\*Spec-PR workflow\|^- \*\*ADR-PR workflow\|^- \*\*Feature branches\|^- \*\*PR workflow" shell/CLAUDE.md
```

Expected: four matches, in order: Feature branches, Spec-PR workflow, ADR-PR workflow, PR workflow.

- [ ] **Step 4: Commit**

```bash
cd /Users/kevinkroon/Projects/gcscode && git add shell/CLAUDE.md && git commit -m "feat(agentic-team): add spec/ADR-PR workflows to Branching and merging

Specs ship via spec/<topic> branches and ADRs via adr/<slug> branches.
Red-team auto-dispatches on PR open per its registry entry. Bootstrap
exceptions for this iteration's own spec + ADR are noted in each
workflow's bullet. Plans continue to land on master directly per
existing convention.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Forward-reference + Further reading additions

**Files:**
- Modify: `shell/CLAUDE.md` — two small edits:
  - Add forward reference sentence to "Subagent-driven plan execution" subsection
  - Add three bullets to "Further reading" section

- [ ] **Step 1: Add forward-reference sentence**

Old (the end of the existing "Subagent-driven plan execution" paragraph):

```
This pattern surfaces the same class of issues at three different points (implementer self-review, per-task spec/quality review, final cross-cutting review), and produces a legible `git log` where every followup is traced to the review note that prompted it. Don't squash followups into the originating commit — the review trail is part of the history.
```

New:

```
This pattern surfaces the same class of issues at three different points (implementer self-review, per-task spec/quality review, final cross-cutting review), and produces a legible `git log` where every followup is traced to the review note that prompted it. Don't squash followups into the originating commit — the review trail is part of the history.

Specs and ADRs now ship via their own PRs (see "Spec-PR workflow" and "ADR-PR workflow" in the Branching and merging section above) and receive a red-team auto-dispatched review per the reviewer-role registry. Plans continue to land on master directly.
```

- [ ] **Step 2: Add bullets to Further reading**

Old (the relevant tail of the Further reading section):

```
- `docs/specs/2026-05-12-reviews-as-artifacts.md` — first iteration of the agentic-team-architecture track: GitHub PR workflow + reviewer subagents posting under a GitHub App identity.
- `.claude/agent-config.json` — App ID and installation ID for the `gcscode-reviewer` GitHub App. Private key path lives in `GH_APP_PRIVATE_KEY_PATH` env var, not in repo.
- `.claude/scripts/gh-app-token` — helper that generates short-lived installation tokens. Reviewer subagents call `export GH_TOKEN=$(.claude/scripts/gh-app-token)` before `gh pr review`.
```

New:

```
- `docs/specs/2026-05-12-reviews-as-artifacts.md` — first iteration of the agentic-team-architecture track: GitHub PR workflow + reviewer subagents posting under a GitHub App identity.
- `docs/specs/2026-05-14-red-team-reviewer.md` — second iteration of the agentic-team-architecture track: red-team reviewer on spec/ADR PRs + reviewer-role registry.
- `docs/decisions/ADR-0008-reviewer-role-registry.md` — registry pattern decision; source of truth for reviewer role definitions.
- `.claude/reviewer-prompts/red-team.md` — red-team reviewer prompt template (review behavior, tone, output structure).
- `.claude/agent-config.json` — App ID and installation ID for the `gcscode-reviewer` GitHub App. Private key path lives in `GH_APP_PRIVATE_KEY_PATH` env var, not in repo.
- `.claude/scripts/gh-app-token` — helper that generates short-lived installation tokens. Reviewer subagents call `export GH_TOKEN=$(.claude/scripts/gh-app-token)` before `gh pr review`.
```

- [ ] **Step 3: Verify edits**

Run from repo root:

```bash
cd /Users/kevinkroon/Projects/gcscode && grep -n "Specs and ADRs now ship\|red-team.md\|ADR-0008-reviewer-role-registry\|2026-05-14-red-team-reviewer" shell/CLAUDE.md
```

Expected: at least four matches (forward-ref sentence + three Further reading bullets).

- [ ] **Step 4: Commit**

```bash
cd /Users/kevinkroon/Projects/gcscode && git add shell/CLAUDE.md && git commit -m "docs(agentic-team): forward-reference spec/ADR-PR + extend Further reading

Adds a one-sentence forward reference inside Subagent-driven plan
execution pointing readers at the new spec/ADR-PR workflows. Adds three
Further-reading bullets for the new artifacts: this iteration's spec,
ADR-0008, and the red-team prompt template.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Propagation to out-of-scope.md, roadmap.md, vs-code-alignment.md

**Files:**
- Modify: `shell/docs/out-of-scope.md`
- Modify: `shell/docs/roadmap.md`
- Modify: `shell/docs/vs-code-alignment.md`

- [ ] **Step 1: Update `shell/docs/out-of-scope.md`**

In the "Agentic team architecture deferrals" section, REPLACE the existing `Spec/plan/ADR PR workflow` bullet (because specs and ADRs are no longer deferred) and ADD three new bullets for cross-cutting deferrals from this iteration.

Old (the existing bullet at the end of the agentic-team-architecture deferrals list):

```
- **Spec/plan/ADR PR workflow.** Specs and plans continue to land on master directly per existing convention. Trigger: the planned red-team-reviewer iteration introduces spec-PR workflow.
```

New (replace with three bullets — plan-only since spec/ADR are now no longer deferred):

```
- **Plan-PR workflow.** Plans continue to land on master directly. Specs and ADRs now ship via PR per the red-team-reviewer iteration (`docs/specs/2026-05-14-red-team-reviewer.md`). Trigger to bring plans into PR-workflow: a plan-level reviewer is added.
- **Red-team blocking verdicts + override mechanism.** Red-team is advisory `--comment` only in v1. The verdict-promotion (`--request-changes`) iteration would also need to design the override path for intentional drift vs broken premise. Trigger: v2 brainstorm of the verdict-promotion iteration.
- **Reviewer routing layer.** Which reviewer roles fire on which PRs. Out of scope until there is more than one non-baseline reviewer role. Trigger: a second non-baseline reviewer role is added (e.g., devil's advocate v2 or the first expert reviewer).
```

- [ ] **Step 2: Verify out-of-scope.md edit**

Run: `cd /Users/kevinkroon/Projects/gcscode && grep -n "Plan-PR workflow\|Red-team blocking verdicts\|Reviewer routing layer" shell/docs/out-of-scope.md`

Expected: three matches.

- [ ] **Step 3: Update `shell/docs/roadmap.md`**

The roadmap has two `### Considering` sections — one under `## Feature extensions`, one under `## Agentic team architecture`. The new entries belong under the **Agentic team architecture > Considering** section (the second one).

Run from repo root first to confirm the section anchor:

`cd /Users/kevinkroon/Projects/gcscode && grep -n "^##\|^### Considering" shell/docs/roadmap.md`

Then insert the two new entries at the end of the `Considering (not yet committed)` list inside `## Agentic team architecture`. Use the Edit tool with enough surrounding context to anchor the edit unambiguously to that specific section (not the feature-extensions Considering section).

The two entries to add:

```
- **Reviewer routing layer.** Once there is more than one non-baseline reviewer role (red-team + devil's advocate, or red-team + a first expert reviewer), the controller needs explicit routing for "which reviewer roles fire on which PRs." Surfaced during the red-team-reviewer brainstorm (2026-05-14).
- **Retroactive ADR for reviews-as-artifacts.** The reviews-as-artifacts iteration (2026-05-12) didn't get a dedicated ADR — its rationale lives in the spec. Worth extracting to an ADR-NNNN entry as a housekeeping exercise; nice candidate for an autonomous Claude session that reads the spec + CLAUDE.md updates + the agentic-team-architecture brainstorm transcript and produces the ADR. Decision date 2026-05-12; creation date deferred.
```

- [ ] **Step 4: Verify roadmap.md edit**

Run: `cd /Users/kevinkroon/Projects/gcscode && grep -n "Reviewer routing layer\|Retroactive ADR for reviews-as-artifacts" shell/docs/roadmap.md`

Expected: two matches.

- [ ] **Step 5: `shell/docs/vs-code-alignment.md` — no edit required**

The ledger in `shell/docs/vs-code-alignment.md` is structured per-CONCERN (columns: Concern / VS Code / gcscode / Source / Trigger), not per-iteration. The Maintenance section lists row-addition triggers; none fire for this iteration. The red-team-reviewer spec's VS Code alignment section confirms: no propagation needed. Skip this file in this iteration's docs commit.

- [ ] **Step 6: Commit the two propagation edits in one commit**

```bash
cd /Users/kevinkroon/Projects/gcscode && git add shell/docs/out-of-scope.md shell/docs/roadmap.md && git commit -m "docs(agentic-team): propagate red-team-reviewer deferrals + roadmap entries

- out-of-scope.md: replace generic 'Spec/plan/ADR PR workflow' deferral
  with three more-specific cross-cutting deferrals (plan-PR workflow,
  verdict promotion + override, reviewer routing).
- roadmap.md: add Considering entries (under Agentic team architecture)
  for reviewer routing layer and retroactive ADR for reviews-as-artifacts.

Per docs/specs/2026-05-14-red-team-reviewer.md propagation sections.
No vs-code-alignment.md edit needed: ledger is per-concern, not
per-iteration, and this iteration introduces no extension-architecture
concerns that map onto a VS Code feature.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Final verification + push for review

**Files:** none modified — verification and push only.

- [ ] **Step 1: Run pnpm format to normalize markdown**

```bash
cd /Users/kevinkroon/Projects/gcscode/shell && pnpm format
```

Expected: Prettier formats markdown files. If it produces changes, commit them as a separate `chore: prettier-format <files>` commit. If no changes, proceed.

- [ ] **Step 2: Run pnpm check (svelte-check + tsc) — verify no code regressions**

```bash
cd /Users/kevinkroon/Projects/gcscode/shell && pnpm check
```

Expected: passes. This iteration touches no code; any failure indicates an unrelated pre-existing issue, in which case escalate.

- [ ] **Step 3: Run pnpm lint**

```bash
cd /Users/kevinkroon/Projects/gcscode/shell && pnpm lint
```

Expected: passes.

- [ ] **Step 4: Push branch and open draft PR**

```bash
cd /Users/kevinkroon/Projects/gcscode && git push -u origin feat/red-team-reviewer
```

Then open the draft PR using the standard template from CLAUDE.md "Subagent reviewer PR-posting discipline":

```bash
cd /Users/kevinkroon/Projects/gcscode && gh pr create --draft --base master --head feat/red-team-reviewer --title "feat(agentic-team): add red-team reviewer + reviewer-role registry + spec/ADR-PR workflow" --body "$(cat <<'EOF'
## Iteration

Add red-team as an advisory reviewer role on spec/ADR PRs, introduce a reviewer-role registry as substrate for future expert reviewers, and establish the spec/ADR-PR workflow.

## Links

- Spec: [`docs/specs/2026-05-14-red-team-reviewer.md`](../blob/master/shell/docs/specs/2026-05-14-red-team-reviewer.md)
- Plan: [`docs/plans/2026-05-14-red-team-reviewer.md`](../blob/master/shell/docs/plans/2026-05-14-red-team-reviewer.md)
- ADR: [`docs/decisions/ADR-0008-reviewer-role-registry.md`](../blob/master/shell/docs/decisions/ADR-0008-reviewer-role-registry.md)

## Reviewer instructions

Per-task reviewers post under task-headers. Final cross-cutting review posts at end of iteration. Red-team does NOT auto-dispatch on this PR — this iteration is a feature-PR (not a spec/ADR-PR), and the red-team auto-dispatch rule only applies to spec/ADR-PRs going forward.

🤖 Reviews authored by \`gcscode-reviewer[bot]\` — see [docs/specs/2026-05-12-reviews-as-artifacts.md](../blob/master/shell/docs/specs/2026-05-12-reviews-as-artifacts.md) for the workflow.
EOF
)"
```

Expected: PR URL is printed; PR is draft.

- [ ] **Step 5: Final cross-cutting review dispatched (per existing iteration discipline)**

After all per-task reviews have passed, transition the PR to ready-for-review and dispatch the final cross-cutting reviewer per CLAUDE.md "Subagent reviewer PR-posting discipline." The user then merges via `gh pr merge --merge` once the final cross-cutting review approves.

This step is bookkeeping for the existing iteration workflow; the controller does not merge — the user does.

---

## Post-merge (controller-executed, separate throwaway PR)

### Task 8: Mechanics smoke test — PR #2

Same shape as PR #1 (reviews-as-artifacts validation). Becomes the second permanent worked-example artifact.

**Files:**
- Create on `test/red-team-iteration-validation` branch: `shell/docs/specs/test-red-team-validation.md`

- [ ] **Step 1: Confirm master is up-to-date with the merged feat branch**

```bash
cd /Users/kevinkroon/Projects/gcscode && git checkout master && git pull && git log --oneline -5
```

Expected: master includes the merge commit for `feat/red-team-reviewer`.

- [ ] **Step 2: Create the test branch**

```bash
cd /Users/kevinkroon/Projects/gcscode && git checkout -b test/red-team-iteration-validation
```

- [ ] **Step 3: Write the throwaway test spec**

Create `shell/docs/specs/test-red-team-validation.md` with content:

```markdown
# Test artifact — red-team mechanics validation

This file exists solely to give the validation PR something to diff. It will NOT be deleted; the branch and PR stay as a permanent worked example, same as PR #1.

Purpose: exercise the red-team auto-dispatch + header + Checked-against audit trail + re-review mechanics from `docs/specs/2026-05-14-red-team-reviewer.md` with **scripted** verdicts. Reviewer judgment is not exercised here — Plan 2 of the spec covers that on real spec PRs after this iteration ships.
```

- [ ] **Step 4: Commit initial spec + push branch**

```bash
cd /Users/kevinkroon/Projects/gcscode && git add shell/docs/specs/test-red-team-validation.md && git commit -m "chore(test): add red-team mechanics validation artifact

Throwaway test spec for the red-team-reviewer iteration's mechanics
smoke test (Plan 1 in docs/specs/2026-05-14-red-team-reviewer.md). Kept
as permanent reference artifact in PR #2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" && git push -u origin test/red-team-iteration-validation
```

- [ ] **Step 5: Open PR #2 using the spec-PR template**

```bash
cd /Users/kevinkroon/Projects/gcscode && gh pr create --draft --base master --head test/red-team-iteration-validation --title "test: red-team iteration mechanics validation" --body "$(cat <<'EOF'
## Test artifact — red-team mechanics validation

End-to-end mechanics validation of red-team auto-dispatch + header convention + Checked-against audit trail + re-review pattern from docs/specs/2026-05-14-red-team-reviewer.md. **Not a real spec.**

Scripted verdicts (not real critique judgment). Plan 2 (live validation on real spec PRs) covers critique quality separately.

## Links

- Spec: [\`docs/specs/2026-05-14-red-team-reviewer.md\`](../blob/master/shell/docs/specs/2026-05-14-red-team-reviewer.md)

After step 7 the PR will be **kept open in draft state as permanent reference artifact**, NOT merged. Mirrors PR #1's final disposition.

🤖 Reviews authored by \`gcscode-reviewer[bot]\` — see [docs/specs/2026-05-12-reviews-as-artifacts.md](../blob/master/shell/docs/specs/2026-05-12-reviews-as-artifacts.md) for the workflow.
EOF
)"
```

Capture the PR number for subsequent dispatches.

- [ ] **Step 6: Scripted initial red-team dispatch**

Dispatch a fresh subagent (model: opus) with a scripted body that posts the four expected sections, each with explicit "Nothing flagged" + a sentinel for parse verification, AND a concrete `Checked against:` enumeration.

Dispatch prompt (substitute `<PR>` with the PR number from step 5):

```
You are a reviewer subagent for the red-team iteration mechanics validation. This is a SCRIPTED test — do not exercise judgment about the artifact.

Repo root: /Users/kevinkroon/Projects/gcscode
PR: #<PR>
Verdict: --comment

Post this exact body via `gh pr review` with a freshly-minted bot token:

cd /Users/kevinkroon/Projects/gcscode && GH_TOKEN=$(.claude/scripts/gh-app-token) gh pr review <PR> --comment --body "$(cat <<'EOF'
## Red-team review — spec — Claude Opus 4.7

### Premises challenged

Nothing flagged. (Sentinel: SCRIPTED-MECHANICS-INITIAL-PREMISES)

### Drift from existing decisions

Checked against: CLAUDE.md "Subagent reviewer PR-posting discipline", CLAUDE.md "Branching and merging", docs/decisions/ADR-0008-reviewer-role-registry.md, docs/specs/2026-05-12-reviews-as-artifacts.md

No drift identified.

### Open questions

Nothing flagged. (Sentinel: SCRIPTED-MECHANICS-INITIAL-OPEN-QUESTIONS)

### Summary

Artifact is a deliberately-trivial validation stub. The scripted body is structured to satisfy mechanical compliance criteria from the spec's Plan 1 — bot identity, header convention, four sections present, Checked against: enumeration concrete. Sentinel strings present.
EOF
)"

Then verify the post:
cd /Users/kevinkroon/Projects/gcscode && gh pr view <PR> --json reviews | jq '.reviews[-1] | {author: .author.login, state, header: (.body | split("\n") | .[0])}'

Return to controller: confirmation of post + author + state + header.
```

- [ ] **Step 7: Followup commit**

```bash
cd /Users/kevinkroon/Projects/gcscode && git checkout test/red-team-iteration-validation && echo "
## Followup note

Added per the scripted re-review test in the iteration's smoke plan." >> shell/docs/specs/test-red-team-validation.md && git add shell/docs/specs/test-red-team-validation.md && git commit -m "Code-review-followup: scripted followup for re-review test

Adds a placeholder section so the smoke test can verify the re-review
pattern with a real followup commit SHA.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" && git push && git rev-parse HEAD
```

Capture the followup SHA.

- [ ] **Step 8: Scripted re-review dispatch**

Dispatch a fresh subagent (model: opus). Same shape as step 6 but body includes the re-review header form with the followup SHA from step 7.

Dispatch prompt (substitute `<PR>` and `<SHA>`):

```
You are a reviewer subagent for the red-team iteration mechanics validation re-review. SCRIPTED.

Repo root: /Users/kevinkroon/Projects/gcscode
PR: #<PR>
Followup SHA: <SHA>
Verdict: --comment

Post this exact body:

cd /Users/kevinkroon/Projects/gcscode && GH_TOKEN=$(.claude/scripts/gh-app-token) gh pr review <PR> --comment --body "$(cat <<'EOF'
## Red-team review — spec (re-review of <SHA>) — Claude Opus 4.7

### Premises challenged

Addressed in `<SHA>`. Nothing flagged. (Sentinel: SCRIPTED-MECHANICS-REREVIEW-PREMISES)

### Drift from existing decisions

Checked against: CLAUDE.md "Subagent reviewer PR-posting discipline", CLAUDE.md "Branching and merging", docs/decisions/ADR-0008-reviewer-role-registry.md, docs/specs/2026-05-12-reviews-as-artifacts.md

No drift identified.

### Open questions

Nothing flagged. (Sentinel: SCRIPTED-MECHANICS-REREVIEW-OPEN-QUESTIONS)

### Summary

Re-review of <SHA>. Followup did not introduce drift or new premises to challenge. Mechanical compliance preserved across re-review.
EOF
)"

Then verify both reviews remain in timeline:
cd /Users/kevinkroon/Projects/gcscode && gh pr view <PR> --json reviews,reviewDecision | jq '{reviewDecision, count: (.reviews | length), reviews: [.reviews[] | {state, header: (.body | split("\n") | .[0])}]}'

Substitute `<SHA>` with the actual followup SHA before running.
```

- [ ] **Step 9: Verifications**

After both dispatches, verify from controller side:

```bash
cd /Users/kevinkroon/Projects/gcscode && gh pr view <PR> --json reviews,reviewDecision | jq '{reviewDecision, count: (.reviews | length), reviews: [.reviews[] | {author: .author.login, state, header: (.body | split("\n") | .[0])}]}'
```

Expected:

- `reviewDecision` is empty (advisory `--comment` does not gate)
- 2 reviews
- Both under author `gcscode-reviewer` (bot suffix renders in UI only)
- Initial review header: `## Red-team review — spec — Claude Opus 4.7`
- Re-review header: `## Red-team review — spec (re-review of <SHA>) — Claude Opus 4.7`
- Both reviews present (re-review did not dismiss initial)

- [ ] **Step 10: Post the disposition comment under user identity**

```bash
cd /Users/kevinkroon/Projects/gcscode && gh pr comment <PR> --body "$(cat <<'EOF'
## Disposition — kept as permanent reference artifact

Mechanics validation succeeded. Two scripted red-team reviews posted under `gcscode-reviewer[bot]`, both headers match the convention, both Drift sections include concrete `Checked against:` enumerations, re-review preserves the initial review in the timeline. `reviewDecision` stays empty (advisory).

Mirrors PR #1's disposition: kept open in draft state as a permanent worked example. **Do not merge.**

Plan 2 (live critique quality on real spec PRs) runs separately, on the first genuine spec PR after this iteration ships.
EOF
)"
```

- [ ] **Step 11: Return to master**

```bash
cd /Users/kevinkroon/Projects/gcscode && git checkout master
```

End of plan.

---

## Self-review checklist

After all tasks complete, run a final self-check:

- [ ] All spec sections covered by tasks (spot-check the spec's Goals + non-goals + Architecture + Red-team role definition + CLAUDE.md changes + New files + propagation sections)
- [ ] No placeholders (search for "TBD", "TODO", "fill in" in the plan and all created/modified files)
- [ ] Type/name consistency (registry field names match between ADR-0008, CLAUDE.md registry, and the spec)
- [ ] PR #2 final state matches PR #1's pattern (draft + open + approved-or-empty reviewDecision + kept-as-artifact disposition comment)
