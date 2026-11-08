import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addedLines, anchors, docKind, links, lintFile, section, slugify } from './lint-docs.mjs';

const files = {
  'docs/specs/target.md': '# Target\n\n## Known unknowns\n\n## Repeat\n\n## Repeat\n',
  'docs/decisions/ADR-0001-x.md': '# ADR\n',
};
const fs = {
  isFile: (path) => path in files,
  isDir: (path) => path === 'docs' || path === 'docs/specs',
  read: (path) => files[path],
};
const lint = (text, extra = {}) =>
  lintFile({ path: 'docs/specs/source.md', text, fs, ...extra }).map(
    (p) => `${p.line}: ${p.message}`,
  );

test('slugify follows GitHub heading anchors', () => {
  assert.equal(slugify('VS Code alignment'), 'vs-code-alignment');
  assert.equal(slugify('`docs/out-of-scope.md` propagation'), 'docsout-of-scopemd-propagation');
  assert.equal(slugify('Gate 3b — blocking count'), 'gate-3b--blocking-count');
  assert.equal(slugify('See [ADR-0012](x.md) here'), 'see-adr-0012-here');
});

test('anchors suffix duplicate headings', () => {
  assert.deepEqual(
    [...anchors(files['docs/specs/target.md'])],
    ['target', 'known-unknowns', 'repeat', 'repeat-1'],
  );
});

test('section runs from its heading to the next heading at the same or a higher level', () => {
  const text = [
    '# Spec', // 1
    'intro',
    '## Known unknowns', // 3
    'first',
    '### Detail', // 5
    'nested',
    '```',
    '## not a heading',
    '```',
    'after fence', // 10
    '## Corrections', // 11
    'last',
    '## Repeat',
    'one',
    '## Repeat', // 15
    'two',
  ].join('\n');
  assert.equal(
    section(text, 'known-unknowns'),
    'first\n### Detail\nnested\n```\n## not a heading\n```\nafter fence',
  );
  assert.equal(section(text, 'detail'), 'nested\n```\n## not a heading\n```\nafter fence');
  assert.equal(section(text, 'Corrections'), 'last');
  assert.equal(section(text, 'repeat-1'), 'two');
  assert.equal(section(text, 'spec'), text.split('\n').slice(1).join('\n'));
  assert.equal(section(text, 'not-a-heading'), null);
});

test('links skip fenced code and inline code', () => {
  const text = 'see [a](a.md)\n```\n[b](b.md)\n```\n`[c](c.md)` and [d](d.md#x)\n[ref]: e.md\n';
  assert.deepEqual(
    links(text).map((l) => `${l.line}:${l.target}`),
    ['1:a.md', '5:d.md#x', '6:e.md'],
  );
});

test('resolving links and anchors', () => {
  assert.deepEqual(lint('[ok](target.md#known-unknowns) [dir](../specs) [web](https://x.y/z)'), []);
  assert.deepEqual(lint('[dup](target.md#repeat-1) [self](#here)\n## Here\n'), []);
  assert.deepEqual(lint('[missing](nope.md)'), [
    '1: link "nope.md" does not resolve (docs/specs/nope.md)',
  ]);
  assert.deepEqual(lint('[bad](target.md#nowhere)'), [
    '1: anchor "#nowhere" not found in docs/specs/target.md',
  ]);
  assert.deepEqual(lint('[out](../../../x.md)'), [
    '1: link "../../../x.md" points outside the repository',
  ]);
});

test('local paths that leak the machine layout are flagged, also inside code', () => {
  const leak = (line, path) =>
    `${line}: local path "${path}" leaks the machine layout — use a repo-relative path`;
  assert.deepEqual(lint('```\ncd /Users/someone/project\n```'), [leak(2, '/Users/someone')]);
  assert.deepEqual(lint('/home/dev/x'), [leak(1, '/home/dev')]);
  assert.deepEqual(lint('C:\\Users\\dev\\repo'), [leak(1, 'C:\\Users\\dev')]);
  assert.deepEqual(lint('see .claude/projects/-Users-dev-repo/x.jsonl'), [leak(1, '-Users-dev')]);
  assert.deepEqual(lint('scratch at /private/tmp/claude-501/x'), [
    leak(1, '/private/tmp/claude-501'),
  ]);
  assert.deepEqual(
    lint('the rule bans `/Users/`, `/home/...`, `-Users-<name>` and `/private/tmp/...` prefixes'),
    [],
  );
});

test('only the given lines are reported', () => {
  const text = '[a](nope.md)\n[b](gone.md)\n';
  assert.deepEqual(lint(text, { lines: new Set([2]) }), [
    '2: link "gone.md" does not resolve (docs/specs/gone.md)',
  ]);
});

test('required headings for new specs and ADRs', () => {
  const spec =
    '# S\n## Context\n## Goals\n## Non-goals (this iteration)\n## VS Code alignment\n## Known unknowns\n';
  assert.deepEqual(lint(spec, { kind: 'spec' }), []);
  assert.deepEqual(
    lint('# S\n## Context\n## Goals\n## Non-goals\n## VS Code alignment\n', { kind: 'spec' }),
    ['1: missing required heading "## Known unknowns"'],
  );
  assert.deepEqual(
    lint('# A\n**Status:** Accepted\n## Context\n## Decision\n## Consequences\n', { kind: 'adr' }),
    [],
  );
  assert.deepEqual(lint('# A\n## Context\n## Decisions adopted\n', { kind: 'adr' }), [
    '1: missing required "Status" (heading or **Status:** line)',
    '1: missing required heading "## Consequences"',
  ]);
});

test('docKind recognises spec and ADR filenames only', () => {
  assert.equal(docKind('shell/docs/specs/2026-10-22-review-loop-v2.md'), 'spec');
  assert.equal(docKind('shell/docs/decisions/ADR-0013-x.md'), 'adr');
  assert.equal(docKind('shell/docs/roadmap.md'), null);
  assert.equal(docKind('shell/docs/plans/2026-10-22-x.md'), null);
});

test('addedLines reads zero-context hunks', () => {
  const diff = [
    'diff --git a/x.md b/x.md',
    '--- a/x.md',
    '+++ b/x.md',
    '@@ -3 +3 @@',
    '-old',
    '+new',
    '@@ -10,0 +11,2 @@',
    '+a',
    '+b',
    '@@ -20,2 +22,0 @@',
  ].join('\n');
  assert.deepEqual([...addedLines(diff).get('x.md')], [3, 11, 12]);
});
