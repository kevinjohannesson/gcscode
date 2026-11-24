import type { ThemeVariable } from '@gcscode/extension-api';

/**
 * The one theme (ADR-0017): neutral dark greys so telemetry, map and video
 * stand out, with colour kept for focus, links, buttons and the alert levels.
 * `Record<ThemeVariable, string>` makes a missing or unknown name a type error.
 */
export const darkTheme: Readonly<Record<ThemeVariable, string>> = {
  '--gcscode-foreground': '#cccccc',
  '--gcscode-descriptionForeground': '#a6a6a6',
  '--gcscode-errorForeground': '#f48771',
  '--gcscode-focusBorder': '#0078d4',
  '--gcscode-panel-background': '#1f1f1f',
  '--gcscode-panel-border': '#2b2b2b',
  '--gcscode-widget-background': '#252526',
  '--gcscode-widget-border': '#3c3c3c',
  '--gcscode-widget-shadow': 'rgba(0, 0, 0, 0.36)',
  '--gcscode-toolbar-hoverBackground': '#333333',
  '--gcscode-toolbar-activeBackground': '#3e3e3e',
  '--gcscode-input-background': '#313131',
  '--gcscode-input-foreground': '#cccccc',
  '--gcscode-input-border': '#3c3c3c',
  '--gcscode-button-background': '#0e639c',
  '--gcscode-button-foreground': '#ffffff',
  '--gcscode-button-hoverBackground': '#1177bb',
  '--gcscode-list-hoverBackground': '#2a2d2e',
  '--gcscode-list-activeSelectionBackground': '#1e3a52',
  '--gcscode-textLink-foreground': '#4daafc',
  '--gcscode-statusBar-background': '#181818',
  '--gcscode-statusBar-foreground': '#cccccc',
  '--gcscode-level-warning': '#f85149',
  '--gcscode-level-caution': '#d29922',
  '--gcscode-level-normal': '#3fb950',
  '--gcscode-font-family':
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  '--gcscode-font-size': '13px',
  '--gcscode-monospace-font-family':
    'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
};

/**
 * Writes every theme variable onto `root`. `main.ts` calls it on the document
 * root before any extension activates, so no view reads an empty variable.
 */
export function applyTheme(
  root: HTMLElement,
  theme: Readonly<Record<ThemeVariable, string>> = darkTheme,
): void {
  for (const [name, value] of Object.entries(theme)) {
    root.style.setProperty(name, value);
  }
  root.style.colorScheme = 'dark';
}
