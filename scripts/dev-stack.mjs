// The one-command dev stack behind `pnpm dev:sitl`. It starts every service
// at once, each in a process group of its own, prefixes their output with
// their names, and stops every group it started on Ctrl-C, SIGTERM or SIGHUP,
// or when a service fails. It signals only the process groups it recorded at
// spawn, never processes found by name: the owner runs their own copies of
// these services with the same command lines.
//
// Spec: docs/specs/2026-11-10-dev-stack.md (§ The launcher).

import { spawn } from 'node:child_process';

/** @typedef {{ proto: 'tcp' | 'udp', port: number }} Port */
/**
 * @typedef {object} Service
 * @property {string} name
 * @property {string} command
 * @property {string[]} args
 * @property {string} cwd
 * @property {Port[]} ports
 * @property {() => Promise<boolean>} up a throw counts as false
 * @property {number} upWithinMs counted from launch
 * @property {[label: string, url: string][]} addresses
 */
/**
 * @typedef {object} Running a service the launcher started
 * @property {Service} service
 * @property {number | undefined} pid also its process group's ID; undefined when it could not start
 * @property {boolean} gone its process group was seen gone (or never existed)
 * @property {boolean} killed
 * @property {string[]} lastLines
 * @property {Promise<unknown>} closed its process exited and its output ended
 * @property {NodeJS.Timeout} [deadline]
 */

/** The launcher's waits, in milliseconds. `runStack({ timings })` overrides them. */
export const TIMINGS = {
  upPollMs: 250,
  readyPollMs: 1000,
  readyWarnMs: 120000,
  signalWindowMs: 1000,
  killGraceMs: 5000,
};

const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];
const LAST_LINES = 20;
const GONE_POLL_MS = 100;
// A failure stops the stack this long after it, so that every service failing
// at about the same time (on a fresh checkout, each setup not run) is reported.
const FAILURE_GATHER_MS = 250;
// How long the stop waits for the services' output to end once every group is
// gone. A process that left its group can hold a pipe open for ever.
const CLOSE_WAIT_MS = 2000;

/**
 * Starts every service at once, says when each is up, and stops them all on a
 * signal or a failure.
 *
 * @param {{ services: Service[], timings?: Partial<typeof TIMINGS> }} options
 * @returns {Promise<number>} the exit code: 0 after a stop a signal asked for, 1 after a failure
 */
export async function runStack({ services, timings }) {
  const t = { ...TIMINGS, ...timings };
  /** @type {Running[]} */
  const running = [];
  /** @type {Running[]} the services that failed, in order: a failure shows their last lines */
  const failed = [];
  let allUp = false;
  /** @type {Promise<void> | undefined} the stop, once one began */
  let stopping;
  let stopBeganAt = 0;
  /** @type {() => void} */
  let stopBegan = () => {};
  const stopBegins = new Promise((resolve) => (stopBegan = resolve));
  // No more "is up" once a failure arrived, even before the stop begins.
  const ending = () => stopping !== undefined || failed.length > 0;

  const killAlive = () => {
    for (const r of running) if (!r.gone) signalGroup(r.pid, 'SIGKILL');
  };
  // Under pnpm one Ctrl-C arrives twice, so signals within the window of the
  // stop's start are the same Ctrl-C. A later one is a second Ctrl-C.
  const onSignal = () => {
    if (!stopping) stop();
    else if (Date.now() - stopBeganAt > t.signalWindowMs) killAlive();
  };
  for (const signal of SIGNALS) process.on(signal, onSignal);
  // The safety net: a launcher dying of an error takes its services with it.
  process.on('exit', killAlive);
  // With the terminal gone (SIGHUP), writes fail with EIO or EPIPE. Ignoring
  // them lets the stop run its course instead of crashing into the safety
  // net. Left installed, since a write can still fail after runStack returns.
  for (const out of [process.stdout, process.stderr]) out.on('error', ignore);

  /** Begins the stop, once; later calls do nothing. */
  function stop() {
    if (stopping) return;
    stopBeganAt = Date.now();
    stopping = stopAll();
    stopBegan();
  }

  async function stopAll() {
    for (const r of running) clearTimeout(r.deadline);
    const groups = running.filter((r) => r.pid !== undefined);
    say(`Stopping ${groups.map((r) => r.service.name).join(', ')}`);
    // The exited ones too: their leader is gone, but not always their group.
    for (const r of groups) signalGroup(r.pid, 'SIGTERM');
    await Promise.all(groups.map(waitGone));
    // Every child's output has normally ended by now, so nothing prints after
    // "Stopped." What still holds a pipe open is outside the groups.
    await atMost(CLOSE_WAIT_MS, Promise.all(running.map((r) => r.closed)));
    say('Stopped.');
  }

  async function waitGone(r) {
    while (groupExists(r.pid)) {
      if (!r.killed && Date.now() - stopBeganAt >= t.killGraceMs) {
        r.killed = true;
        say(`${r.service.name} did not stop within ${t.killGraceMs / 1000} s; killed it.`);
        signalGroup(r.pid, 'SIGKILL');
      }
      await sleep(GONE_POLL_MS);
    }
    r.gone = true;
  }

  /** Reports a failure; the first one begins the stop FAILURE_GATHER_MS later. */
  function fail(r, message) {
    if (stopping) return;
    say(message);
    failed.push(r);
    if (failed.length === 1) setTimeout(stop, FAILURE_GATHER_MS);
  }

  say(`Starting ${services.map((s) => s.name).join(', ')}`);
  const launchedAt = Date.now();
  const width = Math.max(...services.map((s) => s.name.length));

  /** @returns {Running} */
  function start(service) {
    const child = spawn(service.command, service.args, {
      cwd: service.cwd,
      // Its own session and process group, with no terminal: the terminal's
      // Ctrl-C reaches the launcher only, and kill(-pid) reaches its children.
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    /** @type {Running} */
    const r = {
      service,
      pid: child.pid,
      gone: child.pid === undefined,
      killed: false,
      lastLines: [],
      closed: new Promise((resolve) => child.on('close', resolve)),
    };
    const prefix = `${service.name.padEnd(width)} | `;
    relay(child.stdout, process.stdout, prefix, r.lastLines);
    relay(child.stderr, process.stderr, prefix, r.lastLines);
    child.on('error', (error) => fail(r, `${service.name} could not start: ${error.message}`));
    child.on('exit', (code, signal) => {
      const how = signal ? `was stopped by ${signal}` : `exited with code ${code}`;
      fail(r, `${service.name} ${how}${allUp ? '' : ' during startup'}.`);
    });
    r.deadline = setTimeout(
      () => fail(r, `${service.name} was not up within ${service.upWithinMs / 1000} s.`),
      service.upWithinMs,
    );
    return r;
  }

  async function waitUntilUp(r) {
    while (!ending()) {
      if (await isUp(r.service)) {
        if (ending()) return;
        clearTimeout(r.deadline);
        say(`${r.service.name} is up (${((Date.now() - launchedAt) / 1000).toFixed(1)} s)`);
        return;
      }
      await sleep(t.upPollMs);
    }
  }

  for (const service of services) running.push(start(service));
  await Promise.race([Promise.all(running.map(waitUntilUp)), stopBegins]);
  if (!ending()) {
    allUp = true;
    say('All up.');
  }
  await stopBegins;
  await stopping;

  for (const signal of SIGNALS) process.off(signal, onSignal);
  process.off('exit', killAlive);
  for (const r of failed) {
    if (r.lastLines.length === 0) continue;
    say(`Last lines from ${r.service.name}:`);
    for (const line of r.lastLines) process.stdout.write(`    ${line}\n`);
  }
  // process.exit() drops what is still queued for a pipe.
  await Promise.all(
    [process.stdout, process.stderr].map((out) => new Promise((done) => out.write('', done))),
  );
  return failed.length > 0 ? 1 : 0;
}

/** Resolves once `promise` has, or after `ms`, whichever comes first. */
async function atMost(ms, promise) {
  let timer;
  await Promise.race([promise, new Promise((resolve) => (timer = setTimeout(resolve, ms)))]);
  clearTimeout(timer);
}

function ignore() {}

/** Writes each line of `from` to `to` behind `prefix`, keeping the last few. */
function relay(from, to, prefix, lastLines) {
  let partial = '';
  const print = (line) => {
    to.write(`${prefix}${line}\n`);
    lastLines.push(line);
    if (lastLines.length > LAST_LINES) lastLines.shift();
  };
  from.setEncoding('utf8');
  from.on('data', (chunk) => {
    const lines = (partial + chunk).split('\n');
    partial = lines.pop();
    lines.forEach(print);
  });
  from.on('end', () => {
    if (partial) print(partial);
  });
}

async function isUp(service) {
  try {
    return Boolean(await service.up());
  } catch {
    return false;
  }
}

/**
 * kill(-pgid, 0) fails with ESRCH once the group is gone. macOS answers EPERM
 * while the group's last member is a zombie not yet reaped: still there.
 */
function groupExists(pgid) {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    if (error.code === 'EPERM') return true;
    throw error;
  }
}

function signalGroup(pgid, signal) {
  try {
    process.kill(-pgid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH' && error.code !== 'EPERM') throw error;
  }
}

function say(line) {
  process.stdout.write(`==> ${line}\n`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
