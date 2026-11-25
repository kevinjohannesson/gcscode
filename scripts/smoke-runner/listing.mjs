// Which tests the checkout lists, and what each may record.
//
// Spec: docs/specs/2026-11-24-smoke-test-runner.md (§ Which tickets wait, § The runner, § Submit).

import { latestResult, provenOnMaster } from './result.mjs';

/**
 * @typedef {import('./playbook.mjs').Row} Row
 * @typedef {import('./linear.mjs').Issue} Issue
 * @typedef {import('./github.mjs').Pr} Pr
 * @typedef {import('./result.mjs').Result} Result
 * @typedef {import('./result.mjs').Where} Where
 *
 * @typedef {object} Checkout
 * @property {string} head
 * @property {string} short
 * @property {boolean} dirty
 * @property {string} master origin/master's tip
 * @property {number | null} behindMaster 0 on master's tip
 * @property {Map<number, string>} merges PR number to merge commit
 *
 * @typedef {{ pr: number, prHead: string, behind: number | null }} PrContext
 *   the draft's PR; `behind` null when HEAD is not on the PR's head
 *
 * @typedef {object} Listed
 * @property {Row} row
 * @property {Issue | null} issue
 * @property {(Pr & { mergeCommit: string | null })[]} prs
 * @property {Result | null} latest
 * @property {boolean} closedWithoutTest Done without a pass on merged code
 * @property {Where | null} where where a result here is recorded; null when none can be
 * @property {string | null} why why no result can be recorded, or a warning
 * @property {{ from: Result, commits: { pr: number, commits: string[] | null }[] } | null} count
 *   the Count the draft pass offer
 */

/**
 * @param {object} input
 * @param {Row[]} input.rows
 * @param {Checkout} input.checkout
 * @param {PrContext | null} input.prContext null on master's tip, or when no PR is known
 * @param {Map<string, Issue | null> | null} input.issues by ticket; null without a Linear key
 * @param {Map<string, Pr[] | Error>} input.prs by row anchor
 * @param {(pass: string, merge: string) => string[] | null} input.commitsAfter
 * @returns {{ mode: 'master' | 'draft', listed: Listed[], notice: string | null }}
 */
export function listTests({ rows, checkout, prContext, issues, prs, commitsAfter }) {
  const onMaster = checkout.behindMaster === 0;
  let notice = null;
  if (!onMaster) {
    if (checkout.behindMaster !== null) {
      notice = `This checkout is ${checkout.behindMaster} commits behind master. To test merged code, bring it up to date first (see "Before you start").`;
    }
    if (!prContext) {
      return {
        mode: 'draft',
        listed: [],
        notice: `${notice ? notice + ' ' : ''}Not on master's tip and not in a .worktrees/pr-<n> worktree: pick the PR this checkout holds.`,
      };
    }
    if (prContext.behind === null) {
      return {
        mode: 'draft',
        listed: [],
        notice: `HEAD is not on PR #${prContext.pr}'s head, so nothing here can be recorded for it. Bring the worktree to the PR's head (see "Before you start").`,
      };
    }
    if (prContext.behind > 0) {
      notice = `HEAD is ${prContext.behind} commits behind PR #${prContext.pr}'s head. Update the worktree (see "Before you start") unless you mean to test this commit.`;
    }
  }

  const listed = [];
  for (const row of rows) {
    const issue = issues?.get(row.ticket ?? '') ?? null;
    if (issue?.state.type === 'canceled') continue;
    const latest = issue ? latestResult(issue.comments) : null;
    const found = prs.get(row.anchor);
    const rowPrs =
      found instanceof Error || !found
        ? []
        : found.map((p) => ({ ...p, mergeCommit: checkout.merges.get(p.number) ?? null }));
    // A PR merged into another branch is not on master.
    const onMasterMerged = (p) => p.state === 'merged' && p.base === 'master';
    const elsewhere = rowPrs.filter((p) => p.state === 'merged' && p.base !== 'master');
    const allMerged = rowPrs.length > 0 && rowPrs.every(onMasterMerged);
    const done = issue?.state.type === 'completed';
    const closedWithoutTest = done && !provenOnMaster(latest);

    let where = null;
    let why = null;
    if (onMaster) {
      if (issues && done && !closedWithoutTest) continue;
      const open = rowPrs.filter((p) => p.state === 'open');
      if (!issues) why = 'No Linear key: nothing can be recorded.';
      else if (!issue) why = `${row.ticket ?? 'Its ticket'} was not found in Linear.`;
      else if (found instanceof Error) why = `Could not read its PRs from GitHub: ${found.message}`;
      else if (rowPrs.length === 0) why = 'No PR found for this row.';
      else if (open.length) {
        why = `${open.map((p) => `PR #${p.number}`).join(', ')} still open: record it in that PR's worktree.`;
      } else if (elsewhere.length) {
        why = elsewhere
          .map(
            (p) =>
              `PR #${p.number} merged into ${p.base}, not master: record it once it reaches master.`,
          )
          .join(' ');
      } else where = { kind: 'master' };
    } else {
      const pr = /** @type {PrContext} */ (prContext).pr;
      if (found instanceof Error) why = `Could not read its PRs from GitHub: ${found.message}`;
      else if (!rowPrs.some((p) => p.number === pr) || allMerged) continue;
      else if (!issues) why = 'No Linear key: nothing can be recorded.';
      else if (!issue) why = `${row.ticket ?? 'Its ticket'} was not found in Linear.`;
      else where = { kind: 'draft', pr };
    }

    let count = null;
    if (
      where?.kind === 'master' &&
      latest?.outcome === 'passed' &&
      latest.where.kind === 'draft' &&
      latest.sha &&
      rowPrs.every((p) => p.mergeCommit)
    ) {
      const from = latest;
      count = {
        from,
        commits: rowPrs.map((p) => ({
          pr: p.number,
          commits: commitsAfter(
            /** @type {string} */ (from.sha),
            /** @type {string} */ (p.mergeCommit),
          ),
        })),
      };
    }
    listed.push({ row, issue, prs: rowPrs, latest, closedWithoutTest, where, why, count });
  }
  return { mode: onMaster ? 'master' : 'draft', listed, notice };
}
