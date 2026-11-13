// Structured Data Provenance & Science Manifest for MARSWALK
// Explicitly catalogs all datasets, product identifiers, official URLs,
// coordinate systems, resolutions, units, processing pipelines, and limitations.
//
// Clear Distinction:
//   [Observed Data]       - Direct remote sensing / in-situ instrument measurements
//   [Derived Results]     - Topographic DTMs, calibrated temperature, slope calculations, route graphs
//   [Simulated Execution] - Astronaut walking kinematics, prototype thresholds, HUD representation

export type DataCategory = 'observed' | 'derived' | 'simulated';

export interface ManifestEntry {
  id: string;
  name: string;
  category: DataCategory;
  categoryLabel: string;
  productIdentifier: string;
  officialSourceUrl: string;
  sourceOrganization: string;
  observationDateRange: string;
  spatialCoverage: {
    crs: string;
    longitudeConvention: string;
    elevationDatum: string;
    bounds: string;
  };
  resolution: {
    spatial?: string;
    temporal?: string;
  };
  unitsAndConventions: {
    horizontalUnits: string;
    verticalUnits: string;
    temperatureUnits: string;
    missingDataConvention: string;
  };
  processingPipeline: string[];
  knownLimitations: string[];
  verificationStatus: 'verified_active' | 'calibrated' | 'prototype_assumed';
}

export const DATA_MANIFEST: ManifestEntry[] = [
  {
    id: 'hirise-dtm',
    name: 'HiRISE Stereo Digital Terrain Model',
    category: 'derived',
    categoryLabel: 'Derived Elevation Data',
    productIdentifier: 'DTEEC_048842_1985_048908_1985_U01',
    officialSourceUrl:
      'https://hirise-pds.lpl.arizona.edu/PDS/DTM/ESP/ORB_048800_048899/ESP_048842_1985_ESP_048908_1985/DTEEC_048842_1985_048908_1985_U01.IMG',
    sourceOrganization: 'University of Arizona / NASA HiRISE PDS',
    observationDateRange: 'Paired MRO HiRISE stereo observations ESP_048842_1985 and ESP_048908_1985',
    spatialCoverage: {
      crs: 'Equirectangular; planetocentric latitude; positive-east longitude; local radius 3394.839813 km',
      longitudeConvention: 'Planetocentric latitude and positive-east longitude',
      elevationDatum: 'Mars 2000 equipotential surface / MOLA reference areoid',
      bounds: 'Bundled crop: 77.4861547°–77.5313170° E, 18.4461624°–18.4897858° N',
    },
    resolution: {
      spatial: 'Source scale 1.0096633 m/pixel; bundled 321 × 321 grid sampled every 8 pixels (~8.0773 m posting).',
    },
    unitsAndConventions: {
      horizontalUnits: 'Meters in the crop-local East/South frame',
      verticalUnits: 'Meters above the Mars 2000 equipotential surface',
      temperatureUnits: 'N/A',
      missingDataConvention: 'Original PDS sentinel is -3.4e38 (IEEE float); importer stores missing values as -32768. Bundled grid contains 103,041 valid postings.',
    },
    processingPipeline: [
      '1. A 2560 × 2560 crop is sampled from the original DTM using the paired HiRISE product projection offsets.',
      '2. Samples every 8 source pixels are bundled as a 321 × 321 Float32 grid.',
      '3. Navigation uses bilinear elevation interpolation and measured-grid slope calculations.',
    ],
    knownLimitations: [
      'Navigation uses the bundled ~8.08 m posting grid; it does not resolve features smaller than that sampling interval.',
      'The bundled DTM grid has no missing postings; imagery gaps are a separate, imperfectly preserved mask.',
    ],
    verificationStatus: 'verified_active',
  },
  {
    id: 'mro-hirise-ortho',
    name: 'HiRISE Orthoimage Crop',
    category: 'observed',
    categoryLabel: 'Orbital Imagery',
    productIdentifier: 'ESP_048908_1985_RED_C_01_ORTHO',
    officialSourceUrl:
      'https://hirise-pds.lpl.arizona.edu/PDS/DTM/ESP/ORB_048800_048899/ESP_048842_1985_ESP_048908_1985/ESP_048908_1985_RED_C_01_ORTHO.JP2',
    sourceOrganization: 'University of Arizona / NASA HiRISE PDS',
    observationDateRange: 'MRO HiRISE observation ESP_048908_1985',
    spatialCoverage: {
      crs: 'Equirectangular; planetocentric latitude; positive-east longitude; paired with DTEEC_048842_1985_048908_1985_U01',
      longitudeConvention: 'Planetocentric latitude and positive-east longitude',
      elevationDatum: 'N/A; orthorectified imagery',
      bounds: 'Bundled 2560 × 2560 crop: 77.4861547°–77.5313170° E, 18.4461624°–18.4897858° N',
    },
    resolution: {
      spatial: 'Original scale 1.0096633 m/pixel; crop offsets sample 1400, line 5800.',
    },
    unitsAndConventions: {
      horizontalUnits: 'Image pixels georeferenced in the paired product projection',
      verticalUnits: 'N/A',
      temperatureUnits: 'N/A',
      missingDataConvention: 'Source label CORE_NULL is 0, but the bundled asset is a lossy JPEG. Current internal gap mask is inferred from exact-zero JPEG pixels (85 8-pixel cells), not a recovered source null mask.',
    },
    processingPipeline: [
      '1. The source orthoimage crop is paired to the DTM by matching projection, scale, and projection offsets.',
      '2. The 2560 × 2560 crop is bundled as a JPEG for browser display.',
      '3. Route coverage excludes cells marked by the conservative JPEG-derived internal-gap mask.',
    ],
    knownLimitations: [
      'JPEG compression may erase source null markers. The inferred internal image-gap mask is approximate; uncovered source nulls cannot be independently ruled out.',
      'The crop is orbital imagery, not ground-level photographic coverage.',
    ],
    verificationStatus: 'verified_active',
  },
  {
    id: 'perseverance-meda',
    name: 'Mars 2020 Perseverance MEDA In-Situ Atmospheric & Thermal Observations',
    category: 'observed',
    categoryLabel: 'Recorded daily temperature range',
    productIdentifier: 'urn:nasa:pds:mars2020_meda:data_calibrated & data_derived',
    officialSourceUrl:
      'https://mars.nasa.gov/rss/api/?feed=weather&category=mars2020&feedtype=json',
    sourceOrganization: 'Centro de Astrobiología (CAB / CSIC-INTA) / NASA JPL / PDS Atmospheres Node',
    observationDateRange: '2024-04-21 to 2024-04-27; downloaded 2026-11-12',
    spatialCoverage: {
      crs: 'Mars 2020 Rover Site & Drive Frame (Jezero Crater)',
      longitudeConvention: 'Areocentric East Longitude',
      elevationDatum: 'Rover ground contact point (~ -2570 m to -2518 m)',
      bounds: 'Rover traverse track across Jezero floor and western delta',
    },
    resolution: {
      temporal: 'Daily summaries; last valid row Sol 1133',
    },
    unitsAndConventions: {
      horizontalUnits: 'Rover Site/Drive & geographic coordinates',
      verticalUnits: 'Mast elevation (+1.45 m) and front chassis (+0.85 m)',
      temperatureUnits: 'Native: Kelvin (K). Display: Converted strictly as °C = K - 273.15.',
      missingDataConvention: 'Null / NaN preserved; never interpolated or synthesized',
    },
    processingPipeline: [
      'NASA Perseverance weather JSON is bundled unchanged with retrieval date and source URL.',
      'Rows with missing temperature values are rejected; the last valid recorded daily min/max is displayed.',
      'Values are already Celsius. No prediction equation or live-temperature claim is applied.',
    ],
    knownLimitations: ['Historical rover-location daily range; not a current reading at the simulated astronaut position.'],
    verificationStatus: 'verified_active',
  },
  {
    id: 'nasa-viking-mdim',
    name: 'Mars Viking MDIM 2.1 Colorized Global Photographic Mosaic',
    category: 'observed',
    categoryLabel: 'Observed Global Mosaic',
    productIdentifier: 'Mars_Viking_MDIM21_ClrMosaic_global_232m',
    officialSourceUrl: 'https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/',
    sourceOrganization: 'USGS Astrogeology Science Center / NASA Mars Trek',
    observationDateRange: 'Viking Orbiter missions (Global coverage)',
    spatialCoverage: {
      crs: 'Mars IAU 2000 Equirectangular (EPSG:104905)',
      longitudeConvention: '-180° to +180° (center lon: 0°)',
      elevationDatum: 'Sphere radius R = 3,396,190 m',
      bounds: 'Global: 90° S to 90° N, 180° W to 180° E',
    },
    resolution: {
      spatial: '~232 m/pixel (Zoom 2 stitched 2048 × 1024 canvas)',
    },
    unitsAndConventions: {
      horizontalUnits: 'Degrees',
      verticalUnits: 'N/A',
      temperatureUnits: 'N/A',
      missingDataConvention: 'Stitched seamlessly across 32 tiles',
    },
    processingPipeline: [
      '1. Dynamic HTTP tile fetching from NASA Mars Trek WMTS.',
      '2. Stitching into an offscreen HTML5 canvas.',
      '3. Generation of THREE.CanvasTexture with sRGB color space.',
    ],
    knownLimitations: [
      'Global resolution (~232 m/px) provides planetary overview only. Regional high-resolution navigation switches to HiRISE dataset.',
    ],
    verificationStatus: 'verified_active',
  },
  {
    id: 'astronaut-kinematics',
    name: 'Simulated Traverse Planner & Locomotion Model',
    category: 'simulated',
    categoryLabel: 'Simulated Astronaut Movement & Constraints',
    productIdentifier: 'marswalk_internal_kinematics_v2',
    officialSourceUrl: 'Internal Algorithm (Documented Tobler/Langmuir Adaptation)',
    sourceOrganization: 'MARSWALK Project Architecture',
    observationDateRange: 'Prototype Simulation (2025–2026)',
    spatialCoverage: {
      crs: 'Crop-local Cartesian frame (East/South meters)',
      longitudeConvention: 'HiRISE crop projection; local origin at crop center',
      elevationDatum: 'Measured HiRISE DTM, MOLA reference areoid',
      bounds: '2584.74 m × 2584.74 m image/DTM crop footprint; usable coverage is smaller where imagery gaps are masked',
    },
    resolution: {
      spatial: 'Continuous coordinate interpolation with 12 m waypoint filtering',
      temporal: '60 FPS walking animation and raycast terrain clamping',
    },
    unitsAndConventions: {
      horizontalUnits: 'Meters (m)',
      verticalUnits: 'Meters (m)',
      temperatureUnits: 'N/A',
      missingDataConvention: 'Cells beyond footprint or missing data are impassable',
    },
    processingPipeline: [
      '1. Interactive start/destination selection inside mapped image and elevation coverage.',
      '2. A* graph pathfinding with configurable slope threshold (10°–25°, default 15°).',
      '3. Walking speed estimated using Martian gravity (0.38g) suited Tobler formula (base speed: 1.1 m/s).',
      '4. First-person Three.js navigation with authentic eye height (1.75 m).',
    ],
    knownLimitations: [
      'All traversal limits and times are PROTOTYPE ASSUMPTIONS, not validated NASA astronaut mission rules.',
      'EVA life support consumables (O2, battery, metabolic rate) are not modeled.',
    ],
    verificationStatus: 'prototype_assumed',
  },
];
