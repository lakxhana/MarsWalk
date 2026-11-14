import model from '../../research-data/demo-vitals-model.json';
import type {CrewOperations} from './crewOperations';
import type {HealthReadings,MetricId} from './healthMonitoring';
export interface DemoVitals {startedAt:number;}
// Deterministic: every viewer of a timestamp receives the same sample.
function phase(id:string){let h=2166136261;for(const char of id)h=Math.imul(h^char.charCodeAt(0),16777619);return (h>>>0)/4294967296*Math.PI*2;}
export function activityLoad(state:CrewOperations,at:number):number{
 const start=state.missionStart??at;
 let cursor=start,load=0;
 const advance=(to:number,target:number)=>{if(to>cursor){load=target+(load-target)*Math.exp(-(to-cursor)/model.responseSeconds);cursor=to;}};
 for(const stop of [...state.stops].sort((a,b)=>a.started-b.started)){
  if(stop.started>=at)break;
  advance(Math.min(at,Math.max(start,stop.started)),1);
  advance(Math.min(at,stop.ended??at),0);
 }
 advance(at,1);return load;
}
export function generatedReadings(state:CrewOperations,id:string,now:number):HealthReadings{
 if(!state.demoVitals||state.missionStart===null||now<state.demoVitals.startedAt)return {};
 const elapsed=Math.max(0,Math.floor(((state.completedAt??now)-state.demoVitals.startedAt)/model.sampleIntervalSeconds)*model.sampleIntervalSeconds);
 const at=state.demoVitals.startedAt+elapsed,load=activityLoad(state,at),result:HealthReadings={};
 for(const [name,config] of Object.entries(model.metrics)){
  const metric=name as MetricId,p=phase(`${id}:${state.missionStart}:${metric}`);
  const wave=Math.sin(elapsed/config.periodSeconds*2*Math.PI+p);
  const value=Number((config.rest+config.activityChange*load+config.variation*wave).toFixed(config.decimals));
  result[metric]={metric,value,source:'simulated',record:model.id,seriesId:`${model.id}:${state.demoVitals.startedAt}`,sampleSeconds:elapsed,capturedAt:at,low:null,high:null};
 }
 return result;
}
export function demoCrew(state:CrewOperations,now:number):CrewOperations{
 if(!state.demoVitals||state.missionStart===null)return state;
 return {...state,health:{...state.health,...generatedReadings(state,'lead',now)},members:state.members?.map(m=>({...m,health:{...m.health,...generatedReadings(state,m.id,now)}}))};
}
export const isGenerated=(record?:string)=>record===model.id;
