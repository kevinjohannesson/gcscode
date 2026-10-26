import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

// The only shell files that need real extensions: the list the host activates,
// and the one test that runs real extensions across the boundary.
const SHELL_EXTENSION_IMPORTERS = [
  'packages/shell/src/extension-host/bundled-extensions.ts',
  'packages/shell/src/extension-host/asset-teardown.test.ts',
];

// A relative import escapes the package when it climbs one directory more than
// its file sits below the package root, and the group for that climb also
// matches every longer one, so one block per depth is exact. A fixed group like
// the extensions' `../../*` would flag the workbench's in-package `../../`
// imports. Files deeper than SHELL_MAX_DEPTH share the last block, which
// over-flags rather than under-flags: raise the bound if it flags an import
// that stays inside the package.
const SHELL_MAX_DEPTH = 6;
const shellRelativeEscapes = Array.from({ length: SHELL_MAX_DEPTH + 1 }, (_, depth) => ({
  files: [
    `packages/shell/${'*/'.repeat(depth)}${depth === SHELL_MAX_DEPTH ? '**/' : ''}*.{ts,svelte}`,
  ],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: [`${'../'.repeat(depth + 1)}*`],
            message: 'The shell must not use relative imports that escape the package root.',
          },
        ],
      },
    ],
  },
}));

export default [
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs['flat/recommended'],
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ['**/*.svelte'],
    languageOptions: { parserOptions: { parser: ts.parser } },
  },
  {
    files: ['**/*.svelte.ts'],
    languageOptions: { parser: ts.parser },
  },
  {
    files: ['packages/extension-*/**/*.{ts,svelte}'],
    ignores: ['packages/extension-api/**'],
    rules: {
      // Disabled in favour of the typescript-eslint variant below — only that
      // variant supports `allowTypeImports`, which we need for the
      // sibling-extension type-only pattern (ADR-0005). Both rules disabled
      // simultaneously would silently drop enforcement, so the explicit `off`
      // is load-bearing.
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@gcscode/shell', '@gcscode/shell/*'],
              message:
                'Extensions must only import from @gcscode/extension-api. Shell internals are not part of the extension API.',
            },
            {
              group: ['../../*', '../../../*'],
              message: 'Extensions must not use relative imports that escape the package root.',
            },
            {
              group: ['@gcscode/extension-*', '!@gcscode/extension-api'],
              allowTypeImports: true,
              message:
                'Extensions may only type-import from sibling extension packages (use `import type`). Runtime imports must go through @gcscode/extension-api. (ADR-0005)',
            },
          ],
        },
      ],
    },
  },
  {
    // The shell's half of the boundary (ADR-0012): the host stays
    // domain-agnostic, so shell code imports no extension package, not even its
    // types. The type-only allowance above exists for extensions consuming each
    // other's `exports`, which the host never does. Package imports and
    // relative escapes are two rules, not two patterns of one, because flat
    // config replaces a rule's options wholesale: this way the allowlist drops
    // the package rule and keeps the escape rule.
    files: ['packages/shell/**/*.{ts,svelte}'],
    ignores: SHELL_EXTENSION_IMPORTERS,
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@gcscode/extension-*', '!@gcscode/extension-api'],
              message:
                'The shell must not import extension packages, not even their types: the host stays domain-agnostic (ADR-0012). Only the allowlist in eslint.config.ts may, starting with bundled-extensions.ts.',
            },
          ],
        },
      ],
    },
  },
  ...shellRelativeEscapes,
  {
    // Allow `_`-prefixed identifiers as the conventional "intentionally unused"
    // marker — mirrors TypeScript's own noUnusedParameters suppression pattern.
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { varsIgnorePattern: '^_', argsIgnorePattern: '^_' },
      ],
    },
  },
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.svelte-kit/**', '**/scratch/**'] },
];
