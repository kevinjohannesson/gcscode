# ADR-0017: Theme colours are CSS variables

**Date:** 2026-11-24
**Status:** Proposed

## Context

Nothing in gcscode agrees on what the background is. The shell's header and status bar use light Tailwind greys, dockview draws its panels in its own dark theme, and each view hardcodes its own hex values: the MAVLink views assume a dark panel with `#ddd` text, the map controls assume a light one with `#333`. Put together, text disappears on its background, and the app is hard to read for the operator it is built for.

[`docs/out-of-scope.md`](../out-of-scope.md) parked theme tokens with a trigger: "the parallel UI brainstorm landing on a documented design system that wants extension reach. When triggered, follow VS Code's pattern: CSS variables only, no component/utility classes." Making the app presentable is that trigger: every view's colours are what is broken, and most views live in extensions.

VS Code gives every theme colour an id, such as `editor.background` or `descriptionForeground` ([theme colour reference](https://code.visualstudio.com/api/references/theme-color)). Its theme service holds the active theme's values and writes each one into extension-rendered documents as a CSS variable, `--vscode-editor-background` ([theming webview content](https://code.visualstudio.com/api/extension-guides/webview#theming-webview-content)), together with `--vscode-font-family`, `--vscode-font-size` and `--vscode-editor-font-family`. Code that paints outside CSS reads the theme through `window.activeColorTheme` and `onDidChangeActiveColorTheme`. Extensions never get VS Code's own components or class names. The load-bearing reasons are that the host owns the theme, so switching it repaints extensions without their help, and that extensions depend only on names, never on how the host builds its own UI.

[ADR-0012](ADR-0012-service-extensions-vs-host-namespaces.md) lists themes as a platform concern, landing as a `host.*` method, a new namespace ([ADR-0006](ADR-0006-extensionhost-namespacing.md)) or an `ExtensionContext` field. Theme colours pass ADR-0012's ownership test: only the host can own the surface they style. What this ADR adds is the first theme capability, fixed names that extensions read through CSS with no call. That needs no `host.*` method yet, as VS Code's own `ThemeColor` is a top-level export and not a namespace method. The first call arrives on `host.window` with the first capability that needs one: reading or following the active theme (Consequences).

## Decision

1. **The shell owns the theme and sets it as CSS variables** on the document root, prefixed `--gcscode-`. The values live in one shell module, which writes them to the root in `main.ts` before any extension activates, so a variable never reads empty, and a later webview or theme API reads the same source. Extension chrome (backgrounds, borders, text, controls) uses `var(--gcscode-…)` and hardcodes no colour. The shell's own UI uses the same variables, whatever it is built with.
2. **Only the shell declares `--gcscode-*` properties or anything on `:root`.** An extension never redefines them, so one extension cannot re-theme the others, and a disabled extension's stylesheet cannot leave a theme behind.
3. **An extension's own colours stay its own.** A colour with a meaning the shell's names don't cover, such as the flight overlay's armed, home and max-distance colours, is declared once by the extension: as a custom property on an element it renders, prefixed with the extension's slug, its id without `gcscode.`, and never `--gcscode-` (`--mavlink-flight-overlay-armed`), or as a named constant in script. Picture content, such as the video letterbox, map tiles and camera frames, is not chrome and is exempt. Colour set in script, such as a MapLibre paint property, which takes no `var()`, reads a theme variable from the root's computed style once when it mounts, never per frame. Following a theme change there is deferred with theme switching.
4. **The names follow VS Code's colour ids**, with the dot turned into a dash as VS Code does, wherever a VS Code id means the same thing. The first set:

   | Variable                                                                                         | Meaning                                                          |
   | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
   | `--gcscode-foreground`                                                                           | Default text                                                     |
   | `--gcscode-descriptionForeground`                                                                | Secondary text: labels, units, hints                             |
   | `--gcscode-errorForeground`                                                                      | Error text                                                       |
   | `--gcscode-focusBorder`                                                                          | Keyboard focus outline                                           |
   | `--gcscode-panel-background`, `--gcscode-panel-border`                                           | A view's body and the lines between panels                       |
   | `--gcscode-widget-background`, `--gcscode-widget-border`, `--gcscode-widget-shadow`              | Raised surfaces over a view: map controls, the quick pick        |
   | `--gcscode-toolbar-hoverBackground`, `--gcscode-toolbar-activeBackground`                        | Icon buttons, such as the map controls, when hovered and pressed |
   | `--gcscode-input-background`, `--gcscode-input-foreground`, `--gcscode-input-border`             | Text inputs                                                      |
   | `--gcscode-button-background`, `--gcscode-button-foreground`, `--gcscode-button-hoverBackground` | Primary buttons                                                  |
   | `--gcscode-list-hoverBackground`, `--gcscode-list-activeSelectionBackground`                     | Rows in lists and tables                                         |
   | `--gcscode-textLink-foreground`                                                                  | Links                                                            |
   | `--gcscode-statusBar-background`, `--gcscode-statusBar-foreground`                               | The status bar and the text of status items                      |
   | `--gcscode-level-warning`, `--gcscode-level-caution`, `--gcscode-level-normal`                   | Alert levels: red, amber, green                                  |
   | `--gcscode-font-family`, `--gcscode-font-size`                                                   | Body text                                                        |
   | `--gcscode-monospace-font-family`                                                                | Numbers and raw values that must not shift as they change        |

   Three names diverge from VS Code. `widget-background` drops VS Code's `editorWidget` prefix and `monospace-font-family` replaces `editor-font-family`, because gcscode has no editor. The levels are named by role, as VS Code names `editorError.foreground` and `editorWarning.foreground`, but as one platform-wide set rather than per area, because a ground station's alert levels mean the same in every view. Their names follow aviation's warning, caution and normal. A feature still defines its own levels ([ADR-0014](ADR-0014-protocols-as-languages.md) Decision 2) and maps them onto these colours: vehicle status's red, amber and green are warning, caution and normal. **The level colours mean a level and nothing else**: no extension colour, per-vehicle colours included, uses them for another meaning, so a red on screen is always a warning. A level beyond these three, such as roadmap N3's advisory, gets a name and a colour of its own, never red or green; that is an additive change.

5. **The names are API, and a check enforces them.** `@gcscode/extension-api` exports them `as const` as `themeVariables`, with a `ThemeVariable` union type, and its README lists them with their meanings. A shell test asserts that the shell declares every entry and nothing else under `--gcscode-`. A repo test reads every custom-property name (`--…`) under `packages/extension-*/src`, in CSS and in script alike, and asserts that each is either an entry or carries that extension's own slug prefix, and that no extension declares a `--gcscode-*` property, styles `:root` or writes `document.documentElement.style`. Adding a name is additive. Renaming or removing one is a breaking change, which those tests make visible.
6. **One dark theme for now, with contrast checked.** Each pair below meets WCAG AA 4.5:1 for text, and each level colour meets 3:1 against every background it is drawn on. A shell test computes each pair from the theme module's values:
   - `foreground`, `descriptionForeground` and `errorForeground` on `panel-background`, `widget-background`, `list-hoverBackground` and `list-activeSelectionBackground`;
   - `textLink-foreground` on `panel-background`, and `foreground` on `toolbar-hoverBackground` and `toolbar-activeBackground`;
   - `input-foreground` on `input-background`, `button-foreground` on `button-background` and `button-hoverBackground`, `statusBar-foreground` on `statusBar-background`;
   - `focusBorder` and the three level colours, at 3:1, on `panel-background`, `widget-background` and `statusBar-background`, and the level colours also on the two list backgrounds.

   The list is closed: a view that draws text, a focus outline or a level on another background adds that pair to the test.

   A level is never shown by colour alone; it always has a label or a shape beside it.

7. **Extensions get variables only**, no shell components and no utility classes. The shell is free to build its own UI with Tailwind or a component library such as shadcn-svelte. shadcn-svelte declares unprefixed variables such as `--background`; if the shell adopts it, those map onto the `--gcscode-*` values and are not API, and the repo test of Decision 5 flags an extension that reads them.

## Consequences

- Every view's chrome moves to the variables, in follow-up PRs, one per extension area. The map extension's controls use the widget and toolbar names. The flight overlay keeps its domain colours under Decision 3, and its armed green and max-distance red move off the level colours.
- Extensions render into the shell's own document, not a sandboxed webview, so a shell utility class can still style extension markup. Decision 7 makes that off-limits, and review catches it; no check does.
- An extension cannot add colours to the theme the way VS Code's `contributes.colors` allows, and colour set in script does not follow a theme change. Neither matters while there is one theme. There is no spacing variable, as VS Code has none; spacing and type are a later pass.
- When the shell's variables ship, that PR also makes these edits:
  - `docs/out-of-scope.md` drops "Theme tokens / CSS-variable system for extension styling", and "Event bus, themes, i18n" drops themes, pointing here. It gains:
    - **Extension-contributed theme colours** (VS Code's `contributes.colors`). _Trigger to revisit:_ a second theme, since a domain colour then needs a value per theme.
    - **Theme switching (light, high contrast), and following it outside CSS.** The shell writes another set of values; `host.window` gains `activeColorTheme` and `onDidChangeActiveColorTheme`, as VS Code has, for colour set in script, and that iteration decides whether the theme object carries the values (a divergence, as VS Code's carries only its kind) or script re-reads the root when the event fires; the root gets a theme-kind attribute like VS Code's `vscode-dark`. _Trigger to revisit:_ an operator needs a light or high-contrast theme, such as for sunlight.
    - **Theme variables in webviews.** The host injects the same names into each webview's document and keeps them current, as VS Code does. _Trigger to revisit:_ the webview wing iteration.
  - "Hover / active state customization on declarative controls" stays deferred: the toolbar names theme the host-rendered button, but an extension still cannot give one control a different state colour.
  - `docs/vs-code-alignment.md`: the theme tokens row moves from deferred to aligned, citing this ADR; the three name divergences of Decision 4 get a Divergences row; the three new deferrals get Deferrals rows.
  - `docs/roadmap.md`'s C4+ line, the boundary-rule corollary in `CLAUDE.md` and the `ExtensionHost` doc comment in `packages/extension-api/src/index.ts` say that theme colours landed as CSS variables (this ADR) and the first theme call comes with theme switching, on `host.window`.
  - ADR-0006 and ADR-0012 each get a pointer note to this ADR where they say themes land as a namespace.
  - Roadmap N3's "warning, caution and advisory in red, amber and green" gives the advisory a colour of its own, per Decision 4.
