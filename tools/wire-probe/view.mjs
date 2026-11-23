// What the probe keeps and prints, as pure functions and small classes, so
// every string it shows is tested without a network.

/**
 * @typedef {object} Record one shown frame, as the probe prints and saves it
 * @property {number} t seconds since the probe started
 * @property {number} system the sender's system ID
 * @property {number} component the sender's component ID
 * @property {string} message
 * @property {'heartbeat' | 'command' | 'control'} kind
 * @property {number | null} target the system a command or control frame names
 * @property {number | null} gap seconds since the previous frame of this message
 *   from this system and component; null for the first
 * @property {string} detail
 */

/** Seconds, three decimals. */
const seconds = (s) => `${s.toFixed(3)} s`;

/**
 * Counts each sender's messages and the time since the previous one.
 * Keyed by system, component and message, so two vehicles' heartbeats, or a
 * vehicle's and a station's, never share a gap.
 */
export class Tally {
  /** @type {Map<string, { system: number, component: number, message: string, count: number, last: number, gap: number | null }>} */
  rows = new Map();

  /**
   * @param {number} t seconds since the probe started
   * @param {{ system: number, component: number }} frame
   * @param {import('./mavlink.mjs').Shown} shown
   * @returns {Record}
   */
  observe(t, frame, shown) {
    const key = `${frame.system}/${frame.component}/${shown.message}`;
    const row = this.rows.get(key);
    const gap = row ? t - row.last : null;
    if (row) {
      row.count++;
      row.last = t;
      row.gap = gap;
    } else {
      this.rows.set(key, {
        system: frame.system,
        component: frame.component,
        message: shown.message,
        count: 1,
        last: t,
        gap,
      });
    }
    return {
      t,
      system: frame.system,
      component: frame.component,
      message: shown.message,
      kind: shown.kind,
      target: shown.target,
      gap,
      detail: shown.detail,
    };
  }

  /** The rows, by system, then component, then message. */
  sorted() {
    return [...this.rows.values()].sort(
      (a, b) =>
        a.system - b.system || a.component - b.component || a.message.localeCompare(b.message),
    );
  }
}

/**
 * One line per shown frame: when, who, what, the gap, and the system a
 * command or control frame names.
 *
 * @param {Record} r
 */
export function formatRecord(r) {
  const to =
    r.target === null ? '' : r.target === 0 ? 'to every system, ' : `to system ${r.target}, `;
  const gap = r.gap === null ? 'first' : `gap ${seconds(r.gap)}`;
  return `${seconds(r.t).padStart(11)}  system ${r.system} component ${r.component}  ${r.message}  ${gap}  ${to}${r.detail}`;
}

/**
 * A table of every sender and message seen, with numbered headers.
 *
 * @param {ReturnType<Tally['sorted']>} rows
 * @param {number} now seconds since the probe started
 * @returns {string[]}
 */
export function table(rows, now) {
  const headers = ['system', 'component', 'message', 'count', 'last gap', 'last seen'];
  const cells = rows.map((r) => [
    String(r.system),
    String(r.component),
    r.message,
    String(r.count),
    r.gap === null ? '-' : seconds(r.gap),
    `${seconds(now - r.last)} ago`,
  ]);
  const widths = headers.map((h, c) => Math.max(h.length, ...cells.map((row) => row[c].length)));
  // Text columns read left to right, numbers line up on the right.
  const pad = (s, c) => (c === 2 ? s.padEnd(widths[c]) : s.padStart(widths[c]));
  const rule = (l, m, r) => l + widths.map((w) => '─'.repeat(w + 2)).join(m) + r;
  const line = (row) => '│ ' + row.map(pad).join(' │ ') + ' │';
  return [
    rule('┌', '┬', '┐'),
    line(headers),
    rule('├', '┼', '┤'),
    ...(cells.length ? cells.map(line) : []),
    rule('└', '┴', '┘'),
  ];
}

/**
 * The whole live block: the table, the latest frames and the data rate.
 *
 * @param {{ rows: ReturnType<Tally['sorted']>, latest: Record[], now: number, perSecond: { all: number, shown: number } | null }} state
 * @returns {string[]}
 */
export function frame({ rows, latest, now, perSecond }) {
  return [
    ...table(rows, now),
    'latest frames, newest last:',
    ...(latest.length ? latest.map(formatRecord) : ['  (none yet)']),
    perSecond === null
      ? 'frames in the last second: (counting)'
      : `frames in the last second: ${perSecond.all} in all, ${perSecond.shown} of them shown`,
  ];
}

/** Begin and end of a synchronised update (see radio-probe's panel.rs). */
const SYNC_ON = '\x1b[?2026h';
const SYNC_OFF = '\x1b[?2026l';
export const HIDE_CURSOR = '\x1b[?25l';
export const SHOW_CURSOR = '\x1b[?25h';

/**
 * A block of lines redrawn in place: each frame is one write that overwrites
 * the old one, erasing only what is left to the right of each line, and an
 * unchanged frame writes nothing.
 */
export class Panel {
  /** @type {string[]} */
  shown = [];

  /** @param {string[]} lines */
  frame(lines) {
    if (lines.length === this.shown.length && lines.every((l, i) => l === this.shown[i])) return '';
    let out = SYNC_ON;
    if (this.shown.length) out += `\x1b[${this.shown.length}F`;
    for (const line of lines) out += `${line}\x1b[K\n`;
    if (lines.length < this.shown.length) out += '\x1b[J';
    out += SYNC_OFF;
    this.shown = [...lines];
    return out;
  }
}

/**
 * Counts over whole seconds, so the rate line shows the last full second and
 * a quiet second reads 0, not the last busy one.
 */
export class Rate {
  /** @type {number | null} */
  started = null;
  counting = { all: 0, shown: 0 };
  /** @type {{ all: number, shown: number } | null} */
  last = null;

  /** @param {number} now seconds @param {boolean} shown */
  count(now, shown) {
    this.roll(now);
    this.counting.all++;
    if (shown) this.counting.shown++;
  }

  /** @param {number} now seconds */
  perSecond(now) {
    this.roll(now);
    return this.last;
  }

  /** @param {number} now */
  roll(now) {
    this.started ??= now;
    const elapsed = Math.floor(now - this.started);
    if (elapsed >= 1) {
      this.last = elapsed === 1 ? this.counting : { all: 0, shown: 0 };
      this.counting = { all: 0, shown: 0 };
      this.started += elapsed;
    }
  }
}

/**
 * One line of a saved recording: a JSON object per shown frame (JSON Lines).
 *
 * @param {Record} r
 */
export const recordLine = (r) =>
  JSON.stringify({
    ...r,
    t: Number(r.t.toFixed(4)),
    gap: r.gap === null ? null : Number(r.gap.toFixed(4)),
  });

/**
 * A saved recording, read back for a test.
 *
 * @param {string} text
 * @returns {Record[]}
 */
export const readRecording = (text) =>
  text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));

/**
 * The gaps between one sender's frames of one message in a recording, for a
 * test to check a rate against.
 *
 * @param {Record[]} records
 * @param {{ system: number, component?: number, message: string }} which
 * @returns {number[]}
 */
export const gaps = (records, { system, component, message }) =>
  records
    .filter(
      (r) =>
        r.system === system &&
        (component === undefined || r.component === component) &&
        r.message === message &&
        r.gap !== null,
    )
    .map((r) => r.gap);
