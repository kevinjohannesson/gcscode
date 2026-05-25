# v1 propagation gap audit (review-discussion-loop-v1)

**Slug:** v1-propagation-gap-audit
**Iteration on the agentic-team track:** nineteenth. Closes the "v1 propagation gap audit" Considering item on the agentic-team roadmap (surfaced by [`2026-05-16-respondent-subagent-v2.md`](2026-05-16-respondent-subagent-v2.md) Known Unknowns).
**Type:** docs-only iteration. Three workstreams bundled: (a) backfills one `out-of-scope.md` entry that was planned by `review-discussion-loop-v1` but never landed; (b) adds a one-line breadcrumb to v1's spec per the specs-as-historical-record convention; (c) two adjacent `roadmap.md` fixes (a stale `[ ]` checkbox for ADR-0009; this iteration's own Considering→Shipped flip). No code, no agent files, no workflow changes.
**Audit scope (load-bearing limit).** This audit covers v1's **docs-propagation step** only — the `out-of-scope.md` and `roadmap.md` edits v1's spec planned. It does NOT audit v1's infrastructure delivery (`gcscode-respondent` App registration, `.claude/scripts/gh-app-token-respondent`, `.claude/reviewer-prompts/respondent.md`, CLAUDE.md additions, agent-config.json). Those landed during v1's post-merge implementation per the commit log and are not in question. The gap is specifically in the propagation-to-docs commits that should have ridden on the same post-merge implementation pass.
**No bootstrap exceptions.** Spec ships via spec-PR workflow; implementation lands per the post-merge implementation convention.

## Context

The review-discussion-loop-v1 spec ([`2026-05-16-review-discussion-loop-v1.md`](2026-05-16-review-discussion-loop-v1.md), PR #12, merged 2026-05-16) included a `docs/out-of-scope.md` propagation section listing **two cross-cutting architectural deferrals** to be added at merge time:

1. "Respondent subagent dispatch for cross-session consistency."
2. "Required re-reviewer engagement with respondent posts."

It also listed **four `docs/roadmap.md` updates**:

1. Add Shipped entry for the iteration.
2. Update existing per-role-bot-identities Considering entry with a note about the respondent identity.
3. Add a new Considering entry for "Agentic-team tech-debt clearing iteration."
4. Add Considering entries for the two cross-cutting deferrals that also landed in `out-of-scope.md`.

The respondent-subagent-v2 spec ([`2026-05-16-respondent-subagent-v2.md`](2026-05-16-respondent-subagent-v2.md), PR #16) noticed via grep that **neither `out-of-scope.md` entry had landed** during v1's post-merge implementation; v2 explicitly flagged this as out-of-scope for v2 and queued an audit as a Known Unknown. The audit Considering entry was added to `roadmap.md` at v2's merge time.

**The gap was bigger than "two entries missed".** v1's spec planned **six propagation edits** (two `out-of-scope.md` additions + four `roadmap.md` updates). At v1's post-merge implementation time, only one of the six landed — the Shipped entry under the agentic-team-architecture track. The remaining five edits were absorbed by later specs incidentally — the tech-debt-clearing Considering entry landed via [`2026-05-16-agentic-team-debt-clearing-v1.md`](2026-05-16-agentic-team-debt-clearing-v1.md)'s own propagation, the audit Considering entry itself landed via v2's propagation, and the cross-cutting deferral entries simply never landed until this iteration. The failure mode is **"docs-propagation step skipped at merge time, partially absorbed by adjacent specs"**, not **"one entry overlooked"**. The Audit results below restructure the table to reflect this.

This iteration is that audit + the load-bearing backfills, plus one adjacent stale-checkbox fix surfaced incidentally, plus a one-line breadcrumb on v1's spec per the specs-as-historical-record convention.

## Audit results

### What "load-bearing" means here

Throughout this audit, a v1-planned entry is judged **load-bearing post-v2** if the architectural deferral it describes is still active — i.e., v2 did not resolve, supersede, or invalidate the underlying deferral. The criterion is **architectural**, not literary: an entry whose deferred architecture v2 actually shipped (e.g., the respondent subagent dispatch) is NOT load-bearing — backfilling it as out-of-scope would tag-as-deferred something already shipped. An entry whose deferred architecture v2 left untouched (e.g., optional engagement) IS load-bearing — even if v2's spec merely "carried forward" the setting rather than re-affirming the deferral. The carry-forward is sufficient evidence the deferral is active; the audit's job is to make it visible in `out-of-scope.md`, where active deferrals belong.

### `out-of-scope.md` gap (1 missing, 1 superseded)

| Planned entry | Landed at v1 merge? | Where eventually landed (if anywhere) | Still load-bearing post-v2? | Action |
|---|---|---|---|---|
| "Respondent subagent dispatch for cross-session consistency" | No | Nowhere — respondent-subagent-v2 ([`2026-05-16-respondent-subagent-v2.md`](2026-05-16-respondent-subagent-v2.md)) shipped the subagent, retroactively superseding this deferral | **No** — backfilling would tag as deferred something already shipped | Document the supersession in this spec; do NOT backfill |
| "Required re-reviewer engagement with respondent posts" | No | Nowhere | **Yes** — v2 carried the optional setting forward without re-affirming it; the carry-forward is sufficient evidence the architectural deferral is still active | Backfill to `out-of-scope.md` "Agentic team architecture deferrals" |

### `roadmap.md` gap (5 of 6 v1-planned edits landed late or never)

| Planned update | Landed at v1 merge? | Where eventually landed (if anywhere) | Action |
|---|---|---|---|
| (1) Shipped entry for v1 | Yes | v1's own post-merge propagation | None |
| (2) Note on per-role-bot-identities re: respondent identity | No | Effectively moot — the per-role-bot-identities iteration ([`2026-05-16-per-role-bot-identities-for-reviewers.md`](2026-05-16-per-role-bot-identities-for-reviewers.md), PR #18) shipped 2 days later and rewrote the entry. The planned "note" had nowhere to live by then; a weaker version ("Respondent identity untouched.") DID land in PR #18's Shipped-entry text | None |
| (3) Considering entry for tech-debt-clearing iteration | No | Landed via [`2026-05-16-agentic-team-debt-clearing-v1.md`](2026-05-16-agentic-team-debt-clearing-v1.md)'s own post-merge propagation (PR #13) | None |
| (4a) Considering entry: respondent subagent dispatch | No | Nowhere — superseded by v2 (see `out-of-scope.md` row above) | Skip; superseded |
| (4b) Considering entry: required re-reviewer engagement | No | Nowhere | Backfill |

**Pattern:** v1's post-merge propagation step landed exactly 1 of 6 planned edits. The remaining 5 were absorbed incidentally over the following ~2 weeks. This audit closes the remainder (the engagement entry + matching `roadmap.md` Considering entry) and acknowledges the supersession of the subagent-dispatch entry in this spec's prose.

### Adjacent stale checkbox (incidentally surfaced)

`docs/roadmap.md` carries `[ ] ADR-0009: Agentic-actor registry (supersedes ADR-0008)` despite ADR-0009 having merged 2026-05-16 as PR #15. This is a **separate failure mode** from the v1 propagation gap — it's normal-lag from ADR-0009's own propagation step, where the Considering entry flip-to-Shipped didn't ride on ADR-0009's merge. Bundled into this iteration's `roadmap.md` work strictly on adjacency grounds (one line away from the v1 work; same git commit covers both), NOT because the failure-mode resembles v1's skipped-step pattern. See Why-not-bigger for the B-scope justification.

### Tripwire status assessment

v1's "Tripwires for known-quality concerns" section names three tripwires whose observation windows have closed by 2026-05-25:

1. **Cross-session reconstruction tripwire** (first 2 multi-round PRs after v1 ships, 10-minute threshold). Status: **superseded** by respondent-subagent-v2's structural fix; v1's spec carries an inline breadcrumb to this effect (added 2026-05-17 by [`2026-05-17-tripwire-condition-iii-compliance.md`](2026-05-17-tripwire-condition-iii-compliance.md)).
2. **Optional-engagement-never-fires tripwire** (first 5 spec/ADR PRs after v1 ships). Status: **window closed**, ~12 spec/ADR PRs have shipped since v1 (PRs #13, #15, #16, #18, #19, #20, #21, #22, #23, #24, #25, #27). The tripwire's question — has any re-reviewer ever pushed back on a respondent disposition under the optional-engagement provision — is not assessed by this audit (out of scope per Audit scope above; the assessment requires reading reviewer/respondent posts across all 12 PRs).
3. **Routing-evaporates tripwire** (first 3 spec/ADR PRs after v1 ships, respondent-routed dispositions never resulting in actual `roadmap.md`/`out-of-scope.md` commits). Status: **window closed**, same N-violation as above. Same not-assessed-by-this-audit caveat.

Tripwires 2 and 3 should be reassessed in a future iteration that has the assessment as a Goal — likely a `/housekeeping` pass or a dedicated agentic-team retrospective iteration. This audit surfaces the window-closure so a future iteration knows the queue exists.

## Why not the bigger version

The bigger version would include:

- **Sweep every `[ ]` Considering entry in `roadmap.md` for staleness.** **Smaller wedge:** fix the one stale checkbox right next to the v1-audit work (B-scope). **Bigger wedge:** full housekeeping pass across all Considering entries. YAGNI: a full sweep is housekeeping work, not v1-propagation-audit work; if more stale entries exist, they surface during the next `/housekeeping` iteration. **The B-scope inclusion of ADR-0009 is NOT justified by "same failure mode as v1's gap"** (the two are distinct failure modes — v1's is a skipped step; ADR-0009's is normal-lag during its own propagation). The justification is purely adjacency: the stale `[ ]` is one line away from the v1 work; bundling avoids a tiny separate iteration's overhead.
- **Audit every prior spec's planned `out-of-scope.md` / `roadmap.md` propagations for gaps.** **Smaller wedge:** audit v1 only (the named-and-queued case). **Bigger wedge:** audit ALL prior specs. YAGNI: v1's audit was queued because v2 noticed the gap. No other spec has surfaced a similar pattern. If one does, audit-on-discovery is the natural cadence.
- **Add an automated post-merge propagation verification step** (a script that reads a merged spec's propagation section and verifies the edits landed). **Smaller wedge:** manual audit-when-noticed. **Bigger wedge:** workflow gate. Out of scope; could surface as a future tooling iteration if gap-rate justifies it. (The gap-rate observation just made — 5 of 6 v1 edits skipped — is itself signal that the question may deserve attention sooner than "wait for another gap.")
- **Substantively edit the v1 spec.** Per "Specs as historical record," substantive edits are out — but the convention explicitly allows **one-line cross-reference breadcrumbs** to make resolution discoverable from the predecessor's location. This iteration adds such a breadcrumb (Goal 6 + Edit 5 + Commit 3); a substantive rewrite of v1 stays out of scope.

This iteration ships: one `out-of-scope.md` backfill, one `roadmap.md` Considering backfill, one `roadmap.md` stale-checkbox fix, one `roadmap.md` self-completion, and one one-line breadcrumb on v1's spec. Five edits across three files.

## Goals

1. Backfill "Required re-reviewer engagement with respondent posts" as a new entry in `docs/out-of-scope.md` "Agentic team architecture deferrals" section, with the cross-cutting trigger from v1's spec.
2. Backfill a parallel Considering entry in `docs/roadmap.md` for the same.
3. Flip the ADR-0009 entry in `docs/roadmap.md` from Considering `[ ]` to Shipped `[x]`, moving it to the Shipped subsection alongside the rest of the agentic-team-architecture Shipped items.
4. Remove this iteration's own "v1 propagation gap audit" Considering entry from `docs/roadmap.md`; add a Shipped entry pointing to this spec.
5. Document in this spec that "Respondent subagent dispatch for cross-session consistency" was **superseded by v2 rather than deferred**, so future readers (or auditors) understand why no `out-of-scope.md` entry exists for it.
6. Add a one-line cross-reference breadcrumb to `docs/specs/2026-05-16-review-discussion-loop-v1.md` per the specs-as-historical-record convention's allowance for breadcrumbs, making this audit's resolution discoverable from v1's location.

## Non-goals (this iteration)

- **Substantive edits to v1's spec.** Per "Specs as historical record," substantive corrections happen via successor specs (this iteration). A one-line breadcrumb on v1 IS in scope (Goal 6); a deeper rewrite is not.
- **Audit v1's infrastructure delivery.** Audit scope (above) restricts this iteration to v1's docs-propagation. v1's App registration, helper script, agent file, prompt template, CLAUDE.md additions, and agent-config.json all landed per the commit log and are not in question.
- **Audit beyond v1.** No sweep of prior-spec propagation gaps. Trigger: a second prior-spec gap surfaces.
- **Sweep every `[ ]` Considering entry in `roadmap.md`.** B-scope is just the one adjacent ADR-0009 line.
- **Tripwire reassessment (optional-engagement-never-fires, routing-evaporates).** Both windows have closed (see Audit results > Tripwire status assessment). Assessment requires reading reviewer/respondent posts across ~12 PRs; that work belongs to a dedicated iteration or a `/housekeeping` pass, not this audit. Trigger: a future iteration takes the assessment as a Goal.
- **Automated propagation verification.** No script, no workflow gate. Trigger: gap-rate justifies tooling investment (the 5-of-6-skipped observation in Audit results is signal but not by itself sufficient justification).
- **Change to the engagement model.** Optional engagement stays optional. The backfill entry just makes the deferral visible; the deferral itself is unchanged from v1+v2.

## Architecture

Five edits, fully specified verbatim below. Three files touched.

### Edit 1 — `out-of-scope.md`: add "Required re-reviewer engagement" entry

Insert the new entry into the "Agentic team architecture deferrals" section. Placement: after the "Per-model identities for the multi-model red-team pair" entry and before "Automated enforcement of 'repo-relative paths only'" (chronologically grouped with respondent-related deferrals). Verbatim text in Post-merge implementation > Commit 1.

### Edit 2 — `roadmap.md`: flip ADR-0009 Considering `[ ]` to Shipped `[x]`

Remove the existing `[ ]` line from the Considering subsection. Add an `[x]` Shipped entry in the Shipped subsection, inserted at the end of the existing Shipped list. Verbatim text in Post-merge implementation > Commit 2.

### Edit 3 — `roadmap.md`: complete the v1-propagation-gap-audit entry

Remove the `[ ]` Considering entry. Add an `[x]` Shipped entry pointing to THIS spec. Verbatim text in Post-merge implementation > Commit 2.

### Edit 4 — `roadmap.md`: add "Required re-reviewer engagement" Considering entry

Insert a Considering entry parallel to the `out-of-scope.md` entry from Edit 1. Verbatim text in Post-merge implementation > Commit 2.

### Edit 5 — `2026-05-16-review-discussion-loop-v1.md`: add one-line breadcrumb

Per Goal 6, add a one-line cross-reference breadcrumb at the top of v1's "## `docs/out-of-scope.md` propagation" section, pointing to this audit. This is mechanically a breadcrumb per the specs-as-historical-record convention (one-line cross-reference), NOT a substantive edit to v1's content. Verbatim text in Post-merge implementation > Commit 3.

### What about "Respondent subagent dispatch" supersession?

No `out-of-scope.md` or `roadmap.md` entry. The supersession is documented in this spec's Context + Audit results + Goals (item 5); no entry is added because the architecture isn't actually deferred — it shipped in v2. Future readers find the answer via the v1 spec → v1's breadcrumb (Edit 5) → this spec cross-reference chain (the v2 spec's "Out of scope" list already documents the supersession at the v2 layer).

## Post-merge implementation

Per the post-merge implementation convention, three direct-master commits. All content fully specified verbatim. No judgment required during implementation.

- **Commit 1: Update `docs/out-of-scope.md`** — insert "Required re-reviewer engagement" entry at the specified anchor.
- **Commit 2: Update `docs/roadmap.md`** — three line-edits bundled (flip ADR-0009 to Shipped, replace this iteration's Considering entry with a Shipped one, add engagement Considering entry).
- **Commit 3: Add breadcrumb to `docs/specs/2026-05-16-review-discussion-loop-v1.md`** — one-line cross-reference per the specs-as-historical-record convention.

### Verbatim — Commit 1 (`out-of-scope.md`)

Insert the following entry into `docs/out-of-scope.md` "Agentic team architecture deferrals" section. Anchor: immediately AFTER the line beginning `- **Per-model identities for the multi-model red-team pair.**` and immediately BEFORE the line beginning `- **Automated enforcement of "repo-relative paths only"`:

```md
- **Required re-reviewer engagement with respondent posts.** Re-reviewer prompts do not require reading respondent posts or explicitly accepting/pushing back on each disposition. v1 ([`specs/2026-05-16-review-discussion-loop-v1.md`](specs/2026-05-16-review-discussion-loop-v1.md)) shipped engagement as optional; v2 ([`specs/2026-05-16-respondent-subagent-v2.md`](specs/2026-05-16-respondent-subagent-v2.md)) carried the optional setting forward. The deferral is architectural — whether reviewers must explicitly accept/push-back on each disposition fundamentally changes the loop semantics. Trigger to revisit: the optional-engagement-never-fires tripwire in v1 ([`specs/2026-05-16-review-discussion-loop-v1.md`](specs/2026-05-16-review-discussion-loop-v1.md) "Tripwires for known-quality concerns") fires (no re-reviewer pushback on a respondent disposition across the first 5 spec/ADR PRs after v1 shipped), OR a future iteration brainstorm surfaces required engagement as load-bearing. Backfilled by [`specs/2026-05-25-v1-propagation-gap-audit.md`](specs/2026-05-25-v1-propagation-gap-audit.md) (v1's spec planned this entry but it did not land at v1's post-merge propagation step).
```

### Verbatim — Commit 2 (`roadmap.md`)

Three sub-edits bundled in this commit.

**Edit 2a — flip ADR-0009 to Shipped.** Remove the existing line from the Considering subsection:

```md
- [ ] **ADR-0009: Agentic-actor registry (supersedes ADR-0008)** — broadens ADR-0008's reviewer-role registry into a general agentic-actor registry covering reviewer roles AND non-reviewer controller-voice actors (respondent in v1; future variants). Industry-standard ADR supersession mechanics: ADR-0008 Status flips to `Superseded by ADR-0009`; ADR-0009 is a new file noting `Supersedes ADR-0008`. Scope of ADR-0009 specified in `specs/2026-05-16-agentic-team-debt-clearing-v1.md` Architecture > Decision 1. Trigger: ready to kick off as soon as this planning spec merges; no external prerequisite.
```

Add the following replacement entry to the Shipped subsection, inserted immediately AFTER the existing "Reviewer routing layer + Extension architect (combined)" entry (the last Shipped entry as of 2026-05-25):

```md
- [x] **ADR-0009: Agentic-actor registry (supersedes ADR-0008)** — broadens ADR-0008's reviewer-role registry into a general agentic-actor registry covering reviewer roles AND non-reviewer controller-voice actors (respondent in v1; future variants). Industry-standard ADR supersession: ADR-0008 Status reads `Superseded by ADR-0009`; ADR-0009 carries `Supersedes ADR-0008`. Closes queued #1 of the agentic-team debt-clearing v1 queue. ADR: [`decisions/ADR-0009-agentic-actor-registry.md`](decisions/ADR-0009-agentic-actor-registry.md).
```

**Edit 2b — replace this iteration's Considering entry with a Shipped entry.** Remove the existing line from the Considering subsection:

```md
- [ ] **v1 propagation gap audit (review-discussion-loop-v1)** — v2's brainstorm surfaced that v1's planned `docs/out-of-scope.md` entries ("Respondent subagent dispatch for cross-session consistency"; "Required re-reviewer engagement with respondent posts") never landed during v1's post-merge implementation; the planned roadmap.md updates may have similar gaps. This audit verifies what v1 planned vs what actually landed across out-of-scope.md and roadmap.md, and backfills where the gap is still load-bearing post-v2. Trigger: ready to address as a quick micro-iteration; no external prerequisite. Surfaced by [`specs/2026-05-16-respondent-subagent-v2.md`](specs/2026-05-16-respondent-subagent-v2.md) Known Unknowns.
```

Add the following Shipped entry, inserted immediately AFTER the ADR-0009 entry added in Edit 2a:

```md
- [x] **v1 propagation gap audit (review-discussion-loop-v1)** — verified what `review-discussion-loop-v1` planned for `out-of-scope.md` and `roadmap.md` vs what actually landed. Backfilled the one load-bearing missing entry ("Required re-reviewer engagement with respondent posts" in `out-of-scope.md` + as a Considering entry in `roadmap.md`). The other planned v1 `out-of-scope.md` entry ("Respondent subagent dispatch for cross-session consistency") was superseded by respondent-subagent-v2 and is intentionally NOT backfilled (would tag as deferred something already shipped). Also fixed the stale ADR-0009 `[ ]` checkbox (per B-scope; surfaced incidentally adjacent to the v1 work). Spec: [`specs/2026-05-25-v1-propagation-gap-audit.md`](specs/2026-05-25-v1-propagation-gap-audit.md).
```

**Edit 2c — add engagement Considering entry.** Insert the following entry into the Considering subsection, placed at the position previously occupied by the removed v1-propagation-gap-audit entry (Edit 2b):

```md
- [ ] **Required re-reviewer engagement with respondent posts** — re-reviewer prompts require reading respondent posts and explicitly accepting/pushing back on each disposition. v1 ([`specs/2026-05-16-review-discussion-loop-v1.md`](specs/2026-05-16-review-discussion-loop-v1.md)) shipped engagement as optional; v2 ([`specs/2026-05-16-respondent-subagent-v2.md`](specs/2026-05-16-respondent-subagent-v2.md)) carried the optional setting forward. Trigger: optional-engagement-never-fires tripwire in v1 fires (no re-reviewer pushback on a respondent disposition across the first 5 spec/ADR PRs after v1 shipped), OR a future iteration brainstorm surfaces required engagement as load-bearing. Tracked alongside the same entry in [`out-of-scope.md`](out-of-scope.md) under "Agentic team architecture deferrals". Backfilled by [`specs/2026-05-25-v1-propagation-gap-audit.md`](specs/2026-05-25-v1-propagation-gap-audit.md).
```

The three sub-edits land as one git commit; bundling reflects that all three touch only `docs/roadmap.md` and are part of the same audit cleanup.

### Verbatim — Commit 3 (v1 spec breadcrumb)

Insert the following block at the top of `docs/specs/2026-05-16-review-discussion-loop-v1.md`'s "## `docs/out-of-scope.md` propagation" section, immediately AFTER the section heading and BEFORE the existing "Two new entries; both are cross-cutting architectural deferrals..." paragraph:

```md
> **v1 propagation gap audit breadcrumb (added 2026-05-25):** v1's post-merge propagation step landed only 1 of the 6 edits planned in this section + the "`docs/roadmap.md` propagation" section below. The audit ([`2026-05-25-v1-propagation-gap-audit.md`](2026-05-25-v1-propagation-gap-audit.md)) backfilled the one entry still load-bearing post-v2 ("Required re-reviewer engagement with respondent posts"); the other ("Respondent subagent dispatch for cross-session consistency") was retroactively superseded by [`2026-05-16-respondent-subagent-v2.md`](2026-05-16-respondent-subagent-v2.md) and is intentionally NOT backfilled. The remaining 4 of the 6 v1-planned edits either landed incidentally via later specs or were judged effectively-moot — see the audit for the full disposition.
```

This is a one-line cross-reference breadcrumb per CLAUDE.md "Specs as historical record" — it does NOT edit v1's substantive content, only points readers to where the resolution lives.

## Validation

No code to test. Validation is read-the-diff:

1. After Commit 1, grep `docs/out-of-scope.md` for `Required re-reviewer engagement` — verify exactly one match.
2. After Commit 2, grep `docs/roadmap.md` for `ADR-0009: Agentic-actor registry` — verify exactly one match, with `[x]` prefix, located in the Shipped subsection.
3. After Commit 2, grep `docs/roadmap.md` for `v1 propagation gap audit` — verify exactly one match, with `[x]` prefix, in the Shipped subsection.
4. After Commit 2, grep `docs/roadmap.md` for `Required re-reviewer engagement` — verify exactly one match, with `[ ]` prefix, in the Considering subsection.
5. After Commit 3, grep `docs/specs/2026-05-16-review-discussion-loop-v1.md` for `v1 propagation gap audit breadcrumb` — verify exactly one match, located in the "`docs/out-of-scope.md` propagation" section.

If any of these checks fail, the commit didn't apply correctly; revert and re-apply.

No mechanics smoke test on a `test/*` branch — there's no new infrastructure to validate. The spec-PR itself exercises the spec-PR workflow under all conventions already in place.

## VS Code alignment

None. This is internal-process cleanup specific to the gcscode agentic-team track.

Propagation to `shell/docs/vs-code-alignment.md`: none.

## `docs/out-of-scope.md` propagation

One entry: "Required re-reviewer engagement with respondent posts." Verbatim text in Post-merge implementation > Commit 1. This IS the load-bearing backfill from v1.

## `docs/roadmap.md` propagation

Three sub-edits bundled in Commit 2:

1. Flip ADR-0009 Considering `[ ]` to Shipped `[x]` (adjacent stale-checkbox fix per B-scope).
2. Replace this iteration's own "v1 propagation gap audit" Considering entry with a Shipped entry pointing to this spec.
3. Add a new Considering entry for "Required re-reviewer engagement" (parallel tracking with the `out-of-scope.md` entry).

Verbatim text in Post-merge implementation > Commit 2.

## Known unknowns

- **Audit-completeness-by-accident.** The audit's completeness claim rests on a manual read of v1's spec, comparing each named propagation edit to current `out-of-scope.md`/`roadmap.md` state. The auditor (this iteration's controller) is the same agent that originally surfaced the gap during the warm-up triage; that means the audit's "I found everything" claim has the same blind-spot risk as v1's "I propagated everything" claim. A future systematic propagation audit (Future iteration #2) could surface additional gaps this one missed. Treat the completeness claim as best-effort, not canonical.
- **Are there parallel gaps in other specs' propagations?** Out of scope (Non-goals). The pattern that surfaced v1's gap was the v2 author noticing during a related spec's brainstorm. If no other spec author notices, no other gap is currently known. The 5-of-6-skipped observation suggests propagation discipline may be soft generally, not v1-specific — but that's a hypothesis, not data.
- **Did the per-role-bot-identities note really have nowhere to live?** The audit's judgment: the per-role-bot-identities iteration shipped 2 days after v1 (PR #18 vs PR #12) and rewrote the Considering entry to its Shipped form. The "note about `gcscode-respondent` being a new actor identity" v1 planned would have lived in the pre-rewrite text. A weaker version ("Respondent identity untouched.") DID land in PR #18's Shipped entry. This is judged effectively delivered in spirit. A stricter reading would call it a small gap — the planned note was specifically about contrasting per-role-bot-identities with the v1-introduced respondent identity, which the weaker "untouched" phrasing under-articulates. Not load-bearing enough to backfill either way; flagged here for the strict-reading audit-completeness concern.
- **Tripwire status assessment (Audit results > Tripwire status assessment).** Both v1 tripwires whose windows have closed (optional-engagement-never-fires, routing-evaporates) require reading reviewer/respondent posts across ~12 PRs to assess. Not done in this audit (out of scope per Non-goals). A future iteration takes the assessment as a Goal.

## Future iterations

Each gets its own brainstorm when triggered.

1. **Required re-reviewer engagement with respondent posts** — the deferral this iteration backfills. Trigger: optional-engagement-never-fires tripwire fires, OR brainstorm surfaces requirement.
2. **Systematic propagation audit across all prior specs** — a sweeping audit beyond v1. Trigger: a second prior-spec propagation gap surfaces, OR `/housekeeping` opts to do this proactively (the 5-of-6-skipped observation in v1 is one data point in favor; one data point is not enough to trigger by itself).
3. **Automated post-merge propagation verification** — a script that reads a merged spec's propagation section and verifies the edits landed. Trigger: gap-rate justifies tooling investment. The 5-of-6 ratio in v1 is signal; whether it's sufficient signal is itself a judgment call. Devil's-advocate consideration for v2: convention-only enforcement may be load-bearingly inadequate for propagation discipline.
4. **Tripwire-status assessment iteration (v1's optional-engagement + routing-evaporates)** — reassess v1's two tripwires whose observation windows have closed. Trigger: a future iteration takes the assessment as a Goal, or `/housekeeping` does it as part of an agentic-team retrospective.

## Origin

Surfaced by [`2026-05-16-respondent-subagent-v2.md`](2026-05-16-respondent-subagent-v2.md) Known Unknowns (v2's brainstorm noticed via grep that v1's planned `out-of-scope.md` entries never landed). Queued as a Considering item in `docs/roadmap.md` at PR #16 merge time. User selected this iteration as the warm-up before the queued retroactive ADR for reviews-as-artifacts (a separate Considering item on the same roadmap).

B-scope (audit + adjacent stale-checkbox fix) chosen over A-scope (audit only) on the user's call 2026-05-25: the ADR-0009 stale `[ ]` is one line away from the audit work, and bundling avoids spawning a separate tiny iteration. The two failure modes are distinct — see Why-not-bigger for the explicit distinction — so bundling is justified on adjacency, not on pattern-recurrence.
