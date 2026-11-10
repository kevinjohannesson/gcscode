// dev-stack.mjs starts the dev stack's services, each in a process group of
// its own, and stops every group on a signal or a failure. These tests run it
// in a child process against stub services: small node scripts whose
// behaviour comes from their arguments. They start no SITL, MediaMTX or Vite
// and, apart from the port tests, use no ports; those use ephemeral ones, never
// the stack's own. Every process a test starts is killed by its recorded PID
// after the test, whether it passed or not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createSocket } from 'node:dgram';
import {
  accessSync,
  constants,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { connect, createServer as createTcpServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAVLINK2REST, ROOT, SERVICES, checkPorts, hasHeartbeat } from './dev-stack.mjs';

const LAUNCHER = new URL('dev-stack.mjs', import.meta.url).href;
const FAST = { upPollMs: 50, signalWindowMs: 300, killGraceMs: 1500 };
const TIMEOUT = { timeout: 20000 };

// A stand-in service, run as `node -e`. Its one argument is JSON:
//   dir, name              it writes its PID to <dir>/<name>.pid, appends each
//                          signal it gets to <dir>/<name>.signals and creates
//                          <dir>/<name>.ready once set up
//   stdout, stderr         text to write once started
//   grandchild             start a child in its process group, print its PID
//   escapee                start a child in a process group of its own that
//                          shares its output, write its PID to <name>-escapee.pid
//   exitAfterMs, exitCode  exit by itself
//   ignoreSignals          ignore SIGINT, SIGTERM and SIGHUP
//   stopMs                 on a signal, wait this long, record `graceful`, exit
//   stderrOnSignal         text to write to stderr on a signal
function stub() {
  const { appendFileSync, writeFileSync, writeSync } = process.getBuiltinModule('node:fs');
  const { spawn } = process.getBuiltinModule('node:child_process');
  const o = JSON.parse(process.argv[1]);
  const file = (suffix) => `${o.dir}/${o.name}${suffix}`;
  writeFileSync(file('.pid'), String(process.pid));
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => {
      appendFileSync(file('.signals'), `${signal}\n`);
      if (o.stderrOnSignal) writeSync(2, o.stderrOnSignal);
      if (o.ignoreSignals) return;
      setTimeout(() => {
        appendFileSync(file('.signals'), 'graceful\n');
        process.exit(0);
      }, o.stopMs ?? 0);
    });
  }
  setInterval(() => {}, 60000);
  if (o.grandchild) {
    // `dir` in its arguments lets survivors() find it.
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 60000)', o.dir], {
      stdio: 'inherit',
    });
    writeSync(1, `grandchild ${child.pid}\n`);
  }
  if (o.escapee) {
    const escapee = spawn(process.execPath, ['-e', 'setInterval(() => {}, 60000)', o.dir], {
      detached: true,
      stdio: 'inherit',
    });
    writeFileSync(file('-escapee.pid'), String(escapee.pid));
  }
  // Synchronous writes, so an exit right after cannot drop them.
  if (o.stdout) writeSync(1, o.stdout);
  if (o.stderr) writeSync(2, o.stderr);
  writeFileSync(file('.ready'), '');
  if (o.exitAfterMs !== undefined) setTimeout(() => process.exit(o.exitCode), o.exitAfterMs);
}
const STUB = `(${stub})()`;

/**
 * Runs `script` as an ES module in a node of its own process group, as a
 * terminal runs its foreground job. Writes nothing to disk.
 */
function launch(script, env = process.env) {
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  });
  let out = '';
  let err = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => (out += chunk));
  child.stderr.setEncoding('utf8').on('data', (chunk) => (err += chunk));
  const exited = new Promise((resolve) => {
    child.on('close', (code, signal) => resolve({ code, signal }));
  });
  return { child, out: () => out, err: () => err, exited };
}

/**
 * The script that runs runStack over stub services in `dir`. Each service is
 * `{ name, stub?, command?, up?, upWithinMs? }`: `stub` is the stub's options,
 * `command` a command to run instead of a stub, and `up` the source of the
 * service's up(), in which `ready(name)` says whether that stub is set up and
 * `exited(name)` whether it has exited and been reaped. By default a service is
 * up once its own stub is.
 */
function stackScript(dir, services, timings) {
  const entries = services.map(
    ({ name, stub: options = {}, command, up, upWithinMs = 10000 }) => `{
      name: ${JSON.stringify(name)},
      command: ${JSON.stringify(command ?? process.execPath)},
      args: ${JSON.stringify(command ? [] : ['-e', STUB, JSON.stringify({ dir, name, ...options })])},
      cwd: ${JSON.stringify(dir)},
      ports: [],
      up: ${up ?? `() => ready(${JSON.stringify(name)})`},
      upWithinMs: ${upWithinMs},
      addresses: [],
    }`,
  );
  return `
    import { existsSync, readFileSync } from 'node:fs';
    import { runStack } from ${JSON.stringify(LAUNCHER)};
    const ready = (name) => existsSync(${JSON.stringify(dir)} + '/' + name + '.ready');
    const exited = (name) => {
      try {
        process.kill(Number(readFileSync(${JSON.stringify(dir)} + '/' + name + '.pid', 'utf8')), 0);
        return false;
      } catch (error) {
        return error.code === 'ESRCH';
      }
    };
    const services = [${entries.join(', ')}];
    process.exit(await runStack({ services, timings: ${JSON.stringify(timings)} }));
  `;
}

/**
 * Launches runStack over these services, with FAST timings under `timings`,
 * in a fresh folder. After the test, it kills the launcher's group and every
 * stub's group by the PIDs they recorded.
 */
function startStack(t, services, timings = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'dev-stack-test-')));
  const run = launch(stackScript(dir, services, { ...FAST, ...timings }));
  t.after(() => {
    killGroup(run.child.pid);
    for (const name of readdirSync(dir).filter((file) => file.endsWith('.pid'))) {
      killGroup(Number(readFileSync(join(dir, name), 'utf8')));
    }
    rmSync(dir, { recursive: true, force: true });
  });
  return { ...run, dir };
}

function killGroup(pid) {
  try {
    process.kill(-pid, 'SIGKILL');
  } catch (error) {
    if (error.code !== 'ESRCH' && error.code !== 'EPERM') throw error;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A terminal's Ctrl-C: SIGINT to the foreground job's process group. */
const ctrlC = (run) => process.kill(-run.child.pid, 'SIGINT');

const transcript = (run) => `\n--- stdout\n${run.out()}--- stderr\n${run.err()}`;

/** Resolves once the launcher has printed `text`; rejects if it exits first. */
async function printed(run, text, ms = 10000) {
  let exited = false;
  run.exited.then(() => (exited = true));
  const deadline = Date.now() + ms;
  while (!run.out().includes(text)) {
    if (exited) throw new Error(`exited without printing ${text}${transcript(run)}`);
    if (Date.now() > deadline) throw new Error(`no ${text} within ${ms} ms${transcript(run)}`);
    await sleep(20);
  }
}

/** The launcher's `{ code, signal }`, or a failure if it runs longer than `ms`. */
async function exitWithin(run, ms = 10000) {
  let timer;
  const late = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`still running after ${ms} ms${transcript(run)}`)),
      ms,
    );
  });
  try {
    return await Promise.race([run.exited, late]);
  } finally {
    clearTimeout(timer);
  }
}

/** `ps` lines of processes started for this test: they all have `dir` in their arguments. */
function survivors(dir) {
  const ps = execFileSync('ps', ['-ax', '-ww', '-o', 'pid=,command='], { encoding: 'utf8' });
  return ps.split('\n').filter((line) => line.includes(dir));
}

async function assertNoSurvivors(dir) {
  // Give a process killed a moment ago time to leave the process table.
  for (let i = 0; i < 20 && survivors(dir).length > 0; i++) await sleep(50);
  assert.deepEqual(survivors(dir), []);
}

/** process.kill(pid, 0) throws ESRCH once `pid` is gone. */
async function assertGone(pid) {
  for (let i = 0; i < 20; i++) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      assert.equal(error.code, 'ESRCH');
      return;
    }
    await sleep(50);
  }
  assert.fail(`PID ${pid} is still running`);
}

function grandchildPid(run, name) {
  const match = run.out().match(new RegExp(`^${name} *\\| grandchild (\\d+)$`, 'm'));
  assert.ok(match, `no grandchild PID from ${name}${transcript(run)}`);
  return Number(match[1]);
}

const signalsOf = (run, name) => readFileSync(join(run.dir, `${name}.signals`), 'utf8');

test(
  "it prefixes each service's lines with its padded name, stdout to stdout and stderr to stderr",
  TIMEOUT,
  async (t) => {
    const run = startStack(t, [
      { name: 'a', stub: { stdout: 'hello\ntail' } },
      { name: 'bbb', stub: { stderr: 'oops\n' } },
    ]);
    await printed(run, '==> All up.');
    ctrlC(run);
    assert.equal((await exitWithin(run)).code, 0, transcript(run));
    assert.ok(run.out().includes('a   | hello\n'), transcript(run));
    // A last line without a newline is printed when its stream ends.
    assert.ok(run.out().includes('a   | tail\n'), transcript(run));
    assert.ok(run.err().includes('bbb | oops\n'), transcript(run));
    assert.ok(!run.err().includes('hello') && !run.out().includes('oops'), transcript(run));
  },
);

test('it starts every service before any is up', TIMEOUT, async (t) => {
  const run = startStack(t, [
    { name: 'a', up: "() => ready('b')", upWithinMs: 3000 },
    { name: 'b', up: "() => ready('a')", upWithinMs: 3000 },
  ]);
  await printed(run, '==> All up.');
  ctrlC(run);
  assert.equal((await exitWithin(run)).code, 0, transcript(run));
});

test('an up() that throws counts as not up yet', TIMEOUT, async (t) => {
  const up = "() => { if (!ready('a')) throw new Error('not yet'); return true; }";
  const run = startStack(t, [{ name: 'a', up }]);
  await printed(run, '==> All up.');
  ctrlC(run);
  assert.equal((await exitWithin(run)).code, 0, transcript(run));
});

test('one Ctrl-C stops every service and its grandchildren, and exits 0', TIMEOUT, async (t) => {
  const run = startStack(t, [{ name: 'a', stub: { grandchild: true } }, { name: 'b' }]);
  await printed(run, '==> All up.');
  ctrlC(run);
  assert.equal((await exitWithin(run)).code, 0, transcript(run));
  assert.match(run.out(), /^==> Stopping a, b\n/m);
  assert.match(run.out(), /^==> Stopped\.\n/m);
  assert.doesNotMatch(run.out(), /killed it/);
  await assertGone(grandchildPid(run, 'a'));
  await assertNoSurvivors(run.dir);
});

test("the terminal's Ctrl-C reaches the launcher, not the services", TIMEOUT, async (t) => {
  const run = startStack(t, [{ name: 'a' }]);
  await printed(run, '==> All up.');
  ctrlC(run);
  assert.equal((await exitWithin(run)).code, 0, transcript(run));
  assert.ok(signalsOf(run, 'a').includes('SIGTERM'), signalsOf(run, 'a'));
  assert.ok(!signalsOf(run, 'a').includes('SIGINT'), signalsOf(run, 'a'));
});

test('two Ctrl-Cs within the window count as one', TIMEOUT, async (t) => {
  const run = startStack(t, [{ name: 'a', stub: { stopMs: 800 } }], { killGraceMs: 3000 });
  await printed(run, '==> All up.');
  ctrlC(run);
  await sleep(20);
  ctrlC(run);
  assert.equal((await exitWithin(run)).code, 0, transcript(run));
  assert.ok(signalsOf(run, 'a').includes('graceful'), signalsOf(run, 'a'));
  assert.doesNotMatch(run.out(), /killed it/);
});

test('a Ctrl-C after the window skips the grace', TIMEOUT, async (t) => {
  const run = startStack(t, [{ name: 'a', stub: { ignoreSignals: true } }], {
    killGraceMs: 10000,
  });
  await printed(run, '==> All up.');
  const first = Date.now();
  ctrlC(run);
  await sleep(800);
  ctrlC(run);
  assert.equal((await exitWithin(run, 15000)).code, 0, transcript(run));
  const took = Date.now() - first;
  assert.ok(took < 3000, `exited ${took} ms after the first Ctrl-C`);
  await assertNoSurvivors(run.dir);
});

test('a service that ignores SIGTERM is killed after the grace', TIMEOUT, async (t) => {
  const run = startStack(t, [{ name: 'a', stub: { ignoreSignals: true } }], {
    killGraceMs: 1000,
  });
  await printed(run, '==> All up.');
  ctrlC(run);
  assert.equal((await exitWithin(run)).code, 0, transcript(run));
  assert.ok(run.out().includes('==> a did not stop within 1 s; killed it.\n'), transcript(run));
  await assertNoSurvivors(run.dir);
});

test(
  'output held open from outside the groups delays the stop by at most 2 s',
  TIMEOUT,
  async (t) => {
    const run = startStack(t, [{ name: 'a', stub: { escapee: true } }]);
    await printed(run, '==> All up.');
    const first = Date.now();
    ctrlC(run);
    assert.equal((await exitWithin(run)).code, 0, transcript(run));
    const took = Date.now() - first;
    // killGraceMs, the 2000 ms wait for the output, and a margin.
    assert.ok(took < FAST.killGraceMs + 2000 + 1500, `exited ${took} ms after the Ctrl-C`);
    assert.match(run.out(), /^==> Stopped\.\n/m);
  },
);

for (const signal of ['SIGTERM', 'SIGHUP']) {
  test(`${signal} stops it like Ctrl-C`, TIMEOUT, async (t) => {
    const run = startStack(t, [{ name: 'a' }, { name: 'b' }]);
    await printed(run, '==> All up.');
    process.kill(run.child.pid, signal);
    assert.equal((await exitWithin(run)).code, 0, transcript(run));
    assert.match(run.out(), /^==> Stopped\.\n/m);
    await assertNoSurvivors(run.dir);
  });
}

test('with the terminal gone, SIGHUP still stops the services with SIGTERM', TIMEOUT, async (t) => {
  const run = startStack(t, [{ name: 'a', stub: { stopMs: 300, stderrOnSignal: 'bye\n' } }]);
  await printed(run, '==> All up.');
  // Nothing reads the launcher's output any more, so its writes fail (EPIPE).
  run.child.stdout.destroy();
  run.child.stderr.destroy();
  process.kill(run.child.pid, 'SIGHUP');
  assert.equal((await exitWithin(run)).code, 0);
  assert.equal(signalsOf(run, 'a'), 'SIGTERM\ngraceful\n');
  await assertNoSurvivors(run.dir);
});

test('a service that exits during startup fails the launch', TIMEOUT, async (t) => {
  const error = 'ERROR: venv missing. Create it with:  pnpm --filter sitl run setup';
  const run = startStack(t, [
    { name: 'bad', stub: { stderr: `${error}\n`, exitAfterMs: 0, exitCode: 1 }, up: '() => false' },
    { name: 'good' },
  ]);
  assert.equal((await exitWithin(run)).code, 1, transcript(run));
  assert.ok(run.out().includes('==> bad exited with code 1 during startup.\n'), transcript(run));
  const stopped = run.out().indexOf('==> Stopped.\n');
  const lastLines = run.out().indexOf(`==> Last lines from bad:\n    ${error}\n`);
  assert.ok(stopped !== -1 && lastLines > stopped, transcript(run));
  await assertNoSurvivors(run.dir);
});

test('every service that fails at about the same time shows its last lines', TIMEOUT, async (t) => {
  const run = startStack(t, [
    {
      name: 'first',
      stub: { stderr: 'ERROR: first\n', exitAfterMs: 0, exitCode: 1 },
      up: '() => false',
    },
    {
      name: 'second',
      stub: { stderr: 'ERROR: second\n', exitAfterMs: 100, exitCode: 1 },
      up: '() => false',
    },
    { name: 'long' },
  ]);
  assert.equal((await exitWithin(run)).code, 1, transcript(run));
  assert.ok(run.out().includes('==> first exited with code 1 during startup.\n'), transcript(run));
  assert.ok(run.out().includes('==> second exited with code 1 during startup.\n'), transcript(run));
  const closing = run.out().slice(run.out().indexOf('==> Stopped.\n'));
  assert.equal(
    closing,
    '==> Stopped.\n' +
      '==> Last lines from first:\n    ERROR: first\n' +
      '==> Last lines from second:\n    ERROR: second\n',
    transcript(run),
  );
  await assertNoSurvivors(run.dir);
});

test('once a service has failed, no other is reported up', TIMEOUT, async (t) => {
  // other's up() passes only once bad is reaped, which is when the launcher
  // learns that bad exited: always after the failure.
  const run = startStack(t, [
    { name: 'bad', stub: { exitAfterMs: 0, exitCode: 1 }, up: '() => false' },
    { name: 'other', up: "() => exited('bad')" },
  ]);
  assert.equal((await exitWithin(run)).code, 1, transcript(run));
  assert.ok(run.out().includes('==> bad exited with code 1 during startup.\n'), transcript(run));
  assert.doesNotMatch(run.out(), /other is up|All up/);
  await assertNoSurvivors(run.dir);
});

test('a service not up by its deadline fails the launch', TIMEOUT, async (t) => {
  const run = startStack(t, [
    { name: 'slow', stub: { stdout: 'still starting\n' }, up: '() => false', upWithinMs: 500 },
    { name: 'other' },
  ]);
  assert.equal((await exitWithin(run)).code, 1, transcript(run));
  assert.ok(run.out().includes('==> slow was not up within 0.5 s.\n'), transcript(run));
  assert.ok(run.out().includes('==> Last lines from slow:\n    still starting\n'), transcript(run));
  await assertNoSurvivors(run.dir);
});

test('a service that exits after startup stops the stack', TIMEOUT, async (t) => {
  const run = startStack(t, [
    { name: 'late', stub: { exitAfterMs: 700, exitCode: 0 } },
    { name: 'other' },
  ]);
  await printed(run, '==> All up.');
  assert.equal((await exitWithin(run)).code, 1, transcript(run));
  assert.match(run.out(), /^==> late exited with code 0\.\n/m);
  await assertNoSurvivors(run.dir);
});

test('a service stopped by a signal from elsewhere stops the stack', TIMEOUT, async (t) => {
  const run = startStack(t, [{ name: 'a' }, { name: 'b' }]);
  await printed(run, '==> All up.');
  process.kill(Number(readFileSync(join(run.dir, 'a.pid'), 'utf8')), 'SIGKILL');
  assert.equal((await exitWithin(run)).code, 1, transcript(run));
  assert.match(run.out(), /^==> a was stopped by SIGKILL\.\n/m);
  await assertNoSurvivors(run.dir);
});

test('a command that cannot be spawned fails the launch', TIMEOUT, async (t) => {
  const run = startStack(t, [
    { name: 'missing', command: '/nonexistent/dev-stack-test-command' },
    { name: 'other' },
  ]);
  assert.equal((await exitWithin(run)).code, 1, transcript(run));
  assert.match(run.out(), /^==> missing could not start: .*ENOENT\n/m);
  await assertNoSurvivors(run.dir);
});

test('the group is stopped even when its leader has already exited', TIMEOUT, async (t) => {
  const run = startStack(t, [
    { name: 'leader', stub: { grandchild: true, exitAfterMs: 0, exitCode: 1 }, up: '() => false' },
  ]);
  assert.equal((await exitWithin(run)).code, 1, transcript(run));
  await assertGone(grandchildPid(run, 'leader'));
  await assertNoSurvivors(run.dir);
});

test('an uncaught error in the launcher takes its services down with it', TIMEOUT, async (t) => {
  const crash = "setImmediate(() => { throw new Error('a bug in the launcher'); })";
  const run = startStack(t, [
    {
      name: 'a',
      stub: { grandchild: true, ignoreSignals: true },
      up: `() => { if (ready('a')) ${crash}; return false; }`,
    },
  ]);
  const { code } = await exitWithin(run);
  assert.notEqual(code, 0, transcript(run));
  assert.ok(run.err().includes('a bug in the launcher'), transcript(run));
  await assertNoSurvivors(run.dir);
});

test("SERVICES is the spec's table", () => {
  assert.equal(ROOT, dirname(dirname(fileURLToPath(import.meta.url))));
  assert.equal(MAVLINK2REST, 'http://127.0.0.1:8088');
  const table = SERVICES.map(({ name, command, args, cwd, ports, upWithinMs }) => ({
    name,
    command,
    args,
    cwd,
    ports,
    upWithinMs,
  }));
  assert.deepEqual(table, [
    {
      name: 'sitl',
      command: join(ROOT, 'tools/sitl/run_sitl.sh'),
      args: ['--non-interactive', '--streamrate', '25'],
      cwd: ROOT,
      ports: [
        { proto: 'tcp', port: 5760 },
        { proto: 'tcp', port: 8088 },
        { proto: 'udp', port: 14551 },
      ],
      upWithinMs: 60000,
    },
    {
      name: 'mediamtx',
      command: join(ROOT, 'tools/mediamtx/run.sh'),
      args: [],
      cwd: ROOT,
      ports: [
        { proto: 'tcp', port: 8554 },
        { proto: 'tcp', port: 8889 },
        { proto: 'udp', port: 8000 },
        { proto: 'udp', port: 8001 },
        { proto: 'udp', port: 8189 },
      ],
      upWithinMs: 10000,
    },
    {
      name: 'gcscode',
      command: 'pnpm',
      args: ['--silent', '--filter', '@gcscode/shell', 'dev', '--port', '5173', '--strictPort'],
      cwd: ROOT,
      ports: [{ proto: 'tcp', port: 5173 }],
      upWithinMs: 30000,
    },
  ]);
  assert.deepEqual(
    SERVICES.map((s) => s.addresses),
    [
      [['MAVLink WebSocket', 'ws://localhost:8088/v1/ws/mavlink']],
      [
        ['WHEP', 'http://localhost:8889/drone-1/whep'],
        ['RTSP', 'rtsp://localhost:8554/drone-1'],
      ],
      [['gcscode', 'http://localhost:5173/']],
    ],
  );
  for (const service of SERVICES.slice(0, 2)) {
    accessSync(service.command, constants.X_OK);
  }
});

test('the root script runs the launcher', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['dev:sitl'], 'node scripts/dev-stack.mjs');
});

// Ports for the port tests: held by this process, so lsof names its PID.
const closers = [];
test.afterEach(async () => {
  while (closers.length > 0) await closers.pop()();
});

/** Listens on `host` (port 0), IPv6-only for `::1`; returns the port. */
async function holdTcp(host) {
  const server = createTcpServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ port: 0, host, ipv6Only: host === '::1' }, resolve);
  });
  closers.push(() => new Promise((resolve) => server.close(resolve)));
  return server.address().port;
}

async function holdUdp(host) {
  const socket = createSocket({ type: host === '::1' ? 'udp6' : 'udp4', ipv6Only: host === '::1' });
  await new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.bind(0, host, resolve);
  });
  closers.push(() => new Promise((resolve) => socket.close(resolve)));
  return socket.address().port;
}

/** A port nobody holds: bound on both families, then released. */
async function freePort(proto) {
  const hold = proto === 'tcp' ? holdTcp : holdUdp;
  const port = await hold('127.0.0.1');
  await closers.pop()();
  return port;
}

const portsOf = (proto, ...ports) => ({
  name: 'svc',
  ports: ports.map((port) => ({ proto, port })),
});

for (const [proto, hold] of [
  ['tcp', holdTcp],
  ['udp', holdUdp],
]) {
  for (const host of ['127.0.0.1', '::1']) {
    test(`checkPorts finds a ${proto.toUpperCase()} port held ${host === '::1' ? 'only on ::1' : 'on 127.0.0.1'}`, async () => {
      const held = await hold(host);
      const free = await freePort(proto);
      const found = await checkPorts([portsOf(proto, free, held)]);
      assert.equal(found.length, 1, JSON.stringify(found));
      assert.equal(found[0].service, 'svc');
      assert.equal(found[0].proto, proto);
      assert.equal(found[0].port, held);
      assert.ok(found[0].holder?.includes(`PID ${process.pid}`), JSON.stringify(found));
    });
  }
}

test('a process only talking to a UDP port is not its holder', async () => {
  const held = await holdUdp('127.0.0.1');
  // Another process with a socket connected to the held port: lsof lists it
  // under -iUDP:<port> too, with the held port as its remote end.
  const talker = spawn(
    process.execPath,
    [
      '-e',
      `const s = require('node:dgram').createSocket('udp4');
       s.connect(${held}, '127.0.0.1', () => console.log('connected'));
       setInterval(() => {}, 60000);`,
    ],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  );
  closers.push(async () => talker.kill('SIGKILL'));
  await new Promise((resolve) => talker.stdout.once('data', resolve));
  const [found] = await checkPorts([portsOf('udp', held)]);
  assert.ok(found.holder.includes(`PID ${process.pid}`), found.holder);
  assert.ok(!found.holder.includes(`PID ${talker.pid}`), found.holder);
});

/** A server answering every request with `body`; returns its base URL. */
async function serve(body) {
  const server = createServer((request, response) => {
    seen.push(request.url);
    response.end(body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  closers.push(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}
const seen = [];

test('hasHeartbeat is true for a HEARTBEAT message', async () => {
  const base = await serve(JSON.stringify({ message: { type: 'HEARTBEAT', mavlink_version: 3 } }));
  assert.equal(await hasHeartbeat(base), true);
  assert.ok(seen.at(-1).endsWith('/v1/mavlink/vehicles/1/components/1/messages/HEARTBEAT'));
});

test('hasHeartbeat is false for a message not seen yet', async () => {
  assert.equal(await hasHeartbeat(await serve('None')), false);
});

test('hasHeartbeat is false for another message type', async () => {
  const base = await serve(JSON.stringify({ message: { type: 'SYS_STATUS' } }));
  assert.equal(await hasHeartbeat(base), false);
});

test('hasHeartbeat is false when nothing listens', async () => {
  const port = await freePort('tcp');
  assert.equal(await hasHeartbeat(`http://127.0.0.1:${port}`), false);
});

test('a port in use stops the launch before anything starts', TIMEOUT, async (t) => {
  const held = await holdTcp('127.0.0.1');
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'dev-stack-test-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const marker = (name) => join(dir, `${name}.pid`);
  const script = `
    import { runStack } from ${JSON.stringify(LAUNCHER)};
    const stub = (name, ports) => ({
      name,
      command: process.execPath,
      args: ['-e', 'require("fs").writeFileSync(' + JSON.stringify(${JSON.stringify(dir)} + '/' + name + '.pid') + ', "x")'],
      cwd: ${JSON.stringify(dir)},
      ports,
      up: () => false,
      upWithinMs: 5000,
      addresses: [],
    });
    process.exit(await runStack({
      services: [stub('free', []), stub('taken', [{ proto: 'tcp', port: ${held} }])],
    }));
  `;
  const run = launch(script);
  t.after(() => killGroup(run.child.pid));
  const { code } = await exitWithin(run);
  assert.equal(code, 1, transcript(run));
  assert.ok(run.out().includes(`TCP ${held} (taken)`), transcript(run));
  assert.ok(run.out().includes(`PID ${process.pid}`), transcript(run));
  assert.match(
    run.out(),
    /^==> Not starting: these ports are in use\. Nothing was started or stopped\.\n/,
  );
  assert.match(run.out(), /\n==> Stop what holds them, then run pnpm dev:sitl again\.\n$/);
  assert.doesNotMatch(run.out(), /Starting|Stopping/);
  assert.equal(existsSync(marker('free')), false);
  assert.equal(existsSync(marker('taken')), false);
  // The held server still accepts.
  assert.equal(await tcpOpen(held), true);
});

function tcpOpen(port) {
  return new Promise((resolve) => {
    const socket = connect({ port, host: '127.0.0.1' });
    socket.once('connect', () => (socket.destroy(), resolve(true)));
    socket.once('error', () => resolve(false));
  });
}
