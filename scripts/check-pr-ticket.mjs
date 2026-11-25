#!/usr/bin/env node
// Checks that a pull request names its Linear ticket the way the review loop's
// PR templates ask (`.claude/skills/review-loop/SKILL.md`, PR templates):
//
//   - Ticket: Fixes GCS-<n>
//   - Ticket: Part of GCS-<n>
//   - Ticket: Related to GCS-<n>
//
// A feature PR must carry exactly one such line. A docs, spec or ADR PR may
// leave it out or write `Ticket: none`, since a Markdown-only change needs no
// ticket, but a line it does carry is checked the same way. Fenced code blocks
// in the body are quotes, so they are skipped.
//
// A ticket with a row in the smoke-test playbook's table (`docs/smoke-tests.md`)
// waits for its smoke test, so a merge must not close it: its PR links it with
// `Part of`, never `Related to`, no closing word anywhere in the body names it,
// and no PR names it in its title or branch. A PR that changes neither code nor
// what a test checks leaves the row's ticket off its line (`Ticket: none` for a
// docs PR). Spec: docs/specs/2026-11-24-smoke-test-runner.md.
//
// Linear closes a ticket on merge when its ID is in the title or branch, or
// follows a closing word in the body. A ticket the line links without closing
// stays out of the title and branch for the same reason.
//
// auto-merge's Gate 7 runs it too, from the base branch, just before merging,
// with PR_NUMBER and the head's playbook, since a label or body change re-runs
// that gate but not CI.
//
// In CI it reads the PR from the API rather than the event, so after the body
// is fixed a re-run of the job sees the fix. Outside a pull request it does
// nothing.

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ID = /GCS-(\d+)/gi;
// A ticket line: `Ticket:` after an optional list marker, in bold or not.
const TICKET_LINE = /^[ \t]*(?:[-*+]|\d+[.)])?[ \t]*(?:\*\*)?Ticket(?:\*\*)?:(?:\*\*)?(.*)$/gim;
const ENTRY = /^(Fixes|Closes|Part of|Related to)\s+GCS-(\d+)$/i;
// Linear's closing magic words, followed by an ID, anywhere in a PR body.
// It takes a list (`Fixes GCS-1, GCS-2 and GCS-3`) and IDs written as links.
const CLOSING =
  /\b(?:close[sd]?|closing|fix(?:e[sd])?|fixing|resolve[sd]?|resolving|complete[sd]?|completing)\b[\s:]+\[?GCS-\d+(?:\][^\s,]*)?(?:(?:\s*,\s*|\s+and\s+)\[?GCS-\d+(?:\][^\s,]*)?)*/gi;

/**
 * A PR body without its fenced code blocks, which quote text rather than say it.
 * @param {string} body
 * @returns {string}
 */
export function stripFences(body) {
  const kept = [];
  let fence = null;
  for (const line of body.split(/\r?\n/)) {
    const marker = /^[ \t]*(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence === null && marker) fence = marker;
    else if (fence !== null && marker && marker[0] === fence[0] && marker.length >= fence.length)
      fence = null;
    else if (fence === null) kept.push(line);
  }
  // An unclosed fence quotes nothing: GitHub would show the rest as code, but
  // the safe reading is to check it.
  return fence === null ? kept.join('\n') : body;
}

/**
 * The entries on a PR body's `Ticket:` lines, outside fenced code blocks.
 * @param {string | null} body
 * @returns {{ word: string, n: number }[]} e.g. `{ word: 'Part of', n: 16 }`
 */
export function ticketEntries(body) {
  const entries = [];
  for (const [, line] of stripFences(body ?? '').matchAll(TICKET_LINE)) {
    for (const entry of line.trim().split(/\s*,\s*/)) {
      const m = ENTRY.exec(entry);
      if (m) entries.push({ word: m[1], n: Number(m[2]) });
    }
  }
  return entries;
}

/**
 * The ticket IDs in the playbook table's "Ticket / PR" column, as numbers.
 * @param {string} playbook the text of `docs/smoke-tests.md`
 * @returns {Set<number>}
 */
export function playbookTickets(playbook) {
  const tickets = new Set();
  const lines = playbook.split('\n');
  const header = lines.findIndex((l) => /^\|.*\|\s*Ticket \/ PR\s*\|/.test(l));
  if (header === -1) return tickets;
  const column = lines[header]
    .split('|')
    .map((c) => c.trim())
    .indexOf('Ticket / PR');
  for (const line of lines.slice(header + 2)) {
    if (!line.startsWith('|')) break;
    const cell = line.split('|')[column] ?? '';
    for (const [, n] of cell.matchAll(ID)) tickets.add(Number(n));
  }
  return tickets;
}

/**
 * The review class a PR is gated as: its branch prefix, or for a `claude/*`
 * branch its one class label.
 * @param {string} branch
 * @param {string[]} labels
 * @returns {string | undefined} feat, spec, adr, docs, or undefined
 */
export function prClass(branch, labels) {
  const prefix = /^(feat|spec|adr|docs)\//.exec(branch)?.[1];
  if (prefix) return prefix;
  if (!branch.startsWith('claude/')) return undefined;
  const classes = labels.filter((l) => ['feat', 'spec', 'adr', 'docs'].includes(l));
  return classes.length === 1 ? classes[0] : undefined;
}

/**
 * What is wrong with a PR's ticket line, if anything.
 * @param {{ title: string, body: string | null, branch: string, labels: string[], playbook: string | string[] }} pr
 * @returns {string[]} one message per problem; empty when the PR passes
 */
export function checkPrTicket({ title, body, branch, labels, playbook }) {
  const kind = prClass(branch, labels);
  const text = stripFences(body ?? '');
  const lines = [...text.matchAll(TICKET_LINE)].map((m) => m[1].trim());
  // Several playbooks (the base's and the head's) count as their union.
  const waiting = new Set([playbook].flat().flatMap((text) => [...playbookTickets(text)]));
  // Tickets whose IDs must stay out of the title and branch name: every ticket
  // with a smoke test, and every ticket the line links without closing.
  const keepOut = new Set(waiting);
  const problems = [];

  if (lines.length === 0) {
    if (kind === 'feat') {
      problems.push(
        'A feature PR names its ticket: add "- Ticket: Fixes GCS-<n>" (or "Part of GCS-<n>") under Links.',
      );
    }
  } else if (lines.length > 1) {
    problems.push(`Found ${lines.length} "Ticket:" lines; keep one.`);
  } else if (/^none\b/i.test(lines[0])) {
    if (kind === 'feat')
      problems.push('A feature PR needs a ticket: "Ticket: none" is for Markdown-only PRs.');
  } else {
    const entries = lines[0].split(/\s*,\s*/).filter(Boolean);
    if (entries.length === 0) problems.push('The "Ticket:" line names no ticket.');
    for (const entry of entries) {
      const m = ENTRY.exec(entry);
      if (!m) {
        problems.push(
          `"${entry}" is not "Fixes", "Closes", "Part of" or "Related to" followed by one GCS-<n>.`,
        );
        continue;
      }
      const closes = /^(fixes|closes)$/i.test(m[1]);
      const n = Number(m[2]);
      if (closes && waiting.has(n)) {
        problems.push(
          `GCS-${n} has a smoke test in docs/smoke-tests.md, so a merge must not close it: write "Part of GCS-${n}".`,
        );
      }
      if (/^related to$/i.test(m[1]) && waiting.has(n)) {
        problems.push(
          `GCS-${n} has a smoke test in docs/smoke-tests.md, so its PRs name it with "Part of GCS-${n}", not "Related to": a PR that changes neither its code nor its test leaves it off the line.`,
        );
      }
      if (!closes) keepOut.add(n);
    }
  }

  const named = (where) => new Set([...where.matchAll(ID)].map(([, k]) => Number(k)));
  const inTitle = named(title);
  const inBranch = named(branch);
  for (const n of [...keepOut].sort((a, b) => a - b)) {
    if (inTitle.has(n)) problems.push(`Take GCS-${n} out of the title: Linear closes it on merge.`);
    if (inBranch.has(n)) problems.push(`The branch name has GCS-${n}: Linear closes it on merge.`);
  }

  // Linear closes on a closing word anywhere in the body, not only on the line.
  const prose = text.replace(TICKET_LINE, '');
  for (const m of prose.matchAll(CLOSING)) {
    for (const n of new Set([...m[0].matchAll(ID)].map(([, k]) => Number(k)))) {
      if (waiting.has(n)) {
        problems.push(
          `"${m[0]}" closes GCS-${n} on merge, but it has a smoke test: reword it, or write "Part of GCS-${n}".`,
        );
      }
    }
  }
  return problems;
}

/**
 * Checks the PR that PR_NUMBER or a GitHub Actions event names, against the
 * playbooks at PLAYBOOK_PATH, colon-separated, as one (default
 * `docs/smoke-tests.md`).
 * @param {{ env: Record<string, string | undefined>, fetch: typeof fetch, readFile: (path: string) => string, log: (line: string) => void }} io
 * @returns {Promise<number>} the exit code
 */
export async function run({ env, fetch, readFile, log }) {
  const { GITHUB_EVENT_NAME, GITHUB_EVENT_PATH, GITHUB_REPOSITORY, GITHUB_TOKEN } = env;
  // PR_NUMBER names the PR outright (auto-merge's gate); otherwise the event does.
  let number = Number(env.PR_NUMBER);
  if (!env.PR_NUMBER) {
    if (GITHUB_EVENT_NAME !== 'pull_request') {
      log('Not a pull request: nothing to check.');
      return 0;
    }
    number = JSON.parse(readFile(GITHUB_EVENT_PATH)).pull_request.number;
  }
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/pulls/${number}`, {
    headers: { authorization: `Bearer ${GITHUB_TOKEN}`, accept: 'application/vnd.github+json' },
  });
  if (!res.ok) {
    log(`::error title=PR ticket line::Could not read PR #${number}: HTTP ${res.status}.`);
    return 1;
  }
  const pr = await res.json();
  const problems = checkPrTicket({
    title: pr.title,
    body: pr.body,
    branch: pr.head.ref,
    labels: pr.labels.map((l) => l.name),
    playbook: (env.PLAYBOOK_PATH || 'docs/smoke-tests.md').split(':').map(readFile),
  });
  if (problems.length === 0) {
    log('The ticket line is fine.');
    return 0;
  }
  for (const p of problems) log(`::error title=PR ticket line::${p}`);
  log('Fix the PR, then re-run this job: it reads the PR as it is now.');
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await run({
    env: process.env,
    fetch,
    readFile: (path) => readFileSync(path, 'utf8'),
    log: console.log,
  });
}
