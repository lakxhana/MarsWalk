import {demoCrew} from './healthDemo';
import data from './healthReference.json';
import type {HealthReadings,MetricId} from './healthMonitoring';
import type {CrewOperations} from './crewOperations';
export interface HealthReplay {memberId:string;startedAt:number;record:'bidmc01';}
export const REPLAY_DURATION=data.samples[data.samples.length-1][0]!;
export function referenceReadings(startedAt:number,now:number):HealthReadings {
 const elapsed=Math.max(0,now-startedAt);const index=Math.min(data.samples.length-1,Math.floor(elapsed));
 const row=data.samples[index];const result:HealthReadings={};
 (['heartRate','respiratoryRate','bloodOxygen'] as MetricId[]).forEach((metric,i)=>{const value=row[i+1];if(value!==null&&Number.isFinite(value))result[metric]={metric,value,capturedAt:startedAt+row[0]!,source:'replay',record:data.record,sampleSeconds:row[0]!,low:null,high:null};});
 return result;
}
export function replayCrew(state:CrewOperations,now:number):CrewOperations {
 if(state.demoVitals)return demoCrew(state,now);
 const replay=state.healthReplay;if(!replay||now<replay.startedAt)return state;
 const sample=referenceReadings(replay.startedAt,state.completedAt??now);
 const merge=(health:HealthReadings={})=>{const next={...health};for(const metric of ['heartRate','respiratoryRate','bloodOxygen'] as const){delete next[metric];if(sample[metric])next[metric]=sample[metric];}return next;};
 return replay.memberId==='lead'?{...state,health:merge(state.health)}:{...state,members:state.members?.map(m=>m.id===replay.memberId?{...m,health:merge(m.health)}:m)};
}
