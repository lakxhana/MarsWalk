import type {MissionLogEntry} from './crewOperations';
export function filterMissionLog(entries:MissionLogEntry[],now:number,earth:boolean,filters:{query:string;destination:string;crew:string;tasks:string;sort:string}){
 return entries.filter(e=>!earth||(e.receivedAt??e.ended)<=now).filter(e=>{
  const names=e.crew?.map(c=>c.name)??[e.name];const tasks=(e.tasks??[]).filter(t=>t.selected!==false);const complete=tasks.length>0&&tasks.every(t=>t.done);
  return (!filters.query||[e.destination,e.name,e.finding,e.id,...names].join(' ').toLowerCase().includes(filters.query.trim().toLowerCase()))&&(!filters.destination||e.destination===filters.destination)&&(!filters.crew||names.includes(filters.crew))&&(filters.tasks==='all'||filters.tasks==='complete'&&complete||filters.tasks==='unfinished'&&tasks.some(t=>!t.done)||filters.tasks==='records'&&e.records>0);
 }).slice().sort((a,b)=>filters.sort==='oldest'?a.ended-b.ended:b.ended-a.ended);
}
