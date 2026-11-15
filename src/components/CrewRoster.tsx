import {replayCrew} from '@/lib/healthReplay';
import {useEffect,useState} from 'react';
import {crewMembers,memberOxygen,type CrewOperations,type CrewMember} from '@/lib/crewOperations';
import HealthMonitor,{HealthSummary} from './HealthMonitor';

export default function CrewRoster({crew,now,onChange,setup=false}:{crew:CrewOperations;now:number;onChange:(c:CrewOperations)=>void;setup?:boolean}){
 const Container=setup?'section':'details';
 const [selected,setSelected]=useState('lead');
 const [draft,setDraft]=useState<CrewMember|null>(null);
 const [error,setError]=useState('');
 // Repair old empty slots in editable plans, without touching completed history.
 useEffect(()=>{
  if(setup&&crew.members?.some(m=>!m.name.trim()&&!m.tankId.trim())){
   onChange({...crew,members:crew.members.filter(m=>m.name.trim()||m.tankId.trim())});
  }
 },[setup,crew,onChange]);
 const members=crewMembers(replayCrew(crew,now)).filter(m=>m.id==='lead'||m.name.trim()||m.tankId.trim());
 const member=members.find(m=>m.id===selected)??members[0];
 const update=(patch:Partial<CrewMember>)=>onChange(member.id==='lead'?{...crew,...patch}:{...crew,members:crew.members?.map(m=>m.id===member.id?{...m,...patch}:m)});
 const save=()=>{
  if(!draft)return;
  if(!draft.name.trim()||!draft.tankId.trim()){setError('Enter a name and tank ID.');return;}
  if(members.some(m=>m.tankId.trim().toLowerCase()===draft.tankId.trim().toLowerCase())){setError('This tank is already assigned.');return;}
  const added={...draft,name:draft.name.trim(),tankId:draft.tankId.trim()};
  onChange({...crew,members:[...(crew.members??[]).filter(m=>m.name.trim()||m.tankId.trim()),added]});
  setSelected(added.id);setDraft(null);setError('');
 };
 return <Container className="crew-roster">
  {setup?<h3>Crew · {members.length}</h3>:<summary>Crew · {members.length}</summary>}
  <label>Astronaut<select value={member.id} onChange={e=>setSelected(e.target.value)}>{members.map((m,i)=><option value={m.id} key={m.id}>{m.name||`Crew ${i+1} · needs name`}</option>)}</select></label>
  {setup?<>
   {member.id!=='lead'&&<>
    <label>Name<input required maxLength={48} value={member.name} onChange={e=>update({name:e.target.value})}/></label>
    <label>Tank<input required maxLength={24} value={member.tankId} onChange={e=>update({tankId:e.target.value})}/></label>
    {(['oxygenMinutes','oxygenReserveMinutes'] as const).map((key,i)=><label key={key}>{i===0?'O₂ endurance (min, model)':'O₂ reserve (min)'}<input required type="number" min={i===0?1:0} max={1440} value={member[key]} onChange={e=>update({[key]:Number(e.target.value)})}/></label>)}
    <button type="button" onClick={()=>{onChange({...crew,members:crew.members?.filter(m=>m.id!==member.id)});setSelected('lead');}}>Remove astronaut</button>
   </>}
   {draft?<div className="science-task">
    <label>New astronaut<input maxLength={48} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
    <label>Tank ID<input maxLength={24} value={draft.tankId} onChange={e=>setDraft({...draft,tankId:e.target.value})}/></label>
    {error&&<p role="alert">{error}</p>}
    <button type="button" onClick={save}>Save astronaut</button>
    <button type="button" onClick={()=>{setDraft(null);setError('');}}>Cancel</button>
   </div>:<button type="button" onClick={()=>{setDraft({id:crypto.randomUUID(),name:'',tankId:'',oxygenMinutes:crew.oxygenMinutes,oxygenReserveMinutes:crew.oxygenReserveMinutes,health:{}});setError('');}}>Add astronaut</button>}
  </>:<><p>{member.tankId} · O₂ {memberOxygen(crew,member,now).toFixed(1)} min</p><small>Reserve {member.oxygenReserveMinutes} min · model</small><HealthSummary readings={member.health??{}} now={now}/></>}
  {!setup&&<HealthMonitor readings={member.health??{}} now={now} onChange={crew.demoVitals||crew.healthReplay?undefined:health=>update({health})}/>}
 </Container>;
}
