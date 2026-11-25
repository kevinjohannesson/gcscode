import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ESLint } from 'eslint';

// Lints in-memory snippets against the real config. `filePath` only selects
// which config blocks apply, so the file need not exist.
const eslint = new ESLint({ cwd: import.meta.dirname });

const PACKAGE = '@typescript-eslint/no-restricted-imports';
const ESCAPE = 'no-restricted-imports';

// Messages without a rule (a parse error, an ignored file, an unused
// eslint-disable directive) are kept, so a snippet that was never linted
// cannot read as allowed.
async function restrictions(filePath, code) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages
    .filter(({ ruleId }) => ruleId === null || ruleId === PACKAGE || ruleId === ESCAPE)
    .map(({ ruleId, message }) => ruleId ?? `no rule: ${message}`);
}

test('shell code may not import an extension package, at runtime or for types', async () => {
  const file = 'packages/shell/src/app.ts';
  assert.deepEqual(
    await restrictions(file, "import { mapExtension } from '@gcscode/extension-map';"),
    [PACKAGE],
  );
  assert.deepEqual(
    await restrictions(file, "import type { AssetsApi } from '@gcscode/extension-assets';"),
    [PACKAGE],
  );
  assert.deepEqual(
    await restrictions(file, "export { mavlinkExtension } from '@gcscode/extension-mavlink';"),
    [PACKAGE],
  );
  assert.deepEqual(
    await restrictions(
      'packages/shell/src/app.svelte',
      '<script lang="ts">import { mapExtension } from \'@gcscode/extension-map\';</script>',
    ),
    [PACKAGE],
  );
});

test('shell code may import @gcscode/extension-api', async () => {
  assert.deepEqual(
    await restrictions(
      'packages/shell/src/app.ts',
      "import type { Extension } from '@gcscode/extension-api';",
    ),
    [],
  );
});

test('the two allowlisted files may import extension packages, and their neighbours may not', async () => {
  const code = "import { mapExtension } from '@gcscode/extension-map';";
  assert.deepEqual(
    await restrictions('packages/shell/src/extension-host/bundled-extensions.ts', code),
    [],
  );
  assert.deepEqual(
    await restrictions('packages/shell/src/extension-host/asset-teardown.test.ts', code),
    [],
  );
  // Same directory, a test file, and a `bundled-extensions` prefix: an
  // allowlist widened to any of those would admit it.
  assert.deepEqual(
    await restrictions('packages/shell/src/extension-host/bundled-extensions.test.ts', code),
    [PACKAGE],
  );
});

test('relative imports that stay inside the package are allowed at every depth', async () => {
  assert.deepEqual(await restrictions('packages/shell/vite.config.ts', "import './src/main';"), []);
  assert.deepEqual(
    await restrictions('packages/shell/src/main.ts', "import '../vite.config';"),
    [],
  );
  // The workbench's real import, which a fixed `../../*` group would flag,
  // then the longest climb from there that stays inside the package.
  const workbench = 'packages/shell/src/built-in/workbench/index.ts';
  assert.deepEqual(await restrictions(workbench, "import '../../extension-host/registry';"), []);
  assert.deepEqual(await restrictions(workbench, "import '../../../package.json';"), []);
  // Six directories down, where the last block takes over.
  assert.deepEqual(
    await restrictions(
      'packages/shell/src/a/b/c/d/e/six.ts',
      `import '${'../'.repeat(6)}package.json';`,
    ),
    [],
  );
});

test('relative imports that escape the package root are flagged at every depth', async () => {
  assert.deepEqual(
    await restrictions('packages/shell/vite.config.ts', "import '../extension-map/src/index';"),
    [ESCAPE],
  );
  assert.deepEqual(
    await restrictions(
      'packages/shell/src/main.ts',
      "import '../../extension-map/src/map-api.svelte';",
    ),
    [ESCAPE],
  );
  const workbench = 'packages/shell/src/built-in/workbench/index.ts';
  assert.deepEqual(
    await restrictions(workbench, "import '../../../../extension-map/src/map-api.svelte';"),
    [ESCAPE],
  );
  assert.deepEqual(await restrictions(workbench, "import '../../../../../package.json';"), [
    ESCAPE,
  ]);
  assert.deepEqual(
    await restrictions(
      'packages/shell/src/app.svelte',
      '<script lang="ts">import \'../../extension-map/src/map-api.svelte\';</script>',
    ),
    [ESCAPE],
  );
  // Six directories down, where the last block takes over.
  assert.deepEqual(
    await restrictions(
      'packages/shell/src/a/b/c/d/e/six.ts',
      `import '${'../'.repeat(7)}package.json';`,
    ),
    [ESCAPE],
  );
  // Ten directories down, past the deepest exact block.
  assert.deepEqual(
    await restrictions(
      'packages/shell/src/a/b/c/d/e/f/g/h/i/deep.ts',
      `import '${'../'.repeat(11)}package.json';`,
    ),
    [ESCAPE],
  );
});

test('allowlisted files still may not escape the package root', async () => {
  assert.deepEqual(
    await restrictions(
      'packages/shell/src/extension-host/bundled-extensions.ts',
      "import '../../../extension-map/src/map-api.svelte';",
    ),
    [ESCAPE],
  );
});

// `map-gl-svelte` stays inside `extension-map`
// (docs/specs/2026-11-25-map-on-map-gl-svelte.md, Goal 2). Each case names a
// file in a package the guard covers, then the import it must flag.
const MAP_GL_SVELTE_IMPORTS = [
  "import { Map } from 'map-gl-svelte';",
  "import type { MapRef } from 'map-gl-svelte';",
  "import Map from 'map-gl-svelte/src/components/map.svelte';",
];

test('no extension but the map may import map-gl-svelte, not even its types', async () => {
  for (const file of [
    'packages/extension-mavlink-flight-overlay/src/layers/drone-icon-layer.svelte',
    'packages/extension-vehicle-status/src/index.ts',
    'packages/extension-map-demo/src/index.test.ts',
  ]) {
    for (const code of MAP_GL_SVELTE_IMPORTS) {
      const snippet = file.endsWith('.svelte') ? `<script lang="ts">${code}</script>` : code;
      assert.deepEqual(await restrictions(file, snippet), [PACKAGE], `${file}: ${code}`);
    }
  }
});

test('the shell may not import map-gl-svelte, the allowlisted files included', async () => {
  for (const file of [
    'packages/shell/src/app.ts',
    'packages/shell/src/extension-host/bundled-extensions.ts',
    'packages/shell/src/extension-host/asset-teardown.test.ts',
  ]) {
    for (const code of MAP_GL_SVELTE_IMPORTS) {
      assert.deepEqual(await restrictions(file, code), [PACKAGE], `${file}: ${code}`);
    }
  }
});

test('the map extension may import map-gl-svelte', async () => {
  assert.deepEqual(
    await restrictions(
      'packages/extension-map/src/map-view.svelte',
      '<script lang="ts">import { Map } from \'map-gl-svelte\';</script>',
    ),
    [],
  );
  assert.deepEqual(
    await restrictions(
      'packages/extension-map/src/map-view.test.ts',
      "import type { MapRef } from 'map-gl-svelte';",
    ),
    [],
  );
});

// The guard's blocks replace the rule's options wholesale, so each must keep
// the rest of the boundary: a shell import, a relative escape and a runtime
// sibling import still fail in the map extension and in every other one.
test('every extension, the map included, still may not import the shell, escape, or import a sibling at runtime', async () => {
  for (const file of [
    'packages/extension-map/src/map-view.ts',
    'packages/extension-mavlink-flight-overlay/src/index.ts',
  ]) {
    for (const code of [
      "import { createRegistry } from '@gcscode/shell';",
      "import '../../shell/src/main';",
      "import { assetsExtension } from '@gcscode/extension-assets';",
    ]) {
      assert.deepEqual(await restrictions(file, code), [PACKAGE], `${file}: ${code}`);
    }
    assert.deepEqual(
      await restrictions(file, "import type { AssetsApi } from '@gcscode/extension-assets';"),
      [],
      `${file}: type-only sibling import`,
    );
  }
});
