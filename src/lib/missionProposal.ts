import type {RoutePlanSummary} from './routePlanner';
import type {CrewOperations} from './crewOperations';
export interface MissionProposal {
 id:string; route:RoutePlanSummary; crew:CrewOperations; budget:number; reserve:number;
 sentAt:number; arrivesAt:number; status:'pending'|'accepted'|'changes'|'completed'; responseAt?:number; note?:string;
}
