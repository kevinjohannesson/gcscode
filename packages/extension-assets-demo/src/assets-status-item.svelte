<script lang="ts">
  import type { RegisteredAsset } from '@gcscode/extension-assets';

  import { getAssetsApi } from './index';

  // Read through the host per render, never cached. Both hops are reactive:
  // `getAssetsApi()` reads the host's exports map, so the label appears when
  // the assets extension activates; `getAssets()` iterates the registry's
  // asset map, so it tracks registrations and in-place replacements. Resolving
  // once at `activate()` and keeping the result renders this list exactly once
  // and then goes quietly stale.
  const assets: readonly RegisteredAsset[] = $derived(getAssetsApi()?.getAssets() ?? []);

  function fmtAirframe(asset: RegisteredAsset): string {
    // An absent `airframe` means nobody asserted one; `{ kind: 'unknown' }`
    // means an adapter saw something gcscode has no word for. Rendering both
    // the same way would throw away the distinction the vocabulary rests on
    // (ADR-0011), so absence gets the em dash this shell already uses for
    // "no value" and an asserted kind renders its own name.
    return asset.airframe?.kind ?? '—';
  }
</script>

<!-- One span per asset, so the status bar's own gap separates them. No
     assets — because none are registered, or because the service is not
     active — renders nothing at all, which is what the spec asks for; this
     demo deliberately invents no placeholder for a state it cannot explain
     to an operator. -->
{#each assets as asset (asset.key)}
  <span>{asset.sourceLabel} · {fmtAirframe(asset)}</span>
{/each}
