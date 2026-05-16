# Review discussion loop v1 — respondent bot

**Slug:** review-discussion-loop-v1
**Iteration on the agentic-team track:** eighth, after [`docs/specs/2026-05-16-effort-max-custom-reviewers.md`](2026-05-16-effort-max-custom-reviewers.md).
**Type:** new GitHub App identity, new helper script, new CLAUDE.md sections, new respondent prompt template. No new logic in `shell/`.
**No bootstrap exceptions.** Spec ships via spec-PR workflow; implementation lands per the post-merge implementation convention.

## Context

The agentic-team architecture has shipped seven iterations and the reviewer workflow is operational: spec/ADR PRs trigger three reviewer subagents (red-team Opus, red-team Sonnet, spec-quality) that post under `gcscode-reviewer[bot]`. The controller (this Claude Code session, or future controllers) reads each review, decides what to address, and pushes `Code-review-followup:` commits. Re-reviewers re-review on each followup. This loop terminates when reviews come back clean.

Operationally observed gap (visible across PR #9 and PR #11): **per-finding disposition is invisible**. When a reviewer flags four premises and the controller addresses two, treats one as v2 territory, judges one as misreading — only the diff records what was addressed. The reasoning for un-addressed items goes nowhere. Not a PR thread reply, not a "considered and rejected" note, not a roadmap entry. A future reader (or reviewer) sees: reviewer raised X, controller didn't fix X. They cannot distinguish "ignored" from "addressed elsewhere" from "judged out of scope."

A related layer (Gap B): **open questions accumulate without routing**. Each red-team review surfaces "for v2 devil's-advocate" items and meta-suggestions (e.g., Opus's "specs-as-historical-record convention status" question on PR #11). The PR merges; those items go nowhere.

This iteration introduces a **respondent bot identity** (`gcscode-respondent`) that posts per-review disposition responses after each `Code-review-followup:` commit. The respondent's response documents each finding's disposition and routes open questions to their destinations (roadmap.md, out-of-scope.md, spec known-unknowns, or "noted, no current action with rationale").

## Why not the bigger version

The bigger version would include:

- **A respondent subagent** with its own role definition and prompt template, dispatched per response. v1 uses the controller (this Claude Code session) directly — session context contains the reasoning within a single session, and the prompt template enforces a consistent format across sessions. The cross-session reconstruction cost is the explicit limitation v1 accepts; see Known Unknowns. **Smaller wedge:** controller-direct + prompt template + accepted cross-session limitation. **Bigger wedge:** subagent dispatch infrastructure (its own role definition, prompt template, return-to-controller contract, audit-trail format).
- **Required re-reviewer engagement** with respondent posts. v1 ships optional engagement — re-reviewers MAY push back if they disagree, but aren't required to engage. **Smaller wedge:** optional engagement (one-liner prompt addition). **Bigger wedge:** required engagement (structured push-back/accept verdict per disposition; reviewer prompts grow substantially; risk of meta-debates).
- **Threaded inline replies on specific review comments** (using GitHub's `--reply-to` / `in_reply_to` API). v1 uses review-level comments (one per review). **Smaller wedge:** one comment per review. **Bigger wedge:** per-finding inline reply threading via the GitHub review-comment API (different posting mechanics; different audit-trail structure).
- **Open-question ledger file** (`docs/reviewer-open-questions.md`). User chose the smallest cut: route to existing files via documented disposition; no new ledger. **Smaller wedge:** route to existing files (roadmap/out-of-scope/spec known-unknowns). **Bigger wedge:** dedicated catalog with lifecycle conventions.
- **Human-comment-triggered respondent revisions.** v1: human disagreements with respondent dispositions become regular PR comments, addressed in the next followup commit. **Smaller wedge:** existing PR comment mechanism. **Bigger wedge:** triggered-respondent-revision flow with its own dispatch and audit trail.
- **Per-role bot identities for reviewers** (separate from respondent). Already a Considering item on the roadmap; orthogonal to this iteration. Out of scope here regardless of size.

This iteration ships: one new GitHub App identity, one new helper script, one new prompt template, two CLAUDE.md additions, optional re-reviewer engagement language in two reviewer prompt templates.

## Goals

1. (User-side, complete) Register a new `gcscode-respondent` GitHub App and install it in the repo.
2. Add a sibling helper script `.claude/scripts/gh-app-token-respondent` mirroring `.claude/scripts/gh-app-token`, swapped to read the respondent App's config + private key.
3. Add a `respondentApp` block to `.claude/agent-config.json` carrying the respondent App's App ID + installation ID.
4. Add a `GH_RESPONDENT_APP_PRIVATE_KEY_PATH` env var convention (documented in CLAUDE.md), parallel to the existing `GH_APP_PRIVATE_KEY_PATH`.
5. Add a new "Respondent posting discipline" subsection to CLAUDE.md, parallel to the existing "Subagent reviewer PR-posting discipline".
6. Update the "Auto-dispatch controller obligations" bullet 2 to include the respondent-posting step between the followup commit push and the re-dispatch.
7. Update the two reviewer prompt templates we own (`.claude/reviewer-prompts/red-team.md` and `.claude/reviewer-prompts/spec-quality.md`) with an "optional engagement" section about respondent posts.
8. Add a new respondent prompt template (`.claude/reviewer-prompts/respondent.md`) capturing the response format.

## Non-goals (this iteration)

Each has its own future trigger.

- **Respondent subagent dispatch.** Controller writes responses directly using session context. Trigger: first real cross-session PR (see Known Unknowns and Future iterations for the sharper articulation of this trigger).
- **Required re-reviewer engagement.** v1 makes engagement optional. Trigger: optional engagement isn't producing discussion-loop value.
- **Inline review-comment replies via `--reply-to`.** v1 posts review-level comments (one per review). Trigger: review-level grouping proves insufficient for readability.
- **Open-question ledger file.** No `docs/reviewer-open-questions.md`. Route to existing files. Trigger: "noted, no current action" residual proves significant enough to warrant a dedicated catalog.
- **Initial-review-round respondent post.** Initial reviews have nothing to dispose of yet — controller hasn't decided anything. Respondent posts ONLY after a `Code-review-followup:` commit lands. Trigger: an operational case for early signal.
- **Per-role bot identities for reviewers.** Independent iteration; on roadmap as Considering.
- **Multi-model v1 deprecation.** User flagged as next-up after this iteration; separate brainstorm.
- **Pre-merge mechanics validation.** Same structural constraint as effort-max iteration: the respondent App + helper script don't exist until post-merge implementation lands. Plan 1's smoke test runs post-merge.

## Architecture

### New App identity

`gcscode-respondent[bot]` — second GitHub App identity in the repo, parallel to `gcscode-reviewer[bot]`. Same posting permissions on PRs (`pull_requests: write`). Distinct App ID + installation ID + private key. Used exclusively for controller-authored responses to reviews. Voice separation is the value: reviewers and respondent are visually distinct in the PR conversation (different avatars, different names).

### Helper script

New file `.claude/scripts/gh-app-token-respondent`. Verbatim mirror of `.claude/scripts/gh-app-token` with four substitutions:

- `gcscode-reviewer` → `gcscode-respondent` (in the header comment).
- `GH_APP_PRIVATE_KEY_PATH` → `GH_RESPONDENT_APP_PRIVATE_KEY_PATH` (env var name).
- `.githubApp.appId` / `.githubApp.installationId` → `.respondentApp.appId` / `.respondentApp.installationId` (jq paths into the config).
- `gh-app-token:` → `gh-app-token-respondent:` (error-message prefix).

Plus `chmod +x` to make it executable. Exact `cp` + sed pipeline below in Post-merge implementation > Commit 1.

Reasoning for fork (vs parameterizing the existing script): smallest cut, zero risk to the existing reviewer infrastructure (which every existing reviewer dispatch depends on). A future iteration can consolidate scripts when per-role bot identities arrive (the roadmap's Considering item) — at that point we'd have 5+ identities and a parameterized script becomes the natural shape.

### Config change

`.claude/agent-config.json` gains an additive `respondentApp` block:

```json
{
  "githubApp": {
    "appId": "3693536",
    "installationId": "131834383"
  },
  "respondentApp": {
    "appId": "<USER_PROVIDES_AT_IMPLEMENTATION>",
    "installationId": "<USER_PROVIDES_AT_IMPLEMENTATION>"
  }
}
```

Reviewer's `githubApp` key stays untouched. The placeholder strings are filled in by the implementer using values the user provides (the App ID is visible in the App's settings page; the installation ID is visible in the installation URL or installation settings).

### CLAUDE.md additions

Two text changes in the "Subagent reviewer PR-posting discipline" subsection of CLAUDE.md.

**Edit A: New "Respondent posting discipline" subsection** — inserted immediately after the existing "Subagent reviewer PR-posting discipline" subsection's content (before "Reviewer-role design conventions"). Full content below in Post-merge implementation > Commit 4.

**Edit B: Updated "Auto-dispatch controller obligations" bullet 2** — the existing bullet about followup-commit re-dispatch is extended to include the respondent-posting step. Full text below in Post-merge implementation > Commit 5.

The other auto-dispatch obligation bullets (1 and 3) stay unchanged. The reviewer-role registry table stays exactly as-is. Respondent is NOT a reviewer role; it does not appear in the registry. It is a controller voice with its own App identity, documented in the new subsection.

### Re-reviewer prompt updates

The two reviewer prompt templates we own (`.claude/reviewer-prompts/red-team.md` and `.claude/reviewer-prompts/spec-quality.md`) gain a single new section: **Respondent posts (optional engagement)**. Inserted at a specific anchor (immediately after the `## Tone` section, before `## What you have access to`). Full content below in Post-merge implementation > Commit 6.

The superpowers-dispatched reviewer prompts (spec-compliance, code-quality, final cross-cutting) are NOT edited in this iteration. Those reviewers don't currently fire on spec/ADR PRs (where the respondent will post) — they fire on feature-PRs. When/if respondent posting extends to feature-PRs in a future iteration, the superpowers prompt edits land at that point.

### Respondent prompt template

New file `.claude/reviewer-prompts/respondent.md`, structured similarly to the existing reviewer prompts but for the controller's response voice. Full content below in Post-merge implementation > Commit 3.

The controller (this Claude Code session, or future controllers) writes response content directly using session context — no subagent dispatch. The prompt template documents the **format** of the response (header, body structure, disposition vocabulary, closing line) so successive controllers produce consistent output.

### Workflow shape change

Existing workflow (before this iteration):

```
PR opens → 3 reviewers post initial reviews (auto-dispatch)
  → controller writes Code-review-followup commit
  → 3 reviewers re-review (auto-dispatch)
  → ...repeat until clean
  → user merges
```

New workflow (after this iteration):

```
PR opens → 3 reviewers post initial reviews (auto-dispatch)
  → controller writes Code-review-followup commit
  → controller posts 3 respondent comments (one per review)  ← NEW
  → 3 reviewers re-review (auto-dispatch; may engage with respondent posts)
  → ...repeat until clean
  → user merges
```

## Post-merge implementation

Per the post-merge implementation convention, six direct-master commits. All content fully specified verbatim (or below); one piece of judgment required during implementation — the App ID + installation ID values, which the user provides at implementation time.

**Prerequisites (user-provided):**

1. (Needed before Plan 1's smoke test, not for the post-merge commits themselves) Generate a private key for the `gcscode-respondent` App from its GitHub App settings page (Settings > GitHub Apps > gcscode-respondent > Generate a private key). Store the resulting `.pem` file outside the repo (the existing reviewer App's key path pattern is the precedent — see CLAUDE.md "Subagent reviewer PR-posting discipline > Config locations").
2. (Needed before Plan 1's smoke test) Set `GH_RESPONDENT_APP_PRIVATE_KEY_PATH` in the shell environment, following the same convention as the existing `GH_APP_PRIVATE_KEY_PATH`.
3. (Preferred before Commit 2; placeholder-acceptable) Copy the App ID and installation ID from the App's settings + installation pages — these get filled into the `respondentApp` block in Commit 2. If the values aren't yet available, Commit 2 can ship with placeholder strings (`<RESPONDENT_APP_ID>` and `<RESPONDENT_INSTALLATION_ID>`) and a small followup commit substitutes the real values when the user provides them.

Items 1 and 2 are private-key prerequisites for running Plan 1's mechanics smoke test only; Commits 1, 3, 4, 5, 6 land regardless. Item 3 is preferred at Commit 2 time but degrades gracefully to a placeholder + followup substitution.

- **Commit 1: Create `.claude/scripts/gh-app-token-respondent`** via the `cp` + sed pipeline below.
- **Commit 2: Update `.claude/agent-config.json`** — add the `respondentApp` block with App ID + installation ID values provided by the user.
- **Commit 3: Create `.claude/reviewer-prompts/respondent.md`** with the verbatim content below.
- **Commit 4: Add "Respondent posting discipline" subsection to CLAUDE.md** with the verbatim content below.
- **Commit 5: Update CLAUDE.md "Auto-dispatch controller obligations" bullet 2** with the verbatim text below.
- **Commit 6: Update `.claude/reviewer-prompts/red-team.md` and `.claude/reviewer-prompts/spec-quality.md`** — insert the verbatim "Respondent posts (optional engagement)" section at the specified anchor.

### Verbatim — Commit 1 (helper script pipeline)

Run from the repo root:

```bash
cp .claude/scripts/gh-app-token .claude/scripts/gh-app-token-respondent
sed -i '' 's/gcscode-reviewer/gcscode-respondent/g' .claude/scripts/gh-app-token-respondent
sed -i '' 's/GH_APP_PRIVATE_KEY_PATH/GH_RESPONDENT_APP_PRIVATE_KEY_PATH/g' .claude/scripts/gh-app-token-respondent
sed -i '' 's/\.githubApp\.appId/.respondentApp.appId/g' .claude/scripts/gh-app-token-respondent
sed -i '' 's/\.githubApp\.installationId/.respondentApp.installationId/g' .claude/scripts/gh-app-token-respondent
sed -i '' 's/gh-app-token:/gh-app-token-respondent:/g' .claude/scripts/gh-app-token-respondent
chmod +x .claude/scripts/gh-app-token-respondent
```

After the pipeline, read the resulting script end-to-end to confirm: (a) all six substitutions applied, (b) no `gh-app-token:` (without `-respondent`) error prefixes remain, (c) the header comment now refers to `gcscode-respondent`, (d) the file is executable. The `sed -i ''` form is macOS BSD sed. If implementing on Linux, drop the empty quote: `sed -i 's/.../...'`.

### Verbatim — Commit 2 (agent-config.json)

Replace the existing `.claude/agent-config.json` content with:

```json
{
  "githubApp": {
    "appId": "3693536",
    "installationId": "131834383"
  },
  "respondentApp": {
    "appId": "<RESPONDENT_APP_ID>",
    "installationId": "<RESPONDENT_INSTALLATION_ID>"
  }
}
```

Substitute `<RESPONDENT_APP_ID>` and `<RESPONDENT_INSTALLATION_ID>` with the actual values the user provides. Reviewer's `githubApp` block values stay unchanged.

### Verbatim — Commit 3 (`.claude/reviewer-prompts/respondent.md`)

````md
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
````

### Verbatim — Commit 4 (new "Respondent posting discipline" subsection in CLAUDE.md)

Insert this subsection immediately after the existing "Subagent reviewer PR-posting discipline" subsection's content (specifically: after the "Public repo note" paragraph and the "Config locations" paragraph, before the next major section "Reviewer-role design conventions"):

````md
### Respondent posting discipline

After each `Code-review-followup:` commit on a spec/ADR PR, the controller posts a **respondent response** for each reviewer that posted on the PR. The respondent voice is a distinct GitHub App identity (`gcscode-respondent[bot]`) that documents the controller's per-finding dispositions for the round. The respondent is NOT a reviewer; it has no verdict; it carries the controller's voice for response purposes.

**Dispatch sequence** (controller obligation, integrates with the auto-dispatch obligation):

1. Push the `Code-review-followup:` commit to the PR's branch.
2. For each reviewer's most recent review on the PR (red-team Opus, red-team Sonnet, spec-quality — three responses total), post a respondent comment using the template at `.claude/reviewer-prompts/respondent.md`. Token: `export GH_TOKEN=$(.claude/scripts/gh-app-token-respondent)`. Verdict: `--comment`.
3. Re-dispatch the three reviewer subagents per the existing auto-dispatch obligation. Re-reviewers may engage with the respondent posts (optional engagement; see updated reviewer prompts).

**Response header convention** (mandatory):

```
## Respondent — re commit <SHA> — to <reviewer role> review by <reviewer model>
```

Where `<SHA>` is the followup commit, `<reviewer role>` is `red-team` or `spec-quality`, and `<reviewer model>` is the model that posted the review being responded to.

**Token + posting:**

```bash
GH_TOKEN=$(.claude/scripts/gh-app-token-respondent) gh pr review <PR> --comment --body "..."
```

**Identity:** `gcscode-respondent[bot]`. Distinct from `gcscode-reviewer[bot]`. Same posting permissions on PRs; different audit-trail attribution.

**Config:** App ID and installation ID live in `.claude/agent-config.json` under the `respondentApp` key (additive; reviewer's `githubApp` key untouched). Private key path is read from the `GH_RESPONDENT_APP_PRIVATE_KEY_PATH` env var; the PEM file never enters git.

**Open-question routing:** the respondent's response documents each open question's destination. The actual edit to `docs/roadmap.md` or `docs/out-of-scope.md` lands post-merge per the existing propagation pattern. Spec known-unknowns are edited inline as part of the followup commit (existing pattern). There is no dedicated open-question ledger file in v1; route to existing files via documented disposition.

**Initial-review round:** the respondent does NOT post on the initial-review round (before any followup commit). Initial reviews have nothing to dispose of yet. Respondent enters after the first followup commit.

**Discipline note:** the respondent's response is the controller's documented disposition. Skipping the respondent step on a followup commit makes the iteration's per-finding dispositions invisible — exactly the gap this iteration addresses. Treat the respondent post as required, not optional, on spec/ADR PRs.

**Out of scope for v1:** respondent subagent dispatch (controller writes directly), threaded inline replies on specific review comments (uses review-level comments), required re-reviewer engagement (engagement is optional in v1), and a dedicated open-question ledger file (routes to existing files). Each has its own future-iteration trigger in [`docs/specs/2026-05-16-review-discussion-loop-v1.md`](docs/specs/2026-05-16-review-discussion-loop-v1.md).

**Public repo note:** as with reviewer posts, respondent posts are world-readable. Keep them professional. Don't paste credentials, internal URLs, or sensitive context.
````

### Verbatim — Commit 5 (auto-dispatch controller obligations bullet 2)

Replace the existing "After every `Code-review-followup:` commit on a spec/ADR branch:" bullet of the "Auto-dispatch controller obligations" checklist with:

````md
- **After every `Code-review-followup:` commit on a spec/ADR branch:** (a) push the commit, (b) post respondent responses per the Respondent posting discipline subsection above — one per reviewer that has posted on the PR (three posts total for spec/ADR PRs with the current three reviewers), then (c) re-dispatch ALL THREE reviewer roles in parallel. Each role's re-review header includes `(re-review of <SHA>)` where `<SHA>` is the followup commit (existing convention). For the red-team multi-model pair, both Opus and Sonnet re-review independently. Note: a followup that does not touch content any reviewer commented on will still trigger all three re-dispatches AND all three respondent posts. v1 accepts the duplicative-review-and-response cost; if the pattern produces material noise, a future iteration can condition the obligations on whether the followup touches reviewed content for each role.
````

Bullets 1 and 3 of the same checklist stay unchanged. (Bullet 1 covers "Before opening a `spec/<topic>` or `adr/<slug>` PR" auto-dispatch; bullet 3 covers "No automated enforcement in v1.")

### Verbatim — Commit 6 (re-reviewer prompt updates)

For both `.claude/reviewer-prompts/red-team.md` and `.claude/reviewer-prompts/spec-quality.md`, insert the following section immediately AFTER the existing `## Tone` section's content and BEFORE the next `## ` heading (which is `## What you have access to` in both templates):

````md
## Respondent posts (optional engagement)

After a `Code-review-followup:` commit, the controller may post a response from `gcscode-respondent[bot]` documenting per-finding dispositions ("addressed in `<SHA>`", "intentional, see `<X>`", "routed to `<destination>`", "noted, no action"). You may read these posts when re-reviewing.

If you disagree with a documented disposition (e.g., the rationale doesn't actually address your concern; the routing destination is wrong; the "intentional" rationale is mistaken), push back in your re-review under the relevant section — quote the disposition, state your disagreement, suggest what would actually address it. Otherwise, proceed as normal: react to the diff.

Optional means optional. If the respondent's dispositions look reasonable to you, you don't have to acknowledge them — react to the diff as you would in any re-review.
````

The exact anchor is the line immediately after the existing `## Tone` section content, before the blank line preceding `## What you have access to`. In both templates this is at approximately line 49-50; verify by reading the file before inserting.

## Data flow — how this iteration ships

1. Brainstorm → spec → spec-PR. **Eighth iteration shipping via the spec-PR workflow.**
2. **On PR open: red-team Opus + red-team Sonnet + spec-quality auto-dispatch in parallel** per the current obligation. This PR is reviewed under the existing pre-respondent workflow (the respondent App + helper script don't exist yet — they're what this iteration introduces).
3. User reads reviews + approves. `Code-review-followup:` commits trigger re-dispatch under the existing pattern. **No respondent posts on this PR** — they require the post-merge implementation to have landed.
4. User merges via `gh pr merge --merge` or `auto-merge` label.
5. Post-merge implementation: six direct-master commits per the post-merge convention.
6. **First spec/ADR PR after merge:** the controller posts respondent responses after each followup commit, per the new discipline.

## Validation

Two plans.

### Plan 1: Mechanics smoke test (next test/* PR after merge)

A throwaway test branch verifies the respondent App token + posting works.

- **Branch:** `test/respondent-mechanics` off master (post-merge).
- **Content:** a trivial throwaway file.
- **Test actions:**
  1. Run `.claude/scripts/gh-app-token-respondent` and verify it succeeds (App ID + installation ID + private key path all valid; token printed to stdout).
  2. Post a test comment to the test PR using the respondent identity — verify it lands under `gcscode-respondent[bot]`.
  3. Verify the comment is visually distinct from `gcscode-reviewer[bot]` posts in the PR conversation (different avatar, different name).
- **Disposition:** kept open as a permanent reference artifact alongside the existing five (PR #1, #3, #6, #8, #10) and PR #11's effort-max smoke-test artifact (when that test PR is created and kept open per PR #11's Plan 1). NOT merged.

### Plan 2: Live workflow on the next real spec/ADR PR

The first real spec/ADR PR after this iteration ships exercises the new workflow end-to-end. Qualitative gut-check observations:

- Does the respondent post actually clarify which findings were addressed vs intentional vs routed? Read the PR conversation flow.
- Do reviewers engage when they disagree with a disposition? Optional in v1; observing whether the option is ever used at all.
- Is the per-finding response format readable, or does it become noise? Look at a multi-round PR's conversation tab.
- Does the open-question routing produce actual roadmap.md / out-of-scope.md edits at merge? Or do "routed" dispositions evaporate at merge time?

**Failure response:** if respondent posts feel like noise rather than signal, revisit (a) the granularity (per-finding vs per-review consolidation), (b) the post timing (per-followup vs end-of-iteration), or (c) the engagement model (optional vs required). If the open-question routing fails to produce real edits, add a "propagation verification" step to the post-merge convention. If respondent posts add no value relative to the followup commit message itself, deprecate the respondent and consolidate dispositions into structured commit messages.

## VS Code alignment

No VS Code alignment implications. The respondent bot is a gcscode-specific agentic-team mechanism. VS Code PR-review-author-responses are a human pattern; the respondent is the agentic analog of the human-author-replies-to-reviewer flow that exists in any GitHub PR.

Propagation to `shell/docs/vs-code-alignment.md`: none.

## `docs/out-of-scope.md` propagation

Two new entries; both are cross-cutting architectural deferrals (not per-iteration scope cuts).

1. **Add: "Respondent subagent dispatch for cross-session consistency."** v1 ships controller-direct response writing as a Day 1 accepted limitation. The deferral is architectural (subagent dispatch infrastructure vs controller-direct), not per-iteration. Trigger to revisit: the first real cross-session PR that requires meaningful reconstruction of prior-session reasoning (the cross-session tripwire in the Tripwires section below). Reference: this spec's Known Unknowns section.

2. **Add: "Required re-reviewer engagement with respondent posts."** v1 ships optional engagement. The deferral is architectural (whether reviewers must explicitly accept/push-back on each disposition) not per-iteration. Trigger to revisit: the optional-engagement-never-fires tripwire in the Tripwires section below.

(The threaded-replies, ledger-file, and human-comment-trigger non-goals stay per-iteration scope cuts with their own Future iterations triggers; they don't meet the cross-cutting threshold.)

## `docs/roadmap.md` propagation

Four updates:

1. **Add a Shipped entry for this iteration** under the agentic-team track: `review-discussion-loop-v1`.
2. **Update the existing "Per-role bot identities for reviewers" Considering entry** (if present; otherwise add it) — note that this iteration's `gcscode-respondent` App is a NEW actor identity (controller voice), not a per-role identity for the reviewer roles themselves. Per-role reviewer identities remain on Considering.
3. **Add a new Considering entry: "Agentic-team tech-debt clearing iteration"** — user has explicitly flagged this as the next iteration after PR #12 (per Origin section's user-quote). Audits deferred ADRs, missing conventions, partially-resolved items, and accepted limitations from PRs #11 and #12. **Trigger:** the debt-clearing brainstorm starts as soon as PR #12 merges (no pending external prerequisite). The user-flagged debt list is the input; the iteration's scope decision is part of the brainstorm itself.
4. **Add Considering entries for the two cross-cutting v1 deferrals** that also landed in out-of-scope.md: "Respondent subagent dispatch" (cross-session reconstruction) and "Required re-reviewer engagement with respondent posts." Listing them on the roadmap keeps them in the planning view alongside the out-of-scope deferral; same tracking concern, different file. Not a new convention — just two entries that should be tracked because they meet the cross-cutting threshold.

## Known unknowns

- **Does the optional engagement actually produce discussion?** v1 ships engagement as optional. If no re-reviewer ever pushes back on a respondent disposition across N=5 spec/ADR PRs, the loop isn't actually a loop — it's one-way documentation. Plan 2 observes this. Failure response: revisit the engagement model in a future iteration.
- **Are 3 respondent posts per followup-commit round noisy?** A 4-round iteration (like the recent PR #11) would generate 12 respondent posts. The PR conversation tab gets dense. Plan 2 observes readability.
- **Token cost.** Three respondent posts per round, each ~150-300 tokens of content the controller writes. Across iterations this is small; flagging only because PR API quotas and visual density compound.
- **Pre-merge verification is structurally skipped.** Same constraint as effort-max iteration: the respondent App + helper script don't exist until post-merge implementation lands. Plan 1's smoke test runs post-merge. If the helper script has a bug or the App ID is misconfigured, the failure surfaces after the spec is merged. Accepted trade-off; the rollback path is "revert all six post-merge commits + restore the prior CLAUDE.md state" — non-trivial but bounded.
- **Cross-session controller-direct response writing is a Day 1 limitation, not a future risk.** v1 ships controller-direct with the load-bearing premise that "session context already contains the reasoning that needs to be captured." That premise is true within ONE session, but multi-session PRs are the norm — PR #11 ran four followup rounds across what was almost certainly multiple sessions. A new session picking up a mid-iteration PR has NO prior reasoning context: it must reconstruct intent from the followup commits, the diff, and prior reviews — which is exactly what a subagent dispatch would do. v1 accepts this limitation by trading off subagent dispatch infrastructure for the simpler controller-direct pattern. The respondent prompt template's format is the consistency mechanism across sessions (different controllers reading the same template produce consistent output structure), but the *substance* of each disposition still requires the controller to reconstruct reasoning each time the session boundary crosses. Failure response: respondent subagent dispatch (Future iteration #1). **Trigger is no longer speculative** — the next real cross-session PR validates whether reconstruction-cost is bearable or not. If a controller spends meaningful time reconstructing prior-session reasoning before writing a response, the subagent iteration is warranted.
- **What happens to disposition disagreements after merge?** Pre-merge, human disagreements with respondent dispositions become PR comments addressed in the next followup. Post-merge, the PR is closed; disagreements become next-iteration brainstorm fodder. v1 accepts this; future iteration could explore a "post-merge respondent appendix" mechanism if it becomes painful.

## Why no dedicated ADR for the respondent-as-new-actor pattern

The respondent introduces a new actor class — a non-reviewer GitHub App identity carrying controller voice on PRs. ADR-0008 (reviewer-role registry) was scoped to reviewer roles specifically; the respondent doesn't fit cleanly under it. Three options were considered:

1. **Extend ADR-0008** to cover non-reviewer App identities (controller-voice actors). Reframes ADR-0008 from "reviewer-role registry" to "agentic-actor registry."
2. **Write ADR-0009** specifically for the respondent-as-new-actor pattern.
3. **No new/updated ADR;** rationale lives in this spec.

**v1 takes Option 3 with explicit acknowledgment that this is the same accepted-limitation pattern as PR #11's `.claude/agents/` structural layer.** The respondent is one new actor; ADR-0008 doesn't break. But this is the SECOND iteration in a row where a real architectural addition has avoided an ADR (PR #11's agent files were also "Why no ADR"-rationalized). The pattern is starting to look like deferred-ADR-debt rather than principled minimal architecture.

**This is explicit input to the next iteration**, which the user has flagged as a debt-clearing iteration: audit the deferred-ADR queue, decide on ADR-0008 extension vs ADR-0009 vs supersession patterns, and formalize the agentic-actor registry shape. This iteration ships without the ADR but does NOT pretend the architectural addition is too small to need one.

## Tripwires for known-quality concerns

Per the design conventions in CLAUDE.md (Reviewer-role design conventions > Tripwires), validation plans should include explicit tripwires for concerns tied to this iteration's specific failure modes:

- **Cross-session reconstruction tripwire.** If during the first 2 multi-round spec/ADR PRs after this iteration ships, the controller (in a new session) spends >10 minutes reconstructing prior-session disposition intent before writing a response — pull the respondent subagent iteration forward and prioritize it. The 10-minute threshold is operational, not algorithmic; the controller's session log is the signal.
- **Optional-engagement-never-fires tripwire.** If across the first 5 spec/ADR PRs after this iteration ships, NO re-reviewer ever pushes back on a respondent disposition under the optional-engagement provision — flag that the loop isn't actually a loop. v1 ships engagement as optional; the operational data tells us whether the option is ever exercised. If never, the discussion-loop hypothesis fails operationally and the required-engagement iteration is warranted.
- **Routing-evaporates tripwire.** If across the first 3 spec/ADR PRs after this iteration ships, respondent posts document "routed to docs/roadmap.md" dispositions that NEVER result in actual roadmap.md commits at merge time — flag that the routing-via-existing-files model is failing. The respondent post documents intent; only post-merge propagation makes it concrete. If the intent-to-actual gap is non-zero, the ledger file (Future iteration #4) or stronger propagation enforcement may be needed.

These tripwires are manual review items, not automated checks; they live in this spec and migrate to the next iteration's brainstorm input if any fires.

## Future iterations

Each gets its own brainstorm when triggered.

1. **Respondent subagent dispatch** — dedicate a subagent role for response writing instead of controller-direct. **Trigger: first real cross-session PR** (likely the very first multi-round spec/ADR PR after this iteration ships). The cross-session reconstruction cost is the validation signal — if reconstruction is materially expensive, the subagent iteration is warranted. (Per v1's accepted limitation in Known Unknowns; this is no longer speculative.)
2. **Required re-reviewer engagement** — re-reviewer prompts require reading respondent posts and explicitly accepting or pushing back on each disposition. Trigger: optional engagement isn't producing discussion-loop value (Plan 2's observation answers this).
3. **Inline review-comment replies via `--reply-to`** — thread responses to specific review comments instead of review-level comments. Trigger: review-level grouping proves insufficient for readability.
4. **Open-question ledger file** (`docs/reviewer-open-questions.md`) — dedicated catalog for "noted, no current action" items. Trigger: that disposition becomes frequent enough to need browse-ability across iterations.
5. **Per-role bot identities for reviewers** — already on roadmap as Considering; separate iteration.
6. **Initial-review-round respondent commentary** — controller may want to flag intent before writing the followup. Trigger: operational case for early signal.
7. **Respondent posting on feature-PRs** — extend the discipline beyond spec/ADR PRs. Requires updating the superpowers-dispatched reviewer prompts (or forking that dispatch). Trigger: feature-PR review workflow starts producing similar disposition-invisibility gaps.
8. **Multi-model v1 deprecation** — user flagged in earlier brainstorm; pending the upcoming debt-clearing iteration's audit.
9. **Agentic-team tech-debt clearing** — **user has explicitly flagged this as the next iteration after PR #12.** Audits deferred ADRs (respondent-as-actor, `.claude/agents/` structural layer, others), missing conventions (specs-as-historical-record convention status, agent file discovery session-binding), partially-resolved roadmap items, and the routing-enforcement and cross-session limitations accepted in v1 of this iteration. Possibly decomposes into a housekeeping-style audit + A/B/C cut + execute pattern. Per user 2026-05-16: "we have chosen to accept limitations for the past 3 or 4 iterations, we are building up technical debt. Lets make a note to design a plan to tackle this in the next iteration."

## Origin

User raised the gap during a brainstorm on 2026-05-16, immediately after PR #11 (effort-max-custom-reviewers) reached convergence: "there is no discussion with the reviews, correct? It appears the reviews are processed 'internal' and get a follow up commit. Do you see merit in allowing a feedback loop here?" User confirmed both Gap A (per-finding disposition invisible) and Gap B (open questions accumulate without routing) as real, with PR #11's review history as the concrete example — Opus's "specs-as-historical-record convention status" open question was silently not-acted-on, and that decision was undocumented anywhere.

Design refined through four clarifying questions:

- **Response voice:** new bot identity (user confirmed "cleaner version" of controller-direct posting; user is comfortable with the App registration workload).
- **Response granularity:** per-review consolidated (one comment per review, finding-structured) — same information density as per-finding, lower posting volume.
- **Open-question handling:** skip the ledger; route to existing files via documented disposition (smallest cut).
- **Loop depth:** optional re-reviewer engagement (v1) — opens the door without forcing the loop; required engagement deferred to v2.

User has registered the `gcscode-respondent` GitHub App and installed it in the repo. Private key generation is deferred to post-merge implementation (user provides at that time; the user note: "I have not generated any client secrets, but the app is installed in the repo. Please let me know what you need from me when required.").

The naming choice — `gcscode-respondent` over alternatives like `gcscode-controller` or `gcscode-author` — emphasizes the function (responds to reviews) over the architectural role (controller) or the GitHub-author concept. The respondent App handles ONE specific function in v1: documenting controller dispositions per review. If its surface grows in future iterations (e.g., the respondent eventually merges PRs, comments on issues, or carries other controller-voice functions), a renaming might be warranted at that point.
