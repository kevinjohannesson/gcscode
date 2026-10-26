<script lang="ts">
  import { Map, Marker, Popup } from 'map-gl-svelte';

  const BASEMAP = 'https://tiles.openfreemap.org/styles/positron';

  // The first marker: draggable, and its popup follows it.
  let pin = $state({ longitude: 4.8952, latitude: 52.3702 });
  let popupOpen = $state(true);
  let dragging = $state(false);

  // The second marker has its own content instead of MapLibre's pin.
  const station = { longitude: 4.93, latitude: 52.365 };
  let clicks = $state(0);

  const status = $derived(
    `pin ${pin.longitude.toFixed(5)}, ${pin.latitude.toFixed(5)}${dragging ? ' (dragging)' : ''}` +
      `   badge clicks: ${clicks}`,
  );
</script>

<div class="page">
  <p>
    Drag the pin: its <code>onDrag</code> writes the new position back to state, and the popup
    (opened by clicking the pin, closed by its own close button) follows. The badge is a
    <code>&lt;Marker&gt;</code> with children.
  </p>
  <pre>{status}</pre>
  <div class="map-box">
    <Map initialViewState={{ longitude: 4.9, latitude: 52.37, zoom: 12.5 }} mapStyle={BASEMAP}>
      <Marker
        longitude={pin.longitude}
        latitude={pin.latitude}
        draggable
        onDragStart={() => (dragging = true)}
        onDrag={(e) => (pin = { longitude: e.lngLat.lng, latitude: e.lngLat.lat })}
        onDragEnd={() => (dragging = false)}
        onClick={(e) => {
          // Keep the map from seeing the click, or the popup would close straight away.
          e.originalEvent.stopPropagation();
          popupOpen = true;
        }}
      />

      {#if popupOpen}
        <Popup
          longitude={pin.longitude}
          latitude={pin.latitude}
          anchor="bottom"
          offset={42}
          onClose={() => (popupOpen = false)}
        >
          <strong>Draggable pin</strong><br />
          {pin.latitude.toFixed(4)}, {pin.longitude.toFixed(4)}
        </Popup>
      {/if}

      <Marker
        longitude={station.longitude}
        latitude={station.latitude}
        anchor="bottom"
        onClick={() => clicks++}
      >
        <div class="badge">Ground station</div>
      </Marker>
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
  pre {
    margin: 0 0 8px;
    padding: 4px 8px;
    background: #e4e4e7;
    font-size: 0.75rem;
  }
  .map-box {
    position: relative;
    flex: 1;
    min-height: 0;
  }
  .badge {
    padding: 4px 10px;
    border-radius: 12px;
    background: #18181b;
    color: #fafafa;
    font-size: 0.8rem;
    white-space: nowrap;
    cursor: pointer;
  }
</style>
