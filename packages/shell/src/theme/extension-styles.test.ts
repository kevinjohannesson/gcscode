import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { themeVariables } from '@gcscode/extension-api';
import { findStyleViolations, propertyOwner } from './extension-styles';

// ADR-0017 Decision 5, run over the real extension sources.
const packagesDir = resolve(__dirname, '../../..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(svelte|ts|css)$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });
}

const extensionSlugs = readdirSync(packagesDir)
  .filter((name) => name.startsWith('extension-') && name !== 'extension-api')
  .map((name) => name.slice('extension-'.length));

describe('extension styles (ADR-0017 Decision 5)', () => {
  it('finds the extension packages', () => {
    expect(extensionSlugs).toContain('mavlink');
    expect(extensionSlugs).toContain('mavlink-flight-overlay');
  });

  it.each(extensionSlugs)('extension-%s reads only theme names and its own properties', (slug) => {
    const files = sourceFiles(join(packagesDir, `extension-${slug}`, 'src'));
    const violations = files.flatMap((file) =>
      findStyleViolations(readFileSync(file, 'utf8'), slug, extensionSlugs, themeVariables).map(
        (v) => `${relative(packagesDir, file)}: ${v}`,
      ),
    );
    expect(violations).toEqual([]);
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
