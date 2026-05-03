<script lang="ts">
  import Crosshair from '@lucide/svelte/icons/crosshair';

  /**
   * Static name → component map. To add a new lucide icon for use in a
   * MapControlContribution's `{ kind: 'lucide', name }`:
   *   1. Add an `import` for it from `'@lucide/svelte/icons/<name>'`.
   *   2. Add the name → component entry to ICONS.
   *
   * Unknown names render a `?` fallback at the requested size; they don't
   * crash the map view. When extensions need lucide names not pre-registered
   * here, swap to runtime resolution via the headless `lucide` package data
   * — that's a non-breaking refactor (the public API remains a name string).
   */
  const ICONS = {
    crosshair: Crosshair,
  } as const;

  type IconName = keyof typeof ICONS;

  let { name, size = 16 }: { name: string; size?: number } = $props();

  const isKnown = (n: string): n is IconName => n in ICONS;
</script>

{#if isKnown(name)}
  {@const IconComponent = ICONS[name]}
  <IconComponent {size} />
{:else}
  <span
    class="lucide-icon-fallback"
    title={`Unknown lucide icon: ${name}`}
    style:width="{size}px"
    style:height="{size}px">?</span
  >
{/if}

<style>
  .lucide-icon-fallback {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px dashed currentColor;
    color: #999;
    font-size: 0.75rem;
    line-height: 1;
    border-radius: 2px;
  }
</style>
