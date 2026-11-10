// setup.sh installs the pinned MediaMTX into GCSCODE_MEDIAMTX_HOME. These tests
// put a fake `uname` and a fake `curl` first on PATH, so they never download
// anything: the fake curl records the URL it was asked for and writes bytes
// that cannot match the pinned sha256, or, to test the install itself, serves
// a small archive with a stand-in binary. That archive cannot match the pinned
// sha256 either, so those tests also put a fake `shasum` on PATH, which records
// the digest setup.sh checked against and accepts it. A real install is checked
// by hand.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
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
// From the v1.21.3 release's checksums.sha256.
const SHA256_DARWIN_AMD64 = '8a8416ee2ff5d17d9366498b6d88b76ab6d3afcda50b6d7321ccddb349bdbaf2';
const SHA256_DARWIN_ARM64 = 'bc1a0762fd18ffb413bcd81dcb9a072ac159fbd1f27e79ac6f14598aaac5ed3f';

const FAKE_UNAME = `#!/bin/sh
case "$1" in
  -s) echo "$FAKE_UNAME_S" ;;
  -m) echo "$FAKE_UNAME_M" ;;
  *) exit 1 ;;
esac
`;

// Called as `curl -fsSL -o FILE URL`. Exits 22, as curl -f does on an HTTP
// error, when CURL_FAIL is set; serves CURL_SERVE when it is set.
const FAKE_CURL = `#!/bin/sh
out=""
while [ $# -gt 1 ]; do
  if [ "$1" = "-o" ]; then out="$2"; shift; fi
  shift
done
echo "$1" >> "$CURL_LOG"
if [ -n "$CURL_FAIL" ]; then exit 22; fi
if [ -n "$CURL_SERVE" ]; then cp "$CURL_SERVE" "$out"; exit 0; fi
printf 'not the MediaMTX archive' > "$out"
`;

// Called as `echo "DIGEST  FILE" | shasum -a 256 -c --status`.
const FAKE_SHASUM = `#!/bin/sh
cat >> "$SHASUM_LOG"
`;

let scratch;
let fakeBin;
let trustingBin; // holds the fake shasum
let archive; // a small tar.gz laid out like the release's, with a stand-in binary
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
  trustingBin = join(scratch, 'trusting-bin');
  mkdirSync(trustingBin);
  writeExecutable(join(trustingBin, 'shasum'), FAKE_SHASUM);

  const contents = join(scratch, 'archive contents');
  fakeMediamtx(contents, 'v1.21.3');
  writeFileSync(join(contents, 'mediamtx.yml'), 'sample config\n');
  writeFileSync(join(contents, 'LICENSE'), 'license\n');
  archive = join(scratch, 'served.tar.gz');
  execFileSync('tar', ['-czf', archive, '-C', contents, 'mediamtx', 'mediamtx.yml', 'LICENSE']);
});

after(() => rmSync(scratch, { recursive: true, force: true }));

// Runs setup.sh with an environment built from scratch, so a
// GCSCODE_MEDIAMTX_HOME inherited from the shell cannot leak in. `urls` lists
// what the fake curl was asked to download. With `serveArchive`, curl serves
// the stand-in archive and the fake shasum accepts it; `checked` is then what
// setup.sh asked shasum to check, as [digest, file], or undefined if it never
// asked. With `downloadFails`, curl fails.
function setup({
  home,
  userHome = join(scratch, 'user'),
  os = 'Darwin',
  arch = 'x86_64',
  serveArchive = false,
  downloadFails = false,
}) {
  const run = ++runs;
  const curlLog = join(scratch, `curl-${run}.log`);
  const shasumLog = join(scratch, `shasum-${run}.log`);
  const env = {
    PATH: `${fakeBin}:${serveArchive ? `${trustingBin}:` : ''}${process.env.PATH}`,
    HOME: userHome,
    FAKE_UNAME_S: os,
    FAKE_UNAME_M: arch,
    CURL_LOG: curlLog,
    SHASUM_LOG: shasumLog,
  };
  if (home !== undefined) env.GCSCODE_MEDIAMTX_HOME = home;
  if (serveArchive) env.CURL_SERVE = archive;
  if (downloadFails) env.CURL_FAIL = '1';
  const result = spawnSync(SETUP, [], { cwd: scratch, encoding: 'utf8', env });
  const urls = existsSync(curlLog) ? readFileSync(curlLog, 'utf8').trim().split('\n') : [];
  const checked = existsSync(shasumLog)
    ? readFileSync(shasumLog, 'utf8').trim().split(/ {2}/)
    : undefined;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, urls, checked };
}

// What the installed binary's --version prints.
function installedVersion(home) {
  return execFileSync(join(home, 'mediamtx'), ['--version'], { encoding: 'utf8' }).trim();
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

test('an Intel Mac checks the archive against the darwin_amd64 sha256 and installs only the binary', () => {
  const home = join(scratch, 'intel install');
  const run = setup({ home, arch: 'x86_64', serveArchive: true });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(run.urls, [`${RELEASE}/mediamtx_v1.21.3_darwin_amd64.tar.gz`]);
  assert.equal(run.checked[0], SHA256_DARWIN_AMD64);
  assert.match(run.checked[1], /\/mediamtx_v1\.21\.3_darwin_amd64\.tar\.gz$/);
  // Neither the archive's sample config and LICENSE nor the download folder.
  assert.deepEqual(readdirSync(home), ['mediamtx']);
  assert.equal(installedVersion(home), 'v1.21.3');
  assert.match(run.stdout, /Setup complete\./);
});

test('an Apple Silicon Mac checks the archive against the darwin_arm64 sha256 and replaces another version', () => {
  const home = join(scratch, 'arm install');
  fakeMediamtx(home, 'v1.20.0');
  const run = setup({ home, arch: 'arm64', serveArchive: true });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(run.urls, [`${RELEASE}/mediamtx_v1.21.3_darwin_arm64.tar.gz`]);
  assert.equal(run.checked[0], SHA256_DARWIN_ARM64);
  assert.match(run.checked[1], /\/mediamtx_v1\.21\.3_darwin_arm64\.tar\.gz$/);
  assert.deepEqual(readdirSync(home), ['mediamtx']);
  assert.equal(installedVersion(home), 'v1.21.3');
});

test('a failed download names the URL and installs nothing', () => {
  const home = join(scratch, 'offline home');
  const run = setup({ home, serveArchive: true, downloadFails: true });
  assert.equal(run.status, 1);
  assert.ok(
    run.stderr.includes(`Download failed: ${RELEASE}/mediamtx_v1.21.3_darwin_amd64.tar.gz`),
    run.stderr,
  );
  assert.equal(run.checked, undefined);
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
