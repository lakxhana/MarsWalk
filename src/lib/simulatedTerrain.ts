import {
  getIllustrativeElevation,
  MISSING_DATA_VALUE,
  ILLUSTRATIVE_DEMO_BOUNDS,
} from './realJezeroTerrain';

// Legacy synthetic geometry. Do not use this output as measured terrain or for navigation.

function hash2D(x: number, z: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function smoothNoise2D(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;

  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const v = fz * fz * fz * (fz * (fz * 6 - 15) + 10);

  const a = hash2D(ix, iz);
  const b = hash2D(ix + 1, iz);
  const c = hash2D(ix, iz + 1);
  const d = hash2D(ix + 1, iz + 1);

  return (
    a * (1 - u) * (1 - v) +
    b * u * (1 - v) +
    c * (1 - u) * v +
    d * u * v
  );
}

export function getSimulatedTerrainHeight(x: number, z: number): number {
  const cosR = 0.866;
  const sinR = 0.5;
  const rx = x * cosR - z * sinR;
  const rz = x * sinR + z * cosR;

  // 1. Broad regional fan slope
  const broad = (smoothNoise2D(x * 0.0075, z * 0.0075) - 0.5) * 7.5;

  // 2. Rolling dunes and sedimentary mounds
  const mounds = (smoothNoise2D(rx * 0.024, rz * 0.024) - 0.5) * 2.8;

  // 3. Subtle regolith ripples
  const ripples = (smoothNoise2D(x * 0.065 + 1.3, z * 0.065 - 2.1) - 0.5) * 0.7;

  // 4. Smooth depression with soft rim
  const cx = 35;
  const cz = -42;
  const dist = Math.hypot(x - cx, z - cz);
  const crater =
    -3.6 * Math.exp(-Math.pow(dist / 26, 2)) +
    1.1 * Math.exp(-Math.pow((dist - 32) / 9, 2));

  return broad + mounds + ripples + crater;
}

// Renders an overhead illustration of the procedural model above.
export function renderOverheadTerrain(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
) {
  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  // Martian directional sunlight from top-left (NW)
  const lx = -0.55;
  const ly = 0.75;
  const lz = -0.35;
  const lLen = Math.hypot(lx, ly, lz);
  const sunX = lx / lLen;
  const sunY = ly / lLen;
  const sunZ = lz / lLen;

  const eps = 0.5; // step for gradient estimation in meters

  for (let py = 0; py < height; py++) {
    const tz = py / (height - 1);
    const z = minZ + tz * (maxZ - minZ);

    for (let px = 0; px < width; px++) {
      const tx = px / (width - 1);
      const x = minX + tx * (maxX - minX);

      const h = getSimulatedTerrainHeight(x, z);
      const hRight = getSimulatedTerrainHeight(x + eps, z);
      const hLeft = getSimulatedTerrainHeight(x - eps, z);
      const hDown = getSimulatedTerrainHeight(x, z + eps);
      const hUp = getSimulatedTerrainHeight(x, z - eps);

      const dhdx = (hRight - hLeft) / (2 * eps);
      const dhdz = (hDown - hUp) / (2 * eps);

      // Surface normal: (-dhdx, 1, -dhdz)
      const nx = -dhdx;
      const ny = 1.0;
      const nz = -dhdz;
      const nLen = Math.hypot(nx, ny, nz);
      const normX = nx / nLen;
      const normY = ny / nLen;
      const normZ = nz / nLen;

      // Hillshade cosine factor
      const dot = Math.max(0, normX * sunX + normY * sunY + normZ * sunZ);
      const shade = 0.35 + 0.65 * dot;

      // Base regolith color gradient modulated by elevation (-5m to +5m)
      const normH = Math.max(0, Math.min(1, (h + 5) / 10));

      // Low basin (darker rust/charcoal) -> high outcrop (brighter ochre)
      const r = Math.round((46 + normH * 55) * shade);
      const g = Math.round((34 + normH * 42) * shade);
      const b = Math.round((27 + normH * 32) * shade);

      // Subtle contour bands every 1.5m
      const contour = Math.abs((h % 1.5) / 1.5);
      const isContour = contour < 0.05 || contour > 0.95;
      const contourDim = isContour ? 0.88 : 1.0;

      const idx = (py * width + px) * 4;
      data[idx] = Math.round(r * contourDim);
      data[idx + 1] = Math.round(g * contourDim);
      data[idx + 2] = Math.round(b * contourDim);
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

// Renders a hillshade illustration of the legacy procedural terrain model.
export function renderRealJezeroOverheadTerrain(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
) {
  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  // Martian directional sunlight from Northwest
  const sunX = -0.58;
  const sunY = 0.72;
  const sunZ = -0.38;

  const eps = 4.0; // 4m gradient step
  const minElev = ILLUSTRATIVE_DEMO_BOUNDS.minElevation;
  const maxElev = ILLUSTRATIVE_DEMO_BOUNDS.maxElevation;
  const elevRange = maxElev - minElev;

  for (let py = 0; py < height; py++) {
    const tz = py / (height - 1);
    const z = minZ + tz * (maxZ - minZ);

    for (let px = 0; px < width; px++) {
      const tx = px / (width - 1);
      const x = minX + tx * (maxX - minX);

      const elev = getIllustrativeElevation(x, z);
      const idx = (py * width + px) * 4;

      if (elev === MISSING_DATA_VALUE) {
        // Missing data cell or outside footprint: dark void pattern
        const stripe = ((px + py) % 12 < 2) ? 35 : 22;
        data[idx] = stripe;
        data[idx + 1] = stripe;
        data[idx + 2] = stripe;
        data[idx + 3] = 255;
        continue;
      }

      const eRight = getIllustrativeElevation(x + eps, z);
      const eLeft = getIllustrativeElevation(x - eps, z);
      const eDown = getIllustrativeElevation(x, z + eps);
      const eUp = getIllustrativeElevation(x, z - eps);

      const dhdx = (eRight !== MISSING_DATA_VALUE && eLeft !== MISSING_DATA_VALUE)
        ? (eRight - eLeft) / (2 * eps)
        : 0;
      const dhdz = (eDown !== MISSING_DATA_VALUE && eUp !== MISSING_DATA_VALUE)
        ? (eDown - eUp) / (2 * eps)
        : 0;

      // Surface normal: (-dhdx, 1, -dhdz)
      const nx = -dhdx;
      const ny = 1.0;
      const nz = -dhdz;
      const nLen = Math.hypot(nx, ny, nz);
      const normX = nx / nLen;
      const normY = ny / nLen;
      const normZ = nz / nLen;

      // Hillshade factor
      const dot = Math.max(0, normX * sunX + normY * sunY + normZ * sunZ);
      const shade = 0.32 + 0.68 * dot;

      // Elevation fraction (0 to 1) across -2574m to -2512m
      const normH = Math.max(0, Math.min(1, (elev - minElev) / elevRange));

      // Natural Jezero regolith colors:
      // Crater floor: deep warm basaltic brown (#44342a)
      // Delta scarp and outcrops: lighter ochre sandstone (#9a7356)
      const r = Math.round((68 + normH * 86) * shade);
      const g = Math.round((52 + normH * 64) * shade);
      const b = Math.round((42 + normH * 48) * shade);

      // Subtle contour lines every 5 meters of illustrative model height
      const absOffset = elev - minElev;
      const contourMod = Math.abs((absOffset % 5.0) / 5.0);
      const isContour = contourMod < 0.04 || contourMod > 0.96;
      // Prominent index contour every 20 meters
      const indexContourMod = Math.abs((absOffset % 20.0) / 20.0);
      const isIndexContour = indexContourMod < 0.03 || indexContourMod > 0.97;

      let dim = 1.0;
      if (isIndexContour) dim = 0.72;
      else if (isContour) dim = 0.86;

      data[idx] = Math.round(r * dim);
      data[idx + 1] = Math.round(g * dim);
      data[idx + 2] = Math.round(b * dim);
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
}
