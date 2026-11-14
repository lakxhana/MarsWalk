import type {RouteTask} from './fieldworkPlan';
import {activeTasks,optimiseTasks,priority} from './adaptivePlanning';

export interface ComparisonInput {
  outwardMinutes:number; returnMinutes:number; budgetMinutes:number; oxygenMinutes:number;
  reserveMinutes:number; oxygenReserveMinutes:number; tasks:RouteTask[];
  elapsedMinutes?:number; capturedAt?:number; distanceMeters?:number; paceMps?:number;
}
export interface ComparisonOutcome {
  ids:string[]; skipped:RouteTask[]; score:number; observeMinutes:number;
  returnAtMinutes:number; missionMargin:number; oxygenAtReturn:number; oxygenMargin:number;
}
/** Both policies reserve identical travel and reserves. Fixed completes a prefix in route order;
 * adaptive maximises priority over the same candidates, then executes them in route order. */
export function compareMission(input:ComparisonInput,extraMinutes=0,speedFactor=1){
  const tasksValid=input.tasks.length<=30&&input.tasks.every(t=>Number.isFinite(t.minutes)&&t.minutes>0&&Number.isFinite(t.fraction)&&t.fraction>=0&&t.fraction<=1&&(t.priority===undefined||(Number.isInteger(t.priority)&&t.priority>=1&&t.priority<=5)));
  const valid=tasksValid&&[input.outwardMinutes,input.returnMinutes,input.budgetMinutes,input.oxygenMinutes,input.reserveMinutes,input.oxygenReserveMinutes,extraMinutes].every(n=>Number.isFinite(n)&&n>=0)&&Number.isFinite(speedFactor)&&speedFactor>0;
  const tasks=activeTasks(input.tasks).filter(t=>!t.done).slice().sort((a,b)=>a.fraction-b.fraction);
  const outward=input.outwardMinutes/speedFactor,back=input.returnMinutes/speedFactor;
  const travel=outward+back,limit=Math.min(input.budgetMinutes-input.reserveMinutes,input.oxygenMinutes-input.oxygenReserveMinutes);
  const available=limit-travel-extraMinutes;
  const feasible=valid&&Number.isFinite(available)&&available>=-1e-8;
  // Match optimiser rounding, so fractional seconds never favour one policy.
  const capacitySeconds=feasible?Math.min(86400,Math.max(0,Math.floor(available*60+1e-7))):0;
  const fixedIds:string[]=[];let used=0;
  if(feasible)for(const task of tasks){const cost=Math.ceil(task.minutes*60-1e-7);if(!Number.isFinite(cost)||cost<=0||used+cost>capacitySeconds)break;used+=cost;fixedIds.push(task.id);}
  const adaptiveIds=feasible?optimiseTasks(tasks,capacitySeconds/60).ids:[];
  const outcome=(ids:string[]):ComparisonOutcome=>{
    const chosen=tasks.filter(t=>ids.includes(t.id));const observe=chosen.reduce((sum,t)=>sum+Math.ceil(t.minutes*60-1e-7)/60,0);
    const total=travel+extraMinutes+observe;
    return {ids,skipped:tasks.filter(t=>!ids.includes(t.id)),score:chosen.reduce((sum,t)=>sum+priority(t),0),observeMinutes:observe,
      returnAtMinutes:total,missionMargin:input.budgetMinutes-total-input.reserveMinutes,
      oxygenAtReturn:input.oxygenMinutes-total,oxygenMargin:input.oxygenMinutes-total-input.oxygenReserveMinutes};
  };
  const allTaskMinutes=tasks.reduce((sum,t)=>sum+t.minutes,0);
  return {valid,feasible,tasks,outward,back,extraMinutes,capacityMinutes:capacitySeconds/60,shortfall:Math.max(0,-available),
    originalDemand:travel+extraMinutes+allTaskMinutes,originalOverrun:Math.max(0,travel+extraMinutes+allTaskMinutes-limit),
    all:outcome(tasks.map(t=>t.id)),fixed:outcome(fixedIds),adaptive:outcome(adaptiveIds)};
}
