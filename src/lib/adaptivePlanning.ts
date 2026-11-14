import type {RouteTask} from './fieldworkPlan';
import type {RoutePlanSummary} from './routePlanner';
export const activeTasks=(tasks:RouteTask[])=>tasks.filter(t=>t.selected!==false);
export const priority=(t:RouteTask)=>Math.max(1,Math.min(5,Math.round(t.priority??3)));
/** Exact 0/1 knapsack on whole-second costs. Rounds durations UP and capacity DOWN. */
export function optimiseTasks(tasks:RouteTask[],availableMinutes:number){
 const candidates=tasks.filter(t=>!t.done&&Number.isFinite(t.minutes)&&t.minutes>0).slice(0,30);
 const cap=Math.min(86400,Math.max(0,Math.floor(availableMinutes*60+1e-7)));
 if(!Number.isFinite(cap))return {ids:[] as string[],score:0,minutes:0};
 const scores=new Int16Array(cap+1);scores.fill(-1);scores[0]=0;
 const masks=new Uint32Array(cap+1);
 candidates.forEach((t,i)=>{const cost=Math.ceil(t.minutes*60-1e-7);for(let c=cap;c>=cost;c--){if(scores[c-cost]<0)continue;const score=scores[c-cost]+priority(t);if(score>scores[c]){scores[c]=score;masks[c]=masks[c-cost]|(1<<i);}}});
 let best=0;for(let c=1;c<=cap;c++)if(scores[c]>scores[best])best=c;
 return {ids:candidates.filter((_,i)=>(masks[best]&(1<<i))!==0).map(t=>t.id),score:scores[best],minutes:best/60};
}
export function taskCapacity(travelMinutes:number,budget:number,reserve:number,endurance:number,oxygenReserve:number){return Math.max(0,Math.min(budget-reserve,endurance-oxygenReserve)-travelMinutes);}
export function scenarioPlans(route:RoutePlanSummary,tasks:RouteTask[],budget:number,reserve:number,endurance:number,oxygenReserve:number){
 return [0.7,1,1.2].map(factor=>{const speed=route.assumedSpeedMps*factor,travel=2*route.totalDistanceMeters/speed/60;
 const capacity=taskCapacity(travel,budget,reserve,endurance,oxygenReserve),chosen=optimiseTasks(tasks,capacity);
 const fixed=activeTasks(tasks).filter(t=>!t.done);const fixedMinutes=fixed.reduce((n,t)=>n+t.minutes,0);
 return {factor,speed,travel,capacity,chosen,fixedScore:fixed.reduce((n,t)=>n+priority(t),0),fixedMinutes,fixedFits:fixedMinutes<=capacity&&travel<=Math.min(budget-reserve,endurance-oxygenReserve),fits:travel<=Math.min(budget-reserve,endurance-oxygenReserve),margin:Math.min(budget-reserve,endurance-oxygenReserve)-travel-chosen.minutes};});
}
export function returnDistance(route:RoutePlanSummary,distance:number){return (route.id??'').startsWith('return-')?Math.max(0,route.totalDistanceMeters-distance):Math.max(0,distance);}
export function estimatePace(samples:Array<{metres:number;seconds:number}>,fallback:number){
 const valid=samples.filter(s=>Number.isFinite(s.metres)&&s.metres>0&&s.seconds>0);const sec=valid.reduce((s,p)=>s+p.seconds,0);
 return sec>=10?valid.reduce((s,p)=>s+p.metres,0)/sec:fallback;
}
/** Reachable PREFIX of this chosen outbound path, including walk-back to original base. */
export function reachableDistance(route:RoutePlanSummary,distance:number,speed:number,timeLeft:number,oxygenLeft:number,reserve:number,oxygenReserve:number){
 const minutes=Math.min(timeLeft-reserve,oxygenLeft-oxygenReserve);
 if(!Number.isFinite(minutes)||speed<=0)return null;
 const max=(route.id??'').startsWith('return-')?route.totalDistanceMeters:(minutes*speed*60+distance)/2;
 if(minutes*speed*60<returnDistance(route,distance)-1e-6)return null;
 return Math.max(0,Math.min(route.totalDistanceMeters,max));
}
export function investigationOptions(tasks:RouteTask[],capacity:number,extra:number){
 const pending=activeTasks(tasks).filter(t=>!t.done),required=pending.reduce((s,t)=>s+t.minutes,0);
 const feasible=Number.isFinite(extra)&&extra>=0&&extra<=capacity;
 const chosen=optimiseTasks(pending,Math.max(0,capacity-extra));
 return {feasible,keepAll:feasible&&required+extra<=capacity,chosen,skipped:pending.filter(t=>!chosen.ids.includes(t.id)),shortfall:Math.max(0,required+extra-capacity)};
}
