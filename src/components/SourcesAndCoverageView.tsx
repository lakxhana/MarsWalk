import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  ExternalLink,
} from 'lucide-react';
import { DATA_MANIFEST, type ManifestEntry } from '@/lib/dataManifest';
import { JEZERO_HIRISE_CROP } from '@/lib/jezeroHiRISE';
import { MEASURED_DTM_METADATA } from '@/lib/jezeroMeasuredElevationData';
import { JEZERO_COVERAGE_SUMMARY } from '@/lib/jezeroCoverage';

interface SourcesAndCoverageViewProps {
  onBackToPlan?: () => void;
}

export default function SourcesAndCoverageView({
  onBackToPlan,
}: SourcesAndCoverageViewProps) {
  const [expandedManifestId, setExpandedManifestId] = useState<string | null>('jezero-west-active');

  const summaryLayers = [
    {
      name: 'Legacy east-crop elevation grid',
      source: MEASURED_DTM_METADATA.productId,
      status: '321 × 321 measured postings · 8.0773 m spacing',
      category: 'derived',
    },
    {
      name: 'Legacy east-crop orbital imagery',
      source: JEZERO_HIRISE_CROP.productId,
      status: '2560 × 2560 crop · 1.0097 m/pixel',
      category: 'observed',
    },
    {
      name: 'Legacy crop coverage',
      source: 'Overlapping HiRISE crop and DTM',
      status: `${JEZERO_COVERAGE_SUMMARY.imageNoDataCellCount} image-gap cells inferred from JPEG zeros; approximate`,
      category: 'derived',
    },
    {
      name: 'Movement and route timing',
      source: 'MARSWalk prototype model',
      status: 'Simulated; assumptions are not operational guidance',
      category: 'simulated',
    },
  ];

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#181513] select-none font-sans text-[#f1e8db]">
      <div className="flex-1 overflow-y-auto p-6 sm:p-10">
        <div className="max-w-6xl mx-auto flex flex-col gap-8">
          {/* Header */}
          <div className="flex items-center gap-3">
            {onBackToPlan && (
              <button
                onClick={onBackToPlan}
                className="rounded-lg p-1.5 text-[#b3a595] hover:bg-white/5 hover:text-[#f1e8db] transition cursor-pointer"
                title="Back to plan"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-amber-500/15 text-[#e8955f] font-bold text-[10px] px-2 py-0.5 uppercase tracking-wider">
                  Science Manifest
                </span>
                <span className="text-[11px] text-[#b3a595]">                MRO HiRISE demonstration crop</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#f1e8db] mt-0.5">
                Data Provenance & Coverage
              </h1>
              <p className="text-xs sm:text-sm text-[#b3a595] mt-1">
                Source metadata for the bundled orbital crop, measured elevation grid, and simulated navigation.
              </p>
            </div>
          </div>

          {/* Grid Layout: Table & Accordions on Left, Coverage Preview on Right */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left 7 Columns: Status Table & Full Structured Manifest */}
            <div className="lg:col-span-7 flex flex-col gap-6">
              {/* Data Sources Summary Table (Board 04 Bottom) */}
              <div className="overflow-hidden rounded-2xl border border-[#3c342e] bg-[#262019] shadow-xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#3c342e] bg-[#272019] font-semibold text-[#b3a595]">
                      <th className="py-3 px-4">Layer / Feature</th>
                      <th className="py-3 px-4">Source Dataset</th>
                      <th className="py-3 px-4">Status & Provenance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#3c342e]">
                    {summaryLayers.map((layer) => (
                      <tr key={layer.name} className="hover:bg-neutral-50/70 transition">
                        <td className="py-3 px-4 font-semibold text-[#f1e8db]">
                          <div className="flex items-center gap-1.5">
                            {layer.category === 'observed' && (
                              <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" title="Observed Data" />
                            )}
                            {layer.category === 'derived' && (
                              <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" title="Derived Results" />
                            )}
                            {layer.category === 'simulated' && (
                              <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" title="Simulated" />
                            )}
                            <span>{layer.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-[#b3a595]">
                          {layer.source}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-medium ${
                              layer.category === 'observed'
                                ? 'bg-[#1f2d1d] text-[#a9d494] border border-[#3f5e36]'
                                : layer.category === 'derived'
                                ? 'bg-[#33261a] text-[#f0b36a] border border-[#6b4a22]'
                                : 'bg-blue-50 text-blue-800 border border-blue-200'
                            }`}
                          >
                            {layer.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Distinction Banner: Observed vs Derived vs Simulated (Requirement 7) */}
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="rounded-xl border border-[#3f5e36] bg-emerald-50/60 p-3">
                  <div className="flex items-center gap-1.5 font-bold text-[#a9d494] mb-1">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span>[Observed Data]</span>
                  </div>
                  <div className="text-[11px] text-[#a9d494] leading-tight">
                    Legacy east-crop imagery (separate from current named routes), product {JEZERO_HIRISE_CROP.productId}.
                  </div>
                </div>

                <div className="rounded-xl border border-[#6b4a22] bg-amber-50/60 p-3">
                  <div className="flex items-center gap-1.5 font-bold text-[#f0b36a] mb-1">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    <span>[Derived Results]</span>
                  </div>
                  <div className="text-[11px] text-[#f0b36a] leading-tight">
                    Paired HiRISE DTM postings, coverage checks, slope calculations, and route graph.
                  </div>
                </div>

                <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3">
                  <div className="flex items-center gap-1.5 font-bold text-blue-900 mb-1">
                    <span className="h-2 w-2 rounded-full bg-blue-500" />
                    <span>[Simulation]</span>
                  </div>
                  <div className="text-[11px] text-blue-800 leading-tight">
                    Simulated movement, route-speed assumptions, and prototype constraint limits.
                  </div>
                </div>
              </div>

              <section className="rounded-xl border bg-white p-4 text-sm text-[#202321]"><h2>Named-site map & temperature</h2><p>Primary map: NASA Mars Trek HiRISE mosaic. Site pins and recorded routes: Perseverance MMGIS GeoJSON. Movement follows the recorded rover path; human traversability is not assessed.</p><p>Air temperature: NASA daily min/max, Sol 1133 (27 April 2024). Historical, not live.</p><a className="underline" href="https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json" target="_blank" rel="noreferrer">NASA waypoint source</a><span> · </span><a className="underline" href="https://mars.nasa.gov/rss/api/?feed=weather&category=mars2020&feedtype=json" target="_blank" rel="noreferrer">NASA temperature source</a><details><summary>Legacy terrain crop</summary><p>The elevation products below support earlier saved routes. They do not cover the named delta sites used by the current planner.</p></details></section>

              {/* Detailed Structured Manifest Accordions (Requirement 7) */}
              <div className="flex flex-col gap-3">
                <h2 className="text-sm font-bold text-[#f1e8db]">
                  Dataset Specifications & Processing Pipelines
                </h2>

                {DATA_MANIFEST.map((item: ManifestEntry) => {
                  const isOpen = expandedManifestId === item.id;
                  return (
                    <div
                      key={item.id}
                      className="rounded-xl border border-[#3c342e] bg-[#262019] shadow-xs overflow-hidden transition"
                    >
                      <button
                        onClick={() =>
                          setExpandedManifestId(isOpen ? null : item.id)
                        }
                        className="flex w-full items-center justify-between p-4 text-xs font-semibold text-[#f1e8db] hover:bg-[#eef2ef] transition cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-2.5">
                          {isOpen ? (
                            <ChevronDown className="h-4 w-4 text-[#e8955f] shrink-0" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-[#b3a595] shrink-0" />
                          )}
                          <div>
                            <div className="font-bold text-[#f1e8db]">{item.name}</div>
                            <div className="text-[10px] text-[#b3a595] font-mono mt-0.5">
                              ID: {item.productIdentifier}
                            </div>
                          </div>
                        </div>

                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-semibold shrink-0 ${
                            item.category === 'observed'
                              ? 'bg-[#27391f] text-[#a9d494]'
                              : item.category === 'derived'
                              ? 'bg-amber-100 text-[#f0b36a]'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {item.categoryLabel}
                        </span>
                      </button>

                      {isOpen && (
                        <div className="p-4 pt-1 text-xs text-[#b3a595] border-t border-[#3c342e] space-y-3 bg-[#181513]/50">
                          {/* Official Source & Dates */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                            <div>
                              <span className="font-semibold text-[#f1e8db]">Organization: </span>
                              <span>{item.sourceOrganization}</span>
                            </div>
                            <div>
                              <span className="font-semibold text-[#f1e8db]">Observation Date: </span>
                              <span>{item.observationDateRange}</span>
                            </div>
                          </div>

                          {/* Coordinate Reference System & Bounds */}
                          <div className="rounded-lg bg-[#262019] p-2.5 border border-[#3c342e] space-y-1 text-[11px]">
                            <div className="font-semibold text-[#f1e8db]">Spatial Reference & Datum</div>
                            <div>CRS: <span className="font-mono text-[#f1e8db]">{item.spatialCoverage.crs}</span></div>
                            <div>Longitude Convention: <span className="text-[#f1e8db]">{item.spatialCoverage.longitudeConvention}</span></div>
                            <div>Elevation Datum: <span className="text-[#f1e8db]">{item.spatialCoverage.elevationDatum}</span></div>
                            <div>Bounds: <span className="text-[#f1e8db]">{item.spatialCoverage.bounds}</span></div>
                          </div>

                          {/* Units & Missing Data Conventions */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                            <div>
                              <span className="font-semibold text-[#f1e8db]">Horizontal Units: </span>
                              <span>{item.unitsAndConventions.horizontalUnits}</span>
                            </div>
                            <div>
                              <span className="font-semibold text-[#f1e8db]">Vertical Units: </span>
                              <span>{item.unitsAndConventions.verticalUnits}</span>
                            </div>
                            <div>
                              <span className="font-semibold text-[#f1e8db]">Temperature Units: </span>
                              <span>{item.unitsAndConventions.temperatureUnits}</span>
                            </div>
                            <div>
                              <span className="font-semibold text-[#f1e8db]">Missing Data Value: </span>
                              <span className="font-mono text-rose-700">{item.unitsAndConventions.missingDataConvention}</span>
                            </div>
                          </div>

                          {/* Processing Pipeline */}
                          <div>
                            <div className="font-semibold text-[#f1e8db] mb-1">Processing Pipeline:</div>
                            <ol className="list-decimal list-inside space-y-0.5 text-[11px] text-neutral-600">
                              {item.processingPipeline.map((step, sIdx) => (
                                <li key={sIdx}>{step}</li>
                              ))}
                            </ol>
                          </div>

                          {/* Known Limitations */}
                          <div className="rounded-lg bg-amber-50/70 border border-amber-200/80 p-2 text-[11px] text-[#f0b36a]">
                            <span className="font-semibold">Documented Limitations: </span>
                            {item.knownLimitations.join(' ')}
                          </div>

                          {/* Official External Link */}
                          <div>
                            <a
                              href={item.officialSourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#e8955f] hover:underline"
                            >
                              <span>Access Official Source Data</span>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <section className="lg:col-span-5 flex flex-col gap-4 rounded-2xl border border-[#3c342e] bg-[#262019] p-5">
              <h2 className="text-sm font-bold text-[#f1e8db]">Bundled navigation crop</h2>
              <img
                src={JEZERO_HIRISE_CROP.assetUrl}
                alt="Bundled HiRISE orbital image crop used by the local navigation map"
                className="w-full rounded-lg border border-[#3c342e] object-contain"
              />
              <dl className="space-y-2 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-[#b3a595]">Product</dt>
                  <dd className="font-mono text-right">{JEZERO_HIRISE_CROP.productId}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[#b3a595]">Footprint</dt>
                  <dd className="text-right">
                    {JEZERO_HIRISE_CROP.cropBounds.west.toFixed(6)}°–{JEZERO_HIRISE_CROP.cropBounds.east.toFixed(6)}° E,
                    {' '}{JEZERO_HIRISE_CROP.cropBounds.south.toFixed(6)}°–{JEZERO_HIRISE_CROP.cropBounds.north.toFixed(6)}° N
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[#b3a595]">Paired DTM</dt>
                  <dd className="text-right">
                    {MEASURED_DTM_METADATA.productId} · {MEASURED_DTM_METADATA.gridDimensions.cols} × {MEASURED_DTM_METADATA.gridDimensions.rows} · {MEASURED_DTM_METADATA.gridSpacingMeters.toFixed(4)} m
                  </dd>
                </div>
              </dl>
              <p className="border-t border-[#3c342e] pt-3 text-xs leading-5 text-[#b3a595]">
                This older east-crop coverage is separate from the current western named-site route data. Its mapped coverage is the overlapping crop plus known internal gaps. The DTM contains no missing postings in the bundled grid. The {JEZERO_COVERAGE_SUMMARY.imageNoDataCellCount}-cell image-gap mask is inferred from exact-zero pixels in a lossy JPEG, so its boundaries are approximate; source nulls not preserved by JPEG cannot be ruled out.
              </p>
              <a
                href={JEZERO_HIRISE_CROP.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-10 items-center gap-2 text-xs font-medium underline"
              >
                Open original HiRISE orthoimage product <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
