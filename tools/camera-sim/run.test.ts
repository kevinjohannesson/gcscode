// run.sh starts camera-sim's dev server, then a headless Chrome on the page,
// and stops both on a signal or when either exits. These tests run it against
// a stub Chrome, a sh script that records how it was started, on an ephemeral
// port: never the real Chrome, never 5174. One test uses port 99999 instead,
// which is never bound: it is invalid, so Vite exits. Each run is in a process
// group of its own, killed with SIGKILL after the test, whether it passed or not.
import { spawn } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { connect, createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const RUN_SH = fileURLToPath(new URL('run.sh', import.meta.url));
const TIMEOUT_MS = 20000;
const PAGE_LINE = 'page: drone-1 WHIP publishing';

// The stub Chrome. It records its PID, its arguments (one per line) and the
// HTTP status of its last argument next to itself, writes one console line and
// one line of Chrome's own noise to stderr, then sleeps or exits.
function stubChrome(exitCode: number | undefined): string {
  return `#!/bin/sh
here="$(dirname "$0")"
echo $$ > "$here/chrome.pid"
printf '%s\\n' "$@" > "$here/chrome.args"
for last; do :; done
curl -s --max-time 5 -o /dev/null -w '%{http_code}' "$last" > "$here/chrome.status"
echo '[1:2:3:INFO:CONSOLE:7] "drone-1 WHIP publishing", source: http://localhost/src/main.ts (7)' >&2
echo '[1:2:3:ERROR:ui/display/mac/cv_display_link_mac.mm:188] CVDisplayLinkCreateWithCGDisplay failed.' >&2
${exitCode === undefined ? 'exec sleep 600' : `exit ${exitCode}`}
`;
}

interface Run {
  readonly dir: string;
  readonly tmp: string;
  readonly port: number;
  readonly pid: number;
  readonly out: () => string;
  readonly err: () => string;
  readonly exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
}

const groups: number[] = [];
const dirs: string[] = [];
const holders: Server[] = [];

afterEach(() => {
  for (const pid of groups.splice(0)) {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      // The group is gone already.
    }
  }
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  for (const holder of holders.splice(0)) holder.close();
});

/** An ephemeral port on ::1, where Vite binds `localhost`, bound and released. */
async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '::1', resolve));
  const { port } = server.address() as { port: number };
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function holdPort(port: number): Promise<void> {
  const server = createServer((socket) => socket.destroy());
  holders.push(server);
  await new Promise<void>((resolve) => server.listen(port, '::1', resolve));
}

function accepts(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ port, host: 'localhost' });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(what: string, condition: () => boolean, run: Run): Promise<void> {
  const deadline = Date.now() + 15000;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(
        `Timed out waiting for ${what}.\nstdout:\n${run.out()}\nstderr:\n${run.err()}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function within<T>(ms: number, promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`not within ${ms} ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

interface StartOptions {
  readonly chromeExitCode?: number;
  readonly chrome?: (dir: string) => string;
  /** A port to use instead of a free one. */
  readonly port?: number;
  readonly beforeStart?: (port: number) => Promise<void>;
}

async function start(options: StartOptions = {}): Promise<Run> {
  const dir = mkdtempSync(join(tmpdir(), 'camera-sim-run-test-'));
  dirs.push(dir);
  const tmp = join(dir, 'tmp');
  mkdirSync(tmp);
  const stub = join(dir, 'chrome');
  writeFileSync(stub, stubChrome(options.chromeExitCode));
  chmodSync(stub, 0o755);
  const port = options.port ?? (await freePort());
  await options.beforeStart?.(port);

  const child = spawn(RUN_SH, [], {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      // pnpm and Vite keep Node's compile cache in TMPDIR; with it off, TMPDIR
      // holds only what run.sh makes there.
      NODE_DISABLE_COMPILE_CACHE: '1',
      TMPDIR: tmp,
      CAMERA_SIM_PORT: String(port),
      CAMERA_SIM_CHROME: options.chrome?.(dir) ?? stub,
    },
  });
  let out = '';
  let err = '';
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => (out += chunk));
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => (err += chunk));
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) =>
    child.on('close', (code, signal) => resolve({ code, signal })),
  );
  // A run.sh that cannot be started fails the test here, before its PID is used.
  await new Promise((resolve, reject) => child.once('spawn', resolve).once('error', reject));
  const pid = child.pid!;
  groups.push(pid);
  return { dir, tmp, port, pid, out: () => out, err: () => err, exited };
}

const stubFile = (run: Run, name: string) => join(run.dir, `chrome.${name}`);
const output = (run: Run) => run.out() + run.err();

/** Waits until the stub Chrome has run and its console line came through. */
async function startedChrome(run: Run): Promise<number> {
  await waitFor('the page line', () => output(run).includes(PAGE_LINE), run);
  return Number(readFileSync(stubFile(run, 'pid'), 'utf8'));
}

describe('run.sh', { timeout: TIMEOUT_MS }, () => {
  it('starts Chrome headless on a fresh profile once the page is served', async () => {
    const run = await start();
    await startedChrome(run);

    const args = readFileSync(stubFile(run, 'args'), 'utf8').trimEnd().split('\n');
    expect(args).toContain('--headless=new');
    expect(args).toContain('--enable-logging=stderr');
    expect(args).toContain('--log-level=0');
    const profiles = args.filter((a) => a.startsWith('--user-data-dir='));
    expect(profiles).toHaveLength(1);
    const profile = profiles[0]!.slice('--user-data-dir='.length);
    expect(dirname(profile)).toBe(run.tmp);
    expect(statSync(profile).isDirectory()).toBe(true);
    expect(args.at(-1)).toBe(`http://localhost:${run.port}/`);
    expect(readFileSync(stubFile(run, 'status'), 'utf8')).toBe('200');
  });

  it('prints the page’s console lines and drops Chrome’s own', async () => {
    const run = await start();
    await startedChrome(run);
    // Stopping it drains the filter, so a line it let through would be here.
    process.kill(-run.pid, 'SIGTERM');
    await run.exited;

    expect(output(run)).toMatch(new RegExp(`^${PAGE_LINE}$`, 'm'));
    expect(output(run)).not.toContain('CVDisplayLink');
  });

  it.each(['SIGTERM', 'SIGINT', 'SIGHUP'] as const)(
    'a %s to its process group stops everything and removes the profile',
    async (signal) => {
      const run = await start();
      const chromePid = await startedChrome(run);

      process.kill(-run.pid, signal);
      const { code } = await within(5000, run.exited);

      expect(code).not.toBe(0);
      // Bash's notice for a foreground job a signal killed would show on every stop.
      expect(run.err()).not.toMatch(/Terminated|Hangup/);
      expect(alive(chromePid)).toBe(false);
      expect(await accepts(run.port)).toBe(false);
      expect(readdirSync(run.tmp)).toEqual([]);
    },
  );

  it('Chrome exiting by itself stops the dev server and exits 1', async () => {
    const run = await start({ chromeExitCode: 3 });
    const { code } = await run.exited;

    expect(code).toBe(1);
    expect(run.err()).toContain('ERROR: Chrome exited (code 3).');
    expect(await accepts(run.port)).toBe(false);
    expect(readdirSync(run.tmp)).toEqual([]);
  });

  it('a port already in use stops it before anything starts', async () => {
    const run = await start({ beforeStart: holdPort });
    const { code } = await run.exited;

    expect(code).toBe(1);
    expect(run.err()).toBe(
      `ERROR: something already listens on TCP ${run.port} (another camera-sim?). Stop it first, or set CAMERA_SIM_PORT to another port.\n`,
    );
    expect(existsSync(stubFile(run, 'pid'))).toBe(false);
    expect(readdirSync(run.tmp)).toEqual([]);
  });

  it('a dev server that exits while starting stops it before Chrome starts', async () => {
    // nc rejects port 99999, so the port check passes, and Vite cannot listen
    // there: it exits during the wait for it.
    const run = await start({ port: 99999 });
    const { code } = await run.exited;

    expect(code).toBe(1);
    expect(run.err()).toMatch(/^ERROR: camera-sim's dev server exited \(code 1\)\.$/m);
    expect(existsSync(stubFile(run, 'pid'))).toBe(false);
    expect(readdirSync(run.tmp)).toEqual([]);
  });

  it('a missing Chrome stops it before anything starts', async () => {
    const missing = (dir: string) => join(dir, 'no-such-chrome');
    const run = await start({ chrome: missing });
    const { code } = await within(2000, run.exited);

    expect(code).toBe(1);
    expect(run.err()).toBe(
      `ERROR: Google Chrome missing: ${missing(run.dir)}. Install it from https://www.google.com/chrome/, or set CAMERA_SIM_CHROME to a Chrome binary.\n`,
    );
    expect(readdirSync(run.tmp)).toEqual([]);
  });

  it('a stop before the page is served removes the profile', async () => {
    const run = await start();
    await waitFor('the profile', () => readdirSync(run.tmp).length > 0, run);

    process.kill(-run.pid, 'SIGTERM');
    await within(5000, run.exited);

    expect(existsSync(stubFile(run, 'pid'))).toBe(false);
    expect(readdirSync(run.tmp)).toEqual([]);
    expect(alive(-run.pid)).toBe(false);
  });
});
