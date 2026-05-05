<script lang="ts">
  import { DockviewSvelte, type DockviewApi, type DockviewReadyEvent } from 'dockview-svelte';
  import EditorPanel from './panels/editor-panel.svelte';
  import OutputPanel from './panels/output-panel.svelte';
  import SidePanel from './panels/side-panel.svelte';

  let api: DockviewApi | undefined = $state();
  let panelCounter = 1;

  function onReady(event: DockviewReadyEvent) {
    api = event.api;

    // Initial layout: editor and output stacked in one group, side split right.
    event.api.addPanel({
      id: 'editor-1',
      component: 'editor',
      params: { fileName: 'a.ts', revision: 1 },
    });
    event.api.addPanel({
      id: 'output-1',
      component: 'output',
      position: { referencePanel: 'editor-1', direction: 'within' },
    });
    event.api.addPanel({
      id: 'side-1',
      component: 'side',
      position: { referencePanel: 'editor-1', direction: 'right' },
    });
  }

  function addPanel() {
    if (!api) return;
    panelCounter++;
    api.addPanel({
      id: `editor-${panelCounter}`,
      component: 'editor',
      params: { fileName: `file-${panelCounter}.ts`, revision: 1 },
    });
  }

  function updateActivePanel() {
    if (!api) return;
    const active = api.activePanel;
    if (!active) {
      console.warn('no active panel');
      return;
    }
    active.api.updateParameters({ revision: Date.now() });
  }

  function popoutGroup() {
    if (!api) return;
    const group = api.activeGroup;
    if (!group) {
      console.warn('no active group');
      return;
    }
    api.addPopoutGroup(group);
  }

  function saveLayout() {
    if (!api) return;
    const json = api.toJSON();
    console.log('layout:', JSON.stringify(json, null, 2));
  }

  function loadLayout() {
    if (!api) return;
    const text = window.prompt('Paste layout JSON');
    if (!text) return;
    try {
      const parsed = JSON.parse(text);
      api.fromJSON(parsed);
    } catch (err) {
      console.error('failed to load layout', err);
    }
  }
</script>

<div class="layout">
  <div class="toolbar">
    <button data-testid="btn-add" onclick={addPanel}>Add panel</button>
    <button data-testid="btn-update" onclick={updateActivePanel}>Update active panel</button>
    <button data-testid="btn-popout" onclick={popoutGroup}>Pop out group</button>
    <button data-testid="btn-save" onclick={saveLayout}>Save layout</button>
    <button data-testid="btn-load" onclick={loadLayout}>Load layout</button>
  </div>
  <div class="dock">
    <DockviewSvelte
      components={{ editor: EditorPanel, output: OutputPanel, side: SidePanel }}
      {onReady}
    />
  </div>
</div>

<style>
  .layout {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .toolbar {
    padding: 0.5rem;
    background: #1e1e1e;
    border-bottom: 1px solid #333;
    display: flex;
    gap: 0.5rem;
  }
  .toolbar button {
    background: #0e639c;
    color: white;
    border: none;
    padding: 0.4rem 0.8rem;
    border-radius: 3px;
    cursor: pointer;
    font-size: 0.85rem;
  }
  .toolbar button:hover {
    background: #1177bb;
  }
  .dock {
    flex: 1;
    min-height: 0;
  }
</style>
