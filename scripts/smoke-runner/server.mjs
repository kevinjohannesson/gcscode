// The runner's HTTP server: one page and the JSON calls it makes, answered
// only for that page.
//
// Spec: docs/specs/2026-11-24-smoke-test-runner.md (§ The runner, "Only its own page").

import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { againstPr, commitsAfter, readCheckout, worktreePr } from './git.mjs';
import { rowPrs } from './github.mjs';
import { listTests } from './listing.mjs';
import { parsePlaybook } from './playbook.mjs';
import { localDate } from './result.mjs';
import { planRun, runSummary, runWrite } from './submit.mjs';

export const PORT = 5180;
const PAGE = fileURLToPath(new URL('./page.html', import.meta.url));
const MAX_JSON = 1024 * 1024;

/**
 * Whether a request comes from the runner's own page: its Host is the
 * runner's, and so is its Origin when it sends one.
 * @param {import('node:http').IncomingHttpHeaders} headers
 * @param {number} port
 */
export function ownPage(headers, port) {
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!hosts.includes(headers.host ?? '')) return false;
  const origin = headers.origin;
  return origin === undefined || origin === `http://${headers.host}`;
}

/**
 * The body type a POST route takes.
 * @param {string} path
 */
export function bodyType(path) {
  return path === '/api/run/recording' ? 'application/octet-stream' : 'application/json';
}

/**
 * @typedef {object} Deps
 * @property {(args: string[]) => string} git
 * @property {(args: string[]) => Promise<string>} gh
 * @property {ReturnType<import('./linear.mjs').linearClient> | null} linear null without a key
 * @property {(target: { uploadUrl: string, headers: { key: string, value: string }[] }, file: { contentType: string, size: number }, body: import('node:stream').Readable) => Promise<void>} putUpload
 * @property {() => Date} now
 * @property {number} [port]
 */

/**
 * Gathers what the page shows.
 * @param {Deps} deps
 * @param {number | null} chosenPr
 */
export async function gather(deps, chosenPr) {
  const checkout = readCheckout(deps.git);
  const playbook = readFileSync(`${checkout.root}/docs/smoke-tests.md`, 'utf8');
  const { rows, problems } = parsePlaybook(playbook);
  if (checkout.fetchError) {
    problems.push(
      `Could not fetch master (${checkout.fetchError}), so where this checkout stands is unknown: the playbook is shown, and nothing can be recorded until a reload fetches it.`,
    );
  }
  const onMaster = checkout.behindMaster === 0;
  const pr = onMaster ? null : (worktreePr(checkout.root) ?? chosenPr);
  let prContext = null;
  if (pr !== null) {
    try {
      prContext = { pr, ...againstPr(deps.git, checkout.head, pr) };
    } catch (e) {
      problems.push(`Could not fetch PR #${pr}'s head: ${message(e)}`);
    }
  }
  const prs = new Map(
    await Promise.all(
      rows.map(async (row) => [row.anchor, await rowPrs(deps.gh, row).catch((e) => toError(e))]),
    ),
  );
  let issues = null;
  if (deps.linear) {
    const linear = deps.linear;
    issues = new Map();
    const tickets = [...new Set(rows.map((r) => r.ticket).filter((t) => t !== null))];
    try {
      const found = await Promise.all(tickets.map((t) => linear.issue(t)));
      tickets.forEach((t, i) => issues.set(t, found[i]));
    } catch (e) {
      problems.push(`Could not read the tickets from Linear: ${message(e)}`);
      issues = null;
    }
  }
  const listing = listTests({
    rows,
    checkout,
    prContext,
    issues,
    prs,
    commitsAfter: (pass, merge) => commitsAfter(deps.git, pass, merge),
  });
  const openPrs = [
    ...new Set(
      [...prs.values()]
        .filter((p) => !(p instanceof Error))
        .flat()
        .filter((p) => p.state === 'open')
        .map((p) => p.number),
    ),
  ].sort((a, b) => a - b);
  return { checkout, pr, problems, listing, openPrs, worktree: worktreePr(checkout.root) };
}

function message(e) {
  return e instanceof Error ? e.message.split('\n')[0] : String(e);
}

function toError(e) {
  return e instanceof Error ? e : new Error(String(e));
}

/** What the page gets for a gathered state. */
function stateView(g, keyed, run) {
  return {
    checkout: {
      short: g.checkout.short,
      dirty: g.checkout.dirty,
      root: g.checkout.root,
      onMaster: g.checkout.behindMaster === 0,
      behindMaster: g.checkout.behindMaster,
      pr: g.pr,
      worktree: g.worktree,
    },
    key: keyed,
    problems: g.problems,
    notice: g.listing.notice,
    mode: g.listing.mode,
    openPrs: g.openPrs,
    listed: g.listing.listed.map((l) => ({
      anchor: l.row.anchor,
      name: l.row.name,
      ticket: l.row.ticket,
      needs: l.row.needs,
      section: l.row.section,
      issue: l.issue && {
        identifier: l.issue.identifier,
        title: l.issue.title,
        url: l.issue.url,
        state: l.issue.state.name,
      },
      prs: l.prs,
      latest: l.latest,
      closedWithoutTest: l.closedWithoutTest,
      where: l.where,
      why: l.why,
      count: l.count,
    })),
    run: run && runView(run),
  };
}

function runView(run) {
  return {
    tests: run.tests.map((t) => ({
      anchor: t.anchor,
      name: t.name,
      ticket: t.ticket,
      outcome: t.outcome,
      where: t.where,
      writes: t.writes,
    })),
    done: run.tests.every((t) => t.writes.every((w) => w.status === 'done')),
    summary: runSummary(run),
  };
}

/**
 * Reads a JSON body of at most 1 MiB.
 * @param {import('node:http').IncomingMessage} req
 */
async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_JSON) throw new HttpError(413, 'Body too large.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new HttpError(400, 'Not JSON.');
  }
}

class HttpError extends Error {
  constructor(status, msg) {
    super(msg);
    this.status = status;
  }
}

/**
 * The runner's server.
 * @param {Deps} deps
 * @returns {import('node:http').Server}
 */
export function smokeServer(deps) {
  const port = deps.port ?? PORT;
  let chosenPr = null;
  /** @type {Awaited<ReturnType<typeof gather>> | null} */
  let last = null;
  /** @type {import('./submit.mjs').Run | null} */
  let run = null;
  let busy = false;

  const send = (res, status, body, type = 'application/json') => {
    res.writeHead(status, {
      'content-type': type === 'application/json' ? 'application/json; charset=utf-8' : type,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
    });
    res.end(type === 'application/json' ? JSON.stringify(body) : body);
  };

  async function handle(req, res) {
    if (!ownPage(req.headers, port))
      throw new HttpError(403, 'Only the runner page may call this.');
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    if (req.method === 'GET' && url.pathname === '/') {
      return send(res, 200, readFileSync(PAGE, 'utf8'), 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && url.pathname === '/api/state') {
      last = await gather(deps, chosenPr);
      return send(res, 200, stateView(last, deps.linear !== null, run));
    }
    if (req.method !== 'POST') throw new HttpError(404, 'Not found.');
    const type = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    if (type !== bodyType(url.pathname)) {
      throw new HttpError(415, `This route takes ${bodyType(url.pathname)}.`);
    }

    if (url.pathname === '/api/pr') {
      const { pr } = await readJson(req);
      chosenPr = Number.isInteger(pr) && pr > 0 ? pr : null;
      return send(res, 200, { pr: chosenPr });
    }
    if (url.pathname === '/api/run') {
      const body = await readJson(req);
      if (!last || !deps.linear) throw new HttpError(409, 'Load the page first.');
      if (body.discard === true) {
        run = null;
        return send(res, 200, { run: null, skipped: [] });
      }
      if (last.checkout.fetchError) {
        throw new HttpError(409, 'Master could not be fetched: reload once online.');
      }
      if (run && !runView(run).done) {
        throw new HttpError(
          409,
          'The last Submit has writes still to send: send them first, or discard that Submit.',
        );
      }
      // The comment records HEAD, the dirty flag and whether HEAD is master's
      // tip as the page showed them, so each must still hold.
      const now = readCheckout(deps.git);
      if (
        now.head !== last.checkout.head ||
        now.dirty !== last.checkout.dirty ||
        now.master !== last.checkout.master
      ) {
        throw new HttpError(
          409,
          'The checkout or master changed since the page loaded: reload it.',
        );
      }
      try {
        const planned = planRun({
          listed: last.listing.listed,
          tests: Array.isArray(body.tests) ? body.tests : [],
          counts: Array.isArray(body.counts) ? body.counts : [],
          context: {
            date: localDate(deps.now()),
            short: last.checkout.short,
            dirty: last.checkout.dirty,
            onMaster: last.listing.mode === 'master',
          },
        });
        run = planned.run;
        return send(res, 200, { run: runView(run), skipped: planned.skipped });
      } catch (e) {
        throw new HttpError(400, message(e));
      }
    }
    if (url.pathname === '/api/run/write' || url.pathname === '/api/run/recording') {
      if (!run || !deps.linear) throw new HttpError(409, 'Nothing submitted.');
      if (busy) throw new HttpError(409, 'A write is still running.');
      const recording = url.pathname === '/api/run/recording';
      const { test, write } = recording
        ? {
            test: Number(url.searchParams.get('test')),
            write: Number(url.searchParams.get('write')),
          }
        : await readJson(req);
      const t = run.tests[test];
      const w = t?.writes[write];
      if (!w) throw new HttpError(400, 'No such write.');
      if ((w.kind === 'recording') !== recording) {
        throw new HttpError(
          400,
          recording ? 'That write is not a recording.' : 'Send a recording as an upload.',
        );
      }
      const file = t.recording;
      if (recording && (!file || Number(req.headers['content-length']) !== file.size)) {
        throw new HttpError(400, 'The upload is not the size the Submit gave.');
      }
      busy = true;
      try {
        await runWrite(run, test, write, {
          linear: deps.linear,
          upload:
            recording && file
              ? (target) => deps.putUpload(target, { contentType: file.type, size: file.size }, req)
              : undefined,
        });
      } catch (e) {
        throw new HttpError(409, message(e));
      } finally {
        busy = false;
      }
      return send(res, 200, { run: runView(run) });
    }
    throw new HttpError(404, 'Not found.');
  }

  return createServer((req, res) => {
    handle(req, res).catch((e) => {
      const status = e instanceof HttpError ? e.status : 500;
      if (!res.headersSent) send(res, status, { error: message(e) });
      req.resume();
    });
  });
}
