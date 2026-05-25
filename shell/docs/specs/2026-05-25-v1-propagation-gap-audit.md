# v1 propagation gap audit (review-discussion-loop-v1)

**Slug:** v1-propagation-gap-audit
**Iteration on the agentic-team track:** seventeenth. Closes the "v1 propagation gap audit" Considering item on the agentic-team roadmap (surfaced by [`2026-05-16-respondent-subagent-v2.md`](2026-05-16-respondent-subagent-v2.md) Known Unknowns).
**Type:** docs-only iteration. Backfills one `out-of-scope.md` entry that was planned by `review-discussion-loop-v1` but never landed; updates `roadmap.md` (one backfill + one stale-checkbox fix + self-completion). No code, no agent files, no workflow changes.
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

This iteration is that audit + the load-bearing backfills, plus one adjacent stale-checkbox fix surfaced incidentally.

## Audit results

**`out-of-scope.md` gap (1 missing, 1 superseded):**

| Planned entry | Landed? | Still load-bearing post-v2? | Action |
|---|---|---|---|
| "Respondent subagent dispatch for cross-session consistency" | No | **No** — superseded by respondent-subagent-v2, which shipped the subagent | Document the supersession in this spec; do NOT backfill (would tag as deferred something already shipped) |
| "Required re-reviewer engagement with respondent posts" | No | **Yes** — respondent-subagent-v2 retained optional engagement; v2's "Out of scope" list explicitly carries this forward | Backfill to `out-of-scope.md` "Agentic team architecture deferrals" |

**`roadmap.md` gap (1 missing, 1 effectively moot, 2 done):**

| Planned update | Landed? | Action |
|---|---|---|
| (1) Shipped entry for v1 | Yes | None |
| (2) Note on per-role-bot-identities re: respondent identity | Effectively moot — the per-role-bot-identities iteration shipped two days later (PR #18) and rewrote that entry to its current Shipped form. The "note" planned by v1 had nowhere to live by the time the entry was rewritten. A weaker version of the note ("Respondent identity untouched.") DID land in the per-role-bot-identities Shipped entry's text | None |
| (3) Considering entry for tech-debt-clearing | Yes | None |
| (4) Considering entries for the two cross-cutting deferrals | No | Backfill the engagement entry (load-bearing); skip the subagent-dispatch entry (superseded) |

**Adjacent stale checkbox (incidentally surfaced):**

`docs/roadmap.md` carries `[ ] ADR-0009: Agentic-actor registry (supersedes ADR-0008)` despite ADR-0009 having merged 2026-05-16 as PR #15. This is a separate propagation gap not caused by v1, but it sits in the same Considering section as the v1 backfill and is one-line to fix. Per the iteration's B-scope choice (recommended over strict v1-only A-scope), this iteration fixes it.

## Why not the bigger version

The bigger version would include:

- **Sweep every `[ ]` Considering entry in `roadmap.md` for staleness.** **Smaller wedge:** fix the one stale checkbox right next to the v1-audit work (B-scope). **Bigger wedge:** full housekeeping pass across all Considering entries. YAGNI: a full sweep is housekeeping work, not v1-propagation-audit work; if more stale entries exist, they surface during the next `/housekeeping` iteration.
- **Audit every prior spec's planned `out-of-scope.md` / `roadmap.md` propagations for gaps.** **Smaller wedge:** audit v1 only (the named-and-queued case). **Bigger wedge:** audit ALL prior specs. YAGNI: v1's audit was queued because v2 noticed the gap. No other spec has surfaced a similar pattern. If one does, audit-on-discovery is the natural cadence.
- **Add an automated post-merge propagation verification step** (a script that reads a merged spec's propagation section and verifies the edits landed). **Smaller wedge:** manual audit-when-noticed. **Bigger wedge:** workflow gate. Out of scope; could surface as a future tooling iteration if gap-rate justifies it.
- **Substantively edit the v1 spec.** Per the "Specs as historical record" convention, the v1 spec stays as historical record; this audit-and-backfill iteration handles the propagation work that v1's post-merge step missed. No edit to the v1 spec.

This iteration ships: one `out-of-scope.md` backfill, one `roadmap.md` Considering backfill, one `roadmap.md` stale-checkbox fix, one `roadmap.md` self-completion (the audit item itself). Four total edits across two files.

## Goals

1. Backfill "Required re-reviewer engagement with respondent posts" as a new entry in `docs/out-of-scope.md` "Agentic team architecture deferrals" section, with the cross-cutting trigger from v1's spec.
2. Backfill a parallel Considering entry in `docs/roadmap.md` for the same.
3. Flip the ADR-0009 entry in `docs/roadmap.md` from Considering `[ ]` to Shipped `[x]`, moving it to the Shipped subsection alongside the rest of the agentic-team-architecture Shipped items.
4. Remove this iteration's own "v1 propagation gap audit" Considering entry from `docs/roadmap.md`; add a Shipped entry pointing to this spec.
5. Document in this spec that "Respondent subagent dispatch for cross-session consistency" was **superseded by v2 rather than deferred**, so future readers (or auditors) understand why no `out-of-scope.md` entry exists for it.

## Non-goals (this iteration)

- **Substantive edits to the v1 spec.** Per "Specs as historical record." The breadcrumb pattern is also out here — this audit is itself the cross-reference, not a forward-pointer needing a back-pointer.
- **Audit beyond v1.** No sweep of prior-spec propagation gaps. Trigger: a second prior-spec gap surfaces.
- **Sweep every `[ ]` Considering entry in `roadmap.md`.** B-scope is just the one adjacent ADR-0009 line.
- **Automated propagation verification.** No script, no workflow gate. Trigger: gap-rate justifies tooling investment.
- **Change to the engagement model.** Optional engagement stays optional. The backfill entry just makes the deferral visible; the deferral itself is unchanged from v1+v2.

## Architecture

Four edits, fully specified verbatim below. Two files touched.

### Edit 1 — `out-of-scope.md`: add "Required re-reviewer engagement" entry

Insert the new entry into the "Agentic team architecture deferrals" section. Placement: after the "Per-model identities for the multi-model red-team pair" entry and before "Automated enforcement of 'repo-relative paths only'" (chronologically grouped with respondent-related deferrals). Verbatim text in Post-merge implementation > Commit 1.

### Edit 2 — `roadmap.md`: flip ADR-0009 Considering `[ ]` to Shipped `[x]`

Remove the existing `[ ]` line from the Considering subsection. Add an `[x]` Shipped entry in the Shipped subsection, inserted at the end of the existing Shipped list. Verbatim text in Post-merge implementation > Commit 2.

### Edit 3 — `roadmap.md`: complete the v1-propagation-gap-audit entry

Remove the `[ ]` Considering entry. Add an `[x]` Shipped entry pointing to THIS spec. Verbatim text in Post-merge implementation > Commit 2.

### Edit 4 — `roadmap.md`: add "Required re-reviewer engagement" Considering entry

Insert a Considering entry parallel to the `out-of-scope.md` entry from Edit 1. Verbatim text in Post-merge implementation > Commit 2.

### What about "Respondent subagent dispatch" supersession?

No edit. The supersession is documented in this spec's Context + Audit results + Goals (item 5); no `out-of-scope.md` or `roadmap.md` entry is added because the architecture isn't actually deferred — it shipped in v2. Future readers find the answer via the v1 spec → roadmap entry → this spec cross-reference chain (the v2 spec's "Out of scope" list already documents the supersession at the v2 layer).

## Post-merge implementation

Per the post-merge implementation convention, two direct-master commits. All content fully specified verbatim. No judgment required during implementation.

- **Commit 1: Update `docs/out-of-scope.md`** — insert "Required re-reviewer engagement" entry at the specified anchor.
- **Commit 2: Update `docs/roadmap.md`** — three line-edits bundled (flip ADR-0009 to Shipped, replace this iteration's Considering entry with a Shipped one, add engagement Considering entry).

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

## Validation

No code to test. Validation is read-the-diff:

1. After Commit 1, grep `docs/out-of-scope.md` for `Required re-reviewer engagement` — verify exactly one match.
2. After Commit 2, grep `docs/roadmap.md` for `ADR-0009: Agentic-actor registry` — verify exactly one match, with `[x]` prefix, located in the Shipped subsection.
3. After Commit 2, grep `docs/roadmap.md` for `v1 propagation gap audit` — verify exactly one match, with `[x]` prefix, in the Shipped subsection.
4. After Commit 2, grep `docs/roadmap.md` for `Required re-reviewer engagement` — verify exactly one match, with `[ ]` prefix, in the Considering subsection.

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

- **Were the four planned v1 `roadmap.md` updates fully audited?** Per Audit results above, three of the four planned updates landed (Shipped entry, tech-debt clearing entry, the two-cross-cutting-deferrals item is itself the gap this iteration fixes); the fourth (per-role-bot-identities note) was effectively moot because per-role-bot-identities rewrote the entry. This audit claims completeness on the v1 propagation set; if a future reader finds an additional v1-planned-vs-landed gap, treat this audit as imperfect rather than canonical.
- **Are there parallel gaps in other specs' propagations?** Out of scope for this iteration (Non-goals). The pattern that surfaced v1's gap was the v2 author noticing during a related spec's brainstorm. If no other spec author notices, no other gap is currently known. A future systematic audit would surface them.
- **Did the per-role-bot-identities note really have nowhere to live?** The audit's judgment is that the per-role-bot-identities entry was rewritten Shipped-style two days after v1 merged, replacing the Considering entry's text wholesale. The "note about `gcscode-respondent` being a new actor identity" planned by v1 would have lived in the Considering entry's text; that text was replaced. A weaker version of the planned note ("Respondent identity untouched.") DID land in the per-role-bot-identities Shipped entry's text. This audit treats the planned note as effectively delivered in spirit; a stricter reading might judge it as a small gap. Not load-bearing enough to backfill either way.

## Future iterations

Each gets its own brainstorm when triggered.

1. **Required re-reviewer engagement with respondent posts** — the deferral this iteration backfills. Trigger: optional-engagement-never-fires tripwire fires, OR brainstorm surfaces requirement.
2. **Systematic propagation audit across all prior specs** — a sweeping audit beyond v1. Trigger: a second prior-spec propagation gap surfaces, suggesting v1's gap was not a one-off.
3. **Automated post-merge propagation verification** — a script that reads a merged spec's propagation section and verifies the edits landed. Trigger: gap-rate justifies tooling investment.

## Origin

Surfaced by [`docs/specs/2026-05-16-respondent-subagent-v2.md`](2026-05-16-respondent-subagent-v2.md) Known Unknowns (v2's brainstorm noticed via grep that v1's planned `out-of-scope.md` entries never landed). Queued as a Considering item in `docs/roadmap.md` at PR #16 merge time. User selected this iteration as the warm-up before the queued retroactive ADR for reviews-as-artifacts (a separate Considering item on the same roadmap).

B-scope (audit + adjacent stale-checkbox fix) chosen over A-scope (audit only) on the user's call 2026-05-25: the ADR-0009 stale `[ ]` was one line away from the audit work; leaving it for "next iteration" is the pattern that produced the v1 gap in the first place.
