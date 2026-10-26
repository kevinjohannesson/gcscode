import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ESLint } from 'eslint';

// Lints in-memory snippets against the real config. `filePath` only selects
// which config blocks apply, so the file need not exist.
const eslint = new ESLint({ cwd: import.meta.dirname });

const PACKAGE = '@typescript-eslint/no-restricted-imports';
const ESCAPE = 'no-restricted-imports';

async function restrictions(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages
    .map((message) => message.ruleId ?? '')
    .filter((ruleId) => ruleId === PACKAGE || ruleId === ESCAPE);
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
    await restrictions(file, "export { sitlExtension } from '@gcscode/extension-sitl';"),
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

test('the two allowlisted files may import extension packages', async () => {
  const code = "import { mapExtension } from '@gcscode/extension-map';";
  assert.deepEqual(
    await restrictions('packages/shell/src/extension-host/bundled-extensions.ts', code),
    [],
  );
  assert.deepEqual(
    await restrictions('packages/shell/src/extension-host/asset-teardown.test.ts', code),
    [],
  );
});

test('relative imports that stay inside the package are allowed at every depth', async () => {
  assert.deepEqual(await restrictions('packages/shell/vite.config.ts', "import './src/main';"), []);
  assert.deepEqual(
    await restrictions('packages/shell/src/main.ts', "import '../vite.config';"),
    [],
  );
  // The workbench's real imports, which a fixed `../../*` group would flag.
  const workbench = 'packages/shell/src/built-in/workbench/index.ts';
  assert.deepEqual(await restrictions(workbench, "import '../../extension-host/registry';"), []);
  assert.deepEqual(await restrictions(workbench, "import '../../../package.json';"), []);
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
