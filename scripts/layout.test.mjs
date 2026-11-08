// The workspace moved from shell/ to the repo root (PR #42). When a branch cut
// before the move is rebased, a file it added in a folder of its own stays under
// shell/ without a conflict. pnpm-workspace.yaml no longer matches it, so every
// check passes without running it. This test fails instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

test('no tracked file is left under shell/', () => {
  const files = execFileSync('git', ['ls-files', '--', 'shell'], { cwd: root, encoding: 'utf8' });
  assert.equal(files, '', `Move these to their place in the root layout:\n${files}`);
});
