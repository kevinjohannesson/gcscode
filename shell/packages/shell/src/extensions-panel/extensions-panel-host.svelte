<script lang="ts">
  import { modalState } from '../modal-state.svelte';
  import type { ExtensionManager } from '../extension-host/extension-manager';
  import ExtensionsPanel from './extensions-panel.svelte';
  import { extensionsPanelState } from './extensions-panel-state.svelte';

  let { manager }: { manager: ExtensionManager } = $props();

  const open = $derived(extensionsPanelState.isOpen);

  // Mirror open/close into the dispatcher's pause flag.
  $effect(() => {
    modalState.active = open;
  });

  // Click-outside-to-dismiss. Selector is tied to ExtensionsPanel's hard-coded
  // aria-label.
  $effect(() => {
    if (!open) return;
    function onDocumentClick(event: MouseEvent) {
      const dialog = document.querySelector('[role="dialog"][aria-label="Extensions"]');
      if (dialog === null) return;
      if (event.target instanceof Node && dialog.contains(event.target)) return;
      extensionsPanelState.close();
    }
    document.addEventListener('click', onDocumentClick);
    return () => document.removeEventListener('click', onDocumentClick);
  });
</script>

{#if open}
  <ExtensionsPanel {manager} />
{/if}
