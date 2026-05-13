import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

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
    // Allow `_`-prefixed identifiers as the conventional "intentionally unused"
    // marker — mirrors TypeScript's own noUnusedParameters suppression pattern.
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { varsIgnorePattern: '^_', argsIgnorePattern: '^_' },
      ],
    },
  },
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.svelte-kit/**'] },
];
