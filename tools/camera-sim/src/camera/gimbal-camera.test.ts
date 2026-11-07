import { describe, expect, it } from 'vitest';

import {
  applyGimbalPose,
  createGimbalCamera,
  toScenePosition,
  verticalFovDeg,
} from './gimbal-camera';

const settings = { hfovDeg: 70, width: 1280, height: 720 };

/** Where a ground point lands in the image: x and y in -1..1, +x right, +y up. */
function imagePosition(
  pose: { east: number; north: number; up: number; headingDeg: number },
  pitchDeg: number,
  point: { east: number; north: number; up?: number },
) {
  const camera = createGimbalCamera(settings);
  applyGimbalPose(camera, pose, pitchDeg);
  const p = toScenePosition(point.east, point.north, point.up ?? 0).project(camera);
  return { x: p.x, y: p.y };
}

describe('verticalFovDeg', () => {
  it('matches the horizontal field of view for a square image', () => {
    expect(verticalFovDeg(70, 1)).toBeCloseTo(70, 9);
  });

  it('gives 90° horizontal at 16:9 a vertical of 58.7155°', () => {
    // 2·atan(tan(45°) / (16/9)) = 2·atan(0.5625)
    expect(verticalFovDeg(90, 16 / 9)).toBeCloseTo(58.71550708, 6);
  });
});

describe('gimbal pointing (the spike’s done-when, in numbers)', () => {
  const overHome = { east: 0, north: 0, up: 50, headingDeg: 0 };

  it('centres the point directly below when pitched straight down', () => {
    const p = imagePosition(overHome, -90, { east: 0, north: 0 });
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.y).toBeCloseTo(0, 9);
  });

  it('centres a marker 100 m north once the vehicle is over it, at any heading', () => {
    for (const headingDeg of [0, 37, 90, 271]) {
      const p = imagePosition({ east: 0, north: 100, up: 50, headingDeg }, -90, {
        east: 0,
        north: 100,
      });
      expect(p.x).toBeCloseTo(0, 9);
      expect(p.y).toBeCloseTo(0, 9);
    }
  });

  it('puts north at the top and east on the right when heading north', () => {
    expect(imagePosition(overHome, -90, { east: 0, north: 10 }).y).toBeGreaterThan(0.2);
    expect(imagePosition(overHome, -90, { east: 10, north: 0 }).x).toBeGreaterThan(0.2);
  });

  it('turns with the vehicle: heading east puts east at the top and south on the right', () => {
    const headingEast = { ...overHome, headingDeg: 90 };
    const east = imagePosition(headingEast, -90, { east: 10, north: 0 });
    expect(east.y).toBeGreaterThan(0.2);
    expect(east.x).toBeCloseTo(0, 9);
    const south = imagePosition(headingEast, -90, { east: 0, north: -10 });
    expect(south.x).toBeGreaterThan(0.2);
    expect(south.y).toBeCloseTo(0, 9);
  });

  it('centres the ground point the pitch aims at: 50 m up at -45° looks 50 m ahead', () => {
    const p = imagePosition({ ...overHome, headingDeg: 90 }, -45, { east: 50, north: 0 });
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.y).toBeCloseTo(0, 9);
  });

  it('sees the horizon on the centre line when level', () => {
    const p = imagePosition(overHome, 0, { east: 0, north: 5000, up: 50 });
    expect(p.y).toBeCloseTo(0, 9);
  });
});
