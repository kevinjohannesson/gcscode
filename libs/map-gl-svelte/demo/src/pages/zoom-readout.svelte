<script module lang="ts">
  import type { ControlPosition, IControl, MapInstance } from 'map-gl-svelte';

  /**
   * The smallest useful control: a box that shows the map's zoom and bearing. MapLibre asks it
   * for an element when it is added, and tells it when it is removed.
   */
  class ZoomReadoutControl implements IControl {
    private _map: MapInstance | undefined;
    private _element: HTMLDivElement | undefined;

    public onAdd(map: MapInstance): HTMLElement {
      this._map = map;
      this._element = document.createElement('div');
      this._element.className = 'maplibregl-ctrl zoom-readout';
      map.on('move', this._update);
      this._update();
      return this._element;
    }

    public onRemove(): void {
      this._map?.off('move', this._update);
      this._element?.remove();
      this._map = undefined;
      this._element = undefined;
    }

    private _update = (): void => {
      if (this._map && this._element) {
        this._element.textContent = `zoom ${this._map.getZoom().toFixed(2)}, bearing ${this._map.getBearing().toFixed(0)}`;
      }
    };
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import { useControl } from 'map-gl-svelte';

  let { position = 'top-left' }: { position?: ControlPosition } = $props();

  // Must run while a component initialises, inside a `<Map>`. The control is added to the map
  // when this component mounts and taken off again when it is destroyed. Its position is read
  // once: a control is not moved after it has been added.
  useControl(() => new ZoomReadoutControl(), { position: untrack(() => position) });
</script>

<style>
  /* The control's element is created by hand, outside this component's markup. */
  :global(.zoom-readout) {
    padding: 4px 8px;
    border-radius: 4px;
    background: #ffffff;
    font:
      12px/1.4 system-ui,
      sans-serif;
  }
</style>
