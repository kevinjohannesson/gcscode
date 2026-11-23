// The one-command dev stack behind `pnpm dev:sitl`. It starts every service
// at once, each in a process group of its own, prefixes their output with
// their names, and stops every group it started on Ctrl-C, SIGTERM or SIGHUP,
// or when a service fails. It signals only the process groups it recorded at
// spawn, never processes found by name: the owner runs their own copies of
// these services with the same command lines.
//
// Spec: docs/specs/2026-11-10-dev-stack.md (§ The launcher).

import { execFile, spawn } from 'node:child_process';
import { createSocket } from 'node:dgram';
import { connect } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @typedef {{ proto: 'tcp' | 'udp', port: number }} Port */
/**
 * @typedef {object} Service
 * @property {string} name
 * @property {string} command
 * @property {string[]} args
 * @property {string} cwd
 * @property {Port[]} ports
 * @property {() => Promise<boolean | { failure: string }>} up truthy: up; falsy or a throw:
 *   not yet; `{ failure }`: fails the service at once with that message
 * @property {number} upWithinMs counted from launch
 * @property {[label: string, url: string][]} addresses
 * @property {Record<string, string>} [env] added to the launcher's environment
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

/** The checkout this file is in, without a trailing slash. */
export const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
export const MAVLINK2REST = 'http://127.0.0.1:8088';
export const MEDIAMTX_API = 'http://127.0.0.1:9997';

/** The most vehicles `--vehicles` takes. */
export const MAX_VEHICLES = 5;

/** System IDs 1 to `vehicles`: vehicle k is SITL instance k - 1. */
export const systemIds = (vehicles) => Array.from({ length: vehicles }, (_, i) => i + 1);

/** The TCP port SITL instance `systemId - 1` listens on. */
const sitlPort = (systemId) => 5760 + 10 * (systemId - 1);

/** One stream address per vehicle, labelled with its system ID once there are several. */
const perVehicle = (vehicles, label, url) =>
  systemIds(vehicles).map((id) => [vehicles > 1 ? `${label}, vehicle ${id}` : label, url(id)]);

/**
 * The stack's services, with SITL running `vehicles` vehicles.
 *
 * @param {number} vehicles 1 to MAX_VEHICLES
 * @returns {Service[]}
 */
export const stackServices = (vehicles) => [
  {
    name: 'sitl',
    command: join(ROOT, 'tools/sitl/run_sitl.sh'),
    args: ['--non-interactive', '--streamrate', '25'],
    env: { SITL_VEHICLES: String(vehicles) },
    cwd: ROOT,
    ports: [
      ...systemIds(vehicles).map((id) => ({ proto: 'tcp', port: sitlPort(id) })),
      { proto: 'tcp', port: 8088 },
      { proto: 'udp', port: 14551 },
    ],
    up: () => everyHeartbeat(MAVLINK2REST, vehicles),
    upWithinMs: 60000,
    addresses: [['MAVLink WebSocket', 'ws://localhost:8088/v1/ws/mavlink']],
  },
  {
    name: 'mediamtx',
    command: join(ROOT, 'tools/mediamtx/run.sh'),
    args: [],
    cwd: ROOT,
    ports: [
      { proto: 'tcp', port: 8554 },
      { proto: 'tcp', port: 8889 },
      { proto: 'tcp', port: 9997 },
      { proto: 'udp', port: 8000 },
      { proto: 'udp', port: 8001 },
      { proto: 'udp', port: 8189 },
    ],
    up: () => tcpAccepts(8889),
    upWithinMs: 10000,
    addresses: [
      ...perVehicle(vehicles, 'WHEP', (id) => `http://localhost:8889/drone-${id}/whep`),
      ...perVehicle(vehicles, 'RTSP', (id) => `rtsp://localhost:8554/drone-${id}`),
    ],
  },
  {
    name: 'gcscode',
    // --silent: without it pnpm reports every stop as a failed command.
    command: 'pnpm',
    args: ['--silent', '--filter', '@gcscode/shell', 'dev', '--port', '5173', '--strictPort'],
    cwd: ROOT,
    ports: [{ proto: 'tcp', port: 5173 }],
    up: () => tcpAccepts(5173),
    upWithinMs: 30000,
    addresses: [['gcscode', 'http://localhost:5173/']],
  },
  {
    // Up when every vehicle's stream is published by the page run.sh marked
    // (publisher=headless): it loaded, drew, got telemetry and published. Any
    // other publisher fails the launch. The streams' addresses are mediamtx's,
    // so it has none of its own.
    name: 'camera-sim',
    command: join(ROOT, 'tools/camera-sim/run.sh'),
    args: [],
    cwd: ROOT,
    ports: [{ proto: 'tcp', port: 5174 }],
    up: () => cameraSimUp(MEDIAMTX_API, vehicles),
    upWithinMs: 90000,
    addresses: [],
  },
];

/**
 * True when `check(id)` is for every system ID; the first `{ failure }` instead,
 * in system ID order.
 *
 * @param {number} vehicles
 * @param {(id: number) => Promise<boolean | { failure: string }>} check
 */
async function everyVehicle(vehicles, check) {
  const results = await Promise.all(systemIds(vehicles).map(check));
  return results.find((result) => typeof result === 'object') ?? results.every(Boolean);
}

/**
 * The launcher's options from its arguments: `--vehicles N` or `--vehicles=N`,
 * N from 1 to MAX_VEHICLES, default 1. A leading `--`, which pnpm passes on, is
 * skipped.
 *
 * @param {string[]} args
 * @returns {{ vehicles: number } | { error: string }}
 */
export function parseArgs(args) {
  const rest = args[0] === '--' ? args.slice(1) : [...args];
  let vehicles = 1;
  while (rest.length > 0) {
    const arg = rest.shift();
    const inline = arg.startsWith('--vehicles=') ? arg.slice('--vehicles='.length) : undefined;
    if (arg !== '--vehicles' && inline === undefined) return { error: `Unknown argument: ${arg}` };
    const value = inline ?? rest.shift();
    if (!/^[1-9]$/.test(value ?? '') || Number(value) > MAX_VEHICLES) {
      return {
        error: `--vehicles takes a whole number from 1 to ${MAX_VEHICLES}, got: ${value ?? 'nothing'}`,
      };
    }
    vehicles = Number(value);
  }
  return { vehicles };
}

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
 * @param {{ services: Service[], mavlink2rest: string, vehicles?: number, timings?: Partial<typeof TIMINGS> }} options
 *   `mavlink2rest` is its base URL, polled for "ready to fly" once every service is up, for
 *   system IDs 1 to `vehicles` (default 1)
 * @returns {Promise<number>} the exit code: 0 after a stop a signal asked for, 1 after a failure
 */
export async function runStack({ services, mavlink2rest, vehicles = 1, timings }) {
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
  // The port check runs before anything starts, so a signal then has nothing
  // to stop: it just ends the launch.
  let checking = true;
  /** @type {() => void} */
  let interrupt = () => {};
  const interrupted = new Promise((resolve) => (interrupt = () => resolve('interrupted')));
  const ending = () => stopping !== undefined || failed.length > 0;

  const killAlive = () => {
    for (const r of running) if (!r.gone) signalGroup(r.pid, 'SIGKILL');
  };
  // Under pnpm one Ctrl-C arrives twice, so signals within the window of the
  // stop's start are the same Ctrl-C. A later one is a second Ctrl-C.
  const onSignal = () => {
    if (checking) interrupt();
    else if (!stopping) stop();
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

  const inUse = await Promise.race([checkPorts(services), interrupted]);
  checking = false;
  if (inUse === 'interrupted') {
    await finish();
    return 0;
  }
  if (inUse.length > 0) {
    say('Not starting: these ports are in use. Nothing was started or stopped.');
    for (const { service, proto, port, holder } of inUse) {
      const line = `${proto.toUpperCase()} ${port} (${service})`;
      process.stdout.write(`    ${line}${holder ? `: ${holder}` : ''}\n`);
    }
    say('Stop what holds them, then run pnpm dev:sitl again.');
    await finish();
    return 1;
  }

  const fleet = vehicles > 1 ? `, with ${vehicles} vehicles` : '';
  say(`Starting ${services.map((s) => s.name).join(', ')}${fleet}`);
  const launchedAt = Date.now();
  const width = Math.max(...services.map((s) => s.name.length));

  /** @returns {Running} */
  function start(service) {
    const child = spawn(service.command, service.args, {
      cwd: service.cwd,
      env: { ...process.env, ...service.env },
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
      const result = await isUp(r.service);
      if (result && typeof result === 'object') {
        if (ending()) return;
        clearTimeout(r.deadline);
        fail(r, result.failure);
        return;
      }
      if (result) {
        if (ending()) return;
        clearTimeout(r.deadline);
        say(`${r.service.name} is up (${((Date.now() - launchedAt) / 1000).toFixed(1)} s)`);
        return;
      }
      await sleep(t.upPollMs);
    }
  }

  /** Says when every vehicle can arm, and warns if one takes long. Stops with the stack. */
  async function watchReadiness() {
    const ids = systemIds(vehicles);
    say(
      vehicles > 1
        ? `Waiting until all ${vehicles} vehicles are ready to fly.`
        : 'Waiting until the vehicle is ready to fly.',
    );
    const startedAt = Date.now();
    /** @type {Map<number, { prearm: boolean, position: boolean }>} */
    const warned = new Map(ids.map((id) => [id, { prearm: false, position: false }]));
    /** @type {Set<number>} the vehicles seen ready: a vehicle stays ready once it was */
    const ready = new Set();
    while (!ending()) {
      const states = await Promise.all(
        ids
          .filter((id) => !ready.has(id))
          .map(async (id) => {
            const [sysStatus, ekfStatus] = await Promise.all([
              fetchMessage(mavlink2rest, 'SYS_STATUS', id),
              fetchMessage(mavlink2rest, 'EKF_STATUS_REPORT', id),
            ]);
            return { id, ...readiness(sysStatus, ekfStatus) };
          }),
      );
      if (ending()) return;
      for (const { id, prearm, position } of states) if (prearm && position) ready.add(id);
      if (ready.size === ids.length) {
        sayReadyToFly((Date.now() - launchedAt) / 1000);
        return;
      }
      if (Date.now() - startedAt >= t.readyWarnMs) {
        for (const { id, prearm, position } of states) {
          const after = `${vehicles > 1 ? `Vehicle ${id} not` : 'Not'} ready to fly after ${t.readyWarnMs / 1000} s:`;
          const w = warned.get(id);
          if (!prearm && !w.prearm) {
            w.prearm = true;
            say(
              `${after} the pre-arm checks still fail; MAVProxy's PreArm lines above say why. Still waiting.`,
            );
          }
          if (!position && !w.position) {
            w.position = true;
            say(
              `${after} no position yet; the EKF is not using GPS (no "EKF3 IMU0 is using GPS" line above). Still waiting.`,
            );
          }
        }
      }
      await sleep(t.readyPollMs);
    }
  }

  function sayReadyToFly(seconds) {
    const addresses = services.flatMap((s) => s.addresses);
    const width = Math.max(...addresses.map(([label]) => label.length));
    const who = vehicles > 1 ? `, all ${vehicles} vehicles` : '';
    say(`ready to fly (${seconds.toFixed(1)} s)${who}`);
    for (const [label, url] of addresses) {
      process.stdout.write(`    ${label.padEnd(width)}  ${url}\n`);
    }
    const which = vehicles > 1 ? ' vehicle 1' : ' it';
    process.stdout.write(`    Fly${which} from another terminal:  pnpm fly-sitl --circle 3\n`);
    process.stdout.write('    Ctrl-C stops everything.\n');
  }

  for (const service of services) running.push(start(service));
  await Promise.race([Promise.all(running.map(waitUntilUp)), stopBegins]);
  if (!ending()) {
    allUp = true;
    say('All up.');
    // A throw in it is a failure of the launcher itself: report it and stop.
    watchReadiness().catch((error) =>
      fail(
        { service: { name: 'launcher' }, lastLines: [] },
        `Could not watch readiness: ${error.message}`,
      ),
    );
  }
  await stopBegins;
  await stopping;

  for (const r of failed) {
    if (r.lastLines.length === 0) continue;
    say(`Last lines from ${r.service.name}:`);
    for (const line of r.lastLines) process.stdout.write(`    ${line}\n`);
  }
  await finish();
  return failed.length > 0 ? 1 : 0;

  /** Removes the handlers and flushes: process.exit() drops what is queued for a pipe. */
  async function finish() {
    for (const signal of SIGNALS) process.off(signal, onSignal);
    process.off('exit', killAlive);
    await Promise.all(
      [process.stdout, process.stderr].map((out) => new Promise((done) => out.write('', done))),
    );
  }
}

const PROBE_MS = 1000;
const LSOF_MS = 2000;

/** True when something accepts TCP connections on `port`, on 127.0.0.1 or ::1. */
export async function tcpAccepts(port) {
  const results = await Promise.all(
    ['127.0.0.1', '::1'].map(
      (host) =>
        new Promise((resolve) => {
          const socket = connect({ port, host });
          socket.setTimeout(PROBE_MS, () => socket.destroy());
          socket.once('connect', () => (socket.destroy(), resolve(true)));
          socket.once('error', () => resolve(false));
          socket.once('close', () => resolve(false));
        }),
    ),
  );
  return results.some(Boolean);
}

/**
 * True when a UDP bind to `host` on `port` fails with EADDRINUSE. Another
 * error (no IPv6 here, say) is not a holder.
 */
function udpBindFails(options, host, port) {
  return new Promise((resolve) => {
    const socket = createSocket(options);
    socket.once('error', (error) => {
      socket.close();
      resolve(error.code === 'EADDRINUSE');
    });
    socket.bind(port, host, () => socket.close(() => resolve(false)));
  });
}

/**
 * Whether something holds `port`. For UDP a dual-stack `::` bind sees a holder
 * on 127.0.0.1, on `::` and on `::1`; `0.0.0.0` covers a machine without IPv6.
 */
export async function portInUse(proto, port) {
  if (proto === 'tcp') return tcpAccepts(port);
  // One after the other: on macOS a 0.0.0.0 bind fails while a dual-stack ::
  // bind holds the port, so the second probe must start after the first closed.
  if (await udpBindFails({ type: 'udp6', ipv6Only: false }, '::', port)) return true;
  return udpBindFails({ type: 'udp4' }, '0.0.0.0', port);
}

/** The commands and PIDs holding `port`, as `<command>, PID <pid>`; empty when lsof cannot say. */
async function holdersOf(proto, port) {
  const args =
    proto === 'tcp'
      ? ['-nP', '-Fpcn', `-iTCP:${port}`, '-sTCP:LISTEN']
      : ['-nP', '-Fpcn', `-iUDP:${port}`];
  const output = await new Promise((resolve) => {
    // lsof exits 1 when it finds nothing; any output it did give is still used.
    execFile('lsof', args, { timeout: LSOF_MS }, (_error, stdout) => resolve(stdout ?? ''));
  });
  /** @type {Map<string, string>} */
  const holders = new Map();
  let pid = '';
  let command = '';
  for (const line of output.split('\n')) {
    const field = line.slice(1);
    if (line.startsWith('p')) pid = field;
    else if (line.startsWith('c')) command = field;
    else if (line.startsWith('n')) {
      // A UDP socket can show a remote end: only its local address counts.
      if (proto === 'udp' && !field.split('->')[0].endsWith(`:${port}`)) continue;
      holders.set(pid, `${command}, PID ${pid}`);
    }
  }
  return [...holders.values()];
}

/**
 * The ports of `services` that something holds, in table order. The check
 * kills nothing.
 *
 * @param {Pick<Service, 'name' | 'ports'>[]} services
 * @returns {Promise<{ service: string, proto: 'tcp' | 'udp', port: number, holder?: string }[]>}
 */
export async function checkPorts(services) {
  const checks = services.flatMap((service) =>
    service.ports.map(async ({ proto, port }) => {
      if (!(await portInUse(proto, port))) return undefined;
      const holder = (await holdersOf(proto, port)).join('; ');
      return { service: service.name, proto, port, ...(holder && { holder }) };
    }),
  );
  return (await Promise.all(checks)).filter((found) => found !== undefined);
}

/**
 * The message object mavlink2rest at `baseUrl` last saw of type `name` from
 * vehicle `systemId` (default 1), component 1, or undefined. A message not seen
 * yet is the body `None`, which is not JSON; a non-JSON body and a network
 * error are the same.
 */
export async function fetchMessage(baseUrl, name, systemId = 1) {
  const path = `/v1/mavlink/vehicles/${systemId}/components/1/messages/${name}`;
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      signal: AbortSignal.timeout(PROBE_MS * 2),
    });
    return JSON.parse(await response.text())?.message ?? undefined;
  } catch {
    return undefined;
  }
}

/** True when mavlink2rest at `baseUrl` has seen a HEARTBEAT from each of vehicles 1 to `vehicles`. */
export function everyHeartbeat(baseUrl, vehicles) {
  return everyVehicle(vehicles, (id) => hasHeartbeat(baseUrl, id));
}

/** True when mavlink2rest at `baseUrl` has seen a HEARTBEAT from vehicle `systemId` (default 1), component 1. */
export async function hasHeartbeat(baseUrl, systemId = 1) {
  return (await fetchMessage(baseUrl, 'HEARTBEAT', systemId))?.type === 'HEARTBEAT';
}

const cameraSimTaken = (stream) =>
  `${stream} is already being published by something other than camera-sim's headless page, ` +
  'most likely a camera-sim tab left open. Close it, then run pnpm dev:sitl again.';

/** The parsed JSON of `baseUrl` + `path`, or undefined on an error status, a non-JSON body or a network error. */
async function getJson(baseUrl, path) {
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      signal: AbortSignal.timeout(PROBE_MS * 2),
    });
    if (!response.ok) return undefined;
    return JSON.parse(await response.text());
  } catch {
    return undefined;
  }
}

/** The `items` of a MediaMTX list body, or none when the body has another shape. */
const itemsOf = (body) => (Array.isArray(body?.items) ? body.items : []);

/**
 * Whether camera-sim's headless page is publishing `drone-1` to `drone-<vehicles>`
 * (default 1) to MediaMTX at `baseUrl`: true when it publishes every one of them,
 * false when not yet, and `{ failure }` naming the first stream, in system ID
 * order, that anything else publishes. Never throws. Not yet: the API does not
 * answer, gives an error status or a body that is not JSON; a list body has no
 * `items` array or items that are not objects; a path is not listed or not
 * ready; its session is not listed. A failure: a ready stream whose source is
 * not a WebRTC session, or whose session does not carry the marker (a `query`
 * that is missing or not a string included).
 *
 * @returns {Promise<boolean | { failure: string }>}
 */
export async function cameraSimUp(baseUrl, vehicles = 1) {
  const [paths, sessions] = await Promise.all([
    getJson(baseUrl, '/v3/paths/list'),
    getJson(baseUrl, '/v3/webrtcsessions/list'),
  ]);
  /** @returns {boolean | { failure: string }} */
  const published = (id) => {
    const stream = `drone-${id}`;
    const path = itemsOf(paths).find((item) => item?.name === stream && item.ready === true);
    if (!path) return false;
    if (path.source?.type !== 'webRTCSession') return { failure: cameraSimTaken(stream) };
    const session = itemsOf(sessions).find((item) => item?.id === path.source.id);
    if (!session) return false;
    const query = typeof session.query === 'string' ? session.query : '';
    const marked = new URLSearchParams(query).get('publisher') === 'headless';
    return marked || { failure: cameraSimTaken(stream) };
  };
  const results = systemIds(vehicles).map(published);
  return results.find((result) => typeof result === 'object') ?? results.every(Boolean);
}

/** The names in a field mavlink2rest renders as `A | B | C`. */
const flagsOf = (field) =>
  typeof field === 'string' ? field.split('|').map((flag) => flag.trim()) : [];

/**
 * What the vehicle reports about arming: the pre-arm checks pass, and the EKF
 * has an absolute horizontal position. Either message may be undefined.
 *
 * @returns {{ prearm: boolean, position: boolean }}
 */
export function readiness(sysStatus, ekfStatus) {
  return {
    prearm: flagsOf(sysStatus?.onboard_control_sensors_health).includes(
      'MAV_SYS_STATUS_PREARM_CHECK',
    ),
    position: flagsOf(ekfStatus?.flags).includes('EKF_POS_HORIZ_ABS'),
  };
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
    return await service.up();
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

// Last, so every top-level const above is initialized before runStack runs.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const options = parseArgs(process.argv.slice(2));
  if ('error' in options) {
    say(options.error);
    say(`Usage: pnpm dev:sitl [--vehicles N], N from 1 to ${MAX_VEHICLES} (default 1)`);
    process.exit(1);
  }
  const { vehicles } = options;
  process.exit(
    await runStack({ services: stackServices(vehicles), mavlink2rest: MAVLINK2REST, vehicles }),
  );
}
