import {useEffect, useRef, useState} from 'react';
import {MessageCircle, X} from 'lucide-react';
import MissionConversation from './MissionConversation';
import {incomingNotices} from '@/lib/messageNotices';
import type {CommMessage, MissionStatusSnapshot} from '@/lib/storage';

interface Props {
  messages: CommMessage[];
  side: 'mars' | 'earth';
  now: number;
  delay: number;
  paused: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reload: () => Promise<void>;
  currentStatus?: MissionStatusSnapshot | null;
}

export default function FloatingChat({messages, side, now, delay, paused, open, onOpenChange, reload, currentStatus}: Props) {
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [read, setRead] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('marswalk-notices') ?? '{}'); } catch { return {}; }
  });
  const notices = incomingNotices(messages, side, now);
  const unread = notices.filter(m => !read[`${side}:${m.id}`]);
  const incomingKeys = unread.map(m => `${side}:${m.id}`).join('|');

  useEffect(() => {
    if (!open || !incomingKeys) return;
    setRead(previous => {
      const next = {...previous};
      for (const key of incomingKeys.split('|')) next[key] = true;
      try { localStorage.setItem('marswalk-notices', JSON.stringify(next)); } catch { /* Session read state still works. */ }
      return next;
    });
  }, [open, incomingKeys]);

  useEffect(() => {
    panel.current?.toggleAttribute('inert',!open);
    if (open) panel.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
  }, [open, side]);

  const close = () => { onOpenChange(false); trigger.current?.focus(); };
  return <div className={`chat-dock ${open ? 'is-open' : ''}`}>
    <div ref={panel} id="mission-chat" className="chat-window" role="dialog" aria-label="Mission chat" aria-modal="false" aria-hidden={!open} onKeyDown={event => {if (event.key === 'Escape') {event.stopPropagation();close();}}}>
      <header className="chat-heading"><div><span className="eyebrow">CREW LINK</span><h2>{side === 'mars' ? 'Earth team' : 'Mars crew'}</h2></div><button type="button" aria-label="Close chat" onClick={close}><X size={18}/></button></header>
      <MissionConversation key={side} messages={messages} side={side} simTime={now} delay={delay} paused={paused} reload={reload} currentStatus={currentStatus} active={open} draftKey={`marswalk-chat-draft:${side}`}/>
    </div>
    <span className="sr-only" role="status" aria-live="polite">{!open && unread.length ? `${unread.length} unread ${side === 'mars' ? 'Earth' : 'Mars'} messages` : ''}</span>
    <button ref={trigger} type="button" className="chat-launcher" aria-label={open ? 'Minimize chat' : `Open chat${unread.length ? `, ${unread.length} unread` : ''}`} aria-expanded={open} aria-controls="mission-chat" onClick={() => open ? close() : onOpenChange(true)}>
      {open ? <X size={23}/> : <MessageCircle size={23}/>}
      {!open && unread.length > 0 && <span className="chat-badge" aria-hidden="true">{unread.length > 99 ? '99+' : unread.length}</span>}
    </button>
  </div>;
}
