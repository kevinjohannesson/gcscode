<script lang="ts">
  import { modalState } from '../modal-state.svelte';
  import QuickPick from './quick-pick.svelte';
  import { quickPickState } from './quick-pick-state.svelte';

  const open = $derived(quickPickState.current !== null);

  // Mirror open/close into the dispatcher's pause flag.
  $effect(() => {
    modalState.active = open;
  });

  // Click-outside-to-dismiss. We attach a global click listener while open;
  // if the click target is not inside the dialog, dismiss. Reattaching only
  // while open avoids paying for the listener when no quick pick is showing.
  $effect(() => {
    if (!open) return;
    function onDocumentClick(event: MouseEvent) {
      const dialog = document.querySelector('[role="dialog"][aria-label="Command palette"]');
      if (dialog === null) return;
      if (event.target instanceof Node && dialog.contains(event.target)) return;
      quickPickState.dismiss();
    }
    document.addEventListener('click', onDocumentClick);
    return () => document.removeEventListener('click', onDocumentClick);
  });
</script>

{#if open}
  <QuickPick />
{/if}
