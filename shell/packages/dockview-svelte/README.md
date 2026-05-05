# dockview-svelte

A Svelte 5 binding package for [`dockview-core`](https://www.npmjs.com/package/dockview-core), structured as a sibling to upstream's `dockview-react` / `dockview-vue` / `dockview-angular` adapters.

## Status

Lives in the gcscode monorepo as `packages/dockview-svelte` for now; eventually publishable as a standalone npm package.

## Usage

```svelte
<script lang="ts">
  import { DockviewSvelte, type IDockviewPanelProps, type DockviewReadyEvent } from 'dockview-svelte';
  import 'dockview-core/dist/styles/dockview.css';
  import EditorPanel from './editor-panel.svelte';
  import OutputPanel from './output-panel.svelte';

  function onReady(event: DockviewReadyEvent) {
    event.api.addPanel({ id: 'editor-1', component: 'editor', params: { fileName: 'a.ts' } });
    event.api.addPanel({ id: 'output-1', component: 'output' });
  }
</script>

<DockviewSvelte
  components={{ editor: EditorPanel, output: OutputPanel }}
  {onReady}
/>
```

A panel component is just a Svelte component:

```svelte
<script lang="ts">
  import type { IDockviewPanelProps } from 'dockview-svelte';
  let { params, api, containerApi }: IDockviewPanelProps<{ fileName: string }> = $props();
</script>

<div>{params.fileName}</div>
```

## Scripts

- `pnpm --filter dockview-svelte test` — run the test suite.
- `pnpm --filter dockview-svelte check` — type-check the package.
- `pnpm --filter dockview-svelte demo` — run the local demo on port 5174.
