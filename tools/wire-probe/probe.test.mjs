// Runs the probe against simulated vehicles: a UDP socket that sends
// pymavlink-encoded heartbeats from two system IDs, the way each SITL
// vehicle's MAVProxy does.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createSocket } from 'node:dgram';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FRAMES } from './fixtures.mjs';
import { gaps, readRecording } from './view.mjs';

const PROBE = fileURLToPath(new URL('probe.mjs', import.meta.url));

let scratch;
before(() => {
  scratch = mkdtempSync(join(tmpdir(), 'wire-probe-test-'));
});
after(() => rmSync(scratch, { recursive: true, force: true }));

/** A UDP port nothing listens on right now. */
async function freePort() {
  const s = createSocket('udp4');
  await new Promise((resolve) => s.bind(0, '127.0.0.1', resolve));
  const { port } = s.address();
  await new Promise((resolve) => s.close(resolve));
  return port;
}

/** Starts the probe; resolves once it listens. */
function startProbe(args) {
  const child = spawn(process.execPath, [PROBE, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => (stdout += d));
  child.stderr.on('data', (d) => (stderr += d));
  const exited = new Promise((resolve) => child.on('exit', (code) => resolve(code)));
  const listening = new Promise((resolve, reject) => {
    child.stdout.on('data', () => stdout.includes('listening on') && resolve());
    exited.then((code) => reject(new Error(`probe exited ${code}: ${stderr}`)));
  });
  // A test that expects the probe to fail does not wait for it to listen.
  listening.catch(() => {});
  return { child, listening, exited, out: () => stdout, err: () => stderr };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('two simulated vehicles: each one’s heartbeats show under its own ID, saved for a test', async () => {
  const port = await freePort();
  const recordPath = join(scratch, 'two-vehicles.jsonl');
  const probe = startProbe(['--port', String(port), '--record', recordPath]);
  await probe.listening;

  // Each vehicle's datagrams come from a socket of its own, as from its own MAVProxy.
  const vehicles = [createSocket('udp4'), createSocket('udp4')];
  const replies = [];
  for (const v of vehicles) {
    await new Promise((resolve) => v.bind(0, '127.0.0.1', resolve));
    v.on('message', (m) => replies.push(m));
  }
  const send = (v, bytes) => new Promise((resolve) => v.send(bytes, port, '127.0.0.1', resolve));

  // Five rounds 200 ms apart: vehicle 1 sends a MAVLink 1 heartbeat and an
  // attitude frame, vehicle 2 a MAVLink 2 heartbeat. Then a station frame:
  // system 255 arming system 2.
  for (let round = 0; round < 5; round++) {
    await send(vehicles[0], Buffer.concat([FRAMES.heartbeatV1System1, FRAMES.attitudeSystem1]));
    await send(vehicles[1], FRAMES.heartbeatV2System2);
    await sleep(200);
  }
  await send(vehicles[1], FRAMES.commandLongArmTo2);
  await sleep(100);

  probe.child.kill('SIGINT');
  assert.equal(await probe.exited, 0, probe.err());
  for (const v of vehicles) v.close();

  // It sends nothing: not a byte came back to either vehicle.
  assert.deepEqual(replies, []);

  const records = readRecording(readFileSync(recordPath, 'utf8'));
  assert.deepEqual(
    records.map((r) => `${r.system} ${r.message}`),
    [...Array.from({ length: 5 }, () => ['1 HEARTBEAT', '2 HEARTBEAT']).flat(), '255 COMMAND_LONG'],
  );
  for (const system of [1, 2]) {
    const g = gaps(records, { system, message: 'HEARTBEAT' });
    assert.equal(g.length, 4, `system ${system}`);
    for (const gap of g) assert.ok(gap > 0.15 && gap < 0.4, `system ${system} gap ${gap}`);
  }
  assert.equal(records.at(-1).target, 2);

  // Piped, it prints one plain line per shown frame, with no terminal codes.
  const lines = probe.out().trim().split('\n');
  assert.equal(
    lines[0],
    `wire-probe: listening on UDP 127.0.0.1:${port}. It sends nothing. Ctrl-C quits.`,
  );
  assert.equal(lines[1], `wire-probe: saving every shown frame to ${recordPath}`);
  assert.match(
    lines[2],
    /^ +\d+\.\d{3} s {2}system 1 component 1 {2}HEARTBEAT {2}first {2}type 2 \(quadrotor\)/,
  );
  assert.match(
    lines[5],
    /system 2 component 1 {2}HEARTBEAT {2}gap 0\.\d{3} s {2}type 2 \(quadrotor\), autopilot 3 \(ArduPilot\), armed$/,
  );
  assert.match(
    lines.at(-2),
    /COMMAND_LONG {2}first {2}to system 2, command 400 \(COMPONENT_ARM_DISARM\)$/,
  );
  assert.equal(lines.at(-1), 'wire-probe: stopped.');
  assert.ok(!probe.out().includes('\x1b'), 'no terminal codes');
});

test('--seconds stops it by itself', async () => {
  const probe = startProbe(['--port', String(await freePort()), '--seconds', '0.3']);
  await probe.listening;
  assert.equal(await probe.exited, 0, probe.err());
  assert.match(probe.out(), /wire-probe: stopped\.\n$/);
});

test('a port already taken is said plainly', async () => {
  const port = await freePort();
  const holder = createSocket('udp4');
  await new Promise((resolve) => holder.bind(port, '127.0.0.1', resolve));
  const probe = startProbe(['--port', String(port)]);
  const code = await probe.exited;
  holder.close();
  assert.equal(code, 1);
  assert.match(
    probe.err(),
    /wire-probe: bind EADDRINUSE 127\.0\.0\.1:\d+ \(is another probe running\?\)/,
  );
});

test('a bad option prints the usage', async () => {
  const probe = startProbe(['--port', 'nope']);
  assert.equal(await probe.exited, 2);
  assert.match(probe.err(), /--port must be a port number, got: nope/);
  assert.match(probe.err(), /usage: pnpm --filter wire-probe start/);
});
