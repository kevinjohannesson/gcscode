import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linearClient } from './smoke-runner/linear.mjs';

/** A fetch that answers each call with the next canned response and records the request. */
function fakeFetch(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, auth: init.headers.authorization, body: JSON.parse(init.body) });
    const next = responses.shift();
    return {
      ok: next.status === undefined,
      status: next.status ?? 200,
      json: async () => next.json,
    };
  };
  return { fn, calls };
}

test('issue maps Linear’s answer and sends the key as is', async () => {
  const f = fakeFetch([
    {
      json: {
        data: {
          issue: {
            id: 'u1',
            identifier: 'GCS-40',
            title: 'Controls view',
            url: 'https://linear.app/x/GCS-40',
            state: { id: 's', name: 'Smoke Test', type: 'started' },
            team: {
              id: 't',
              states: { nodes: [{ id: 's', name: 'Smoke Test', type: 'started' }] },
            },
            project: null,
            comments: { nodes: [{ body: 'b', createdAt: 'c' }] },
          },
        },
      },
    },
  ]);
  const issue = await linearClient('lin_api_k', f.fn).issue('GCS-40');
  assert.deepEqual(issue, {
    id: 'u1',
    identifier: 'GCS-40',
    title: 'Controls view',
    url: 'https://linear.app/x/GCS-40',
    state: { id: 's', name: 'Smoke Test', type: 'started' },
    team: { id: 't', states: [{ id: 's', name: 'Smoke Test', type: 'started' }] },
    projectId: null,
    comments: [{ body: 'b', createdAt: 'c' }],
  });
  assert.equal(f.calls[0].url, 'https://api.linear.app/graphql');
  assert.equal(f.calls[0].auth, 'lin_api_k');
  assert.deepEqual(f.calls[0].body.variables, { id: 'GCS-40' });
});

test('an unknown ticket is null, and any other error throws with Linear’s message', async () => {
  const missing = fakeFetch([{ json: { errors: [{ message: 'Entity not found: Issue' }] } }]);
  assert.equal(await linearClient('k', missing.fn).issue('GCS-999'), null);
  const denied = fakeFetch([
    { status: 401, json: { errors: [{ message: 'Authentication required' }] } },
  ]);
  await assert.rejects(
    () => linearClient('k', denied.fn).issue('GCS-1'),
    /Linear: Authentication required/,
  );
  const down = fakeFetch([{ status: 502, json: null }]);
  await assert.rejects(() => linearClient('k', down.fn).comment('u', 'b'), /Linear: HTTP 502/);
  const odd = fakeFetch([{ status: 500, json: { data: {} } }]);
  await assert.rejects(() => linearClient('k', odd.fn).move('u', 's'), /Linear: HTTP 500/);
});

test('a finding is created in Backlog and related to the rung’s ticket', async () => {
  const f = fakeFetch([
    {
      json: {
        data: { issueCreate: { success: true, issue: { id: 'new', identifier: 'GCS-120' } } },
      },
    },
    { json: { data: { issueRelationCreate: { success: true } } } },
  ]);
  const linear = linearClient('k', f.fn);
  const created = await linear.createFinding({
    teamId: 't',
    projectId: null,
    stateId: 'backlog',
    title: 'Bars flicker',
    description: 'd',
  });
  assert.deepEqual(created, { id: 'new', identifier: 'GCS-120' });
  await linear.relate('new', 'rung');
  assert.deepEqual(f.calls[0].body.variables.input, {
    teamId: 't',
    title: 'Bars flicker',
    description: 'd',
    stateId: 'backlog',
  });
  assert.deepEqual(f.calls[1].body.variables.input, {
    issueId: 'new',
    relatedIssueId: 'rung',
    type: 'related',
  });
});
