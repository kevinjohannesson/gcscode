#!/usr/bin/env node
// Checks the disposition table in a `Code-review-followup:` commit against the
// PR's latest reviews. Run it after committing the followup and before pushing.
//
// Usage: .claude/scripts/check-dispositions.mjs <PR> [<commit>]   (commit defaults to HEAD)
//
// Every finding still open in each reviewer's latest review (an ID such as RT-3
// tagged [blocking], [non-blocking], [not resolved] or [partly resolved]) needs one
// line in the commit message, unless a followup since that review disposed it:
//
//   RT-1 fixed: shell/docs/specs/foo.md
//   RT-2 kept: <reason>
//   RT-3 deferred: shell/docs/roadmap.md#considering
//
// `fixed:` paths must exist and be changed by the commit. A `deferred:` target must
// exist and mention the finding qualified by its PR (`PR #38 RT-3`), because IDs
// restart on every PR — under the named heading when the target has a `#section`.
// That is what catches "routed to the roadmap" claims that never landed.

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { section } from '../../shell/scripts/lint-docs.mjs';

const ID = '[A-Z]{2,4}-\\d{1,3}';
const STATUS = new RegExp(
  `\\*{0,2}\\b(${ID})\\b\\*{0,2}\\s*\\[(blocking|non-blocking|resolved|not resolved|partly resolved)\\]`,
  'g',
);
const DISPOSITION = new RegExp(
  `^\\s*(?:[-*]\\s+)?(${ID}):?\\s+(fixed|kept|deferred):\\s*(.+?)\\s*$`,
);

/** The newest submitted review per author: [{ login, submittedAt, commitId, body }]. */
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

/** A review's open IDs minus those disposed by a followup committed after it. */
export function stillOpen(body, laterMessages) {
  const disposed = new Set(
    laterMessages.flatMap((message) => [...parseDispositions(message).keys()]),
  );
  return openFindings(body).filter((id) => !disposed.has(id));
}

/** Whether a token in a `fixed:` value names a file rather than describing a hunk. */
const looksLikePath = (token) => token.includes('/') || /\.[a-z]{1,5}$/i.test(token);

/**
 * Problems with a commit's dispositions.
 *   pr        the PR number, which qualifies deferred IDs
 *   open      IDs still open in the latest reviews
 *   message   the commit message
 *   changed   Set of repo-relative paths the commit changes
 *   fileText  (path) → file contents at the commit, or null if it doesn't exist
 */
export function checkDispositions({ pr, open, message, changed, fileText }) {
  const problems = [];
  const dispositions = parseDispositions(message);

  for (const id of open) {
    if (!dispositions.has(id))
      problems.push(`${id}: no disposition line (fixed: / kept: / deferred:)`);
  }

  for (const [id, { verb, value }] of dispositions) {
    if (!open.includes(id)) problems.push(`${id}: not open in any latest review — check the ID`);

    if (verb === 'fixed') {
      for (const path of value.split(/,\s*/).map((part) => part.split(/[\s:#]/)[0])) {
        // A path the commit changes is fine even if it no longer exists (a deletion).
        if (changed.has(path)) continue;
        if (fileText(path) !== null) {
          problems.push(`${id}: fixed in ${path}, but this commit does not change ${path}`);
        } else if (looksLikePath(path)) {
          problems.push(`${id}: fixed in ${path}, which does not exist`);
        }
      }
    }

    if (verb === 'deferred') {
      const target = value.split(/\s/)[0];
      const [path, anchor] = target.split('#');
      const text = fileText(path);
      const qualified = new RegExp(`PR #${pr}\\b(?:[\\s,/]+${ID})*[\\s,/]+${id}\\b`);
      if (text === null) {
        problems.push(`${id}: deferred to ${path}, which does not exist`);
        continue;
      }
      const scope = anchor ? section(text, decodeURIComponent(anchor)) : text;
      if (scope === null) {
        problems.push(`${id}: deferred to ${target}, but ${path} has no heading #${anchor}`);
      } else if (!qualified.test(scope)) {
        const where = anchor ? 'under that heading' : 'in it';
        problems.push(`${id}: deferred to ${target}, but "PR #${pr} ${id}" appears nowhere ${where}`);
      }
    }
  }

  return problems;
}

function run(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
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
    '.[] | {login: .user.login, submittedAt: .submitted_at, commitId: .commit_id, body: (.body // "")}',
  ])
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  // Followups between a review and this commit may already have disposed its findings
  // (a role with no newer review, such as an architect whose round 1 had no blockers).
  const messagesSince = (reviewCommit) => {
    try {
      return git(['log', '--format=%B%x00', `${reviewCommit}..${commit}^`]).split('\0');
    } catch {
      return [];
    }
  };
  const open = [
    ...new Set(
      latestPerAuthor(reviews).flatMap((review) =>
        stillOpen(review.body, review.commitId ? messagesSince(review.commitId) : []),
      ),
    ),
  ];

  const message = git(['log', '-1', '--format=%B', commit]);
  const changed = new Set(
    git(['diff-tree', '--no-commit-id', '--name-only', '-r', commit]).split('\n').filter(Boolean),
  );
  const fileText = (path) => {
    try {
      return git(['show', `${commit}:${path}`]);
    } catch {
      return null;
    }
  };

  const problems = checkDispositions({ pr, open, message, changed, fileText });
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
