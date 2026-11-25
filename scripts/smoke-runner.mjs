#!/usr/bin/env node
// `pnpm smoke`: a local page that walks the owner through the smoke-test
// playbook (docs/smoke-tests.md) and records each result on its Linear ticket.
// Run it in the checkout being tested: the main checkout for merged code, or
// a PR's worktree (`.worktrees/pr-<n>`) for a draft.
//
// The Linear key comes from LINEAR_API_KEY, or else from
// $HOME/.config/gcscode/linear-api-key. It stays in this process.
//
// Spec: docs/specs/2026-11-24-smoke-test-runner.md (§ The runner).

import { execFile, execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { linearClient, putUpload } from './smoke-runner/linear.mjs';
import { PORT, smokeServer } from './smoke-runner/server.mjs';

/**
 * The Linear key, or null.
 * @param {Record<string, string | undefined>} env
 * @param {(path: string) => string} readFile
 * @returns {string | null}
 */
export function linearKey(env, readFile) {
  if (env.LINEAR_API_KEY?.trim()) return env.LINEAR_API_KEY.trim();
  try {
    const key = readFile(
      join(env.HOME || homedir(), '.config', 'gcscode', 'linear-api-key'),
    ).trim();
    return key || null;
  } catch {
    return null;
  }
}

function main() {
  const cwd = process.cwd();
  const git = (args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const gh = (args) =>
    new Promise((resolve, reject) =>
      execFile(
        'gh',
        args,
        { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
        (err, out, errOut) =>
          err ? reject(new Error(errOut.trim() || err.message)) : resolve(out),
      ),
    );
  const key = linearKey(process.env, (p) => readFileSync(p, 'utf8'));
  const server = smokeServer({
    git,
    gh,
    linear: key ? linearClient(key, fetch) : null,
    putUpload,
    now: () => new Date(),
  });
  server.on('error', (e) => {
    console.error(
      /** @type {NodeJS.ErrnoException} */ (e).code === 'EADDRINUSE'
        ? `Port ${PORT} is in use: is another \`pnpm smoke\` running?`
        : e.message,
    );
    process.exit(1);
  });
  server.listen(PORT, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${PORT}/`;
    console.log(`Smoke test runner at ${url} for ${cwd} (Ctrl-C to stop)`);
    if (!key) {
      console.log(
        'No Linear key: set LINEAR_API_KEY, or put one in ~/.config/gcscode/linear-api-key (Linear, Settings, Security & access, Personal API keys).',
      );
    }
    if (!process.argv.includes('--no-open')) {
      const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
      spawn(opener, [url], { stdio: 'ignore', detached: true })
        .on('error', () => {})
        .unref();
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
