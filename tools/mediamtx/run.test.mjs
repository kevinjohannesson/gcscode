// run.sh execs the MediaMTX in GCSCODE_MEDIAMTX_HOME with this folder's
// mediamtx.yml. These tests give it a stand-in binary that prints what it was
// started with, instead of starting a media server.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RUN = fileURLToPath(new URL('run.sh', import.meta.url));
const CONFIG = fileURLToPath(new URL('mediamtx.yml', import.meta.url));
const SETUP_HINT = 'pnpm --filter mediamtx run setup';

// Prints its arguments and its parent's PID as JSON.
const FAKE_MEDIAMTX = `#!/usr/bin/env node
console.log(JSON.stringify({ argv: process.argv.slice(2), ppid: process.ppid }));
`;

let scratch;
let home; // a GCSCODE_MEDIAMTX_HOME with the stand-in, with a space in its path
let userHome; // a HOME whose ~/.gcscode/mediamtx has the stand-in

function installFake(dir) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'mediamtx'), FAKE_MEDIAMTX, { mode: 0o755 });
}

before(() => {
  scratch = realpathSync(mkdtempSync(join(tmpdir(), 'mediamtx-run-test-')));
  home = join(scratch, 'home with space');
  userHome = join(scratch, 'user');
  installFake(home);
  installFake(join(userHome, '.gcscode', 'mediamtx'));
});

after(() => rmSync(scratch, { recursive: true, force: true }));

// Runs run.sh with an environment built from scratch, so a
// GCSCODE_MEDIAMTX_HOME inherited from the shell cannot leak in. `reached` is
// what the stand-in printed, or undefined when it never started.
function run({ mediamtxHome, user = join(scratch, 'nobody') } = {}) {
  const env = { PATH: process.env.PATH, HOME: user };
  if (mediamtxHome !== undefined) env.GCSCODE_MEDIAMTX_HOME = mediamtxHome;
  const result = spawnSync(RUN, [], { cwd: scratch, encoding: 'utf8', env });
  const out = result.stdout.trim();
  const reached = out.startsWith('{') ? JSON.parse(out) : undefined;
  return { status: result.status, stderr: result.stderr, reached };
}

test('it execs MediaMTX with the committed config, so signals reach MediaMTX itself', () => {
  const { status, reached } = run({ mediamtxHome: home });
  assert.equal(status, 0);
  assert.deepEqual(reached.argv, [CONFIG]);
  // exec: no bash stays between the caller and MediaMTX.
  assert.equal(reached.ppid, process.pid);
});

test('GCSCODE_MEDIAMTX_HOME defaults to ~/.gcscode/mediamtx', () => {
  const { status, reached } = run({ user: userHome });
  assert.equal(status, 0);
  assert.deepEqual(reached.argv, [CONFIG]);
});

test('without the binary it names the setup command', () => {
  const missing = join(scratch, 'not set up');
  const { status, stderr, reached } = run({ mediamtxHome: missing });
  assert.equal(status, 1);
  assert.equal(reached, undefined);
  assert.ok(stderr.includes(`MediaMTX missing: ${join(missing, 'mediamtx')}`), stderr);
  assert.ok(stderr.includes(SETUP_HINT), stderr);
});

test('a relative GCSCODE_MEDIAMTX_HOME is refused', () => {
  const { status, stderr, reached } = run({ mediamtxHome: 'relative/mediamtx' });
  assert.equal(status, 1);
  assert.equal(reached, undefined);
  assert.match(stderr, /GCSCODE_MEDIAMTX_HOME must be an absolute path, got: relative\/mediamtx/);
});
