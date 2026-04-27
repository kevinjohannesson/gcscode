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
    files: ['packages/extension-*/**/*.{ts,svelte}'],
    ignores: ['packages/extension-api/**'],
    rules: {
      'no-restricted-imports': [
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
          ],
        },
      ],
    },
  },
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.svelte-kit/**'] },
];
