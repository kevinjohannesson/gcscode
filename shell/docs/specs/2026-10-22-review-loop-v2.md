# Review loop v2

Graded findings, fix checks and a stop rule for spec/ADR review, three roles removed, and (in a second PR) a controller that works from short context.

**Status:** PR 1 (spec/ADR side) implemented in PR #38. PR 2 (controller discipline and lean context) implemented in PR #39.

This spec is the implementation brief written on 22 Oct 2026 from an evaluation of PRs #2–#36 (the owner's report "gcscode review process evaluation"; the raw data is kept outside the repo), committed as the historical record per the brief, with the parts that turned out wrong corrected (see [Corrections to the brief](#corrections-to-the-brief)). The owner decided the change; this spec records it rather than proposing it.

## Context

- **Round 1 does almost all the useful work.** Across 26 PRs and 778 findings, round 1 found 198 of the 264 high/medium-value problems. Of the 66 found later, 60 were defects the controller's own fixes had introduced.
- **Fixes are the weak point.** 207 findings (27%) were in text a followup had just written. 96 times a fix was claimed and a later review found leftovers (the "fixed it in 1 of 3 places" pattern).
- **No stop rule.** Reviewers could only comment, nothing graded findings as blocking, and the prompts said "Under-critical is the only way to fail". Loops ended when someone got tired.
- **Unique yield per role** (high / medium findings no other role raised):

  | Role                | High | Medium              |
  | ------------------- | ---- | ------------------- |
  | Red-team Opus       | 14   | 74                  |
  | Extension-architect | 7    | 14 (in only 6 PRs)  |
  | Red-team Sonnet     | 1    | 17 (October: 0 / 3) |
  | Spec-quality        | 0    | 3                   |

- **The respondent cost a lot and could not be trusted.** It produced 32% of all subagent output tokens and took 17–33% of active time per PR, and it recorded false dispositions — for example items "routed to roadmap" that never landed.
- **Where the time goes.** A spec/ADR PR took 2–3 h of active time: controller ~40%, reviewers ~30%, respondents ~25%.
- **The controller drowns in context.** It ran #31–#36 in one 5-day session at a median 456k tokens of context.
- **Every agent pays for the pipeline docs.** `shell/CLAUDE.md` was ~72k characters, about 65% of it review-pipeline procedure, and every subagent loads it.
- **Stale model labels.** Review headers hard-coded model names that had stopped being true; the agents actually ran the Claude 5 family.

## Goals

- **Outcome in code over pace.** Rigour moves from spec prose to code and behaviour. Specs get shorter, and spec findings that matter become plan checklist items.
- Spec/ADR review that ends: graded findings, a `Blocking: N` count, fix checks instead of full re-reviews, and a stop rule.
- Fewer roles, chosen by unique yield: red-team (Opus) and the extension architect stay; the Sonnet red-team, the respondent and spec-quality go, replaced by a disposition table and a lint script.
- Auto-merge for spec/ADR PRs reads the reviewers' own blocking count.
- (PR 2) A controller that runs one PR per session from a handoff note, with `shell/CLAUDE.md` at roughly 7–10k characters.

## Non-goals (this iteration)

- **Superpowers is untouched.** Its skills and its spec-compliance, code-quality and final-review prompts are not edited. Everything layered on top is in scope: red-team, spec-quality, extension-architect, respondent, the posting discipline, the CLAUDE.md pipeline sections, `auto-merge.yml`, and the agent files.
- **No new reviewer.** A different lens may replace the Sonnet red-team later (a simplicity/YAGNI reviewer is the leading idea); it goes on the roadmap, not into this work.
- **No separate spec PR.** This brief is committed as the spec inside PR 1.
- **The historical record stays.** Historical specs, plans and ADRs are not rewritten; superseded decisions get one-line breadcrumbs.
- **Process PRs get light review:** one Opus red-team round, then fix checks — not the full panel. That applies to this work's own PRs.
- **Merging** is the owner's: they merge, or apply the `auto-merge` label.
- **Code on a `spec/` branch is this spec's exception, not a route.** PR 1 (#38) carries scripts, agent files and the merge gate on `spec/review-loop-v2` because the brief bundles the spec with its implementation; PR 2 (#39) carries its skill, rules, scripts and ADR-0013 on `spec/review-loop-v2-part-2` so that the same light review governs it. They are the only two. Item 10's Gate 2 change refuses that for every `spec/*` or `adr/*` PR, these two included: the owner merges them by hand.

## Architecture

### How the work runs

- **Own worktree.** Implementation happens in a worktree; the main checkout's branch is never switched.
- **Two PRs, one session each.** PR 1, then a handoff note (state, decisions, open items) at `.claude/handoffs/review-loop-v2.md` (gitignored); a fresh session does PR 2 from that note.
- **Check the docs before relying on harness features** — path-scoped rules, project skills under `shell/.claude/`, `omitClaudeMd`, pinned model IDs. Checked against the Claude Code docs on 2026-10-24; results are folded into the items below.

### PR 1 — review loop v2 (spec/ADR side)

1. **Agent files carry their own instructions.** The bodies of the red-team and extension-architect prompts moved into `.claude/agents/red-team-reviewer.md` and `.claude/agents/extension-architect-reviewer.md`; `.claude/reviewer-prompts/` is gone. The "controller MUST include the template / ERROR" guard is removed (on #36 two reviewers aborted on it). A dispatch passes only variables — `PR`, `KIND`, `MODE` (`initial` or `fix-check`), `FIX_SHA`, `PREVIOUS_REVIEW_ID` — and an agent works out any it is not given. Each agent fixes its own token slug in its body, so a review cannot be posted under the wrong bot (this happened on #32). Agents read the artifact at the PR head, not the local checkout.
2. **Findings format, for every reviewer.** A numbered list; each finding has an ID (`RT-3`, `EA-2`), `[blocking]` or `[non-blocking]`, a location (file:line or section), a one-line problem and a one-line suggested fix. Short reasoning follows for blocking findings only, then a `Checked against:` line, and the review ends with `Blocking: N`. Blocking means it would cause a defect, a wrong decision, or real rework if shipped as written. "Under-critical is the only way to fail" and "Verbosity WITHIN a finding … is not a failure mode" are replaced by "Two failure modes: missing a real defect, and burying it under minor ones." "Include every section every time" is gone.
3. **Fix-check mode** replaces full re-reviews. Input: the fix diff plus the reviewer's own previous review. Output: each earlier open finding marked `[resolved]`, `[not resolved]` or `[partly resolved]` with the remaining locations; new findings are allowed in the diff, and elsewhere only if blocking. Same format, ending `Blocking: N`. Header: `## <Role> fix check of <SHA> — <model>`.
4. **Drift is informational.** Cross-check only against documents the artifact links to, the ADR index, and whatever a grep for the artifact's key terms turns up. Drift is blocking only when it contradicts an accepted ADR; the suggested fix is then "change the spec, or supersede the ADR". Agentic-process specs are out of the cross-check corpus for product PRs.
5. **Routing by kind.**

   | PR                       | Round 1                                                                        | Fix checks                                                                   |
   | ------------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
   | Product spec/ADR         | Red-team + extension-architect (when its heuristic matches) + `pnpm lint:docs` | Red-team; the architect only while its latest review has `Blocking:` above 0 |
   | Agentic-process spec/ADR | Red-team (+ `pnpm lint:docs`)                                                  | Red-team                                                                     |

   The brief listed the lint for product PRs only, while item 8 has the controller run it before any spec/ADR PR; the implementation follows item 8, since the lint is free.

6. **Stop rule.** The loop stops once no finding needs a disposition, or after two fix checks, whichever comes first (step 6 of the `review-loop` skill, `.claude/skills/review-loop/SKILL.md`, is the canonical wording; until PR #39 it was CLAUDE.md's). Each followup disposes of every open finding, deferring what it won't fix in the same commit, so the fix check sees deferrals too. Whatever still needs a disposition when the loop stops — new findings, findings a fix check marked not or partly resolved, rejected `kept:` lines — goes into the spec's Known unknowns (an ADR's Consequences) with its PR-qualified ID, in one closing commit that gets one closing fix check: the loop's last review whatever it says. The brief's version left that commit unreviewed (PR #38 RT-1); the first repair dropped findings a fix check left open and stated the rule two ways (PR #38 RT-13, RT-14). The PR stays a draft until that last review, so neither ordering of review and commit can merge something unreviewed. The controller then marks it ready, reports to the owner and stops; it does not ask "how should I close out".
7. **Three roles removed.** The Sonnet red-team (dispatch and the registry's `Secondary model` column); the respondent (agent file, prompt, CLAUDE.md sections, token helper and config entry — the GitHub App stays installed and unused); spec-quality (agent file, prompt, config entry and token-helper slug). Dangling references were swept with `git grep`.
8. **A lint script replaces spec-quality's mechanical half.** `shell/scripts/lint-docs.mjs` (`pnpm lint:docs`) checks that relative links resolve, including heading anchors; that there are no local paths that leak a username or machine layout (`/Users/<name>`, `/home/<name>`, `C:\Users\<name>`, the dashed `-Users-<name>` form in Claude Code temp and session paths, `/private/tmp/…`); and that a newly added spec or ADR has the required headings. No template existed, so the required headings are the ones current specs and ADRs already share: spec — Context, Goals, Non-goals, VS Code alignment, Known unknowns; ADR — Status, Context, Decision, Consequences. By default it checks markdown changed against `origin/master` and reports problems on changed lines only, so history does not fail a breadcrumb edit; `--all` sweeps everything.
9. **Disposition table in every `Code-review-followup:` commit.** One line per open finding ID: `fixed: <file or hunk>`, `kept: <reason>`, or `deferred: <file>#<section>`. `.claude/scripts/check-dispositions.mjs <PR>` checks that every ID still open in the latest reviews has a line (a finding disposed by a followup since that review counts as closed), that `fixed:` paths exist and are in the commit, and that each `deferred:` target exists and records the finding as `PR #<n> <ID>`. Requiring the PR-qualified ID — rather than "the target file is touched", or the bare ID, which restarts on every PR (PR #38 RT-2) — is what catches "routed to roadmap" claims that never landed.
10. **Gate 3b in `auto-merge.yml`.** It required `gcscode-red-team` count ≥ 2 and `gcscode-spec-quality` count ≥ 1, which breaks once those roles go. It now passes when the last non-blank line of `gcscode-red-team`'s latest review is `Blocking: 0`, and the same for `gcscode-extension-architect` if it has reviewed (its out-of-scope skip ends `Blocking: 0` as well). The trailer must also agree with the review's own tags (distinct IDs tagged `[blocking]`, or `[not resolved]`/`[partly resolved]` then `[blocking]`), and both gates match bot logins exactly, `[bot]` suffix included, so a user account with the App's name cannot stand in for it (PR #38 RT-3). No red-team review, a missing trailer, a count mismatch, or any non-zero count fails closed, so if the loop's last review still counts blocking findings, auto-merge stays off and the owner decides. Gate 2 now refuses `spec/*` and `adr/*` PRs that change anything outside `shell/docs/` (PR #38 RT-4). The workflow's header comments describe the new gates (CLAUDE.md did too until PR #39, which points at the header instead).
11. **Headers and models.** Headers take the model name from the agent's own system prompt — subagents' system prompts do state the model they run as (checked by probe; the docs do not say so) — never from a literal. The live stale model strings are gone; historical specs are untouched. Model IDs are pinned in agent frontmatter, which accepts full IDs per the docs: red-team `claude-opus-5-5`, extension-architect `claude-opus-5-5` (the owner chose Opus over Fable; see [Known unknowns](#known-unknowns)). The pin is the owner's decision; its reason is that an alias silently moves to a new model on release, and the next evaluation needs to know which model produced which findings. The agent files are the only place the ID is written — the registry (CLAUDE.md's table until PR #39, `.claude/agent-config.json` since) points at them — so a release means two edits. If a reviewer's system prompt names no model, its header says `Claude (model not stated)`.
12. **Roadmap.** A Considering entry for a simplicity/YAGNI reviewer, which takes over the devil's-advocate v2 idea: it would argue for less — cut speculative abstraction, question constraints that exist only because an old doc says so, flag deferral triggers that will never fire. The multi-model red-team experiment is recorded as resolved: Sonnet dropped after the October evaluation.

**PR 1 is done when** a grep for the old stale model strings in live (non-historical) files returns nothing; the reviewer prompts live only in the agent files; Gate 3b reads `Blocking: 0`; the lint and disposition scripts run; and the PR has had one red-team round and one fix check.

### PR 2 — controller discipline and lean context

1. **Controller discipline** (the owner's layer, not superpowers'):
   - **Sweep before every fix commit.** Turn each finding into a search (`git grep -n`) across code, tests, specs, plans, ADRs, CLAUDE.md and READMEs. Fix or explicitly keep every hit, and list the hits in the disposition table.
   - **Fix scope.** A followup does only what the findings ask. Any new claim about the repo ("unreachable", "already handled", a count, "deviation from the spec", a deferral trigger) is checked with a command before committing. Unrequested improvements go in a separate commit or on the roadmap.
   - **Spec findings handed to the plan** become checklist items in the plan, and the final cross-cutting review verifies them. This is how the configuration bug was lost.
   - **New tests:** the implementer mutates the changed branches and lists the survivors in its task report. This extends the existing "tests must be seen failing" rule; it goes in CLAUDE.md, not the superpowers prompts.
2. **End-of-PR report to the owner,** in a fixed format: what changed (3–5 bullets); blocking findings and their resolution; non-blocking findings deferred, and where; what the owner should look at in the code (files or functions); open decisions. This report is the owner's main interface; PR comments are history.
3. **Session hygiene.** One controller session per PR or iteration, started from a handoff note in `.claude/handoffs/` and ended by writing one. When working unattended, don't ask questions: take the documented default and record it in the end-of-PR report. Stop and ask only for irreversible decisions.
4. **Context restructure** (target: `shell/CLAUDE.md` ≈ 7–10k characters).

   | Content                                                                                                                                                                 | New home                                                                            |
   | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
   | Product core (what, layout, boundary rule, conventions, extension shape, commands), short git rules, worktree rule, pointers                                            | Stays in `shell/CLAUDE.md`                                                          |
   | Svelte MCP section + the C#-style class conventions (today only in the owner's auto-memory)                                                                             | `shell/.claude/rules/svelte.md`, scoped to `packages/**/*.svelte` and `*.svelte.ts` |
   | Spec/ADR/plan conventions, specs-as-historical-record, non-goals propagation, the VS Code alignment rule                                                                | `shell/.claude/rules/docs.md`, scoped to `docs/**`                                  |
   | Dispatch by kind, findings format, fix checks, stop rule, disposition table, merge gate, per-task posting discipline and dismissal of per-task blocks, end-of-PR report | A `review-loop` skill, loaded only when reviewing                                   |
   - Make `.claude/agent-config.json` the single registry for each role: identity, app ids, agent file, model, routing, verdicts. Delete the registry and verdict tables and slug lists from CLAUDE.md and point to the config instead. `gh-app-token-reviewer` validates slugs against the config. Record the move as a new ADR superseding ADR-0009 — ADR-0009 itself makes Status-flip supersession the convention, and PR 1 already amended it once (PR #38 RT-10).
   - Strip history out of instructions: dates, PR numbers and "Codified…" belong in specs.
   - Docs facts for this step (checked 2026-10-24): path-scoped rules in `shell/.claude/rules/` resolve their `paths:` globs relative to `shell/`; skills in `shell/.claude/skills/` and in the git-root `.claude/skills/` are both discovered from a `shell/` working directory; `omitClaudeMd: true` in agent frontmatter (Claude Code 2.1.271 or later) starts a subagent without CLAUDE.md, an option for the reviewer agents.

5. **Memory cleanup** (the owner's auto-memory): rewrite the `project_dual_purpose` index line to drop "dense docs and slow pace are features"; delete `project_agentic_team_tech_debt` (stale), `project_reviewer_design_patterns` (duplicates CLAUDE.md) and `project_agent_file_discovery_session_bound` once its replacement fact is recorded (hot-reload works except for directories created after session start); move `project_expert_reviewer_track` to the roadmap; fix the stale paths in `project_agent_artifact_location` and `feedback_vscode_alignment`; clarify or expire `feedback_automerge_authorized_for_queued` (its queue has drained) and the "pause agentic-track work" note; move `feedback_svelte_class_wrappers`, `feedback_push_before_dispatching_reviewers` and `project_github_actions_gotchas` into repo rules so subagents see them too.

**PR 2 is done when** CLAUDE.md is ≤ ~10k characters, no registry table appears in more than one place, and a fresh session can run a spec/ADR PR using only the skill and the agent files.

### Separate follow-ups (normal flow, not these PRs)

- **Configuration bug (#25/#26).** In `shell/packages/shell/src/configuration/configuration-store.svelte.ts`, re-registration restores from `_pendingPersisted`, a snapshot set once in the constructor; `update()` never refreshes it, so update → disable → re-enable brings back the boot-time value. Still present on 2026-10-24. Add a test with `update()` between dispose and re-register, then fix.
- **PR #36 spec contradictions.** First check whether the asset-abstraction implementation (PR #37, merged) already resolved them; the `MAV_TYPE` enum shape was fixed in 9748080. Lazy claiming makes case 32 ("activate throws after claiming its source") impossible to set up; the skip-unchanged cache is never reset on re-claim, contradicting case 27; case 10 makes `localId`/`airframe` readonly while the API block labelled "unchanged" still declares them mutable.
- **Privacy.** The owner's home path appears in `shell/docs/specs/2026-05-17-relative-paths-in-reviewer-output.md` (lines 10, 20, 66, 91, 148, per `pnpm lint:docs --all`). The owner decides whether to scrub a historical spec.
- **Parallel-session readiness,** a later PR: hotspot files every iteration edits (CLAUDE.md, roadmap, out-of-scope) conflict across worktrees; auto-merge needs a retry after losing a base-branch race (seen on #31/#32, already on the roadmap); each worktree needs its own dev-server port; disk space.

### Owner's own settings (outside the repo)

- Update Claude Code. The VS Code extension already runs 2.1.309 (enough for the 5.5 models, Fable and `omitClaudeMd`); the `claude` CLI on the owner's PATH was still 2.1.150 on 2026-10-24.
- Set `"cleanupPeriodDays": 365` in the user settings so future evaluations still have session logs.
- Add a Notification hook so the owner is pinged when Claude waits for input; two 5-hour stalls were sessions waiting on a question.

## Validation

- **Scripts.** `pnpm test:scripts` runs 20 unit tests over `lint-docs.mjs` and `check-dispositions.mjs`. Each test was seen failing: a sweep of one mutation per branch was killed in full, each mutation by the test written for it (35/35). The first sweep's 27/27 included one meaningless kill — a fixture for a branch that could never change an outcome (PR #38 RT-2) — so the count measures tests against the code, not the code against real runs.
- **Lint on real docs.** `pnpm lint:docs --all` over 114 tracked markdown files reports 23 problems, all genuine (links inside specs that quote text meant for CLAUDE.md, and the five home-path lines above); none is a false positive. In default mode none of them surfaces unless its line is edited.
- **Gate 3b.** The workflow's `run:` script was executed against a stubbed `gh` in fourteen scenarios — among them no review, a fix check bringing the count to 0, a trailer of 0 under a listed blocker, a user account spoofing the bot login (in both gates), a spec PR carrying code, a rename out of `shell/docs/`, and an old-format review with no trailer — with the expected merge or fail-closed outcome in each. Gate 3b's function also reads PR #38's real round-1 review correctly (2, agreeing with its tags). PR #38, on a `spec/` branch with code, is Gate 2's first live refusal (`pull_request` events use the PR head's workflow file); the owner merges it by hand.
- **Live review.** On PR #38: round 1 (12 findings, 2 blocking), a fix check of the first followup (all 12 resolved, `Blocking: 0`, 4 new non-blocking findings, of which two showed the stop rule stated two ways), then a second followup and its fix check — the loop's second and last.
- **PR 2 (PR #39).** `shell/CLAUDE.md` is 9,829 characters. `pnpm test:scripts` runs 22 tests; the new `#section` check and `section()` were swept with 12 mutations, and the required `#section` added after round 1 (PR #39 RT-5) with 3 more, all killed by the tests written for them, and replaying PR #38's closing commit against the spec as it stood before its Known-unknowns entry existed now reports RT-14, which the old check passed. `gh-app-token-reviewer` returned a token for each of the five roles and refused `spec-quality` and `../x`. A fresh headless session (Claude Code 2.1.310) started in the worktree discovered the `review-loop` skill, loaded `docs.md` on reading `docs/roadmap.md` and `svelte.md` on reading a `.svelte` file (a session running in the main checkout does not load a worktree's rules, PR #39 RT-1, so CLAUDE.md also says to read them), and loaded a git-root rule without `paths` at launch; neither a `../.github/**` glob in `shell/.claude/rules/` nor a git-root rule scoped to `.github/**` loaded when it read the workflow, which is why the GitHub Actions rule is unscoped. The handoff's agent-reload claim failed its probe: after this session fast-forwarded the main checkout so that the git-root `red-team-reviewer.md` became PR #38's version, and again after touching it in place, dispatching `red-team-reviewer` ran the session-start wrapper (it aborted asking for the old prompt template). Round 1 therefore passed the agent body inline, and the owner's `project_agent_file_discovery_session_bound` memory is kept, updated, instead of being deleted as item 5 planned.

## VS Code alignment

Not applicable: an agentic-process change with no effect on the extension API or host.

## `docs/out-of-scope.md` propagation

- Multi-model reviewers: rewritten as tried on red-team and dropped.
- Effort-level control: names red-team and extension-architect instead of spec-quality.
- Red-team blocking verdicts, final spec reviewer with `--approve`, extension-architect verdict promotion: note that `Blocking: N` now gates spec/ADR auto-merge.
- Automated enforcement of reviewer dispatch: points at the new review-loop section; Gate 3b now fails closed without a red-team review.
- Agent file hot-reload: mostly resolved by the harness, except directories created after session start. (PR #39: not borne out; the entry now says so.)
- Repo-relative paths entries: reviewer output only (the respondent is gone); committed docs are checked by `pnpm lint:docs`.
- Removed as resolved or moot: the script-based spec-quality linter (shipped), per-model identities for the red-team pair, required engagement with respondent posts.
- Added: review freshness in Gate 3b (see Known unknowns).
- PR 2: the two entries that pointed at CLAUDE.md's "Review loop for spec/ADR PRs" now point at the `review-loop` skill.

## `docs/roadmap.md` propagation

- Shipped: "Review loop v2 — spec/ADR side"; removal notes on the spec-quality, multi-model and respondent entries.
- Considering: the multi-model evaluation resolved KEEP-OPUS-ONLY; respondent engagement moot; the `.claude/reviewer-prompts/` rename resolved by removing the directory; new entry for the simplicity/YAGNI reviewer.
- PR 2: Shipped "Review loop v2 — controller side"; Considering gains "Expert reviewers as a class", moved from the owner's auto-memory.

## Known unknowns

- **Review freshness in Gate 3b.** The gate reads the latest review's count, not whether that review saw the PR head. The draft-until-last-review rule keeps trailing commits out procedurally; a `commit_id == head` check would enforce it, at the cost of failing closed on any trailing commit. Tracked in `docs/out-of-scope.md` (PR #38 RT-1).
- **Draft discipline is a convention.** The gate is only as good as the controller keeping the PR a draft until the loop's last review; marking it ready early reopens both the late-architect race and the unreviewed-trailing-commit race. Nothing enforces it.
- **Format compliance is untested at scale.** The gate and the disposition checker parse the reviewers' output. One live round on PR #38 is the only evidence that the agents follow the format; a review missing its trailer fails closed (safe), but a mis-tagged finding would slip past the checker.
- **Within-document consistency moved to red-team** (an internal-consistency check in its agent file, PR #38 RT-7). Spec-quality's unique yield there was 0 high / 3 medium, so the expected loss is small either way. Revisit at the next evaluation.
- **"Agentic-process" versus "product" is a judgment call** for both routing and the red-team's cross-check corpus. Misclassifying a mixed PR as process skips the extension architect.
- **Agent edits made in a worktree entered mid-session cannot be dispatched under their own name** in that session (probe, Claude Code 2.1.309). PR #38 was reviewed by the existing `red-team-reviewer` agent with the new instructions passed inline, as the brief anticipated.
- **Fable for the extension architect was not adopted.** The docs say a Fable request from a subagent that needs usage credits re-runs on the fallback model without a prompt, so a Fable architect could silently be something else. The owner chose Opus. The header's real model name lets the next evaluation compare against the October Opus baseline (7 high / 14 medium unique findings over 6 PRs).
- **Step 6's stop condition could read as met before a followup's own fix check (PR #38 RT-17).** Resolved in PR #39: the `review-loop` skill's step 6 stops only when every role due a fix check of the latest followup has posted it, ending `Blocking: 0` with nothing open.
- **Three summaries put the owner's decision at the second fix check (PR #38 RT-14, partly resolved).** Resolved in PR #39: CLAUDE.md now points at the workflow's header comment instead of summarising the gates, and the workflow's header comment and item 10 above put the decision at the loop's last review.
- **A full spec/ADR PR run from the skill alone is still to come.** PR #39 checked the parts with a fresh headless session (the skill is discovered, the rules load on the files they scope) and was itself reviewed by following the skill, but by a session that also had the old CLAUDE.md in context. The next spec/ADR PR, started from a handoff note in a fresh session, is the real test.
- **Reviewer agents still load CLAUDE.md.** `omitClaudeMd: true` was not adopted: at about 9k characters CLAUDE.md is cheap, and it carries the product context red-team cross-checks against. Revisit if it grows past the 10k target again.
- **CLAUDE.md § Subagent worktree discipline still says the controller "should run in the worktree" (PR #39 RT-10, partly resolved).** § Sessions lets a session that creates its own worktree stay where it started, so read alone the line sends that controller looking for a way in mid-session — the owner wait RT-10 was about. The fix is to cut it to "Where the controller session runs: § Sessions." Left because this loop had used its two fix checks; trigger: the next PR that edits `shell/CLAUDE.md`. **Resolved after PR #39 merged:** the sentence now reads "Where the controller session runs: § Sessions."

## Corrections to the brief

What the 22 Oct brief got wrong, checked on 2026-10-24:

- `feat/asset-abstraction-v0` was no longer live in the main checkout: it merged as PR #37 on 21 Oct.
- The running Claude Code was 2.1.309 (VS Code extension), not 2.1.251.
- Agent files do reload mid-session (per the docs), except a directory that did not exist when the session started — which includes a worktree entered mid-session. (PR #39: the positive case failed its probe — on 2.1.309 an agent file changed mid-session, by git or in place, was still dispatched with its session-start content — so the brief's "session-bound" was closer to right.)
- The CLAUDE.md registry's stale model names had already been corrected on 21–22 Oct; the remaining live occurrences were in the reviewer prompts and a CLAUDE.md correction note.
- `.claude/handoffs/` was not gitignored; PR #38 added it.
- Devil's-advocate v2 had no roadmap entry to take over; it was only mentioned in CLAUDE.md and the red-team prompt.
- For Fable, the risk for a subagent is a silent fallback to another model, not a five-minute consent hold (that applies to background sessions and agent-team teammates).
- The privacy spec's leaked lines are 10, 20, 66, 91 and 148 (the brief said 26 for 66).
