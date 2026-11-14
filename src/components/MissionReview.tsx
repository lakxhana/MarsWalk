import {useState} from 'react';
import type {MissionProposal} from '@/lib/missionProposal';
import {preflight} from '@/lib/preflight';
import {makeRouteTasks} from '@/lib/fieldworkPlan';
import RegionalMap from './RegionalMap';
interface Props {
 savedWalk?:boolean; starting?:boolean; onResumeSaved?:()=>void; onEndSaved?:()=>void;
 proposal:MissionProposal|null; now:number; active:boolean; onAccept:()=>void;
 onRequest:(note:string)=>void; onOpenEarth:()=>void; onReturn:()=>void;
}
export default function MissionReview({savedWalk=false,starting=false,onResumeSaved,onEndSaved,proposal,now,active,onAccept,onRequest,onOpenEarth,onReturn}:Props){
 const [editing,setEditing]=useState(false),[note,setNote]=useState('');
 const [preparation,setPreparation]=useState<{id?:string;checked:string[]}>({checked:[]});
 const checked=preparation.id===proposal?.id?preparation.checked:[];
 const checks=['Route & tasks reviewed','Time & oxygen reviewed','Communication mode checked'];
 const prepared=checks.every(c=>checked.includes(c));
 const ready=proposal&&now>=proposal.arrivesAt;
 const calc=ready?preflight(proposal.route,proposal.crew,proposal.budget,proposal.reserve):null;
 const tasks=ready?(proposal.crew.routeTasks??makeRouteTasks(proposal.crew.plannedStops??3,proposal.crew.stopLimitMinutes)).filter(t=>t.selected!==false):[];
 return <div className="named-planner unified-planner mission-review">
  <aside aria-label="Mars mission review">
   <div className="review-scroll">
    <p className="eyebrow">MARS CREW</p><h1>{active?'Active mission':'Mission briefing'}</h1>
    {savedWalk&&<div className="saved-walk-review"><strong>Saved walk · paused</strong><p>Resume from the last saved position.</p></div>}
    {!ready?<div className="review-wait"><h2>{proposal?'Plan arriving':'Choose a mission'}</h2><p>{proposal?`${Math.ceil((proposal.arrivesAt-now)/60)} min until the plan arrives.`:'Earth selects the route and tasks. Review them here before starting.'}</p></div>:<>
     <span className="review-source">Plan from Earth</span><h2>{proposal.route.startName} → {proposal.route.destinationName}</h2>
     <p>{proposal.crew.name} · {Math.round(proposal.route.totalDistanceMeters)} m</p>
     <div className="review-metrics"><span>Mission <strong>{proposal.budget} min</strong></span><span>Tasks <strong>{tasks.length}</strong></span><span>Trip estimate <strong>{calc?Math.ceil(calc.total-proposal.reserve):'—'} min</strong></span><span>Time reserve <strong>{proposal.reserve} min</strong></span></div>
     <details className="review-task-list sidebar-section" aria-label="Assigned mission tasks" open><summary>Your tasks <span>{tasks.length}</span></summary>{tasks.map((t,i)=><div key={t.id}><span>{i+1}</span><p>{t.title}<small>{t.minutes} min</small></p></div>)}</details>
     <details className="preflight-section"><summary>Preparation</summary><p>{proposal.crew.tankId}</p><p>{proposal.crew.oxygenMinutes} min endurance · {proposal.crew.oxygenReserveMinutes} min reserve</p><small>Modelled endurance</small></details>
     {!active&&!savedWalk&&proposal.status==='pending'&&<section className="crew-preparation" aria-label="Pre-walk checklist"><h3>Before you start</h3>{checks.map(c=><label key={c}><input type="checkbox" checked={checked.includes(c)} onChange={e=>setPreparation({id:proposal.id,checked:e.target.checked?[...checked,c]:checked.filter(v=>v!==c)})}/><span>{c}</span></label>)}</section>}
     {calc?.errors.map(e=><p role="alert" key={e}>{e}</p>)}
     {!active&&!savedWalk&&proposal.status==='pending'&&<><button className="quiet-button" onClick={()=>setEditing(v=>!v)}>Request changes</button>{editing&&<form onSubmit={e=>{e.preventDefault();if(note.trim())onRequest(note.trim());}}><label>What needs changing?<textarea required maxLength={500} value={note} onChange={e=>setNote(e.target.value)}/></label><button disabled={!note.trim()}>Send request</button></form>}</>}
     {!active&&!savedWalk&&proposal.status!=='pending'&&<p role="status">{proposal.status==='changes'?'Changes requested · awaiting a new plan':proposal.status==='completed'?'Mission ended · saved in log':'No active walk · request a new plan from Earth.'}</p>}
    </>}
   </div>
   <footer className="review-actions">
    {savedWalk?<><button className="primary-button" onClick={onResumeSaved}>Resume saved walk</button><button onClick={onEndSaved}>End saved walk</button></>:active?<button className="primary-button" onClick={onReturn}>Return to walk</button>:ready&&proposal.status==='pending'?<><button className="primary-button" disabled={starting||!prepared||Boolean(calc?.errors.length)} onClick={()=>{if(prepared&&!starting&&!calc?.errors.length)onAccept();}}>{starting?'Starting…':'Start walk →'}</button><small>{calc?.errors.length?'Resolve the plan warnings above.':!prepared?`${checked.length}/3 checks complete`:'Ready · starts the mission clock'}</small></>:!proposal||ready&&proposal.status!=='pending'?<button className="primary-button" onClick={onOpenEarth}>Open Earth planning</button>:<button disabled>Start walk · waiting for plan</button>}
   </footer>
  </aside>
  <section className="planner-main"><RegionalMap points={ready?proposal.route.points:[]} modelled={Boolean(ready&&proposal.route.id?.startsWith('terrain-'))}/></section>
 </div>;
}
