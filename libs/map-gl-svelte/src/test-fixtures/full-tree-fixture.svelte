<script lang="ts">
  // From the package entry point, so the tests exercise the public exports.
  import {
    Layer,
    Map,
    MapProvider,
    Marker,
    NavigationControl,
    Popup,
    ScaleControl,
    Source,
    type MapRef,
    type PopupEvent,
  } from '../index';
  import { EMPTY_STYLE } from '../test-utils/map-test-utils';
  import type { MarkerInstance, PopupInstance } from '../types/lib';
  import { featureCollection, pointFeature } from './source-layer-harness.svelte';

  let props: {
    /** The Popup's `onClose`. */
    onClose?: (e: PopupEvent) => void;
  } = $props();

  let map: ReturnType<typeof Map> | undefined = $state();
  let marker: ReturnType<typeof Marker> | undefined = $state();
  let popup: ReturnType<typeof Popup> | undefined = $state();

  const points = featureCollection(pointFeature('a', [-122, 38]), pointFeature('b', [-121, 37]));

  export function getMapRef(): MapRef | null {
    return map?.getMapRef() ?? null;
  }

  export function getMarker(): MarkerInstance | undefined {
    return marker?.getMarker();
  }

  export function getPopup(): PopupInstance | undefined {
    return popup?.getPopup();
  }
</script>

<!-- One of everything the package renders: the whole tree goes at once when this unmounts. -->
<MapProvider>
  <Map id="m" mapStyle={EMPTY_STYLE} bind:this={map}>
    <Source id="pts" type="geojson" data={points}>
      <Layer id="nested" type="circle" paint={{ 'circle-radius': 6 }} />
    </Source>
    <Layer id="flat" type="circle" source="pts" paint={{ 'circle-radius': 3 }} />
    <Marker longitude={-122} latitude={38} bind:this={marker}>
      <span class="pin"></span>
    </Marker>
    <Popup longitude={-122} latitude={38} onClose={props.onClose} bind:this={popup}>
      <span class="greeting">Hello</span>
    </Popup>
    <NavigationControl />
    <ScaleControl />
  </Map>
</MapProvider>
