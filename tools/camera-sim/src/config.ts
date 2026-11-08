import { LocalFrame, type GeoPoint } from './geo/local-frame';

/**
 * Everything that differs between machines or test runs. Defaults suit the
 * spike: everything on localhost, SITL's default home at CMAC. Any value can
 * be overridden from the page URL, so pointing the sim at another machine is
 * a link, not a rebuild:
 *
 *   ?mavlink=ws://192.168.1.10:8088/v1/ws/mavlink&media=http://192.168.1.20:8889
 */
export interface SimConfig {
  /** mavlink2rest WebSocket endpoint. camera-sim appends its own `filter`. */
  readonly mavlinkUrl: string;
  /** MediaMTX's WebRTC base URL; streams publish to `<media>/<stream>/whip`. */
  readonly mediaUrl: string;
  /** MediaMTX's RTSP base URL, shown so you know where to point VLC. */
  readonly rtspUrl: string;
  /**
   * SITL's start location (`SIM_OPOS_*` or `--home`): the centre of the
   * rendered world and the reference for SITL's ground. Set it, don't derive
   * it from a vehicle: each SITL instance can have its own home.
   */
  readonly origin: GeoPoint;
  /** SITL's home altitude above mean sea level, metres (`SIM_OPOS_ALT`). */
  readonly originAltM: number;
  /** Render SITL's terrain (`SIM_TERRAIN 1`, ArduPilot's default) or a flat world (`SIM_TERRAIN 0`). */
  readonly terrain: boolean;
  /** Where the terrain `.DAT` files are served; the dev server maps `/terrain` to SITL's terrain folder. */
  readonly terrainUrl: string;
  readonly imagery: {
    /** XYZ template with `{z}`, `{x}`, `{y}`. */
    readonly urlTemplate: string;
    /** Burned into every frame; the imagery provider requires it. */
    readonly attribution: string;
    /** Finest zoom level to load near a camera. */
    readonly maxZoom: number;
    /** Side of the square of world around the origin, metres. */
    readonly extentM: number;
  };
  readonly camera: {
    readonly hfovDeg: number;
    readonly width: number;
    readonly height: number;
    readonly fps: number;
    /** Gimbal pitch, degrees; -90 is straight down. */
    readonly pitchDeg: number;
  };
  /** Ground markers for checking the video against the GCS map. */
  readonly markers: readonly GeoPoint[];
  /** Problems with URL overrides; the defaults were kept for these. */
  readonly warnings: readonly string[];
}

/** SITL's default home (ArduPilot `locations.txt`, CMAC). */
export const CMAC: GeoPoint = { lat: -35.363262, lon: 149.165237 };
export const CMAC_ALT_M = 584;

/** Coarsest imagery level: z13 tiles are about 4 km across at CMAC's latitude. */
export const IMAGERY_ROOT_ZOOM = 13;
/** Split a tile while a camera is closer than this many times its size. */
export const IMAGERY_SPLIT_FACTOR = 2;

export const ESRI_WORLD_IMAGERY = {
  urlTemplate:
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  attribution: 'Powered by Esri | Esri, Maxar, Earthstar Geographics, and the GIS User Community',
};

/** Home, then 100 m north and 100 m east of it: fly over each and it should sit mid-frame. */
export function defaultMarkers(origin: GeoPoint): GeoPoint[] {
  const frame = new LocalFrame(origin);
  return [origin, frame.toGeo({ east: 0, north: 100 }), frame.toGeo({ east: 100, north: 0 })];
}

interface NumberRule {
  readonly min: number;
  readonly max: number;
  readonly integer?: boolean;
}

export function readConfig(search: string): SimConfig {
  const params = new URLSearchParams(search);
  const warnings: string[] = [];

  const number = (key: string, fallback: number, rule: NumberRule): number => {
    const raw = params.get(key);
    if (raw === null) return fallback;
    const value = Number(raw);
    const valid =
      raw.trim() !== '' &&
      Number.isFinite(value) &&
      value >= rule.min &&
      value <= rule.max &&
      (!rule.integer || Number.isInteger(value));
    if (valid) return value;
    warnings.push(`Ignored ${key}=${raw}: expected a number from ${rule.min} to ${rule.max}.`);
    return fallback;
  };

  const point = (raw: string): GeoPoint | undefined => {
    const parts = raw.split(',').map((p) => Number(p.trim()));
    if (parts.length !== 2) return undefined;
    const [lat, lon] = parts as [number, number];
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      Math.abs(lat) > 85 ||
      Math.abs(lon) > 180
    ) {
      return undefined;
    }
    return { lat, lon };
  };

  let origin = CMAC;
  let originAltM = CMAC_ALT_M;
  const rawOrigin = params.get('origin');
  if (rawOrigin !== null) {
    const parts = rawOrigin.split(',');
    const parsed = point(parts.slice(0, 2).join(','));
    const alt = parts.length === 3 ? Number(parts[2]!.trim()) : CMAC_ALT_M;
    const altOk =
      parts.length === 2 || (parts.length === 3 && parts[2]!.trim() !== '' && Number.isFinite(alt));
    if (parsed && altOk) {
      origin = parsed;
      originAltM = alt;
    } else {
      warnings.push(`Ignored origin=${rawOrigin}: expected "lat,lon" or "lat,lon,alt".`);
    }
  }

  let terrain = true;
  const rawTerrain = params.get('terrain');
  if (rawTerrain !== null) {
    if (rawTerrain === 'on' || rawTerrain === 'off') terrain = rawTerrain === 'on';
    else warnings.push(`Ignored terrain=${rawTerrain}: expected "on" or "off".`);
  }

  let markers = defaultMarkers(origin);
  const rawMarkers = params.get('markers');
  if (rawMarkers !== null) {
    const parsed = rawMarkers.split(';').map(point);
    if (parsed.every((p) => p !== undefined)) markers = parsed as GeoPoint[];
    else warnings.push(`Ignored markers=${rawMarkers}: expected "lat,lon;lat,lon".`);
  }

  const mediaUrl = (params.get('media') ?? 'http://localhost:8889').replace(/\/+$/, '');
  const rtspUrl = (params.get('rtsp') ?? defaultRtspUrl(mediaUrl)).replace(/\/+$/, '');

  return {
    mavlinkUrl: params.get('mavlink') ?? 'ws://localhost:8088/v1/ws/mavlink',
    mediaUrl,
    rtspUrl,
    origin,
    originAltM,
    terrain,
    terrainUrl: (params.get('terrainUrl') ?? '/terrain').replace(/\/+$/, ''),
    imagery: {
      urlTemplate: params.get('imagery') ?? ESRI_WORLD_IMAGERY.urlTemplate,
      attribution: params.get('attribution') ?? ESRI_WORLD_IMAGERY.attribution,
      maxZoom: number('zoom', 19, { min: IMAGERY_ROOT_ZOOM, max: 21, integer: true }),
      extentM: number('extent', 8000, { min: 500, max: 20000 }),
    },
    camera: {
      hfovDeg: number('hfov', 70, { min: 10, max: 150 }),
      width: number('width', 1280, { min: 160, max: 3840, integer: true }),
      height: number('height', 720, { min: 120, max: 2160, integer: true }),
      fps: number('fps', 30, { min: 1, max: 60, integer: true }),
      pitchDeg: number('pitch', -90, { min: -90, max: 30 }),
    },
    markers,
    warnings,
  };
}

/** MediaMTX serves RTSP on 8554 of the same host as its WebRTC port. */
function defaultRtspUrl(mediaUrl: string): string {
  try {
    return `rtsp://${new URL(mediaUrl).hostname}:8554`;
  } catch {
    return 'rtsp://localhost:8554';
  }
}

/** The stream path for one vehicle. A convention for people and config only. */
export function streamName(systemId: number): string {
  return `drone-${systemId}`;
}

/** The mavlink2rest URL with camera-sim's message filter appended. */
export function mavlinkSubscriptionUrl(mavlinkUrl: string): string {
  const separator = mavlinkUrl.includes('?') ? '&' : '?';
  return `${mavlinkUrl}${separator}filter=${encodeURIComponent('^(GLOBAL_POSITION_INT|HEARTBEAT)$')}`;
}
