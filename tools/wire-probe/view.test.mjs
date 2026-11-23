import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Panel,
  Rate,
  Tally,
  fit,
  formatRecord,
  frame,
  gaps,
  readRecording,
  recordLine,
  table,
} from './view.mjs';

const heartbeat = {
  message: 'HEARTBEAT',
  kind: 'heartbeat',
  target: null,
  detail: 'type 2 (quadrotor)',
};
const arm = { message: 'COMMAND_LONG', kind: 'command', target: 2, detail: 'command 400' };

test('the gap is per system, component and message', () => {
  const tally = new Tally();
  const a = tally.observe(1.0, { system: 1, component: 1 }, heartbeat);
  const b = tally.observe(1.25, { system: 2, component: 1 }, heartbeat);
  const c = tally.observe(1.5, { system: 1, component: 1 }, arm);
  const d = tally.observe(2.0, { system: 1, component: 1 }, heartbeat);
  const e = tally.observe(2.5, { system: 1, component: 2 }, heartbeat);
  assert.deepEqual(
    [a, b, c, d, e].map((r) => r.gap),
    [null, null, null, 1.0, null],
  );
  assert.deepEqual(d, {
    t: 2.0,
    system: 1,
    component: 1,
    message: 'HEARTBEAT',
    kind: 'heartbeat',
    target: null,
    gap: 1.0,
    detail: 'type 2 (quadrotor)',
  });
  assert.deepEqual(
    tally.sorted().map((r) => [r.system, r.component, r.message, r.count]),
    [
      [1, 1, 'COMMAND_LONG', 1],
      [1, 1, 'HEARTBEAT', 2],
      [1, 2, 'HEARTBEAT', 1],
      [2, 1, 'HEARTBEAT', 1],
    ],
  );
});

test('a frame line says when, who, what, the gap and the target', () => {
  const base = { t: 12.3456, system: 2, component: 1, kind: 'heartbeat', detail: 'armed' };
  assert.equal(
    formatRecord({ ...base, message: 'HEARTBEAT', target: null, gap: 1.0004 }),
    '   12.346 s  system 2 component 1  HEARTBEAT  gap 1.000 s  armed',
  );
  assert.equal(
    formatRecord({ ...base, message: 'HEARTBEAT', target: null, gap: null }),
    '   12.346 s  system 2 component 1  HEARTBEAT  first  armed',
  );
  assert.equal(
    formatRecord({ ...base, message: 'COMMAND_LONG', target: 3, gap: null, detail: 'command 400' }),
    '   12.346 s  system 2 component 1  COMMAND_LONG  first  to system 3, command 400',
  );
  assert.equal(
    formatRecord({ ...base, message: 'COMMAND_INT', target: 0, gap: 0.5, detail: 'command 176' }),
    '   12.346 s  system 2 component 1  COMMAND_INT  gap 0.500 s  to every system, command 176',
  );
});

test('the table has a header row and one row per sender and message', () => {
  const rows = [
    { system: 1, component: 1, message: 'HEARTBEAT', count: 12, last: 10.0, gap: 1.0 },
    { system: 2, component: 1, message: 'COMMAND_ACK', count: 1, last: 9.5, gap: null },
  ];
  assert.deepEqual(table(rows, 10.25), [
    '┌────────┬───────────┬─────────────┬───────┬──────────┬─────────────┐',
    '│ system │ component │ message     │ count │ last gap │   last seen │',
    '├────────┼───────────┼─────────────┼───────┼──────────┼─────────────┤',
    '│      1 │         1 │ HEARTBEAT   │    12 │  1.000 s │ 0.250 s ago │',
    '│      2 │         1 │ COMMAND_ACK │     1 │        - │ 0.750 s ago │',
    '└────────┴───────────┴─────────────┴───────┴──────────┴─────────────┘',
  ]);
});

test('the live block before anything arrives', () => {
  assert.deepEqual(frame({ rows: [], latest: [], now: 0, perSecond: null }), [
    '┌────────┬───────────┬─────────┬───────┬──────────┬───────────┐',
    '│ system │ component │ message │ count │ last gap │ last seen │',
    '├────────┼───────────┼─────────┼───────┼──────────┼───────────┤',
    '└────────┴───────────┴─────────┴───────┴──────────┴───────────┘',
    'latest frames, newest last:',
    '  (none yet)',
    'frames in the last second: (counting)',
  ]);
});

test('the live block ends with the rate of all frames and of the shown ones', () => {
  const lines = frame({ rows: [], latest: [], now: 0, perSecond: { all: 52, shown: 2 } });
  assert.equal(lines.at(-1), 'frames in the last second: 52 in all, 2 of them shown');
});

test('the panel overwrites in place, in one write, and skips an unchanged frame', () => {
  const p = new Panel();
  assert.equal(p.frame(['a', 'b']), '\x1b[?2026ha\x1b[K\nb\x1b[K\n\x1b[?2026l');
  assert.equal(p.frame(['a', 'b']), '');
  assert.equal(p.frame(['c', 'd']), '\x1b[?2026h\x1b[2Fc\x1b[K\nd\x1b[K\n\x1b[?2026l');
  assert.equal(p.frame(['e']), '\x1b[?2026h\x1b[2Fe\x1b[K\n\x1b[J\x1b[?2026l');
});

test('a resized terminal gets one frame drawn afresh from the top', () => {
  const p = new Panel();
  p.frame(['a', 'b'], { columns: 80, rows: 24 });
  assert.equal(p.frame(['a', 'b'], { columns: 80, rows: 24 }), '');
  assert.equal(
    p.frame(['a', 'b'], { columns: 60, rows: 24 }),
    '\x1b[?2026h\x1b[H\x1b[2Ja\x1b[K\nb\x1b[K\n\x1b[?2026l',
  );
  assert.equal(
    p.frame(['c'], { columns: 60, rows: 24 }),
    '\x1b[?2026h\x1b[2Fc\x1b[K\n\x1b[J\x1b[?2026l',
  );
});

test('a line wider than the terminal is cut one column short, so it never wraps', () => {
  assert.deepEqual(fit(['0123456789', '012345', '0123456'], { columns: 7 }), [
    '01234…',
    '012345',
    '01234…',
  ]);
});

test('lines past the terminal height minus one are left out', () => {
  assert.deepEqual(fit(['a', 'b', 'c', 'd'], { rows: 4 }), ['a', 'b', 'c']);
  assert.deepEqual(fit(['a', 'b', 'c'], {}), ['a', 'b', 'c']);
});

test('a short terminal drops the senders that do not fit and says how many', () => {
  const rows = [1, 2, 3, 4].map((system) => ({
    system,
    component: 1,
    message: 'HEARTBEAT',
    count: 1,
    last: 0,
    gap: null,
  }));
  // The tail is 3 lines (heading, "(none yet)", rate) and the table's frame 4,
  // so a 12-line terminal has room for 12 - 1 - 3 - 4 = 4 rows: all of them.
  const all = frame({ rows, latest: [], now: 0, perSecond: null, height: 12 });
  assert.equal(all.length, 11);
  assert.ok(!all.some((l) => l.includes('more rows')));
  // One line shorter: 3 rows of room, so 2 rows and a line saying 2 more.
  const cut = frame({ rows, latest: [], now: 0, perSecond: null, height: 11 });
  assert.equal(cut.length, 10);
  assert.deepEqual(cut.slice(3, 7), [
    '│      1 │         1 │ HEARTBEAT │     1 │        - │ 0.000 s ago │',
    '│      2 │         1 │ HEARTBEAT │     1 │        - │ 0.000 s ago │',
    '└────────┴───────────┴───────────┴───────┴──────────┴─────────────┘',
    '(2 more rows not shown: make the terminal taller)',
  ]);
});

test('the rate counts whole seconds, and a quiet second reads 0', () => {
  const r = new Rate();
  r.count(0.0, true);
  r.count(0.5, false);
  r.count(0.9, false);
  assert.equal(r.perSecond(0.95), null);
  assert.deepEqual(r.perSecond(1.1), { all: 3, shown: 1 });
  r.count(1.5, true);
  assert.deepEqual(r.perSecond(2.0), { all: 1, shown: 1 });
  r.count(2.5, true);
  // Two whole seconds passed: the last of them was quiet.
  assert.deepEqual(r.perSecond(4.2), { all: 0, shown: 0 });
});

test('a recording is one JSON object a line, read back with its gaps', () => {
  const records = [
    {
      t: 1.00001,
      system: 1,
      component: 1,
      message: 'HEARTBEAT',
      kind: 'heartbeat',
      target: null,
      gap: null,
      detail: 'x',
    },
    {
      t: 1.5,
      system: 2,
      component: 1,
      message: 'HEARTBEAT',
      kind: 'heartbeat',
      target: null,
      gap: null,
      detail: 'x',
    },
    {
      t: 2.00004,
      system: 1,
      component: 1,
      message: 'HEARTBEAT',
      kind: 'heartbeat',
      target: null,
      gap: 1.00003,
      detail: 'x',
    },
    {
      t: 2.25,
      system: 1,
      component: 2,
      message: 'HEARTBEAT',
      kind: 'heartbeat',
      target: null,
      gap: 0.5,
      detail: 'x',
    },
    {
      t: 2.5,
      system: 2,
      component: 1,
      message: 'HEARTBEAT',
      kind: 'heartbeat',
      target: null,
      gap: 1.0,
      detail: 'x',
    },
  ];
  const text = records.map(recordLine).join('\n') + '\n';
  assert.equal(
    text.split('\n')[2],
    '{"t":2,"system":1,"component":1,"message":"HEARTBEAT","kind":"heartbeat","target":null,"gap":1,"detail":"x"}',
  );
  const back = readRecording(text);
  assert.equal(back.length, 5);
  assert.deepEqual(gaps(back, { system: 1, message: 'HEARTBEAT' }), [1, 0.5]);
  assert.deepEqual(gaps(back, { system: 1, component: 1, message: 'HEARTBEAT' }), [1]);
  assert.deepEqual(gaps(back, { system: 2, message: 'HEARTBEAT' }), [1]);
  assert.deepEqual(gaps(back, { system: 3, message: 'HEARTBEAT' }), []);
});
