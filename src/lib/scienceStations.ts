// NASA-linked archival evidence catalogue; entries are not navigation waypoints.
// The 3D terrain preview is an orbital-data reconstruction.

export interface ScienceStationLocationInfo {
  description: string;
}

export interface ScienceStation {
  id: 'skinner-ridge' | 'wildcat-ridge' | 'abrasion-comparison';
  waypointId: number;
  label: string;
  aliasTitle: string; // "Outcrop 01", "Outcrop 02", "Comparison"
  name: string;
  subtitle: string;
  locationStatus: 'unverified' | 'catalog_only';
  cameraLocation: ScienceStationLocationInfo;
  targetLocation: ScienceStationLocationInfo;
  isEducationalActivity?: boolean;
  rockClassification: string;
  formationContext: string;
  instrument: string;
  observationDate: string;
  martianSols: string;
  targetFeature: string;
  sampleCollected?: string;
  sourceUrl: string;
  sourceUrlLabel: string;
  photographUrl: string;
  photographAlt: string;
  photographCaption: string;
  attribution: string;
  isArchivalImage: boolean;
  contextSentences: [string, string];
  observationQuestion: string;
  limitations: string[];
  networkDependency: string;
  comparisonDetails?: {
    leftTarget: {
      name: string;
      rockType: string;
      grains: string;
      formation: string;
    };
    rightTarget: {
      name: string;
      rockType: string;
      grains: string;
      formation: string;
    };
    scientificSignificance: string;
  };
}

export const SCIENCE_STATIONS: Record<string, ScienceStation> = {
  'skinner-ridge': {
    id: 'skinner-ridge',
    waypointId: 1,
    label: '1',
    aliasTitle: 'Outcrop 01',
    name: 'Skinner Ridge',
    subtitle: 'Coarse sandstone outcrop · Fluvial transport detritus',
    locationStatus: 'catalog_only',
    cameraLocation: {
      description: 'NASA Mastcam-Z workspace mosaic associated with Skinner Ridge; no mapped viewpoint is provided here.',
    },
    targetLocation: {
      description: 'The named Skinner Ridge workspace shown in the archival source; no local map position is assigned.',
    },
    rockClassification: 'Sedimentary Sandstone (Coarse-Grained)',
    formationContext: 'Jezero Delta Front Outcrop',
    instrument: 'Mastcam-Z & PIXL / SHERLOC',
    observationDate: 'July 8, 2022',
    martianSols: 'Sol 492',
    targetFeature: 'Outcrop workspace & abrasion patch for core sample "Swift Run"',
    sampleCollected: 'Rock core "Swift Run" (Sample #11)',
    sourceUrl: 'https://science.nasa.gov/resource/perseverance-workspace-at-skinner-ridge/',
    sourceUrlLabel: 'NASA Science: Workspace at Skinner Ridge (PIA24925)',
    photographUrl:
      'https://assets.science.nasa.gov/dynamicimage/assets/science/psd/mars/resources/detail_files/2/6/26995_PIA24925_MAIN-web.jpg?w=1200&h=666&fit=clip&crop=faces%2Cfocalpoint',
    photographAlt:
      'NASA Perseverance robotic arm at work around rocky outcrop Skinner Ridge in Jezero Crater',
    photographCaption:
      'Mastcam-Z mosaic of Perseverance’s robotic arm workspace at Skinner Ridge (PIA24925). The outcrop exposes coarse-grained sandstone fragments transported by water.',
    attribution: 'NASA / JPL-Caltech / ASU / MSSS',
    isArchivalImage: true,
    contextSentences: [
      'Skinner Ridge exposes layered sedimentary sandstone packed with angular to sub-rounded pebbles and lithic mineral clasts.',
      'These rocks were carried into ancient Jezero Crater by vigorous floodwaters flowing through the Neretva Vallis river channel.',
    ],
    observationQuestion:
      'What do the varied grain sizes and jagged pebble shapes reveal about the energy of the ancient river currents?',
    limitations: [
      'This catalogue entry preserves the NASA site and image association; MARSWalk does not have source-supported coordinates for pinning it to the local walk map.',
      'Archival image reflects Mastcam-Z multispectral composite under Sol 492 solar illumination.',
    ],
    networkDependency: 'Archival NASA imagery requires network connectivity on first view; notes and observations persist locally.',
  },
  'wildcat-ridge': {
    id: 'wildcat-ridge',
    waypointId: 2,
    label: '2',
    aliasTitle: 'Outcrop 02',
    name: 'Wildcat Ridge',
    subtitle: 'Sulfate mudstone · Organic molecules in ancient lakebed',
    locationStatus: 'catalog_only',
    cameraLocation: {
      description: 'NASA Mastcam-Z image associated with Wildcat Ridge; no mapped viewpoint is provided here.',
    },
    targetLocation: {
      description: 'The named Wildcat Ridge feature shown in the archival source; no local map position is assigned.',
    },
    rockClassification: 'Fine-Grained Sedimentary Mudstone (Sulfate-Bearing)',
    formationContext: 'Jezero Delta Low-Energy Lakebed Floor',
    instrument: 'Mastcam-Z (Mosaic) & SHERLOC / WATSON',
    observationDate: 'August 4, 2022',
    martianSols: 'Sol 518',
    targetFeature: '2-inch circular abrasion patch "Berry Hollow" and core drill holes',
    sampleCollected: 'Rock cores "Hazeltop" (Sample #12) & "Bearwallow" (Sample #13)',
    sourceUrl:
      'https://www.jpl.nasa.gov/images/pia24928-sample-collection-and-rock-analysis-at-wildcat-ridge/',
    sourceUrlLabel: 'NASA JPL: Sample Collection at Wildcat Ridge (PIA24928)',
    photographUrl:
      'https://assets.science.nasa.gov/dynamicimage/assets/science/psd/photojournal/pia/pia24/pia24928/PIA24928.jpg?w=1024',
    photographAlt:
      'Mastcam-Z view of circular abrasion patch and drill holes on Wildcat Ridge rock in Jezero Crater',
    photographCaption:
      'Mastcam-Z view of the 5 cm circular abrasion patch "Berry Hollow" and core drill holes on Wildcat Ridge (PIA24928).',
    attribution: 'NASA / JPL-Caltech / ASU / MSSS',
    isArchivalImage: true,
    contextSentences: [
      'Wildcat Ridge is a fine-grained sedimentary rock formed when fine mud and silt settled in a tranquil, evaporating lake basin.',
      'Analysis of the Berry Hollow abrasion patch by the SHERLOC spectrometer detected aromatic organic compounds associated with sulfate salts.',
    ],
    observationQuestion:
      'How does the fine, uniform mudstone matrix differ from Skinner Ridge, and why is quiet water essential for preserving organic materials?',
    limitations: [
      'This catalogue entry preserves the NASA site and image association; MARSWalk does not have source-supported coordinates for pinning it to the local walk map.',
      'Sulfate and organic molecule detection verified by SHERLOC Raman spectrometry; visual image shows surface drill tailings.',
    ],
    networkDependency: 'Archival NASA imagery requires network connectivity on first view; notes and observations persist locally.',
  },
  'abrasion-comparison': {
    id: 'abrasion-comparison',
    waypointId: 3,
    label: '3',
    aliasTitle: 'Comparison',
    name: 'Abrasion Comparison',
    subtitle: 'Comparative study: High-energy sandstone vs quiet-water mudstone',
    locationStatus: 'catalog_only',
    cameraLocation: {
      description: 'Catalogue entry only — this is a comparative composite of WATSON micro-images from two separate rover stops (Sol 482 and Sol 504). It does not represent a single physical coordinate.',
    },
    targetLocation: {
      description: 'Side-by-side comparison of Thornton Gap abrasion patch (Skinner Ridge) and Berry Hollow patch (Wildcat Ridge).',
    },
    isEducationalActivity: true,
    rockClassification: 'Educational Petrology Study (WATSON Micro-Imaging)',
    formationContext: 'High-Energy River Delta vs Quiet Evaporating Paleolake',
    instrument: 'WATSON proximity imager on SHERLOC arm',
    observationDate: 'June 29 and July 21, 2022',
    martianSols: 'Sols 482 and 504',
    targetFeature: 'Side-by-side 5 cm abrasion patches: "Swift Run" (left) vs "Berry Hollow" (right)',
    sourceUrl:
      'https://science.nasa.gov/resource/two-abrasion-patches-from-perseverance-at-jezero-delta/',
    sourceUrlLabel: 'NASA Science: Two Abrasion Patches at Jezero Delta (PIA24926)',
    photographUrl:
      'https://assets.science.nasa.gov/dynamicimage/assets/science/psd/mars/resources/detail_files/2/6/26981_PIA24926-web.jpg?w=1962&h=752&fit=clip&crop=faces%2Cfocalpoint',
    photographAlt:
      'Close-up comparison of two abrasion patches: Swift Run on Skinner Ridge and Berry Hollow on Wildcat Ridge',
    photographCaption:
      'WATSON microscopic images (PIA24926) comparing the coarse sand grains of Swift Run (left) with the fine sulfate mudstone of Berry Hollow (right).',
    attribution: 'NASA / JPL-Caltech / MSSS',
    isArchivalImage: true,
    contextSentences: [
      'This comparative study juxtaposes two authentic rock interiors ground smooth by Perseverance’s abrasion tool.',
      'Contrasting the coarse sandstone of Swift Run with the fine mudstone of Berry Hollow records the environmental shift from rushing rivers to a drying lake.',
    ],
    observationQuestion:
      'Examining both patches side by side, which texture would you predict is more likely to encapsulate and protect microscopic biosignatures?',
    limitations: [
      'Catalogue-only entry: Unverified single geographic location. Retained in evidence catalogue for petrological comparison.',
      'WATSON resolution ~30 microns/pixel with visible LED dark-field illumination.',
    ],
    networkDependency: 'Archival NASA imagery requires network connectivity on first view; notes and observations persist locally.',
    comparisonDetails: {
      leftTarget: {
        name: 'Swift Run (Skinner Ridge)',
        rockType: 'Coarse Sandstone',
        grains: 'Large, angular mineral fragments',
        formation: 'Transported by high-energy river currents entering the crater',
      },
      rightTarget: {
        name: 'Berry Hollow (Wildcat Ridge)',
        rockType: 'Sulfate Mudstone',
        grains: 'Fine-grained, homogeneous matrix',
        formation: 'Settled in calm, evaporating lake water with trapped sulfates',
      },
      scientificSignificance:
        'Documents Jezero’s transition from rapid inflow currents to an evaporating saline basin favorable for organic preservation.',
    },
  },
};

// Demonstration-only coordinates. They are not associated with named Martian sites.
export interface DemoUserWaypoint {
  id: number;
  label: string;
  name: string;
  subtitle: string;
  x: number;
  z: number;
}

export const DEMO_USER_WAYPOINTS: DemoUserWaypoint[] = [
  {
    id: 0,
    label: 'Start',
    name: 'User waypoint · start',
    subtitle: 'Demonstration coordinate',
    x: 0,
    z: 0,
  },
  {
    id: 1,
    label: '1',
    name: 'User waypoint 1',
    subtitle: 'Demonstration coordinate',
    x: 26,
    z: -32,
  },
  {
    id: 2,
    label: '2',
    name: 'User waypoint 2',
    subtitle: 'Demonstration coordinate',
    x: 62,
    z: -12,
  },
  {
    id: 3,
    label: '3',
    name: 'User waypoint 3',
    subtitle: 'Demonstration coordinate',
    x: 76,
    z: 28,
  },
  {
    id: 4,
    label: 'End',
    name: 'User waypoint · endpoint',
    subtitle: 'Demonstration coordinate',
    x: 38,
    z: 65,
  },
];

// Local Field Notebook entry structure
export interface FieldNotebookEntry {
  stationId: string;
  stationName: string;
  completed: boolean;
  userObservation: string;
  savedAt?: string;
}

const STORAGE_KEY = 'marswalk_field_notebook_v1';

export function loadFieldNotebook(): Record<string, FieldNotebookEntry> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function saveFieldNotebookEntry(entry: FieldNotebookEntry): void {
  try {
    const data = loadFieldNotebook();
    data[entry.stationId] = entry;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn('Failed to save to field notebook:', err);
  }
}
