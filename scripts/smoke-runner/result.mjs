// The smoke test result: the comment the runner writes on a ticket, reading
// one back, and the one-line summary the owner pastes into the project chat.
//
// Spec: docs/specs/2026-11-24-smoke-test-runner.md (§ Submit, § The summary line).

export const MARKER = '<!-- smoke-test-result v1 -->';

/** @typedef {'pass' | 'fail' | 'not run'} Mark */
/** @typedef {'passed' | 'failed' | 'partly run'} Outcome */
/** @typedef {{ kind: 'master' } | { kind: 'draft', pr: number }} Where */

/**
 * A test's outcome from its scenarios' marks; an unmarked scenario is Not run.
 * @param {(Mark | undefined)[]} marks
 * @returns {Outcome | null} null when nothing was marked Pass or Fail
 */
export function outcome(marks) {
  const m = marks.map((x) => x ?? 'not run');
  if (m.includes('fail')) return 'failed';
  if (!m.includes('pass')) return null;
  return m.every((x) => x === 'pass') ? 'passed' : 'partly run';
}

/**
 * Where a result was recorded, as the comment and the summary say it.
 * @param {Where} where
 */
export function whereText(where) {
  return where.kind === 'master' ? '(master)' : `(PR #${where.pr}, draft)`;
}

/**
 * A date as YYYY-MM-DD in the machine's own time zone.
 * @param {Date} d
 */
export function localDate(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * The comment for one test's result.
 * @param {object} r
 * @param {Outcome} r.outcome
 * @param {string} r.date YYYY-MM-DD
 * @param {string} r.sha the short commit
 * @param {Where} r.where
 * @param {boolean} r.dirty the checkout had uncommitted changes
 * @param {{ name: string, mark?: Mark, note?: string }[]} r.scenarios
 * @param {{ name: string, url: string } | null} [r.recording]
 * @param {string[]} [r.findings] the findings' ticket IDs
 * @param {{ sha: string, pr: number } | null} [r.countedFrom] a counted draft pass
 * @returns {string}
 */
export function renderComment(r) {
  const dirty = r.dirty ? ' with uncommitted changes' : '';
  const lines = [
    MARKER,
    '',
    `**Smoke test ${r.outcome}** on ${r.date} at \`${r.sha}\` ${whereText(r.where)}${dirty}`,
    '',
  ];
  for (const s of r.scenarios) {
    const mark = s.mark ?? 'not run';
    // One line per scenario: a note's own line breaks would read as more scenarios.
    const text = s.note?.replace(/\s+/g, ' ').trim();
    const note = mark === 'fail' && text ? `. ${text}` : '';
    lines.push(`- ${s.name}: ${mark}${note}`);
  }
  const tail = [];
  if (r.countedFrom) {
    tail.push(
      `Counted from the pass on \`${r.countedFrom.sha}\` ${whereText({ kind: 'draft', pr: r.countedFrom.pr })}`,
    );
  }
  if (r.recording) tail.push(`Recording: [${r.recording.name}](${r.recording.url})`);
  if (r.findings?.length) tail.push(`Findings: ${r.findings.join(', ')}`);
  if (tail.length) lines.push('', ...tail.flatMap((t, i) => (i ? ['', t] : [t])));
  return lines.join('\n');
}

/**
 * @typedef {object} Result a `smoke-test-result` comment read back
 * @property {Outcome} outcome
 * @property {string} date
 * @property {string | null} sha null for a backfilled result
 * @property {Where} where
 * @property {boolean} dirty
 * @property {{ sha: string, pr: number } | null} countedFrom
 * @property {{ name: string, mark: Mark, note: string }[]} scenarios
 */

const HEADING =
  /^\*\*Smoke test (passed|failed|partly run)\*\* (?:on|by) (\d{4}-\d{2}-\d{2})(?: at `([0-9a-f]+)`)? \((master|PR #(\d+), draft)(, commit not recorded)?\)( with uncommitted changes)?/m;
const COUNTED = /^Counted from the pass on `([0-9a-f]+)` \(PR #(\d+), draft\)/m;
const SCENARIO = /^- (.+?): (pass|fail|not run)(?:\. (.*))?$/gm;

/**
 * Reads a `smoke-test-result` comment, the backfilled variant included.
 * @param {string} body
 * @returns {Result | null} null for any other comment
 */
export function parseResult(body) {
  if (!body.trimStart().startsWith(MARKER)) return null;
  const h = HEADING.exec(body);
  if (!h) return null;
  const c = COUNTED.exec(body);
  return {
    outcome: /** @type {Outcome} */ (h[1]),
    date: h[2],
    sha: h[3] ?? null,
    where: h[5] ? { kind: 'draft', pr: Number(h[5]) } : { kind: 'master' },
    dirty: Boolean(h[7]),
    countedFrom: c ? { sha: c[1], pr: Number(c[2]) } : null,
    scenarios: [...body.matchAll(SCENARIO)].map((m) => ({
      name: m[1],
      mark: /** @type {Mark} */ (m[2]),
      note: m[3] ?? '',
    })),
  };
}

/**
 * The latest result among a ticket's comments.
 * @param {{ body: string, createdAt: string }[]} comments
 * @returns {Result | null}
 */
export function latestResult(comments) {
  const sorted = [...comments].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const c of sorted) {
    const r = parseResult(c.body);
    if (r) return r;
  }
  return null;
}

/**
 * Whether a result lets its ticket stay Done: a pass on merged code, or a
 * counted draft pass.
 * @param {Result | null} r
 */
export function provenOnMaster(r) {
  return r !== null && r.outcome === 'passed' && r.where.kind === 'master';
}

/**
 * The line the owner pastes into the project chat.
 * @param {object} run
 * @param {string} run.date
 * @param {string} run.sha
 * @param {boolean} run.onMaster
 * @param {{ name: string, ticket: string, outcome: Outcome, where: Where }[]} run.tests
 * @param {string[]} run.findings
 * @returns {string}
 */
export function summaryLine({ date, sha, onMaster, tests, findings }) {
  const name = (t) =>
    t.where.kind === 'draft'
      ? `${t.name} ${whereText(t.where)} (${t.ticket})`
      : `${t.name} (${t.ticket})`;
  const parts = [];
  for (const o of /** @type {Outcome[]} */ (['passed', 'failed', 'partly run'])) {
    const these = tests.filter((t) => t.outcome === o);
    if (these.length) parts.push(`${o} ${these.map(name).join(', ')}`);
  }
  if (findings.length) parts.push(`findings ${findings.join(', ')}`);
  const where = onMaster ? ' (master)' : '';
  return `Smoke run ${date} at \`${sha}\`${where}: ${parts.join('; ') || 'nothing recorded'}.`;
}
