# ADR-0017: Theme colours are CSS variables

**Date:** 2026-11-24
**Status:** Proposed

## Context

Nothing in gcscode agrees on what the background is. The shell's header and status bar use light Tailwind greys, dockview draws its panels in its own dark theme, and each view hardcodes its own hex values: the MAVLink views assume a dark panel with `#ddd` text, the map controls assume a light one with `#333`. Put together, text disappears on its background, and the app is hard to read for the operator it is built for.

[`docs/out-of-scope.md`](../out-of-scope.md) parked theme tokens with a trigger: "the parallel UI brainstorm landing on a documented design system that wants extension reach. When triggered, follow VS Code's pattern: CSS variables only, no component/utility classes." Making the app presentable is that trigger: every view's colours are what is broken, and most views live in extensions.

VS Code gives every theme colour an id, such as `editor.background` or `descriptionForeground` ([theme colour reference](https://code.visualstudio.com/api/references/theme-color)), and exposes each one to extension-rendered UI as a CSS variable, `--vscode-editor-background` ([theming webview content](https://code.visualstudio.com/api/extension-guides/webview#theming-webview-content)). It also sets `--vscode-font-family`, `--vscode-font-size` and `--vscode-editor-font-family`. Extensions never get VS Code's own components or class names. The load-bearing reasons are that the host owns the theme, so switching it repaints every extension without their help, and that extensions depend only on names, never on how the host builds its own UI.

## Decision

1. **The shell owns the theme and sets it as CSS variables** on the document root, prefixed `--gcscode-`. Extensions style with `var(--gcscode-…)` and hardcode no colour. The shell's own UI uses the same variables, whatever it is built with.
2. **The names follow VS Code's colour ids**, with the dot turned into a dash as VS Code does, wherever a VS Code id means the same thing. The first set:

   | Variable                                                                                         | Meaning                                                   |
   | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
   | `--gcscode-foreground`                                                                           | Default text                                              |
   | `--gcscode-descriptionForeground`                                                                | Secondary text: labels, units, hints                      |
   | `--gcscode-errorForeground`                                                                      | Error text                                                |
   | `--gcscode-focusBorder`                                                                          | Keyboard focus outline                                    |
   | `--gcscode-panel-background`, `--gcscode-panel-border`                                           | A view's body and the lines between panels                |
   | `--gcscode-widget-background`, `--gcscode-widget-border`                                         | Raised surfaces over a view: map controls, the quick pick |
   | `--gcscode-input-background`, `--gcscode-input-foreground`, `--gcscode-input-border`             | Text inputs                                               |
   | `--gcscode-button-background`, `--gcscode-button-foreground`, `--gcscode-button-hoverBackground` | Primary buttons                                           |
   | `--gcscode-list-hoverBackground`, `--gcscode-list-activeSelectionBackground`                     | Rows in lists and tables                                  |
   | `--gcscode-textLink-foreground`                                                                  | Links                                                     |
   | `--gcscode-statusBar-background`, `--gcscode-statusBar-foreground`                               | The status bar, for status items that draw a background   |
   | `--gcscode-level-green`, `--gcscode-level-amber`, `--gcscode-level-red`                          | The three status levels                                   |
   | `--gcscode-font-family`, `--gcscode-font-size`                                                   | Body text                                                 |
   | `--gcscode-monospace-font-family`                                                                | Numbers and raw values that must not shift as they change |

   Two names diverge from VS Code. `widget-background` drops VS Code's `editorWidget` prefix and `monospace-font-family` replaces `editor-font-family`, because gcscode has no editor. The three levels have no VS Code counterpart: they are the green, amber and red of the [vehicle status contract](../specs/2026-11-19-vehicle-status-contract.md), and any feature that shows a level uses them.

3. **The names are API.** `@gcscode/extension-api` exports them as `themeColorVariables`, a readonly array, and its README lists them with their meanings. Adding a name is additive. Renaming or removing one is a breaking change to the extension API.
4. **One dark theme for now.** Body text and secondary text meet WCAG AA contrast (4.5:1) on both background variables, and each level colour meets 3:1 against them. A level is never shown by colour alone; it always has a label or a shape beside it.
5. **Extensions get variables only**, no shell components and no utility classes. The shell is free to build its own UI with Tailwind or a component library such as shadcn-svelte, which is itself built on CSS variables and can map onto these.

## Consequences

- Every view that hardcodes a colour moves to the variables, in follow-up PRs, one per extension area. The map controls the host renders do too.
- An extension cannot add colours of its own the way VS Code's `contributes.colors` allows, and there is no spacing variable, as VS Code has none. Both are parked in [`docs/out-of-scope.md`](../out-of-scope.md) with triggers below.
- A light or high-contrast theme later changes only the shell's values, plus a theme-kind attribute on the root like VS Code's `vscode-dark` body class, if extensions turn out to need one.
- When the shell's variables ship, `docs/out-of-scope.md` drops "Theme tokens / CSS-variable system for extension styling" and gains two entries:
  - **Extension-contributed theme colours** (VS Code's `contributes.colors`). _Trigger to revisit:_ an extension needs a colour with its own meaning that none of the shell's names covers.
  - **Theme switching (light, high contrast) and a theme-kind attribute.** _Trigger to revisit:_ an operator needs a light or high-contrast theme, such as for sunlight.
- In the same PR, `docs/vs-code-alignment.md`: the "Theme tokens / CSS-variable system for extension styling" row moves from deferred to aligned, citing this ADR, and the two name divergences of Decision 2 get a Divergences row.
