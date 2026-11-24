import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkPrTicket, playbookTickets, prClass } from './check-pr-ticket.mjs';

const playbook = `# Smoke tests

| Test                      | Ticket / PR     | Branch   | Needs |
| ------------------------- | --------------- | -------- | ----- |
| [Wire probe](#wire-probe) | GCS-17, PR #70  | \`master\` | SITL  |
| [Several](#several)       | N8, PR #66      | \`master\` | SITL  |
| [Palettes](#palettes)     | GCS-104, PR #99 | \`master\` | none  |

Later text naming GCS-5 is not part of the table.

| Other | Ticket / PR |
| ----- | ----------- |
| x     | GCS-6       |
`;

const feat = { title: 'Add a thing', branch: 'claude/x', labels: ['feat'], playbook };
const check = (pr) => checkPrTicket({ ...feat, ...pr });

test('playbookTickets reads only the first table’s Ticket / PR column', () => {
  assert.deepEqual([...playbookTickets(playbook)], [17, 104]);
  assert.deepEqual([...playbookTickets('# No table here\n')], []);
});

test('playbookTickets reads the real playbook', () => {
  const real = playbookTickets(readFileSync('docs/smoke-tests.md', 'utf8'));
  assert.ok(real.has(15), 'Video health (GCS-15) has a row');
  assert.ok(real.has(17), 'Wire probe (GCS-17) has a row');
});

test('prClass takes the branch prefix, or a claude/* branch’s one class label', () => {
  assert.equal(prClass('feat/x', []), 'feat');
  assert.equal(prClass('docs/x', ['feat']), 'docs');
  assert.equal(prClass('claude/x', ['feat', 'auto-merge']), 'feat');
  assert.equal(prClass('claude/x', ['feat', 'docs']), undefined);
  assert.equal(prClass('claude/x', []), undefined);
  assert.equal(prClass('test/x', ['feat']), undefined);
});

test('a feature PR without a ticket line fails', () => {
  assert.deepEqual(check({ body: '## Links\n\n- Spec: none\n' }), [
    'A feature PR names its ticket: add "- Ticket: Fixes GCS-<n>" (or "Part of GCS-<n>") under Links.',
  ]);
});

test('a docs, spec or ADR PR may leave the ticket line out', () => {
  assert.deepEqual(check({ labels: ['docs'], body: 'No ticket.' }), []);
  assert.deepEqual(check({ branch: 'spec/x', labels: [], body: '' }), []);
  assert.deepEqual(check({ branch: 'adr/x', labels: [], body: null }), []);
});

test('a docs PR’s ticket line is still checked', () => {
  assert.deepEqual(check({ labels: ['docs'], body: '- Ticket: Fixes GCS-17' }), [
    'GCS-17 has a smoke test in docs/smoke-tests.md, so a merge must not close it: write "Part of GCS-17".',
  ]);
});

test('Fixes or Closes on a ticket without a smoke test passes', () => {
  assert.deepEqual(check({ body: '## Links\n\n- Ticket: Fixes GCS-42\n' }), []);
  assert.deepEqual(check({ body: 'Ticket: closes gcs-42' }), []);
  assert.deepEqual(check({ body: '* Ticket: Fixes GCS-42, Part of GCS-17' }), []);
});

test('Fixes or Closes on a ticket with a smoke test fails', () => {
  assert.deepEqual(check({ body: '- Ticket: Closes GCS-104' }), [
    'GCS-104 has a smoke test in docs/smoke-tests.md, so a merge must not close it: write "Part of GCS-104".',
  ]);
});

test('a smoke-tested ticket named only by its number in a row elsewhere is not confused', () => {
  // GCS-1 is not GCS-17, and GCS-170 is not GCS-17.
  assert.deepEqual(check({ body: '- Ticket: Fixes GCS-1, Fixes GCS-170' }), []);
});

test('Part of keeps the ID out of the title and the branch', () => {
  assert.deepEqual(check({ body: '- Ticket: Part of GCS-17' }), []);
  assert.deepEqual(
    check({
      title: 'GCS-17: wire probe',
      branch: 'claude/gcs-17-wire-probe',
      body: '- Ticket: Part of GCS-17',
    }),
    [
      'Take GCS-17 out of the title: Linear closes it on merge.',
      'The branch name has GCS-17: Linear closes it on merge.',
    ],
  );
  assert.deepEqual(check({ title: 'GCS-170: other', body: '- Ticket: Part of GCS-17' }), []);
});

test('Related to links a smoke-tested ticket without closing it, and keeps its ID out of the title', () => {
  assert.deepEqual(check({ labels: ['docs'], body: '- Ticket: Related to GCS-17' }), []);
  assert.deepEqual(
    check({ title: 'GCS-17 row runs from master', body: '- Ticket: Related to GCS-17' }),
    ['Take GCS-17 out of the title: Linear closes it on merge.'],
  );
});

test('a malformed ticket line fails with what it expected', () => {
  assert.deepEqual(check({ body: '- Ticket: GCS-42' }), [
    '"GCS-42" is not "Fixes", "Closes", "Part of" or "Related to" followed by one GCS-<n>.',
  ]);
  assert.deepEqual(check({ body: '- Ticket: [GCS-42](https://linear.app/x)' }), [
    '"[GCS-42](https://linear.app/x)" is not "Fixes", "Closes", "Part of" or "Related to" followed by one GCS-<n>.',
  ]);
  assert.deepEqual(check({ body: '- Ticket:' }), ['The "Ticket:" line names no ticket.']);
  assert.deepEqual(check({ body: '- Ticket: Fixes GCS-42 once GCS-41 lands' }), [
    '"Fixes GCS-42 once GCS-41 lands" is not "Fixes", "Closes", "Part of" or "Related to" followed by one GCS-<n>.',
  ]);
});

test('two ticket lines fail', () => {
  assert.deepEqual(check({ body: '- Ticket: Fixes GCS-1\n- Ticket: Fixes GCS-2\n' }), [
    'Found 2 "Ticket:" lines; keep one.',
  ]);
});
