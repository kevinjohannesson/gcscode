---
paths:
  - '.github/**'
---

# GitHub Actions

- A workflow that runs `gh` without `actions/checkout` has no git directory to infer the repository from: set `GH_REPO: ${{ github.repository }}` in the step's env.
- `pull_request` and `pull_request_review` runs use the workflow file from the PR's head branch, not master. A workflow fix on master doesn't reach an open PR until its branch has it, and a PR that changes a workflow is tested by its own version.
- `pull_request_target` and `workflow_run` runs use the base branch's (for `workflow_run`, the default branch's) workflow file, with a write token even for a fork's PR. A workflow on those triggers never checks out, builds or runs the PR's code; `auto-merge.yml` fetches the head only as git objects, and takes only same-repository PRs into the default branch. A review reaches it through `review-relay.yml`, a `pull_request_review` workflow with no permissions that does nothing but complete.
- The pulls/files API (and `changed_files`) diffs against the base commit GitHub recorded for the PR, not against the base branch now, so a PR whose branch merged master in after it was opened lists master's newer changes as its own. For the files a PR really changes, diff from `git merge-base origin/<base> <head>` to the head.
