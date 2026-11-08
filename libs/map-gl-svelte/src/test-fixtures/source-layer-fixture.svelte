<script lang="ts">
  import type { FilterSpecification } from 'maplibre-gl';
  // From the package entry point, so the tests exercise the public exports.
  import {
    Layer,
    Map,
    Source,
    type CircleLayerSpecification,
    type LayerProps,
    type MapProps,
    type MapRef,
    type SourceSpecification,
  } from '../index';

  type Props = Pick<MapProps, 'mapStyle' | 'styleDiffing' | 'onError'> & {
    /** A flat `<Layer>`, declared before the Source in markup. Not rendered when undefined. */
    flat?: LayerProps;
    /** The `<Source>`'s props. Neither it nor its nested layers render when undefined. */
    source?: SourceSpecification & { id?: string };
    /** A circle `<Layer>` nested in the Source, rendered when set. Its other props follow. */
    nested?: { id?: string };
    paint?: CircleLayerSpecification['paint'];
    layout?: CircleLayerSpecification['layout'];
    filter?: FilterSpecification;
    minzoom?: number;
    maxzoom?: number;
    beforeId?: string;
  };

  let props: Props = $props();

  let map: ReturnType<typeof Map> | undefined = $state();

  export function getMapRef(): MapRef | null {
    return map?.getMapRef() ?? null;
  }
</script>

<Map
  mapStyle={props.mapStyle}
  styleDiffing={props.styleDiffing}
  onError={props.onError}
  bind:this={map}
>
  {#if props.flat}
    <Layer {...props.flat} />
  {/if}
  {#if props.source}
    <Source {...props.source}>
      {#if props.nested}
        <Layer
          id={props.nested.id}
          type="circle"
          paint={props.paint}
          layout={props.layout}
          filter={props.filter}
          minzoom={props.minzoom}
          maxzoom={props.maxzoom}
          beforeId={props.beforeId}
        />
      {/if}
    </Source>
  {/if}
</Map>
