import { describe, expect, it } from 'vitest';

import {
  BLOCK_BYTES,
  BLOCK_COLUMNS,
  BLOCK_ROWS,
  crc16Ccitt,
  datFileName,
  degreeOf,
  readBlock,
  TerrainDatabase,
  TerrainFile,
} from './ap-terrain';

/*
 * A synthetic S36E149.DAT. Each block's heights are a linear function of the
 * grid position, so ArduPilot's bilinear interpolation reproduces the function
 * exactly and every expected height below can be worked out by hand:
 * north/east offsets from the square's south-west corner (36°S, 149°E) use
 * get_distance_NE's formula, then the block's function.
 *
 *   block (0,0): 500 + 2·(north/100) + 3·(east/100)
 *   block (0,1): 700 + (north/100) + (east/100 − 28)       28 columns per block step
 *   block (1,0): 900 + 4·(north/100 − 24) + (east/100)     24 rows per block step
 *
 * Block corners and the 34 blocks per row come from ArduPilot's offset_latlng
 * and east_blocks; SITL's own S36E149.DAT holds its blocks at exactly these offsets.
 */
const EAST_BLOCKS = 34;
const SQUARE = { latE7: -360000000, lonE7: 1490000000 };

interface BlockSpec {
  gridX: number;
  gridY: number;
  latE7: number;
  lonE7: number;
  height: (row: number, column: number) => number;
  bitmapLow?: number;
  bitmapHigh?: number;
  spacing?: number;
  version?: number;
  corruptCrc?: boolean;
}

function writeBlock(buffer: ArrayBuffer, spec: BlockSpec): void {
  const start = (EAST_BLOCKS * spec.gridX + spec.gridY) * BLOCK_BYTES;
  const view = new DataView(buffer, start, BLOCK_BYTES);
  view.setUint32(0, spec.bitmapLow ?? 0xffffffff, true);
  view.setUint32(4, spec.bitmapHigh ?? 0x00ffffff, true); // 56 bits: all sub-grids present
  view.setInt32(8, spec.latE7, true);
  view.setInt32(12, spec.lonE7, true);
  view.setUint16(18, spec.version ?? 1, true);
  view.setUint16(20, spec.spacing ?? 100, true);
  for (let r = 0; r < BLOCK_ROWS; r++) {
    for (let c = 0; c < BLOCK_COLUMNS; c++) {
      view.setInt16(22 + (r * BLOCK_COLUMNS + c) * 2, spec.height(r, c), true);
    }
  }
  view.setUint16(1814, spec.gridX, true);
  view.setUint16(1816, spec.gridY, true);
  view.setInt16(1818, 149, true);
  view.setInt8(1820, -36);
  view.setUint8(1821, 1);
  const crc = crc16Ccitt(new Uint8Array(buffer, start, 1821));
  view.setUint16(16, spec.corruptCrc ? crc ^ 1 : crc, true);
}

const BLOCK_00: BlockSpec = {
  gridX: 0,
  gridY: 0,
  ...SQUARE,
  height: (r, c) => 500 + 2 * r + 3 * c,
};
const BLOCK_01: BlockSpec = {
  gridX: 0,
  gridY: 1,
  latE7: -360000000,
  lonE7: 1490310907,
  height: (r, c) => 700 + r + c,
};
const BLOCK_10: BlockSpec = {
  gridX: 1,
  gridY: 0,
  latE7: -359784404,
  lonE7: 1490000000,
  height: (r, c) => 900 + 4 * r + c,
};

function datFile(...blocks: BlockSpec[]): ArrayBuffer {
  const buffer = new ArrayBuffer((EAST_BLOCKS + 1) * BLOCK_BYTES);
  blocks.forEach((b) => writeBlock(buffer, b));
  return buffer;
}

function database(...blocks: BlockSpec[]): TerrainDatabase {
  const db = new TerrainDatabase();
  db.add(new TerrainFile(datFile(...blocks), -36, 149, 100));
  return db;
}

// Points as degrees × 10^7, with their expected heights.
const A = { latE7: -359986526, lonE7: 1490030894, height: 511.346724710602 }; // block (0,0)
const B = { latE7: -359978000, lonE7: 1490345678, height: 705.5808076245553 }; // block (0,1)
const C = { latE7: -359770000, lonE7: 1490009000, height: 907.223985136786 }; // block (1,0)

describe('crc16Ccitt', () => {
  it('gives CRC-16/XMODEM’s check value for "123456789"', () => {
    expect(crc16Ccitt(new TextEncoder().encode('123456789'))).toBe(0x31c3);
  });
});

describe('degreeOf and datFileName', () => {
  it('floors to the square’s south-west degree, as ArduPilot does with integer maths', () => {
    expect(degreeOf(-353632620)).toBe(-36);
    expect(degreeOf(1491652370)).toBe(149);
    expect(degreeOf(-10000000)).toBe(-1);
    expect(degreeOf(-1)).toBe(-1);
    expect(degreeOf(0)).toBe(0);
    expect(degreeOf(9999999)).toBe(0);
  });

  it('names files like ArduPilot’s terrain folder does', () => {
    expect(datFileName(-36, 149)).toBe('S36E149.DAT');
    expect(datFileName(52, 4)).toBe('N52E004.DAT');
    expect(datFileName(-1, -75)).toBe('S01W075.DAT');
  });
});

describe('TerrainFile', () => {
  it('lays out 34 blocks per row at 36°S with 100 m spacing', () => {
    expect(TerrainFile.eastBlocks(-36, 149, 100)).toBe(EAST_BLOCKS);
  });

  it('interpolates inside the first block', () => {
    expect(database(BLOCK_00).heightAmslE7(A.latE7, A.lonE7)).toBeCloseTo(A.height, 9);
  });

  it('finds the block one step east', () => {
    expect(database(BLOCK_01).heightAmslE7(B.latE7, B.lonE7)).toBeCloseTo(B.height, 9);
  });

  it('finds the block one row north, 34 blocks further into the file', () => {
    expect(database(BLOCK_10).heightAmslE7(C.latE7, C.lonE7)).toBeCloseTo(C.height, 9);
  });

  it('returns nothing where the file has no block', () => {
    expect(database(BLOCK_00).heightAmslE7(B.latE7, B.lonE7)).toBeUndefined();
  });

  it('returns nothing when a needed 4×4 sub-grid is missing from the bitmap', () => {
    // A sits in rows 1–2, columns 2–3: sub-grid 0.
    expect(
      database({ ...BLOCK_00, bitmapLow: 0xfffffffe }).heightAmslE7(A.latE7, A.lonE7),
    ).toBeUndefined();
    expect(
      database({ ...BLOCK_00, bitmapLow: 0xfffffffd }).heightAmslE7(A.latE7, A.lonE7),
    ).toBeCloseTo(A.height, 9);
  });

  it('reads the bitmap as column sub-grid + 8 × row sub-grid', () => {
    // 450.0 m north, 45.0 m east: rows 4–5, column 0–1, so sub-grid row 1, column 0 = bit 8.
    const D = { latE7: -359959575, lonE7: 1490005000, height: 510.3510458051524 };
    const without = (bit: number) => ({ ...BLOCK_00, bitmapLow: 0xffffffff & ~(1 << bit) });
    expect(database(without(8)).heightAmslE7(D.latE7, D.lonE7)).toBeUndefined();
    expect(database(without(1)).heightAmslE7(D.latE7, D.lonE7)).toBeCloseTo(D.height, 9);
  });

  it('needs all four surrounding points: each corner of a cell can sit in its own sub-grid', () => {
    // 389.6 m north, 389.1 m east: the cell between rows 3–4 and columns 3–4 touches
    // sub-grids 0 (row 3, col 3), 1 (row 3, col 4), 8 (row 4, col 3) and 9 (row 4, col 4).
    const E = { latE7: -359965000, lonE7: 1490043200, height: 519.4642034800308 };
    const without = (bit: number) => ({ ...BLOCK_00, bitmapLow: 0xffffffff & ~(1 << bit) });
    for (const bit of [0, 1, 8, 9]) {
      expect(database(without(bit)).heightAmslE7(E.latE7, E.lonE7)).toBeUndefined();
    }
    expect(database(without(2)).heightAmslE7(E.latE7, E.lonE7)).toBeCloseTo(E.height, 9);
  });

  it('has nothing for a point west of its own square', () => {
    // 2560 m north (block row 1) but 81 m west of 149°E: not this file's ground.
    const file = new TerrainFile(datFile(BLOCK_10), -36, 149, 100);
    expect(file.heightAmsl(-359770000, 1489991000)).toBeUndefined();
  });

  it('counts the blocks that hold data', () => {
    const file = new TerrainFile(datFile(BLOCK_00, BLOCK_10), -36, 149, 100);
    expect(file.countBlocksWithData()).toBe(2);
  });
});

describe('readBlock rejects what ArduPilot rejects', () => {
  const expected = { latE7: SQUARE.latE7, lonE7: SQUARE.lonE7, spacing: 100 };

  it('accepts a good block', () => {
    expect(readBlock(datFile(BLOCK_00), 0, expected)?.heights[1 * BLOCK_COLUMNS + 2]).toBe(508);
  });

  it.each([
    ['a bad CRC', { corruptCrc: true }],
    ['another spacing', { spacing: 30 }],
    ['another format version', { version: 2 }],
    ['an empty bitmap (with a valid CRC)', { bitmapLow: 0, bitmapHigh: 0 }],
  ])('rejects %s', (_label, change) => {
    expect(readBlock(datFile({ ...BLOCK_00, ...change }), 0, expected)).toBeUndefined();
  });

  it('rejects a corner more than 5 × 1e-7° off, and accepts one within', () => {
    expect(
      readBlock(datFile({ ...BLOCK_00, lonE7: SQUARE.lonE7 + 6 }), 0, expected),
    ).toBeUndefined();
    expect(readBlock(datFile({ ...BLOCK_00, lonE7: SQUARE.lonE7 + 5 }), 0, expected)).toBeDefined();
  });

  it('treats a block past the end of the file as missing', () => {
    expect(readBlock(datFile(BLOCK_00), EAST_BLOCKS + 1, expected)).toBeUndefined();
  });
});
