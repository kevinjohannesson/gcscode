# ADR-0010: Reviews as artifacts (GitHub PR + bot identity for agentic reviewer output)

**Decision date:** 2026-05-12
**Created:** 2026-05-25 (retroactive)
**Status:** Accepted

## Retroactive ADR — read this first

This ADR is retroactive. The decision it documents was made on 2026-05-12 and shipped as the reviews-as-artifacts iteration ([`docs/specs/2026-05-12-reviews-as-artifacts.md`](../specs/2026-05-12-reviews-as-artifacts.md)). At the time, the rationale lived in the spec only. Subsequent agentic-team-track iterations (ADR-0008, ADR-0009, all reviewer/respondent iterations) build on the architectural commitment this ADR now names: that **reviewer subagent output is a durable artifact on the PR, not ephemeral controller-summarized chat output**.

Creating this ADR thirteen days after the decision shipped does not change the decision; the architecture has been operational across ~16 spec/ADR/feature PRs by the time of writing. The motivation is housekeeping: bring the load-bearing call into the ADR record so a reader doesn't need to traverse a long spec to find it, and so future supersession or extension has an ADR to point back to.

## Context

Before this decision, reviewer subagents (the per-task spec-compliance and code-quality reviewers from `superpowers:subagent-driven-development`, plus the end-of-iteration final cross-cutting reviewer when run) operated entirely in controller context: a subagent reviewed code, returned a textual summary to the dispatching Claude Code session, and the session compressed multiple reviewer outputs into a short chat update for the user. The per-task reviewers (spec-compliance + code-quality) were the triggering pain — roughly 10 tasks per iteration × 2 reviewers = ~20 per-task reviewer outputs per iteration, **of which only ~1–3 findings reached the user in the controller's compressed summary**. The denominator (outputs that existed) and the numerator (findings that surfaced) made the compression loss visible. The end-of-iteration final cross-cutting reviewer was applied less uniformly pre-decision; per-task review compression was the named pain point.

This is a smoke-break problem in the sense that the canonical record (controller's chat summary) does not capture the underlying reasoning (full reviewer output). The user has no direct visibility into reviewer findings that didn't make the summary, whether reviewers agreed with each other on the same code, or what was dismissed. The reviews exist but are not durable enough to inspect — they're filtered through the parent's compression.

The agentic-team-architecture track is the user's broader experiment of building Claude-driven engineering workflows on top of the same repo that hosts the gcscode extension architecture. This iteration is the first deliberately-named step on that track: making the workflow's review-output explicit and durable so subsequent iterations (multi-model reviewers, red-team for specs/ADRs, auto-merge, override semantics) have a real artifact substrate to measure independence-of-opinion, verdict integrity, and audit trail against.

A complicating constraint surfaces with verdict semantics: GitHub prohibits PR authors from submitting `--approve` or `--request-changes` reviews on their own PR. Since the user pushes the feat branch, the user is the PR author; reviewing under the user's PAT would force every reviewer post to be `--comment` only, defeating the verdict-handling design (a reviewer flagging a real bug cannot meaningfully request changes if it's restricted to comment-level posts). A non-author identity for reviewer posts is therefore not a stylistic preference; it's a structural requirement of the verdict design.

## Decision

**Reviewer subagent output is a durable artifact on the PR.** Three architectural commitments — not co-equal peers but a hierarchy: **commitment (2) is the load-bearing call**, commitment (1) creates the substrate commitment (2) requires, and commitment (3) is structurally forced by commitment (2) given the user-as-PR-author constraint.

**1. GitHub PRs replace the local `git merge --no-ff feat/<topic>` integration step** as the substrate for code review. Feature branches push to `origin`, open a draft PR on first task commit, transition to ready-for-review at end-of-iteration, and merge via `gh pr merge --merge <num>` (preserving the merge-commit boundary). Spec/plan/ADR commits continue to land directly on master at this decision's time (a constraint later relaxed by the red-team-reviewer iteration's spec-PR + ADR-PR workflow).

**2. Reviewer subagents post their reviews to the PR as GitHub PR reviews, in addition to returning a textual summary to the dispatching controller.** PR posting is additive — the existing controller-side followup loop (controller reads summary, dispatches Code-review-followup implementer, dispatches re-review) is preserved by the summary; durability is added by the PR post. **This is the load-bearing call: durable reviewer output as the substrate everything else on the agentic-team track builds on.**

**3. Reviewer posts are authored by a dedicated GitHub App identity, not the user's account.** **Structurally forced by commitment (2) given the user-as-PR-author constraint:** GitHub prohibits PR-author identities from `--approve` or `--request-changes` on their own PR, so any non-author identity will do; a GitHub App is the canonical answer (PAT-as-bot is policy-discouraged). Single shared identity at v1 (`gcscode-reviewer[bot]`), with role/model disambiguated via review-text headers. Each reviewer's dispatch prompt starts with a token-helper invocation (`export GH_TOKEN=$(.claude/scripts/gh-app-token)` at v1; later superseded — see breadcrumb below) that exchanges App credentials for an installation token via JWT.

Supporting conventions that fall out of the three commitments:

- **Verdicts per reviewer kind.** Per-task reviewers may post `--comment` or `--request-changes`, never `--approve` (a per-task reviewer sees only a slice of the PR). The final cross-cutting reviewer may post `--approve` or `--request-changes`, never `--comment` (it carries the only approval-gating verdict).
- **Review headers carry the disambiguation the App identity can't.** Format: `## <Review kind> — task <N> (if per-task) — <reviewer model>`. Re-reviews after followup commits include `(re-review of <SHA>)`.
- **Re-reviews stay in the PR timeline.** Reviewers never dismiss their own prior reviews. A subsequent `--comment` re-review is for the audit trail ("flagged X, addressed in SHA Y"), not for unblocking — only the final cross-cutting reviewer's `--approve` mechanically clears `--request-changes` reviews. (The precise GitHub semantic: only `--approve` from the same identity clears that identity's prior `--request-changes`; a subsequent `--comment` from the same identity does NOT clear it. Empirically validated post-merge on PRs #1 + #2, 2026-05-14 — this convention reflects post-decision empirical work, not decision-time knowledge.)
- **Versioned configuration at v1:** `.claude/agent-config.json` holds `appId` + `installationId` (public values; not secrets). Private key path is read from a `GH_APP_PRIVATE_KEY_PATH` env var. The PEM file never enters git. **Superseded 2026-05-16** by the per-role-bot-identities iteration ([`2026-05-16-per-role-bot-identities-for-reviewers.md`](../specs/2026-05-16-per-role-bot-identities-for-reviewers.md)): config restructured under `reviewerApps` (per-role-slug keys); per-role PEMs at `$HOME/.config/gcscode/gcscode-<role-slug>.pem`; `GH_REVIEWER_APP_PRIVATE_KEY_DIR` env var as optional override. The v1 details are documented here as historical record of what was decided 2026-05-12; current operational state lives in CLAUDE.md "Subagent reviewer PR-posting discipline > Config locations".
- **Token helper at v1:** `.claude/scripts/gh-app-token` (no argument). **Superseded 2026-05-16** by `.claude/scripts/gh-app-token-reviewer <role-slug>` (per-role parameterization). Same retroactive-record rationale as the config schema above.
- **Workflow surface is `CLAUDE.md` instructions + the token helper script.** No new TypeScript code, no new slash commands, no new agent files at v1. **Agent files added 2026-05-16** by the effort-max-custom-reviewers iteration ([`2026-05-16-effort-max-custom-reviewers.md`](../specs/2026-05-16-effort-max-custom-reviewers.md)) for `effort: max` + per-role model defaults on spec/ADR-PR reviewers; v1's no-agent-files framing was accurate at decision time, not as a permanent commitment.

**Scope boundary (what this decision explicitly did NOT include).** The source spec scoped this iteration as a deliberate wedge; the iteration boundary is part of the decision and worth surfacing here at ADR level (not just in the Alternatives/Deferred-scope sections below). The original decision explicitly excluded: Linear or other external work-tracking; webhook routers / event-driven dispatch; multi-model heterogeneous reviewers; override semantics (reviewer supersedes ADR, `blocked-on-adr` labels); auto-merge on user approval; spec/plan/ADR PR workflow (those commits continued landing directly on master); multiple GitHub Apps for distinct reviewer identities per role; required CI checks / branch protection rules; any code changes to the gcscode source tree. Each was deliberate scope-cut; each became its own subsequent iteration when triggered (see Related for the chain).

Iteration-level implementation details — exact prompt-template wording, App setup steps, the verdict-permission table layout, the GitHub-API JWT specifics, the PR-body template — live in the spec ([`docs/specs/2026-05-12-reviews-as-artifacts.md`](../specs/2026-05-12-reviews-as-artifacts.md)). This ADR documents only the load-bearing architectural commitments above.

## Alternatives considered

Genuinely-alternative architectures the decision weighed and rejected (different shapes of the same problem, not future-iteration scope cuts — those are documented in "Deferred scope" below).

**Keep reviews as ephemeral chat output (status quo at decision time).** No PR substrate, no bot identity, controller compresses reviewer output into chat. Rejected: this is the smoke-break problem itself; the canonical record never captures underlying reasoning. The agentic-team track cannot meaningfully experiment with multi-model reviewers, independence-of-opinion, or override semantics until reviewer output has a durable form.

**Post reviewer output under the user's GitHub PAT.** A non-App identity that doesn't need App setup or token-helper infrastructure. Rejected: GitHub blocks PR-author from `--approve` and `--request-changes` on their own PR. Since the user authors the feat branch, every reviewer post would be forced to `--comment`. The verdict-handling design (per-task `--request-changes` for real blocking issues, final cross-cutting `--approve` as the merge gate) is structurally incompatible with PAT-as-reviewer.

**Multiple GitHub Apps from day 1 (one per reviewer role).** Per-role identities like `gcscode-spec-compliance[bot]`, `gcscode-code-quality[bot]`, etc. Rejected: YAGNI at v1; role/model is recoverable from review-text headers; single App means one config and one token helper. The single-bot scheme later limits multi-bot expansion (un-dismissed `--request-changes` from a second bot gates independently), but the limit is acceptable at v1 and was eventually addressed by the per-role-bot-identities iteration (2026-05-16). Decision: ship single-bot first, split later when actually needed.

## Deferred scope

Future-iteration scope cuts (not architectural alternatives weighed against the chosen design — these are pieces of the same long-term architecture, deferred for tractable iteration size). Each shipped as its own subsequent iteration when triggered; "deferred" should be read as "not shipped in this iteration's wedge," not as "rejected approach."

**External work-tracking (Linear) for review findings.** Reviewer output flows into Linear tickets per finding, with PR review as a secondary surface. Deferred: multi-iteration project of its own; PR-as-substrate is the smallest cut that earns its keep; Linear can layer on later if PR-resident reviews prove insufficient. Status as of 2026-05-25: still deferred (no triggering pain).

**Webhook routers / event-driven dispatch.** Reviewer dispatch fires on GitHub events (PR opened, commits pushed) rather than controller orchestration. Deferred: requires off-session infrastructure (webhook receiver, queue, dispatcher). The controller (Claude Code session) stays the orchestrator at v1. Status as of 2026-05-25: still deferred.

**Multi-model heterogeneous reviewers.** Run Opus + Sonnet (or one Claude + one non-Claude) on the same review and compare outputs. Deferred for v1: the independence-of-opinion payoff requires durable reviews to measure; this iteration makes them durable so a future iteration can run the experiment honestly. **Shipped 2026-05-16** as the multi-model red-team v1 iteration ([`2026-05-16-multi-model-red-team-v1.md`](../specs/2026-05-16-multi-model-red-team-v1.md)).

**Override semantics (reviewer supersedes ADR, `blocked-on-adr` labels).** Formal patterns for reviewer disagreement with architectural decisions. Deferred for v1: nothing to override yet; revisit when a reviewer actually wants to block an iteration on architectural grounds. Status as of 2026-05-25: still deferred (the red-team verdict-promotion future iteration would bring this).

**Auto-merge on user approval.** A workflow that merges PRs when the user explicitly opts in. Deferred for v1: merge stays manual; the workflow is its own follow-up iteration. **Shipped 2026-05-14** as the auto-merge-on-user-approval iteration ([`2026-05-14-auto-merge-on-user-approval.md`](../specs/2026-05-14-auto-merge-on-user-approval.md)).

**Spec/plan/ADR PR workflow.** Specs, plans, and ADRs continue to land directly on master at this decision's time. Deferred for v1: the spec-PR workflow is its own iteration with its own reviewer-role considerations. **Shipped (specs + ADRs) 2026-05-14** as the red-team-reviewer iteration ([`2026-05-14-red-team-reviewer.md`](../specs/2026-05-14-red-team-reviewer.md)); plans continue on master directly.

## Consequences

**Positive:**

- **Durable audit trail.** Every reviewer post survives the session boundary. A reader weeks or months later can inspect what each reviewer said on any iteration, whether reviewers agreed, and what was dismissed (with explanation).
- **Verdict integrity.** Per-task reviewers can meaningfully `--request-changes`; the final cross-cutting reviewer carries the only `--approve` that gates merge. The verdict surface is honest about severity rather than collapsed to `--comment`.
- **Substrate for subsequent iterations.** Every subsequent agentic-team-track iteration builds on this foundation: ADR-0008's reviewer-role registry treats PR-resident reviews as a given; ADR-0009's agentic-actor registry extends it to non-reviewer controller-voice actors; auto-merge, red-team, spec-quality, multi-model, respondent, per-role bot identities, relative-paths discipline, and reviewer routing all assume PR posts under bot identity as their operational surface.
- **Single shared bot identity at v1 simplifies token mgmt.** One App, one config file, one helper script. Adequate for v1 with three reviewer roles; the constraint surfaces later as the per-role-bot-identities trigger.
- **Workflow lives in `CLAUDE.md` + one helper script** — no scope creep into TypeScript code, slash commands, or new agent files. The convention-vs-code-vs-tooling boundary is preserved.

**Negative:**

- **GitHub UI noise.** ~21 review-comment events per typical iteration (10 tasks × 2 per-task reviewers + 1 final + followup re-reviews) as the post-decision steady state. PRs handle this volume gracefully but the conversation tab gets dense. Mitigation: review threads collapse; per-task headers make navigation tractable. Listed here under Negative consequences (post-decision steady-state observation), not in Context (pre-decision pain).
- **GitHub semantic gotcha — only `--approve` from the same identity clears that identity's prior `--request-changes`.** Validated empirically post-merge on PRs #1 + #2 (2026-05-14, two days after the decision shipped). The precise finding: `reviewDecision` does NOT use loose "latest-review-per-user" semantics — a subsequent `--comment` from the same identity does NOT clear an earlier `--request-changes`; only an `--approve` from the same identity clears it. Convenient for the v1 single-bot scheme (the final reviewer's `--approve` clears the gate via the same-identity rule) but **the convenience breaks under multi-bot expansion** (a second identity's un-dismissed `--request-changes` gates independently). The per-role-bot-identities iteration (2026-05-16) had to design dismissal semantics + a new merge gate (auto-merge workflow's Gate 3b) precisely because this v1 affordance disappeared. _(Post-decision knowledge — not known at 2026-05-12 decision time; this Negative bullet reflects retroactive validation.)_
- **App setup is a manual one-time step.** Create the App, generate the PEM, install on the repo, record App ID + installation ID, set the env var. Reproducible per-machine but not automatable. Acceptable for v1; not a scaling concern at single-user scale.
- **GitHub App's `--request-changes` semantics on user-authored PRs are not fully documented by GitHub.** Validated empirically post-merge on PRs #1 + #2 (2026-05-14). Fallback path documented in the spec (revise verdicts to use `--comment` with severity-in-header convention) was not needed.

**Neutral:**

- **gcscode is a public repo; reviewer comments are world-readable.** Standing professional-tone discipline applies. Not a new constraint; reframed as documented convention.
- **Spec/plan/ADR commits continue to land on master directly at decision time.** This is a constraint the decision deliberately keeps narrow; the red-team-reviewer iteration (2026-05-14) introduces spec-PR + ADR-PR workflow that brings specs and ADRs into the PR substrate too.

## Related

- **Source spec:** [`docs/specs/2026-05-12-reviews-as-artifacts.md`](../specs/2026-05-12-reviews-as-artifacts.md) — the iteration that shipped this decision; canonical implementation detail, prompt templates, PR-body template, App setup procedure.
- **Subsequent ADRs that build on this:**
  - [ADR-0008 (Reviewer-role registry)](ADR-0008-reviewer-role-registry.md) — formalized the registry pattern for reviewer roles assuming PR-resident reviews under bot identity. Now superseded by ADR-0009.
  - [ADR-0009 (Agentic-actor registry)](ADR-0009-agentic-actor-registry.md) — broadened the registry to all PR-posting actor classes (reviewer + respondent + future).
- **Subsequent iterations on the agentic-team track that depend on this decision** (ordered by spec filename date; intra-day ordering follows commit / spec-merge order where it surfaces, not strictly chronological by merge timestamp):
  - [`docs/specs/2026-05-14-auto-merge-on-user-approval.md`](../specs/2026-05-14-auto-merge-on-user-approval.md) — workflow auto-merges PRs when the user labels them, gated on bot-review signals.
  - [`docs/specs/2026-05-14-red-team-reviewer.md`](../specs/2026-05-14-red-team-reviewer.md) — introduces spec-PR + ADR-PR workflow + red-team reviewer role on those PRs.
  - [`docs/specs/2026-05-14-reviewer-role-design-conventions.md`](../specs/2026-05-14-reviewer-role-design-conventions.md) — codifies four patterns for future reviewer roles.
  - [`docs/specs/2026-05-14-spec-quality-reviewer.md`](../specs/2026-05-14-spec-quality-reviewer.md) — second reviewer role on spec/ADR PRs.
  - [`docs/specs/2026-05-16-effort-max-custom-reviewers.md`](../specs/2026-05-16-effort-max-custom-reviewers.md) — `.claude/agents/<name>.md` wrappers + `effort: max` for spec/ADR-PR reviewers.
  - [`docs/specs/2026-05-16-multi-model-red-team-v1.md`](../specs/2026-05-16-multi-model-red-team-v1.md) — independence-of-opinion experiment now that reviews are durable.
  - [`docs/specs/2026-05-16-review-discussion-loop-v1.md`](../specs/2026-05-16-review-discussion-loop-v1.md) — respondent bot identity (controller-voice on PRs).
  - [`docs/specs/2026-05-16-respondent-subagent-v2.md`](../specs/2026-05-16-respondent-subagent-v2.md) — respondent moves to subagent dispatch.
  - [`docs/specs/2026-05-16-per-role-bot-identities-for-reviewers.md`](../specs/2026-05-16-per-role-bot-identities-for-reviewers.md) — splits the single shared bot identity into 5 per-role identities; addresses the latest-review-per-user gotcha at multi-bot scale.
  - [`docs/specs/2026-05-17-auto-merge-bypasses-final-respondent-v2.md`](../specs/2026-05-17-auto-merge-bypasses-final-respondent-v2.md) — corrected reasoning + Gate 3b fix for auto-merge.
  - [`docs/specs/2026-05-17-relative-paths-in-reviewer-output.md`](../specs/2026-05-17-relative-paths-in-reviewer-output.md) — repo-relative-paths-only discipline for reviewer/respondent output.
  - [`docs/specs/2026-05-17-tripwire-condition-iii-compliance.md`](../specs/2026-05-17-tripwire-condition-iii-compliance.md) — refines the tripwire convention for reviewer-role design.
  - [`docs/specs/2026-05-17-robust-default-paths-in-token-helpers.md`](../specs/2026-05-17-robust-default-paths-in-token-helpers.md) — robustness for the token-helper scripts.
  - [`docs/specs/2026-05-17-reviewer-routing-and-domain-expert.md`](../specs/2026-05-17-reviewer-routing-and-domain-expert.md) — routing layer + Extension architect (first heuristic-routed reviewer role).
  - [`docs/specs/2026-05-25-v1-propagation-gap-audit.md`](../specs/2026-05-25-v1-propagation-gap-audit.md) — closes the propagation gap from review-discussion-loop-v1.
- **Origin / pre-decision context:** Earlier brainstorming via Claude cowork (Anthropic's chat product with local computer access) explored the broader vision (webhook routers, Linear integration, multi-model reviewers, override semantics). That transcript informed the scoping decisions in the source spec — what to defer, what to ship first. Transcript lives in the user's claude.ai chat history, not committed to the repo.

## Why this ADR is retroactive (housekeeping context)

The reviews-as-artifacts iteration shipped before the project had codified the convention that significant agentic-team architectural decisions get an ADR. ADR-0008 (the next iteration) was the first agentic-team-track ADR and treated reviews-as-artifacts' architectural commitments as already-in-place. The pattern of "spec carries the architectural rationale; ADR is added only for the next iteration" produced a hole in the ADR record: a load-bearing decision of the track (ADR-0008, ADR-0009, and 13 subsequent specs in Related cite it as the substrate they build on) has no dedicated ADR.

This ADR was queued on `docs/roadmap.md` as a Considering item ("Retroactive ADR for reviews-as-artifacts") and shipped as a housekeeping exercise: extract the rationale from the spec, distill it into ADR shape, link the long downstream chain of dependent iterations and ADRs. No architectural change; only the historical record changes.

**Going-forward convention.** Agentic-team iterations whose architectural commitments would be load-bearing for subsequent iterations should ship with their own ADR rather than relying on the spec to carry the rationale. **The trigger is judgment-based and inherently retrospective** — at iteration-start it's often hard to know whether a decision will be load-bearing two iterations later. The convention is to err on the side of dedicating an ADR when the decision (a) introduces a new actor class, identity scheme, or registry shape, OR (b) the spec's "Why not the bigger version" + Non-goals sections describe a multi-iteration arc the decision opens. When that judgment fails (an iteration ships without an ADR that turns out to be load-bearing in hindsight), the retroactive-ADR pattern this iteration establishes is the recovery mechanism.

**Audit-not-performed honesty.** The reviews-as-artifacts case is the only **known** instance of after-the-fact ADR debt on this track — but the audit that would distinguish "known" from "comprehensively-verified" was **not** scoped into this iteration. A systematic ADR-completeness audit (reading every agentic-team spec since 2026-05-12, evaluating whether each introduced a decision that meets the going-forward trigger above, surfacing any other after-the-fact ADR debt) is its own future iteration when triggered (e.g., during a `/housekeeping` pass). The claim is "no other instance has been surfaced," not "no other instance exists."
