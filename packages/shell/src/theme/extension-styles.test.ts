import { describe, expect, it } from 'vitest';
import { themeVariables } from '@gcscode/extension-api';
import { findHardcodedColours, findStyleViolations, propertyOwner } from './extension-styles';

// ADR-0017 Decision 5, run over the real extension sources. Vite reads them,
// so the shell's browser-only types need no Node APIs.
const sources = import.meta.glob<string>(
  [
    '../../../extension-*/src/**/*.{svelte,ts,css}',
    '!../../../extension-*/src/**/*.test.ts',
    '!../../../extension-api/**',
  ],
  { query: '?raw', import: 'default', eager: true },
);

const files = Object.entries(sources).map(([key, text]) => {
  const path = key.slice('../../../'.length);
  return { path, slug: path.slice('extension-'.length, path.indexOf('/')), text };
});

const extensionSlugs = [...new Set(files.map((f) => f.slug))].sort();

describe('extension styles (ADR-0017 Decision 5)', () => {
  it('finds the extension packages', () => {
    expect(extensionSlugs).toContain('mavlink');
    expect(extensionSlugs).toContain('mavlink-flight-overlay');
    expect(extensionSlugs).not.toContain('api');
  });

  it.each(extensionSlugs)('extension-%s reads only theme names and its own properties', (slug) => {
    const violations = files
      .filter((f) => f.slug === slug)
      .flatMap((f) =>
        findStyleViolations(f.text, slug, extensionSlugs, themeVariables).map(
          (v) => `${f.path}: ${v}`,
        ),
      );
    expect(violations).toEqual([]);
  });
});

// Extensions whose views have not moved onto the theme yet (ADR-0017
// Consequences). Every other extension, a new one included, writes no hex or
// functional colour literal; a PR that migrates one takes it off this list.
const notYetThemed = ['mavlink-flight-overlay'];
const themedExtensions = extensionSlugs.filter((slug) => !notYetThemed.includes(slug));

describe('themed extensions write no hex or functional colour literal in their styles', () => {
  it('checks every extension not on the not-yet-themed list', () => {
    expect(themedExtensions).toEqual([
      'assets',
      'assets-demo',
      'example',
      'manual-control',
      'map',
      'map-demo',
      'mavlink',
      'vehicle-status',
      'video',
    ]);
  });

  // The list shrinks as extensions migrate: a clean extension left on it
  // would be exempt from then on.
  it.each(notYetThemed)('extension-%s still has a literal, so it stays listed', (slug) => {
    const literals = files
      .filter((f) => f.slug === slug && f.path.endsWith('.svelte'))
      .flatMap((f) => findHardcodedColours(f.text));
    expect(literals.length).toBeGreaterThan(0);
  });

  it.each(themedExtensions)('extension-%s', (slug) => {
    const literals = files
      .filter((f) => f.slug === slug && f.path.endsWith('.svelte'))
      .flatMap((f) => findHardcodedColours(f.text).map((c) => `${f.path}: ${c}`));
    expect(literals).toEqual([]);
  });
});

describe('findHardcodedColours', () => {
  it('finds hex and functional colours in a style block', () => {
    expect(
      findHardcodedColours(
        '<style>.a { color: #ddd; background: rgba(0, 0, 0, 0.5); border-color: #1f1f1fcc; fill: oklch(0.7 0.1 200); }</style>',
      ),
    ).toEqual(['#ddd', 'rgba(', '#1f1f1fcc', 'oklch(']);
  });

  it('reads declaration values, not selectors', () => {
    expect(
      findHardcodedColours(
        '<style>/* note: #abc; */ #add, .a:hover { color: var(--gcscode-foreground); } .b { background: color(display-p3 1 1 1); border-color: color-mix(in srgb, var(--gcscode-foreground) 20%, transparent); outline-color: #fff; }</style>',
      ),
    ).toEqual(['color(', '#fff']);
  });

  it('reads upper-case functional forms, and skips URL fragments and quoted strings', () => {
    expect(
      findHardcodedColours(
        `<style>.a { color: RGB(1, 2, 3); background: url(icons.svg#abc) no-repeat; } .b::before { content: "#abc"; quotes: '#fed'; }</style>`,
      ),
    ).toEqual(['RGB(']);
  });

  it('accepts a literal as the value of a custom property the component declares', () => {
    expect(
      findHardcodedColours(
        '<style>.a { --video-letterbox: #000; background: var(--video-letterbox); color: #fff; }</style>',
      ),
    ).toEqual(['#fff']);
  });

  it('accepts theme variables and ignores markup outside the style block', () => {
    expect(
      findHardcodedColours(
        '<a href="#top">#fff</a><style>.a { color: var(--gcscode-foreground); }</style>',
      ),
    ).toEqual([]);
  });
});

describe('propertyOwner', () => {
  const slugs = ['mavlink', 'mavlink-flight-overlay', 'map', 'map-demo'];

  it('gives a name to the longest slug that, plus a dash, begins it', () => {
    expect(propertyOwner('--mavlink-flight-overlay-armed', slugs)).toBe('mavlink-flight-overlay');
    expect(propertyOwner('--mavlink-link-ok', slugs)).toBe('mavlink');
    expect(propertyOwner('--map-demo-marker', slugs)).toBe('map-demo');
  });

  it('needs the dash: --mapx belongs to no one', () => {
    expect(propertyOwner('--mapx-color', slugs)).toBeUndefined();
    expect(propertyOwner('--background', slugs)).toBeUndefined();
  });
});

describe('findStyleViolations', () => {
  const slugs = ['mavlink', 'mavlink-flight-overlay'];
  const check = (source: string, slug = 'mavlink-flight-overlay') =>
    findStyleViolations(source, slug, slugs, themeVariables);

  it('accepts theme names and the extension’s own properties', () => {
    expect(
      check(
        '<style>.x { color: var(--gcscode-foreground); --mavlink-flight-overlay-armed: #2f81f7; fill: var(--mavlink-flight-overlay-armed); }</style>',
      ),
    ).toEqual([]);
  });

  it('flags an unknown --gcscode- name', () => {
    expect(check('.x { color: var(--gcscode-foregroud); }')).toEqual([
      'reads --gcscode-foregroud, which is not a theme variable',
    ]);
  });

  it('flags a declared --gcscode- property', () => {
    expect(check('.x { --gcscode-foreground: red; }')).toEqual([
      'declares --gcscode-foreground; only the shell declares theme variables',
    ]);
  });

  it('flags another extension’s property, the longest slug deciding', () => {
    expect(check('.x { color: var(--mavlink-ok); }')).toEqual([
      'uses --mavlink-ok, which belongs to extension-mavlink',
    ]);
    expect(check('.x { color: var(--mavlink-flight-overlay-armed); }', 'mavlink')).toEqual([
      'uses --mavlink-flight-overlay-armed, which belongs to extension-mavlink-flight-overlay',
    ]);
  });

  it('flags unprefixed names such as Tailwind’s or shadcn’s', () => {
    expect(check('.x { background: var(--background); color: var(--color-neutral-300); }')).toEqual(
      [
        'uses --background, which is neither a theme variable nor this extension’s',
        'uses --color-neutral-300, which is neither a theme variable nor this extension’s',
      ],
    );
  });

  it('reads names in script and in Svelte style directives', () => {
    expect(
      check(
        `getComputedStyle(root).getPropertyValue('--gcscode-level-warnin'); el.style.setProperty("--x-y", "1"); <div style:--mavlink-ok="1">`,
      ),
    ).toEqual([
      'reads --gcscode-level-warnin, which is not a theme variable',
      'uses --x-y, which is neither a theme variable nor this extension’s',
      'uses --mavlink-ok, which belongs to extension-mavlink',
    ]);
  });

  it('ignores command-line flags and BEM modifiers in markup', () => {
    expect(
      check(
        '<code>pnpm --filter mavlink-station start</code> <div class="controls--top-right"></div> <style>.controls--top-right:hover { opacity: 1; }</style>',
      ),
    ).toEqual([]);
  });

  it('flags styling :root and writing the document root’s style', () => {
    expect(check(':global(:root) { color: red; }')).toEqual(['styles :root; only the shell does']);
    expect(check('document.documentElement.style.color = "red";')).toEqual([
      'writes document.documentElement.style; only the shell does',
    ]);
  });
});
