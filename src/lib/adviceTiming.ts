import type {CrewOperations} from './crewOperations';
import type {MissionStatusSnapshot} from './storage';
export interface AdviceContext {
 missionId:string;planVersion:number;destinationName:string;basedOnCapturedAt:number;
 stopId?:string;validUntilSimTime?:number;expiryBasis:'stop-limit'|'planned-departure'|'unknown';
}
/** Only the supplied, already delivered snapshot may inform an Earth prediction. */
export function adviceFromReport(report:MissionStatusSnapshot|null|undefined):AdviceContext|null{
 if(!report?.missionId)return null;
 const captured=report.capturedAtSimTime;if(captured===undefined||!Number.isFinite(captured))return null;
 const stop=report.operations?.stop;
 let expiry:number|undefined,basis:AdviceContext['expiryBasis']='unknown';
 if(stop?.ended===null){expiry=stop.started+stop.limitMinutes*60;basis='stop-limit';}
 else if(report.planning&&report.movementState==='Walking'){
  const tasks=(report.operations?.routeTasks??[]).filter(t=>t.selected!==false&&!t.done);
  expiry=captured+60*(report.planning.arrivalMinutes+tasks.reduce((sum,t)=>sum+t.minutes,0));basis='planned-departure';
 }
 return {missionId:report.missionId,planVersion:report.planVersion,destinationName:report.destinationName,basedOnCapturedAt:captured,
  stopId:stop?.ended===null?stop.id:undefined,validUntilSimTime:Number.isFinite(expiry)?expiry:undefined,expiryBasis:basis};
}
export function adviceArrival(context:AdviceContext|null|undefined,now:number,delayMinutes:number){
 const arrivesAt=now+Math.round(delayMinutes*60),expiry=context?.validUntilSimTime;
 return {arrivesAt,late:expiry!==undefined&&arrivesAt>=expiry,departureAt:expiry,marginSeconds:expiry===undefined?null:expiry-arrivesAt};
}
export function assessAdvice(context:AdviceContext,current:MissionStatusSnapshot|null|undefined,now:number){
 const reasons:string[]=[];
 if(!current)reasons.push('Current mission context unavailable');
 else{
  if(context.missionId!==current.missionId)reasons.push('Different mission');
  if(context.planVersion!==current.planVersion)reasons.push('Plan changed');
  if(context.destinationName!==current.destinationName)reasons.push('Destination changed');
  if(context.stopId&&(current.operations?.stop?.id!==context.stopId||current.operations.stop.ended!==null))reasons.push('Investigation stop ended');
  if(current.operations?.completed)reasons.push('Walk ended');
 }
 if(context.validUntilSimTime!==undefined&&now>=context.validUntilSimTime)reasons.push('Advice window expired');
 return {requiresReview:reasons.length>0,reasons};
}

export function hasOperationalPlanChange(previous:CrewOperations,next:CrewOperations){
 const signature=(crew:CrewOperations)=>JSON.stringify({tasks:(crew.routeTasks??[]).map(t=>[t.id,t.title,t.minutes,t.priority,t.selected]),decisions:crew.decisions?.length??0,stopLimit:crew.stopLimitMinutes,oxygen:crew.oxygenMinutes,oxygenReserve:crew.oxygenReserveMinutes});
 return signature(previous)!==signature(next);
}
