// `pnpm fly-sitl` runs fly.sh, which starts client/fly.py with the venv's Python,
// so nobody has to activate the venv first; fly.py picks the client script from
// its arguments. These tests build real venvs in a temporary GCSCODE_SITL_HOME
// and give one of them a fake pymavlink whose connection prints what the client
// script received instead of connecting.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FLY = fileURLToPath(new URL('fly.sh', import.meta.url));
const SETUP_HINT = 'pnpm --filter sitl run setup';
const ACTIONS = ['--circle', '--takeoff', '--connect', '--telemetry'];

const FAKE_MAVUTIL = `import json, os, sys

def mavlink_connection(endpoint, **kwargs):
    print(json.dumps({
        "script": os.path.basename(sys.argv[0]),
        "argv": sys.argv[1:],
        "endpoint": endpoint,
        "cwd": os.getcwd(),
        "python": sys.executable,
    }))
    sys.exit(0)
`;

let scratch;
let home; // a GCSCODE_SITL_HOME whose venv has the fake pymavlink, with a space in its path
let bareHome; // a venv without pymavlink
let emptyHome; // no venv at all
let fakeUserHome; // a HOME whose ~/.gcscode/sitl has the fake pymavlink
let elsewhere; // a folder to run from that is none of the above

function makeVenv(sitlHome, { withPymavlink }) {
  const venv = join(sitlHome, 'venv');
  execFileSync('python3', ['-m', 'venv', '--without-pip', venv]);
  if (!withPymavlink) return;
  const purelib = execFileSync(
    join(venv, 'bin', 'python'),
    ['-c', 'import sysconfig; print(sysconfig.get_paths()["purelib"])'],
    { encoding: 'utf8' },
  ).trim();
  mkdirSync(join(purelib, 'pymavlink'));
  writeFileSync(join(purelib, 'pymavlink', '__init__.py'), '');
  writeFileSync(join(purelib, 'pymavlink', 'mavutil.py'), FAKE_MAVUTIL);
}

before(() => {
  scratch = realpathSync(mkdtempSync(join(tmpdir(), 'fly-test-')));
  home = join(scratch, 'home with space');
  bareHome = join(scratch, 'bare');
  emptyHome = join(scratch, 'empty');
  fakeUserHome = join(scratch, 'user');
  elsewhere = join(scratch, 'elsewhere');
  for (const dir of [home, bareHome, emptyHome, elsewhere]) mkdirSync(dir);
  mkdirSync(join(fakeUserHome, '.gcscode', 'sitl'), { recursive: true });
  makeVenv(home, { withPymavlink: true });
  makeVenv(bareHome, { withPymavlink: false });
  makeVenv(join(fakeUserHome, '.gcscode', 'sitl'), { withPymavlink: true });
});

after(() => rmSync(scratch, { recursive: true, force: true }));

// Runs fly.sh with an environment built from scratch, so a GCSCODE_SITL_HOME or
// INIT_CWD inherited from the shell or from pnpm cannot leak in. `reached` is
// what the fake pymavlink saw, or undefined when no client script connected.
function fly(args, { env = { GCSCODE_SITL_HOME: home }, cwd = elsewhere } = {}) {
  const result = spawnSync(FLY, args, {
    cwd,
    encoding: 'utf8',
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
  });
  const lastLine = result.stdout.trim().split('\n').at(-1) ?? '';
  const reached = lastLine.startsWith('{') ? JSON.parse(lastLine) : undefined;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, reached };
}

// What it flies

test('--circle 3 flies fly_circle.py three turns with the venv Python', () => {
  const { status, stderr, reached } = fly(['--circle', '3']);
  assert.equal(status, 0, stderr);
  assert.equal(reached.script, 'fly_circle.py');
  assert.deepEqual(reached.argv, ['--turns', '3']);
  assert.ok(reached.python.startsWith(join(home, 'venv', 'bin') + '/'), reached.python);
});

test('--circle without a count leaves the turns to fly_circle.py', () => {
  const { status, stderr, reached } = fly(['--circle']);
  assert.equal(status, 0, stderr);
  assert.equal(reached.script, 'fly_circle.py');
  assert.deepEqual(reached.argv, []);
});

test('the arguments after the action go to the script', () => {
  const { status, stderr, reached } = fly(['--circle', '2', '--endpoint', 'udp:with space:1']);
  assert.equal(status, 0, stderr);
  assert.deepEqual(reached.argv, ['--turns', '2', '--endpoint', 'udp:with space:1']);
  assert.equal(reached.endpoint, 'udp:with space:1');
});

test('--takeoff 25 takes off to 25 m with arm_takeoff.py', () => {
  const { status, stderr, reached } = fly(['--takeoff', '25', '--hover', '15']);
  assert.equal(status, 0, stderr);
  assert.equal(reached.script, 'arm_takeoff.py');
  assert.deepEqual(reached.argv, ['--altitude', '25', '--hover', '15']);
});

test('--connect runs connect.py with the endpoint given after it', () => {
  const { status, stderr, reached } = fly(['--connect', 'udp:test:1']);
  assert.equal(status, 0, stderr);
  assert.equal(reached.script, 'connect.py');
  assert.deepEqual(reached.argv, ['udp:test:1']);
  assert.equal(reached.endpoint, 'udp:test:1');
});

test('--telemetry runs telemetry.py', () => {
  const { status, stderr, reached } = fly(['--telemetry']);
  assert.equal(status, 0, stderr);
  assert.equal(reached.script, 'telemetry.py');
  assert.deepEqual(reached.argv, []);
});

test('drops the -- that pnpm forwards before the arguments', () => {
  const { status, stderr, reached } = fly(['--', '--circle', '3']);
  assert.equal(status, 0, stderr);
  assert.equal(reached.script, 'fly_circle.py');
  assert.deepEqual(reached.argv, ['--turns', '3']);
});

test('--help after an action shows that script’s own options', () => {
  const { status, stdout, stderr, reached } = fly(['--circle', '--help']);
  assert.equal(status, 0, stderr);
  assert.equal(reached, undefined);
  assert.match(stdout, /usage: fly_circle\.py/);
});

// What it refuses

test('with no arguments it lists what it can do and flies nothing', () => {
  const { status, stdout, stderr, reached } = fly([]);
  assert.equal(status, 0, stderr);
  assert.equal(reached, undefined);
  for (const action of ACTIONS) assert.ok(stdout.includes(action), `${action} missing:\n${stdout}`);
});

test('--help alone lists what it can do and flies nothing', () => {
  const { status, stdout, stderr, reached } = fly(['--help']);
  assert.equal(status, 0, stderr);
  assert.equal(reached, undefined);
  for (const action of ACTIONS) assert.ok(stdout.includes(action), `${action} missing:\n${stdout}`);
});

// argparse refuses a command line with exit 2; a crash would exit 1.
test('refuses two actions at once', () => {
  const { status, stderr, reached } = fly(['--circle', '1', '--takeoff']);
  assert.equal(status, 2, stderr);
  assert.equal(reached, undefined);
  assert.match(stderr, /--takeoff: not allowed with argument --circle/);
});

test('refuses script options without an action', () => {
  const { status, stderr, reached } = fly(['--turns', '3']);
  assert.equal(status, 2, stderr);
  assert.equal(reached, undefined);
  for (const action of ACTIONS) assert.ok(stderr.includes(action), `${action} missing:\n${stderr}`);
});

// The drone moves only when --circle or --takeoff is named in full.
test('a shortened action name flies nothing', () => {
  for (const args of [
    ['--ta', '25'],
    ['--ci', '1'],
  ]) {
    const { status, stderr, reached } = fly(args);
    assert.equal(status, 2, `${args.join(' ')}: ${stderr}`);
    assert.equal(reached, undefined, `${args.join(' ')} reached ${reached?.script}`);
  }
});

// Where it runs, and with which venv

test('runs in INIT_CWD, the folder pnpm was started from', () => {
  const { status, stderr, reached } = fly(['--connect'], {
    env: { GCSCODE_SITL_HOME: home, INIT_CWD: home },
  });
  assert.equal(status, 0, stderr);
  assert.equal(reached.cwd, home);
});

test('runs in the current folder when INIT_CWD is not set', () => {
  const { status, stderr, reached } = fly(['--connect']);
  assert.equal(status, 0, stderr);
  assert.equal(reached.cwd, elsewhere);
});

test('defaults GCSCODE_SITL_HOME to ~/.gcscode/sitl', () => {
  const { status, stderr, reached } = fly(['--connect'], { env: { HOME: fakeUserHome } });
  assert.equal(status, 0, stderr);
  assert.ok(
    reached.python.startsWith(join(fakeUserHome, '.gcscode', 'sitl', 'venv', 'bin') + '/'),
    reached.python,
  );
});

test('rejects a relative GCSCODE_SITL_HOME, even one that resolves', () => {
  const { status, stderr, reached } = fly(['--connect'], {
    env: { GCSCODE_SITL_HOME: 'home with space' },
    cwd: scratch,
  });
  assert.notEqual(status, 0);
  assert.equal(reached, undefined);
  assert.match(stderr, /absolute/);
});

test('says to run setup when the venv is missing', () => {
  const { status, stderr, reached } = fly(['--circle', '3'], {
    env: { GCSCODE_SITL_HOME: emptyHome },
  });
  assert.notEqual(status, 0);
  assert.equal(reached, undefined);
  assert.ok(stderr.includes(SETUP_HINT), stderr);
});

test('says to run setup when the venv has no pymavlink', () => {
  const { status, stderr } = fly(['--circle', '3'], { env: { GCSCODE_SITL_HOME: bareHome } });
  assert.notEqual(status, 0);
  assert.ok(stderr.includes(SETUP_HINT), stderr);
  assert.doesNotMatch(stderr, /Traceback/);
});
