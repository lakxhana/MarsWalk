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
  "category": "derived",
  "categoryLabel": "Bundled regional data",
  "sourceOrganization": "NASA / JPL / USGS / University of Arizona",
  "observationDateRange": "Historical mission products; exact acquisition dates not retained in these crop metadata",
  "spatialCoverage": {
    "crs": "Planetocentric latitude / positive-east longitude",
    "longitudeConvention": "Positive east",
    "elevationDatum": "MOLA topography / delta geoid (source product)",
    "bounds": "77.3876953125 to 77.464599609375 E; 18.424072265625 to 18.47900390625 N"
  },
  "resolution": {
    "spatial": "See bundled metadata; sampled products are coarser than their sources"
  },
  "unitsAndConventions": {
    "horizontalUnits": "degrees / local metres",
    "verticalUnits": "metres",
    "temperatureUnits": "N/A",
    "missingDataConvention": "Elevation nulls remain unavailable"
  },
  "verificationStatus": "calibrated",
  "id": "jezero-west-active",
  "name": "Western Jezero elevation \u2014 current walk",
  "productIdentifier": "JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40",
  "officialSourceUrl": "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif",
  "processingPipeline": [
    "Source raster resampled to bundled 385 x 257 cell-centred grid.",
    "westElevation() bilinearly interpolates valid neighbours."
  ],
  "knownLimitations": [
    "Approximate 11\u201313 m bundled spacing; original 1 m name is not the displayed sampling.",
    "Render reconstruction, not ground photography or certified traversability."
  ]
},
{
  "category": "derived",
  "categoryLabel": "Bundled regional data",
  "sourceOrganization": "NASA / JPL / USGS / University of Arizona",
  "observationDateRange": "Historical mission products; exact acquisition dates not retained in these crop metadata",
  "spatialCoverage": {
    "crs": "Planetocentric latitude / positive-east longitude",
    "longitudeConvention": "Positive east",
    "elevationDatum": "MOLA topography / delta geoid (source product)",
    "bounds": "77.3876953125 to 77.464599609375 E; 18.424072265625 to 18.47900390625 N"
  },
  "resolution": {
    "spatial": "See bundled metadata; sampled products are coarser than their sources"
  },
  "unitsAndConventions": {
    "horizontalUnits": "degrees / local metres",
    "verticalUnits": "metres",
    "temperatureUnits": "N/A",
    "missingDataConvention": "Elevation nulls remain unavailable"
  },
  "verificationStatus": "calibrated",
  "id": "jezero-imagery-active",
  "name": "Western Jezero imagery \u2014 current map/walk",
  "productIdentifier": "JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd",
  "officialSourceUrl": "https://trek.nasa.gov/tiles/Mars/EQ/JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd",
  "processingPipeline": [
    "Bundled zoom-14 regional image and zoom-17 delta detail.",
    "Maps and 3D terrain share geographic bounds."
  ],
  "knownLimitations": [
    "The layer name does not mean both delivered images are 25 cm per pixel."
  ]
},
{
  "category": "derived",
  "categoryLabel": "Bundled regional data",
  "sourceOrganization": "NASA / JPL / USGS / University of Arizona",
  "observationDateRange": "Historical mission products; exact acquisition dates not retained in these crop metadata",
  "spatialCoverage": {
    "crs": "Planetocentric latitude / positive-east longitude",
    "longitudeConvention": "Positive east",
    "elevationDatum": "MOLA topography / delta geoid (source product)",
    "bounds": "77.3876953125 to 77.464599609375 E; 18.424072265625 to 18.47900390625 N"
  },
  "resolution": {
    "spatial": "See bundled metadata; sampled products are coarser than their sources"
  },
  "unitsAndConventions": {
    "horizontalUnits": "degrees / local metres",
    "verticalUnits": "metres",
    "temperatureUnits": "N/A",
    "missingDataConvention": "Elevation nulls remain unavailable"
  },
  "verificationStatus": "calibrated",
  "id": "jezero-traverse-active",
  "name": "Perseverance named sites and recorded traverse",
  "productIdentifier": "M20_waypoints.json / M20_traverse.json",
  "officialSourceUrl": "https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_traverse.json",
  "processingPipeline": [
    "Named-site coordinates and connecting rover segments bundled in jezeroNamedData.json.",
    "namedRoute() sums horizontal segment distances."
  ],
  "knownLimitations": [
    "Recorded rover travel, not a validated astronaut route.",
    "Pins identify rover positions; task locations and durations are scenario settings."
  ]
},
  {
    id: 'hirise-dtm',
    name: 'Legacy east-crop HiRISE Digital Terrain Model',
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
      '3. Used by older crop-based terrain utilities; current named-site walking uses the separate western Jezero grid.',
    ],
    knownLimitations: [
      'Navigation uses the bundled ~8.08 m posting grid; it does not resolve features smaller than that sampling interval.',
      'The bundled DTM grid has no missing postings; imagery gaps are a separate, imperfectly preserved mask.',
    ],
    verificationStatus: 'verified_active',
  },
  {
    id: 'mro-hirise-ortho',
    name: 'Legacy east-crop HiRISE Orthoimage',
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
      temperatureUnits: 'Bundled daily min/max already in degrees Celsius; no conversion or prediction.',
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
      spatial: 'Source product nominal 232 m/pixel; displayed zoom-3 texture is 4096 × 2048 pixels, much coarser.',
    },
    unitsAndConventions: {
      horizontalUnits: 'Degrees',
      verticalUnits: 'N/A',
      temperatureUnits: 'N/A',
      missingDataConvention: '128 tiles; any failed tile causes an explicit load error',
    },
    processingPipeline: [
      '1. Dynamic HTTP tile fetching from NASA Mars Trek WMTS.',
      '2. Stitching into an offscreen HTML5 canvas.',
      '3. Generation of THREE.CanvasTexture with sRGB color space.',
    ],
    knownLimitations: [
      'Displayed global texture is for overview only; source nominal resolution is not the displayed resolution.',
    ],
    verificationStatus: 'verified_active',
  },
  {
    id: 'astronaut-kinematics', name: 'Named-route walking and resource estimates',
    category: 'simulated', categoryLabel: 'Scenario model',
    productIdentifier: 'MARSWalk namedRoute / preflight / FieldWalk',
    officialSourceUrl: 'https://ntrs.nasa.gov/api/citations/20210024855/downloads/BVAD_2.15.22-final.pdf#page=149',
    sourceOrganization: 'MARSWalk; metabolic baseline from NASA BVAD Rev2 Table 4-70',
    observationDateRange: 'Simulation; no astronaut observations',
    spatialCoverage: {crs: 'Existing crop-local affine frame', longitudeConvention: 'Positive east', elevationDatum: 'Regional source DTM', bounds: 'Named rover traverse subset'},
    resolution: {spatial: 'Recorded path interpolated for animation', temporal: 'Shared simulation clock'},
    unitsAndConventions: {horizontalUnits: 'm; speed 1.1 m/s assumed', verticalUnits: 'm', temperatureUnits: 'Historical Celsius range displayed independently', missingDataConvention: 'Unknown health readings are not invented'},
    processingPipeline: ['Sum recorded horizontal path segments.', 'Travel = distance / assumed speed; add tasks, return and reserve.', 'Oxygen mass estimate = configured g/h times hours. Default metabolic baseline 86 g/h; extra losses default zero.', 'Messages and reports appear after configured delivery time.'],
    knownLimitations: ['No validated human terrain suitability or slope-based speed on named routes.', 'Endurance-based supply is simulated, not measured tank contents; no certified tank-fill calculation.', 'Historical temperature, manual health inputs and selected communication delay are not live Mars sensors.', 'See DATA-AND-CALCULATIONS.md for equations, implementation pointers and the existing return-leg HUD estimate limitation.'],
    verificationStatus: 'prototype_assumed',
  },
];
