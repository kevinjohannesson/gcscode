import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseArgs,
  projectDir,
  sessionCost,
  transcriptTotals,
  weighted,
} from './session-cost.mjs';

const script = fileURLToPath(new URL('./session-cost.mjs', import.meta.url));

const line = (entry) => JSON.stringify(entry);
const assistant = (id, output, timestamp) =>
  line({
    type: 'assistant',
    ...(timestamp ? { timestamp } : {}),
    message: { ...(id ? { id } : {}), usage: { output_tokens: output } },
  });

test('weighted uses the cache-write split when present', () => {
  assert.equal(
    weighted({
      input_tokens: 10,
      cache_creation_input_tokens: 100,
      cache_creation: { ephemeral_5m_input_tokens: 40, ephemeral_1h_input_tokens: 60 },
      cache_read_input_tokens: 1000,
      output_tokens: 20,
    }),
    380,
  );
});

test('weighted charges an unsplit cache write at the 5-minute rate', () => {
  assert.equal(
    weighted({
      input_tokens: 0,
      cache_creation_input_tokens: 100,
      cache_read_input_tokens: 0,
      output_tokens: 0,
    }),
    125,
  );
});

test('transcriptTotals counts each message id once', () => {
  const text = [assistant('m1', 10), assistant('m1', 10), assistant('m2', 1)].join('\n');
  assert.deepEqual(transcriptTotals(text), { weighted: 55, messages: 2, unreadable: 0 });
});

test('transcriptTotals skips other entry types and counts unreadable lines', () => {
  const text = [line({ type: 'user' }), '{"trunc', assistant('m1', 2)].join('\n');
  assert.deepEqual(transcriptTotals(text), { weighted: 10, messages: 1, unreadable: 1 });
});

test('projectDir replaces every non-alphanumeric character', () => {
  assert.equal(
    projectDir('/w/p/.claude/worktrees/a-1', '/c'),
    '/c/projects/-w-p--claude-worktrees-a-1',
  );
});

/** A temp config dir and a writer of transcript files under the project folder of `cwd`. */
function fixture(cwd) {
  const configDir = mkdtempSync(join(tmpdir(), 'session-cost-'));
  const dir = projectDir(cwd, configDir);
  const put = (rel, text) => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  };
  return { configDir, put };
}

test('transcriptTotals counts an entry without a message id every time', () => {
  const text = [assistant(undefined, 10), assistant(undefined, 10)].join('\n');
  assert.deepEqual(transcriptTotals(text), { weighted: 100, messages: 2, unreadable: 0 });
});

test('sessionCost adds subagents and skips transcripts started before since', () => {
  const cwd = '/w/p';
  const { configDir, put } = fixture(cwd);
  put('old.jsonl', assistant('o1', 100, '2026-11-09T10:00:00Z'));
  put('new.jsonl', assistant('n1', 10, '2026-11-12T00:30:00Z'));
  put('new/subagents/agent-a.jsonl', assistant('a1', 4, '2026-11-12T00:31:00Z'));
  put('new/subagents/agent-b.jsonl', assistant('b1', 2, '2026-11-12T00:32:00Z'));
  const result = sessionCost(cwd, { since: '2026-11-12T00:26:35Z', configDir });
  assert.equal(result.transcripts.length, 1);
  assert.deepEqual(result.transcripts[0], {
    id: 'new',
    startedAt: '2026-11-12T00:30:00Z',
    main: 50,
    subagents: 30,
    subagentCount: 2,
  });
  assert.equal(result.weighted, 80);
});

test('sessionCost lists transcripts oldest first, each with its first timestamp', () => {
  const cwd = '/w/p';
  const { configDir, put } = fixture(cwd);
  put('a.jsonl', assistant('a1', 1, '2026-11-12T09:00:00Z'));
  put('b.jsonl', assistant('b1', 1, '2026-11-12T10:00:00Z'));
  put(
    'c.jsonl',
    [line({ type: 'user', timestamp: '2026-11-12T08:00:00Z' }), assistant('c1', 1, '2026-11-12T08:05:00Z')].join('\n'),
  );
  const result = sessionCost(cwd, { configDir });
  assert.deepEqual(
    result.transcripts.map((t) => [t.id, t.startedAt]),
    [
      ['c', '2026-11-12T08:00:00Z'],
      ['a', '2026-11-12T09:00:00Z'],
      ['b', '2026-11-12T10:00:00Z'],
    ],
  );
});

test('parseArgs resolves a relative path against the current directory', () => {
  assert.deepEqual(parseArgs(['.'], '/w/p'), { path: '/w/p', since: undefined });
  assert.deepEqual(parseArgs(['./'], '/w/p'), { path: '/w/p', since: undefined });
  assert.deepEqual(parseArgs(['../p'], '/w/q'), { path: '/w/p', since: undefined });
  assert.deepEqual(parseArgs(['/w/p'], '/elsewhere'), { path: '/w/p', since: undefined });
});

test('parseArgs reads --since before or after the path', () => {
  const expected = { path: '/w/p', since: '2026-11-12T00:26:35Z' };
  assert.deepEqual(parseArgs(['.', '--since', '2026-11-12T00:26:35Z'], '/w/p'), expected);
  assert.deepEqual(parseArgs(['--since', '2026-11-12T00:26:35Z', '.'], '/w/p'), expected);
});

test('parseArgs refuses a missing path or a missing --since value', () => {
  assert.equal(parseArgs([], '/w/p'), undefined);
  assert.equal(parseArgs(['--since', '2026-11-12T00:26:35Z'], '/w/p'), undefined);
  assert.equal(parseArgs(['/w/p', '--since'], '/x'), undefined);
});

test('the CLI measures a relative worktree path like its absolute form', () => {
  // The child's process.cwd() is the real path; macOS's tmpdir is a symlink.
  const worktree = realpathSync(mkdtempSync(join(tmpdir(), 'session-cost-worktree-')));
  const { configDir, put } = fixture(worktree);
  put('s.jsonl', assistant('m1', 300000, '2026-11-12T00:30:00Z'));
  for (const arg of ['.', worktree]) {
    const stdout = execFileSync(process.execPath, [script, arg], {
      cwd: worktree,
      env: { ...process.env, CLAUDE_CONFIG_DIR: configDir },
      encoding: 'utf8',
    });
    assert.match(stdout, /^total 1\.5M weighted tokens /m);
  }
});

test('the CLI exits 2 with the usage line when the path is missing', () => {
  const result = spawnSync(process.execPath, [script, '--since', '2026-11-12T00:00:00Z'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 2);
  assert.match(
    result.stderr,
    /^Usage: node \.claude\/scripts\/session-cost\.mjs <worktree path> \[--since <ISO time>\]$/m,
  );
});
