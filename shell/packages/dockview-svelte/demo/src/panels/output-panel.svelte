<script lang="ts">
  import { getDockviewContext, type IDockviewPanelProps } from 'dockview-svelte';

  // Demonstrates pitfall #3: context propagation via mount({ context: Map }).
  // When this panel is dragged into a popout window, dockview-core re-parents
  // the DOM into a new browser window — but the Svelte instance and its
  // context map survive intact, so getDockviewContext() still resolves.
  let { params: _params }: IDockviewPanelProps = $props();

  const ctx = getDockviewContext();
</script>

<div class="panel">
  <h3>Output</h3>
  <p>This panel reads <code>getDockviewContext()</code> in its &lt;script&gt;.</p>
  <p>
    container api id:
    <code data-testid="container-id">{ctx.containerApi.id ?? '(none)'}</code>
  </p>
  <p>
    panel api id:
    <code>{ctx.api.id}</code>
  </p>
</div>

<style>
  .panel {
    padding: 1rem;
    height: 100%;
    box-sizing: border-box;
    background: #252526;
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
