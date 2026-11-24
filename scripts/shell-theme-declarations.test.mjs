// ADR-0017 Decision 5: the shell declares the --gcscode-* theme variables in
// one place, `applyTheme` in packages/shell/src/theme/dark-theme.ts, which
// writes them with setProperty. No shell stylesheet or component may declare
// one too, or the theme would have two sources. Vitest hands CSS to the shell's
// own tests as an empty string, so this check reads the files here instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const shellSrc = join(root, 'packages/shell/src');

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(css|svelte)$/.test(name) ? [path] : [];
  });
}

export function declaredThemeVariables(text) {
  return [...text.matchAll(/(?<![\w-])(--gcscode-[\w-]+)\s*:/g)].map((m) => m[1]);
}

test('declaredThemeVariables finds declarations, not reads', () => {
  assert.deepEqual(declaredThemeVariables('.x { --gcscode-foreground: red; }'), [
    '--gcscode-foreground',
  ]);
  assert.deepEqual(declaredThemeVariables('--color-fg: var(--gcscode-foreground);'), []);
});

test('no shell stylesheet or component declares a --gcscode-* variable', () => {
  const all = files(shellSrc);
  assert.ok(
    all.some((f) => f.endsWith('app.css')),
    'expected to read app.css',
  );
  const found = all.flatMap((file) =>
    declaredThemeVariables(readFileSync(file, 'utf8')).map(
      (name) => `${relative(root, file)}: ${name}`,
    ),
  );
  assert.deepEqual(found, []);
});
