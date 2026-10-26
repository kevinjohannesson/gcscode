<script lang="ts">
  import { Map } from 'map-gl-svelte';
  import ZoomReadout from './zoom-readout.svelte';

  const BASEMAP = 'https://tiles.openfreemap.org/styles/positron';

  let shown = $state(true);
</script>

<div class="page">
  <p>
    A hand-written <code>IControl</code> added through <code>useControl</code> (see
    <code>zoom-readout.svelte</code>). Unchecking the box destroys the component, which removes the
    control from the map.
  </p>
  <label>
    <input type="checkbox" bind:checked={shown} />
    Show the control
  </label>
  <div class="map-box">
    <Map initialViewState={{ longitude: 4.9, latitude: 52.37, zoom: 11 }} mapStyle={BASEMAP}>
      {#if shown}
        <ZoomReadout position="top-left" />
      {/if}
    </Map>
  </div>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 8px 12px 12px;
    box-sizing: border-box;
  }
  p {
    margin: 0 0 6px;
    font-size: 0.85rem;
  }
  label {
    margin-bottom: 8px;
    font-size: 0.85rem;
  }
  .map-box {
    position: relative;
    flex: 1;
    min-height: 0;
  }
</style>
