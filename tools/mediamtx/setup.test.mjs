// setup.sh installs the pinned MediaMTX into GCSCODE_MEDIAMTX_HOME. These tests
// put a fake `uname` and a fake `curl` first on PATH, so they never download
// anything: the fake curl records the URL it was asked for and writes bytes
// that cannot match the pinned sha256. A real install is checked by hand.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SETUP = fileURLToPath(new URL('setup.sh', import.meta.url));
const RELEASE = 'https://github.com/bluenviron/mediamtx/releases/download/v1.21.3';

const FAKE_UNAME = `#!/bin/sh
case "$1" in
  -s) echo "$FAKE_UNAME_S" ;;
  -m) echo "$FAKE_UNAME_M" ;;
  *) exit 1 ;;
esac
`;

// Called as `curl -fsSL -o FILE URL`.
const FAKE_CURL = `#!/bin/sh
out=""
while [ $# -gt 1 ]; do
  if [ "$1" = "-o" ]; then out="$2"; shift; fi
  shift
done
echo "$1" >> "$CURL_LOG"
printf 'not the MediaMTX archive' > "$out"
`;

let scratch;
let fakeBin;
let runs = 0;

function writeExecutable(path, body) {
  writeFileSync(path, body, { mode: 0o755 });
}

// A MediaMTX stand-in whose --version prints `version`.
function fakeMediamtx(home, version) {
  mkdirSync(home, { recursive: true });
  writeExecutable(join(home, 'mediamtx'), `#!/bin/sh\necho ${version}\n`);
}

before(() => {
  scratch = realpathSync(mkdtempSync(join(tmpdir(), 'mediamtx-setup-test-')));
  fakeBin = join(scratch, 'fake-bin');
  mkdirSync(fakeBin);
  writeExecutable(join(fakeBin, 'uname'), FAKE_UNAME);
  writeExecutable(join(fakeBin, 'curl'), FAKE_CURL);
});

after(() => rmSync(scratch, { recursive: true, force: true }));

// Runs setup.sh with an environment built from scratch, so a
// GCSCODE_MEDIAMTX_HOME inherited from the shell cannot leak in. `urls` lists
// what the fake curl was asked to download.
function setup({ home, userHome = join(scratch, 'user'), os = 'Darwin', arch = 'x86_64' }) {
  const curlLog = join(scratch, `curl-${++runs}.log`);
  const env = {
    PATH: `${fakeBin}:${process.env.PATH}`,
    HOME: userHome,
    FAKE_UNAME_S: os,
    FAKE_UNAME_M: arch,
    CURL_LOG: curlLog,
  };
  if (home !== undefined) env.GCSCODE_MEDIAMTX_HOME = home;
  const result = spawnSync(SETUP, [], { cwd: scratch, encoding: 'utf8', env });
  const urls = existsSync(curlLog) ? readFileSync(curlLog, 'utf8').trim().split('\n') : [];
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, urls };
}

test('a relative GCSCODE_MEDIAMTX_HOME is refused before anything is downloaded', () => {
  const run = setup({ home: 'relative/mediamtx' });
  assert.equal(run.status, 1);
  assert.match(
    run.stderr,
    /GCSCODE_MEDIAMTX_HOME must be an absolute path, got: relative\/mediamtx/,
  );
  assert.deepEqual(run.urls, []);
});

test('anything but macOS is refused before anything is downloaded', () => {
  const run = setup({ home: join(scratch, 'linux'), os: 'Linux' });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /This script is for macOS\. Detected: Linux/);
  assert.deepEqual(run.urls, []);
});

test('an Intel Mac downloads the darwin_amd64 archive, and an archive failing its sha256 installs nothing', () => {
  const home = join(scratch, 'intel home');
  const run = setup({ home, arch: 'x86_64' });
  assert.equal(run.status, 1);
  assert.deepEqual(run.urls, [`${RELEASE}/mediamtx_v1.21.3_darwin_amd64.tar.gz`]);
  assert.match(
    run.stderr,
    /mediamtx_v1\.21\.3_darwin_amd64\.tar\.gz does not match its published sha256; not installed\./,
  );
  // No binary, and no leftover download folder.
  assert.deepEqual(readdirSync(home), []);
});

test('an Apple Silicon Mac downloads the darwin_arm64 archive', () => {
  const home = join(scratch, 'arm home');
  const run = setup({ home, arch: 'arm64' });
  assert.equal(run.status, 1);
  assert.deepEqual(run.urls, [`${RELEASE}/mediamtx_v1.21.3_darwin_arm64.tar.gz`]);
  assert.deepEqual(readdirSync(home), []);
});

test('a machine with no MediaMTX release for it downloads nothing', () => {
  const run = setup({ home: join(scratch, 'other arch'), arch: 'i386' });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /No MediaMTX release for i386/);
  assert.deepEqual(run.urls, []);
});

test('the pinned version already installed is kept and nothing is downloaded', () => {
  const home = join(scratch, 'pinned home');
  fakeMediamtx(home, 'v1.21.3');
  const run = setup({ home });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /MediaMTX v1\.21\.3 already installed/);
  assert.deepEqual(run.urls, []);
});

test('another installed version is downloaded over, and kept when the download fails its sha256', () => {
  const home = join(scratch, 'stale home');
  fakeMediamtx(home, 'v1.20.0');
  const before = readFileSync(join(home, 'mediamtx'), 'utf8');
  const run = setup({ home });
  assert.equal(run.status, 1);
  assert.deepEqual(run.urls, [`${RELEASE}/mediamtx_v1.21.3_darwin_amd64.tar.gz`]);
  assert.deepEqual(readdirSync(home), ['mediamtx']);
  assert.equal(readFileSync(join(home, 'mediamtx'), 'utf8'), before);
});

test('GCSCODE_MEDIAMTX_HOME defaults to ~/.gcscode/mediamtx', () => {
  const userHome = join(scratch, 'default user');
  fakeMediamtx(join(userHome, '.gcscode', 'mediamtx'), 'v1.21.3');
  const run = setup({ userHome });
  assert.equal(run.status, 0);
  assert.ok(
    run.stdout.includes(`already installed: ${join(userHome, '.gcscode', 'mediamtx', 'mediamtx')}`),
    run.stdout,
  );
  assert.deepEqual(run.urls, []);
});
