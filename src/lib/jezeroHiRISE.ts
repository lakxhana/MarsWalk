// Verified NASA MRO HiRISE Observation Metadata for Jezero Crater
// Observation / DTM Reference:
//   https://hirise.lpl.arizona.edu/dtm/ESP_048842_1985
//
// Orthoimage Product:
//   ESP_048908_1985_RED_C_01_ORTHO
//
// PDS Archive Source:
//   https://hirise-pds.lpl.arizona.edu/PDS/DTM/ESP/ORB_048800_048899/ESP_048842_1985_ESP_048908_1985/ESP_048908_1985_RED_C_01_ORTHO.JP2
//
// Verified Product Metadata (from PDS label ESP_048908_1985_RED_C_01_ORTHO.LBL):
// - Projection: EQUIRECTANGULAR (Planetocentric, positive East)
// - Center Latitude: 15.0° N, Center Longitude: 77.52° E
// - Reference Sphere Radius: 3,394,839.81 m (local radius at 15° N)
// - Native Resolution: 1.0096633 m/pixel (58,684.049 pixels/degree)
// - Full product size: 6,955 samples x 14,775 lines
// - Full footprint: 18.3368° N to 18.5886° N, 77.4615° E to 77.5842° E
// - Cropped demonstration area: 2560 x 2560 pixels (samples 1400..3960, lines 5800..8360)

export interface HiRISECropMetadata {
  productId: string;
  sourceUrl: string;
  dtmReferenceUrl: string;
  projection: string;
  coordinateConvention: string;
  datum: string;
  pixelScaleMeters: number;
  widthPixels: number;
  heightPixels: number;
  widthMeters: number;
  heightMeters: number;
  cropBounds: {
    north: number;
    south: number;
    west: number;
    east: number;
  };
  assetUrl: string;
}

export const JEZERO_HIRISE_CROP: HiRISECropMetadata = {
  productId: 'ESP_048908_1985_RED_C_01_ORTHO',
  sourceUrl:
    'https://hirise-pds.lpl.arizona.edu/PDS/DTM/ESP/ORB_048800_048899/ESP_048842_1985_ESP_048908_1985/ESP_048908_1985_RED_C_01_ORTHO.JP2',
  dtmReferenceUrl: 'https://hirise.lpl.arizona.edu/dtm/ESP_048842_1985',
  projection: 'EQUIRECTANGULAR',
  coordinateConvention: 'PLANETOCENTRIC, POSITIVE EAST',
  datum: 'Mars IAU 2000 Sphere (R = 3394.840 km)',
  pixelScaleMeters: 1.0096633268711,
  widthPixels: 2560,
  heightPixels: 2560,
  widthMeters: 2584.738116790016,
  heightMeters: 2584.738116790016,
  cropBounds: {
    north: 18.489785816246176,
    south: 18.44616237791552,
    west: 77.48615473233053,
    east: 77.53131703894185,
  },
  assetUrl: '/assets/jezero_hirise_esp_048908_1985.jpg',
};

export const CROP_HALF_WIDTH_METERS = JEZERO_HIRISE_CROP.widthMeters / 2; // ~1292.37 m
export const CROP_HALF_HEIGHT_METERS = JEZERO_HIRISE_CROP.heightMeters / 2; // ~1292.37 m

export const CROP_CENTER = {
  lon: (JEZERO_HIRISE_CROP.cropBounds.west + JEZERO_HIRISE_CROP.cropBounds.east) / 2, // 77.508739° E
  lat: (JEZERO_HIRISE_CROP.cropBounds.north + JEZERO_HIRISE_CROP.cropBounds.south) / 2, // 18.467973° N
};

/**
 * Checks if geographic coordinate (lon, lat) falls within the verified crop footprint.
 */
export function isWithinCropFootprint(lon: number, lat: number): boolean {
  return (
    lon >= JEZERO_HIRISE_CROP.cropBounds.west &&
    lon <= JEZERO_HIRISE_CROP.cropBounds.east &&
    lat >= JEZERO_HIRISE_CROP.cropBounds.south &&
    lat <= JEZERO_HIRISE_CROP.cropBounds.north
  );
}

/**
 * Checks if local Cartesian meters (x, z) relative to crop center fall within the image footprint.
 */
export function isWithinCropLocalMeters(x: number, z: number): boolean {
  return (
    x >= -CROP_HALF_WIDTH_METERS &&
    x <= CROP_HALF_WIDTH_METERS &&
    z >= -CROP_HALF_HEIGHT_METERS &&
    z <= CROP_HALF_HEIGHT_METERS
  );
}

/**
 * Converts Areocentric East Longitude and Planetocentric Latitude to local Cartesian meters (x, z)
 * relative to the center of the HiRISE crop.
 * +X is East, +Z is South (matching Three.js / screen pixel coordinate conventions).
 */
export function lonLatToCropMeters(lon: number, lat: number): { x: number; z: number } {
  const normX =
    (lon - JEZERO_HIRISE_CROP.cropBounds.west) /
    (JEZERO_HIRISE_CROP.cropBounds.east - JEZERO_HIRISE_CROP.cropBounds.west);
  const normZ =
    (JEZERO_HIRISE_CROP.cropBounds.north - lat) /
    (JEZERO_HIRISE_CROP.cropBounds.north - JEZERO_HIRISE_CROP.cropBounds.south);

  const x = (normX - 0.5) * JEZERO_HIRISE_CROP.widthMeters;
  const z = (normZ - 0.5) * JEZERO_HIRISE_CROP.heightMeters;
  return { x, z };
}

/**
 * Converts local Cartesian meters (x, z) relative to crop center to geographic (lon, lat).
 */
export function cropMetersToLonLat(x: number, z: number): { lon: number; lat: number } {
  const normX = x / JEZERO_HIRISE_CROP.widthMeters + 0.5;
  const normZ = z / JEZERO_HIRISE_CROP.heightMeters + 0.5;

  const lon =
    JEZERO_HIRISE_CROP.cropBounds.west +
    normX * (JEZERO_HIRISE_CROP.cropBounds.east - JEZERO_HIRISE_CROP.cropBounds.west);
  const lat =
    JEZERO_HIRISE_CROP.cropBounds.north -
    normZ * (JEZERO_HIRISE_CROP.cropBounds.north - JEZERO_HIRISE_CROP.cropBounds.south);

  return { lon, lat };
}
