import { messagesForSide } from '@/lib/missionMessages';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  SCIENCE_STATIONS,
  type ScienceStation,
} from '@/lib/scienceStations';
import {
  type ObservationRecord,
  type CommMessage,
  type FieldTask,
  getAllObservations,
  saveObservation,
  deleteObservation,
  getAllMessages,
  getAllTasks,
  saveTask,
  exportAllDataAsJSON,
  importDataFromJSON,
} from '@/lib/storage';
import {
  formatSimLMST,
  formatSecondsCountdown,
  sendQuestionToScienceTeam,
  type PlanSnapshot,
} from '@/lib/commManager';
import {
  Plus,
  FileText,
  Edit3,
  Trash2,
  MapPin,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Radio,
  Send,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  Upload,
  Layers,
  Info,
  ShieldAlert,
} from 'lucide-react';

interface FieldNotebookViewProps {
  currentPlanVersion: number;
  currentPlanSummary: string;
  simTime: number;
  simulationPaused: boolean;
  missionActive: boolean;
  oneWayDelayMinutes: number;
  onAdvanceSimTime: (seconds: number) => void;
  onSwitchToScienceTeamView?: () => void;
}

export default function FieldNotebookView({
  currentPlanVersion,
  currentPlanSummary,
  simTime,
  simulationPaused,
  missionActive,
  oneWayDelayMinutes,
  onAdvanceSimTime,
  onSwitchToScienceTeamView,
}: FieldNotebookViewProps) {
  // Station Selection
  const [selectedStationId, setSelectedStationId] = useState<string>('skinner-ridge');
  const [activeTab, setActiveTab] = useState<'observations' | 'comms' | 'tasks' | 'data'>('observations');

  // Observations State
  const [observations, setObservations] = useState<ObservationRecord[]>([]);
  const [selectedObsId, setSelectedObsId] = useState<string | null>(null);
  const [isCreatingObs, setIsCreatingObs] = useState(false);
  const [isEditingObs, setIsEditingObs] = useState(false);
  const [noteInput, setNoteInput] = useState('');
  const [questionInput, setQuestionInput] = useState('');

  // Expandable details state for evidence
  const [isEvidenceExpanded, setIsEvidenceExpanded] = useState(false);

  // Communications State
  const [messages, setMessages] = useState<CommMessage[]>([]);
  const [isSendingComm, setIsSendingComm] = useState(false);

  // Tasks State
  const [tasks, setTasks] = useState<FieldTask[]>([]);

  // Export / Import Feedback
  const [importFeedback, setImportFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Storage error state
  const [storageError, setStorageError] = useState<string | null>(null);

  const stations = Object.values(SCIENCE_STATIONS);
  const selectedStation: ScienceStation = SCIENCE_STATIONS[selectedStationId] || stations[0];
  const isRouteObservationView = selectedStationId === 'walk-route';

  // Refresh data from IndexedDB
  const refreshData = useCallback(async () => {
    try {
      setStorageError(null);
      const [allObs, allMsgs, allTasks] = await Promise.all([
        getAllObservations(),
        getAllMessages(),
        getAllTasks(),
      ]);
      setObservations(allObs);
      setMessages(messagesForSide(allMsgs, 'mars', simTime).filter(m => m.kind !== 'chat'));
      setTasks(allTasks);

      // Select first observation of station if none selected
      if (!selectedObsId && allObs.length > 0) {
        const siteObs = allObs.filter((o) => o.siteId === selectedStationId);
        if (siteObs.length > 0) {
          setSelectedObsId(siteObs[0].id);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStorageError(`Failed to load records from SQLite: ${msg}`);
    }
  }, [selectedStationId, selectedObsId, simTime]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Observations for the active station
  const stationObservations = observations.filter((o) => o.siteId === selectedStationId);
  const activeObservation = observations.find((o) => o.id === selectedObsId) || stationObservations[0] || null;

  // Active task & upcoming tasks
  const activeTask = tasks.find((t) => t.status === 'in_progress' || t.status === 'blocked_on_advice');
  const upcomingTasks = tasks.filter((t) => t.id !== activeTask?.id);

  // Check if active task is blocked by any message
  const blockingMessage = activeTask?.blockedByMessageId
    ? messages.find((m) => m.id === activeTask.blockedByMessageId)
    : null;

  // Start new observation form
  const handleStartCreateObs = () => {
    setNoteInput('');
    setQuestionInput('');
    setIsCreatingObs(true);
    setIsEditingObs(false);
  };

  // Start edit observation form
  const handleStartEditObs = (obs: ObservationRecord) => {
    setNoteInput(obs.note);
    setQuestionInput(obs.question || '');
    setSelectedObsId(obs.id);
    setIsEditingObs(true);
    setIsCreatingObs(false);
  };

  // Save new observation
  const handleSaveNewObservation = async () => {
    if (!noteInput.trim()) return;
    try {
      const newObs: ObservationRecord = {
        id: `obs-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        siteId: isRouteObservationView ? 'walk-route' : selectedStation.id,
        siteName: isRouteObservationView ? 'Along your route' : selectedStation.name,
        targetName: isRouteObservationView ? 'Simulated walk position' : selectedStation.targetFeature,
        location: isRouteObservationView
          ? {
              description: 'Position was not recorded when this note was created from My notes.',
              coordinateReference: 'MARSWalk Jezero local Cartesian frame (x/z metres; simulated).',
            }
          : {
              description: `Archival catalogue record associated with ${selectedStation.name}; no source-supported position is assigned in the local walk map.`,
            },
        locationStatus: isRouteObservationView ? 'unverified' : selectedStation.locationStatus,
        cameraLocation: isRouteObservationView ? undefined : selectedStation.cameraLocation,
        targetLocation: isRouteObservationView ? undefined : selectedStation.targetLocation,
        imageRef: isRouteObservationView ? '' : selectedStation.photographUrl,
        imageCaption: isRouteObservationView ? '' : selectedStation.photographCaption,
        imageIsArchival: isRouteObservationView ? false : selectedStation.isArchivalImage,
        imageSource: isRouteObservationView ? '' : selectedStation.attribution,
        note: noteInput.trim(),
        question: questionInput.trim() || null,
        timestamp: new Date().toISOString(),
        taskId: isRouteObservationView ? null : activeTask?.id || null,
        planVersion: currentPlanVersion,
        editHistory: [],
      };

      await saveObservation(newObs);
      await refreshData();
      setSelectedObsId(newObs.id);
      setIsCreatingObs(false);

      // If user provided a question right away, offer to send it
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStorageError(`Failed to save observation: ${msg}`);
    }
  };

  // Save edited observation (preserving edit history)
  const handleSaveEditedObservation = async () => {
    if (!activeObservation || !noteInput.trim()) return;
    try {
      const updated: ObservationRecord = {
        ...activeObservation,
        editHistory: [
          ...activeObservation.editHistory,
          {
            editedAt: new Date().toISOString(),
            previousNote: activeObservation.note,
            previousQuestion: activeObservation.question,
            planVersion: activeObservation.planVersion,
          },
        ],
        note: noteInput.trim(),
        question: questionInput.trim() || null,
        planVersion: currentPlanVersion,
      };

      await saveObservation(updated);
      await refreshData();
      setIsEditingObs(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStorageError(`Failed to update observation: ${msg}`);
    }
  };

  // Delete observation
  const handleDeleteObservation = async (id: string) => {
    try {
      await deleteObservation(id);
      await refreshData();
      if (selectedObsId === id) setSelectedObsId(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStorageError(`Failed to delete observation: ${msg}`);
    }
  };

  // Send question to Science Team
  const handleTransmitQuestion = async (obs: ObservationRecord) => {
    const qText = obs.question?.trim();
    if (!qText) return;

    setIsSendingComm(true);
    try {
      const planSnapshot: PlanSnapshot = {
        version: currentPlanVersion,
        summary: currentPlanSummary,
        destinationName: obs.siteName,
        totalDistanceMeters: 220,
        maxSlopeDeg: 15.0,
      };

      await sendQuestionToScienceTeam({
        observation: obs,
        questionText: qText,
        simTime,
        oneWayDelayMinutes,
        currentPlan: planSnapshot,
        activeTaskId: obs.taskId,
      });

      await refreshData();
      setActiveTab('comms');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStorageError(`Failed to transmit communication message: ${msg}`);
    } finally {
      setIsSendingComm(false);
    }
  };

  // Switch to independent task
  const handleSwitchToIndependentTask = async (task: FieldTask) => {
    try {
      // Put any in_progress task to pending if not blocked
      for (const t of tasks) {
        if (t.id === task.id) {
          await saveTask({ ...t, status: 'in_progress' });
        } else if (t.status === 'in_progress') {
          await saveTask({ ...t, status: 'pending' });
        }
      }
      await refreshData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStorageError(`Failed to switch task: ${msg}`);
    }
  };

  // Export JSON
  const handleExportJSON = async () => {
    try {
      const json = await exportAllDataAsJSON({
        oneWayDelayMinutes,
        clockSpeedMultiplier: 1,
      });
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `marswalk_fieldwork_export_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStorageError(`Export failed: ${msg}`);
    }
  };

  // Import JSON with validation
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      const res = await importDataFromJSON(content);
      if (res.success) {
        setImportFeedback({
          success: true,
          message: `Successfully imported ${res.importedObservations} observations, ${res.importedMessages} messages, and ${res.importedTasks} tasks.`,
        });
        await refreshData();
      } else {
        setImportFeedback({
          success: false,
          message: res.error || 'Import validation failed.',
        });
      }
    };
    reader.readAsText(file);
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#181513] text-[#f1e8db] select-none font-sans antialiased sm:flex-row">
      {/* 
        COLUMN 1: SITES & EVIDENCE CATALOGUE
      */}
      <aside className="flex h-[40%] min-h-[220px] w-full max-h-80 shrink-0 flex-col border-b border-[#3c342e] bg-[#201b18] sm:h-auto sm:max-h-none sm:min-h-0 sm:w-80 sm:border-b-0 sm:border-r">
        <div className="p-4 border-b border-[#3c342e] flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold tracking-tight text-[#f1e8db]">
              Field Notebook
            </h1>
            <p className="text-[11px] text-[#b3a595]">
              NASA Jezero Evidence & Observations
            </p>
          </div>
          <button
            type="button"
            onClick={handleStartCreateObs}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#d86a33] text-white text-xs font-semibold hover:bg-[#bd5726] transition cursor-pointer shadow-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New note</span>
          </button>
        </div>

        {/* Site List */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#3c342e]">
          {stations.map((st) => {
            const isSelected = selectedStationId === st.id;
            const count = observations.filter((o) => o.siteId === st.id).length;
            const isCatalogOnly = st.locationStatus === 'catalog_only';

            return (
              <button
                key={st.id}
                onClick={() => {
                  setSelectedStationId(st.id);
                  setIsCreatingObs(false);
                  setIsEditingObs(false);
                }}
                className={`w-full p-3.5 text-left transition cursor-pointer flex items-center gap-3 ${
                  isSelected
                    ? 'bg-[#272019] border-l-4 border-l-[var(--text-primary)]'
                    : 'hover:bg-black/[0.02]'
                }`}
              >
                <div className="relative shrink-0">
                  <img
                    src={st.photographUrl}
                    alt={st.name}
                    className="h-12 w-16 rounded-md object-cover border border-[#3c342e] bg-[#352e28]"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                  {isCatalogOnly && (
                    <span className="absolute -bottom-1 -right-1 bg-neutral-800 text-white text-[8px] font-bold px-1 rounded">
                      CATALOG
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#f1e8db] truncate">
                      {st.name}
                    </span>
                    <span className="text-[10px] font-mono text-[#b3a595]">
                      {count} {count === 1 ? 'obs' : 'obs'}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#b3a595] truncate mt-0.5">
                    {st.rockClassification}
                  </div>
                  <div className={`mt-0.5 text-[12px] font-medium ${
                    isCatalogOnly ? 'text-[var(--status-info)]' : 'text-[var(--status-success)]'
                  }`}>
                    {st.isEducationalActivity
                      ? 'Catalogue study · No surface pin'
                      : 'Archival record · No map position'}
                  </div>
                </div>

                <ChevronRight className="h-4 w-4 text-[#8f8274] shrink-0" />
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setSelectedStationId('walk-route');
              setIsCreatingObs(false);
              setIsEditingObs(false);
              setSelectedObsId(null);
            }}
            className={`flex w-full items-center gap-3 border-l-4 p-3.5 text-left transition ${
              isRouteObservationView ? 'border-l-[var(--text-primary)] bg-[#272019]' : 'border-l-transparent hover:bg-black/[0.02]'
            }`}
          >
            <MapPin aria-hidden="true" className="h-10 w-10 shrink-0 rounded border border-[#3c342e] p-2 text-[var(--text-secondary)]" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2 text-[14px] font-semibold">
                <span>Along your route</span>
                <span className="font-mono text-[13px] text-[var(--text-secondary)]">
                  {observations.filter((observation) => observation.siteId === 'walk-route').length}
                </span>
              </span>
              <span className="block text-[13px] text-[var(--text-secondary)]">Simulated positions · not verified rover fixes</span>
            </span>
            <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-[#8f8274]" />
          </button>
        </div>

        {/* Storage status & Export bar */}
        <div className="p-3 border-t border-[#3c342e] bg-neutral-50/70 text-[11px] text-[#b3a595] flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span>SQLite connected</span>
          </div>
          <button
            onClick={() => setActiveTab('data')}
            className="text-[10px] text-[#e8955f] font-semibold hover:underline cursor-pointer"
          >
            Export / Import
          </button>
        </div>
      </aside>

      {/* 
        COLUMN 2: MAIN WORKFLOW TABS (Evidence, Observations, Communications, Tasks)
      */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Navigation Tabs Header */}
        <div className="flex min-h-12 h-auto shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#3c342e] bg-[#201b18] px-2 py-1 sm:px-6">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 text-xs font-semibold sm:gap-4">
            <button
              onClick={() => setActiveTab('observations')}
              className={`shrink-0 py-3 transition cursor-pointer border-b-2 ${
                activeTab === 'observations'
                  ? 'border-[#d86a33] text-[#f1e8db]'
                  : 'border-transparent text-[#b3a595] hover:text-[#f1e8db]'
              }`}
            >
              Observations ({stationObservations.length})
            </button>
            <button
              onClick={() => setActiveTab('comms')}
              className={`flex shrink-0 items-center gap-1.5 py-3 transition cursor-pointer border-b-2 ${
                activeTab === 'comms'
                  ? 'border-[#d86a33] text-[#f1e8db]'
                  : 'border-transparent text-[#b3a595] hover:text-[#f1e8db]'
              }`}
            >
              <Radio className="h-3 w-3" />
              <span>Delay Comm ({messages.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('tasks')}
              className={`flex shrink-0 items-center gap-1.5 py-3 transition cursor-pointer border-b-2 ${
                activeTab === 'tasks'
                  ? 'border-[#d86a33] text-[#f1e8db]'
                  : 'border-transparent text-[#b3a595] hover:text-[#f1e8db]'
              }`}
            >
              <Layers className="h-3 w-3" />
              <span>Tasks & Budget</span>
            </button>
            <button
              onClick={() => setActiveTab('data')}
              className={`shrink-0 py-3 transition cursor-pointer border-b-2 ${
                activeTab === 'data'
                  ? 'border-[#d86a33] text-[#f1e8db]'
                  : 'border-transparent text-[#b3a595] hover:text-[#f1e8db]'
              }`}
            >
              Data Sync
            </button>
          </div>

          {/* Quick link to Science Team Ground Console */}
          {onSwitchToScienceTeamView && (
            <button
              type="button"
              onClick={onSwitchToScienceTeamView}
              aria-label="Open Science Team Console"
              className="flex shrink-0 items-center gap-1 rounded border border-[#3f5e36] bg-[#1f2d1d] px-2.5 py-1 text-[11px] font-semibold text-[#e8955f] transition cursor-pointer hover:bg-[#27391f]"
            >
              <Radio className="h-3 w-3" />
              <span className="hidden sm:inline">Open Science Team Console</span>
            </button>
          )}
        </div>

        {/* Visible Error Banner if Storage or Validation Fails */}
        {storageError && (
          <div className="bg-rose-50 border-b border-rose-200 px-6 py-2.5 text-xs text-rose-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0" />
              <span>{storageError}</span>
            </div>
            <button
              onClick={() => setStorageError(null)}
              className="text-[10px] underline hover:text-rose-950 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Content Scroll Container */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-8">
          <div className="max-w-4xl mx-auto space-y-6">
            {isRouteObservationView ? (
              <section className="space-y-2 border-b border-[#3c342e] pb-5">
                <h2 className="text-xl font-semibold">Along your route</h2>
                <p className="text-[14px] leading-5 text-[var(--text-secondary)]">
                  Walk notes use MARSWalk local simulated positions. They are not verified rover coordinates or surface photographs.
                </p>
                {stationObservations[0]?.location.coordinateReference && (
                  <p className="text-[13px] text-[var(--text-secondary)]">
                    Coordinate reference: {stationObservations[0].location.coordinateReference}
                  </p>
                )}
              </section>
            ) : (
            <div className="rounded-2xl border border-[#3c342e] bg-[#262019] overflow-hidden shadow-xs">
              <div className="grid grid-cols-1 lg:grid-cols-12">
                {/* Photo with Archival Badge */}
                <div className="lg:col-span-5 relative bg-[#2b2520] flex flex-col justify-center">
                  <img
                    src={selectedStation.photographUrl}
                    alt={selectedStation.photographAlt}
                    className="w-full h-full object-cover max-h-64 lg:max-h-none"
                  />
                  <div className="absolute top-3 left-3 rounded-md bg-black/65 px-2 py-0.5 text-[9px] font-semibold text-white tracking-wider uppercase backdrop-blur-xs">
                    Archival NASA Record
                  </div>
                  <div className="absolute bottom-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[8px] text-neutral-300 backdrop-blur-xs">
                    Network-dependent tile
                  </div>
                </div>

                {/* Evidence Summary */}
                <div className="lg:col-span-7 p-5 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#e8955f]">
                        NASA Sourced Evidence · {selectedStation.martianSols}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] text-neutral-300 bg-[#2b2520] px-2 py-0.5 rounded border border-[#3c342e] font-semibold">
                        <Info className="h-2.5 w-2.5" />
                        <span>No mapped coordinates</span>
                      </span>
                    </div>

                    <h2 className="text-xl font-bold tracking-tight text-[#f1e8db] mt-1">
                      {selectedStation.name}
                    </h2>
                    <p className="text-xs text-[#b3a595] font-medium mt-0.5">
                      {selectedStation.subtitle}
                    </p>
                    {selectedStation.locationStatus === 'catalog_only' && (
                      <p className="mt-1 text-xs text-[#b3a595]">
                        Archival site association only; this record is not positioned in mapped walk coverage.
                      </p>
                    )}

                    <div className="mt-3 text-xs text-[#cdbfae] space-y-1.5 leading-relaxed">
                      <p>{selectedStation.contextSentences[0]}</p>
                      <p>{selectedStation.contextSentences[1]}</p>
                    </div>
                  </div>

                  {/* Expandable Technical Details & Limitations */}
                  <div className="pt-2 border-t border-[#3c342e]">
                    <button
                      type="button"
                      onClick={() => setIsEvidenceExpanded(!isEvidenceExpanded)}
                      className="flex w-full items-center justify-between text-xs font-semibold text-[#b3a595] hover:text-[#f1e8db] cursor-pointer"
                    >
                      <span>Instrument, Sols & Mission Limitations</span>
                      {isEvidenceExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </button>

                    {isEvidenceExpanded && (
                      <div className="mt-3 pt-2 border-t border-[#3c342e] text-[11px] text-[#cdbfae] space-y-2 leading-relaxed">
                        <div className="grid grid-cols-2 gap-2 bg-[#201b18] p-2.5 rounded border border-[#3c342e]">
                          <div>
                            <span className="text-[#b3a595] block text-[10px]">Instrument</span>
                            <span className="font-medium text-[#f1e8db]">{selectedStation.instrument}</span>
                          </div>
                          <div>
                            <span className="text-[#b3a595] block text-[10px]">Observation Date</span>
                            <span className="font-medium text-[#f1e8db]">{selectedStation.observationDate}</span>
                          </div>
                          <div>
                            <span className="text-[#b3a595] block text-[10px]">Image viewpoint</span>
                            <span className="font-medium text-[#f1e8db]">{selectedStation.cameraLocation.description}</span>
                          </div>
                          <div>
                            <span className="text-[#b3a595] block text-[10px]">Site association</span>
                            <span className="font-medium text-[#f1e8db]">
                              {selectedStation.targetLocation.description}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <span className="font-semibold text-[#f1e8db] block">Limitations:</span>
                          <ul className="list-disc pl-4 space-y-0.5 text-[#b3a595]">
                            {selectedStation.limitations.map((lim, idx) => (
                              <li key={idx}>{lim}</li>
                            ))}
                          </ul>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <a
                            href={selectedStation.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[#e8955f] hover:underline font-medium text-[11px]"
                          >
                            <span>{selectedStation.sourceUrlLabel}</span>
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>

                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            )}

            {/* TAB 1: OBSERVATIONS */}
            {activeTab === 'observations' && (
              <div className="space-y-6">
                {/* Form to Create / Edit Observation */}
                {(isCreatingObs || isEditingObs) && (
                  <div className="rounded-2xl border-2 border-[#d86a33]/60 bg-[#262019] p-6 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-[#f1e8db] flex items-center gap-1.5">
                        <Edit3 className="h-4 w-4 text-[#e8955f]" />
                        <span>
                          {isEditingObs
                            ? `Edit Observation (#${activeObservation?.id.slice(-6)})`
                            : `Record New Observation at ${isRouteObservationView ? 'Along your route' : selectedStation.name}`}
                        </span>
                      </h3>
                      <span className="text-[11px] text-[#b3a595]">
                        Plan v{currentPlanVersion}
                      </span>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#b3a595] mb-1">
                        Field Observation Note *
                      </label>
                      <textarea
                        value={noteInput}
                        onChange={(e) => setNoteInput(e.target.value)}
                        placeholder="Describe outcrop layers, pebble sorting, mineral matrix, or abrasion rind characteristics..."
                        className="w-full h-28 rounded-xl border border-[#3c342e] p-3 text-xs sm:text-sm text-[#f1e8db] focus:border-[#d86a33] focus:outline-none focus:ring-1 focus:ring-[#d86a33]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#b3a595] mb-1">
                        Scientific Question for Earth Science Team (Optional)
                      </label>
                      <input
                        type="text"
                        value={questionInput}
                        onChange={(e) => setQuestionInput(e.target.value)}
                        placeholder="e.g. Advise whether to clear tailings cone or abrade additional 2 mm deeper..."
                        className="w-full rounded-xl border border-[#3c342e] px-3 py-2 text-xs sm:text-sm text-[#f1e8db] focus:border-[#d86a33] focus:outline-none focus:ring-1 focus:ring-[#d86a33]"
                      />
                      <p className="text-[10px] text-[#b3a595] mt-1">
                        Sending a question initiates a simulated {oneWayDelayMinutes} min one-way transmission to Earth.
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsCreatingObs(false);
                          setIsEditingObs(false);
                        }}
                        className="px-3.5 py-1.5 rounded-lg border border-[#3c342e] text-xs text-[#b3a595] hover:bg-[#1f1a17] cursor-pointer"
                      >
                        Cancel
                      </button>

                      <button
                        type="button"
                        onClick={isEditingObs ? handleSaveEditedObservation : handleSaveNewObservation}
                        disabled={!noteInput.trim()}
                        className="px-4 py-2 rounded-lg bg-[#d86a33] text-white text-xs font-semibold hover:bg-[#bd5726] transition cursor-pointer shadow-xs disabled:opacity-50"
                      >
                        {isEditingObs ? 'Save & Preserve History' : 'Save Observation'}
                      </button>
                    </div>
                  </div>
                )}

                {/* List of Observations for this Site */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#b3a595]">
                      Logged Observations ({stationObservations.length})
                    </h3>
                    {!isCreatingObs && (
                      <button
                        type="button"
                        onClick={handleStartCreateObs}
                        className="text-xs font-semibold text-[#e8955f] hover:underline cursor-pointer flex items-center gap-1"
                      >
                        <Plus className="h-3 w-3" />
                        <span>Add another observation</span>
                      </button>
                    )}
                  </div>

                  {stationObservations.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[#3c342e] bg-[#262019] p-8 text-center text-xs text-[#b3a595]">
                      <FileText className="h-8 w-8 text-neutral-300 mx-auto mb-2" />
                      <p className="font-semibold text-[#f1e8db]">No observations recorded for this site yet</p>
                      <p className="mt-1">
                        Click "Record New Observation" above to log field findings and coordinate with the science team.
                      </p>
                    </div>
                  ) : (
                    stationObservations.map((obs) => {
                      const linkedMessage = messages.find((m) => m.observationId === obs.id);
                      const isDelivered = linkedMessage && simTime >= linkedMessage.deliveredAtSimTime;
                      const isRepliedOnMars = linkedMessage?.replyDeliveredAtSimTime && simTime >= linkedMessage.replyDeliveredAtSimTime;

                      return (
                        <div
                          key={obs.id}
                          className="rounded-2xl border border-[#3c342e] bg-[#262019] p-6 shadow-xs space-y-4"
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono font-bold text-[#e8955f]">
                                  Obs #{obs.id.slice(-6)}
                                </span>
                                <span className="text-neutral-300">·</span>
                                <span className="text-xs text-[#b3a595]">
                                  {new Date(obs.timestamp).toLocaleString([], {
                                    day: 'numeric',
                                    month: 'short',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                                <span className="text-neutral-300">·</span>
                                <span className="text-[10px] text-[#b3a595] font-medium">
                                  Plan v{obs.planVersion}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleStartEditObs(obs)}
                                className="p-1 text-[#b3a595] hover:text-[#f1e8db] transition cursor-pointer"
                                title="Edit note"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteObservation(obs.id)}
                                className="p-1 text-[#b3a595] hover:text-rose-600 transition cursor-pointer"
                                title="Delete observation"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Note text */}
                          <div className="text-sm text-[#f1e8db] leading-relaxed">
                            {obs.note}
                          </div>

                          {obs.audioRef && <audio controls src={obs.audioRef} aria-label="Saved voice note"/>}
                          {obs.imageRef && (
                            <figure className="space-y-1">
                              <img
                                src={obs.imageRef}
                                alt={obs.imageCaption || 'Observation attachment'}
                                className="max-h-64 max-w-full rounded border border-[#3c342e] object-contain"
                              />
                              <figcaption className="text-[13px] text-[var(--text-secondary)]">
                                {obs.imageCaption || (obs.imageIsArchival ? 'Archival source image' : 'Observation attachment')}
                                {obs.imageIsArchival ? ' · archival image' : ' · explorer attachment'}
                              </figcaption>
                            </figure>
                          )}

                          <div className="space-y-1 text-[13px] text-[var(--text-secondary)]">
                            <p>{obs.location.description || 'Location description unavailable.'}</p>
                            {obs.location.x !== undefined && obs.location.z !== undefined && (
                              <p>
                                Local simulation position: x {obs.location.x.toFixed(1)} m, z {obs.location.z.toFixed(1)} m; not Mars geographic coordinates.
                                {obs.location.coordinateReference ? ` · ${obs.location.coordinateReference}` : ''}
                              </p>
                            )}
                          </div>

                          {/* Edit History Audit Trail if previously edited */}
                          {obs.editHistory.length > 0 && (
                            <div className="text-[11px] text-[#b3a595] bg-[#181513] p-2 rounded-lg border border-[#3c342e] space-y-1">
                              <span className="font-semibold block text-[10px] uppercase text-[#b3a595]">
                                Edit Audit History ({obs.editHistory.length} revisions)
                              </span>
                              {obs.editHistory.map((h, i) => (
                                <div key={i} className="italic text-[10px] text-[#b3a595]">
                                  Replaced note from {new Date(h.editedAt).toLocaleTimeString()}: "{h.previousNote.slice(0, 80)}..."
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Attached Question & Comm Status */}
                          {obs.question && (
                            <div className="pt-3 border-t border-[#3c342e] space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-[#e8955f]">
                                  Inquiry for Science Team
                                </span>
                                {linkedMessage ? (
                                  isRepliedOnMars ? (
                                    <span className="text-[10px] font-semibold text-[#a9d494] bg-[#1f2d1d] px-2 py-0.5 rounded border border-[#3f5e36]">
                                      Guidance Received
                                    </span>
                                  ) : isDelivered ? (
                                    <span className="text-[10px] font-semibold text-[#f0b36a] bg-[#33261a] px-2 py-0.5 rounded border border-[#6b4a22]">
                                      Delivered to Earth · Awaiting Reply
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-semibold text-[#8ccdf0] bg-[#1a2a35] px-2 py-0.5 rounded border border-[#35566d]">
                                      In Transit to Earth ({formatSecondsCountdown(linkedMessage.deliveredAtSimTime - simTime)})
                                    </span>
                                  )
                                ) : (
                                  <button
                                    type="button"
                                    disabled={isSendingComm}
                                    onClick={() => handleTransmitQuestion(obs)}
                                    className="px-3 py-1 rounded bg-[#d86a33] text-white text-[11px] font-semibold hover:bg-[#bd5726] transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                                  >
                                    <Send className="h-3 w-3" />
                                    <span>Transmit Question</span>
                                  </button>
                                )}
                              </div>

                              <div className="text-xs italic text-[#334155] bg-[#1a2a35] p-3 rounded-lg border border-[#35566d]">
                                "{obs.question}"
                              </div>

                              {/* Guidance Reply if delivered back to Mars */}
                              {linkedMessage?.replyText && isRepliedOnMars && (
                                <div className="mt-2 rounded-xl border border-[#3f5e36] bg-emerald-50/70 p-4 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-xs text-[#a9d494] flex items-center gap-1.5">
                                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                      <span>Science Team Guidance</span>
                                    </span>
                                    <span className="text-[10px] text-[#a9d494]">
                                      {linkedMessage.scienceTeamAuthor}
                                    </span>
                                  </div>

                                  <p className="text-xs sm:text-sm text-[#f1e8db] leading-relaxed">
                                    {linkedMessage.replyText}
                                  </p>

                                  {/* Plan Discrepancy Alert */}
                                  {linkedMessage.planDifference && (
                                    <div className="mt-2 p-2 bg-amber-100/70 border border-[#6b4a22] rounded text-[11px] text-[#f0b36a] flex items-start gap-1.5">
                                      <AlertTriangle className="h-3.5 w-3.5 text-[#f0b36a] shrink-0 mt-0.5" />
                                      <span>{linkedMessage.planDifference}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: DELAY COMMUNICATION LOG */}
            {activeTab === 'comms' && (
              <div className="space-y-6">
                <div className="rounded-2xl border border-[#3c342e] bg-[#262019] p-5 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-[#f1e8db] flex items-center gap-2">
                        <Radio className="h-4 w-4 text-[#e8955f]" />
                        <span>Simulated Mars-to-Earth Comm Relay</span>
                      </h3>
                      <p className="text-xs text-[#b3a595] mt-0.5">
                        One-way speed-of-light propagation delay: <strong>{oneWayDelayMinutes.toFixed(1)} minutes</strong>.
                      </p>
                    </div>

                    {!missionActive && (
                      <button
                        type="button"
                        onClick={() => onAdvanceSimTime(oneWayDelayMinutes * 60)}
                        disabled={!simulationPaused}
                        title={simulationPaused ? 'Advance all simulated mission time' : 'Pause the simulation before advancing time'}
                        className="px-3 py-1.5 rounded-lg bg-[#d86a33] text-white text-xs font-semibold hover:bg-[#bd5726] transition cursor-pointer shadow-xs flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Clock className="h-3.5 w-3.5" />
                        <span>Advance simulation (+{oneWayDelayMinutes}m)</span>
                      </button>
                    )}
                  </div>
                </div>
                {missionActive && (
                  <p className="text-xs text-[var(--text-secondary)]">
                    Manual time advance is disabled during an active mission so movement and communication stay synchronized.
                  </p>
                )}

                {messages.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[#3c342e] bg-[#262019] p-8 text-center text-xs text-[#b3a595]">
                    <Radio className="h-8 w-8 text-neutral-300 mx-auto mb-2" />
                    <p className="font-semibold text-[#f1e8db]">No messages sent yet</p>
                    <p className="mt-1">
                      Add a question to any observation and click "Transmit Question" to demonstrate delayed communications.
                    </p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isDeliveredToEarth = simTime >= msg.deliveredAtSimTime;
                    const isRepliedOnMars = msg.replyDeliveredAtSimTime && simTime >= msg.replyDeliveredAtSimTime;
                    const hasReplied = Boolean(msg.replyText);

                    // Check if current plan differs from original message plan
                    const planChanged = msg.originalPlanVersion !== currentPlanVersion;

                    return (
                      <div
                        key={msg.id}
                        className="rounded-2xl border border-[#3c342e] bg-[#262019] p-6 shadow-xs space-y-4"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-xs font-mono font-bold text-[#e8955f]">
                              {msg.siteName}
                            </span>
                            <span className="text-xs text-[#b3a595] ml-2">
                              Sent: {formatSimLMST(msg.sentAtSimTime)}
                            </span>
                          </div>

                          <div className="text-xs font-semibold">
                            {isRepliedOnMars ? (
                              <span className="text-[#a9d494] bg-[#1f2d1d] px-2 py-0.5 rounded border border-[#3f5e36]">
                                Delivered to Explorer
                              </span>
                            ) : hasReplied ? (
                              <span className="text-[#8ccdf0] bg-[#1a2a35] px-2 py-0.5 rounded border border-[#35566d]">
                                Downlink in transit ({formatSecondsCountdown((msg.replyDeliveredAtSimTime || 0) - simTime)})
                              </span>
                            ) : isDeliveredToEarth ? (
                              <span className="text-[#f0b36a] bg-[#33261a] px-2 py-0.5 rounded border border-[#6b4a22]">
                                Delivered to Earth · Awaiting Science Team
                              </span>
                            ) : (
                              <span className="text-[#8ccdf0] bg-[#1a2a35] px-2 py-0.5 rounded border border-[#35566d]">
                                Uplink in transit ({formatSecondsCountdown(msg.deliveredAtSimTime - simTime)})
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Plan change banner */}
                        {planChanged && (
                          <div className="rounded-lg border border-[#6b4a22] bg-[#33261a] p-3 text-xs text-[#f0b36a] flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 text-[#f0b36a] shrink-0 mt-0.5" />
                            <div>
                              <strong className="block">Plan changed since request</strong>
                              <span>
                                Request sent under Plan v{msg.originalPlanVersion} ("{msg.originalPlanSummary}").
                                Current active plan is v{currentPlanVersion}. Advice will not be auto-applied.
                              </span>
                            </div>
                          </div>
                        )}

                        <div className="bg-[#272019] p-3 rounded-lg border border-[#3c342e] text-xs sm:text-sm text-[#f1e8db]">
                          <span className="text-[10px] font-bold uppercase text-[#b3a595] block mb-1">
                            Explorer Question
                          </span>
                          "{msg.questionText}"
                        </div>

                        {/* Reply content if present */}
                        {msg.replyText && (
                          <div className="rounded-xl border border-[#3f5e36] bg-emerald-50/60 p-4 space-y-2">
                            <div className="flex items-center justify-between text-xs font-semibold text-[#a9d494]">
                              <span>Science Team Guidance ({msg.scienceTeamAuthor})</span>
                              {msg.replyDeliveredAtSimTime && !isRepliedOnMars && (
                                <span className="text-[10px] font-normal text-[#a9d494]">
                                  Arrives in {formatSecondsCountdown(msg.replyDeliveredAtSimTime - simTime)}
                                </span>
                              )}
                            </div>
                            <p className="text-xs sm:text-sm text-[#f1e8db]">
                              {msg.replyText}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* TAB 3: TASKS & BUDGET MANAGEMENT */}
            {activeTab === 'tasks' && (
              <div className="space-y-6">
                {/* Active Task Banner */}
                {activeTask && (
                  <div className={`rounded-2xl border p-6 shadow-xs space-y-4 ${
                    activeTask.status === 'blocked_on_advice'
                      ? 'border-[#6b4a22] bg-amber-50/70'
                      : 'border-[#d86a33]/40 bg-[#1f2d1d]'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#e8955f]">
                          Current Task
                        </span>
                        <span className="text-neutral-300">·</span>
                        <span className="text-xs font-mono text-[#b3a595]">
                          Est. {activeTask.estimatedMinutes} min
                        </span>
                      </div>

                      {activeTask.status === 'blocked_on_advice' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-[#f0b36a] bg-amber-100 px-2.5 py-0.5 rounded border border-[#6b4a22]">
                          <AlertTriangle className="h-3 w-3" />
                          <span>Blocked on advice</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-[#a9d494] bg-[#27391f] px-2.5 py-0.5 rounded border border-[#3f5e36]">
                          <Clock className="h-3 w-3" />
                          <span>In progress</span>
                        </span>
                      )}
                    </div>

                    <div>
                      <h3 className="text-lg font-bold text-[#f1e8db]">{activeTask.title}</h3>
                      <p className="text-xs text-[#cdbfae] mt-1 leading-relaxed">
                        {activeTask.description}
                      </p>
                    </div>

                    {/* Blocked guidance recommendation */}
                    {activeTask.status === 'blocked_on_advice' && (
                      <div className="rounded-xl border border-[#6b4a22] bg-[#262019] p-4 space-y-2 text-xs text-amber-950">
                        <div className="font-semibold text-[#f0b36a] flex items-center gap-1.5">
                          <Info className="h-4 w-4 text-amber-600" />
                          <span>
                            {blockingMessage
                              ? `Awaiting science guidance on: "${blockingMessage.questionText}"`
                              : 'While waiting for Earth science team reply:'}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#b3a595]">
                          Communication delay is {oneWayDelayMinutes} min each way. You can proceed with independent tasks that don't depend on outcrop sampling guidance.
                        </p>
                        <div className="pt-2 flex flex-wrap gap-2">
                          {upcomingTasks
                            .filter((t) => t.isIndependent)
                            .map((t) => (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => handleSwitchToIndependentTask(t)}
                                className="px-3 py-1.5 rounded-lg bg-[#d86a33] text-white text-xs font-semibold hover:bg-[#bd5726] transition cursor-pointer shadow-xs"
                              >
                                Switch to: {t.title}
                              </button>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Upcoming Tasks List */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#b3a595]">
                    Upcoming Field Tasks ({upcomingTasks.length})
                  </h3>

                  <div className="space-y-2">
                    {upcomingTasks.map((t) => (
                      <div
                        key={t.id}
                        className="rounded-xl border border-[#3c342e] bg-[#262019] p-4 flex items-center justify-between text-xs"
                      >
                        <div className="space-y-0.5 pr-4">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[#f1e8db]">{t.title}</span>
                            {t.isIndependent && (
                              <span className="text-[9px] font-semibold text-[#8ccdf0] bg-[#1a2a35] px-1.5 py-0.2 rounded border border-[#35566d]">
                                Independent
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[#b3a595]">{t.description}</p>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span className="font-mono text-[#b3a595]">{t.estimatedMinutes} min</span>
                          <button
                            type="button"
                            onClick={() => handleSwitchToIndependentTask(t)}
                            className="px-2.5 py-1 rounded border border-[#3c342e] hover:bg-[#1f1a17] text-[11px] font-semibold text-[#f1e8db] cursor-pointer"
                          >
                            Start
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <p className="text-[10px] text-[#b3a595] italic pt-1">
                    * Task durations are modelled estimates based on editable nominal pacing assumptions (1.1 m/s walk speed, 15° max regolith incline).
                  </p>
                </div>
              </div>
            )}

            {/* TAB 4: DATA EXPORT / IMPORT */}
            {activeTab === 'data' && (
              <div className="space-y-6">
                <div className="rounded-2xl border border-[#3c342e] bg-[#262019] p-6 shadow-xs space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-[#f1e8db]">
                      Database & export
                    </h3>
                    <p className="text-xs text-[#b3a595] mt-0.5 leading-relaxed">
                      Observations, messages and tasks are stored in your local SQLite database.
                      Legacy notebook entries from localStorage were preserved and migrated.
                    </p>
                  </div>

                  {importFeedback && (
                    <div
                      className={`p-3 rounded-xl border text-xs ${
                        importFeedback.success
                          ? 'border-[#3f5e36] bg-[#1f2d1d] text-[#a9d494]'
                          : 'border-rose-300 bg-rose-50 text-rose-900'
                      }`}
                    >
                      {importFeedback.message}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <button
                      type="button"
                      onClick={handleExportJSON}
                      className="flex items-center justify-center gap-2 p-4 rounded-xl border border-[#3c342e] bg-[#262019] hover:bg-[#1f1a17] transition cursor-pointer text-xs font-semibold text-[#f1e8db]"
                    >
                      <Download className="h-4 w-4 text-[#e8955f]" />
                      <span>Export Fieldwork as JSON</span>
                    </button>

                    <label className="flex items-center justify-center gap-2 p-4 rounded-xl border border-[#3c342e] bg-[#262019] hover:bg-[#1f1a17] transition cursor-pointer text-xs font-semibold text-[#f1e8db]">
                      <Upload className="h-4 w-4 text-[#e8955f]" />
                      <span>Import JSON Dataset</span>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json,application/json"
                        onChange={handleImportFile}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <div className="text-[11px] text-[#b3a595] pt-2 border-t border-[#3c342e] space-y-1">
                    <div>
                      <strong className="text-[#f1e8db]">Format:</strong> marswalk_data_v1
                    </div>
                    <div>
                      <strong className="text-[#f1e8db]">Network Dependency:</strong> Photographic rasters from NASA HiRISE and Mastcam-Z require network connectivity on first fetch; metadata and notes remain available offline.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
