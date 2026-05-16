# Respondent mechanics smoke test (test PR — permanent reference artifact)

This PR is the mechanics smoke test for the `gcscode-respondent[bot]` GitHub App identity introduced by [`docs/specs/2026-05-16-review-discussion-loop-v1.md`](specs/2026-05-16-review-discussion-loop-v1.md).

## Purpose

Verify that the post-merge implementation of the review-discussion-loop-v1 iteration works end-to-end:

1. The helper script `.claude/scripts/gh-app-token-respondent` generates a valid GitHub App installation token (prefix `ghs_...`).
2. The `respondentApp` block in `.claude/agent-config.json` carries the right App ID + installation ID for the new `gcscode-respondent` GitHub App.
3. The `GH_RESPONDENT_APP_PRIVATE_KEY_PATH` env var points to a valid `.pem` file that signs JWT requests correctly.
4. Posting a comment to a PR using the respondent token lands the comment under the `gcscode-respondent[bot]` identity, visually distinct from `gcscode-reviewer[bot]`.

## Disposition

Kept open as a **permanent reference artifact**, alongside the existing test PRs (PR #1 reviews-as-artifacts, PR #3 reviewer-template-mechanics, PR #6 reviewer-role-design-conventions, PR #8 auto-merge-validation, PR #10 multi-model-secondary-validation, and PR #11's effort-max-validation when it lands). **NOT to be merged.**

Future PRs that revisit the respondent mechanism can refer to this PR's comments to see the original mechanics validation.
