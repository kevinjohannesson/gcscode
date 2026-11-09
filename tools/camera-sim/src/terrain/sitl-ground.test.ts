import { describe, expect, it } from 'vitest';

import {
  TerrainDatabase,
  TerrainFile,
  BLOCK_BYTES,
  BLOCK_COLUMNS,
  BLOCK_ROWS,
  crc16Ccitt,
} from './ap-terrain';
import { FLAT_GROUND, SitlGround, toE7 } from './sitl-ground';

/**
 * One block at the south-west corner of S36E149 whose heights rise 2 m per
 * 100 m north and 3 m per 100 m east from 500 m (see ap-terrain.test.ts).
 */
function rampDatabase(): TerrainDatabase {
  const buffer = new ArrayBuffer(BLOCK_BYTES);
  const view = new DataView(buffer);
  view.setUint32(0, 0xffffffff, true);
  view.setUint32(4, 0x00ffffff, true);
  view.setInt32(8, -360000000, true);
  view.setInt32(12, 1490000000, true);
  view.setUint16(18, 1, true);
  view.setUint16(20, 100, true);
  for (let r = 0; r < BLOCK_ROWS; r++) {
    for (let c = 0; c < BLOCK_COLUMNS; c++)
      view.setInt16(22 + (r * BLOCK_COLUMNS + c) * 2, 500 + 2 * r + 3 * c, true);
  }
  view.setUint16(16, crc16Ccitt(new Uint8Array(buffer, 0, 1821)), true);
  const db = new TerrainDatabase();
  db.add(new TerrainFile(buffer, -36, 149, 100));
  return db;
}

// Points inside the block, with their terrain heights worked out by hand.
const HOME = { lat: -35.9986526, lon: 149.0030894 }; // 511.3467247 m
const NORTH_EAST = { lat: -35.9998, lon: 149.0009 }; // 22.264 m north, 81.053 m east: 502.8769 m
const OUTSIDE = { lat: -35.5, lon: 149.5 }; // no block there

describe('SitlGround (SIM_Aircraft::ground_height_difference)', () => {
  it('puts the ground at home altitude at home', () => {
    expect(new SitlGround(rampDatabase(), HOME).heightAt(HOME)).toBe(0);
  });

  it('follows terrain relative to home elsewhere: terrain(here) − terrain(home)', () => {
    // (500 + 2·0.2226377 + 3·0.8105306) − 511.3467247
    expect(new SitlGround(rampDatabase(), HOME).heightAt(NORTH_EAST)).toBeCloseTo(-8.469858, 5);
  });

  it('is flat at home altitude where there is no terrain data', () => {
    expect(new SitlGround(rampDatabase(), HOME).heightAt(OUTSIDE)).toBe(0);
  });

  it('is flat everywhere when home itself has no data', () => {
    const ground = new SitlGround(rampDatabase(), OUTSIDE);
    expect(ground.hasHomeTerrain).toBe(false);
    expect(ground.heightAt(NORTH_EAST)).toBe(0);
  });

  it('looks positions up as ArduPilot Locations (degrees × 10^7, rounded)', () => {
    expect(toE7(-35.363262)).toBe(-353632620);
    expect(toE7(149.16523704)).toBe(1491652370);
    expect(toE7(149.16523706)).toBe(1491652371);
  });
});

describe('FLAT_GROUND (SIM_TERRAIN 0)', () => {
  it('is home altitude everywhere', () => {
    expect(FLAT_GROUND.heightAt(NORTH_EAST)).toBe(0);
  });
});
