import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { bodyType, ownPage, smokeServer } from './smoke-runner/server.mjs';
import { linearKey } from './smoke-runner.mjs';

const PORT = 51807;

test('ownPage takes the runner’s Host, and its Origin when one is sent', () => {
  assert.equal(ownPage({ host: '127.0.0.1:5180' }, 5180), true);
  assert.equal(ownPage({ host: 'localhost:5180', origin: 'http://localhost:5180' }, 5180), true);
  assert.equal(ownPage({ host: 'evil.example:5180' }, 5180), false, 'DNS rebinding');
  assert.equal(ownPage({}, 5180), false);
  assert.equal(ownPage({ host: '127.0.0.1:5180', origin: 'https://evil.example' }, 5180), false);
  assert.equal(ownPage({ host: '127.0.0.1:5180', origin: 'http://localhost:5180' }, 5180), false);
  assert.equal(ownPage({ host: '127.0.0.1:5180', origin: 'null' }, 5180), false);
});

test('only the recording route takes a raw body', () => {
  assert.equal(bodyType('/api/run/recording'), 'application/octet-stream');
  assert.equal(bodyType('/api/run'), 'application/json');
  assert.equal(bodyType('/api/run/write'), 'application/json');
});

test('linearKey reads the environment, then the key folder', () => {
  const none = () => {
    throw new Error('ENOENT');
  };
  assert.equal(linearKey({ LINEAR_API_KEY: ' lin_api_env \n', HOME: '/h' }, none), 'lin_api_env');
  const read = [];
  assert.equal(
    linearKey({ HOME: '/h' }, (p) => {
      read.push(p);
      return 'lin_api_file\n';
    }),
    'lin_api_file',
  );
  assert.deepEqual(read, ['/h/.config/gcscode/linear-api-key']);
  assert.equal(linearKey({ HOME: '/h' }, none), null);
  assert.equal(
    linearKey({ HOME: '/h', LINEAR_API_KEY: '' }, () => '  '),
    null,
  );
});

/** A git that answers the runner's questions about a checkout on master's tip. */
function fakeGit(head = 'f'.repeat(40)) {
  return (args) => {
    const a = args.join(' ');
    if (a === 'rev-parse --show-toplevel') return `${process.cwd()}\n`;
    if (a === 'rev-parse HEAD' || a === 'rev-parse origin/master') return `${head}\n`;
    if (a.startsWith('fetch')) return '';
    if (a === 'status --porcelain') return '';
    if (a.startsWith('merge-base --is-ancestor')) return '';
    if (a.startsWith('rev-list --count')) return '0\n';
    if (a.startsWith('log --first-parent'))
      return `${'1'.repeat(40)} Merge pull request #82 from x/y\n`;
    throw new Error(`unexpected git ${a}`);
  };
}

async function withServer(deps, fn) {
  const server = smokeServer({
    git: fakeGit(),
    gh: async () => '[]',
    linear: null,
    putUpload: async () => {},
    now: () => new Date(2026, 10, 24),
    port: PORT,
    ...deps,
  });
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  try {
    await fn();
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
}

function call({ method = 'GET', path = '/', headers = {}, body = undefined }) {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port: PORT,
        // A fresh connection each call: a kept-alive socket from the last
        // test's server breaks the next one on Node 22.
        agent: false,
        method,
        path,
        headers: { host: `127.0.0.1:${PORT}`, ...headers },
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (text += c));
        res.on('end', () =>
          resolve({ status: res.statusCode, text, type: res.headers['content-type'] }),
        );
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

test('the server answers only its own page', async () => {
  await withServer({}, async () => {
    const page = await call({});
    assert.equal(page.status, 200);
    assert.match(page.type ?? '', /^text\/html/);
    assert.equal((await call({ headers: { host: 'evil.example' } })).status, 403);
    assert.equal((await call({ headers: { origin: 'https://evil.example' } })).status, 403);
    const text = await call({
      method: 'POST',
      path: '/api/run',
      headers: { 'content-type': 'text/plain' },
      body: 'x',
    });
    assert.equal(text.status, 415);
    assert.deepEqual(JSON.parse(text.text), { error: 'This route takes application/json.' });
    const form = await call({
      method: 'POST',
      path: '/api/pr',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'pr=1',
    });
    assert.equal(form.status, 415);
    const rawAsJson = await call({
      method: 'POST',
      path: '/api/run/recording?test=0&write=0',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(rawAsJson.status, 415);
  });
});

test('without a key the state lists the playbook and nothing can be submitted', async () => {
  await withServer({}, async () => {
    const res = await call({ path: '/api/state' });
    assert.equal(res.status, 200);
    const state = JSON.parse(res.text);
    assert.equal(state.key, false);
    assert.equal(state.mode, 'master');
    assert.equal(state.checkout.onMaster, true);
    assert.ok(state.listed.some((t) => t.name === 'Controls view'));
    assert.ok(state.listed.every((t) => t.where === null));
    const submit = await call({
      method: 'POST',
      path: '/api/run',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tests: [] }),
    });
    assert.equal(submit.status, 409);
  });
});

test('a Submit through the server writes the comment and moves the ticket', async () => {
  const calls = [];
  const states = [
    { id: 's-backlog', name: 'Backlog', type: 'backlog' },
    { id: 's-smoke', name: 'Smoke Test', type: 'started' },
    { id: 's-done', name: 'Done', type: 'completed' },
    { id: 's-progress', name: 'In Progress', type: 'started' },
  ];
  const linear = {
    async issue(id) {
      const waiting = id === 'GCS-40';
      return {
        id: `issue-${id}`,
        identifier: id,
        title: id,
        url: `https://linear.app/${id}`,
        state: waiting ? states[1] : states[2],
        team: { id: 'team', states },
        projectId: null,
        comments: waiting
          ? []
          : [
              {
                body: '<!-- smoke-test-result v1 -->\n\n**Smoke test passed** by 2026-11-24 (master, commit not recorded).',
                createdAt: '2026-11-24T00:00:00Z',
              },
            ],
      };
    },
    async comment(issueId, body) {
      calls.push(['comment', issueId, body.split('\n')[2]]);
      return 'https://linear.app/c';
    },
    async move(issueId, stateId) {
      calls.push(['move', issueId, stateId]);
    },
    async createFinding() {
      throw new Error('no findings here');
    },
    async relate() {
      throw new Error('no findings here');
    },
    async uploadTarget({ size }) {
      calls.push(['uploadTarget', size]);
      return { uploadUrl: 'https://u', assetUrl: 'https://a/run.mov', headers: [] };
    },
  };
  const gh = async (args) =>
    args[0] === 'pr' && args[1] === 'view'
      ? JSON.stringify({ number: Number(args[2]), state: 'MERGED', title: 't', body: '' })
      : '[]';
  const uploaded = [];
  const putUpload = async (_target, file, body) => {
    let text = '';
    for await (const c of body) text += c;
    uploaded.push([file, text]);
  };
  await withServer({ linear, gh, putUpload }, async () => {
    const state = JSON.parse((await call({ path: '/api/state' })).text);
    assert.deepEqual(
      state.listed.map((t) => t.name),
      ['Controls view'],
      'only the waiting ticket is listed',
    );
    const controls = state.listed[0];
    const marks = controls.section.scenarios.map(() => ({ mark: 'pass' }));
    const json = { 'content-type': 'application/json' };
    const planned = await call({
      method: 'POST',
      path: '/api/run',
      headers: json,
      body: JSON.stringify({
        tests: [
          {
            anchor: controls.anchor,
            marks,
            recording: { name: 'run.mov', type: 'video/quicktime', size: 5 },
          },
        ],
      }),
    });
    assert.equal(planned.status, 200, planned.text);
    assert.deepEqual(
      JSON.parse(planned.text).run.tests[0].writes.map((w) => w.kind),
      ['recording', 'comment', 'state'],
    );
    const wrongSize = await call({
      method: 'POST',
      path: '/api/run/recording?test=0&write=0',
      headers: { 'content-type': 'application/octet-stream', 'content-length': '3' },
      body: 'abc',
    });
    assert.equal(wrongSize.status, 400);
    const up = await call({
      method: 'POST',
      path: '/api/run/recording?test=0&write=0',
      headers: { 'content-type': 'application/octet-stream', 'content-length': '5' },
      body: 'hello',
    });
    assert.equal(up.status, 200, up.text);
    assert.deepEqual(uploaded, [[{ contentType: 'video/quicktime', size: 5 }, 'hello']]);
    for (const write of [1, 2]) {
      const res = await call({
        method: 'POST',
        path: '/api/run/write',
        headers: json,
        body: JSON.stringify({ test: 0, write }),
      });
      assert.equal(res.status, 200, res.text);
    }
    const final = JSON.parse(
      (
        await call({
          method: 'POST',
          path: '/api/run/write',
          headers: json,
          body: JSON.stringify({ test: 0, write: 2 }),
        })
      ).text,
    );
    assert.match(final.error, /not the next one to send/);
  });
  assert.deepEqual(calls, [
    ['uploadTarget', 5],
    ['comment', 'issue-GCS-40', `**Smoke test passed** on 2026-11-24 at \`fffffff\` (master)`],
    ['move', 'issue-GCS-40', 's-done'],
  ]);
});

test('a Submit is refused when the checkout turned dirty or master moved since the page loaded', async () => {
  for (const change of ['dirty', 'master']) {
    let changed = false;
    const base = fakeGit();
    const git = (args) => {
      const a = args.join(' ');
      if (changed && change === 'dirty' && a === 'status --porcelain') return ' M x\n';
      if (changed && change === 'master' && a === 'rev-parse origin/master')
        return `${'e'.repeat(40)}\n`;
      return base(args);
    };
    const linear = { issue: async () => null };
    await withServer({ git, linear }, async () => {
      assert.equal((await call({ path: '/api/state' })).status, 200);
      changed = true;
      const res = await call({
        method: 'POST',
        path: '/api/run',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tests: [] }),
      });
      assert.equal(res.status, 409, change);
      assert.deepEqual(JSON.parse(res.text), {
        error: 'The checkout or master changed since the page loaded: reload it.',
      });
    });
  }
});

test('offline, the page still loads and a Submit is refused until master is fetched', async () => {
  const base = fakeGit();
  const git = (args) => {
    if (args[0] === 'fetch') throw new Error('fatal: unable to access origin');
    return base(args);
  };
  await withServer({ git, linear: { issue: async () => null } }, async () => {
    const res = await call({ path: '/api/state' });
    assert.equal(res.status, 200);
    const state = JSON.parse(res.text);
    assert.ok(
      state.problems.includes(
        'Could not fetch master (fatal: unable to access origin), so where this checkout stands is unknown: the playbook is shown, and nothing can be recorded until a reload fetches it.',
      ),
    );
    const submit = await call({
      method: 'POST',
      path: '/api/run',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tests: [] }),
    });
    assert.equal(submit.status, 409);
    assert.deepEqual(JSON.parse(submit.text), {
      error: 'Master could not be fetched: reload once online.',
    });
  });
});

test('a Submit whose write keeps failing can be discarded, so a new one can start', async () => {
  const states = [
    { id: 's-smoke', name: 'Smoke Test', type: 'started' },
    { id: 's-done', name: 'Done', type: 'completed' },
  ];
  const linear = {
    async issue(id) {
      return {
        id: `issue-${id}`,
        identifier: id,
        title: id,
        url: 'u',
        state: id === 'GCS-40' ? states[0] : states[1],
        team: { id: 't', states },
        projectId: null,
        comments:
          id === 'GCS-40'
            ? []
            : [
                {
                  body: '<!-- smoke-test-result v1 -->\n\n**Smoke test passed** by 2026-11-24 (master, commit not recorded).',
                  createdAt: 'z',
                },
              ],
      };
    },
    async comment() {
      throw new Error('Linear is down');
    },
  };
  const gh = async (args) =>
    args[1] === 'view'
      ? JSON.stringify({ number: Number(args[2]), state: 'MERGED', title: 't', body: '' })
      : '[]';
  const json = { 'content-type': 'application/json' };
  await withServer({ linear, gh }, async () => {
    const state = JSON.parse((await call({ path: '/api/state' })).text);
    const t = state.listed[0];
    const body = JSON.stringify({
      tests: [{ anchor: t.anchor, marks: t.section.scenarios.map(() => ({ mark: 'pass' })) }],
    });
    assert.equal(
      (await call({ method: 'POST', path: '/api/run', headers: json, body })).status,
      200,
    );
    const failed = await call({
      method: 'POST',
      path: '/api/run/write',
      headers: json,
      body: JSON.stringify({ test: 0, write: 0 }),
    });
    assert.equal(JSON.parse(failed.text).run.tests[0].writes[0].status, 'failed');
    const blocked = await call({ method: 'POST', path: '/api/run', headers: json, body });
    assert.equal(blocked.status, 409);
    assert.deepEqual(JSON.parse(blocked.text), {
      error: 'The last Submit has writes still to send: send them first, or discard that Submit.',
    });
    const discarded = await call({
      method: 'POST',
      path: '/api/run',
      headers: json,
      body: JSON.stringify({ discard: true }),
    });
    assert.deepEqual(JSON.parse(discarded.text), { run: null, skipped: [] });
    assert.equal(
      (await call({ method: 'POST', path: '/api/run', headers: json, body })).status,
      200,
    );
  });
});
