# Smoke test runner — implementation plan

**Goal:** `pnpm smoke` walks the owner through the playbook's waiting tests and records each result on its Linear ticket, as [the spec](../specs/2026-11-24-smoke-test-runner.md) describes.

**Ticket:** GCS-114, linked from the PR with `Part of`, since the runner gets its own playbook row.

**Tech stack:** Node 20+ standard library only (`node:http`, `node:https`, `node:child_process`, `fetch`), `node --test`. The page is one HTML file with inline CSS and script, no framework and no build. Nothing under `packages/` is imported.

## Global constraints

- Root tooling beside `scripts/dev-stack.mjs`: the entry is `scripts/smoke-runner.mjs`, its modules `scripts/smoke-runner/*.mjs`, its tests `scripts/smoke-*.test.mjs`.
- Every module that talks to git, `gh` or Linear takes its runner (`exec`, `fetch`) as an argument, so the tests run offline.
- Every new test is seen failing before it passes; the PR body lists the mutations and any that survived.
- Expected values in tests are literals taken from the spec, not recomputed through the code under test.

## Modules

1. `playbook.mjs` — parses `docs/smoke-tests.md`: the table's rows (name, anchor, one GCS ID, the PR it names, needs) and each row's section (goal, blocks in order, scenarios with their block ranges, Start included). Returns the problems the spec's CI test fails on: no GCS ID or more than one, a missing section, a section with no **Expect**, and a section command containing `.worktrees/`.
2. `result.mjs` — the `smoke-test-result v1` comment: its outcome from the marks, rendering it, parsing it back (the backfill variant included), and the summary line.
3. `git.mjs` — the checkout: `HEAD`, uncommitted changes, `origin/master` after a fetch, the merge commits on its first-parent history (`Merge pull request #<n> `), how far behind a commit is, the worktree's PR from its `pr-<n>` name checked against the fetched `pull/<n>/head`, and the commits after a draft pass for each PR.
4. `github.mjs` — a row's PRs through `gh`: the one its row names and every PR whose `Ticket:` line says `Part of GCS-<n>`, without those closed unmerged. Reuses `scripts/check-pr-ticket.mjs`'s ticket-line reading.
5. `linear.mjs` — the GraphQL calls: read an issue with its team's states and comments, create a comment, move a ticket, create a finding and relate it, and upload a file.
6. `listing.mjs` — which rows the checkout lists and what each may record: on `origin/master`'s tip, every row whose ticket is not Canceled and is not Done with a good latest result; elsewhere, the rows whose PRs include the worktree's PR and have not all merged. Also the **Count the draft pass** offer.
7. `submit.mjs` — plans each test's writes in the fixed order (findings, recording, comment, state), runs them one at a time, stops a test at its first failure, and on a second Submit runs only what has not landed.
8. `server.mjs` — the HTTP server on `127.0.0.1:5180`: the Host and Origin checks, JSON bodies only except the raw recording upload, and the routes the page calls.
9. `page.html` — the page.
10. `scripts/smoke-runner.mjs` — reads the key, starts the server, opens the browser.

## Docs and rules

- `docs/smoke-tests.md`: the table loses its Branch column and gains the runner's row; N8 becomes GCS-16; the opening line, "Before you start" with both worktree recipes and `pnpm smoke`, a "Recording results" section, the runner's own section, and the template without its draft lines.
- `CLAUDE.md` § Tests: the smoke test rules the spec lists.
- `scripts/check-pr-ticket.mjs`: rejects `Related to` for a row's ticket, with its header and error text; the review-loop skill's Ticket paragraph to match.
- `docs/out-of-scope.md` and `docs/roadmap.md`: the spec's propagation sections, word for word.

## Known unknowns from the spec, for the final review

- [ ] Whether Linear honours `Part of` alone: this PR is the first to use it for its own ticket; check GCS-114 stays open on merge.
- [ ] Whether Linear moves a `Part of` ticket to In Review: harmless, the listing does not depend on it.
- [ ] Linear's upload limit: the runner reports Linear's refusal of a file before writing the comment, and the comment is not written without it.
- [ ] Linear API rate limits: a run makes a handful of calls; not checked against the live API.
- [ ] Parsing drift: the parser test runs over the real playbook in `pnpm test`.
