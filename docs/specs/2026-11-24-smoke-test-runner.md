# Smoke test runner: record each result in Linear

**Date:** 2026-11-24
**Status:** Draft

A smoke test's result becomes a Linear record that every session can read. The owner records it in `pnpm smoke`, a local page that walks through [`docs/smoke-tests.md`](../smoke-tests.md) one test at a time and writes each result to that test's ticket. A ticket whose rung has a smoke test reaches Done only once the owner has passed it.

## Context

The owner runs [`docs/smoke-tests.md`](../smoke-tests.md) on the Mac against the real stack and reports back in the project chat. Those reports mix several tests with new findings in one message, and nothing records a pass. On 2026-11-24 the wire probe's thread (GCS-17) did not know its test had passed. What did travel was failures, since someone acts on those.

A merge closes a rung's ticket today, through Linear's GitHub link, before anyone has run its smoke test. So Done means "merged", and Linear cannot tell a proven rung from an untested one. Linear's "close on merge" rule is set per team, so it cannot be turned off only for tickets that have smoke tests: GCS also holds tickets with no smoke test (CI, the merge policy, the theme work), and those should keep closing on merge.

Decisions the owner made in the project thread on 2026-11-24 are marked _(Owner.)_ The rest are marked _(My call.)_ and are listed for the owner in the PR.

## Goals

1. **Linear is the record.** A new GCS state, **Smoke test**, sits between In Review and Done. Like a QA step, it means merged and waiting for the owner's hands-on check. A Pass moves the ticket to Done and leaves a comment saying when the test ran and against which commit. The repo holds the playbook only, never results. _(Owner.)_
2. **Only rungs with a smoke test wait.** A PR that adds a smoke test links its ticket without closing it, and its ticket moves to Smoke test when it merges. Every other PR closes its ticket on merge as today. The playbook's table says which tickets have a smoke test. _(Owner.)_
3. **The owner records results in `pnpm smoke`,** a local page in the repo, not on claude.ai. It reads the playbook from the checkout being tested and writes to Linear itself. A new playbook entry shows up without any change to the runner. _(Owner.)_
4. **A failure goes back to its rung; a finding gets its own ticket.** If something the owner saw makes a line under a test's **Expect** false, that test fails and its ticket returns to In Progress with the owner's note. Anything else the owner noticed becomes a new Backlog ticket related to the rung's. _(Owner.)_
5. **The owner tells the project, in one consistent line.** After Submit the runner shows a one-line summary with a copy button, which the owner pastes into the project chat. The coordinator reads the linked tickets from there. _(Owner.)_
6. **Sessions check Linear.** Before a session builds on a rung or calls it proven, it reads the ticket's state and its smoke test comments. _(Owner.)_

## Non-goals

- **Running the commands.** The runner shows each command with a copy button; the owner runs it in a terminal of their own. A later version could start them, since the runner runs on the Mac. _(Owner.)_
- **A scheduled sweep of Linear.** A routine that passes unclaimed results on to the project. Deferred until the owner finds the paste gets forgotten. _(Owner.)_
- **The runner messaging Claude.** That would need claude.ai credentials in a local tool.
- **A known-good marker.** Master stays the integration branch: reviewed and green in CI, not yet proven by hand, as it already is. A `stable` branch or tag that moves only when nothing waits in Smoke test can come later. Each Pass comment already records its commit, so nothing here has to change for it. _(Owner.)_
- **Moving tickets from GitHub Actions.** It would need a Linear key in the repository's secrets.
- **Label hygiene.** Why tickets and their `proof-tool` labels drift is the "Find why Linear tickets drift after cleanup" thread's work. This spec only relies on the playbook's table.

## Design

### The Linear state

**Smoke test**, of type Started, placed after In Review. The owner creates it in Linear (Settings, Teams, GCS, Workflow), since the Linear connector cannot create states. _(My call.)_

### Which tickets wait

The playbook's table is the source of truth. Its **Ticket / PR** column carries exactly one Linear ID per row, `GCS-<n>`, followed by the PR. Today's "N8" row (Several vehicles in SITL) becomes GCS-16. _(My call.)_

A PR that adds or changes a smoke test links its ticket in its body with Linear's non-closing magic word, `Part of GCS-<n>`, never `Fixes` or `Closes`, and keeps the ID out of its title and branch name. Once it merges, the session that merged it moves the ticket to Smoke test; when the owner merged by hand, the coordinator does. `CLAUDE.md`'s smoke tests rule says this, and it names the playbook's table, not the `proof-tool` label, as what decides which tickets have a smoke test. What that label means is the ticket drift thread's call. _(My call.)_

The runner does not trust that move to happen. It lists every test in the checkout's table whose ticket is not Done or Canceled, whatever its other state, so a missed move cannot hide a test. A test on a draft branch is listed with its branch, as the table already gives it. _(My call.)_

### The playbook format

The runner reads each table row's link to its section. In a section it uses:

- **Goal:** the paragraph that opens with `**Goal:**`.
- **Scenarios:** each paragraph that opens with `**Scenario` starts one, named by the bold text up to its first colon or `. Expect` (`**Scenario 2, unplug:**`, `**Scenario 1, both fresh. Expect:**`). It runs until the next scenario or the end of the section, so its commands and its **Expect** can sit in paragraphs of their own.
- **Start:** an **Expect** that comes before the first scenario checks the start itself, and is a scenario named "Start".
- Everything else in the section is shown in order, as Markdown, with a copy button on every code block.

The "Adding a test" template already has this shape, and every current section follows it. A test in `pnpm test` parses the real playbook and fails on a row with no GCS ID or a missing section, so an entry the runner cannot read fails CI instead of the owner's evening. _(My call.)_

### The runner

`pnpm smoke` starts `tools/smoke-runner`: a Node server on `127.0.0.1:5180` and one page, opened in the default browser. Like the other tools, it is not an extension and imports nothing from `packages/`. _(My call.)_

- **Reads:** `docs/smoke-tests.md` from the checkout it runs in, the current commit, branch and whether the working tree has uncommitted changes (from `git`), and each listed ticket's title and state (from Linear).
- **Shows:** the waiting tests in the table's order, each with its ticket, state, goal, steps and scenarios. Each scenario has **Pass**, **Fail** and **Not run**, and **Fail** asks for a line. Each test has a **Note a finding** box that takes any number of findings, one line each.
- **Linear key:** a personal API key in `LINEAR_API_KEY`, read from `.env.local` at the repo root (already ignored by `*.local`). The key stays in the server and never reaches the page. Without it, the runner starts, shows the playbook, and says how to create the key (Linear, Settings, Security & access, Personal API keys). _(My call.)_

### Submit

Submit writes, for each test with at least one scenario marked:

| The test's scenarios        | Comment on the ticket | The ticket moves to |
| --------------------------- | --------------------- | ------------------- |
| All Pass                    | Passed                | Done                |
| Any Fail                    | Failed, with notes    | In Progress         |
| Some Pass, the rest Not run | Partly run            | stays where it is   |

Each finding becomes a Backlog ticket in GCS, in the rung's project, titled with the owner's line, related to the rung's ticket, and its description names the test, the commit and the branch. A test with nothing marked writes nothing.

The comment has one fixed shape, so a session can find it:

```md
<!-- smoke-test-result v1 -->

**Smoke test passed** on 2026-11-24 at `abc1234` (master)

- Scenario 1, sticks and switches: pass
- Scenario 2, unplug: pass
- Scenario 3, terminal in the background: not run
```

A failed scenario carries the owner's note after its result. A working tree with uncommitted changes adds "with uncommitted changes" after the branch. The date is the Mac's local date. _(My call.)_

Writes run one at a time, in a fixed order per test (findings, comment, state). If one fails, the page shows which writes landed and which did not, and Submit again sends only the ones that did not. _(My call.)_

### The summary line

After Submit the page shows one line and a **Copy** button:

> Smoke run 2026-11-24 at `abc1234` (master): passed Wire probe (GCS-17), Station in the dev stack (GCS-29); failed Controls view (GCS-40); findings GCS-110, GCS-111.

The owner pastes it into the project chat. The coordinator reads the named tickets, wakes a failed rung's thread with the owner's note, and sorts the findings into threads. _(Owner.)_

### Sessions read Linear

`CLAUDE.md`'s smoke tests rule gains a line: before building on a rung or calling it proven, read its ticket's state and its latest `smoke-test-result` comment. A ticket in Smoke test is merged but unproven. _(Owner.)_

### Backfill

Once the state exists, this thread backfills from the owner's report of 2026-11-24: every test in today's table except Controls view gets a passed comment marked as backfilled from that report and stays Done, and Controls view (GCS-40) moves to Smoke test, since its fix has not been tested yet. GCS-15 (video health) has the `proof-tool` label but no playbook entry, so it is left to the ticket drift thread. _(Owner.)_

## VS Code alignment

Nothing here touches the extension API or the host↔extension boundary: the runner is a tool and the rest is process. No rows for `docs/vs-code-alignment.md`.

## Proposed tickets

1. **Smoke test runner** (feat, not a proof tool). The playbook parser and its test over the real playbook, the runner's server and page, Submit's Linear writes, the summary line, the "N8" row fix, the `CLAUDE.md` rules (Part of, sessions read Linear), and a "Recording results" section in the playbook. _Depends:_ the owner has created the Smoke test state. _Done when:_ the owner records the Controls view retest in the runner, the ticket and its comment land in Linear as the Submit table says, and the copied line reads as above.

## `docs/out-of-scope.md` propagation

Under **Tooling / process**:

- **A known-good marker for master.** No `stable` branch or tag: master is the integration branch, reviewed and green in CI but not yet smoke tested by hand. _Trigger to revisit:_ someone flies gcscode for real. (`docs/specs/2026-11-24-smoke-test-runner.md`)

## `docs/roadmap.md` propagation

None. The runner is process tooling, not a rung.

## Known unknowns

- **Whether Linear honours `Part of` when the GitHub link was made another way.** Linear links a PR by its title, its branch name and its body. The spec keeps the ID out of the first two so only the non-closing link exists. The first PR that uses it checks that the merge leaves its ticket open.
- **Whether Linear moves a `Part of` ticket at all.** It may still move it to In Review when the PR opens. That is harmless: the runner lists the ticket either way.
- **Linear API rate limits.** A run writes a handful of mutations; Linear's personal-key limit is far above that. Not checked against the live API yet.
- **Parsing drift.** If a section ever needs a shape the template lacks (two Expect blocks per scenario, say), the parser test fails first and the template is extended in the same PR.
