import type {OperationsReport,CrewMember} from './crewOperations';
import type {MissionStatusSnapshot} from './storage';
import {METRICS,readingState,type MetricId,type HealthReading} from './healthMonitoring';
export type SuitMetric=Exclude<MetricId,'airTemperature'>|'tank';
export const SUIT_METRICS:SuitMetric[]=['heartRate','respiratoryRate','bloodOxygen','tank','suitPressure','oxygenPartialPressure','co2PartialPressure','bodyTemperature'];
export const METRIC_CONTEXT:Record<SuitMetric,string>={
 heartRate:'Heartbeats per minute. EVA biomedical monitoring uses heart-rate and rhythm information; this display does not diagnose heart conditions.',
 respiratoryRate:'Breaths per minute. The reference monitor derives this from chest impedance. It is not a measurement of suit airflow.',
 bloodOxygen:'Estimated blood oxygen saturation from pulse oximetry. This is different from oxygen remaining in the tank and oxygen pressure inside the suit.',
 tank:'Configured endurance minus elapsed mission minutes, including stops. A constant-use planning model, not a measured tank pressure or fill percentage.',
 suitPressure:'Pressure of gas inside the suit. A pressure reading alone cannot show remaining tank inventory.',
 oxygenPartialPressure:'Oxygen contribution to suit gas pressure (ppO₂). NASA suit guidance calls for monitoring this separately from total suit pressure.',
 co2PartialPressure:'Carbon dioxide contribution to suit gas pressure (ppCO₂). Sensor location and breathing conditions affect interpretation; this does not establish inspired CO₂ exposure.',
 bodyTemperature:'Body temperature as entered by an operator. It is not ambient Mars temperature; measurement site and method matter.'
};
export function reportMember(report:OperationsReport|undefined,id:string):CrewMember|undefined {
 if(!report)return undefined;return report.members?.find(m=>m.id===id)??(id==='lead'?{id:'lead',name:report.name,tankId:report.tankId,oxygenMinutes:report.oxygenMinutes,oxygenReserveMinutes:report.oxygenReserveMinutes,health:report.health}:undefined);
}
export function metricValue(report:OperationsReport|undefined,id:string,key:SuitMetric){const m=reportMember(report,id);return key==='tank'?m?.oxygenMinutes:m?.health?.[key]?.value;}
export function metricTitle(key:SuitMetric){return key==='tank'?'Tank endurance':METRICS[key].label;}
export function metricUnit(key:SuitMetric){return key==='tank'?'min':METRICS[key].unit;}
export function dataState(reading:HealthReading|undefined,reportAt:number,now:number){
 if(!reading)return 'No reading';const status=readingState(reading,reportAt);
 if(status==='high'||status==='low')return `${status==='high'?'Above':'Below'} entered limit${now-reading.capturedAt>60?' · delayed':''}`;
 if(status==='stale')return 'Old at capture';return now-reading.capturedAt>60?'Delayed reading':'Recorded';
}
export function metricHistory(history:MissionStatusSnapshot[],memberId:string,key:SuitMetric,cutoff:number){
 const unique=new Map<number,number>();
 const latest=history.filter(s=>s.operations&&s.operations.capturedAt<=cutoff).sort((a,b)=>b.operations!.capturedAt-a.operations!.capturedAt)[0]?.operations;
 const current=key==='tank'?undefined:reportMember(latest,memberId)?.health?.[key];
 if(key!=='tank'&&!current)return [];
 for(const s of history){const report=s.operations;if(!report||report.capturedAt>cutoff)continue;const m=reportMember(report,memberId);if(!m)continue;if(key!=='tank'){const r=m.health?.[key];if(r?.source!==current?.source||r?.record!==current?.record||r?.seriesId!==current?.seriesId)continue;}const value=metricValue(report,memberId,key),at=key==='tank'?report.capturedAt:m.health?.[key]?.capturedAt;
 if(value!==undefined&&at!==undefined&&Number.isFinite(value)&&at<=cutoff&&at>=cutoff-300)unique.set(at,value);}
 return [...unique].sort((a,b)=>a[0]-b[0]).map(([at,value])=>({at,value}));
}
