import { describe, expect, it } from 'vitest';

import { CMAC, mavlinkSubscriptionUrl, readConfig, streamName, whipEndpoint } from './config';

describe('readConfig', () => {
  it('defaults to everything on localhost, SITL’s CMAC home with terrain, camera straight down', () => {
    const config = readConfig('');
    expect(config.mavlinkUrl).toBe('ws://localhost:8088/v1/ws/mavlink');
    expect(config.mediaUrl).toBe('http://localhost:8889');
    expect(config.rtspUrl).toBe('rtsp://localhost:8554');
    expect(config.origin).toEqual({ lat: -35.363262, lon: 149.165237 });
    expect(config.originAltM).toBe(584);
    expect(config.terrain).toBe(true);
    expect(config.terrainUrl).toBe('/terrain');
    expect(config.camera).toEqual({
      hfovDeg: 70,
      width: 1280,
      height: 720,
      fps: 30,
      pitchDeg: -90,
    });
    expect(config.imagery.maxZoom).toBe(19);
    expect(config.imagery.extentM).toBe(8000);
    expect(config.warnings).toEqual([]);
  });

  it('places the default markers at home, 100 m north and 100 m east', () => {
    const [home, north, east] = readConfig('').markers;
    expect(home).toEqual(CMAC);
    expect(north?.lat).toBeCloseTo(-35.36236367950466, 10);
    expect(north?.lon).toBeCloseTo(CMAC.lon, 12);
    expect(east?.lat).toBe(CMAC.lat);
    expect(east?.lon).toBeCloseTo(149.16633855920028, 10);
  });

  it('points at another machine from the URL alone, RTSP following the media host', () => {
    const config = readConfig(
      '?mavlink=ws://192.168.1.10:8088/v1/ws/mavlink&media=http://192.168.1.20:8889/',
    );
    expect(config.mavlinkUrl).toBe('ws://192.168.1.10:8088/v1/ws/mavlink');
    expect(config.mediaUrl).toBe('http://192.168.1.20:8889');
    expect(config.rtspUrl).toBe('rtsp://192.168.1.20:8554');
  });

  it('reads camera, origin and marker overrides', () => {
    const config = readConfig(
      '?pitch=-45&hfov=90&fps=25&origin=52.1,5.2&markers=52.1,5.2;52.2,5.3',
    );
    expect(config.camera.pitchDeg).toBe(-45);
    expect(config.camera.hfovDeg).toBe(90);
    expect(config.camera.fps).toBe(25);
    expect(config.origin).toEqual({ lat: 52.1, lon: 5.2 });
    expect(config.markers).toEqual([
      { lat: 52.1, lon: 5.2 },
      { lat: 52.2, lon: 5.3 },
    ]);
  });

  it('reads SITL’s home altitude as an optional third origin value', () => {
    expect(readConfig('?origin=52.1,5.2,12.5')).toMatchObject({
      origin: { lat: 52.1, lon: 5.2 },
      originAltM: 12.5,
    });
    expect(readConfig('?origin=52.1,5.2').originAltM).toBe(584);
  });

  it('switches terrain off for SITL running with SIM_TERRAIN 0', () => {
    expect(readConfig('?terrain=off').terrain).toBe(false);
    expect(readConfig('?terrain=on').terrain).toBe(true);
  });

  it('reads the imagery detail and world size', () => {
    const config = readConfig('?zoom=20&extent=4000&terrainUrl=http://mac.local:5174/terrain/');
    expect(config.imagery.maxZoom).toBe(20);
    expect(config.imagery.extentM).toBe(4000);
    expect(config.terrainUrl).toBe('http://mac.local:5174/terrain');
  });

  it('keeps the default and warns when an override is out of range or not a number', () => {
    const config = readConfig(
      '?pitch=-120&fps=2.5&zoom=&origin=north&markers=1,2;x&terrain=yes&extent=50',
    );
    expect(config.camera.pitchDeg).toBe(-90);
    expect(config.camera.fps).toBe(30);
    expect(config.imagery.maxZoom).toBe(19);
    expect(config.imagery.extentM).toBe(8000);
    expect(config.origin).toEqual(CMAC);
    expect(config.terrain).toBe(true);
    expect(config.markers).toHaveLength(3);
    expect(config.warnings).toEqual([
      'Ignored origin=north: expected "lat,lon" or "lat,lon,alt".',
      'Ignored terrain=yes: expected "on" or "off".',
      'Ignored markers=1,2;x: expected "lat,lon;lat,lon".',
      'Ignored zoom=: expected a number from 13 to 21.',
      'Ignored extent=50: expected a number from 500 to 20000.',
      'Ignored fps=2.5: expected a number from 1 to 60.',
      'Ignored pitch=-120: expected a number from -90 to 30.',
    ]);
  });

  it('rejects an origin altitude that isn’t a number', () => {
    const config = readConfig('?origin=52.1,5.2,high');
    expect(config.origin).toEqual(CMAC);
    expect(config.originAltM).toBe(584);
    expect(config.warnings).toHaveLength(1);
  });

  it('treats an empty value as absent even where 0 would be in range', () => {
    const config = readConfig('?pitch=');
    expect(config.camera.pitchDeg).toBe(-90);
    expect(config.warnings).toEqual(['Ignored pitch=: expected a number from -90 to 30.']);
  });
});

describe('publisher', () => {
  it('has no default', () => {
    expect(readConfig('').publisher).toBeUndefined();
  });

  it('is the label in the URL', () => {
    expect(readConfig('?publisher=headless').publisher).toBe('headless');
  });

  it('is nothing when the label is empty', () => {
    expect(readConfig('?publisher=').publisher).toBeUndefined();
  });
});

describe('streamName', () => {
  it('names a vehicle’s stream after its system id', () => {
    expect(streamName(1)).toBe('drone-1');
  });
});

describe('whipEndpoint', () => {
  it('publishes vehicle 1 by default where gcscode’s Video panel plays', () => {
    // gcscode.video.whepUrl defaults to http://localhost:8889/drone-1/whep: the same MediaMTX path.
    expect(whipEndpoint(readConfig('').mediaUrl, 1)).toBe('http://localhost:8889/drone-1/whip');
  });

  it('adds the publisher label as a query', () => {
    expect(whipEndpoint('http://localhost:8889', 1, 'headless')).toBe(
      'http://localhost:8889/drone-1/whip?publisher=headless',
    );
  });

  it('encodes the publisher label', () => {
    expect(whipEndpoint('http://localhost:8889', 1, 'a b&c')).toBe(
      'http://localhost:8889/drone-1/whip?publisher=a%20b%26c',
    );
  });
});

describe('mavlinkSubscriptionUrl', () => {
  it('asks mavlink2rest for positions and heartbeats only', () => {
    expect(mavlinkSubscriptionUrl('ws://localhost:8088/v1/ws/mavlink')).toBe(
      'ws://localhost:8088/v1/ws/mavlink?filter=%5E(GLOBAL_POSITION_INT%7CHEARTBEAT)%24',
    );
  });

  it('appends to an existing query string', () => {
    expect(mavlinkSubscriptionUrl('ws://h/ws?x=1')).toBe(
      'ws://h/ws?x=1&filter=%5E(GLOBAL_POSITION_INT%7CHEARTBEAT)%24',
    );
  });
});
