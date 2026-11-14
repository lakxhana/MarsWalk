import {apiRequest} from './apiClient';
import type {PersistedMissionState} from '../App';
export interface SessionCommand {id:string;kind:string;payload:unknown;sessionId?:number}
export const sessionRequest = <T,>(path:string,value:unknown):Promise<T> => apiRequest<T>(path,'POST',value);
export interface SessionReply{controller:boolean;claimed:boolean;mission:PersistedMissionState|null;commands:SessionCommand[]}
