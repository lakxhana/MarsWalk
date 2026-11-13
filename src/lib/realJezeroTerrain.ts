// Legacy procedural illustration. This model is not derived from the USGS or
// HiRISE products and is not used for current map, route, or movement coverage.

export interface TerrainBounds {
  westLon: number;
  eastLon: number;
  southLat: number;
  northLat: number;
  widthMeters: number;
  heightMeters: number;
  minElevation: number; // in meters relative to Mars MOLA areoid
  maxElevation: number;
  centerLon: number;
  centerLat: number;
}

export const ILLUSTRATIVE_DEMO_BOUNDS: TerrainBounds = {
  westLon: 77.41,
  eastLon: 77.447,
  southLat: 18.432,
  northLat: 18.468,
  widthMeters: 2076,
  heightMeters: 2130,
  minElevation: -2574.0,
  maxElevation: -2512.0,
  centerLon: 77.4285,
  centerLat: 18.45,
};

// Geodetic Conversion Constants (Mars IAU 2000 Sphere)
const MARS_RADIUS_METERS = 3396190.0;
const RAD_PER_DEG = Math.PI / 180.0;
const DEG_PER_RAD = 180.0 / Math.PI;

// Distance of 1 degree latitude on Mars in meters
export const METERS_PER_DEG_LAT = MARS_RADIUS_METERS * RAD_PER_DEG; // ~59,274 m/deg

// Distance of 1 degree longitude at Jezero (18.45° N) in meters
export const METERS_PER_DEG_LON =
  MARS_RADIUS_METERS * Math.cos(18.45 * RAD_PER_DEG) * RAD_PER_DEG; // ~56,227 m/deg

/**
 * Converts coordinates using the legacy illustrative frame; not for data registration.
 * Local Origin (0, 0) is at ILLUSTRATIVE_DEMO_BOUNDS.centerLon, ILLUSTRATIVE_DEMO_BOUNDS.centerLat.
 * +X is East (meters), +Z is South (meters) to match Three.js / screen coordinates (-Z is North).
 */
export function lonLatToLocal(
  lon: number,
  lat: number,
): { x: number; z: number } {
  const dLon = lon - ILLUSTRATIVE_DEMO_BOUNDS.centerLon;
  const dLat = lat - ILLUSTRATIVE_DEMO_BOUNDS.centerLat;
  const x = dLon * METERS_PER_DEG_LON;
  const z = -dLat * METERS_PER_DEG_LAT; // South is positive Z
  return { x, z };
}

/**
 * Converts local Cartesian meters (x: East, z: South) to Areocentric East Longitude & Latitude.
 */
export function localToLonLat(
  x: number,
  z: number,
): { lon: number; lat: number } {
  const lon = ILLUSTRATIVE_DEMO_BOUNDS.centerLon + x / METERS_PER_DEG_LON;
  const lat = ILLUSTRATIVE_DEMO_BOUNDS.centerLat - z / METERS_PER_DEG_LAT;
  return { lon, lat };
}

/**
 * Checks the bounds of the legacy illustration, not mapped terrain coverage.
 */
export function isWithinIllustrativeBounds(x: number, z: number): boolean {
  const halfW = ILLUSTRATIVE_DEMO_BOUNDS.widthMeters / 2;
  const halfH = ILLUSTRATIVE_DEMO_BOUNDS.heightMeters / 2;
  return x >= -halfW && x <= halfW && z >= -halfH && z <= halfH;
}

// ---------------------------------------------------------------------------
// Procedural elevations below are illustrative and do not represent measured Mars terrain.

export const MISSING_DATA_VALUE = -32768.0;

// Grid dimensions for fast, deterministic interpolation across the 2 × 2 km area
export const GRID_COLS = 129;
export const GRID_ROWS = 129;
export const CELL_SIZE_X = ILLUSTRATIVE_DEMO_BOUNDS.widthMeters / (GRID_COLS - 1);
export const CELL_SIZE_Z = ILLUSTRATIVE_DEMO_BOUNDS.heightMeters / (GRID_ROWS - 1);

// Generate a deterministic synthetic raster for legacy demonstrations.
const ELEVATION_GRID: Float32Array = new Float32Array(GRID_COLS * GRID_ROWS);

(function initializeIllustrativeTerrainGrid() {
  const halfW = ILLUSTRATIVE_DEMO_BOUNDS.widthMeters / 2;
  const halfH = ILLUSTRATIVE_DEMO_BOUNDS.heightMeters / 2;

  for (let r = 0; r < GRID_ROWS; r++) {
    const z = -halfH + r * CELL_SIZE_Z; // -1065 to +1065
    for (let c = 0; c < GRID_COLS; c++) {
      const x = -halfW + c * CELL_SIZE_X; // -1038 to +1038

      // Base regional delta gradient: sloping down from West (-2518m) to East (-2570m)
      // Regional baseline elevation
      let elev = -2522.0 - 48.0 * (1.0 / (1.0 + Math.exp(-(x + 220) / 160)));

      // Demonstration mesa primitive.
      const dKodiak = Math.hypot(x - -620, z - 520);
      if (dKodiak < 240) {
        // Flat summit mesa with steep layered sides
        const mesaFactor = Math.max(0, 1.0 - dKodiak / 240);
        const summitFlat = Math.min(1.0, Math.pow(mesaFactor * 1.6, 3));
        elev += 44.0 * summitFlat;
      }

      // Demonstration scarp primitive.
      const scarpCenterlineX = -280 + Math.sin(z / 320) * 90;
      const distFromScarp = x - scarpCenterlineX;
      if (distFromScarp < 0) {
        // Upper delta plain plateau
        const plateauFactor = Math.min(1.0, Math.abs(distFromScarp) / 250);
        elev += 14.0 * plateauFactor;
      }

      // Demonstration ramp primitive.
      const dHawksbill = Math.hypot(x - -260, z - -180);
      if (dHawksbill < 180) {
        const gapInfluence = Math.exp(-Math.pow(dHawksbill / 95, 2));
        // Smoothes elevation across scarp into a gentle ramp
        const rampTarget = -2548.0 + (x + 260) * 0.055;
        elev = elev * (1.0 - gapInfluence * 0.75) + rampTarget * (gapInfluence * 0.75);
      }

      // Demonstration ridge primitive.
      const dBelva = Math.hypot(x - 680, z - -620);
      if (dBelva < 340) {
        const ridgeFactor = Math.cos((dBelva / 340) * Math.PI * 0.5);
        elev += 16.0 * Math.pow(ridgeFactor, 2);
      }

      // Demonstration depression primitive.
      const dEnchanted = Math.hypot(x - -330, z - 80);
      if (dEnchanted < 160) {
        elev -= 7.5 * Math.exp(-Math.pow(dEnchanted / 80, 2));
      }

      // Store in matrix
      ELEVATION_GRID[r * GRID_COLS + c] = elev;
    }
  }
})();

/**
 * Returns a synthetic illustrative elevation, not a measured Mars height.
 */
export function getIllustrativeElevation(x: number, z: number): number {
  if (!isWithinIllustrativeBounds(x, z)) {
    return MISSING_DATA_VALUE;
  }

  const halfW = ILLUSTRATIVE_DEMO_BOUNDS.widthMeters / 2;
  const halfH = ILLUSTRATIVE_DEMO_BOUNDS.heightMeters / 2;

  const colF = ((x + halfW) / ILLUSTRATIVE_DEMO_BOUNDS.widthMeters) * (GRID_COLS - 1);
  const rowF = ((z + halfH) / ILLUSTRATIVE_DEMO_BOUNDS.heightMeters) * (GRID_ROWS - 1);

  const c0 = Math.floor(colF);
  const c1 = Math.min(GRID_COLS - 1, c0 + 1);
  const r0 = Math.floor(rowF);
  const r1 = Math.min(GRID_ROWS - 1, r0 + 1);

  const tx = colF - c0;
  const tz = rowF - r0;

  const e00 = ELEVATION_GRID[r0 * GRID_COLS + c0];
  const e10 = ELEVATION_GRID[r0 * GRID_COLS + c1];
  const e01 = ELEVATION_GRID[r1 * GRID_COLS + c0];
  const e11 = ELEVATION_GRID[r1 * GRID_COLS + c1];

  // Bilinear interpolation
  return (
    e00 * (1 - tx) * (1 - tz) +
    e10 * tx * (1 - tz) +
    e01 * (1 - tx) * tz +
    e11 * tx * tz
  );
}

/**
 * Returns relative elevation in meters above the lowest point in the demonstration area.
 * Useful for 3D Three.js scene rendering (so floor is around Y = 0 to 65 m).
 */
export function getIllustrativeRelativeElevation(x: number, z: number): number {
  const absElev = getIllustrativeElevation(x, z);
  if (absElev === MISSING_DATA_VALUE) return 0;
  return absElev - ILLUSTRATIVE_DEMO_BOUNDS.minElevation;
}

/**
 * Computes slope angle (in degrees and percent) and gradient at coordinate (x, z).
 */
export function getSlopeAt(
  x: number,
  z: number,
  sampleDistance = 4.0,
): {
  degrees: number;
  percent: number;
  slopeAngleRad: number;
  isValid: boolean;
} {
  const eCenter = getIllustrativeElevation(x, z);
  if (eCenter === MISSING_DATA_VALUE) {
    return { degrees: 0, percent: 0, slopeAngleRad: 0, isValid: false };
  }

  const eEast = getIllustrativeElevation(x + sampleDistance, z);
  const eWest = getIllustrativeElevation(x - sampleDistance, z);
  const eSouth = getIllustrativeElevation(x, z + sampleDistance);
  const eNorth = getIllustrativeElevation(x, z - sampleDistance);

  if (
    eEast === MISSING_DATA_VALUE ||
    eWest === MISSING_DATA_VALUE ||
    eSouth === MISSING_DATA_VALUE ||
    eNorth === MISSING_DATA_VALUE
  ) {
    return { degrees: 0, percent: 0, slopeAngleRad: 0, isValid: false };
  }

  const dzdx = (eEast - eWest) / (2 * sampleDistance);
  const dzdz = (eSouth - eNorth) / (2 * sampleDistance);

  const gradient = Math.hypot(dzdx, dzdz);
  const slopeAngleRad = Math.atan(gradient);
  const degrees = slopeAngleRad * DEG_PER_RAD;
  const percent = gradient * 100.0;

  return { degrees, percent, slopeAngleRad, isValid: true };
}
