<script lang="ts">
  import type { Registry } from './extension-host/registry';

  let { registry }: { registry: Registry } = $props();

  const views = $derived(registry.listViews());
  const statusBarItems = $derived(registry.listStatusBarItems());
  const leftStatus = $derived(statusBarItems.filter((i) => i.alignment === 'left'));
  const rightStatus = $derived(statusBarItems.filter((i) => i.alignment === 'right'));
</script>

<main class="shell">
  <header class="shell__header">GCScode</header>
  <section class="shell__content">
    {#if views.length === 0}
      <p data-testid="empty-state">No extensions registered.</p>
    {:else}
      {#each views as { id, component: Component } (id)}
        <Component />
      {/each}
    {/if}
  </section>
  <footer
    class="shell__statusbar flex items-center justify-between border-t border-neutral-300 px-3 py-1 text-xs"
    data-testid="statusbar"
  >
    <div
      class="shell__statusbar-side shell__statusbar-side--left flex items-center gap-3"
      data-testid="statusbar-left"
    >
      {#each leftStatus as { id, component: Component } (id)}
        <Component />
      {/each}
    </div>
    <div
      class="shell__statusbar-side shell__statusbar-side--right flex items-center gap-3"
      data-testid="statusbar-right"
    >
      {#each rightStatus as { id, component: Component } (id)}
        <Component />
      {/each}
    </div>
  </footer>
</main>
