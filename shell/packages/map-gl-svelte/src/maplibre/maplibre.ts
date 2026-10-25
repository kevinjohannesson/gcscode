import type {
  CameraUpdateTransformFunction,
  MapEventType,
  StyleOptions,
  StyleSwapOptions,
} from 'maplibre-gl';

import type {
  ImmutableLike,
  LngLatBoundsLike,
  MapGeoJSONFeature,
  PaddingOptions,
  Point,
  PointLike,
  ViewState,
} from '../types/common';
import type {
  ErrorEvent,
  MapCallbacks,
  MapEvent,
  MapMouseEvent,
  ViewStateChangeEvent,
} from '../types/events';
import type { TransformLike } from '../types/internal';
import type { MapInstance, MapOptions } from '../types/lib';
import type {
  LightSpecification,
  ProjectionSpecification,
  SkySpecification,
  StyleSpecification,
  TerrainSpecification,
} from '../types/style-spec';
import { deepEqual } from '../utils/deep-equal';
import { normalizeStyle } from '../utils/style-utils';
import {
  applyViewStateToTransform,
  getTransformLike,
  transformToViewState,
  updatePitchConstraint,
  updateZoomConstraint,
  type CameraProps,
  type ConstraintRange,
} from '../utils/transform';

const cameraConstraintNames = ['minZoom', 'maxZoom', 'minPitch', 'maxPitch'] as const;

/** Map options that are also live props; MapLibre's own docs and defaults apply. */
type ReactiveMapOptions = Pick<
  MapOptions,
  (typeof cameraConstraintNames)[number] | 'maxBounds' | 'renderWorldCopies'
>;

// A nullish limit means MapLibre's default. Passing it to the constructor would override that
// default instead (on 5.24 `undefined` gives minZoom 0 rather than -2, and `null` gives null limits).
function removeNullishCameraConstraints(options: ReactiveMapOptions): void {
  for (const propName of cameraConstraintNames) {
    if (options[propName] === null || options[propName] === undefined) {
      delete options[propName];
    }
  }
}

export type MaplibreProps = Partial<ViewState> &
  MapCallbacks &
  ReactiveMapOptions & {
    /** Camera options used when constructing the Map instance */
    initialViewState?: Partial<ViewState> & {
      /** The initial bounds of the map. If bounds is specified, it overrides longitude, latitude and zoom options. */
      bounds?: LngLatBoundsLike;
      /** A fitBounds options object to use only when setting the bounds option. */
      fitBoundsOptions?: {
        offset?: PointLike;
        minZoom?: number;
        maxZoom?: number;
        padding?: number | PaddingOptions;
      };
    };

    /** If provided, render into an external WebGL context */
    gl?: WebGLRenderingContext;

    /** For external controller to override the camera state */
    viewState?: ViewState & {
      width: number;
      height: number;
    };

    // Styling

    /** Mapbox style */
    mapStyle?: string | StyleSpecification | ImmutableLike<StyleSpecification>;
    /** Enable diffing when the map style changes
     * @default true
     */
    styleDiffing?: boolean;
    /** The projection property of the style. Must conform to the Projection Style Specification.
     * @default 'mercator'
     */
    projection?: ProjectionSpecification | 'mercator' | 'globe';
    /** Light properties of the map. */
    light?: LightSpecification;
    /** Terrain property of the style. Must conform to the Terrain Style Specification.
     * If `undefined` is provided, removes terrain from the map. */
    terrain?: TerrainSpecification;
    /** Sky properties of the map. Must conform to the Sky Style Specification. */
    sky?: SkySpecification;

    /** Default layers to query on pointer events */
    interactiveLayerIds?: string[];
    /** CSS cursor */
    cursor?: string;
  };

/** The map's interaction handlers, each switched by a prop of the same name. */
export type HandlerName =
  | 'scrollZoom'
  | 'boxZoom'
  | 'dragRotate'
  | 'dragPan'
  | 'keyboard'
  | 'doubleClickZoom'
  | 'touchZoomRotate'
  | 'touchPitch';

/** The map settings applied through `updateSetting`. */
export type SettingName = 'maxBounds' | 'projection' | 'renderWorldCopies';

const DEFAULT_STYLE = { version: 8, sources: {}, layers: [] } as StyleSpecification;

/**
 * The value each setting prop stands for when it is `undefined`. Zoom and pitch limits have no
 * entry: a nullish limit goes to MapLibre's setter as is, which restores MapLibre's own default.
 */
const DEFAULT_SETTINGS = {
  maxBounds: [-180, -85.051129, 180, 85.051129] as [number, number, number, number],
  projection: 'mercator' as const,
  renderWorldCopies: true,
};

const pointerEvents = {
  mousedown: 'onMouseDown',
  mouseup: 'onMouseUp',
  mouseover: 'onMouseOver',
  mousemove: 'onMouseMove',
  click: 'onClick',
  dblclick: 'onDblClick',
  mouseenter: 'onMouseEnter',
  mouseleave: 'onMouseLeave',
  mouseout: 'onMouseOut',
  contextmenu: 'onContextMenu',
  touchstart: 'onTouchStart',
  touchend: 'onTouchEnd',
  touchmove: 'onTouchMove',
  touchcancel: 'onTouchCancel',
} as const satisfies Record<string, keyof MapCallbacks>;
const cameraEvents = {
  movestart: 'onMoveStart',
  move: 'onMove',
  moveend: 'onMoveEnd',
  dragstart: 'onDragStart',
  drag: 'onDrag',
  dragend: 'onDragEnd',
  zoomstart: 'onZoomStart',
  zoom: 'onZoom',
  zoomend: 'onZoomEnd',
  rotatestart: 'onRotateStart',
  rotate: 'onRotate',
  rotateend: 'onRotateEnd',
  pitchstart: 'onPitchStart',
  pitch: 'onPitch',
  pitchend: 'onPitchEnd',
} as const satisfies Record<string, keyof MapCallbacks>;
const otherEvents = {
  wheel: 'onWheel',
  boxzoomstart: 'onBoxZoomStart',
  boxzoomend: 'onBoxZoomEnd',
  boxzoomcancel: 'onBoxZoomCancel',
  resize: 'onResize',
  load: 'onLoad',
  render: 'onRender',
  idle: 'onIdle',
  remove: 'onRemove',
  data: 'onData',
  styledata: 'onStyleData',
  sourcedata: 'onSourceData',
  error: 'onError',
} as const satisfies Record<string, keyof MapCallbacks>;
export const settingNames: readonly SettingName[] = [
  'maxBounds',
  'projection',
  'renderWorldCopies',
];
export const handlerNames: readonly HandlerName[] = [
  'scrollZoom',
  'boxZoom',
  'dragRotate',
  'dragPan',
  'keyboard',
  'doubleClickZoom',
  'touchZoomRotate',
  'touchPitch',
];

type Callback = (e: unknown) => void;
type Handler = { enable(options?: unknown): void; disable(): void };
/** Handler props are map options (`MapOptions`), not part of `MaplibreProps` itself. */
type HandlerProps = Partial<Record<HandlerName, unknown>>;

function zoomRange(props: MaplibreProps): ConstraintRange {
  return { min: props.minZoom, max: props.maxZoom };
}

function pitchRange(props: MaplibreProps): ConstraintRange {
  return { min: props.minPitch, max: props.maxPitch };
}

/**
 * A wrapper for maplibre-gl's Map class.
 *
 * It reads the live props object it was given at call time (camera hook, event dispatch,
 * style components) and never copies it. Callers apply prop changes through the granular
 * `update*` methods, one per MapLibre call.
 */
export default class Maplibre {
  /** Wrappers parked by `recycle()` for `reuse()`. */
  public static savedMaps: Maplibre[] = [];

  private _MapClass: new (options: MapOptions) => MapInstance;
  // maplibregl.Map instance
  private _map: MapInstance;
  // User-supplied props
  private _props: MaplibreProps;

  // Internal states
  private _internalUpdate = false;
  private _hoveredFeatures: MapGeoJSONFeature[] | null = null;
  private _proposedCameraUpdate: ViewState | null = null;
  private _styleComponents: {
    light?: LightSpecification;
    sky?: SkySpecification;
    projection?: ProjectionSpecification;
    terrain?: TerrainSpecification | null;
  } = {};
  private _redrawRequested = false;
  private _destroyed = false;
  // What `reuse()` diffs the next props against; set by `recycle()`.
  private _recycledProps: MaplibreProps | null = null;

  public constructor(
    MapClass: new (options: MapOptions) => MapInstance,
    props: MaplibreProps,
    container: HTMLDivElement,
  ) {
    this._MapClass = MapClass;
    this._props = props;
    this._map = this._initialize(container);
  }

  public get map(): MapInstance {
    return this._map;
  }

  /** The live props object; read at call time, never copied. */
  public get props(): MaplibreProps {
    return this._props;
  }

  public static reuse(props: MaplibreProps, container: HTMLDivElement): Maplibre | null {
    const that = Maplibre.savedMaps.pop();
    if (!that) {
      return null;
    }

    const map = that.map;
    // When reusing the saved map, we need to reparent the map(canvas) and other child nodes
    // into the new container from the props.
    // Step 1: reparenting child nodes from old container to new container
    const oldContainer = map.getContainer();
    container.className = oldContainer.className;
    while (oldContainer.childNodes.length > 0) {
      container.appendChild(oldContainer.childNodes[0]);
    }
    // Step 2: replace the internal container with new container from the component
    map._container = container;

    // With maplibre-gl as mapLib, map uses ResizeObserver to observe when its container resizes.
    // When reusing the saved map, we need to disconnect the observer and observe the new container.
    // Step 3: telling the ResizeObserver to disconnect and observe the new container
    const resizeObserver = map._resizeObserver;
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver.observe(container);
    }

    // Step 4: apply new props. The wrapper reads the new live props object from now on;
    // sync the map to it against the props it was parked with, without style diffing.
    const prevProps = that._recycledProps ?? that._props;
    that._recycledProps = null;
    that._props = props;
    that._syncAll(prevProps, false);
    map.resize();
    const { initialViewState } = props;
    if (initialViewState) {
      if (initialViewState.bounds) {
        map.fitBounds(initialViewState.bounds, {
          ...initialViewState.fitBoundsOptions,
          duration: 0,
        });
      } else {
        that._applyViewState(initialViewState);
      }
    }

    // Simulate load event
    if (map.isStyleLoaded()) {
      map.fire('load');
    } else {
      map.once('style.load', () => map.fire('load'));
    }

    // Force reload
    map._update();
    return that;
  }

  private _initialize(container: HTMLDivElement): MapInstance {
    const props = this._props;
    const { mapStyle = DEFAULT_STYLE } = props;
    const mapOptions = {
      ...props,
      ...props.initialViewState,
      container,
      style: normalizeStyle(mapStyle),
    };
    removeNullishCameraConstraints(mapOptions);

    const viewState: Partial<ViewState> =
      mapOptions.initialViewState || mapOptions.viewState || mapOptions;
    Object.assign(mapOptions, {
      center: [viewState.longitude || 0, viewState.latitude || 0],
      zoom: viewState.zoom || 0,
      pitch: viewState.pitch || 0,
      bearing: viewState.bearing || 0,
    });

    if (props.gl) {
      const getContext = HTMLCanvasElement.prototype.getContext;
      // Hijack canvas.getContext to return our own WebGLContext
      // This will be called inside the maplibregl.Map constructor
      HTMLCanvasElement.prototype.getContext = (() => {
        // Unhijack immediately
        HTMLCanvasElement.prototype.getContext = getContext;
        return props.gl;
      }) as unknown as typeof getContext;
    }

    // `mapOptions` carries every prop, as upstream passes them; MapLibre ignores what it doesn't know.
    const map = new this._MapClass(mapOptions as unknown as MapOptions);
    // Props that are not part of constructor options
    if (viewState.padding) {
      map.setPadding(viewState.padding);
    }
    if (props.cursor) {
      map.getCanvas().style.cursor = props.cursor;
    }

    // add listeners
    const mapWithCameraUpdate = map as MapInstance & {
      setTransformCameraUpdate?: (value: CameraUpdateTransformFunction | null) => void;
    };
    if (typeof mapWithCameraUpdate.setTransformCameraUpdate === 'function') {
      // maplibre-gl v6+
      mapWithCameraUpdate.setTransformCameraUpdate(this._onCameraUpdate);
    } else {
      map.transformCameraUpdate = this._onCameraUpdate;
    }
    map.on('style.load', () => {
      // Map style has changed, this would have wiped out all settings from props
      this._styleComponents = {
        light: map.getLight(),
        sky: map.getSky(),
        projection: map.getProjection(),
        terrain: map.getTerrain(),
      };
      this.updateStyleComponents();
    });
    map.on('sourcedata', () => {
      // Some sources have loaded, we may need them to attach terrain
      this.updateStyleComponents();
    });
    for (const eventName of Object.keys(pointerEvents)) {
      map.on(eventName as keyof MapEventType, this._onPointerEvent);
    }
    for (const eventName of Object.keys(cameraEvents)) {
      map.on(eventName as keyof MapEventType, this._onCameraEvent);
    }
    for (const eventName of Object.keys(otherEvents)) {
      map.on(eventName as keyof MapEventType, this._onEvent);
    }
    return map;
  }

  /**
   * Parks the wrapper in `savedMaps` for `reuse()`, after removing the children's element.
   * Keeps a shallow copy of the props for `reuse()` to diff the next props against: a Svelte
   * props object goes on reading its parent's state after the component unmounts, so diffing
   * against it later would miss every prop that changed while the map was parked.
   */
  public recycle(): void {
    // Clean up unnecessary elements before storing for reuse.
    const container = this._map.getContainer();
    const children = container.querySelector('[mapboxgl-children]');
    children?.remove();

    this._recycledProps = { ...this._props };
    Maplibre.savedMaps.push(this);
  }

  public destroy(): void {
    this._destroyed = true;
    this._map.remove();
  }

  /**
   * Redraws the map once, at the end of the current microtask, however many times it is called.
   * Typically resize() and jumpTo() are reflected in the next render cycle, which is managed by
   * MapLibre's animation loop; this keeps the map in step with the surrounding UI instead.
   */
  public requestRedraw(): void {
    if (this._redrawRequested) {
      return;
    }
    this._redrawRequested = true;
    queueMicrotask(() => {
      this._redrawRequested = false;
      if (!this._destroyed) {
        // Cancels the scheduled frame and renders now.
        this._map.redraw();
      }
    });
  }

  /**
   * Applies every prop against `prev`, as upstream's `setProps` does, and requests a redraw
   * when a setting, a zoom or pitch limit, the size or the camera changed outside a gesture.
   */
  public syncAll(prev: MaplibreProps): void {
    this._syncAll(prev, this._props.styleDiffing);
  }

  private _syncAll(prev: MaplibreProps, styleDiffing: boolean | undefined): void {
    const props = this._props;

    let settingsChanged = false;
    for (const name of settingNames) {
      if (this.updateSetting(name, props[name], prev[name])) {
        settingsChanged = true;
      }
    }
    const zoomChanged = this.updateZoomConstraint(zoomRange(props), zoomRange(prev));
    const pitchChanged = this.updatePitchConstraint(pitchRange(props), pitchRange(prev));
    const sizeChanged = this.updateSize();
    const viewStateChanged = this.updateViewState();
    if (props.cursor !== prev.cursor) {
      this.updateCursor(props.cursor);
    }
    if (props.mapStyle !== prev.mapStyle) {
      this.updateStyle(props.mapStyle, styleDiffing);
    }
    this.updateStyleComponents();
    for (const name of handlerNames) {
      this.updateHandler(name, (props as HandlerProps)[name], (prev as HandlerProps)[name]);
    }

    // If 1) view state has changed to match props and
    //    2) the props change is not triggered by map events,
    // it's driven by an external state change. Redraw immediately
    if (
      settingsChanged ||
      zoomChanged ||
      pitchChanged ||
      sizeChanged ||
      (viewStateChanged && !this._map.isMoving())
    ) {
      this.requestRedraw();
    }
  }

  /**
   * Triggers a map resize if the size is controlled (`viewState` with `width`/`height`).
   * @returns true if the size changed
   */
  public updateSize(): boolean {
    const { viewState } = this._props;
    if (viewState) {
      const map = this._map;
      const canvas = map.getCanvas();
      if (viewState.width !== canvas.clientWidth || viewState.height !== canvas.clientHeight) {
        map.resize();
        return true;
      }
    }
    return false;
  }

  /**
   * Moves the camera to match the camera props, firing no camera callbacks. Does nothing while
   * the map is moving, as that would interfere with MapLibre's handlers.
   * @returns true if anything changed
   */
  public updateViewState(): boolean {
    return this._applyViewState(this._props);
  }

  // Adapted from map.jumpTo
  private _applyViewState(cameraProps: CameraProps): boolean {
    const map = this._map;
    const tr = getTransformLike(map);
    const isMoving = map.isMoving();

    // Avoid manipulating the real transform when interaction/animation is ongoing
    // as it would interfere with MapLibre's handlers
    if (!isMoving) {
      const changes = applyViewStateToTransform(tr, cameraProps);
      if (Object.keys(changes).length > 0) {
        this._internalUpdate = true;
        // jumpTo fires camera events synchronously and MapLibre doesn't catch listener errors;
        // a stuck flag would silence camera callbacks and stop the hook enforcing for good.
        try {
          map.jumpTo(changes);
        } finally {
          this._internalUpdate = false;
        }
        return true;
      }
    }

    return false;
  }

  /**
   * Applies one setting when it changed; `undefined` restores the default.
   * @returns true if the setting changed
   */
  public updateSetting(name: SettingName, next: unknown, prev: unknown): boolean {
    if (deepEqual(next, prev)) {
      return false;
    }
    const map = this._map;
    const value = next === undefined ? DEFAULT_SETTINGS[name] : next;
    switch (name) {
      case 'maxBounds':
        map.setMaxBounds(value as LngLatBoundsLike);
        break;
      case 'projection':
        // Passed through as given, a string included, as upstream does; the style-component
        // path (`updateStyleComponents`) is the one that normalises it to `{type}`.
        map.setProjection(value as ProjectionSpecification);
        break;
      case 'renderWorldCopies':
        map.setRenderWorldCopies(value as boolean);
        break;
    }
    return true;
  }

  /**
   * Sets min and max zoom in the order that never makes min > max.
   * @returns true if anything changed
   */
  public updateZoomConstraint(next: ConstraintRange, prev: ConstraintRange): boolean {
    return updateZoomConstraint(this._map, next, prev);
  }

  /**
   * Sets min and max pitch in the order that never makes min > max.
   * @returns true if anything changed
   */
  public updatePitchConstraint(next: ConstraintRange, prev: ConstraintRange): boolean {
    return updatePitchConstraint(this._map, next, prev);
  }

  public updateCursor(next: string | undefined): void {
    this._map.getCanvas().style.cursor = next || '';
  }

  public updateStyle(mapStyle: MaplibreProps['mapStyle'], styleDiffing: boolean | undefined): void {
    const options: StyleSwapOptions & StyleOptions = {
      diff: styleDiffing ?? true,
    };
    // A map option rather than a MaplibreProps field, so it is read off the live props.
    const { localIdeographFontFamily } = this._props as Pick<
      StyleOptions,
      'localIdeographFontFamily'
    >;
    if (localIdeographFontFamily !== undefined) {
      options.localIdeographFontFamily = localIdeographFontFamily;
    }
    this._map.setStyle(normalizeStyle(mapStyle === undefined ? DEFAULT_STYLE : mapStyle), options);
  }

  /**
   * Applies light, projection, sky and terrain from the props.
   * These props are special because
   * 1. They can not be applied right away. Certain conditions (style loaded, source loaded, etc.) must be met
   * 2. They can be overwritten by mapStyle
   */
  public updateStyleComponents(): void {
    const { light, projection, sky, terrain } = this._props;
    const map = this._map;
    const currProps = this._styleComponents;
    // We can safely manipulate map style once it's loaded
    if (map.style?._loaded) {
      if (light && !deepEqual(light, currProps.light)) {
        currProps.light = light;
        map.setLight(light);
      }
      if (
        projection &&
        !deepEqual(projection, currProps.projection) &&
        projection !== currProps.projection?.type
      ) {
        currProps.projection = typeof projection === 'string' ? { type: projection } : projection;
        map.setProjection(currProps.projection);
      }
      if (sky && !deepEqual(sky, currProps.sky)) {
        currProps.sky = sky;
        map.setSky(sky);
      }
      if (terrain !== undefined && !deepEqual(terrain, currProps.terrain)) {
        if (!terrain || map.getSource(terrain.source)) {
          currProps.terrain = terrain;
          map.setTerrain(terrain);
        }
      }
    }
  }

  /** Enables (with the prop's options, if any) or disables one interaction handler. */
  public updateHandler(name: HandlerName, next: unknown, prev: unknown): void {
    const newValue = next ?? true;
    const oldValue = prev ?? true;
    if (!deepEqual(newValue, oldValue)) {
      const handler = this._map[name] as Handler;
      if (newValue) {
        handler.enable(newValue);
      } else {
        handler.disable();
      }
    }
  }

  // The callback prop for `name`, looked up now, never cached.
  private _callback(name: keyof MapCallbacks): Callback | undefined {
    return this._props[name] as Callback | undefined;
  }

  private _onEvent = (e: MapEvent): void => {
    const cb = this._callback(otherEvents[e.type as keyof typeof otherEvents]);
    if (cb) {
      cb(e);
    } else if (e.type === 'error') {
      console.error((e as unknown as ErrorEvent).error);
    }
  };

  private _onCameraEvent = (e: ViewStateChangeEvent): void => {
    if (this._internalUpdate) {
      return;
    }
    e.viewState = this._proposedCameraUpdate || transformToViewState(getTransformLike(this._map));
    const cb = this._callback(cameraEvents[e.type]);
    if (cb) {
      cb(e);
    }
  };

  private _onCameraUpdate = (tr: TransformLike): Partial<TransformLike> => {
    if (this._internalUpdate) {
      return tr;
    }
    this._proposedCameraUpdate = transformToViewState(tr);
    return applyViewStateToTransform(tr, this._props);
  };

  private _queryRenderedFeatures(point: Point): MapGeoJSONFeature[] {
    const map = this._map;
    const { interactiveLayerIds = [] } = this._props;
    try {
      return map.queryRenderedFeatures(point, {
        layers: interactiveLayerIds.filter((layerId) => map.getLayer(layerId)),
      });
    } catch {
      // May fail if style is not loaded
      return [];
    }
  }

  private _updateHover(e: MapMouseEvent): void {
    const props = this._props;
    const shouldTrackHoveredFeatures =
      props.interactiveLayerIds && (props.onMouseMove || props.onMouseEnter || props.onMouseLeave);

    if (shouldTrackHoveredFeatures) {
      const eventType = e.type;
      const wasHovering = (this._hoveredFeatures?.length ?? 0) > 0;
      const features = this._queryRenderedFeatures(e.point);
      const isHovering = features.length > 0;

      if (!isHovering && wasHovering) {
        e.type = 'mouseleave';
        this._onPointerEvent(e);
      }
      this._hoveredFeatures = features;
      if (isHovering && !wasHovering) {
        e.type = 'mouseenter';
        this._onPointerEvent(e);
      }
      e.type = eventType;
    } else {
      this._hoveredFeatures = null;
    }
  }

  private _onPointerEvent = (e: MapMouseEvent): void => {
    if (e.type === 'mousemove' || e.type === 'mouseout') {
      this._updateHover(e);
    }

    const cb = this._callback(pointerEvents[e.type as keyof typeof pointerEvents]);
    if (cb) {
      if (this._props.interactiveLayerIds && e.type !== 'mouseover' && e.type !== 'mouseout') {
        e.features = this._hoveredFeatures || this._queryRenderedFeatures(e.point);
      }
      cb(e);
      delete e.features;
    }
  };
}
