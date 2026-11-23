#!/usr/bin/env node
// wire-probe: listens for MAVLink on a UDP port and shows every heartbeat,
// command and control frame on it, with the sender's system ID and the time
// since that sender's previous one. It only listens: it sends nothing to any
// vehicle, router or station.
//
// usage: node probe.mjs [--port 14552] [--record <file.jsonl>] [--seconds <n>]

import { createSocket } from 'node:dgram';
import { createWriteStream } from 'node:fs';
import { parseArgs } from 'node:util';
import { describe, parseFrames } from './mavlink.mjs';
import {
  HIDE_CURSOR,
  Panel,
  Rate,
  SHOW_CURSOR,
  Tally,
  fit,
  formatRecord,
  frame,
  recordLine,
} from './view.mjs';

/** The UDP port every SITL vehicle's MAVProxy also sends to (tools/sitl/run_sitl.sh). */
const DEFAULT_PORT = 14552;
/** How often the live block is redrawn, however many frames arrive in between. */
const REDRAW_MS = 100;
/** How many of the latest frames the live block lists. */
const LATEST = 10;

const USAGE = `usage: pnpm --filter wire-probe start [-- --port N] [--record FILE] [--seconds N]

  --port N       UDP port to listen on, default ${DEFAULT_PORT}
  --record FILE  also save every shown frame to FILE, one JSON object a line
  --seconds N    stop by itself after N seconds`;

function options(argv) {
  const { values } = parseArgs({
    args: argv[0] === '--' ? argv.slice(1) : argv,
    options: {
      port: { type: 'string', default: String(DEFAULT_PORT) },
      record: { type: 'string' },
      seconds: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error(`--port must be a port number, got: ${values.port}`);
  const seconds = values.seconds === undefined ? undefined : Number(values.seconds);
  if (seconds !== undefined && !(seconds > 0))
    throw new Error(`--seconds must be above 0, got: ${values.seconds}`);
  return { port, record: values.record, seconds, help: values.help };
}

function main() {
  let opts;
  try {
    opts = options(process.argv.slice(2));
  } catch (e) {
    console.error(`wire-probe: ${e.message}\n\n${USAGE}`);
    process.exit(2);
  }
  if (opts.help) {
    console.log(USAGE);
    return;
  }

  // A terminal gets the live block; a pipe or file gets one plain line per frame.
  const live = process.stdout.isTTY === true;
  const started = performance.now();
  const now = () => (performance.now() - started) / 1000;
  const tally = new Tally();
  const rate = new Rate();
  const panel = new Panel();
  /** @type {import('./view.mjs').Record[]} */
  const latest = [];
  const recording = opts.record ? createWriteStream(opts.record) : null;

  const socket = createSocket('udp4');
  socket.on('message', (bytes) => {
    const t = now();
    for (const f of parseFrames(bytes).frames) {
      const shown = describe(f);
      rate.count(t, shown !== null);
      if (!shown) continue;
      const record = tally.observe(t, f, shown);
      recording?.write(recordLine(record) + '\n');
      if (live) {
        latest.push(record);
        if (latest.length > LATEST) latest.shift();
      } else {
        process.stdout.write(formatRecord(record) + '\n');
      }
    }
  });
  socket.on('error', (e) =>
    stop(`${e.message}${e.code === 'EADDRINUSE' ? ' (is another probe running?)' : ''}`, 1),
  );

  const draw = () => {
    if (!live) return;
    const t = now();
    // A terminal that does not know its size reports 0: fit nothing then.
    const size = {
      columns: process.stdout.columns || undefined,
      rows: process.stdout.rows || undefined,
    };
    const lines = frame({
      rows: tally.sorted(),
      latest,
      now: t,
      perSecond: rate.perSecond(t),
      height: size.rows,
    });
    process.stdout.write(panel.frame(fit(lines, size), size));
  };
  const timer = setInterval(draw, REDRAW_MS);
  /** @type {NodeJS.Timeout | undefined} */
  let deadline;

  let stopping = false;
  function stop(problem, code = 0) {
    if (stopping) return;
    stopping = true;
    clearInterval(timer);
    clearTimeout(deadline);
    draw();
    socket.close();
    if (live) process.stdout.write(SHOW_CURSOR);
    if (problem) console.error(`wire-probe: ${problem}`);
    else console.log('wire-probe: stopped.');
    // No process.exit: on macOS a pipe is written asynchronously, and exiting
    // here could cut off the last lines. With the socket closed and the timer
    // cleared, the process ends once stdout and the recording are flushed.
    process.exitCode = code;
    recording?.end();
  }
  process.on('SIGINT', () => stop());
  process.on('SIGTERM', () => stop());
  process.on('SIGHUP', () => stop());
  // The cursor comes back however the process ends.
  process.on('exit', () => live && process.stdout.write(SHOW_CURSOR));

  socket.bind(opts.port, '127.0.0.1', () => {
    const where = `UDP 127.0.0.1:${opts.port}`;
    console.log(`wire-probe: listening on ${where}. It sends nothing. Ctrl-C quits.`);
    if (opts.record) console.log(`wire-probe: saving every shown frame to ${opts.record}`);
    if (live) process.stdout.write(HIDE_CURSOR);
    draw();
    if (opts.seconds !== undefined) deadline = setTimeout(() => stop(), opts.seconds * 1000);
  });
}

main();
