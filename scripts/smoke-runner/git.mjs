// What the runner reads from git: the checkout under test, master's merge
// commits, and the worktree's PR.
//
// Spec: docs/specs/2026-11-24-smoke-test-runner.md (§ Which tickets wait, § The runner).

import { basename, dirname } from 'node:path';

/** @typedef {(args: string[]) => string} Git runs git in the checkout and returns its stdout */

/**
 * The PR number a worktree's directory names, from the playbook's recipe
 * (`.worktrees/pr-<n>`).
 * @param {string} root the checkout's top-level directory
 * @returns {number | null}
 */
export function worktreePr(root) {
  const m = /^pr-(\d+)$/.exec(basename(root));
  return m && basename(dirname(root)) === '.worktrees' ? Number(m[1]) : null;
}

/**
 * The PR numbers merged into master, each with its merge commit: a commit on
 * master's first-parent history whose subject starts `Merge pull request #<n> `.
 * @param {Git} git
 * @param {string} ref
 * @returns {Map<number, string>} PR number to merge commit
 */
export function mergeCommits(git, ref) {
  const merged = new Map();
  for (const line of git(['log', '--first-parent', '--format=%H %s', ref]).split('\n')) {
    const m = /^([0-9a-f]+) Merge pull request #(\d+) /.exec(line);
    if (m && !merged.has(Number(m[2]))) merged.set(Number(m[2]), m[1]);
  }
  return merged;
}

/**
 * The checkout's state.
 * @param {Git} git
 * @returns {{ root: string, head: string, short: string, dirty: boolean, master: string, behindMaster: number | null, merges: Map<number, string>, fetchError: string | null }}
 *   `fetchError`: why `git fetch origin master` failed, when it did; master is then the last one fetched
 *   `behindMaster`: how many commits HEAD is behind master when it is an
 *   older commit of master, 0 on its tip, null when not on master at all
 */
export function readCheckout(git) {
  const root = git(['rev-parse', '--show-toplevel']).trim();
  let fetchError = null;
  try {
    git(['fetch', '--quiet', 'origin', 'master']);
  } catch (e) {
    fetchError = (e instanceof Error ? e.message : String(e)).split('\n')[0];
  }
  const head = git(['rev-parse', 'HEAD']).trim();
  const master = git(['rev-parse', 'origin/master']).trim();
  const dirty = git(['status', '--porcelain']).trim() !== '';
  return {
    root,
    head,
    short: head.slice(0, 7),
    dirty,
    master,
    behindMaster: behind(git, head, master),
    merges: mergeCommits(git, 'origin/master'),
    fetchError,
  };
}

/**
 * How many commits `commit` is behind `tip`, or null when it is not on it.
 * @param {Git} git
 * @param {string} commit
 * @param {string} tip
 * @returns {number | null}
 */
export function behind(git, commit, tip) {
  try {
    git(['merge-base', '--is-ancestor', commit, tip]);
  } catch {
    return null;
  }
  return Number(git(['rev-list', '--count', `${commit}..${tip}`]).trim());
}

/**
 * Where HEAD stands against the PR's latest head, after fetching it.
 * @param {Git} git
 * @param {string} head
 * @param {number} pr
 * @returns {{ prHead: string, behind: number | null }} `behind` null: HEAD is not on the PR
 */
export function againstPr(git, head, pr) {
  git(['fetch', '--quiet', 'origin', `pull/${pr}/head`]);
  const prHead = git(['rev-parse', 'FETCH_HEAD']).trim();
  return { prHead, behind: behind(git, head, prHead) };
}

/**
 * A PR's own commits after a draft pass, from its merge commit.
 * @param {Git} git
 * @param {string} pass the commit the draft pass ran on
 * @param {string} merge the PR's merge commit on master
 * @returns {string[] | null} one `<short> <subject>` per commit; null when the pass commit is unknown here
 */
export function commitsAfter(git, pass, merge) {
  try {
    const out = git([
      'log',
      '--no-merges',
      '--format=%h %s',
      `${pass}..${merge}^2`,
      `^${merge}^1`,
    ]).trim();
    return out ? out.split('\n') : [];
  } catch {
    return null;
  }
}
