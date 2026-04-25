<script lang="ts">
  import type { Registry } from './plugin-host/registry';

  let { registry }: { registry: Registry } = $props();

  const contributions = $derived(registry.listContributions('content'));
</script>

<main class="shell">
  <header class="shell__header">GCScode</header>
  <section class="shell__content">
    {#if contributions.length === 0}
      <p data-testid="empty-state">No plugins registered.</p>
    {:else}
      {#each contributions as { component: Component }, index (index)}
        <Component />
      {/each}
    {/if}
  </section>
</main>
