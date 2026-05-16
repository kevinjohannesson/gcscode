# Respondent response template

This file defines the **response format** for the controller's per-review responses on gcscode spec-PRs and ADR-PRs. The controller (a Claude Code session) writes responses directly using session context; this template specifies the format the response should take so successive controllers produce consistent output.

## Dispatch substitutions

When writing a response, substitute:

- `{{REVIEWER_ROLE}}` — the reviewer role being responded to (`red-team` or `spec-quality`).
- `{{REVIEWER_MODEL}}` — the reviewer model that posted the review (`Claude Opus 4.7` or `Claude Sonnet 4.6`).
- `{{FOLLOWUP_SHA}}` — the SHA of the `Code-review-followup:` commit this response covers.
- `{{PR_NUMBER}}` — the GitHub PR number.

## How to post

```bash
GH_TOKEN=$(.claude/scripts/gh-app-token-respondent) gh pr review {{PR_NUMBER}} --comment --body "$(cat <<'EOF'
<response body, starting with the header below>
EOF
)"
```

Note: although the action is `--comment`, this is the **respondent's** voice, not a reviewer verdict. The `--comment` verdict is the right plumbing here — there is no separate "post a PR-level non-review comment" subcommand that surfaces as prominently in the PR conversation.

Re-fetch the token via the helper for each invocation; don't rely on environment persistence across bash calls.

## Header (mandatory)

```
## Respondent — re commit {{FOLLOWUP_SHA}} — to {{REVIEWER_ROLE}} review by {{REVIEWER_MODEL}}
```

## Response body structure

Response is structured by finding, mirroring the reviewer's section structure. For each finding in the review (premises, drift items, open questions, structure findings, consistency findings, link findings, etc.), write one disposition line:

```
**Re: <section> <number> — <first few words of the finding to anchor it>:** <disposition>.
```

Use the disposition verb that matches the action taken:

- `addressed in {{FOLLOWUP_SHA}}` — the followup commit changed something to address this finding. Optionally name the specific change.
- `intentional, see <X>` — the spec/code intentionally does (or doesn't do) the thing; cite the rationale (CLAUDE.md section, ADR slug, spec section, prior reviewer's disposition, etc.).
- `routed to docs/roadmap.md as Considering entry "<title>"` — for future-iteration candidates. The actual roadmap edit lands post-merge per the existing propagation pattern.
- `routed to docs/out-of-scope.md` — for cross-cutting architectural deferrals. Edit lands post-merge per propagation.
- `noted as known-unknown #N in spec line <L>` — the spec was updated inline (in this followup or a prior one) to acknowledge this as a known unknown.
- `noted, no current action — <one-sentence rationale>` — read, considered, not acting; rationale provided.
- `accepted; re-review will pick up the diff` — already addressed elsewhere (e.g., another reviewer's followup, or a prior round).
- `oversight in {{FOLLOWUP_SHA}}; will address in next followup` — used when a finding was genuinely missed; the next followup commit's response will update this to `addressed`.

## Closing line

End the response with a one-line numeric summary:

```
Net: <A addressed, B intentional, C routed, D noted, E oversights>
```

Counts everything raised in the review the response addresses. Gives a numeric audit-trail of dispositions per round.

## Per-followup cadence

A respondent post is per-followup-commit. After the NEXT followup commit, the controller posts a NEW respondent comment for that round, addressing only the items raised in the most recent re-review (not prior reviews — those have their own respondent posts already in the PR timeline). Prior respondent posts stay; they form the audit trail across rounds.

## Initial-review round

The controller does NOT post a respondent comment on the initial-review round (before any `Code-review-followup:` commit). There is nothing to dispose of yet. The respondent enters AFTER the first followup commit.

## Return to controller

The controller IS writing this response; there is no separate subagent to return to. The respondent post lands on the PR; that's the artifact.
