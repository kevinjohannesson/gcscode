<script lang="ts">
  import { DockviewSvelte, type DockviewApi, type DockviewReadyEvent } from 'dockview-svelte';
  import type { Registry } from './extension-host/registry';
  import type { ExtensionManager } from './extension-host/extension-manager';
  import QuickPickHost from './quick-pick/quick-pick-host.svelte';
  import ExtensionsPanelHost from './extensions-panel/extensions-panel-host.svelte';
  import ViewHost from './dockview-host/view-host.svelte';
  import GcscodeTab from './dockview-host/gcscode-tab.svelte';
  import EmptyStateWatermark from './dockview-host/empty-state-watermark.svelte';

  let { registry, manager }: { registry: Registry; manager: ExtensionManager } = $props();

  const views = $derived(registry.listViews());
  const statusBarItems = $derived(registry.listStatusBarItems());
  const leftStatus = $derived(statusBarItems.filter((i) => i.alignment === 'left'));
  const rightStatus = $derived(statusBarItems.filter((i) => i.alignment === 'right'));

  let dockviewApi: DockviewApi | undefined = $state(undefined);

  function handleReady(event: DockviewReadyEvent) {
    dockviewApi = event.api;
  }

  $effect(() => {
    if (!dockviewApi) return;
    const desired = new Map(views.map((v) => [v.id, v]));
    const current = new Map(dockviewApi.panels.map((p) => [p.id, p]));

    for (const [id, panel] of current) {
      if (!desired.has(id)) {
        dockviewApi.removePanel(panel);
      }
    }

    for (const [id, view] of desired) {
      const existing = current.get(id);
      if (!existing) {
        dockviewApi.addPanel({
          id,
          component: 'view-host',
          title: view.title,
          params: { component: view.component },
        });
      } else if (existing.params?.['component'] !== view.component) {
        existing.api.updateParameters({ component: view.component });
      }
    }
  });
</script>

<main class="shell flex h-screen flex-col">
  <header class="shell__header">GCScode</header>
  <section class="shell__content min-h-0 flex-1">
    <DockviewSvelte
      components={{ 'view-host': ViewHost }}
      defaultTabComponent={GcscodeTab}
      watermarkComponent={EmptyStateWatermark}
      disableFloatingGroups={true}
      onReady={handleReady}
    />
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
  <QuickPickHost />
  <ExtensionsPanelHost {manager} />
</main>
