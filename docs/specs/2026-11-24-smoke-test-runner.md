# Smoke test runner: record each result in Linear

**Date:** 2026-11-24
**Status:** Draft

A smoke test's result becomes a Linear record that every session can read. The owner records it in `pnpm smoke`, a local page that walks through [`docs/smoke-tests.md`](../smoke-tests.md) one test at a time and writes each result to that test's ticket. A ticket whose rung has a smoke test reaches Done only once the owner has passed it.

## Context

The owner runs [`docs/smoke-tests.md`](../smoke-tests.md) on the Mac against the real stack and reports back in the project chat. Those reports mix several tests with new findings in one message, and nothing records a pass. On 2026-11-24 the wire probe's thread (GCS-17) did not know its test had passed. What did travel was failures, since someone acts on those.

A merge closes a rung's ticket today, through Linear's GitHub link, before anyone has run its smoke test. Linear closed GCS-17 3 s after PR #70 merged, through the ID in its title. GCS-104 (Palettes) went Done 59 s after PR #99 merged, by its own worker session's hand: the ticket had no PR link at all until another thread added one at 22:34 UTC, so Linear's GitHub link did not close it. So Done means "merged", and Linear cannot tell a proven rung from an untested one. Linear's "close on merge" rule is set per team, so it cannot be turned off only for tickets that have smoke tests: GCS also holds tickets with no smoke test (CI, the merge policy, the theme work), and those should keep closing on merge.

Decisions the owner made in the project thread on 2026-11-24 are marked _(Owner.)_ The rest are marked _(My call.)_ and are listed for the owner in the PR. The owner confirmed the one marked _(My call, for the owner to confirm.)_ on 2026-11-24, so it is now _(Owner.)_

## Goals

1. **Linear is the record.** A GCS state, **Smoke Test**, sits between In Review and Done. Like a QA step, it means merged and waiting for the owner's hands-on check. A Pass moves the ticket to Done and leaves a comment saying when the test ran and against which commit. The repo holds the playbook only, never results. _(Owner.)_
2. **Only rungs with a smoke test wait.** A ticket with a row in the playbook's table is linked from its PRs without closing it, and moves to Smoke Test when a PR for it merges. Every other ticket closes on merge as today. The playbook's table says which tickets have a smoke test. _(Owner.)_
3. **The owner records results in `pnpm smoke`,** a local page in the repo, not on claude.ai. It reads the playbook from the checkout and writes to Linear itself. A new playbook entry shows up without any change to the runner. _(Owner.)_
4. **A failure goes back to its rung; a finding gets its own ticket.** If something the owner saw makes a line under a test's **Expect** false, that test fails and its ticket returns to In Progress with the owner's note. Anything else the owner noticed becomes a new Backlog ticket related to the rung's. _(Owner.)_
5. **The owner tells the project, in one consistent line.** After Submit the runner shows a one-line summary with a copy button, which the owner pastes into the project chat. The project's coordinating session reads the linked tickets from there. _(Owner.)_
6. **Sessions check Linear.** Before a session builds on a rung or calls it proven, it reads the ticket's state and its smoke test comments. _(Owner.)_

## Non-goals

- **Running the commands.** The runner shows each command with a copy button; the owner runs it in a terminal of their own. A later version could start them, since the runner runs on the Mac. _(Owner.)_
- **A scheduled sweep of Linear.** A routine that passes unclaimed results on to the project. Deferred until the owner finds the paste gets forgotten. _(Owner.)_
- **The runner messaging Claude.** That would need claude.ai credentials in a local tool.
- **A known-good marker.** Master stays the integration branch: reviewed and green in CI, not yet proven by hand, as it already is. A `stable` branch or tag that moves only when nothing waits in Smoke Test can come later. Each Pass comment already records its commit, so nothing here has to change for it. _(Owner.)_
- **Moving tickets from GitHub Actions.** It would need a Linear key in the repository's secrets.
- **Label hygiene.** What the `proof-tool` label means is the "Find why Linear tickets drift after cleanup" thread's call. The owner kept it for observers only, so this spec relies on the playbook's table alone.

## Design

### The Linear state

**Smoke Test**, of type Started, after In Review. The owner created it on 2026-11-24. _(Owner.)_

### Which tickets wait

The playbook's table is the source of truth. Its **Ticket / PR** column carries exactly one Linear ID per row, `GCS-<n>`, followed by the PR. Today's "N8" row (Several vehicles in SITL) becomes GCS-16. _(My call.)_

The rule follows the PR's own ticket, not its diff. A PR whose ticket has a row in the table, or that adds the row, names its ticket in its body with Linear's non-closing magic word, `Part of GCS-<n>`, never `Fixes` or `Closes`, and keeps the ID out of its title and branch name. That covers a code-only fix for a failed rung too: its ticket has a row, so it waits for a retest. A PR that only edits another rung's section, such as a wording fix or this spec's N8 row fix, names no ticket for that rung and leaves its state alone. A PR that changes what another rung's test checks (the "Proof views stay as they are" case in `CLAUDE.md`) names that rung's ticket with `Part of` too, so it gets retested. One exception, for a row's ticket only: a PR for it that changes neither code nor what any test checks names it with `Related to GCS-<n>` instead of `Part of`, which links without moving it. The flip of a draft row's branch to `master` after its merge (PRs #84 and #101) is such a PR, and must not send a passed rung back. A ticket with no row closes on merge as today, whatever the PR changes. _(My call.)_

Once the PR merges, the worker session that opened it moves each `Part of` ticket to Smoke Test, whoever merged it: the owner, a controller, or the `auto-merge` workflow. The worker is subscribed to its PR and hears the merge. A retest of a rung that already passed relies on this move: the runner below does not list a Done ticket whose latest result is a pass. Beyond that move, a worker never touches a row's ticket: it does not link its PR to the ticket by hand, does not write a `smoke-test-result` comment, and does not move the ticket to Done. Only the runner does those, so every result and every Done for a row's ticket comes from the owner's run. `CLAUDE.md`'s smoke tests rule says this, and it names the playbook's table, not the `proof-tool` label, as what decides which tickets have a smoke test. _(My call.)_

The runner trusts neither that move nor Linear's own automation. In a checkout on `origin/master`'s tip it lists every test in the table whose ticket is not Canceled and is either not Done, or Done while its latest `smoke-test-result` comment is not a pass on merged code or a counted draft pass. Such a Done ticket is shown as "closed without a test". So a missed move cannot hide a test, and neither can a ticket that closed early or one whose only pass came from a draft. In any other checkout, a draft's worktree, it lists only the rows that name a branch other than `master`, so a draft's build never records a result for a merged rung. _(My call.)_

### The playbook format

The runner reads each table row's link to its section. In a section it uses:

- **Goal:** the paragraph that opens with `**Goal:**`.
- **Scenarios:** each paragraph that opens with `**Scenario` starts one, named by the bold text up to its first colon or `. Expect` (`**Scenario 2, unplug:**`, `**Scenario 1, both fresh. Expect:**`). It runs until the next scenario or the end of the section, so its commands and any number of **Expect** lines can sit in paragraphs of their own, as Station in the dev stack's Scenario 2 already does.
- **Start:** whatever comes before the first scenario, from the first **Expect** on, is a scenario named "Start". A section with no scenario paragraphs at all, such as Several vehicles in SITL, is one scenario, "Start", holding all its Expects.
- Everything else in the section is shown in order, as Markdown, with a copy button on every code block.

A test run by `pnpm test` parses the real playbook. It fails on a row with no GCS ID or more than one, on a row whose section is missing, and on a section with no **Expect**. A section with no scenarios is allowed, as above. So an entry the runner cannot read fails CI instead of the owner's evening. _(My call.)_

### The runner

`pnpm smoke` runs `scripts/smoke-runner.mjs`, beside `dev-stack.mjs`, with its modules in `scripts/smoke-runner/` and its tests in `scripts/smoke-*.test.mjs`, which `pnpm test:scripts` already picks up. It is root tooling like the dev stack, not a `tools/` entry, since it reaches Linear rather than anything gcscode is tested against. It is a Node server on `127.0.0.1:5180` and one page, opened in the default browser, and it imports nothing from `packages/`. _(My call.)_

- **Runs in the checkout being tested.** The owner starts `pnpm smoke` in the checkout the test runs against: the main checkout for tests on master, or a draft's worktree under `.worktrees/` for a draft, which is the only place a row its own PR adds exists before the merge. The playbook's "Before you start" says so, next to its worktree setup. _(My call.)_
- **Reads:** `docs/smoke-tests.md` from that checkout, its `HEAD` commit and whether it has uncommitted changes (`git status --porcelain`), and each listed ticket's title, state and `smoke-test-result` comments from Linear. A detached `HEAD`, as the playbook's worktree setup leaves, is fine: the commit is what the record needs. After `git fetch origin master`, a `HEAD` equal to `origin/master`'s tip is merged code. Any other `HEAD` is a draft, labelled with the branch its row names, and an older commit of master says how many commits behind it is, so an old worktree reused after the merge cannot pass a rung without review's changes.
- **Shows:** the listed tests in the table's order, each with its ticket, state, branch, goal, steps and scenarios, and any earlier result. Each scenario has **Pass**, **Fail** and **Not run**, and **Fail** asks for a line. Each test has a **Note a finding** box that takes any number of findings, one line each.
- **Linear key:** a personal API key, from `LINEAR_API_KEY` in the environment, or else from `linear-api-key` in the key folder the reviewer scripts use (`$HOME/.config/gcscode`, which every checkout and worktree shares). The key stays in the server and never reaches the page. Without it, the runner starts, shows the playbook, and says how to create the key (Linear, Settings, Security & access, Personal API keys). _(My call.)_
- **Only its own page:** the server answers only requests whose `Host` is `127.0.0.1:5180` or `localhost:5180` and, when there is an `Origin`, whose `Origin` is the same, and it accepts only `application/json` bodies. So another page open in the browser cannot post a result with the owner's key. _(My call.)_

### Submit

Every scenario the owner did not mark counts as Not run. Submit writes, for each test with at least one scenario marked Pass or Fail:

| The test's scenarios                     | Comment on the ticket | The ticket moves to |
| ---------------------------------------- | --------------------- | ------------------- |
| Every scenario Pass, Start included      | Passed                | Done                |
| Any Fail                                 | Failed, with notes    | In Progress         |
| Some Pass, no Fail, at least one Not run | Partly run            | stays where it is   |

A pass on merged code moves the ticket to Done from any open state, and from Done without a pass. _(My call.)_ A pass on a draft adds the Passed comment and leaves the state as it is: the PR can still change in review. Once its row is in master's table and its ticket is listed, the runner shows that earlier pass with its commit and offers **Count the draft pass**, which writes a Passed comment citing it and moves the ticket to Done. Beside the button it lists the PR's own commits after the pass, from the PR's merge commit on `origin/master`, found by the row's PR number (`Merge pull request #<n>`): `git log --no-merges <pass>..<merge>^2 ^<merge>^1`. That holds when the branch is reused for later PRs or has master merged into it, and when the branch is gone. With no such merge commit it says it cannot tell. So the owner can see whether review changed anything. The owner chooses each time whether to count it or run the test again. _(Owner.)_

Each finding becomes a Backlog ticket in GCS, in the rung's project, titled with the owner's line, related to the rung's ticket, and its description names the test, the commit and the branch. A test with nothing marked writes nothing.

The comment has one fixed shape, so a session can find it:

```md
<!-- smoke-test-result v1 -->

**Smoke test passed** on 2026-11-24 at `abc1234` (master)

- Start: pass
- Scenario 1, sticks and switches: pass
- Scenario 2, unplug: pass
- Scenario 3, terminal in the background: pass
```

The comment lists every scenario of the test, each as pass, fail or not run. The heading reads **Smoke test passed**, **Smoke test failed** or **Smoke test partly run**, and a draft's adds "(draft)" after the branch. A failed scenario carries the owner's note after its result. A checkout with uncommitted changes adds "with uncommitted changes" after the branch. The date is the Mac's local date. A counted draft pass adds a line, "Counted from the pass on `<commit>` (`<branch>`)". _(My call.)_

The backfill below wrote a variant of v1 that sessions will meet: its heading reads "passed by" or "failed on" a date with "(master, commit not recorded)", it says it was backfilled from the owner's chat reports, and it has no scenario lines, or one for a failure. A session treats it as the same result. These backfill comments are the one time a session, not the runner, wrote a result.

Writes run one at a time, in a fixed order per test (findings, comment, state). If one fails, the page shows which writes landed and which did not, and Submit again sends only the ones that did not. _(My call.)_

### The summary line

After Submit the page shows one line and a **Copy** button:

> Smoke run 2026-11-24 at `abc1234` (master): passed Wire probe (GCS-17), Station in the dev stack (GCS-29); failed Controls view (GCS-40); partly run Radio probe (GCS-13); findings GCS-110, GCS-111.

A test on a draft branch carries its branch after its name. The owner pastes the line into the project chat. The project's coordinating session reads the named tickets, wakes a failed rung's thread with the owner's note, and sorts the findings into threads. _(Owner.)_

### Sessions read Linear

`CLAUDE.md`'s smoke tests rule gains a line: before building on a rung or calling it proven, read its ticket's state and its latest `smoke-test-result` comment. A ticket in Smoke Test is merged but unproven. _(Owner.)_

### Backfill (done)

Done on 2026-11-24 from the owner's chat reports. GCS-13, GCS-14, GCS-16, GCS-17, GCS-24, GCS-29 and GCS-38 have a passed comment in the variant shape above and stay Done. GCS-40 (Controls view) has a failed comment and is in Smoke Test, since its fix has not been tested yet. GCS-104 (Palettes) closed on merge with no result, so it is in Smoke Test with no comment. GCS-15 (video health) gets its row from the ticket drift thread's PR, which moves it to Smoke Test. _(Owner.)_

## VS Code alignment

Nothing here touches the extension API or the host↔extension boundary: the runner is root tooling and the rest is process. No rows for `docs/vs-code-alignment.md`.

## Proposed tickets

1. **Smoke test runner** (feat). The playbook parser and its test over the real playbook, the runner's server and page, Submit's Linear writes, the summary line, the "N8" row fix, the `CLAUDE.md` rules (the playbook's table, `Part of` and `Related to`, who moves the ticket, workers never link, comment on or close a row's ticket themselves, sessions read Linear), a "Recording results" section in the playbook and a line in its "Before you start" on running `pnpm smoke` in the checkout being tested, and the propagation edits below. The runner gets its own row in the table: its smoke test is that section, run with the Controls view retest. So the ticket waits in Smoke Test like any rung. _Depends:_ nothing; the state exists. _Done when:_ merged with its row, and then the owner passes its own test: the Controls view retest recorded in the runner, the ticket and its comment in Linear as the Submit table says, and the copied line as above.

## `docs/out-of-scope.md` propagation

Under **Tooling / process**, add:

- **A known-good marker for master.** No `stable` branch or tag: master is the integration branch, reviewed and green in CI but not yet smoke tested by hand. _Trigger to revisit:_ someone flies gcscode for real. (`docs/specs/2026-11-24-smoke-test-runner.md`)

Under **Agentic team architecture deferrals**, replace the **Linear integration** entry ("The agentic-team workflow uses GitHub state only") with:

- **Linear beyond smoke test results.** Linear holds the tickets, and smoke test results since `docs/specs/2026-11-24-smoke-test-runner.md`: sessions read a rung's ticket before building on it, and `pnpm smoke` writes to it. The review loop, merge gates and reviewers still use GitHub state only. _Trigger to revisit:_ a review or merge step needs to read or move a ticket.

## `docs/roadmap.md` propagation

The **Linear integration** item under "Considering (not yet committed)" becomes: "**Linear integration** — smoke test results landed in Linear (`docs/specs/2026-11-24-smoke-test-runner.md`); the review loop and merge gates still use GitHub only. Trigger: a review or merge step needs a ticket." The runner itself is process tooling, not a rung, and gets no roadmap row.

## Known unknowns

- **Whether Linear honours `Part of` and `Related to` alone.** Linear links a PR by its title, its branch name and its body. The spec keeps the ID out of the first two and forbids a worker's own links and moves (GCS-104 was moved to Done by hand), so only the non-closing link exists. The first PR that uses `Part of` checks that its ticket stays open on merge; the runner's "closed without a test" listing catches it if not.
- **Whether Linear moves a `Part of` ticket at all.** It may still move it to In Review when the PR opens. That is harmless: the runner lists the ticket either way.
- **Linear API rate limits.** A run writes a handful of mutations; Linear's personal-key limit is far above that. Not checked against the live API yet.
- **Parsing drift.** If a section ever needs a shape these rules lack, the parser test fails first and the "Adding a test" template is extended in the same PR.
