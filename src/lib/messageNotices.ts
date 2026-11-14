import type {CommMessage} from './storage';
export function incomingNotices(messages:CommMessage[],side:'mars'|'earth',now:number){return messages.flatMap(m=>{
 const result:{id:string;text:string;at:number}[]=[];
 if((m.kind==='chat'||m.kind==='question')&&m.direction===(side==='mars'?'downlink':'uplink')&&m.deliveredAtSimTime<=now)result.push({id:m.id,text:m.questionText,at:m.deliveredAtSimTime});
 if(side==='mars'&&m.replyText&&m.replyDeliveredAtSimTime!==undefined&&m.replyDeliveredAtSimTime<=now)result.push({id:m.id+':reply',text:m.replyText,at:m.replyDeliveredAtSimTime});
 return result;
}).sort((a,b)=>b.at-a.at);}
