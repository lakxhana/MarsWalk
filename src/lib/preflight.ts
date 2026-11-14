import {crewMembers} from './crewOperations';
import type {CrewOperations} from './crewOperations';
import type {RoutePlanSummary} from './routePlanner';
import {makeRouteTasks} from './fieldworkPlan';
export const OXYGEN_SOURCE='https://ntrs.nasa.gov/api/citations/20210024855/downloads/BVAD_2.15.22-final.pdf#page=149';
export const BASE_O2_RATE=86; // g/person/hour; BVAD Rev2 Table 4-70, printed p135.
export function preflight(route:RoutePlanSummary,crew:CrewOperations,budget:number,reserve:number){
 const tasks=crew.routeTasks??makeRouteTasks(crew.plannedStops??3,crew.stopLimitMinutes);
 const travel=route.totalDistanceMeters/route.assumedSpeedMps/60,observe=tasks.filter(t=>t.selected!==false).reduce((s,t)=>s+t.minutes,0);
 const work=travel*2+observe,total=work+reserve,rate=(crew.oxygenRateGph??BASE_O2_RATE)+(crew.oxygenLossGph??0);
 const required=(work+Math.max(reserve,crew.oxygenReserveMinutes))*rate/60;
 const errors:string[]=[];
 if(!route.success||!Number.isFinite(route.totalDistanceMeters)||!Number.isFinite(route.assumedSpeedMps)||route.points.length<2||!(route.totalDistanceMeters>0)||!(route.assumedSpeedMps>0))errors.push('Choose a valid route.');
 if(!crew.name.trim())errors.push('Enter the astronaut name.');if(!crew.tankId.trim())errors.push('Enter a tank ID.');
 for(const [name,value,min,max] of [['Mission duration',budget,1,1440],['Mission reserve',reserve,0,120],['Stop limit',crew.stopLimitMinutes,1,120],['Oxygen endurance',crew.oxygenMinutes,1,1440],['Oxygen reserve',crew.oxygenReserveMinutes,0,120],['Oxygen rate',crew.oxygenRateGph??BASE_O2_RATE,1,1000],['Suit losses',crew.oxygenLossGph??0,0,1000]] as const){if(!Number.isFinite(value)||value<min||value>max)errors.push(`${name} must be ${min}–${max}.`);}
 if(!Number.isInteger(crew.plannedStops??3)||(crew.plannedStops??3)<1||(crew.plannedStops??3)>30||tasks.length!==(crew.plannedStops??3))errors.push('Check the observation stop count.');
 if(tasks.some(t=>t.priority!==undefined&&(!Number.isInteger(t.priority)||t.priority<1||t.priority>5)))errors.push('Task priorities must be whole numbers from 1 to 5.');
 if(tasks.some(t=>!t.title.trim()||!Number.isFinite(t.minutes)||t.minutes<=0||t.minutes>120))errors.push('Give every task a name and an estimate of 1–120 minutes.');
 if(tasks.some(t=>t.selected!==false&&t.minutes>crew.stopLimitMinutes))errors.push('A task exceeds the stop limit. Adjust its estimate or the limit.');
 if(total>budget+1e-8)errors.push('Travel, observations and reserve exceed the mission duration.');
 if(crew.oxygenMinutes<Math.max(budget,work+reserve)+crew.oxygenReserveMinutes)errors.push('Oxygen endurance must cover the full mission duration plus its oxygen reserve.');
 const members=crewMembers(crew);
 if(new Set(members.map(m=>m.id)).size!==members.length)errors.push('Crew IDs must be unique.');
 if(new Set(members.map(m=>m.tankId.trim().toLowerCase())).size!==members.length)errors.push('Assign a different tank to each astronaut.');
 for(const member of crew.members??[]){
 if(!member.name.trim()||!member.tankId.trim())errors.push('Name every astronaut and assign a tank.');
 if(!Number.isFinite(member.oxygenMinutes)||!Number.isFinite(member.oxygenReserveMinutes)||member.oxygenMinutes<=0||member.oxygenReserveMinutes<0||member.oxygenMinutes>1440||member.oxygenReserveMinutes>1440)errors.push(`${member.name||'Crew member'}: check oxygen inputs.`);
 else if(member.oxygenMinutes<Math.max(budget,total)+member.oxygenReserveMinutes)errors.push(`${member.name}: oxygen must cover mission and reserve.`);
 }
 return {teamRequired:members.reduce((s,m)=>s+(work+Math.max(reserve,m.oxygenReserveMinutes))*rate/60,0),teamMissionOxygen:members.reduce((s,m)=>s+(budget+m.oxygenReserveMinutes)*rate/60,0),travel,observe,work,total,rate,required,missionOxygen:(budget+crew.oxygenReserveMinutes)*rate/60,available:crew.oxygenMinutes*rate/60,errors};
}
