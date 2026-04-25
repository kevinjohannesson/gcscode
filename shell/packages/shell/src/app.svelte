<script lang="ts">
  import type { Registry } from './plugin-host/registry';

  let { registry }: { registry: Registry } = $props();

  const views = $derived(registry.listViews());
</script>

<main class="shell">
  <header class="shell__header">GCScode</header>
  <section class="shell__content">
    {#if views.length === 0}
      <p data-testid="empty-state">No plugins registered.</p>
    {:else}
      {#each views as { id, component: Component } (id)}
        <Component />
      {/each}
    {/if}
  </section>
</main>
