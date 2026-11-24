<script lang="ts">
  import Fuse from 'fuse.js';

  import { WORKBENCH_EXTENSION_ID } from '../built-in/workbench';
  import type { ExtensionManager, ExtensionRecord } from '../extension-host/extension-manager';
  import { extensionsPanelState } from './extensions-panel-state.svelte';

  let { manager }: { manager: ExtensionManager } = $props();

  let query = $state('');
  let highlightIndex = $state(0);
  let dialog: HTMLDivElement | undefined = $state();
  let input: HTMLInputElement | undefined = $state();

  // Focus the search box on open, or the panel itself when there is nothing to
  // search, so Escape always reaches `onKeyDown`. Not the `autofocus`
  // attribute: Svelte only honours it while nothing else has focus, and a click
  // anywhere in the layout leaves focus on a dockview tab or view.
  $effect(() => {
    (input ?? dialog)?.focus();
  });

  // Keep focus in the search box when a row or its Enable/Disable button is
  // clicked. A focused button is replaced when it flips between Enable and
  // Disable, which dropped focus to the page: the arrow keys and Escape then
  // stopped working, and with the dispatcher paused so did Ctrl+Shift+P.
  function keepFocusInInput(event: MouseEvent) {
    if (input !== undefined && event.target !== input) event.preventDefault();
  }

  // The workbench is the sole entry in `main.ts`'s `builtIns` list, and a
  // record's manifest id is the only thing that identifies it as a built-in —
  // nothing on `ExtensionRecord` marks one.
  function isBuiltIn(record: ExtensionRecord): boolean {
    return record.manifest.id === WORKBENCH_EXTENSION_ID;
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

  // The handler sits on the dialog so Escape closes the panel from anywhere in
  // it. Enter and the arrows act on the highlighted row only from the search
  // box or the dialog itself: on a focused Enable/Disable button, Enter is that
  // button's own press, for that button's row.
  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Escape' && event.target !== input && event.target !== dialog) return;
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
  bind:this={dialog}
  class="fixed left-1/2 top-7 z-50 w-[520px] -translate-x-1/2 overflow-hidden rounded-b-md border border-t-0 border-widget-border bg-widget shadow-[0_8px_24px_var(--gcscode-widget-shadow)] outline-none"
  role="dialog"
  aria-label="Extensions"
  tabindex="-1"
  onkeydown={onKeyDown}
  onmousedown={keepFocusInInput}
>
  <div
    class="border-b border-widget-border bg-panel px-3 py-1.5 text-xs uppercase tracking-wider text-fg-muted"
  >
    Extensions
  </div>
  {#if records.length === 0}
    <div class="px-3 py-6 text-center text-sm text-fg-muted">No extensions installed.</div>
  {:else}
    <input
      type="text"
      bind:this={input}
      bind:value={query}
      placeholder="Search extensions…"
      class="w-full border-none bg-input px-3 py-2 text-sm text-input-fg outline-none placeholder:text-fg-muted"
    />
    {#if filtered.length === 0}
      <div class="px-3 py-4 text-center text-sm text-fg-muted">No matching extensions.</div>
    {:else}
      <ul class="max-h-96 overflow-y-auto">
        {#each filtered as record, i (record.manifest.id)}
          <li
            class="border-b border-widget-border last:border-b-0"
            class:opacity-60={!record.enabled}
            class:bg-list-active={i === highlightIndex}
          >
            <div
              class="flex items-start gap-3 px-3 py-2.5"
              role="presentation"
              onmouseenter={() => (highlightIndex = i)}
            >
              <div class="min-w-0 flex-1">
                <div class="flex items-baseline gap-2">
                  <strong class="text-sm text-fg">{record.manifest.displayName}</strong>
                  <span class="text-xs text-fg-muted">v{record.manifest.version}</span>
                </div>
                {#if record.manifest.description}
                  <div class="mt-0.5 text-xs text-fg-muted" data-testid="extension-description">
                    {record.manifest.description}
                  </div>
                {/if}
                {#if record.failure !== undefined}
                  <!-- Amber, not red, and matching the status-bar indicator: the
                       severity belongs to the CONDITION, not to the surface
                       showing it, and an extension that didn't start is degraded
                       rather than flight-critical. In a GCS red is the alarm
                       color for flight-critical state, so spending it here would
                       train the operator to discount red. Red also made the same
                       fact look worse one click after the indicator reported it. -->
                  <div
                    class="mt-1 text-xs wrap-break-word text-caution"
                    data-testid="extension-failure"
                  >
                    Failed to start: {record.failure.message}
                  </div>
                  <div class="mt-0.5 text-xs text-fg-muted">
                    <!-- Reload is the only recovery path, and it is not free: it
                         restarts the whole app, so an operator mid-flight loses live
                         telemetry and video while it happens. Both branches say so,
                         because an operator who reloads without warning during a
                         flight is the worst outcome this panel can cause. Only the
                         non-built-in branch names disabling — that row is the only
                         one that offers it — and it says the stop is reversible
                         rather than reading as a permanent kill switch. -->
                    {#if isBuiltIn(record)}
                      Reload the app to try again — this interrupts live telemetry and video.
                    {:else}
                      Reload the app to try again — this interrupts live telemetry and video.
                      Disabling it stops the retries until you turn it back on.
                    {/if}
                  </div>
                {/if}
              </div>
              {#if record.failure !== undefined && isBuiltIn(record)}
                <!-- Informational row only: no action. See the `records` filter comment. -->
              {:else if record.enabled}
                <button
                  type="button"
                  class="flex-shrink-0 rounded border border-widget-border bg-toolbar-hover px-3 py-1 text-xs text-fg"
                  onclick={(event) => onButtonClick(event, record)}
                >
                  Disable
                </button>
              {:else}
                <button
                  type="button"
                  class="flex-shrink-0 rounded border border-button bg-button px-3 py-1 text-xs text-button-fg hover:bg-button-hover"
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
