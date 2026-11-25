import { test } from 'node:test';
import assert from 'node:assert/strict';
import { namesPartOf, rowPrs } from './smoke-runner/github.mjs';

test('namesPartOf reads the Ticket line, Part of only', () => {
  assert.equal(namesPartOf('## Links\n\n- Ticket: Part of GCS-16\n', 'GCS-16'), true);
  assert.equal(namesPartOf('- Ticket: Fixes GCS-2, part of GCS-16', 'GCS-16'), true);
  assert.equal(namesPartOf('- Ticket: Related to GCS-16', 'GCS-16'), false);
  assert.equal(namesPartOf('- Ticket: Fixes GCS-16', 'GCS-16'), false);
  assert.equal(namesPartOf('- Ticket: Part of GCS-160', 'GCS-16'), false);
  assert.equal(namesPartOf('This is part of GCS-16, in prose.', 'GCS-16'), false);
  assert.equal(namesPartOf(null, 'GCS-16'), false);
});

test('rowPrs takes the row’s PR and the PRs that say Part of its ticket, without closed ones', async () => {
  const bodies = {
    66: { number: 66, state: 'MERGED', title: 'Several vehicles', body: '- Ticket: Fixes GCS-16' },
  };
  const calls = [];
  const gh = async (args) => {
    calls.push(args.join(' '));
    if (args[1] === 'view') return JSON.stringify(bodies[Number(args[2])]);
    return JSON.stringify([
      {
        number: 90,
        state: 'OPEN',
        title: 'follow-up',
        body: '- Ticket: Part of GCS-16',
        baseRefName: 'stack',
      },
      { number: 91, state: 'CLOSED', title: 'abandoned', body: '- Ticket: Part of GCS-16' },
      { number: 92, state: 'MERGED', title: 'mentions it', body: 'Part of GCS-16 in prose only.' },
      { number: 93, state: 'MERGED', title: 'related', body: '- Ticket: Related to GCS-16' },
      { number: 66, state: 'MERGED', title: 'Several vehicles', body: '- Ticket: Fixes GCS-16' },
    ]);
  };
  assert.deepEqual(await rowPrs(gh, { ticket: 'GCS-16', prs: [66] }), [
    { number: 66, state: 'merged', title: 'Several vehicles', base: 'master' },
    { number: 90, state: 'open', title: 'follow-up', base: 'stack' },
  ]);
  assert.deepEqual(calls, [
    'pr view 66 --json number,state,title,body,baseRefName',
    'pr list --state all --limit 100 --search "Part of GCS-16" in:body --json number,state,title,body,baseRefName',
  ]);
});
