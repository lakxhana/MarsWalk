import type {DemoVitals} from './healthDemo';
import {replayCrew,type HealthReplay} from './healthReplay';
import type {RouteTask} from './fieldworkPlan';
import type { HealthReadings } from './healthMonitoring';
import type { ObservationRecord } from './storage';
export type StudyId = 'local' | 'skinner-ridge' | 'wildcat-ridge';
export const STUDIES = {
  local: { name: 'Local terrain survey', task: 'Describe layers, grains or surface hazards', history: 'Record your own observations at the selected map location.', url: 'https://science.nasa.gov/mission/mars-2020-perseverance/science-highlights/' },
  'skinner-ridge': { name: 'Skinner Ridge study', task: 'Describe grain sizes and visible layers', history: 'Perseverance collected sandstone cores Swift Run and Skyland here.', url: 'https://science.nasa.gov/resource/rock-cores-from-skinner-ridge/' },
  'wildcat-ridge': { name: 'Wildcat Ridge study', task: 'Describe fine layers and visible veins', history: 'Perseverance collected mudstone cores Hazeltop and Bearwallow here.', url: 'https://science.nasa.gov/resource/meet-the-mars-samples-hazeltop-and-bearwallow-samples-12-and-13/' },
} as const;
export interface InvestigationStop { id:string; started:number; ended:number|null; limitMinutes:number; destination:string; }
export interface PlanDecision {at:number;extraMinutes:number;skipped:string[];reason:string;}
export interface CrewMember {id:string;name:string;tankId:string;oxygenMinutes:number;oxygenReserveMinutes:number;health?:HealthReadings;}
export interface MissionLogEntry {id?:string;name:string;destination:string;started:number;ended:number;receivedAt?:number;stops:InvestigationStop[];finding:string;records:number;observationIds?:string[];tasks?:RouteTask[];crew?:CrewMember[];report?:OperationsReport;}
export interface CrewOperations {
  members?:CrewMember[];
  healthReplay?:HealthReplay|null;
  demoVitals?:DemoVitals|null;
  decisions?:PlanDecision[];
  walkSpeedFactor?:number;
  plannedSpeedMps?:number;
  previousWalks?: MissionLogEntry[];
  routeTasks?:RouteTask[];
  plannedStops?:number;
  oxygenRateGph?:number; oxygenLossGph?:number;
  health?:HealthReadings;
  name:string; tankId:string; oxygenMinutes:number; oxygenReserveMinutes:number; stopLimitMinutes:number;
  study:StudyId; stops:InvestigationStop[]; observationIds:string[]; missionStart:number|null;
  destination:string; taskPhoto:boolean; taskNote:boolean; lastFinding:string; completedAt:number|null;
}
export const DEFAULT_OPERATIONS:CrewOperations = {name:'Explorer 01',tankId:'Tank A',oxygenMinutes:120,oxygenReserveMinutes:15,stopLimitMinutes:5,plannedStops:3,study:'local',stops:[],observationIds:[],missionStart:null,destination:'Selected destination',taskPhoto:false,taskNote:false,lastFinding:'',completedAt:null};
export function startStop(state:CrewOperations, now:number):CrewOperations {
  if(state.stops.some(s=>s.ended===null) || state.missionStart===null)return state;
  return {...state,stops:[...state.stops,{id:`stop-${now}-${state.stops.length}`,started:now,ended:null,limitMinutes:state.stopLimitMinutes,destination:state.destination}]};
}
export function finishStop(state:CrewOperations,now:number):CrewOperations {
  return {...state,stops:state.stops.map(s=>s.ended===null?{...s,ended:Math.max(s.started,now)}:s)};
}
export function stopSeconds(stop:InvestigationStop,now:number):number{return Math.max(0,(stop.ended??now)-stop.started);}
export function stopLevel(stop:InvestigationStop,now:number):'normal'|'soon'|'exceeded' {
  const left=stop.limitMinutes*60-stopSeconds(stop,now); return left<=0?'exceeded':left<=60?'soon':'normal';
}
export function duration(seconds:number):string {const n=Math.max(0,Math.floor(seconds));return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;}
export function oxygenRemaining(state:CrewOperations,now:number):number {
  // Configurable constant-use endurance scenario, not a physiological or tank-pressure model.
  return Math.max(0,state.oxygenMinutes-(state.missionStart===null?0:(state.completedAt??now)-state.missionStart)/60);
}
export function recordEvidence(state:CrewOperations,o:ObservationRecord,atDestination:boolean):CrewOperations {
  if(state.missionStart===null || (o.createdAtSimTime??0)<state.missionStart)return state;
  return {...state,observationIds:[...new Set([...state.observationIds,o.id])],taskPhoto:state.taskPhoto||(atDestination&&Boolean(o.imageRef && !o.imageIsArchival)),taskNote:state.taskNote||(atDestination&&Boolean(o.note.trim())),lastFinding:o.note.trim()||state.lastFinding};
}
export interface OperationsReport { demoVitals?:DemoVitals|null; healthReplay?:HealthReplay|null; members?:CrewMember[]; decisions?:PlanDecision[]; routeTasks?:RouteTask[]; plannedStops?:number; stopHistory?: Array<InvestigationStop & {elapsedSeconds:number}>; health?:HealthReadings; capturedAt:number; name:string; tankId:string; oxygenMinutes:number; oxygenReserveMinutes:number; stop: (InvestigationStop & {elapsedSeconds:number;level:ReturnType<typeof stopLevel>})|null; totalStopSeconds:number; study:StudyId; destination:string; taskPhoto:boolean; taskNote:boolean; finding:string; completed:boolean; }
export function operationsReport(state:CrewOperations,now:number):OperationsReport {
 state=replayCrew(state,now);const stop=state.stops[state.stops.length-1];return {demoVitals:state.demoVitals,healthReplay:state.healthReplay,members:crewMembers(state).map(m=>({...m,oxygenMinutes:memberOxygen(state,m,now)})),decisions:state.decisions,routeTasks:state.routeTasks,plannedStops:state.routeTasks?state.routeTasks.filter(t=>t.selected!==false).length:state.plannedStops??3,stopHistory:state.stops.map(s=>({...s,elapsedSeconds:stopSeconds(s,now)})),health:state.health??{},capturedAt:now,name:state.name,tankId:state.tankId,oxygenMinutes:oxygenRemaining(state,now),oxygenReserveMinutes:state.oxygenReserveMinutes,stop:stop?{...stop,elapsedSeconds:stopSeconds(stop,now),level:stopLevel(stop,now)}:null,totalStopSeconds:state.stops.reduce((n,s)=>n+stopSeconds(s,now),0),study:state.study,destination:state.destination,taskPhoto:state.taskPhoto,taskNote:state.taskNote,finding:state.lastFinding,completed:state.completedAt!==null};
}

export function crewMembers(state:CrewOperations):CrewMember[]{return [{id:'lead',name:state.name,tankId:state.tankId,oxygenMinutes:state.oxygenMinutes,oxygenReserveMinutes:state.oxygenReserveMinutes,health:state.health},...(state.members??[])];}
export function memberOxygen(state:CrewOperations,member:CrewMember,now:number){return Math.max(0,member.oxygenMinutes-(state.missionStart===null?0:Math.max(0,(state.completedAt??now)-state.missionStart))/60);}
export function teamOxygenBudget(state:CrewOperations,now:number){return Math.min(...crewMembers(state).map(m=>memberOxygen(state,m,now)-m.oxygenReserveMinutes));}
export function archiveMission(state:CrewOperations,id:string,now:number,delay:number):CrewOperations {
 if(state.missionStart===null||state.completedAt!==null)return state;
 const ended={...finishStop(state,now),completedAt:now};
 const entry:MissionLogEntry={id,name:state.name,destination:state.destination,started:state.missionStart,ended:now,receivedAt:now+delay*60,stops:ended.stops,finding:state.lastFinding,records:state.observationIds.length,observationIds:[...state.observationIds],tasks:structuredClone(state.routeTasks??[]),crew:structuredClone(crewMembers(replayCrew(ended,now))),report:operationsReport(ended,now)};
 return {...ended,previousWalks:[...(state.previousWalks??[]).filter(w=>w.id!==id),entry]};
}

export function limitingOxygen(state:CrewOperations,now:number){return crewMembers(state).map(m=>({...m,remaining:memberOxygen(state,m,now)})).reduce((a,b)=>a.remaining-a.oxygenReserveMinutes<=b.remaining-b.oxygenReserveMinutes?a:b);}
