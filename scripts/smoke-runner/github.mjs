// A row's PRs, read from GitHub through the owner's signed-in `gh`.
//
// Spec: docs/specs/2026-11-24-smoke-test-runner.md (§ Which tickets wait).

import { ticketEntries } from '../check-pr-ticket.mjs';

/** @typedef {(args: string[]) => Promise<string>} Gh runs gh in the checkout and resolves to its stdout */
/** @typedef {{ number: number, state: 'open' | 'merged' | 'closed', title: string, base: string }} Pr */

const STATE = { OPEN: 'open', MERGED: 'merged', CLOSED: 'closed' };

/**
 * Whether a PR body's `Ticket:` line names the ticket with `Part of`.
 * @param {string | null} body
 * @param {string} ticket `GCS-<n>`
 */
export function namesPartOf(body, ticket) {
  const n = Number(ticket.slice(4));
  return ticketEntries(body).some((e) => e.n === n && /^part of$/i.test(e.word));
}

/**
 * A row's PRs: the one its row names and every PR whose `Ticket:` line says
 * `Part of` its ticket, leaving out any closed without merging. Sorted by number.
 * @param {Gh} gh
 * @param {{ ticket: string | null, prs: number[] }} row
 * @returns {Promise<Pr[]>}
 */
export async function rowPrs(gh, row) {
  const fields = 'number,state,title,body,baseRefName';
  /** @type {Map<number, { number: number, state: string, title: string, body: string }>} */
  const found = new Map();
  const named = await Promise.all(
    row.prs.map(async (n) => JSON.parse(await gh(['pr', 'view', String(n), '--json', fields]))),
  );
  for (const pr of named) found.set(pr.number, pr);
  if (row.ticket) {
    const search = `"Part of ${row.ticket}" in:body`;
    const list = JSON.parse(
      await gh([
        'pr',
        'list',
        '--state',
        'all',
        '--limit',
        '100',
        '--search',
        search,
        '--json',
        fields,
      ]),
    );
    for (const pr of list) if (namesPartOf(pr.body, row.ticket)) found.set(pr.number, pr);
  }
  return [...found.values()]
    .map((pr) => ({
      number: pr.number,
      state: STATE[pr.state] ?? 'open',
      title: pr.title,
      base: pr.baseRefName ?? 'master',
    }))
    .filter((pr) => pr.state !== 'closed')
    .sort((a, b) => a.number - b.number);
}
