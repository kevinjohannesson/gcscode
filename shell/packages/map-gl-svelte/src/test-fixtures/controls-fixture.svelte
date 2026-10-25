<script lang="ts">
  // From the package entry point, so the tests exercise the public exports.
  import {
    AttributionControl,
    FullscreenControl,
    GeolocateControl,
    GlobeControl,
    LogoControl,
    Map,
    NavigationControl,
    ScaleControl,
    TerrainControl,
    type AttributionControlProps,
    type FullscreenControlProps,
    type GeolocateControlInstance,
    type GeolocateControlProps,
    type GlobeControlProps,
    type LogoControlProps,
    type MapProps,
    type MapRef,
    type NavigationControlProps,
    type ScaleControlProps,
    type TerrainControlProps,
  } from '../index';
  import UseControlProbe from './use-control-probe.svelte';

  type Props = Pick<MapProps, 'mapStyle' | 'mapLib' | 'onError'> & {
    /** Each built-in control is rendered while its props are set. */
    attribution?: AttributionControlProps;
    fullscreen?: FullscreenControlProps;
    geolocate?: GeolocateControlProps;
    globe?: GlobeControlProps;
    logo?: LogoControlProps;
    navigation?: NavigationControlProps;
    scale?: ScaleControlProps;
    terrain?: TerrainControlProps;
    /** Called during a component's initialisation, to call `useControl`. Set to unmount it. */
    custom?: () => void;
    /** Called with what the controls' boundary catches: an error thrown as a control starts. */
    onControlError?: (error: unknown) => void;
  };

  let props: Props = $props();

  let map: ReturnType<typeof Map> | undefined = $state();
  let geolocate: ReturnType<typeof GeolocateControl> | undefined = $state();

  export function getMapRef(): MapRef | null {
    return map?.getMapRef() ?? null;
  }

  export function getGeolocateControl(): GeolocateControlInstance | undefined {
    return geolocate?.getControl();
  }
</script>

<!-- MapLibre's own attribution control is off, so `<AttributionControl>` is the only one. -->
<Map
  mapStyle={props.mapStyle}
  mapLib={props.mapLib}
  onError={props.onError}
  attributionControl={false}
  bind:this={map}
>
  <svelte:boundary onerror={(error) => props.onControlError?.(error)}>
    {#if props.attribution}
      <AttributionControl {...props.attribution} />
    {/if}
    {#if props.fullscreen}
      <FullscreenControl {...props.fullscreen} />
    {/if}
    {#if props.geolocate}
      <GeolocateControl {...props.geolocate} bind:this={geolocate} />
    {/if}
    {#if props.globe}
      <GlobeControl {...props.globe} />
    {/if}
    {#if props.logo}
      <LogoControl {...props.logo} />
    {/if}
    {#if props.navigation}
      <NavigationControl {...props.navigation} />
    {/if}
    {#if props.scale}
      <ScaleControl {...props.scale} />
    {/if}
    {#if props.terrain}
      <TerrainControl {...props.terrain} />
    {/if}
    {#if props.custom}
      <UseControlProbe setup={props.custom} />
    {/if}
  </svelte:boundary>
</Map>
