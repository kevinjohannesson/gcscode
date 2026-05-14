# Test artifact — spec-quality + red-team parallel-dispatch mechanics validation

This file exists solely to give the validation PR something to diff. It is NOT deleted; the branch and PR stay as a permanent worked example, same as PR #1 (reviews-as-artifacts) and PR #3 (red-team mechanics).

Purpose: exercise the parallel auto-dispatch of red-team + spec-quality on a spec PR from `docs/specs/2026-05-14-spec-quality-reviewer.md` with **scripted** verdicts. Reviewer judgment is not exercised here — Plan 2 of that spec covers organic critique on the next real spec PR.

This is the first PR where the new `Auto-dispatch on spec/ADR PRs` obligation in CLAUDE.md applies to two roles simultaneously. The smoke test validates:

- Both reviews post under `gcscode-reviewer[bot]`.
- Headers match the conventions (red-team form + spec-quality form).
- Both reviews appear independently in the PR timeline.
- `reviewDecision` stays empty throughout (both advisory `--comment`).
- Re-review pattern works for both roles in parallel.
- No token-helper collision under parallel dispatch.

If you're reading this on the merged master branch — you weren't supposed to. This file only exists on `test/spec-quality-iteration-validation`.
