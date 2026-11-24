---
description: Audit the Linear board against GitHub and the smoke-test playbook — find tickets whose state, links or labels have drifted, fix the clear-cut ones, and ask the owner about the rest.
---

# /linear-audit

A pass over the GCS team in Linear that checks each ticket against what GitHub and [`docs/smoke-tests.md`](../../docs/smoke-tests.md) say. It exists because a tidy-up done from memory missed drift that a fixed list would have caught: a ticket closed on merge whose thread still said it was waiting on a smoke test, and labels checked against their definitions but not against the playbook.

## When to use

- As a step of [`/housekeeping`](housekeeping.md), every 2–3 iterations.
- After a burst of merges, or when the owner says the board looks wrong.

Not during feature work: a worker keeps its own ticket right as it goes (the `review-loop` skill's PR templates and `CLAUDE.md`).

## What to read

- **Linear**, team GCS: every ticket that is not Backlog, plus every ticket completed or canceled since the last audit. Find its date by searching GCS comments for `linear-audit`; with none, go back two weeks. For each: state, labels, attachments (PR links), relations and comments.
- **GitHub**: PRs merged since the last audit and every open PR, with title, branch, labels, body and draft state.
- **The playbook**: the table at the top of `docs/smoke-tests.md` on master. Its **Ticket / PR** column names the tickets that have a smoke test.

## The checks

Each check names what is wrong and what fixes it. **Fix** means fix it and list it in the report. **Ask** means put it to the owner.

1. **Every merged PR has its ticket.** A merged feature PR links a ticket, by its `Ticket:` line or a PR attachment on the ticket. Missing link: **fix** by attaching the PR to the ticket its body or commits name, unless that ticket has a playbook row (a row's ticket is linked only by its PR's `Part of` or `Related to` line, so **ask**); if none is named, **ask**. Markdown-only PRs need no ticket.
2. **Done means done.** A ticket in Done whose row is in the playbook has, as its latest `smoke-test-result` comment, a pass on merged code or a counted draft pass (the smoke test runner's record; its spec is `docs/specs/2026-11-24-smoke-test-runner.md`, from PR #103). Without one: **fix** by moving it to Smoke Test with a comment saying why. Never the other way: only the owner's smoke test moves a row's ticket to Done, and only the runner writes `smoke-test-result` comments.
3. **No comment contradicts the state.** Read the latest comments of every Done ticket. A comment that says it is waiting on something (a smoke test, a follow-up PR, the owner) means the state is wrong or the comment is stale: **fix** the state when the comment is right; **ask** when you can't tell. Check every ticket this way, not only the ones you were asked about.
4. **Open PRs match their tickets.** A ticket with an open PR is In Progress (draft PR) or In Review (ready PR), or, when it has a playbook row, Smoke Test or In Progress while a retest or fix PR is open. A ticket In Progress or In Review with no open PR and nothing in its comments to explain it: **ask**.
5. **The playbook and Linear agree.** Every playbook row names exactly one ticket that exists and is not Canceled. A row that names none: **ask**, unless an open PR already fixes it. A Done rung with a "How you'll see it" that a person checks by hand but no playbook row: **ask** whether it needs one.
6. **Labels match their definitions.** Read each label's description in Linear and compare. `proof-tool` is a permanent diagnostic tool or view that makes one thing visible; it does not mean "has a smoke test", which the playbook decides. A clear mismatch: **fix**; a judgment call: **ask**.
7. **Blockers are still real.** For each active ticket, each `blocked by` ticket is still open and still blocks it. A finished blocker: **fix** by removing the relation, with a comment.
8. **Deferred findings sit on the ticket meant to fix them.** A merge comment or PR that defers findings to a later ticket: that ticket has them in a comment. Missing: **fix** by copying them there.

## Report

One message to the owner, in this order:

- **Fixed:** each ticket, one line: what was wrong and what changed.
- **For you:** each **ask**, as a question with your recommendation.
- **Process gaps:** any drift that a rule, template or check would have prevented. Say which and propose it, so the cause gets fixed and not just the ticket.

Then leave a comment on each ticket you changed, starting `linear-audit YYYY-MM-DD:`, so the next audit knows where this one stopped.
