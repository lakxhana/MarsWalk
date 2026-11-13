// NASA Mars Trek WMTS configuration for the Jezero overhead imagery.
//
// Verified against the live GetCapabilities XML for:
//   JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd
//     endpoint: https://trek.nasa.gov/tiles/Mars/EQ/JEZ_hirise_.../
//     TileMatrixSet: default028mm
//     SupportedCRS: urn:ogc:def:crs:EPSG::104905  (equirectangular, Mars)
//     Format: image/png
//     TileWidth/Height: 256
//     TopLeftCorner: -180, 90
//     Levels 0..17, MatrixWidth/Height double each level (2:1 grid)
//
// Coverage bbox (WGS84-equivalent for Mars): 77.2229331, 18.3067994,
// 77.583964, 18.669315.
//
// Tile URL template (note the double slash after 1.0.0, matching the
// ResourceURL in the capabilities):
//   {endpoint}/1.0.0/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.png

export interface WmtsLayer {
  id: string;
  title: string;
  endpoint: string;
  style: string;
  tileMatrixSet: string;
  format: 'image/png' | 'image/jpeg';
  minZoom: number;
  maxZoom: number;
  // Coverage in degrees (lon/lat, planetographic).
  bbox: { west: number; south: number; east: number; north: number };
  credit: string;
}

export const JEZERO_HIRISE: WmtsLayer = {
  id: 'JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd',
  title: 'MRO HiRISE — Jezero Mosaic (controlled, ~25 cm/px)',
  endpoint:
    'https://trek.nasa.gov/tiles/Mars/EQ/JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd',
  style: 'default',
  tileMatrixSet: 'default028mm',
  format: 'image/png',
  minZoom: 0,
  maxZoom: 17,
  bbox: {
    west: 77.2229331,
    south: 18.3067994,
    east: 77.583964,
    north: 18.669315,
  },
  credit: 'Imagery: NASA / JPL / University of Arizona (MRO HiRISE) via Mars Trek',
};

// Top-left corner of the equirectangular tile grid.
export const GRID_TOP_LEFT = { lon: -180, lat: 90 };

// Build a tile URL for a given WMTS layer / zoom / tile coords.
export function tileUrl(layer: WmtsLayer, z: number, row: number, col: number): string {
  const ext = layer.format === 'image/png' ? 'png' : 'jpg';
  return `${layer.endpoint}/1.0.0/${layer.style}/${layer.tileMatrixSet}/${z}/${row}/${col}.${ext}`;
}

// Tile matrix dimensions (cols x rows) per zoom level for the 2:1 grid.
export function matrixSize(z: number): { cols: number; rows: number } {
  const cols = 2 << z; // z0 -> 2, z1 -> 4 ...
  const rows = 1 << z; // z0 -> 1, z1 -> 2 ...
  return { cols, rows };
}
