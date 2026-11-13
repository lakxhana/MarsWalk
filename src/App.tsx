import {preflight} from '@/lib/preflight';
import {makeRouteTasks} from '@/lib/fieldworkPlan';
import { DEFAULT_OPERATIONS, STUDIES, startStop, finishStop, recordEvidence, operationsReport, type CrewOperations } from '@/lib/crewOperations';
import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import CrewFieldPanel from '@/components/CrewFieldPanel';
import Header, { type AppView, type UserRole } from '@/components/Header';
import type { GlobePose } from '@/components/MarsGlobe';
const MarsGlobe = lazy(() => import('@/components/MarsGlobe'));
import NamedSitePlanner from '@/components/NamedSitePlanner';
import FieldWalk from '@/components/FieldWalk';
import type { SurfacePose } from '@/components/MarsSurface';
import FieldNotebookView from '@/components/FieldNotebookView';
import EarthTeamMonitoring from '@/components/EarthTeamMonitoring';
import SourcesAndCoverageView from '@/components/SourcesAndCoverageView';
import {
  migrateLegacyNotebook,
  initializeDefaultTasks,
  getAllMessages,
  getAllObservations,
  getAllTasks,
  saveObservation,
  saveTask,
  saveStoredMission,
  type MissionStatusSnapshot,
  type CommMessage,
  type ObservationRecord,
  type FieldTask,
} from '@/lib/storage';
import {
  DEFAULT_COMM_SETTINGS,
  sendMissionStatusUpdate,
  tickMessageStatuses,
} from '@/lib/commManager';
import { type JourneyState } from '@/lib/navigation';
import { type RoutePlanSummary } from '@/lib/routePlanner';
import { type EVAPlanSummary } from '@/lib/evaPlanner';
import { advanceSimulationTime } from '@/lib/missionTiming';

const MISSION_STATE_KEY = 'marswalk_mission_state_v1';
const DEFAULT_MISSION_BUDGET_MINUTES = 60;
const DEFAULT_MISSION_RESERVE_MINUTES = 10;

export interface PersistedMissionState {
  crewOperations?: CrewOperations;
  view: AppView;
  simTime: number;
  missionStartedAtSimTime: number | null;
  missionBudgetMinutes: number;
  reserveMinutes: number;
  plannedObservationMinutes: number;
  stopStartedAtSimTime: number | null;
  plannedRoute: RoutePlanSummary | null;
  evaPlan: EVAPlanSummary | null;
  walkSessionId: number;
  surfacePose: SurfacePose;
  journeyState: JourneyState;
  planVersion: number;
  planSummaryText: string;
  demoLive?: boolean;
  oneWayDelayMinutes: number;
  simulationSpeedMultiplier: number;
  statusUpdateIntervalSeconds?: number;
  role?: UserRole;
  roleChosen?: boolean;
  missionBase: { x: number; z: number; name: string } | null;
}

function readPersistedMission(): PersistedMissionState | null {
  try {
    const raw = localStorage.getItem(MISSION_STATE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PersistedMissionState>;
    if (
      typeof value.simTime !== 'number' ||
      typeof value.surfacePose?.x !== 'number' ||
      typeof value.surfacePose?.z !== 'number'
    ) return null;
    return value as PersistedMissionState;
  } catch (error) {
    console.error('Could not restore the saved mission state:', error);
    return null;
  }
}

export default function App({initialMission}: {initialMission?: PersistedMissionState | null} = {}) {
  const missionToSave = useRef<PersistedMissionState | null>(null);
  const [missionSaveError, setMissionSaveError] = useState<string | null>(null);
  const statusSequenceRef = useRef(0);
  const [restoredMission] = useState(() => initialMission === undefined ? readPersistedMission() : initialMission);
  const [crewOperations, setCrewOperations] = useState<CrewOperations>(restoredMission?.crewOperations ?? {...DEFAULT_OPERATIONS,missionStart:restoredMission?.missionStartedAtSimTime??null,destination:restoredMission?.plannedRoute?.destinationName??'Selected destination'});
  const latestStatusRef = useRef<MissionStatusSnapshot | null>(null);
  const crewOpsRef = useRef(crewOperations);
  crewOpsRef.current = crewOperations;
  const [role, setRole] = useState<UserRole>('explorer');
  const [fieldPanelOpen, setFieldPanelOpen] = useState(false);
  const roleChosen = true;
  const [view, setView] = useState<AppView>('globe');

  // The LMST clock is the shared simulation clock used by movement and communications.
  const [simTime, setSimTime] = useState<number>(restoredMission?.simTime ?? DEFAULT_COMM_SETTINGS.simStartLMSTSeconds);
  const handleInvestigation = useCallback((active:boolean) => {
    setCrewOperations(current => active ? startStop(current,simTime) : finishStop(current,simTime));
  }, [simTime]);
  const [simulationPaused, setSimulationPaused] = useState(false);
  const [showRestoreNotice, setShowRestoreNotice] = useState(false);
  const [missionStartedAtSimTime, setMissionStartedAtSimTime] = useState<number | null>(restoredMission?.missionStartedAtSimTime ?? null);
  const [missionBudgetMinutes, setMissionBudgetMinutes] = useState(restoredMission?.missionBudgetMinutes ?? DEFAULT_MISSION_BUDGET_MINUTES);
  const [reserveMinutes, setReserveMinutes] = useState(restoredMission?.reserveMinutes ?? DEFAULT_MISSION_RESERVE_MINUTES);
  const [plannedObservationMinutes, setPlannedObservationMinutes] = useState(restoredMission?.plannedObservationMinutes ?? 0);
  const [stopStartedAtSimTime, setStopStartedAtSimTime] = useState<number | null>(restoredMission?.stopStartedAtSimTime ?? null);
  const [oneWayDelayMinutes, setOneWayDelayMinutes] = useState<number>(
    restoredMission?.demoLive === false ? (restoredMission.oneWayDelayMinutes || DEFAULT_COMM_SETTINGS.oneWayDelayMinutes) : 0,
  );
  const [simulationSpeedMultiplier, setSimulationSpeedMultiplier] = useState<number>(
    restoredMission?.simulationSpeedMultiplier ?? 1,
  );
  const [statusUpdateIntervalSeconds, setStatusUpdateIntervalSeconds] = useState(
    restoredMission?.statusUpdateIntervalSeconds ?? 10,
  );
  const [messages, setMessages] = useState<CommMessage[]>([]);
  const [observations, setObservations] = useState<ObservationRecord[]>([]);
  const [storedTasks, setTasks] = useState<FieldTask[]>([]);
  const [storageBootstrapError, setStorageBootstrapError] = useState<string | null>(null);
  const [plannedRoute, setPlannedRoute] = useState<RoutePlanSummary | null>(restoredMission?.plannedRoute ?? null);
  const [evaPlan, setEvaPlan] = useState<EVAPlanSummary | null>(restoredMission?.evaPlan ?? null);
  const [walkSessionId, setWalkSessionId] = useState<number>(restoredMission?.walkSessionId ?? 0);
  const [missionBase, setMissionBase] = useState(restoredMission?.missionBase ?? null);
  const taskPrefix = `destination-${walkSessionId}-`;
  const tasks = storedTasks.filter(task=>task.id.startsWith(taskPrefix) || (!task.id.startsWith('task-') && !task.id.startsWith('destination-')));


  // Plan versioning
  const [planVersion, setPlanVersion] = useState<number>(restoredMission?.planVersion ?? 1);
  const [planSummaryText, setPlanSummaryText] = useState<string>(
    restoredMission?.planSummaryText ?? 'Select a Jezero route',
  );

  // Preserve globe camera rotation & zoom across view switches
  const [globePose, setGlobePose] = useState<GlobePose>({
    rotX: 0.15,
    rotY: 0,
    distance: 5.6,
  });

  // Surface walking position and orientation preserved across view switches
  const [surfacePose, setSurfacePose] = useState<SurfacePose>(restoredMission?.surfacePose ?? {
    x: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
  });

  // Navigation Journey State: Plan -> Navigate -> Arrive
  const [journeyState, setJourneyState] = useState<JourneyState>(restoredMission?.journeyState ?? 'plan');
  // Demonstration destination identifier; it is not a named surface location.


  // Initial persistence bootstrap: migrate localStorage to IndexedDB and initialize tasks
  useEffect(() => {
    async function initDB() {
      try {
        await migrateLegacyNotebook();
        await initializeDefaultTasks();
        const [allMsgs, allObs, allTasks] = await Promise.all([
          getAllMessages(),
          getAllObservations(),
          getAllTasks(),
        ]);
        setMessages(allMsgs);
        statusSequenceRef.current = Math.max(
          statusSequenceRef.current,
          allMsgs.reduce(
            (highest, message) => Math.max(highest, message.statusSnapshot?.sequenceNumber ?? 0),
            0,
          ),
        );
        setObservations(allObs);
        setTasks(allTasks);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('Storage bootstrap error:', err);
        setStorageBootstrapError(`Local data is unavailable: ${message}`);
      }
    }
    initDB();
  }, []);

  // Simulation time advances only while the shared simulation is running.
  useEffect(() => {
    if (simulationPaused) return;
    const timer = setInterval(() => {
      setSimTime((prev) => advanceSimulationTime(prev, simulationSpeedMultiplier, simulationPaused));
    }, 1000);

    return () => clearInterval(timer);
  }, [simulationPaused, simulationSpeedMultiplier]);

  useEffect(() => {
    const snapshot: PersistedMissionState = {
      view,
      crewOperations,
      simTime,
      missionStartedAtSimTime,
      missionBudgetMinutes,
      reserveMinutes,
      plannedObservationMinutes,
      stopStartedAtSimTime,
      plannedRoute,
      evaPlan,
      walkSessionId,
      surfacePose,
      journeyState,
      planVersion,
      planSummaryText,
      demoLive: oneWayDelayMinutes === 0,
      oneWayDelayMinutes,
      simulationSpeedMultiplier,
      statusUpdateIntervalSeconds,
      role,
      roleChosen,
      missionBase,
    };
    missionToSave.current = snapshot;
    try {
      localStorage.setItem(MISSION_STATE_KEY, JSON.stringify(snapshot));
    } catch (error) {
      console.error('Could not persist the current mission state:', error);
    }
  }, [
    crewOperations, view, simTime, missionStartedAtSimTime, missionBudgetMinutes, reserveMinutes,
    plannedObservationMinutes, stopStartedAtSimTime, plannedRoute, evaPlan,
    walkSessionId, surfacePose, journeyState, planVersion, planSummaryText,
    oneWayDelayMinutes, simulationSpeedMultiplier, role, roleChosen, missionBase,
    statusUpdateIntervalSeconds,
  ]);

  // Serialize SQLite checkpoints; frequent position updates cannot starve the save timer.
  useEffect(() => {
    let saving = false;
    let previous = '';
    const timer = setInterval(async () => {
      if(saving || !missionToSave.current) return;
      const snapshot = JSON.stringify(missionToSave.current);
      if(snapshot === previous) return;
      saving = true;
      try {await saveStoredMission(JSON.parse(snapshot));previous=snapshot;setMissionSaveError(null);}
      catch(error){setMissionSaveError(error instanceof Error ? error.message : 'Mission could not be saved.');}
      finally {saving=false;}
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Update message statuses as simTime advances
  useEffect(() => {
    async function updateComms() {
      if (messages.length === 0) return;
      const { updatedMessages, hasChanges } = await tickMessageStatuses(messages, simTime);
      if (hasChanges) {
        setMessages(updatedMessages);
      }
    }
    updateComms();
  }, [simTime, messages]);

  const handleAdvanceSimTime = useCallback((seconds: number) => {
    if (simulationPaused) {
      setSimTime((prev) => advanceSimulationTime(prev, seconds, false));
    }
  }, [simulationPaused]);

  const handleToggleSimulation = useCallback(() => {
    setSimulationPaused((paused) => !paused);
    setShowRestoreNotice(false);
  }, []);

  const handleReloadComms = useCallback(async () => {
    const [allMsgs, allObs, allTasks] = await Promise.all([
      getAllMessages(),
      getAllObservations(),
      getAllTasks(),
    ]);
    setMessages(allMsgs);
    setObservations(allObs);
    setTasks(allTasks);
  }, []);

  useEffect(() => {
    if(crewOperations.missionStart===null) return;
    let cancelled=false;
    const titles=['Upload a context photo',STUDIES[crewOperations.study].task];
    const completed=[crewOperations.taskPhoto,crewOperations.taskNote];
    const atStop=journeyState==='arrive' && !plannedRoute?.id?.startsWith('return-') && crewOperations.completedAt===null;
    const autoTasks:FieldTask[]=titles.map((title,index)=>({
      id:`destination-${walkSessionId}-${index===0?'photo':'note'}`,
      title:`${crewOperations.destination}: ${title}`,
      description:'Destination fieldwork; completes when supporting evidence is saved at the destination.',
      status:completed[index]?'completed':atStop&&(index===0||completed[0])?'in_progress':'pending',
      estimatedMinutes:0,isIndependent:true,requiresEarthAdvice:false,category:'survey',
    }));
    void (async()=>{try{for(const task of autoTasks)await saveTask(task);const all=await getAllTasks();if(!cancelled)setTasks(all);}catch(e){if(!cancelled)setMissionSaveError(e instanceof Error?e.message:'Could not save destination tasks.');}})();
    return ()=>{cancelled=true;};
  },[crewOperations.missionStart,crewOperations.destination,crewOperations.study,crewOperations.taskPhoto,crewOperations.taskNote,crewOperations.completedAt,journeyState,plannedRoute?.id,walkSessionId]);

  const handleSaveWalkObservation = useCallback(async (observation: ObservationRecord) => {
    await saveObservation(observation);
    setObservations(await getAllObservations());
    const endpoint=plannedRoute?.points[plannedRoute.points.length-1];
    const atDestination=Boolean(endpoint && typeof observation.location.x==='number' && typeof observation.location.z==='number' && Math.hypot(observation.location.x-endpoint.x,observation.location.z-endpoint.z)<=2 && !plannedRoute?.id?.startsWith('return-'));
    setCrewOperations(current => recordEvidence(current,observation,atDestination));
  }, [plannedRoute]);

  const handleSendMissionStatus = useCallback(async (
    snapshot: MissionStatusSnapshot,
    observation?: ObservationRecord,
  ) => {
    if (snapshot.capturedAtSimTime === undefined) {
      throw new Error('Earth status report is missing its simulated capture time.');
    }
    latestStatusRef.current = snapshot;
    const sequenceNumber = ++statusSequenceRef.current;
    await sendMissionStatusUpdate({
      statusSnapshot: { ...snapshot, operations: operationsReport(crewOpsRef.current,snapshot.capturedAtSimTime), sequenceNumber, taskSummary: tasks.map(({id,title,status}) => ({id,title,status})) },
      observationSnapshot: observation,
      simTime: snapshot.capturedAtSimTime,
      oneWayDelayMinutes,
    });
    await handleReloadComms();
  }, [handleReloadComms, oneWayDelayMinutes, tasks]);

  const handleEndMission = async () => {
    const completed = {...finishStop(crewOpsRef.current,simTime),completedAt:simTime};
    crewOpsRef.current = completed;
    setCrewOperations(completed);
    setMissionStartedAtSimTime(null);
    setSimulationPaused(false); // Queued Earth reports must still arrive after the walk ends.
    if(latestStatusRef.current) {
      try { await handleSendMissionStatus({...latestStatusRef.current,capturedAtSimTime:simTime,movementState:'Stopped',activityEvent:'Walk ended',missionElapsedSeconds:simTime-(completed.missionStart??simTime)}); }
      catch {setMissionSaveError('Walk saved; final Earth report could not be queued.');}
    }
  };

  const handleJourneyStateChange = useCallback((state: JourneyState) => {
    setJourneyState(state);
    if (state === 'arrive') {
      setCrewOperations(current => plannedRoute?.id?.startsWith('return-') ? finishStop(current,simTime) : startStop(current,simTime));
      setStopStartedAtSimTime((current) => current ?? simTime);
    }
  }, [simTime,plannedRoute?.id]);

  const handleStartReturnRoute = useCallback((route: RoutePlanSummary, pose: SurfacePose) => {
    setCrewOperations(current => finishStop(current,simTime));
    const returnRoute = { ...route, id: `return-${walkSessionId}-${Math.floor(simTime)}` };
    setJourneyState('navigate');
    setSimulationPaused(false);
    setPlannedRoute(returnRoute);
    setSurfacePose({ ...pose, routeId: returnRoute.id, sessionId: walkSessionId, routeDist: 0, nextWpIndex: 1 });
    setPlannedObservationMinutes(0);
    setStopStartedAtSimTime(null);
    setJourneyState('navigate');
    const nextVersion = planVersion + 1;
    setPlanVersion(nextVersion);
    setPlanSummaryText(`Plan v${nextVersion}: Return to ${missionBase?.name || 'base'}`);
  }, [missionBase?.name, planVersion, simTime, walkSessionId]);

  const handleStartNavigation = useCallback((route?: RoutePlanSummary, eva?: EVAPlanSummary) => {
    const freshSessionId = Date.now();
    const activeRoute = route;
    if(!activeRoute?.success || activeRoute.points.length < 2) {setView('plan');return;}
    const issues=preflight(activeRoute,crewOperations,missionBudgetMinutes,reserveMinutes).errors;if(issues.length){setMissionSaveError(issues.join(' '));setView('plan');return;}setMissionSaveError(null);
    if (eva) setEvaPlan(eva);
    if (activeRoute?.success && activeRoute.points.length >= 2) {
      setPlannedRoute(activeRoute);
      const p0 = activeRoute.points[0];
      let p1 = activeRoute.points[1] || { x: p0.x, z: p0.z - 10 };
      for (let i = 1; i < activeRoute.points.length; i++) {
        if (Math.hypot(activeRoute.points[i].x - p0.x, activeRoute.points[i].z - p0.z) > 0.5) {
          p1 = activeRoute.points[i];
          break;
        }
      }
      const yaw = Math.atan2(-(p1.x - p0.x), -(p1.z - p0.z));
      setSurfacePose({
        x: p0.x,
        z: p0.z,
        yaw,
        pitch: 0,
        routeDist: 0,
        nextWpIndex: 1,
        routeId: activeRoute.id,
        sessionId: freshSessionId,
      });
      setMissionBase({
        x: p0.x,
        z: p0.z,
        name: activeRoute.startName || 'Selected base',
      });
      setWalkSessionId(freshSessionId);
    }
    setCrewOperations(current => ({...current,routeTasks:(current.routeTasks??makeRouteTasks(current.plannedStops??3,current.stopLimitMinutes)).map(t=>({...t,done:false})),study:activeRoute.destinationName==='Skinner Ridge'?'skinner-ridge':activeRoute.destinationName==='Wildcat Ridge'?'wildcat-ridge':'local',previousWalks:current.missionStart===null ? current.previousWalks : [...(current.previousWalks??[]),{name:current.name,destination:current.destination,started:current.missionStart,ended:current.completedAt??simTime,stops:finishStop(current,simTime).stops,finding:current.lastFinding,records:current.observationIds.length}],health:current.health??{},stops:[],observationIds:[],taskPhoto:false,taskNote:false,lastFinding:'',completedAt:null,missionStart:simTime,destination:activeRoute.destinationName || 'Selected destination'}));
    setMissionStartedAtSimTime(simTime);
    if(eva) setMissionBudgetMinutes(eva.totalDurationMinutes);
    if(eva) setReserveMinutes(eva.reserveMinutes);
    setPlannedObservationMinutes(eva?.observationMinutes ?? (crewOperations.plannedStops??3)*crewOperations.stopLimitMinutes);
    setStopStartedAtSimTime(null);
    setShowRestoreNotice(false);
    setSimulationPaused(false);
    setJourneyState('navigate');
    setView('walk');
  }, [simTime, crewOperations, missionBudgetMinutes, reserveMinutes]);

  return (
    <div data-ui-system="field" className="app-shell flex h-screen w-screen flex-col overflow-hidden bg-[var(--surface)] font-sans text-[var(--text-primary)] antialiased">
      {<Header
        currentView={view}
        onNavigate={(next) => { if(next === 'notebook') setFieldPanelOpen(open => !open); else {setFieldPanelOpen(false);if(next === 'walk' && (missionStartedAtSimTime === null || !plannedRoute?.success)) setView('plan'); else setView(next);} }}
        role={role}
        onChangeRole={(newRole) => {
          setFieldPanelOpen(false);
          setRole(newRole);
          setView(newRole === 'science_team' ? 'science' : missionStartedAtSimTime === null ? 'plan' : 'walk');
        }}
        simTime={simTime}
        missionActive={missionStartedAtSimTime !== null}
        oneWayDelayMinutes={oneWayDelayMinutes}
        onAdvanceSimTime={handleAdvanceSimTime}
        simulationPaused={simulationPaused}
        onToggleSimulation={handleToggleSimulation}
        onSetOneWayDelayMinutes={setOneWayDelayMinutes}
        simulationSpeedMultiplier={simulationSpeedMultiplier}
        onSetSimulationSpeedMultiplier={setSimulationSpeedMultiplier}
        statusUpdateIntervalSeconds={statusUpdateIntervalSeconds}
        onSetStatusUpdateIntervalSeconds={setStatusUpdateIntervalSeconds}
      />}

      {/* 
        MAIN CONTENT VIEW CONTAINER
      */}
      {(missionSaveError || storageBootstrapError) && <div role="alert" className="border-b border-amber-300 bg-amber-50 px-5 py-2 text-sm">{missionSaveError || storageBootstrapError} · Keep the database server running. <button className="underline" onClick={() => window.location.reload()}>Retry connection</button></div>}
      <main className="app-view relative flex-1 w-full overflow-hidden">
        {showRestoreNotice && view === 'walk' && (
          <div className="absolute inset-x-3 top-2 z-[80] mx-auto flex max-w-2xl items-center justify-between gap-3 border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-[14px] shadow-sm">
            <p>Mission restored paused. Time did not advance while the app was closed.</p>
            <button type="button" onClick={handleToggleSimulation} className="min-h-10 shrink-0 rounded-[6px] bg-[var(--button-primary)] px-3 text-[13px] font-semibold text-[var(--button-primary-text)]">
              Resume mission
            </button>
          </div>
        )}
        {/* VIEW 1: PLAN SCREEN (2D Primary Fieldwork Map) */}
        {view === 'plan' && (
          <NamedSitePlanner crew={crewOperations} onCrew={setCrewOperations} now={simTime} onBudget={setMissionBudgetMinutes} onReserve={setReserveMinutes} reserve={reserveMinutes} earth={role==='science_team'} budget={missionBudgetMinutes} onStart={route=>{handleStartNavigation(route);if(role==='science_team')setView('science');}}/>
        )}

        {/* VIEW 2: WALK AND INSPECT (3D Terrain Walk) */}
        {(view === 'walk' || missionStartedAtSimTime !== null) && (
          <div className={view === 'walk' ? 'absolute inset-0' : 'hidden'} aria-hidden={view !== 'walk'}>
          {plannedRoute && <FieldWalk key={`${walkSessionId}:${plannedRoute.id}`} route={plannedRoute} initialPose={surfacePose} simTime={simTime} session={walkSessionId} paused={simulationPaused} active={missionStartedAtSimTime!==null} visible={view==='walk'} crew={crewOperations} elapsed={missionStartedAtSimTime===null?0:simTime-missionStartedAtSimTime} budget={missionBudgetMinutes} reserve={reserveMinutes} delay={oneWayDelayMinutes} interval={oneWayDelayMinutes===0?1:statusUpdateIntervalSeconds} planVersion={planVersion} onPose={setSurfacePose} onJourney={handleJourneyStateChange} onInvestigate={handleInvestigation} onCrew={setCrewOperations} onResume={()=>setSimulationPaused(false)} onReturn={handleStartReturnRoute} onEnd={()=>{void handleEndMission();setView('plan');}} onSave={handleSaveWalkObservation} onReport={handleSendMissionStatus}/>}

          </div>
        )}

        {/* VIEW 3: FIELD NOTEBOOK & COMM LOG */}
        {view === 'notebook' && (
          <FieldNotebookView
            currentPlanVersion={planVersion}
            currentPlanSummary={planSummaryText}
            simTime={simTime}
            simulationPaused={simulationPaused}
            missionActive={missionStartedAtSimTime !== null}
            oneWayDelayMinutes={oneWayDelayMinutes}
            onAdvanceSimTime={handleAdvanceSimTime}
            onSwitchToScienceTeamView={() => {
              setRole('science_team');
              setView('science');
            }}
          />
        )}

        {/* VIEW 4: DELAYED EARTH SCIENCE TEAM MONITOR */}
        {view === 'science' && role === 'science_team' && (
          <EarthTeamMonitoring
          messages={messages}
          plannedRoute={plannedRoute}
          simTime={simTime}
            simulationPaused={simulationPaused}
            missionActive={missionStartedAtSimTime !== null}
            oneWayDelayMinutes={oneWayDelayMinutes}
          simulationSpeedMultiplier={simulationSpeedMultiplier}
          statusUpdateIntervalSeconds={statusUpdateIntervalSeconds}
          missionName="Jezero traverse 01"
          missionId={`jezero-traverse-${walkSessionId}`}
          isLocalOnly
          onChangeRole={(newRole) => {
            setFieldPanelOpen(false);
          setRole(newRole);
            setView(newRole === 'science_team' ? 'science' : missionStartedAtSimTime === null ? 'plan' : 'walk');
          }}
          onToggleSimulation={handleToggleSimulation}
          onSetOneWayDelayMinutes={setOneWayDelayMinutes}
          onSetSimulationSpeedMultiplier={setSimulationSpeedMultiplier}
          onAdvanceSimTime={handleAdvanceSimTime}
          onReloadMessages={handleReloadComms}
          />
        )}

        {/* VIEW 5: GLOBE */}
        {view === 'globe' && (
          <Suspense fallback={<p className="p-8">Loading Mars globe…</p>}><MarsGlobe
            initialPose={globePose}
            onSavePose={setGlobePose}
            onExploreJezero={() => setView('plan')}
            onOpenRegionalMap={() => setView('plan')}
            onEnterWalk={() => setView('plan')}
            onSelectRegion={() => {
              // Jezero is selected by default
            }}
          /></Suspense>
        )}

        {/* VIEW 6: SOURCES & COVERAGE */}
        {view === 'sources' && (
          <SourcesAndCoverageView
            onBackToPlan={() => setView('plan')}
          />
        )}
        {fieldPanelOpen && role === 'explorer' && <CrewFieldPanel onClose={() => setFieldPanelOpen(false)} observations={observations} messages={messages} tasks={tasks} simTime={simTime} delay={oneWayDelayMinutes} paused={simulationPaused} reload={handleReloadComms}/>}
      </main>
    </div>
  );
}
