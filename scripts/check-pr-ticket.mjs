#!/usr/bin/env node
// Checks that a pull request names its Linear ticket the way the review loop's
// PR templates ask (`.claude/skills/review-loop/SKILL.md`, PR templates):
//
//   - Ticket: Fixes GCS-<n>
//   - Ticket: Part of GCS-<n>
//   - Ticket: Related to GCS-<n>
//
// A feature PR must carry exactly one such line. A docs, spec or ADR PR may
// leave it out, since a Markdown-only change needs no ticket, but a line it does
// carry is checked the same way. A ticket with a row in the smoke-test
// playbook's table (`docs/smoke-tests.md`) waits for its smoke test, so its PR
// uses `Part of` (or `Related to`, for a PR that changes neither code nor what a
// test checks), never `Fixes` or `Closes`. A non-closing link keeps the ID out of
// the title and branch name: Linear closes a ticket on merge when either names it.
//
// In CI it reads the PR from the API rather than the event, so after the body
// is fixed a re-run of the job sees the fix. Outside a pull request it does
// nothing.

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ID = /GCS-(\d+)/gi;
const TICKET_LINE = /^[ \t]*[-*]?[ \t]*Ticket:(.*)$/gim;
const ENTRY = /^(Fixes|Closes|Part of|Related to)\s+GCS-(\d+)$/i;

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
 * @param {{ title: string, body: string, branch: string, labels: string[], playbook: string }} pr
 * @returns {string[]} one message per problem; empty when the PR passes
 */
export function checkPrTicket({ title, body, branch, labels, playbook }) {
  const kind = prClass(branch, labels);
  const lines = [...(body ?? '').matchAll(TICKET_LINE)].map((m) => m[1].trim());

  if (lines.length === 0) {
    return kind === 'feat'
      ? [
          'A feature PR names its ticket: add "- Ticket: Fixes GCS-<n>" (or "Part of GCS-<n>") under Links.',
        ]
      : [];
  }
  if (lines.length > 1) return [`Found ${lines.length} "Ticket:" lines; keep one.`];

  const problems = [];
  const waiting = playbookTickets(playbook);
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
    const id = `GCS-${n}`;
    if (closes && waiting.has(n)) {
      problems.push(
        `${id} has a smoke test in docs/smoke-tests.md, so a merge must not close it: write "Part of ${id}".`,
      );
    }
    if (!closes) {
      const named = (text) => [...text.matchAll(ID)].some(([, k]) => Number(k) === n);
      if (named(title)) problems.push(`Take ${id} out of the title: Linear closes it on merge.`);
      if (named(branch)) problems.push(`The branch name has ${id}: Linear closes it on merge.`);
    }
  }
  return problems;
}

async function main() {
  const { GITHUB_EVENT_NAME, GITHUB_EVENT_PATH, GITHUB_REPOSITORY, GITHUB_TOKEN } = process.env;
  if (GITHUB_EVENT_NAME !== 'pull_request') {
    console.log('Not a pull request: nothing to check.');
    return 0;
  }
  const number = JSON.parse(readFileSync(GITHUB_EVENT_PATH, 'utf8')).pull_request.number;
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/pulls/${number}`, {
    headers: { authorization: `Bearer ${GITHUB_TOKEN}`, accept: 'application/vnd.github+json' },
  });
  if (!res.ok) {
    console.error(`Could not read PR #${number}: HTTP ${res.status}.`);
    return 1;
  }
  const pr = await res.json();
  const problems = checkPrTicket({
    title: pr.title,
    body: pr.body ?? '',
    branch: pr.head.ref,
    labels: pr.labels.map((l) => l.name),
    playbook: readFileSync('docs/smoke-tests.md', 'utf8'),
  });
  if (problems.length === 0) {
    console.log('The ticket line is fine.');
    return 0;
  }
  for (const p of problems) console.log(`::error title=PR ticket line::${p}`);
  console.log('Fix the PR, then re-run this job: it reads the PR as it is now.');
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
