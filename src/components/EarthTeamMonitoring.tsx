import EarthFirstPerson from './EarthFirstPerson';
import SurfaceReadout from './SurfaceReadout';
import SuitMonitor from './SuitMonitor';
import PlanComparison from './PlanComparison';
import AdvicePreview from './AdvicePreview';
import {adviceFromReport} from '@/lib/adviceTiming';
import RegionalMap from './RegionalMap';
import type {RoutePlanSummary} from '@/lib/routePlanner';
import { OperationsReceived } from './CrewOperationsPanel';
import { cropMetersToLonLat } from '@/lib/jezeroHiRISE';
import { useMemo, useState } from 'react';
import { Compass, Send } from 'lucide-react';
import type { CommMessage, MissionStatusSnapshot } from '@/lib/storage';
import { formatSimLMST, sendReplyFromScienceTeam } from '@/lib/commManager';
import {
  getDeliveredMissionActivity,
  getDeliveredUplinkMessages,
  getLatestMissionActivity,
  getReplayActivity,
  isReportOverdue,
} from '@/lib/earthMonitoring';
import {
  CROP_HALF_HEIGHT_METERS,
  CROP_HALF_WIDTH_METERS,
  JEZERO_HIRISE_CROP,
} from '@/lib/jezeroHiRISE';
import { getImageNoDataCells } from '@/lib/jezeroCoverage';
import type { UserRole } from './Header';

interface EarthTeamMonitoringProps {
  plannedRoute?:RoutePlanSummary|null;
  messages: CommMessage[];
  statusUpdateIntervalSeconds: number;
  simTime: number;
  simulationPaused: boolean;
  missionActive: boolean;
  oneWayDelayMinutes: number;
  simulationSpeedMultiplier: number;
  missionName: string;
  missionId: string;
  isLocalOnly: boolean;
  onChangeRole: (role: UserRole) => void;
  onToggleSimulation: () => void;
  onSetOneWayDelayMinutes: (minutes: number) => void;
  onSetSimulationSpeedMultiplier: (multiplier: number) => void;
  onAdvanceSimTime: (seconds: number) => void;
  onReloadMessages: () => Promise<void>;
  onHealthReplay?: (memberId: string | null) => void;
}

function getPacketTime(message: CommMessage): number {
  return message.statusSnapshot?.capturedAtSimTime ??
    message.statusCreatedAtSimTime ??
    message.sentAtSimTime;
}

function getSequence(message: CommMessage): number {
  return message.statusSnapshot?.sequenceNumber ?? 0;
}

function formatAge(seconds: number): string {
  const age = Math.max(0, Math.floor(seconds));
  if (age < 60) return `${age} sec`;
  return `${Math.floor(age / 60)} min`;
}

function EarthMissionMap({
  status,
  history,
  highlightedPosition,
  waitingText,
  onOpen,
}: {
  onOpen?:()=>void;
  waitingText: string;
  status: MissionStatusSnapshot | null;
  history: CommMessage[];
  highlightedPosition: { x: number; z: number } | null;
}) {
  const [zoom, setZoom] = useState(1);
  const coverageGaps = useMemo(() => getImageNoDataCells(), []);
  const width = 900;
  const height = 560;
  const fitScale = Math.min(
    width / JEZERO_HIRISE_CROP.widthMeters,
    height / JEZERO_HIRISE_CROP.heightMeters,
  ) * 0.94;
  const scale = fitScale * zoom;
  const center = status?.position ?? status?.base ?? { x: 0, z: 0 };
  const screenPoint = (x: number, z: number) => ({
    x: width / 2 + (x - center.x) * scale,
    y: height / 2 + (z - center.z) * scale,
  });
  const imageTopLeft = screenPoint(-CROP_HALF_WIDTH_METERS, -CROP_HALF_HEIGHT_METERS);
  const imageWidth = JEZERO_HIRISE_CROP.widthMeters * scale;
  const imageHeight = JEZERO_HIRISE_CROP.heightMeters * scale;
  const basePoint = status?.base ? screenPoint(status.base.x, status.base.z) : null;
  const positionPoint = status ? screenPoint(status.position.x, status.position.z) : null;
  const highlightPoint = highlightedPosition
    ? screenPoint(highlightedPosition.x, highlightedPosition.z)
    : null;
  const completedPoints = history
    .map((message) => message.statusSnapshot)
    .filter((snapshot): snapshot is MissionStatusSnapshot => Boolean(snapshot?.position))
    .map((snapshot) => screenPoint(snapshot.position.x, snapshot.position.z));
  const completedPath = completedPoints.map(({ x, y }) => `${x},${y}`).join(' ');
  const plannedPoints = (status?.plannedRoutePoints ?? []).map(({ x, z }) => screenPoint(x, z));
  const plannedPath = plannedPoints.map(({ x, y }) => `${x},${y}`).join(' ');
  const destinationPoint = plannedPoints[plannedPoints.length - 1];
  const outerPath = `M0,0 H${width} V${height} H0 Z M${imageTopLeft.x},${imageTopLeft.y} H${imageTopLeft.x + imageWidth} V${imageTopLeft.y + imageHeight} H${imageTopLeft.x} Z`;
  const scaleBarMeters = 100;

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-[#e6e5e0]">
      <svg
        onClick={onOpen}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label="Delayed Earth view of the latest received Mars position, route and mapped terrain coverage"
      >
        <defs>
          <pattern id="earth-coverage-nodata" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="7" height="7" fill="#404641" fillOpacity="0.35" />
            <path d="M0 0V7" stroke="#FFFFFF" strokeOpacity="0.75" strokeWidth="2" />
          </pattern>
        </defs>
        <path d={outerPath} fill="#777b75" fillOpacity="0.28" fillRule="evenodd" />
        <image
          href={JEZERO_HIRISE_CROP.assetUrl}
          x={imageTopLeft.x}
          y={imageTopLeft.y}
          width={imageWidth}
          height={imageHeight}
          preserveAspectRatio="none"
        />
        <rect
          x={imageTopLeft.x}
          y={imageTopLeft.y}
          width={imageWidth}
          height={imageHeight}
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="1.5"
          strokeDasharray="7 5"
        />
        {coverageGaps.map((cell, index) => {
          const point = screenPoint(cell.x, cell.z);
          return (
            <rect
              key={`${index}-${cell.x}-${cell.z}`}
              x={point.x}
              y={point.y}
              width={cell.size * scale}
              height={cell.size * scale}
              fill="url(#earth-coverage-nodata)"
            />
          );
        })}
        {completedPoints.length > 1 && (
          <polyline
            points={completedPath}
            fill="none"
            stroke="#126f6b"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {plannedPoints.length > 1 && (
          <polyline
            points={plannedPath}
            fill="none"
            stroke="#4a8f8b"
            strokeWidth="2.5"
            strokeDasharray="8 6"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {basePoint && (
          <g>
            <circle cx={basePoint.x} cy={basePoint.y} r="5" fill="#FFFFFF" stroke="#202321" strokeWidth="2" />
            <text x={basePoint.x + 9} y={basePoint.y + 16} fill="#FFFFFF" fontSize="13" fontWeight="700" paintOrder="stroke" stroke="#202321" strokeWidth="3">
              {status?.base?.name || 'Base · simulated'}
            </text>
          </g>
        )}
        {destinationPoint && (
          <g>
            <circle cx={destinationPoint.x} cy={destinationPoint.y} r="5.5" fill="#FFFFFF" stroke="#126f6b" strokeWidth="2" />
            <text x={destinationPoint.x + 8} y={destinationPoint.y - 8} fill="#FFFFFF" fontSize="13" fontWeight="700" paintOrder="stroke" stroke="#202321" strokeWidth="3">
              User waypoint
            </text>
          </g>
        )}
        {positionPoint && (
          <g transform={`translate(${positionPoint.x} ${positionPoint.y}) rotate(${-(status?.headingRadians ?? 0) * 180 / Math.PI})`}>
            <path d="M0 -12 L8 9 L0 5 L-8 9 Z" fill="#126f6b" stroke="#FFFFFF" strokeWidth="2" />
          </g>
        )}
        {highlightPoint && (
          <circle cx={highlightPoint.x} cy={highlightPoint.y} r="10" fill="none" stroke="#202321" strokeWidth="2" strokeDasharray="3 2" />
        )}
        <text
          x={imageTopLeft.x + 10}
          y={imageTopLeft.y + 22}
          fill="#FFFFFF"
          fontSize="14"
          fontWeight="700"
          paintOrder="stroke"
          stroke="#202321"
          strokeWidth="3"
        >
          Mapped terrain coverage
        </text>
      </svg>

      <div className="absolute left-3 top-3 flex flex-wrap gap-2">
        <div className="flex items-center gap-2 border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-[13px] text-[var(--text-primary)]">
          <span className="h-2.5 w-2.5 rotate-45 bg-[#126f6b]" />
          Latest received position
        </div>

      </div>

      <div className="absolute right-3 top-3 flex flex-col gap-1">
        <div className="flex flex-col border border-[var(--border)] bg-[var(--panel)] text-[var(--text-primary)]">
          <button type="button" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(5, value * 1.25))} className="h-9 w-9 text-lg hover:bg-[var(--surface)] focus-visible:outline">+</button>
          <div className="h-px bg-[var(--border)]" />
          <button type="button" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(0.5, value / 1.25))} className="h-9 w-9 text-lg hover:bg-[var(--surface)] focus-visible:outline">−</button>
        </div>
        <span className="border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-[12px] text-[var(--text-primary)]">
          <Compass aria-hidden="true" className="mr-1 inline h-4 w-4" />N ↑
        </span>
        <span className="border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-[12px] text-[var(--text-primary)]">
          {scaleBarMeters} m
          <span className="ml-2 inline-block h-1 border-x border-b border-[var(--text-primary)] align-middle" style={{ width: `${scaleBarMeters * scale}px` }} />
        </span>
      </div>

      <div className="absolute bottom-3 left-3 flex max-w-[17rem] flex-col gap-1 border border-[var(--border)] bg-[var(--panel)] p-2 text-[12px] text-[var(--text-primary)]">
        <span><span className="mr-2 inline-block w-6 border-t-2 border-[#126f6b]" />Received travelled path</span>
        <span><span className="mr-2 inline-block w-6 border-t-2 border-dashed border-[#4a8f8b]" />Last received planned route</span>
        <span><span className="mr-2 inline-block w-6 border-t border-dashed border-[#626862]" />Mapped terrain coverage</span>
      </div>

      {!status && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#f5f5f3]/70 p-6 text-center">
          <p className="max-w-sm border border-[var(--border)] bg-[var(--panel)] p-4 text-[14px] text-[var(--text-secondary)]">
            {waitingText}
          </p>
        </div>
      )}
    </div>
  );
}

export default function EarthTeamMonitoring({
  messages, statusUpdateIntervalSeconds, simTime, oneWayDelayMinutes, plannedRoute,
  missionName, missionId, onReloadMessages, simulationPaused, missionActive, onSetOneWayDelayMinutes,
  onHealthReplay, simulationSpeedMultiplier, onSetSimulationSpeedMultiplier,
}: EarthTeamMonitoringProps) {
  const [mainView,setMainView]=useState<'map'|'compare'>('map');
  const [focus,setFocus]=useState<'split'|'map'|'suit'>('split');
  const [trackingView,setTrackingView]=useState<'pov'|'map'>('pov');
  const openMap=()=>{setFocus('map');setTrackingView('pov');};
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [changeSuggestion, setChangeSuggestion] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  const deliveredMessages = useMemo(
    () => getDeliveredUplinkMessages(messages, simTime)
      .sort((a, b) => getSequence(b) - getSequence(a) || b.deliveredAtSimTime - a.deliveredAtSimTime),
    [messages, simTime],
  );
  const activityMessages = useMemo(
    () => getDeliveredMissionActivity(messages, simTime, missionId),
    [messages, missionId, simTime],
  );
  const latestStatusMessage = getLatestMissionActivity(activityMessages);
  const latestStatus = latestStatusMessage?.statusSnapshot ?? null;
  const replayMessage = selectedEventId
    ? activityMessages.find((message) => message.id === selectedEventId) ?? null
    : null;
  const viewedStatus = replayMessage?.statusSnapshot ?? latestStatus;
  const viewedHistory = getReplayActivity(activityMessages, replayMessage?.id ?? null);
  const selectableMessages = replayMessage
    ? deliveredMessages.filter((message) =>
        message.statusSnapshot?.missionId === missionId &&
        getSequence(message) <= getSequence(replayMessage),
      )
    : deliveredMessages;

  const waitingQuestions = selectableMessages.filter(
    (message) => message.kind === 'question' && !message.replyText,
  );
  const observationMessages = selectableMessages.filter(
    (message) => message.kind === 'observation_update' || message.kind === 'question',
  );
  const selectedMessage = selectableMessages.find((message) => message.id === selectedMessageId) ??
    waitingQuestions[0] ??
    observationMessages[0] ??
    null;
  const replyAdvice=adviceFromReport(selectedMessage?.statusSnapshot??latestStatus);
  const selectedObservation = selectedMessage?.observationSnapshot ?? null;
  const receivedPosition = selectedMessage?.statusSnapshot?.position ??
    (selectedObservation?.location.x !== undefined && selectedObservation.location.z !== undefined
      ? { x: selectedObservation.location.x, z: selectedObservation.location.z }
      : null);
  const statusToDisplay = replayMessage?.statusSnapshot ?? latestStatus;
  const displayedCaptureTime = statusToDisplay
    ? statusToDisplay.capturedAtSimTime ?? getPacketTime(replayMessage ?? latestStatusMessage!)
    : null;
  const displayedAgeSeconds = displayedCaptureTime === null ? null : Math.max(0, simTime - displayedCaptureTime);
  const isOverdue = !replayMessage && isReportOverdue(latestStatusMessage, simTime, statusUpdateIntervalSeconds);

  const selectMessage = (message: CommMessage) => {
    setSelectedMessageId(message.id);
    setReplyText('');
    setChangeSuggestion('');
    setReplyError(null);
  };

  const handleSendReply = async () => {
    if (!selectedMessage || selectedMessage.kind !== 'question' || !replyText.trim()) return;
    const finalReply = [
      changeSuggestion.trim() ? `Suggested plan change (requires explorer review): ${changeSuggestion.trim()}` : '',
      replyText.trim(),
    ].filter(Boolean).join('\n\n');
    setIsSending(true);
    setReplyError(null);
    try {
      await sendReplyFromScienceTeam({
        messageId: selectedMessage.id,
        replyText: finalReply,
        simTime,
        oneWayDelayMinutes,
        authorName: 'Earth Science Team',
        adviceContext:replyAdvice??undefined,
      });
      setReplyText('');
      setChangeSuggestion('');
      await onReloadMessages();
    } catch (error) {
      console.error('Failed to send Earth-team reply:', error);
      setReplyError(error instanceof Error ? error.message : 'Reply could not be saved.');
    } finally {
      setIsSending(false);
    }
  };

  const pendingReport = messages.filter(m => m.direction === 'uplink' && m.statusSnapshot?.missionId === missionId && m.deliveredAtSimTime > simTime).sort((a,b)=>a.deliveredAtSimTime-b.deliveredAtSimTime)[0];
  const waitingText = !missionActive && !pendingReport ? 'No active walk · send a mission plan.' : simulationPaused ? 'Mission paused · awaiting resume.' : pendingReport ? `First report in ${Math.ceil((pendingReport.deliveredAtSimTime-simTime)/60)} min.` : `Waiting for crew · ${oneWayDelayMinutes} min delay.`;
  const receivedGeo = viewedStatus ? cropMetersToLonLat(viewedStatus.position.x, viewedStatus.position.z) : null;
  const observationImage = selectedObservation?.imageRef;
  const observationImageLabel = selectedObservation?.imageIsArchival
    ? 'Archival image'
    : selectedObservation?.imageCaption?.toLowerCase().includes('simulation screenshot')
      ? 'Simulation screenshot'
      : 'Explorer attachment';

  if (!missionActive) return <div className="control-empty" role="status"><p>Mission control opens when the crew starts a walk.</p></div>;

  return (
    <div className="earth-workspace">
      <section className="earth-heading">
        <div><p className="eyebrow">EARTH / MISSION CONTROL</p><h1>{missionName}</h1></div>
        <p className="link-status"><span className={isOverdue&&!latestStatus?.operations?.completed ? 'status-dot warning' : 'status-dot'}/>{latestStatus?.operations?.completed?'Final report received':latestStatus ? (isOverdue ? 'Update overdue' : 'Reports arriving') : 'Waiting for Mars'} · {oneWayDelayMinutes===0?(simulationSpeedMultiplier>1?'Demo 5× · no delay':'1× · no delay'):`1× · ${oneWayDelayMinutes} min delay`}</p>
      </section>
      <div className="earth-columns">
        <section className="earth-map-panel" aria-label="Received mission position">
          <div className="workspace-view-tabs"><button aria-pressed={mainView==='map'} onClick={()=>setMainView('map')}>Monitor</button><button aria-pressed={mainView==='compare'} onClick={()=>setMainView('compare')}>Compare plans</button>{mainView==='map'&&focus!=='split'&&<button className="split-return" onClick={()=>setFocus('split')}>Split view</button>}</div>
          {mainView==='compare'?(viewedStatus?.comparison?<PlanComparison key={viewedStatus.missionId} input={viewedStatus.comparison} received/>:<div className="comparison-empty">Waiting for a planning report.</div>):<div className={`support-split focus-${focus}`}>
            <section className="support-map" aria-label="Crew route map" hidden={focus==='suit'}>
              <header><div><span className="eyebrow">SURFACE / TRACKING</span><h2>{focus==='map'&&trackingView==='pov'?'Crew perspective':'Surface position'}</h2></div>{focus==='split'?<button className="panel-expand" onClick={openMap}>Open 3D view</button>:<button className="panel-expand" onClick={()=>setTrackingView(v=>v==='pov'?'map':'pov')}>{trackingView==='pov'?'2D map':'3D POV'}</button>}</header>
              <div className="tracking-state"><span><i className="status-dot"/>{viewedStatus?.operations?.completed?'Mission ended':viewedStatus?.movementState??'Awaiting report'}</span><span>{displayedAgeSeconds===null?'—':`${formatAge(displayedAgeSeconds)} old`}{replayMessage?' · Past report':viewedStatus?.operations?.completed?' · Final report':oneWayDelayMinutes>0?' · Delayed':' · Live simulation'}</span></div>
              <div className="tracking-viewport" hidden={focus==='map'&&trackingView==='pov'}>
                {((viewedStatus?.mapMode==='regional'||(!viewedStatus&&plannedRoute?.mapMode==='regional'))?<div className="earth-regional"><RegionalMap onOpen={focus==='split'?openMap:undefined} modelled={Boolean((viewedStatus?.planSummary??(!viewedStatus?plannedRoute?.explanation:undefined))?.startsWith('Modelled DTM'))} points={viewedStatus?.plannedRoutePoints??plannedRoute?.points} position={viewedStatus?.position} heading={viewedStatus?.headingRadians??0} trail={viewedHistory.map(m=>m.statusSnapshot?.position).filter((p):p is {x:number;z:number}=>Boolean(p))} label={viewedStatus?.operations?.name??'Crew'}/></div>:<EarthMissionMap onOpen={focus==='split'?openMap:undefined} waitingText={waitingText} status={viewedStatus} history={viewedHistory} highlightedPosition={receivedPosition}/>)}
              </div>
              {focus==='map'&&trackingView==='pov'&&<div className="tracking-viewport pov-viewport"><EarthFirstPerson status={viewedStatus} paused={simulationPaused||Boolean(replayMessage)} onMap={()=>setTrackingView('map')}/><span className="pov-source">Reconstructed POV · {viewedStatus?.operations?.completed?'final report':oneWayDelayMinutes>0?'received reports':'live simulation'}</span></div>}
              {focus==='split'&&<footer className="tracking-footer"><span>{viewedStatus?.destinationName??plannedRoute?.destinationName??'Jezero crater'}</span><strong>{viewedStatus?`${Math.round(viewedStatus.progressPercent??0)}%`:'Awaiting crew'}</strong></footer>}
            </section>
            <div className="suit-panel-slot" hidden={focus==='map'}><SuitMonitor compact={focus!=='suit'} visible={focus!=='map'} onExpand={()=>setFocus('suit')} status={viewedStatus} history={viewedHistory.flatMap(m=>m.statusSnapshot?[m.statusSnapshot]:[])} now={simTime} paused={simulationPaused} onReplay={onHealthReplay} active={missionActive} replayingPast={Boolean(replayMessage)}/></div>
          </div>}



        </section>
        <aside className="earth-inbox compact-sidebar" aria-label="Mission details">
          <header className="sidebar-title"><span className="eyebrow">MISSION DETAILS</span><strong>{viewedStatus?.operations?.name??'Awaiting crew'}</strong></header>
          {viewedStatus?.operations&&viewedStatus.operations.oxygenMinutes<=viewedStatus.operations.oxygenReserveMinutes&&<p className="ops-alert" role="alert">O₂ reserve reached</p>}
          {viewedStatus?.operations?.stop?.level==='exceeded'&&<p className="ops-alert" role="alert">Stop limit exceeded</p>}
          <details className="sidebar-section" open><summary>Mission status <span>{viewedStatus?`${Math.round(viewedStatus.progressPercent??0)}%`:'—'}</span></summary>
          <div className="received-summary">
            <div><span>Last reported</span><strong>{viewedStatus?.movementState ?? 'No position yet'}</strong></div>
            <div><span>Information age</span><strong>{displayedAgeSeconds === null ? '—' : formatAge(displayedAgeSeconds)}</strong></div>
            <div><span>Time left at report</span><strong>{viewedStatus?.remainingMissionMinutes == null ? '—' : `${Math.round(viewedStatus.remainingMissionMinutes)} min`}</strong></div>
          </div>
          <div className="earth-progress"><span>Reported route progress</span><progress max={100} value={viewedStatus?.progressPercent??0}/><strong>{viewedStatus?`${Math.round(viewedStatus.progressPercent??0)}% · ${Math.round(viewedStatus.routeDistanceMeters??0)} / ${Math.round(viewedStatus.routeTotalMeters??0)} m`:'Awaiting telemetry'}</strong></div>
          </details>
          <SurfaceReadout position={viewedStatus?.position} regional={viewedStatus?.mapMode==='regional'} slopeLimit={viewedStatus?.slopeLimitDeg} reported/>
          <details className="sidebar-section"><summary>Tasks & stops <span>{viewedStatus?.operations?.routeTasks?.filter(t=>t.done&&t.selected!==false).length??0}/{viewedStatus?.operations?.routeTasks?.filter(t=>t.selected!==false).length??0}</span></summary><OperationsReceived compact report={viewedStatus?.operations} now={simTime} showTelemetry={mainView==='compare'}/></details>
          <details className="source-disclosure received-location"><summary>Location & time</summary><span>{viewedStatus?.operations?.name || 'Explorer 01'} · {receivedGeo ? `${receivedGeo.lat.toFixed(5)}° N, ${receivedGeo.lon.toFixed(5)}° E` : 'Position pending'}</span><span>{displayedCaptureTime === null ? 'Awaiting first report' : `Recorded ${formatSimLMST(displayedCaptureTime)} · received ${formatSimLMST((replayMessage ?? latestStatusMessage)!.deliveredAtSimTime)}`}</span><span>Position simulation · {oneWayDelayMinutes} min signal delay</span></details>
          {!viewedStatus&&<div className="earth-wait" role="status">{pendingReport?`First crew report in ${Math.floor(Math.max(0,pendingReport.deliveredAtSimTime-simTime)/60)}:${String(Math.floor(Math.max(0,pendingReport.deliveredAtSimTime-simTime)%60)).padStart(2,'0')}`:waitingText}<small>Position and health appear after delivery.</small></div>}
          <details className="activity-drawer"><summary>Activity <span>{activityMessages.length}</span></summary>
            <button className="quiet-button" onClick={() => setSelectedEventId(null)}>Latest received position</button>
            <div className="activity-list">{activityMessages.slice().reverse().map(message => <button key={message.id} aria-pressed={selectedEventId === message.id} onClick={() => setSelectedEventId(message.id)}>{formatSimLMST(getPacketTime(message))} · {message.statusSnapshot?.activityEvent || message.statusSnapshot?.movementState || 'Report'}</button>)}</div>
          </details>
          {replayMessage && <div className="replay-bar">Viewing past report <button onClick={() => setSelectedEventId(null)}>Return to latest</button></div>}

          {viewedStatus?.planning&&<details className="activity-drawer"><summary>Journey estimates</summary><p>Arrival {viewedStatus.planning.arrivalMinutes.toFixed(1)} min · Return {viewedStatus.planning.returnMinutes.toFixed(1)} min</p><p>{viewedStatus.planning.paceObserved?'Observed simulation':'Assumed'} pace {viewedStatus.planning.paceMps.toFixed(2)} m/s</p><p>Stop allowance {viewedStatus.planning.stopAllowanceMinutes.toFixed(1)} min · Earliest reply {viewedStatus.planning.replyMinutes} min + review</p><small>Captured values; not extrapolated to the present.</small></details>}
          
          <details className="sidebar-section"><summary>Notes & questions <span>{waitingQuestions.length?`${waitingQuestions.length} new`:observationMessages.length}</span></summary><div className="inbox-scroll">
            {observationMessages.length ? <div className="message-list">{observationMessages.map(message => <button key={message.id} aria-pressed={selectedMessage?.id === message.id} onClick={() => selectMessage(message)}><strong>{message.kind === 'question' ? (message.replyText ? 'Replied' : 'Question') : 'Observation'}</strong><span>{message.siteName || 'Field report'}</span></button>)}</div> : <div className="inbox-empty"><h3>No messages yet</h3><p>Waiting for crew notes.</p></div>}
            {selectedMessage && <article className="message-detail">
              <p className="eyebrow">{selectedMessage.siteName} · {formatSimLMST(getPacketTime(selectedMessage))}</p>
              {observationImage && <figure><img src={observationImage} alt={selectedObservation?.imageCaption || 'Received observation'}/><figcaption>{observationImageLabel}</figcaption></figure>}
              {selectedObservation?.audioRef && <audio controls src={selectedObservation.audioRef} aria-label="Received crew voice note"/>}
              {selectedObservation?.note && <p className="message-body">{selectedObservation.note}</p>}
              {selectedMessage.kind === 'question' && <h3 className="message-body">{selectedMessage.questionText}</h3>}
              <details><summary>Location & source</summary><p>{selectedObservation?.location.description || selectedMessage.statusSnapshot?.coordinateReference || 'Location not included.'}</p><p>Received {formatSimLMST(selectedMessage.deliveredAtSimTime)} · Plan {selectedMessage.originalPlanVersion}</p></details>
              {selectedMessage.kind === 'question' && (selectedMessage.replyText ? <div className="sent-reply"><strong>{selectedMessage.replyDeliveredAtSimTime != null && simTime >= selectedMessage.replyDeliveredAtSimTime ? 'Reply delivered' : 'Reply on its way'}</strong><p className="message-body">{selectedMessage.replyText}</p></div> : <form onSubmit={e => {e.preventDefault(); void handleSendReply();}}>
                <AdvicePreview context={replyAdvice} now={simTime} delay={oneWayDelayMinutes}/>
                <label htmlFor="earth-reply">Reply to crew</label>
                <textarea id="earth-reply" rows={4} placeholder="Write a short reply…" value={replyText} onChange={e => setReplyText(e.target.value)}/>
                {replyError && <p role="alert">{replyError}</p>}
                <button className="primary-button" disabled={isSending || !replyText.trim()}><Send size={16}/>{isSending ? 'Sending…' : 'Send reply'}</button>
                <p className="delivery-note">Arrives on Mars in {oneWayDelayMinutes} simulated minutes.</p>
              </form>)}
            </article>}
          </div></details>
          <details className="sidebar-section"><summary>Connection <span>{oneWayDelayMinutes} min</span></summary><label className="earth-mode">Communication<select aria-label="Earth communication mode" value={oneWayDelayMinutes>0?'delayed':simulationSpeedMultiplier>1?'fast':'normal'} onChange={e=>{const mode=e.target.value;if(mode==='delayed')onSetOneWayDelayMinutes(5);else onSetSimulationSpeedMultiplier(mode==='fast'?5:1);}}><option value="normal">Normal · 1× · no delay</option><option value="delayed">Mars delay · 1× · 5 min</option><option value="fast">Fast demo · 5× · no delay</option></select></label></details>
        </aside>
      </div>
      
    </div>
  );
}
