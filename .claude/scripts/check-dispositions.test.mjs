import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkDispositions, latestPerAuthor, openFindings, parseDispositions } from './check-dispositions.mjs';

const initialReview = `## Red-team review — spec — Claude X
1. **RT-1** [blocking] \`a.md:3\` — wrong. Fix: right.
2. **RT-2** [non-blocking] \`b.md\` § Goals — vague. Fix: sharpen.
### Blocking findings
**RT-1** [blocking] matters because ...
Blocking: 1`;

const fixCheck = `## Red-team fix check of abc1234 — Claude X
### Earlier findings
- **RT-1** [resolved]
- **RT-2** [partly resolved] [non-blocking] \`b.md:4\` — still vague.
### New findings
3. **RT-3** [blocking] \`c.md:9\` — new problem. Fix: fix it.
Blocking: 1`;

test('openFindings takes the first status per ID and drops resolved ones', () => {
  assert.deepEqual(openFindings(initialReview), ['RT-1', 'RT-2']);
  assert.deepEqual(openFindings(fixCheck), ['RT-2', 'RT-3']);
  assert.deepEqual(openFindings('No findings.\nBlocking: 0'), []);
  assert.deepEqual(openFindings('see ADR-0012 [blocking] RT-4 [not resolved]'), ['RT-4']);
  assert.deepEqual(openFindings('- **RT-5** [resolved]\n**RT-5** [blocking] was about ...'), []);
});

test('latestPerAuthor keeps the newest submitted review per login', () => {
  const reviews = [
    { login: 'someone', submittedAt: null, body: 'pending only' },
    { login: 'gcscode-red-team[bot]', submittedAt: '2026-10-22T10:00:00Z', body: 'old' },
    { login: 'gcscode-red-team[bot]', submittedAt: '2026-10-22T12:00:00Z', body: 'new' },
    { login: 'gcscode-extension-architect[bot]', submittedAt: '2026-10-22T11:00:00Z', body: 'ea' },
    { login: 'gcscode-red-team[bot]', submittedAt: null, body: 'pending' },
  ];
  assert.deepEqual(
    latestPerAuthor(reviews).map((r) => r.body),
    ['new', 'ea'],
  );
});

test('parseDispositions reads one line per ID, with or without a bullet', () => {
  const parsed = parseDispositions(
    'Code-review-followup: x\n\nRT-1 fixed: a.md\n- RT-2: kept: out of scope here\nnot a line RT-3 fixed: no\n',
  );
  assert.deepEqual(Object.fromEntries(parsed), {
    'RT-1': { verb: 'fixed', value: 'a.md' },
    'RT-2': { verb: 'kept', value: 'out of scope here' },
  });
});

const files = { 'a.md': 'a', 'b.md': 'b', 'docs/roadmap.md': 'entry (PR #38 RT-2)\n', 'docs/out.md': 'nothing\n' };
const check = (message, { changed = ['a.md'], added = {} } = {}) =>
  checkDispositions({
    open: ['RT-1', 'RT-2'],
    message,
    changed: new Set(changed),
    addedText: (path) => added[path] ?? '',
    fileText: (path) => files[path] ?? null,
  });

test('every open finding needs a disposition', () => {
  assert.deepEqual(check('RT-1 fixed: a.md\nRT-2 kept: reason'), []);
  assert.deepEqual(check('RT-1 fixed: a.md'), ['RT-2: no disposition line (fixed: / kept: / deferred:)']);
});

test('unknown IDs are reported', () => {
  assert.deepEqual(check('RT-1 fixed: a.md\nRT-2 kept: r\nRT-9 kept: r'), [
    'RT-9: not open in any latest review — check the ID',
  ]);
});

test('fixed paths must be changed by the commit; prose is ignored', () => {
  assert.deepEqual(check('RT-1 fixed: a.md:3, b.md § Goals\nRT-2 kept: r'), [
    'RT-1: fixed in b.md, but this commit does not change b.md',
  ]);
  assert.deepEqual(check('RT-1 fixed: the gate comment block\nRT-2 kept: r'), []);
});

test('deferred targets must exist and mention the ID', () => {
  assert.deepEqual(check('RT-1 fixed: a.md\nRT-2 deferred: docs/roadmap.md#considering'), []);
  assert.deepEqual(check('RT-1 fixed: a.md\nRT-2 deferred: docs/out.md#later'), [
    'RT-2: deferred to docs/out.md, but RT-2 appears nowhere in it',
  ]);
  assert.deepEqual(
    check('RT-1 fixed: a.md\nRT-2 deferred: docs/out.md', { added: { 'docs/out.md': '+ later (RT-2)' } }),
    [],
  );
  assert.deepEqual(check('RT-1 fixed: a.md\nRT-2 deferred: docs/missing.md'), [
    'RT-2: deferred to docs/missing.md, which does not exist',
  ]);
});

test('an ID does not match a longer ID', () => {
  files['docs/out.md'] = 'RT-20 lives here\n';
  assert.deepEqual(check('RT-1 fixed: a.md\nRT-2 deferred: docs/out.md'), [
    'RT-2: deferred to docs/out.md, but RT-2 appears nowhere in it',
  ]);
});
