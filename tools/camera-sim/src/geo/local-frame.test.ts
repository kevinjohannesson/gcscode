import { describe, expect, it } from 'vitest';

import { LATLON_TO_M, LocalFrame, longitudeScale } from './local-frame';

// SITL's default home (CMAC). Expected values are ArduPilot's formula worked
// out by hand: north = dLat·1e7·LATLON_TO_M, east = dLon·1e7·LATLON_TO_M·cos(meanLat).
const CMAC = { lat: -35.363262, lon: 149.165237 };

describe('LocalFrame', () => {
  const frame = new LocalFrame(CMAC);

  it('uses ArduPilot’s metres-per-1e-7-degree constant', () => {
    expect(LATLON_TO_M).toBe(0.011131884502145034);
  });

  it('maps the origin to (0, 0)', () => {
    expect(frame.toLocal(CMAC)).toEqual({ east: 0, north: 0 });
  });

  it('puts 0.001° of latitude at 111.3188 m north', () => {
    const p = frame.toLocal({ lat: CMAC.lat + 0.001, lon: CMAC.lon });
    expect(p.north).toBeCloseTo(111.31884502145034, 6);
    expect(p.east).toBeCloseTo(0, 9);
  });

  it('puts 0.001° of longitude at 90.7804 m east at CMAC’s latitude', () => {
    const p = frame.toLocal({ lat: CMAC.lat, lon: CMAC.lon + 0.001 });
    expect(p.east).toBeCloseTo(90.78041377387451, 6);
    expect(p.north).toBeCloseTo(0, 9);
  });

  it('scales longitude at the mean latitude of the two points, as get_distance_NE does', () => {
    const p = frame.toLocal({ lat: CMAC.lat + 0.01, lon: CMAC.lon + 0.01 });
    expect(p.east).toBeCloseTo(907.8603571980165, 6);
    expect(p.north).toBeCloseTo(1113.1884502145033, 6);
  });

  it('offsets 100 m north and 100 m east to ArduPilot’s coordinates', () => {
    expect(frame.toGeo({ east: 0, north: 100 }).lat).toBeCloseTo(-35.36236367950466, 10);
    expect(frame.toGeo({ east: 100, north: 0 }).lon).toBeCloseTo(149.16633855920028, 10);
  });

  it('round-trips a point 1.5 km away to within a millimetre', () => {
    const local = { east: -1500, north: 1200 };
    const back = frame.toLocal(frame.toGeo(local));
    expect(back.east).toBeCloseTo(local.east, 3);
    expect(back.north).toBeCloseTo(local.north, 3);
  });

  it('measures across the antimeridian the short way', () => {
    const dateline = new LocalFrame({ lat: 0, lon: 179.9995 });
    expect(dateline.toLocal({ lat: 0, lon: -179.9995 }).east).toBeCloseTo(111.31884502145034, 6);
  });
});

describe('longitudeScale', () => {
  it('is cos(latitude), floored at 0.01', () => {
    expect(longitudeScale(60)).toBeCloseTo(0.5, 12);
    expect(longitudeScale(90)).toBe(0.01);
  });
});
