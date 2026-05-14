# Test artifact — auto-merge gate-2 class-rejection mechanics validation

This file exists solely to give the validation PR something to diff. It is NOT deleted; the branch and PR stay as a permanent worked example, joining PR #1 (reviews-as-artifacts), PR #3 (red-team mechanics), and PR #6 (spec-quality + red-team parallel-dispatch).

Purpose: exercise gate 2 of `.github/workflows/auto-merge.yml` from `docs/specs/2026-05-14-auto-merge-on-user-approval.md`. The branch deliberately matches `test/*`, NOT `feat/*`/`spec/*`/`adr/*`. When the `auto-merge` label is added to the PR, the workflow should:

1. Pre-gate pass (PR isn't draft after we transition to ready)
2. Gate 1 pass (`auto-merge` label is present)
3. **Gate 2 FAIL** (head is `test/auto-merge-validation`; not in the recognized class allowlist)
4. Workflow exits cleanly with `exit 0`; no merge attempted

Expected workflow log: green run (exit 0), with a log line "`Gate 2 FAILED: head 'test/auto-merge-validation' is not feat/, spec/, or adr/. Exiting cleanly.`"

If you're reading this on the merged master branch — you weren't supposed to. This file only exists on `test/auto-merge-validation`.
