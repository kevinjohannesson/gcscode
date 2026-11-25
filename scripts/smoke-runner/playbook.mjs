// Reads the smoke-test playbook, docs/smoke-tests.md: the table of tests and
// each test's section, cut into the scenarios the runner asks about.
//
// Spec: docs/specs/2026-11-24-smoke-test-runner.md (§ The playbook format).

import { slugify } from '../lint-docs.mjs';

const ID = /GCS-(\d+)/g;
const PR = /PR #(\d+)/g;
const LINK = /^\[([^\]]+)\]\(#([^)]+)\)$/;
const FENCE = /^[ \t]*(`{3,}|~{3,})(.*)$/;
const EXPECT = /Expect:\*\*/;

/**
 * @typedef {{ kind: 'text', text: string } | { kind: 'code', lang: string, text: string }} Block
 * @typedef {{ name: string, from: number, to: number }} Scenario a run of blocks, `to` exclusive
 * @typedef {{ title: string, anchor: string, goal: string | null, blocks: Block[], scenarios: Scenario[] }} Section
 * @typedef {{ name: string, anchor: string, ticket: string | null, prs: number[], needs: string, section: Section | null }} Row
 */

/**
 * Splits text into level-2 sections by heading, ignoring headings in fences.
 * @param {string} text
 * @returns {Map<string, { title: string, lines: string[] }>} by anchor
 */
function splitSections(text) {
  const sections = new Map();
  let current = null;
  let fence = null;
  for (const line of text.split('\n')) {
    const marker = FENCE.exec(line)?.[1];
    if (marker) {
      if (fence === null) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
    }
    const heading = fence === null && !marker ? /^## (.+)$/.exec(line) : null;
    if (heading) {
      current = { title: heading[1].trim(), lines: [] };
      sections.set(slugify(current.title), current);
    } else if (current) {
      current.lines.push(line);
    }
  }
  return sections;
}

/**
 * Cuts a section's lines into paragraphs and fenced code blocks.
 * @param {string[]} lines
 * @returns {Block[]}
 */
export function blocks(lines) {
  const out = [];
  let para = [];
  let code = null;
  const flush = () => {
    if (para.length) out.push({ kind: 'text', text: para.join('\n') });
    para = [];
  };
  for (const line of lines) {
    const m = FENCE.exec(line);
    if (code) {
      if (m && m[1][0] === code.marker[0] && m[1].length >= code.marker.length && !m[2].trim()) {
        out.push({ kind: 'code', lang: code.lang, text: code.lines.join('\n') });
        code = null;
      } else {
        code.lines.push(line);
      }
    } else if (m) {
      flush();
      code = { marker: m[1], lang: m[2].trim(), lines: [] };
    } else if (line.trim() === '') {
      flush();
    } else {
      para.push(line);
    }
  }
  flush();
  if (code) out.push({ kind: 'code', lang: code.lang, text: code.lines.join('\n') });
  return out;
}

/**
 * A scenario's name: its opening bold text up to the first colon or `. Expect`.
 * @param {string} text a paragraph that opens with `**Scenario`
 * @returns {string}
 */
export function scenarioName(text) {
  const bold = /^\*\*([^*]+)\*\*/.exec(text)?.[1] ?? text;
  const cut = bold.search(/:|\. Expect/);
  return (cut === -1 ? bold : bold.slice(0, cut)).trim();
}

/**
 * The scenarios of a section's blocks: one per `**Scenario` paragraph, running
 * to the next, and a "Start" from the first **Expect** before them, if any.
 * @param {Block[]} list
 * @returns {Scenario[]}
 */
export function scenarios(list) {
  const starts = [];
  list.forEach((b, i) => {
    if (b.kind === 'text' && b.text.startsWith('**Scenario')) starts.push(i);
  });
  const out = [];
  const firstScenario = starts[0] ?? list.length;
  const firstExpect = list.findIndex(
    (b, i) => i < firstScenario && b.kind === 'text' && EXPECT.test(b.text),
  );
  if (firstExpect !== -1) out.push({ name: 'Start', from: firstExpect, to: firstScenario });
  starts.forEach((from, k) => {
    out.push({
      name: scenarioName(/** @type {{ text: string }} */ (list[from]).text),
      from,
      to: starts[k + 1] ?? list.length,
    });
  });
  return out;
}

/**
 * Parses the table's rows. The table is the one whose header has a
 * "Ticket / PR" column.
 * @param {string} text
 * @returns {{ name: string, anchor: string, ticketCell: string, needs: string }[]}
 */
function tableRows(text) {
  const lines = text.split('\n');
  const header = lines.findIndex((l) => /^\|.*\|\s*Ticket \/ PR\s*\|/.test(l));
  if (header === -1) return [];
  const cells = (l) =>
    l
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
  const columns = cells(lines[header]);
  const at = (row, name) => row[columns.indexOf(name)] ?? '';
  const rows = [];
  for (const line of lines.slice(header + 2)) {
    if (!line.startsWith('|')) break;
    const row = cells(line);
    const test = at(row, 'Test');
    const link = LINK.exec(test);
    rows.push({
      name: link ? link[1] : test,
      anchor: link ? link[2] : slugify(test),
      ticketCell: at(row, 'Ticket / PR'),
      needs: at(row, 'Needs'),
    });
  }
  return rows;
}

/**
 * Parses the playbook into its rows, each with its section, and the problems
 * that make a row unreadable to the runner.
 * @param {string} text the text of docs/smoke-tests.md
 * @returns {{ rows: Row[], problems: string[] }}
 */
export function parsePlaybook(text) {
  const sections = splitSections(text);
  const problems = [];
  const rows = tableRows(text).map(({ name, anchor, ticketCell, needs }) => {
    const ids = [...ticketCell.matchAll(ID)].map((m) => `GCS-${m[1]}`);
    if (ids.length === 0) problems.push(`${name}: its row names no GCS-<n> ticket.`);
    if (ids.length > 1) problems.push(`${name}: its row names ${ids.length} tickets; keep one.`);
    const prs = [...ticketCell.matchAll(PR)].map((m) => Number(m[1]));
    const found = sections.get(anchor);
    let section = null;
    if (!found) {
      problems.push(`${name}: no section with the anchor #${anchor}.`);
    } else {
      const list = blocks(found.lines);
      const goal = list.find((b) => b.kind === 'text' && b.text.startsWith('**Goal:**'));
      if (!list.some((b) => b.kind === 'text' && EXPECT.test(b.text))) {
        problems.push(`${name}: its section has no **Expect**.`);
      }
      for (const b of list) {
        if (b.kind === 'code' && b.text.includes('.worktrees/')) {
          problems.push(
            `${name}: a command names a worktree (${b.text.split('\n')[0]}); blocks run from the checkout being tested.`,
          );
        }
      }
      section = {
        title: found.title,
        anchor,
        goal: goal ? goal.text.replace(/^\*\*Goal:\*\*\s*/, '') : null,
        blocks: list,
        scenarios: scenarios(list),
      };
    }
    return { name, anchor, ticket: ids.length === 1 ? ids[0] : null, prs, needs, section };
  });
  if (rows.length === 0) problems.push('No table with a "Ticket / PR" column.');
  return { rows, problems };
}
