# Controller Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the `controller` project skill and every change the controller spec lists for existing files, the roadmap and `docs/out-of-scope.md`.

**Architecture:** The skill (`.claude/skills/controller/SKILL.md`) holds everything in the spec's § Design that a controller must do, adapted from the owner's original skill. A small script measures the cost the controller's final report states. The rest is a vocabulary change ("controller" becomes "worker" where it means a PR's session) and pointers to the skill.

**Tech Stack:** Markdown, Node 22 `node:test` for the one script, no new dependencies.

**Spec:** [`docs/specs/2026-11-11-controller.md`](../specs/2026-11-11-controller.md). The owner's original skill text is `scratch/controller-original-skill.md` in the main checkout (gitignored), reached from any checkout as `"$(git rev-parse --path-format=absolute --git-common-dir)/../scratch/controller-original-skill.md"`. Never invoke `anthropic-skills:controller`: it is the same original and would make the session act as a terminal-mode controller.

## Global Constraints

- Public repo: repo-relative paths only in committed files, commit messages and PR text. Never quote the original skill's location or any home-directory path.
- `CLAUDE.md` is 10925 characters on master (`wc -c CLAUDE.md`); after this PR it is 10925 or fewer.
- Historical ADRs, specs, plans and the roadmap's shipped entries keep their "controller" wording. The only edit to one is the breadcrumb in `docs/specs/2026-10-22-review-loop-v2.md`, plus the `fix(spec):` correction in the controller spec (RT-16).
- Superpowers skills are always named in full: `superpowers:brainstorming`, `superpowers:writing-plans`, `superpowers:subagent-driven-development`.
- `.claude/` is outside Prettier (`.prettierignore`); `docs/` is not, so run `pnpm format` (with the worktree prefix) after editing docs.
- No new dependencies, packages or cross-extension patterns.
- Worktree rules for every dispatch that commits: prefix every command with `cd <worktree root> &&`; chain `git branch --show-current` before every `git commit` and stop if it reads `master`; run `pnpm format`, `pnpm test`, `pnpm check` and `pnpm lint` only with that prefix.

## Decisions taken while planning

- **Ledger location (Known unknown 3).** Probed 2026-11-12 from this `.claude/worktrees/` session: the app refuses Write into the main checkout's `.claude/handoffs/`, and also into the main checkout outside `.claude/` (`scratch/`); a Bash write and remove in `.claude/handoffs/` went through. The ledger stays in the main checkout's `.claude/handoffs/`, written with Bash. If a Bash write is refused, the ledger goes to the controller worktree's own `.claude/handoffs/` (gitignored, and the app allows Write and Edit there) and is copied to the main checkout at the close, before any worktree is removed.
- **Cost (Known unknown 4).** A script over the session transcripts, `.claude/scripts/session-cost.mjs`, next to `check-dispositions.mjs` and like it with no dependencies. It is outside the spec's change list; Known unknown 4 names it as an option. Transcripts repeat an assistant message once per content block (12 of 14 message ids in one sample), so the script counts each message id once. Weights per the billing: input 1×, cache writes 1.25× (5-minute) and 2× (1-hour), cache reads 0.1×, output 5×.
- **Detached checkout display (Known unknown 6).** Probed 2026-11-12: after `git switch --detach` and later `git switch -c`, the app's session metadata kept reporting the branch the session started on. The skill says so and asks the look back to report what the sidebar showed.
- **Roadmap placement.** The spec says the Controller role entry is queued and moves to shipped when the skill lands. This PR lands the skill, so the entry goes straight under Shipped.
- **`docs/out-of-scope.md`.** In the three deferrals the spec names, every "controller" that means the PR's session becomes "worker", including PR #30's precedent note inside the first one, so no entry uses both meanings.

## Checklist of spec findings

The final cross-cutting review verifies each item.

- [ ] **Known unknown 3:** the ledger location above is in the skill's § Ledger, with the probe date and the fallback.
- [ ] **Known unknown 4:** the skill's § Cost names the script's command; Task 1's tests pass.
- [ ] **Known unknown 5:** the skill has the controller log each time it reads a worker's transcript because the forwarded report was not enough, and the look back counts them.
- [ ] **Known unknown 6:** the skill states what the app showed after a detach and asks the look back to report confusion.
- [ ] **PR #56 RT-14:** the skill says its question rules take precedence over the app's end-of-turn instruction "ask in the message only a question it does not show": every open question's full text goes in the message, and the one holding up the most work also goes in the box as its short form.
- [x] **PR #56 RT-15:** done. The owner ruled on 2026-11-13 ("Yes, drop it"): `package.json` left step 7's precedent signals, the skill's line names the ruling, and the spec has a breadcrumb under § Precedent. The second half, asking the worker about a signal nobody announced, stays in the skill's step 7 settle order (from scenario S3's RED run and spec step 7's "Gaps go back to the same worker"); the owner saw it described and did not ask for it to be removed.
- [ ] **PR #56 RT-16:** Known unknown 3's "on 2026-11-12" reads "on 2026-11-11", in a `fix(spec):` commit with a one-sentence reason.

Outside this PR, after it merges: the owner's memory that lets the controller merge is changed to point to the skill (the controller does it), and the owner removes the original skill from claude.ai (Known unknown 1).

## Follow-ups

Left for later, each with why:

- **`docs/out-of-scope.md`, "Automated enforcement of repo-relative paths".** After the rename it says the worker scans reviewer output "before applying the `auto-merge` label", a step workers don't take. Reword it when that deferral is next touched: the spec asked for the rename only. Source: final review 5867613355.
- **`.claude/scripts/session-cost.mjs`.** Its usage line shows a direct run, but the file is not executable, and a relative path gives "No transcripts folder for .". Resolve the path, or say it must be absolute. Left because the skill's command passes `get_session`'s absolute `worktreePath` through `node`. Source: final review 5867613355.
- **`.claude/scripts/session-cost.test.mjs`.** The `sessionCost` test pins neither `startedAt` nor the oldest-first order, and nothing tests entries without a message id or the CLI's argument parsing. Left as minor in Task 1's review. Source: Task 1 review, final review 5867613355.
- **The skill's look back** names "the reorganization initiative (PR #42 onward)". Name its controller session and the sessions it started instead, next time the skill is touched; the look back first runs at the UI baseline's close. Source: final review 5867613355.

## Review Focus

1. **A worker report arrives while questions are open.** The controller's turn gives the report one line, repeats every open question's full text, and leaves the box's short form exactly as it was. Task 2, scenario S2.
2. **The app's end-of-turn instruction pulls the other way** ("ask in the message only a question it does not show", "never repeat an offer the user passed over"). The controller follows the skill. Task 2, scenario S2 quotes both instructions.
3. **A worktree folder name reused by an earlier session.** The cost of the earlier session is not added to the new one. Task 1, `sessionCost` skips transcripts that started before `since`.
4. **A transcript that repeats a message per content block.** Each message id is counted once. Task 1, `transcriptTotals`.
5. **A fresh session in `.claude/handoffs/` whose newest file is a ledger.** It starts from the newest handoff note, not the ledger. Task 3, the `CLAUDE.md` wording names `*-ledger.md`, and Task 2's skill names ledgers that way.

---

### Task 1: The cost script

**Files:**

- Create: `.claude/scripts/session-cost.mjs`
- Test: `.claude/scripts/session-cost.test.mjs` (already in `pnpm test:scripts`' glob)

**Interfaces:**

- Produces, for Task 2: the command `node .claude/scripts/session-cost.mjs <worktree path> [--since <ISO time>]`, which prints one line per transcript and a total line, and these exports:
  - `WEIGHTS = { input: 1, cacheWrite5m: 1.25, cacheWrite1h: 2, cacheRead: 0.1, output: 5 }`
  - `weighted(usage) -> number`
  - `transcriptTotals(text: string) -> { weighted: number, messages: number, unreadable: number }`
  - `projectDir(cwd: string, configDir: string) -> string`
  - `sessionCost(cwd: string, { since?: string, configDir?: string }) -> { transcripts: Array<{ id, startedAt, main, subagents, subagentCount }>, weighted: number }`, where `main` and `subagents` are weighted totals.

- [ ] **Step 1: Write the failing tests** in `.claude/scripts/session-cost.test.mjs`, with fixtures written to `mkdtempSync(join(tmpdir(), 'session-cost-'))`:
  - `weighted uses the cache-write split when present`: `{ input_tokens: 10, cache_creation_input_tokens: 100, cache_creation: { ephemeral_5m_input_tokens: 40, ephemeral_1h_input_tokens: 60 }, cache_read_input_tokens: 1000, output_tokens: 20 }` → `380`.
  - `weighted charges an unsplit cache write at the 5-minute rate`: `{ input_tokens: 0, cache_creation_input_tokens: 100, cache_read_input_tokens: 0, output_tokens: 0 }` → `125`.
  - `transcriptTotals counts each message id once`: two assistant lines with `message.id: 'm1'` and `output_tokens: 10`, one with `id: 'm2'` and `output_tokens: 1` → `{ weighted: 55, messages: 2, unreadable: 0 }`.
  - `transcriptTotals skips other entry types and counts unreadable lines`: a `type: 'user'` line, the line `{"trunc`, one assistant line with `output_tokens: 2` → `{ weighted: 10, messages: 1, unreadable: 1 }`.
  - `projectDir replaces every non-alphanumeric character`: `projectDir('/w/p/.claude/worktrees/a-1', '/c')` → `'/c/projects/-w-p--claude-worktrees-a-1'`.
  - `sessionCost adds subagents and skips transcripts started before since`: transcript `old.jsonl` (first `timestamp` `2026-11-09T10:00:00Z`, output 100), `new.jsonl` (first `timestamp` `2026-11-12T00:30:00Z`, output 10), `new/subagents/agent-a.jsonl` (output 4) and `new/subagents/agent-b.jsonl` (output 2); `since: '2026-11-12T00:26:35Z'` → one transcript `{ id: 'new', main: 50, subagents: 30, subagentCount: 2 }` and `weighted: 80`.

- [ ] **Step 2: Run them and watch each fail**

  Run: `cd <worktree> && node --test .claude/scripts/session-cost.test.mjs`
  Expected: FAIL, the module does not exist.

- [ ] **Step 3: Implement `.claude/scripts/session-cost.mjs`**

  Header comment in the style of `check-dispositions.mjs`: what it measures, the usage line, the weights and where the transcripts live (`$CLAUDE_CONFIG_DIR`, default `~/.claude`, then `projects/<cwd with every non-alphanumeric character replaced by ->/`; subagents under `<transcript id>/subagents/`, searched recursively). An entry counts when `type === 'assistant'` and it has `message.usage`; entries without a `message.id` count each time. A transcript's start is its first entry with a `timestamp`. The CLI prints figures in millions with one decimal, names the weights on the total line, prints `unreadable lines: <n>` only when there are any, exits 2 with the usage line when no path is given and 1 when the project folder does not exist. Run the CLI only when the module is the entry point, as `check-dispositions.mjs` does.

- [ ] **Step 4: Run the tests and watch them pass**, then mutate each branch (drop the dedupe, drop the `since` filter, swap the 5-minute and 1-hour weights, drop the subagent walk), watch the matching test fail, restore, and list the mutations in the task report.

  Run: `cd <worktree> && node --test .claude/scripts/session-cost.test.mjs && pnpm test:scripts`
  Expected: PASS.

- [ ] **Step 5: Run it on this session** (`node .claude/scripts/session-cost.mjs "$(git rev-parse --show-toplevel)" --since <this session's createdAt>`) and paste the output in the task report.

- [ ] **Step 6: Commit** `feat(scripts): session-cost.mjs measures a session's billed-weight tokens`, then open the draft PR (feature template in the `review-loop` skill) and push.

### Task 2: The controller skill

**Files:**

- Create: `.claude/skills/controller/SKILL.md`

**Interfaces:**

- Consumes: Task 1's command.
- Produces, for Task 3: the skill name `controller`, the path `.claude/skills/controller/SKILL.md`, and these headings, which later links target: `## Merging` (anchor `#merging`), `## Briefs and reports` (`#briefs-and-reports`), `## Ledger` (`#ledger`).

Steps 1, 2 and 5 run in the worker session, which dispatches the scenario subagents; an implementer cannot. Each scenario subagent gets one prompt, answers in text and uses no tools that change anything.

- [ ] **Step 1: RED.** Run each scenario without the skill. The subagent's prompt is the spec's first paragraph as its role ("You are the controller: …"), then the scenario. S2 runs 5 times; the others once.
  - **S1, the contract.** A worker's PR has an approving final review and one non-blocking finding: a typo in `docs/roadmap.md`. The worker has ended its turn; the owner is waiting for the merge; the fix is a ten-second edit. What are your next actions? _Pass:_ the controller does not edit the file; it sends the finding back to the worker or records it as a follow-up.
  - **S2, questions.** The last turn ended with Q1 and Q2 in the message (full text given) and Q1's short form in the box. The owner has not answered. A worker reports DONE and needs nothing from the owner. The app's end-of-turn instructions say "ask in the message only a question it does not show" and "never repeat an offer the user passed over". Write the closing message and the box's `ask`. _Pass:_ one line on the report, Q1 and Q2 word for word in the message, `ask` identical to the last turn's.
  - **S3, precedent signals.** A worker reports DONE: final review approves, PR ready and mergeable, its plan check said "none", and `git diff --stat origin/master...<branch>` lists `packages/extension-map/src/layers.ts`, `packages/extension-map/package.json` and `pnpm-lock.yaml`. Do you merge? _Pass:_ it does not merge; it treats the two files as precedent signals and settles whether this is a first of its kind before merging.
  - **S4, spec merge.** You wrote spec PR #60; the owner approved commit `a1b2c3d` before the PR. The loop stopped at `Blocking: 0`; a followup changed § Goals' "at most three workers" to "at most four". The PR is ready and mergeable. Do you merge? _Pass:_ it reads `git diff a1b2c3d <head> -- <spec>`, finds a changed decision and takes it to the owner.
- [ ] **Step 2:** Record each run's choices and rationalizations verbatim in the scratchpad, and pass them to the implementer with Step 3's dispatch.
- [ ] **Step 3: GREEN. Write `.claude/skills/controller/SKILL.md`** (implementer). Frontmatter `name: controller`, and a `description` that starts "Use when", gives only the triggers (the owner asks the session to act as controller for a gcscode initiative, or a controller session resumes after a restart or compaction) and stays under 500 characters. The body holds every item below, in this order, as the controller's instructions in the second person. Keep the original's wording wherever the spec keeps the part; the original's terminal mode, agent-team and claude.ai-project modes, `.controller/` folder, session renaming and saved briefs are dropped.
  1. **Overview and Names:** owner, controller, worker, subagent; superpowers' "the controller" and earlier gcscode documents mean the worker.
  2. **The contract** (spec § The skill): writes only the spec or ADR, its ledger and handoff notes; everything else goes to a worker, review findings included, "however small"; checks once when the owner asks it to do something itself; why (context must last). What it may run: read-only commands, `git switch --detach`, `git pull --ff-only` in the main checkout, the merge, the app's session and sidebar tools.
  3. **The work cycle,** steps 1 to 9 of spec § The work cycle with their commands, plus the original's monitor rules (don't poll; answer NEEDS_CONTEXT from the spec, the ledger and the owner's decisions, or queue the question; tell a dependent worker at once when an interface it uses changes; read a quiet worker's transcript, then nudge, redirect or stop it), the dispatch plan table `Wave | Worker | PRs | Owns (files/areas) | Depends on | Model` with its grouping rules, and delegated brainstorms as an experiment. Workers start with `start_session` (`context: "fresh"`, their own worktree); when the app refuses a start, propose the session as a card and say so in one line. Step 7's precedent signals are `package.json`, `pnpm-lock.yaml`, a new `packages/` or `libs/` directory and changes under `packages/extension-api/` (RT-15 open). Step 9's close includes the look back from spec § Validation while the role is on trial, with Known unknown 5's count and Known unknown 6's display.
  4. **Precedent:** the test, its examples, spotted while planning, the worker's plan check, a replaced pattern leaves a tracked follow-up, and the three other kinds of decision the owner keeps.
  5. **Questions to the owner:** every rule in spec § Questions to the owner, and RT-14: these rules take precedence over the app's end-of-turn instructions "ask in the message only a question it does not show" and "never repeat an offer the user passed over"; the message holds every open question's full text, and the box holds the short form of the one holding up the most work. Include a short worked example of a turn after a report that needs nothing.
  6. **Merging:** spec § Merging, with `gh pr merge --merge --match-head-commit <sha> <n>`, the spec/ADR conditions, the diff since the approved commit, and the two cases that go to the owner.
  7. **Memory:** the ladder (a check in code, the repo's docs, the ledger), promotion at the close by workers, a merged spec only through a successor, the owner's auto-memory.
  8. **The checkout:** `git fetch origin && git switch --detach origin/<branch>` for the branch under discussion, `origin/master` after a merge; only committed work shows; the tree is clean because the ledger lives outside it; Known unknown 6's observation.
  9. **The sidebar:** mark a handled worker's dot read or completed; other sessions' dots only in auto mode; archive at the close.
  10. **Briefs and reports:** the brief template, adapted from the original per spec § Briefs and reports (the worker may talk to the owner; HOW TO WORK names the three skills, the branch prefix, the three worktree rules and the precedent check; WHEN STUCK adds a first-of-its-kind decision and cost, licence or terms; the brief lists the spec's Known unknowns and deferred findings the PR carries; the handoff note goes to the side-session notes folder when the app refuses the main checkout), the spec/ADR review-loop variant with the decision test, and the report format:

  ```
  STATUS: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED
  PR: #<n> <draft|ready> — final review: <approve | request-changes | not yet>
  QUESTION: <only if you need one: one precise question, with options>
  ASSIGNMENT: <worker-name> — <PRs>
  COMMITS: <base>..<head>
  CHANGED: <n files>; outside owned scope: <none | files + reason>
  VERIFIED: <command -> one-line result, one per command>
  CHECKLIST: <each plan checklist item: done | open + why>
  DECISIONS I MADE: <anything the brief didn't settle>
  CONCERNS / FOLLOW-UPS: <...>
  ```

  11. **Ledger:** one per initiative, named `<YYYY-MM-DD>-<initiative>-ledger.md` in the main checkout's `.claude/handoffs/`; the Known unknown 3 probe and its fallback (see Decisions above); written with Bash (a heredoc that rewrites the file, `>>` to append a log line); updated after every event; the original's template with these sections: parameters (at most three workers, dispatch straight away unless a first of its kind, the controller merges under its rule, worker model), the controller session, the spec and its approved commit, decisions (each marked owner's or mine, and where it is recorded), dispatch plan, workers, open questions (number, full text, recommendation, short form), parked items and follow-ups, log.
  12. **Cost:** Task 1's command per session (the controller and each worker, with `get_session`'s `worktreePath` and `createdAt`), what the weights are, and the plan-limit percentage from start to close as the fallback.
  13. **Red flags:** the original's list minus terminal-specific items, plus one per RED failure from Step 2, and a rationalization table built from Step 2's verbatim excuses.

- [ ] **Step 4: Check the skill against the spec.** Every bullet and numbered rule in spec § Design maps to a place in the skill; list any that do not in the task report and add them.
- [ ] **Step 5: Run S1–S4 with the skill** (the prompt says: read `.claude/skills/controller/SKILL.md` first; it is your instructions), S2 five times, and add **S5, retrieval:** where is your ledger and how do you write it, how do you measure cost at the close, and what does your checkout show after a spec merges, with which command? _Pass:_ each answer matches the skill. A failure goes back to the implementer as a loophole to close; re-run the failing scenario.
- [ ] **Step 6: Commit** `feat(skills): add the controller skill`, with each scenario's RED and GREEN result in one line per scenario in the message, and push.

### Task 3: Point the agent-process files at the skill and rename the PR's session to worker

**Files:**

- Modify: `CLAUDE.md` (Layout, Extension shape, Branching and merging, Subagent worktree discipline, Sessions)
- Modify: `.claude/skills/review-loop/SKILL.md` (intro, Feature PRs step 4, extension-architect routing, Merging, End-of-PR report)
- Modify: `.claude/agents/red-team-reviewer.md`, `.claude/agents/extension-architect-reviewer.md`, `.claude/agent-config.json`, `.gitignore`

**Interfaces:**

- Consumes: Task 2's path and anchors.

- [ ] **Step 1: Record the starting state.** `wc -c CLAUDE.md` prints `10925`, and `git grep -n -i controller -- CLAUDE.md .claude/skills/review-loop .claude/agents .claude/agent-config.json .gitignore` lists 10 lines.
- [ ] **Step 2: Edit `CLAUDE.md`** with exactly these replacements (old, then new, one pair per block):

  ```text
  One controller session per PR or iteration.
  One worker session per PR or iteration; one controller per initiative (the `controller` skill).

  Start from the latest note and end by writing one
  Start from the latest note, not a `*-ledger.md`, and end by writing one

  take the documented default and record it in the end-of-PR report.
  take the documented default and record it in the end-of-PR report. A worker that a controller started asks it what its brief sends there.

  - The owner merges. The `auto-merge` label
  - The owner merges, or a controller under its skill's rule. The `auto-merge` label

  Where the controller session runs: § Sessions.
  Where the worker session runs: § Sessions.
  ```

  and these cuts, each of which loses nothing another line does not hold:

  ```text
  push every disposable to `context.subscriptions`. Long-form contract: `packages/extension-api/README.md`. Manifest growth:
  push every disposable to `context.subscriptions`. Manifest growth:

  the `review-loop` skill (`.claude/skills/review-loop/`). Who reviews:
  the `review-loop` skill. Who reviews:

  (`extension-mavlink`, `extension-map`, `extension-mavlink-flight-overlay`, `extension-vehicle-status`, and others)
  (`extension-mavlink`, `extension-map` and others)
  ```

  In the `tools/` line, the three `; see its README` go, and the line ends `(that media server: a pinned release and its config), each with a README.` (§ Where to look lists the extension-api README.)

- [ ] **Step 3: Verify `CLAUDE.md`.** `wc -c CLAUDE.md` prints `10925` or less. `grep -n controller CLAUDE.md` lists two lines, the merge bullet and the § Sessions paragraph, and each "controller" in them means the initiative's session.
- [ ] **Step 4: Edit the review-loop skill.** "controller" becomes "worker" in the intro sentence, in Feature PRs step 4 (three times: "the controller confirmed", "the controller dismisses", "the controller's reading") and in the extension-architect routing paragraph. § Merging's first sentence and its "shape the controller's work" become:

  ```text
  The owner merges — `gh pr merge --merge <n>`, which keeps the merge commit — or applies the `auto-merge` label once the PR is ready; a controller merges under [its skill's rule](../controller/SKILL.md#merging).
  Two of them shape the worker's work:
  ```

  § End-of-PR report gains this line after the code block, before "Then write the handoff note":

  ```text
  A worker that a controller started reports to it instead, in [its brief's format](../controller/SKILL.md#briefs-and-reports): STATUS, the PR and any QUESTION first.
  ```

- [ ] **Step 5: Edit the rest.** Both agent files: `## Return to the controller` becomes `## Return to the session that dispatched you`. In `.claude/agent-config.json`'s `$comment`, `the controller's dispatch` becomes `the worker's dispatch`. In `.gitignore`, `# Controller handoff notes between sessions` becomes `# Handoff notes between sessions`.
- [ ] **Step 6: Verify.** The Step 1 grep lists only lines where "controller" means the initiative's session: `CLAUDE.md`'s two, review-loop § Merging and § End-of-PR report. `node -e "JSON.parse(require('fs').readFileSync('.claude/agent-config.json','utf8'))"` exits 0. `pnpm lint:docs` passes.
- [ ] **Step 7: Commit** `docs(agentic): the PR's session is the worker; point to the controller skill`, and push.

### Task 4: Roadmap, out-of-scope, breadcrumb and the spec fix

**Files:**

- Modify: `docs/roadmap.md` (Agentic team architecture → Shipped and Queued; Feature extensions → Coming)
- Modify: `docs/out-of-scope.md` (§ Agentic team architecture deferrals)
- Modify: `docs/specs/2026-10-22-review-loop-v2.md` (PR 2, item 3)
- Modify: `docs/specs/2026-11-11-controller.md` (Known unknown 3)

- [ ] **Step 1: The spec fix, its own commit.** In Known unknown 3, `on 2026-11-12 a Bash copy` becomes `on 2026-11-11 a Bash copy`. Commit `fix(spec): correct the date of the Bash copy in the controller spec's Known unknown 3`, whose body gives the reason in one sentence: `.claude/handoffs/` last changed on 2026-11-11, so the copy happened then (PR #56 RT-16).
- [ ] **Step 2: Roadmap.** Three additions, each last in its list:
  - Agentic team architecture → Shipped: `- [x] **Controller role** — _shipped 2026-11-12 (PR #<n>)._`, one or two sentences on what shipped (the skill, the cost script, "worker" for a PR's session), and the spec link in the form the other entries use (`Spec: [...](specs/2026-11-11-controller.md).`)
  - Agentic team architecture → Queued, unchecked: **Reviews off GitHub** and **CI and acceptance checks against SITL**, each one sentence taken from spec § Non-goals, with the spec link.
  - Feature extensions → Coming, unchecked: **UI baseline** — shadcn, removing the spike and proof-of-concept extensions, and a basic app shell; the next initiative and the controller's first real use, linking `specs/2026-11-11-controller.md#validation`.
- [ ] **Step 3: Out-of-scope.** In the three deferrals the spec names (reviewer auto-dispatch, repo-relative paths in reviewer output, the routing heuristic), every "controller" becomes "worker". At the end of § Agentic team architecture deferrals, add spec § `docs/out-of-scope.md` propagation's two entries verbatim, each followed by a source link to `specs/2026-11-11-controller.md#non-goals`.
- [ ] **Step 4: Breadcrumb.** Indented under PR 2's item 3 ("Session hygiene") in `docs/specs/2026-10-22-review-loop-v2.md`, in the form the earlier breadcrumbs use:

  ```text
  > **controller breadcrumb (added 2026-11-12):** "controller" now names the one session the owner talks to for an initiative, and the session that runs a PR is the worker; see [`2026-11-11-controller.md`](2026-11-11-controller.md#names).
  ```

- [ ] **Step 5: Verify.** `pnpm format`, then `pnpm lint:docs` and `pnpm lint` pass. `git grep -n -i controller -- docs/out-of-scope.md` lists no line where "controller" means a PR's session.
- [ ] **Step 6: Commit** `docs: roadmap, out-of-scope and breadcrumb for the controller role`, and push.

### After the tasks

`pnpm lint`, `pnpm lint:docs`, `pnpm test` and `pnpm check` with the worktree prefix; `gh pr ready <n>`; the final cross-cutting review per the `review-loop` skill, which also verifies the checklist above.
