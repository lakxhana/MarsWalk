import CrewOperationsPanel from './CrewOperationsPanel';
import { duration, operationsReport, type CrewOperations } from '@/lib/crewOperations';
import {initialWalkMode, hasReachedDestination, resumeWalkMode, reportedMovement, type WalkMode} from '@/lib/walkFlow';
import AudioAttachment from './AudioAttachment';
import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { DEMO_USER_WAYPOINTS } from '@/lib/scienceStations';
import {
  type ObservationRecord,
  type CommMessage,
  type MissionStatusSnapshot,
} from '@/lib/storage';
import {
  type JourneyState,
  type DirectionGuidance,
  type OffRouteStatus,
  calculateDynamicGuidance,
  normalizeAngle,
} from '@/lib/navigation';
import {
  getRelativeElevation as getMeasuredRelativeElevation,
  MEASURED_DTM_METADATA,
} from '@/lib/jezeroMeasuredElevation';
import {
  DEFAULT_ROUTER_CONFIG,
  planTerrainRoute,
  validateTraverseSegment,
  type RoutePlanSummary,
} from '@/lib/routePlanner';
import {
  calculateItineraryMinutes,
  calculateMissionTiming,
  calculateReplyWindow,
  getCommunicationStage,
} from '@/lib/missionTiming';
import { type EVAPlanSummary } from '@/lib/evaPlanner';
import { ValidatedPolyline } from '@/lib/validatedPolyline';
import {
  isNavigationPointCovered,
  isNavigationSegmentCovered,
} from '@/lib/jezeroCoverage';
import {
  CROP_HALF_HEIGHT_METERS,
  CROP_HALF_WIDTH_METERS,
  JEZERO_HIRISE_CROP,
} from '@/lib/jezeroHiRISE';
import JezeroWalkMap from './JezeroWalkMap';
import {
  AlertTriangle,
  ExternalLink,
  ImagePlus,
  MessageSquare,
  MoreHorizontal,
  Send,
  X,
} from 'lucide-react';

export interface SurfacePose {
  movementMode?: WalkMode;
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  routeDist?: number;
  nextWpIndex?: number;
  routeId?: string;
  sessionId?: number;
}

interface MarsSurfaceProps {
  crewOperations?:CrewOperations;
  onChangeCrewOperations?:(s:CrewOperations)=>void;
  onInvestigationChange?:(active:boolean)=>void;
  isVisible?: boolean;
  initialPose?: SurfacePose;
  onSavePose?: (pose: SurfacePose) => void;
  journeyState?: JourneyState;
  onChangeJourneyState?: (state: JourneyState) => void;
  destinationId?: number;
  onSelectDestination?: (id: number) => void;
  onBackToMap?: () => void;
  onBackToGlobe?: () => void;
  onOpenSources?: () => void;
  targetStationId?: string | null;
  onClearTargetStation?: () => void;
  isExternalModalOpen?: boolean;
  plannedRoute?: RoutePlanSummary | null;
  walkSessionId?: number;
  currentPlanVersion?: number;
  currentPlanSummary?: string;
  simTime?: number;
  missionActive?: boolean;
  missionElapsedSeconds?: number;
  missionBudgetMinutes?: number;
  reserveMinutes?: number;
  plannedObservationMinutes?: number;
  stopStartedAtSimTime?: number | null;
  missionBase?: { x: number; z: number; name: string } | null;
  activeEVAPlan?: EVAPlanSummary | null;
  simulationPaused?: boolean;
  restoredPaused?: boolean;
  oneWayDelayMinutes?: number;
  observations?: ObservationRecord[];
  messages?: CommMessage[];
  activeTaskId?: string | null;
  activeTaskName?: string | null;
  activeTaskSiteId?: string | null;
  storageBootstrapError?: string | null;
  onSaveObservation?: (observation: ObservationRecord) => Promise<void>;
  onSendQuestion?: (observation: ObservationRecord, questionText: string) => Promise<void>;
  onSendMissionStatus?: (snapshot: MissionStatusSnapshot, observation?: ObservationRecord) => Promise<void>;
  statusUpdateIntervalSeconds?: number;
  simulationSpeedMultiplier?: number;
  onSetPlannedObservationMinutes?: (minutes: number) => void;
  onStartReturnRoute?: (route: RoutePlanSummary, pose: SurfacePose) => void;
  onEndMission?: () => void;
  onResumeSimulation?: () => void;
}

export type MovementMode = WalkMode;

const EYE_HEIGHT = 1.75;
const WALKING_SPEED = 1.1;

export interface ActiveWaypoint {
  id: number;
  x: number;
  z: number;
  label: string;
  name: string;
}

export default function MarsSurface({
  isVisible = true,
  initialPose,
  onSavePose,
  journeyState = 'plan',
  onChangeJourneyState,
  onBackToMap,
  onOpenSources,
  targetStationId,
  onClearTargetStation,
  isExternalModalOpen = false,
  plannedRoute,
  walkSessionId,
  currentPlanVersion = 1,
  currentPlanSummary = 'Current walk route',
  simTime = 0,
  statusUpdateIntervalSeconds = 10,
  missionActive = false,
  missionElapsedSeconds = 0,
  missionBudgetMinutes = 60,
  reserveMinutes = 10,
  plannedObservationMinutes = 0,
  stopStartedAtSimTime = null,
  missionBase = null,
  activeEVAPlan = null,
  simulationPaused = false,
  oneWayDelayMinutes = 5,
  observations = [],
  messages = [],
  activeTaskId = null,
  activeTaskName = null,
  activeTaskSiteId = null,
  storageBootstrapError = null,
  onSaveObservation,
  onSendQuestion,
  onSendMissionStatus,
  simulationSpeedMultiplier = 1,
  onSetPlannedObservationMinutes,
  onStartReturnRoute,
  onEndMission,
  onResumeSimulation,
  crewOperations, onChangeCrewOperations, onInvestigationChange,
}: MarsSurfaceProps) {
  const investigationCallbackRef = useRef(onInvestigationChange);
  investigationCallbackRef.current = onInvestigationChange;
  const isDemoMode = false;
  const [is3DPreview, setIs3DPreview] = useState(false);
  const [coverageMessage, setCoverageMessage] = useState<string | null>(null);

  const getRelativeElevation = useCallback(
    (x: number, z: number) => getMeasuredRelativeElevation(x, z),
    [],
  );

  // Check if valid planned route exists
  const hasValidPlannedRoute = Boolean(
    plannedRoute &&
      plannedRoute.success &&
      plannedRoute.points &&
      plannedRoute.points.length >= 2 &&
      plannedRoute.points.every((point, index, points) =>
        index === 0 || isNavigationSegmentCovered(points[index - 1], point),
      ),
  );

  // Determine active route and waypoints
  const { activePoints, activeWaypoints, isRoutePlanned, destinationLabel } = useMemo(() => {
    if (hasValidPlannedRoute && plannedRoute) {
      const pts = plannedRoute.points;
      const wps: ActiveWaypoint[] = [
        {
          id: 0,
          x: pts[0].x,
          z: pts[0].z,
          label: 'Start',
          name: 'Selected start waypoint',
        },
      ];

      // Add intermediate waypoint if route is long enough
      if (pts.length > 3) {
        const midIdx = Math.floor(pts.length / 2);
        wps.push({
          id: 1,
          x: pts[midIdx].x,
          z: pts[midIdx].z,
          label: '01',
          name: 'Route waypoint',
        });
      }

      // Final destination waypoint
      const lastPt = pts[pts.length - 1];
      wps.push({
        id: wps.length,
        x: lastPt.x,
        z: lastPt.z,
        label: 'Dest',
        name: plannedRoute.destinationName || 'Destination',
      });

      return {
        activePoints: pts.map((p) => ({ x: p.x, z: p.z })),
        activeWaypoints: wps,
        isRoutePlanned: true,
        destinationLabel: plannedRoute.destinationName || 'Destination',
      };
    }

    // Explicit Demo Mode fallback: strictly separated and labelled
    const demoWps: ActiveWaypoint[] = DEMO_USER_WAYPOINTS.map((w) => ({
      id: w.id,
      x: w.x,
      z: w.z,
      label: w.label,
      name: w.name,
    }));

    return {
      activePoints: DEMO_USER_WAYPOINTS.map((w) => ({ x: w.x, z: w.z })),
      activeWaypoints: demoWps,
      isRoutePlanned: false,
      destinationLabel: 'Illustrative endpoint',
    };
  }, [hasValidPlannedRoute, plannedRoute]);

  const mountRef = useRef<HTMLDivElement>(null);
  const sceneMountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const terrainMeshRef = useRef<THREE.Mesh | null>(null);
  const destMarkerMeshRef = useRef<THREE.Mesh | null>(null);
  const rafRef = useRef<number | null>(null);

  // Dynamic Navigation Guidance & Off-Route States for HUD
  const [guidance, setGuidance] = useState<DirectionGuidance>({
    instruction: 'Continue straight',
    subInstruction: 'Toward next waypoint',
    bearingDeg: 0,
    relativeDeg: 0,
    turnDirection: 'straight',
  });
  const [offRouteStatus, setOffRouteStatus] = useState<OffRouteStatus>({
    isOffRoute: false,
    distance: 0,
    closestPoint: { x: 0, z: 0 },
    rejoinInstruction: 'On route',
    turnDirection: 'straight',
  });
  const [distToDestination, setDistToDestination] = useState<number>(100);
  const [distToNext, setDistToNext] = useState<number>(0);

  // Screen-Edge Indicator when next waypoint is outside camera view
  const [screenEdgeIndicator, setScreenEdgeIndicator] = useState<{
    visible: boolean;
    x: number; // percentage [0, 100]
    y: number; // percentage [0, 100]
    angleDeg: number;
    label: string;
    distance: number;
  }>({
    visible: false,
    x: 50,
    y: 10,
    angleDeg: 0,
    label: '01',
    distance: 0,
  });

  // Observations disclosure (Rover historical temperature)

  // Movement mode
  const [movementMode, setMovementMode] = useState<MovementMode>(() => initialWalkMode(missionActive, journeyState === 'arrive', initialPose?.routeId === plannedRoute?.id ? initialPose?.movementMode : undefined));
  const movementModeRef = useRef<MovementMode>(movementMode);
  const [userWaypoint, setUserWaypoint] = useState<{ x: number; z: number } | null>(null);

  // Waypoint tracking
  const targetWpIndexRef = useRef(1);
  const [currentWpIndex, setCurrentWpIndex] = useState(1);

  // Click-to-walk state
  const clickTargetRef = useRef<{ x: number; z: number } | null>(null);

  // Route approach transition state
  const approachTargetRef = useRef<{
    targetX: number;
    targetZ: number;
    targetDist: number;
  } | null>(null);

  // UI and dragging state
  const [, setIsDragging] = useState(false);

  // Shared observation workflow
  const [isRecordPanelOpen, setIsRecordPanelOpen] = useState(false);
  const [, setStatusUpdateState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [statusUpdateError, setStatusUpdateError] = useState<string | null>(null);
  const [recordDraft, setRecordDraft] = useState('');
  const [recordImage, setRecordImage] = useState<string | null>(null);
  const [recordImageName, setRecordImageName] = useState('');
  const [recordAudio, setRecordAudio] = useState('');
  const [audioRecording, setAudioRecording] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [isSavingRecord, setIsSavingRecord] = useState(false);
  const [savedWalkObservation, setSavedWalkObservation] = useState<ObservationRecord | null>(null);
  const [isQuestionComposerOpen, setIsQuestionComposerOpen] = useState(false);
  const [walkQuestion, setWalkQuestion] = useState('');
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [isSendingQuestion, setIsSendingQuestion] = useState(false);
  const [replyMessageId, setReplyMessageId] = useState<string | null>(null);
  const [seenReplyIds, setSeenReplyIds] = useState<Set<string>>(() => new Set());
  const recordTextareaRef = useRef<HTMLTextAreaElement>(null);
  const replyHeadingRef = useRef<HTMLHeadingElement>(null);
  const recordLocationRef = useRef<{ x: number; z: number; routeDist: number } | null>(null);
  const [isReturnReviewOpen, setIsReturnReviewOpen] = useState(false);
  const [shortenedObservationMinutes, setShortenedObservationMinutes] = useState<number | null>(null);
  const [liveRoutes, setLiveRoutes] = useState<{
    state: 'updating' | 'ready' | 'unavailable';
    directReturn: RoutePlanSummary | null;
    remainingTravel: RoutePlanSummary | null;
    finalReturn: RoutePlanSummary | null;
  }>({ state: 'updating', directReturn: null, remainingTravel: null, finalReturn: null });
  const routeCalculationIdRef = useRef(0);
  const activityStartedAtSimTimeRef = useRef<number | null>(null);
  const lastStatusSimTimeRef = useRef<number | null>(null);
  const lastStatusSignatureRef = useRef<string | null>(null);

  // Modal active flag (suspends movement)
  const isAnyModalActive = Boolean(isRecordPanelOpen || replyMessageId || isReturnReviewOpen || isExternalModalOpen);
  const isAnyModalActiveRef = useRef(isAnyModalActive);
  isAnyModalActiveRef.current = isAnyModalActive;
  const isVisibleRef = useRef(isVisible);
  isVisibleRef.current = isVisible;
  const simulationPausedRef = useRef(simulationPaused);
  simulationPausedRef.current = simulationPaused;
  const simulationSpeedMultiplierRef = useRef(simulationSpeedMultiplier);
  simulationSpeedMultiplierRef.current = simulationSpeedMultiplier;

  // Exact validated polyline distance interpolator along active points
  // Replaces THREE.SplineCurve so that ground ribbon, guided motion, and off-route detection
  // follow the exact validated straight segments without bulging into excluded terrain.
  const polyline = useMemo(() => {
    return new ValidatedPolyline(activePoints);
  }, [activePoints]);

  const polylineRef = useRef(polyline);
  polylineRef.current = polyline;
  const totalRouteLength = polyline.totalLength;
  const totalRouteLengthRef = useRef(totalRouteLength);
  totalRouteLengthRef.current = totalRouteLength;
  const routeEndpoints = useMemo(() => ({
    base: missionBase || (plannedRoute?.points.length
      ? { x: plannedRoute.points[0].x, z: plannedRoute.points[0].z, name: plannedRoute.startName || 'Selected base' }
      : null),
    destination: plannedRoute?.points.length
      ? { x: plannedRoute.points[plannedRoute.points.length - 1].x, z: plannedRoute.points[plannedRoute.points.length - 1].z }
      : null,
  }), [missionBase, plannedRoute]);

  // Compute spawn position & orientation on fresh "Start walk"
  // Place walker at the first point of the selected route and face the first distinct segment
  const computedSpawn = useMemo(() => {
    const p0 = activePoints[0] || { x: 0, z: 0 };
    // Find first distinct point along route
    let p1 = activePoints[1] || { x: p0.x, z: p0.z - 10 };
    for (let i = 1; i < activePoints.length; i++) {
      if (Math.hypot(activePoints[i].x - p0.x, activePoints[i].z - p0.z) > 0.5) {
        p1 = activePoints[i];
        break;
      }
    }
    const dx = p1.x - p0.x;
    const dz = p1.z - p0.z;
    // Yaw to face down the first segment
    const yaw = Math.atan2(-dx, -dz);
    return { x: p0.x, z: p0.z, yaw };
  }, [activePoints]);

  const spawnPose = useRef(initialPose).current;
  // Determine whether to use spawnPose or fresh spawn
  // Restore saved position ONLY when explicitly resuming that same route session
  const activeRouteId = plannedRoute?.id || (isDemoMode ? 'demo-route' : 'default-route');
  const isResumingSession = Boolean(
    walkSessionId !== undefined &&
    spawnPose &&
    spawnPose.sessionId === walkSessionId &&
    spawnPose.routeId === activeRouteId &&
    spawnPose.routeDist !== undefined
  );

  const startX = isResumingSession && spawnPose ? spawnPose.x : computedSpawn.x;
  const startZ = isResumingSession && spawnPose ? spawnPose.z : computedSpawn.z;
  const startYaw = isResumingSession && spawnPose ? spawnPose.yaw : computedSpawn.yaw;
  const startRouteDist = isResumingSession && spawnPose?.routeDist ? spawnPose.routeDist : 0;
  const startWpIndex = isResumingSession && spawnPose?.nextWpIndex ? spawnPose.nextWpIndex : 1;
  const [estimatePosition, setEstimatePosition] = useState({ x: startX, z: startZ });
  const [displayPose, setDisplayPose] = useState({
    x: startX,
    z: startZ,
    yaw: startYaw,
    pitch: isResumingSession ? (initialPose?.pitch ?? 0) : 0,
  });
  const estimatePositionRef = useRef(estimatePosition);
  const lastEstimatePositionRef = useRef(estimatePosition);

  const anglesRef = useRef({
    yaw: startYaw,
    pitch: isResumingSession ? (initialPose?.pitch ?? 0) : 0,
  });
  const currentPosRef = useRef({
    x: startX,
    z: startZ,
  });

  const latestPoseRef = useRef<SurfacePose>({
    x: startX,
    z: startZ,
    yaw: startYaw,
    pitch: isResumingSession ? (initialPose?.pitch ?? 0) : 0,
    routeDist: startRouteDist,
    nextWpIndex: startWpIndex,
    routeId: activeRouteId,
    sessionId: walkSessionId,
  });

  const onSavePoseRef = useRef(onSavePose);
  onSavePoseRef.current = onSavePose;
  const journeyStateRef = useRef(journeyState);
  journeyStateRef.current = journeyState;
  const onChangeJourneyStateRef = useRef(onChangeJourneyState);
  onChangeJourneyStateRef.current = onChangeJourneyState;
  const routeDistRef = useRef(startRouteDist);

  const createEarthStatusSnapshot = useCallback((activityEvent: string): MissionStatusSnapshot => {
    const position = currentPosRef.current;
    const isReturning = plannedRoute?.id?.startsWith('return-') ?? false;
    const movementState = reportedMovement(movementModeRef.current, simulationPaused, isRecordPanelOpen, isReturning,
      keysRef.current.forward || keysRef.current.backward || keysRef.current.left || keysRef.current.right);
    return {
      missionId: `jezero-traverse-${walkSessionId}`,
      explorerId: 'explorer-01',
      capturedAtSimTime: simTime,
      headingRadians: anglesRef.current.yaw,
      movementState,
      activityEvent,
      currentTaskId: activeTaskId,
      currentTaskName: activeTaskName,
      remainingMissionMinutes: Math.max(0, missionBudgetMinutes - missionElapsedSeconds / 60),
      planVersion: currentPlanVersion,
      planSummary: currentPlanSummary,
      destinationName: plannedRoute?.destinationName || 'User waypoint',
      position: { ...position },
      coordinateReference: 'MARSWalk Jezero local Cartesian frame (x/z metres; simulated, not rover coordinates).',
      missionElapsedSeconds,
      missionBudgetMinutes,
      reserveMinutes,
      returnEstimateMinutes: liveRoutes.state === 'ready'
        ? liveRoutes.directReturn?.estimatedTimeMinutes ?? null
        : null,
      base: routeEndpoints.base ? { ...routeEndpoints.base } : null,
      plannedRoutePoints: plannedRoute?.points.map(({ x, z }) => ({ x, z })) ?? [],
    };
  }, [
    activeTaskId,
    activeTaskName,
    currentPlanSummary,
    currentPlanVersion,
    isRecordPanelOpen,
    liveRoutes,
    missionBudgetMinutes,
    missionElapsedSeconds,
    plannedRoute,
    reserveMinutes,
    routeEndpoints.base,
    simTime,
    simulationPaused,
    walkSessionId,
  ]);

  const sendEarthStatus = useCallback(async (activityEvent: string, observation?: ObservationRecord) => {
    if (!missionActive || !onSendMissionStatus) return;
    setStatusUpdateState('sending');
    setStatusUpdateError(null);
    try {
      await onSendMissionStatus(createEarthStatusSnapshot(activityEvent), observation);
      setStatusUpdateState('sent');
    } catch (error) {
      console.error('Could not send mission status:', error);
      setStatusUpdateError(error instanceof Error ? error.message : 'Mission status could not be sent.');
      setStatusUpdateState('error');
    }
  }, [createEarthStatusSnapshot, missionActive, onSendMissionStatus]);

  useEffect(() => {
    if (!missionActive || !onSendMissionStatus) return;
    const snapshot = createEarthStatusSnapshot('');
    const signature = [
      snapshot.movementState,
      snapshot.planVersion,
      snapshot.currentTaskId,
      snapshot.missionId,
      plannedRoute?.id,
      simulationPaused,
      snapshot.base?.x,
      snapshot.base?.z,
      isRecordPanelOpen,
      crewOperations?.stops[crewOperations.stops.length-1]?.id,
      crewOperations ? operationsReport(crewOperations,simTime).stop?.level : '',
      crewOperations ? operationsReport(crewOperations,simTime).oxygenMinutes <= crewOperations.oxygenReserveMinutes : false,
      crewOperations?.taskPhoto, crewOperations?.taskNote,
      JSON.stringify(crewOperations?.health),
      crewOperations?.stops[crewOperations.stops.length-1]?.ended,
    ].join('|');
    const activityChanged = signature !== lastStatusSignatureRef.current;
    const intervalElapsed = lastStatusSimTimeRef.current === null ||
      simTime - lastStatusSimTimeRef.current >= statusUpdateIntervalSeconds;
    if (!activityChanged && !intervalElapsed) return;

    lastStatusSignatureRef.current = signature;
    lastStatusSimTimeRef.current = simTime;
    void sendEarthStatus(activityChanged ? snapshot.movementState || 'Activity updated' : 'Periodic status report');
  }, [crewOperations, 
    createEarthStatusSnapshot,
    isRecordPanelOpen,
    missionActive,
    onSendMissionStatus,
    plannedRoute?.id,
    simulationPaused,
    sendEarthStatus,
    statusUpdateIntervalSeconds,
    simTime,
  ]);

  // Keyboard state
  const keysRef = useRef<{
    forward: boolean;
    backward: boolean;
    left: boolean;
    right: boolean;
    sprint: boolean;
  }>({
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
  });

  const clearMovementKeys = useCallback(() => {
    keysRef.current = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      sprint: false,
    };
  }, []);

  useEffect(() => {
    if (!isVisible) clearMovementKeys();
  }, [isVisible, clearMovementKeys]);

  const dragRef = useRef<{
    isDragging: boolean;
    lastX: number;
    lastY: number;
  }>({
    isDragging: false,
    lastX: 0,
    lastY: 0,
  });

  const pointerDownRef = useRef<{
    x: number;
    y: number;
    time: number;
    dragMoved: boolean;
  }>({
    x: 0,
    y: 0,
    time: 0,
    dragMoved: false,
  });

  // Track off-route state with hysteresis
  const isOffRouteRef = useRef(false);

  useEffect(() => {
    if (isRecordPanelOpen) {
      requestAnimationFrame(() => recordTextareaRef.current?.focus());
    }
  }, [isRecordPanelOpen]);

  useEffect(() => {
    if (replyMessageId) {
      requestAnimationFrame(() => replyHeadingRef.current?.focus());
    }
  }, [replyMessageId]);

  useEffect(() => {
    if (simulationPaused) {
      clearMovementKeys();
      onSavePoseRef.current?.(latestPoseRef.current);
    }
  }, [clearMovementKeys, simulationPaused]);

  useEffect(() => {
    const position = { x: startX, z: startZ };
    estimatePositionRef.current = position;
    lastEstimatePositionRef.current = position;
    setEstimatePosition(position);
    targetWpIndexRef.current = Math.min(startWpIndex, activeWaypoints.length - 1);
    setCurrentWpIndex(targetWpIndexRef.current);
    const targetWaypoint = activeWaypoints[targetWpIndexRef.current];
    setDistToDestination(Math.round(polyline.getRemainingDistanceAlongPolyline(startX, startZ)));
    setDistToNext(
      targetWaypoint
        ? Math.round(Math.hypot(startX - targetWaypoint.x, startZ - targetWaypoint.z))
        : 0,
    );
  }, [activeRouteId, activeWaypoints, polyline, startWpIndex, startX, startZ, walkSessionId]);

  useEffect(() => {
    const calculationId = ++routeCalculationIdRef.current;
    setLiveRoutes({ state: 'updating', directReturn: null, remainingTravel: null, finalReturn: null });
    const timeout = window.setTimeout(() => {
      if (!routeEndpoints.base || !routeEndpoints.destination) {
        setLiveRoutes({ state: 'unavailable', directReturn: null, remainingTravel: null, finalReturn: null });
        return;
      }

      const base = {
        id: 'mission-base',
        name: routeEndpoints.base.name || 'Selected base',
        x: routeEndpoints.base.x,
        z: routeEndpoints.base.z,
      };
      const destination = {
        id: 'mission-stop',
        name: destinationLabel,
        x: routeEndpoints.destination.x,
        z: routeEndpoints.destination.z,
      };
      const config = {
        baseLocation: base,
        destination,
        totalDurationMinutes: missionBudgetMinutes,
        observationMinutes: plannedObservationMinutes,
        reserveMinutes,
        assumedBaseSpeedMps: plannedRoute?.assumedSpeedMps || DEFAULT_ROUTER_CONFIG.assumedBaseSpeedMps,
        maxAllowableSlopeDeg: plannedRoute?.maxAllowableSlopeDeg || DEFAULT_ROUTER_CONFIG.maxAllowableSlopeDeg,
        preference: 'lower-slope' as const,
        exclusions: activeEVAPlan?.exclusions,
      };
      const routerConfig = {
        maxAllowableSlopeDeg: config.maxAllowableSlopeDeg,
        preference: config.preference,
        assumedBaseSpeedMps: config.assumedBaseSpeedMps,
        exclusions: config.exclusions,
      };
      const directReturn = planTerrainRoute(estimatePositionRef.current, base, routerConfig);
      const remainingTravel = planTerrainRoute(estimatePositionRef.current, destination, routerConfig);
      const evaReturnRoute = activeEVAPlan?.returnRoute;
      const evaReturnMatches = Boolean(
        evaReturnRoute?.success &&
        evaReturnRoute.points.length >= 2 &&
        Math.hypot(evaReturnRoute.points[0].x - destination.x, evaReturnRoute.points[0].z - destination.z) < 1 &&
        Math.hypot(
          evaReturnRoute.points[evaReturnRoute.points.length - 1].x - base.x,
          evaReturnRoute.points[evaReturnRoute.points.length - 1].z - base.z,
        ) < 1 &&
        evaReturnRoute.assumedSpeedMps === config.assumedBaseSpeedMps &&
        evaReturnRoute.maxAllowableSlopeDeg === config.maxAllowableSlopeDeg
      );
      const finalReturn = evaReturnMatches && evaReturnRoute
        ? evaReturnRoute
        : planTerrainRoute(destination, base, routerConfig);

      if (calculationId !== routeCalculationIdRef.current) return;
      setLiveRoutes({
        state: directReturn.success ? 'ready' : 'unavailable',
        directReturn: directReturn.success ? directReturn : null,
        remainingTravel: remainingTravel.success ? remainingTravel : null,
        finalReturn: finalReturn.success ? finalReturn : null,
      });
    }, 350);

    return () => {
      window.clearTimeout(timeout);
      routeCalculationIdRef.current = calculationId + 1;
    };
  }, [
    activeEVAPlan, destinationLabel, estimatePosition.x, estimatePosition.z,
    missionBudgetMinutes, plannedObservationMinutes, plannedRoute, reserveMinutes,
    routeEndpoints,
  ]);

  // The station staging coordinates are not geographically associated with this crop.
  useEffect(() => {
    if (targetStationId) {
      setCoverageMessage('This site has no supported viewpoint in the mapped terrain coverage.');
      onClearTargetStation?.();
    }
  }, [targetStationId, onClearTargetStation]);

  // ONLY RUN ONCE ON MOUNT / ROUTE CHANGE: Initialize 3D Scene
  useEffect(() => {
    if (!is3DPreview) return;
    if (!hasValidPlannedRoute && !isDemoMode) {
      return;
    }

    const mount = sceneMountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#313732');

    const width = mount.clientWidth || window.innerWidth || 800;
    const height = mount.clientHeight || window.innerHeight || 600;
    const aspect = height > 0 ? width / height : 1.33;

    const camera = new THREE.PerspectiveCamera(58, aspect, 0.1, 450);
    const sceneStart = currentPosRef.current;
    const initY = getRelativeElevation(sceneStart.x, sceneStart.z) + EYE_HEIGHT;
    camera.position.set(sceneStart.x, initY, sceneStart.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(anglesRef.current.pitch, anglesRef.current.yaw, 0);
    cameraRef.current = camera;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'default' });
    } catch (err) {
      console.error('[MarsSurface] WebGLRenderer creation failed:', err);
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = false;

    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    scene.add(new THREE.AmbientLight(0xffffff, 1.5));

    const terrainGeo = new THREE.PlaneGeometry(
      JEZERO_HIRISE_CROP.widthMeters,
      JEZERO_HIRISE_CROP.heightMeters,
      320,
      320,
    );
    terrainGeo.rotateX(-Math.PI / 2);

    const pos = terrainGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
      const vy = getRelativeElevation(vx, vz);
      pos.setY(i, vy);
    }
    pos.needsUpdate = true;
    const terrainIndices: number[] = [];
    for (let row = 0; row < 320; row++) {
      for (let col = 0; col < 320; col++) {
        const leftX = -CROP_HALF_WIDTH_METERS + col * MEASURED_DTM_METADATA.gridSpacingMeters;
        const rightX = leftX + MEASURED_DTM_METADATA.gridSpacingMeters;
        const topZ = -CROP_HALF_HEIGHT_METERS + row * MEASURED_DTM_METADATA.gridSpacingMeters;
        const bottomZ = topZ + MEASURED_DTM_METADATA.gridSpacingMeters;
        const centerX = (leftX + rightX) / 2;
        const centerZ = (topZ + bottomZ) / 2;
        if (
          !isNavigationPointCovered(leftX, topZ) ||
          !isNavigationPointCovered(rightX, topZ) ||
          !isNavigationPointCovered(leftX, bottomZ) ||
          !isNavigationPointCovered(rightX, bottomZ) ||
          !isNavigationPointCovered(centerX, centerZ)
        ) continue;
        const topLeft = row * 321 + col;
        const topRight = topLeft + 1;
        const bottomLeft = topLeft + 321;
        const bottomRight = bottomLeft + 1;
        terrainIndices.push(topLeft, topRight, bottomLeft, topRight, bottomRight, bottomLeft);
      }
    }
    terrainGeo.setIndex(terrainIndices);
    terrainGeo.computeVertexNormals();

    const imageryTexture = new THREE.TextureLoader().load(
      JEZERO_HIRISE_CROP.assetUrl,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
      },
      undefined,
      (error) => console.error('Could not load the HiRISE terrain preview texture:', error),
    );
    imageryTexture.colorSpace = THREE.SRGBColorSpace;
    imageryTexture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    const terrainMat = new THREE.MeshStandardMaterial({
      map: imageryTexture,
      side: THREE.DoubleSide,
      roughness: 1,
      metalness: 0,
    });
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    scene.add(terrainMesh);
    terrainMeshRef.current = terrainMesh;

    const poly = polylineRef.current;
    const routePoints3D = poly.generateRibbonSamples(4).map(
      (sample) => new THREE.Vector3(
        sample.x,
        getRelativeElevation(sample.x, sample.z) + 0.04,
        sample.z,
      ),
    );
    const routeGeo = new THREE.BufferGeometry().setFromPoints(routePoints3D);
    const routeMat = new THREE.LineBasicMaterial({ color: 0x2b79a3, depthTest: true });
    const routeLine = new THREE.Line(routeGeo, routeMat);
    scene.add(routeLine);

    // Click-to-walk ground destination visual marker
    const destMarkerGeo = new THREE.RingGeometry(0.5, 0.85, 32);
    destMarkerGeo.rotateX(-Math.PI / 2);
    const destMarkerMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const destMarkerMesh = new THREE.Mesh(destMarkerGeo, destMarkerMat);
    destMarkerMesh.visible = false;
    scene.add(destMarkerMesh);
    destMarkerMeshRef.current = destMarkerMesh;

    // Raycaster for click-to-walk
    const raycaster = new THREE.Raycaster();
    const mouseNdc = new THREE.Vector2();

    // Pointer handlers
    const onPointerDown = (e: PointerEvent) => {
      if (!isVisibleRef.current || isAnyModalActiveRef.current || simulationPausedRef.current) return;
      if ((e.target as HTMLElement).closest('button, a, input, textarea, select')) return;
      pointerDownRef.current = {
        x: e.clientX,
        y: e.clientY,
        time: performance.now(),
        dragMoved: false,
      };
      dragRef.current.isDragging = true;
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastY = e.clientY;
      setIsDragging(true);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragRef.current.isDragging || isAnyModalActiveRef.current || simulationPausedRef.current) return;

      const totalDist = Math.hypot(
        e.clientX - pointerDownRef.current.x,
        e.clientY - pointerDownRef.current.y,
      );
      if (totalDist > 5) {
        pointerDownRef.current.dragMoved = true;
      }

      const dx = e.clientX - dragRef.current.lastX;
      const dy = e.clientY - dragRef.current.lastY;
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastY = e.clientY;

      const sens = 0.0028;
      anglesRef.current.yaw -= dx * sens;
      anglesRef.current.pitch -= dy * sens;
      anglesRef.current.pitch = Math.max(-1.42, Math.min(1.42, anglesRef.current.pitch));
      camera.rotation.set(anglesRef.current.pitch, anglesRef.current.yaw, 0, 'YXZ');
    };

    const onPointerUp = (e: PointerEvent) => {
      dragRef.current.isDragging = false;
      setIsDragging(false);

      if (isAnyModalActiveRef.current) return;

      const duration = performance.now() - pointerDownRef.current.time;
      const wasDrag = pointerDownRef.current.dragMoved;

      if (!wasDrag && duration < 350) {
        if ((e.target as HTMLElement).closest('button, a, input, textarea, select')) return;
        if (!terrainMeshRef.current) return;

        const rect = renderer.domElement.getBoundingClientRect();
        mouseNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouseNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouseNdc, camera);
        const hits = raycaster.intersectObject(terrainMeshRef.current, false);

        if (hits.length > 0) {
          const hitPt = hits[0].point;
          const target = { x: hitPt.x, z: hitPt.z };
          const routeCheck = validateTraverseSegment(
            currentPosRef.current,
            target,
            DEFAULT_ROUTER_CONFIG.maxAllowableSlopeDeg,
            4,
          );
          if (!routeCheck.valid) {
            setCoverageMessage(
              routeCheck.reason?.includes('coverage')
                ? 'End of available terrain data. Choose a point inside the mapped area.'
                : routeCheck.reason || 'A safe traverse to that point is unavailable.',
            );
            return;
          }
          setCoverageMessage(null);
          clickTargetRef.current = target;
          setUserWaypoint(target);
          destMarkerMesh.position.set(
            hitPt.x,
            getRelativeElevation(hitPt.x, hitPt.z) + 0.12,
            hitPt.z,
          );
          destMarkerMesh.visible = true;
          approachTargetRef.current = null;
          movementModeRef.current = 'clickToWalk';
          setMovementMode('clickToWalk');
    investigationCallbackRef.current?.(false);
        }
      }
    };

    const dom = renderer.domElement;
    dom.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    // Keyboard handlers
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isVisibleRef.current || isAnyModalActiveRef.current || simulationPausedRef.current) return;
      if (e.target instanceof HTMLElement && e.target.matches('input, textarea, select, button, [contenteditable="true"]')) return;

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }

      let manualKey = false;
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          keysRef.current.forward = true;
          manualKey = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          keysRef.current.backward = true;
          manualKey = true;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          keysRef.current.left = true;
          manualKey = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          keysRef.current.right = true;
          manualKey = true;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          keysRef.current.sprint = true;
          break;
      }

      if (manualKey) {
        movementModeRef.current = 'manual';
        setMovementMode('manual');
        investigationCallbackRef.current?.(false);
        clickTargetRef.current = null;
        setUserWaypoint(null);
        approachTargetRef.current = null;
        if (destMarkerMeshRef.current) {
          destMarkerMeshRef.current.visible = false;
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          keysRef.current.forward = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          keysRef.current.backward = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          keysRef.current.left = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          keysRef.current.right = false;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          keysRef.current.sprint = false;
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const onResize = () => {
      if (!mount) return;
      const w = mount.clientWidth || window.innerWidth || 800;
      const h = mount.clientHeight || window.innerHeight || 600;
      camera.aspect = h > 0 ? w / h : 1.33;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    // Animation & Kinematics Loop
    const clock = new THREE.Clock();
    let lastUiUpdate = 0;
    const stopAtCoverageBoundary = () => {
      clearMovementKeys();
      movementModeRef.current = 'paused';
      setMovementMode('paused');
      setCoverageMessage('End of available terrain data. Choose a point inside the mapped area.');
    };

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.05) * simulationSpeedMultiplierRef.current;

      if (!isAnyModalActiveRef.current && !simulationPausedRef.current) {
        const activeMode = movementModeRef.current;

        if (activeMode === 'following') {
          if (approachTargetRef.current) {
            const app = approachTargetRef.current;
            const dx = app.targetX - camera.position.x;
            const dz = app.targetZ - camera.position.z;
            const dist = Math.hypot(dx, dz);

            if (dist > 0.35) {
              const step = Math.min(dist, WALKING_SPEED * delta);
              const next = {
                x: camera.position.x + (dx / dist) * step,
                z: camera.position.z + (dz / dist) * step,
              };
              if (!isNavigationSegmentCovered(camera.position, next)) {
                stopAtCoverageBoundary();
              } else {
                camera.position.x = next.x;
                camera.position.z = next.z;
              }
              camera.position.y = getRelativeElevation(camera.position.x, camera.position.z) + EYE_HEIGHT;

              if (!dragRef.current.isDragging) {
                const targetYaw = Math.atan2(-dx, -dz);
                let diff = targetYaw - anglesRef.current.yaw;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                anglesRef.current.yaw += diff * (1 - Math.exp(-3.0 * delta));
                camera.rotation.set(anglesRef.current.pitch, anglesRef.current.yaw, 0, 'YXZ');
              }
            } else {
              routeDistRef.current = app.targetDist;
              approachTargetRef.current = null;
            }
          } else {
            const totalLen = totalRouteLengthRef.current;
            const previousDistance = routeDistRef.current;
            routeDistRef.current = Math.min(totalLen, routeDistRef.current + WALKING_SPEED * delta);
            const sample = polylineRef.current.getPointAtDistance(routeDistRef.current);

            if (!isNavigationSegmentCovered(camera.position, sample)) {
              routeDistRef.current = previousDistance;
              stopAtCoverageBoundary();
            } else {
              camera.position.x = sample.x;
              camera.position.z = sample.z;
            }
            camera.position.y = getRelativeElevation(camera.position.x, camera.position.z) + EYE_HEIGHT;

            if (!dragRef.current.isDragging) {
              // Camera rotation eases smoothly between headings without changing the path
              const lookAheadDist = Math.min(totalLen, routeDistRef.current + 2.5);
              const lookAheadSample = polylineRef.current.getPointAtDistance(lookAheadDist);
              const dx = lookAheadSample.x - sample.x || sample.tangent.x;
              const dz = lookAheadSample.z - sample.z || sample.tangent.z;
              const targetYaw = Math.atan2(-dx, -dz);
              let diff = targetYaw - anglesRef.current.yaw;
              while (diff > Math.PI) diff -= Math.PI * 2;
              while (diff < -Math.PI) diff += Math.PI * 2;
              anglesRef.current.yaw += diff * (1 - Math.exp(-2.8 * delta));
              camera.rotation.set(anglesRef.current.pitch, anglesRef.current.yaw, 0, 'YXZ');
            }

            if (routeDistRef.current >= totalLen - 0.1) {
              movementModeRef.current = 'paused';
              setMovementMode('paused');
            }
          }
        } else if (activeMode === 'clickToWalk') {
          if (clickTargetRef.current) {
            const tx = clickTargetRef.current.x;
            const tz = clickTargetRef.current.z;
            const dx = tx - camera.position.x;
            const dz = tz - camera.position.z;
            const dist = Math.hypot(dx, dz);

            if (dist > 0.4) {
              const step = Math.min(dist, WALKING_SPEED * delta);
              const next = {
                x: camera.position.x + (dx / dist) * step,
                z: camera.position.z + (dz / dist) * step,
              };
              if (!isNavigationSegmentCovered(camera.position, next)) {
                stopAtCoverageBoundary();
              } else {
                camera.position.x = next.x;
                camera.position.z = next.z;
              }
              camera.position.y = getRelativeElevation(camera.position.x, camera.position.z) + EYE_HEIGHT;

              if (!dragRef.current.isDragging) {
                const targetYaw = Math.atan2(-dx, -dz);
                let diff = targetYaw - anglesRef.current.yaw;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                anglesRef.current.yaw += diff * (1 - Math.exp(-3.0 * delta));
                camera.rotation.set(anglesRef.current.pitch, anglesRef.current.yaw, 0, 'YXZ');
              }
            } else {
              clickTargetRef.current = null;
              setUserWaypoint(null);
              if (destMarkerMeshRef.current) destMarkerMeshRef.current.visible = false;
              movementModeRef.current = 'manual';
              setMovementMode('manual');
        investigationCallbackRef.current?.(false);
            }
          }
        } else if (activeMode === 'manual') {
          const keys = keysRef.current;
          const isMoving = keys.forward || keys.backward || keys.left || keys.right;

          if (isMoving) {
            const speed = keys.sprint ? 1.35 : WALKING_SPEED;
            const moveDist = speed * delta;
            const yaw = anglesRef.current.yaw;

            const forwardX = -Math.sin(yaw);
            const forwardZ = -Math.cos(yaw);
            const rightX = Math.cos(yaw);
            const rightZ = -Math.sin(yaw);

            let dx = 0;
            let dz = 0;
            if (keys.forward) {
              dx += forwardX;
              dz += forwardZ;
            }
            if (keys.backward) {
              dx -= forwardX;
              dz -= forwardZ;
            }
            if (keys.left) {
              dx -= rightX;
              dz -= rightZ;
            }
            if (keys.right) {
              dx += rightX;
              dz += rightZ;
            }

            const len = Math.hypot(dx, dz);
            if (len > 0.0001) {
              const next = {
                x: camera.position.x + (dx / len) * moveDist,
                z: camera.position.z + (dz / len) * moveDist,
              }
              if (!isNavigationSegmentCovered(camera.position, next)) {
                stopAtCoverageBoundary();
              } else {
                camera.position.x = next.x;
                camera.position.z = next.z;
              }
            }
          }

          const groundH = getRelativeElevation(camera.position.x, camera.position.z);
          const targetY = groundH + EYE_HEIGHT;
          camera.position.y += (targetY - camera.position.y) * 0.25;
        }
      }

      currentPosRef.current.x = camera.position.x;
      currentPosRef.current.z = camera.position.z;
      latestPoseRef.current = {
        x: camera.position.x,
        z: camera.position.z,
        yaw: anglesRef.current.yaw,
        pitch: anglesRef.current.pitch,
        routeDist: routeDistRef.current,
        nextWpIndex: targetWpIndexRef.current,
        routeId: activeRouteId,
        sessionId: walkSessionId,
        movementMode: movementModeRef.current,
      };
      if (Math.hypot(
        camera.position.x - lastEstimatePositionRef.current.x,
        camera.position.z - lastEstimatePositionRef.current.z,
      ) >= 20) {
        const nextEstimatePosition = { x: camera.position.x, z: camera.position.z };
        lastEstimatePositionRef.current = nextEstimatePosition;
        estimatePositionRef.current = nextEstimatePosition;
        setEstimatePosition(nextEstimatePosition);
        onSavePoseRef.current?.(latestPoseRef.current);
      }

      renderer.render(scene, camera);

      // Throttled UI & Guidance updates (~8 times per second)
      const now = performance.now();
      if (now - lastUiUpdate > 125) {
        lastUiUpdate = now;
        setDisplayPose({
          x: camera.position.x,
          z: camera.position.z,
          yaw: anglesRef.current.yaw,
          pitch: anglesRef.current.pitch,
        });

        const curX = camera.position.x;
        const curZ = camera.position.z;
        const curYaw = anglesRef.current.yaw;

        // 1. Precise Polyline Segment Deviation & Actionable Recovery
        const closestResult = polylineRef.current.findClosestPoint(curX, curZ);
        const deviationDist = closestResult.distance;
        const nearestRoutePt = closestResult.point;

        // Hysteresis: enters off-route at > 7.0m, exits at <= 4.5m
        if (!isOffRouteRef.current && deviationDist > 7.0) {
          isOffRouteRef.current = true;
        } else if (isOffRouteRef.current && deviationDist <= 4.5) {
          isOffRouteRef.current = false;
        }

        const isOff = isOffRouteRef.current;
        const roundedDev = Math.round(deviationDist);

        if (isOff) {
          // Actionable Rejoin Direction
          const rdx = nearestRoutePt.x - curX;
          const rdz = nearestRoutePt.z - curZ;
          const targetBearing = Math.atan2(-rdx, -rdz);
          const relativeAngle = normalizeAngle(targetBearing - curYaw);
          const relativeDeg = Math.round(relativeAngle * (180 / Math.PI));
          const turnAngle = Math.abs(relativeDeg);

          let rejoinText = '';
          let turnDir: OffRouteStatus['turnDirection'] = 'straight';

          if (turnAngle <= 18) {
            rejoinText = `Ahead to rejoin route · ${roundedDev} m`;
            turnDir = 'straight';
          } else if (relativeDeg > 18 && relativeDeg <= 135) {
            rejoinText = `Turn right ${turnAngle}° · ${roundedDev} m to route`;
            turnDir = 'turn-right';
          } else if (relativeDeg < -18 && relativeDeg >= -135) {
            rejoinText = `Turn left ${turnAngle}° · ${roundedDev} m to route`;
            turnDir = 'turn-left';
          } else {
            rejoinText = `Turn around ${turnAngle}° · ${roundedDev} m to route`;
            turnDir = 'turn-around';
          }

          setOffRouteStatus({
            isOffRoute: true,
            distance: roundedDev,
            closestPoint: nearestRoutePt,
            rejoinInstruction: rejoinText,
            turnDirection: turnDir,
          });
        } else {
          setOffRouteStatus({
            isOffRoute: false,
            distance: roundedDev,
            closestPoint: nearestRoutePt,
            rejoinInstruction: 'On route',
            turnDirection: 'straight',
          });
        }

        // 2. Active Target Waypoint & Destination
        const totalWps = activeWaypoints.length;
        const targetIdx = Math.min(targetWpIndexRef.current, totalWps - 1);
        const curTargetWp = activeWaypoints[targetIdx] || activeWaypoints[totalWps - 1];
        const destWp = activeWaypoints[totalWps - 1];

        const distToWp = Math.hypot(curX - curTargetWp.x, curZ - curTargetWp.z);
        const distToDest = Math.hypot(curX - destWp.x, curZ - destWp.z);

        // Advance waypoint if within 4.5m
        if (distToWp <= 4.5 && targetIdx < totalWps - 1) {
          targetWpIndexRef.current = targetIdx + 1;
          setCurrentWpIndex(targetIdx + 1);
        }

        // Arrival detection: within 4.5m of Destination
        if (hasReachedDestination(polylineRef.current.getRemainingDistanceAlongPolyline(curX,curZ), distToDest)) {
          if (journeyStateRef.current !== 'arrive') {
            movementModeRef.current = 'paused';
            setMovementMode('paused');
            targetWpIndexRef.current = activeWaypoints.length - 1;
            setCurrentWpIndex(activeWaypoints.length - 1);
            setScreenEdgeIndicator(previous => ({...previous,visible:false}));
            journeyStateRef.current = 'arrive';
            onChangeJourneyStateRef.current?.('arrive');
          }
        }

        // 3. Dynamic Directional Guidance & Remaining Distance along exact polyline
        const activeTarget = targetIdx < totalWps - 1 ? curTargetWp : destWp;
        const activeDist = Math.round(targetIdx < totalWps - 1 ? distToWp : distToDest);
        const dirGuidance = calculateDynamicGuidance(
          { x: curX, z: curZ },
          curYaw,
          { x: activeTarget.x, z: activeTarget.z },
          activeTarget.name,
          activeDist,
        );
        setGuidance(dirGuidance);
        setDistToNext(Math.round(distToWp));

        // Remaining distance along the exact polyline segments
        const remainingAlongPolyline = polylineRef.current.getRemainingDistanceAlongPolyline(curX, curZ);
        setDistToDestination(Math.round(remainingAlongPolyline));

        // 4. Off-Screen Directional Arrow at screen edge
        const targetVec3 = new THREE.Vector3(
          curTargetWp.x,
          getRelativeElevation(curTargetWp.x, curTargetWp.z) + 1.2,
          curTargetWp.z,
        );
        const ndc = targetVec3.clone().project(camera);

        const isForward = ndc.z < 1.0;
        let ndcX = ndc.x;
        let ndcY = ndc.y;

        if (!isForward) {
          ndcX = -ndcX;
          ndcY = -ndcY;
          if (Math.abs(ndcX) < 0.001 && Math.abs(ndcY) < 0.001) ndcY = -1;
        }

        const isOffScreen = !isForward || Math.abs(ndcX) > 0.78 || Math.abs(ndcY) > 0.72;

        if (isOffScreen && journeyStateRef.current !== 'arrive') {
          const angleRad = Math.atan2(ndcY, ndcX);
          const angleDeg = (angleRad * 180) / Math.PI;

          // Clamp to screen edge margins
          const cos = Math.cos(angleRad);
          const sin = Math.sin(angleRad);
          const margin = 0.42; // Normalized margin from center
          const scaleFactor = Math.min(
            margin / (Math.abs(cos) || 0.001),
            margin / (Math.abs(sin) || 0.001),
          );

          const edgeX = 50 + cos * scaleFactor * 100;
          const edgeY = 50 - sin * scaleFactor * 100;

          setScreenEdgeIndicator({
            visible: true,
            x: Math.max(6, Math.min(94, edgeX)),
            y: Math.max(14, Math.min(86, edgeY)),
            angleDeg: -angleDeg + 90,
            label: curTargetWp.label,
            distance: Math.round(distToWp),
          });
        } else {
          setScreenEdgeIndicator((prev) => (prev.visible ? { ...prev, visible: false } : prev));
        }

      }
    };

    animate();

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      dom.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);

      // Save current pose to parent
      onSavePoseRef.current?.(latestPoseRef.current);

      terrainGeo.dispose();
      terrainMat.dispose();
      imageryTexture.dispose();
      routeGeo.dispose();
      routeMat.dispose();
      destMarkerGeo.dispose();
      destMarkerMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [clearMovementKeys, hasValidPlannedRoute, isDemoMode, is3DPreview, activePoints, activeWaypoints, startX, startZ, getRelativeElevation, activeRouteId, walkSessionId]);

  useEffect(() => {
    if (is3DPreview || (!hasValidPlannedRoute && !isDemoMode)) return;

    let frameId = 0;
    let previousFrame = 0;
    let lastUiUpdate = 0;
    const stopAtCoverageBoundary = () => {
      clearMovementKeys();
      movementModeRef.current = 'paused';
      setMovementMode('paused');
      setCoverageMessage('End of available terrain data. Choose a point inside the mapped area.');
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isVisibleRef.current || isAnyModalActiveRef.current || simulationPausedRef.current) return;
      if (event.target instanceof HTMLElement && event.target.matches('input, textarea, select, button, [contenteditable="true"]')) return;
      const movementKeys: Record<string, keyof typeof keysRef.current> = {
        KeyW: 'forward',
        ArrowUp: 'forward',
        KeyS: 'backward',
        ArrowDown: 'backward',
        KeyA: 'left',
        ArrowLeft: 'left',
        KeyD: 'right',
        ArrowRight: 'right',
        ShiftLeft: 'sprint',
        ShiftRight: 'sprint',
      };
      const key = movementKeys[event.code];
      if (!key) return;
      event.preventDefault();
      keysRef.current[key] = true;
      if (key !== 'sprint') {
        movementModeRef.current = 'manual';
        setMovementMode('manual');
        investigationCallbackRef.current?.(false);
        clickTargetRef.current = null;
        setUserWaypoint(null);
        approachTargetRef.current = null;
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const movementKeys: Record<string, keyof typeof keysRef.current> = {
        KeyW: 'forward',
        ArrowUp: 'forward',
        KeyS: 'backward',
        ArrowDown: 'backward',
        KeyA: 'left',
        ArrowLeft: 'left',
        KeyD: 'right',
        ArrowRight: 'right',
        ShiftLeft: 'sprint',
        ShiftRight: 'sprint',
      };
      const key = movementKeys[event.code];
      if (key) keysRef.current[key] = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const animate2D = (now: number) => {
      frameId = requestAnimationFrame(animate2D);
      const delta = previousFrame
        ? Math.min((now - previousFrame) / 1000, 0.05) * simulationSpeedMultiplierRef.current
        : 0;
      previousFrame = now;
      const position = currentPosRef.current;

      if (!isAnyModalActiveRef.current && !simulationPausedRef.current) {
        const mode = movementModeRef.current;
        let target: { x: number; z: number } | null = null;

        if (mode === 'following' && approachTargetRef.current) {
          target = {
            x: approachTargetRef.current.targetX,
            z: approachTargetRef.current.targetZ,
          };
        } else if (mode === 'following') {
          const previousDistance = routeDistRef.current;
          const nextDistance = Math.min(totalRouteLengthRef.current, previousDistance + WALKING_SPEED * delta);
          const sample = polylineRef.current.getPointAtDistance(nextDistance);
          if (!isNavigationSegmentCovered(position, sample)) {
            routeDistRef.current = previousDistance;
            stopAtCoverageBoundary();
          } else {
            routeDistRef.current = nextDistance;
            position.x = sample.x;
            position.z = sample.z;
            const lookAhead = polylineRef.current.getPointAtDistance(
              Math.min(totalRouteLengthRef.current, nextDistance + 2.5),
            );
            const dx = lookAhead.x - sample.x || sample.tangent.x;
            const dz = lookAhead.z - sample.z || sample.tangent.z;
            anglesRef.current.yaw = Math.atan2(-dx, -dz);
          }
          if (routeDistRef.current >= totalRouteLengthRef.current - 0.1) {
            movementModeRef.current = 'paused';
            setMovementMode('paused');
          }
        } else if (mode === 'clickToWalk') {
          target = clickTargetRef.current;
        } else if (mode === 'manual') {
          const keys = keysRef.current;
          const forwardX = -Math.sin(anglesRef.current.yaw);
          const forwardZ = -Math.cos(anglesRef.current.yaw);
          const rightX = Math.cos(anglesRef.current.yaw);
          const rightZ = -Math.sin(anglesRef.current.yaw);
          let dx = (keys.forward ? forwardX : 0) - (keys.backward ? forwardX : 0);
          let dz = (keys.forward ? forwardZ : 0) - (keys.backward ? forwardZ : 0);
          dx += (keys.right ? rightX : 0) - (keys.left ? rightX : 0);
          dz += (keys.right ? rightZ : 0) - (keys.left ? rightZ : 0);
          const length = Math.hypot(dx, dz);
          if (length > 0.0001) {
            const speed = keys.sprint ? 1.35 : 1;
            const next = {
              x: position.x + (dx / length) * WALKING_SPEED * speed * delta,
              z: position.z + (dz / length) * WALKING_SPEED * speed * delta,
            };
            if (!isNavigationSegmentCovered(position, next)) stopAtCoverageBoundary();
            else {
              position.x = next.x;
              position.z = next.z;
            }
          }
        }

        if (target) {
          const dx = target.x - position.x;
          const dz = target.z - position.z;
          const distance = Math.hypot(dx, dz);
          if (distance > 0.35) {
            const step = Math.min(distance, WALKING_SPEED * delta);
            const next = { x: position.x + (dx / distance) * step, z: position.z + (dz / distance) * step };
            if (!isNavigationSegmentCovered(position, next)) stopAtCoverageBoundary();
            else {
              position.x = next.x;
              position.z = next.z;
              const targetYaw = Math.atan2(-dx, -dz);
              let difference = targetYaw - anglesRef.current.yaw;
              while (difference > Math.PI) difference -= Math.PI * 2;
              while (difference < -Math.PI) difference += Math.PI * 2;
              anglesRef.current.yaw += difference * (1 - Math.exp(-3 * delta));
            }
          } else if (mode === 'following' && approachTargetRef.current) {
            routeDistRef.current = approachTargetRef.current.targetDist;
            approachTargetRef.current = null;
          } else {
            clickTargetRef.current = null;
            setUserWaypoint(null);
            movementModeRef.current = 'manual';
            setMovementMode('manual');
        investigationCallbackRef.current?.(false);
          }
        }
      }

      latestPoseRef.current = {
        ...latestPoseRef.current,
        x: position.x,
        z: position.z,
        yaw: anglesRef.current.yaw,
        pitch: anglesRef.current.pitch,
        routeDist: routeDistRef.current,
        nextWpIndex: targetWpIndexRef.current,
        routeId: activeRouteId,
        sessionId: walkSessionId,
        movementMode: movementModeRef.current,
      };

      if (Math.hypot(position.x - lastEstimatePositionRef.current.x, position.z - lastEstimatePositionRef.current.z) >= 20) {
        const nextEstimatePosition = { x: position.x, z: position.z };
        lastEstimatePositionRef.current = nextEstimatePosition;
        estimatePositionRef.current = nextEstimatePosition;
        setEstimatePosition(nextEstimatePosition);
        onSavePoseRef.current?.(latestPoseRef.current);
      }

      if (now - lastUiUpdate >= 125) {
        lastUiUpdate = now;
        setDisplayPose({ x: position.x, z: position.z, yaw: anglesRef.current.yaw, pitch: anglesRef.current.pitch });
        const closest = polylineRef.current.findClosestPoint(position.x, position.z);
        const destination = activeWaypoints[activeWaypoints.length - 1];
        const targetWaypoint = activeWaypoints[Math.min(targetWpIndexRef.current, activeWaypoints.length - 1)] || destination;
        if (targetWaypoint && destination) {
          const destinationDistance = Math.round(polylineRef.current.getRemainingDistanceAlongPolyline(position.x, position.z));
          const targetDistance = Math.round(Math.hypot(position.x - targetWaypoint.x, position.z - targetWaypoint.z));
          if(targetDistance <= 4.5 && targetWpIndexRef.current < activeWaypoints.length - 1) {
            targetWpIndexRef.current++;setCurrentWpIndex(targetWpIndexRef.current);
          }
          setDistToDestination(destinationDistance);
          setDistToNext(targetDistance);
          setGuidance(calculateDynamicGuidance(position, anglesRef.current.yaw, targetWaypoint, targetWaypoint.name, targetDistance));
          if (hasReachedDestination(polylineRef.current.getRemainingDistanceAlongPolyline(position.x,position.z), Math.hypot(position.x-destination.x,position.z-destination.z)) && journeyStateRef.current !== 'arrive') {
            movementModeRef.current = 'paused';
            setMovementMode('paused');
            targetWpIndexRef.current = activeWaypoints.length - 1;
            setCurrentWpIndex(activeWaypoints.length - 1);
            setScreenEdgeIndicator(previous => ({...previous,visible:false}));
            journeyStateRef.current = 'arrive';
            onChangeJourneyStateRef.current?.('arrive');
          }
        }
        const deviation = closest.distance;
        if (!isOffRouteRef.current && deviation > 7) isOffRouteRef.current = true;
        else if (isOffRouteRef.current && deviation <= 4.5) isOffRouteRef.current = false;
        setOffRouteStatus((previous) => ({
          ...previous,
          isOffRoute: isOffRouteRef.current,
          distance: Math.round(deviation),
          closestPoint: closest.point,
        }));
      }
    };

    frameId = requestAnimationFrame(animate2D);
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      clearMovementKeys();
      onSavePoseRef.current?.(latestPoseRef.current);
    };
  }, [activeRouteId, activeWaypoints, clearMovementKeys, hasValidPlannedRoute, is3DPreview, isDemoMode, totalRouteLengthRef, walkSessionId]);

  // Checkpoint movement independently of map/UI renders and stop investigations.
  useEffect(() => {
    if(!missionActive) return;
    const timer = setInterval(() => {
      latestPoseRef.current = {...latestPoseRef.current, movementMode:movementModeRef.current};
      onSavePoseRef.current?.(latestPoseRef.current);
    }, 1000);
    return () => clearInterval(timer);
  }, [missionActive]);

  // Route control handlers
  const handleFollowRoute = (e?: React.MouseEvent) => {
    if(journeyStateRef.current === 'arrive') return;
    investigationCallbackRef.current?.(false);
    if(simulationPaused) onResumeSimulation?.();
    setCoverageMessage(null);
    (e?.currentTarget as HTMLElement | undefined)?.blur?.();
    mountRef.current?.focus();

    if (clickTargetRef.current) {
      clickTargetRef.current = null;
      setUserWaypoint(null);
      if (destMarkerMeshRef.current) destMarkerMeshRef.current.visible = false;
    }

    const cx = currentPosRef.current.x;
    const cz = currentPosRef.current.z;
    const closest = polylineRef.current.findClosestPoint(cx, cz);

    if (closest.distance > 0.4) {
      approachTargetRef.current = {
        targetX: closest.point.x,
        targetZ: closest.point.z,
        targetDist: closest.cumulativeDistance,
      };
    } else {
      approachTargetRef.current = null;
      routeDistRef.current = closest.cumulativeDistance;
    }

    movementModeRef.current = 'following';
    setMovementMode('following');
  };

  const handlePauseRoute = (e?: React.MouseEvent) => {
    (e?.currentTarget as HTMLElement | undefined)?.blur?.();
    clearMovementKeys();
    mountRef.current?.focus();
    movementModeRef.current = 'paused';
    setMovementMode('paused');
    latestPoseRef.current = {...latestPoseRef.current,movementMode:'paused'};
    onSavePoseRef.current?.(latestPoseRef.current);
  };

  const pauseForPanel = () => {
    clearMovementKeys();
    if (document.pointerLockElement) document.exitPointerLock();
    movementModeRef.current = 'paused';
    setMovementMode('paused');
    const position = { x: currentPosRef.current.x, z: currentPosRef.current.z };
    estimatePositionRef.current = position;
    lastEstimatePositionRef.current = position;
    setEstimatePosition(position);
    onSavePoseRef.current?.(latestPoseRef.current);
  };

  const handleContinueWalking = () => {
    if (audioRecording) {setRecordError('Stop recording before continuing.');return;}
    movementModeRef.current = resumeWalkMode(journeyStateRef.current === 'arrive');
    setMovementMode(movementModeRef.current);
    if(journeyStateRef.current !== 'arrive') handleFollowRoute();
    setIsRecordPanelOpen(false);
    setReplyMessageId(null);
    clearMovementKeys();
    mountRef.current?.focus();
  };

  const handleChooseMapWaypoint = (point: { x: number; z: number }) => {
    const coverage = validateTraverseSegment(
      currentPosRef.current,
      point,
      DEFAULT_ROUTER_CONFIG.maxAllowableSlopeDeg,
      4,
    );
    if (!coverage.valid) {
      setCoverageMessage(
        coverage.reason?.includes('coverage')
          ? 'End of available terrain data. Choose a point inside the mapped area.'
          : coverage.reason || 'A safe traverse to that point is unavailable.',
      );
      return;
    }

    setCoverageMessage(null);
    clickTargetRef.current = point;
    setUserWaypoint(point);
    approachTargetRef.current = null;
    movementModeRef.current = 'clickToWalk';
    setMovementMode('clickToWalk');
    investigationCallbackRef.current?.(false);
  };

  const handleOpenRecordPanel = () => {
    investigationCallbackRef.current?.(true);
    pauseForPanel();
    movementModeRef.current = 'investigating';
    setMovementMode('investigating');
    if (!recordDraft.trim() && !recordImage && !recordAudio) {
      recordLocationRef.current = {
        x: currentPosRef.current.x,
        z: currentPosRef.current.z,
        routeDist: routeDistRef.current,
      };
      activityStartedAtSimTimeRef.current = crewOperations?.stops.find(s=>s.ended===null)?.started ?? simTime;
    }
    setRecordError(null);
    setSavedWalkObservation(null);
    setIsQuestionComposerOpen(false);
    setWalkQuestion('');
    setQuestionError(null);
    setIsRecordPanelOpen(true);
  };

  const handleSaveWalkObservation = async () => {
    if ((!recordDraft.trim() && !recordImage && !recordAudio) || audioRecording) {
      setRecordError(audioRecording ? 'Stop recording before saving.' : 'Add a note, photo or audio recording.');
      return;
    }
    if (!onSaveObservation) {
      setRecordError('Observation storage is unavailable. Your draft is retained; try again when storage is ready.');
      return;
    }

    const position = recordLocationRef.current || {
      x: currentPosRef.current.x,
      z: currentPosRef.current.z,
      routeDist: routeDistRef.current,
    };
    const taskApplies = Boolean(activeTaskId && !activeTaskSiteId);
    const observationId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? `obs-${crypto.randomUUID()}`
      : `obs-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const observation: ObservationRecord = {
      id: observationId,
      siteId: 'walk-route',
      siteName: 'Along your route',
      targetName: 'Simulated walk position',
      location: {
        x: position.x,
        z: position.z,
        description: `MARSWalk simulated position along the route. Route progress: ${position.routeDist.toFixed(1)} m.`,
        coordinateReference: 'MARSWalk Jezero local Cartesian frame (x/z metres; simulated, not a rover coordinate).',
      },
      locationStatus: 'unverified',
      audioRef: recordAudio || undefined,
      imageRef: recordImage || '',
      imageCaption: recordImage ? `Explorer attachment: ${recordImageName}` : '',
      imageIsArchival: false,
      imageSource: recordImage ? 'Explorer-provided attachment' : '',
      note: recordDraft.trim(),
      question: null,
      timestamp: new Date().toISOString(),
      createdAtSimTime: simTime,
      missionElapsedSeconds,
      activityDurationSeconds: Math.max(0, simTime - (crewOperations?.stops.find(s=>s.ended===null)?.started ?? activityStartedAtSimTimeRef.current ?? simTime)),
      taskId: taskApplies ? activeTaskId : null,
      planVersion: currentPlanVersion,
      editHistory: [],
    };

    setIsSavingRecord(true);
    setRecordError(null);
    try {
      await onSaveObservation(observation);
      await sendEarthStatus('Observation recorded', observation);
      setSavedWalkObservation(observation);
      setRecordDraft('');
      setRecordImage(null);
      setRecordImageName('');
      setRecordAudio('');
      activityStartedAtSimTimeRef.current = null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Failed to save walk observation:', error);
      setRecordError(`Could not save this note: ${message}. Your draft is retained; retry when ready.`);
    } finally {
      setIsSavingRecord(false);
    }
  };

  const handleRecordImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setRecordError('Choose an image file to attach.');
      event.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setRecordError('Images must be 5 MB or smaller.');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        setRecordError('The selected image could not be read.');
        return;
      }
      setRecordImage(reader.result);
      setRecordImageName(file.name);
      setRecordError(null);
    };
    reader.onerror = () => {
      setRecordError('The selected image could not be read.');
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleSendWalkQuestion = async () => {
    if (!savedWalkObservation || !walkQuestion.trim() || !onSendQuestion) return;
    const existingMessage = messages.find((message) => message.observationId === savedWalkObservation.id);
    if (existingMessage) {
      setQuestionError('A question has already been sent for this observation.');
      return;
    }

    setIsSendingQuestion(true);
    setQuestionError(null);
    try {
      await onSendQuestion(savedWalkObservation, walkQuestion.trim());
      setSavedWalkObservation({ ...savedWalkObservation, question: walkQuestion.trim() });
      setIsQuestionComposerOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Failed to send Earth team question:', error);
      setQuestionError(`Could not send the question: ${message}. Your question is retained; retry when ready.`);
    } finally {
      setIsSendingQuestion(false);
    }
  };

  const handleOpenReply = (message: CommMessage) => {
    pauseForPanel();
    setSeenReplyIds((previous) => new Set(previous).add(message.id));
    setReplyMessageId(message.id);
  };

  const handleDismissRecordPanel = () => {
    if (audioRecording) {setRecordError('Stop recording before closing.');return;}
    setIsRecordPanelOpen(false);
    setIsQuestionComposerOpen(false);
    if (!recordDraft.trim() && !recordImage && !recordAudio && !savedWalkObservation) {
      activityStartedAtSimTimeRef.current = null;
      recordLocationRef.current = null;
    }
    mountRef.current?.focus();
  };

  const pendingReplies = messages
    .filter((message) =>
      message.replyText &&
      message.replyDeliveredAtSimTime !== undefined &&
      simTime >= message.replyDeliveredAtSimTime &&
      !seenReplyIds.has(message.id),
    )
    .sort((a, b) => (b.replyDeliveredAtSimTime || 0) - (a.replyDeliveredAtSimTime || 0));
  const replyNotice = pendingReplies[0];
  const activeReplyMessage = messages.find((message) => message.id === replyMessageId) || null;
  const activeReplyObservation = activeReplyMessage
    ? activeReplyMessage.observationSnapshot
      || observations.find((observation) => observation.id === activeReplyMessage.observationId)
      || null
    : null;
  const existingQuestionForSavedObservation = savedWalkObservation
    ? messages.find((message) => message.observationId === savedWalkObservation.id) || null
    : null;
  const savedMessageStage = existingQuestionForSavedObservation
    ? getCommunicationStage(existingQuestionForSavedObservation, simTime)
    : null;
  const crewReport = crewOperations ? operationsReport(crewOperations,simTime) : null;
  const actualStopMinutes = stopStartedAtSimTime === null
    ? 0
    : Math.max(0, (simTime - stopStartedAtSimTime) / 60);
  const remainingObservationMinutes = Math.max(0, plannedObservationMinutes - actualStopMinutes);
  const currentReturnMinutes = liveRoutes.directReturn?.estimatedTimeMinutes ?? null;
  const missionTiming = calculateMissionTiming(
    missionBudgetMinutes,
    missionElapsedSeconds,
    currentReturnMinutes,
    reserveMinutes,
  );
  const isReturnRoute = Boolean(
    routeEndpoints.base &&
    routeEndpoints.destination &&
    Math.hypot(
      routeEndpoints.base.x - routeEndpoints.destination.x,
      routeEndpoints.base.z - routeEndpoints.destination.z,
    ) < 1,
  );
  const atPlannedDestination = Boolean(
    !isReturnRoute &&
    routeEndpoints.destination &&
    Math.hypot(
      estimatePosition.x - routeEndpoints.destination.x,
      estimatePosition.z - routeEndpoints.destination.z,
    ) < 2,
  );
  const remainingItineraryTravelMinutes = isReturnRoute
    ? liveRoutes.directReturn?.estimatedTimeMinutes ?? null
    : atPlannedDestination
      ? 0
      : liveRoutes.remainingTravel?.estimatedTimeMinutes ?? null;
  const itineraryMinutes = calculateItineraryMinutes(
    remainingItineraryTravelMinutes,
    isReturnRoute ? 0 : remainingObservationMinutes,
    isReturnRoute ? 0 : liveRoutes.finalReturn?.estimatedTimeMinutes ?? null,
    reserveMinutes,
  );
  const itineraryOverrunMinutes = itineraryMinutes === null
    ? null
    : Math.ceil(itineraryMinutes - missionTiming.remainingMinutes);
  const replyWindow = calculateReplyWindow(missionTiming.availableStopMinutes, oneWayDelayMinutes);
  const cannotReceiveReplyBeforeDeparture = replyWindow.arrivesBeforeReturnDeparture === false;
  const returnShortfallMinutes = missionTiming.availableStopMinutes === null
    ? null
    : Math.ceil(Math.max(0, -missionTiming.availableStopMinutes));

  const adjustPlannedObservation = () => {
    if (shortenedObservationMinutes !== null && onSetPlannedObservationMinutes) {
      onSetPlannedObservationMinutes(shortenedObservationMinutes);
      setShortenedObservationMinutes(null);
    }
  };

  const beginReturnJourney = () => {
    if (!liveRoutes.directReturn?.success || !onStartReturnRoute) return;
    const points = liveRoutes.directReturn.points;
    const start = points[0];
    const next = points[1] || start;
    const pose: SurfacePose = {
      x: start.x,
      z: start.z,
      yaw: Math.atan2(-(next.x - start.x), -(next.z - start.z)),
      pitch: anglesRef.current.pitch,
      routeDist: 0,
      nextWpIndex: 1,
      routeId: `return-${walkSessionId}-${Math.floor(simTime)}`,
      sessionId: walkSessionId,
    };
    setIsReturnReviewOpen(false);
    onStartReturnRoute(liveRoutes.directReturn, pose);
    movementModeRef.current = 'following';
    setMovementMode('following');
  };

  // ---------------------------------------------------------------------------
  // STATE: "Plan route" if selected area has no valid route or elevation coverage
  // ---------------------------------------------------------------------------
  if (!hasValidPlannedRoute && !isDemoMode) {
    return (
      <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#d86a33] p-6 text-white text-center select-none font-sans">
        <div className="max-w-md w-full space-y-4 rounded-2xl border border-white/10 bg-[#262320] p-6 shadow-2xl backdrop-blur-md">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15 text-amber-400">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-white tracking-tight">
            Plan a route to begin
          </h2>
          <p className="text-xs text-neutral-400 leading-relaxed">
            Choose your starting point and destination on the local map. Walking is available only within supported terrain.
          </p>
          <div className="pt-2 flex flex-col sm:flex-row gap-2.5 justify-center">
            {onBackToMap && (
              <button
                onClick={onBackToMap}
                className="rounded-xl bg-[#d86a33] px-5 py-2.5 text-xs font-semibold text-white shadow-md hover:bg-[#bd5726] transition cursor-pointer"
              >
                Plan route
              </button>
            )}

          </div>
        </div>
      </div>
    );
  }

  const currentWp = activeWaypoints[currentWpIndex] || activeWaypoints[1] || activeWaypoints[0];

  return (
    <div
      ref={mountRef}
      tabIndex={0}
      className="absolute inset-0 z-30 bg-[#F5F5F3] select-none overflow-hidden font-sans outline-none"
    >
      <div className="walk-viewport absolute inset-x-0 top-0">
        {is3DPreview ? (
          <div ref={sceneMountRef} className="absolute inset-0 overflow-hidden bg-[#313732]" />
        ) : hasValidPlannedRoute || isDemoMode ? (
          <JezeroWalkMap
            position={displayPose}
            routePoints={activePoints}
            destination={activePoints[activePoints.length - 1] || { x: 0, z: 0 }}
            userWaypoint={userWaypoint}
            routeDescription={isRoutePlanned ? 'Blue line: planned route' : 'Blue line: illustrative user-waypoint route'}
            onChooseWaypoint={handleChooseMapWaypoint}
          />
        ) : null}
        {is3DPreview && (
          <p className="pointer-events-none absolute bottom-3 left-3 rounded-[6px] border border-white/25 bg-[#202321]/90 px-3 py-2 text-[13px] text-white">
            3D terrain preview · orbital-data reconstruction, not a ground-level photograph
          </p>
        )}
      </div>
      {coverageMessage && (
        <div role="alert" className="pointer-events-auto absolute inset-x-3 bottom-40 z-[60] flex justify-center">
          <div className="flex max-w-xl items-center gap-3 border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-[14px] text-[var(--text-primary)]">
            <AlertTriangle aria-hidden="true" className="h-5 w-5 shrink-0" />
            <p>{coverageMessage}</p>
            <button
              type="button"
              onClick={() => setCoverageMessage(null)}
              aria-label="Dismiss terrain coverage message"
              className="ml-auto min-h-9 min-w-9 shrink-0 rounded-[6px] text-[var(--text-secondary)] hover:bg-[var(--surface)] focus-visible:outline"
            >
              <X aria-hidden="true" className="mx-auto h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      {/* 
        TOP FLOATING NAVIGATION CUE: STRONGEST VISUAL EMPHASIS
      */}
      <div className="pointer-events-none absolute inset-x-0 top-3 sm:top-5 z-40 flex flex-col items-center gap-3 px-3">
        {journeyState === 'arrive' ? (
          /* Arrival State Banner */
          <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-[#1b1714]/95 p-2 pr-4 text-white shadow-2xl backdrop-blur-xl">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
              <span className="text-lg font-bold">✓</span>
            </div>
            <div className="text-left text-xs">
              <div className="font-bold text-white text-sm">
              Route destination reached
              </div>
              <div className="text-[11px] text-neutral-400">
              {isReturnRoute ? 'Back at base. Finish the walk when ready.' : 'Stop here to investigate, then review your return route.'}
              </div>
            </div>
          </div>
        ) : movementMode === 'investigating' || (movementMode === 'paused' && !simulationPaused) ? (
          <div className="walk-stop-banner"><strong>{movementMode === 'investigating' ? 'Stopped to investigate' : 'Walking stopped'}</strong><span>Mission time and Earth messages continue. Resume the route when ready.</span></div>
        ) : offRouteStatus.isOffRoute ? (
          /* ACTIONABLE RECOVERY: Turn direction and distance to route */
          <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-amber-500/40 bg-[#1b1714]/95 px-4 py-2.5 sm:px-5 sm:py-3 text-white shadow-2xl backdrop-blur-xl">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
              {offRouteStatus.turnDirection === 'turn-left' || offRouteStatus.turnDirection === 'bear-left' ? (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 19V11a4 4 0 0 0-4-4H5" />
                  <path d="m9 3-4 4 4 4" />
                </svg>
              ) : offRouteStatus.turnDirection === 'turn-right' || offRouteStatus.turnDirection === 'bear-right' ? (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 19V11a4 4 0 0 1 4-4h10" />
                  <path d="m15 3 4 4-4 4" />
                </svg>
              ) : offRouteStatus.turnDirection === 'turn-around' ? (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 10h6a4 4 0 0 1 0 8H7" />
                  <path d="M11 6 7 10l4 4" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V5" />
                  <path d="m5 12 7-7 7 7" />
                </svg>
              )}
            </div>
            <div className="text-left">
              <div className="text-sm sm:text-base font-bold text-amber-800">
                {offRouteStatus.rejoinInstruction}
              </div>
              <div className="text-[11px] text-neutral-400 mt-0.5">
                Off planned path · {distToDestination} m to destination
              </div>
            </div>
          </div>
        ) : (
          /* Priority Navigation Cue */
          <div className="pointer-events-auto flex items-center gap-3 sm:gap-4 rounded-2xl border border-white/15 bg-[#1b1714]/95 px-4 py-2.5 sm:px-5 sm:py-3 text-white shadow-2xl backdrop-blur-xl">
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white">
              {guidance.turnDirection === 'bear-left' || guidance.turnDirection === 'turn-left' ? (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 19V11a4 4 0 0 0-4-4H5" />
                  <path d="m9 3-4 4 4 4" />
                </svg>
              ) : guidance.turnDirection === 'bear-right' || guidance.turnDirection === 'turn-right' ? (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 19V11a4 4 0 0 1 4-4h10" />
                  <path d="m15 3 4 4-4 4" />
                </svg>
              ) : guidance.turnDirection === 'turn-around' ? (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 10h6a4 4 0 0 1 0 8H7" />
                  <path d="M11 6 7 10l4 4" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V5" />
                  <path d="m5 12 7-7 7 7" />
                </svg>
              )}
            </div>

            <div className="text-left">
              <div className="text-sm sm:text-base font-bold tracking-tight text-white flex items-center gap-1.5 sm:gap-2">
                <span>
                  {guidance.turnDirection === 'bear-right'
                    ? 'Bear right'
                    : guidance.turnDirection === 'turn-right'
                    ? 'Turn right'
                    : guidance.turnDirection === 'bear-left'
                    ? 'Bear left'
                    : guidance.turnDirection === 'turn-left'
                    ? 'Turn left'
                    : guidance.turnDirection === 'turn-around'
                    ? 'Turn around'
                    : 'Continue straight'}
                </span>
                <span className="text-neutral-500 font-normal">·</span>
                <span className="font-mono text-[#38bdf8]">{distToNext} m</span>
              </div>
              <div className="text-[11px] text-neutral-400 mt-0.5 flex items-center gap-2">
                <span className="truncate max-w-[130px] sm:max-w-[180px]">{currentWp.name}</span>
                <span className="text-neutral-500">·</span>
                <span className="font-mono text-neutral-400">{distToDestination} m to destination</span>
              </div>
            </div>
          </div>
        )}
      {missionActive && crewOperations && onChangeCrewOperations && <CrewOperationsPanel state={crewOperations} now={simTime} onChange={onChangeCrewOperations} arrived={journeyState==='arrive' && !plannedRoute?.id?.startsWith('return-')}/> }
      {missionActive && crewOperations && currentReturnMinutes!==null && operationsReport(crewOperations,simTime).oxygenMinutes < currentReturnMinutes + crewOperations.oxygenReserveMinutes && <p className="ops-stop ops-exceeded pointer-events-auto" role="alert">O₂ estimate below return + reserve requirement</p>}
      {missionActive && (
        <section
          aria-label="Mission time status"
          aria-live="polite"
          className="pointer-events-auto w-full max-w-xl border border-white/15 bg-[#1b1714]/95 px-3 py-2.5 text-white backdrop-blur-xl sm:px-4"
        >
          <div className="grid grid-cols-3 gap-x-2 gap-y-1 text-[13px] sm:text-[14px]">
            <p><span className="text-neutral-300">Mission:</span> <strong>{Math.floor(missionTiming.remainingMinutes)} min</strong></p>
            <p>
              <span className="text-neutral-300">Return:</span>{' '}
              <strong>
                {liveRoutes.state === 'updating'
                  ? 'Updating…'
                  : currentReturnMinutes === null
                    ? 'Return time unavailable'
                    : `${currentReturnMinutes} min`}
              </strong>
            </p>
            <p><span className="text-neutral-300">Reserve:</span> <strong>{reserveMinutes} min</strong></p>
          </div>
          <p className="mt-1 text-[13px] text-neutral-300">
            {missionTiming.availableStopMinutes === null
              ? 'Stop-time allowance unavailable until a return route is confirmed.'
              : missionTiming.availableStopMinutes > 0
                ? `${Math.floor(missionTiming.availableStopMinutes)} min available for stops`
                : 'No stop time remains before the planned reserve.'}
          </p>
          <details className="mt-1 text-[12px] text-neutral-300">
            <summary className="min-h-7 w-fit cursor-pointer underline underline-offset-2">Details</summary>
            <div className="space-y-1 pb-1 leading-4">
              <p>These are model estimates, not a safety guarantee. Return routes use the measured terrain grid, a {plannedRoute?.assumedSpeedMps ?? DEFAULT_ROUTER_CONFIG.assumedBaseSpeedMps} m/s nominal walking-speed assumption and a {plannedRoute?.maxAllowableSlopeDeg ?? DEFAULT_ROUTER_CONFIG.maxAllowableSlopeDeg}° incline limit.</p>
              <p>The itinerary includes remaining travel to the selected stop, its unspent planned observation time, return travel, and protected reserve. Actual elapsed time is counted by the mission clock only once; recording a note does not complete a task.</p>
              <p>Communication timing assumes immediate Earth review and immediate link availability. Transmission size and link outages are not modelled. Simulation runs at 1×; no accelerated mode is enabled.</p>
            </div>
          </details>

          {itineraryOverrunMinutes !== null && itineraryOverrunMinutes > 0 && (
            <div role="status" className="mt-2 border-t border-white/15 pt-2 text-[13px]">
              <p className="font-semibold">
                Your remaining plan exceeds the time budget by {itineraryOverrunMinutes} min.
              </p>
              <div className="mt-1 flex flex-wrap gap-2">
                {remainingObservationMinutes > 0 && onSetPlannedObservationMinutes && (
                  shortenedObservationMinutes === null ? (
                    <button
                      type="button"
                      onClick={() => setShortenedObservationMinutes(
                        Math.max(actualStopMinutes, plannedObservationMinutes - Math.min(5, remainingObservationMinutes)),
                      )}
                      className="min-h-9 rounded border border-white/25 px-2.5 underline"
                    >
                      Preview shorter observation
                    </button>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <span>
                        Preview: {Math.ceil(plannedObservationMinutes - shortenedObservationMinutes)} min less planned stop time.
                      </span>
                      <button type="button" onClick={adjustPlannedObservation} className="min-h-9 rounded bg-white px-2.5 font-semibold text-[#202321]">
                        Apply change
                      </button>
                      <button type="button" onClick={() => setShortenedObservationMinutes(null)} className="min-h-9 rounded border border-white/25 px-2.5 underline">
                        Cancel
                      </button>
                    </div>
                  )
                )}
                <button
                  type="button"
                  onClick={() => {
                    pauseForPanel();
                    setIsReturnReviewOpen(true);
                  }}
                  className="min-h-9 rounded border border-white/25 px-2.5 underline"
                >
                  Review return route
                </button>
              </div>
            </div>
          )}

          {missionTiming.availableStopMinutes !== null && missionTiming.availableStopMinutes <= 0 && (
            <div role="status" className="mt-2 border-t border-white/15 pt-2 text-[13px]">
              <p className="font-semibold">
                {returnShortfallMinutes
                  ? `Returning now is estimated to exceed your planned reserve by ${returnShortfallMinutes} min.`
                  : 'Start return to preserve your planned reserve.'}
              </p>
              <button
                type="button"
                onClick={() => {
                  pauseForPanel();
                  setIsReturnReviewOpen(true);
                }}
                className="mt-1 min-h-9 rounded border border-white/25 px-2.5 underline"
              >
                Review return route
              </button>
            </div>
          )}
        </section>
      )}
      </div>

      {/* 
        SCREEN-EDGE DIRECTIONAL ARROW (when next waypoint is outside camera view)
      */}
      {screenEdgeIndicator.visible && (
        <div
          className="pointer-events-none fixed z-40 -translate-x-1/2 -translate-y-1/2"
          style={{
            left: `${screenEdgeIndicator.x}%`,
            top: `${screenEdgeIndicator.y}%`,
          }}
        >
          <div className="flex items-center gap-1.5 rounded-full border border-teal-700/50 bg-[#1b1714]/95 px-2.5 py-1 text-white shadow-xl backdrop-blur-md text-[11px]">
            <div
              style={{
                transform: `rotate(${screenEdgeIndicator.angleDeg}deg)`,
                display: 'inline-block',
              }}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-teal-700">
                <path d="M12 19V5" />
                <path d="m5 12 7-7 7 7" />
              </svg>
            </div>
            <span className="font-bold">{screenEdgeIndicator.label}</span>
            <span className="text-neutral-500">·</span>
            <span className="font-mono text-teal-800">{screenEdgeIndicator.distance} m</span>
          </div>
        </div>
      )}

      {/* Walk-only reference data stays outside the primary navigation controls. */}
      <div className="pointer-events-none absolute top-3 sm:top-5 right-3 sm:right-6 z-40">
        <div className="flex flex-col items-end gap-1.5">
          <details className="pointer-events-auto relative">
            <summary
              aria-label="Walk information and technical settings"
              className="flex min-h-10 cursor-pointer list-none items-center gap-1.5 rounded-xl border border-white/15 bg-[#1b1714]/90 px-3 py-1.5 text-xs font-medium text-neutral-300 backdrop-blur-md"
            >
              <MoreHorizontal className="h-4 w-4" />
              <span>Walk info</span>
            </summary>
            <div className="absolute right-0 mt-1 w-56 rounded-xl border border-white/10 bg-[#1b1714]/95 p-3 text-[13px] text-neutral-300 shadow-2xl backdrop-blur-md">
              <div className="mb-2 flex justify-between border-b border-white/10 pb-2 font-semibold text-white">
                <span>Temperature</span>
                <span className="text-[12px] font-normal text-neutral-400">Unavailable</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-neutral-400">Air temp:</span>
                <span className="font-mono text-white">— °C</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-neutral-400">Ground temp:</span>
                <span className="font-mono text-white">— °C</span>
              </div>
              <div className="pt-2 text-[12px] text-neutral-500">
                No verified local reading. Source details in Sources & Coverage.
              </div>
              {onOpenSources && (
                <div className="mt-2 border-t border-white/10 pt-2">
                  <button
                    onClick={onOpenSources}
                    className="flex min-h-10 items-center gap-2 text-teal-700 hover:underline"
                  >
                    <span>Sources & Coverage</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          </details>

          {replyNotice && (
            <button
              type="button"
              onClick={() => handleOpenReply(replyNotice)}
              className="pointer-events-auto flex min-h-10 items-center gap-2 rounded-xl border border-white/15 bg-white px-3 py-2 text-left text-[13px] font-semibold text-[#202321]"
            >
              <MessageSquare aria-hidden="true" className="h-4 w-4 text-[#147D72]" />
              Reply received · Open reply
            </button>
          )}
        </div>
      </div>

      <div className="walk-toolbar">
        <div className="walk-progress"><strong>{journeyState === 'arrive' ? (isReturnRoute ? 'Back at base' : 'At destination') : movementMode === 'investigating' ? 'Investigating' : simulationPaused ? 'Simulation paused' : movementMode === 'following' ? 'Walking route' : 'Stopped'}</strong><span>{simulationPaused ? 'Simulation clock and messages paused' : journeyState === 'arrive' ? 'Mission time continues while you investigate' : `${distToDestination} m remaining`}</span></div>
        <div className="walk-actions">
          {journeyState !== 'arrive' && <button type="button" className="walk-primary" onClick={movementMode === 'following' && !simulationPaused ? handleOpenRecordPanel : () => handleFollowRoute()}>{movementMode === 'following' && !simulationPaused ? 'Stop & investigate' : 'Walk route automatically'}</button>}
          {(journeyState === 'arrive' || movementMode !== 'following' || simulationPaused) && <button type="button" className={journeyState === 'arrive' ? 'walk-primary' : ''} onClick={handleOpenRecordPanel}>Record observation</button>}
          {journeyState === 'arrive' && !isReturnRoute && <button type="button" onClick={() => {pauseForPanel();setIsReturnReviewOpen(true);}}>Review return route</button>}
          <button type="button" aria-pressed={is3DPreview} onClick={() => setIs3DPreview(preview => !preview)}>{is3DPreview ? 'Show 2D map' : 'Show 3D terrain'}</button>
          <button type="button" className="walk-end" onClick={() => {handlePauseRoute();onEndMission?.();onBackToMap?.();}}>End walk</button>
        </div>
        {statusUpdateError && <p role="alert" className="walk-error">Earth report not queued: {statusUpdateError}</p>}
      </div>

      {isRecordPanelOpen && (
        <div
          className="pointer-events-auto absolute inset-0 z-[70] flex justify-end bg-black/40"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) handleDismissRecordPanel();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="walk-observation-title"
            className="flex h-full w-full max-w-[440px] flex-col overflow-y-auto border-l border-[var(--border)] bg-[var(--panel)] text-[var(--text-primary)]"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="flex items-start justify-between gap-4 border-b border-[var(--border)] p-5">
              <div>
                <h2 id="walk-observation-title" className="text-lg font-semibold">New observation</h2>
                <p className="mt-1 text-[15px] font-medium">
                  {journeyState==='arrive'?destinationLabel:'En-route observation'}
                </p>

              </div>
              <button
                type="button"
                onClick={handleDismissRecordPanel}
                aria-label="Close observation panel; keep draft"
                className="min-h-10 min-w-10 rounded border border-[var(--border)] text-lg"
              >
                <X aria-hidden="true" className="mx-auto h-4 w-4" />
              </button>
            </header>

            {crewReport?.stop && <div className={`ops-stop ops-${crewReport.stop.level} shrink-0`}><strong>Stop {duration(crewReport.stop.elapsedSeconds)} / {crewReport.stop.limitMinutes} min</strong><span role={crewReport.stop.level==='exceeded'?'alert':undefined}>{crewReport.stop.level==='exceeded'?'Limit exceeded':simulationPaused?'Clock paused':'Timer running'}</span></div>}
            <div className="shrink-0 flex flex-wrap gap-3 px-5 py-2 text-sm"><span>Mission {Math.floor(missionTiming.remainingMinutes)} min</span><span>O₂ {crewReport ? Math.floor(crewReport.oxygenMinutes) : '—'} min · simulated</span></div>
            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              <details className="text-[13px] leading-5 text-[var(--text-secondary)]"><summary>Location details</summary>
                <div>
                  Position: x {recordLocationRef.current?.x.toFixed(1) ?? '—'} m, z {recordLocationRef.current?.z.toFixed(1) ?? '—'} m
                </div>
                <div>MARSWalk Jezero local Cartesian frame · simulated</div>
                <div>Route progress: {recordLocationRef.current?.routeDist.toFixed(1) ?? '—'} m</div>
              </details>

              {storageBootstrapError && (
                <p role="alert" className="border-l-2 border-[var(--status-error)] pl-3 text-[14px] text-[var(--status-error)]">
                  {storageBootstrapError}
                </p>
              )}

              {savedWalkObservation ? (
                <div role="status" className="space-y-4">
                  <p className="text-[14px] font-medium text-[var(--status-success)]">
                    Saved to My notes.
                  </p>
                  {existingQuestionForSavedObservation ? (
                    <div className="border-t border-[var(--border)] pt-4 text-[14px]">
                      <p className="font-medium">Question sent to Earth.</p>
                      <p className="mt-1 text-[var(--text-secondary)]">
                        {savedMessageStage === 'reply_received'
                          ? 'Reply received.'
                          : savedMessageStage === 'reply_in_transit'
                            ? 'Reply in transit to Mars.'
                            : savedMessageStage === 'delivered_to_earth'
                              ? 'Delivered to Earth; awaiting a response.'
                              : 'In transit to Earth.'}
                      </p>
                      {existingQuestionForSavedObservation.earliestPossibleReplyAtSimTime !== undefined && !existingQuestionForSavedObservation.replyText && (
                        <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
                          Earliest possible reply: {Math.ceil(Math.max(0, (existingQuestionForSavedObservation.earliestPossibleReplyAtSimTime - simTime) / 60))} min from now. Assumes immediate Earth response.
                        </p>
                      )}
                    </div>
                  ) : isQuestionComposerOpen ? (
                    <div className="space-y-3 border-t border-[var(--border)] pt-4">
                      <label htmlFor="walk-earth-question" className="block text-[14px] font-medium">
                        Question for Earth team
                      </label>
                      <textarea
                        id="walk-earth-question"
                        value={walkQuestion}
                        onChange={(event) => setWalkQuestion(event.target.value)}
                        rows={3}
                        maxLength={500}
                        placeholder="What would you like the science team to advise?"
                        className="w-full rounded-[6px] border border-[#AEB4AD] bg-white p-3 text-[15px] text-[#202321] placeholder:text-[#626862] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#252A26]"
                        style={{ backgroundColor: '#FFFFFF', color: '#202321', caretColor: '#202321' }}
                      />
                      <p className="text-[13px] text-[var(--text-secondary)]">
                        {oneWayDelayMinutes} min one-way delay. The saved observation, simulated location, attachment, and plan version will be linked.
                      </p>
                      <p className="text-[13px] text-[var(--text-secondary)]">
                        Earliest possible reply: {replyWindow.earliestReplyMinutes} min after sending. Assumes immediate Earth response.
                      </p>
                      {replyWindow.arrivesBeforeReturnDeparture === null ? (
                        <p role="status" className="border-l-2 border-[var(--border)] pl-3 text-[14px]">
                          Return time unavailable; reply timing cannot be compared with the planned return departure.
                        </p>
                      ) : cannotReceiveReplyBeforeDeparture ? (
                        <div role="status" className="space-y-2 border-l-2 border-[var(--status-warning)] pl-3 text-[14px]">
                          <p>A reply cannot arrive before your planned return departure.</p>
                          <p className="text-[13px]">You can send this note for later review or continue the current task. Do not wait beyond the return time for a reply.</p>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={handleSendWalkQuestion}
                              disabled={!walkQuestion.trim() || isSendingQuestion}
                              className="min-h-10 rounded-[6px] bg-[var(--button-primary)] px-3 font-semibold text-[var(--button-primary-text)] disabled:opacity-50"
                            >
                              Send for later review
                            </button>
                            <button
                              type="button"
                              onClick={handleContinueWalking}
                              className="min-h-10 rounded-[6px] border border-[var(--border)] px-3 font-medium"
                            >
                              Continue current task
                            </button>
                          </div>
                        </div>
                      ) : null}
                      {questionError && <p role="alert" className="text-[14px] text-[var(--status-error)]">{questionError}</p>}
                      {replyWindow.arrivesBeforeReturnDeparture !== false && (
                        <button
                          type="button"
                          onClick={handleSendWalkQuestion}
                          disabled={!walkQuestion.trim() || isSendingQuestion}
                          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[6px] bg-[var(--button-primary)] px-4 font-semibold text-[var(--button-primary-text)] disabled:opacity-50"
                        >
                          <Send aria-hidden="true" className="h-4 w-4" />
                          {isSendingQuestion ? 'Sending…' : 'Send question'}
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsQuestionComposerOpen(true)}
                      className="flex min-h-11 items-center gap-2 rounded-[6px] border border-[var(--border)] px-4 text-[14px] font-medium"
                    >
                      <MessageSquare aria-hidden="true" className="h-4 w-4" />
                      Ask Earth team
                    </button>
                  )}
                  {questionError && !isQuestionComposerOpen && (
                    <p role="alert" className="text-[14px] text-[var(--status-error)]">{questionError}</p>
                  )}
                  <button
                    type="button"
                    onClick={handleContinueWalking}
                    className="min-h-11 w-full rounded-[6px] bg-[var(--button-primary)] px-4 font-semibold text-[var(--button-primary-text)]"
                  >
                    {journeyState === 'arrive' ? 'Finish observation · stay here' : 'Resume route'}
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <label htmlFor="walk-observation-note" className="mb-2 block text-[15px] font-semibold">
                      What did you notice?
                    </label>
                    <textarea
                      ref={recordTextareaRef}
                      id="walk-observation-note"
                      value={recordDraft}
                      onChange={(event) => setRecordDraft(event.target.value)}
                      rows={5}
                      maxLength={2000}
                      placeholder="Record what you observed along the route..."
                      className="w-full rounded-[6px] border border-[#AEB4AD] bg-white p-3 text-[15px] text-[#202321] placeholder:text-[#626862] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#252A26]"
                      style={{ backgroundColor: '#FFFFFF', color: '#202321', caretColor: '#202321' }}
                    />
                    <p className="mt-1 text-right text-[13px] text-[var(--text-secondary)]">
                      {recordDraft.length} / 2000
                    </p>
                  </div>

                  <div>
                    <label htmlFor="walk-observation-image" className="flex min-h-11 cursor-pointer items-center gap-2 text-[14px] font-medium">
                      <ImagePlus aria-hidden="true" className="h-4 w-4" />
                      Take or attach photo
                    </label>
                    <input
                      id="walk-observation-image"
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleRecordImageChange}
                      className="sr-only"
                    />
                    {recordImage && (
                      <div className="mt-2 flex items-center gap-3">
                        <img src={recordImage} alt={`Selected attachment ${recordImageName}`} className="h-16 w-16 rounded border border-[var(--border)] object-cover" />
                        <div className="min-w-0 flex-1 text-[13px]">
                          <div className="truncate">{recordImageName}</div>
                          <div className="text-[var(--text-secondary)]">Explorer attachment · not a verified surface photograph</div>
                        </div>
                        <button type="button" onClick={() => { setRecordImage(null); setRecordImageName(''); }} className="min-h-10 px-2 text-[13px] underline">
                          Remove
                        </button>
                      </div>
                    )}
                  </div>

                  {recordError && <p role="alert" className="text-[14px] text-[var(--status-error)]">{recordError}</p>}
                  <p className="text-[13px] text-[var(--text-secondary)]">
                    Your draft stays here. Resume the route when ready.
                  </p>
                  <p className="text-[13px] text-[var(--text-secondary)]">
                    Mission time continues while you record; saved note time is counted once.
                  </p>
                  <AudioAttachment active={isVisible} value={recordAudio} onChange={setRecordAudio} onRecordingChange={setAudioRecording}/>
                  <button
                    type="button"
                    onClick={handleSaveWalkObservation}
                    disabled={(!recordDraft.trim() && !recordImage && !recordAudio) || audioRecording || isSavingRecord}
                    className="min-h-11 w-full rounded-[6px] bg-[var(--button-primary)] px-4 font-semibold text-[var(--button-primary-text)] disabled:bg-[#E5E7E3] disabled:text-[#626862] disabled:opacity-100"
                  >
                    {isSavingRecord ? 'Saving…' : 'Save observation'}
                  </button>
                  <button
                    type="button"
                    onClick={handleContinueWalking}
                    className="min-h-11 w-full rounded-[6px] border border-[var(--border)] px-4 font-medium"
                  >
                    {journeyState === 'arrive' ? 'Finish observation · stay here' : 'Resume route'}
                  </button>
                </>
              )}
            </div>
          </section>
        </div>
      )}

      {isReturnReviewOpen && (
        <div className="pointer-events-auto absolute inset-0 z-[70] flex justify-end bg-black/40">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="return-review-title"
            className="flex h-full w-full max-w-[440px] flex-col overflow-y-auto border-l border-[var(--border)] bg-[var(--panel)] text-[var(--text-primary)]"
          >
            <header className="flex items-start justify-between gap-4 border-b border-[var(--border)] p-5">
              <div>
                <h2 id="return-review-title" className="text-lg font-semibold">Review return route</h2>
                <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
                  Current position to {routeEndpoints.base?.name || 'selected base'} · simulated route
                </p>
              </div>
              <button type="button" onClick={() => setIsReturnReviewOpen(false)} aria-label="Close return review; remain stopped" className="min-h-10 min-w-10 rounded border border-[var(--border)]">
                <X aria-hidden="true" className="mx-auto h-4 w-4" />
              </button>
            </header>
            <div className="flex-1 space-y-4 p-5 text-[14px] leading-5">
              {liveRoutes.state === 'updating' ? (
                <p role="status">Updating return estimate…</p>
              ) : liveRoutes.directReturn ? (
                <>
                  <p>{liveRoutes.directReturn.totalDistanceMeters} m · about {liveRoutes.directReturn.estimatedTimeMinutes} min by the selected terrain route.</p>
                  <p className="text-[13px] text-[var(--text-secondary)]">{liveRoutes.directReturn.explanation}</p>
                  {missionTiming.availableStopMinutes !== null && missionTiming.availableStopMinutes <= 0 && (
                    <p className="border-l-2 border-[var(--status-warning)] pl-3">
                      Returning now is estimated to exceed your planned reserve by {returnShortfallMinutes || 0} min. This estimate is advisory, not a safety guarantee.
                    </p>
                  )}
                  <p className="text-[13px] text-[var(--text-secondary)]">
                    Starting this route replaces the active route with a route back to the selected base. Your notes and messages remain saved.
                  </p>
                </>
              ) : (
                <p role="status">Return time unavailable. The current position may be outside covered or passable terrain; no time allowance can be calculated.</p>
              )}
            </div>
            <footer className="space-y-2 border-t border-[var(--border)] p-5">
              <button
                type="button"
                disabled={!liveRoutes.directReturn || !onStartReturnRoute}
                onClick={beginReturnJourney}
                className="min-h-11 w-full rounded-[6px] bg-[var(--button-primary)] px-4 font-semibold text-[var(--button-primary-text)] disabled:opacity-50"
              >
                Start return to base
              </button>
              <button type="button" onClick={() => setIsReturnReviewOpen(false)} className="min-h-11 w-full rounded-[6px] border border-[var(--border)] px-4 font-medium">
                Keep current route
              </button>
            </footer>
          </section>
        </div>
      )}

      {activeReplyMessage && (
        <div className="pointer-events-auto absolute inset-0 z-[70] flex justify-end bg-black/40">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="walk-reply-title"
            className="flex h-full w-full max-w-[440px] flex-col overflow-y-auto border-l border-[var(--border)] bg-[var(--panel)] text-[var(--text-primary)]"
          >
            <header className="flex items-start justify-between gap-4 border-b border-[var(--border)] p-5">
              <div>
                <h2 id="walk-reply-title" ref={replyHeadingRef} tabIndex={-1} className="text-lg font-semibold">Earth team reply</h2>
                <p className="mt-1 text-[14px] text-[var(--text-secondary)]">
                  {activeReplyObservation?.siteName || activeReplyMessage.siteName} · Observation {activeReplyMessage.observationId.slice(-6)}
                </p>
              </div>
              <button type="button" onClick={() => setReplyMessageId(null)} aria-label="Close reply; remain paused" className="min-h-10 min-w-10 rounded border border-[var(--border)]">
                <X aria-hidden="true" className="mx-auto h-4 w-4" />
              </button>
            </header>
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <section className="space-y-2 border-b border-[var(--border)] pb-4">
                <h3 className="text-[14px] font-semibold">Your observation</h3>
                {activeReplyObservation ? (
                  <>
                    <p className="text-[14px] leading-5">{activeReplyObservation.note}</p>
                    <p className="text-[13px] text-[var(--text-secondary)]">
                      {activeReplyObservation.location.description || 'Location description unavailable.'} · Plan v{activeReplyObservation.planVersion}
                    </p>
                    {activeReplyObservation.imageRef && (
                      <img src={activeReplyObservation.imageRef} alt={activeReplyObservation.imageCaption || 'Observation attachment'} className="max-h-48 rounded border border-[var(--border)] object-contain" />
                    )}
                  </>
                ) : (
                  <p className="text-[14px] text-[var(--text-secondary)]">The linked observation is unavailable in the current record set.</p>
                )}
                <p className="text-[14px] italic">Question: “{activeReplyMessage.questionText}”</p>
              </section>
              <section className="space-y-2">
                <h3 className="text-[14px] font-semibold">Reply from {activeReplyMessage.scienceTeamAuthor || 'Earth Science Team'}</h3>
                <p className="whitespace-pre-wrap text-[15px] leading-6">{activeReplyMessage.replyText}</p>
              </section>
              {activeReplyMessage.originalPlanVersion !== currentPlanVersion && (
                <p className="border-l-2 border-[var(--status-warning)] pl-3 text-[14px] leading-5 text-[var(--status-warning)]">
                  The reply refers to Plan v{activeReplyMessage.originalPlanVersion} ({activeReplyMessage.originalPlanSummary}); the current Mars plan is v{currentPlanVersion} ({currentPlanSummary}). Review the current route and time budget before acting. Advice has not changed your plan.
                </p>
              )}
            </div>
            <footer className="border-t border-[var(--border)] p-5">
              <button type="button" onClick={handleContinueWalking} className="min-h-11 w-full rounded-[6px] bg-[var(--button-primary)] px-4 font-semibold text-[var(--button-primary-text)]">
                {journeyState === 'arrive' ? 'Close reply · stay here' : 'Resume route'}
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
