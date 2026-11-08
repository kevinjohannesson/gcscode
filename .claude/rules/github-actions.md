---
paths:
  - '.github/**'
---

# GitHub Actions

- A workflow that runs `gh` without `actions/checkout` has no git directory to infer the repository from: set `GH_REPO: ${{ github.repository }}` in the step's env.
- `pull_request` and `pull_request_review` runs use the workflow file from the PR's head branch, not master. A workflow fix on master doesn't reach an open PR until its branch has it, and a PR that changes a workflow is tested by its own version.
