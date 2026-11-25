import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { behind, commitsAfter, mergeCommits, worktreePr } from './smoke-runner/git.mjs';

/** A throwaway repository with a master that merges two PR branches. */
function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'smoke-git-'));
  const git = (args) =>
    execFileSync('git', args, {
      cwd: dir,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 't',
        GIT_AUTHOR_EMAIL: 't@example.com',
        GIT_COMMITTER_NAME: 't',
        GIT_COMMITTER_EMAIL: 't@example.com',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  const commit = (file, msg) => {
    writeFileSync(join(dir, file), msg);
    git(['add', file]);
    git(['commit', '-q', '-m', msg]);
    return git(['rev-parse', 'HEAD']).trim();
  };
  git(['init', '-q', '-b', 'master']);
  commit('a', 'root');
  git(['switch', '-q', '-c', 'one']);
  const pass = commit('b', 'pr 1 first');
  git(['switch', '-q', 'master']);
  commit('m', 'master moves on');
  // The PR's branch takes master in after the pass, so master's commit is
  // reachable from the branch but is not the PR's own.
  git(['switch', '-q', 'one']);
  git(['merge', '-q', '--no-ff', 'master', '-m', 'Merge branch master into one']);
  const review = commit('b', 'pr 1 review fix');
  git(['switch', '-q', 'master']);
  git(['merge', '-q', '--no-ff', 'one', '-m', 'Merge pull request #1 from x/one']);
  const merge1 = git(['rev-parse', 'HEAD']).trim();
  git(['switch', '-q', '-c', 'ten']);
  commit('c', 'pr 10 only');
  git(['switch', '-q', 'master']);
  git(['merge', '-q', '--no-ff', 'ten', '-m', 'Merge pull request #10 from x/ten']);
  const merge10 = git(['rev-parse', 'HEAD']).trim();
  const tip = commit('d', 'Merge pull request #11 is only a subject on a plain commit');
  return {
    dir,
    git,
    pass,
    review,
    merge1,
    merge10,
    tip,
    done: () => rmSync(dir, { recursive: true }),
  };
}

test('mergeCommits finds each PR’s merge on the first-parent history, #1 apart from #10', () => {
  const r = repo();
  try {
    const merges = mergeCommits(r.git, 'master');
    assert.equal(merges.get(1), r.merge1);
    assert.equal(merges.get(10), r.merge10);
    // A plain commit whose subject reads like one counts too, as the spec's
    // rule is the subject; what it may not do is match the wrong number.
    assert.equal(merges.get(11), r.tip);
    assert.equal(merges.has(2), false);
  } finally {
    r.done();
  }
});

test('mergeCommits does not see merges off the first-parent history', () => {
  const r = repo();
  try {
    // A PR branch that merged another branch under a PR-like subject, then
    // merged into master itself.
    r.git(['switch', '-q', '-c', 'side']);
    r.git(['switch', '-q', '-c', 'inner']);
    writeFileSync(join(r.dir, 'e'), 'e');
    r.git(['add', 'e']);
    r.git(['commit', '-q', '-m', 'inner work']);
    r.git(['switch', '-q', 'side']);
    r.git(['merge', '-q', '--no-ff', 'inner', '-m', 'Merge pull request #99 from x/inner']);
    r.git(['switch', '-q', 'master']);
    r.git(['merge', '-q', '--no-ff', 'side', '-m', 'Merge pull request #12 from x/side']);
    const merges = mergeCommits(r.git, 'master');
    assert.equal(merges.has(12), true);
    assert.equal(merges.has(99), false);
  } finally {
    r.done();
  }
});

test('commitsAfter lists only the PR’s own commits after the pass', () => {
  const r = repo();
  try {
    const after = commitsAfter(r.git, r.pass, r.merge1);
    assert.deepEqual(
      after?.map((l) => l.replace(/^[0-9a-f]+ /, '')),
      ['pr 1 review fix'],
    );
    assert.deepEqual(commitsAfter(r.git, r.review, r.merge1), []);
    assert.equal(commitsAfter(r.git, 'deadbeefdeadbeef', r.merge1), null);
  } finally {
    r.done();
  }
});

test('behind counts the commits to a tip, or says null off it', () => {
  const r = repo();
  try {
    assert.equal(behind(r.git, r.tip, r.tip), 0);
    assert.equal(behind(r.git, r.merge10, r.tip), 1);
    assert.equal(behind(r.git, r.merge1, r.tip), 3);
    assert.equal(behind(r.git, r.pass, r.review), 3);
    assert.equal(behind(r.git, r.review, r.pass), null);
  } finally {
    r.done();
  }
});

test('worktreePr reads .worktrees/pr-<n> only', () => {
  assert.equal(worktreePr('/x/gcscode/.worktrees/pr-109'), 109);
  assert.equal(worktreePr('/x/gcscode/.worktrees/radio-replay'), null);
  assert.equal(worktreePr('/x/elsewhere/pr-109'), null);
  assert.equal(worktreePr('/x/gcscode'), null);
});
