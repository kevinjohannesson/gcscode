# Test artifact — red-team mechanics validation

This file exists solely to give the validation PR something to diff. It is NOT deleted; the branch and PR stay as a permanent worked example, same as PR #1 (reviews-as-artifacts mechanics).

Purpose: exercise the red-team auto-dispatch + header convention + `Checked against:` audit trail + re-review mechanics from `docs/specs/2026-05-14-red-team-reviewer.md` with **scripted** verdicts. Reviewer judgment is not exercised here — Plan 2 of that spec covers critique quality on real spec PRs after this iteration ships.

If you're reading this on the merged master branch — you weren't supposed to. This file only exists on the `test/red-team-iteration-validation` branch.

## Followup note

Added per the scripted re-review test in the iteration's smoke plan. The re-review dispatch will include this commit's SHA in its `(re-review of <SHA>)` header to verify the followup-commit convention.
