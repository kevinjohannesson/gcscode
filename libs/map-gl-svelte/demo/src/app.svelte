<script lang="ts">
  import CameraPage from './pages/camera.svelte';
  import ControlsPage from './pages/controls.svelte';
  import CustomControlPage from './pages/custom-control.svelte';
  import LayersPage from './pages/layers.svelte';
  import MarkersPage from './pages/markers.svelte';

  const pages = [
    { id: 'camera', title: 'Camera', component: CameraPage },
    { id: 'layers', title: 'Source and layers', component: LayersPage },
    { id: 'markers', title: 'Markers and popups', component: MarkersPage },
    { id: 'controls', title: 'Controls', component: ControlsPage },
    { id: 'custom-control', title: 'Custom control', component: CustomControlPage },
  ];

  // The page lives in the URL hash, so each one can be opened (and reloaded) directly.
  function pageFromHash(): string {
    const id = window.location.hash.slice(1);
    return pages.some((page) => page.id === id) ? id : pages[0].id;
  }

  let currentId = $state(pageFromHash());
  const Current = $derived(pages.find((page) => page.id === currentId)!.component);
</script>

<svelte:window onhashchange={() => (currentId = pageFromHash())} />

<div class="layout">
  <nav>
    <strong>map-gl-svelte</strong>
    {#each pages as page (page.id)}
      <button
        type="button"
        class:active={page.id === currentId}
        onclick={() => (window.location.hash = page.id)}
      >
        {page.title}
      </button>
    {/each}
  </nav>
  <main>
    <Current />
  </main>
</div>

<style>
  .layout {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  nav {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: #18181b;
    color: #fafafa;
  }
  nav strong {
    margin-right: 12px;
  }
  nav button {
    padding: 4px 10px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  nav button:hover {
    background: #3f3f46;
  }
  nav button.active {
    background: #fafafa;
    color: #18181b;
  }
  main {
    flex: 1;
    min-height: 0;
  }
</style>
