/**
 * ADR-0017 Decision 5's repo check, as a pure function so its rules can be
 * tested on their own. Custom-property names are read where CSS or script
 * names one: `var(--x`, a `--x:` declaration, a Svelte `style:--x` directive,
 * and the string argument of `setProperty` / `getPropertyValue` /
 * `removeProperty`. A `--` preceded by a word character or dash (a BEM
 * modifier) or followed by a space (a command-line flag) is not one.
 */
const patterns: { kind: 'read' | 'declare'; regex: RegExp }[] = [
  { kind: 'read', regex: /var\(\s*(--[\w-]+)/g },
  { kind: 'declare', regex: /(?<![\w-])(--[\w-]+)\s*:(?!:)/g },
  { kind: 'read', regex: /style:(--[\w-]+)/g },
  { kind: 'read', regex: /(?:setProperty|getPropertyValue|removeProperty)\(\s*['"`](--[\w-]+)/g },
];

/** The extension a property name belongs to: the longest slug that, plus a dash, begins it. */
export function propertyOwner(name: string, slugs: readonly string[]): string | undefined {
  return slugs
    .filter((slug) => name.startsWith(`--${slug}-`))
    .sort((a, b) => b.length - a.length)[0];
}

export function findStyleViolations(
  source: string,
  slug: string,
  slugs: readonly string[],
  themeVariables: readonly string[],
): string[] {
  const found: { index: number; message: string }[] = [];
  const seen = new Set<string>();

  for (const { kind, regex } of patterns) {
    for (const match of source.matchAll(regex)) {
      const name = match[1];
      const index = match.index ?? 0;
      const key = `${index}:${name}`;
      if (seen.has(key)) continue;
      seen.add(key);

      let message: string | undefined;
      if (name.startsWith('--gcscode-')) {
        if (kind === 'declare') {
          message = `declares ${name}; only the shell declares theme variables`;
        } else if (!themeVariables.includes(name)) {
          message = `reads ${name}, which is not a theme variable`;
        }
      } else {
        const owner = propertyOwner(name, slugs);
        if (owner === undefined) {
          message = `uses ${name}, which is neither a theme variable nor this extension’s`;
        } else if (owner !== slug) {
          message = `uses ${name}, which belongs to extension-${owner}`;
        }
      }
      if (message) found.push({ index, message });
    }
  }

  for (const match of source.matchAll(/:root\b/g)) {
    found.push({ index: match.index ?? 0, message: 'styles :root; only the shell does' });
  }
  for (const match of source.matchAll(/document\.documentElement\.style\b/g)) {
    found.push({
      index: match.index ?? 0,
      message: 'writes document.documentElement.style; only the shell does',
    });
  }

  return found.sort((a, b) => a.index - b.index).map((f) => f.message);
}

/**
 * Colours written as literals in a component's style blocks: hex and the
 * functional forms such as `rgb()`, `hsl()` or `color()`, read from
 * declaration values. `color-mix()` and `light-dark()` may wrap theme
 * variables, and named colours (`red`) need a value parser, so both stay
 * with review, like Tailwind classes (Decision 7). A view on the theme has none
 * (ADR-0017 Consequences), except as the value of a custom property it
 * declares: that is a named domain colour (Decision 3), and
 * `findStyleViolations` checks the name belongs to the extension. The
 * exemption trusts that name: a domain or picture colour, never chrome text or
 * borders wearing a slug, which review catches.
 */
export function findHardcodedColours(source: string): string[] {
  const styles = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
  // Declaration values only, so an id selector such as `#add` is not a
  // colour, and comments go first so their prose is not read as one.
  const css = styles.join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  const values = [...css.matchAll(/(?<![\w-])[\w-]+\s*:\s*([^;{}]+)[;}]/g)]
    .filter((m) => !m[0].startsWith('--'))
    .map((m) => m[1])
    .join('\n')
    // A URL's fragment and a quoted string are not colours.
    .replace(/url\([^)]*\)|"[^"]*"|'[^']*'/gi, '');
  const literals = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi;
  return [...values.matchAll(literals)].map((m) => m[0]);
}
