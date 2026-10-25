<script lang="ts">
  import {
    AttributionControl,
    FullscreenControl,
    GeolocateControl,
    GlobeControl,
    LogoControl,
    Map,
    NavigationControl,
    ScaleControl,
    Source,
    TerrainControl,
  } from 'map-gl-svelte';

  const BASEMAP = 'https://tiles.openfreemap.org/styles/positron';

  let located = $state('not asked yet');
</script>

<div class="page">
  <p>
    All eight built-in controls. The map's own attribution control is switched off, so
    <code>&lt;AttributionControl&gt;</code> is the only one. Geolocate asks the browser for permission
    when clicked; the terrain button needs the DEM source below.
  </p>
  <pre>geolocate: {located}</pre>
  <div class="map-box">
    <Map
      initialViewState={{ longitude: 11.39, latitude: 47.26, zoom: 10, pitch: 45 }}
      mapStyle={BASEMAP}
      attributionControl={false}
    >
      <!-- A DEM for the terrain control to switch on; nothing draws it until then. -->
      <Source
        id="terrain-dem"
        type="raster-dem"
        tiles={['https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png']}
        encoding="terrarium"
        tileSize={256}
        maxzoom={14}
      />

      <NavigationControl position="top-right" />
      <FullscreenControl position="top-right" />
      <GeolocateControl
        position="top-right"
        trackUserLocation
        onGeolocate={(e) =>
          (located = `${e.coords.latitude.toFixed(4)}, ${e.coords.longitude.toFixed(4)}`)}
        onError={(e) => (located = `error: ${e.message}`)}
      />
      <TerrainControl position="top-right" source="terrain-dem" exaggeration={1.5} />
      <GlobeControl position="top-right" />
      <ScaleControl position="bottom-left" unit="metric" />
      <LogoControl position="bottom-left" />
      <AttributionControl position="bottom-right" customAttribution="map-gl-svelte demo" />
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
</style>
