import { useState } from 'react';
import type { CommMessage } from '@/lib/storage';
import { formatSimLMST, formatSecondsCountdown, sendCrewMessage } from '@/lib/commManager';
import { messagesForSide } from '@/lib/missionMessages';

export default function MissionConversation({messages, side, simTime, delay, paused, reload}: {
  messages: CommMessage[]; side:'mars'|'earth'; simTime:number; delay:number; paused:boolean; reload:()=>Promise<void>;
}) {
  const [draft, setDraft] = useState(''); const [sending,setSending] = useState(false); const [error,setError]=useState('');
  const outgoing = side === 'mars' ? 'uplink' : 'downlink';
  const visible = messagesForSide(messages, side, simTime).filter(m => m.kind === 'chat' || m.kind === 'question').sort((a,b)=>a.sentAtSimTime-b.sentAtSimTime);
  const send = async () => {
    if (!draft.trim() || sending) return;
    setSending(true); setError('');
    try { await sendCrewMessage({text:draft, direction:outgoing, simTime, oneWayDelayMinutes:delay}); setDraft(''); await reload(); }
    catch(e){setError(e instanceof Error ? e.message : 'Message could not be sent.');} finally{setSending(false);}
  };
  return <div className="conversation">
    <div className="conversation-status"><strong>{side === 'mars' ? 'Earth team' : 'Mars crew · Explorer 01'}</strong><span>{delay} min each way{paused ? ' · clock paused' : ''}</span></div>
    <div className="conversation-history" aria-label="Message history">
      {!visible.length && <p className="inbox-empty">No messages yet. Send an update or ask a question.</p>}
      {visible.map(m => <div key={m.id} className={`conversation-message ${m.direction === outgoing ? 'outgoing' : ''}`}>
        <span className="eyebrow">{m.direction === 'uplink' ? 'Mars crew' : 'Earth team'}</span><p className="message-body">{m.questionText}</p>
        <p className="delivery-note">Sent {formatSimLMST(m.sentAtSimTime)}</p>
        <p className="delivery-note">{m.deliveredAtSimTime <= simTime ? `Delivered ${formatSimLMST(m.deliveredAtSimTime)}` : `In transit · ${formatSecondsCountdown(m.deliveredAtSimTime-simTime)} left · ETA ${formatSimLMST(m.deliveredAtSimTime)}`}</p>
        {m.replyText && <div className="sent-reply"><strong>Earth reply</strong><p className="message-body">{m.replyText}</p><p className="delivery-note">{m.replyDeliveredAtSimTime != null && m.replyDeliveredAtSimTime <= simTime ? `Delivered ${formatSimLMST(m.replyDeliveredAtSimTime)}` : `In transit · ETA ${formatSimLMST(m.replyDeliveredAtSimTime ?? simTime)}`}</p></div>}
      </div>)}
    </div>
    <form className="conversation-compose" onSubmit={e=>{e.preventDefault();void send();}}>
      <label htmlFor={`message-${side}`} className="sr-only">Message to {side === 'mars' ? 'Earth' : 'Mars'}</label>
      <textarea id={`message-${side}`} maxLength={2000} rows={3} placeholder={`Message ${side === 'mars' ? 'Earth team' : 'Mars crew'}…`} value={draft} onChange={e=>setDraft(e.target.value)}/>
      <div className="flex items-center justify-between gap-2"><span className="delivery-note">Arrives in {delay} simulated min</span><button className="primary-button" disabled={!draft.trim() || sending}>{sending ? 'Sending…' : 'Send message'}</button></div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {side === 'mars' && <p className="delivery-note">Continue your tasks while waiting for a reply.</p>}
    </form>
  </div>;
}
