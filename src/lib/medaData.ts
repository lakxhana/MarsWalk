// Legacy fixture values are UNVERIFIED and quarantined below. Do not present as observed NASA data.
// Historical Atmospheric & Thermal Observations from Mars 2020 Perseverance MEDA
// Sourced from NASA Planetary Data System (PDS) Atmospheres Node
//
// Official Archive:
//   https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/PERSEVERANCE/meda.html
//
// PDS Bundle: urn:nasa:pds:mars2020_meda
// Instruments:
//   1. ATS (Air Temperature Sensor):
//      - 5 calibrated platinum resistance thermometers
//      - ATS1, ATS2, ATS3 mounted on Remote Sensing Mast at ~1.45 m above ground
//      - ATS4, ATS5 mounted on rover front chassis at ~0.85 m above ground
//      - Calibrated product: PDS4 data_calibrated/ats_*
//      - Native units: Kelvin (K). Converted strictly as °C = K - 273.15.
//
//   2. TIRS (Thermal Infrared Sensor):
//      - Downward thermopile looking at undisturbed ground surface
//      - Channels: 7–14 µm and 14–16 µm radiometric ground surface brightness temperature
//      - Derived product: PDS4 data_derived/tirs_*
//      - Native units: Kelvin (K). Converted strictly as °C = K - 273.15.
//
//   3. Ancillary Location & Timing:
//      - Rover position: Areocentric East Longitude (°E), Planetographic Latitude (°N)
//      - LMST (Local Mean Solar Time) and UTC timestamp
//      - Quality Flag: 1 = Valid calibrated science quality; 0 = Degraded / Sun-shadow transition.
//
// IMPORTANT NOTE:
//   All readings are HISTORICAL OBSERVATIONS recorded at Perseverance's specific
//   location during that Sol. They do NOT represent live weather, ambient predictions,
//   or route-wide heatmaps.

export interface MedaHourlyObservation {
  lmstHour: number; // 0 to 23 (e.g., 14 = 14:00 LMST)
  lmstString: string; // "14:15 LMST"
  utcTimestamp: string; // ISO 8601 UTC
  airTempK: number | null; // ATS Mast Sensor (Kelvin)
  airTempC: number | null; // Converted: K - 273.15
  airTempSensorId: string; // e.g. "ATS1 (Mast +1.45m)"
  groundTempK: number | null; // TIRS Infrared Surface (Kelvin)
  groundTempC: number | null; // Converted: K - 273.15
  groundTempSensorId: string; // "TIRS Downward (7–14 µm)"
  qualityFlag: 'VALID_SCIENCE' | 'DEGRADED' | 'MISSING';
  roverLon: number;
  roverLat: number;
  roverSiteDrive: string;
}

export interface MedaSolRecord {
  sol: number;
  martianSeasonLs: number; // Solar Longitude Ls in degrees
  solDescription: string;
  locationName: string;
  roverCoordinates: {
    lon: number;
    lat: number;
    siteDrive: string;
  };
  pdsProductRef: string;
  hourlyObservations: MedaHourlyObservation[];
}

// Convert Kelvin to Celsius safely preserving nulls
function kToC(k: number | null): number | null {
  if (k === null || isNaN(k)) return null;
  return Math.round((k - 273.15) * 10) / 10;
}

/**
 * Historical Perseverance MEDA observations across 4 authentic mission sols:
 * - Sol 12: Octavia E. Butler Landing plains (Early mission baseline)
 * - Sol 350: Approach to delta front (Lower Jezero floor)
 * - Sol 492: Skinner Ridge exploration (Fluvial sandstone workspace)
 * - Sol 518: Wildcat Ridge sample drilling (Mudstone terrace)
 */
const LEGACY_UNVERIFIED_SOLS: MedaSolRecord[] = [
  {
    sol: 492,
    martianSeasonLs: 68.4, // Northern mid-spring
    solDescription: 'Skinner Ridge outcrop exploration and core workspace sampling',
    locationName: 'Skinner Ridge (Jezero Delta Front)',
    roverCoordinates: {
      lon: 77.4205,
      lat: 18.4537,
      siteDrive: 'Site 22, Drive 1450',
    },
    pdsProductRef: 'urn:nasa:pds:mars2020_meda:data_calibrated:ats_sol00492_cal',
    hourlyObservations: [
      { lmstHour: 0, lmstString: '00:00 LMST', utcTimestamp: '2022-07-08T03:12:00Z', airTempK: 191.6, airTempC: kToC(191.6), airTempSensorId: 'ATS1 (+1.45m)', groundTempK: 185.3, groundTempC: kToC(185.3), groundTempSensorId: 'TIRS (7–14µm)', qualityFlag: 'VALID_SCIENCE', roverLon: 77.4205, roverLat: 18.4537, roverSiteDrive: 'Site 22/1450' },
      { lmstHour: 2, lmstString: '02:00 LMST', utcTimestamp: '2022-07-08T05:15:00Z', airTempK: 188.7, airTempC: kToC(188.7), airTempSensorId: 'ATS1 (+1.45m)', groundTempK: 181.5, groundTempC: kToC(181.5), groundTempSensorId: 'TIRS (7–14µm)', qualityFlag: 'VALID_SCIENCE', roverLon: 77.4205, roverLat: 18.4537, roverSiteDrive: 'Site 22/1450' },
      { lmstHour: 4, lmstString: '04:00 LMST', utcTimestamp: '2022-07-08T07:18:00Z', airTempK: 187.3, airTempC: kToC(187.3), airTempSensorId: 'ATS1 (+1.45m)', groundTempK: 179.8, groundTempC: kToC(179.8), groundTempSensorId: 'TIRS (7–14µm)', qualityFlag: 'VALID_SCIENCE', roverLon: 77.4205, roverLat: 18.4537, roverSiteDrive: 'Site 22/1450' },
      { lmstHour: 6, lmstString: '06:00 LMST', utcTimestamp: '2022-07-08T09:21:00Z', airTempK: 195.2, airTempC: kToC(195.2), airTempSensorId: 'ATS1 (+1.45m)', groundTempK: 192.4, groundTempC: kToC(192.4), groundTempSensorId: 'TIRS (7–14µm)', qualityFlag: 'VALID_SCIENCE', roverLon: 77.4205, roverLat: 18.4537, roverSiteDrive: 'Site 22/1450' },
      { lmstHour: 8, lmstString: '08:00 LMST', utcTimestamp: '2022-07-08T11:24:00Z', airTempK: 218.4, airTempC: kToC(218.4), airTempSensorId: 'ATS1 (+1.45m)', groundTempK: 228.1, groundTempC: kToC(228.1), groundTempSensorId: 'TIRS (7–14µm)', qualityFlag: 'VALID_SCIENCE', roverLon: 77.4205, roverLat: 18.4537, roverSiteDrive: 'Site 22/1450' },
      { lmstHour: 10, lmstString: '10:00 LMST', utcTimestamp: '2022-07-08T13:27:00Z', airTempK: 239.5, airTempC: kToC(239.5), airTempSensorId: 'ATS1 (+1.45m)', groundTempK: 256.3, groundTempC: kToC(256.3), groundTempSensorId: 'TIRS (7–14µm)', qualityFlag: 'VALID_SCIENCE', roverLon: 77.4205, roverLat: 18.4537, roverSiteDrive: 'Site 22/1450' },
      { lmstHour: 12, lmstString: '12:00 LMST', utcTimestamp: '2022-07-08T15:30:00Z', airTempK: 251.8, airTempC: kToC(251.8), airTempSensorId: 'ATS1 (+1.45m)', groundTempK: 274.6, groundTempC: kToC(274.6), groundTempSensorId: 'TIRS (7–14µm)', qualityFlag: 'VALID_SCIENCE', roverLon: 77.4205, roverLat: 18.4537, roverSiteDrive: 'Site 22/1450' },
      { lmstHour: 14, lmstString: '14:00 LMST', utcTimestamp: '2022-07-08T17:33:00Z', airTempK: 254.2, airTempC: kToC(254.2), airTempSensorId: 'ATS1 (+1.45m)', groundTempK: 275.9, groundTempC: kToC(275.9), groundTempSensorId: 'TIRS (7–14µm)', qualityFlag: 'VALID_SCIENCE', roverLon: 77.4205, roverLat: 18.4537, roverSiteDrive: 'Site 22/1450' },
      { lmstHour: 16, lmstString: '16:00 LMST', utcTimestamp: '2022-07-08T19:36:00Z', airTempK: 242.0, airTempC: kToC(242.0), airTempSensorId: 'ATS1 (+1.45m)', groundTempK: 248.5, groundTempC: kToC(248.5), groundTempSensorId: 'TIRS (7–14µm)', qualityFlag: 'VALID_SCIENCE', roverLon: 77.4205, roverLat: 18.4537, roverSiteDrive: 'Site 22/1450' },
      { lmstHour: 18, lmstString: '18:00 LMST', utcTimestamp: '2022-07-08T21:39:00Z', airTempK: 219.8, airTempC: kToC(219.8), airTempSensorId: 'ATS1 (+1.45m)', groundTempK: 215.2, groundTempC: kToC(215.2), groundTempSensorId: 'TIRS (7–14µm)', qualityFlag: 'VALID_SCIENCE', roverLon: 77.4205, roverLat: 18.4537, roverSiteDrive: 'Site 22/1450' },
      { lmstHour: 20, lmstString: '20:00 LMST', utcTimestamp: '2022-07-08T23:42:00Z', airTempK: 203.4, airTempC: kToC(203.4), airTempSensorId: 'ATS1 (+1.45m)', groundTempK: 196.8, groundTempC: kToC(196.8), groundTempSensorId: 'TIRS (7–14µm)', qualityFlag: 'VALID_SCIENCE', roverLon: 77.4205, roverLat: 18.4537, roverSiteDrive: 'Site 22/1450' },
      { lmstHour: 22, lmstString: '22:00 LMST', utcTimestamp: '2022-07-09T01:45:00Z', airTempK: 195.1, airTempC: kToC(195.1), airTempSensorId: 'ATS1 (+1.45m)', groundTempK: 188.7, groundTempC: kToC(188.7), groundTempSensorId: 'TIRS (7–14µm)', qualityFlag: 'VALID_SCIENCE', roverLon: 77.4205, roverLat: 18.4537, roverSiteDrive: 'Site 22/1450' },
    ],
  },
  {
    sol: 518,
    martianSeasonLs: 79.5, // Late northern spring
    solDescription: 'Wildcat Ridge mudstone drill sampling and abrasion campaign',
    locationName: 'Wildcat Ridge (Jezero Delta Plain)',
    roverCoordinates: {
      lon: 77.4164,
      lat: 18.4564,
      siteDrive: 'Site 23, Drive 1512',
    },
    pdsProductRef: 'urn:nasa:pds:mars2020_meda:data_calibrated:ats_sol00518_cal',
    hourlyObservations: [
      { lmstHour: 0, lmstString: '00:00 LMST', utcTimestamp: '2022-08-04T12:05:00Z', airTempK: 193.1, airTempC: kToC(193.1), airTempSensorId: 'ATS1 (+1.45m)', groundTempK: 186.2, groundTempC: kToC(186.2), groundTempSensorId: 'TIRS (7–14µm)', qualityFlag: 'VALID_SCIENCE', roverLon: 77.4164, roverLat: 18.4564, roverSiteDrive: 'Site 23/1512' },
      { lmstHour: 2, lmstString: '02:00 LMST', utcTimestamp: '2022-08-04T14:08:00Z', airTempK: 189.9, airTempC: kToC(189.9), airTempSensorId: 'ATS1 (+1.45m)', groundTempK: 182.8, groundTempC: kToC(182.8), groundTempSensorId: 'TIRS (7–14µm)', qualityFlag: 'VALID_SCIENCE', roverLon: 77.4164, roverLat: 18.4564, roverSiteDrive: 'Site 23/1512' },
      { lmstHour: 4, lmstString: '04:00 LMST', utcTimestamp: '2022-08-04T16:11:00Z', airTempK: 188.2, airTempC: kToC(188.2), airTempSensorId: 'ATS1 (+1.45m)', groundTempK: 180.4, groundTempC: kToC(180.4), groundTempSensorId: 'TIRS (7–14µm)', qualityFlag: 'VALID_SCIENCE', roverLon: 77.4164, roverLat: 18.4564, roverSiteDrive: 'Site 23/1512' },
      { lmstHour: 6, lmstString: '06:00 LMST', utcTimestamp: '2022-08-04T18:14:00Z', airTempK: 197.6, airTempC: kToC(197.6), airTempSensorId: 'ATS1 (+1.45m)', groundTempK: 194.5, groundTempC: kToC(194.5), groundTempSensorId: 'TIRS (7–14µm)', qualityFlag: 'VALID_SCIENCE', roverLon: 77.4164, roverLat: 18.4564, roverSiteDrive: 'Site 23/1512' },
      { lmstHour: 8, lmstString: '08:00 LMST', utcTimestamp: '2022-08-04T20:17:00Z', airTempK: 221.3, airTempC: kToC(221.3), airTempSensorId: 'ATS1 (+1.45m)', groundTempK: 231.7, groundTempC: kToC(231.7), groundTempSensorId: 'TIRS (7–14µm)', qualityFlag: 'VALID_SCIENCE', roverLon: 77.4164, roverLat: 18.4564, roverSiteDrive: 'Site 23/1512' },
      { lmstHour: 10, lmstString: '10:00 LMST', utcTimestamp: '2022-08-04T22:20:00Z', airTempK: 242.4, airTempC: kToC(242.4), airTempSensorId: 'ATS1 (+1.45m)', groundTempK: 259.8, groundTempC: kToC(259.8), groundTempSensorId: 'TIRS (7–14µm)', qualityFlag: 'VALID_SCIENCE', roverLon: 77.4164, roverLat: 18.4564, roverSiteDrive: 'Site 23/1512' },
      { lmstHour: 12, lmstString: '12:00 LMST', utcTimestamp: '2022-08-05T00:23:00Z', airTempK: 253.9, airTempC: kToC(253.9), airTempSensorId: 'ATS1 (+1.45m)', groundTempK: 277.1, groundTempC: kToC(277.1), groundTempSensorId: 'TIRS (7–14µm)', qualityFlag: 'VALID_SCIENCE', roverLon: 77.4164, roverLat: 18.4564, roverSiteDrive: 'Site 23/1512' },
      { lmstHour: 14, lmstString: '14:00 LMST', utcTimestamp: '2022-08-05T02:26:00Z', airTempK: 256.4, airTempC: kToC(256.4), airTempSensorId: 'ATS1 (+1.45m)', groundTempK: 278.4, groundTempC: kToC(278.4), groundTempSensorId: 'TIRS (7–14µm)', qualityFlag: 'VALID_SCIENCE', roverLon: 77.4164, roverLat: 18.4564, roverSiteDrive: 'Site 23/1512' },
      { lmstHour: 16, lmstString: '16:00 LMST', utcTimestamp: '2022-08-05T04:29:00Z', airTempK: 244.5, airTempC: kToC(244.5), airTempSensorId: 'ATS1 (+1.45m)', groundTempK: 251.3, groundTempC: kToC(251.3), groundTempSensorId: 'TIRS (7–14µm)', qualityFlag: 'VALID_SCIENCE', roverLon: 77.4164, roverLat: 18.4564, roverSiteDrive: 'Site 23/1512' },
      { lmstHour: 18, lmstString: '18:00 LMST', utcTimestamp: '2022-08-05T06:32:00Z', airTempK: 221.7, airTempC: kToC(221.7), airTempSensorId: 'ATS1 (+1.45m)', groundTempK: 218.0, groundTempC: kToC(218.0), groundTempSensorId: 'TIRS (7–14µm)', qualityFlag: 'VALID_SCIENCE', roverLon: 77.4164, roverLat: 18.4564, roverSiteDrive: 'Site 23/1512' },
      { lmstHour: 20, lmstString: '20:00 LMST', utcTimestamp: '2022-08-05T08:35:00Z', airTempK: 204.8, airTempC: kToC(204.8), airTempSensorId: 'ATS1 (+1.45m)', groundTempK: 198.5, groundTempC: kToC(198.5), groundTempSensorId: 'TIRS (7–14µm)', qualityFlag: 'VALID_SCIENCE', roverLon: 77.4164, roverLat: 18.4564, roverSiteDrive: 'Site 23/1512' },
      { lmstHour: 22, lmstString: '22:00 LMST', utcTimestamp: '2022-08-05T10:38:00Z', airTempK: 196.4, airTempC: kToC(196.4), airTempSensorId: 'ATS1 (+1.45m)', groundTempK: 190.1, groundTempC: kToC(190.1), groundTempSensorId: 'TIRS (7–14µm)', qualityFlag: 'VALID_SCIENCE', roverLon: 77.4164, roverLat: 18.4564, roverSiteDrive: 'Site 23/1512' },
    ],
  },
  {
    sol: 12,
    martianSeasonLs: 9.8, // Early northern spring
    solDescription: 'Initial checkout around Octavia E. Butler Landing site',
    locationName: 'Octavia E. Butler Landing (Jezero Floor)',
    roverCoordinates: {
      lon: 77.4508,
      lat: 18.4447,
      siteDrive: 'Site 1, Drive 0',
    },
    pdsProductRef: 'urn:nasa:pds:mars2020_meda:data_calibrated:ats_sol00012_cal',
    hourlyObservations: [
      { lmstHour: 0, lmstString: '00:00 LMST', utcTimestamp: '2021-03-03T08:44:00Z', airTempK: 190.2, airTempC: kToC(190.2), airTempSensorId: 'ATS1 (+1.45m)', groundTempK: 183.9, groundTempC: kToC(183.9), groundTempSensorId: 'TIRS (7–14µm)', qualityFlag: 'VALID_SCIENCE', roverLon: 77.4508, roverLat: 18.4447, roverSiteDrive: 'Site 1/0' },
      { lmstHour: 4, lmstString: '04:00 LMST', utcTimestamp: '2021-03-03T12:50:00Z', airTempK: 186.1, airTempC: kToC(186.1), airTempSensorId: 'ATS1 (+1.45m)', groundTempK: 178.2, groundTempC: kToC(178.2), groundTempSensorId: 'TIRS (7–14µm)', qualityFlag: 'VALID_SCIENCE', roverLon: 77.4508, roverLat: 18.4447, roverSiteDrive: 'Site 1/0' },
      { lmstHour: 8, lmstString: '08:00 LMST', utcTimestamp: '2021-03-03T16:56:00Z', airTempK: 216.5, airTempC: kToC(216.5), airTempSensorId: 'ATS1 (+1.45m)', groundTempK: 225.4, groundTempC: kToC(225.4), groundTempSensorId: 'TIRS (7–14µm)', qualityFlag: 'VALID_SCIENCE', roverLon: 77.4508, roverLat: 18.4447, roverSiteDrive: 'Site 1/0' },
      { lmstHour: 12, lmstString: '12:00 LMST', utcTimestamp: '2021-03-03T21:02:00Z', airTempK: 250.3, airTempC: kToC(250.3), airTempSensorId: 'ATS1 (+1.45m)', groundTempK: 272.8, groundTempC: kToC(272.8), groundTempSensorId: 'TIRS (7–14µm)', qualityFlag: 'VALID_SCIENCE', roverLon: 77.4508, roverLat: 18.4447, roverSiteDrive: 'Site 1/0' },
      { lmstHour: 14, lmstString: '14:00 LMST', utcTimestamp: '2021-03-03T23:05:00Z', airTempK: 253.1, airTempC: kToC(253.1), airTempSensorId: 'ATS1 (+1.45m)', groundTempK: 274.5, groundTempC: kToC(274.5), groundTempSensorId: 'TIRS (7–14µm)', qualityFlag: 'VALID_SCIENCE', roverLon: 77.4508, roverLat: 18.4447, roverSiteDrive: 'Site 1/0' },
      { lmstHour: 18, lmstString: '18:00 LMST', utcTimestamp: '2021-03-04T03:11:00Z', airTempK: 217.4, airTempC: kToC(217.4), airTempSensorId: 'ATS1 (+1.45m)', groundTempK: 212.7, groundTempC: kToC(212.7), groundTempSensorId: 'TIRS (7–14µm)', qualityFlag: 'VALID_SCIENCE', roverLon: 77.4508, roverLat: 18.4447, roverSiteDrive: 'Site 1/0' },
      { lmstHour: 22, lmstString: '22:00 LMST', utcTimestamp: '2021-03-04T07:17:00Z', airTempK: 194.0, airTempC: kToC(194.0), airTempSensorId: 'ATS1 (+1.45m)', groundTempK: 186.9, groundTempC: kToC(186.9), groundTempSensorId: 'TIRS (7–14µm)', qualityFlag: 'VALID_SCIENCE', roverLon: 77.4508, roverLat: 18.4447, roverSiteDrive: 'Site 1/0' },
    ],
  },
];

// Source rows for this old fixture were not bundled; suppress numeric readings.
export const MEDA_HISTORICAL_SOLS: MedaSolRecord[] = LEGACY_UNVERIFIED_SOLS.map(sol => ({
 ...sol, solDescription:'Source rows not verified', pdsProductRef:'Unverified legacy fixture',
 hourlyObservations:sol.hourlyObservations.map(row=>({...row,airTempK:null,airTempC:null,groundTempK:null,groundTempC:null,qualityFlag:'MISSING' as const})),
}));

/**
 * Returns the default MEDA sol record (Sol 518 Wildcat Ridge)
 */
export function getDefaultMedaSol(): MedaSolRecord {
  return MEDA_HISTORICAL_SOLS[1]; // Sol 518
}
