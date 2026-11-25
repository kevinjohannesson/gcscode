import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextState, planRun, runSummary, runWrite } from './smoke-runner/submit.mjs';

const STATES = [
  { id: 's-backlog', name: 'Backlog', type: 'backlog' },
  { id: 's-progress', name: 'In Progress', type: 'started' },
  { id: 's-smoke', name: 'Smoke Test', type: 'started' },
  { id: 's-done', name: 'Done', type: 'completed' },
];
const section = {
  title: 'Radio probe',
  anchor: 'radio-probe',
  goal: 'g',
  blocks: [],
  scenarios: [
    { name: 'Start', from: 0, to: 1 },
    { name: 'Scenario 1, sticks', from: 1, to: 2 },
  ],
};
const listedOf = (where, state = 'Smoke Test', extra = {}) => ({
  row: {
    name: 'Radio probe',
    anchor: 'radio-probe',
    ticket: 'GCS-13',
    prs: [63],
    needs: '',
    section,
  },
  issue: {
    id: 'issue-13',
    identifier: 'GCS-13',
    title: 't',
    url: 'u',
    state: STATES.find((s) => s.name === state),
    team: { id: 'team', states: STATES },
    projectId: 'project',
    comments: [],
  },
  prs: [],
  latest: null,
  closedWithoutTest: false,
  where,
  why: null,
  count: null,
  ...extra,
});
const context = { date: '2026-11-24', short: 'abc1234', dirty: false, onMaster: true };

/** A fake Linear that records each call in order. */
function fakeLinear({ failOnce = new Set() } = {}) {
  const calls = [];
  let n = 200;
  const maybeFail = (kind) => {
    if (failOnce.has(kind)) {
      failOnce.delete(kind);
      throw new Error(`${kind} refused`);
    }
  };
  return {
    calls,
    async finding(input) {
      calls.push(['finding', input]);
      maybeFail('finding');
      return `GCS-${n++}`;
    },
    async uploadTarget(input) {
      calls.push(['uploadTarget', input]);
      return { uploadUrl: 'https://upload', assetUrl: 'https://asset/run.mov', headers: [] };
    },
    async comment(issueId, body) {
      calls.push(['comment', issueId, body]);
      maybeFail('comment');
      return 'https://linear.app/comment';
    },
    async move(issueId, stateId) {
      calls.push(['move', issueId, stateId]);
    },
    async issue() {
      return null;
    },
  };
}

async function sendAll(run, deps) {
  for (let t = 0; t < run.tests.length; t++) {
    for (let w = 0; w < run.tests[t].writes.length; w++) {
      if (run.tests[t].writes[w].status === 'done') continue;
      const res = await runWrite(run, t, w, deps);
      if (res.status !== 'done') break;
    }
  }
}

test('nextState follows the Submit table', () => {
  assert.equal(nextState('passed', { kind: 'master' }), 'Done');
  assert.equal(nextState('passed', { kind: 'draft', pr: 1 }), null);
  assert.equal(nextState('failed', { kind: 'master' }), 'In Progress');
  assert.equal(nextState('failed', { kind: 'draft', pr: 1 }), 'In Progress');
  assert.equal(nextState('partly run', { kind: 'master' }), null);
});

test('a pass on master writes findings, recording, comment, then Done, in that order', async () => {
  const { run } = planRun({
    listed: [listedOf({ kind: 'master' })],
    tests: [
      {
        anchor: 'radio-probe',
        marks: [{ mark: 'pass' }, { mark: 'pass' }],
        findings: ['The bars flicker', '  ', 'A second one'],
        recording: { name: 'run.mov', type: 'video/quicktime', size: 10 },
      },
    ],
    context,
  });
  assert.deepEqual(
    run.tests[0].writes.map((w) => w.kind),
    ['finding', 'finding', 'recording', 'comment', 'state'],
  );
  const linear = fakeLinear();
  const uploads = [];
  await sendAll(run, { linear, upload: async (t) => uploads.push(t.uploadUrl) });
  assert.deepEqual(
    linear.calls.map((c) => c[0]),
    ['finding', 'finding', 'uploadTarget', 'comment', 'move'],
  );
  assert.deepEqual(uploads, ['https://upload']);
  assert.deepEqual(linear.calls[0][1], {
    teamId: 'team',
    projectId: 'project',
    stateId: 's-backlog',
    title: 'The bars flicker',
    description:
      'Found during the smoke test of Radio probe (GCS-13) at `abc1234` (master), on 2026-11-24.',
    relatedTo: 'issue-13',
  });
  assert.deepEqual(linear.calls[2][1], {
    contentType: 'video/quicktime',
    filename: 'run.mov',
    size: 10,
  });
  assert.equal(
    linear.calls[3][2],
    `<!-- smoke-test-result v1 -->

**Smoke test passed** on 2026-11-24 at \`abc1234\` (master)

- Start: pass
- Scenario 1, sticks: pass

Recording: [run.mov](https://asset/run.mov)

Findings: GCS-200, GCS-201`,
  );
  assert.deepEqual(linear.calls[4], ['move', 'issue-13', 's-done']);
  assert.equal(
    runSummary(run),
    'Smoke run 2026-11-24 at `abc1234` (master): passed Radio probe (GCS-13); findings GCS-200, GCS-201.',
  );
});

test('a pass on a draft writes the comment and leaves the state', () => {
  const { run } = planRun({
    listed: [listedOf({ kind: 'draft', pr: 63 })],
    tests: [{ anchor: 'radio-probe', marks: [{ mark: 'pass' }, { mark: 'pass' }] }],
    context: { ...context, onMaster: false },
  });
  assert.deepEqual(
    run.tests[0].writes.map((w) => w.kind),
    ['comment'],
  );
});

test('a fail moves the ticket to In Progress; partly run leaves it; nothing marked writes nothing', () => {
  const { run, skipped } = planRun({
    listed: [
      listedOf({ kind: 'master' }),
      {
        ...listedOf({ kind: 'master' }),
        row: { ...listedOf({ kind: 'master' }).row, anchor: 'b', name: 'B' },
      },
      {
        ...listedOf({ kind: 'master' }),
        row: { ...listedOf({ kind: 'master' }).row, anchor: 'c', name: 'C' },
      },
    ],
    tests: [
      { anchor: 'radio-probe', marks: [{ mark: 'pass' }, { mark: 'fail', note: 'no bars' }] },
      { anchor: 'b', marks: [{ mark: 'pass' }, null] },
      { anchor: 'c', marks: [{ mark: 'not run' }, null], findings: ['dropped'] },
    ],
    context,
  });
  assert.deepEqual(
    run.tests.map((t) => [
      t.name,
      t.outcome,
      t.writes.map((w) => (w.kind === 'state' ? w.to : w.kind)),
    ]),
    [
      ['Radio probe', 'failed', ['comment', 'In Progress']],
      ['B', 'partly run', ['comment']],
    ],
  );
  assert.deepEqual(skipped, ['C']);
});

test('a pass on a ticket already Done writes no move', () => {
  const { run } = planRun({
    listed: [listedOf({ kind: 'master' }, 'Done')],
    tests: [{ anchor: 'radio-probe', marks: [{ mark: 'pass' }, { mark: 'pass' }] }],
    context,
  });
  assert.deepEqual(
    run.tests[0].writes.map((w) => w.kind),
    ['comment'],
  );
});

test('a failed write stops its test, and a second send runs only what did not land', async () => {
  const { run } = planRun({
    listed: [listedOf({ kind: 'master' })],
    tests: [
      { anchor: 'radio-probe', marks: [{ mark: 'pass' }, { mark: 'pass' }], findings: ['f'] },
    ],
    context,
  });
  const linear = fakeLinear({ failOnce: new Set(['comment']) });
  await sendAll(run, { linear });
  assert.deepEqual(
    run.tests[0].writes.map((w) => [w.kind, w.status]),
    [
      ['finding', 'done'],
      ['comment', 'failed'],
      ['state', 'pending'],
    ],
  );
  assert.equal(run.tests[0].writes[1].error, 'comment refused');
  assert.equal(runSummary(run), 'Smoke run 2026-11-24 at `abc1234` (master): findings GCS-200.');
  await assert.rejects(() => runWrite(run, 0, 2, { linear }), /not the next one to send/);
  await sendAll(run, { linear });
  assert.deepEqual(
    linear.calls.map((c) => c[0]),
    ['finding', 'comment', 'comment', 'move'],
  );
  assert.ok(run.tests[0].writes.every((w) => w.status === 'done'));
});

test('a draft pass counted on master cites it and moves the ticket to Done', async () => {
  const from = {
    outcome: 'passed',
    date: '2026-11-23',
    sha: 'bbbbbbb',
    where: { kind: 'draft', pr: 63 },
    dirty: false,
    countedFrom: null,
    scenarios: [
      { name: 'Start', mark: 'pass', note: '' },
      { name: 'Scenario 1, sticks', mark: 'pass', note: '' },
    ],
  };
  const { run } = planRun({
    listed: [listedOf({ kind: 'master' }, 'Smoke Test', { count: { from, commits: [] } })],
    tests: [],
    counts: ['radio-probe'],
    context,
  });
  const linear = fakeLinear();
  await sendAll(run, { linear });
  assert.equal(
    linear.calls[0][2],
    `<!-- smoke-test-result v1 -->

**Smoke test passed** on 2026-11-24 at \`abc1234\` (master)

- Start: pass
- Scenario 1, sticks: pass

Counted from the pass on \`bbbbbbb\` (PR #63, draft)`,
  );
  assert.deepEqual(linear.calls[1], ['move', 'issue-13', 's-done']);
});

test('planRun refuses tests that cannot take a result here', () => {
  const listed = [listedOf(null, 'Smoke Test', { why: 'PR #7 still open' })];
  assert.throws(
    () => planRun({ listed, tests: [{ anchor: 'radio-probe', marks: [null, null] }], context }),
    /Radio probe cannot take a result here: PR #7 still open/,
  );
  assert.throws(
    () => planRun({ listed, tests: [{ anchor: 'nope', marks: [] }], context }),
    /"nope" is not a test listed here/,
  );
  assert.throws(
    () =>
      planRun({
        listed: [listedOf({ kind: 'master' })],
        tests: [{ anchor: 'radio-probe', marks: [{ mark: 'pass' }] }],
        context,
      }),
    /has 2 scenarios, not 1/,
  );
  assert.throws(
    () =>
      planRun({
        listed: [listedOf({ kind: 'master' })],
        tests: [],
        counts: ['radio-probe'],
        context,
      }),
    /no draft pass to count/,
  );
});
