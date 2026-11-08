/**
 * Reads ArduPilot's terrain database (`AP_Terrain` `.DAT` files) and looks up
 * heights exactly the way ArduPilot does, so the ground camera-sim renders is
 * the ground SITL flies over.
 *
 * Transcribed from `libraries/AP_Terrain/`: the block layout in
 * `AP_Terrain.h`, `calculate_grid_info` and `grid_bitnum` in `TerrainUtil.cpp`,
 * file naming, `east_blocks` and the block checks in `TerrainIO.cpp`, and the
 * interpolation in `AP_Terrain::height_amsl`.
 *
 * Positions are ArduPilot `Location`s: latitude and longitude as integer
 * degrees × 10^7, with C integer arithmetic where ArduPilot uses it.
 */

/** Metres per 1e-7 degree (`LATLON_TO_M`) and its inverse (`LATLON_TO_M_INV`). */
const LATLON_TO_M = 0.011131884502145034;
const LATLON_TO_M_INV = 89.83204953368922;

/** A block on disk is a 2048-byte record. */
export const BLOCK_BYTES = 2048;
/** Heights per block: 28 rows north by 32 columns east (`TERRAIN_GRID_BLOCK_SIZE_X/Y`). */
export const BLOCK_ROWS = 28;
export const BLOCK_COLUMNS = 32;
/** Blocks overlap by one 4×4 MAVLink grid, so they step 24 rows / 28 columns. */
export const BLOCK_STEP_ROWS = 24;
export const BLOCK_STEP_COLUMNS = 28;
export const GRID_FORMAT_VERSION = 1;

// Byte offsets inside a packed `grid_block`.
const OFFSET_HEIGHTS = 22;
const OFFSET_VERSION_MINOR = OFFSET_HEIGHTS + BLOCK_ROWS * BLOCK_COLUMNS * 2 + 7; // 1821
/** `TERRAIN_LATLON_EQUAL` with the default `TERRAIN_MARGIN` of 0.05: 5 × 1e-7°. */
const CORNER_TOLERANCE_E7 = 5;

/** C integer division: truncates toward zero. */
function cDiv(a: number, b: number): number {
  return Math.trunc(a / b);
}

/** `Location::longitude_scale`, taking latitude in degrees × 10^7. */
function longitudeScale(latE7: number): number {
  return Math.max(Math.cos(latE7 * 1e-7 * (Math.PI / 180)), 0.01);
}

/** `Location::get_distance_NE`: metres north and east from `from` to `to`. */
function distanceNE(
  fromLatE7: number,
  fromLonE7: number,
  toLatE7: number,
  toLonE7: number,
): { north: number; east: number } {
  return {
    north: (toLatE7 - fromLatE7) * LATLON_TO_M,
    east: (toLonE7 - fromLonE7) * LATLON_TO_M * longitudeScale(cDiv(fromLatE7 + toLatE7, 2)),
  };
}

/** `Location::offset_latlng`, with ArduPilot's integer truncation. */
function offsetLatLon(latE7: number, lonE7: number, north: number, east: number): [number, number] {
  const dLat = Math.trunc(north * LATLON_TO_M_INV);
  const dLon = Math.trunc((east * LATLON_TO_M_INV) / longitudeScale(latE7 + cDiv(dLat, 2)));
  return [latE7 + dLat, lonE7 + dLon];
}

/** The whole degree whose square holds this coordinate: floor, the way ArduPilot writes it. */
export function degreeOf(e7: number): number {
  return cDiv(e7 < 0 ? e7 - 9999999 : e7, 10_000_000);
}

/** `S36E149.DAT` for the square whose south-west corner is 36°S, 149°E. */
export function datFileName(latDegrees: number, lonDegrees: number): string {
  const lat = String(Math.min(Math.abs(latDegrees), 99)).padStart(2, '0');
  const lon = String(Math.min(Math.abs(lonDegrees), 999)).padStart(3, '0');
  return `${latDegrees < 0 ? 'S' : 'N'}${lat}${lonDegrees < 0 ? 'W' : 'E'}${lon}.DAT`;
}

/** CRC-16/CCITT as `crc16_ccitt` in `AP_Math/crc.cpp` (polynomial 0x1021, MSB first). */
export function crc16Ccitt(bytes: Uint8Array, crc = 0): number {
  let c = crc;
  for (const byte of bytes) {
    c ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) {
      c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff;
    }
  }
  return c;
}

export interface TerrainBlock {
  /** South-west corner, degrees × 10^7. */
  readonly latE7: number;
  readonly lonE7: number;
  readonly spacing: number;
  /** Which 4×4 sub-grids hold data; bit `col/4 + 8·(row/4)`. Split into 32-bit halves. */
  readonly bitmapLow: number;
  readonly bitmapHigh: number;
  /** Heights in metres, row-major: `heights[row * 32 + column]`, row 0 southmost. */
  readonly heights: Int16Array;
}

/**
 * Parses block `index` of a file the way `AP_Terrain::read_block` accepts it.
 * Returns undefined for anything ArduPilot would treat as a missing block: a
 * short read, an empty bitmap, the wrong corner, spacing or version, or a bad CRC.
 */
export function readBlock(
  file: ArrayBuffer,
  index: number,
  expected: { latE7: number; lonE7: number; spacing: number },
): TerrainBlock | undefined {
  const start = index * BLOCK_BYTES;
  if (index < 0 || start + BLOCK_BYTES > file.byteLength) return undefined;
  const view = new DataView(file, start, BLOCK_BYTES);
  const bitmapLow = view.getUint32(0, true);
  const bitmapHigh = view.getUint32(4, true);
  const latE7 = view.getInt32(8, true);
  const lonE7 = view.getInt32(12, true);
  const crc = view.getUint16(16, true);
  const version = view.getUint16(18, true);
  const spacing = view.getUint16(20, true);
  if (
    (bitmapLow === 0 && bitmapHigh === 0) ||
    Math.abs(latE7 - expected.latE7) > CORNER_TOLERANCE_E7 ||
    Math.abs(lonE7 - expected.lonE7) > CORNER_TOLERANCE_E7 ||
    spacing !== expected.spacing ||
    version !== GRID_FORMAT_VERSION
  ) {
    return undefined;
  }
  // The CRC covers everything before version_minor, taken with the crc field zeroed.
  const covered = new Uint8Array(file.slice(start, start + OFFSET_VERSION_MINOR));
  covered[16] = 0;
  covered[17] = 0;
  if (crc16Ccitt(covered) !== crc) return undefined;

  const heights = new Int16Array(BLOCK_ROWS * BLOCK_COLUMNS);
  for (let i = 0; i < heights.length; i++) heights[i] = view.getInt16(OFFSET_HEIGHTS + i * 2, true);
  return { latE7, lonE7, spacing, bitmapLow, bitmapHigh, heights };
}

/** `AP_Terrain::check_bitmap` via `grid_bitnum`. */
function hasPoint(block: TerrainBlock, row: number, column: number): boolean {
  const bit = Math.trunc(column / 4) + 8 * Math.trunc(row / 4);
  return bit < 32
    ? ((block.bitmapLow >>> bit) & 1) === 1
    : ((block.bitmapHigh >>> (bit - 32)) & 1) === 1;
}

/**
 * One degree square's file. Blocks are parsed on first use and cached,
 * including the ones found missing.
 */
export class TerrainFile {
  public readonly latDegrees: number;
  public readonly lonDegrees: number;
  private readonly _buffer: ArrayBuffer;
  private readonly _spacing: number;
  private readonly _eastBlocks: number;
  private readonly _blocks = new Map<number, TerrainBlock | undefined>();

  public constructor(buffer: ArrayBuffer, latDegrees: number, lonDegrees: number, spacing: number) {
    this._buffer = buffer;
    this.latDegrees = latDegrees;
    this.lonDegrees = lonDegrees;
    this._spacing = spacing;
    this._eastBlocks = TerrainFile.eastBlocks(latDegrees, lonDegrees, spacing);
  }

  /** `AP_Terrain::east_blocks`: blocks per row at this latitude, with two spare. */
  public static eastBlocks(latDegrees: number, lonDegrees: number, spacing: number): number {
    const lat1 = latDegrees * 10_000_000;
    const lon1 = lonDegrees * 10_000_000;
    const [lat2, lon2] = offsetLatLon(
      lat1,
      (lonDegrees + 1) * 10_000_000,
      0,
      2 * spacing * BLOCK_COLUMNS,
    );
    return Math.trunc(distanceNE(lat1, lon1, lat2, lon2).east / (spacing * BLOCK_STEP_COLUMNS));
  }

  /** Number of blocks the file holds data for. */
  public countBlocksWithData(): number {
    let count = 0;
    const total = Math.floor(this._buffer.byteLength / BLOCK_BYTES);
    for (let i = 0; i < total; i++) {
      const gridX = Math.floor(i / this._eastBlocks);
      const gridY = i % this._eastBlocks;
      if (this._block(gridX, gridY) !== undefined) count++;
    }
    return count;
  }

  /** `AP_Terrain::height_amsl` (uncorrected) for a point inside this square, or undefined without data. */
  public heightAmsl(latE7: number, lonE7: number): number | undefined {
    const refLat = this.latDegrees * 10_000_000;
    const refLon = this.lonDegrees * 10_000_000;
    const offset = distanceNE(refLat, refLon, latE7, lonE7);
    // Not this square's ground. (ArduPilot never asks; the database routes by square.)
    if (offset.north < 0 || offset.east < 0) return undefined;
    const idxX = Math.trunc(offset.north / this._spacing);
    const idxY = Math.trunc(offset.east / this._spacing);
    const gridX = Math.trunc(idxX / BLOCK_STEP_ROWS);
    const gridY = Math.trunc(idxY / BLOCK_STEP_COLUMNS);
    const row = idxX % BLOCK_STEP_ROWS;
    const column = idxY % BLOCK_STEP_COLUMNS;
    const fracX = (offset.north - idxX * this._spacing) / this._spacing;
    const fracY = (offset.east - idxY * this._spacing) / this._spacing;

    const block = this._block(gridX, gridY);
    if (block === undefined) return undefined;
    if (
      !hasPoint(block, row, column) ||
      !hasPoint(block, row, column + 1) ||
      !hasPoint(block, row + 1, column) ||
      !hasPoint(block, row + 1, column + 1)
    ) {
      return undefined;
    }
    const h = (r: number, c: number) => block.heights[r * BLOCK_COLUMNS + c]!;
    const avg1 = (1 - fracX) * h(row, column) + fracX * h(row + 1, column);
    const avg2 = (1 - fracX) * h(row, column + 1) + fracX * h(row + 1, column + 1);
    return (1 - fracY) * avg1 + fracY * avg2;
  }

  private _block(gridX: number, gridY: number): TerrainBlock | undefined {
    const index = this._eastBlocks * gridX + gridY;
    if (this._blocks.has(index)) return this._blocks.get(index);
    const [latE7, lonE7] = offsetLatLon(
      this.latDegrees * 10_000_000,
      this.lonDegrees * 10_000_000,
      gridX * BLOCK_STEP_ROWS * this._spacing,
      gridY * BLOCK_STEP_COLUMNS * this._spacing,
    );
    const block = readBlock(this._buffer, index, { latE7, lonE7, spacing: this._spacing });
    this._blocks.set(index, block);
    return block;
  }
}

/** All the degree files camera-sim has, looked up by the square a point falls in. */
export class TerrainDatabase {
  private readonly _files = new Map<string, TerrainFile>();

  public add(file: TerrainFile): void {
    this._files.set(datFileName(file.latDegrees, file.lonDegrees), file);
  }

  public get files(): readonly TerrainFile[] {
    return [...this._files.values()];
  }

  /** Height above mean sea level at a `Location`, or undefined where ArduPilot has no data. */
  public heightAmslE7(latE7: number, lonE7: number): number | undefined {
    const file = this._files.get(datFileName(degreeOf(latE7), degreeOf(lonE7)));
    return file?.heightAmsl(latE7, lonE7);
  }
}
