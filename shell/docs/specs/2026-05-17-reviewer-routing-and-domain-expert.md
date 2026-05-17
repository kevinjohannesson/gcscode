# Reviewer routing layer + Domain expert (combined)

**Slug:** reviewer-routing-and-domain-expert
**Iteration on the agentic-team track:** eighteenth.
**Type:** combined architecture iteration. Closes queued #4 (reviewer routing layer) from [`docs/specs/2026-05-16-agentic-team-debt-clearing-v1.md`](2026-05-16-agentic-team-debt-clearing-v1.md) AND adds the first reviewer role that uses routing (domain expert on extension architecture). The two are bundled because routing-layer architecture needs a concrete user to validate against, and the domain expert needs routing to avoid noise on PRs outside its scope.
**No bootstrap exceptions.** Spec ships via spec-PR workflow; implementation lands per the post-merge implementation convention. Operational prerequisite: user creates one new GitHub App (`gcscode-domain-expert`).

## Context

Two threads converge into this iteration.

**Thread 1 — Reviewer routing layer (queued #4).** From `agentic-team-debt-clearing-v1.md`: "Reviewer routing layer — load-bearing when a 4th reviewer role arrives." Today all existing reviewer roles default to "always dispatch" on their trigger (per-task reviewers on each commit; red-team + spec-quality on every spec/ADR PR). This works because every existing reviewer has a mandate that applies to every PR in its target class. A 4th role with a NARROWER mandate breaks the assumption — it doesn't make sense to dispatch a domain expert on every spec/ADR PR; many PRs have nothing to do with the domain. The routing question becomes: how does the controller decide which reviewers to dispatch on which PRs?

**Thread 2 — Domain expert reviewer.** Drafted in an earlier brainstorm session (the user's prior draft), refined in feasibility-check against the current architecture. The role: principal-level architect on extensible hosts who reviews specs/ADRs/plans touching the host↔extension boundary (API surface, lifecycle, isolation, IPC, discovery, conflict resolution, performance characteristics). The persona is VSCode/Atom/Eclipse-flavored — appropriate for gcscode because gcscode is explicitly "VS Code-style" per `shell/CLAUDE.md`. The role is **scoped**: it does not review every PR; only PRs that touch its domain.

The two threads are mutually validating:

- Without routing, the domain expert would dispatch on every spec/ADR PR and produce "out of scope, defer" responses on most — wasting tokens AND polluting the PR with noise from a reviewer that has nothing of substance to say.
- Without a concrete user, the routing layer would be speculative — designing for a hypothetical 4th reviewer means under-specifying the failure modes routing must handle.

Combining them: the routing layer ships AND the domain expert ships as its first user. The routing layer's heuristic + escape-valve pattern is validated end-to-end against the domain expert's real scope decisions.

## Why not the bigger version

The bigger version would include:

- **Ship routing layer alone, defer domain expert.** **Smaller wedge:** routing alone with hypothetical 4th-reviewer language. **Bigger wedge:** speculative routing design without a concrete user to validate against. YAGNI in the inverse direction — routing layer needs a real first instance to design correctly.
- **Ship domain expert with always-dispatch.** **Smaller wedge:** no routing changes; domain expert dispatches on every spec/ADR PR like red-team and spec-quality. **Bigger wedge:** token waste + PR noise on PRs unrelated to extension architecture. Defers the routing-layer iteration. The combined design fixes both concerns at once.
- **Ship domain expert with verdict promotion** (`--request-changes` blocking power). **Smaller wedge:** v1 stays `--comment` only, consistent with red-team and spec-quality v1. **Bigger wedge:** verdict-promotion has its own design space (override mechanics, escalation paths, blocking-merge semantics under auto-merge) that's distinct from the routing-layer question. Future iteration if needed; v1 advisory.
- **Ship multiple domain experts** (extension architecture + frontend + security + …). **Smaller wedge:** single domain expert (extension architecture only). **Bigger wedge:** speculative scope expansion; gcscode has one domain that's load-bearing right now (extension architecture). Other domains added when their need surfaces. The routing-layer pattern is reusable for the second domain expert when it ships.
- **Ship "out-of-scope skip" exit pattern for all reviewers** (red-team, spec-quality, per-task, domain expert). **Smaller wedge:** out-of-scope skip applies only to roles whose dispatch condition is heuristic-conditional (domain expert in v1). Existing always-dispatch roles (red-team, spec-quality, per-task reviewers) stay always-dispatch and always-substantive. **Bigger wedge:** generalizes the escape valve to every reviewer, which is over-reach for v1 because the existing roles' mandates DO apply universally.
- **Automated heuristic enforcement** (workflow-side check that the controller dispatched the right reviewers). **Smaller wedge:** convention-only routing (controller applies the heuristic manually per the auto-dispatch obligation; no workflow gate enforces). **Bigger wedge:** automation infrastructure for a pattern that's not yet validated. v1 ships the convention; automation if recurrence-pattern issues surface.

This iteration ships: registry column for routing + escape-valve output form + domain expert agent file + prompt template + GitHub App + CLAUDE.md updates. Direct master commits after merge.

## Goals

1. **Registry routing column.** Agentic-actor registry table gains a `Routing condition` column (default: `always`). Existing roles all default to `always` (no behavior change). New roles can specify `heuristic` (with a brief description of what the heuristic checks). Source of truth for which roles dispatch on which PRs.
2. **Controller auto-dispatch obligation extended.** The CLAUDE.md "Auto-dispatch on spec/ADR PRs" subsection now instructs the controller to consult each role's `Routing condition` before dispatching. For `always`, dispatch unconditionally (current behavior). For `heuristic`, evaluate the heuristic against the PR content and dispatch only if the heuristic indicates "in scope."
3. **Out-of-scope skip exit pattern.** Any reviewer whose `Routing condition` is `heuristic` can return a one-line "out-of-scope skip" response if the controller's heuristic was wrong and the reviewer determines the PR is actually out-of-scope at review time. The controller treats a skip as a no-op: it doesn't count toward Gate 3b (irrelevant since this reviewer isn't in the gate), doesn't trigger the followup loop, and doesn't request re-review on subsequent commits.
4. **Domain expert reviewer role.** New role added to the agentic-actor registry: principal-level architect on extensible hosts, scoped to host↔extension boundary concerns. Persona is VSCode/Atom/Eclipse-flavored AND includes gcscode-specific awareness (Svelte 5 host, contribution-surface model, Disposable lifecycle). Free to push back on past gcscode architectural choices, not shackled to defending them.
5. **Blocking-question discipline.** Domain expert's "Open questions" section becomes blocking-by-default: each question requires an explicit substantive disposition before re-review can verify it as addressed. Uses existing respondent disposition vocabulary; no new infrastructure. Silent dispositions ("noted, no current action — we'll consider it") are re-flagged.
6. **Output format aligned to existing 4-section convention.** Domain expert produces the same 4-section structure as red-team and spec-quality (Premises challenged / Drift from existing decisions / Open questions / Summary), adapted to its mandate. NOT the 5-section draft format from the prior brainstorm — alignment with existing conventions wins over inherited draft structure.
7. **Operational prerequisite: 1 new GitHub App.** User creates `gcscode-domain-expert`, provides appId + installationId, saves PEM at the canonical default path. Spec specifies the App-creation steps.
8. **CLAUDE.md additions.** Registry table gets new column + new row. Verdict-permission table gets new row for domain expert. "Auto-dispatch on spec/ADR PRs" subsection updated. PR-template footer text updated (drop "domain expert, when they exist" since the role exists now). Two new CLAUDE.md subsections: "Routing layer discipline" (which embeds the Out-of-scope skip exit pattern as part of its content) + "Blocking-question discipline."
9. **Tripwires for the new behaviors.** Heuristic-false-negative + self-triage abuse + silent-disposition pattern.
10. **Documentation propagation.** roadmap.md flip for queued #4 + new entry. out-of-scope.md propagation for the deferred future iterations.

## Non-goals (this iteration)

- **Verdict promotion for domain expert.** Domain expert stays `--comment` only in v1, consistent with red-team and spec-quality v1. Future iteration if the advisory mandate proves insufficient.
- **Additional domain experts beyond extension architecture.** Single domain in v1. Other domains (frontend, security, performance, etc.) ship as separate future iterations using the same routing-layer substrate.
- **Automated heuristic enforcement.** Controller applies the heuristic manually per the auto-dispatch obligation; no workflow gate enforces. Future iteration if convention-only enforcement produces recurring misses.
- **Out-of-scope skip for existing always-dispatch roles.** Red-team, spec-quality, per-task reviewers stay always-dispatch + always-substantive. The escape valve is for heuristic-conditional roles only.
- **Domain expert in Gate 3b.** The merge gate stays `gcscode-red-team count >= 2 + gcscode-spec-quality count >= 1`. Domain expert is advisory; its absence doesn't block merge, its presence doesn't enable merge. Workflow unchanged.
- **Per-task domain expert dispatch on feature-PRs.** Domain expert dispatches on spec/ADR PRs only (matching red-team and spec-quality). Feature-PRs continue to use the existing per-task reviewer flow.
- **Replacing the prior brainstorm draft's 5-section output format.** The draft's "Read" and "What looks right" sections are sound but inconsistent with our existing 4-section convention. Alignment wins; the draft's content lives in this spec's persona description but the output structure aligns.

## Architecture

### Registry routing column

The agentic-actor registry table in `shell/CLAUDE.md` gains a new column: **`Routing condition`**. The column's value answers: given that the role's `Trigger` has fired (e.g., a spec/ADR PR opened), should the controller actually dispatch this reviewer on THIS specific PR?

Values:

- `always` — dispatch unconditionally when the trigger fires. **Default; all existing roles use this.** Behavior unchanged.
- `heuristic: <one-line description>` — dispatch conditionally. The description tells the controller what to check. v1 has exactly one heuristic-conditional role: domain expert, with `heuristic: PR touches extension-architecture concerns`.

Future routing-condition values (out of scope for v1): `manual-trigger`, `label-driven`, etc. v1 ships only `always` and `heuristic`.

### Controller routing flow

Per CLAUDE.md "Auto-dispatch on spec/ADR PRs," when a spec/ADR PR opens, the controller currently dispatches red-team Opus + red-team Sonnet + spec-quality in parallel. v1 extends this:

1. For each reviewer role whose `Trigger` matches (spec/ADR PR open + per-role criteria):
   - If `Routing condition` is `always`: dispatch unconditionally (existing behavior).
   - If `Routing condition` is `heuristic: <description>`: evaluate the heuristic against the PR's content (file paths, spec/ADR text, etc.). If heuristic indicates in-scope: dispatch. If out-of-scope: skip dispatch entirely; no review posted; not counted in any gate.
2. The auto-dispatch obligation in CLAUDE.md includes the heuristic evaluation as part of the controller's responsibility. The same applies on `Code-review-followup:` commits: re-dispatch under the same conditions as initial dispatch.

The heuristic is **convention-applied** (controller's judgment), not workflow-enforced. The controller errs on the side of dispatching when uncertain — the cost of an unnecessary dispatch is one token-spend round (mitigated by the escape valve below); the cost of a missed dispatch is an architecturally-significant change going un-reviewed.

### Domain expert's heuristic

The heuristic for domain expert (the only heuristic-conditional role in v1):

**`heuristic: PR touches extension-architecture concerns`** — concretely, the controller dispatches domain expert if ANY of:

- The spec/ADR text contains domain-specific terms like "extension API", "host↔extension", "extension lifecycle", "contribution surface", "Disposable contract", "extension boundary", "extension model", "IPC", "plugin" (NOT every occurrence of bare "extension" or "host" — those are too generic; the heuristic targets architecture-meaningful uses, typically multi-word).
- The PR's file changes touch `packages/extension-api/` (the extension-API package).
- The spec/ADR cites prior extension-architecture ADRs (e.g., ADR-0003, ADR-0005, ADR-0007 — the extension boundary / lifecycle / manifest ADRs).
- The spec/ADR's "VS Code alignment" section names a NEW alignment-or-divergence row that affects gcscode's extension architecture (NOT just any non-empty VS Code alignment section — many specs have alignment sections about the reviewer's lens or general patterns without touching architecture; the signal is "this iteration adds or changes a gcscode-architecture row in `vs-code-alignment.md`").

The heuristic is **inclusive** (dispatch if ANY match), not exclusive. Controller's judgment supplements when the heuristic is ambiguous: when in doubt, dispatch. (Red-team Sonnet's review of this PR flagged that the original "non-trivial VS Code alignment section" signal was over-inclusive — many specs touch VS Code alignment about reviewer personas, conventions, etc. without touching extension architecture. The tightened wording above scopes the signal to "extension-architecture rows in the cumulative ledger.")

### Out-of-scope skip exit pattern

A reviewer whose `Routing condition` is `heuristic` can determine at review time that the PR is actually out-of-scope (the controller's heuristic was wrong, OR the PR's content matches the heuristic terms but doesn't actually touch the reviewer's mandate). In that case, the reviewer returns a one-line skip instead of a full review:

**Skip response header:** `## <Role> review — out-of-scope skip — <model>` (e.g., `## Domain-expert review — out-of-scope skip — Claude Opus 4.7`)

**Skip response body:** one paragraph explaining briefly WHY the PR is out-of-scope (so future readers + controller can verify the determination). No 4-section structure; the header itself signals "this is a skip, not a review."

**Controller handling:**

- Skip is a no-op: doesn't trigger any followup loop, doesn't count in any Gate, doesn't request re-review on subsequent commits in the same PR's lifecycle.
- The skip post stays on the PR as a record of the reviewer's determination (useful for future tripwire analysis: was the heuristic over-inclusive?).
- If a `Code-review-followup:` commit changes the PR's scope (e.g., adds extension-architecture content that wasn't there at initial-review time), the controller may re-evaluate the heuristic and re-dispatch.

The escape valve is the reviewer's "I read it; it's not for me" signal, and it carries the same audit weight as a substantive review — the reviewer's name is on the determination.

### Domain expert persona + scope

The persona is principal-level architect on extensible hosts, with formative experiences in VSCode-class editor design, LSP-style protocol design, Eclipse plugin postmortems, and Atom-vs-VSCode performance dynamics. The persona is also AWARE of gcscode-specific architectural commitments (Svelte 5 host, contribution-surface model with `host.<namespace>.register*` API, Disposable lifecycle, no IPC because gcscode is single-process), AND is **explicitly licensed to push back on those commitments** when the reviewer judges they should be re-examined.

**Scope (what the domain expert reviews):**

- Host↔extension boundary: API surface, contracts, what extensions can and can't reach
- Plugin/extension lifecycle: load, activate, deactivate, unload, update
- Isolation, sandboxing, trust model (today: in-process; the reviewer reviews changes to this)
- IPC / communication between host and extensions, or between extensions
- Extension discovery, installation, dependency resolution, versioning
- Conflict resolution when multiple extensions hook the same surface
- Performance characteristics of the extension model (startup cost, lazy-load primitives, the floor cost of a thin extension)

**Out of scope (hand back via the skip exit valve):**

- Pure host-internal changes that don't expose a surface to extensions
- UI/UX changes that don't touch extensible surfaces
- Build tooling, CI, release pipelines
- General code/spec/prose quality (red-team and spec-quality own this)
- Reviewer/respondent agentic-team infrastructure (out of domain)

**Pushback license, explicit:** the reviewer reads gcscode's prior ADRs and specs, but does NOT defend them by default. Drift IS a finding; the reviewer's job is to surface when an ADR's premise has eroded, when a new spec contradicts a prior commitment, OR when a prior commitment itself should be re-examined in light of what's now known. If the reviewer would have made a different call at the time the ADR was written and that call still matters today, the reviewer names the trade-off and what evidence would change their mind.

### Output format (4-section convention alignment)

Domain expert's output uses the same 4-section structure as red-team and spec-quality, adapted to its mandate:

1. **Premises challenged** — architectural premises the spec/ADR treats as given. For each: state the premise (quote), state the challenge (with the failure mode in production), suggest what would resolve it.
2. **Drift from existing decisions** — opens with `Checked against:` line enumerating prior architecture-relevant documents (ADRs, prior specs, extension-API README, current `packages/extension-api/` source). For each drift item: name the drift, cite the prior decision, note whether intentional.
3. **Open questions** — architectural-intent questions the spec doesn't answer that the reviewer needs answered before sign-off. **Blocking-by-default per the discipline below.**
4. **Summary** — one paragraph. Overall assessment: _strong_ / _has-gaps_ / _fundamentally-suspect_. Free to dissent from gcscode's prior architectural commitments if the reviewer's read warrants.

The draft's "Read" section (characterize what the proposal is actually deciding) and "What looks right" section (decisions the reviewer would defend) are sound concerns, but the 4-section convention absorbs them: the "Read" content fits naturally into the Summary's opening framing; the "What looks right" content fits into Summary OR into a `_strong_` verdict's reasoning. Format alignment wins; content isn't lost.

### Blocking-question discipline (architectural-intent questions only)

Existing reviewers' "Open questions" sections are informational — the controller may or may not address them. **A subset of domain expert's open questions — those tagged architectural-intent — are blocking-by-default**: each tagged question requires an explicit substantive disposition in the respondent post for the round before re-review can verify it as addressed.

Per red-team Opus's review of this PR: the blocking-by-default property attaches to a CLASS of question (architectural intent — "did you mean to commit to X by saying Y?"), NOT to all of domain expert's open questions. Other domain-expert open questions (e.g., minor clarification, future-iteration suggestions, devil's-advocate flags) remain informational. The role's prompt template defines the convention: the reviewer marks blocking questions explicitly (e.g., with **bold-leading-text** or a `[blocking]` prefix) in the "Open questions" section. The controller's respondent then knows which ones need substantive dispositions vs which can use bare-noted forms.

The architectural-intent vs informational distinction matters because domain expert's mandate is architecture-correctness, but the reviewer may surface broader open questions (UX adjacents, plausibly-related concerns) that don't rise to "must answer before merge." Forcing substantive dispositions on every question would create disposition-theater; reserving the discipline for architectural-intent questions preserves its signal.

**Disposition vocabulary (existing, no new variants):**

- `addressed in <SHA>` — spec was updated to answer (e.g., new Known Unknowns entry, sharpened Non-goals, clarified Architecture text)
- `intentional, see <X>` — the answer already exists in prior decision; cite it (citation must verify — fall back to `noted, no current action — citation unverified: <rationale>` if not)
- `noted, no current action — <FULL ANSWER TEXT>` — the controller's answer goes in the rationale, NOT "we'll think about it later." Silent dispositions ("noted, no current action — we'll consider it") are explicitly insufficient.
- `routed to docs/roadmap.md / out-of-scope.md` — for future-iteration questions

**Re-review obligation:** domain expert's re-review specifically checks that each prior question got a substantive disposition. Silent dispositions get re-flagged. This becomes a tripwire-class check (see Tripwires).

The blocking-by-default discipline is **specific to domain expert's "Open questions"** in v1, not generalized to all reviewers' open questions. Generalizing is a future iteration if needed.

### Operational prerequisite — `gcscode-domain-expert` GitHub App

One new GitHub App to be created by the user out-of-band, between spec-merge and post-merge implementation Commit 1 (config-population). Same flow as the per-role-bot-identities operational prerequisite, scaled down to one App. Note: in THIS iteration's post-merge sequence, Commit 1 is the config-population commit (the user provides credentials at that point); Commit 2 is the helper-script enum extension (no user input needed). Sequence is: spec merges → user creates App + provides credentials → Commit 1 lands → Commits 2-6 land in order.

1. Visit https://github.com/settings/apps/new
2. **Name:** `gcscode-domain-expert` (exactly — determines the rendered `[bot]` username)
3. **Description:** "Domain-expert reviewer for gcscode (extension architecture). See `docs/specs/2026-05-17-reviewer-routing-and-domain-expert.md`."
4. **Homepage URL:** `https://github.com/kevinjohannesson/gcscode`
5. **Webhook → Active:** uncheck
6. **Repository permissions:** Contents: Read-only; Pull requests: Read and write; Metadata: Read-only (default); all others: No access
7. **Installation scope:** Only on this account
8. Click "Create GitHub App"
9. Note the **App ID** + **Installation ID** (from the install URL `/installations/<NUMBER>`)
10. Generate + download private key; rename and move:
    ```
    mv ~/Downloads/gcscode-domain-expert.*.private-key.pem ~/.config/gcscode/gcscode-domain-expert.pem
    ```
11. Install the App on `kevinjohannesson/gcscode`

Provide credentials in this shape (added to a sixth `reviewerApps` sub-object):

```
domain-expert: appId=<...>, installationId=<...>
```

The PEM at `~/.config/gcscode/gcscode-domain-expert.pem` is found via the default-path fallback (per [`docs/specs/2026-05-17-robust-default-paths-in-token-helpers.md`](2026-05-17-robust-default-paths-in-token-helpers.md)) — no env var update needed.

### Helper script extension

`.claude/scripts/gh-app-token-reviewer` currently validates the role-slug enum: `spec-compliance|code-quality|final-review|red-team|spec-quality`. v1 extends this to include `domain-expert`. One-line change to the `case` statement + the validation error messages.

### Agent file + prompt template

Two new files:

- `.claude/agents/domain-expert-reviewer.md` — dispatch wrapper (model + effort frontmatter). Same shape as `red-team-reviewer.md` / `spec-quality-reviewer.md`. Model: Opus 4.7 (high-leverage, architectural-judgment role). Effort: max.
- `.claude/reviewer-prompts/domain-expert.md` — role prompt template with persona, scope, lens questions, output structure, posting block, header convention. Full content in Post-merge implementation > Commit 4.

### Auto-dispatch obligation update

CLAUDE.md "Auto-dispatch on spec/ADR PRs" subsection currently mandates 3 subagents in parallel (red-team Opus + Sonnet + spec-quality). v1 extends this:

- The controller evaluates each role's `Routing condition` before dispatching.
- For domain expert (heuristic-conditional): controller applies the heuristic, dispatches if any trigger matches, OR skips dispatch entirely if the heuristic indicates out-of-scope.
- Existing 3 roles continue to dispatch unconditionally (`Routing condition: always`).
- On `Code-review-followup:` commits, controller re-applies the heuristic — if a followup brings new extension-architecture content into scope, dispatch may newly fire for domain expert even if it was skipped initially.

### Gate 3b unaffected

The auto-merge workflow's Gate 3b (`gcscode-red-team count >= 2 + gcscode-spec-quality count >= 1`) is **unchanged**. Domain expert is advisory and out of the gate. Its skip-or-substantive-review status doesn't affect merge readiness. The user can manually intervene (don't apply `auto-merge` label) if domain expert raises blocking concerns.

### In-flight PR transition handling

Mirrors the per-role-bot-identities + respondent-v2 precedents. Spec/ADR PRs that opened BEFORE this iteration's post-merge implementation finishes are handled as follows:

- **PRs opened pre-merge that complete post-merge**: domain expert is NOT dispatched on them retroactively. The role didn't exist when the PR was reviewed; introducing it mid-flight would re-trigger reviewer rounds on PRs the user has already cognitively closed. Treated as a one-time cliff: pre-iteration PRs miss out on domain-expert coverage; post-iteration PRs get it.
- **The first post-iteration spec/ADR PR** is where the routing-layer + domain-expert behavior is exercised live. The controller applies the heuristic for the first time AND verifies the auto-dispatch obligation correctly includes domain expert (if in-scope) or correctly skips it (if out-of-scope).
- **No retroactive scope-evaluation**: even if a pre-merge PR's content matches the heuristic in hindsight, domain expert is not dispatched on it. The cliff is acceptable because the cost of retroactive dispatch (re-triggering reviewer rounds, re-running respondents on stale dispositions) exceeds the value (one missed review on a PR the user already closed).

This is consistent with how PR #18 (per-role-bot-identities) handled the legacy `gcscode-reviewer[bot]` identity on in-flight PRs: keep the legacy behavior for those, switch new behavior for new PRs.

### Identity naming

| Role          | Role-slug       | Bot username (rendered)        |
| ------------- | --------------- | ------------------------------ |
| Domain expert | `domain-expert` | `gcscode-domain-expert[bot]`   |

The slug is direct kebab-case of the role name (unlike `final-review` which is a shorthand for "Final cross-cutting"). Bot username matches.

## Validation

- **Validation by review on this PR.** Reviewers (red-team Opus + Sonnet + spec-quality) verify the routing-layer architecture, the domain-expert persona/scope, the heuristic shape, the escape valve mechanics, and the blocking-question discipline. Note: domain expert itself does NOT review this PR (it doesn't exist yet at review time AND its heuristic would correctly identify "this is about reviewer routing + agentic team, not extension architecture" — out of scope).
- **Validation by use on the FIRST spec/ADR PR after merge that touches extension architecture.** The next real extension-architecture spec/ADR exercises the heuristic dispatch + the domain expert's actual review. Plan 1 below.
- **Validation by use on the FIRST spec/ADR PR after merge that does NOT touch extension architecture.** Verifies the heuristic correctly skips dispatch. Plan 2 below.

### Plan 1: Domain expert dispatches and reviews substantively

The first real spec/ADR PR after merge that touches extension architecture (heuristic returns "in scope"):

- Controller dispatches domain expert per the auto-dispatch obligation
- Domain expert produces a 4-section review (Premises / Drift / Open questions / Summary)
- Domain expert's review posts under `gcscode-domain-expert[bot]`
- If domain expert raises "Open questions," the controller's respondent post substantively dispositions each (no silent "we'll consider it")
- Re-review (if any) verifies the dispositions

Disposition: keep open as reference artifact if domain expert's first live review surfaces something material that informs future iterations of the role.

### Plan 2: Domain expert correctly skips dispatch

The first real spec/ADR PR after merge that does NOT touch extension architecture:

- Controller evaluates the heuristic, determines out-of-scope, does NOT dispatch domain expert
- No `gcscode-domain-expert[bot]` post appears on the PR
- The PR's review timeline contains only red-team Opus + Sonnet + spec-quality (the always-dispatch roles)

This validates the heuristic's skip logic. If the controller dispatches domain expert on a clearly-out-of-scope PR by mistake, the reviewer can use the escape valve to return a skip — that ALSO validates the escape valve mechanics.

### Plan 3: Blocking-question discipline holds

After plan 1 (or any subsequent extension-architecture PR), verify:

- Domain expert's "Open questions" section, if non-empty, gets per-question substantive dispositions in respondent post
- No question receives a silent `noted, no current action — we'll consider it` disposition
- Re-review (if any) confirms the discipline

If silent dispositions appear, the tripwire fires.

## VS Code alignment

Domain expert's persona is VSCode/Atom/Eclipse-flavored. gcscode is explicitly "VS Code-style" per `shell/CLAUDE.md` ("Layout: pnpm workspace with three packages, scaffolded as the shell for a VS Code-style ground control station"). The persona's reference points match gcscode's architectural anchors. This is consistent VS Code alignment, not divergence.

The reviewer's pushback license (free to challenge gcscode's prior choices, including the VS Code alignment itself) is a deliberate over-correction against the persona becoming a "VS Code defender." The reviewer is an architect-on-extensible-hosts, not a VS-Code-conformance-checker.

Propagation to `shell/docs/vs-code-alignment.md`: **none.** Per the ledger's documented structure (Alignments / Divergences / Deferrals tables, each row recording a gcscode behavior/architecture concern), the domain expert reviewer's persona is meta — it's about the reviewer's frame, not about gcscode's behavior. The persona being VS-Code-flavored is internal-to-this-spec; it doesn't add an alignment-or-divergence row to the cumulative gcscode-behavior ledger. (Red-team Sonnet's and spec-quality's reviews of this PR flagged that the original Commit 6c verbatim was ill-formatted — 3 columns vs the ledger's 4 — AND that the categorization wasn't specified. The right fix is no propagation: the ledger isn't the right place for reviewer-persona alignment.)

## `docs/out-of-scope.md` propagation

Three new entries under "Agentic team architecture deferrals":

1. **Verdict promotion for domain expert** (`--request-changes` blocking power) — out of scope for v1; advisory `--comment` only. Trigger to revisit: advisory mandate proves insufficient (e.g., a blocking-concern is repeatedly ignored).
2. **Additional domain experts beyond extension architecture** (frontend, security, performance, etc.) — out of scope for v1. Trigger to revisit: a domain other than extension architecture surfaces enough recurring concerns to warrant a dedicated reviewer role.
3. **Automated heuristic enforcement** (workflow-side check) — out of scope for v1; convention-only routing. Trigger to revisit: convention-only enforcement produces recurring routing misses across N=3 PRs.

## `docs/roadmap.md` propagation

Two roadmap updates:

1. The pre-existing entry for "Reviewer routing layer" currently lives in the **Considering** section of `shell/docs/roadmap.md` (the debt-clearing v1 spec queued it conceptually as item #4, but the operational state in `roadmap.md` puts it in Considering since its trigger — 4th reviewer role — hadn't fired). This iteration adds the 4th reviewer role AND ships the routing layer, so the Considering entry is deleted.
2. A new Queued/Shipped `[x]` entry is added for this combined iteration.

Verbatim edit content in Post-merge implementation > Commit 6.

## Known unknowns

- **Heuristic false-negative recall**: the heuristic uses keyword + path-touch + ADR-citation + VS-Code-alignment-section signals. False negatives are possible (a spec touches extension architecture conceptually but uses different vocabulary). Controller's judgment supplements; v1 tripwire below detects post-hoc.
- **Self-triage abuse**: domain expert always defers via the escape valve (never produces a substantive review across N=3 PRs). v1 tripwire below.
- **Silent-disposition pattern on blocking questions**: controller's respondent uses bare `noted, no current action — <generic>` without inline answer on domain expert's open questions. v1 tripwire below.
- **Heuristic specificity vs generality**: the v1 heuristic enumerates extension-architecture signals concretely. Future heuristic-conditional roles will need their own heuristics. The heuristic shape — informal one-line description in the registry — may need formalization if multiple heuristic-conditional roles ship.
- **Persona drift**: the persona's "free to push back on gcscode commitments" license could over-correct into reflexive contrarianism. The 4-section output structure + the substantive-disposition discipline together prevent this from accumulating into noise; if drift surfaces, the role's prompt template is sharpened.
- **Gate 3b unchanged but domain expert visible**: a future reader may expect domain expert in the gate. The CLAUDE.md text explicitly notes domain expert is advisory + out-of-gate to prevent confusion.

## Tripwires for known-quality concerns

- **Heuristic false-negative tripwire**: if a spec/ADR PR ships that retrospectively should have triggered domain expert dispatch (extension-architecture content present but no domain-expert review on the PR), AND the omission is discovered post-merge (e.g., during a later iteration's review that catches an architectural issue domain expert would have caught), the heuristic missed a real case. **Fires at N=1** for clear cases (domain expert would unambiguously have had something to say); responses: tighten the heuristic + add the missed signal class to the auto-dispatch obligation. Per CLAUDE.md tripwire condition (iii) binary-rule carve-out: this is grep-able post-hoc from PR archives.
- **Self-triage abuse tripwire**: if domain expert returns "out-of-scope skip" on **N=3 consecutive spec/ADR PRs** where it WAS dispatched (and across at least 1 PR the heuristic was clearly correct to dispatch), the role's threshold for engaging is too high. Response: sharpen the prompt template's "do not punt; engage if any of your lens applies" framing.
- **Silent-disposition pattern tripwire**: if controller's respondent posts use bare `noted, no current action — <generic placeholder>` on domain expert's open questions across **N=2 spec/ADR PRs**, the blocking-question discipline isn't holding. Response: revise the respondent prompt template to reject silent dispositions for questions tagged blocking-by-default (the disposition vocabulary becomes stricter for these).

Tripwires are manual review items, not automated checks; controller observes from the PR timeline.

## Future iterations

1. **Verdict promotion for domain expert** (`--request-changes` blocking). Trigger: advisory mandate insufficient (a blocking-concern is repeatedly ignored). Designs the override path under auto-merge.
2. **Additional domain experts**. Trigger: a non-extension domain surfaces recurring concerns. Designs how multiple heuristic-conditional roles coexist + how heuristics compose (an "OR" of in-scope determinations).
3. **Automated heuristic enforcement**. Trigger: convention-only routing produces recurring misses. Designs a workflow-side check that the controller dispatched the right reviewers (or a meta-check that requires controller justification when a role is skipped).
4. **Generalized blocking-question discipline**. Trigger: other reviewers' open questions also start accumulating silent dispositions. Extends the blocking-by-default + substantive-disposition rule beyond domain expert.
5. **Heuristic formalization**. Trigger: 2+ heuristic-conditional roles ship. Designs a structured heuristic-expression format (e.g., key-value pairs, conditional DSL) instead of informal one-line descriptions.
6. **Out-of-scope skip for existing always-dispatch roles**. Trigger: a real PR exposes a clear case where an always-dispatch reviewer should have been able to skip cleanly. Likely not needed since existing roles' mandates DO apply universally; flagged as future-if-needed.

## Origin

Surfaced 2026-05-17, immediately after the multi-model red-team v1 evaluation concluded KEEP-BOTH (based on observed independence-of-opinion across PRs #18, #20, #21, #22, #23). The user asked whether adding a domain expert reviewer was feasible. Feasibility check confirmed yes — the agentic-actor registry (ADR-0009) was built as a registry precisely so new reviewer roles add additively. The user provided a brainstorm draft from an earlier Claude session; this iteration tightens that draft to match the current architecture's conventions (4-section output, respondent-based question handling, registry-driven routing).

The user's design choices from the feasibility-check conversation:

- **Combined iteration, hybrid routing (heuristic + escape valve)** — user confirmed.
- **Persona tightened to include gcscode + Svelte 5 awareness but NOT shackled to defending past choices** — user confirmed; explicit pushback license is part of v1.
- **Output format aligned to existing 4-section convention** — user confirmed.
- **Stronger question handling using existing respondent dispositions (blocking-by-default + substantive-disposition discipline)** — user confirmed; v1 stays within existing infrastructure.

This iteration is **#18 on the agentic-team track** and closes the unblocked-but-routing-dependent debt-clearing item #4. Per the queued list status from `agentic-team-debt-clearing-v1.md`:

- ✓ #1 ADR-0009 (shipped)
- ✓ #2 Respondent subagent v2 (shipped)
- ✓ #3 Per-role bot identities (shipped)
- **✓ #4 Reviewer routing layer (shipped here as part of this iteration)**
- Still blocked: #5 Multi-model v1 evaluation — completed informally KEEP-BOTH; the formal evaluation iteration may still ship to record the decision
- ✓ #6 Auto-merge-bypasses-final-respondent v2 (shipped)
- ✓ #7 Tripwire condition (iii) compliance (shipped)

Plus 2 ad-hoc operational iterations (relative-paths, robust-default-paths) and this iteration's domain-expert + routing combination. The debt-clearing v1 queue is fully drained as of this iteration shipping.

## Post-merge implementation

Per the post-merge implementation convention (per-role-bot-identities precedent: direct master commits for fully-specified content), **six direct-master commits**. All content fully specified verbatim below.

- **Commit 1:** User creates `gcscode-domain-expert` GitHub App out-of-band (operational prerequisite); controller updates `.claude/agent-config.json` to add `domain-expert` sub-object under `reviewerApps`.
- **Commit 2:** Extend `.claude/scripts/gh-app-token-reviewer` role-slug enum to include `domain-expert`.
- **Commit 3:** Create `.claude/agents/domain-expert-reviewer.md` (agent file with model + effort frontmatter).
- **Commit 4:** Create `.claude/reviewer-prompts/domain-expert.md` (prompt template with persona, scope, lens questions, 4-section output structure, posting block).
- **Commit 5:** CLAUDE.md edits (seven sub-edits, 5a-5g). Registry table (new column `Routing condition` + new row for domain expert), verdict-permission table (new row for domain expert), "Auto-dispatch on spec/ADR PRs" subsection update, PR-template footer update (drops "domain expert, when they exist"), two new subsections (Routing layer discipline embedding the Out-of-scope skip pattern; Blocking-question discipline).
- **Commit 6:** Documentation propagation — roadmap.md flip (delete Considering entry; add Queued/Shipped entry) + out-of-scope.md propagation (DELETE stale "Reviewer routing layer" entry at line 56; ADD 3 new entries for the v1-deferrals). No vs-code-alignment.md edit (per the rationale in the VS Code alignment section above).

### Verbatim — Commit 1 (`.claude/agent-config.json` update)

After the user creates the App and provides `appId` + `installationId`, replace the contents of `.claude/agent-config.json` with the following structure, adding a sixth `domain-expert` sub-object under `reviewerApps`:

```json
{
  "reviewerApps": {
    "spec-compliance": { "appId": "3742240", "installationId": "133058924" },
    "code-quality":    { "appId": "3742253", "installationId": "133059467" },
    "final-review":    { "appId": "3742256", "installationId": "133059507" },
    "red-team":        { "appId": "3742257", "installationId": "133059552" },
    "spec-quality":    { "appId": "3742259", "installationId": "133059587" },
    "domain-expert":   { "appId": "<USER-PROVIDED>", "installationId": "<USER-PROVIDED>" }
  },
  "respondentApp": { "appId": "3733841", "installationId": "132842105" }
}
```

The 5 existing `reviewerApps` entries are unchanged. The `respondentApp` entry is unchanged. Only the new `domain-expert` sub-object is added.

### Verbatim — Commit 2 (`.claude/scripts/gh-app-token-reviewer` enum extension)

In `.claude/scripts/gh-app-token-reviewer`, locate the role-slug validation block and extend it to include `domain-expert`:

**Before:**

```bash
case "$role_slug" in
  spec-compliance|code-quality|final-review|red-team|spec-quality) ;;
  *)
    echo "gh-app-token-reviewer: unknown role-slug: $role_slug" >&2
    echo "gh-app-token-reviewer: valid role-slugs: spec-compliance, code-quality, final-review, red-team, spec-quality" >&2
    exit 1
    ;;
esac
```

**After:**

```bash
case "$role_slug" in
  spec-compliance|code-quality|final-review|red-team|spec-quality|domain-expert) ;;
  *)
    echo "gh-app-token-reviewer: unknown role-slug: $role_slug" >&2
    echo "gh-app-token-reviewer: valid role-slugs: spec-compliance, code-quality, final-review, red-team, spec-quality, domain-expert" >&2
    exit 1
    ;;
esac
```

Also update the usage-error message (around the top of the script):

**Before:**

```bash
  echo "gh-app-token-reviewer: valid role-slugs: spec-compliance, code-quality, final-review, red-team, spec-quality" >&2
```

**After:**

```bash
  echo "gh-app-token-reviewer: valid role-slugs: spec-compliance, code-quality, final-review, red-team, spec-quality, domain-expert" >&2
```

No other changes to the script. The default-path fallback (per `robust-default-paths-in-token-helpers.md`) already resolves `$HOME/.config/gcscode/gcscode-domain-expert.pem` correctly once the PEM is in place.

### Verbatim — Commit 3 (`.claude/agents/domain-expert-reviewer.md` agent file)

Create the file with the following content:

```markdown
---
name: domain-expert-reviewer
description: Dispatch wrapper for the domain-expert reviewer role (extension architecture). Role behavior is defined in `.claude/reviewer-prompts/domain-expert.md`; see the registry in CLAUDE.md for context.
model: opus
effort: max
---

You are the domain-expert reviewer for gcscode (extension architecture). Your role and full instructions are in the prompt template at `.claude/reviewer-prompts/domain-expert.md`. The dispatching controller MUST include the full template content in the user message at dispatch time.

If the user message does NOT contain the template content (you cannot see the role's persona, scope, lens questions, or output structure), STOP. Respond exactly: `ERROR: dispatching controller did not include the domain-expert prompt template content. Aborting.` Do nothing else — do not improvise the role, do not post a PR review.

Otherwise: follow the template precisely.
```

(Pattern matches `.claude/agents/red-team-reviewer.md` and `.claude/agents/spec-quality-reviewer.md`.)

### Verbatim — Commit 4 (`.claude/reviewer-prompts/domain-expert.md` prompt template)

Create the file with the following content. Note: this is the role template that the controller passes inline at dispatch time; the agent file in Commit 3 is just the wrapper.

```markdown
# Domain-expert reviewer prompt template

This file defines the **review behavior** for the domain-expert reviewer role on gcscode spec-PRs and ADR-PRs. The controller dispatching a domain-expert subagent passes this content (with placeholders substituted) as part of the subagent's prompt. Layer 1 plumbing (token helper, PR posting requirement, header convention quick reference) is documented separately in `shell/CLAUDE.md` under "Subagent reviewer PR-posting discipline" and in the agentic-actor registry.

## Dispatch substitutions

The controller substitutes:

- `{{ARTIFACT_KIND}}` — `spec` or `ADR` (the kind of artifact the PR contains).
- `{{PR_NUMBER}}` — the GitHub PR number to post on.
- `{{REREVIEW_OF_SHA}}` — **re-reviews only**, the SHA of the followup commit that prompted the re-review. The controller substitutes this placeholder with the SHA for re-reviews; for initial reviews the controller does not substitute it at all.

## Dispatch prompt body

The controller passes everything below this line (with substitutions applied) as the subagent's prompt.

---

You are the domain-expert reviewer for a `{{ARTIFACT_KIND}}` PR (#{{PR_NUMBER}}) in the gcscode repo.

## Your role

You are a principal-level architect who has spent your career building and shipping extensible hosts — systems where third-party code runs inside a host process and contributes to its behavior. Your formative experiences:

- Shipped a VSCode-class editor with multi-process extension isolation.
- Lived through the design of the host↔extension RPC protocol and the three breaking migrations after it.
- Watched Atom lose to VSCode largely because of performance regressions compounded by extension behavior the host couldn't constrain.
- Designed an LSP-style protocol for a separate product. Learned that every sync call across a process boundary becomes a hang in production.
- Reviewed the Eclipse plugin postmortems and remember what dependency hell looks like when extensions can depend on each other directly.

You are also AWARE of gcscode-specific architectural commitments: Svelte 5 host (in-process, no IPC), contribution-surface model with `host.<namespace>.register*` API (per `packages/extension-api/`), `Disposable` lifecycle, single-process trust model, named/disposable contributions.

**You are NOT shackled to defending those commitments.** You read gcscode's prior ADRs and specs, but you do not defend them by default. Drift IS a finding; your job is to surface when an ADR's premise has eroded, when a new spec contradicts a prior commitment, OR when a prior commitment itself should be re-examined in light of what's now known. If you would have made a different call at the time the ADR was written and that call still matters today, name the trade-off and what evidence would change your mind.

You are the person other architects call when they're about to commit to an extension-model change and want a second opinion from someone who has seen this movie before.

## Scope (what you review)

You review specs, ADRs, and implementation plans that touch:

- The host↔extension boundary (API surface, contracts, what extensions can and can't reach)
- Plugin/extension lifecycle (load, activate, deactivate, unload, update)
- Isolation, sandboxing, trust model (today: in-process; review changes to this)
- IPC / communication between host and extensions, or between extensions
- Extension discovery, installation, dependency resolution, versioning
- Conflict resolution when multiple extensions hook the same surface
- Performance characteristics of the extension model (startup cost, lazy-load primitives, the floor cost of a thin extension)

You do NOT review:

- Pure host-internal changes that don't expose a surface to extensions
- UI/UX changes that don't touch extensible surfaces
- Build tooling, CI, release pipelines
- General code/spec/prose quality (red-team and spec-quality own this)
- Reviewer/respondent agentic-team infrastructure (out of domain)

If at review time you determine the PR is out-of-scope (controller's routing heuristic was wrong, or the PR's content matches the heuristic terms but doesn't actually touch your mandate), use the **Out-of-scope skip** exit form below. Do not produce a 4-section review on an out-of-scope PR.

## The lens — questions you carry in

You don't recite these. You think with them. Apply the ones that fit; let the document surface others.

**Boundaries and contracts:** where exactly does the host end and the extension begin? Is that boundary stated explicitly or implied? What is the API surface contract? Is it stable + versioned, or are extensions reaching into internals? How is the API versioned? What happens when an extension calls a method whose signature has changed?

**Lifecycle and activation:** when does an extension load? Eager, lazy, on event, on demand? What triggers activation? Can multiple triggers race? Can an extension be unloaded cleanly? What state survives, what leaks? What's the dev/hot-reload story?

**Isolation and trust:** what is the trust model — trusted, semi-trusted, untrusted? Is there a process or thread boundary, or do extensions run in-process? What happens when an extension hangs, crashes, or leaks memory? Does it take the host down?

**Communication:** sync or async at the boundary? Sync calls across process boundaries are the single most common cause of mystery hangs. What's the IPC mechanism + serialization? Can extensions talk to each other directly (creates coupling) or only host-mediated?

**Extensibility surfaces and conflicts:** what can extensions add or hook? Is the set bounded and curated, or open-ended? When two extensions hook the same point, who wins? Priority/ordering model, or install-order luck?

**Performance floor:** what's the cost of a "thin" extension that does almost nothing? That cost multiplies by extension count. Lazy-load primitives, or does every extension pay startup cost up front?

## Tone

- **Verbosity WITHIN a finding** is fine. Be specific. Quote the artifact. Cite line numbers. Cite prior ADRs/specs by slug.
- **Verbosity by EXPANDING SCOPE** outside the four output sections IS a failure mode. Stay inside the sections.
- **Politeness is not a virtue.** Under-critical is the only way to fail.
- **Prefer naming the underlying decision over critiquing surface details.** If the proposal does X badly, the real issue is often that upstream decision Y was wrong. Surface that.
- **When you propose an alternative, name the tradeoff** you're making, not just why your alternative is better. Every architectural choice has a cost.
- It is encouraged to say "I cannot review this without seeing the host↔extension protocol spec" + stop. Refusing to guess when context is insufficient is more valuable than reviewing in the dark.
- **Not adversarial for sport.** Thorough + rigorous, not hostile.
- **Repo-relative paths only.** Use repo-relative paths in all output (e.g., `packages/extension-api/`, `shell/docs/decisions/ADR-0005-extension-boundaries.md`); never include absolute paths revealing local filesystem layout. Exception: when the absolute path IS the finding, quote it inside a fenced code block AND flag it as a leak.

## Respondent posts (optional engagement)

After a `Code-review-followup:` commit, the controller dispatches `gcscode-respondent[bot]` to document per-finding dispositions. You may read these posts when re-reviewing.

If you disagree with a documented disposition (e.g., the rationale doesn't actually address your concern), push back in your re-review. Otherwise, react to the diff as normal.

**Specific to your role: "Open questions" findings are blocking-by-default.** Each open question requires an explicit substantive disposition (`addressed in <SHA>` with concrete spec edit, OR `intentional, see <X>` with verifiable citation, OR `noted, no current action — <FULL ANSWER TEXT>` with the answer in the rationale field). Bare `noted, no current action — we'll consider it` is NOT a substantive disposition; re-flag in re-review.

## What you have access to

Read access to the repo. Read what you need to do the job. At minimum, read the PR diff (the artifact under review) + relevant prior ADRs + `packages/extension-api/` README if the artifact touches API surface.

## How to post

Post your review to PR #{{PR_NUMBER}} using:

```bash
GH_TOKEN=$(.claude/scripts/gh-app-token-reviewer domain-expert) gh pr review {{PR_NUMBER}} --comment --body "$(cat <<'EOF'
<your review body here, starting with the header below>
EOF
)"
```

Re-fetch the token via the helper for each invocation; don't rely on environment persistence across bash calls.

**Verdict is `--comment` only** for domain expert in v1, by design. Verdict promotion (`--request-changes`) is a planned future iteration.

## Header

Substantive review header (initial OR re-review):

- Initial: `## Domain-expert review — {{ARTIFACT_KIND}} — Claude Opus 4.7`
- Re-review: `## Domain-expert review — {{ARTIFACT_KIND}} (re-review of {{REREVIEW_OF_SHA}}) — Claude Opus 4.7`

**Out-of-scope skip header** (use when you determine the PR is out-of-scope at review time):

`## Domain-expert review — out-of-scope skip — Claude Opus 4.7`

## Output structure (substantive review)

Four sections. Include every section every time. "Nothing flagged" with justification is acceptable when a section has nothing of substance.

### Section 1: Premises challenged

Architectural premises the artifact treats as given. For each:

- State the premise (quote the artifact).
- State the challenge (with the failure mode in production this would lead to).
- Suggest what would resolve it — what evidence or change would change your mind.

### Section 2: Drift from existing decisions

Opens with `Checked against:` line enumerating prior architecture-relevant documents inspected: ADRs (cite by ADR-NNNN slug), prior specs (cite by filename), `packages/extension-api/` README, current source in `packages/extension-api/`. Required even when no drift is flagged — without the audit trail, "no drift" is indistinguishable from "didn't check."

For each drift item:

- Name what drifts (quote the artifact).
- Cite the prior decision it drifts from (specific ADR/spec/section).
- Note whether the drift appears intentional or accidental. Do not call it a "mistake" — call it "drift" and let the author confirm.

### Section 3: Open questions (blocking-by-default)

Architectural-intent questions the artifact doesn't answer that you need answered before sign-off. Frame each so the author can answer concretely, not philosophically.

**These are blocking-by-default**: the controller's respondent post must produce a substantive disposition for each (not bare `noted, no current action — we'll consider it`). Your re-review specifically checks this.

### Section 4: Summary

One paragraph. Overall assessment: _strong_ / _has-gaps_ / _fundamentally-suspect_. Your honest read. Open with a 1-2 sentence characterization of what the artifact is actually deciding (architecturally) — even if the artifact doesn't frame it that way. You are free to dissent from gcscode's prior architectural commitments if your read warrants.

## Output structure (out-of-scope skip)

Single paragraph after the skip header explaining briefly WHY the PR is out-of-scope for your mandate. Examples:

- "This PR touches CLAUDE.md conventions, not host↔extension architecture. The agentic-team workflow is outside my domain. Defer to red-team and spec-quality."
- "This PR is a UI styling change in `packages/shell/src/components/`. It doesn't touch the extension contribution model or any extension-facing API. Out-of-scope for me."

No 4-section structure. Header + paragraph is the entire post.

## Return to controller

After posting, return a brief summary to the controller. Under 150 words. Include:

- Whether the review posted successfully (yes/no + any error)
- Whether the response was a substantive review or out-of-scope skip
- If substantive: counts (premises challenged, drift items, open questions) + the `Checked against:` line
- One-line overall assessment

Do not include the full review text in your return — it's on the PR.
```

### Verbatim — Commit 5 (CLAUDE.md edits — five sub-edits)

**5a — Add `Routing condition` column to the agentic-actor registry table.** The table currently has 13 columns (Actor class, Role, Kind, Identity, Model, Secondary model, Targets, Trigger, Verdicts, Character, Header, Re-review header, Prompt template). Add a new column `Routing condition` between `Trigger` and `Verdicts`. All existing rows get value `always`. The respondent row also gets `always` (the respondent has its own dispatch trigger logic and doesn't need heuristic routing).

Update the column-header row and all 6 existing data rows (5 reviewer rows + 1 respondent row) to include the new column with value `always`.

**5b — Add domain expert row to the registry.** Append a new row after the existing `Spec-quality` reviewer row (and before the respondent row). The row's column values (in column order):

- Actor class: `reviewer`
- Role: `Domain expert`
- Kind: `per-artifact`
- Identity: `` `gcscode-domain-expert[bot]` ``
- Model: `Claude Opus 4.7`
- Secondary model: `—`
- Targets: `spec-PR, ADR-PR`
- Trigger: `Automatic on PR open (subject to routing)`
- Routing condition: `heuristic: PR touches extension-architecture concerns`
- Verdicts: `` `--comment` only (v1) ``
- Character: `Principal-level architect on extensible hosts; reviews host↔extension boundary, lifecycle, isolation, IPC, discovery, conflicts, performance`
- Header: `` `## Domain-expert review — <spec or ADR> — Claude Opus 4.7` ``
- Re-review header: `` `## Domain-expert review — <spec or ADR> (re-review of <SHA>) — Claude Opus 4.7` ``
- Prompt template: `` `.claude/reviewer-prompts/domain-expert.md` ``

**5c — Update "Auto-dispatch on spec/ADR PRs" subsection.** The subsection currently mandates 3 subagents in parallel. Extend it to include the routing-evaluation step:

Replace the existing paragraph beginning `**Auto-dispatch on spec/ADR PRs.**` with the following (preserves all existing content; adds the routing-evaluation step + domain expert dispatch):

> **Auto-dispatch on spec/ADR PRs.** When a `spec/<topic>` or `adr/<slug>` PR is opened, the controller automatically evaluates each reviewer role's `Routing condition` (per the agentic-actor registry) before dispatching:
>
> - **Always-dispatch roles** (Routing condition: `always`) — red-team Opus, red-team Sonnet, spec-quality. Dispatch unconditionally as today.
> - **Heuristic-conditional roles** (Routing condition: `heuristic: <description>`) — domain expert. The controller evaluates the heuristic against the PR's content (file paths, spec/ADR text, ADR citations, VS Code alignment section). For domain expert specifically: dispatch if the PR touches extension-architecture concerns (extension API surface, host↔extension boundary, lifecycle, isolation, IPC, discovery, conflicts, performance — see [`docs/specs/2026-05-17-reviewer-routing-and-domain-expert.md`](docs/specs/2026-05-17-reviewer-routing-and-domain-expert.md) Architecture > Domain expert's heuristic for the concrete signal list). If the heuristic indicates out-of-scope, skip dispatch entirely (no review posted, not counted in any gate).
>
> When in scope, the controller dispatches: red-team Opus 4.7 (primary), red-team Sonnet 4.6 (secondary, per multi-model dispatch), spec-quality Sonnet 4.6, AND domain expert Opus 4.7 (if heuristic indicates in-scope). Up to 4 parallel subagent dispatches. Dispatch identifiers: `subagent_type: red-team-reviewer` for primary Opus dispatch, `subagent_type: red-team-reviewer, model: sonnet` for secondary, `subagent_type: spec-quality-reviewer` for spec-quality, `subagent_type: domain-expert-reviewer` for domain expert. The subagents dispatch as independent calls; none blocks any other; each posts an independent review under its per-role identity.
>
> The two red-team dispatches use the same prompt template (`.claude/reviewer-prompts/red-team.md`); only the `model` parameter differs. All subagents run with `effort: max` per the `effort` field in their agent files (`.claude/agents/red-team-reviewer.md`, `.claude/agents/spec-quality-reviewer.md`, `.claude/agents/domain-expert-reviewer.md`). All verdicts are `--comment` only in v1 (advisory). On a `Code-review-followup:` commit, the controller re-evaluates the routing condition for heuristic-conditional roles (a followup may newly bring extension-architecture content into scope) and re-dispatches the same set as initial dispatch (plus newly-routable roles). Each re-review header includes `(re-review of <SHA>)` where `<SHA>` is the followup commit.

**5d — Add "Routing layer discipline" subsection.** Insert immediately after the "Auto-dispatch on spec/ADR PRs" subsection:

> **Routing layer discipline.** The agentic-actor registry's `Routing condition` column is the source of truth for which reviewer roles dispatch on which PRs. Values:
>
> - `always` — dispatch unconditionally when the trigger fires. All v1 reviewer + respondent roles default to this except domain expert.
> - `heuristic: <one-line description>` — dispatch conditionally. The controller evaluates the heuristic against PR content. Domain expert is the only `heuristic`-conditional role in v1.
>
> **Heuristic evaluation is convention-applied** (the controller's judgment), not workflow-enforced. The controller errs on the side of dispatching when uncertain — the cost of an unnecessary dispatch is one round-trip + an out-of-scope skip response (mitigated by the escape valve, see below); the cost of a missed dispatch is an architecturally-significant change going un-reviewed by a role that would have caught it.
>
> Out-of-scope skip exit pattern: a heuristic-conditional reviewer may determine at review time that the PR is actually out-of-scope (controller's heuristic was wrong, OR the PR's content matches heuristic terms but doesn't actually touch the role's mandate). The reviewer returns a one-line skip response:
>
> - Header: `## <Role> review — out-of-scope skip — <model>`
> - Body: one paragraph explaining briefly WHY out-of-scope
>
> Controller treats a skip as a no-op: doesn't trigger followup loop, doesn't count in any Gate, doesn't request re-review on subsequent commits in the same PR's lifecycle. The skip post stays on the PR as a record of the reviewer's determination.
>
> Spec: [`docs/specs/2026-05-17-reviewer-routing-and-domain-expert.md`](docs/specs/2026-05-17-reviewer-routing-and-domain-expert.md).

**5e — Add "Blocking-question discipline" subsection.** Insert immediately after the "Routing layer discipline" subsection:

> **Blocking-question discipline (domain expert, architectural-intent questions only).** A subset of domain expert's "Open questions" findings — those tagged architectural-intent (the reviewer marks them explicitly, typically with a `[blocking]` prefix or **bold-leading-text**) — are **blocking-by-default**: each tagged question requires an explicit substantive disposition in the round's respondent post before re-review can verify the question as addressed. Other domain-expert open questions (minor clarifications, future-iteration suggestions, devil's-advocate flags) remain informational. This applies specifically to domain expert in v1; existing reviewers' open questions remain informational.
>
> Acceptable substantive dispositions (using existing respondent vocabulary):
>
> - `addressed in <SHA>` — spec was updated to answer (new Known Unknowns entry, sharpened Non-goals, clarified Architecture text).
> - `intentional, see <X>` — the answer already exists in prior decision; cite it (citation must verify per existing convention).
> - `noted, no current action — <FULL ANSWER TEXT>` — the controller's answer goes in the rationale field. **NOT** bare `noted, no current action — we'll consider it`; silent dispositions are insufficient.
> - `routed to docs/roadmap.md / out-of-scope.md` — for future-iteration questions.
>
> Domain expert's re-review checks each tagged-blocking question for substantive disposition; silent dispositions are re-flagged. Spec: [`docs/specs/2026-05-17-reviewer-routing-and-domain-expert.md`](docs/specs/2026-05-17-reviewer-routing-and-domain-expert.md).

**5f — Add domain expert row to the verdict-permission table.** The verdict-permission table currently has 6 rows (Per-task spec-compliance, Per-task code-quality, Final cross-cutting, Red-team, Spec-quality, Respondent). Add a new row immediately after the Spec-quality row (before Respondent):

```md
| Domain-expert (per-artifact, spec/ADR-PRs, heuristic-routed) |      ✓      |          ✗          |      ✗      |
```

`--comment` only (advisory, consistent with red-team and spec-quality v1; verdict promotion is a future iteration).

**5g — Update PR-template footer.** The Spec/ADR-PR template footer at line 205 currently reads:

> Red-team auto-dispatches on PR open per the agentic-actor registry. Future reviewer roles (e.g., domain expert, when they exist) follow per the registry.

Replace with:

> Red-team and domain expert (heuristic-routed) auto-dispatch on PR open per the agentic-actor registry. Spec-quality auto-dispatches unconditionally. Future reviewer roles follow per the registry.

### Verbatim — Commit 6 (docs propagation)

**6a — roadmap.md flip + new entry.** Locate the existing Considering entry for "Reviewer routing layer" (around line 83 of `shell/docs/roadmap.md`).

**Before:**

```md
- [ ] **Reviewer routing layer** — long-standing Considering item; "which reviewer roles fire on which PRs." Becomes load-bearing when a 4th reviewer role arrives (domain expert, devil's-advocate v2, etc.). Trigger: 4th reviewer role is added.
```

DELETE the above entry from Considering. ADD the following entry to the **Queued** section of the agentic-team architecture track, immediately after the existing "Robust default paths in token helpers" `[x]`-marked entry:

```md
- [x] **Reviewer routing layer + Domain expert (combined)** — closes queued #4 (routing layer) AND ships the first reviewer role that uses routing (domain expert on extension architecture). Agentic-actor registry gains `Routing condition` column (`always` default for existing roles; `heuristic: <description>` for new heuristic-conditional roles). Controller auto-dispatch obligation extended to evaluate routing condition before dispatching. Out-of-scope skip exit pattern (`## <Role> review — out-of-scope skip — <model>`) for heuristic-conditional roles when controller's heuristic was wrong. Domain expert persona: principal-level architect on extensible hosts (VSCode/Atom/Eclipse-flavored + gcscode-specific awareness, free to push back on past architectural commitments). Output format aligns to existing 4-section convention. Blocking-question discipline: domain expert's open questions require substantive dispositions (silent `we'll consider it` insufficient). Gate 3b unchanged (domain expert is advisory, out of gate). New `gcscode-domain-expert` GitHub App; appId/installationId added to `reviewerApps` config. Tripwires: heuristic-false-negative + self-triage abuse + silent-disposition pattern. Spec: [`specs/2026-05-17-reviewer-routing-and-domain-expert.md`](specs/2026-05-17-reviewer-routing-and-domain-expert.md).
```

**6b — out-of-scope.md propagation (delete stale entry + add 3 new entries).**

**6b.i — DELETE** the existing entry at line 56 of `shell/docs/out-of-scope.md`:

```md
- **Reviewer routing layer.** Which reviewer roles fire on which PRs. Out of scope until there is more than one non-baseline reviewer role. Trigger: a second non-baseline reviewer role is added (e.g., devil's advocate v2 or the first expert reviewer).
```

This iteration ships the reviewer routing layer; the deferral entry is now stale. All three reviewers (red-team Opus + Sonnet + spec-quality) on this PR independently flagged this as drift in initial review.

**6b.ii — APPEND** three new entries to the "Agentic team architecture deferrals" section:

```md
- **Verdict promotion for domain expert** (`--request-changes` blocking power). v1 ships domain expert with `--comment` only, consistent with red-team and spec-quality v1. Trigger to revisit: advisory mandate proves insufficient (a blocking-concern is repeatedly ignored across multiple PRs).
- **Additional domain experts beyond extension architecture** (frontend, security, performance, etc.). v1 ships only the extension-architecture domain expert. Trigger to revisit: a domain other than extension architecture surfaces enough recurring concerns to warrant a dedicated reviewer role.
- **Automated heuristic enforcement** for routing (workflow-side check). v1 ships convention-only routing — the controller applies the heuristic per the auto-dispatch obligation; no workflow gate enforces. Trigger to revisit: convention-only enforcement produces recurring routing misses across N=3 PRs.
```

(The original Commit 6c proposing a vs-code-alignment.md ledger row was dropped — see the VS Code alignment section above for rationale.)
