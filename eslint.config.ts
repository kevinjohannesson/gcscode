import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

// The only shell files that need real extensions: the list the host activates,
// and the teardown test that runs two real extensions across the boundary.
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

// The extensions' half of the boundary (ADR-0005), one pattern per rule it
// enforces. Kept as constants because flat config replaces a rule's options
// wholesale: the block that lets `extension-map` import `map-gl-svelte` must
// repeat every other pattern, or it would drop them for that package.
const EXTENSION_BOUNDARY_PATTERNS = [
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
];

// `map-gl-svelte` stays inside `extension-map`, which builds its view on it:
// no other package imports it, not even its types, so no extension can tell
// which map engine runs underneath (docs/specs/2026-11-25-map-on-map-gl-svelte.md,
// Goal 2).
const MAP_GL_SVELTE_PATTERN = {
  group: ['map-gl-svelte', 'map-gl-svelte/*'],
  message:
    'Only @gcscode/extension-map may import map-gl-svelte. Other extensions draw on the map through its MapApi (docs/specs/2026-11-25-map-on-map-gl-svelte.md).',
};

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
        { patterns: [...EXTENSION_BOUNDARY_PATTERNS, MAP_GL_SVELTE_PATTERN] },
      ],
    },
  },
  {
    // The one package that may import `map-gl-svelte`: the same boundary
    // without that pattern.
    files: ['packages/extension-map/**/*.{ts,svelte}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { patterns: EXTENSION_BOUNDARY_PATTERNS },
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
            MAP_GL_SVELTE_PATTERN,
          ],
        },
      ],
    },
  },
  {
    // The allowlisted files may import extension packages, but not the map's
    // engine either.
    files: SHELL_EXTENSION_IMPORTERS,
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', { patterns: [MAP_GL_SVELTE_PATTERN] }],
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
  // Other worktrees (.worktrees/, .claude/worktrees/) sit inside the workspace root,
  // and .claude/ holds agent scripts this config has never linted.
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.svelte-kit/**',
      '**/target/**',
      '**/scratch/**',
      '.worktrees/**',
      '.claude/**',
    ],
  },
];
