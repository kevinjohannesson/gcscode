<script lang="ts">
  import Fuse from 'fuse.js';

  import type { ExtensionManager, ExtensionRecord } from '../extension-host/extension-manager';
  import { extensionsPanelState } from './extensions-panel-state.svelte';

  let { manager }: { manager: ExtensionManager } = $props();

  let query = $state('');
  let highlightIndex = $state(0);

  // The workbench is the sole entry in `main.ts`'s `builtIns` list, and a
  // record's manifest id is the only thing that identifies it as a built-in —
  // nothing on `ExtensionRecord` marks one.
  function isBuiltIn(record: ExtensionRecord): boolean {
    return record.manifest.id === 'workbench';
  }

  // Filter out the workbench (system extension; cannot be sensibly disabled —
  // disabling would lock the operator out of Ctrl+Shift+P + Ctrl+Shift+X).
  // Exception: a FAILED extension is always listed, built-ins included — a
  // failed workbench is the one failure that costs the operator the palette, so
  // hiding it would hide the only thing they need to see. Its row then carries
  // no Disable for the same reason the filter exists: disabling would clear the
  // `failure`, which would remove the status-bar indicator, which is the only
  // remaining way to open this panel once the workbench's own opener command
  // and keybinding are gone. The operator's exit would destroy their way back.
  const records = $derived(
    manager.listExtensions().filter((r) => !isBuiltIn(r) || r.failure !== undefined),
  );

  const fuse = $derived(
    new Fuse(records, {
      keys: ['manifest.displayName', 'manifest.description'],
      threshold: 0.4,
      ignoreLocation: true,
    }),
  );

  // Filtered + sorted list. Empty query → alphabetical by displayName. Non-empty
  // query → Fuse score order. Mirrors the palette's filter behavior.
  const filtered = $derived.by(() => {
    if (query.trim() === '') {
      return [...records].sort((a, b) =>
        a.manifest.displayName.localeCompare(b.manifest.displayName),
      );
    }
    return fuse.search(query).map((r) => r.item);
  });

  // Reset highlight when the FILTERED list changes (e.g. user types). Depends
  // on `filtered`, NOT `records` — toggling an extension's enabled state mutates
  // `records` (via the SvelteMap), but the same row should stay highlighted
  // through the toggle, not jump back to row 0. Mirrors quick-pick.svelte.
  $effect(() => {
    void filtered;
    highlightIndex = 0;
  });

  function toggle(record: ExtensionRecord) {
    // A failed built-in's row offers no Disable (see the `records` comment), but
    // the row is also reachable by keyboard — Enter toggles whatever is
    // highlighted. The guard therefore lives here, where the button path and the
    // Enter path meet, rather than only on the button that isn't rendered.
    if (record.failure !== undefined && isBuiltIn(record)) return;
    void manager.setEnabled(record.manifest.id, !record.enabled);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      const item = filtered[highlightIndex];
      if (item !== undefined) toggle(item);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      extensionsPanelState.close();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      if (filtered.length > 0) {
        highlightIndex = (highlightIndex + 1) % filtered.length;
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      if (filtered.length > 0) {
        highlightIndex = (highlightIndex - 1 + filtered.length) % filtered.length;
      }
    }
  }

  function onButtonClick(event: MouseEvent, record: ExtensionRecord) {
    event.stopPropagation();
    toggle(record);
  }
</script>

<div
  class="fixed left-1/2 top-16 z-50 w-[520px] -translate-x-1/2 overflow-hidden rounded-md border border-neutral-700 bg-neutral-800 shadow-2xl"
  role="dialog"
  aria-label="Extensions"
>
  <div
    class="border-b border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs uppercase tracking-wider text-neutral-400"
  >
    Extensions
  </div>
  {#if records.length === 0}
    <div class="px-3 py-6 text-center text-sm text-neutral-400">No extensions installed.</div>
  {:else}
    <!-- svelte-ignore a11y_autofocus -->
    <input
      type="text"
      bind:value={query}
      onkeydown={onKeyDown}
      placeholder="Search extensions…"
      class="w-full border-none bg-neutral-700 px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-400"
      autofocus
    />
    {#if filtered.length === 0}
      <div class="px-3 py-4 text-center text-sm text-neutral-400">No matching extensions.</div>
    {:else}
      <ul class="max-h-96 overflow-y-auto">
        {#each filtered as record, i (record.manifest.id)}
          <li
            class="border-b border-neutral-700 last:border-b-0"
            class:opacity-60={!record.enabled}
            class:bg-blue-900={i === highlightIndex}
          >
            <div
              class="flex items-start gap-3 px-3 py-2.5"
              role="presentation"
              onmouseenter={() => (highlightIndex = i)}
            >
              <div class="min-w-0 flex-1">
                <div class="flex items-baseline gap-2">
                  <strong class="text-sm text-neutral-100">{record.manifest.displayName}</strong>
                  <span class="text-xs text-neutral-400">v{record.manifest.version}</span>
                </div>
                {#if record.manifest.description}
                  <div class="mt-0.5 text-xs text-neutral-300">{record.manifest.description}</div>
                {/if}
                {#if record.failure !== undefined}
                  <div class="mt-1 text-xs text-red-300" data-testid="extension-failure">
                    Failed to activate: {record.failure.message}
                  </div>
                  <div class="mt-0.5 text-xs text-neutral-400">
                    <!-- A built-in's row has no Disable, so its hint must not name one. -->
                    {#if isBuiltIn(record)}
                      Reload the app to retry.
                    {:else}
                      Reload the app to retry; disabling stops it from being retried.
                    {/if}
                  </div>
                {/if}
              </div>
              {#if record.failure !== undefined && isBuiltIn(record)}
                <!-- Informational row only: no action. See the `records` filter comment. -->
              {:else if record.enabled}
                <button
                  type="button"
                  class="flex-shrink-0 rounded border border-neutral-500 bg-neutral-700 px-3 py-1 text-xs text-neutral-200"
                  onclick={(event) => onButtonClick(event, record)}
                >
                  Disable
                </button>
              {:else}
                <button
                  type="button"
                  class="flex-shrink-0 rounded border border-blue-600 bg-blue-700 px-3 py-1 text-xs text-white"
                  onclick={(event) => onButtonClick(event, record)}
                >
                  Enable
                </button>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>
