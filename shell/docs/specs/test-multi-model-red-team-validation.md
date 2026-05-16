# Test artifact — multi-model red-team triple-parallel-dispatch mechanics validation

This file exists solely to give the validation PR something to diff. It is NOT deleted; the branch and PR stay as a permanent worked example, joining PR #1 (reviews-as-artifacts), PR #3 (red-team mechanics), PR #6 (two-parallel red-team + spec-quality), and PR #8 (auto-merge gate-2 rejection).

Purpose: exercise **triple-parallel dispatch** from `docs/specs/2026-05-16-multi-model-red-team-v1.md`. The three subagents that fire on this PR:

1. red-team Opus 4.7 (primary)
2. red-team Sonnet 4.6 (secondary; the multi-model pair under test)
3. spec-quality Sonnet 4.6 (single model)

**Scripted verdicts** (not real critique judgment — that's Plan 2 on the next real spec/ADR PR). All three reviews are pre-written and posted via scripted dispatches.

Expected mechanics:

- All three reviews post under `gcscode-reviewer[bot]`.
- Headers distinguishable: `## Red-team review — spec — Claude Opus 4.7`, `## Red-team review — spec — Claude Sonnet 4.6`, `## Spec-quality review — spec — Claude Sonnet 4.6`.
- All three appear independently in the PR timeline (no race).
- `reviewDecision` stays empty throughout (all advisory `--comment`).
- No token-helper collisions under triple-parallel (extends PR #6's dual-parallel evidence).

If you're reading this on the merged master branch — you weren't supposed to. This file only exists on `test/multi-model-red-team-validation`.
