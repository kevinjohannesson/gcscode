<script lang="ts">
  import { Map, type ViewState } from 'map-gl-svelte';

  const BASEMAP = 'https://tiles.openfreemap.org/styles/positron';
  const HOME = { longitude: 4.9, latitude: 52.37, zoom: 11, pitch: 0, bearing: 0 };

  // Controlled: the app owns the camera. The map only moves where `onMove` applies the proposed
  // camera to this state.
  let view = $state<ViewState>({
    ...HOME,
    padding: { top: 0, bottom: 0, left: 0, right: 0 },
  });
  let ignoreGestures = $state(false);

  // The live `viewState`, as the controlled map's props see it.
  const readout = $derived(
    [
      `longitude ${view.longitude.toFixed(4)}   latitude ${view.latitude.toFixed(4)}`,
      `zoom ${view.zoom.toFixed(2)}   pitch ${view.pitch.toFixed(1)}   bearing ${view.bearing.toFixed(1)}`,
    ].join('\n'),
  );

  function rotate() {
    view = { ...view, bearing: view.bearing + 45 };
  }
</script>

<div class="page">
  <div class="maps">
    <section>
      <h2>Uncontrolled</h2>
      <p>
        <code>initialViewState</code> sets the first camera; after that the map moves on its own.
      </p>
      <div class="map-box">
        <Map initialViewState={HOME} mapStyle={BASEMAP} />
      </div>
    </section>

    <section>
      <h2>Controlled</h2>
      <p>
        <code>longitude</code>, <code>latitude</code>, <code>zoom</code>, <code>pitch</code> and
        <code>bearing</code> come from state.
      </p>
      <div class="toolbar">
        <button type="button" onclick={rotate}>Rotate 45&deg;</button>
        <button type="button" onclick={() => (view = { ...view, ...HOME })}>Home</button>
        <label>
          <input type="checkbox" bind:checked={ignoreGestures} />
          Ignore gestures (do not apply <code>onMove</code>)
        </label>
      </div>
      <pre>{readout}</pre>
      <div class="map-box">
        <Map
          longitude={view.longitude}
          latitude={view.latitude}
          zoom={view.zoom}
          pitch={view.pitch}
          bearing={view.bearing}
          mapStyle={BASEMAP}
          onMove={(e) => {
            if (!ignoreGestures) {
              view = e.viewState;
            }
          }}
        />
      </div>
    </section>
  </div>
</div>

<style>
  .page {
    height: 100%;
    padding: 8px 12px 12px;
    box-sizing: border-box;
  }
  .maps {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    height: 100%;
  }
  section {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  h2 {
    margin: 4px 0;
    font-size: 1rem;
  }
  p {
    margin: 0 0 6px;
    font-size: 0.85rem;
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
    font-size: 0.85rem;
  }
  pre {
    margin: 0 0 6px;
    padding: 4px 8px;
    background: #e4e4e7;
    font-size: 0.75rem;
  }
  .map-box {
    position: relative;
    flex: 1;
    min-height: 0;
  }
</style>
