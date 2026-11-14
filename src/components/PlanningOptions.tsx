import {useMemo,useState,useEffect,useRef} from 'react';
import type {RoutePlanSummary} from '@/lib/routePlanner';
import type {RouteTask} from '@/lib/fieldworkPlan';
import {scenarioPlans} from '@/lib/adaptivePlanning';
interface Props {route:RoutePlanSummary;base:RoutePlanSummary;tasks:RouteTask[];budget:number;reserve:number;endurance:number;oxygenReserve:number;onTasks:(tasks:RouteTask[])=>void;onRoute:(route:RoutePlanSummary|null)=>void}
export default function PlanningOptions(p:Props){
 const [mode,setMode]=useState(1),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[limit,setLimit]=useState(15);
 const [comparison,setComparison]=useState<{alternative:RoutePlanSummary|null;recordedStats:{maxSlope:number|null;ascent:number|null};alternativeStats:{maxSlope:number|null;ascent:number|null}|null}|null>(null);
 const worker=useRef<Worker|null>(null);useEffect(()=>()=>worker.current?.terminate(),[]);
 const scenarios=useMemo(()=>scenarioPlans(p.route,p.tasks.map(t=>({...t,done:false})),p.budget,p.reserve,p.endurance,p.oxygenReserve),[p.route,p.tasks,p.budget,p.reserve,p.endurance,p.oxygenReserve]);const chosen=scenarios.find(s=>s.factor===mode)!;
 const compare=()=>{worker.current?.terminate();setBusy(true);setMessage('');setComparison(null);try{const w=new Worker(new URL('../workers/terrain.worker.ts',import.meta.url),{type:'module'});worker.current=w;w.onmessage=e=>{setBusy(false);if(e.data.error)setMessage(e.data.error);else setComparison(e.data);w.terminate();};w.onerror=()=>{setBusy(false);setMessage('Could not compare terrain. Your recorded route is unchanged.');w.terminate();};w.postMessage({route:p.base,limit});}catch{setBusy(false);setMessage('Terrain worker unavailable in this browser.');}};
 return <details className="preflight-section plan-options"><summary>Task & terrain options</summary>
 <p className="option-intro">Choose the science that fits your time.</p><label>Planning pace<select value={mode} onChange={e=>setMode(Number(e.target.value))}><option value={1}>Nominal estimate</option><option value={.7}>Allow for slower walking</option></select></label>
 <div className="option-metrics"><div><small>One-way estimate</small><strong>{(scenarios[2].travel/2).toFixed(1)}–{(scenarios[0].travel/2).toFixed(1)} min</strong></div><div><small>Tasks that fit</small><strong>{chosen.fits?chosen.chosen.ids.length:0} / {p.tasks.length}</strong></div></div>
 <small>Scenario range: 0.7×, 1× and 1.2× assumed pace. Not a confidence interval.</small>
 {chosen.fits?<><p>{chosen.chosen.ids.length?`Suggested: ${p.tasks.filter(t=>chosen.chosen.ids.includes(t.id)).map(t=>t.title).join(' · ')}`:'Only travel and return fit. Shorten the route or increase the budget for science.'}</p><button type="button" onClick={()=>{p.onTasks(p.tasks.map(t=>({...t,done:false,selected:chosen.chosen.ids.includes(t.id)})));setMessage('Task selection updated. Review it before starting.');}}>Use suggested tasks</button></>:<p className="ops-alert">Travel and return exceed this scenario budget.</p>}
 <details className="option-detail"><summary>Compare terrain routes</summary><small>DTM-based proposal; no claim of human walkability.</small><label>Slope limit (scenario)<select value={limit} onChange={e=>{worker.current?.terminate();setBusy(false);setLimit(Number(e.target.value));setComparison(null);p.onRoute(null);}}>{[10,15,20].map(n=><option key={n} value={n}>{n}°</option>)}</select></label><button type="button" disabled={busy} onClick={compare}>{busy?'Checking terrain…':'Find a slope-weighted route'}</button>
 {comparison&&<><button className="route-choice" type="button" aria-pressed={p.route.id===p.base.id} onClick={()=>p.onRoute(null)}><strong>Recorded rover path</strong><span>{Math.round(p.base.totalDistanceMeters)} m · {comparison.recordedStats.maxSlope===null?'slope coverage incomplete':`${comparison.recordedStats.maxSlope.toFixed(1)}° max sampled slope`}</span></button>{comparison.alternative?<button className="route-choice" type="button" aria-pressed={p.route.id===comparison.alternative.id} onClick={()=>p.onRoute(comparison.alternative)}><strong>Modelled terrain route</strong><span>{Math.round(comparison.alternative.totalDistanceMeters)} m · {comparison.alternativeStats?.maxSlope?.toFixed(1)}° max sampled slope</span></button>:<p>No connected terrain route meets this limit within the bundled grid.</p>}</>}
 </details>

 {message&&<p role="status" className="inline-status">{message}</p>}
 </details>;
}
