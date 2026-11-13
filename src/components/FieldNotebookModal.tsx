import React from 'react';
import {
  SCIENCE_STATIONS,
  type FieldNotebookEntry,
} from '@/lib/scienceStations';
import { BookOpen, CheckCircle2, Circle, ExternalLink, X } from 'lucide-react';

interface FieldNotebookModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries: Record<string, FieldNotebookEntry>;
}

export default function FieldNotebookModal({
  isOpen,
  onClose,
  entries,
}: FieldNotebookModalProps) {
  if (!isOpen) return null;

  const stations = Object.values(SCIENCE_STATIONS);
  const completedCount = stations.filter((s) => entries[s.id]?.completed).length;

  return (
    <div className="app-dialog fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-5 backdrop-blur-sm animate-fade-in">
      <div className="relative my-auto flex max-h-[88vh] w-full max-w-2xl flex-col rounded-xl border border-white/10 bg-[#17130f] text-[#f3f1ee] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400">
              <BookOpen className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-wide text-white">
                Mars Exploration Field Notebook
              </h2>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-neutral-400">
                <span>Jezero Crater Science Traverse</span>
                <span>·</span>
                <span className="font-mono text-neutral-300">
                  {completedCount} of {stations.length} Stations Recorded
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-neutral-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Close Notebook"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Stations Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {stations.map((st) => {
            const entry = entries[st.id];
            const isCompleted = Boolean(entry?.completed);

            return (
              <div
                key={st.id}
                className={`rounded-lg border p-4 transition ${
                  isCompleted
                    ? 'border-emerald-500/30 bg-emerald-950/15'
                    : 'border-white/10 bg-white/[0.02]'
                }`}
              >
                {/* Station Title Bar */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-amber-400">
                        Station {st.label}
                      </span>
                      <span className="font-semibold text-sm text-white">
                        {st.name}
                      </span>
                    </div>
                    <div className="mt-0.5 text-neutral-400">
                      {st.subtitle}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isCompleted ? (
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                        <CheckCircle2 className="h-3 w-3" />
                        Recorded
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded bg-white/5 border border-white/10 px-2 py-0.5 text-[11px] font-medium text-neutral-400">
                        <Circle className="h-3 w-3" />
                        Unvisited
                      </span>
                    )}

                  </div>
                </div>

                {/* Technical Metadata */}
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] border-t border-white/5 pt-2 text-neutral-400">
                  <div>
                    <span className="text-neutral-500">Classification:</span>{' '}
                    <span className="text-neutral-200">{st.rockClassification}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Instrument:</span>{' '}
                    <span className="text-neutral-200">{st.instrument}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Observation:</span>{' '}
                    <span className="text-neutral-200">{st.observationDate} ({st.martianSols})</span>
                  </div>
                  {st.sampleCollected && (
                    <div>
                      <span className="text-neutral-500">Sample Tube:</span>{' '}
                      <span className="text-amber-300">{st.sampleCollected}</span>
                    </div>
                  )}
                </div>

                {/* Recorded User Observation or Prompt to inspect */}
                {isCompleted ? (
                  <div className="mt-3 rounded border border-emerald-500/20 bg-black/40 p-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                      Explorer Field Notes
                    </div>
                    <p className="mt-1 text-neutral-200 leading-relaxed italic">
                      "{entry.userObservation || 'No written remarks recorded.'}"
                    </p>
                    {entry.savedAt && (
                      <div className="mt-1 font-mono text-[10px] text-neutral-500">
                        Logged on {new Date(entry.savedAt).toLocaleDateString()} at{' '}
                        {new Date(entry.savedAt).toLocaleTimeString()}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 text-[11px] text-neutral-500">
                    Review this archival site association in the evidence catalogue; it is not positioned in the local walk map.
                  </div>
                )}

                {/* Official Source link */}
                <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between text-[11px]">
                  <a
                    href={st.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-amber-400/90 hover:text-amber-300 hover:underline"
                  >
                    <span>{st.sourceUrlLabel}</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  <span className="text-neutral-500 font-mono text-[10px]">
                    {st.attribution}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/10 px-5 py-3 bg-white/[0.02]">
          <div className="text-[11px] text-neutral-400">
            Observations are preserved in browser storage across sessions.
          </div>
          <button
            onClick={onClose}
            className="rounded-lg bg-neutral-800 border border-white/10 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-neutral-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
