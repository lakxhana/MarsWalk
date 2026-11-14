import type {OperationsReport} from '@/lib/crewOperations';
import {readingState,type HealthReading} from '@/lib/healthMonitoring';
import HealthMonitor from './HealthMonitor';
const age=(seconds:number)=>seconds<60?`${Math.floor(Math.max(0,seconds))}s`:`${Math.floor(seconds/60)}m ${Math.floor(seconds%60)}s`;
export default function CrewTelemetry({report,now}:{report?:OperationsReport;now:number}){
 const readings=report?.health??{};
 const metric=(label:string,reading:HealthReading|undefined,unit:string)=>{
  const state=readingState(reading,report?.capturedAt??now);
  return <div className={`telemetry-cell ${state==='high'||state==='low'?'attention':''}`}><span>{label}</span><strong>{reading?reading.value:'—'} <small>{reading?unit:''}</small></strong><small>{reading?`${reading.source==='replay'?'Reference replay':reading.source==='simulated'?'Simulated':'Manual'} · ${age(now-reading.capturedAt)} old`:'No reading'}</small>{reading&&<small>{state==='stale'?'Old at capture':state==='high'||state==='low'?`${state==='high'?'Above':'Below'} entered limit`:now>(report?.capturedAt??now)?'Delayed report':'Recorded'}</small>}</div>;
 };
 const suit=[readings.suitPressure,readings.oxygenPartialPressure,readings.co2PartialPressure];
 const count=suit.filter(Boolean).length;
 const alarms=suit.some(r=>['high','low'].includes(readingState(r,report?.capturedAt??now)));
 return <section className="crew-telemetry" aria-label="Crew health and suit telemetry"><header><div><p className="eyebrow">CREW & SUIT</p><h2>{report?.name??'Awaiting crew'}</h2></div><span className="telemetry-age">{report?`Report ${age(now-report.capturedAt)} old`:'No report'}</span></header>
 <div className="telemetry-grid">{metric('Heart rate',readings.heartRate,'bpm')}{metric('Breathing',readings.respiratoryRate,'breaths/min')}
 <div className={`telemetry-cell ${report&&report.oxygenMinutes<=report.oxygenReserveMinutes?'attention':''}`}><span>O₂ endurance</span><strong>{report?Math.floor(report.oxygenMinutes):'—'} <small>{report?'min':''}</small></strong><small>{report?`${report.tankId} · reserve ${report.oxygenReserveMinutes} min`:'No reading'}</small><small>{report?'Simulated · at report':''}</small></div>
 <div className={`telemetry-cell ${alarms?'attention':''}`}><span>Suit readings</span><strong>{count}/3</strong><small>{alarms?'Check entered limits':count===0?'No suit data':count<3?'Incomplete':'Pressure · O₂ · CO₂'}</small><small>{count>0?'Received values; not a health verdict':''}</small></div></div>
 <HealthMonitor readings={readings} now={now} capturedAt={report?.capturedAt}/>
 </section>;
}
