import { describe, expect, it } from 'vitest';

import { CMAC, mavlinkSubscriptionUrl, readConfig, streamName } from './config';

describe('readConfig', () => {
  it('defaults to everything on localhost, centred on CMAC, camera straight down', () => {
    const config = readConfig('');
    expect(config.mavlinkUrl).toBe('ws://localhost:8088/v1/ws/mavlink');
    expect(config.mediaUrl).toBe('http://localhost:8889');
    expect(config.rtspUrl).toBe('rtsp://localhost:8554');
    expect(config.origin).toEqual({ lat: -35.363262, lon: 149.165237 });
    expect(config.camera).toEqual({
      hfovDeg: 70,
      width: 1280,
      height: 720,
      fps: 30,
      pitchDeg: -90,
    });
    expect(config.imagery.zoom).toBe(18);
    expect(config.imagery.extentM).toBe(2000);
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

  it('keeps the default and warns when an override is out of range or not a number', () => {
    const config = readConfig('?pitch=-120&fps=2.5&zoom=&origin=north&markers=1,2;x');
    expect(config.camera.pitchDeg).toBe(-90);
    expect(config.camera.fps).toBe(30);
    expect(config.imagery.zoom).toBe(18);
    expect(config.origin).toEqual(CMAC);
    expect(config.markers).toHaveLength(3);
    expect(config.warnings).toEqual([
      'Ignored origin=north: expected "lat,lon".',
      'Ignored markers=1,2;x: expected "lat,lon;lat,lon".',
      'Ignored zoom=: expected a number from 1 to 21.',
      'Ignored fps=2.5: expected a number from 1 to 60.',
      'Ignored pitch=-120: expected a number from -90 to 30.',
    ]);
  });

  it('treats an empty value as absent even where 0 would be in range', () => {
    const config = readConfig('?pitch=');
    expect(config.camera.pitchDeg).toBe(-90);
    expect(config.warnings).toEqual(['Ignored pitch=: expected a number from -90 to 30.']);
  });
});

describe('streamName', () => {
  it('names a vehicle’s stream after its system id', () => {
    expect(streamName(1)).toBe('drone-1');
  });
});

describe('mavlinkSubscriptionUrl', () => {
  it('asks mavlink2rest for positions only', () => {
    expect(mavlinkSubscriptionUrl('ws://localhost:8088/v1/ws/mavlink')).toBe(
      'ws://localhost:8088/v1/ws/mavlink?filter=%5E(GLOBAL_POSITION_INT)%24',
    );
  });

  it('appends to an existing query string', () => {
    expect(mavlinkSubscriptionUrl('ws://h/ws?x=1')).toBe(
      'ws://h/ws?x=1&filter=%5E(GLOBAL_POSITION_INT)%24',
    );
  });
});
