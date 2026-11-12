import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { projectDir, sessionCost, transcriptTotals, weighted } from './session-cost.mjs';

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

test('sessionCost adds subagents and skips transcripts started before since', () => {
  const configDir = mkdtempSync(join(tmpdir(), 'session-cost-'));
  const cwd = '/w/p';
  const dir = projectDir(cwd, configDir);
  const put = (rel, text) => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  };
  put('old.jsonl', assistant('o1', 100, '2026-11-09T10:00:00Z'));
  put('new.jsonl', assistant('n1', 10, '2026-11-12T00:30:00Z'));
  put('new/subagents/agent-a.jsonl', assistant('a1', 4, '2026-11-12T00:31:00Z'));
  put('new/subagents/agent-b.jsonl', assistant('b1', 2, '2026-11-12T00:32:00Z'));
  const result = sessionCost(cwd, { since: '2026-11-12T00:26:35Z', configDir });
  assert.equal(result.transcripts.length, 1);
  assert.deepEqual(
    { ...result.transcripts[0], startedAt: undefined },
    { id: 'new', startedAt: undefined, main: 50, subagents: 30, subagentCount: 2 },
  );
  assert.equal(result.weighted, 80);
});
