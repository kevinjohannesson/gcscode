import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./gh-pr-review-as', import.meta.url));

// A copy of the wrapper next to a fake token helper, and a fake `gh` on PATH
// that records its token and arguments.
function setup(tokenHelperBody) {
  const dir = mkdtempSync(join(tmpdir(), 'gh-pr-review-as-'));
  const wrapper = join(dir, 'gh-pr-review-as');
  copyFileSync(script, wrapper);
  writeFileSync(join(dir, 'gh-app-token-reviewer'), `#!/usr/bin/env bash\n${tokenHelperBody}\n`, {
    mode: 0o755,
  });
  const log = join(dir, 'gh.log');
  writeFileSync(
    join(dir, 'gh'),
    `#!/usr/bin/env bash\nprintf '%s\\n' "token=$GH_TOKEN" "$@" > '${log}'\n`,
    { mode: 0o755 },
  );
  const run = (...args) =>
    spawnSync('bash', [wrapper, ...args], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, GH_TOKEN: '' },
    });
  const ghCall = () => {
    try {
      return readFileSync(log, 'utf8');
    } catch {
      return null;
    }
  };
  return { run, ghCall };
}

test('posts with the role token and passes the review arguments through', () => {
  const { run, ghCall } = setup('[[ "$1" == red-team ]] && echo tok-red-team');
  const result = run('red-team', '109', '--comment', '--body-file', 'body file.md');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    ghCall(),
    'token=tok-red-team\npr\nreview\n109\n--comment\n--body-file\nbody file.md\n',
  );
});

test('does not post when the token helper fails', () => {
  const { run, ghCall } = setup('echo "unknown role-slug: $1" >&2; exit 1');
  const result = run('nobody', '109', '--comment');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unknown role-slug: nobody/);
  assert.equal(ghCall(), null);
});

test('does not post with an empty token', () => {
  const { run, ghCall } = setup('echo ""');
  const result = run('red-team', '109', '--comment');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /empty token/);
  assert.equal(ghCall(), null);
});

test('refuses to run without a role and review arguments', () => {
  const { run, ghCall } = setup('echo tok');
  const result = run('red-team');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /usage/);
  assert.equal(ghCall(), null);
});
