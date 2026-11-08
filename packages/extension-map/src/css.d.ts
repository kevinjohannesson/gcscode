// Side-effect CSS imports (e.g. `import 'maplibre-gl/dist/maplibre-gl.css'`)
// are processed by Vite at build time and inlined into the page bundle. This
// declaration teaches tsc/svelte-check that such imports are valid; without
// it, `pnpm check` errors on the maplibre stylesheet import in map-view.svelte.
declare module '*.css';
