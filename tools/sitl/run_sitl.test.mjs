// run_sitl.sh checks for what setup.sh installs before it starts anything.
// These tests run it against empty and part-built homes, so they stop at those
// checks: nothing starts and no port is touched.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RUN = fileURLToPath(new URL('run_sitl.sh', import.meta.url));
const SETUP_HINT = 'pnpm --filter sitl run setup';

let scratch;

before(() => {
  scratch = realpathSync(mkdtempSync(join(tmpdir(), 'run-sitl-test-')));
});

after(() => rmSync(scratch, { recursive: true, force: true }));

// A GCSCODE_SITL_HOME with what the test asks for, in its own folder.
function makeHome(name, { binary = false, venv = false } = {}) {
  const home = join(scratch, name);
  mkdirSync(home, { recursive: true });
  if (binary) {
    const dir = join(home, 'ardupilot', 'build', 'sitl', 'bin');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'arducopter'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  }
  if (venv) mkdirSync(join(home, 'venv'));
  return home;
}

// Runs run_sitl.sh with an environment built from scratch, so nothing from the
// shell leaks in.
function run(home, extra = {}) {
  const env = {
    PATH: process.env.PATH,
    HOME: join(scratch, 'nobody'),
    GCSCODE_SITL_HOME: home,
    ...extra,
  };
  const result = spawnSync(RUN, [], { cwd: scratch, encoding: 'utf8', env });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function assertStopsAt(home, message) {
  const { status, stdout, stderr } = run(home);
  assert.equal(status, 1, stderr);
  assert.ok(stderr.includes(message), stderr);
  assert.ok(stderr.includes(SETUP_HINT), stderr);
  assert.doesNotMatch(stdout, /Launching/);
}

test('no SITL binary names the setup command', () => {
  const home = makeHome('empty');
  assertStopsAt(home, `SITL binary missing: ${join(home, 'ardupilot/build/sitl/bin/arducopter')}`);
});

test('no venv names the setup command', () => {
  const home = makeHome('binary-only', { binary: true });
  assertStopsAt(home, `venv missing: ${join(home, 'venv')}`);
});

test('no mavlink2rest names the setup command', () => {
  const home = makeHome('no-m2r', { binary: true, venv: true });
  assertStopsAt(home, `mavlink2rest missing: ${join(home, 'bin/mavlink2rest')}`);
});

// SITL_VEHICLES is checked before anything else, so a bad count never starts SITL.
for (const count of ['0', '6', '2.5', 'two', '05']) {
  test(`SITL_VEHICLES=${JSON.stringify(count)} is refused`, () => {
    const home = makeHome(`vehicles-${count}`, { binary: true, venv: true });
    const { status, stdout, stderr } = run(home, { SITL_VEHICLES: count });
    assert.equal(status, 1, stderr);
    assert.ok(
      stderr.includes(`SITL_VEHICLES must be a whole number from 1 to 5, got: ${count}`),
      stderr,
    );
    assert.doesNotMatch(stdout, /Launching/);
  });
}

// A home that gets past every check and launches stand-ins: an arducopter that
// marks its port as listening, an nc that reads those marks, a python that
// passes the MAVProxy import check and records each MAVProxy it is asked to
// start, and a mavlink2rest that waits. No real port is opened or probed, and
// the stand-ins' logs go to the test's own folder. Vehicle 1's MAVProxy runs
// in the foreground and returns at once, so the script stops what it started
// and exits.
function makeLaunchableHome(name) {
  const home = makeHome(name, { binary: true, venv: true });
  const marks = join(home, 'marks');
  const fakes = join(home, 'fakes');
  mkdirSync(fakes);
  mkdirSync(join(home, 'bin'));
  mkdirSync(join(home, 'ardupilot/Tools/autotest/default_params'), { recursive: true });
  writeFileSync(join(home, 'ardupilot/Tools/autotest/default_params/copter.parm'), '');
  mkdirSync(join(home, 'venv/bin'));
  writeFileSync(join(home, 'venv/bin/activate'), '');
  const script = (path, body) => writeFileSync(path, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  script(
    join(home, 'ardupilot/build/sitl/bin/arducopter'),
    'for a in "$@"; do case "$a" in -I*) i=${a#-I};; esac; done\n' +
      'touch "$MARKS/$((5760 + 10 * i))"\nexec sleep 30',
  );
  script(join(home, 'bin/mavlink2rest'), 'exec sleep 30');
  script(join(fakes, 'nc'), 'test -e "$MARKS/$3"');
  script(
    join(fakes, 'python'),
    '[ "$1" = -c ] && exit 0\n' +
      'echo "$*" >> "$MARKS/mavproxy"\n' +
      'case "$*" in *--non-interactive*) exec sleep 30;; esac',
  );
  return { home, marks, fakes };
}

function launch({ home, marks, fakes }, vehicles) {
  rmSync(marks, { recursive: true, force: true });
  mkdirSync(marks);
  const result = spawnSync(RUN, [], {
    cwd: scratch,
    encoding: 'utf8',
    timeout: 20000,
    env: {
      PATH: `${fakes}:${process.env.PATH}`,
      HOME: join(scratch, 'nobody'),
      GCSCODE_SITL_HOME: home,
      SITL_VEHICLES: String(vehicles),
      SITL_TMP_LOG_DIR: marks,
      MARKS: marks,
    },
  });
  return { ...result, masters: mavproxyMasters(marks), outs: mavproxyOuts(marks) };
}

// The --master of every MAVProxy the script started, in order.
function mavproxyMasters(marks) {
  let lines;
  try {
    lines = readFileSync(join(marks, 'mavproxy'), 'utf8').trim().split('\n');
  } catch {
    return [];
  }
  return lines.map((line) => line.match(/--master (\S+)/)?.[1]);
}

// The --out list of every MAVProxy the script started, keyed by its --master.
function mavproxyOuts(marks) {
  let lines;
  try {
    lines = readFileSync(join(marks, 'mavproxy'), 'utf8').trim().split('\n');
  } catch {
    return {};
  }
  return Object.fromEntries(
    lines.map((line) => [
      line.match(/--master (\S+)/)?.[1],
      [...line.matchAll(/--out (\S+)/g)].map((m) => m[1]),
    ]),
  );
}

test('one vehicle starts one MAVProxy, on vehicle 1', () => {
  const run = launch(makeLaunchableHome('launch-1'), 1);
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(run.masters, ['tcp:127.0.0.1:5760']);
});

test('three vehicles start a MAVProxy each, vehicle 1 last in the foreground', () => {
  const run = launch(makeLaunchableHome('launch-3'), 3);
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(run.masters.slice().sort(), [
    'tcp:127.0.0.1:5760',
    'tcp:127.0.0.1:5770',
    'tcp:127.0.0.1:5780',
  ]);
  assert.equal(run.masters.at(-1), 'tcp:127.0.0.1:5760');
});

// The wire probe (tools/wire-probe) listens on 14552 and sees every vehicle;
// the Python client on 14550 sees vehicle 1 alone.
test('every vehicle also sends to the wire probe on UDP 14552', () => {
  const run = launch(makeLaunchableHome('launch-probe'), 2);
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(run.outs, {
    'tcp:127.0.0.1:5760': ['udp:127.0.0.1:14550', 'udp:127.0.0.1:14551', 'udp:127.0.0.1:14552'],
    'tcp:127.0.0.1:5770': ['udp:127.0.0.1:14551', 'udp:127.0.0.1:14552'],
  });
});

// Vehicle 2's terrain links to ardupilot/terrain, which SITL makes only once
// it fetches terrain: a second run must not trip over the link the first made.
test('a second run reuses vehicle 2 terrain link', () => {
  const home = makeLaunchableHome('launch-twice');
  for (const pass of [1, 2]) {
    const run = launch(home, 2);
    assert.equal(run.status, 0, `run ${pass}: ${run.stderr}`);
  }
  assert.equal(
    realpathSync(join(home.home, 'vehicles/2/terrain')),
    join(home.home, 'ardupilot/terrain'),
  );
});
