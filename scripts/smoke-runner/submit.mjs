// Submit: what each test writes to Linear, in a fixed order, and running
// those writes one at a time so that a second Submit sends only what failed.
//
// Spec: docs/specs/2026-11-24-smoke-test-runner.md (§ Submit).

import { outcome, renderComment, summaryLine } from './result.mjs';

const MARKS = ['pass', 'fail', 'not run'];

/**
 * @typedef {import('./listing.mjs').Listed} Listed
 * @typedef {import('./result.mjs').Mark} Mark
 * @typedef {{ kind: 'finding', title: string } | { kind: 'recording' } | { kind: 'comment' } | { kind: 'state', to: string }} WriteKind
 * @typedef {WriteKind & { status: 'pending' | 'done' | 'failed', error?: string, result?: string, created?: { id: string, identifier: string } }} Write
 * @typedef {object} TestRun
 * @property {string} anchor
 * @property {string} name
 * @property {string} ticket
 * @property {import('./linear.mjs').Issue} issue
 * @property {import('./result.mjs').Where} where
 * @property {import('./result.mjs').Outcome} outcome
 * @property {{ name: string, mark?: Mark, note?: string }[]} scenarios
 * @property {{ name: string, type: string, size: number } | null} recording
 * @property {{ sha: string, pr: number } | null} countedFrom
 * @property {Write[]} writes
 * @typedef {{ date: string, short: string, dirty: boolean, onMaster: boolean, tests: TestRun[] }} Run
 */

/**
 * The state a result moves its ticket to, or null to leave it.
 * @param {import('./result.mjs').Outcome} o
 * @param {import('./result.mjs').Where} where
 * @param {boolean} dirty the run's checkout had uncommitted changes
 */
export function nextState(o, where, dirty) {
  if (o === 'failed') return 'In Progress';
  // A pass with uncommitted changes did not test master as it is: it is
  // recorded but closes nothing (the owner's call on PR #112).
  if (o === 'passed' && where.kind === 'master' && !dirty) return 'Done';
  return null;
}

/**
 * Plans a Submit.
 * @param {object} input
 * @param {Listed[]} input.listed what the page showed
 * @param {{ anchor: string, marks: ({ mark?: Mark, note?: string } | null)[], findings?: string[], recording?: { name: string, type: string, size: number } | null }[]} input.tests
 * @param {string[]} [input.counts] anchors whose draft pass the owner counts
 * @param {{ date: string, short: string, dirty: boolean, onMaster: boolean }} input.context
 * @returns {{ run: Run, skipped: string[] }} skipped: tests with nothing marked, by name
 */
export function planRun({ listed, tests, counts = [], context }) {
  const byAnchor = new Map(listed.map((l) => [l.row.anchor, l]));
  const run = { ...context, tests: [] };
  const skipped = [];
  const take = (anchor) => {
    const l = byAnchor.get(anchor);
    if (!l) throw new Error(`"${anchor}" is not a test listed here.`);
    if (!l.where || !l.issue || !l.row.ticket || !l.row.section) {
      throw new Error(`${l.row.name} cannot take a result here: ${l.why ?? 'not recordable'}`);
    }
    if (run.tests.some((t) => t.anchor === anchor)) {
      throw new Error(`${l.row.name} is in this Submit twice.`);
    }
    return l;
  };

  for (const t of tests) {
    const l = take(t.anchor);
    const section = /** @type {import('./playbook.mjs').Section} */ (l.row.section);
    if (t.marks.length !== section.scenarios.length) {
      throw new Error(
        `${l.row.name} has ${section.scenarios.length} scenarios, not ${t.marks.length}.`,
      );
    }
    for (const m of t.marks) {
      if (m?.mark !== undefined && !MARKS.includes(m.mark)) {
        throw new Error(`${l.row.name}: "${m.mark}" is not pass, fail or not run.`);
      }
    }
    const scenarios = section.scenarios.map((s, i) => ({
      name: s.name,
      mark: t.marks[i]?.mark,
      note: t.marks[i]?.note,
    }));
    const o = outcome(scenarios.map((s) => s.mark));
    if (!o) {
      skipped.push(l.row.name);
      continue;
    }
    const where = /** @type {import('./result.mjs').Where} */ (l.where);
    const findings = (t.findings ?? []).map((f) => f.trim()).filter(Boolean);
    run.tests.push(
      testRun(
        l,
        { outcome: o, where, scenarios, recording: t.recording ?? null, countedFrom: null },
        findings,
        context.dirty,
      ),
    );
  }

  for (const anchor of counts) {
    const l = take(anchor);
    if (!l.count) throw new Error(`${l.row.name} has no draft pass to count.`);
    const from = l.count.from;
    const draft = /** @type {{ kind: 'draft', pr: number }} */ (from.where);
    run.tests.push(
      testRun(
        l,
        {
          outcome: 'passed',
          where: { kind: 'master' },
          scenarios: from.scenarios,
          recording: null,
          countedFrom: { sha: /** @type {string} */ (from.sha), pr: draft.pr },
        },
        [],
        false,
      ),
    );
  }
  return { run, skipped };
}

function testRun(l, r, findings, dirty) {
  const issue = /** @type {import('./linear.mjs').Issue} */ (l.issue);
  /** @type {Write[]} */
  const writes = findings.map((title) => ({ kind: 'finding', title, status: 'pending' }));
  if (r.recording) writes.push({ kind: 'recording', status: 'pending' });
  writes.push({ kind: 'comment', status: 'pending' });
  const to = nextState(r.outcome, r.where, dirty);
  if (to && issue.state.name !== to) writes.push({ kind: 'state', to, status: 'pending' });
  return {
    anchor: l.row.anchor,
    name: l.row.name,
    ticket: /** @type {string} */ (l.row.ticket),
    issue,
    ...r,
    writes,
  };
}

/**
 * The state with this name in the ticket's team.
 * @param {import('./linear.mjs').Issue} issue
 * @param {string} name
 */
function stateId(issue, name) {
  const s = issue.team.states.find((x) => x.name === name);
  if (!s) throw new Error(`The team has no "${name}" state.`);
  return s.id;
}

/**
 * The next write of a test that has not landed, or null when all have.
 * @param {TestRun} test
 */
export function nextWrite(test) {
  const i = test.writes.findIndex((w) => w.status !== 'done');
  return i === -1 ? null : i;
}

/**
 * Runs one write. Writes run in order: only a test's first write that has not
 * landed may run. A recording goes through `upload`, which the caller gives
 * the file's body.
 * @param {Run} run
 * @param {number} testIndex
 * @param {number} writeIndex
 * @param {{ linear: ReturnType<import('./linear.mjs').linearClient>, upload?: (target: Awaited<ReturnType<ReturnType<import('./linear.mjs').linearClient>['uploadTarget']>>) => Promise<void> }} deps
 * @returns {Promise<Write>}
 */
export async function runWrite(run, testIndex, writeIndex, deps) {
  const test = run.tests[testIndex];
  if (!test) throw new Error('No such test in this Submit.');
  if (nextWrite(test) !== writeIndex) {
    throw new Error(`${test.name}: that write is not the next one to send.`);
  }
  const w = test.writes[writeIndex];
  try {
    if (w.kind === 'finding') {
      const where = test.where.kind === 'master' ? 'master' : `PR #${test.where.pr}, a draft`;
      // A ticket created before its relation failed is kept, so a resend
      // relates it rather than creating it twice.
      w.created ??= await deps.linear.createFinding({
        teamId: test.issue.team.id,
        projectId: test.issue.projectId,
        stateId: stateId(test.issue, 'Backlog'),
        title: w.title,
        description: `Found during the smoke test of ${test.name} (${test.ticket}) at \`${run.short}\` (${where}), on ${run.date}.`,
      });
      await deps.linear.relate(w.created.id, test.issue.id);
      w.result = w.created.identifier;
    } else if (w.kind === 'recording') {
      if (!deps.upload || !test.recording) throw new Error('The recording comes as an upload.');
      const target = await deps.linear.uploadTarget({
        contentType: test.recording.type,
        filename: test.recording.name,
        size: test.recording.size,
      });
      await deps.upload(target);
      w.result = target.assetUrl;
    } else if (w.kind === 'comment') {
      w.result = await deps.linear.comment(test.issue.id, commentFor(run, test));
    } else {
      await deps.linear.move(test.issue.id, stateId(test.issue, w.to));
      w.result = w.to;
    }
    w.status = 'done';
    delete w.error;
  } catch (e) {
    w.status = 'failed';
    w.error = e instanceof Error ? e.message : String(e);
  }
  return w;
}

/**
 * A test's comment, from the writes that landed before it.
 * @param {Run} run
 * @param {TestRun} test
 */
export function commentFor(run, test) {
  const rec = test.writes.find((w) => w.kind === 'recording' && w.status === 'done');
  return renderComment({
    outcome: test.outcome,
    date: run.date,
    sha: run.short,
    where: test.where,
    // A counted pass ran on the draft's commit, not in this checkout.
    dirty: test.countedFrom ? false : run.dirty,
    scenarios: test.scenarios,
    recording:
      rec && test.recording
        ? { name: test.recording.name, url: /** @type {string} */ (rec.result) }
        : null,
    findings: test.writes
      .filter((w) => w.kind === 'finding' && w.status === 'done')
      .map((w) => /** @type {string} */ (w.result)),
    countedFrom: test.countedFrom,
  });
}

/**
 * The summary line, over the tests whose comment landed.
 * @param {Run} run
 */
export function runSummary(run) {
  const landed = run.tests.filter((t) =>
    t.writes.some((w) => w.kind === 'comment' && w.status === 'done'),
  );
  return summaryLine({
    date: run.date,
    sha: run.short,
    onMaster: run.onMaster,
    tests: landed.map((t) => ({
      name: t.name,
      ticket: t.ticket,
      outcome: t.outcome,
      where: t.where,
    })),
    findings: run.tests.flatMap((t) =>
      t.writes
        .filter((w) => w.kind === 'finding' && w.status === 'done')
        .map((w) => /** @type {string} */ (w.result)),
    ),
  });
}
