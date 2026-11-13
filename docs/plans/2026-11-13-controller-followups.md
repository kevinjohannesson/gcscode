# Controller follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clear the follow-ups that PR #57 (the controller skill) and the controller initiative's close left, before the first real controller run uses the skill.

**Architecture:** Two tasks. Task 1 makes `session-cost.mjs` resolve a relative worktree path and moves its argument parsing into an exported `parseArgs`, with tests for that, for entries without a message id, and for `sessionCost`'s start times and order. Task 2 corrects and extends the controller skill and rewords one deferral in `docs/out-of-scope.md`.

**Tech Stack:** Node ESM scripts, `node:test`, Markdown.

**Spec:** none for this PR. The source is the controller's brief (items 1–7 below); background is [`docs/specs/2026-11-11-controller.md`](../specs/2026-11-11-controller.md) and [`docs/plans/2026-11-12-controller.md`](2026-11-12-controller.md#follow-ups) § Follow-ups, neither of which this PR changes.

## Global Constraints

- `session-cost.mjs`'s output stays exactly as the skill's § Cost quotes it: `<id>  <start>  main 1.5M  subagents 0.3M (4)` per transcript and `total 1.8M weighted tokens (input 1, cache write 1.25 / 2, cache read 0.1, output 5)`.
- `session-cost.mjs` stays mode 644: not executable.
- New tests sit in `.claude/scripts/session-cost.test.mjs`, which `pnpm test:scripts` already runs.
- Changed files: only `.claude/scripts/session-cost.mjs`, `.claude/scripts/session-cost.test.mjs`, `.claude/skills/controller/SKILL.md`, the one deferral in `docs/out-of-scope.md`, and this plan.
- A merged spec is the historical record: `docs/specs/2026-11-11-controller.md` does not change.
- Public repo: repo-relative paths only, no home-directory paths. Session ids are fine.

## Checklist (carried findings)

- [ ] 1. `session-cost.mjs` resolves its worktree argument to an absolute path; its usage comment shows `node .claude/scripts/session-cost.mjs <worktree path> [--since <ISO time>]`. Source: PR #57 final review 5867613355. Task 1.
- [ ] 2. `session-cost.test.mjs` pins `startedAt` and the oldest-first order, and tests entries without a message id and the CLI's argument parsing (`--since`, a missing path). Source: PR #57 Task 1 review, final review 5867613355. Task 1.
- [ ] 3. Skill § 9 step 4 no longer says `archive_session` removes a worktree; it says what happens to the worktrees and checks each worker's worktree first. Source: the initiative's close, observed 2026-11-13. Task 2.
- [ ] 4. Skill § 9 look back asks for the ledger's size at the close. Source: the initiative's close. Task 2.
- [ ] 5. Skill § 9 look back names the reorganization initiative's controller session and the sessions it started ([below](#reorganization-sessions)). Source: final review 5867613355. Task 2.
- [ ] 6. Skill § 3 says format and lint repeat on every revision before the owner approves. Source: PR #57 final review 5884049750. Task 2.
- [ ] 7. `docs/out-of-scope.md`'s repo-relative-paths deferral names the step that actually happens, not a scan "before applying the `auto-merge` label". Source: final review 5867613355. Task 2.

## Reorganization sessions

Found 2026-11-13 with the app's `list_sessions` (`include_archived: true`; each row's `startedBy`) and `get_session` (`createdAt`, `cwd`), and measured the same day with `node .claude/scripts/session-cost.mjs <main checkout>/<folder> --since <createdAt>`. Folders are relative to the main checkout. The figures are the transcript's line, main and subagents in millions of weighted tokens.

| Session                                                 | Id                                           | PR         | Folder                                                 | `createdAt`              | Transcript line                |
| ------------------------------------------------------- | -------------------------------------------- | ---------- | ------------------------------------------------------ | ------------------------ | ------------------------------ |
| gcscode repo reorganization (the controller)            | `local_795c4c46-7bab-4fb2-9bae-d18ec30d7dfc` | #42, #43   | `.claude/worktrees/gcscode-repo-reorganization-b709d9` | 2026-11-08T20:21:16.691Z | `e7268614…` 16.5M, 3.4M (2)    |
| Draft ADR-0014: protocols as languages                  | `local_02c6dc56-9f9a-482f-a99b-6240fce597a1` | #44        | `.worktrees/protocols-as-languages`                    | 2026-11-08T23:36:31.068Z | `3b8b8b08…` 2.7M, 5.7M (5)     |
| ADR-0014 follow-up 1: the rename                        | `local_6c9637e1-2e75-42ac-9f10-4323d45af096` | #46        | `.claude/worktrees/blissful-brattain-637f00`           | 2026-11-09T00:36:41.722Z | `bc55d8e2…` 6.3M, 2.9M (8)     |
| Camera-sim onto master                                  | `local_936a9aa7-94d9-443a-abeb-0e4d19d9f760` | #49        | `.worktrees/camera-sim-v0`                             | 2026-11-09T22:54:33.641Z | `ec5f5a94…` 2.3M, 1.9M (1)     |
| SITL client scripts without the venv step               | `local_448f9019-1e3f-4624-b75d-240fb9aefeba` | #50        | `.claude/worktrees/sitl-no-venv-18fc49`                | 2026-11-09T22:54:50.044Z | `80dfb90a…` 3.6M, 1.2M (3)     |
| Spec: one-command dev stack                             | `local_2229fd6e-939f-48eb-b8cc-3070c1e7274d` | #51        | `.claude/worktrees/dev-stack-spec-7ee06b`              | 2026-11-09T23:09:35.393Z | `8ca2d797…` 2.3M, 4.3M (3)     |
| Test: camera-sim in headless Chrome                     | `local_654a1292-26f4-4796-9dcc-b20302c99fd9` | none       | `.claude/worktrees/laughing-mcnulty-b92a47`            | 2026-11-10T00:20:55.258Z | `beaf8925…` 1.5M, 0.0M (0)     |
| MediaMTX in the repo (dev-stack PR 1)                   | `local_fd321ab0-b436-4525-9278-64cae70fad17` | #52        | `.claude/worktrees/mediamtx-478614`                    | 2026-11-10T00:27:18.375Z | `2a17270e…` 2.5M, 1.8M (3)     |
| One-command dev stack (dev-stack PR 2)                  | `local_ed977196-cb7a-41ef-b6de-9298e65462e9` | #53        | `.claude/worktrees/dev-stack-7484cf`                   | 2026-11-10T01:22:44.897Z | `cd0c755d…` 5.8M, 5.9M (11)    |
| Camera-sim joins pnpm dev:sitl (headless)               | `local_65601619-29be-4b73-8b04-80b53a0d8756` | #54        | `.claude/worktrees/angry-ardinghelli-3d2fbd`           | 2026-11-10T23:03:10.166Z | `812074cd…` 6.4M, 6.3M (9)     |
| Stop a stray camera-sim page fighting the headless one  | `local_f11b75da-cd8f-4b42-9bf9-4bbe1f5b7ee9` | #55 (open) | `.claude/worktrees/blissful-brattain-637f00`           | 2026-11-11T01:35:43.313Z | `7e71d2b5…` 5.5M, 3.9M (10)    |
| A `btw` fork of the controller                          | `local_1501f935-abc6-4cd6-a8fa-8b04650b9a84` | none       | the controller's                                       | 2026-11-08T23:52:33.927Z | `1501f935…`: leave out (below) |
| Fix the reviewer registry's missing superpowers prompts | `local_42ffd19c-565e-4c25-ad9a-4a2771cf1e2d` | #47        | `.claude/worktrees/gracious-banach-4338fa`             | 2026-11-09T07:43:54.574Z | `b3268dbc…` 1.9M, 1.2M (3)     |

- The last row was started by the #46 session, not by the controller.
- `--since` skips earlier sessions in a folder, not later ones, and the app reuses worktree folders: `blissful-brattain-637f00` (#46, then #55), `sitl-no-venv-18fc49` (#50, then PR #57's build worker), `gracious-banach-4338fa` (#47, then PR #56's spec review worker, then this PR's worker). So take each session's line by its start time, not the script's total.
- The `btw` fork's transcript repeats its parent's: it starts at the controller's first timestamp (2026-11-08T20:21:18.270Z) and carries the same two subagents (3.4M). Counting it adds the controller's history twice.
- The controller's folder also holds two transcripts of 0.1M each starting at 20:46 (`72ea1aa6…`, `2e5a5440…`): the controller's own canary probes of which rules load, part of its cost.

## Review Focus

1. **A relative path with a trailing slash or `..`** (`node .claude/scripts/session-cost.mjs ./`). Expected: the same folder as the absolute path. Task 1, `parseArgs` test.
2. **`--since` before the path** (`--since <time> .`). Expected: the time is not taken for the path. Task 1, `parseArgs` test.
3. **A transcript whose first timestamped line is not an assistant entry.** Expected: its start is that first timestamp, so the order follows when the session started. Task 1, order test.
4. **A worker whose worktree has uncommitted changes or an unmerged branch at the close.** Expected: the controller leaves it out of the archive offer and says why. Task 2, step 4's wording (no automated test: skill prose).
5. **A future controller measuring the reorganization sessions with the script's total.** Expected: it reads lines by start time, because folders were reused. Task 2, the look back points at [Reorganization sessions](#reorganization-sessions).

---

### Task 1: `session-cost.mjs` path handling and tests

**Files:**

- Modify: `.claude/scripts/session-cost.mjs` (header comment, new export `parseArgs`, `main`)
- Test: `.claude/scripts/session-cost.test.mjs`

**Interfaces:**

- Produces: `export function parseArgs(args: string[], cwd: string = process.cwd()) -> { path: string, since: string | undefined } | undefined`. `args` is `process.argv.slice(2)`. Returns both keys always (`since: undefined` when absent); `path` is `resolve(cwd, <the path argument>)` from `node:path`. Returns `undefined` when there is no path argument or `--since` has no value. The path argument is the first argument that does not start with `--` and is not the value after `--since`.
- `main` calls `parseArgs`; on `undefined` it prints the usage line to stderr and returns 2, otherwise it uses the resolved `path` everywhere, including in `No transcripts folder for <path>`.
- Everything else (`WEIGHTS`, `weighted`, `transcriptTotals`, `projectDir`, `sessionCost`, the printed lines) stays as it is.

- [ ] **Step 1: Write the failing tests** in `.claude/scripts/session-cost.test.mjs`. Factor the temp-folder setup of the existing `sessionCost` test into a helper (e.g. `fixture(cwd)` returning `{ configDir, put }`) and reuse it.
  - Change the existing `sessionCost adds subagents and skips transcripts started before since` to pin the start: `assert.deepEqual(result.transcripts[0], { id: 'new', startedAt: '2026-11-12T00:30:00Z', main: 50, subagents: 30, subagentCount: 2 })` (no more blanking of `startedAt`).
  - `sessionCost lists transcripts oldest first, each with its first timestamp`: no `since`; files `a.jsonl` (assistant, timestamp `2026-11-12T09:00:00Z`), `b.jsonl` (assistant, `2026-11-12T10:00:00Z`), `c.jsonl` (first line `{ type: 'user', timestamp: '2026-11-12T08:00:00Z' }`, then an assistant entry at `2026-11-12T08:05:00Z`), written in that order. Expect `result.transcripts.map((t) => [t.id, t.startedAt])` to deep-equal `[['c', '2026-11-12T08:00:00Z'], ['a', '2026-11-12T09:00:00Z'], ['b', '2026-11-12T10:00:00Z']]`. (Neither name, creation nor reverse-creation order matches, so a missing sort fails whatever order `readdirSync` returns.)
  - `transcriptTotals counts an entry without a message id every time`: two assistant lines without `message.id`, `output_tokens: 10` each → `{ weighted: 100, messages: 2, unreadable: 0 }`.
  - `parseArgs resolves a relative path against the current directory`: `parseArgs(['.'], '/w/p')` → `{ path: '/w/p', since: undefined }`; `parseArgs(['./'], '/w/p')` → same; `parseArgs(['../p'], '/w/q')` → `{ path: '/w/p', since: undefined }`; `parseArgs(['/w/p'], '/elsewhere')` → `{ path: '/w/p', since: undefined }`.
  - `parseArgs reads --since before or after the path`: `parseArgs(['.', '--since', '2026-11-12T00:26:35Z'], '/w/p')` and `parseArgs(['--since', '2026-11-12T00:26:35Z', '.'], '/w/p')` → both `{ path: '/w/p', since: '2026-11-12T00:26:35Z' }`.
  - `parseArgs refuses a missing path or a missing --since value`: `parseArgs([], '/w/p')`, `parseArgs(['--since', '2026-11-12T00:26:35Z'], '/w/p')` and `parseArgs(['/w/p', '--since'], '/x')` → each `undefined`.
  - `the CLI measures a relative worktree path like its absolute form`: a worktree folder `realpathSync(mkdtempSync(join(tmpdir(), 'session-cost-worktree-')))` (the child's `process.cwd()` is the real path; macOS's tmpdir is a symlink), and one transcript under `projectDir(worktree, configDir)` with `output_tokens: 300000` (weighted 1.5M). Run `execFileSync(process.execPath, [script, arg], { cwd: worktree, env: { ...process.env, CLAUDE_CONFIG_DIR: configDir }, encoding: 'utf8' })` for `arg` `'.'` and for `worktree`; each stdout matches `/^total 1\.5M weighted tokens /m`. `script` is `fileURLToPath(new URL('./session-cost.mjs', import.meta.url))`.
  - `the CLI exits 2 with the usage line when the path is missing`: `spawnSync(process.execPath, [script, '--since', '2026-11-12T00:00:00Z'], { encoding: 'utf8' })` → `status` 2, `stderr` matches `/^Usage: node \.claude\/scripts\/session-cost\.mjs <worktree path> \[--since <ISO time>\]$/m`.

- [ ] **Step 2: Run them and watch the new ones fail**

  Run: `cd <worktree> && node --test .claude/scripts/session-cost.test.mjs`
  Expected: FAIL. `parseArgs` tests fail on the missing export; the relative-path CLI test fails with "No transcripts folder for ."; the usage test fails on the old usage line. The pinned-start, order and id-less tests may already pass (existing behaviour): Step 4's mutations show them failing.

- [ ] **Step 3: Implement `parseArgs` and use it in `main`** (Interfaces above). Header comment: the usage line becomes `Usage: node .claude/scripts/session-cost.mjs <worktree path> [--since <ISO time>]`, plus one sentence that a relative path is resolved against the current directory. The stderr usage string becomes the same `Usage: …` text.

- [ ] **Step 4: Run the tests and watch them pass, then mutate**

  Run: `cd <worktree> && node --test .claude/scripts/session-cost.test.mjs && pnpm test:scripts`
  Expected: PASS. Then apply each mutation alone, watch the named test fail, and restore:
  - `parseArgs` without `resolve` (returns the raw argument) → `parseArgs resolves …` and the relative-path CLI test;
  - `main` passing the raw argument instead of `parseArgs`'s `path` → the relative-path CLI test;
  - `parseArgs` taking the value after `--since` as the path (drop that exclusion) → `parseArgs reads --since …`;
  - `parseArgs` accepting `--since` with no value → `parseArgs refuses …`;
  - `main` returning 1 for a usage error → the usage CLI test;
  - `transcriptTotals` deduping entries without an id (drop the `id !== undefined` guard) → the id-less test;
  - `sessionCost` without the sort → the order test;
  - the start taken from the first assistant entry instead of the first timestamped entry → the order test.
    List every mutation and any that survived in the task report.

- [ ] **Step 5: Run it from the worktree root, relative and absolute**

  Run: `cd <worktree> && node .claude/scripts/session-cost.mjs . && node .claude/scripts/session-cost.mjs "$(pwd)"`
  Expected: the same `total …` line from both. Paste both in the task report.

- [ ] **Step 6: Commit** `fix(scripts): session-cost.mjs resolves a relative worktree path`, with `git branch --show-current` chained before the commit, and push.

### Task 2: The controller skill and the out-of-scope deferral

**Files:**

- Modify: `.claude/skills/controller/SKILL.md` (§ 3. Spec; § 9. Close, step 4 and the look back)
- Modify: `docs/out-of-scope.md` (the deferral "Automated enforcement of "repo-relative paths only" in reviewer output" only)

**Interfaces:**

- Consumes: Task 1's usage form `node .claude/scripts/session-cost.mjs <worktree path> [--since <ISO time>]` (already the skill's § Cost form).
- Links into this plan's [Reorganization sessions](#reorganization-sessions) section, so its heading must keep that anchor.

Use `superpowers:writing-skills` for the skill edits. These are corrections of fact and one added look-back line, not new behaviour to pressure-test: no scenario runs.

- [ ] **Step 1: § 3. Spec (item 6).** After "Then commit, and show the owner the document." insert: "Repeat the format and lint before committing each revision the owner asks for, not only the first."

- [ ] **Step 2: § 9. Close, step 4 (item 3).** Replace the step with:

  > 4. Send the final report, and offer once to archive the initiative's finished sessions. Before you offer, check each worker's worktree: after `git fetch origin`, `git -C <worktree> status --porcelain` and `git -C <worktree> log origin/master..HEAD` both print nothing, so it is clean and its branch merged. Leave a worker that fails out of the offer, and say why. Say in the offer what happens to the worktrees. Observed 2026-11-13: archiving two finished, clean workers left their worktrees on disk, detached, and the app's `get_storage_usage` counted them as "kept ready for new sessions", its reuse pool, which it reuses or reaps on its own, with 0 "kept after archive". A worktree with uncommitted changes is kept after archiving instead, and only `discard_kept_worktree`, which the owner approves, removes it.

- [ ] **Step 3: § 9's look back, first bullet (item 5).** Replace "the cost, set against the reorganization initiative (PR #42 onward) where it can be measured;" with:

  > - the cost, set against the reorganization initiative where it can be measured: its controller, "gcscode repo reorganization" (`local_795c4c46-7bab-4fb2-9bae-d18ec30d7dfc`, PRs #42 and #43), and the sessions whose `startedBy` is that id (`list_sessions` with `include_archived: true`). The follow-ups plan lists them with their worktree folders and start times. Later sessions reused some of those folders, so take each session's line by its start time, not the script's total;

  where "The follow-ups plan" is a link to `../../../docs/plans/2026-11-13-controller-followups.md#reorganization-sessions`, relative to the skill file.

- [ ] **Step 4: § 9's look back, new last bullet (item 4).** End the current last bullet (the sidebar one) with ";" instead of "." and add:

  > - the ledger's size at the close (`wc -c <ledger>`): it is re-read on every resume and its Log only grows, so whether it needs trimming is decided with numbers.

- [ ] **Step 5: `docs/out-of-scope.md` (item 7).** In the deferral "Automated enforcement of "repo-relative paths only" in reviewer output", replace only the sentence "Manual discipline (the worker scans reviewer output before applying the `auto-merge` label) is the v1 mechanism." with:

  > Manual discipline is the v1 mechanism: the worker leaves absolute paths out of every reviewer dispatch, and every dispatch of a superpowers reviewer prompt says "repo-relative paths only" (`.claude/skills/review-loop/SKILL.md`, § Before any dispatch and § Feature PRs); the red-team and extension-architect agent files carry the same rule. No step scans the posted reviews before a merge: neither the `review-loop` skill's § Merging nor the controller skill's § Merging has one.

  Check that `git diff docs/out-of-scope.md` shows one changed line.

- [ ] **Step 6: Lint.** Run `cd <worktree> && pnpm format && pnpm lint:docs && pnpm lint`. Expected: no change from `pnpm format` beyond these files, `lint:docs` reports no problems (the new link and anchor resolve), `lint` exits 0.

- [ ] **Step 7: Commit** `docs(controller): close-out corrections and look-back additions`, with `git branch --show-current` chained before the commit, and push.
