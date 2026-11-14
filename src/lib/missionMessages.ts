import type { CommMessage } from './storage';

/** Each side sees its own transmissions and only arrived incoming packets. */
export function messagesForSide(messages: CommMessage[], side: 'mars' | 'earth', now: number): CommMessage[] {
  const outgoing = side === 'mars' ? 'uplink' : 'downlink';
  return messages.filter(m => m.direction === outgoing || m.deliveredAtSimTime <= now).map(m => {
    if (side === 'mars' && m.replyText && (m.replyDeliveredAtSimTime === undefined || m.replyDeliveredAtSimTime > now)) {
      return {...m, replyText: undefined, replyAdviceContext: undefined, replySentAtSimTime: undefined, replyDeliveredAtSimTime: undefined, scienceTeamAuthor: undefined, status: m.deliveredAtSimTime <= now ? 'delivered' : 'in_transit'};
    }
    return m;
  });
}
