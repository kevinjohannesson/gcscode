import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listTests } from './smoke-runner/listing.mjs';
import { renderComment } from './smoke-runner/result.mjs';

const section = { title: 'T', anchor: 't', goal: 'g', blocks: [], scenarios: [] };
const rowOf = (anchor, ticket, prs = []) => ({
  name: anchor,
  anchor,
  ticket,
  prs,
  needs: '',
  section,
});

const STATES = {
  smoke: { id: 's', name: 'Smoke Test', type: 'started' },
  done: { id: 'd', name: 'Done', type: 'completed' },
  canceled: { id: 'c', name: 'Canceled', type: 'canceled' },
  progress: { id: 'p', name: 'In Progress', type: 'started' },
};
const result = (outcome, where, sha = 'aaaaaaa') =>
  renderComment({ outcome, date: '2026-11-24', sha, where, dirty: false, scenarios: [] });
const issue = (ticket, state, comments = []) => ({
  id: `id-${ticket}`,
  identifier: ticket,
  title: ticket,
  url: `https://linear.app/x/${ticket}`,
  state: STATES[state],
  team: { id: 'team', states: Object.values(STATES) },
  projectId: null,
  comments: comments.map((body, i) => ({ body, createdAt: `2026-11-24T0${i}:00:00.000Z` })),
});
const pr = (number, state, base = 'master') => ({ number, state, title: `PR ${number}`, base });
const master = (merges = {}) => ({
  head: 'm',
  short: 'm',
  dirty: false,
  master: 'm',
  behindMaster: 0,
  merges: new Map(Object.entries(merges).map(([k, v]) => [Number(k), v])),
});
const noCommits = () => [];

test('on master’s tip it lists waiting tickets and Done ones without a pass on merged code', () => {
  const rows = [
    rowOf('waiting', 'GCS-1', [1]),
    rowOf('passed', 'GCS-2', [2]),
    rowOf('closed-early', 'GCS-3', [3]),
    rowOf('draft-pass-only', 'GCS-4', [4]),
    rowOf('canceled', 'GCS-5', [5]),
    rowOf('backfilled', 'GCS-6', [6]),
  ];
  const issues = new Map([
    ['GCS-1', issue('GCS-1', 'smoke')],
    ['GCS-2', issue('GCS-2', 'done', [result('passed', { kind: 'master' })])],
    ['GCS-3', issue('GCS-3', 'done')],
    ['GCS-4', issue('GCS-4', 'done', [result('passed', { kind: 'draft', pr: 4 })])],
    ['GCS-5', issue('GCS-5', 'canceled')],
    [
      'GCS-6',
      issue('GCS-6', 'done', [
        "<!-- smoke-test-result v1 -->\n\n**Smoke test passed** by 2026-11-24 (master, commit not recorded). Backfilled from the owner's reports.",
      ]),
    ],
  ]);
  const prs = new Map(rows.map((r) => [r.anchor, [pr(r.prs[0], 'merged')]]));
  const merges = { 1: 'c1', 2: 'c2', 3: 'c3', 4: 'c4', 5: 'c5', 6: 'c6' };
  const { mode, listed } = listTests({
    rows,
    checkout: master(merges),
    prContext: null,
    issues,
    prs,
    commitsAfter: noCommits,
  });
  assert.equal(mode, 'master');
  assert.deepEqual(
    listed.map((l) => [l.row.anchor, l.closedWithoutTest, l.where?.kind ?? null]),
    [
      ['waiting', false, 'master'],
      ['closed-early', true, 'master'],
      ['draft-pass-only', true, 'master'],
    ],
  );
});

test('on master’s tip a row with an open PR takes no result, and points to the worktree', () => {
  const rows = [rowOf('t', 'GCS-1', [1])];
  const { listed } = listTests({
    rows,
    checkout: master({ 1: 'c1' }),
    prContext: null,
    issues: new Map([['GCS-1', issue('GCS-1', 'smoke')]]),
    prs: new Map([['t', [pr(1, 'merged'), pr(7, 'open')]]]),
    commitsAfter: noCommits,
  });
  assert.equal(listed[0].where, null);
  assert.equal(listed[0].why, "PR #7 still open: record it in that PR's worktree.");
});

test('a draft pass is offered for counting once every PR merged, with each PR’s later commits', () => {
  const rows = [rowOf('t', 'GCS-1', [1])];
  const calls = [];
  const { listed } = listTests({
    rows,
    checkout: master({ 1: 'merge1', 3: 'merge3' }),
    prContext: null,
    issues: new Map([
      ['GCS-1', issue('GCS-1', 'smoke', [result('passed', { kind: 'draft', pr: 1 }, 'bbbbbbb')])],
    ]),
    prs: new Map([['t', [pr(1, 'merged'), pr(3, 'merged')]]]),
    commitsAfter: (pass, merge) => {
      calls.push([pass, merge]);
      return merge === 'merge1' ? ['abc review fix'] : [];
    },
  });
  assert.deepEqual(calls, [
    ['bbbbbbb', 'merge1'],
    ['bbbbbbb', 'merge3'],
  ]);
  assert.deepEqual(listed[0].count?.commits, [
    { pr: 1, commits: ['abc review fix'] },
    { pr: 3, commits: [] },
  ]);
});

test('no Count when a merged PR has no merge commit, though master can still record', () => {
  const rows = [rowOf('t', 'GCS-1', [1])];
  const { listed } = listTests({
    rows,
    checkout: master({}),
    prContext: null,
    issues: new Map([
      ['GCS-1', issue('GCS-1', 'smoke', [result('passed', { kind: 'draft', pr: 1 })])],
    ]),
    prs: new Map([['t', [pr(1, 'merged')]]]),
    commitsAfter: noCommits,
  });
  assert.equal(listed[0].count, null);
  assert.equal(listed[0].prs[0].mergeCommit, null);
  assert.deepEqual(listed[0].where, { kind: 'master' });
});

test('in a PR’s worktree it lists only that PR’s rows that have not all merged', () => {
  const rows = [
    rowOf('mine', 'GCS-1', [9]),
    rowOf('other', 'GCS-2', [8]),
    rowOf('merged', 'GCS-3', [9]),
  ];
  const { mode, listed, notice } = listTests({
    rows,
    checkout: { ...master({}), head: 'h', short: 'h', behindMaster: null },
    prContext: { pr: 9, prHead: 'h', behind: 0 },
    issues: new Map([
      ['GCS-1', issue('GCS-1', 'progress')],
      ['GCS-2', issue('GCS-2', 'smoke')],
      ['GCS-3', issue('GCS-3', 'smoke')],
    ]),
    prs: new Map([
      ['mine', [pr(9, 'open')]],
      ['other', [pr(8, 'open')]],
      ['merged', [pr(9, 'merged')]],
    ]),
    commitsAfter: noCommits,
  });
  assert.equal(mode, 'draft');
  assert.equal(notice, null);
  assert.deepEqual(
    listed.map((l) => [l.row.anchor, l.where]),
    [['mine', { kind: 'draft', pr: 9 }]],
  );
});

test('a worktree behind its PR says so, and one off the PR records nothing', () => {
  const base = {
    rows: [rowOf('mine', 'GCS-1', [9])],
    checkout: { ...master({}), head: 'h', short: 'h', behindMaster: null },
    issues: new Map([['GCS-1', issue('GCS-1', 'progress')]]),
    prs: new Map([['mine', [pr(9, 'open')]]]),
    commitsAfter: noCommits,
  };
  const behind = listTests({ ...base, prContext: { pr: 9, prHead: 'p', behind: 2 } });
  assert.equal(behind.listed.length, 1);
  assert.equal(
    behind.notice,
    `HEAD is 2 commits behind PR #9's head. Update the worktree (see "Before you start") unless you mean to test this commit.`,
  );
  const off = listTests({ ...base, prContext: { pr: 9, prHead: 'p', behind: null } });
  assert.deepEqual(off.listed, []);
  assert.equal(
    off.notice,
    `HEAD is not on PR #9's head, so nothing here can be recorded for it. Bring the worktree to the PR's head (see "Before you start").`,
  );
});

test('an old commit of master with no PR picked lists nothing and says how far behind', () => {
  const { listed, notice } = listTests({
    rows: [rowOf('t', 'GCS-1', [1])],
    checkout: { ...master({ 1: 'c' }), head: 'old', behindMaster: 4 },
    prContext: null,
    issues: new Map([['GCS-1', issue('GCS-1', 'smoke')]]),
    prs: new Map([['t', [pr(1, 'merged')]]]),
    commitsAfter: noCommits,
  });
  assert.deepEqual(listed, []);
  assert.equal(
    notice,
    `This checkout is 4 commits behind master. To test merged code, bring it up to date first (see "Before you start"). Not on master's tip and not in a .worktrees/pr-<n> worktree: pick the PR this checkout holds.`,
  );
});

test('without a Linear key every row is shown and none can record', () => {
  const { listed } = listTests({
    rows: [rowOf('a', 'GCS-1', [1]), rowOf('b', 'GCS-2', [2])],
    checkout: master({ 1: 'c1', 2: 'c2' }),
    prContext: null,
    issues: null,
    prs: new Map([
      ['a', [pr(1, 'merged')]],
      ['b', [pr(2, 'merged')]],
    ]),
    commitsAfter: noCommits,
  });
  assert.deepEqual(
    listed.map((l) => [l.row.anchor, l.where, l.why]),
    [
      ['a', null, 'No Linear key: nothing can be recorded.'],
      ['b', null, 'No Linear key: nothing can be recorded.'],
    ],
  );
});

test('a PR merged into another branch is not on master, so master takes no result', () => {
  const { listed } = listTests({
    rows: [rowOf('t', 'GCS-1', [1])],
    checkout: master({}),
    prContext: null,
    issues: new Map([['GCS-1', issue('GCS-1', 'smoke')]]),
    prs: new Map([['t', [pr(1, 'merged', 'feature-x')]]]),
    commitsAfter: noCommits,
  });
  assert.equal(listed[0].where, null);
  assert.equal(
    listed[0].why,
    'PR #1 merged into feature-x, not master: record it once it reaches master.',
  );
});

test('in a worktree, a row whose PRs GitHub could not read is shown with why', () => {
  const { listed } = listTests({
    rows: [rowOf('t', 'GCS-1', [9])],
    checkout: { ...master({}), head: 'h', short: 'h', behindMaster: null },
    prContext: { pr: 9, prHead: 'h', behind: 0 },
    issues: new Map([['GCS-1', issue('GCS-1', 'progress')]]),
    prs: new Map([['t', new Error('gh: not logged in')]]),
    commitsAfter: noCommits,
  });
  assert.deepEqual(
    listed.map((l) => [l.row.anchor, l.where, l.why]),
    [['t', null, 'Could not read its PRs from GitHub: gh: not logged in']],
  );
});

test('in a worktree, a row whose PR merged into another branch is still a draft’s to record', () => {
  const { listed } = listTests({
    rows: [rowOf('t', 'GCS-1', [9])],
    checkout: { ...master({}), head: 'h', short: 'h', behindMaster: null },
    prContext: { pr: 9, prHead: 'h', behind: 0 },
    issues: new Map([['GCS-1', issue('GCS-1', 'progress')]]),
    prs: new Map([['t', [pr(9, 'merged', 'stack')]]]),
    commitsAfter: noCommits,
  });
  assert.deepEqual(
    listed.map((l) => l.where),
    [{ kind: 'draft', pr: 9 }],
  );
});
