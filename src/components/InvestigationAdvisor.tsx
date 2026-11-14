import {useState} from 'react';
import type {CrewOperations} from '@/lib/crewOperations';
import {investigationOptions} from '@/lib/adaptivePlanning';
export default function InvestigationAdvisor({crew,now,capacity,delay,onCrew,returned}:{crew:CrewOperations;now:number;capacity:number;delay:number;onCrew:(c:CrewOperations)=>void;returned:boolean}){
 const [extra,setExtra]=useState(2),[notice,setNotice]=useState('');
 const tasks=returned?[]:crew.routeTasks??[],option=investigationOptions(tasks,Math.max(0,capacity),extra);
 const apply=()=>{if(!option.feasible)return;const skipped=option.skipped.map(t=>t.title);const reason=skipped.length?`Reserved ${extra} more minutes; skipped ${skipped.join(', ')}.`:`Reserved ${extra} more minutes; kept remaining tasks.`;
 onCrew({...crew,routeTasks:returned?crew.routeTasks:tasks.map(t=>t.done||t.selected===false?t:{...t,selected:option.chosen.ids.includes(t.id)}),stops:crew.stops.map(s=>s.ended===null?{...s,limitMinutes:Math.max(s.limitMinutes,(now-s.started)/60+extra)}:s),decisions:[...(crew.decisions??[]),{at:now,extraMinutes:extra,skipped,reason}].slice(-100)});setNotice('Plan updated. The clock keeps running; Earth will receive the decision.');};
 return <details className="investigation-advisor"><summary>Need more time here?</summary><p>Return reserved · {Math.max(0,capacity).toFixed(1)} min for observations</p><label>Investigation time from now<select value={extra} onChange={e=>{setExtra(Number(e.target.value));setNotice('');}}>{[1,2,5,10].map(n=><option key={n} value={n}>{n} min</option>)}</select></label>
 {!option.feasible?<p className="ops-alert">This would use your return reserve. Shorten the stop or return.</p>:option.keepAll?<p>Fits with your remaining tasks.</p>:<p>To fit: skip {option.skipped.map(t=>t.title).join(' · ')}.</p>}
 <small>{delay===0?'Live demo: no signal delay.':`Earliest Earth reply: ${2*delay} min, plus review time. ${2*delay<=Math.max(0,capacity)?'It could arrive within your stop allowance.':'It would arrive after your stop allowance.'}`}</small>
 <button type="button" disabled={!option.feasible||Boolean(notice)} onClick={apply}>Apply this change</button>{notice&&<p role="status">{notice}</p>}
 </details>;
}
