// Unified Coordinate-to-Elevation Lookup for Jezero HiRISE DTM
// Product: DTEEC_048842_1985_048908_1985_U01
// Vertically referenced to Mars MOLA Reference Areoid (Smith et al., 2001)
//
// Used identically across:
// 1. Map clicks & coordinates inspection (MarsPlan)
// 2. A* Terrain-aware route planning & slope calculations (routePlanner)
// 3. Walk 3D ground surface mesh displacement (MarsSurface)
// 4. Route guidance ribbon & waypoint heights (MarsSurface)

import {
  MEASURED_DTM_METADATA,
  getMeasuredGridData,
} from './jezeroMeasuredElevationData';
import {
  CROP_HALF_WIDTH_METERS,
  CROP_HALF_HEIGHT_METERS,
  isWithinCropLocalMeters,
} from './jezeroHiRISE';

export { MEASURED_DTM_METADATA, getMeasuredGridData };

export const MISSING_DATA_VALUE = -32768.0;

// Base MOLA elevation at crop center (x: 0, z: 0) used for relative 3D rendering
export const BASELINE_MOLA_ELEVATION = -2574.414;

const COLS = MEASURED_DTM_METADATA.gridDimensions.cols; // 321
const ROWS = MEASURED_DTM_METADATA.gridDimensions.rows; // 321
const GRID_SPACING = MEASURED_DTM_METADATA.gridSpacingMeters; // ~8.0773 m

// Optional test fixture hook for simulating missing data or steep barriers in verification tests
export type ElevationOverrideFn = (x: number, z: number) => number | null;
let activeElevationOverride: ElevationOverrideFn | null = null;

export function setTestElevationOverride(fn: ElevationOverrideFn | null): void {
  activeElevationOverride = fn;
}

/**
 * Checks if a given coordinate in local meters is within the measured grid bounds
 * and contains valid (non-missing) elevation data.
 */
export function isMeasuredCellValid(x: number, z: number): boolean {
  if (!isWithinCropLocalMeters(x, z)) return false;
  const elev = getMeasuredElevation(x, z);
  return elev !== MISSING_DATA_VALUE && elev > -10000 && !isNaN(elev);
}

/**
 * Returns the true measured elevation in meters relative to Mars MOLA reference areoid
 * at local Cartesian coordinates (x: East, z: South) relative to the HiRISE crop center.
 *
 * If (x, z) is outside the crop boundary or falls on missing-data cells, returns MISSING_DATA_VALUE (-32768.0).
 * Bilinearly interpolates between grid postings.
 */
export function getMeasuredElevation(x: number, z: number): number {
  if (activeElevationOverride) {
    const override = activeElevationOverride(x, z);
    if (override !== null) return override;
  }

  if (
    x < -CROP_HALF_WIDTH_METERS ||
    x > CROP_HALF_WIDTH_METERS ||
    z < -CROP_HALF_HEIGHT_METERS ||
    z > CROP_HALF_HEIGHT_METERS
  ) {
    return MISSING_DATA_VALUE;
  }

  const grid = getMeasuredGridData();

  // Map local meters (-1292.37 to +1292.37) to grid indices (0 to COLS - 1)
  const normX = (x + CROP_HALF_WIDTH_METERS) / (CROP_HALF_WIDTH_METERS * 2);
  const normZ = (z + CROP_HALF_HEIGHT_METERS) / (CROP_HALF_HEIGHT_METERS * 2);

  const cFloat = normX * (COLS - 1);
  const rFloat = normZ * (ROWS - 1);

  const c0 = Math.max(0, Math.min(COLS - 1, Math.floor(cFloat)));
  const c1 = Math.max(0, Math.min(COLS - 1, c0 + 1));
  const r0 = Math.max(0, Math.min(ROWS - 1, Math.floor(rFloat)));
  const r1 = Math.max(0, Math.min(ROWS - 1, r0 + 1));

  const fx = cFloat - c0;
  const fz = rFloat - r0;

  const h00 = grid[r0 * COLS + c0];
  const h10 = grid[r0 * COLS + c1];
  const h01 = grid[r1 * COLS + c0];
  const h11 = grid[r1 * COLS + c1];

  // If any neighboring sample is missing data, cell cannot be safely traversed/interpolated
  if (h00 < -10000 || h10 < -10000 || h01 < -10000 || h11 < -10000) {
    return MISSING_DATA_VALUE;
  }

  // Bilinear interpolation
  const top = h00 * (1 - fx) + h10 * fx;
  const bottom = h01 * (1 - fx) + h11 * fx;
  return top * (1 - fz) + bottom * fz;
}

/**
 * Returns elevation relative to the Jezero crop baseline (-2574.414 m) in meters.
 * Used for 3D Three.js scene coordinates (camera position, terrain mesh, route ribbon, sprites)
 * to avoid floating point precision degradation around large negative offsets (-2500m).
 */
export function getRelativeElevation(x: number, z: number): number {
  const elev = getMeasuredElevation(x, z);
  if (elev === MISSING_DATA_VALUE || elev < -10000) {
    return 0.0;
  }
  return elev - BASELINE_MOLA_ELEVATION;
}

/**
 * Calculates local terrain slope in degrees at (x, z) using central differences.
 * Returns null if the point or any of its neighbor samples lacks valid elevation data,
 * ensuring missing data is never represented as flat 0° ground.
 */
export function getMeasuredSlopeDeg(x: number, z: number): number | null {
  const centerElev = getMeasuredElevation(x, z);
  if (centerElev === MISSING_DATA_VALUE || centerElev < -10000 || isNaN(centerElev)) {
    return null;
  }

  const delta = Math.max(2.0, GRID_SPACING * 0.5);
  const hL = getMeasuredElevation(x - delta, z);
  const hR = getMeasuredElevation(x + delta, z);
  const hU = getMeasuredElevation(x, z - delta);
  const hD = getMeasuredElevation(x, z + delta);

  if (
    hL === MISSING_DATA_VALUE ||
    hR === MISSING_DATA_VALUE ||
    hU === MISSING_DATA_VALUE ||
    hD === MISSING_DATA_VALUE ||
    hL < -10000 ||
    hR < -10000 ||
    hU < -10000 ||
    hD < -10000 ||
    isNaN(hL) ||
    isNaN(hR) ||
    isNaN(hU) ||
    isNaN(hD)
  ) {
    return null;
  }

  const dzdx = (hR - hL) / (2 * delta);
  const dzdz = (hD - hU) / (2 * delta);
  const slopeRad = Math.atan(Math.hypot(dzdx, dzdz));
  return (slopeRad * 180) / Math.PI;
}

/**
 * Direct access to the Float32Array grid for rapid Three.js PlaneGeometry vertex elevation updates.
 */
export function getElevationGridArray(): Float32Array {
  return getMeasuredGridData();
}
