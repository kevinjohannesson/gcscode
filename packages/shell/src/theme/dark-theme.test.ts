import { describe, expect, it } from 'vitest';
import { themeVariables, type ThemeVariable } from '@gcscode/extension-api';
import { applyTheme, darkTheme } from './dark-theme';
import { contrastRatio } from './contrast';

// ADR-0017 Decision 4, in its order. Written out, not derived, so a renamed or
// dropped name fails here as well as in every extension that reads it.
const adrNames = [
  '--gcscode-foreground',
  '--gcscode-descriptionForeground',
  '--gcscode-errorForeground',
  '--gcscode-focusBorder',
  '--gcscode-panel-background',
  '--gcscode-panel-border',
  '--gcscode-widget-background',
  '--gcscode-widget-border',
  '--gcscode-widget-shadow',
  '--gcscode-toolbar-hoverBackground',
  '--gcscode-toolbar-activeBackground',
  '--gcscode-input-background',
  '--gcscode-input-foreground',
  '--gcscode-input-border',
  '--gcscode-button-background',
  '--gcscode-button-foreground',
  '--gcscode-button-hoverBackground',
  '--gcscode-list-hoverBackground',
  '--gcscode-list-activeSelectionBackground',
  '--gcscode-textLink-foreground',
  '--gcscode-statusBar-background',
  '--gcscode-statusBar-foreground',
  '--gcscode-level-warning',
  '--gcscode-level-caution',
  '--gcscode-level-normal',
  '--gcscode-font-family',
  '--gcscode-font-size',
  '--gcscode-monospace-font-family',
];

describe('theme variables', () => {
  it('are exactly the names ADR-0017 lists', () => {
    expect([...themeVariables]).toEqual(adrNames);
  });

  it('are all written to the root, and nothing else under --gcscode-', () => {
    const root = document.createElement('div');
    applyTheme(root);
    const written = Array.from(root.style).filter((name) => name.startsWith('--gcscode-'));
    expect(written.sort()).toEqual([...adrNames].sort());
    for (const name of adrNames) {
      expect(root.style.getPropertyValue(name)).toBe(darkTheme[name as ThemeVariable]);
    }
  });

  it('set a dark colour scheme so native controls and scrollbars match', () => {
    const root = document.createElement('div');
    applyTheme(root);
    expect(root.style.colorScheme).toBe('dark');
  });
});

// ADR-0017 Decision 6: every pair, with its minimum. Level colours are held to
// 4.5:1 on the backgrounds where they can be text (PR #77 RT-12) and 3:1 on
// the list rows, where they are marks.
type Pair = [foreground: ThemeVariable, background: ThemeVariable, minimum: number];
const text = 4.5;
const mark = 3;
const pairs: Pair[] = [
  ...(
    [
      '--gcscode-foreground',
      '--gcscode-descriptionForeground',
      '--gcscode-errorForeground',
    ] as const
  ).flatMap((fg) =>
    (
      [
        '--gcscode-panel-background',
        '--gcscode-widget-background',
        '--gcscode-list-hoverBackground',
        '--gcscode-list-activeSelectionBackground',
      ] as const
    ).map((bg): Pair => [fg, bg, text]),
  ),
  ['--gcscode-textLink-foreground', '--gcscode-panel-background', text],
  ['--gcscode-foreground', '--gcscode-toolbar-hoverBackground', text],
  ['--gcscode-foreground', '--gcscode-toolbar-activeBackground', text],
  // The shell's activation-failure indicator: caution text over a hovered status item.
  ['--gcscode-level-caution', '--gcscode-toolbar-hoverBackground', text],
  ['--gcscode-input-foreground', '--gcscode-input-background', text],
  ['--gcscode-button-foreground', '--gcscode-button-background', text],
  ['--gcscode-button-foreground', '--gcscode-button-hoverBackground', text],
  ['--gcscode-statusBar-foreground', '--gcscode-statusBar-background', text],
  ...(
    [
      '--gcscode-panel-background',
      '--gcscode-widget-background',
      '--gcscode-statusBar-background',
    ] as const
  ).flatMap((bg): Pair[] => [
    ['--gcscode-focusBorder', bg, mark],
    ['--gcscode-level-warning', bg, text],
    ['--gcscode-level-caution', bg, text],
    ['--gcscode-level-normal', bg, text],
  ]),
  ...(
    ['--gcscode-list-hoverBackground', '--gcscode-list-activeSelectionBackground'] as const
  ).flatMap((bg): Pair[] => [
    ['--gcscode-level-warning', bg, mark],
    ['--gcscode-level-caution', bg, mark],
    ['--gcscode-level-normal', bg, mark],
  ]),
];

describe('dark theme contrast', () => {
  it('covers 38 pairs', () => {
    expect(pairs).toHaveLength(38);
  });

  it.each(pairs)('%s on %s is at least %s:1', (fg, bg, minimum) => {
    expect(contrastRatio(darkTheme[fg], darkTheme[bg])).toBeGreaterThanOrEqual(minimum);
  });
});
