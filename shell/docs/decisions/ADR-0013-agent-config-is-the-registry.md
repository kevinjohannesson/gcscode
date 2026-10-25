# ADR-0013: `agent-config.json` is the reviewer registry

**Date:** 2026-10-25
**Status:** Accepted
**Supersedes:** [ADR-0009 (Agentic-actor registry)](ADR-0009-agentic-actor-registry.md)

## Context

ADR-0009 made a table in `shell/CLAUDE.md` the source of truth for the agents that post on PRs, and treated every other description of a role as a denormalized view of it. By October 2026 each role's facts lived in up to five places: the registry table, the verdict table under it, the slug lists in `.claude/scripts/gh-app-token-reviewer`, the App IDs in `.claude/agent-config.json`, and — for red-team and the extension architect — the agent file, which since [review-loop-v2](../specs/2026-10-22-review-loop-v2.md) holds the instructions, the pinned model, the header and the token slug. Keeping five copies in step was manual, and the copies in `CLAUDE.md` were loaded by every subagent whether or not it reviewed anything: the pipeline was about 65% of that file.

Review-loop-v2 also removed the respondent, the only actor that was not a reviewer, and the `Secondary model` column. What ADR-0009 added beyond ADR-0008 — the `actor-class` column and the test for when a new class is warranted — now describes one class.

## Decision

1. **`.claude/agent-config.json` is the registry.** It has one entry per role under `roles.<slug>`: `identity` (the bot login), `appId` and `installationId`, `prs` (the PR classes it reviews), `trigger`, `routing` and `verdicts`. A role that has an agent file names it in `agentFile`; that file holds the role's instructions, its pinned model ID and its header, written nowhere else, and posts under the token slug that is the role's key here. A role that runs a superpowers prompt names it in `instructions` and carries `model` (a family alias) and its `header` and `reReviewHeader`, because the controller's dispatch prompt has to supply them.
2. **Nothing restates it.** `shell/CLAUDE.md` and the `review-loop` skill point at the file instead of carrying a table. `gh-app-token-reviewer` accepts exactly the slugs the file lists.
3. **Accepted copies: the bot logins.** The merge gates in `.github/workflows/auto-merge.yml` match `gcscode-final-review[bot]`, `gcscode-red-team[bot]` and `gcscode-extension-architect[bot]` literally, and each agent file names its own login to find its previous review. Reading them from the config would need a checkout step in the workflow and buys nothing: on `pull_request` events the workflow runs from the PR head, so a PR that could change the config could change the workflow too. A role whose login changes needs those edits as well.
4. **No actor classes.** Every entry is a reviewer. If an agent that is not a reviewer joins (a controller-voice bot like the old respondent), it gets an entry with a `class` field, and ADR-0009's test for a new class — more than one field that would not apply — still decides whether it needs one.
5. **How roles are dispatched, graded and stopped is process, not registry.** That lives in the `review-loop` skill (`.claude/skills/review-loop/SKILL.md`) and in the agent files.

## Consequences

**Positive**

- A role is changed in one place, or two when its instructions live in an agent file, and a release of a new model touches only the agent files that pin one.
- The registry is machine-readable: the token helper already validates against it, and a later check (for example "every `agentFile` exists") can too.
- `shell/CLAUDE.md` no longer carries the registry, so subagents that never review stop paying for it.

**Negative**

- JSON carries no prose. The explanation that used to sit beside the table is a `$comment` key, and per-role character descriptions are gone; the agent files and the superpowers prompts are where a role's character lives.
- A reader looking for "which reviewers exist" must open a JSON file instead of reading a table in `CLAUDE.md`.
- Bot logins are copied into the workflow and the agent files (Decision 3).

**Neutral**

- ADR-0009 stays in `docs/decisions/` as the historical record; its Status line now points here, following the supersession convention ADR-0009 itself set.
