import type { DockviewTheme } from 'dockview-svelte';

/**
 * Dockview's dark theme for its layout variables (tab height, sash sizes),
 * with `dockview-theme-gcscode` (app.css) mapping its colours onto the theme
 * variables. Without a theme, dockview 6 falls back to its deep-blue Abyss.
 */
export const gcscodeDockviewTheme: DockviewTheme = {
  name: 'gcscode',
  className: 'dockview-theme-dark dockview-theme-gcscode',
  colorScheme: 'dark',
};
