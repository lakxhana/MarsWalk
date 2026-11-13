import { useState } from 'react';
import { ExternalLink, X, HelpCircle, Database, Compass, Move } from 'lucide-react';

interface HelpAndSourcesModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'help' | 'sources';
}

export default function HelpAndSourcesModal({
  isOpen,
  onClose,
  defaultTab = 'help',
}: HelpAndSourcesModalProps) {
  const [activeTab, setActiveTab] = useState<'help' | 'sources'>(defaultTab);

  if (!isOpen) return null;

  return (
    <div className="app-dialog fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-5 backdrop-blur-sm animate-fade-in">
      <div className="relative my-auto flex max-h-[88vh] w-full max-w-xl flex-col rounded-xl border border-white/10 bg-[#1b1714] text-[#f3f1ee] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400">
              {activeTab === 'help' ? (
                <HelpCircle className="h-4.5 w-4.5" />
              ) : (
                <Database className="h-4.5 w-4.5" />
              )}
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-wide text-white">
                {activeTab === 'help' ? 'Navigation & Controls' : 'Planetary Data & Sources'}
              </h2>
              <div className="text-xs text-neutral-400">
                Jezero Crater Exploration Prototype
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-white/10 bg-white/5 p-0.5 text-xs">
              <button
                onClick={() => setActiveTab('help')}
                className={`rounded-md px-2.5 py-1 font-medium transition cursor-pointer ${
                  activeTab === 'help'
                    ? 'bg-white/15 text-white'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Controls
              </button>
              <button
                onClick={() => setActiveTab('sources')}
                className={`rounded-md px-2.5 py-1 font-medium transition cursor-pointer ${
                  activeTab === 'sources'
                    ? 'bg-white/15 text-white'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Sources
              </button>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-neutral-400 transition hover:bg-white/10 hover:text-white cursor-pointer ml-1"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs leading-relaxed text-neutral-300">
          {activeTab === 'help' ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 space-y-3">
                <div className="flex items-center gap-2 text-white font-semibold text-xs">
                  <Move className="h-4 w-4 text-amber-400" />
                  <span>Movement in 3D Walk</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <div className="text-white font-medium mb-0.5">Look Around</div>
                    <div className="text-neutral-400">Click and drag with mouse or touch. Cursor remains accessible.</div>
                  </div>
                  <div>
                    <div className="text-white font-medium mb-0.5">Click to Walk</div>
                    <div className="text-neutral-400">Click ground within the boundary to walk directly to that point.</div>
                  </div>
                  <div>
                    <div className="text-white font-medium mb-0.5">Keys (WASD / Arrows)</div>
                    <div className="text-neutral-400">Walk freely. Press Shift to sprint. Using keys pauses automated routes.</div>
                  </div>
                  <div>
                    <div className="text-white font-medium mb-0.5">Follow Route</div>
                    <div className="text-neutral-400">Smoothly traverses the Jezero delta science path between waypoints.</div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 space-y-2">
                <div className="text-white font-semibold text-xs">
                  Scientific Inspections
                </div>
                <p className="text-neutral-400">
                  Approach within range of any waypoint to open its observation panel. Each station presents authentic NASA photography, contextual background, observation questions, and a field notebook to log your findings.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 space-y-2">
                <div className="flex items-center gap-2 text-white font-semibold text-xs">
                  <Database className="h-4 w-4 text-amber-400" />
                  <span>Authentic Planetary Datasets</span>
                </div>
                <ul className="space-y-2 text-neutral-300 pl-4 list-disc">
                  <li>
                    <strong className="text-white">Globe:</strong> Calibrated Viking MDIM 2.1 color global photographic mosaic served via NASA Mars Trek WMTS.
                  </li>
                  <li>
                    <strong className="text-white">Map:</strong> Mars Reconnaissance Orbiter (MRO) HiRISE visible camera mosaic (~25 cm/pixel resolution) centered on Jezero Crater (18.44°N, 77.45°E).
                  </li>
                  <li>
                    <strong className="text-white">Science Stations:</strong> Mastcam-Z and SHERLOC/WATSON multispectral photographic observations, sample tube telemetry, and geological determinations acquired directly from NASA Mars 2020 mission releases.
                  </li>
                </ul>
              </div>

              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 space-y-2">
                <div className="flex items-center gap-2 text-white font-semibold text-xs">
                  <Compass className="h-4 w-4 text-amber-400" />
                  <span>Simulated Terrain Notice</span>
                </div>
                <p className="text-neutral-300">
                  The local 3D walking terrain is a procedural reconstruction modeling Jezero fan delta morphology. Formations, distances, and station placements in the 3D walk represent a simulated demonstration environment and are not measured topographic elevation models.
                </p>
              </div>

              <div className="space-y-1.5 text-xs text-neutral-400 border-t border-white/5 pt-3">
                <div className="font-semibold text-neutral-300">Official Archives:</div>
                <div className="flex flex-col gap-1">
                  <a
                    href="https://trek.nasa.gov/mars/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-amber-400 hover:underline"
                  >
                    <span>NASA Mars Trek Portal (JPL / SSERVI)</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  <a
                    href="https://science.nasa.gov/mission/mars-2020-perseverance/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-amber-400 hover:underline"
                  >
                    <span>NASA Mars 2020 Perseverance Mission Official Archive</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/10 px-5 py-3 bg-white/[0.02]">
          <span className="text-xs text-neutral-400">
            Jezero Crater · 18.44°N 77.45°E
          </span>
          <button
            onClick={onClose}
            className="rounded-lg bg-neutral-800 border border-white/10 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-neutral-700 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
