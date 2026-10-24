#!/usr/bin/env node
// Checks the disposition table in a `Code-review-followup:` commit against the
// PR's latest reviews. Run it after committing the followup and before pushing.
//
// Usage: .claude/scripts/check-dispositions.mjs <PR> [<commit>]   (commit defaults to HEAD)
//
// Every finding still open in each reviewer's latest review (an ID such as RT-3
// tagged [blocking], [non-blocking], [not resolved] or [partly resolved]) needs one
// line in the commit message:
//
//   RT-1 fixed: shell/docs/specs/foo.md
//   RT-2 kept: <reason>
//   RT-3 deferred: shell/docs/roadmap.md#considering
//
// `fixed:` paths must be changed by the commit. A `deferred:` target must exist,
// and must mention the finding ID — either in a line the commit adds there, or
// already. That is what catches "routed to the roadmap" claims that never landed.

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const STATUS = /\*{0,2}\b([A-Z]{2,4}-\d{1,3})\b\*{0,2}\s*\[(blocking|non-blocking|resolved|not resolved|partly resolved)\]/g;
const DISPOSITION = /^\s*(?:[-*]\s+)?([A-Z]{2,4}-\d{1,3}):?\s+(fixed|kept|deferred):\s*(.+?)\s*$/;

/** The newest submitted review per author: [{ login, submittedAt, body }]. */
export function latestPerAuthor(reviews) {
  const latest = new Map();
  for (const review of reviews) {
    if (!review.submittedAt) continue;
    const current = latest.get(review.login);
    if (!current || review.submittedAt > current.submittedAt) latest.set(review.login, review);
  }
  return [...latest.values()];
}

/** IDs a review leaves open: the first status tag on each ID, unless it is [resolved]. */
export function openFindings(body) {
  const statuses = new Map();
  for (const [, id, status] of body.matchAll(STATUS)) {
    if (!statuses.has(id)) statuses.set(id, status);
  }
  return [...statuses].filter(([, status]) => status !== 'resolved').map(([id]) => id);
}

/** Disposition lines in a commit message: Map<id, { verb, value }>. */
export function parseDispositions(message) {
  const dispositions = new Map();
  for (const line of message.split('\n')) {
    const match = DISPOSITION.exec(line);
    if (match) dispositions.set(match[1], { verb: match[2], value: match[3] });
  }
  return dispositions;
}

/**
 * Problems with a commit's dispositions.
 *   open        IDs still open in the latest reviews
 *   message     the commit message
 *   changed     Set of repo-relative paths the commit changes
 *   addedText   (path) → text of the lines the commit adds to that file
 *   fileText    (path) → file contents at the commit, or null if it doesn't exist
 */
export function checkDispositions({ open, message, changed, addedText, fileText }) {
  const problems = [];
  const dispositions = parseDispositions(message);

  for (const id of open) {
    if (!dispositions.has(id)) problems.push(`${id}: no disposition line (fixed: / kept: / deferred:)`);
  }

  for (const [id, { verb, value }] of dispositions) {
    if (!open.includes(id)) problems.push(`${id}: not open in any latest review — check the ID`);

    if (verb === 'fixed') {
      for (const path of value.split(/,\s*/).map((part) => part.split(/[\s:#]/)[0])) {
        if (fileText(path) !== null && !changed.has(path)) {
          problems.push(`${id}: fixed in ${path}, but this commit does not change ${path}`);
        }
      }
    }

    if (verb === 'deferred') {
      const path = value.split('#')[0].trim();
      const text = fileText(path);
      const mentions = new RegExp(`\\b${id}\\b`);
      if (text === null) problems.push(`${id}: deferred to ${path}, which does not exist`);
      else if (!mentions.test(addedText(path)) && !mentions.test(text)) {
        problems.push(`${id}: deferred to ${path}, but ${id} appears nowhere in it`);
      }
    }
  }

  return problems;
}

function run(command, args, cwd) {
  return execFileSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function main([pr, commit = 'HEAD']) {
  if (!pr) {
    console.error('usage: check-dispositions.mjs <PR> [<commit>]');
    return 2;
  }

  // Paths in dispositions are repo-relative, so every git call runs from the root.
  const root = run('git', ['rev-parse', '--show-toplevel']).trim();
  const git = (args) => run('git', args, root);

  const reviews = run('gh', [
    'api',
    '--paginate',
    `repos/{owner}/{repo}/pulls/${pr}/reviews`,
    '--jq',
    '.[] | {login: .user.login, submittedAt: .submitted_at, body: (.body // "")}',
  ])
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const open = [...new Set(latestPerAuthor(reviews).flatMap((review) => openFindings(review.body)))];

  const message = git(['log', '-1', '--format=%B', commit]);
  const changed = new Set(
    git(['diff-tree', '--no-commit-id', '--name-only', '-r', commit]).split('\n').filter(Boolean),
  );
  const addedText = (path) =>
    git(['show', '--format=', '-U0', commit, '--', path])
      .split('\n')
      .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
      .join('\n');
  const fileText = (path) => {
    try {
      return execFileSync('git', ['show', `${commit}:${path}`], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
    } catch {
      return null;
    }
  };

  const problems = checkDispositions({ open, message, changed, addedText, fileText });
  for (const problem of problems) console.log(problem);
  console.log(
    problems.length === 0
      ? `check-dispositions: ${open.length} open finding(s), all disposed`
      : `check-dispositions: ${problems.length} problem(s)`,
  );
  return problems.length === 0 ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2));
}
