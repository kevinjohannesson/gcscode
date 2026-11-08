<script lang="ts">
  // From the package entry point, so the tests exercise the public exports.
  import {
    Map,
    Marker,
    Popup,
    type MapProps,
    type MapRef,
    type MarkerInstance,
    type MarkerProps,
    type PopupInstance,
    type PopupProps,
  } from '../index';
  import ContextProbe from './context-probe.svelte';

  type Props = Pick<MapProps, 'mapStyle' | 'onError'> & {
    /** A `<Marker>`, rendered when set. */
    marker?: Omit<MarkerProps, 'children'>;
    /** The Marker's children. When unset the Marker is given no children at all. */
    markerContent?: 'pin' | 'block' | 'probe';
    /** A `<Popup>`, rendered when set. */
    popup?: Omit<PopupProps, 'children'>;
    /** The Popup's children: `label` as text, or inside a `div`. */
    popupContent?: 'text' | 'block' | 'probe';
    /** Text the Popup's children show. Read inside the snippet, so it must stay reactive. */
    label?: string;
    /** Receives whether a `probe` child saw the map during its initialisation. */
    onProbe?: (sawMap: boolean) => void;
    /** Called when a `probe` child is destroyed. */
    onProbeDestroyed?: () => void;
  };

  let props: Props = $props();

  let map: ReturnType<typeof Map> | undefined = $state();
  let marker: ReturnType<typeof Marker> | undefined = $state();
  let popup: ReturnType<typeof Popup> | undefined = $state();

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

<Map mapStyle={props.mapStyle} onError={props.onError} bind:this={map}>
  {#if props.marker}
    {#if props.markerContent}
      <Marker {...props.marker} bind:this={marker}>
        {#if props.markerContent === 'pin'}
          <span class="pin"></span>
        {:else if props.markerContent === 'block'}
          <div id="marker-content"></div>
        {:else}
          <ContextProbe onProbe={props.onProbe} onDestroyed={props.onProbeDestroyed} />
        {/if}
      </Marker>
    {:else}
      <Marker {...props.marker} bind:this={marker} />
    {/if}
  {/if}
  {#if props.popup}
    <Popup {...props.popup} bind:this={popup}>
      {#if props.popupContent === 'block'}
        <div id="popup-content">{props.label}</div>
      {:else if props.popupContent === 'probe'}
        <ContextProbe onProbe={props.onProbe} onDestroyed={props.onProbeDestroyed} />
      {:else}
        {props.label}
      {/if}
    </Popup>
  {/if}
</Map>
