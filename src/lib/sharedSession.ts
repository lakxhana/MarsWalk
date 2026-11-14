import type {PersistedMissionState} from '../App';
export interface SessionCommand {id:string;kind:string;payload:unknown;sessionId?:number}
export async function sessionRequest<T>(path:string,value:unknown):Promise<T>{const r=await fetch(`/api/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});const result=await r.json();if(!r.ok)throw new Error(result.error??'Sync unavailable');return result;}
export interface SessionReply{controller:boolean;claimed:boolean;mission:PersistedMissionState|null;commands:SessionCommand[]}
