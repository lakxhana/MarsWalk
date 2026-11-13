// Builds an equirectangular Mars texture by stitching NASA Mars Trek WMTS
// tiles from the verified photographic Mars Viking MDIM 2.1 colorized global mosaic.
//
// Tile source:
//   NASA / USGS Mars Viking MDIM 2.1 Colorized Global Mosaic (~232 m/px)
//   https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/{z}/{r}/{c}.jpg
// WMTS is equirectangular (EPSG:104905), 256px tiles, 2:1 grid,
// TopLeftCorner (-180, 90).
//
// At Zoom 2: 8 columns x 4 rows = 32 tiles (2048x1024 px), fast and crisp.
// At Zoom 3: 16 columns x 8 rows = 128 tiles (4096x2048 px).
//
// Credit: NASA / USGS Astrogeology Science Center via NASA Mars Trek WMTS.

export interface MarsTextureResult {
  canvas: HTMLCanvasElement;
  url: string;
  source: string;
  credit: string;
  resolution: string;
}

const TILE_SIZE = 256;
const ZOOM = 3;
const COLS = 16;
const ROWS = 8;
const BASE =
  'https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm';

export const MARS_PHOTOGRAPHIC_CREDIT =
  'NASA / USGS Astrogeology Science Center — Mars Viking MDIM 2.1 Color Mosaic via Mars Trek WMTS';

function loadImageWithRetry(url: string, retries = 1): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const attempt = (remaining: number) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => {
        if (remaining > 0) {
          setTimeout(() => attempt(remaining - 1), 500);
        } else {
          reject(new Error(`HTTP network error loading tile: ${url}`));
        }
      };
      img.src = url;
    };
    attempt(retries);
  });
}

export async function buildMarsTexture(
  onProgress?: (loaded: number, total: number) => void,
): Promise<MarsTextureResult> {
  const canvas = document.createElement('canvas');
  canvas.width = COLS * TILE_SIZE;
  canvas.height = ROWS * TILE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not create 2D canvas context for Mars texture generation.');
  }

  // Neutral background while tiles draw
  ctx.fillStyle = '#1c1917';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const total = COLS * ROWS;
  let loaded = 0;
  const failedErrors: string[] = [];

  const jobs: Promise<void>[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const url = `${BASE}/${ZOOM}/${r}/${c}.jpg`;
      const dx = c * TILE_SIZE;
      const dy = r * TILE_SIZE;
      const job = loadImageWithRetry(url, 1)
        .then((img) => {
          ctx.drawImage(img, dx, dy);
        })
        .catch((err: Error) => {
          // Explicitly record failed tiles - DO NOT silently swallow!
          failedErrors.push(`[r:${r}, c:${c}] - ${err.message}`);
        })
        .finally(() => {
          loaded++;
          onProgress?.(loaded, total);
        });
      jobs.push(job);
    }
  }

  await Promise.all(jobs);

  // If any tile failed to load, fail explicitly with full diagnostics
  if (failedErrors.length > 0) {
    throw new Error(
      `Failed to load ${failedErrors.length}/${total} photographic tiles from NASA Mars Trek. First failure: ${failedErrors[0]}`,
    );
  }

  // Create THREE.CanvasTexture directly from canvas in consumer; skip toDataURL() overhead
  return {
    canvas,
    url: '',
    source: BASE,
    credit: MARS_PHOTOGRAPHIC_CREDIT,
    resolution: `${canvas.width}×${canvas.height}`,
  };
}

