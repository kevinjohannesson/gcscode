<script lang="ts">
  import type { IDockviewPanelProps } from 'dockview-svelte';

  // Demonstrates pitfall #2: $state-backed reactive props. params.fileName
  // and params.revision update reactively when panel.api.updateParameters
  // is called — no remount, no manual subscriptions.
  type EditorParams = { fileName?: string; revision?: number };
  let { params }: IDockviewPanelProps<EditorParams> = $props();
</script>

<div class="panel">
  <h3>Editor</h3>
  <p>file: <code data-testid="filename">{params.fileName ?? '(no file)'}</code></p>
  <p>revision: <code data-testid="revision">{params.revision ?? 0}</code></p>
</div>

<style>
  .panel {
    padding: 1rem;
    height: 100%;
    box-sizing: border-box;
    background: #2d2d30;
    color: #f0f0f0;
  }
  h3 {
    margin: 0 0 0.75rem 0;
  }
  code {
    background: #1e1e1e;
    padding: 0.1rem 0.4rem;
    border-radius: 3px;
  }
</style>
