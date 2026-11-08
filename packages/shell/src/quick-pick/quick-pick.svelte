<script lang="ts">
  import Fuse from 'fuse.js';
  import { SvelteMap } from 'svelte/reactivity';
  import { quickPickState } from './quick-pick-state.svelte';

  let query = $state('');
  let highlightIndex = $state(0);

  // The current request — non-null when this component is mounted (the host
  // only mounts us when quickPickState.current !== null). We keep a nullable
  // derived so the template can guard before current becomes null on pick/dismiss.
  const request = $derived(quickPickState.current);

  const fuse = $derived(
    new Fuse(request?.items ?? [], {
      keys: ['label'],
      includeMatches: true,
      threshold: 0.4,
      ignoreLocation: true,
    }),
  );

  // Filtered + sorted items. Empty query → alphabetical by label. Non-empty
  // query → Fuse score order.
  const filtered = $derived.by(() => {
    if (!request) return [];
    if (query.trim() === '') {
      return [...request.items].sort((a, b) => a.label.localeCompare(b.label));
    }
    return fuse.search(query).map((r) => r.item);
  });

  // Map of item-label → array of [start, end] match ranges, for bolding.
  const matchesByLabel = $derived.by(() => {
    if (query.trim() === '') return new SvelteMap<string, readonly [number, number][]>();
    const m = new SvelteMap<string, readonly [number, number][]>();
    for (const r of fuse.search(query)) {
      const ranges = (r.matches ?? [])
        .filter((mm) => mm.key === 'label')
        .flatMap((mm) => mm.indices as readonly [number, number][]);
      m.set(r.item.label, ranges);
    }
    return m;
  });

  // Reset highlight when the filtered list changes.
  $effect(() => {
    void filtered;
    highlightIndex = 0;
  });

  function placeholder(): string {
    return request?.options?.placeholder ?? 'Type a command name';
  }

  function pickIndex(i: number) {
    const item = filtered[i];
    if (item !== undefined) quickPickState.pick(item);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      pickIndex(highlightIndex);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      quickPickState.dismiss();
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

  function renderLabel(label: string, ranges: readonly [number, number][]) {
    if (ranges.length === 0) return [{ text: label, bold: false }];
    const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const [s, e] of sorted) {
      const last = merged[merged.length - 1];
      if (last !== undefined && s <= last[1] + 1) {
        last[1] = Math.max(last[1], e);
      } else {
        merged.push([s, e]);
      }
    }
    const out: { text: string; bold: boolean }[] = [];
    let cursor = 0;
    for (const [s, e] of merged) {
      if (cursor < s) out.push({ text: label.slice(cursor, s), bold: false });
      out.push({ text: label.slice(s, e + 1), bold: true });
      cursor = e + 1;
    }
    if (cursor < label.length) out.push({ text: label.slice(cursor), bold: false });
    return out;
  }
</script>

{#if request}
  <div
    class="fixed left-1/2 top-16 z-50 w-[440px] -translate-x-1/2 overflow-hidden rounded-md border border-neutral-700 bg-neutral-800 shadow-2xl"
    role="dialog"
    aria-label="Command palette"
  >
    {#if request.options?.title}
      <div class="border-b border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-400">
        {request.options.title}
      </div>
    {/if}
    <!-- svelte-ignore a11y_autofocus -->
    <input
      type="text"
      bind:value={query}
      onkeydown={onKeyDown}
      placeholder={placeholder()}
      class="w-full border-none bg-neutral-700 px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-400"
      autofocus
    />
    {#if filtered.length === 0}
      <div class="px-3 py-4 text-center text-sm text-neutral-400">No matching commands</div>
    {:else}
      <ul class="max-h-80 overflow-y-auto">
        {#each filtered as item, i (item.label)}
          <li>
            <button
              type="button"
              class="w-full px-3 py-1.5 text-left text-sm text-neutral-100"
              class:bg-blue-900={i === highlightIndex}
              onclick={() => pickIndex(i)}
              onmouseenter={() => (highlightIndex = i)}
            >
              {#each renderLabel(item.label, matchesByLabel.get(item.label) ?? []) as span, si (si)}
                {#if span.bold}<strong class="font-bold">{span.text}</strong>{:else}{span.text}{/if}
              {/each}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}
