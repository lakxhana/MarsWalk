import { useState } from 'react';
import { saveTask, type CommMessage, type FieldTask, type ObservationRecord } from '@/lib/storage';
import { formatSimLMST } from '@/lib/commManager';
import MissionConversation from './MissionConversation';

export default function CrewFieldPanel({onClose, observations, messages, tasks, simTime, delay, paused, reload}: {
  onClose:()=>void; observations:ObservationRecord[]; messages:CommMessage[]; tasks:FieldTask[];
  simTime:number; delay:number; paused:boolean; reload:()=>Promise<void>;
}) {
  const [tab,setTab]=useState<'messages'|'notes'|'tasks'>('messages');
  const [query,setQuery]=useState(''); const [taskTitle,setTaskTitle]=useState('');
  const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
  const updateTask = async (task:FieldTask, status:FieldTask['status']) => {
    setBusy(true); setError('');
    try {
      if(status === 'in_progress') for(const other of tasks) if(other.status === 'in_progress' && other.id !== task.id) await saveTask({...other,status:'pending'});
      await saveTask({...task,status}); await reload();
    } catch(e){setError(e instanceof Error ? e.message : 'Could not update task.');}finally{setBusy(false);}
  };
  const addTask = async () => {
    if(!taskTitle.trim() || busy)return;
    setBusy(true);setError('');
    try {await saveTask({id:crypto.randomUUID(),title:taskTitle.trim(),description:'Crew-created task',status:'pending',estimatedMinutes:0,isIndependent:true,requiresEarthAdvice:false,category:'survey'});setTaskTitle('');await reload();}
    catch(e){setError(e instanceof Error ? e.message : 'Could not save task.');}finally{setBusy(false);}
  };
  return <aside className="crew-field-panel" aria-label="Crew field log">
    <div className="inbox-heading"><div><h2>Field log</h2><p className="delivery-note">{formatSimLMST(simTime)}{paused ? ' · paused' : ' · mission time running'}</p></div><button className="quiet-button" onClick={onClose} aria-label="Close field log">Close</button></div>
    <div className="panel-tabs">{(['messages','notes','tasks'] as const).map(t=><button key={t} aria-pressed={tab===t} onClick={()=>setTab(t)}>{t==='notes'?'Previous notes':t==='tasks'?'Tasks':'Messages'}</button>)}</div>
    {tab==='messages' && <MissionConversation messages={messages} side="mars" simTime={simTime} delay={delay} paused={paused} reload={reload}/>}
    {tab==='notes' && <div className="field-panel-scroll"><label className="sr-only" htmlFor="notes-search">Search previous notes</label><input id="notes-search" placeholder="Search notes…" value={query} onChange={e=>setQuery(e.target.value)}/>
      {!observations.length && <p className="inbox-empty">No saved notes yet. Use Record observation in the walk.</p>}
      {observations.filter(o=>(o.note+' '+o.siteName).toLowerCase().includes(query.toLowerCase())).slice().reverse().map(o=><article className="field-note" key={o.id}><strong>{o.siteName}</strong><p className="delivery-note">{o.createdAtSimTime == null ? new Date(o.timestamp).toLocaleString() : formatSimLMST(o.createdAtSimTime)}</p><p className="message-body">{o.note}</p>{o.imageRef && <figure><img src={o.imageRef} alt={o.imageCaption || 'Observation attachment'}/><figcaption className="delivery-note">{o.imageIsArchival?'Archival image':'Crew attachment'}</figcaption></figure>}{o.audioRef && <audio controls src={o.audioRef} aria-label="Saved voice note"/>}<details><summary>Location</summary><p>{o.location.description || 'Location not recorded.'}</p></details></article>)}
    </div>}
    {tab==='tasks' && <div className="field-panel-scroll"><p className="delivery-note">Work on independent tasks while Earth advice is in transit.</p>
      <form className="task-form" onSubmit={e=>{e.preventDefault();void addTask();}}><label className="sr-only" htmlFor="new-task">New task</label><input id="new-task" maxLength={160} placeholder="Add a task…" value={taskTitle} onChange={e=>setTaskTitle(e.target.value)}/><button className="quiet-button" disabled={busy || !taskTitle.trim()}>Add</button></form>
      {tasks.map(task=><article key={task.id} className="field-note"><strong>{task.title}</strong><p className="delivery-note">{task.status === 'blocked_on_advice' ? 'Waiting for Earth advice' : task.status === 'in_progress' ? 'In progress' : task.status === 'completed' ? 'Completed' : 'Ready'}</p>
        {task.status === 'blocked_on_advice' && messages.some(m => m.id === task.blockedByMessageId && m.replyText && m.replyDeliveredAtSimTime !== undefined && m.replyDeliveredAtSimTime <= simTime) && <button className="quiet-button" disabled={busy} onClick={()=>void updateTask(task,'in_progress')}>Advice received · resume task</button>}
        {task.id.startsWith('destination-') && task.status!=='completed' && <p className="delivery-note">Save the photo or note at your destination to complete this task.</p>}
        {!task.id.startsWith('destination-') && task.status !== 'completed' && <div className="flex gap-2">{task.status !== 'in_progress' && task.status !== 'blocked_on_advice' && <button className="quiet-button" disabled={busy} onClick={()=>void updateTask(task,'in_progress')}>Start task</button>}{task.status !== 'blocked_on_advice' && <button className="quiet-button" disabled={busy} onClick={()=>void updateTask(task,'completed')}>Mark complete</button>}</div>}
      </article>)}{error && <p role="alert" className="text-red-700">{error}</p>}
    </div>}
  </aside>;
}
