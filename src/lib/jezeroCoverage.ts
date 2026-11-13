import {
  CROP_HALF_HEIGHT_METERS,
  CROP_HALF_WIDTH_METERS,
  JEZERO_HIRISE_CROP,
  isWithinCropLocalMeters,
} from './jezeroHiRISE';
import { getMeasuredElevation, MISSING_DATA_VALUE } from './jezeroMeasuredElevation';

const GRID_SIZE = 321;
const IMAGE_CELL_SIZE = 8;

const IMAGE_NODATA_CELLS = new Set([
  14081, 16008, 25330, 25646, 25648, 25651, 25652, 25654, 25968, 25969, 25971,
  25972, 25973, 26283, 26286, 26287, 26288, 26289, 26291, 26605, 26606, 26608,
  26609, 26927, 26928, 26929, 27248, 27249, 27250, 27251, 27254, 27570, 27571,
  27572, 27574, 27893, 27894, 27895, 27896, 28214, 28217, 28218, 28534, 28535,
  28536, 28852, 28855, 28856, 29178, 30881, 34498, 34499, 34500, 34501, 34818,
  34819, 34820, 34821, 34822, 34823, 35139, 35140, 35141, 35142, 35144, 35459,
  35460, 35462, 35463, 35464, 35779, 35780, 35781, 35782, 38961, 39603, 39604,
  39925, 42796, 42797, 66292, 66294, 66295, 66296, 66615,
]);

function getImageCell(x: number, z: number): { col: number; row: number } {
  const imageX = ((x + CROP_HALF_WIDTH_METERS) / JEZERO_HIRISE_CROP.widthMeters) *
    (JEZERO_HIRISE_CROP.widthPixels - 1);
  const imageY = ((z + CROP_HALF_HEIGHT_METERS) / JEZERO_HIRISE_CROP.heightMeters) *
    (JEZERO_HIRISE_CROP.heightPixels - 1);

  return {
    col: Math.min(GRID_SIZE - 1, Math.floor(imageX / IMAGE_CELL_SIZE)),
    row: Math.min(GRID_SIZE - 1, Math.floor(imageY / IMAGE_CELL_SIZE)),
  };
}

export function isNavigationPointCovered(x: number, z: number): boolean {
  if (!isWithinCropLocalMeters(x, z)) return false;

  const elevation = getMeasuredElevation(x, z);
  if (elevation === MISSING_DATA_VALUE || elevation < -10000 || !Number.isFinite(elevation)) {
    return false;
  }

  const { col, row } = getImageCell(x, z);
  return !IMAGE_NODATA_CELLS.has(row * GRID_SIZE + col);
}

function segmentIntersectsRect(
  start: { x: number; z: number },
  end: { x: number; z: number },
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
): boolean {
  let tMin = 0;
  let tMax = 1;
  const dx = end.x - start.x;
  const dz = end.z - start.z;

  for (const [origin, delta, min, max] of [
    [start.x, dx, minX, maxX],
    [start.z, dz, minZ, maxZ],
  ]) {
    if (Math.abs(delta) < 1e-9) {
      if (origin < min || origin > max) return false;
      continue;
    }

    const t1 = (min - origin) / delta;
    const t2 = (max - origin) / delta;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
    if (tMin > tMax) return false;
  }

  return true;
}

export function isNavigationSegmentCovered(
  start: { x: number; z: number },
  end: { x: number; z: number },
): boolean {
  if (!isNavigationPointCovered(start.x, start.z) || !isNavigationPointCovered(end.x, end.z)) {
    return false;
  }

  const imageCellMeters = JEZERO_HIRISE_CROP.widthMeters / JEZERO_HIRISE_CROP.widthPixels *
    IMAGE_CELL_SIZE;
  for (const cell of IMAGE_NODATA_CELLS) {
    const col = cell % GRID_SIZE;
    const row = Math.floor(cell / GRID_SIZE);
    const minX = -CROP_HALF_WIDTH_METERS + col * imageCellMeters;
    const minZ = -CROP_HALF_HEIGHT_METERS + row * imageCellMeters;
    if (
      segmentIntersectsRect(
        start,
        end,
        minX,
        minZ,
        minX + imageCellMeters,
        minZ + imageCellMeters,
      )
    ) {
      return false;
    }
  }

  return true;
}

export function getImageNoDataCells(): Array<{ x: number; z: number; size: number }> {
  const cellSize = JEZERO_HIRISE_CROP.widthMeters / JEZERO_HIRISE_CROP.widthPixels *
    IMAGE_CELL_SIZE;

  return [...IMAGE_NODATA_CELLS].map((cell) => {
    const col = cell % GRID_SIZE;
    const row = Math.floor(cell / GRID_SIZE);
    return {
      x: -CROP_HALF_WIDTH_METERS + col * cellSize,
      z: -CROP_HALF_HEIGHT_METERS + row * cellSize,
      size: cellSize,
    };
  });
}

export const JEZERO_COVERAGE_SUMMARY = {
  imageProduct: JEZERO_HIRISE_CROP.productId,
  elevationProduct: 'DTEEC_048842_1985_048908_1985_U01',
  validElevationPostings: GRID_SIZE * GRID_SIZE,
  imageNoDataCellCount: IMAGE_NODATA_CELLS.size,
  imageNoDataCellSource: 'Exact zero-valued pixels grouped into 8-pixel cells from the bundled JPEG crop.',
} as const;
