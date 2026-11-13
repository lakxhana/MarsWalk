// Geodetic helpers for Mars.
//
// NASA Mars Trek WMTS equirectangular layers use EPSG:104905 with
// longitude range -180..180 (clon=0), latitude -90..90. This matches
// the standard equirectangular texture convention (u = (lon+180)/360,
// v = (90-lat)/180), so a 3D sphere textured with that mapping places
// lon=77.45, lat=18.44 at the same point the marker formula below
// produces.

export const JEZERO = { lat: 18.44, lon: 77.45 };

export interface MarsRegion {
  id: string;
  name: string;
  lat: number;
  lon: number;
  subtitle: string;
  description: string;
  hasOrbitalMap: boolean;
  hasWalkSimulation: boolean;
  coverageStatus: 'verified' | 'simulated' | 'unverified';
  coverageNotes: string;
  majorFeature: boolean; // Shown at wider zoom
}

export const MARS_REGIONS: MarsRegion[] = [
  {
    id: 'jezero',
    name: 'Jezero Crater',
    lat: 18.44,
    lon: 77.45,
    subtitle: '18.44° N · 77.45° E',
    description: 'Explore the western delta. Former open-basin paleolake fed by Neretva Vallis.',
    hasOrbitalMap: true,
    hasWalkSimulation: true,
    coverageStatus: 'verified',
    coverageNotes: 'MRO HiRISE mosaic (~25 cm/px) available. Walking terrain is procedural simulation.',
    majorFeature: true,
  },
  {
    id: 'olympus',
    name: 'Olympus Mons',
    lat: 18.65,
    lon: 226.2,
    subtitle: '18.65° N · 226.20° E',
    description: 'Largest volcano in the Solar System, rising ~21.9 km above datum with a 65 km caldera.',
    hasOrbitalMap: false,
    hasWalkSimulation: false,
    coverageStatus: 'unverified',
    coverageNotes: 'Regional orbital mosaic required. Surface simulation not yet mapped.',
    majorFeature: true,
  },
  {
    id: 'gale',
    name: 'Gale Crater',
    lat: -5.37,
    lon: 137.44,
    subtitle: '5.37° S · 137.44° E',
    description: 'Landing site of Curiosity rover; features the central sedimentary mound Mount Sharp (Aeolis Mons).',
    hasOrbitalMap: false,
    hasWalkSimulation: false,
    coverageStatus: 'unverified',
    coverageNotes: 'Curiosity traverse records available in PDS archive. Walk simulation pending.',
    majorFeature: true,
  },
  {
    id: 'valles',
    name: 'Valles Marineris',
    lat: -13.9,
    lon: 300.8,
    subtitle: '13.90° S · 300.80° E',
    description: 'Enormous tectonic canyon system spanning over 4,000 km across the Martian equatorial belt.',
    hasOrbitalMap: false,
    hasWalkSimulation: false,
    coverageStatus: 'unverified',
    coverageNotes: 'HRSC global elevation model available. Regional walking simulation pending.',
    majorFeature: true,
  },
  {
    id: 'elysium',
    name: 'Elysium Planitia',
    lat: 4.5,
    lon: 135.6,
    subtitle: '4.50° N · 135.60° E',
    description: 'Smooth volcanic plains and deployment region for the NASA InSight seismological station.',
    hasOrbitalMap: false,
    hasWalkSimulation: false,
    coverageStatus: 'unverified',
    coverageNotes: 'InSight lander workspace documented. Orbital imagery available.',
    majorFeature: false,
  },
];

// Convert planetographic lat/lon to a point on a unit sphere.
// Matches an equirectangular texture wrapped with u=(lon+180)/360,
// v=(90-lat)/180, sphere created with SphereGeometry (thetaStart=0).
export function latLonToVector3(
  lat: number,
  lon: number,
  radius: number,
): [number, number, number] {
  const phi = ((90 - lat) * Math.PI) / 180; // polar angle from +Y
  const theta = ((lon + 180) * Math.PI) / 180; // azimuth, tex u=0 at lon=-180
  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  return [x, y, z];
}

