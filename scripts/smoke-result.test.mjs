import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  latestResult,
  localDate,
  outcome,
  parseResult,
  provenOnMaster,
  renderComment,
  summaryLine,
} from './smoke-runner/result.mjs';

test('outcome follows the Submit table, an unmarked scenario counting as Not run', () => {
  assert.equal(outcome(['pass', 'pass']), 'passed');
  assert.equal(outcome(['pass', 'fail', 'not run']), 'failed');
  assert.equal(outcome(['fail', undefined]), 'failed');
  assert.equal(outcome(['pass', undefined]), 'partly run');
  assert.equal(outcome(['pass', 'not run']), 'partly run');
  assert.equal(outcome(['not run', undefined]), null);
  assert.equal(outcome([undefined]), null);
});

test('the comment has the spec’s shape', () => {
  assert.equal(
    renderComment({
      outcome: 'passed',
      date: '2026-11-24',
      sha: 'abc1234',
      where: { kind: 'master' },
      dirty: false,
      scenarios: [
        { name: 'Start', mark: 'pass' },
        { name: 'Scenario 1, sticks and switches', mark: 'pass' },
        { name: 'Scenario 2, unplug', mark: 'pass' },
        { name: 'Scenario 3, terminal in the background', mark: 'pass' },
      ],
    }),
    `<!-- smoke-test-result v1 -->

**Smoke test passed** on 2026-11-24 at \`abc1234\` (master)

- Start: pass
- Scenario 1, sticks and switches: pass
- Scenario 2, unplug: pass
- Scenario 3, terminal in the background: pass`,
  );
});

test('a draft’s failed comment carries its notes, the dirty flag, the recording and findings', () => {
  assert.equal(
    renderComment({
      outcome: 'failed',
      date: '2026-11-25',
      sha: 'def5678',
      where: { kind: 'draft', pr: 109 },
      dirty: true,
      scenarios: [
        { name: 'Start', mark: 'pass' },
        { name: 'Scenario 1, replay', mark: 'fail', note: ' the axes froze ' },
        { name: 'Scenario 2, unplug' },
      ],
      recording: { name: 'run.mov', url: 'https://uploads.linear.app/x/run.mov' },
      findings: ['GCS-120'],
    }),
    `<!-- smoke-test-result v1 -->

**Smoke test failed** on 2026-11-25 at \`def5678\` (PR #109, draft) with uncommitted changes

- Start: pass
- Scenario 1, replay: fail. the axes froze
- Scenario 2, unplug: not run

Recording: [run.mov](https://uploads.linear.app/x/run.mov)

Findings: GCS-120`,
  );
});

test('a counted draft pass says what it counted', () => {
  const body = renderComment({
    outcome: 'passed',
    date: '2026-11-26',
    sha: '1111111',
    where: { kind: 'master' },
    dirty: false,
    scenarios: [{ name: 'Start', mark: 'pass' }],
    countedFrom: { sha: 'def5678', pr: 109 },
  });
  assert.match(body, /\n\nCounted from the pass on `def5678` \(PR #109, draft\)$/);
});

test('parseResult reads back what renderComment wrote', () => {
  const r = parseResult(
    renderComment({
      outcome: 'partly run',
      date: '2026-11-25',
      sha: 'def5678',
      where: { kind: 'draft', pr: 109 },
      dirty: true,
      scenarios: [
        { name: 'Start', mark: 'pass' },
        { name: 'Scenario 1, a: b', mark: 'not run' },
      ],
      countedFrom: { sha: 'aaaaaaa', pr: 7 },
    }),
  );
  assert.deepEqual(r, {
    outcome: 'partly run',
    date: '2026-11-25',
    sha: 'def5678',
    where: { kind: 'draft', pr: 109 },
    dirty: true,
    countedFrom: { sha: 'aaaaaaa', pr: 7 },
    scenarios: [
      { name: 'Start', mark: 'pass', note: '' },
      { name: 'Scenario 1, a: b', mark: 'not run', note: '' },
    ],
  });
});

test('parseResult reads the backfilled variant, word for word as written in Linear', () => {
  const passed = parseResult(
    "<!-- smoke-test-result v1 -->\n\n**Smoke test passed** by 2026-11-24 (master, commit not recorded). Backfilled from the owner's reports in the project chat; scenarios were not recorded one by one.",
  );
  assert.equal(passed?.outcome, 'passed');
  assert.equal(passed?.sha, null);
  assert.deepEqual(passed?.where, { kind: 'master' });
  assert.equal(provenOnMaster(passed), true);
  const failed = parseResult(
    '<!-- smoke-test-result v1 -->\n\n**Smoke test failed** on 2026-11-24 (master, commit not recorded). Backfilled from the owner\'s report in the project chat.\n\n- Start: fail. The station and the probe both reported "No profile matches this radio".\n\nThe owner believes the fix has landed since.',
  );
  assert.equal(failed?.outcome, 'failed');
  assert.deepEqual(failed?.scenarios, [
    {
      name: 'Start',
      mark: 'fail',
      note: 'The station and the probe both reported "No profile matches this radio".',
    },
  ]);
});

test('parseResult ignores other comments', () => {
  assert.equal(parseResult('Smoke-tested on the Mac and confirmed working.'), null);
  assert.equal(parseResult('<!-- smoke-test-result v1 -->\n\nSomething else'), null);
});

test('latestResult takes the newest result comment, skipping others', () => {
  const pass = renderComment({
    outcome: 'passed',
    date: '2026-11-24',
    sha: 'aaaaaaa',
    where: { kind: 'draft', pr: 5 },
    dirty: false,
    scenarios: [{ name: 'Start', mark: 'pass' }],
  });
  const fail = pass.replace('passed', 'failed');
  const r = latestResult([
    { body: fail, createdAt: '2026-11-24T10:00:00.000Z' },
    { body: 'a chat note', createdAt: '2026-11-24T12:00:00.000Z' },
    { body: pass, createdAt: '2026-11-24T11:00:00.000Z' },
  ]);
  assert.equal(r?.outcome, 'passed');
  assert.equal(provenOnMaster(r), false, 'a draft pass does not prove master');
  assert.equal(latestResult([]), null);
});

test('provenOnMaster is a pass on master only', () => {
  const base = { date: 'd', sha: 'a', dirty: false, countedFrom: null, scenarios: [] };
  assert.equal(provenOnMaster({ ...base, outcome: 'passed', where: { kind: 'master' } }), true);
  assert.equal(
    provenOnMaster({ ...base, outcome: 'partly run', where: { kind: 'master' } }),
    false,
  );
  assert.equal(provenOnMaster({ ...base, outcome: 'failed', where: { kind: 'master' } }), false);
  assert.equal(provenOnMaster(null), false);
});

test('the summary line has the spec’s shape', () => {
  assert.equal(
    summaryLine({
      date: '2026-11-24',
      sha: 'abc1234',
      onMaster: true,
      tests: [
        { name: 'Wire probe', ticket: 'GCS-17', outcome: 'passed', where: { kind: 'master' } },
        { name: 'Controls view', ticket: 'GCS-40', outcome: 'failed', where: { kind: 'master' } },
        {
          name: 'Station in the dev stack',
          ticket: 'GCS-29',
          outcome: 'passed',
          where: { kind: 'master' },
        },
        { name: 'Radio probe', ticket: 'GCS-13', outcome: 'partly run', where: { kind: 'master' } },
      ],
      findings: ['GCS-110', 'GCS-111'],
    }),
    'Smoke run 2026-11-24 at `abc1234` (master): passed Wire probe (GCS-17), Station in the dev stack (GCS-29); failed Controls view (GCS-40); partly run Radio probe (GCS-13); findings GCS-110, GCS-111.',
  );
  assert.equal(
    summaryLine({
      date: '2026-11-25',
      sha: 'def5678',
      onMaster: false,
      tests: [
        {
          name: 'Radio replay',
          ticket: 'GCS-95',
          outcome: 'passed',
          where: { kind: 'draft', pr: 109 },
        },
      ],
      findings: [],
    }),
    'Smoke run 2026-11-25 at `def5678`: passed Radio replay (PR #109, draft) (GCS-95).',
  );
});

test('localDate is the machine’s own date', () => {
  assert.equal(localDate(new Date(2026, 10, 4, 23, 59)), '2026-11-04');
});
