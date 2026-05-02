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

  // Click-outside-to-dismiss. We attach a global click listener while open;
  // if the click target is not inside the dialog, dismiss. Reattaching only
  // while open avoids paying for the listener when no panel is showing.
  $effect(() => {
    if (!open) return;
    function onDocumentClick(event: MouseEvent) {
      // Defensive: if the click's target was removed from the DOM during the
      // same synchronous event processing (e.g. picking a palette item closes
      // the palette, then this panel mounts; the original click's bubble can
      // reach this listener depending on input-dispatch timing), the click
      // belonged to a now-defunct element. Skip dismissal — this click did
      // NOT mean "click outside the panel".
      if (event.target instanceof Node && !event.target.isConnected) return;

      // Selector is tied to ExtensionsPanel's hard-coded aria-label. Broaden
      // this if a non-extensions panel ever renders with a different aria-label —
      // today there's only one consumer (the extensions panel).
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
