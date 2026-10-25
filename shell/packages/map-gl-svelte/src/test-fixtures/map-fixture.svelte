<script lang="ts">
  import Map from '../components/map.svelte';
  import type { MapProps } from '../components/map-props';
  import type { MapRef } from '../maplibre/create-ref';
  import type { ViewState } from '../types/common';
  import type { MapEvent, ViewStateChangeEvent } from '../types/events';
  import ContextProbe from './context-probe.svelte';

  type Props = MapProps & {
    /** Keeps the camera in this fixture's state, set from `onMove` at once or in a `setTimeout`. */
    mirror?: 'direct' | 'delayed';
    /** Mirror mode: called on every `render` with the fixture's camera state at that moment. */
    onMirrorRender?: (viewState: Partial<ViewState>, e: MapEvent) => void;
    /** Receives whether the child probe saw the map during its initialisation. */
    onProbe?: (sawMap: boolean) => void;
  };

  let { mirror, onMirrorRender, onProbe, ...mapProps }: Props = $props();

  let map: ReturnType<typeof Map> | undefined = $state();
  let viewState: Partial<ViewState> = $state({ longitude: -100, latitude: 40, zoom: 4 });

  function handleMove(e: ViewStateChangeEvent): void {
    if (mirror === 'delayed') {
      setTimeout(() => (viewState = e.viewState));
    } else {
      viewState = e.viewState;
    }
  }

  function handleRender(e: MapEvent): void {
    onMirrorRender?.(viewState, e);
  }

  export function getMapRef(): MapRef | null {
    return map?.getMapRef() ?? null;
  }
</script>

{#if mirror}
  <Map {...mapProps} {...viewState} onMove={handleMove} onRender={handleRender} bind:this={map}>
    <ContextProbe {onProbe} />
  </Map>
{:else}
  <Map {...mapProps} bind:this={map}>
    <ContextProbe {onProbe} />
  </Map>
{/if}
