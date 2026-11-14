import {sessionRequest,type SessionCommand,type SessionReply} from './lib/sharedSession';
import MissionLog from './components/MissionLog';
import FloatingChat from './components/FloatingChat';
import {getDeliveredMissionActivity,getLatestMissionActivity} from '@/lib/earthMonitoring';
import MissionReview from './components/MissionReview';
import type { MissionProposal } from './lib/missionProposal';
import {hasOperationalPlanChange} from '@/lib/adviceTiming';
import {preflight} from '@/lib/preflight';
import {makeRouteTasks} from '@/lib/fieldworkPlan';
import { archiveMission, DEFAULT_OPERATIONS, STUDIES, startStop, finishStop, recordEvidence, operationsReport, type CrewOperations } from '@/lib/crewOperations';
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
  simulationPaused?:boolean;restorePending?:boolean;
  missionProposal?: MissionProposal | null;
  earthDraft?: {crew:CrewOperations;budget:number;reserve:number};
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

export default function App({initialMission,shared=false}: {initialMission?: PersistedMissionState | null;shared?:boolean} = {}) {
  const [controller,setController]=useState(!shared);
  const controllerRef=useRef(!shared);const [syncError,setSyncError]=useState('');
  const [clientId]=useState(()=>crypto.randomUUID());const appliedCommands=useRef<string[]>([]);
  const commandHandler=useRef<(c:SessionCommand)=>void>(()=>{});
  const invoke=(kind:string,payload:unknown,local:()=>void)=>{if(!shared||controllerRef.current)local();else {if(kind==='draft')local();void sessionRequest('commands',{id:crypto.randomUUID(),kind,payload,sessionId:walkSessionId}).catch(e=>setSyncError(String(e)));}};
  const missionToSave = useRef<PersistedMissionState | null>(null);
  const [missionSaveError, setMissionSaveError] = useState<string | null>(null);
  const statusSequenceRef = useRef(0);
  const [restoredMission] = useState(() => initialMission === undefined ? readPersistedMission() : initialMission);
  const [crewOperations, setCrewOperations] = useState<CrewOperations>(restoredMission?.crewOperations ?? {...DEFAULT_OPERATIONS,name:'',tankId:'',missionStart:restoredMission?.missionStartedAtSimTime??null,destination:restoredMission?.plannedRoute?.destinationName??'Selected destination'});
  const latestStatusRef = useRef<MissionStatusSnapshot | null>(null);
  const crewOpsRef = useRef(crewOperations);
  crewOpsRef.current = crewOperations;
  const [startRequested,setStartRequested] = useState(false);
  const [missionProposal,setMissionProposal] = useState<MissionProposal|null>(restoredMission?.missionProposal??null);
  const [earthDraft,setEarthDraft] = useState(restoredMission?.earthDraft??{crew:crewOperations,budget:restoredMission?.missionBudgetMinutes??60,reserve:restoredMission?.reserveMinutes??10});
  const [role, setRole] = useState<UserRole>('explorer');
  const [fieldPanelOpen, setFieldPanelOpen] = useState(false);
  const [chatOpen,setChatOpen]=useState(false);
  const roleChosen = true;
  const [view, setView] = useState<AppView>('globe');

  // The LMST clock is the shared simulation clock used by movement and communications.
  const [simTime, setSimTime] = useState<number>(restoredMission?.simTime ?? DEFAULT_COMM_SETTINGS.simStartLMSTSeconds);
  const handleInvestigation = useCallback((active:boolean) => {
    setCrewOperations(current => active ? startStop(current,simTime) : finishStop(current,simTime));
  }, [simTime]);
  const [restorePending,setRestorePending] = useState(restoredMission?.missionStartedAtSimTime != null);
  const [simulationPaused, setSimulationPaused] = useState(restoredMission?.missionStartedAtSimTime != null);
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
  const effectiveSpeed=oneWayDelayMinutes>0?1:simulationSpeedMultiplier;
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


  // Read only the selected server database; never seed or auto-import browser data.
  useEffect(() => {
    async function initDB() {
      try {
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
    if (simulationPaused || !controller) return;
    let last=Date.now();
    const timer = setInterval(() => {
      const now=Date.now();const seconds=(now-last)/1000;last=now;
      setSimTime((prev) => advanceSimulationTime(prev, shared?seconds*effectiveSpeed:effectiveSpeed, simulationPaused));
    }, 1000);

    return () => clearInterval(timer);
  }, [simulationPaused, effectiveSpeed, controller, shared]);

  useEffect(() => {
    const snapshot: PersistedMissionState = {
      view,
      crewOperations,
      missionProposal, earthDraft, simulationPaused, restorePending,
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
    simulationPaused, restorePending, missionProposal, earthDraft, crewOperations, view, simTime, missionStartedAtSimTime, missionBudgetMinutes, reserveMinutes,
    plannedObservationMinutes, stopStartedAtSimTime, plannedRoute, evaPlan,
    walkSessionId, surfacePose, journeyState, planVersion, planSummaryText,
    oneWayDelayMinutes, simulationSpeedMultiplier, role, roleChosen, missionBase,
    statusUpdateIntervalSeconds,
  ]);

  // Serialize SQLite checkpoints; frequent position updates cannot starve the save timer.
  useEffect(() => {
    if(shared)return;
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
  }, [shared]);

  const applyShared=(m:PersistedMissionState)=>{
    setSimTime(m.simTime);setCrewOperations(m.crewOperations??DEFAULT_OPERATIONS);setMissionProposal(m.missionProposal??null);
    if(m.earthDraft&&!(role==='science_team'&&view==='plan'))setEarthDraft(m.earthDraft);setMissionStartedAtSimTime(m.missionStartedAtSimTime);setMissionBudgetMinutes(m.missionBudgetMinutes);setReserveMinutes(m.reserveMinutes);
    setPlannedRoute(m.plannedRoute);setEvaPlan(m.evaPlan);setWalkSessionId(m.walkSessionId);setSurfacePose(m.surfacePose);setJourneyState(m.journeyState);setPlanVersion(m.planVersion);setMissionBase(m.missionBase);
    setSimulationPaused(Boolean(m.simulationPaused));setRestorePending(Boolean(m.restorePending));setOneWayDelayMinutes(m.oneWayDelayMinutes);setSimulationSpeedMultiplier(m.simulationSpeedMultiplier);setStatusUpdateIntervalSeconds(m.statusUpdateIntervalSeconds??10);
  };
  const applySharedRef=useRef(applyShared);applySharedRef.current=applyShared;
  useEffect(()=>{
    if(!shared)return;let cancelled=false,busy=false;
    const poll=async()=>{if(busy||cancelled)return;busy=true;try{
      const ack=[...appliedCommands.current];
      const reply=await sessionRequest<SessionReply>('session',{clientId,state:controllerRef.current?missionToSave.current:undefined,ack});
      if(cancelled)return;
      if(reply.mission&&(!reply.controller||reply.claimed))applySharedRef.current(reply.mission);
      controllerRef.current=reply.controller;setController(reply.controller);setSyncError('');
      if(reply.controller){if(!reply.claimed)appliedCommands.current=appliedCommands.current.filter(id=>!ack.includes(id));
        for(const command of reply.commands)if(!appliedCommands.current.includes(command.id)){commandHandler.current(command);appliedCommands.current.push(command.id);}}
      const [msgs,obs,ts]=await Promise.all([getAllMessages(),getAllObservations(),getAllTasks()]);if(!cancelled){setMessages(msgs);setObservations(obs);setTasks(ts);}
    }catch(e){if(!cancelled){setSyncError(String(e));controllerRef.current=false;setController(false);}}finally{busy=false;}};
    void poll();const timer=setInterval(()=>void poll(),1000);return()=>{cancelled=true;clearInterval(timer);};
  },[shared,clientId]);

  // Update message statuses as simTime advances
  useEffect(() => {
    async function updateComms() {
      if (!controller || messages.length === 0) return;
      const { updatedMessages, hasChanges } = await tickMessageStatuses(messages, simTime);
      if (hasChanges) {
        setMessages(updatedMessages);
      }
    }
    updateComms();
  }, [simTime, messages, controller]);

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
    if(!controller||crewOperations.missionStart===null) return;
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
  },[controller,crewOperations.missionStart,crewOperations.destination,crewOperations.study,crewOperations.taskPhoto,crewOperations.taskNote,crewOperations.completedAt,journeyState,plannedRoute?.id,walkSessionId]);

  const handleSaveWalkObservation = async (observation: ObservationRecord) => {
    await saveObservation(observation);
    setObservations(await getAllObservations());
    const endpoint=plannedRoute?.points[plannedRoute.points.length-1];
    const atDestination=Boolean(endpoint && typeof observation.location.x==='number' && typeof observation.location.z==='number' && Math.hypot(observation.location.x-endpoint.x,observation.location.z-endpoint.z)<=2 && !plannedRoute?.id?.startsWith('return-'));
    invoke('evidence',{observation,atDestination},()=>setCrewOperations(current => recordEvidence(current,observation,atDestination)));
  };

  const handleSendMissionStatus = useCallback(async (
    snapshot: MissionStatusSnapshot,
    observation?: ObservationRecord,
  ) => {
    if (snapshot.capturedAtSimTime === undefined) {
      throw new Error('Earth status report is missing its simulated capture time.');
    }
    latestStatusRef.current = snapshot;
    const sequenceNumber = Math.max(statusSequenceRef.current,...messages.filter(m=>m.statusSnapshot?.missionId===snapshot.missionId).map(m=>m.statusSnapshot?.sequenceNumber??0))+1;
    statusSequenceRef.current=sequenceNumber;
    await sendMissionStatusUpdate({
      statusSnapshot: { ...snapshot, operations: operationsReport(crewOpsRef.current,snapshot.capturedAtSimTime), sequenceNumber, taskSummary: tasks.map(({id,title,status}) => ({id,title,status})) },
      observationSnapshot: observation,
      simTime: snapshot.capturedAtSimTime,
      oneWayDelayMinutes,
    });
    await handleReloadComms();
  }, [handleReloadComms, oneWayDelayMinutes, tasks, messages]);

  const handleCrewChange = (next:CrewOperations) => {
    const previous=crewOpsRef.current;
    if(previous.missionStart!==null&&hasOperationalPlanChange(previous,next))setPlanVersion(v=>v+1);
    crewOpsRef.current=next;setCrewOperations(next);
  };

  const handleEndMission = async () => {
    if(crewOpsRef.current.missionStart===null||crewOpsRef.current.completedAt!==null)return;
    const completed = archiveMission(crewOpsRef.current,`jezero-traverse-${walkSessionId}`,simTime,oneWayDelayMinutes);
    setMissionProposal(p=>p?{...p,status:'completed',responseAt:simTime+oneWayDelayMinutes*60}:null);
    setSurfacePose(p=>({...p,movementMode:'paused'}));
    setView('missions');
    crewOpsRef.current = completed;
    setCrewOperations(completed);
    setRestorePending(false);
    setMissionStartedAtSimTime(null);
    setSimulationPaused(false); // Queued Earth reports must still arrive after the walk ends.
    const finalSnapshot=latestStatusRef.current?.missionId===`jezero-traverse-${walkSessionId}`?latestStatusRef.current:plannedRoute?{missionId:`jezero-traverse-${walkSessionId}`,explorerId:'lead',planVersion,planSummary:plannedRoute.explanation,destinationName:plannedRoute.destinationName??completed.destination,position:surfacePose,coordinateReference:'Simulated crew; Jezero local metres',missionElapsedSeconds:simTime-(completed.missionStart??simTime),missionBudgetMinutes,reserveMinutes,returnEstimateMinutes:null,plannedRoutePoints:plannedRoute.points,mapMode:plannedRoute.mapMode,routeDistanceMeters:surfacePose.routeDist??0,routeTotalMeters:plannedRoute.totalDistanceMeters,headingRadians:surfacePose.yaw}:null;
    if(finalSnapshot) {
      try { await handleSendMissionStatus({...finalSnapshot,capturedAtSimTime:simTime,movementState:'Stopped',activityEvent:'Walk ended',missionElapsedSeconds:simTime-(completed.missionStart??simTime)}); }
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

  const handleStartNavigation = useCallback((route?: RoutePlanSummary, eva?: EVAPlanSummary, accepted?: MissionProposal) => {
    if(crewOpsRef.current.missionStart!==null&&crewOpsRef.current.completedAt===null)return;
    const startCrew=accepted?.crew??crewOperations;
    const startBudget=accepted?.budget??missionBudgetMinutes;
    const startReserve=accepted?.reserve??reserveMinutes;
    latestStatusRef.current=null;statusSequenceRef.current=0;
    const freshSessionId = Date.now();
    const activeRoute = route;
    if(!activeRoute?.success || activeRoute.points.length < 2) {setView('plan');return;}
    const issues=preflight(activeRoute,startCrew,startBudget,startReserve).errors;if(issues.length){setMissionSaveError(issues.join(' '));setView('plan');return;}setMissionSaveError(null);
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
    setMissionBudgetMinutes(startBudget);setReserveMinutes(startReserve);
    setCrewOperations(current => ({...current,...startCrew,healthReplay:null,demoVitals:oneWayDelayMinutes===0&&simulationSpeedMultiplier>1?{startedAt:simTime}:null,decisions:[],routeTasks:(startCrew.routeTasks??makeRouteTasks(startCrew.plannedStops??3,startCrew.stopLimitMinutes)).map(t=>({...t,done:false})),study:activeRoute.destinationName==='Skinner Ridge'?'skinner-ridge':activeRoute.destinationName==='Wildcat Ridge'?'wildcat-ridge':'local',previousWalks:current.previousWalks,health:startCrew.health??{},stops:[],observationIds:[],taskPhoto:false,taskNote:false,lastFinding:'',completedAt:null,missionStart:simTime,destination:activeRoute.destinationName || 'Selected destination'}));
    setRestorePending(false);
    setMissionStartedAtSimTime(simTime);
    if(eva) setMissionBudgetMinutes(eva.totalDurationMinutes);
    if(eva) setReserveMinutes(eva.reserveMinutes);
    setPlannedObservationMinutes(eva?.observationMinutes ?? (startCrew.plannedStops??3)*startCrew.stopLimitMinutes);
    setStopStartedAtSimTime(null);
    setShowRestoreNotice(false);
    setSimulationPaused(false);
    setJourneyState('navigate');
    setView(role==='science_team'?'science':'walk');
  }, [role, simTime, crewOperations, missionBudgetMinutes, reserveMinutes, oneWayDelayMinutes, simulationSpeedMultiplier]);

  const planningLocked=missionStartedAtSimTime!==null||missionProposal?.status==='pending'||(missionProposal?.status==='completed'&&simTime<(missionProposal.responseAt??0));
  useEffect(()=>{if(startRequested&&missionStartedAtSimTime!==null&&!restorePending){setView(role==='science_team'?'science':'walk');setStartRequested(false);}else if(startRequested&&missionProposal?.status!=='pending'&&missionProposal?.status!=='accepted')setStartRequested(false);},[startRequested,missionStartedAtSimTime,restorePending,missionProposal,role]);
  const planLock=useRef(false);planLock.current=Boolean(planningLocked);
  const sendPlan=(route:RoutePlanSummary,draft:typeof earthDraft)=>{if(planLock.current)return;planLock.current=true;setEarthDraft(draft);setMissionProposal({id:crypto.randomUUID(),route,crew:structuredClone(draft.crew),budget:draft.budget,reserve:draft.reserve,sentAt:simTime,arrivesAt:simTime+oneWayDelayMinutes*60,status:'pending'});};
  const acceptPlan=(id?:string)=>{if(!missionProposal||id!==missionProposal.id||simTime<missionProposal.arrivesAt||missionStartedAtSimTime!==null||missionProposal.status!=='pending'||preflight(missionProposal.route,missionProposal.crew,missionProposal.budget,missionProposal.reserve).errors.length)return;handleStartNavigation(missionProposal.route,undefined,missionProposal);setMissionProposal({...missionProposal,status:'accepted',responseAt:simTime+oneWayDelayMinutes*60});};
  const requestPlan=(id:string|undefined,note:string)=>{if(missionProposal&&id===missionProposal.id)setMissionProposal({...missionProposal,status:'changes',note,responseAt:simTime+oneWayDelayMinutes*60});};
  const resumeSaved=()=>{setRestorePending(false);setSimulationPaused(false);};
  const setHealthReplay=(memberId:string|null)=>{if(oneWayDelayMinutes===0&&simulationSpeedMultiplier>1)return;if(crewOpsRef.current.missionStart===null||crewOpsRef.current.completedAt!==null)return;if(memberId!==null&&memberId!=='lead'&&!crewOpsRef.current.members?.some(m=>m.id===memberId))return;handleCrewChange({...crewOpsRef.current,demoVitals:null,healthReplay:memberId?{memberId,startedAt:simTime,record:'bidmc01'}:null});};
  const setMode=(delay:number,speed:number)=>{
    const nextDelay=delay===5?5:0,nextSpeed=nextDelay>0?1:([1,5,10].includes(speed)?speed:1);
    setOneWayDelayMinutes(nextDelay);setSimulationSpeedMultiplier(nextSpeed);
    setCrewOperations(current=>current.missionStart===null||current.completedAt!==null?current:{...current,demoVitals:nextDelay===0&&nextSpeed>1?(current.demoVitals??{startedAt:simTime}):null,healthReplay:null});
  };
  commandHandler.current=command=>{
    if(['crew','investigate','walkMode','end','return','evidence','healthReplay'].includes(command.kind)&&command.sessionId!==undefined&&command.sessionId!==walkSessionId)return;
    const q=command.payload as Record<string,unknown>;
    switch(command.kind){
      case 'draft':if(!planLock.current)setEarthDraft(d=>({...d,...q}));break;
      case 'sendPlan':sendPlan(q.route as RoutePlanSummary,q.draft as typeof earthDraft);break;
      case 'accept':acceptPlan(q.id as string);break;
      case 'request':requestPlan(q.id as string,q.note as string);break;
      case 'evidence':setCrewOperations(c=>recordEvidence(c,q.observation as ObservationRecord,Boolean(q.atDestination)));break;
      case 'crew':handleCrewChange(command.payload as CrewOperations);break;
      case 'investigate':handleInvestigation(Boolean(command.payload));setSurfacePose(p=>({...p,movementMode:command.payload?'investigating':'following'}));break;
      case 'walkMode':setSurfacePose(p=>({...p,movementMode:q.mode as SurfacePose['movementMode']}));setSimulationPaused(false);break;
      case 'end':void handleEndMission();break;
      case 'return':handleStartReturnRoute(q.route as RoutePlanSummary,q.pose as SurfacePose);break;
      case 'resumeSaved':resumeSaved();break;
      case 'healthReplay':setHealthReplay(q.memberId as string|null);break;
      case 'mode':setMode(Number(q.delay),Number(q.speed));break;
    }
  };

  const controlActive=missionStartedAtSimTime!==null&&!restorePending;
  useEffect(()=>{if(view==='science'&&!controlActive)setView(missionProposal?.status==='completed'?'missions':'plan');},[view,controlActive,missionProposal?.status]);
  const chatStatus=role==='science_team'
    ?getLatestMissionActivity(getDeliveredMissionActivity(messages,simTime,`jezero-traverse-${walkSessionId}`))?.statusSnapshot??null
    :latestStatusRef.current?{...latestStatusRef.current,planVersion,position:surfacePose,operations:operationsReport(crewOperations,simTime),destinationName:plannedRoute?.destinationName??crewOperations.destination,missionId:`jezero-traverse-${walkSessionId}`}:null;

  return (
    <div data-ui-system="field" className="app-shell flex h-screen w-screen flex-col overflow-hidden bg-[var(--surface)] font-sans text-[var(--text-primary)] antialiased">
      {<Header
        currentView={view}
        onNavigate={(next) => { if(next === 'notebook') {setChatOpen(false);if(role==='explorer')setFieldPanelOpen(open => !open);else setView('missions');} else {setFieldPanelOpen(false);if(next === 'walk' && (restorePending || missionStartedAtSimTime === null || !plannedRoute?.success)) setView('plan'); else setView(next==='science'&&!controlActive?'plan':next);} }}
        role={role}
        onChangeRole={(newRole) => {
          setFieldPanelOpen(false);
          setRole(newRole);
          setView(newRole === 'science_team' ? (missionStartedAtSimTime!==null&&!restorePending?'science':'globe') : missionStartedAtSimTime === null || restorePending ? 'plan' : 'walk');
        }}
        simTime={simTime}
        missionActive={missionStartedAtSimTime !== null && !restorePending}
        missionReady={Boolean(missionProposal?.status==='pending'&&simTime>=missionProposal.arrivesAt&&!restorePending)}
        oneWayDelayMinutes={oneWayDelayMinutes}
        onAdvanceSimTime={handleAdvanceSimTime}
        simulationPaused={simulationPaused}
        onToggleSimulation={handleToggleSimulation}
        onSetOneWayDelayMinutes={delay=>invoke('mode',{delay,speed:1},()=>setMode(delay,1))}
        simulationSpeedMultiplier={effectiveSpeed}
        onSetSimulationSpeedMultiplier={speed=>invoke('mode',{delay:0,speed},()=>setMode(0,speed))}
        statusUpdateIntervalSeconds={statusUpdateIntervalSeconds}
        onSetStatusUpdateIntervalSeconds={setStatusUpdateIntervalSeconds}
      />}

      {/* 
        MAIN CONTENT VIEW CONTAINER
      */}
      {syncError&&<div role="alert" className="field-warning">Connection interrupted · retrying</div>}
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
        {view==='missions'&&<MissionLog entries={crewOperations.previousWalks??[]} now={simTime} earth={role==='science_team'} onPlan={()=>setView('plan')}/>}
        {/* VIEW 1: PLAN SCREEN (2D Primary Fieldwork Map) */}
        {(view === 'plan'||view==='walk'&&(missionStartedAtSimTime===null||restorePending)) && (
          role==='science_team'?<NamedSitePlanner
            readOnly={Boolean(planningLocked)} lockedRoute={planningLocked?(missionProposal?.route??plannedRoute):null}
            crew={planningLocked?(missionProposal?.crew??earthDraft.crew):earthDraft.crew}
            onCrew={crew=>invoke('draft',{crew},()=>setEarthDraft(d=>({...d,crew})))} now={simTime}
            onBudget={budget=>invoke('draft',{budget},()=>setEarthDraft(d=>({...d,budget})))}
            onReserve={reserve=>invoke('draft',{reserve},()=>setEarthDraft(d=>({...d,reserve})))}
            reserve={planningLocked?(missionProposal?.reserve??earthDraft.reserve):earthDraft.reserve}
            earth budget={planningLocked?(missionProposal?.budget??earthDraft.budget):earthDraft.budget}
            onStart={route=>invoke('sendPlan',{route,draft:earthDraft},()=>sendPlan(route,earthDraft))}
            actionSlot={<><button type="button" className="primary-button" onClick={()=>{setRole('explorer');setView('plan');}}>Open Mars crew</button>{controlActive&&<button type="button" onClick={()=>setView('science')}>Mission control</button>}</>}
            receipt={planningLocked?<div className="proposal-receipt" role="status"><strong>{missionStartedAtSimTime!==null?'Mission in progress':missionProposal?.status==='completed'?'Final report in transit':simTime<(missionProposal?.arrivesAt??0)?'Plan in transit':'Sent · ready for crew review'}</strong><p>{missionStartedAtSimTime!==null?'Current plan · next mission after this walk ends.':missionProposal?.status==='completed'?'New planning opens when the final report arrives.':'Switch to Mars crew to review tasks and start.'}</p></div>:missionProposal?.status==='changes'?<div className="proposal-receipt">Changes requested: {missionProposal.note}</div>:null}
          />:<MissionReview starting={startRequested} savedWalk={restorePending} onResumeSaved={()=>{invoke('resumeSaved',null,resumeSaved);setView('walk');}} onEndSaved={()=>{invoke('end',null,()=>{void handleEndMission();});setView('missions');}} proposal={missionProposal} now={simTime} active={missionStartedAtSimTime!==null} onOpenEarth={()=>{setRole('science_team');setView('plan');}} onReturn={()=>setView('walk')} onAccept={()=>{setStartRequested(true);invoke('accept',{id:missionProposal?.id},()=>acceptPlan(missionProposal?.id));}} onRequest={note=>invoke('request',{id:missionProposal?.id,note},()=>requestPlan(missionProposal?.id,note))}/>

        )}

        {/* VIEW 2: WALK AND INSPECT (3D Terrain Walk) */}
        {!restorePending && missionStartedAtSimTime !== null && (
          <div className={view === 'walk' ? 'absolute inset-0' : 'hidden'} aria-hidden={view !== 'walk'}>
          {plannedRoute && <FieldWalk onOpenLog={()=>{setChatOpen(false);setFieldPanelOpen(v=>!v);}} observations={observations} key={`${walkSessionId}:${plannedRoute.id}`} route={plannedRoute} initialPose={surfacePose} simTime={simTime} session={walkSessionId} paused={simulationPaused} remote={!controller} active={missionStartedAtSimTime!==null&&controller} visible={view==='walk'} crew={oneWayDelayMinutes>0?{...crewOperations,walkSpeedFactor:1}:crewOperations} elapsed={missionStartedAtSimTime===null?0:simTime-missionStartedAtSimTime} budget={missionBudgetMinutes} reserve={reserveMinutes} delay={oneWayDelayMinutes} interval={oneWayDelayMinutes===0?1:statusUpdateIntervalSeconds} planVersion={planVersion} onPose={p=>invoke('walkMode',{mode:p.movementMode},()=>setSurfacePose(p))} onJourney={handleJourneyStateChange} onInvestigate={active=>invoke('investigate',active,()=>handleInvestigation(active))} onCrew={c=>invoke('crew',c,()=>handleCrewChange(c))} onResume={()=>invoke('walkMode',{mode:'following'},()=>setSimulationPaused(false))} onReturn={(route,pose)=>invoke('return',{route,pose},()=>handleStartReturnRoute(route,pose))} onEnd={()=>{invoke('end',null,()=>{void handleEndMission();});setView('missions');}} onSave={handleSaveWalkObservation} onReport={handleSendMissionStatus}/>}

          </div>
        )}

        {/* VIEW 3: FIELD NOTEBOOK & COMM LOG */}
        {view === 'notebook' && (
          <FieldNotebookView
            currentPlanVersion={planVersion}
            currentPlanSummary={planSummaryText}
            simTime={simTime}
            simulationPaused={simulationPaused}
            missionActive={missionStartedAtSimTime !== null && !restorePending}
            oneWayDelayMinutes={oneWayDelayMinutes}
            onAdvanceSimTime={handleAdvanceSimTime}
            onSwitchToScienceTeamView={() => {
              setRole('science_team');
              setView('science');
            }}
          />
        )}

        {/* VIEW 4: DELAYED EARTH SCIENCE TEAM MONITOR */}
        {view === 'science' && role === 'science_team' && controlActive && (
          <EarthTeamMonitoring
          onHealthReplay={memberId=>invoke('healthReplay',{memberId},()=>setHealthReplay(memberId))}
          messages={messages}
          plannedRoute={plannedRoute}
          simTime={simTime}
            simulationPaused={simulationPaused}
            missionActive={missionStartedAtSimTime !== null && !restorePending}
            oneWayDelayMinutes={oneWayDelayMinutes}
          simulationSpeedMultiplier={effectiveSpeed}
          statusUpdateIntervalSeconds={statusUpdateIntervalSeconds}
          missionName={plannedRoute?.destinationName?`${plannedRoute.destinationName} traverse`:'Mission support'}
          missionId={`jezero-traverse-${walkSessionId}`}
          isLocalOnly
          onChangeRole={(newRole) => {
            setFieldPanelOpen(false);
          setRole(newRole);
            setView(newRole === 'science_team' ? (missionStartedAtSimTime!==null&&!restorePending?'science':'globe') : missionStartedAtSimTime === null || restorePending ? 'plan' : 'walk');
          }}
          onToggleSimulation={handleToggleSimulation}
          onSetOneWayDelayMinutes={delay=>invoke('mode',{delay,speed:1},()=>setMode(delay,1))}
          onSetSimulationSpeedMultiplier={speed=>invoke('mode',{delay:0,speed},()=>setMode(0,speed))}
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
        {fieldPanelOpen && role === 'explorer' && <CrewFieldPanel entries={crewOperations.previousWalks} onClose={() => setFieldPanelOpen(false)} observations={observations} messages={messages} tasks={tasks} simTime={simTime} delay={oneWayDelayMinutes} paused={simulationPaused} reload={handleReloadComms}/>}
      </main>
      <FloatingChat messages={messages} side={role==='explorer'?'mars':'earth'} now={simTime} delay={oneWayDelayMinutes} paused={simulationPaused} open={chatOpen} onOpenChange={open=>{setChatOpen(open);if(open)setFieldPanelOpen(false);}} reload={handleReloadComms} currentStatus={chatStatus}/>
    </div>
  );
}
