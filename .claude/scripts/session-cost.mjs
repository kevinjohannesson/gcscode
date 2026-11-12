#!/usr/bin/env node
// Measures how many billed-weight tokens the Claude Code sessions of a worktree used,
// so a controller can state it in its final report.
//
// Usage: .claude/scripts/session-cost.mjs <worktree path> [--since <ISO time>]
//
// Every assistant entry in a session transcript carries a `usage` line. Its token
// counts are weighted by what each kind costs relative to a plain input token:
//
//   input 1, cache write (5 minute) 1.25, cache write (1 hour) 2, cache read 0.1, output 5
//
// A cache write without the 5-minute/1-hour split counts at the 5-minute rate. The
// same message id repeats on several lines (one per content block) with the same
// usage, so each id counts once; entries without an id count every time.
//
// Transcripts live in `$CLAUDE_CONFIG_DIR` (default `~/.claude`) under
// `projects/<path with every non-alphanumeric character replaced by ->/<id>.jsonl`.
// Subagent transcripts live under `<id>/subagents/`, searched recursively, and are
// added to their session. `--since` skips sessions whose first timestamp is earlier.
// Figures are printed in millions of weighted tokens.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultConfigDir = () => process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');

export const WEIGHTS = { input: 1, cacheWrite5m: 1.25, cacheWrite1h: 2, cacheRead: 0.1, output: 5 };

/** The weighted token count of one `usage` object. */
export function weighted(usage) {
  const split = usage.cache_creation;
  const write5m = split
    ? (split.ephemeral_5m_input_tokens ?? 0)
    : (usage.cache_creation_input_tokens ?? 0);
  const write1h = split ? (split.ephemeral_1h_input_tokens ?? 0) : 0;
  return (
    (usage.input_tokens ?? 0) * WEIGHTS.input +
    write5m * WEIGHTS.cacheWrite5m +
    write1h * WEIGHTS.cacheWrite1h +
    (usage.cache_read_input_tokens ?? 0) * WEIGHTS.cacheRead +
    (usage.output_tokens ?? 0) * WEIGHTS.output
  );
}

function parseLines(text) {
  const entries = [];
  let unreadable = 0;
  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue;
    try {
      entries.push(JSON.parse(raw));
    } catch {
      unreadable++;
    }
  }
  return { entries, unreadable };
}

/** Weighted total of a transcript's JSONL text: { weighted, messages, unreadable }. */
export function transcriptTotals(text) {
  const { entries, unreadable } = parseLines(text);
  const seen = new Set();
  let total = 0;
  let messages = 0;
  for (const entry of entries) {
    const usage = entry?.type === 'assistant' ? entry.message?.usage : undefined;
    if (!usage) continue;
    const id = entry.message.id;
    if (id !== undefined) {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    total += weighted(usage);
    messages++;
  }
  return { weighted: total, messages, unreadable };
}

/** The folder holding the transcripts of sessions run in `cwd`. */
export function projectDir(cwd, configDir) {
  return join(configDir, 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
}

function firstTimestamp(text) {
  for (const entry of parseLines(text).entries) {
    if (typeof entry?.timestamp === 'string') return entry.timestamp;
  }
  return undefined;
}

function jsonlFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((item) =>
    item.isDirectory()
      ? jsonlFiles(join(dir, item.name))
      : item.name.endsWith('.jsonl')
        ? [join(dir, item.name)]
        : [],
  );
}

/**
 * Weighted cost of the sessions run in `cwd`, oldest first. `unreadable` counts
 * the lines no transcript could parse.
 */
export function sessionCost(cwd, { since, configDir = defaultConfigDir() } = {}) {
  const dir = projectDir(cwd, configDir);
  const transcripts = [];
  let unreadable = 0;
  for (const item of readdirSync(dir)) {
    if (!item.endsWith('.jsonl')) continue;
    const id = item.slice(0, -'.jsonl'.length);
    const text = readFileSync(join(dir, item), 'utf8');
    const startedAt = firstTimestamp(text);
    if (since && !(startedAt >= since)) continue;
    const main = transcriptTotals(text);
    const subagentFiles = jsonlFiles(join(dir, id, 'subagents'));
    let subagents = 0;
    for (const file of subagentFiles) {
      const totals = transcriptTotals(readFileSync(file, 'utf8'));
      subagents += totals.weighted;
      unreadable += totals.unreadable;
    }
    unreadable += main.unreadable;
    transcripts.push({
      id,
      startedAt,
      main: main.weighted,
      subagents,
      subagentCount: subagentFiles.length,
    });
  }
  transcripts.sort((a, b) => (a.startedAt ?? '').localeCompare(b.startedAt ?? ''));
  const total = transcripts.reduce((sum, t) => sum + t.main + t.subagents, 0);
  return { transcripts, weighted: total, unreadable };
}

const millions = (n) => `${(n / 1e6).toFixed(1)}M`;

function main(argv) {
  const usage = 'Usage: session-cost.mjs <worktree path> [--since <ISO time>]';
  const args = argv.slice(2);
  const sinceAt = args.indexOf('--since');
  const since = sinceAt >= 0 ? args[sinceAt + 1] : undefined;
  const path = args.find((arg, i) => !arg.startsWith('--') && (sinceAt < 0 || i !== sinceAt + 1));
  if (!path || (sinceAt >= 0 && !since)) {
    console.error(usage);
    return 2;
  }
  const configDir = defaultConfigDir();
  if (!existsSync(projectDir(path, configDir))) {
    console.error(`No transcripts folder for ${path}`);
    return 1;
  }
  const result = sessionCost(path, { since, configDir });
  for (const t of result.transcripts) {
    console.log(
      `${t.id}  ${t.startedAt ?? 'unknown start'}  main ${millions(t.main)}  subagents ${millions(t.subagents)} (${t.subagentCount})`,
    );
  }
  console.log(
    `total ${millions(result.weighted)} weighted tokens (input 1, cache write 1.25 / 2, cache read 0.1, output 5)`,
  );
  if (result.unreadable) console.log(`unreadable lines: ${result.unreadable}`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv);
