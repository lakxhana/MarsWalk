import fs from 'node:fs';
import path from 'node:path';
import { getMeasuredElevation } from '../src/lib/jezeroMeasuredElevation';

/**
 * Independent Verification and Import Script for Jezero HiRISE Digital Terrain Model (DTM)
 * Product: DTEEC_048842_1985_048908_1985_U01
 * Corresponding Orthoimage: ESP_048908_1985_RED_C_01_ORTHO
 *
 * PDS Source URLs:
 * DTM: https://hirise-pds.lpl.arizona.edu/PDS/DTM/ESP/ORB_048800_048899/ESP_048842_1985_ESP_048908_1985/DTEEC_048842_1985_048908_1985_U01.IMG
 * ORTHO LBL: https://hirise-pds.lpl.arizona.edu/PDS/DTM/ESP/ORB_048800_048899/ESP_048842_1985_ESP_048908_1985/ESP_048908_1985_RED_C_01_ORTHO.LBL
 */

const PDS_DTM_URL =
  'https://hirise-pds.lpl.arizona.edu/PDS/DTM/ESP/ORB_048800_048899/ESP_048842_1985_ESP_048908_1985/DTEEC_048842_1985_048908_1985_U01.IMG';
const PDS_ORTHO_LBL_URL =
  'https://hirise-pds.lpl.arizona.edu/PDS/DTM/ESP/ORB_048800_048899/ESP_048842_1985_ESP_048908_1985/ESP_048908_1985_RED_C_01_ORTHO.LBL';

const CACHED_RAW_PATH = '/tmp/crop_lines.img';

const DTM_LINE_SAMPLES = 6955;
const DTM_RECORD_BYTES = 27820;

// Orthoimage Crop Parameters (from ESP_048908_1985_RED_C_01_ORTHO metadata)
const CROP_SAMPLE_START = 1400;
const CROP_LINE_START = 5800;
const CROP_WIDTH_PIXELS = 2560;
const CROP_HEIGHT_PIXELS = 2560;
const PIXEL_SCALE_METERS = 1.0096633268711;

// Subsampling factor for browser delivery: step = 8 => (2560 / 8) + 1 = 321 x 321 grid
const STEP = 8;
const GRID_COLS = 321;
const GRID_ROWS = 321;
const GRID_SPACING_METERS = STEP * PIXEL_SCALE_METERS; // ~8.0773066 m

const MISSING_DATA_VALUE = -32768.0;

interface ProjectionParams {
  mapProjectionType: string;
  centerLatitude: number;
  centerLongitude: number;
  mapResolution: number;
  mapScale: number;
  lineProjectionOffset: number;
  sampleProjectionOffset: number;
  radiusKm: number;
}

function parsePdsKeyValue(label: string, key: string): string | null {
  const regex = new RegExp(`(?:^|\\n)\\s*${key}\\s*=\\s*([^\\r\\n]+)`, 'i');
  const match = label.match(regex);
  if (!match) return null;
  let val = match[1].trim();
  // Strip trailing comments
  const commentIdx = val.indexOf('/*');
  if (commentIdx !== -1) val = val.slice(0, commentIdx).trim();
  // Strip unit tags e.g. <DEG>, <KM>
  val = val.replace(/<[^>]+>/g, '').trim();
  // Strip quotes
  if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
  return val;
}

function parseProjectionParams(labelText: string, sourceName: string): ProjectionParams {
  const projType = parsePdsKeyValue(labelText, 'MAP_PROJECTION_TYPE');
  const centerLat = parseFloat(parsePdsKeyValue(labelText, 'CENTER_LATITUDE') || '0');
  const centerLon = parseFloat(parsePdsKeyValue(labelText, 'CENTER_LONGITUDE') || '0');
  const mapRes = parseFloat(parsePdsKeyValue(labelText, 'MAP_RESOLUTION') || '0');
  const mapScale = parseFloat(parsePdsKeyValue(labelText, 'MAP_SCALE') || '0');
  const lineOffset = parseFloat(parsePdsKeyValue(labelText, 'LINE_PROJECTION_OFFSET') || '0');
  const sampleOffset = parseFloat(parsePdsKeyValue(labelText, 'SAMPLE_PROJECTION_OFFSET') || '0');
  const radiusKm = parseFloat(parsePdsKeyValue(labelText, 'A_AXIS_RADIUS') || '0');

  if (!projType || !mapRes || !lineOffset || !sampleOffset) {
    throw new Error(`Failed to parse required projection parameters from ${sourceName}`);
  }

  return {
    mapProjectionType: projType,
    centerLatitude: centerLat,
    centerLongitude: centerLon,
    mapResolution: mapRes,
    mapScale: mapScale,
    lineProjectionOffset: lineOffset,
    sampleProjectionOffset: sampleOffset,
    radiusKm,
  };
}

/**
 * Validates download responses: HTTP 206, Content-Range, and exact expected byte count.
 */
async function ensureRawCropLines(): Promise<Buffer> {
  const expectedBytes = CROP_HEIGHT_PIXELS * DTM_LINE_SAMPLES * 4; // 2560 * 6955 * 4 = 71,219,200 bytes
  const startByte = DTM_RECORD_BYTES + CROP_LINE_START * DTM_LINE_SAMPLES * 4;
  const endByte = DTM_RECORD_BYTES + (CROP_LINE_START + CROP_HEIGHT_PIXELS) * DTM_LINE_SAMPLES * 4 - 1;

  if (fs.existsSync(CACHED_RAW_PATH)) {
    const cachedBuf = fs.readFileSync(CACHED_RAW_PATH);
    if (cachedBuf.byteLength === expectedBytes) {
      console.log(`Loaded validated cached DTM crop lines from ${CACHED_RAW_PATH} (${cachedBuf.byteLength} bytes)`);
      return cachedBuf;
    }
    console.warn(`Cached file size mismatch (${cachedBuf.byteLength} != ${expectedBytes}). Re-downloading range...`);
  }

  console.log(`Downloading DTM lines ${CROP_LINE_START}..${CROP_LINE_START + CROP_HEIGHT_PIXELS} via HTTP range request...`);
  console.log(`Requesting range: bytes=${startByte}-${endByte}`);

  const res = await fetch(PDS_DTM_URL, {
    headers: {
      Range: `bytes=${startByte}-${endByte}`,
    },
  });

  // Requirement: Validate HTTP 206 Partial Content
  if (res.status !== 206) {
    throw new Error(`Range download failed: expected HTTP 206 Partial Content, received HTTP ${res.status} ${res.statusText}`);
  }

  // Requirement: Validate Content-Range header
  const contentRange = res.headers.get('content-range');
  console.log(`HTTP 206 Content-Range response: ${contentRange}`);
  if (!contentRange || !contentRange.toLowerCase().includes(`bytes ${startByte}-${endByte}/`)) {
    throw new Error(`Invalid Content-Range header: received "${contentRange}", expected "bytes ${startByte}-${endByte}/..."`);
  }

  const arrayBuf = await res.arrayBuffer();
  const buf = Buffer.from(arrayBuf);

  // Requirement: Validate byte count before caching
  if (buf.byteLength !== expectedBytes) {
    throw new Error(`Byte count validation failed: received ${buf.byteLength} bytes, expected exactly ${expectedBytes} bytes`);
  }

  fs.writeFileSync(CACHED_RAW_PATH, buf);
  console.log(`Validated range download successfully cached to ${CACHED_RAW_PATH} (${buf.byteLength} bytes)`);
  return buf;
}

export async function verifyAndImport(): Promise<{
  success: boolean;
  checksPassed: boolean;
  results: {
    dtmProjection: ProjectionParams;
    orthoProjection: ProjectionParams;
    verificationPoints: {
      name: string;
      coords: { lat: number; lon: number; x: number; z: number };
      sourceHeight: number;
      appHeight: number;
      diffMeters: number;
      passed: boolean;
    }[];
  };
}> {
  console.log('=== MARSWalk Jezero HiRISE DTM Independent Verification ===\n');

  // 1. Fetch & parse original DTM label (first 27820 bytes of DTM file)
  console.log('Fetching original DTM PDS label from PDS archive...');
  const dtmLabelRes = await fetch(PDS_DTM_URL, {
    headers: { Range: `bytes=0-${DTM_RECORD_BYTES - 1}` },
  });
  if (dtmLabelRes.status !== 206) {
    throw new Error(`Failed to fetch DTM label: expected HTTP 206, got HTTP ${dtmLabelRes.status}`);
  }
  const dtmLabelText = await dtmLabelRes.text();
  const dtmProj = parseProjectionParams(dtmLabelText, 'DTEEC_048842_1985_048908_1985_U01');
  console.log('DTM Projection parsed:', dtmProj);

  // 2. Fetch & parse original Orthoimage label
  console.log('\nFetching original Orthoimage PDS label from PDS archive...');
  const orthoLabelRes = await fetch(PDS_ORTHO_LBL_URL);
  if (!orthoLabelRes.ok) {
    throw new Error(`Failed to fetch Orthoimage label: HTTP ${orthoLabelRes.status}`);
  }
  const orthoLabelText = await orthoLabelRes.text();
  const orthoProj = parseProjectionParams(orthoLabelText, 'ESP_048908_1985_RED_C_01_ORTHO');
  console.log('Ortho Projection parsed:', orthoProj);

  // 3. Confirm how geographic coordinates map to pixels in each
  console.log('\n--- Georeferencing & Coordinate Mapping Verification ---');
  const projMismatch: string[] = [];
  if (dtmProj.mapProjectionType !== orthoProj.mapProjectionType) projMismatch.push('MAP_PROJECTION_TYPE');
  if (dtmProj.centerLatitude !== orthoProj.centerLatitude) projMismatch.push('CENTER_LATITUDE');
  if (dtmProj.centerLongitude !== orthoProj.centerLongitude) projMismatch.push('CENTER_LONGITUDE');
  if (Math.abs(dtmProj.mapResolution - orthoProj.mapResolution) > 1e-4) projMismatch.push('MAP_RESOLUTION');
  if (Math.abs(dtmProj.mapScale - orthoProj.mapScale) > 1e-4) projMismatch.push('MAP_SCALE');
  if (Math.abs(dtmProj.lineProjectionOffset - orthoProj.lineProjectionOffset) > 1e-4) projMismatch.push('LINE_PROJECTION_OFFSET');
  if (Math.abs(dtmProj.sampleProjectionOffset - orthoProj.sampleProjectionOffset) > 1e-4) projMismatch.push('SAMPLE_PROJECTION_OFFSET');

  if (projMismatch.length > 0) {
    throw new Error(`Projection mismatch between DTM and Orthoimage: ${projMismatch.join(', ')}`);
  }
  console.log('Confirmed: DTM and Orthoimage share identical Equirectangular projection and projection offsets:');
  console.log(`  Projection: ${dtmProj.mapProjectionType} at Center Lat ${dtmProj.centerLatitude}° N, Center Lon ${dtmProj.centerLongitude}° E`);
  console.log(`  Scale: ${dtmProj.mapScale.toFixed(6)} m/pix (${dtmProj.mapResolution.toFixed(4)} pix/deg)`);
  console.log(`  Sample Offset: ${dtmProj.sampleProjectionOffset}, Line Offset: ${dtmProj.lineProjectionOffset}`);

  // Mapping formula:
  // sample = sampleOffset + (lon - centerLon) * mapRes * cos(centerLat)
  // line = lineOffset - lat * mapRes
  const centerLatRad = (dtmProj.centerLatitude * Math.PI) / 180;
  const lonToSample = (lon: number) =>
    dtmProj.sampleProjectionOffset + (lon - dtmProj.centerLongitude) * dtmProj.mapResolution * Math.cos(centerLatRad);
  const latToLine = (lat: number) => dtmProj.lineProjectionOffset - lat * dtmProj.mapResolution;
  const sampleToLon = (sample: number) =>
    dtmProj.centerLongitude + (sample - dtmProj.sampleProjectionOffset) / (dtmProj.mapResolution * Math.cos(centerLatRad));
  const lineToLat = (line: number) => (dtmProj.lineProjectionOffset - line) / dtmProj.mapResolution;

  // Confirm crop bounds mapping
  const cropNorthLat = lineToLat(CROP_LINE_START);
  const cropSouthLat = lineToLat(CROP_LINE_START + CROP_HEIGHT_PIXELS);
  const cropWestLon = sampleToLon(CROP_SAMPLE_START);
  const cropEastLon = sampleToLon(CROP_SAMPLE_START + CROP_WIDTH_PIXELS);
  console.log('\nCrop boundary coordinates from label formulas:');
  console.log(`  North: ${cropNorthLat.toFixed(6)}° N (line ${CROP_LINE_START}, round-trip line: ${latToLine(cropNorthLat).toFixed(1)})`);
  console.log(`  South: ${cropSouthLat.toFixed(6)}° N (line ${CROP_LINE_START + CROP_HEIGHT_PIXELS})`);
  console.log(`  West:  ${cropWestLon.toFixed(6)}° E (sample ${CROP_SAMPLE_START}, round-trip sample: ${lonToSample(cropWestLon).toFixed(1)})`);
  console.log(`  East:  ${cropEastLon.toFixed(6)}° E (sample ${CROP_SAMPLE_START + CROP_WIDTH_PIXELS})`);

  // 4. Download / load raw DTM lines with 206 & Content-Range validation
  console.log('\n--- Range Download & Raw DTM Validation ---');
  const rawBuffer = await ensureRawCropLines();
  const rawFloats = new Float32Array(rawBuffer.buffer, rawBuffer.byteOffset, rawBuffer.byteLength / 4);

  // 5. Process grid and update assets
  const outputGrid = new Float32Array(GRID_COLS * GRID_ROWS);
  let minElevation = Infinity;
  let maxElevation = -Infinity;
  let validCount = 0;
  let missingCount = 0;

  for (let r = 0; r < GRID_ROWS; r++) {
    const lineInCrop = Math.min(CROP_HEIGHT_PIXELS - 1, r * STEP);
    const lineOffset = lineInCrop * DTM_LINE_SAMPLES;
    for (let c = 0; c < GRID_COLS; c++) {
      const sampleInCrop = Math.min(CROP_WIDTH_PIXELS - 1, c * STEP);
      const rawVal = rawFloats[lineOffset + CROP_SAMPLE_START + sampleInCrop];
      let elev = rawVal;
      if (rawVal < -10000 || isNaN(rawVal)) {
        elev = MISSING_DATA_VALUE;
        missingCount++;
      } else {
        validCount++;
        if (elev < minElevation) minElevation = elev;
        if (elev > maxElevation) maxElevation = elev;
      }
      outputGrid[r * GRID_COLS + c] = elev;
    }
  }

  console.log(`Grid cells processed: ${validCount} valid, ${missingCount} missing-data cells.`);

  const outDir = path.resolve(process.cwd(), 'public/assets');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const binPath = path.join(outDir, 'jezero_measured_elevation_grid.bin');
  fs.writeFileSync(binPath, Buffer.from(outputGrid.buffer));

  const metadata = {
    productId: 'DTEEC_048842_1985_048908_1985_U01',
    sourceUrl: PDS_DTM_URL,
    dtmReferenceUrl: 'https://hirise.lpl.arizona.edu/dtm/ESP_048842_1985',
    orthoProductId: 'ESP_048908_1985_RED_C_01_ORTHO',
    projection: dtmProj.mapProjectionType,
    coordinateConvention: 'PLANETOCENTRIC, POSITIVE EAST',
    verticalReference: 'Mars MOLA Reference Areoid (0 m equipotential datum, Smith et al., 2001)',
    elevationUnits: 'METERS',
    originalDimensions: {
      samples: DTM_LINE_SAMPLES,
      lines: 14775,
    },
    originalMapScaleMetersPerPixel: dtmProj.mapScale,
    originalMapResolutionPixelsPerDegree: dtmProj.mapResolution,
    cropOffsets: {
      sample: CROP_SAMPLE_START,
      line: CROP_LINE_START,
      width: CROP_WIDTH_PIXELS,
      height: CROP_HEIGHT_PIXELS,
    },
    gridDimensions: {
      cols: GRID_COLS,
      rows: GRID_ROWS,
      totalCells: GRID_COLS * GRID_ROWS,
    },
    stepFactor: STEP,
    gridSpacingMeters: GRID_SPACING_METERS,
    bounds: {
      north: cropNorthLat,
      south: cropSouthLat,
      west: cropWestLon,
      east: cropEastLon,
    },
    localExtentMeters: {
      minX: -1292.37,
      maxX: 1292.37,
      minZ: -1292.37,
      maxZ: 1292.37,
      widthMeters: 2584.74,
      heightMeters: 2584.74,
    },
    elevationRange: {
      minElevationMeters: minElevation,
      maxElevationMeters: maxElevation,
    },
    missingDataValue: MISSING_DATA_VALUE,
    binaryAssetUrl: '/assets/jezero_measured_elevation_grid.bin',
  };

  const jsonPath = path.join(outDir, 'jezero_measured_elevation_metadata.json');
  fs.writeFileSync(jsonPath, JSON.stringify(metadata, null, 2));

  // Write embedded module
  const base64Data = Buffer.from(outputGrid.buffer).toString('base64');
  const codeContent = `// Auto-generated by scripts/import_jezero_dtm.ts from HiRISE DTM DTEEC_048842_1985_048908_1985_U01
// Grid: ${GRID_COLS} x ${GRID_ROWS} = ${outputGrid.length} cells (${GRID_SPACING_METERS.toFixed(4)} m spacing)
// Elevation Range: ${minElevation.toFixed(2)} m to ${maxElevation.toFixed(2)} m (MOLA datum)

export const MEASURED_DTM_METADATA = ${JSON.stringify(metadata, null, 2)} as const;

const BASE64_GRID = '${base64Data}';

let cachedGrid: Float32Array | null = null;

export function getMeasuredGridData(): Float32Array {
  if (cachedGrid) return cachedGrid;
  const binaryString = atob(BASE64_GRID);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  cachedGrid = new Float32Array(bytes.buffer);
  return cachedGrid;
}
`;
  const srcDataPath = path.resolve(process.cwd(), 'src/lib/jezeroMeasuredElevationData.ts');
  fs.writeFileSync(srcDataPath, codeContent);

  // 6. Check the app lookup against raw DTM samples at three crop locations.
  console.log('\n--- 3 DTM Grid Lookup Checks (Raw DTM vs App Height) ---');
  const verifyPoints = [
    { name: 'Northwest crop sample', s: 400, l: 600 },
    { name: 'Crop center sample', s: 1280, l: 1280 },
    { name: 'Southeast crop sample', s: 2000, l: 1800 },
  ];

  const verificationResults = [];
  let allPointsPassed = true;

  for (const pt of verifyPoints) {
    // Read directly from original raw DTM floats
    const rawVal = rawFloats[pt.l * DTM_LINE_SAMPLES + CROP_SAMPLE_START + pt.s];

    // Compute geographic and local coordinates
    const normX = pt.s / CROP_WIDTH_PIXELS;
    const normZ = pt.l / CROP_HEIGHT_PIXELS;
    const lon = cropWestLon + normX * (cropEastLon - cropWestLon);
    const lat = cropNorthLat - normZ * (cropNorthLat - cropSouthLat);
    const localX = (normX - 0.5) * metadata.localExtentMeters.widthMeters;
    const localZ = (normZ - 0.5) * metadata.localExtentMeters.heightMeters;

    // App height from application's lookup function
    const appHeight = getMeasuredElevation(localX, localZ);
    const diffMeters = Math.abs(rawVal - appHeight);
    const passed = diffMeters < 0.1; // Sub-decimeter precision
    if (!passed) allPointsPassed = false;

    console.log(`Point: ${pt.name}`);
    console.log(`  Coords: ${lat.toFixed(6)}° N, ${lon.toFixed(6)}° E (local: x=${localX.toFixed(1)}m, z=${localZ.toFixed(1)}m)`);
    console.log(`  Source Height (Raw DTM): ${rawVal.toFixed(3)} m`);
    console.log(`  App Height (Grid):       ${appHeight.toFixed(3)} m`);
    console.log(`  Difference:              ${diffMeters.toFixed(3)} m`);
    console.log(`  Status:                  ${passed ? 'PASSED' : 'FAILED'}\n`);

    verificationResults.push({
      name: pt.name,
      coords: { lat, lon, x: localX, z: localZ },
      sourceHeight: rawVal,
      appHeight,
      diffMeters,
      passed,
    });
  }

  return {
    success: true,
    checksPassed: allPointsPassed,
    results: {
      dtmProjection: dtmProj,
      orthoProjection: orthoProj,
      verificationPoints: verificationResults,
    },
  };
}

if (process.argv[1]?.endsWith('import_jezero_dtm.ts')) {
  verifyAndImport().catch((err) => {
    console.error('VERIFICATION ERROR:', err);
    process.exit(1);
  });
}
