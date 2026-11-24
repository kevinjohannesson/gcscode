import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { checkPrTicket, playbookTickets, prClass, run, stripFences } from './check-pr-ticket.mjs';

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
  // Rows are added, never removed, so today's rows stay in the set.
  const real = playbookTickets(readFileSync('docs/smoke-tests.md', 'utf8'));
  for (const n of [13, 14, 15, 17, 24, 29, 38, 40, 104])
    assert.ok(real.has(n), `GCS-${n} has a row`);
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

test('a ticket with a smoke test stays out of the title and branch whatever the line says', () => {
  assert.deepEqual(check({ labels: ['docs'], title: 'GCS-17: fix wire probe wording', body: '' }), [
    'Take GCS-17 out of the title: Linear closes it on merge.',
  ]);
  assert.deepEqual(check({ title: 'GCS-17 fix', body: '- Ticket: Fixes GCS-42' }), [
    'Take GCS-17 out of the title: Linear closes it on merge.',
  ]);
  assert.deepEqual(
    check({ branch: 'feat/gcs-104-x', labels: [], body: '- Ticket: Fixes GCS-42' }),
    ['The branch name has GCS-104: Linear closes it on merge.'],
  );
  assert.deepEqual(check({ title: 'GCS-42: a fix', body: '- Ticket: Fixes GCS-42' }), []);
});

test('a closing word anywhere in the body must not name a ticket with a smoke test', () => {
  assert.deepEqual(
    check({ body: '- Ticket: Part of GCS-17\n\nThis also fixes GCS-17 for good.\n' }),
    [
      '"fixes GCS-17" closes GCS-17 on merge, but it has a smoke test: reword it, or write "Part of GCS-17".',
    ],
  );
  assert.deepEqual(check({ body: '- Ticket: Fixes GCS-42\r\n\r\nResolves: GCS-104 too.' }), [
    '"Resolves: GCS-104" closes GCS-104 on merge, but it has a smoke test: reword it, or write "Part of GCS-104".',
  ]);
  assert.deepEqual(
    check({ body: '- Ticket: Fixes GCS-42\n\nAlso closes GCS-43 and prefixes GCS-17.' }),
    [],
  );
});

test('"Ticket: none" is for Markdown-only PRs', () => {
  assert.deepEqual(
    check({ labels: ['spec'], body: '- Ticket: none yet. The spec proposes one.' }),
    [],
  );
  assert.deepEqual(check({ body: '- Ticket: none' }), [
    'A feature PR needs a ticket: "Ticket: none" is for Markdown-only PRs.',
  ]);
});

test('fenced code blocks are quotes, not ticket lines', () => {
  const template = '```md\n## Links\n\n- Ticket: Fixes GCS-<n>\n```\n';
  assert.deepEqual(check({ body: `- Ticket: Fixes GCS-42\n\n${template}` }), []);
  assert.deepEqual(check({ body: template }), [
    'A feature PR names its ticket: add "- Ticket: Fixes GCS-<n>" (or "Part of GCS-<n>") under Links.',
  ]);
  assert.deepEqual(check({ body: '- Ticket: Fixes GCS-42\n~~~\nfixes GCS-17\n~~~\n' }), []);
  assert.equal(stripFences('a\n````\n```\nb\n````\nc'), 'a\nc');
});

test('a bold, numbered or + ticket line is read', () => {
  assert.deepEqual(check({ body: '- **Ticket:** Fixes GCS-42' }), []);
  assert.deepEqual(check({ body: '1. Ticket: Fixes GCS-42' }), []);
  assert.deepEqual(check({ body: '+ Ticket: Fixes GCS-17' }), [
    'GCS-17 has a smoke test in docs/smoke-tests.md, so a merge must not close it: write "Part of GCS-17".',
  ]);
});

const io = (event, response) => {
  const logs = [];
  const files = {
    'event.json': JSON.stringify({ pull_request: { number: 7 } }),
    'docs/smoke-tests.md': playbook,
  };
  const calls = [];
  return {
    logs,
    calls,
    io: {
      env: {
        GITHUB_EVENT_NAME: event,
        GITHUB_EVENT_PATH: 'event.json',
        GITHUB_REPOSITORY: 'o/r',
        GITHUB_TOKEN: 't',
      },
      readFile: (path) => files[path],
      log: (line) => logs.push(line),
      fetch: async (url, init) => {
        calls.push([url, init.headers.authorization]);
        return response;
      },
    },
  };
};
const ok = (pr) => ({ ok: true, status: 200, json: async () => pr });
const pr = (body, title = 'A thing') => ({
  title,
  body,
  head: { ref: 'claude/x' },
  labels: [{ name: 'feat' }],
});

test('run does nothing outside a pull request', async () => {
  const t = io('push', ok(pr(null)));
  assert.equal(await run(t.io), 0);
  assert.deepEqual(t.calls, []);
  assert.deepEqual(t.logs, ['Not a pull request: nothing to check.']);
});

test('run reads the PR from the API and fails a feature PR with no body', async () => {
  const t = io('pull_request', ok(pr(null)));
  assert.equal(await run(t.io), 1);
  assert.deepEqual(t.calls, [['https://api.github.com/repos/o/r/pulls/7', 'Bearer t']]);
  assert.deepEqual(t.logs, [
    '::error title=PR ticket line::A feature PR names its ticket: add "- Ticket: Fixes GCS-<n>" (or "Part of GCS-<n>") under Links.',
    'Fix the PR, then re-run this job: it reads the PR as it is now.',
  ]);
});

test('run passes a good PR and fails when the API does', async () => {
  const good = io('pull_request', ok(pr('- Ticket: Part of GCS-17')));
  assert.equal(await run(good.io), 0);
  assert.deepEqual(good.logs, ['The ticket line is fine.']);
  const titled = io('pull_request', ok(pr('- Ticket: Part of GCS-17', 'GCS-17 x')));
  assert.equal(await run(titled.io), 1);
  const down = io('pull_request', { ok: false, status: 404 });
  assert.equal(await run(down.io), 1);
  assert.deepEqual(down.logs, ['::error title=PR ticket line::Could not read PR #7: HTTP 404.']);
});

test('the module can be imported without a script path', () => {
  const out = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "await import('./scripts/check-pr-ticket.mjs'); console.log('ok')",
    ],
    { encoding: 'utf8' },
  );
  assert.equal(out, 'ok\n');
});
