<script lang="ts">
  import type { ExtensionManager } from './extension-host/extension-manager';
  import { extensionsPanelState } from './extensions-panel/extensions-panel-state.svelte';
  import { modalState } from './modal-state.svelte';

  let { manager }: { manager: ExtensionManager } = $props();

  // Host-owned, deliberately NOT a status-bar contribution: the footer's
  // `{#each}` blocks render `registry.listStatusBarItems()`, so a contributed
  // indicator would be subject to the very activation failure it exists to
  // report. `app.svelte` renders this one directly from the manager instead.
  //
  // The count is every record carrying a `failure`, built-ins included — which
  // is exactly the set `extensions-panel.svelte` marks failed, because its
  // `workbench` filter carries a `failure !== undefined` exception. The two
  // surfaces therefore cannot disagree. Reactive because the manager's backing
  // map is a `SvelteMap`, so disabling a failed extension clears its `failure`
  // and drops the count without a reload.
  const failedCount = $derived(
    manager.listExtensions().filter((record) => record.failure !== undefined).length,
  );

  // Terse enough for a glance at peripheral vision during flight; the panel
  // carries the per-extension message.
  const summary = $derived(
    failedCount === 1 ? '1 extension failed' : `${failedCount} extensions failed`,
  );
  // The consequence an operator actually cares about, plus the way in. "may be
  // missing" rather than "are missing" is the honest form: the host cannot know
  // what the extension would have contributed had it got that far.
  const detail = $derived(
    `${summary} to start, so some features may be missing. Click for details.`,
  );

  function openPanel(): void {
    // `extensionsPanelState.open()` THROWS when the panel is already open or
    // another modal overlay is active, and a throw out of a click handler is an
    // uncaught error, so check first.
    //
    // What the operator sees in those two cases is not quite "nothing happens":
    // neither overlay has a backdrop, so this same click also reaches the
    // document-level click-outside listener in the open overlay's host. Clicking
    // while the panel is open therefore closes it (a serviceable toggle), and
    // clicking while the command palette is open dismisses the palette without
    // opening the panel. Both are the ordinary consequence of clicking outside
    // an open overlay; this guard's only job is to keep the handler from
    // throwing.
    if (extensionsPanelState.isOpen || modalState.active) return;
    extensionsPanelState.open();
  }
</script>

{#if failedCount > 0}
  <!-- Amber, not red: in a GCS red is the alarm color for flight-critical
       conditions, and an extension that failed to start is degraded-not-
       critical. Spending red here would either alarm the operator or train
       them to discount red. The glyph and the word "failed" carry the meaning
       without relying on color at all. -->
  <button
    type="button"
    class="cursor-pointer rounded px-1.5 py-0.5 text-xs text-amber-700 hover:bg-amber-100"
    data-testid="activation-failure-indicator"
    title={detail}
    onclick={openPanel}
  >
    <span aria-hidden="true">⚠</span>
    {summary}
  </button>
{/if}
