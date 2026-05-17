# Relative paths in reviewer + respondent output

**Slug:** relative-paths-in-reviewer-output
**Iteration on the agentic-team track:** fifteenth.
**Type:** discipline-only iteration. Updates three reviewer-prompt templates + one CLAUDE.md paragraph to mandate repo-relative paths in all PR-comment output. No code, no agent files, no workflow changes.
**No bootstrap exceptions.** Spec ships via spec-PR workflow; implementation lands per the post-merge implementation convention.

## Context

Across PRs #18, #19, and #20, reviewer subagents posted comments containing absolute filesystem paths revealing the user's local layout — `/Users/kevinkroon/Projects/gcscode/shell/docs/specs/...`. 4 review bodies were affected:

- PR #18: `gcscode-reviewer[bot]` initial review (in-flight transition; posted under legacy identity)
- PR #19: `gcscode-spec-quality[bot]` initial review
- PR #20: `gcscode-spec-quality[bot]` initial review + re-review of `a873369`

The leaks were patched out-of-band via the GitHub Reviews API before this spec opened, but the underlying cause is unaddressed: nothing in the reviewer prompt templates, CLAUDE.md, or the controller's dispatch prompts forbids absolute paths in output.

**Root cause analysis:**

- **Dispatch-prompt prefix.** The controller (this session) has been routinely including `The repo working directory is /Users/kevinkroon/Projects/gcscode/` as orientation in dispatch prompts. The subagents then echo paths in absolute form when verifying link mechanics or quoting file locations.
- **Template silence.** None of the three reviewer-prompt templates (`.claude/reviewer-prompts/red-team.md`, `.claude/reviewer-prompts/spec-quality.md`, `.claude/reviewer-prompts/respondent.md`) instruct reviewers to use repo-relative paths.
- **No CLAUDE.md convention.** The "Subagent reviewer PR-posting discipline" section doesn't mandate the discipline; reviewers fell back to natural-language framings that included the absolute paths they saw.

**Why this matters now:**

- **Privacy.** gcscode is a public GitHub repo. Absolute paths leak the username (`kevinkroon`) and filesystem layout. The fix is cheap; the leak is preventable.
- **Portability.** Even on a private repo, absolute paths from one user's machine are useless to anyone else (other contributors, future-self on a different machine, agentic auditors). Repo-relative paths (`shell/docs/...`, `.claude/scripts/...`) are portable and resolve from the repo root.
- **Pattern recurrence risk.** Without an explicit rule, every future reviewer subagent will repeat the leak. The discipline costs nothing to codify and removes the failure mode.

## Why not the bigger version

The bigger version would include:

- **Static lint/check that scans reviewer output for absolute paths.** Could be a `pre-commit` hook on the workflow, or a check in the auto-merge gate. **Smaller wedge:** convention-only, no enforcement automation. **Bigger wedge:** real tooling, real maintenance, real false-positive surface (legitimate use of absolute paths in tutorials, debug logs, etc. — the gate would need to distinguish). YAGNI: a single observation (this iteration's leaks) doesn't justify automation when the convention rule is cheap and the failure mode is highly visible (any reader of the PR sees the leak).
- **Sweeping audit of all historical reviews, comments, and respondent posts.** The 4 leaks on PRs #18-#20 are already patched. There may be older patterns I haven't checked. **Smaller wedge:** focused on the known leaks + the going-forward rule. **Bigger wedge:** scan every comment in repo history; out of scope for this iteration. Trigger to revisit: if the codified rule is added and a future audit (or red-team) discovers more pre-existing leaks, a one-off cleanup iteration follows.
- **Generalize beyond paths: also forbid other local-context leaks (env-var values, hostname, IP addresses).** **Smaller wedge:** scope only to paths. **Bigger wedge:** the broader privacy-sanitization design space is harder to scope; the current observed failure mode is paths specifically. Trigger to revisit: another observed leak class.
- **Apply the rule to non-reviewer subagent output too** (e.g., implementer subagents in `superpowers:subagent-driven-development`). **Smaller wedge:** scope to reviewer + respondent prompt templates (which are the ones writing to GitHub PRs). **Bigger wedge:** implementer output is local-only (no public artifact); the leak only manifests on PR-comment outputs. Trigger to revisit: if implementer subagents ever post to PRs.

This iteration ships: a paragraph in CLAUDE.md, a one-line rule in each of the three reviewer/respondent prompt templates. Direct master commits after merge.

## Goals

1. Codify the rule **"repo-relative paths only in reviewer + respondent output"** in CLAUDE.md "Subagent reviewer PR-posting discipline" subsection.
2. Add the rule to each of the three relevant prompt templates: `.claude/reviewer-prompts/red-team.md`, `.claude/reviewer-prompts/spec-quality.md`, `.claude/reviewer-prompts/respondent.md`.
3. The controller's dispatch prompts MUST NOT include absolute filesystem paths as orientation. Repo orientation is conveyed implicitly via the subagent's working directory and via the template's path conventions.

## Non-goals (this iteration)

- **Automated enforcement** (lint, gate, hook). Convention-only in v1. Trigger to revisit: if a leak recurs after the rule lands.
- **Historical audit** beyond the 4 reviews already patched. Trigger to revisit: a future leak discovered in pre-iteration content.
- **Generalization to other leak classes** (env values, hostnames, IPs). Trigger to revisit: an observed leak class beyond paths.
- **Scope extension to non-PR-posting subagents.** Implementer subagents are local-only; their output doesn't surface publicly.

## Architecture

### The rule

Reviewers + respondents writing to GitHub PR comments MUST use **repo-relative paths**. Paths reference files from the git root (e.g., `shell/docs/specs/2026-05-12-reviews-as-artifacts.md`, `.claude/scripts/gh-app-token-reviewer`). Absolute paths (`/Users/...`, `/home/...`, `/private/tmp/...`, etc.) MUST NOT appear in PR-comment output.

The "git root" here is the directory containing the `.claude/` subdirectory and the `shell/` workspace; in current gcscode layout, the git root is one level above `shell/`.

**Scope (all four output forms):** the rule applies uniformly to (a) quoted file references in review prose, (b) entries on `Checked against:` / `Cross-checked:` / `Tested:` lines, (c) link-resolution paths in spec-quality output, (d) citation targets in respondent `intentional, see <X>` dispositions. The rule does NOT apply to: external URLs (https://...), package names (`@gcscode/shell`), or anchored references that aren't filesystem paths.

**Exception — "the leak IS the finding."** When a reviewer is REPORTING a leaked absolute path (e.g., spec-quality's link-mechanics review flags a malformed link target that's an absolute path), the reviewer SHOULD quote the leaked path inside a fenced code block AND explicitly flag it as a leak. The rule prohibits absolute paths the reviewer chooses to include; it does not prohibit quoting absolute paths the reviewer is FLAGGING. Example forms:

- ✓ Allowed: ``link target `[link](/Users/foo/bar)` at line 42 contains absolute path — leak``
- ✗ Forbidden: `the spec contains a /Users/ path` (no code-block delimiters, no leak-flag)

The same carve-out applies to respondent posts citing a finding from a prior reviewer review.

### CLAUDE.md addition

A new paragraph is added to CLAUDE.md "Subagent reviewer PR-posting discipline" subsection, near the existing "Re-review after a Code-review-followup commit" paragraph. It establishes the rule, names the rationale (privacy + portability), and gives examples of allowed vs forbidden forms.

Full verbatim content in Post-merge implementation > Commit 1.

### Reviewer prompt template additions

Each of the three templates gets a one-line rule in its "Tone" or "How to post" section: "Use repo-relative paths in all output (e.g., `shell/docs/specs/foo.md`, `.claude/scripts/bar`); never include absolute paths revealing local filesystem layout."

Templates updated:

- `.claude/reviewer-prompts/red-team.md`
- `.claude/reviewer-prompts/spec-quality.md`
- `.claude/reviewer-prompts/respondent.md`

Full verbatim content in Post-merge implementation > Commit 2.

### Controller-side dispatch discipline

The controller's dispatch prompts have been routinely including absolute-path orientation lines like `The repo working directory is /Users/kevinkroon/Projects/gcscode/`. This is the **source** of the leak — once the subagent has the absolute path, it can use it in output. **Going forward**, controller dispatch prompts MUST NOT include absolute paths as orientation. Subagents discover their working directory implicitly via the bash tool's cwd; the templates already reference paths in repo-relative form.

This is a controller-behavior change, not a template change. It's documented in the CLAUDE.md addition (Commit 1) so future controllers (human or LLM) follow it.

## Validation

Two distinct tests, with different mechanisms:

- **Test 1 — Dispatch-prompt-discipline validation (THIS PR).** The controller dispatched this PR's reviewers WITHOUT including absolute paths as orientation (deliberately exercising the new dispatch-side discipline). If reviewers produce repo-relative output without dispatch-prompt prodding, the dispatch-side discipline holds. The controller scans each reviewer post before applying the `auto-merge` label; any `/Users/`, `/home/`, `/private/` leak that ISN'T inside a code-block flagged-as-leak (per the carve-out) triggers an immediate followup commit + manual API patch (per the leak-recurrence tripwire's response). **This is a test of dispatch behavior, not template content** — the templates aren't yet updated on this PR.
- **Test 2 — Template-content validation (FIRST post-merge spec/ADR PR).** After post-merge implementation lands the CLAUDE.md addition + the three prompt-template edits, the next real spec/ADR PR's reviewers will dispatch with the updated templates. The rule should hold without the controller doing dispatch-side enforcement. This is the real test that the template content is sufficient on its own. **This is a test of template content, not dispatch behavior.**

If Test 1 fails (a leak appears on THIS PR's review output), the dispatch-side discipline alone is insufficient — the spec's case for template-level codification is strengthened, not weakened. If Test 2 fails (a leak appears post-merge), the templates need tightening; the leak-recurrence tripwire fires.

## VS Code alignment

No VS Code alignment implications. The discipline is gcscode-specific and applies to agentic-team output, not extension architecture.

Propagation to `shell/docs/vs-code-alignment.md`: none.

## `docs/out-of-scope.md` propagation

Both red-team reviewers (Opus + Sonnet) on this PR's initial review independently flagged that the Non-goals list contains cross-cutting architectural deferrals (not just per-iteration scope cuts) and that per CLAUDE.md "Non-goals propagate to `docs/out-of-scope.md`," those cross-cutting items should land in `out-of-scope.md`. The original spec's "No edit" call was wrong; the followup commit corrects it.

**Edit:** under the "Agentic team architecture deferrals" section of `shell/docs/out-of-scope.md`, append three entries — automated leak enforcement, broader leak-class generalization, and scope extension to non-PR-posting subagents. The fourth Non-goal (historical audit) is a one-off cleanup not a cross-cutting deferral; it stays in this spec only.

Verbatim edit content in Post-merge implementation > Commit 4.

## `docs/roadmap.md` propagation

This item is not currently in roadmap.md (the leak was surfaced ad-hoc during PR #20's post-merge review; it wasn't a queued item). Post-merge implementation adds a single Queued/Shipped `[x]` entry.

Verbatim edit content in Post-merge implementation > Commit 3.

## Known unknowns

- **Empirical sample size for "the rule prevents recurrence" is zero post-merge.** This iteration codifies a rule responding to one observed pattern. The first post-merge spec/ADR PR's reviewer output is the first data point.
- **The rule's enforcement is convention-only.** Future iterations may add automation if recurrence happens.
- **Pre-existing leaks not on PRs #18-#20 are unaudited.** The cleanup focused on the four known-bad reviews; older PRs (#11, #15, #16, etc.) and prior issue comments are not scanned. The iteration accepts this — older PRs are kept-open reference artifacts whose content is more historically valuable than the leak's cost.

## Tripwires for known-quality concerns

- **Leak-recurrence tripwire.** If a reviewer or respondent posts any PR comment containing `/Users/`, `/home/`, `/private/`, or other absolute-path prefix AFTER this rule lands, AND the absolute path is NOT inside a code-block flagged-as-leak per the carve-out (Architecture > The rule > Exception), the rule is not being followed. **Fires at N=1 PR** (single observation suffices because the rule is binary and the check is grep-able from the review's raw body — noise-prone failure modes are absent). Response: investigate which subagent + dispatch prompt produced the leak, edit the post via API, and either revise the rule's wording for ambiguity OR escalate to automated enforcement (per Future iterations > 1).

  **Divergence from CLAUDE.md "Reviewer-role design conventions > Tripwires" condition (iii):** condition (iii) says tripwires should be "detectable as a pattern across N PRs rather than per-PR." This tripwire is N=1 per-PR. The divergence is **deliberate**: condition (iii) is a guard against noise-prone signals (a single misfire on something subjective doesn't justify an iteration); a binary grep-able rule like this one doesn't have a noise floor. A single observation is the signal. v1 documents the divergence explicitly here so future readers don't mistake it for an oversight; whether condition (iii) should be revised to permit "N=1 tripwires for binary rules" is queued as a future-iteration question (it's not blocking — both the convention and this divergence stand as-is for now).

This tripwire is a manual check; the controller should scan its own reviewer outputs before applying the `auto-merge` label.

## Future iterations

1. **Automated leak detection.** If the leak-recurrence tripwire fires, design a check (workflow gate, pre-commit hook, or per-post scan) that rejects PR posts containing absolute paths.
2. **Broader leak-class enforcement.** If a different leak class surfaces (env values, hostnames), generalize the rule and its enforcement.
3. **Historical audit beyond PRs #18-#20.** If a pre-iteration leak is discovered in an older PR, a one-off cleanup iteration follows.

## Origin

Surfaced 2026-05-17 by the user during the post-merge review of `auto-merge-bypasses-final-respondent-v2` (PR #20). The user noticed `/Users/kevinkroon/Projects/...` paths in 4 reviewer comments across PRs #18-#20 and asked for both (a) cleanup of the existing leaks and (b) a going-forward rule. The cleanup was completed via direct API PATCH on the 4 affected reviews; this spec codifies the rule.

This iteration is not part of the agentic-team debt-clearing v1 queue (queued items #1-#7). It was surfaced ad-hoc during operational review.

## Post-merge implementation

Per the post-merge implementation convention, **four direct-master commits**. All content fully specified verbatim below.

- **Commit 1:** Add the rule paragraph to CLAUDE.md "Subagent reviewer PR-posting discipline" subsection.
- **Commit 2:** Add the rule to each of the three reviewer/respondent prompt templates (2a-2c), all including the "leak IS the finding" carve-out.
- **Commit 3:** Documentation propagation — add a single Queued/Shipped `[x]` entry to roadmap.md.
- **Commit 4:** `docs/out-of-scope.md` propagation — add three Agentic-team-architecture-deferrals entries for the cross-cutting Non-goals (automated leak enforcement, broader leak-class generalization, scope extension to non-PR-posting subagents).

### Verbatim — Commit 1 (CLAUDE.md edit)

Locate the "Subagent reviewer PR-posting discipline" subsection in `shell/CLAUDE.md`. After the existing paragraphs describing the discipline (the "Dispatch prompt requirements" bullets + the verdict table + the "Re-review after a Code-review-followup commit" paragraph), and **before** the "Auto-dispatch on spec/ADR PRs" subsection, insert the following NEW paragraph:

> **Repo-relative paths in reviewer + respondent output (mandatory).** Reviewer and respondent subagents writing to GitHub PR comments MUST use repo-relative paths. Paths reference files from the git root (e.g., `shell/docs/specs/foo.md`, `.claude/scripts/gh-app-token-reviewer`, `.github/workflows/auto-merge.yml`). Absolute paths (`/Users/...`, `/home/...`, `/private/tmp/...`, etc.) MUST NOT appear in PR-comment output. This applies to all four output forms reviewers produce: quoted file references, `Checked against:` line items, link-resolution paths in spec-quality output, and citation paths in `intentional, see <X>` respondent dispositions. **Exception — "the leak IS the finding":** when a reviewer or respondent is REPORTING a leaked path (e.g., spec-quality flags an absolute-path link target as a structural defect), the leaked path MUST be quoted inside a fenced code block AND explicitly flagged as a leak. The rule prohibits paths the subagent chooses to include in its own prose; it does not prohibit quoting paths the subagent is flagging. **Controller dispatch prompts MUST NOT include absolute paths as orientation** — the leak's actual source is the controller informing the subagent of the absolute working directory; subagents then echo it in output. Rationale: privacy (gcscode is a public repo; absolute paths leak the user's filesystem layout) and portability (paths must be meaningful to other contributors and future-self on a different machine). Spec: [`docs/specs/2026-05-17-relative-paths-in-reviewer-output.md`](docs/specs/2026-05-17-relative-paths-in-reviewer-output.md).

### Verbatim — Commit 2 (reviewer + respondent prompt template edits — three sub-edits)

**2a — `.claude/reviewer-prompts/red-team.md`.** Locate the "Tone" section. After the existing bullet list, append a new bullet:

> - **Repo-relative paths only.** Use repo-relative paths in all output (e.g., `shell/docs/specs/foo.md`, `.claude/scripts/bar`); never include absolute paths revealing local filesystem layout. **Exception:** when the absolute path IS the finding (e.g., flagging a leaked path in the artifact under review), quote it inside a fenced code block AND flag it explicitly as a leak — the rule prohibits paths YOU choose to include, not paths you're REPORTING. See CLAUDE.md "Subagent reviewer PR-posting discipline > Repo-relative paths" + spec [`docs/specs/2026-05-17-relative-paths-in-reviewer-output.md`](../../shell/docs/specs/2026-05-17-relative-paths-in-reviewer-output.md).

**2b — `.claude/reviewer-prompts/spec-quality.md`.** Same as 2a — locate "Tone" section, append the bullet (same wording, including the "leak IS the finding" carve-out). Spec-quality reviewers verifying link mechanics are the most-likely class to need this carve-out: a malformed link target that's an absolute path IS a structural finding spec-quality is supposed to flag.

**2c — `.claude/reviewer-prompts/respondent.md`.** Locate the "Tool surface (citation verification)" section. Append the following paragraph to the END of that section (immediately after the section's last paragraph, BEFORE the next `## Self-fetch (round-aware context)` heading begins):

> **Repo-relative paths only.** Use repo-relative paths in all output (e.g., `shell/docs/specs/foo.md`, `.claude/scripts/bar`); never include absolute paths revealing local filesystem layout. This applies to citation targets in `intentional, see <X>` dispositions and any other file references in the response body. **Exception:** when the absolute path IS the finding being disposed of (e.g., a reviewer flagged a leaked path and the respondent is documenting that disposition), quote the leaked path inside a fenced code block AND flag it as a leak — the rule prohibits paths the respondent chooses to include, not paths the respondent is reporting. See CLAUDE.md "Subagent reviewer PR-posting discipline > Repo-relative paths" + spec [`docs/specs/2026-05-17-relative-paths-in-reviewer-output.md`](../../shell/docs/specs/2026-05-17-relative-paths-in-reviewer-output.md).

### Verbatim — Commit 3 (roadmap.md propagation)

In `shell/docs/roadmap.md`, add the following entry to the **Queued** section of the agentic-team architecture track, immediately after the existing "Auto-merge-bypasses-final-respondent design (v2)" `[x]`-marked entry:

```md
- [x] **Relative paths in reviewer + respondent output** — codifies the rule "repo-relative paths only in PR-comment output" in CLAUDE.md "Subagent reviewer PR-posting discipline" subsection + adds the rule to each of the three reviewer/respondent prompt templates. Surfaced ad-hoc during PR #20's post-merge review when the user noticed 4 reviewer comments across PRs #18-#20 contained absolute `/Users/...` paths. 4 leaked reviews patched out-of-band via the GitHub Reviews API before this spec opened; this spec is the going-forward rule. Includes "leak IS the finding" carve-out (quote-in-code-block + flag-as-leak) for reviewers/respondents reporting leaks. Spec: [`specs/2026-05-17-relative-paths-in-reviewer-output.md`](specs/2026-05-17-relative-paths-in-reviewer-output.md).
```

### Verbatim — Commit 4 (`docs/out-of-scope.md` propagation)

In `shell/docs/out-of-scope.md`, locate the "Agentic team architecture deferrals" section. Append the following three entries to the end of that section (alongside the existing entries):

```md
- **Automated enforcement of "repo-relative paths only" in reviewer/respondent output.** v1 of the rule (per [`specs/2026-05-17-relative-paths-in-reviewer-output.md`](specs/2026-05-17-relative-paths-in-reviewer-output.md)) is convention-only — no workflow gate, pre-commit hook, or per-post scan enforces it. Manual discipline (controller scans reviewer output before applying the `auto-merge` label) is the v1 mechanism. Trigger to revisit: the leak-recurrence tripwire fires (any reviewer/respondent posts an absolute path that isn't a code-block-flagged-as-leak per the carve-out).
- **Broader leak-class enforcement (beyond filesystem paths).** Out of scope for v1. Future leak classes (env-var values, hostnames, IP addresses, other local-context identifiers) would each need their own rule + enforcement design. Trigger to revisit: a different leak class is observed in reviewer/respondent output.
- **Scope extension of "repo-relative paths" to non-PR-posting subagents.** The rule applies only to reviewer + respondent subagents (the ones that write to GitHub PR comments). Implementer subagents (e.g., from `superpowers:subagent-driven-development`) and other non-PR-posting subagents are out of scope because their output is local-only and doesn't surface publicly. Trigger to revisit: implementer subagents start posting to PRs OR another subagent class begins producing public artifacts.
```

The fourth Non-goal (historical audit beyond PRs #18-#20) is intentionally NOT propagated: it's a one-off operational decision about which historical PRs to clean up, not a cross-cutting architectural deferral. The audit either happens (one-off iteration) or doesn't (no further cleanup); there's no class of future iterations to defer.
