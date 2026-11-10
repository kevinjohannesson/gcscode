// run_sitl.sh checks for what setup.sh installs before it starts anything.
// These tests run it against empty and part-built homes, so they stop at those
// checks: nothing starts and no port is touched.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, rmSync } from 'node:fs';
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
function run(home) {
  const env = { PATH: process.env.PATH, HOME: join(scratch, 'nobody'), GCSCODE_SITL_HOME: home };
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
