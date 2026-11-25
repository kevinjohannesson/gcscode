import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blocks, parsePlaybook, scenarioName } from './smoke-runner/playbook.mjs';

const real = parsePlaybook(readFileSync('docs/smoke-tests.md', 'utf8'));
const row = (name) => {
  const r = real.rows.find((x) => x.name === name);
  assert.ok(r, `a row named ${name}`);
  return r;
};
const names = (r) => r.section?.scenarios.map((s) => s.name);

test('the real playbook parses with no problems', () => {
  assert.deepEqual(real.problems, []);
});

test('every row of the real playbook has one ticket and a section', () => {
  // Rows are added, never removed, so today's rows stay.
  const tickets = {
    'Video health view': 'GCS-15',
    'Radio probe': 'GCS-13',
    'Several vehicles in SITL': 'GCS-16',
    'Wire probe': 'GCS-17',
    'Map input view': 'GCS-14',
    'Link state view': 'GCS-24',
    'Radio input view': 'GCS-38',
    'Station in the dev stack': 'GCS-29',
    'Controls view': 'GCS-40',
    Palettes: 'GCS-104',
    'Smoke test runner': 'GCS-114',
  };
  for (const [name, ticket] of Object.entries(tickets)) {
    assert.equal(row(name).ticket, ticket);
    assert.ok(row(name).section, `${name} has a section`);
  }
  assert.deepEqual(row('Controls view').prs, [82]);
  assert.equal(row('Radio probe').needs, 'TX16S, Rust and CMake');
});

test('the real playbook’s scenarios are named as the spec says', () => {
  assert.deepEqual(names(row('Radio probe')), [
    'Start',
    'Scenario 1, sticks and switches',
    'Scenario 2, unplug',
    'Scenario 3, terminal in the background',
  ]);
  // "**Scenario 1, both fresh. Expect:**" ends its name at ". Expect".
  assert.deepEqual(names(row('Link state view')), [
    'Scenario 1, both fresh',
    'Scenario 2, one vehicle stopped',
    'Scenario 3, bridge down',
  ]);
  // No scenario paragraphs: one Start holding every Expect.
  assert.deepEqual(names(row('Several vehicles in SITL')), ['Start']);
  assert.deepEqual(names(row('Wire probe')), ['Start', 'Scenario, a quiet vehicle']);
  assert.equal(
    row('Wire probe').section?.goal,
    "with two vehicles running, each vehicle's heartbeats show at about 1 Hz under its own system ID. The probe only listens. Its README: [`tools/wire-probe`](../tools/wire-probe/README.md).",
  );
});

test('a scenario runs to the next one, its later Expects included', () => {
  const md = `| Test | Ticket / PR | Needs |
| --- | --- | --- |
| [T](#t) | GCS-1, PR #2 | x |

## T

**Goal:** g.

Start it:

\`\`\`sh
run
\`\`\`

**Expect:** up.

**Scenario 2, the station stops:** freeze it:

\`\`\`sh
pkill -STOP x
\`\`\`

**Expect:** stopped. Let it go:

\`\`\`sh
pkill -CONT x
\`\`\`

**Expect:** back.

**Scenario 3, one Ctrl-C:** press it. **Expect:** gone.
`;
  const { rows, problems } = parsePlaybook(md);
  assert.deepEqual(problems, []);
  const s = rows[0].section;
  assert.ok(s);
  assert.equal(s.goal, 'g.');
  assert.deepEqual(
    s.scenarios.map((x) => [x.name, x.from, x.to]),
    [
      ['Start', 3, 4],
      ['Scenario 2, the station stops', 4, 9],
      ['Scenario 3, one Ctrl-C', 9, 10],
    ],
  );
  assert.deepEqual(s.blocks[2], { kind: 'code', lang: 'sh', text: 'run' });
  assert.equal(rows[0].ticket, 'GCS-1');
  assert.deepEqual(rows[0].prs, [2]);
});

test('scenario names stop at the first colon or ". Expect"', () => {
  assert.equal(scenarioName('**Scenario 2, unplug:** unplug it.'), 'Scenario 2, unplug');
  assert.equal(scenarioName('**Scenario 1, both fresh. Expect:** fine.'), 'Scenario 1, both fresh');
  assert.equal(scenarioName('**Scenario, a quiet vehicle:** freeze.'), 'Scenario, a quiet vehicle');
});

test('a heading inside a fence does not start a section', () => {
  const md = `| Test | Ticket / PR | Needs |
| --- | --- | --- |
| [T](#t) | GCS-1 | x |

## T

**Goal:** g.

\`\`\`\`md
## Not a section
\`\`\`\`

**Expect:** fine.
`;
  const { rows, problems } = parsePlaybook(md);
  assert.deepEqual(problems, []);
  assert.equal(rows[0].section?.blocks[1].kind, 'code');
  assert.equal(rows[0].section?.blocks[1].text, '## Not a section');
});

test('blocks keeps a paragraph’s lines together and a fence as one block', () => {
  assert.deepEqual(blocks(['a', 'b', '', '```sh', 'x', '', 'y', '```', 'c']), [
    { kind: 'text', text: 'a\nb' },
    { kind: 'code', lang: 'sh', text: 'x\n\ny' },
    { kind: 'text', text: 'c' },
  ]);
});

test('an unreadable entry is a problem', () => {
  const md = `| Test | Ticket / PR | Needs |
| --- | --- | --- |
| [None](#none) | N8, PR #66 | x |
| [Two](#two) | GCS-1, GCS-2 | x |
| [Missing](#missing) | GCS-3 | x |
| [Bare](#bare) | GCS-4 | x |
| [Tree](#tree) | GCS-5 | x |

## None

**Expect:** a.

## Two

**Expect:** a.

## Bare

**Goal:** nothing to expect.

## Tree

\`\`\`sh
cd .worktrees/x && pnpm dev
\`\`\`

**Expect:** a.
`;
  assert.deepEqual(parsePlaybook(md).problems, [
    'None: its row names no GCS-<n> ticket.',
    'Two: its row names 2 tickets; keep one.',
    'Missing: no section with the anchor #missing.',
    'Bare: its section has no **Expect**.',
    'Tree: a command names a worktree (cd .worktrees/x && pnpm dev); blocks run from the checkout being tested.',
  ]);
  assert.deepEqual(parsePlaybook('# Nothing\n').problems, [
    'No table with a "Ticket / PR" column.',
  ]);
});
