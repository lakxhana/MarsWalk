import { useEffect, useRef, useState } from 'react';
import type { CommMessage, MissionStatusSnapshot } from '@/lib/storage';
import { formatSimLMST, formatSecondsCountdown, sendCrewMessage } from '@/lib/commManager';
import { messagesForSide } from '@/lib/missionMessages';
import {adviceFromReport,assessAdvice,type AdviceContext} from '@/lib/adviceTiming';
import AdvicePreview from './AdvicePreview';

export default function MissionConversation({messages, side, simTime, delay, paused, reload,currentStatus,active=true,draftKey}: {
  active?:boolean; draftKey?:string; messages: CommMessage[]; side:'mars'|'earth'; simTime:number; delay:number; paused:boolean; reload:()=>Promise<void>;currentStatus?:MissionStatusSnapshot|null;
}) {
  const [linkAdvice,setLinkAdvice]=useState(false);
  const advice=linkAdvice?adviceFromReport(currentStatus):null;
  const adviceBadge=(context:AdviceContext|undefined)=>{if(!context)return null;const status=assessAdvice(context,currentStatus,simTime);return <div className={`advice-tag ${side==='mars'&&status.requiresReview?'attention':''}`}><strong>{side==='mars'&&status.requiresReview?'Review before acting':'Plan-linked advice'}</strong><span>{context.destinationName} · Plan {context.planVersion}</span>{side==='mars'&&<p>{status.requiresReview?status.reasons.join(' · '):'Matches the current plan. Crew review required.'}</p>}</div>;};
  const [draft, setDraft] = useState(() => {try{return draftKey?sessionStorage.getItem(draftKey)??'':'';}catch{return '';}});
  const history=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(draftKey)try{sessionStorage.setItem(draftKey,draft);}catch{/* Draft remains in memory. */}},[draft,draftKey]); const [sending,setSending] = useState(false); const [error,setError]=useState('');
  const outgoing = side === 'mars' ? 'uplink' : 'downlink';
  const visible = messagesForSide(messages, side, simTime).filter(m => m.kind === 'chat' || m.kind === 'question').sort((a,b)=>a.sentAtSimTime-b.sentAtSimTime);
  const lastVisible=visible.map(m=>m.id+(m.replyText?':reply':'')).join('|');
  useEffect(()=>{if(active&&history.current)history.current.scrollTop=history.current.scrollHeight;},[lastVisible,active]);
  const send = async () => {
    if (!draft.trim() || sending) return;
    setSending(true); setError('');
    try { await sendCrewMessage({text:draft, direction:outgoing, simTime, oneWayDelayMinutes:delay,adviceContext:advice??undefined}); setDraft(''); void reload().catch(()=>setError('Message saved. Waiting for history to refresh.')); }
    catch(e){setError(e instanceof Error ? e.message : 'Message could not be sent.');} finally{setSending(false);}
  };
  return <div className="conversation">
    <div className="conversation-status"><strong>{side === 'mars' ? 'Earth team' : `Mars crew · ${currentStatus?.operations?.name??'Awaiting crew'}`}</strong><span>{delay} min each way{paused ? ' · clock paused' : ''}</span></div>
    <div ref={history} className="conversation-history" role="log" aria-live={active?"polite":"off"} aria-label="Message history">
      {!visible.length && <p className="inbox-empty">Start a conversation.</p>}
      {visible.map(m => <div key={m.id} className={`conversation-message ${m.direction === outgoing ? 'outgoing' : ''}`}>
        <span className="eyebrow">{m.direction === 'uplink' ? 'Mars crew' : 'Earth team'}</span><p className="message-body">{m.questionText}</p>{adviceBadge(m.adviceContext)}
        <p className="delivery-note">Sent {formatSimLMST(m.sentAtSimTime)}</p>
        <p className="delivery-note">{m.deliveredAtSimTime <= simTime ? `Delivered ${formatSimLMST(m.deliveredAtSimTime)}` : `In transit · ${formatSecondsCountdown(m.deliveredAtSimTime-simTime)} left · ETA ${formatSimLMST(m.deliveredAtSimTime)}`}</p>
        {m.replyText && <div className="sent-reply"><strong>Earth reply</strong><p className="message-body">{m.replyText}</p>{adviceBadge(m.replyAdviceContext)}<p className="delivery-note">{m.replyDeliveredAtSimTime != null && m.replyDeliveredAtSimTime <= simTime ? `Delivered ${formatSimLMST(m.replyDeliveredAtSimTime)}` : `In transit · ETA ${formatSimLMST(m.replyDeliveredAtSimTime ?? simTime)}`}</p></div>}
      </div>)}
    </div>
    <form className="conversation-compose" onSubmit={e=>{e.preventDefault();void send();}}>
      {side==='earth'&&<><label className="link-advice"><input type="checkbox" checked={linkAdvice} disabled={!currentStatus} onChange={e=>setLinkAdvice(e.target.checked)}/>Link advice to reported plan</label>{linkAdvice&&<AdvicePreview context={advice} now={simTime} delay={delay}/>}</>}
      <label htmlFor={`message-${side}`} className="sr-only">Message to {side === 'mars' ? 'Earth' : 'Mars'}</label>
      <textarea id={`message-${side}`} maxLength={2000} rows={3} placeholder={`Message ${side === 'mars' ? 'Earth team' : 'Mars crew'}…`} value={draft} onChange={e=>setDraft(e.target.value)}/>
      <div className="flex items-center justify-between gap-2"><span className="delivery-note">Arrives in {delay} simulated min</span><button className="primary-button" disabled={!draft.trim() || sending}>{sending ? 'Sending…' : 'Send message'}</button></div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </form>
  </div>;
}
