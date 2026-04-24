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
    files: ['packages/plugin-*/**/*.{ts,svelte}'],
    ignores: ['packages/plugin-api/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@gcscode/shell', '@gcscode/shell/*'],
              message:
                'Plugins must only import from @gcscode/plugin-api. Shell internals are not part of the plugin API.',
            },
            {
              group: ['../../*', '../../../*'],
              message: 'Plugins must not use relative imports that escape the package root.',
            },
          ],
        },
      ],
    },
  },
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.svelte-kit/**'] },
];
