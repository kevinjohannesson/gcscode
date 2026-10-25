<script lang="ts">
  import { Layer, Map, Source } from 'map-gl-svelte';

  const STYLES = {
    positron: 'https://tiles.openfreemap.org/styles/positron',
    liberty: 'https://tiles.openfreemap.org/styles/liberty',
  } as const;

  type Position = [number, number];

  type Feature =
    | {
        type: 'Feature';
        properties: { name: string };
        geometry: { type: 'Point'; coordinates: Position };
      }
    | {
        type: 'Feature';
        properties: { name: string };
        geometry: { type: 'LineString'; coordinates: Position[] };
      };

  type Collection = { type: 'FeatureCollection'; features: Feature[] };

  const STOPS: Position[] = [
    [4.8952, 52.3702],
    [4.9227, 52.3631],
    [4.9041, 52.3547],
    [4.8719, 52.3584],
  ];

  const initial: Collection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: 'route' },
        geometry: { type: 'LineString', coordinates: STOPS },
      },
      ...STOPS.map(
        (coordinates, i): Feature => ({
          type: 'Feature',
          properties: { name: `stop ${i + 1}` },
          geometry: { type: 'Point', coordinates },
        }),
      ),
    ],
  };

  // `$state.raw`: the source reacts to a new object only, never to a change inside one, and a raw
  // value makes that the only way to change it.
  let data = $state.raw<Collection>(initial);
  let styleName = $state<keyof typeof STYLES>('positron');
  let accent = $state('#e11d48');

  // Reassigns `data`. `data.features.push(...)` would do nothing.
  function addStop() {
    const next: Position = [4.86 + Math.random() * 0.08, 52.34 + Math.random() * 0.05];
    const count = data.features.filter((f) => f.geometry.type === 'Point').length;
    data = {
      ...data,
      features: [
        ...data.features,
        {
          type: 'Feature',
          properties: { name: `stop ${count + 1}` },
          geometry: { type: 'Point', coordinates: next },
        },
      ],
    };
  }

  // The same for `paint`: a new object, not a changed key.
  const circlePaint = $derived({
    'circle-radius': 8,
    'circle-color': accent,
    'circle-stroke-color': '#ffffff',
    'circle-stroke-width': 2,
  });
</script>

<div class="page">
  <div class="toolbar">
    <button type="button" onclick={addStop}>Add a stop (reassign <code>data</code>)</button>
    <button type="button" onclick={() => (data = initial)}>Reset data</button>
    <button
      type="button"
      onclick={() => (styleName = styleName === 'positron' ? 'liberty' : 'positron')}
    >
      Swap style (now {styleName})
    </button>
    <label>
      Circle colour
      <input type="color" bind:value={accent} />
    </label>
    <span>
      {data.features.length - 1} points. A style swap wipes the source and layers; they come back on their
      own.
    </span>
  </div>
  <div class="map-box">
    <Map
      initialViewState={{ longitude: 4.9, latitude: 52.36, zoom: 12 }}
      mapStyle={STYLES[styleName]}
    >
      <Source id="stops" type="geojson" {data}>
        <Layer
          id="stops-route"
          type="line"
          filter={['==', '$type', 'LineString']}
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{ 'line-color': '#2563eb', 'line-width': 4, 'line-dasharray': [2, 1] }}
        />
        <Layer
          id="stops-points"
          type="circle"
          filter={['==', '$type', 'Point']}
          paint={circlePaint}
        />
      </Source>
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
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    font-size: 0.85rem;
  }
  .map-box {
    position: relative;
    flex: 1;
    min-height: 0;
  }
</style>
