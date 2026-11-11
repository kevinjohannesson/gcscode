# Controller

**Date:** 2026-11-11
**Status:** Draft

A controller is the one session the owner talks to for an initiative. It brainstorms with the owner, writes the spec, hands the building to worker sessions that run superpowers, and brings the owner only the decisions that set a precedent.

## Context

Since the repo reorganization (PR #42) the owner has run work through one session that starts and tracks the others: that session started ten sessions, eight of which opened PRs (#44, #46, #49–#54). The owner likes it. They see every session in the sidebar and can drop into one, but talking to that one session is usually enough, and it is far less to keep in their head than running the sessions themselves. Nothing describes the role, and in `CLAUDE.md` and the `review-loop` skill "controller" means something else: the session that runs a single PR.

The owner is moving towards a dark factory. Reading agent PRs and reviews did not keep them in the loop. They want bigger steps, and to spend their attention on guidelines, the bigger picture, brainstorming, and architecture and tooling, at the level of patterns rather than functions.

The starting point is a controller skill the owner wrote on claude.ai for use outside gcscode and attached in the brainstorm. It is not in this repo. This spec keeps its contract, work cycle, brief template, report format and ledger, and adapts them to the Claude desktop app and to gcscode. The original was written for the terminal (`claude --bg`, `claude agents`) and kept workers from talking to the owner. In the app, workers are sessions the owner can open.

Problems the owner has had with the informal controller:

1. Sessions keep their sidebar dot after the controller has dealt with them.
2. A question with answer buttons that the owner was still thinking about was replaced when a worker reported in. It came back reworded, or not at all.
3. The controller's checkout stays on the branch it started on, so the files it discusses are not in the folder the owner's file browser shows.

One thing worked well: a controller asking once whether it could archive the finished sessions and remove their worktrees, which cleared eight dots at once.

Decisions marked _(Owner.)_ were made by the owner in the brainstorm. _(My call.)_ marks the writing session's choices, which the owner saw before this spec was written unless the [open questions](#known-unknowns) say otherwise.

## Goals

1. **One controller per initiative,** in a fresh desktop-app session, so no session grows too large. _(Owner.)_ The owner starts it with the `controller` skill. _(My call.)_
2. **The owner decides what sets a precedent; the controller decides the rest** and records what it decided. _(Owner.)_
3. **The superpowers loop is never weakened.** Every superpowers skill the controller and its workers use is invoked by name. _(Owner.)_
4. **A question to the owner is never lost,** and the owner reads about a change to a question only when there was one. _(Owner.)_
5. **Decisions outlive the session.** A controller started the next day reaches the same conclusion. _(Owner.)_
6. **"Done" is visible:** merged into master, the commands that start it, what was run to check it works, and what it cost. _(Owner, except cost and the check: my call.)_

**The owner would stop using it** if it weakens the superpowers loop (output gets noticeably worse when the skills do not trigger), if it costs an unreasonable number of tokens, or if Anthropic ships something better. So the controller stays a thin layer over what the app already does. _(Owner.)_

## Non-goals

- **Moving reviews off GitHub.** The owner has decided on the direction; it is its own project after this one. _(Owner.)_ Workers run the review loops, so that change will not reach the controller.
- **CI and acceptance checks against SITL.** A separate project. _(Owner.)_
- **A PR shepherd on a timer** (keep PRs up to date, retry flaky tests, merge when green). It matters once CI exists. _(Owner.)_
- **Agent teams.** Teammates share one checkout, cannot be resumed after a restart and cannot start teams of their own, and the feature is experimental. The docs recommend starting with research and review. They are a candidate for reviews once those leave GitHub. _(My call.)_
- **Other roles.** The owner is designing roles such as designer and developer separately. This spec says only how their decisions are stored ([Memory](#memory-where-decisions-go)), which they will share.
- **Editing superpowers.** Its skills are used as published.
- **A standing controller across initiatives,** and use outside gcscode. _(Owner.)_

## Design

### Names

- **Owner:** the person.
- **Controller:** the session the owner talks to for one initiative.
- **Worker:** a session that runs one PR, or a sequence of PRs on one area, in its own worktree, whether a controller or the owner started it.
- **Subagent:** what a worker dispatches: implementers and reviewers.

Superpowers' `subagent-driven-development` calls the session that dispatches subagents "the controller". In gcscode that session is a worker; superpowers' wording stays as it is. `CLAUDE.md`, the `review-loop` skill and the two agent files say "worker" (or "the session that dispatched you") where they mean the PR's session. _(My call.)_

### The skill

`.claude/skills/controller/SKILL.md`, a project skill. The owner invokes it at the start of a fresh session. It holds everything in this Design section that the controller must do. It is adapted from the owner's original, whose text goes to the builder with the implementation brief. The original keeps:

- **The contract.** The controller writes only the spec and its ledger. Everything else goes to a worker, including review findings, "however small". If the owner asks it to do something itself, it checks once and follows the answer.
- **The work cycle,** below.
- **The dispatch plan table,** `Wave | Worker | PRs | Owns (files/areas) | Depends on | Model`. The grouping rules come with it: one worker per set of files, shared foundations first, scaled to the work.
- **The brief template and report format** ([Briefs and reports](#briefs-and-reports)).
- **The ledger** ([Ledger](#ledger)).
- **The red flags,** minus the terminal-specific ones.

The terminal mode (`claude --bg`, `claude agents`, `claude logs`) and the agent-team and claude.ai-project modes are dropped. Workers start with the app's session tool, in their own worktree, with a fresh context. _(My call.)_

### The work cycle

1. **Start.** The controller reads the latest handoff note and, when resuming, its ledger, then reconciles both with `git worktree list`, the app's list of linked sessions and the open PRs. It finds the record through `CLAUDE.md`'s "Where to look". When it treats something as settled, it names where that is recorded, so the owner can tell the record from anyone's recollection. _(My call.)_
2. **Brainstorm.** `superpowers:brainstorming`, invoked by name. During the brainstorm the controller watches for first-of-its-kind decisions ([Precedent](#precedent)) and for how the work splits into PRs. _(My call.)_
3. **Spec.** The controller writes the spec on `spec/<topic>`, runs brainstorming's builder check and shows the owner the document. Once the owner approves it, the controller runs `pnpm lint:docs`, pushes, opens the draft PR and moves its own checkout off the branch. Then it hands the spec's review loop to a worker on that branch, so the reviewer back-and-forth stays out of its context. An ADR goes the same way on `adr/<slug>`. _(Owner.)_
4. **Merge the spec,** per [Merging](#merging).
5. **Dispatch.** The controller writes the dispatch plan into its ledger and starts the workers, at most three at a time. _(My call.)_ It shows the owner the plan first only when the plan holds a first-of-its-kind decision the brainstorm did not settle. Otherwise it dispatches straight away. _(My call, from the owner's "a high degree of ownership".)_ Each worker's worktree is cut from master, or from the branch it builds on. Workers run on the controller's model, or a cheaper one for mechanical work. Brainstorming's step after approval is `superpowers:writing-plans`. In gcscode each worker runs it for its own PR, and the controller writes no superpowers plan itself.
6. **Build.** Each worker runs `superpowers:writing-plans`, then `superpowers:subagent-driven-development`, then the `review-loop` skill, and opens its draft PR. Its questions go to the controller first. The owner may open any worker and talk to it directly. _(Owner.)_
7. **Check the report.** Every acceptance criterion needs evidence (command and result), and `git diff --stat <base>..<branch>` must stay within the files the worker owns, or explain why not. The controller reads reports and stats, never the diffs. The review loop is the independent review. Gaps go back to the same worker; after three rounds the controller starts a fresh worker or asks the owner.
8. **Merge** each PR, per [Merging](#merging). After a merge, the controller tells the workers that depend on it to merge master into their branch. That is a merge, not a rebase, because a PR branch that has reviews is never force-pushed (`CLAUDE.md`).
9. **Close.** The controller offers once to archive the initiative's finished sessions and remove their worktrees. _(Owner.)_ Its final report gives what merged, the commands that start it, what was run to check it works (for UI work, a screenshot), the [cost](#cost), the decisions it took for the owner, and follow-ups. It promotes decisions per [Memory](#memory-where-decisions-go), writes the handoff note and copies the workers' notes in (`CLAUDE.md` § Sessions).

**Delegated brainstorms are an experiment.** When a sub-topic needs its own design, the controller may give it to a worker that runs `superpowers:brainstorming` with the controller in the owner's place. The controller answers from what the owner agreed and passes first-of-its-kind decisions up. _(My call; the owner: "we'll have to see".)_

### Precedent

Agents copy the code around them and bring no preferences of their own, so whatever is built first becomes the template. _(Owner.)_ The test for whether a decision reaches the owner is **"is this the first of its kind?"** Such decisions include a new library or dependency, a new package or package boundary, a pattern every extension will follow, the first component of a new system, the first extension of a new type, and replacing an existing pattern. _(Owner.)_ A decision that follows a pattern the codebase already has is the controller's, and it records it in the ledger.

- **Spotted while planning,** in the brainstorm or the dispatch plan, not mid-build. A worker that meets one its brief did not foresee stops and asks. _(My call.)_
- **A replaced pattern leaves a tracked follow-up** for every remaining copy of the old one. Two precedents in the code mean agents copy whichever they find first. _(My call.)_

Besides precedent, three kinds of decision stay with the owner: spending money, a licence or terms-of-service question, and anything irreversible beyond the merge itself. _(My call, carried over from how the controller's merge permission was recorded on 2026-11-10.)_

### Questions to the owner

- Questions are numbered per initiative (Q1, Q2, …), and a number is never reused.
- Every controller turn that leaves questions open ends with them. The one holding up the most work goes in the app's question with buttons; the rest are listed in the message, each with a recommendation.
- **Unchanged:** repeated word for word, with no comment.
- **Changed by a report:** same number, new wording, and a few words on why, e.g. "Q2 (changed after the camera-sim report): …".
- **No longer needed:** one line, once ("Q3 dropped: the dev-stack session settled it"), then gone.
- The controller does not ask a question a running worker is about to answer.
- A worker report that needs nothing from the owner gets one line at most, and the open question with buttons comes back exactly as it was.

_(Owner.)_ These are the fix for problem 2 in [Context](#context).

### Memory: where decisions go

A decision lives where it binds, and the strongest place available wins:

1. **A check in code:** a lint rule or a test. Every session gets the same answer without reading anything. Example: a check that fails when vendored component code changes.
2. **The repo's docs:** an ADR for a decision with reasoning behind it, a path-scoped rule in `.claude/rules/` that loads when a session works on those files, or the spec.
3. **The controller's ledger:** calls not yet written into the repo, and the owner's preferences for this initiative.

At close, the controller has workers move ledger decisions that bind future work up to 1 or 2. Its consistent "personality" is its skill: the same instructions and the same written decisions lead to the same conclusions. The owner's auto-memory keeps holding their preferences across initiatives. _(Owner: consistency across sessions; my call: the ladder.)_

### Merging

The controller merges a PR (`gh pr merge --merge`, never squash) when all of these hold: it is out of draft and mergeable; the last review approves its current head (for spec and ADR PRs, the loop has stopped at `Blocking: 0`); and no decision is left open for the owner, whether one that [sets a precedent](#precedent) or one of the three kinds the owner keeps. Before this spec, that rule was a standing permission in the owner's memory. This spec moves it into the skill, and `CLAUDE.md`'s "The owner merges" changes to say the controller merges under its skill's rule. The `auto-merge` label and its workflow are unchanged. _(Owner: "I trust the agents to handle this".)_

Merging a spec or ADR approves a design. The controller merges one only when the owner approved the document before its PR and the review loop changed none of its decisions. Two cases go to the owner: a review that changes a decision, and a spec or ADR PR that changes files outside `docs/`, which the `auto-merge` workflow's Gate 2 already leaves to the owner. _(Owner.)_

### The controller's checkout

The controller's worktree shows what the conversation is about: the branch under discussion (the top of a stack), or master after a merge. The controller moves it with `git switch --detach <ref>`, after a fetch for master. A detached checkout never collides with the worker that has the branch checked out. The file links it gives then open the code it is talking about. It shows only committed work. The worktree holds no work of the controller's except the spec while it is being written, and the ledger lives outside its tracked files, so the tree is clean to switch. _(Owner asked; the detached checkout is my call.)_ This fixes problem 3.

### The sidebar

After handling a worker's report, the controller marks that session's sidebar dot read or completed with the app's tools. _(Owner.)_ This fixes problem 1. Archiving waits for the close ([work cycle](#the-work-cycle), step 9).

### Briefs and reports

The brief template is the original's, with these changes:

- The worker may talk to the owner.
- Under HOW TO WORK, the brief names the skills (`superpowers:writing-plans`, `superpowers:subagent-driven-development`, the `review-loop` skill) and the branch prefix (`feat/`, `spec/`, `adr/`). It restates `CLAUDE.md`'s three worktree rules, which that file requires of any dispatch that commits in a worktree.
- Under WHEN STUCK, it adds "a first-of-its-kind decision the brief does not settle, or a cost, licence or terms question".

The report format is the original's. When a worker ends a turn, the app forwards about the first 400 characters of its report to the controller, so STATUS, the PR and any QUESTION come first. The controller reads the worker's transcript only when that is not enough.

### Ledger

One ledger per initiative is the controller's memory across compaction, in the original's shape: parameters, the owner's decisions, the workers table, open questions (numbered as above), parked items and follow-ups, and a log. It lives beside the handoff notes in the main checkout's `.claude/handoffs/` (gitignored). The controller updates it after every event.

### Cost

The final report states the initiative's tokens per session (the controller, and each worker with its subagents), weighted the way they are billed, as in the 2026-11-10 token-cost analysis (cache reads at 0.1×, output at 5×). The method is the builder's (see [Known unknowns](#known-unknowns)).

### Changes to existing files

- **`CLAUDE.md`** (currently 10.9k characters, over the 10k target): § Sessions says one controller per initiative and points to the skill; "controller" becomes "worker" where it means a PR's session; § Branching and merging names the controller's merge rule. The net change in size must be zero or less.
- **`.claude/skills/review-loop/SKILL.md`:** "controller" becomes "worker" where it means the PR's session; Merging points to the controller's rule.
- **`.claude/agents/*.md`:** "Return to the controller" becomes "Return to the session that dispatched you".
- **Outside the repo:** the owner's memory that lets the controller merge points to the skill instead of holding the rule.

## Validation

The first real use is the next initiative, the UI baseline (shadcn, removing the spike and proof-of-concept extensions, a basic app shell). The controller's close for that initiative includes a short look back:

- the cost, set against the reorganization initiative where it can be measured;
- which questions reached the owner, and whether each was first of its kind;
- any question lost or reworded without notice, stale dot, checkout confusion, or worker that did not report;
- how delegated brainstorms went, if any ran.

The owner keeps, changes or drops the role from that. _(Owner: "it will take some time to truly answer this question".)_

## VS Code alignment

Not applicable: an agentic-process change with no effect on the extension API or host.

## `docs/out-of-scope.md` propagation

Under the agentic-team deferrals, add: **Agent teams.** Implementation runs in app sessions with their own worktrees. Agent teams share one checkout and cannot be resumed. Trigger to revisit: reviews move off GitHub, or agent teams gain per-teammate worktrees and resumption.

## `docs/roadmap.md` propagation

Under Agentic team architecture, add **Controller role**, linking this spec, as queued. It moves to shipped when the skill lands.

## Known unknowns

1. **Two `controller` skills.** The owner's claude.ai account syncs the original skill into every session as `anthropic-skills:controller`, with the same description as the new project skill, so either could fire. Resolved: the project skill keeps the name `controller`, and once it lands the owner removes the original from their claude.ai skills. The builder takes the original's text from the implementation brief, not from the synced copy. _(Owner.)_
2. **Merging specs and ADRs.** Merging one approves a design, and the owner's standing rule asked first. Resolved: see [Merging](#merging). _(Owner.)_
3. **Where the ledger can be written.** The desktop app refuses Write and Edit calls from a `.claude/worktrees/` session into the main checkout's `.claude/`. The owner's memory says Bash writes there went through. The builder verifies this and picks a location that works.
4. **Measuring cost.** The app's usage tool reports plan limits and context fill, not per-session token totals. The 2026-11-10 analysis measured from session transcripts. The builder picks the method: a small script over the transcripts, or the plan-limit percentage from start to close as a rough fallback.
5. **The forwarded report.** About 400 characters may be too few for the controller to act on without reading the worker's transcript, which costs context. The look back reports how often it had to.
6. **A detached controller checkout in the app.** The app shows each session's branch and PR. Whether a detached head confuses that display is unchecked.
