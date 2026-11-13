export interface RouteTask {id:string;title:string;minutes:number;fraction:number;done:boolean}
export function makeRouteTasks(count:number,minutes:number):RouteTask[]{
 const titles=['Photograph the terrain and note hazards','Record rock layers and grain sizes','Photograph the destination and summarise findings'];
 return Array.from({length:Math.max(1,Math.min(30,count))},(_,i)=>({id:`route-task-${i}`,title:titles[Math.min(i,titles.length-1)],minutes,fraction:(i+1)/count,done:false}));
}
export function estimateFieldwork(distance:number,speed:number,tasks:RouteTask[],reserve:number){
 const travel=distance/speed/60,observe=tasks.reduce((n,t)=>n+t.minutes,0);
 return {travel,observe,returnMinutes:travel,total:travel*2+observe+reserve};
}
