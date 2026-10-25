<script lang="ts">
  import type { MapCollection } from '../components/use-map.svelte';
  // From the package entry point, so the tests exercise the public exports.
  import { Map, MapProvider, type MapRef } from '../index';
  import { EMPTY_STYLE } from '../test-utils/map-test-utils';
  import type { ErrorEvent } from '../types/events';
  import UseMapProbe from './use-map-probe.svelte';

  type Props = {
    /** One `<Map>` per entry, in order. `undefined` is a map given no id; duplicates are allowed. */
    ids: (string | undefined)[];
    /** The probe outside every map shows whether this id is registered. */
    watch?: string;
    /** Whether the maps and the outer probe are inside a `<MapProvider>`. Defaults to true. */
    provider?: boolean;
    /** Puts a probe inside each map, named `map-<index>`. */
    inner?: boolean;
    /** Called with what each probe's `useMap()` returned. The outer one is named `outer`. */
    onMaps?: (name: string, maps: MapCollection) => void;
    /** Each map's `onError`. */
    onMapError?: (event: ErrorEvent) => void;
    /** The probe outside every map also renders `{maps}` as text. */
    stringify?: boolean;
  };

  let props: Props = $props();

  let refs: (ReturnType<typeof Map> | undefined)[] = $state([]);

  /** The `index`-th map's ref, or null until it has created its map. */
  export function getMapRef(index: number): MapRef | null {
    return refs[index]?.getMapRef() ?? null;
  }
</script>

{#snippet content()}
  {#each props.ids as id, index (index)}
    <Map {id} mapStyle={EMPTY_STYLE} onError={props.onMapError} bind:this={refs[index]}>
      {#if props.inner}
        <UseMapProbe name="map-{index}" onMaps={props.onMaps} />
      {/if}
    </Map>
  {/each}
  <UseMapProbe name="outer" watch={props.watch} onMaps={props.onMaps} stringify={props.stringify} />
{/snippet}

{#if props.provider ?? true}
  <MapProvider>
    {@render content()}
  </MapProvider>
{:else}
  {@render content()}
{/if}
